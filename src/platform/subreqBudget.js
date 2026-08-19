/**
 * ============================================================================
 * platform/subreqBudget.js —— 每请求子请求预算守卫（isolate 级）
 * ----------------------------------------------------------------------------
 * 【为什么需要它】
 * 三平台的边缘运行时对「单个客户端请求内可发起的子请求(fetch / Cache API 操作)
 * 总数」都有硬约束，超限会被网关直接掐断（返回 5xx / 子请求耗尽错误）：
 *   - ESA  ：官方 fetchAPI「每次可发起 4 个子请求」与 Cache API「共享 32 个」两处
 *            表述冲突，本项目保守取 4（待真机实测确证）。
 *   - CF   ：Cloudflare Pages **Free 档仅 50/请求**（Paid=1000），代码无法探测档位，
 *            默认按 Free 档 50 规划最安全。
 *   - EO   ：官方文档（edge-functions SKILL「Limits」表）**未单列子请求硬上限**，
 *            但用户明确要求「给个大约数值避免无限大」，故取 100 作为免费档近似上限
 *            （非官方硬限，仅作代码层防护，防止构造型请求打爆边缘）。
 *
 * 之前 caps.maxSubRequests 只是个声明值，没有任何代码真正计数/限制。本模块把它
 * 落地为**真实的运行时预算守卫**：
 *   - 数据面每次回源 fetch、缓存 put/get/delete 都从这里「扣减」预算；
 *   - 预算耗尽时返回 false / 抛错，由调用方降级（而非盲目重试撞墙）。
 *
 * 【isolate 生命周期】
 * 子请求预算是「每客户端请求」的，但边缘运行时一次请求内跨多个模块发起 fetch，
 * 且 isolate 会复用。本项目采用「每请求上下文(ctx)独立预算 + isolate 级快照」双轨：
 *   - 主预算挂在 ctx.__subreq 上（一次请求内所有 fetch 共享）；
 *   - 若调用方没有 ctx（极少数场景），退回 isolate 级 _budget 兜底（粗粒度）。
 *
 * 【零开销契约】
 *   - 所有操作为 O(1) 数值加减，绝不 await；
 *   - 异常一律内部吞掉，绝不影响数据面主流程；
 *   - 未 init 时退化为「不限制」（向后兼容旧调用方与单测）。
 * ============================================================================
 */

/**
 * 各平台每请求子请求预算的默认上限（详见文件头）。
 * 这些不是随意的大数，而是对齐各平台免费档硬限 / 近似值的真实防护值。
 * @type {Readonly<Record<string, number>>}
 */
export const SUBREQ_LIMITS = Object.freeze({
  /** ESA：保守取 4（官方两处文档冲突待实测） */
  esa: 4,
  /** CF：对齐 Free 档硬限 50；Paid=1000 可经 MAX_SUBREQUESTS 覆盖 */
  cf: 50,
  /**
   * EO：官方未单列硬限。用户要求「给大约数值避免无限大」，取 100 作为免费档
   * 近似上限（非官方硬限，仅作代码层防护，防构造型请求打爆边缘）。
   */
  eo: 100,
});

/**
 * 读取数字型环境变量（自包含，不依赖 caps.js 以避免循环依赖与未导出符号）。
 * 兼容 worker env（getter 形式）与 Node 顶层 process.env。
 * @param {Object} [env]
 * @param {string} key
 * @returns {number|undefined}
 */
function readNumEnv(env, key) {
  let raw;
  try {
    if (env && typeof env === 'object') {
      raw = env[key];
      if (raw == null && typeof process !== 'undefined' && process.env) raw = process.env[key];
    } else if (typeof process !== 'undefined' && process.env) {
      raw = process.env[key];
    }
  } catch {
    raw = undefined;
  }
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * isolate 级兜底预算（仅当调用方未传 ctx 时使用）。
 * 每个 isolate 复用，请求结束时由 entry.js 调 resetSubreqBudget 清零。
 * @type {{limit:number, used:number}}
 */
let _budget = { limit: Infinity, used: 0 };

/** 是否已按 caps 初始化（隔离 isolate 级兜底） */
let _initialized = false;

/**
 * 读取 MAX_SUBREQUESTS 环境变量覆盖（仅对 cf / eo 生效；ESA 固定按官方保守值，
 * 不暴露覆盖以免误配冲垮 4 预算）。允许 Free→Paid 提升（如 cf 提到 1000）。
 * @param {Object} env 环境变量
 * @param {string} platform 规范平台值
 * @param {number} base 平台默认上限
 * @returns {number} 生效上限
 */
function resolveLimit(env, platform, base) {
  const override = readNumEnv(env, 'MAX_SUBREQUESTS');
  if (override == null) return base;
  // ESA 禁止覆盖（保守值待实测，误配风险高）
  if (platform === 'esa') return base;
  // 仅允许「不高于 1000」的合理范围，防误设 Infinity/负数
  return Math.min(1000, Math.max(1, Math.floor(override)));
}

/**
 * 按平台能力初始化 isolate 级兜底预算。
 * 每个 isolate 冷启动调一次；请求级预算仍挂在 ctx 上（见 attachToCtx）。
 * @param {import('../contracts.js').Caps} caps 平台能力
 * @param {Object} [env] 环境变量（用于 MAX_SUBREQUESTS 覆盖）
 * @returns {void}
 */
export function initSubreqBudget(caps, env) {
  const platform = caps && caps.platform;
  const base = SUBREQ_LIMITS[platform] ?? SUBREQ_LIMITS.eo;
  _budget = { limit: resolveLimit(env, platform, base), used: 0 };
  _initialized = true;
}

/**
 * 把预算守卫挂到请求上下文上（每请求独立计数）。
 * 若已有 ctx.__subreq 则原样复用（支持请求内多次 attach）。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {import('../contracts.js').Caps} [caps] 平台能力（缺省读 ctx.caps）
 * @returns {{limit:number, used:number}} 该请求的预算对象
 */
export function attachToCtx(ctx, caps) {
  const c = caps || (ctx && ctx.caps);
  if (!ctx) return _budget;
  if (ctx.__subreq) return ctx.__subreq;
  const platform = c && c.platform;
  const base = SUBREQ_LIMITS[platform] ?? SUBREQ_LIMITS.eo;
  const limit = resolveLimit(ctx && ctx.env, platform, base);
  ctx.__subreq = { limit, used: 0 };
  return ctx.__subreq;
}

/**
 * 取当前生效的预算对象（优先 ctx 级，否则 isolate 兜底）。
 * @param {import('../contracts.js').Ctx} [ctx]
 * @returns {{limit:number, used:number}}
 */
function activeBudget(ctx) {
  if (ctx && ctx.__subreq) return ctx.__subreq;
  if (!_initialized) {
    // 未 init 时退化为不限制，避免误伤（旧调用方 / 单测）
    return { limit: Infinity, used: 0 };
  }
  return _budget;
}

/**
 * 查询剩余预算。
 * @param {import('../contracts.js').Ctx} [ctx]
 * @returns {number} 剩余可用子请求数（Infinity 表示不限制）
 */
export function remaining(ctx) {
  const b = activeBudget(ctx);
  if (!Number.isFinite(b.limit)) return Infinity;
  return Math.max(0, b.limit - b.used);
}

/**
 * 尝试扣减 n 个子请求预算。
 * @param {number} [n=1] 欲扣减数量
 * @param {import('../contracts.js').Ctx} [ctx]
 * @returns {boolean} 扣减成功（预算充足）返回 true；不足返回 false（不扣减）
 */
export function track(n = 1, ctx) {
  const b = activeBudget(ctx);
  if (!Number.isFinite(b.limit)) return true; // 不限制模式：总是放行
  const need = Math.max(1, Math.floor(n));
  if (b.used + need > b.limit) return false;
  b.used += need;
  return true;
}

/**
 * 预判：若再发起 n 个子请求是否会超出预算（不实际扣减）。
 * 用于「预算紧张时跳过可选子请求（如缓存写）」的降级决策。
 * @param {number} [n=1] 待发起数量
 * @param {import('../contracts.js').Ctx} [ctx]
 * @returns {boolean} true 表示会超出（应降级）
 */
export function wouldExceed(n = 1, ctx) {
  const b = activeBudget(ctx);
  if (!Number.isFinite(b.limit)) return false;
  const need = Math.max(1, Math.floor(n));
  return b.used + need > b.limit;
}

/**
 * 包装一次子请求调用：先扣预算，成功/失败都算已用（子请求发出即计入平台计数，
 * 无论成功与否都占预算）。预算不足时直接抛 SubreqBudgetExhausted，由上层降级。
 *
 * @param {Function} fn 实际发起子请求的函数（如 () => fetch(...)）
 * @param {import('../contracts.js').Ctx} [ctx]
 * @param {number} [n=1] 本次占用的子请求数
 * @returns {Promise<any>} fn 的返回值
 * @throws {SubreqBudgetExhausted} 预算不足
 */
export async function guard(fn, ctx, n = 1) {
  if (!track(n, ctx)) {
    const err = new Error('subrequest budget exhausted');
    err.code = 'SUBREQ_BUDGET_EXHAUSTED';
    throw err;
  }
  try {
    return await fn();
  } catch (e) {
    // 失败也占预算（平台侧已计数），原样抛出由调用方处理
    throw e;
  }
}

/**
 * 子请求预算耗尽错误（便于上层精确识别并降级，而非盲目重试）。
 */
export class SubreqBudgetExhausted extends Error {
  constructor(msg = 'subrequest budget exhausted') {
    super(msg);
    this.name = 'SubreqBudgetExhausted';
    this.code = 'SUBREQ_BUDGET_EXHAUSTED';
  }
}

/**
 * 清零 isolate 级兜底预算。仅用于请求结束（entry.js）或测试。
 * @returns {void}
 */
export function resetSubreqBudget() {
  _budget = { limit: _initialized ? _budget.limit : Infinity, used: 0 };
}
