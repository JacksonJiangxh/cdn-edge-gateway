/**
 * ============================================================================
 * utils/response.js —— 统一响应构造工具
 * ----------------------------------------------------------------------------
 * 严格遵循 contracts.js 第五节的约定：
 *   成功  { ok: true,  data: any }
 *   失败  { ok: false, error: { code: string, message: string } }
 *
 * 所有 API 响应都必须经由本模块构造，禁止在 handler 里手搓 new Response(JSON...)，
 * 以保证前端只需处理一种信封格式。
 *
 * 注意：本模块只负责「API 管理面」的响应；数据面（回源代理）的响应
 * 由 proxy/ 直接透传源站 Response，不走这里。
 * ============================================================================
 */

import { ERROR_CODES } from '../contracts.js';
import { normalizeError } from './errors.js';
import { REQUEST_ID_HEADER } from './reqid.js';

/** JSON 响应的 Content-Type */
const CT_JSON = 'application/json; charset=utf-8';

/** 纯文本响应的 Content-Type */
const CT_TEXT = 'text/plain; charset=utf-8';

/**
 * 管理面响应的通用安全头。
 * 管理面不应被缓存（含敏感配置），也不应被第三方嵌套。
 */
const BASE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

/**
 * 错误码 → 默认 HTTP 状态码映射。
 * 调用 fail() 时若不显式传 status，就按这里推导。
 * @type {Readonly<Record<string, number>>}
 */
const CODE_STATUS = Object.freeze({
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.BAD_REQUEST]: 400,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.RATE_LIMITED]: 429,
  [ERROR_CODES.INTERNAL]: 500,
  [ERROR_CODES.STORAGE_UNAVAILABLE]: 503,
});

/**
 * 合并额外响应头到基础头之上。
 * @param {Record<string,string>|Headers} [extra] 额外头
 * @param {string} contentType Content-Type 值
 * @returns {Headers} 合并后的 Headers
 */
function buildHeaders(extra, contentType) {
  const h = new Headers(BASE_HEADERS);
  h.set('Content-Type', contentType);
  if (extra) {
    // 支持传入 Headers 实例或普通对象
    if (typeof extra.forEach === 'function' && !Array.isArray(extra)) {
      extra.forEach((v, k) => h.set(k, v));
    } else {
      for (const k of Object.keys(extra)) {
        const v = extra[k];
        if (v != null) h.set(k, String(v));
      }
    }
  }
  return h;
}

/**
 * 安全序列化：避免循环引用导致整个请求 500。
 * @param {any} value 待序列化值
 * @returns {string} JSON 字符串
 */
function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    // 循环引用等异常场景，降级为错误信封而不是抛出
    return JSON.stringify({
      ok: false,
      error: { code: ERROR_CODES.INTERNAL, message: '响应序列化失败' },
    });
  }
}

/**
 * 构造一个 JSON 响应（不套 ok/data 信封，原样输出 data）。
 * 一般不直接用，除非需要返回非标准结构（如给第三方的 webhook 回执）。
 *
 * @param {any} data 任意可序列化数据
 * @param {number} [status=200] HTTP 状态码
 * @param {Record<string,string>} [headers] 额外响应头
 * @returns {Response} JSON 响应
 *
 * @example
 * return json({ hello: 'world' });
 */
export function json(data, status = 200, headers) {
  return new Response(safeStringify(data), {
    status,
    headers: buildHeaders(headers, CT_JSON),
  });
}

/**
 * 构造成功响应：`{ ok: true, data }`。
 *
 * @param {any} [data=null] 业务数据
 * @param {number} [status=200] HTTP 状态码
 * @param {Record<string,string>} [headers] 额外响应头
 * @returns {Response} 成功响应
 *
 * @example
 * return ok({ sites: [...] });
 * return ok(null);            // 无返回体的写操作
 */
export function ok(data = null, status = 200, headers) {
  return json({ ok: true, data }, status, headers);
}

/**
 * 构造失败响应：`{ ok: false, error: { code, message } }`。
 *
 * @param {string} code 错误码，应取自 contracts.js 的 ERROR_CODES
 * @param {string} [message] 面向用户的错误描述
 * @param {number} [status] HTTP 状态码；缺省时按 code 自动推导，未知 code 用 400
 * @param {Record<string,string>} [headers] 额外响应头
 * @returns {Response} 失败响应
 *
 * @example
 * return fail(ERROR_CODES.NOT_FOUND, '站点不存在');
 * return fail(ERROR_CODES.RATE_LIMITED, '请求过于频繁', 429, { 'Retry-After': '60' });
 */
export function fail(code, message, status, headers) {
  const finalCode = typeof code === 'string' && code !== '' ? code : ERROR_CODES.INTERNAL;
  const finalStatus =
    typeof status === 'number' && status >= 100 && status <= 599
      ? status
      : (CODE_STATUS[finalCode] ?? 400);
  const finalMessage =
    typeof message === 'string' && message !== '' ? message : finalCode;
  return json(
    { ok: false, error: { code: finalCode, message: finalMessage } },
    finalStatus,
    headers
  );
}

/**
 * 由一个（可能是任意类型的）异常构造失败响应。
 *
 * 这是 handler 层捕获异常后的**唯一**正确出口：
 *   - expose=true  → 回传脱敏后的真实原因
 *   - expose=false → 对外统一「服务器内部错误」，真实原因只进日志
 *   - 带 reqId 时随响应体与 X-Request-Id 头下发，便于用户报障定位
 *
 * @param {unknown} err 任意抛出物
 * @param {Object} [opts]
 * @param {string} [opts.reqId] 请求追踪 ID
 * @param {Record<string,string>} [opts.headers] 额外响应头
 * @returns {Response} 失败响应
 *
 * @example
 * try { ... } catch (err) { return failFrom(err, { reqId: ctx.reqId }); }
 */
export function failFrom(err, opts = {}) {
  const appErr = normalizeError(err);
  const reqId = opts.reqId;

  const body = {
    ok: false,
    error: {
      code: appErr.code,
      message: appErr.publicMessage(),
    },
  };
  if (reqId) body.error.requestId = reqId;

  const headers = { ...(opts.headers || {}) };
  if (reqId) headers[REQUEST_ID_HEADER] = reqId;

  return json(body, appErr.status, headers);
}

/**
 * 构造纯文本响应。
 *
 * @param {string} str 文本内容
 * @param {number} [status=200] HTTP 状态码
 * @param {Record<string,string>} [headers] 额外响应头
 * @returns {Response} 文本响应
 *
 * @example
 * return text('OK');
 */
export function text(str, status = 200, headers) {
  return new Response(str == null ? '' : String(str), {
    status,
    headers: buildHeaders(headers, CT_TEXT),
  });
}

/**
 * 构造 HTML 响应（管理面页面用）。
 *
 * @param {string} html HTML 内容
 * @param {number} [status=200] HTTP 状态码
 * @param {Record<string,string>} [headers] 额外响应头
 * @returns {Response} HTML 响应
 */
export function html(html, status = 200, headers) {
  return new Response(html == null ? '' : String(html), {
    status,
    headers: buildHeaders(headers, 'text/html; charset=utf-8'),
  });
}

/**
 * 404 快捷方式。
 * @param {string} [message='资源不存在'] 错误描述
 * @returns {Response} 404 响应
 */
export function notFound(message = '资源不存在') {
  return fail(ERROR_CODES.NOT_FOUND, message, 404);
}

/**
 * 401 快捷方式。
 * 带上 WWW-Authenticate 会触发浏览器原生弹窗，管理面用的是 Bearer Token，
 * 因此这里刻意不带该头，由前端自行跳转登录页。
 * @param {string} [message='未认证或登录已过期'] 错误描述
 * @returns {Response} 401 响应
 */
export function unauthorized(message = '未认证或登录已过期') {
  return fail(ERROR_CODES.UNAUTHORIZED, message, 401);
}

/**
 * 403 快捷方式。
 * @param {string} [message='无权访问'] 错误描述
 * @returns {Response} 403 响应
 */
export function forbidden(message = '无权访问') {
  return fail(ERROR_CODES.FORBIDDEN, message, 403);
}

/**
 * 400 快捷方式。支持把 schema 校验产生的 errors 数组拼进 message。
 * @param {string|string[]} [message='请求参数有误'] 错误描述或错误列表
 * @returns {Response} 400 响应
 */
export function badRequest(message = '请求参数有误') {
  const msg = Array.isArray(message) ? message.join('; ') : message;
  return fail(ERROR_CODES.BAD_REQUEST, msg, 400);
}

/**
 * 500 快捷方式。
 * 生产环境不应把原始异常栈暴露给前端，因此只接受一个安全的描述字符串。
 * @param {string} [message='服务器内部错误'] 错误描述
 * @returns {Response} 500 响应
 */
export function internal(message = '服务器内部错误') {
  return fail(ERROR_CODES.INTERNAL, message, 500);
}

/**
 * 204 无内容响应。
 * @returns {Response} 204 响应
 */
export function noContent() {
  return new Response(null, { status: 204, headers: new Headers(BASE_HEADERS) });
}

/**
 * 302/301 重定向。
 * @param {string} location 目标地址
 * @param {number} [status=302] 301 或 302
 * @returns {Response} 重定向响应
 */
export function redirect(location, status = 302) {
  const h = new Headers(BASE_HEADERS);
  h.set('Location', location);
  return new Response(null, { status: status === 301 ? 301 : 302, headers: h });
}

/**
 * 处理 CORS 预检请求。管理面 API 默认同源，仅在显式配置时开放跨域。
 * @param {string} [origin='*'] 允许的来源
 * @returns {Response} 204 预检响应
 */
export function preflight(origin = '*') {
  const h = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
  });
  return new Response(null, { status: 204, headers: h });
}
