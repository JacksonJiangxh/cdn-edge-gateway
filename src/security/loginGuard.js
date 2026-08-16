/**
 * ============================================================================
 * security/loginGuard.js —— 登录防暴力破解 / 防盗刷
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 按客户端 IP 统计登录失败次数，达到阈值后临时锁定
 *   2. 恒定响应延迟，抹平「用户名/密码是否正确」的时序差异
 *   3. 三平台统一的客户端 IP 提取
 *
 * 存储策略（2026-08 修订）：纯 isolate 内存，零 KV 读写。
 *   设计约束：只有用户通过控制台修改配置才允许写 KV，运行期其余一律只读。
 *   因此登录失败计数改为内存维护，单实例有效、不跨 isolate 共享。
 *
 * 可用性设计：内存计数永不失败，始终可用；无 KV 依赖。
 *   说明：跨实例不共享意味着同一 IP 在不同 isolate 上各自计数，但由于 CF/EO
 *   会强制覆写真实客户端 IP，同一来访者通常落在同区域实例，单实例优先见顶，
 *   对暴力破解仍有实际阻拦效果。
 * ============================================================================
 */

// ============================================================================
// 常量
// ============================================================================

/** 允许的最大连续失败次数，达到即锁定。 */
const MAX_FAILURES = 5;

/** 锁定 / 计数窗口时长（秒），仅用于内存记录到期清理。 */
const LOCK_TTL_SEC = 900;

/** 恒定响应最小耗时（毫秒），用于抹平时序差异。 */
const CONSTANT_DELAY_MS = 500;

/** 内存记录 kv：key = ip，value = { n, until }，到达 LOCK_TTL_SEC 后随访问清理。 */
const _memLock = new Map();

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
 * 读取当前失败记录（纯内存，零 KV）。
 * 存储格式为 `{ n: 失败次数, until: 锁定到期时间戳(ms) }`。
 * 过期记录（until < now）自动清理并返回清零。
 * @param {string} ip 客户端 IP
 * @returns {{n:number, until:number}} 失败记录
 */
function readRecord(ip) {
  const rec = _memLock.get(ip);
  if (!rec) return { n: 0, until: 0 };
  if (rec.until <= Date.now()) {
    _memLock.delete(ip);
    return { n: 0, until: 0 };
  }
  return { n: Number(rec.n) || 0, until: Number(rec.until) || 0 };
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
  // 纯内存判定：跨 isolate 不共享，单实例有效。
  const rec = readRecord(ip);
  if (rec.n < MAX_FAILURES) {
    return { allowed: true, retryAfter: 0, failures: rec.n };
  }

  // 已达阈值：计算剩余锁定时间
  const now = Date.now();
  let remain = rec.until > now ? Math.ceil((rec.until - now) / 1000) : 0;
  // until 缺失时按整窗口兜底，避免返回 0 导致前端误判为已解锁
  if (remain <= 0) remain = LOCK_TTL_SEC;

  return { allowed: false, retryAfter: remain, failures: rec.n };
}

/**
 * 记录一次登录失败：内存计数 +1，并刷新锁定到期时间为 900 秒后。
 * 纯内存操作，无 KV 读写。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} ip 客户端 IP
 * @returns {Promise<number>} 更新后的失败次数
 */
export async function recordLoginFailure(ctx, ip) {
  const rec = readRecord(ip);
  const next = rec.n + 1;
  const until = Date.now() + LOCK_TTL_SEC * 1000;
  _memLock.set(ip, { n: next, until });
  return next;
}

/**
 * 登录成功后清除该 IP 的失败计数（内存，零 KV）。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} ip 客户端 IP
 * @returns {Promise<void>}
 */
export async function recordLoginSuccess(ctx, ip) {
  _memLock.delete(ip);
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
