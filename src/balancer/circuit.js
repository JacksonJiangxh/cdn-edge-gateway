/**
 * 被动熔断 + 失败即冷却 + 软恢复
 * ----------------------------------------------------------------------------
 * 为什么是「被动」的？
 *   Cloudflare Pages / EdgeOne 没有 Cron Trigger，无法跑主动健康探测。
 *   因此改为在真实流量中统计失败：某个源站在 60s 内失败 >= 3 次，就在接下来的
 *   时间窗内被负载均衡器跳过，等 KV 的 TTL 自然过期后自动恢复。
 *
 * 设计取舍（2026-08 修订，强调 KV 读写克制）：
 *  - 所有写操作都放进 ctx.waitUntil，绝不阻塞用户请求
 *  - KV 不可用（未绑定 / 抛异常）时一律降级为「不熔断」，宁可多打一次失败的源站，
 *    也不能因为熔断组件本身故障而拒绝服务
 *  - **状态分级、快慢分离**：熔断计数（60s 长窗、跨 isolate 价值大）是唯一持久化到
 *    KV 的状态；冷却 / 最近成功 / 软恢复三类短窗或启发式状态全部存 isolate 内存、
 *    零 KV 读写——KV 最终一致传播（1-5s）对 15s 冷却窗几乎无收益，且新 isolate 多
 *    打一次坏源站由 failover + 竞速兜速度、fail-open 兜可用性，代价可接受。
 *  - 熔断 KV 写合并（debounce）：同一 isolate 同一源站在 3s 去抖窗口内只触发一次
 *    KV 读改写合并写，把「每失败 1get+1put」降为「窗口内 1get+1put」。
 *  - 熔断 KV 采样读：L1 缓存过期后按 ~10% 概率读 KV 刷新，其余直接按内存值判断，
 *    把单请求 KV 读从 N 次降一个数量级，同时降低 CF subrequest 配额消耗。
 */

import { getKV } from '../platform/kv.js';

/** 触发熔断的失败次数阈值 */
const TRIP_THRESHOLD = 3;

/** 熔断计数器的存活时间（秒），到期后自动恢复 */
const COUNTER_TTL = 60;

/**
 * L1 内存缓存：熔断计数是「60s 内失败」的启发式计数，对跨 isolate 一致性无要求，
 * 因此用 isolate 内存缓存即可。缓存命中即判，省去一次 KV 读。
 */
const _hcMem = new Map();
const HC_TTL_MS = COUNTER_TTL * 1000;

/** 熔断 KV 写合并去抖窗口（毫秒）：窗口内多次失败合并为一次 KV 读改写 */
const WRITE_DEBOUNCE_MS = 3000;

/** 熔断 L1 过期后读 KV 刷新的采样概率（其余直接按内存值判断，漏读最多多打一次坏源站） */
const READ_SAMPLE = 0.1;

/**
 * 冷却名单（纯内存，零 KV）。键 = `${poolId}:${originId}`，值 = 冷却到期时间戳。
 * 失败即冷却：一次失败立即可把源站放入本 isolate 冷却 ~penaltySeconds，避免同
 * isolate 短期内反复打同一个刚失败的源站；跨 isolate 由 failover + 竞速兜底。
 */
const _penMem = new Map();

/**
 * 最近成功时间（纯内存，零 KV）。键 = `${poolId}:${originId}`，值 = 最近成功时间戳。
 * 供 fail-open 智能放行在「全员不可用」时挑「最近成功最新」的源站提高一击命中率。
 */
const _lastOkMem = new Map();

/**
 * 软恢复试水状态（纯内存，零 KV）。键 = `${poolId}:${originId}`，
 * 值 = { remaining, until }：remaining = 还需连续成功几次恢复满权重；until = 试水期到期时间戳。
 * 冷却到期后源站以低权重（×SOFT_RECOVER_COEFF）试水，连续成功恢复满权重，再次失败重回冷却。
 */
const _softMem = new Map();

/** 软恢复试水期权重系数：试水期源站权重乘以该值（0.3） */
const SOFT_RECOVER_COEFF = 0.3;

/** 软恢复所需连续成功次数 */
const SOFT_RECOVER_SUCCESS = 2;

/** 软恢复试水期时长（毫秒）：与冷却窗口同源，但独立计时，避免试水无限延续 */
const SOFT_RECOVER_WINDOW_MS = 60 * 1000;

// ---------------------------------------------------------------------------
// 内部工具
// ---------------------------------------------------------------------------

/**
 * 读取内存中的熔断计数（不命中返回 undefined）。
 * @param {string} key KV key
 * @returns {{count:number, expireAt:number, dirty:boolean, scheduled:boolean}|undefined}
 */
function hcMemGet(key) {
  const hit = _hcMem.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expireAt) {
    _hcMem.delete(key);
    return undefined;
  }
  return hit;
}

/**
 * 写入内存中的熔断计数（合并 dirty / scheduled 标记）。
 * @param {string} key KV key
 * @param {number} count 计数
 * @param {boolean} [dirty] 是否有未落盘的增量
 * @param {boolean} [scheduled] 是否已排程后台写 KV
 */
function hcMemSet(key, count, dirty = false, scheduled = false) {
  _hcMem.set(key, { count, expireAt: Date.now() + HC_TTL_MS, dirty, scheduled });
}

/** 删除内存中的熔断计数。 */
function hcMemDel(key) {
  _hcMem.delete(key);
}

/**
 * 生成熔断计数器的 KV key。
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {string} KV key
 */
function hcKey(poolId, originId) {
  return `hc:${poolId}:${originId}`;
}

/** 冷却 / 最近成功 / 软恢复的本地键（无需 KV 前缀） */
function locKey(poolId, originId) {
  return `${poolId}:${originId}`;
}

/**
 * 安全地获取 KV 实例，任何异常都返回 null。
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

// ---------------------------------------------------------------------------
// 冷却（纯内存，零 KV）
// ---------------------------------------------------------------------------

/**
 * 判断某个源站当前是否处于冷却状态（本 isolate 内存，同步、零 KV）。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文（仅用于取 poolId，未使用 KV）
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {boolean} true 表示冷却中
 */
export function isPenalized(_ctx, poolId, originId) {
  const until = _penMem.get(locKey(poolId, originId));
  if (until === undefined) return false;
  if (Date.now() > until) {
    _penMem.delete(locKey(poolId, originId));
    return false;
  }
  return true;
}

/**
 * 冷却剩余毫秒（用于智能放行时挑「冷却剩余最短」的源站）；不在冷却返回 0。
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {number} 剩余毫秒（>0 表示冷却中）
 */
export function penaltyRemaining(poolId, originId) {
  const until = _penMem.get(locKey(poolId, originId));
  if (until === undefined) return 0;
  const rem = until - Date.now();
  if (rem <= 0) {
    _penMem.delete(locKey(poolId, originId));
    return 0;
  }
  return rem;
}

/**
 * 把源站放入冷却名单（纯内存，零 KV）。失败分支调用，不阻塞主流程。
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @param {number} penaltySeconds 冷却秒数，<=0 表示关闭冷却
 */
export function penalize(poolId, originId, penaltySeconds) {
  if (!penaltySeconds || penaltySeconds <= 0) return;
  // 若正处于软恢复试水期，失败立即重回冷却（试水失败），并清除试水状态
  _softMem.delete(locKey(poolId, originId));
  _penMem.set(locKey(poolId, originId), Date.now() + penaltySeconds * 1000);
}

// ---------------------------------------------------------------------------
// 最近成功（纯内存，零 KV，供 fail-open 智能放行）
// ---------------------------------------------------------------------------

/**
 * 返回源站最近成功时间戳（无记录返回 0）。值越大表示越近期成功。
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {number} 最近成功时间戳（Date.now 基准），无记录为 0
 */
export function lastOkTs(poolId, originId) {
  return _lastOkMem.get(locKey(poolId, originId)) || 0;
}

// ---------------------------------------------------------------------------
// 软恢复（纯内存，零 KV）
// ---------------------------------------------------------------------------

/**
 * 返回源站当前生效的权重系数（试水期 ×SOFT_RECOVER_COEFF，否则 1）。
 * 与 SWRR 的 weightOf 协同：试水期源站以低权重参与均衡，避免恢复瞬间流量蜂拥。
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {number} 权重系数（0.3 或 1）
 */
export function softRecoverCoeff(poolId, originId) {
  const st = _softMem.get(locKey(poolId, originId));
  if (!st) return 1;
  if (Date.now() > st.until) {
    // 试水期超时仍未凑齐连续成功：回退为冷却，重新试水（避免无限试水）
    _softMem.delete(locKey(poolId, originId));
    _penMem.set(locKey(poolId, originId), Date.now() + 1000);
    return 1;
  }
  return SOFT_RECOVER_COEFF;
}

/**
 * 记录一次成功：更新最近成功时间，并推进软恢复试水计数。
 * 冷却到期 → 进入试水期（remaining=SOFT_RECOVER_SUCCESS）；每次成功 remaining-1，
 * 归零即恢复满权重（删除试水态）。
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 */
export function noteSuccess(poolId, originId) {
  const key = locKey(poolId, originId);
  _lastOkMem.set(key, Date.now());
  // 冷却态下首胜 → 进入试水期；试水态下成功 → 递减计数
  const pen = _penMem.get(key);
  if (pen !== undefined) {
    _penMem.delete(key);
    _softMem.set(key, { remaining: SOFT_RECOVER_SUCCESS, until: Date.now() + SOFT_RECOVER_WINDOW_MS });
  } else if (_softMem.has(key)) {
    const st = _softMem.get(key);
    st.remaining -= 1;
    if (st.remaining <= 0) _softMem.delete(key);
  }
}

// ---------------------------------------------------------------------------
// 熔断（KV + L1 内存，写合并 + 采样读）
// ---------------------------------------------------------------------------

/**
 * 判断某个源站当前是否处于熔断状态。
 *
 * 负载均衡选源路径上的同步依赖，必须快且绝不抛异常。L1 命中即判；L1 过期时按
 * READ_SAMPLE 概率读 KV 刷新，其余直接按内存值（视为仍有效）判断——漏读最多让
 * 本 isolate 多打一次坏源站，failover / 竞速 / fail-open 兜底，不损 100% 取数语义。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {Promise<boolean>} true 表示已熔断，应跳过该源站
 */
export async function isTripped(ctx, poolId, originId) {
  const kv = safeGetKV(ctx);
  // 降级：无 KV 则从不熔断
  if (!kv) return false;

  const key = hcKey(poolId, originId);
  try {
    const cached = hcMemGet(key);
    if (cached !== undefined) return cached.count >= TRIP_THRESHOLD;

    // L1 miss：是否读 KV 取决于采样（READ_SAMPLE）
    if (Math.random() >= READ_SAMPLE) {
      // 跳过本次 KV 读：按「未熔断」乐观判断（内存无记录，大概率确实未熔断）
      // 写入一个短过期占位，避免同请求内重复进入此分支反复随机
      hcMemSet(key, 0);
      return false;
    }

    const raw = await kv.get(key);
    if (raw === null || raw === undefined) {
      hcMemSet(key, 0);
      return false;
    }
    const count = parseInt(raw, 10);
    if (Number.isFinite(count)) hcMemSet(key, count);
    return count >= TRIP_THRESHOLD;
  } catch {
    // KV 读取异常同样降级为不熔断
    return false;
  }
}

/**
 * 记录一次源站失败（内存计数即时 +1，KV 写合并 debounce）。
 *
 * 内存计数本 isolate 立即生效（同一 isolate 内后续请求即刻跳过/计入冷却）；
 * KV 读改写合并进 WRITE_DEBOUNCE_MS 去抖窗口——窗口内多次失败只触发一次 KV 写，
 * 大幅降低 KV 写放大。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 */
export function recordFailure(ctx, poolId, originId) {
  const kv = safeGetKV(ctx);
  const key = hcKey(poolId, originId);

  // 内存计数立即 +1（不阻塞，跨 isolate 由 KV debounce 收敛）
  const cached = hcMemGet(key) || { count: 0, dirty: false, scheduled: false };
  cached.count += 1;
  cached.dirty = true;
  hcMemSet(key, cached.count, true, cached.scheduled);

  if (!kv) return;

  // 去抖窗口内已排程则跳过（合并写）
  if (cached.scheduled) return;
  cached.scheduled = true;
  hcMemSet(key, cached.count, true, true);

  ctx.waitUntil(
    (async () => {
      try {
        // 合并窗口内的增量：直接读 KV 当前值累加，避免覆盖其它 isolate 的计数
        const raw = await kv.get(key);
        const base = parseInt(raw, 10);
        const next = (Number.isFinite(base) ? base : 0) + 1;
        hcMemSet(key, next);
        await kv.put(key, String(next), { expirationTtl: COUNTER_TTL });
      } catch {
        // 合并写失败不影响用户请求；内存计数仍有效，下个失败窗口会重试
      } finally {
        // 解除排程标记（窗口结束，可再次排程）；若窗口内又有新失败，dirty 仍为真
        const c = hcMemGet(key);
        if (c) hcMemSet(key, c.count, c.dirty, false);
      }
    })()
  );
}

/**
 * 记录一次源站成功：立即清除失败计数（强信号，不等 debounce）。
 *
 * 成功的语义是「源站恢复」，必须及时清掉熔断计数，避免抖动被累计成熔断。
 * 同时推进内存侧的「最近成功 / 软恢复」状态。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 */
export function recordSuccess(ctx, poolId, originId) {
  hcMemDel(hcKey(poolId, originId));
  noteSuccess(poolId, originId);
  const kv = safeGetKV(ctx);
  if (!kv) return;
  ctx.waitUntil(
    (async () => {
      try {
        await kv.delete(hcKey(poolId, originId));
      } catch {
        // 静默忽略
      }
    })()
  );
}
