/**
 * 被动熔断
 * ----------------------------------------------------------------------------
 * 为什么是「被动」的？
 *   Cloudflare Pages / EdgeOne 没有 Cron Trigger，无法跑主动健康探测。
 *   因此改为在真实流量中统计失败：某个源站在 60s 内连续失败 >= 3 次，
 *   就在接下来的时间窗内被负载均衡器跳过，等 KV 的 TTL 自然过期后自动恢复。
 *
 * 设计取舍：
 *  - 所有写操作都放进 ctx.waitUntil，绝不阻塞用户请求
 *  - KV 不可用（未绑定 / 抛异常）时一律降级为「不熔断」，
 *    宁可多打一次失败的源站，也不能因为熔断组件本身故障而拒绝服务
 */

import { getKV } from '../platform/kv.js';

/** 触发熔断的失败次数阈值 */
const TRIP_THRESHOLD = 3;

/** 熔断计数器的存活时间（秒），到期后自动恢复 */
const COUNTER_TTL = 60;

/**
 * L1 内存缓存：熔断计数是「60s 内连续失败」的启发式计数，对跨 isolate 一致性
 * 无要求，因此用 isolate 内存缓存即可，避免每个请求对每个源站各读一次 KV。
 * 这是数据面热路径上最大的 KV 读放大源——加这一层后，单请求 KV 读从
 * (1 global + 1 site + N hc) 降到 (1 global + 1 site + 0 hc)。
 */
const _hcMem = new Map();
const HC_TTL_MS = COUNTER_TTL * 1000;

/**
 * 读取内存中的熔断计数（不命中返回 undefined）。
 * @param {string} key KV key
 * @returns {number|undefined} 缓存的计数，过期或缺失为 undefined
 */
function hcMemGet(key) {
  const hit = _hcMem.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expireAt) {
    _hcMem.delete(key);
    return undefined;
  }
  return hit.count;
}

/**
 * 写入内存中的熔断计数。
 * @param {string} key KV key
 * @param {number} count 计数
 */
function hcMemSet(key, count) {
  _hcMem.set(key, { count, expireAt: Date.now() + HC_TTL_MS });
}

/**
 * 删除内存中的熔断计数。
 * @param {string} key KV key
 */
function hcMemDel(key) {
  _hcMem.delete(key);
}

/**
 * 生成熔断计数器的 KV key。
 *
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {string} KV key
 */
function hcKey(poolId, originId) {
  return `hc:${poolId}:${originId}`;
}

/**
 * 判断某个源站当前是否处于熔断状态。
 *
 * 这是负载均衡选源路径上的同步依赖，必须快且绝不抛异常。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {Promise<boolean>} true 表示已熔断，应跳过该源站
 */
export async function isTripped(ctx, poolId, originId) {
  const kv = safeGetKV(ctx);
  if (!kv) return false; // 降级：无 KV 则从不熔断

  try {
    // 先查 L1 内存缓存，命中则省去一次 KV 读
    const cached = hcMemGet(hcKey(poolId, originId));
    if (cached !== undefined) return cached >= TRIP_THRESHOLD;

    const raw = await kv.get(hcKey(poolId, originId));
    if (raw === null || raw === undefined) return false;
    const count = parseInt(raw, 10);
    if (Number.isFinite(count)) hcMemSet(hcKey(poolId, originId), count);
    return count >= TRIP_THRESHOLD;
  } catch {
    // KV 读取异常同样降级为不熔断
    return false;
  }
}

/**
 * 记录一次源站失败。
 *
 * 采用「读-改-写」的计数方式。注意这在并发下不是原子的，可能少计几次，
 * 但熔断本身是启发式的，轻微误差可以接受，换来的是实现简单、零额外依赖。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {Promise<void>}
 */
export async function recordFailure(ctx, poolId, originId) {
  const kv = safeGetKV(ctx);
  if (!kv) return;

  // 放进后台任务，不阻塞主流程
  ctx.waitUntil(
    (async () => {
      try {
        const key = hcKey(poolId, originId);
        const raw = await kv.get(key);
        const prev = parseInt(raw, 10);
        const next = (Number.isFinite(prev) ? prev : 0) + 1;
        // 同步更新内存缓存，避免同一 isolate 内后续请求重复读 KV
        hcMemSet(key, next);
        // 每次写入都重置 TTL：只要还在持续失败，熔断状态就一直续期
        await kv.put(key, String(next), { expirationTtl: COUNTER_TTL });
      } catch {
        // 熔断记录失败不影响用户请求，静默忽略
      }
    })()
  );
}

/**
 * 记录一次源站成功，立即清除失败计数。
 *
 * 只要有一次成功就完全清零，避免「偶发抖动」累积成熔断。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {Promise<void>}
 */
export async function recordSuccess(ctx, poolId, originId) {
  const kv = safeGetKV(ctx);
  if (!kv) return;

  ctx.waitUntil(
    (async () => {
      try {
        const key = hcKey(poolId, originId);
        hcMemDel(key);
        await kv.delete(key);
      } catch {
        // 同上，静默忽略
      }
    })()
  );
}

/**
 * 安全地获取 KV 实例，任何异常都返回 null。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Object|null} KVLike 或 null
 */
function safeGetKV(ctx) {
  try {
    return getKV(ctx.env) || null;
  } catch {
    return null;
  }
}
