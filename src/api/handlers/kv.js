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
 *   GET    /kv/ping            → 探测 Webdis 后端连通性（读写回环）
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
import { getKV } from '../../platform/kv.js';
import { probeRedis } from '../../platform/redis-kv.js';

/**
 * GET /kv/ping —— 探测后端连通性。
 * 优先走 probeRedis（若配置了 REDIS_URL），否则对平台 KV 做同等回环。
 * @param {import('../../contracts.js').Ctx} ctx
 */
export async function ping(ctx) {
  const env = ctx.env || {};
  if (typeof env.REDIS_URL === 'string' && env.REDIS_URL.trim()) {
    const r = await probeRedis(env);
    return ok({ backend: 'redis-webdis', ...r });
  }
  // 平台 KV 回环探测
  const kv = getKV(env);
  if (!kv) {
    return ok({ backend: 'none', ok: false, error: '未配置任何 KV 后端（平台 KV 或 REDIS_URL）' });
  }
  const probeKey = `__ping__:${Math.random().toString(36).slice(2)}`;
  const probeVal = `pong-${Date.now()}`;
  const t0 = Date.now();
  try {
    await kv.put(probeKey, probeVal, { expirationTtl: 120 });
    const got = await kv.get(probeKey, 'text');
    await kv.delete(probeKey);
    const okBack = got === probeVal;
    return ok({
      backend: 'native',
      ok: okBack,
      latencyMs: Date.now() - t0,
      error: okBack ? undefined : '读写回环不一致',
    });
  } catch (err) {
    return ok({
      backend: 'native',
      ok: false,
      latencyMs: Date.now() - t0,
      error: err && err.message ? err.message : String(err),
    });
  }
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
