/**
 * ============================================================================
 * security/auth.js —— 管理后台登录鉴权
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 密码哈希与校验（PBKDF2-SHA256 / 10 万轮 / 恒定时间比较）
 *   2. 自实现 JWT（HS256）签发与校验 —— 零 npm 依赖，仅用 WebCrypto
 *   3. 认证 Cookie 的生成与解析
 *
 * 安全设计原则：
 *   - 所有比较（密码哈希、JWT 签名）一律走恒定时间比较，杜绝时序侧信道。
 *   - 校验失败一律返回 null / false，绝不通过错误信息区分「签名错」还是
 *     「已过期」，避免给攻击者提供 oracle。
 *   - 所有输入（token 字符串、Cookie 头）都视为不可信，全程 try/catch 兜底。
 *
 * 运行时约束：纯 ESM，只用 Web 标准 API（crypto.subtle / TextEncoder / atob）。
 * ============================================================================
 */

import {
  pbkdf2,
  hmacSha256,
  randomHex,
  timingSafeEqual,
  sha256Hex,
  bufToBase64,
  base64ToBuf,
} from '../utils/crypto.js';

// ============================================================================
// 常量
// ============================================================================

/**
 * PBKDF2 迭代轮数。10 万轮是 OWASP 对 PBKDF2-SHA256 的推荐下限。
 * 必须与 utils/crypto.js 的默认值保持一致，否则已存量的哈希将无法校验。
 *
 * 【性能约束】单次约 30~80ms CPU，只允许出现在登录 / 改密这类低频路径上。
 * 每请求的 token 鉴权走 HMAC（verifyToken），不碰 PBKDF2。
 */
const PBKDF2_ITERATIONS = 100000;

/** 盐长度（字节），以 hex 存储时为 32 个字符。 */
const SALT_BYTES = 16;

/** 认证 Cookie 名。 */
export const AUTH_COOKIE_NAME = 'ecw_token';

/** JWT 默认有效期（秒），当调用方未传 ttl 时使用。 */
const DEFAULT_TOKEN_TTL = 7200;

/** 允许的时钟偏移（秒）。边缘节点之间时钟可能有细微漂移。 */
const CLOCK_SKEW_SEC = 30;

const TEXT_ENCODER = new TextEncoder();

// ============================================================================
// 编解码工具（base64 / base64url）
// ============================================================================

/**
 * 字符串（UTF-8）→ base64url（无 padding），用于 JWT 的 header/payload。
 * 复用 utils/crypto.js 的 bufToBase64（已处理大数组分块，避免栈溢出）。
 * @param {string} str 待编码字符串
 * @returns {string} base64url 字符串
 */
function b64urlEncodeStr(str) {
  return bufToBase64(TEXT_ENCODER.encode(str))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * base64url → UTF-8 字符串。
 * `base64ToBuf` 原生兼容 base64url 并自动补齐 padding，非法输入会抛错，
 * 这里统一捕获后返回空串（调用方据此判定 token 非法）。
 * @param {string} b64url base64url 字符串
 * @returns {string} 解码结果；失败返回空串
 */
function b64urlDecodeStr(b64url) {
  try {
    return new TextDecoder().decode(base64ToBuf(String(b64url)));
  } catch {
    return '';
  }
}

// ============================================================================
// 密码哈希
// ============================================================================

/**
 * 用 PBKDF2-SHA256 对明文密码做哈希。
 *
 * 【编码约定】
 * `utils/crypto.js` 的 `pbkdf2(password, salt, iterations)` 把 salt 当**字符串**
 * 做 UTF-8 编码，并返回**标准 base64**（带 padding，含 `+` `/`）。
 * 因此这里 salt 统一用 `randomHex(16)` 生成的 32 字符 hex 串（本身即是可打印
 * 字符串，直接存储、直接参与派生，不做任何二次编解码），hash 直接透传底层的
 * 标准 base64。切勿把 salt 转成字节数组再传入 —— 那会被 String() 成 "1,2,3"。
 *
 * @param {string} pwd 明文密码（不可信输入）
 * @param {string} [salt] hex 编码的盐；缺省时随机生成 16 字节
 * @returns {Promise<{hash:string, salt:string}>} hash 为标准 base64，salt 为 hex
 *
 * @example
 * const { hash, salt } = await hashPassword('admin123');
 */
export async function hashPassword(pwd, salt) {
  const password = typeof pwd === 'string' ? pwd : String(pwd ?? '');

  // salt 作为字符串直接参与派生；缺省时生成 16 字节随机 hex
  const saltStr = typeof salt === 'string' && salt.length > 0 ? salt : randomHex(SALT_BYTES);

  // pbkdf2 返回标准 base64，直接透传，不再做 hex/base64 猜测转换
  const hash = await pbkdf2(password, saltStr, PBKDF2_ITERATIONS);

  return { hash, salt: saltStr };
}

/**
 * 校验明文密码是否与存储的哈希匹配。使用恒定时间比较。
 *
 * 注意：无论 hash/salt 是否为空，都会走完一次完整的 PBKDF2 运算，
 * 使「用户不存在」与「密码错误」的耗时一致，避免用户名枚举。
 *
 * @param {string} pwd 明文密码
 * @param {string} hash 存储的 base64 哈希
 * @param {string} salt 存储的 base64 盐
 * @returns {Promise<boolean>} 是否匹配
 */
export async function verifyPassword(pwd, hash, salt) {
  try {
    // 即使未初始化密码/缺盐，也用一个固定假盐跑满迭代，保证耗时恒定，
    // 使「管理员未初始化」与「密码错误」在时序上不可区分。
    const effectiveSalt =
      typeof salt === 'string' && salt.length > 0 ? salt : '0'.repeat(SALT_BYTES * 2);
    const computed = await pbkdf2(pwd == null ? '' : String(pwd), effectiveSalt, PBKDF2_ITERATIONS);
    if (typeof hash !== 'string' || hash.length === 0) return false;
    // computed 与存储的 hash 都是标准 base64，同源可直接恒定时间比较
    return timingSafeEqual(computed, hash);
  } catch {
    return false;
  }
}

// ============================================================================
// JWT（HS256）—— 自实现，无第三方库
// ============================================================================

/** JWT 头部固定为 HS256，预先编码好，省一次序列化。 */
const JWT_HEADER_B64 = b64urlEncodeStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

/**
 * 计算 JWT 签名段。
 *
 * `utils/crypto.js` 的 `hmacSha256` 已经返回 base64url（无 padding），
 * 与 JWT 第三段的编码要求完全一致，因此直接返回，不做任何二次转换。
 *
 * @param {string} signingInput `${headerB64}.${payloadB64}`
 * @param {string} secret 签名密钥
 * @returns {Promise<string>} base64url 编码的签名
 */
async function computeJwtSignature(signingInput, secret) {
  return await hmacSha256(secret, signingInput);
}

/**
 * 签发 JWT（HS256）。
 *
 * 自动注入 `iat`（签发时间）与 `exp`（过期时间）声明；
 * 若调用方在 payload 中自带 exp，则以调用方为准。
 *
 * @param {Object} payload 业务载荷，如 `{ sub: 'admin' }`
 * @param {string} secret 签名密钥；**不得为空**
 * @param {number} [ttl=7200] 有效期（秒）
 * @returns {Promise<string>} 完整 JWT 字符串 `header.payload.signature`
 * @throws {Error} secret 为空或过短时抛出，调用方应捕获并返回 5xx
 *
 * @example
 * const token = await signToken({ sub: 'admin' }, secret, 7200);
 */
export async function signToken(payload, secret, ttl) {
  // 【安全红线】绝不用空密钥签名。
  // resolveSecret() 在「无 JWT_SECRET + 无 passwordHash」或内部异常时会返回 ''，
  // 若放任其签名，等于用空密钥做 HMAC —— 任何人都能离线伪造管理员 token。
  // 校验侧（verifyToken/authenticate）虽有 !secret 拦截，但签发侧必须同样拒绝，
  // 否则一次 getGlobal 抖动就会向外发出一个「人人可伪造」的凭证。
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('signToken: 拒绝使用空密钥签名，请配置 JWT_SECRET 环境变量');
  }

  const now = Math.floor(Date.now() / 1000);
  const lifetime = Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : DEFAULT_TOKEN_TTL;

  const claims = {
    ...(payload && typeof payload === 'object' ? payload : {}),
    iat: now,
    exp: now + lifetime,
  };
  // 允许调用方显式覆盖 exp
  if (payload && typeof payload === 'object' && Number.isFinite(payload.exp)) {
    claims.exp = payload.exp;
  }

  const payloadB64 = b64urlEncodeStr(JSON.stringify(claims));
  const signingInput = `${JWT_HEADER_B64}.${payloadB64}`;
  const signature = await computeJwtSignature(signingInput, secret);
  return `${signingInput}.${signature}`;
}

/**
 * 校验 JWT：验证签名（恒定时间）与 exp 有效期。
 *
 * 任何一步失败都统一返回 null —— 不区分「格式错 / 签名错 / 已过期」，
 * 避免给攻击者提供可区分的 oracle。
 *
 * @param {string} token JWT 字符串（不可信输入）
 * @param {string} secret 签名密钥
 * @returns {Promise<Object|null>} 校验通过返回 payload 对象，否则 null
 */
export async function verifyToken(token, secret) {
  try {
    if (typeof token !== 'string' || token.length === 0 || token.length > 4096) return null;
    if (typeof secret !== 'string' || secret.length === 0) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    // 1. 校验算法头：必须是 HS256，拒绝 alg:none 降级攻击
    const headerJson = b64urlDecodeStr(headerB64);
    if (!headerJson) return null;
    const header = JSON.parse(headerJson);
    if (!header || header.alg !== 'HS256') return null;

    // 2. 恒定时间比较签名
    const expected = await computeJwtSignature(`${headerB64}.${payloadB64}`, secret);
    if (!timingSafeEqual(signatureB64, expected)) return null;

    // 3. 解析载荷并校验时间声明
    const payloadJson = b64urlDecodeStr(payloadB64);
    if (!payloadJson) return null;
    const claims = JSON.parse(payloadJson);
    if (!claims || typeof claims !== 'object') return null;

    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(claims.exp) || now > claims.exp + CLOCK_SKEW_SEC) return null;
    if (Number.isFinite(claims.nbf) && now + CLOCK_SKEW_SEC < claims.nbf) return null;

    return claims;
  } catch {
    return null;
  }
}

// ============================================================================
// 签名密钥来源
// ============================================================================

/**
 * 解析 JWT 签名密钥，优先级：
 *   1. `env.JWT_SECRET` —— 推荐方式，独立的高熵密钥
 *   2. 由 GlobalConfig.passwordHash 派生 —— **降级方案**
 *
 * 【降级方案的安全说明】
 * 从 passwordHash 派生 secret 属于「不够安全」的兜底：
 *   - 密钥与密码哈希强绑定，用户改密码会导致所有已签发 token 立即失效
 *     （这点其实是副作用收益，但并非设计意图）；
 *   - 若 KV 中的 passwordHash 因任何原因泄露（如配置导出接口越权），
 *     攻击者可直接离线伪造任意 JWT，直接拿到管理员权限；
 *   - 密钥熵完全取决于哈希值本身，无法独立轮换。
 * 因此强烈建议用户在平台上配置独立的 `JWT_SECRET` 环境变量。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Promise<string>} 签名密钥；无任何可用来源时返回空串
 */
export async function resolveSecret(ctx) {
  try {
    const env = (ctx && ctx.env) || {};
    const fromEnv = env.JWT_SECRET;
    if (typeof fromEnv === 'string' && fromEnv.length >= 8) {
      return fromEnv;
    }

    // —— 降级方案：从 passwordHash 派生 ——
    const { getGlobal } = await import('../config/store.js');
    const cfg = await getGlobal(ctx);
    const ph = cfg && cfg.passwordHash;
    if (typeof ph === 'string' && ph.length > 0) {
      // 加固定域分隔前缀，避免派生值与原哈希直接相等
      return await sha256Hex(`ecw-jwt-derive:v1:${ph}`);
    }
    return '';
  } catch {
    return '';
  }
}

// ============================================================================
// Cookie 工具
// ============================================================================

/**
 * 构造认证 Cookie 的 Set-Cookie 值。
 *
 * 属性说明：
 *   - HttpOnly        禁止 JS 读取，缓解 XSS 窃取 token
 *   - Secure          仅 HTTPS 传输
 *   - SameSite=Strict 彻底阻断跨站携带，防 CSRF
 *   - Path=/          管理面与 API 可能不同前缀，统一根路径
 *
 * @param {string} token JWT 字符串
 * @param {number} ttl 有效期（秒）；<=0 表示立即失效（登出）
 * @returns {string} Set-Cookie 头的值
 *
 * @example
 * headers.set('Set-Cookie', buildAuthCookie(token, 7200));
 */
export function buildAuthCookie(token, ttl, secure = true) {
  const maxAge = Number.isFinite(ttl) && ttl > 0 ? Math.floor(ttl) : 0;
  const value = maxAge > 0 ? String(token ?? '') : '';
  let attrs = `HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
  if (secure) attrs += '; Secure';
  return `${AUTH_COOKIE_NAME}=${value}; ${attrs}`;
}

/**
 * 构造「清除认证 Cookie」的 Set-Cookie 值（登出用）。
 * @returns {string} Set-Cookie 头的值
 */
/**
 * 构造「清除认证 Cookie」的 Set-Cookie 值（登出用）。
 * 清除 Cookie 必须与设定时使用相同的 Secure 标记，否则浏览器不会匹配上。
 * @param {boolean} [secure=true] 是否添加 Secure 标记
 * @returns {string} Set-Cookie 头的值
 */
export function buildClearAuthCookie(secure = true) {
  return buildAuthCookie('', 0, secure);
}

/**
 * 从请求中解析认证 token。
 *
 * 优先读 Cookie；若无则回退到 `Authorization: Bearer xxx`
 * （方便管理后台前端用 fetch 显式带 token，也方便 CLI 调用）。
 *
 * @param {Request} request 客户端请求（不可信输入）
 * @returns {string|null} token 字符串，未找到返回 null
 */
export function parseAuthCookie(request) {
  try {
    if (!request || !request.headers) return null;

    const raw = request.headers.get('Cookie') || request.headers.get('cookie') || '';
    if (raw) {
      // 手动解析，不用正则回溯风险高的写法
      const segments = raw.split(';');
      for (const seg of segments) {
        const idx = seg.indexOf('=');
        if (idx <= 0) continue;
        const name = seg.slice(0, idx).trim();
        if (name === AUTH_COOKIE_NAME) {
          const val = seg.slice(idx + 1).trim();
          return val.length > 0 ? val : null;
        }
      }
    }

    const auth = request.headers.get('Authorization') || '';
    if (auth.length > 7 && auth.slice(0, 7).toLowerCase() === 'bearer ') {
      const val = auth.slice(7).trim();
      return val.length > 0 ? val : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 一站式鉴权：从请求中取 token 并校验，返回 payload 或 null。
 * 供 api/router.js 在受保护路由上直接调用。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Promise<Object|null>} 校验通过的 JWT payload，否则 null
 */
export async function authenticate(ctx) {
  try {
    const token = parseAuthCookie(ctx && ctx.request);
    if (!token) return null;
    const secret = await resolveSecret(ctx);
    if (!secret) return null;
    return await verifyToken(token, secret);
  } catch {
    return null;
  }
}
