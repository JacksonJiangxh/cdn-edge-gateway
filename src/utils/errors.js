/**
 * ============================================================================
 * utils/errors.js —— 错误类型体系与敏感信息脱敏
 * ----------------------------------------------------------------------------
 * 设计要点：
 *
 * 1. `expose` 标志决定错误详情是否可以回传给客户端。
 *    业务型错误（参数不合法、资源不存在）expose=true，直接展示；
 *    系统型错误（回源失败、KV 异常）expose=false，对外统一为「服务器内部错误」，
 *    真实原因只进日志。这是防止内部信息外泄的关键边界。
 *
 * 2. 本项目是**反向代理**，异常消息里极易混入上游地址、签名、密钥。
 *    因此即使是要落日志的消息，也先经 sanitizeMessage() 擦洗一遍。
 *
 * 3. 所有错误都带 `code`（取自 ERROR_CODES），保证前端可以按码分支处理，
 *    而不是去匹配中文文案。
 * ============================================================================
 */

import { ERROR_CODES } from '../contracts.js';

/** 对外消息的最大长度，防止超长堆栈灌进响应体 */
const MAX_MESSAGE_LEN = 220;

/**
 * 敏感信息脱敏规则。
 * 顺序有意义：先处理带键名的键值对，再处理裸露的凭证特征串。
 * @type {ReadonlyArray<[RegExp, string]>}
 */
const REDACT_RULES = Object.freeze([
  // Authorization: Bearer xxx / Basic xxx
  [/\b(bearer|basic)\s+[\w\-._~+/]+=*/gi, '$1 ***'],
  // 查询串或表单里的 token=xxx & key=xxx & secret=xxx & password=xxx & sig=xxx
  [
    /\b(token|access_token|refresh_token|api[_-]?key|apikey|secret|password|passwd|pwd|signature|sig|credential|auth)\s*[=:]\s*[^\s&;,"')]+/gi,
    '$1=***',
  ],
  // AWS / S3 Access Key ID
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA***'],
  // 预签名 URL 的签名参数
  [/\bX-Amz-(Signature|Credential|Security-Token)=[^\s&]*/gi, 'X-Amz-$1=***'],
  // JWT（三段 base64url）
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '***.jwt.***'],
  // Cookie 串
  [/\b(set-)?cookie\s*:\s*[^\n]*/gi, 'cookie: ***'],
]);

/**
 * 擦除消息中的敏感片段并截断长度。
 *
 * 注意：这是「尽力而为」的防御层，不能替代「不要把内部错误 expose 出去」这条主规则。
 *
 * @param {unknown} input 原始消息
 * @returns {string} 脱敏后的消息
 *
 * @example
 * sanitizeMessage('fetch https://up.io/a?token=abc123 failed')
 * // => 'fetch https://up.io/a?token=*** failed'
 */
export function sanitizeMessage(input) {
  if (input == null) return '';
  let s = typeof input === 'string' ? input : String(input);
  for (const [re, replacement] of REDACT_RULES) {
    s = s.replace(re, replacement);
  }
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > MAX_MESSAGE_LEN) {
    s = s.slice(0, MAX_MESSAGE_LEN - 1) + '…';
  }
  return s;
}

/**
 * 应用级错误基类。
 *
 * @example
 * throw new AppError('上游连接超时', {
 *   code: ERROR_CODES.INTERNAL, status: 502, expose: false, cause: err,
 * });
 */
export class AppError extends Error {
  /**
   * @param {string} message 错误描述（expose=false 时仅用于日志）
   * @param {Object} [opts]
   * @param {string} [opts.code] 错误码，取自 ERROR_CODES
   * @param {number} [opts.status] HTTP 状态码
   * @param {boolean} [opts.expose] 是否可将 message 回传客户端
   * @param {unknown} [opts.cause] 原始异常
   * @param {Record<string, unknown>} [opts.details] 结构化上下文（仅进日志）
   */
  constructor(message, opts = {}) {
    super(message);
    this.name = new.target.name;
    this.code = opts.code || ERROR_CODES.INTERNAL;
    this.status = typeof opts.status === 'number' ? opts.status : 500;
    this.expose = opts.expose === true;
    this.details = opts.details || null;
    if (opts.cause !== undefined) this.cause = opts.cause;
  }

  /**
   * 客户端可见的消息。不可 expose 时返回通用文案。
   * @returns {string}
   */
  publicMessage() {
    return this.expose ? sanitizeMessage(this.message) : '服务器内部错误';
  }
}

/** 400 —— 请求参数不合法（业务错误，默认可见） */
export class ValidationError extends AppError {
  constructor(message = '请求参数有误', opts = {}) {
    super(message, {
      code: ERROR_CODES.BAD_REQUEST,
      status: 400,
      expose: true,
      ...opts,
    });
  }
}

/** 401 —— 未认证 */
export class AuthenticationError extends AppError {
  constructor(message = '未登录或登录已过期', opts = {}) {
    super(message, {
      code: ERROR_CODES.UNAUTHORIZED,
      status: 401,
      expose: true,
      ...opts,
    });
  }
}

/** 403 —— 已认证但无权限 */
export class AuthorizationError extends AppError {
  constructor(message = '无权访问', opts = {}) {
    super(message, { code: ERROR_CODES.FORBIDDEN, status: 403, expose: true, ...opts });
  }
}

/** 404 —— 资源不存在 */
export class NotFoundError extends AppError {
  constructor(message = '资源不存在', opts = {}) {
    super(message, { code: ERROR_CODES.NOT_FOUND, status: 404, expose: true, ...opts });
  }
}

/** 429 —— 触发限流 */
export class RateLimitError extends AppError {
  constructor(message = '请求过于频繁', opts = {}) {
    super(message, {
      code: ERROR_CODES.RATE_LIMITED,
      status: 429,
      expose: true,
      ...opts,
    });
  }
}

/**
 * 502 —— 回源失败。
 * 默认 expose=false：上游地址、证书错误、DNS 细节都不应泄露给客户端。
 */
export class UpstreamError extends AppError {
  constructor(message = '上游服务不可用', opts = {}) {
    super(message, { code: ERROR_CODES.INTERNAL, status: 502, expose: false, ...opts });
  }
}

/** 503 —— 存储层（KV/D1）不可用，默认不 expose */
export class StorageError extends AppError {
  constructor(message = '存储服务不可用', opts = {}) {
    super(message, {
      code: ERROR_CODES.STORAGE_UNAVAILABLE,
      status: 503,
      expose: false,
      ...opts,
    });
  }
}

/**
 * 把任意抛出物归一化成 AppError。
 *
 * 非 AppError 的原生异常一律视为「系统内部错误」（expose=false），
 * 因为我们无法判断其 message 是否含敏感信息 —— 默认不可信。
 *
 * @param {unknown} err 任意抛出物
 * @returns {AppError}
 */
export function normalizeError(err) {
  if (err instanceof AppError) return err;

  if (err instanceof Error) {
    return new AppError(err.message || String(err), {
      code: ERROR_CODES.INTERNAL,
      status: 500,
      expose: false,
      cause: err,
    });
  }

  return new AppError(typeof err === 'string' ? err : '未知错误', {
    code: ERROR_CODES.INTERNAL,
    status: 500,
    expose: false,
    cause: err,
  });
}
