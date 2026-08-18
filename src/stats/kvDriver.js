/**
 * ============================================================================
 * stats/kvDriver.js —— KV 统计驱动（自部署 redis / 厂商 native）
 * ----------------------------------------------------------------------------
 * 让统计在「无 D1 平台（EO/ESA）」或运维显式指定时落 KV。
 *
 * 【多 isolate 并发计数：用「分片随机键」而非原子 CAS】
 * 平台 KV（经 Webdis/Redis HTTP）没有原子 compare-and-swap 语义，而 D1 之所有
 * 能正确计数靠的是原子 upsert。这里改用**分片**规避：每个 isolate 每次 flush
 * 都写一条独立的随机键 `stat:{host}:{hour}:p:{rand}`，彼此互不覆盖，读取时把
 * 同一 hour 的所有 partial + 已压实的 compact 键求和。代价是实时小时可能有极
 * 少量计数丢失（多 isolate 同时写、又恰在读取窗口内），对趋势型统计可接受。
 *
 * 【条数上限：TTL 自动过期 + host 封顶】
 * 每条统计键都带 TTL（STAT_TTL_SEC，默认 3 天），过期由 KV 服务端自动清理，
 * 无需额外 prune 任务；写入前校验 host 数不超过 STAT_MAX_HOSTS，超出则静默丢弃
 * 新 host，防止命名空间被构造 Host 头打爆。
 *
 * 【压实（compaction）】
 * 封存的小时（非当前小时）在首次读取时把多个 partial 合并为单一 `stat:{host}:
 * {hour}:c` 键（带 TTL），后续读取降为 1 次。压实是纯优化，失败不影响正确性
 * （下次读重新走 partial 路径，结果幂等）。
 *
 * ⚠️ 厂商 native KV 有读写次数限制，统计流量**绝不**会意外落到它上面 —— 是否走
 * native 由 STATS_BACKEND 显式指定且需实际部署，否则解析为 none（见 stats/index.js
 * 的 resolveDriver）。本驱动只被动接收「选中的后端」由 initKV 注入。
 * ============================================================================
 */

import { hourKey } from '../utils/hourKey.js';
import { getRedisKV, getNativeKV } from '../platform/kv.js';
import { readStatsTtl, readStatsMaxHosts } from '../platform/caps.js';

/** 分片数量（封存小时压实前的 partial 读上限，仅用于当前小时实时读取预算）。 */
const SHARD_COUNT = 8;

/**
 * 统计条目 TTL（秒），由 STAT_TTL env 控制，默认 3 天。
 *
 * 跟随考量：EdgeOne KV 仅 1GB 空间、按占用计费，stat key 是命名空间主要膨胀源，
 * 砍到 3 天约降 57% 空间占用；Cloudflare KV 收紧 TTL 对写次数无影响、纯省空间。
 * 查询窗口跟随本值推导，避免「窗口远大于存活期」造成的无效 KV 读。
 */
function ttlSec(ctx) {
  return readStatsTtl(ctx && ctx.env);
}

/** KV 键前缀。 */
const STAT_PREFIX = 'stat:';

/**
 * 查询时最多回溯的小时数，防止管理面一次请求打出上千次 KV 读。
 * 跟随 TTL 推导（TTL 天数 + 1 天缓冲），保证查询窗口永远 >= 数据存活期。
 */
function maxQueryHours(ctx) {
  const t = ttlSec(ctx);
  return Math.min(24 * 14, Math.ceil(t / 3600) + 24);
}

/**
 * 单次 queryStats 允许消耗的「partial 读」预算。
 * 压实键（compactKey）生成后，历史小时恒为 1 次读；只有尚未压实的小时才会
 * 回退到 partial 扫描。冷启动若所有小时都未压实，朴素做法是 hours × N 次读，
 * 远超 Workers 单请求 subrequest 上限。这里给一次调用设定上限，超出未压实的
 * 小时返回空值并置 result.partial = true。由于回退都会顺带回写压实键，连续
 * 查询几次后所有历史小时都会被压实，不再触发降级。
 */
const MAX_PARTIAL_READS_PER_QUERY = 200;

// ============================================================================
// 后端选择与适配器缓存
// ============================================================================

/**
 * 模块级「选中后端」状态。由 stats/index.js 的 resolveDriver 在每次请求解析后
 * 通过 initKV 注入。统计后端与「配置存哪」解耦：backend 明确为 'redis'（自部署）
 * 或 'native'（厂商），绝不因 KV_BACKEND=native 而误把统计写进厂商 KV。
 * @type {{ backend: 'redis'|'native'|null, kv: Object|null }}
 */
let _resolved = { backend: null, kv: null };

/**
 * 注入选中后端（由 resolveDriver 调用）。
 * 同时惰性解析并缓存对应的 KV 适配器实例，避免每次请求重复包装。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {'redis'|'native'} backend 选中的统计 KV 后端
 * @param {Object} [kvOverride] 仅测试用：直接注入 KV 适配器，绕过真实 env 探测
 */
export function initKV(ctx, backend, kvOverride) {
  const b = backend === 'native' ? 'native' : 'redis';
  if (_resolved.backend === b && _resolved.kv) return;
  const env = ctx && ctx.env;
  const kv = kvOverride || (b === 'native' ? getNativeKV(env) : getRedisKV(env));
  _resolved = { backend: b, kv };
}

/** 取当前选中的 KV 适配器；未注入或不可用返回 null。 */
function getKV() {
  return _resolved && _resolved.kv;
}

/**
 * 清空模块级后端缓存（仅供测试使用）。
 * 真实运行时 _resolved 在每次 resolveDriver 时由 initKV 覆盖，无需重置；
 * 单测多用例共享模块状态，需在「模拟不可用」等用例前主动清空。
 */
export function __resetKV() {
  _resolved = { backend: null, kv: null };
}

function currentBackend() {
  return _resolved ? _resolved.backend : null;
}

// ============================================================================
// 键构造
// ============================================================================

/**
 * 规整 host，防止非法字符污染 KV 键空间。
 * @param {string} host 主机名
 * @returns {string} 清洗后的 host
 */
function normHost(host) {
  const s = String(host || 'unknown').toLowerCase().replace(/[^a-z0-9.\-_*]/g, '');
  return s.slice(0, 128) || 'unknown';
}

/**
 * 构造「分片随机键」—— 每个 isolate 每 flush 一次的独立 partial 键。
 * 随机后缀保证多 isolate 并发写互不覆盖（KV 无原子 upsert 的兜底手段）。
 * 落在 `stat:{host}:` 前缀下，clearStats 的前缀扫描能一并清掉。
 * @param {string} host 主机名（已规整）
 * @param {string} hour 小时键 yyyymmddhh
 * @param {string} rand 随机后缀
 * @returns {string} KV key
 */
function partialKey(host, hour, rand) {
  return `${STAT_PREFIX}${host}:${hour}:p:${rand}`;
}

/**
 * 构造「压实键」—— 已封存小时的多个 partial 合并后的单一键。
 * 用 `c` 作为分片位，与 partial 的 `p:` 天然不冲突。
 * @param {string} host 主机名（已规整）
 * @param {string} hour 小时键 yyyymmddhh
 * @returns {string} KV key
 */
function compactKey(host, hour) {
  return `${STAT_PREFIX}${host}:${hour}:c`;
}

/**
 * 从一条 KV key 中解析出 host 与小时（若存在）。
 * 支持 partial（`...:p:{rand}`）与 compact（`...:c`）。
 * @param {string} name KV key
 * @returns {{host:string, hour:string}|null}
 */
function parseStatKey(name) {
  if (!name || !name.startsWith(STAT_PREFIX)) return null;
  const rest = name.slice(STAT_PREFIX.length);
  // 形如 {host}:{hour}:c            （压实键，单段后缀 c）
  //   或 {host}:{hour}:p:{rand}     （分片键，两段后缀 p + rand）
  const parts = rest.split(':');
  if (parts.length < 3) return null;

  // 先定位 hour 的索引：
  //   - 压实键 ........ {host...}:{hour}:c        → hour 在倒数第 2 段
  //   - 分片键 ........ {host...}:{hour}:p:{rand} → hour 在倒数第 3 段
  //     （last 既非 'c' 也非 'p' 时，要求倒数第 2 段为 'p'）
  const last = parts[parts.length - 1];
  let hourIdx;
  if (last === 'c') {
    hourIdx = parts.length - 2;
  } else if (last === 'p') {
    hourIdx = parts.length - 2;
  } else {
    if (parts[parts.length - 2] !== 'p') return null;
    hourIdx = parts.length - 3;
  }
  if (hourIdx < 1) return null;
  const hour = parts[hourIdx];
  if (!hour) return null;
  const host = parts.slice(0, hourIdx).join(':');
  if (!host) return null;
  return { host, hour };
}

// ============================================================================
// 聚合工具
// ============================================================================

function emptyAgg() {
  return {
    requests: 0,
    status2xx: 0,
    status3xx: 0,
    status4xx: 0,
    status5xx: 0,
    statusOther: 0,
    bytes: 0,
    cacheHit: 0,
    cacheMiss: 0,
    durSum: 0,
    durP95Max: 0,
    origins: {},
  };
}

function addInto(target, src) {
  if (!src || typeof src !== 'object') return target;
  target.requests += num(src.requests);
  target.status2xx += num(src.status2xx);
  target.status3xx += num(src.status3xx);
  target.status4xx += num(src.status4xx);
  target.status5xx += num(src.status5xx);
  target.statusOther += num(src.statusOther);
  target.bytes += num(src.bytes);
  target.cacheHit += num(src.cacheHit);
  target.cacheMiss += num(src.cacheMiss);
  target.durSum += num(src.durSum) || num(src.durAvg) * num(src.requests);
  target.durP95Max = Math.max(target.durP95Max, num(src.durP95));
  if (src.origins && typeof src.origins === 'object') {
    for (const [oid, n] of Object.entries(src.origins)) {
      target.origins[oid] = (target.origins[oid] || 0) + num(n);
    }
  }
  return target;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function finalize(agg) {
  const total = agg.cacheHit + agg.cacheMiss;
  return {
    ...agg,
    durAvg: agg.requests > 0 ? Math.round(agg.durSum / agg.requests) : 0,
    cacheHitRate: total > 0 ? Math.round((agg.cacheHit / total) * 10000) / 100 : 0,
  };
}

// ============================================================================
// 写入
// ============================================================================

/**
 * 批量写入统计记录（由 collector.flush 调用）。
 *
 * 采用分片随机键写入：`stat:{host}:{hour}:p:{rand}`，每个 host 每 flush 一次
 * 写一条独立随机键。多 isolate 并发写互不覆盖（无需原子 CAS），读取时按 hour
 * 聚合所有 partial 与压实键。每条带 TTL 自动过期。
 *
 * host 数封顶：写入前校验当前 host 数不超过 STAT_MAX_HOSTS，超出则静默丢弃新
 * host 的写入，防止命名空间被构造 Host 头打爆。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object[]} records collector 产出的扁平统计记录数组
 * @returns {Promise<boolean>} 是否成功写入（适配器不可用返回 false）
 */
export async function writeStats(ctx, records) {
  const kv = getKV();
  if (!kv || typeof kv.put !== 'function') return false;
  if (!Array.isArray(records) || records.length === 0) return true;

  const ttl = ttlSec(ctx);
  const maxHosts = readStatsMaxHosts(ctx && ctx.env);

  // host 封顶校验：先扫一遍已有 host 集合，再决定哪些是新 host 可写
  let existingHosts = null;
  const seenInBatch = new Set();
  const toWrite = [];

  for (const rec of records) {
    const host = normHost(rec && rec.host);
    const hour = (rec && rec.hour) || hourKey();
    const stored = {
      requests: num(rec.requests),
      status2xx: num(rec.status2xx),
      status3xx: num(rec.status3xx),
      status4xx: num(rec.status4xx),
      status5xx: num(rec.status5xx),
      statusOther: num(rec.statusOther),
      bytes: num(rec.bytes),
      cacheHit: num(rec.cacheHit),
      cacheMiss: num(rec.cacheMiss),
      durSum: num(rec.durSum),
      durP95: num(rec.durP95),
      origins: rec.origins && typeof rec.origins === 'object' ? rec.origins : {},
    };
    // 空记录（全 0）也写，以便后续聚合实时性；但若确实全 0 可跳过省空间
    if (
      stored.requests === 0 &&
      stored.bytes === 0 &&
      stored.cacheHit === 0 &&
      stored.cacheMiss === 0
    ) {
      continue;
    }

    if (seenInBatch.has(host)) {
      // 同批内同一 host 出现多次：合并到首条（理论上 collector 已按 host 聚合，防御性）
      const first = toWrite.find((w) => w.host === host);
      if (first) addInto(first.stored, stored);
      continue;
    }
    seenInBatch.add(host);

    // host 封顶：已存在 / 本批已见 / 不超过上限才允许写
    if (existingHosts === null) existingHosts = await collectExistingHosts(ctx, kv);
    const totalHosts = existingHosts.size + countNewHosts(existingHosts, seenInBatch);
    if (!existingHosts.has(host) && totalHosts > maxHosts) {
      // 超出封顶：丢弃该 host 写入（静默，不影响其余）
      continue;
    }

    const rand = Math.random().toString(36).slice(2, 10);
    toWrite.push({ key: partialKey(host, hour, rand), stored });
  }

  if (toWrite.length === 0) return true;

  // 并发写入独立随机键（互不覆盖）
  await Promise.all(
    toWrite.map(async (w) => {
      try {
        await kv.put(w.key, JSON.stringify(w.stored), { expirationTtl: ttl });
      } catch {
        /* 单条失败不阻断其余 */
      }
    })
  );
  return true;
}

/**
 * 收集 KV 中当前已有的 host 集合（用于 host 封顶校验）。
 * 仅扫描当前小时与上一小时的键前缀即可覆盖绝大多数场景，降低成本。
 * @param {Object} ctx 上下文
 * @param {Object} kv KV 适配器
 * @returns {Promise<Set<string>>}
 */
async function collectExistingHosts(ctx, kv) {
  const hosts = new Set();
  if (typeof kv.list !== 'function') return hosts;
  const hours = [hourKey(), hourKey(Date.now() - 3600000)];
  for (const hk of hours) {
    try {
      let cursor;
      do {
        const res = await kv.list({ prefix: STAT_PREFIX, cursor, limit: 1000 });
        for (const k of res.keys || []) {
          const parsed = parseStatKey(k.name);
          if (parsed && parsed.hour === hk) hosts.add(parsed.host);
        }
        cursor = res.list_complete ? null : res.cursor;
      } while (cursor);
    } catch {
      break;
    }
  }
  return hosts;
}

/** 统计 seen 中「不在 existing 里」的新 host 数量。 */
function countNewHosts(existing, seen) {
  let n = 0;
  for (const h of seen) if (!existing.has(h)) n += 1;
  return n;
}

// ============================================================================
// 查询
// ============================================================================

/**
 * 查询指定 host 最近 N 小时的统计，供管理后台使用。
 *
 * 读取逻辑：
 *   - 封存小时：优先读压实键 `:c`（1 次读）；若无则扫描该小时所有 partial 并回写压实键。
 *   - 当前小时（仍在写入）：直接扫描所有 partial 求和。
 * 所有 partial + compact 聚合为该小时总量，多个 isolate 的 partial 自然相加。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} host 主机名；传 '*' 或空表示不限（此时走 list 扫描）
 * @param {number} [hours=24] 回溯小时数
 * @returns {Promise<{driver:string, host:string, hours:number, total:Object, series:Object[], available:boolean, partial?:boolean}>}
 */
export async function queryStats(ctx, host, hours = 24) {
  const kv = getKV();
  const h = Math.min(maxQueryHours(ctx), Math.max(1, Math.floor(Number(hours) || 24)));

  const result = {
    driver: 'kv',
    host: normHost(host),
    hours: h,
    total: emptyAgg(),
    series: [],
    available: !!kv,
  };
  if (!kv) return result;

  const now = Date.now();
  const hourList = [];
  for (let i = h - 1; i >= 0; i--) {
    hourList.push(hourKey(now - i * 3600000));
  }

  const targetHost = result.host;
  const currentHour = hourKey(now);
  let partialReadBudget = MAX_PARTIAL_READS_PER_QUERY;

  const perHour = await Promise.all(
    hourList.map(async (hk) => {
      const sealed = hk !== currentHour;

      // 历史小时优先读压实键（1 次读）
      if (sealed) {
        try {
          const packed = await kv.get(compactKey(targetHost, hk), 'json');
          if (packed) return { hour: hk, ...finalize(addInto(emptyAgg(), packed)) };
        } catch {
          /* 压实键读取失败则回退到 partial 扫描 */
        }
      }

      // 扫描该小时所有 partial 键（前缀 `stat:{host}:{hour}:p:`）
      const prefix = `${STAT_PREFIX}${targetHost}:${hk}:p:`;
      const partials = [];
      try {
        let cursor;
        do {
          const res = await kv.list({ prefix, cursor, limit: 1000 });
          for (const k of res.keys || []) partials.push(k.name);
          cursor = res.list_complete ? null : res.cursor;
        } while (cursor);
      } catch {
        /* list 失败则该小时返回空 */
      }

      // 预算保护：partial 数量过多时仅取预算内部分，避免打爆 subrequest
      const overBudget = sealed && partials.length > partialReadBudget;
      if (sealed && overBudget) {
        result.partial = true;
        return { hour: hk, ...finalize(emptyAgg()) };
      }
      partialReadBudget -= partials.length;

      const agg = emptyAgg();
      let hasData = false;
      if (partials.length > 0) {
        const vals = await Promise.all(
          partials.map((name) => kv.get(name, 'json').catch(() => null))
        );
        for (const v of vals) {
          if (v) {
            addInto(agg, v);
            hasData = true;
          }
        }
      }

      // 该小时已封存且确有数据 → 回写压实键，摊薄后续读取成本
      if (sealed && hasData) {
        try {
          const snapshot = { ...agg, host: targetHost, hour: hk, compacted: true };
          await kv.put(compactKey(targetHost, hk), JSON.stringify(snapshot), {
            expirationTtl: ttlSec(ctx),
          });
        } catch {
          /* 压实是纯优化，失败不影响正确性 */
        }
      }

      return { hour: hk, ...finalize(agg) };
    })
  );

  for (const point of perHour) {
    result.series.push(point);
    addInto(result.total, point);
  }
  result.total = finalize(result.total);
  return result;
}

/**
 * 列出 KV 中有统计数据的所有 host（供管理后台的站点下拉框使用）。
 *
 * 只扫描当前小时与上一小时（近期有流量的站点），降低 list 成本。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Promise<string[]>} host 列表
 */
export async function listStatHosts(ctx) {
  const kv = getKV();
  if (!kv || typeof kv.list !== 'function') return [];

  const hours = [hourKey(), hourKey(Date.now() - 3600000)];
  const hosts = new Set();

  for (const hk of hours) {
    try {
      let cursor;
      do {
        const res = await kv.list({ prefix: STAT_PREFIX, cursor, limit: 1000 });
        for (const k of res.keys || []) {
          const parsed = parseStatKey(k.name);
          if (parsed && parsed.hour === hk) hosts.add(parsed.host);
        }
        cursor = res.list_complete ? null : res.cursor;
      } while (cursor);
    } catch {
      break;
    }
  }
  return Array.from(hosts);
}

/**
 * 删除指定 host 的全部统计键（partial + compact，管理后台「清空统计」用）。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} host 主机名
 * @returns {Promise<number>} 删除的 key 数量
 */
export async function clearStats(ctx, host) {
  const kv = getKV();
  if (!kv || typeof kv.list !== 'function') return 0;

  const target = `${STAT_PREFIX}${normHost(host)}:`;
  let deleted = 0;
  try {
    let cursor;
    do {
      const res = await kv.list({ prefix: target, cursor, limit: 1000 });
      await Promise.all(
        (res.keys || []).map(async (k) => {
          try {
            await kv.delete(k.name);
            deleted += 1;
          } catch {
            /* ignore */
          }
        })
      );
      cursor = res.list_complete ? null : res.cursor;
    } while (cursor);
  } catch {
    /* ignore */
  }
  return deleted;
}

/** 导出常量供其他模块复用。 */
export const KV_STATS_META = Object.freeze({
  ttlSec: ttlSec({ env: {} }),
});
