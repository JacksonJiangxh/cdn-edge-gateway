/**
 * ============================================================================
 * platform/cache.js —— 边缘缓存封装
 * ----------------------------------------------------------------------------
 * 三平台后端，按平台能力自动选择（详见 docs/11-architecture.md §4.1）：
 *
 *  1. CF（caches.default 存在）：走标准 Cache API 读写（跨节点全局一致）。
 *     - cacheMatch 命中返回 HIT；miss 返回 MISS；不可用标 DISABLED。
 *  2. EO（caches.default 存在，节点本地化）：同样走标准 Cache API 读写，
 *     但缓存仅当前边缘节点有效、不跨节点复制。
 *     - 另外 EO 还支持「同站 fetch 委托节点缓存」（路径 A，见 pipeline.js），
 *       命中后零函数调用；与 caches.default（路径 B）并存。
 *  3. ESA（全局 cache 单实例，非 caches.default）：走全局 cache.put/get/delete。
 *     - ESA 的 put key 必须为 http URL（cacheKeyHttpOnly：引擎不支持 https key，
 *       写入时由 cachePut 强制降为 http）；
 *     - Cache 操作与 fetch 共享 32 子请求硬上限（cacheSubreqLimit）。
 *
 * 关键修正：CF / EO / ESA 均原生支持 Cache API，hasCacheApi 三平台均为 true。
 * 旧版认为「EO/ESA 无 caches.default 即无缓存」已被官方文档推翻。
 * ============================================================================
 */

import { NO_CACHE_STATUS } from '../contracts.js';
import { detectCaps } from './caps.js';

/**
 * isolate 级缓存句柄。undefined 表示尚未探测，null 表示探测过且不可用。
 * @type {Cache|null|undefined}
 */
let _cacheHandle;

/**
 * isolate 级缓存计数器。
 *
 * 说明：Workers 的 isolate 会被回收，这些数字只反映**当前实例**自启动以来的
 * 情况，不是全局精确值。用途是观察命中率趋势与定位「缓存突然全 MISS」这类
 * 问题，不作为计费或 SLA 依据。
 *
 * @type {{hits:number, misses:number, disabled:number, writes:number, writeErrors:number, purged:number}}
 */
const _stats = {
  hits: 0,
  misses: 0,
  disabled: 0,
  writes: 0,
  writeErrors: 0,
  purged: 0,
};

/**
 * 获取边缘缓存句柄，不可用返回 null。
 * 按平台分支：
 *  - CF / EO：caches.default 标准实例
 *  - ESA：全局 `cache` 单实例（无 caches.default / open 命名空间）
 * @returns {Cache|any|null} 边缘缓存实例（CF/EO 为 Cache，ESA 为全局 cache 对象）
 */
function getCache() {
  if (_cacheHandle !== undefined) return _cacheHandle;
  try {
    // 注意：不能写成 caches?.default —— 某些运行时 caches 未定义时访问会抛 ReferenceError
    const c = typeof caches !== 'undefined' ? caches : null;
    if (c && typeof c.default !== 'undefined') {
      _cacheHandle = c.default;
      return _cacheHandle;
    }
  } catch {
    /* ignore */
  }
  // ESA：全局 cache 单实例
  try {
    const cache = typeof globalThis.cache !== 'undefined' ? globalThis.cache : null;
    if (cache && typeof cache.put === 'function') {
      _cacheHandle = cache;
      return _cacheHandle;
    }
  } catch {
    /* ignore */
  }
  _cacheHandle = null;
  return _cacheHandle;
}

/**
 * 在 ctx.debug 上安全地打标记。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} value 标记值
 * @returns {void}
 */
function markDebug(ctx, value) {
  if (ctx && ctx.debug && typeof ctx.debug === 'object') {
    ctx.debug.cache = value;
  }
}

/**
 * 判断当前上下文是否「具备边缘缓存能力」（CF/EO 的 caches.default、ESA 的全局 cache，
 * 以及任意平台上的响应头委托兜底）。
 * 优先使用 ctx.caps（避免重复探测），缺失时回退到直接探测。
 * 注意：此函数只回答「能力是否存在」，不回答「能否用 Cache API 读写」——
 * 具备响应头委托（如无任何 Cache API 句柄时）即视为边缘缓存可用，故返回 true。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {boolean} 是否支持边缘缓存
 */
function edgeCacheAvailable(ctx) {
  const caps = ctx && ctx.caps ? ctx.caps : detectCaps(ctx && ctx.env);
  return !!caps.hasEdgeCache;
}

/**
 * 判断当前上下文是否「可用 Cache API 进行读写」。
 * 三平台（cf=caches.default；eo=caches.default 节点本地化；esa=全局 cache 单实例）
 * 只要 caps.hasCacheApi 为真且句柄存在即为真。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {boolean} 是否可用 Cache API
 */
function useCacheApi(ctx) {
  const caps = ctx && ctx.caps ? ctx.caps : detectCaps(ctx && ctx.env);
  return !!(caps.hasCacheApi && getCache() !== null);
}

/**
 * 查询边缘缓存。
 *
 * 平台分支：
 *  - CF / EO / ESA（useCacheApi=true）：走各自 Cache API 的 match，命中返回 HIT
 *  - 完全无边缘缓存：标记 DISABLED
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Request} cacheKey 缓存键（由 proxy/cachekey.js 构造）
 * @returns {Promise<Response|null>} 命中的响应；未命中/不支持/异常均返回 null
 *
 * @example
 * const hit = await cacheMatch(ctx, key);
 * if (hit) return hit;
 */
export async function cacheMatch(ctx, cacheKey) {
  if (!cacheKey) return null;
  if (!edgeCacheAvailable(ctx)) {
    _stats.disabled++;
    markDebug(ctx, 'DISABLED');
    return null;
  }
  if (!useCacheApi(ctx)) {
    // 响应头委托模式（无任何 Cache API 句柄时）：标记 EDGE_HEADER（真实命中在边缘）
    markDebug(ctx, 'EDGE_HEADER');
    return null;
  }
  const cache = getCache();
  try {
    const hit = await cache.match(/** @type {any} */ (cacheKey));
    if (hit) {
      _stats.hits++;
      markDebug(ctx, 'HIT');
      return hit;
    }
    _stats.misses++;
    markDebug(ctx, 'MISS');
    return null;
  } catch {
    // 缓存层异常绝不能影响主链路，降级为 MISS
    _stats.misses++;
    markDebug(ctx, 'MISS');
    return null;
  }
}

/**
 * 写入边缘缓存。
 *
 * 注意：调用方必须传入一个「body 未被消费」的 Response（通常是 response.clone()），
 * 否则 CF 会抛 "Response body is already used"。本函数不替调用方 clone，
 * 因为 clone 的时机（在返回给客户端之前）只有调用方清楚。
 *
 * 本函数内部不调用 waitUntil —— 是否后台化由调用方决定：
 *   ctx.waitUntil(cachePut(ctx, key, resp.clone()));
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Request} cacheKey 缓存键
 * @param {Response} response 待缓存的响应（body 必须可用）
 * @returns {Promise<void>} 永不 reject
 */
export async function cachePut(ctx, cacheKey, response) {
  if (!cacheKey || !response) return;
  if (!edgeCacheAvailable(ctx)) return;
  if (!useCacheApi(ctx)) {
    // 响应头委托模式（无任何 Cache API 句柄时）：EO 边缘按响应头缓存；标记便于观测
    markDebug(ctx, 'EDGE_HEADER');
    return;
  }
  // ESA 的 put key 必须为 http URL（引擎不支持 https key），降协议避免写入失败
  const caps = ctx && ctx.caps ? ctx.caps : detectCaps(ctx && ctx.env);
  let key = cacheKey;
  if (caps.cacheKeyHttpOnly && cacheKey instanceof URL && cacheKey.protocol === 'https:') {
    key = new URL(cacheKey.href);
    key.protocol = 'http:';
  }
  const cache = getCache();
  try {
    await cache.put(/** @type {any} */ (key), response);
    _stats.writes++;
  } catch {
    // 常见失败：206/Range 响应、含 Set-Cookie、body 已被消费、ESA key 非法等。
    // 缓存写失败不应影响用户请求，静默忽略（但计数，便于发现异常写失败率）。
    _stats.writeErrors++;
  }
}

/**
 * 删除边缘缓存中的某个键（用于管理面的「刷新缓存」）。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Request} cacheKey 缓存键
 * @returns {Promise<boolean>} 是否确实删除了条目
 */
export async function cacheDelete(ctx, cacheKey) {
  if (!cacheKey) return false;
  if (!edgeCacheAvailable(ctx)) return false;
  if (!useCacheApi(ctx)) {
    // 响应头委托模式（无任何 Cache API 句柄时）：单键删除无 Cache API 等价物；
    // 刷新请改用响应头 Cache-Tag + 平台 purge，或等待 s-maxage 自然过期。
    markDebug(ctx, 'EDGE_HEADER');
    return false;
  }
  // ESA：cache.delete 仅删除当前节点实例；且通过 Cache API 存入的条目仍须 TTL 到期才真正失效。
  const caps = ctx && ctx.caps ? ctx.caps : detectCaps(ctx && ctx.env);
  let key = cacheKey;
  if (caps.cacheKeyHttpOnly && cacheKey instanceof URL && cacheKey.protocol === 'https:') {
    key = new URL(cacheKey.href);
    key.protocol = 'http:';
  }
  const cache = getCache();
  try {
    const deleted = await cache.delete(/** @type {any} */ (key));
    if (deleted) _stats.purged++;
    return deleted;
  } catch {
    return false;
  }
}

/**
 * 读取当前 isolate 的缓存统计快照。
 *
 * @returns {{
 *   hits:number, misses:number, disabled:number,
 *   writes:number, writeErrors:number, purged:number,
 *   lookups:number, hitRate:number
 * }} 统计快照；hitRate 为 0~1，无查询时为 0
 *
 * @example
 * const s = getCacheStats();   // { hits: 84, misses: 16, hitRate: 0.84, ... }
 */
export function getCacheStats() {
  const lookups = _stats.hits + _stats.misses;
  return {
    ..._stats,
    lookups,
    hitRate: lookups > 0 ? Number((_stats.hits / lookups).toFixed(4)) : 0,
  };
}

/**
 * 清零缓存计数器。用于测试，或管理面主动重置观测窗口。
 * @returns {void}
 */
export function resetCacheStats() {
  for (const k of Object.keys(_stats)) _stats[k] = 0;
}

/**
 * 判断一个「请求 + 响应 + 策略」组合是否可以写入边缘缓存。
 *
 * 规则（任一不满足即 false）：
 *  1. policy.enabled 必须为 true
 *  2. 请求方法只能是 GET / HEAD
 *  3. 请求不能带 Range 头（分片响应缓存语义复杂，直接跳过）
 *  4. 响应状态码不能落在 NO_CACHE_STATUS（4xx/5xx/52x）里
 *  5. 响应不能带 Set-Cookie（个性化内容，缓存会造成串号）
 *  6. 响应不能是 206 Partial Content（CF 也不允许 put）
 *  7. 响应 Cache-Control 明确声明 no-store / private 时不缓存
 *
 * @param {Request} request 客户端请求
 * @param {Response} response 源站响应
 * @param {import('../contracts.js').CachePolicy} policy 缓存策略
 * @returns {boolean} 是否可缓存
 */
export function isCacheable(request, response, policy) {
  // 1. 策略开关
  if (!policy || policy.enabled !== true) return false;
  if (!request || !response) return false;

  // 2. 方法白名单
  const method = String(request.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;

  // 3. Range 请求不缓存
  try {
    if (request.headers && request.headers.get('range')) return false;
  } catch {
    /* headers 不可用时忽略此项 */
  }

  // 4. 状态码黑名单
  const status = response.status;
  if (NO_CACHE_STATUS.has(status)) return false;
  // 6. 206 不在黑名单里但同样不可缓存
  if (status === 206) return false;

  // 5 & 7. 响应头检查
  try {
    const h = response.headers;
    if (h) {
      if (h.has('set-cookie')) return false;
      const cc = (h.get('cache-control') || '').toLowerCase();
      if (cc.includes('no-store') || cc.includes('private')) return false;

      // 8. Vary 处理：本项目使用「自造合成缓存键」而非依赖 caches API 的 Vary 协商，
      // 合成键不含原始请求头，Vary 没有输入可依据。若源站要求按 Accept-Encoding 之外的
      // 维度协商（如 Accept-Language、User-Agent），按当前键缓存会造成跨用户响应串味
      // （缓存投毒）。为安全起见，凡 Vary 含非 Accept-Encoding 维度的响应一律不缓存。
      const vary = (h.get('vary') || '').toLowerCase();
      if (vary) {
        const dims = vary.split(',').map((s) => s.trim()).filter(Boolean);
        const unsafe = dims.some((d) => d !== '*' && d !== 'accept-encoding');
        if (unsafe) return false;
      }
    }
  } catch {
    /* ignore */
  }

  return true;
}

/**
 * 清空 isolate 级缓存句柄。仅用于测试。
 * @returns {void}
 */
export function resetCacheHandle() {
  _cacheHandle = undefined;
}
