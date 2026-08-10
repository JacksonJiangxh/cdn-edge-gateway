/**
 * ============================================================================
 * security/loginGuard.js —— 登录防暴力破解 / 防盗刷
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 按客户端 IP 统计登录失败次数，达到阈值后临时锁定
 *   2. 恒定响应延迟，抹平「用户名/密码是否正确」的时序差异
 *   3. 三平台统一的客户端 IP 提取
 *
 * 可用性设计（重要）：
 *   KV 不可用（未绑定 / 超配额 / 网络抖动）时，一律**降级为放行**并记录警告。
 *   理由：登录防护属于「附加安全层」，真正的第一道防线是密码本身。
 *   如果因为 KV 挂掉就锁死所有人，等于把一个可用性故障放大成完全的拒绝服务，
 *   而攻击者本来就能通过打爆 KV 来触发这种「fail-closed」的自我 DoS。
 * ============================================================================
 */

import { getKV } from '../platform/kv.js';

// ============================================================================
// 常量
// ============================================================================

/** 允许的最大连续失败次数，达到即锁定。 */
const MAX_FAILURES = 5;

/** 锁定 / 计数窗口时长（秒）。 */
const LOCK_TTL_SEC = 900;

/** 恒定响应最小耗时（毫秒），用于抹平时序差异。 */
const CONSTANT_DELAY_MS = 500;

/** KV 键前缀，契约规定为 `lock:{ip}`。 */
const LOCK_KEY_PREFIX = 'lock:';

// ============================================================================
// 客户端 IP 提取
// ============================================================================

/**
 * 提取客户端真实 IP，兼容三个平台。
 *
 * 优先级：
 *   1. `CF-Connecting-IP`  —— Cloudflare Workers / Pages，由边缘强制覆写，可信
 *   2. `EO-Connecting-IP`  —— 腾讯云 EdgeOne Pages，同样由边缘覆写，可信
 *   3. `X-Forwarded-For`   —— 取第一段（最靠近客户端的一跳）
 *   4. `X-Real-IP`         —— 部分反代场景
 *
 * 【安全提示】3、4 两项是客户端可伪造的。CF/EO 会强制覆写前两项，因此一旦命中
 * 即可信；但在 unknown 平台上，攻击者只需给每次请求换一个随机 X-Forwarded-For，
 * 就能让登录失败计数永远落在不同的 KV 键上，从而完全绕过锁定、无限次暴力破解。
 *
 * 因此本函数区分「可信来源」与「不可信来源」：调用方传入 trustProxyHeaders=false
 * 时（默认），不接受 XFF / X-Real-IP，直接返回 'unknown'。所有 IP 未知的请求会
 * 共用同一个计数桶，宁可误伤（多个用户共享锁定额度）也不放过暴力破解。
 * 自建反代且确认上游会覆写 XFF 时，可显式传 true 恢复旧行为。
 *
 * @param {Request} request 客户端请求（不可信输入）
 * @param {{trustProxyHeaders?: boolean}} [opts] 是否信任代理头
 * @returns {string} 客户端 IP；无法确定时返回 'unknown'
 *
 * @example
 * const ip = getClientIp(ctx.request); // "1.2.3.4"
 */
export function getClientIp(request, opts) {
  try {
    if (!request || !request.headers) return 'unknown';
    const h = request.headers;

    // —— 可信来源：由边缘平台强制覆写，客户端无法伪造 ——
    const cf = h.get('CF-Connecting-IP');
    if (cf) return sanitizeIp(cf);

    const eo = h.get('EO-Connecting-IP');
    if (eo) return sanitizeIp(eo);

    // —— 不可信来源：仅在调用方显式声明信任上游代理时才采用 ——
    if (opts && opts.trustProxyHeaders === true) {
      const xff = h.get('X-Forwarded-For');
      if (xff) {
        const first = xff.split(',')[0];
        if (first && first.trim()) return sanitizeIp(first);
      }

      const xri = h.get('X-Real-IP');
      if (xri) return sanitizeIp(xri);
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * 清洗 IP 字符串：去空白、去 IPv6 方括号、截断长度、剔除不安全字符。
 * 因为 IP 会被拼进 KV key，必须防止注入非法字符污染键空间。
 * @param {string} raw 原始值
 * @returns {string} 清洗后的 IP
 */
function sanitizeIp(raw) {
  const s = String(raw).trim().replace(/^\[|\]$/g, '');
  // 只保留 IPv4/IPv6 合法字符集
  const cleaned = s.replace(/[^0-9a-fA-F.:]/g, '');
  if (!cleaned) return 'unknown';
  return cleaned.slice(0, 45).toLowerCase();
}

// ============================================================================
// 内部工具
// ============================================================================

/**
 * 构造锁定键。
 * @param {string} ip 客户端 IP
 * @returns {string} KV key
 */
function lockKey(ip) {
  return `${LOCK_KEY_PREFIX}${ip || 'unknown'}`;
}

/**
 * 统一的降级告警输出。KV 不可用时只记录，不影响主流程。
 * @param {string} action 触发降级的动作名
 * @param {any} [err] 可选错误对象
 * @returns {void}
 */
function warnDegraded(action, err) {
  try {
    // 只输出到运行时日志，不会进入 HTTP 响应，因此不存在信息泄露
    console.warn(`[loginGuard] KV 不可用，降级放行：${action}`, err ? String(err && err.message || err) : '');
  } catch {
    /* ignore */
  }
}

/**
 * 读取当前失败记录。
 * 存储格式为 JSON：`{ n: 失败次数, until: 锁定到期时间戳(ms) }`。
 * 兼容纯数字的旧格式。
 * @param {any} kv KV 实例
 * @param {string} ip 客户端 IP
 * @returns {Promise<{n:number, until:number}>} 失败记录
 */
async function readRecord(kv, ip) {
  const raw = await kv.get(lockKey(ip));
  if (raw == null) return { n: 0, until: 0 };

  if (typeof raw === 'object') {
    return { n: Number(raw.n) || 0, until: Number(raw.until) || 0 };
  }
  const text = String(raw).trim();
  if (/^\d+$/.test(text)) {
    return { n: parseInt(text, 10), until: 0 };
  }
  try {
    const obj = JSON.parse(text);
    return { n: Number(obj.n) || 0, until: Number(obj.until) || 0 };
  } catch {
    return { n: 0, until: 0 };
  }
}

// ============================================================================
// 对外接口
// ============================================================================

/**
 * 检查该 IP 当前是否被允许尝试登录。
 *
 * KV 不可用时返回 `{ allowed: true, degraded: true }`（降级放行）。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} ip 客户端 IP
 * @returns {Promise<{allowed:boolean, retryAfter:number, failures:number, degraded?:boolean}>}
 *          allowed=false 时 retryAfter 为剩余锁定秒数
 *
 * @example
 * const gate = await checkLoginAllowed(ctx, getClientIp(ctx.request));
 * if (!gate.allowed) return fail('RATE_LIMITED', `请 ${gate.retryAfter}s 后重试`, 429);
 */
export async function checkLoginAllowed(ctx, ip) {
  try {
    const kv = getKV(ctx && ctx.env);
    if (!kv) {
      warnDegraded('checkLoginAllowed: 无 KV 绑定');
      return { allowed: true, retryAfter: 0, failures: 0, degraded: true };
    }

    const rec = await readRecord(kv, ip);
    if (rec.n < MAX_FAILURES) {
      return { allowed: true, retryAfter: 0, failures: rec.n };
    }

    // 已达阈值：计算剩余锁定时间
    const now = Date.now();
    let remain = rec.until > now ? Math.ceil((rec.until - now) / 1000) : 0;
    // until 缺失（旧格式）时按整窗口兜底，避免返回 0 导致前端误判为已解锁
    if (remain <= 0) remain = LOCK_TTL_SEC;

    return { allowed: false, retryAfter: remain, failures: rec.n };
  } catch (err) {
    warnDegraded('checkLoginAllowed', err);
    return { allowed: true, retryAfter: 0, failures: 0, degraded: true };
  }
}

/**
 * 记录一次登录失败：计数 +1，并刷新 TTL 为 900 秒。
 *
 * 注意这是 read-modify-write，KV 最终一致性下高并发可能少计几次；
 * 对于「阻挡暴力破解」这个目标，少计几次完全可以接受 —— 攻击者
 * 依然会在极短时间内触顶阈值。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} ip 客户端 IP
 * @returns {Promise<number>} 更新后的失败次数；降级时返回 0
 */
export async function recordLoginFailure(ctx, ip) {
  try {
    const kv = getKV(ctx && ctx.env);
    if (!kv) {
      warnDegraded('recordLoginFailure: 无 KV 绑定');
      return 0;
    }

    const rec = await readRecord(kv, ip);
    const next = rec.n + 1;
    const until = Date.now() + LOCK_TTL_SEC * 1000;

    await kv.put(lockKey(ip), JSON.stringify({ n: next, until }), {
      expirationTtl: LOCK_TTL_SEC,
    });
    return next;
  } catch (err) {
    warnDegraded('recordLoginFailure', err);
    return 0;
  }
}

/**
 * 登录成功后清除该 IP 的失败计数。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} ip 客户端 IP
 * @returns {Promise<void>}
 */
export async function recordLoginSuccess(ctx, ip) {
  try {
    const kv = getKV(ctx && ctx.env);
    if (!kv) return;
    await kv.delete(lockKey(ip));
  } catch (err) {
    warnDegraded('recordLoginSuccess', err);
  }
}

/**
 * 恒定延迟：保证从 `startedAt` 起算，本次登录处理总耗时不少于 500ms。
 *
 * 目的是抹平「密码校验提前返回」与「跑完完整 PBKDF2」之间的时间差，
 * 防止攻击者通过响应耗时推断用户名是否存在、密码前缀是否正确等信息。
 *
 * @param {number} [startedAt] 处理开始时间戳（Date.now()）；缺省则等满 500ms
 * @returns {Promise<void>}
 *
 * @example
 * const t0 = Date.now();
 * ... // 校验密码
 * await constantDelay(t0);
 * return resp;
 */
export async function constantDelay(startedAt) {
  const begin = Number.isFinite(startedAt) ? startedAt : Date.now();
  const elapsed = Date.now() - begin;
  const remain = CONSTANT_DELAY_MS - elapsed;
  if (remain > 0) {
    await new Promise((r) => setTimeout(r, remain));
  }
}

/** 导出常量供管理后台展示与其他模块复用。 */
export const LOGIN_GUARD_LIMITS = Object.freeze({
  maxFailures: MAX_FAILURES,
  lockTtlSec: LOCK_TTL_SEC,
  constantDelayMs: CONSTANT_DELAY_MS,
});
