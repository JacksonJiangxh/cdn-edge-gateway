/**
 * ============================================================================
 * stats/collector.js —— 内存聚合式访问统计
 * ----------------------------------------------------------------------------
 * 【核心约束：统计落盘走「解析出的后端」，绝不静默跨后端回退】
 * 统计落盘后端由 stats/index.js 的 resolveDriver 决定（D1 / KV 二选一），这里
 * 只负责把内存聚合结果交给对应驱动：
 *   - D1 模式：D1 免费版每日写入上限 100,000 行，统计先在 isolate 内存里聚合，
 *     达到阈值（默认 500 条 / 5 分钟）后才批量落盘一次。D1 写入失败【绝不】降级
 *     到 KV（历史 bug：D1 抖动时回落 KV 会污染 KV 且无法对账），而是重试一次后丢弃。
 *   - KV 模式：仅在解析后端明确为 KV（自部署 redis / 厂商 native）时进入，把聚合
 *     分片写入 KV（见 kvDriver）。此模式仅用于「无 D1 平台（EO/ESA）」或运维显式
 *     指定。⚠️ 厂商 native KV 有读写次数限制，统计流量绝不会意外落到它上面——
 *     是否走 native 由 STATS_BACKEND 显式指定且需实际部署，否则回落 none 而非 redis。
 *
 * 落盘触发条件（满足其一即可）：
 *   - 自上次 flush 起累计条数 >= 500
 *   - 距上次 flush 时间 >= 5 分钟
 *   - 调用方显式 force = true（如 isolate 即将回收、管理面手动触发）
 *
 * 数据流：
 *   pipeline → record(ctx, entry)                 // 纯内存 O(1)，绝不 await
 *   pipeline → ctx.waitUntil(flush(ctx))          // 后台异步落盘，不阻塞响应
 *
 * 【已知的可接受损失】
 * isolate 随时可能被平台回收，最后一批未 flush 的内存数据会丢失（最多 500 条
 * 或 5 分钟的量）。对「趋势型访问统计」这个用途来说完全可以接受 —— 我们要的是
 * 量级和趋势，不是财务级精确计数。此外 KV 模式采用分片随机键写入，同一小时在
 * 多 isolate 并发时以「追加独立键」避免覆盖，实时小时可能有极少量计数丢失。
 * ============================================================================
 */

import { getGlobal, onGlobalChange } from '../config/store.js';
import {
  registerDomain,
  allocBytes,
  releaseBytes,
  syncEntries,
  getDomainQuota,
} from '../platform/memBudget.js';
import {
  detectCaps,
  resolveStatsBackend,
  readStatsBackendPreference,
} from '../platform/caps.js';

// ============================================================================
// 常量
// ============================================================================

/** 累计多少条后触发落盘。 */
const FLUSH_COUNT_THRESHOLD = 500;

/** 距上次落盘多少毫秒后触发。 */
const FLUSH_INTERVAL_MS = 300000;

/** 内存中最多聚合多少个 host（兜底最大值），超出丢弃新 host，防止被构造的 Host 头打爆内存。 */
const MAX_HOSTS = 500;

/**
 * 单 host 聚合桶的估算字节（用于 memBudget 记账与配额推导）。
 * 桶含计数器、durSamples(最多 256 个)、origins 表等，序列化后通常数 KB，取 4096B 保守初值，
 * memBudget 会按运行时采样自校准（见 platform/memBudget.js）。
 * @param {any} entry
 * @returns {number}
 */
function estimateBucketBytes(entry) {
  if (!entry || typeof entry !== 'object') return 4096;
  try {
    const samples = Array.isArray(entry.durSamples) ? entry.durSamples.length : 0;
    const origins = entry.origins ? Object.keys(entry.origins).length : 0;
    // 固定结构开销 + 每样本 ~8B + 每 origin 键 ~32B
    return Math.max(256, 1024 + samples * 8 + origins * 32);
  } catch {
    return 4096;
  }
}

/**
 * 由 memBudget 配额推导的「统计聚合 host 上限」。
 * 取 min(MAX_HOSTS, 配额字节 / 估算每桶字节)，至少为 1。
 * 内存预算紧张时，统计域（可激进回收）上限随之收紧，把空间让给配置等保守域。
 * @returns {number}
 */
function statsHostCap() {
  try {
    const quota = getDomainQuota('stats');
    if (quota > 0) {
      const byBytes = Math.floor(quota / estimateBucketBytes(null));
      return Math.max(1, Math.min(MAX_HOSTS, byBytes));
    }
  } catch {
    /* 拿不到配额时退回硬上限 */
  }
  return MAX_HOSTS;
}

/**
 * 统计域回收回调（memBudget 软/硬水位触发）。
 * stats 域 allowAggressiveEvict=true：统计/限流数据可激进丢弃（现状已接受
 * 「isolate 回收最多丢 500 条或 5 分钟」的损失）。evict 必须是同步、无 await
 * 的，因此这里只做内存释放，不做落盘 IO（落盘仍由 flush 按 5min/阈值驱动）。
 *
 * @param {boolean} aggressive 是否激进。stats 域在软水位即被调用（aggressive=true），
 *   直接丢弃最旧的一半 host（按插入顺序），其余 host 的已聚合数据保留。
 */
function evictStats(aggressive) {
  try {
    if (buckets.size === 0) return;
    const drop = aggressive ? Math.ceil(buckets.size / 2) : 0;
    if (drop <= 0) return;
    let removed = 0;
    for (const key of buckets.keys()) {
      if (removed >= drop) break;
      buckets.delete(key);
      removed += 1;
    }
    pendingCount = Math.max(0, pendingCount - removed);
    syncEntries('stats', buckets.size);
  } catch {
    /* ignore */
  }
}

// 向统一内存预算单例注册「stats 域」。
// - weight 给到 2（统计可激进回收，权重低于配置域，预算紧张时先让位）
// - allowAggressiveEvict=true：软水位即可触发 evictStats 释放
registerDomain('stats', {
  weight: 2,
  estimateBytes: estimateBucketBytes,
  evict: evictStats,
  allowAggressiveEvict: true,
});

// ============================================================================
// 全局配置变更 → 统计运行时重载（ProxySQL: LOAD ... TO RUNTIME）
// ----------------------------------------------------------------------------
// 当用户在管理面切换「数据统计引擎」(statsDriver) 或开关统计 (statsEnabled) 时，
// getGlobal 会通过 onGlobalChange 通知此处。我们据此把当前 isolate 的内存聚合
// 桶清空：下次 flush 会用新 driver 落盘；若切换到 'none'/关闭，则丢弃不落盘。
// 这保证「改统计引擎」立即在本 isolate 生效，而不必重新部署。清桶是安全的——
// 聚合数据本就是可容忍丢失的趋势数据（见文件头「已知的可接受损失」）。
// 注意：仅当 statsDriver / statsEnabled 真正变化时才清桶，避免每次配置变更都丢数据。
// ============================================================================
onGlobalChange((next, prev) => {
  const nextDriver = next?.statsDriver;
  const prevDriver = prev?.statsDriver;
  const nextEnabled = next?.statsEnabled !== false;
  const prevEnabled = prev?.statsEnabled !== false;
  if (nextDriver !== prevDriver || nextEnabled !== prevEnabled) {
    console.log(
      `[stats] 运行时节统计引擎切换: ${prevDriver ?? 'd1'} → ${nextDriver ?? 'd1'}, enabled=${nextEnabled}`
    );
    resetCollector();
  }
});

/** 每个 host 最多记录多少个不同的 originId。 */
const MAX_ORIGINS_PER_HOST = 32;

/** 耗时分位采样上限。只保留固定条数的样本做近似分位，避免数组无限增长。 */
const MAX_DURATION_SAMPLES = 256;

// ============================================================================
// isolate 级聚合状态
// ============================================================================

/**
 * 聚合桶。
 * @typedef {Object} Bucket
 * @property {number} requests          请求总数
 * @property {number} s2xx              2xx 计数
 * @property {number} s3xx              3xx 计数
 * @property {number} s4xx              4xx 计数
 * @property {number} s5xx              5xx 计数
 * @property {number} sOther            其他状态码计数
 * @property {number} bytes             累计响应字节数
 * @property {number} cacheHit          缓存命中数
 * @property {number} cacheMiss         缓存未命中数
 * @property {number} durSum            耗时总和（ms），用于算均值
 * @property {number[]} durSamples      耗时样本，用于近似分位
 * @property {Record<string,number>} origins  originId → 次数
 */

/**
 * host → Bucket 的内存聚合表。
 * @type {Map<string, Bucket>}
 */
let buckets = new Map();

/** 自上次 flush 起累计的记录条数。 */
let pendingCount = 0;

/** 上次 flush 的时间戳（ms）。 */
let lastFlushAt = Date.now();

/** flush 互斥锁：防止并发 waitUntil 同时落盘造成重复写与配额浪费。 */
let flushing = false;

/**
 * D1 模式下写入失败的累计次数（用于观测 D1 绑定抖动频率）。
 * 仅计数，不做任何 KV 降级（避免污染 KV）。
 * @type {number}
 */
let d1FallbackCount = 0;

/**
 * 创建空聚合桶。
 * @returns {Bucket} 新桶
 */
function newBucket() {
  return {
    requests: 0,
    s2xx: 0,
    s3xx: 0,
    s4xx: 0,
    s5xx: 0,
    sOther: 0,
    bytes: 0,
    cacheHit: 0,
    cacheMiss: 0,
    durSum: 0,
    durSamples: [],
    origins: Object.create(null),
  };
}

/**
 * 规整 host，防止恶意 Host 头污染统计键。
 * @param {string} host 主机名
 * @returns {string} 清洗后的 host
 */
function normHost(host) {
  const s = String(host || 'unknown').toLowerCase().replace(/[^a-z0-9.\-_*]/g, '');
  return s.slice(0, 128) || 'unknown';
}

// ============================================================================
// record —— 热路径，必须极快
// ============================================================================

/**
 * 记录一条访问日志到内存聚合器。
 *
 * **性能契约**：本函数是同步的、O(1) 的、绝不 await、绝不抛异常。
 * 它处在每个请求的关键路径上，任何阻塞都会直接体现在用户的 TTFB 上。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} entry 访问记录
 * @param {string}  [entry.host]      站点主机名，缺省取 ctx.url.hostname
 * @param {number}  [entry.status]    响应状态码
 * @param {number}  [entry.bytes]     响应字节数
 * @param {boolean|string} [entry.cacheHit] 是否命中缓存（或 'HIT'/'MISS' 字符串）
 * @param {string}  [entry.originId]   实际使用的源站 id
 * @param {number}  [entry.durationMs] 处理耗时（ms），缺省由 ctx.startTime 推算
 * @param {number}  [entry.duration]   durationMs 的兼容别名
 * @returns {void}
 *
 * @example
 * record(ctx, { host, status: resp.status, bytes: 1024, cacheHit: true, originId: 'o1', durationMs: 42 });
 */
export function record(ctx, entry) {
  try {
    const e = entry || {};
    const host = normHost(e.host || (ctx && ctx.url && ctx.url.hostname));

    let b = buckets.get(host);
    if (!b) {
      // 超出 host 上限时静默丢弃，保护 isolate 内存
      if (buckets.size >= statsHostCap()) return;
      b = newBucket();
      buckets.set(host, b);
      // 新桶记账：memBudget 据此掌握占用并触发水位回收
      allocBytes('stats', b);
    }

    b.requests += 1;

    const status = Number(e.status);
    if (status >= 200 && status < 300) b.s2xx += 1;
    else if (status >= 300 && status < 400) b.s3xx += 1;
    else if (status >= 400 && status < 500) b.s4xx += 1;
    else if (status >= 500 && status < 600) b.s5xx += 1;
    else b.sOther += 1;

    const bytes = Number(e.bytes);
    if (Number.isFinite(bytes) && bytes > 0) b.bytes += bytes;

    const ch = e.cacheHit;
    const isHit = ch === true || (typeof ch === 'string' && ch.toUpperCase() === 'HIT');
    const isMiss = ch === false || (typeof ch === 'string' && ch.toUpperCase() === 'MISS');
    if (isHit) b.cacheHit += 1;
    else if (isMiss) b.cacheMiss += 1;

    if (e.originId) {
      const oid = String(e.originId).slice(0, 64);
      if (b.origins[oid] !== undefined || Object.keys(b.origins).length < MAX_ORIGINS_PER_HOST) {
        b.origins[oid] = (b.origins[oid] || 0) + 1;
      }
    }

    let dur = Number(e.durationMs !== undefined ? e.durationMs : e.duration);
    if (!Number.isFinite(dur) && ctx && Number.isFinite(ctx.startTime)) {
      dur = Date.now() - ctx.startTime;
    }
    if (Number.isFinite(dur) && dur >= 0) {
      b.durSum += dur;
      // 蓄水池式采样：满了之后随机替换，保证样本对全体近似均匀
      if (b.durSamples.length < MAX_DURATION_SAMPLES) {
        b.durSamples.push(dur);
      } else {
        const idx = (Math.random() * b.requests) | 0;
        if (idx < MAX_DURATION_SAMPLES) b.durSamples[idx] = dur;
      }
    }

    pendingCount += 1;
  } catch {
    // 统计绝不能影响主流程，任何异常都吞掉
  }
}

// ============================================================================
// flush —— 后台落盘
// ============================================================================

/**
 * 判断当前是否应当落盘。
 * @param {boolean} force 是否强制
 * @returns {boolean} 是否应当落盘
 */
function shouldFlush(force) {
  if (pendingCount === 0) return false;
  if (force) return true;
  if (pendingCount >= FLUSH_COUNT_THRESHOLD) return true;
  return Date.now() - lastFlushAt >= FLUSH_INTERVAL_MS;
}

/**
 * 取出并清空内存快照。
 *
 * 「先换后写」是关键：把 Map 整体换成新的空 Map 再去做异步 IO，
 * 这样落盘期间新到达的请求写入的是新 Map，不会被本次 flush 重复写入，
 * 也不会在 flush 过程中被并发修改。
 *
 * @returns {{snapshot: Map<string, Bucket>, count: number}} 快照与条数
 */
function takeSnapshot() {
  const snapshot = buckets;
  const count = pendingCount;
  buckets = new Map();
  pendingCount = 0;
  lastFlushAt = Date.now();
  // 内存已清空：释放对应记账字节（memBudget 据此回收配额）
  if (count > 0) releaseBytes('stats', count);
  return { snapshot, count };
}

/**
 * 从耗时样本计算近似分位。
 * @param {number[]} samples 样本数组
 * @param {number} p 分位（0-1）
 * @returns {number} 分位值（ms）
 */
function percentile(samples, p) {
  if (!samples || samples.length === 0) return 0;
  const arr = samples.slice().sort((a, b) => a - b);
  const idx = Math.min(arr.length - 1, Math.max(0, Math.round(p * (arr.length - 1))));
  return Math.round(arr[idx]);
}

/**
 * 把内存桶转换为驱动层可消费的扁平记录。
 * @param {string} host 主机名
 * @param {Bucket} b 聚合桶
 * @returns {Object} 扁平统计记录
 */
function toRecord(host, b) {
  return {
    host,
    requests: b.requests,
    status2xx: b.s2xx,
    status3xx: b.s3xx,
    status4xx: b.s4xx,
    status5xx: b.s5xx,
    statusOther: b.sOther,
    bytes: b.bytes,
    cacheHit: b.cacheHit,
    cacheMiss: b.cacheMiss,
    durAvg: b.requests > 0 ? Math.round(b.durSum / b.requests) : 0,
    durP50: percentile(b.durSamples, 0.5),
    durP95: percentile(b.durSamples, 0.95),
    durP99: percentile(b.durSamples, 0.99),
    origins: { ...b.origins },
  };
}

/**
 * 把快照写回内存桶（落盘失败时的回滚）。
 * 只在驱动层整体抛错时调用，避免数据白白丢失。
 * @param {Map<string, Bucket>} snapshot 之前取出的快照
 * @returns {void}
 */
function restore(snapshot) {
  try {
    for (const [host, b] of snapshot) {
      const cur = buckets.get(host);
      if (!cur) {
        if (buckets.size >= statsHostCap()) continue;
        buckets.set(host, b);
        allocBytes('stats', b);
        continue;
      }
      cur.requests += b.requests;
      cur.s2xx += b.s2xx;
      cur.s3xx += b.s3xx;
      cur.s4xx += b.s4xx;
      cur.s5xx += b.s5xx;
      cur.sOther += b.sOther;
      cur.bytes += b.bytes;
      cur.cacheHit += b.cacheHit;
      cur.cacheMiss += b.cacheMiss;
      cur.durSum += b.durSum;

      // 【必须合并 durSamples】旧实现漏掉了这一项：回滚后样本数组为空，
      // 该 host 的 P50/P95/P99 会全部塌成 0，而 requests/durSum 却是对的，
      // 形成「均值正常但分位数为 0」的诡异数据。
      // 合并时保持总量不超过 MAX_DURATION_SAMPLES：先填满空位，
      // 超出部分随机替换，维持样本对整体的近似均匀性（与 record() 的蓄水池一致）。
      if (Array.isArray(b.durSamples) && b.durSamples.length > 0) {
        if (!Array.isArray(cur.durSamples)) cur.durSamples = [];
        for (const d of b.durSamples) {
          if (cur.durSamples.length < MAX_DURATION_SAMPLES) {
            cur.durSamples.push(d);
          } else {
            const idx = (Math.random() * MAX_DURATION_SAMPLES) | 0;
            cur.durSamples[idx] = d;
          }
        }
      }

      for (const [oid, n] of Object.entries(b.origins)) {
        cur.origins[oid] = (cur.origins[oid] || 0) + n;
      }
    }
  } catch {
    /* 回滚失败就放弃这批数据，不能让统计拖垮主流程 */
  }
}

/**
 * 落盘：把内存聚合结果写入 KV 或 D1。
 *
 * 由 pipeline 在 `ctx.waitUntil(flush(ctx))` 中调用，不阻塞客户端响应。
 * 未达到触发条件时直接返回，几乎零开销。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {boolean} [force=false] 强制落盘，忽略阈值
 * @returns {Promise<void>}
 *
 * @example
 * ctx.waitUntil(flush(ctx));
 */
export async function flush(ctx, force = false) {
  try {
    if (flushing) return;
    if (!shouldFlush(force)) return;

    // 【锁必须在第一个 await 之前置位】
    // 旧实现把 flushing = true 放在 await getGlobal() 之后，而 JS 的并发切换
    // 只发生在 await 处：两个并发请求可以同时通过上面的 `if (flushing)` 检查，
    // 双双进入 await，然后各自执行一次 takeSnapshot() —— 第二次拿到空快照，
    // 或两次写入重复数据。这里提前加锁，使「检查 + 置位」之间不存在 await，
    // 从而在单 isolate 的事件循环语义下真正互斥。
    flushing = true;

    // 统一用一个 finally 释放锁：下面有多条 return 分支，逐条手工复位极易漏掉，
    // 一旦漏掉 flushing 会永久为 true，导致该 isolate 此后再也不落盘（静默丢数据）。
    try {
      // 读全局配置决定驱动。配置读取本身有内存缓存，成本极低。
      let cfg = null;
      try {
        cfg = await getGlobal(ctx);
      } catch {
        cfg = null;
      }

      if (cfg && cfg.statsEnabled === false) {
        // 统计已关闭：清空内存，不落盘
        takeSnapshot();
        return;
      }

      // 解析落盘后端：
      //   - STATS_BACKEND 显式指定（非 auto）→ 受实际部署可用性硬约束，选了未部署
      //     的后端直接判定 none（绝不静默回退到其它 KV，避免侵蚀厂商 KV 额度）。
      //   - auto（缺省）→ 沿用部署者配置 cfg.statsDriver（'d1' | 'none'，
      //     旧值 'kv' 视为 'd1'）；none 表示关闭。
      const caps = ctx?.caps || detectCaps(ctx?.env);
      const pref = readStatsBackendPreference(ctx?.env);
      let driverName = 'd1';
      let kvBackend = null; // 'redis' | 'native'（仅 kv 模式用）
      if (pref !== 'auto') {
        const backend = resolveStatsBackend(ctx?.env, caps); // 'd1'|'redis'|'native'|'none'
        if (backend === 'none') {
          takeSnapshot();
          return;
        }
        if (backend === 'd1') driverName = 'd1';
        else {
          driverName = 'kv';
          kvBackend = backend; // 'redis' | 'native'
        }
      } else {
        // auto：沿用部署者配置
        driverName = (cfg && cfg.statsDriver) || 'd1';
        if (driverName === 'kv') driverName = 'd1'; // 旧值兼容：KV 不再作为统计默认后端
        if (driverName === 'none') {
          takeSnapshot();
          return;
        }
      }

      const { snapshot } = takeSnapshot();
      if (snapshot.size === 0) return;

      const records = [];
      for (const [host, b] of snapshot) records.push(toRecord(host, b));

      try {
        if (driverName === 'd1') {
          // D1 模式：写入失败【绝不】降级到 KV。
          // 历史 bug：D1 瞬时不可用（冷启动 / env 绑定未注入 / ctx.env 透传缺失）
          // 时会回落 KV，导致 KV 被 hourly 分段污染，且 D1 恢复后无法对账。
          // 策略：先重试一次覆盖瞬时抖动；重试仍失败则丢弃本次聚合（最多落盘延迟
          // 一个 flush 周期），保持存储单一来源，绝不污染 KV。
          const d1 = await import('./d1Driver.js');
          let written = await d1.writeStats(ctx, records);
          if (!written) {
            // 第一次失败：重试一次（d1.writeStats 内部会重新探测 D1 绑定）
            written = await d1.writeStats(ctx, records);
          }
          if (!written) {
            d1FallbackCount++;
            console.warn(
              `[stats] D1 写入失败且重试后仍失败（存储= d1，未降级 KV）。` +
                `将丢弃本次聚合，hosts=${records.length}，累计丢弃 ${d1FallbackCount} 次。`
            );
            // 视为已落盘，避免无限重试堆积内存
          }
        } else if (driverName === 'kv') {
          // KV 模式（仅当解析后端明确为 KV 时进入，见上方解析逻辑）。
          // 分片随机键写入由 kvDriver 内部处理，多 isolate 并发互不覆盖。
          const kv = await import('./kvDriver.js');
          if (typeof kv.initKV === 'function') kv.initKV(ctx, kvBackend);
          await kv.writeStats(ctx, records);
        }
        // 除 'd1'、'kv'、'none' 外无任何其他分支。
      } catch (err) {
        // 落盘失败：把数据放回内存，下次再试（最多重复几个周期后自然被丢弃）
        restore(snapshot);
        try {
          console.warn('[stats] 落盘失败：', String((err && err.message) || err));
        } catch {
          /* ignore */
        }
      }
    } finally {
      flushing = false;
    }
  } catch {
    flushing = false;
  }
}

/**
 * 返回当前内存聚合状态的只读快照，供管理后台展示「实时未落盘数据」。
 * 不会清空内存。
 *
 * @returns {{pending:number, lastFlushAt:number, hosts:Object[]}} 状态摘要
 */
export function snapshotStats() {
  const hosts = [];
  for (const [host, b] of buckets) hosts.push(toRecord(host, b));
  return { pending: pendingCount, lastFlushAt, hosts };
}

/**
 * 返回统计聚合器的健康/观测状态，供管理后台展示。
 * 重点暴露 D1 模式下的写入失败计数（d1FallbackCount），让运维能在后台
 * 直接看到 D1 绑定抖动频率，而不必翻运行日志。
 *
 * @param {import('../contracts.js').Ctx} [ctx] 请求上下文（用于探测 D1 绑定）
 * @returns {Promise<{pending:number, lastFlushAt:number, hosts:Object[],
 *   d1FallbackCount:number, driver:string, d1Available:boolean}>}
 */
export async function getStatsHealth(ctx) {
  const hosts = [];
  for (const [host, b] of buckets) hosts.push(toRecord(host, b));

  let d1Available = false;
  let driver = 'd1';
  try {
    const cfg = await getGlobal(ctx);
    if (cfg && cfg.statsDriver) driver = cfg.statsDriver;
    if (driver === 'kv') driver = 'd1'; // 旧值兼容
    if (driver === 'd1') {
      const d1 = await import('./d1Driver.js');
      d1Available = typeof d1.isAvailable === 'function' ? d1.isAvailable(ctx) : false;
    }
  } catch {
    /* 探测失败不影响返回其他字段 */
  }

  return {
    pending: pendingCount,
    lastFlushAt,
    hosts,
    d1FallbackCount,
    driver,
    d1Available,
  };
}

/**
 * 重置聚合器。仅测试或管理面「清空统计」时使用。
 * @returns {void}
 */
export function resetCollector() {
  buckets = new Map();
  pendingCount = 0;
  lastFlushAt = Date.now();
  flushing = false;
}
