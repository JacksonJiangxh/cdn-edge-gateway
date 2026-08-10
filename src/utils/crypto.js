/**
 * ============================================================================
 * utils/crypto.js —— 加密工具（纯 WebCrypto 实现）
 * ----------------------------------------------------------------------------
 * 三个目标平台（CF Workers / CF Pages / EdgeOne Pages）都提供标准的
 * `crypto.subtle` 与 `crypto.getRandomValues`，因此本模块不引入任何 npm 依赖。
 *
 * 关键约束：
 *  1. 所有涉及密码学的运算都是**异步**的（WebCrypto 只有 Promise API），
 *     调用方必须 await。唯一的同步函数是 timingSafeEqual。
 *  2. CF 免费版有 CPU 时间限制（约 10ms/请求，突发可放宽）。PBKDF2 的
 *     100000 次迭代属于重计算，**只应在登录/改密时调用，绝不能放在
 *     每请求的热路径上**。热路径的鉴权请用 HMAC 签名的 token。
 *  3. 编码约定：pbkdf2 返回标准 base64；hmacSha256 返回 base64url（可安全放进
 *     URL 查询串，用于签名 URL 场景）。两者不可混用。
 * ============================================================================
 */

/** 复用的编解码器实例，避免每次调用重新构造 */
const _encoder = new TextEncoder();
const _decoder = new TextDecoder();

/**
 * 取得 WebCrypto 对象，不可用时抛出明确错误。
 * @returns {Crypto} crypto 全局对象
 */
function getCrypto() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (!c || !c.subtle) {
    throw new Error('当前运行时不支持 WebCrypto（crypto.subtle 不可用）');
  }
  return c;
}

/**
 * 把字符串编码为 Uint8Array（UTF-8）。
 * @param {string} str 输入字符串
 * @returns {Uint8Array} 字节数组
 */
function utf8(str) {
  return _encoder.encode(String(str == null ? '' : str));
}

/**
 * ArrayBuffer / TypedArray → 标准 base64。
 * 不用 btoa(String.fromCharCode(...arr)) 的展开写法——大数组会栈溢出，
 * 这里改用分块累加。
 * @param {ArrayBuffer|Uint8Array} buf 输入缓冲区
 * @returns {string} base64 字符串
 */
export function bufToBase64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000; // 32KB 一块，兼顾性能与栈安全
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * 标准 base64 → Uint8Array。
 * @param {string} b64 base64 字符串（也接受 base64url）
 * @returns {Uint8Array} 字节数组
 */
export function base64ToBuf(b64) {
  // 兼容 base64url：还原字符并补齐 padding
  let s = String(b64).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad === 2) s += '==';
  else if (pad === 3) s += '=';
  else if (pad === 1) throw new Error('非法的 base64 字符串');
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 标准 base64 → base64url（去掉 padding，替换 +/ 为 -_）。
 * @param {string} b64 标准 base64
 * @returns {string} base64url
 */
export function toBase64Url(b64) {
  return String(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * ArrayBuffer / TypedArray → 十六进制小写字符串。
 * @param {ArrayBuffer|Uint8Array} buf 输入缓冲区
 * @returns {string} hex 字符串
 */
export function bufToHex(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * PBKDF2-HMAC-SHA256 密码派生。
 *
 * 【性能警告】默认 100000 次迭代在 CF Workers 上约耗时 30~80ms CPU，
 * 只能用于登录校验和修改密码，**不要放在每个请求的鉴权路径上**。
 * 每请求鉴权请改用 hmacSha256 签发/校验的短期 token。
 *
 * @param {string} password 明文密码
 * @param {string} salt 盐值（建议用 randomHex(16) 生成并与 hash 一起存储）
 * @param {number} [iterations=100000] 迭代次数
 * @returns {Promise<string>} 派生密钥的标准 base64（256 bit / 32 字节）
 *
 * @example
 * const salt = randomHex(16);
 * const hash = await pbkdf2('mypassword', salt);
 * // 存储 { passwordHash: hash, passwordSalt: salt }
 */
export async function pbkdf2(password, salt, iterations = 100000) {
  const c = getCrypto();
  const iter = Number.isFinite(iterations) && iterations > 0 ? Math.floor(iterations) : 100000;

  const baseKey = await c.subtle.importKey('raw', utf8(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await c.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: utf8(salt),
      iterations: iter,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );
  return bufToBase64(bits);
}

/**
 * 校验密码是否与已存储的 PBKDF2 哈希匹配。
 * 内部使用恒定时间比较，避免时序侧信道。
 *
 * @param {string} password 待校验的明文密码
 * @param {string} storedHash 已存储的哈希（base64）
 * @param {string} salt 已存储的盐
 * @param {number} [iterations=100000] 迭代次数，必须与生成时一致
 * @returns {Promise<boolean>} 是否匹配
 */
export async function verifyPassword(password, storedHash, salt, iterations = 100000) {
  if (typeof storedHash !== 'string' || storedHash === '') return false;
  try {
    const computed = await pbkdf2(password, salt, iterations);
    return timingSafeEqual(computed, storedHash);
  } catch {
    return false;
  }
}

/**
 * HMAC-SHA256 签名。
 *
 * @param {string} key 密钥（HMAC secret）
 * @param {string} data 待签名数据
 * @returns {Promise<string>} 签名的 base64url 编码（无 padding，可直接放进 URL）
 *
 * @example
 * const sig = await hmacSha256(secret, `${path}:${expires}`);
 * const url = `${path}?sign=${sig}&e=${expires}`;
 */
export async function hmacSha256(key, data) {
  const c = getCrypto();
  const cryptoKey = await c.subtle.importKey(
    'raw',
    utf8(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await c.subtle.sign('HMAC', cryptoKey, utf8(data));
  return toBase64Url(bufToBase64(sig));
}

/**
 * 校验 HMAC-SHA256 签名。
 * 重新计算后做恒定时间比较（比 subtle.verify 更方便，且行为一致）。
 *
 * @param {string} key 密钥
 * @param {string} data 原始数据
 * @param {string} signature 待校验签名（base64url）
 * @returns {Promise<boolean>} 是否有效
 */
export async function verifyHmacSha256(key, data, signature) {
  if (typeof signature !== 'string' || signature === '') return false;
  try {
    const expected = await hmacSha256(key, data);
    return timingSafeEqual(expected, signature);
  } catch {
    return false;
  }
}

/**
 * SHA-256 摘要，返回十六进制小写字符串。
 * 常用于生成缓存键、ETag、统计维度的短标识。
 *
 * @param {string} str 输入字符串
 * @returns {Promise<string>} 64 字符的 hex 摘要
 *
 * @example
 * const key = await sha256Hex(`${host}:${path}`);
 */
export async function sha256Hex(str) {
  const c = getCrypto();
  const digest = await c.subtle.digest('SHA-256', utf8(str));
  return bufToHex(digest);
}

/**
 * 生成密码学安全的随机十六进制字符串。
 *
 * @param {number} [bytes=16] 随机字节数，输出长度为 bytes*2
 * @returns {string} hex 字符串
 *
 * @example
 * const salt = randomHex(16);   // 32 个 hex 字符
 */
export function randomHex(bytes = 16) {
  const n = Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 16;
  const arr = new Uint8Array(n);
  getCrypto().getRandomValues(arr);
  return bufToHex(arr);
}

/**
 * 恒定时间字符串比较，防止时序攻击。
 *
 * 实现说明：
 *  - 长度不同时**不提前返回**，而是继续对较长者做完整异或，
 *    只把长度差异并入结果。否则攻击者可通过响应时间探测出密钥长度。
 *  - 逐字符比较 charCodeAt，对 ASCII（base64/hex/token 场景）完全够用。
 *  - 这是本模块唯一的同步函数。
 *
 * @param {string} a 字符串 A
 * @param {string} b 字符串 B
 * @returns {boolean} 是否完全相等
 *
 * @example
 * if (!timingSafeEqual(providedToken, expectedToken)) return unauthorized();
 */
export function timingSafeEqual(a, b) {
  const sa = typeof a === 'string' ? a : String(a == null ? '' : a);
  const sb = typeof b === 'string' ? b : String(b == null ? '' : b);

  // 长度差异先并入 diff，但循环长度取两者最大值以保持耗时稳定
  let diff = sa.length ^ sb.length;
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) {
    // 越界处取 0，保证两侧都执行相同次数的运算
    const ca = i < sa.length ? sa.charCodeAt(i) : 0;
    const cb = i < sb.length ? sb.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}
