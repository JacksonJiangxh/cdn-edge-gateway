/**
 * ============================================================================
 * stats/index.js —— 统计查询门面（Facade）
 * ----------------------------------------------------------------------------
 * 让管理面 API 无需关心底层是 KV 还是 D1：
 *   - 按 `GlobalConfig.statsDriver` 分发到 kvDriver / d1Driver
 *   - driver = 'none'、驱动不可用、或任何异常 → 一律返回**零值结构**，绝不抛错
 *     （统计挂掉不能让管理面白屏）
 *
 * 【KV 驱动下的子请求预算】
 * Workers 单个请求最多 50 个 subrequest（免费版），KV 读取也计入。
 * kvDriver.queryStats(host, hours) 的成本 = hours × 8 次读，
 * 所以概览接口在 KV 驱动下：
 *   1. 限制并发批次（CONCURRENCY = 10，但对 KV 驱动实际按 host 串行成本更高）
 *   2. **限制 host 数量**（MAX_HOSTS_KV），超出部分直接不查，避免爆预算
 *   3. 概览默认把 hours 收敛到较小值来控制读次数
 * D1 驱动没有这个限制，一条 SQL 就能聚合所有 host。
 * ============================================================================
 */

import { getGlobal } from '../config/store.js';
import { hourKey } from '../utils/hourKey.js';

/** 并发上限：一批最多同时发起多少个驱动查询。 */
const CONCURRENCY = 10;

/** KV 驱动下概览最多查询的 host 数（子请求预算保护）。 */
const MAX_HOSTS_KV = 6;

/** topHosts 返回条数。 */
const TOP_N = 10;

/** 概览接口在 KV 驱动下允许的最大回溯小时数。 */
const MAX_OVERVIEW_HOURS_KV = 24;

// ============================================================================
// 零值结构
// ============================================================================

/**
 * 生成空的概览结构。
 * @returns {{requests:number, hitRate:number, bytes:number, statusDist:Object, topHosts:Object[]}}
 */
function emptyOverview() {
  return {
    requests: 0,
    hitRate: 0,
    bytes: 0,
    statusDist: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
    topHosts: [],
  };
}

/**
 * 生成空的单站点结构。
 * @param {string[]} [hourList] 需要补零的小时列表
 * @returns {{requests:number, hitRate:number, bytes:number, statusDist:Object, series:Object[]}}
 */
function emptyHostStats(hourList) {
  return {
    requests: 0,
    hitRate: 0,
    bytes: 0,
    statusDist: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
    series: (hourList || []).map((hour) => ({ hour, requests: 0, bytes: 0, hit: 0, miss: 0 })),
  };
}

// ============================================================================
// 工具
// ============================================================================

/**
 * 安全转非负数。
 * @param {any} v 任意值
 * @returns {number} 非负数
 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 计算命中率（0~1 的小数，保留 4 位）。
 * @param {number} hit 命中数
 * @param {number} miss 未命中数
 * @returns {number} 0~1 的小数
 */
function rate(hit, miss) {
  const total = hit + miss;
  if (total <= 0) return 0;
  return Math.round((hit / total) * 10000) / 10000;
}

/**
 * 时间戳 → `yyyymmddhh`（UTC），与两个驱动保持一致。
 * @param {number} ts 时间戳（ms）
 * 生成连续的小时键列表（升序，含当前小时）。
 * @param {number} hours 小时数
 * @returns {string[]} 小时键列表
 */
function buildHourList(hours) {
  const now = Date.now();
  const out = [];
  for (let i = hours - 1; i >= 0; i--) out.push(hourKey(now - i * 3600000));
  return out;
}

/**
 * 分批并发执行任务，控制同时在飞的请求数。
 * @template T
 * @param {Array<() => Promise<T>>} tasks 任务工厂数组
 * @param {number} limit 并发上限
 * @returns {Promise<T[]>} 结果数组（顺序与输入一致）
 */
async function runBatched(tasks, limit) {
  const out = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const slice = tasks.slice(i, i + limit);
    const res = await Promise.all(slice.map((fn) => fn().catch(() => null)));
    out.push(...res);
  }
  return out;
}

/**
 * 解析当前应使用的驱动模块。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Promise<{name:'kv'|'d1'|'none', mod:Object|null}>} 驱动信息
 */
async function resolveDriver(ctx) {
  let name = 'kv';
  try {
    const cfg = await getGlobal(ctx);
    if (cfg && cfg.statsEnabled === false) return { name: 'none', mod: null };
    if (cfg && cfg.statsDriver) name = cfg.statsDriver;
  } catch {
    name = 'kv';
  }

  if (name === 'none') return { name: 'none', mod: null };

  try {
    if (name === 'd1') {
      const mod = await import('./d1Driver.js');
      // D1 模式：彻底与 KV 解耦，【绝不】回落 KV。
      // 历史逻辑会在 D1 瞬时不可用时回落 KV 查询，导致管理面偶尔读到 KV 中
      // 历史残留的 hourly 脏分段（见 collector.js 写入路径误降级 bug）。
      // 现在 D1 驱动各查询函数在 db 为 null 时已返回零值结构（不会抛错），
      // 因此即使 D1 绑定缺失，也让查询继续走 D1 驱动——最多返回「无数据」，
      // 而不会污染/误读 KV。保持存储单一来源。
      return { name: 'd1', mod };
    }
    // name === 'kv'：CF 与 EdgeOne 均为真实 KV，行为一致。
    const mod = await import('./kvDriver.js');
    return { name: 'kv', mod };
  } catch {
    return { name: 'none', mod: null };
  }
}

/**
 * 把驱动返回的 `{total, series}` 规整为门面的统一形状。
 * @param {Object} raw 驱动返回值
 * @param {string[]} hourList 需要补齐的小时列表
 * @returns {{requests:number, hitRate:number, bytes:number, statusDist:Object, series:Object[]}}
 */
function shapeHostResult(raw, hourList) {
  const total = (raw && raw.total) || {};
  const seriesMap = new Map();
  for (const p of (raw && raw.series) || []) {
    if (p && p.hour) seriesMap.set(String(p.hour), p);
  }

  // 缺失小时补 0（前端不做补齐）
  const series = hourList.map((hour) => {
    const p = seriesMap.get(hour);
    return {
      hour,
      requests: num(p && p.requests),
      bytes: num(p && p.bytes),
      hit: num(p && p.cacheHit),
      miss: num(p && p.cacheMiss),
    };
  });

  return {
    requests: num(total.requests),
    hitRate: rate(num(total.cacheHit), num(total.cacheMiss)),
    bytes: num(total.bytes),
    statusDist: {
      '2xx': num(total.status2xx),
      '3xx': num(total.status3xx),
      '4xx': num(total.status4xx),
      '5xx': num(total.status5xx),
    },
    series,
  };
}

// ============================================================================
// 对外接口
// ============================================================================

/**
 * 概览统计：聚合多个 host 的总量，并给出请求数 Top 10 的站点。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string[]} hosts 待统计的站点列表；为空数组时返回零值
 * @param {number} [hours=24] 回溯小时数
 * @returns {Promise<{requests:number, hitRate:number, bytes:number,
 *   statusDist:{'2xx':number,'3xx':number,'4xx':number,'5xx':number},
 *   topHosts:Array<{host:string, requests:number, bytes:number, hitRate:number}>}>}
 *
 * @example
 * const ov = await queryOverview(ctx, ['a.com', 'b.com'], 24);
 */
export async function queryOverview(ctx, hosts, hours = 24) {
  const result = emptyOverview();
  try {
    const list = Array.isArray(hosts) ? hosts.filter((h) => typeof h === 'string' && h) : [];
    if (list.length === 0) return result;

    const { name, mod } = await resolveDriver(ctx);
    if (!mod || typeof mod.queryStats !== 'function') return result;

    // isolate 级缓存：管理面反复刷新概览时避免重复轰炸 KV/D1
    let h = Math.max(1, Math.floor(Number(hours) || 24));
    if (name === 'kv') h = Math.min(h, MAX_OVERVIEW_HOURS_KV);
    const cacheKey = `${list.slice(0, MAX_HOSTS_KV).sort().join(',')}:${h}`;
    const now = Date.now();
    if (_overviewCache.key === cacheKey && (now - _overviewCache.at) < STATS_QUERY_CACHE_TTL_MS) {
      return _overviewCache.data;
    }

    // KV 驱动：读取次数 = host 数 × hours × 8 分片，必须双重收敛
    let targets = list;
    if (name === 'kv') {
      targets = list.slice(0, MAX_HOSTS_KV);
    }

    const tasks = targets.map((host) => async () => {
      const raw = await mod.queryStats(ctx, host, h);
      return { host, total: (raw && raw.total) || {} };
    });
    const results = await runBatched(tasks, CONCURRENCY);

    let hit = 0;
    let miss = 0;
    const per = [];

    for (const r of results) {
      if (!r) continue;
      const t = r.total;
      result.requests += num(t.requests);
      result.bytes += num(t.bytes);
      result.statusDist['2xx'] += num(t.status2xx);
      result.statusDist['3xx'] += num(t.status3xx);
      result.statusDist['4xx'] += num(t.status4xx);
      result.statusDist['5xx'] += num(t.status5xx);
      hit += num(t.cacheHit);
      miss += num(t.cacheMiss);

      per.push({
        host: r.host,
        requests: num(t.requests),
        bytes: num(t.bytes),
        hitRate: rate(num(t.cacheHit), num(t.cacheMiss)),
      });
    }

    result.hitRate = rate(hit, miss);
    per.sort((a, b) => b.requests - a.requests);
    result.topHosts = per.slice(0, TOP_N);

    // 写入 isolate 缓存
    _overviewCache = { key: cacheKey, at: now, data: result };
    return result;
  } catch {
    // 任何异常都返回零值结构，管理面照常渲染
    return emptyOverview();
  }
}

/**
 * 单站点统计：返回总量 + 按小时的趋势序列（缺失小时已补 0）。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} host 站点主机名
 * @param {number} [hours=24] 回溯小时数
 * @returns {Promise<{requests:number, hitRate:number, bytes:number, statusDist:Object,
 *   series:Array<{hour:string, requests:number, bytes:number, hit:number, miss:number}>}>}
 *
 * @example
 * const s = await queryByHost(ctx, 'img.a.com', 48);
 */
export async function queryByHost(ctx, host, hours = 24) {
  const h = Math.max(1, Math.floor(Number(hours) || 24));
  const hourList = buildHourList(h);

  try {
    if (typeof host !== 'string' || !host) return emptyHostStats(hourList);

    // isolate 级缓存：管理面反复切换刷新单站点时避免重复轰炸 KV/D1
    const cacheKey = `${host}:${h}`;
    const now = Date.now();
    const cached = _hostStatsCache.get(cacheKey);
    if (cached && (now - cached.at) < STATS_QUERY_CACHE_TTL_MS) {
      return cached.data;
    }

    const { mod } = await resolveDriver(ctx);
    if (!mod || typeof mod.queryStats !== 'function') return emptyHostStats(hourList);

    const raw = await mod.queryStats(ctx, host, h);
    const result = shapeHostResult(raw, hourList);

    // 写入 isolate 缓存，超过上限时淘汰最旧条目（FIFO）
    if (_hostStatsCache.size >= MAX_HOST_STATS_CACHE_ENTRIES) {
      const oldest = _hostStatsCache.keys().next().value;
      if (oldest) _hostStatsCache.delete(oldest);
    }
    _hostStatsCache.set(cacheKey, { at: now, data: result });
    return result;
  } catch {
    return emptyHostStats(hourList);
  }
}

// ---- listStatHosts 频率保护 ----

/** listStatHosts 最小调用间隔（毫秒）。管理面高频轮询时避免反复刷 KV/D1。 */
const LIST_HOSTS_THROTTLE_MS = 10000;

/** isolate 内的调用缓存：上次返回结果 + 时间戳。每个 isolate 独立缓存。 */
let _listHostsCache = { at: 0, data: [] };

// ---- queryStats 结果缓存 ----

/** queryByHost / queryOverview 结果的最小缓存 TTL（毫秒）。
 * 管理面轮询间隔通常 ≥ 30s，这个 TTL 避免同一轮询周期内重复轰炸 KV/D1。 */
const STATS_QUERY_CACHE_TTL_MS = 30000;

/** queryByHost 结果缓存：Map<`${host}:${hours}`, { at, data }>。
 * 限定最大条目数防止无限制增长。 */
const MAX_HOST_STATS_CACHE_ENTRIES = 20;
const _hostStatsCache = new Map();

/** queryOverview 结果缓存（全局只有一个最新结果）。 */
let _overviewCache = { at: 0, key: '', data: null };

/**
 * 列出有统计数据的站点（下拉框用）。任何异常返回空数组。
 *
 * 【频率保护】
 * 同一 isolate 内 10 秒内重复调用直接返回内存缓存，不穿透到 KV/D1。
 * 这在管理面高频轮询（下拉框刷新、概览重新加载）时显著降低子请求消耗。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Promise<string[]>} host 列表
 */
export async function listStatHosts(ctx) {
  try {
    const now = Date.now();
    if (now - _listHostsCache.at < LIST_HOSTS_THROTTLE_MS) {
      return _listHostsCache.data;
    }

    const { mod } = await resolveDriver(ctx);
    let result = [];
    if (mod && typeof mod.listStatHosts === 'function') {
      result = (await mod.listStatHosts(ctx)) || [];
    }

    _listHostsCache = { at: now, data: result };
    return result;
  } catch {
    return _listHostsCache.data || [];
  }
}

/**
 * 清空指定站点的统计数据。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} host 主机名
 * @returns {Promise<boolean>} 是否成功
 */
export async function clearStats(ctx, host) {
  try {
    const { mod } = await resolveDriver(ctx);
    if (!mod || typeof mod.clearStats !== 'function') return false;
    const ok = !!(await mod.clearStats(ctx, host));

    // 清空成功后使相关 isolate 缓存失效
    if (ok) {
      for (const key of _hostStatsCache.keys()) {
        if (key.startsWith(`${host}:`)) _hostStatsCache.delete(key);
      }
      _overviewCache = { at: 0, key: '', data: null };
    }
    return ok;
  } catch {
    return false;
  }
}

export { record, flush, snapshotStats, getStatsHealth } from './collector.js';
