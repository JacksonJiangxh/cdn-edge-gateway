/**
 * ============================================================================
 * utils/reqid.js —— 请求追踪 ID
 * ----------------------------------------------------------------------------
 * 反向代理的排障强依赖「把一次请求的所有日志串起来」的能力。
 * 每个请求分配一个短 ID，同时：
 *   - 注入 ctx.reqId，供各层日志引用
 *   - 通过 X-Request-Id 响应头下发
 *   - 出错时写进错误响应体
 * 用户报障时只需提供这个 ID，即可在日志中定位完整链路。
 *
 * 优先复用上游/网关已有的追踪 ID（cf-ray 等），避免同一请求在不同系统里
 * 出现两个互不相干的 ID。
 * ============================================================================
 */

/** 响应头名称 */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/** 可复用的上游追踪头，按优先级排列 */
const INBOUND_HEADERS = Object.freeze([
  'x-request-id',
  'cf-ray', // Cloudflare
  'eo-log-uuid', // EdgeOne
  'x-amzn-trace-id',
]);

/** ID 允许的字符与最大长度（防止日志注入与超长头） */
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * 生成一个随机短 ID（12 字节 hex）。
 * crypto.randomUUID 不可用时退化到 Math.random —— 追踪 ID 不需要密码学强度。
 * @returns {string}
 */
function randomId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint8Array(12);
      crypto.getRandomValues(buf);
      return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    /* 落到下面的兜底 */
  }
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  ).slice(0, 24);
}

/**
 * 为请求解析或生成追踪 ID。
 *
 * @param {Request} [request] 客户端请求
 * @returns {string} 追踪 ID
 *
 * @example
 * ctx.reqId = resolveRequestId(request);
 */
export function resolveRequestId(request) {
  try {
    const h = request && request.headers;
    if (h) {
      for (const name of INBOUND_HEADERS) {
        const v = h.get(name);
        if (v && SAFE_ID.test(v)) return v;
      }
    }
  } catch {
    /* headers 不可用时直接生成 */
  }
  return randomId();
}
