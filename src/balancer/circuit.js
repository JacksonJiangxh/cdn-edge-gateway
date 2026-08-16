/**
 * 被动熔断 + 失败即冷却 + 软恢复
 * ----------------------------------------------------------------------------
 * 为什么是「被动」的？
 *   Cloudflare Pages / EdgeOne 没有 Cron Trigger，无法跑主动健康探测。
 *   因此改为在真实流量中统计失败：某个源站在 60s 内失败 >= 3 次，就在接下来的
 *   时间窗内被负载均衡器跳过，等计数自然过期后自动恢复。
 *
 * 存储策略（2026-08 修订）：纯 isolate 内存，零 KV 读写。
 *   设计约束：只有用户通过控制台修改配置才允许写 KV，运行期其余一律只读。
 *   因此熔断计数改为内存维护，单实例有效、不跨 isolate 共享。
 *   - 冷却 / 最近成功 / 软恢复三类短窗或启发式状态本就存 isolate 内存、零 KV 读写。
 *   - 熔断计数（60s 长窗）原持久化到 KV，现收敛为内存：单实例内 60s 窗口计数，
 *     跨实例不共享。对「少数 PoP 集中打坏源站」的真实故障场景，单实例必然见顶，
 *     仍能有效熔断；代价是多实例均分流量时各自计数可能略松动，由 failover + 竞速
 *     兜速度、fail-open 兜可用性，代价可接受。
 *   - 熔断组件永不依赖外部存储，不会因 KV 故障而拒绝服务。
 */

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
// 内部工具（纯 isolate 内存，零 KV）
// ---------------------------------------------------------------------------

/**
 * 熔断计数内存键（无需 KV 前缀）。
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {string} 内存键
 */
function hcKey(poolId, originId) {
  return `${poolId}:${originId}`;
}

/** 冷却 / 最近成功 / 软恢复的本地键（无需 KV 前缀） */
function locKey(poolId, originId) {
  return `${poolId}:${originId}`;
}

/**
 * 读取内存中的熔断计数（不命中或已过期返回 undefined）。
 * @param {string} key 内存键
 * @returns {{count:number, expireAt:number}|undefined}
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
 * 写入内存中的熔断计数。
 * @param {string} key 内存键
 * @param {number} count 计数
 */
function hcMemSet(key, count) {
  _hcMem.set(key, { count, expireAt: Date.now() + HC_TTL_MS });
}

/** 删除内存中的熔断计数。 */
function hcMemDel(key) {
  _hcMem.delete(key);
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
 * 纯 isolate 内存判定（零 KV）：60s 窗口内失败计数达到阈值即熔断。
 * 必须快且绝不抛异常，直接读内存。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 * @returns {Promise<boolean>} true 表示已熔断，应跳过该源站
 */
export async function isTripped(ctx, poolId, originId) {
  const key = hcKey(poolId, originId);
  const cached = hcMemGet(key);
  if (cached === undefined) return false;
  return cached.count >= TRIP_THRESHOLD;
}

/**
 * 记录一次源站失败：本 isolate 内存计数即时 +1。
 * 同一 isolate 内后续请求即刻判定熔断/计入冷却；跨 isolate 不共享。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} poolId 源站池 id
 * @param {string} originId 源站 id
 */
export function recordFailure(ctx, poolId, originId) {
  const key = hcKey(poolId, originId);
  const cached = hcMemGet(key) || { count: 0, expireAt: 0 };
  hcMemSet(key, cached.count + 1);
}

/**
 * 记录一次源站成功：立即清除失败计数（强信号）。
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
}
