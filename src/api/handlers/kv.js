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
import { getKV, getNativeKV, getRedisKV } from '../../platform/kv.js';
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

/**
 * 列举某个 KV 适配器中的全部逻辑键（自动翻页）。
 *
 * 厂商 KV 的 list 走分页（limit/cursor），自部署 Redis 的 list 一次返回全部
 * （KEYS 无分页）。这里统一抽象成「全量列举」，供迁移逻辑遍历。
 *
 * @param {{list:(o:any)=>Promise<any>}} kv KVLike 适配器
 * @param {number} [pageLimit=500] 单页上限（仅厂商 KV 分页生效）
 * @returns {Promise<string[]>}
 */
async function listAllKeys(kv, pageLimit = 500) {
  const names = [];
  let cursor = undefined;
  for (let guard = 0; guard < 1000; guard++) {
    const page = await kv.list(cursor ? { cursor, limit: pageLimit } : { limit: pageLimit });
    const keys = (page && page.keys) || [];
    for (const k of keys) names.push(typeof k === 'string' ? k : k.name);
    const complete = page && (page.list_complete === true || page.listComplete === true);
    const next = page && (page.cursor || page.next_cursor);
    if (complete || !next) break;
    cursor = next;
  }
  return names;
}

/**
 * POST /kv/migrate —— 在「平台 KV」与「自部署 Webdis/Redis」之间互迁数据。
 *
 * 设计要点：
 *  - 双向：direction 取 'native→redis'（厂商→自部署）或 'redis→native'（自部署→厂商）。
 *  - 保留源：仅复制，绝不删除源数据，可随时切回。
 *  - 隔离自动处理：源/目标各自用其适配器，目标写入时自动套用自己的隔离
 *    （自部署侧由 createRedisKV 加 REDIS_PREFIX 并选 REDIS_DB；厂商侧无隔离）。
 *    因此迁移层只做「逐键 get → 逐键 put」透传，不手动编码键名。
 *  - 健壮性：两侧先做轻量连通性预检，任一不可写则提前失败；源 list 全量翻页；
 *    单键写失败计入 errors 并继续，保证「复制尽可能完整、失败可审计」。
 *
 * 入参（JSON body）：{ direction: 'native→redis' | 'redis→native', concurrency?: number }
 * 返回：{ ok, direction, copied, bytes, errors:[{key,error}], notice }
 *
 * @param {import('../../contracts.js').Ctx} ctx
 */
export async function migrate(ctx) {
  const env = ctx.env || {};

  let body;
  try {
    const raw = await ctx.request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST || 'BAD_REQUEST', '请求体需为 JSON', 400);
  }
  const direction = body && body.direction;
  if (direction !== 'native→redis' && direction !== 'redis→native') {
    return fail(ERROR_CODES.BAD_REQUEST || 'BAD_REQUEST', "direction 必须为 'native→redis' 或 'redis→native'", 400);
  }

  const native = getNativeKV(env);
  const redis = getRedisKV(env);
  if (!native) return fail(ERROR_CODES.STORAGE_UNAVAILABLE || 'STORAGE_UNAVAILABLE', '未检测到平台 KV 绑定，无法迁移', 503);
  if (!redis) return fail(ERROR_CODES.STORAGE_UNAVAILABLE || 'STORAGE_UNAVAILABLE', '未检测到自部署 Redis(Webdis) 配置，无法迁移', 503);

  // 连通性预检：确保两侧可写，避免复制中途才发现目标不可达。
  const [nProbe, rProbe] = await Promise.all([probeNativeKV(env), probeRedis(env)]);
  if (!nProbe.ok) {
    return fail(ERROR_CODES.STORAGE_UNAVAILABLE || 'STORAGE_UNAVAILABLE', `平台 KV 不可写: ${nProbe.error || '探测失败'}`, 503);
  }
  if (!rProbe.ok) {
    return fail(ERROR_CODES.STORAGE_UNAVAILABLE || 'STORAGE_UNAVAILABLE', `自部署 Redis 不可写: ${rProbe.error || '探测失败'}`, 503);
  }

  const src = direction === 'native→redis' ? native : redis;
  const dst = direction === 'native→redis' ? redis : native;

  let keys;
  try {
    keys = await listAllKeys(src);
  } catch (err) {
    return fail(ERROR_CODES.INTERNAL || 'INTERNAL', `列举源数据失败: ${err && err.message ? err.message : err}`, 500);
  }
  if (keys.length === 0) {
    return ok({
      ok: true,
      direction,
      copied: 0,
      bytes: 0,
      errors: [],
      notice: '源 KV 没有数据，无需迁移。若要让新数据生效，请将环境变量 KV_BACKEND/KV_SOURCE 指向目标后端，并重新部署/触发生效。',
    });
  }

  const concurrency = Math.min(Math.max(Number(body && body.concurrency) || 4, 1), 16);
  const errors = [];
  let copied = 0;
  let bytes = 0;

  // 小批量并发写入，遇错记录并继续。
  for (let i = 0; i < keys.length; i += concurrency) {
    const batch = keys.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async (key) => {
        try {
          const val = await src.get(key, 'text');
          if (val == null) return { key, skipped: true };
          await dst.put(key, val);
          return { key, size: new TextEncoder().encode(val).length };
        } catch (err) {
          return { key, error: err && err.message ? err.message : String(err) };
        }
      })
    );
    for (const r of results) {
      if (r.error) errors.push({ key: r.key, error: r.error });
      else if (!r.skipped) {
        copied++;
        bytes += r.size || 0;
      }
    }
  }

  const notice =
    '迁移完成（源数据已保留，未删除）。本次为「复制」而非「切换」：' +
    '若要真正让新数据生效，请将环境变量 KV_BACKEND / KV_SOURCE 指向目标后端，并重新部署 / 触发生效。' +
    '切换后新写入会落在目标端；两边并存期间请注意源端不再更新。';

  return ok({
    ok: true,
    direction,
    copied,
    total: keys.length,
    bytes,
    errors,
    notice,
  });
}
