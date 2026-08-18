/**
 * ============================================================================
 * stats/kvDriver.js —— KV 统计驱动【已弃用】
 * ----------------------------------------------------------------------------
 * 历史原因：统计曾落盘 KV。现产品硬约束：KV 仅用于「控制台改配置」这一写路径，
 * 运行期所有统计写入都走 D1（见 d1Driver.js / collector.js）。
 *
 * 因此本文件的写入函数 writeStats 已降级为 no-op（绝不向 KV 写任何统计条目），
 * 查询函数也不再被 stats/index.js 门面引用。保留文件仅为兼容旧部署中可能残留的
 * 历史 stat:* 键的读取，新版本应一律使用 D1 驱动。
 * ============================================================================
 */

import { hourKey } from '../utils/hourKey.js';
// 读取历史 stat:* 键需要 KV 适配器。此前漏了这条 import，导致 queryStats 等
// 读函数一旦被调用即抛 ReferenceError（因 stats/index.js 已硬编码走 D1 而未暴露）。
import { getKV } from '../platform/kv.js';

/** 分片数量。契约规定 0-7。 */
const SHARD_COUNT = 8;

/**
 * 统计条目 TTL（秒）= 3 天。
 *
 * 原为 7 天。收紧到 3 天的考量同时覆盖两个平台：
 *  - EdgeOne KV：仅 1GB 空间、按占用计费（不计请求次数）。stat key 总量 =
 *    站点数 × 小时数 × 8 分片 + 压实键，是命名空间主要膨胀源；砍 4 天约降 57%
 *    空间占用，避免逼近 1GB 上限。
 *  - Cloudflare KV：虽然 KV 操作计次（免费 10 万次/天、KV 读计入 Workers 50
 *    subrequest 上限），但 TTL 只影响过期清理、不改变写入频率，收紧 TTL 对 CF
 *    同样是「纯省空间」、写次数不变，故对两边均正向无害。
 * 统计用途是看趋势/量级而非对账，3 天窗口已足够覆盖绝大多数运维排查场景。
 * 查询窗口（MAX_QUERY_HOURS）跟随本值推导，详见其注释。
 */
const STAT_TTL_SEC = 3 * 24 * 3600;

/** KV 键前缀。 */
const STAT_PREFIX = 'stat:';

/**
 * 查询时最多回溯的小时数，防止管理面一次请求打出上千次 KV 读。
 * 跟随 STAT_TTL_SEC 推导（TTL 天数 + 1 天缓冲），保证查询窗口永远 >= 数据
 * 存活期，避免「窗口远大于存活期」造成的无效 KV 读（在 Cloudflare 上 KV 读
 * 计入 Workers 50 subrequest 上限与每日 10 万次 KV 操作额度，更要克制）。
 */
const MAX_QUERY_HOURS = Math.min(24 * 14, Math.ceil(STAT_TTL_SEC / 3600) + 24);

/**
 * 单次 queryStats 调用允许消耗的「分片读」预算。
 *
 * 压实键（compactKey）生成后，历史小时恒为 1 次读；只有尚未压实的小时才会
 * 回退到 SHARD_COUNT 次分片读。冷启动时若所有小时都未压实，朴素做法是
 * hours × 8 次读，24 小时 = 192 次，远超 Workers 单请求 50 subrequest 上限。
 *
 * 这里给一次调用设定上限：最多允许 3 个小时走分片回退（3 × 8 = 24 次读），
 * 其余未压实的小时返回空值并置 result.partial = true。由于每次回退都会
 * 顺带回写压实键，连续查询几次之后所有历史小时都会被压实，不再触发降级。
 */
const MAX_SHARD_READS_PER_QUERY = SHARD_COUNT * 3;

/**
 * 把时间戳格式化为 `yyyymmddhh`（UTC）。
 * 统一用 UTC，避免不同边缘节点时区不一致导致同一小时被写进两个桶。
 * @param {number} [ts] 时间戳（ms），缺省为当前时间
 */

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
 * 构造分片键。
 * @param {string} host 主机名
 * @param {string} hour yyyymmddhh
 * @param {number} shard 分片号
 * @returns {string} KV key
 */
function shardKey(host, hour, shard) {
  return `${STAT_PREFIX}${host}:${hour}:${shard}`;
}

/**
 * 构造「压实键」—— 已封存小时的 8 个分片合并后的单一键。
 *
 * 用 `c` 作为分片位，与数字分片（0-7）天然不冲突，
 * 同时仍落在 `stat:{host}:` 前缀下，clearStats 的前缀扫描能一并清掉。
 *
 * @param {string} host 主机名（已规整）
 * @param {string} hour 小时键 yyyymmddhh
 * @returns {string} KV key
 */
function compactKey(host, hour) {
  return `${STAT_PREFIX}${host}:${hour}:c`;
}

/**
 * 空统计对象。
 * @returns {Object} 归零的统计结构
 */
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

/**
 * 把一条记录累加进聚合对象。
 * @param {Object} target 累加目标
 * @param {Object} src 源记录
 * @returns {Object} 累加后的 target
 */
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
  // durSum 用于最终算加权平均；durAvg 单独存的记录也兼容
  target.durSum += num(src.durSum) || num(src.durAvg) * num(src.requests);
  target.durP95Max = Math.max(target.durP95Max, num(src.durP95));
  if (src.origins && typeof src.origins === 'object') {
    for (const [oid, n] of Object.entries(src.origins)) {
      target.origins[oid] = (target.origins[oid] || 0) + num(n);
    }
  }
  return target;
}

/**
 * 安全转数字。
 * @param {any} v 任意值
 * @returns {number} 有限非负数，否则 0
 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ============================================================================
// 写入
// ============================================================================

/**
 * 批量写入统计记录（由 collector.flush 调用）。
 *
 * 【已弃用】统计落盘只走 D1，本函数不再向 KV 写入任何统计条目，
 * 直接返回 false 表示「未写入」，由 collector 视为已落盘（丢弃该批聚合），
 * 以保证 KV 零写入的硬约束。如需持久化统计，请使用 d1Driver.writeStats。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object[]} records collector 产出的扁平统计记录数组
 * @returns {Promise<boolean>} 始终 false（不写 KV）
 */
export async function writeStats(_ctx, _records) {
  return false;
}

/**
 * 把 KV 中读到的旧结构规整为标准聚合结构（做向前兼容）。
 * @param {Object} stored KV 中的原始对象
 * @returns {Object} 规整后的对象
 */
function normalizeStored(stored) {
  const out = emptyAgg();
  return addInto(out, stored);
}

// ============================================================================
// 查询
// ============================================================================

/**
 * 查询指定 host 最近 N 小时的统计，供管理后台使用。
 *
 * 会把每小时的 8 个分片全部读出来相加。
 * 读取成本 = hours × 8 次 KV 读，因此对 hours 做了上限保护。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} host 主机名；传 '*' 或空表示不限（此时走 list 扫描）
 * @param {number} [hours=24] 回溯小时数
 * @returns {Promise<{driver:string, host:string, hours:number, total:Object, series:Object[]}>}
 *
 * @example
 * const data = await queryStats(ctx, 'img.a.com', 24);
 */
export async function queryStats(ctx, host, hours = 24) {
  const kv = getKV(ctx && ctx.env);
  const h = Math.min(MAX_QUERY_HOURS, Math.max(1, Math.floor(Number(hours) || 24)));

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

  // ---------------------------------------------------------------------
  // 子请求预算优化：小时级「压实（compaction）」
  //
  // 朴素做法是每个小时都读满 SHARD_COUNT 个分片，成本 = hours × 8 次 KV 读。
  // 24 小时就是 192 次，远超 Workers 单请求 50 subrequest 的上限（KV 读也计入），
  // 概览页多站点叠加后会直接把预算打爆。
  //
  // 关键观察：分片只是为了**避免当前小时的并发写覆盖**。一旦某个小时过去了，
  // 就不会再有新的写入，其 8 个分片的值从此不再变化 —— 此时可以把它们合并成
  // 一个「压实键」`stat:{host}:{hour}:c`，之后每次只需 1 次读。
  //
  // 于是成本变成：
  //   - 当前小时（仍在写入）：8 次读，不压实
  //   - 历史小时：首次读 8 次并回写压实键，之后恒为 1 次读
  // 24 小时的稳态成本从 192 次降到 23 + 8 = 31 次，落回预算内。
  //
  // 压实写入失败无所谓：下次读取会重新走分片路径，结果完全一致（幂等）。
  // ---------------------------------------------------------------------
  const targetHost = result.host;
  const currentHour = hourKey(now);

  // 冷启动保护：压实键尚未生成时，回退的分片读会是 hours × 8 次。
  // 这里给「本次调用」设一个分片读预算，超出后该小时只读压实键/放弃分片回退，
  // 返回部分数据而不是把 subrequest 预算耗尽导致整个请求被平台掐断。
  // 已压实的小时不消耗预算，所以第二次查询起就不会再触发降级。
  let shardReadBudget = MAX_SHARD_READS_PER_QUERY;

  const perHour = await Promise.all(
    hourList.map(async (hk) => {
      const sealed = hk !== currentHour;

      // 历史小时优先读压实键
      if (sealed) {
        try {
          const packed = await kv.get(compactKey(targetHost, hk), 'json');
          if (packed) return { hour: hk, ...finalize(addInto(emptyAgg(), packed)) };
        } catch {
          /* 压实键读取失败则回退到分片读 */
        }
      }

      // 预算不足则跳过分片回退（当前小时始终保证读取，保证实时性）
      if (sealed && shardReadBudget < SHARD_COUNT) {
        result.partial = true;
        return { hour: hk, ...finalize(emptyAgg()) };
      }
      shardReadBudget -= SHARD_COUNT;

      const agg = emptyAgg();
      const shards = await Promise.all(
        Array.from({ length: SHARD_COUNT }, (_, s) =>
          kv.get(shardKey(targetHost, hk, s), 'json').catch(() => null)
        )
      );
      let hasData = false;
      for (const s of shards) {
        if (s) {
          addInto(agg, s);
          hasData = true;
        }
      }

      // 该小时已封存且确有数据 → 回写压实键，摊薄后续读取成本
      if (sealed && hasData) {
        try {
          const snapshot = { ...agg, host: targetHost, hour: hk, compacted: true };
          await kv.put(compactKey(targetHost, hk), JSON.stringify(snapshot), {
            expirationTtl: STAT_TTL_SEC,
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
 * 给聚合对象补上派生字段（平均耗时、命中率）。
 * @param {Object} agg 聚合对象
 * @returns {Object} 带派生字段的对象
 */
function finalize(agg) {
  const total = agg.cacheHit + agg.cacheMiss;
  return {
    ...agg,
    durAvg: agg.requests > 0 ? Math.round(agg.durSum / agg.requests) : 0,
    cacheHitRate: total > 0 ? Math.round((agg.cacheHit / total) * 10000) / 100 : 0,
  };
}

/**
 * 列出 KV 中有统计数据的所有 host（供管理后台的站点下拉框使用）。
 *
 * 注意：list 是相对昂贵的操作，且返回的 key 数量随站点数 × 小时数 × 8 增长。
 * 因此只扫描当前小时与上一小时，足够覆盖「近期有流量的站点」。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Promise<string[]>} host 列表
 */
export async function listStatHosts(ctx) {
  const kv = getKV(ctx && ctx.env);
  if (!kv || typeof kv.list !== 'function') return [];

  const hours = [hourKey(), hourKey(Date.now() - 3600000)];
  const hosts = new Set();

  for (const hk of hours) {
    try {
      let cursor;
      do {
        const res = await kv.list({ prefix: STAT_PREFIX, cursor, limit: 1000 });
        for (const k of res.keys || []) {
          // key = stat:{host}:{hour}:{shard}
          const rest = k.name.slice(STAT_PREFIX.length);
          const parts = rest.split(':');
          if (parts.length >= 3 && parts[parts.length - 2] === hk) {
            hosts.add(parts.slice(0, parts.length - 2).join(':'));
          }
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
 * 删除指定 host 的全部统计分片（管理后台「清空统计」用）。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} host 主机名
 * @returns {Promise<number>} 删除的 key 数量
 */
export async function clearStats(ctx, host) {
  const kv = getKV(ctx && ctx.env);
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
  shardCount: SHARD_COUNT,
  ttlSec: STAT_TTL_SEC,
});
