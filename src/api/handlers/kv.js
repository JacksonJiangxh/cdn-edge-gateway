/**
 * ============================================================================
 * 管理 API handler —— KV 直读直写 + Redis/Webdis 连通性探测
 * ----------------------------------------------------------------------------
 * 为「无原生 KV 平台」准备的兜底存储（自部署 Webdis/Redis）提供：
 *   1. 连通性自检（读写回环），让用户在管理面确认自部署 Redis 可用；
 *   2. 一组受鉴权的 KV 直读直写接口，便于排障与手动存取（不替代 store.js
 *      配置存储，仅作「通用 KV 命名空间」暴露给上层与运维使用）。
 *
 * 路由（均挂载在 /{adminPath}/api/kv 之下，鉴权同管理面）：
 *   GET    /kv/ping            → **同时**探测平台 KV 与自部署 Webdis（各自读写回环）
 *   GET    /kv/:key            → 读一个键（text/json 自适应）
 *   PUT    /kv/:key            → 写一个键，body 为值；?ttl= 可选过期秒
 *   DELETE /kv/:key            → 删一个键
 *   GET    /kv?prefix=         → 列举前缀下的键（默认列举全部）
 *
 * 注意：这些接口读写的是项目统一 KV 层（getKV），因此无论后端是平台 KV
 * 还是自部署 Redis，调用方无感——这正是「KV 接口」的抽象意义。
 * ============================================================================
 */

import { ok, fail } from '../../utils/response.js';
import { ERROR_CODES } from '../../contracts.js';
import { getKV, getNativeKV } from '../../platform/kv.js';
import { probeRedis, hasRedisConfig } from '../../platform/redis-kv.js';
import { readKvBackendPreference, decideKvBackend } from '../../platform/caps.js';

/**
 * 对「平台级原生 KV」做读写回环探测（与 probeRedis 同构、可独立调用）。
 *
 * 与 probeRedis 刻意保持相同的返回结构，便于管理面并列渲染两端结果。
 * 探测使用随机 key 并在读回后立即删除，TTL 120s 兜底（防中途异常残留）。
 *
 * @param {Object} env 平台环境变量与绑定
 * @returns {Promise<{ok:boolean, latencyMs:number, backend:string, error?:string}>}
 */
export async function probeNativeKV(env) {
  const kv = getNativeKV(env || {});
  if (!kv) {
    return {
      ok: false,
      latencyMs: 0,
      backend: 'none',
      error: '未检测到平台 KV 绑定（CDN_KV / KV）',
    };
  }
  const probeKey = `__ping__:${Math.random().toString(36).slice(2)}`;
  const probeVal = `pong-${Date.now()}`;
  const t0 = Date.now();
  try {
    await kv.put(probeKey, probeVal, { expirationTtl: 120 });
    const got = await kv.get(probeKey, 'text');
    await kv.delete(probeKey);
    const latencyMs = Date.now() - t0;
    if (got !== probeVal) {
      return { ok: false, latencyMs, backend: 'native', error: '读写回环不一致（写入后读回的值不匹配）' };
    }
    return { ok: true, latencyMs, backend: 'native' };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      backend: 'native',
      error: err && err.message ? err.message : String(err),
    };
  }
}

/**
 * GET /kv/ping —— **同时**探测平台 KV 与自部署 Webdis 两端连通性。
 *
 * 两端各自独立做读写回环、各自返回 ok/latencyMs/error，并附带当前生效后端标记，
 * 便于管理面一次点击并列展示（不再是二选一）。两端探测并发执行以压低总耗时；
 * 该接口仅供管理面手动触发，不在数据面热路径，不影响 ESA 的 32 子请求预算。
 *
 * @param {import('../../contracts.js').Ctx} ctx
 */
export async function ping(ctx) {
  const env = ctx.env || {};
  const [native, redis] = await Promise.all([probeNativeKV(env), probeRedis(env)]);

  // 生效后端优先取 caps（单一真相源）；caps 缺失时按同一规则现场推导。
  // 存在性判定用权威来源（hasRedisConfig / getNativeKV），不依赖探测结果的 backend 字面值——
  // 探测失败时 backend 仍是 'redis-webdis'/'native'，用它推导会把「已配置但不通」误判为存在性问题。
  const preference = readKvBackendPreference(env);
  const effective =
    (ctx.caps && ctx.caps.kvBackend) ||
    decideKvBackend(!!getNativeKV(env), hasRedisConfig(env), preference);

  return ok({
    // 当前生效后端：native / redis / none
    backend: effective,
    preference,
    // 兼容旧前端：顶层 ok/latencyMs 反映「当前生效后端」的探测结果
    ok: effective === 'redis' ? redis.ok : effective === 'native' ? native.ok : false,
    latencyMs: effective === 'redis' ? redis.latencyMs : effective === 'native' ? native.latencyMs : 0,
    native: { ...native, effective: effective === 'native' },
    redis: { ...redis, effective: effective === 'redis' },
  });
}

/**
 * GET /kv/:key —— 读键。
 * @param {import('../../contracts.js').Ctx} ctx
 * @param {string} key
 */
export async function getKey(ctx, key) {
  const kv = getKV(ctx.env);
  if (!kv) return fail(ERROR_CODES.STORAGE_UNAVAILABLE || 'STORAGE_UNAVAILABLE', '未配置 KV 后端', 503);
  const val = await kv.get(key, 'text');
  if (val == null) return fail(ERROR_CODES.NOT_FOUND || 'NOT_FOUND', '键不存在', 404);
  return new Response(val, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * PUT /kv/:key —— 写键。
 * body 为原始文本（文本协议）；?ttl= 可选过期秒数（>0）。
 * @param {import('../../contracts.js').Ctx} ctx
 * @param {string} key
 */
export async function putKey(ctx, key) {
  const kv = getKV(ctx.env);
  if (!kv) return fail(ERROR_CODES.STORAGE_UNAVAILABLE || 'STORAGE_UNAVAILABLE', '未配置 KV 后端', 503);
  let value;
  try {
    value = await ctx.request.text();
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体读取失败', 400);
  }
  if (value == null) value = '';
  const ttlRaw = new URL(ctx.request.url).searchParams.get('ttl');
  const ttl = Number(ttlRaw);
  const opts = Number.isFinite(ttl) && ttl > 0 ? { expirationTtl: ttl } : undefined;
  try {
    await kv.put(key, value, opts);
  } catch (err) {
    return fail(ERROR_CODES.INTERNAL, `写入失败: ${err && err.message ? err.message : err}`, 500);
  }
  return ok({ key, ttl: opts ? opts.expirationTtl : null });
}

/**
 * DELETE /kv/:key —— 删键。
 * @param {import('../../contracts.js').Ctx} ctx
 * @param {string} key
 */
export async function delKey(ctx, key) {
  const kv = getKV(ctx.env);
  if (!kv) return fail(ERROR_CODES.STORAGE_UNAVAILABLE || 'STORAGE_UNAVAILABLE', '未配置 KV 后端', 503);
  try {
    await kv.delete(key);
  } catch (err) {
    return fail(ERROR_CODES.INTERNAL, `删除失败: ${err && err.message ? err.message : err}`, 500);
  }
  return ok({ key, deleted: true });
}

/**
 * GET /kv?prefix=xxx —— 列举键。
 * @param {import('../../contracts.js').Ctx} ctx
 */
export async function listKeys(ctx) {
  const kv = getKV(ctx.env);
  if (!kv) return fail(ERROR_CODES.STORAGE_UNAVAILABLE || 'STORAGE_UNAVAILABLE', '未配置 KV 后端', 503);
  const prefix = new URL(ctx.request.url).searchParams.get('prefix') || '';
  const limit = Math.min(Math.max(Number(new URL(ctx.request.url).searchParams.get('limit')) || 200, 1), 1000);
  const res = await kv.list({ prefix, limit });
  return ok({ keys: (res.keys || []).map((k) => (typeof k === 'string' ? k : k.name)), complete: res.list_complete });
}
