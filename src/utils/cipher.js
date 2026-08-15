/**
 * ============================================================================
 * utils/cipher.js —— 站点级机密加密（AES-256-GCM，Web Crypto）
 * ----------------------------------------------------------------------------
 * 设计（贴合本项目诉求：不同仓库/站点各自独立的 token，平台持唯一主密钥）：
 *   - 平台级「主密钥」直接复用已有的 env.JWT_SECRET（平台本来就会配，不再新增任何
 *     环境变量，避免混乱）：JWT_SECRET 长度任意（auth 层只要求 ≥8），不能直接当 AES 密钥，
 *     故用 SHA-256(JWT_SECRET) 派生出定长 32 字节作为 AES-256 密钥。
 *   - 每个站点/源站各自持有自己的 token（如 cnbToken / githubToken），但**用主密钥加密后
 *     落盘**（密文存 KV），运行时用主密钥解密再用 —— 做到「不同仓库不同秘钥」「KV 静态泄露
 *     时 token 不裸奔」「灵活可配」。
 *
 * 为什么不用 @secret:NAME（平台级全局变量）：
 *   @secret 是「全平台共享一把钥匙」，所有 cnb 站点共用 CNB_TOKEN，无法做到『不同仓库
 *   不同秘钥』。本项目需要每站独立 token，故改用「主密钥平台级 + 数据密钥站点级加密落盘」。
 *
 * 算法：Web Crypto AES-256-GCM（所有边缘运行时 CF/EO/ESA 的 V8 isolate 原生支持，无需依赖）。
 * 格式：base64( iv(12B) | ciphertext )，IV 随机化保证同明文不同密文。
 *
 * 降级：JWT_SECRET 缺失 → 降级为明文落盘 + 告警，保证功能不阻塞；
 *   此时 encrypt 返回明文前缀标记，decrypt 兼容回读。
 * ============================================================================
 */

import { sha256Bytes } from './crypto.js';

const ALGO = 'AES-GCM';
// 96-bit IV，GCM 推荐
const IV_LEN = 12;
// AES-256
const KEY_BYTES = 32;
// 降级明文标记
const PREFIX_PLAIN = 'plain:';
// 密文标记
const PREFIX_ENC = 'enc:';

let _warnOnce = false;

/**
 * 解析主密钥原始字节（32 字节）：复用 env.JWT_SECRET，经 SHA-256 派生。
 * 缺失则返回 null（降级明文）。
 * @returns {Promise<Uint8Array|null>}
 */
async function resolveMasterKeyBytes(ctx) {
  const env = ctx && ctx.env;
  // 唯一主密钥来源：JWT_SECRET（任何长度均可），SHA-256 派生 32 字节
  const jwt = env && env.JWT_SECRET;
  if (typeof jwt === 'string' && jwt.length >= 8) {
    return await sha256Bytes(jwt);
  }
  return null;
}

/** 取主密钥 CryptoKey（env），缺失返回 null。 */
async function getMasterKey(ctx) {
  const raw = await resolveMasterKeyBytes(ctx);
  if (!raw) return null;
  return crypto.subtle.importKey('raw', raw, { name: ALGO }, false, ['encrypt', 'decrypt']);
}

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 加密站点机密。无主密钥时降级为明文（加 prefix 标记）。
 * @param {string} plaintext 原始 token
 * @param {object} ctx 请求上下文（取 env）
 * @returns {Promise<string>} enc:xxxx（密文）或 plain:xxxx（降级明文）
 */
export async function encryptSecret(plaintext, ctx) {
  if (plaintext == null) return plaintext;
  const cryptoKey = await getMasterKey(ctx);
  if (!cryptoKey) {
    if (!_warnOnce) {
      _warnOnce = true;
      // 降级告警：避免每次请求刷屏，仅首次数次
      console.warn('[cipher] 主密钥（JWT_SECRET）未配置，cnb/github token 将以明文落盘（不安全，请尽快设置 JWT_SECRET）');
    }
    return PREFIX_PLAIN + plaintext;
  }
  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const enc = await crypto.subtle.encrypt(
      { name: ALGO, iv },
      cryptoKey,
      new TextEncoder().encode(plaintext)
    );
    return PREFIX_ENC + bytesToB64(new Uint8Array([...iv, ...new Uint8Array(enc)]));
  } catch (e) {
    console.warn('[cipher] 加密失败，降级明文落盘：' + e.message);
    return PREFIX_PLAIN + plaintext;
  }
}

/**
 * 解密站点机密。兼容 enc:/plain: 两种格式。
 * @param {string} stored 落盘值（enc:xxxx 或 plain:xxxx 或裸明文）
 * @param {object} ctx 请求上下文（取 env）
 * @returns {Promise<string>} 原始 token
 */
export async function decryptSecret(stored, ctx) {
  if (stored == null) return stored;
  if (typeof stored !== 'string') return stored;
  if (stored.startsWith(PREFIX_ENC)) {
    const cryptoKey = await getMasterKey(ctx);
    if (!cryptoKey) throw new Error('主密钥（JWT_SECRET）未配置，无法解密 cnb/github token（请设置 JWT_SECRET）');
    try {
      const bin = b64ToBytes(stored.slice(PREFIX_ENC.length));
      const iv = bin.slice(0, IV_LEN);
      const data = bin.slice(IV_LEN);
      const dec = await crypto.subtle.decrypt({ name: ALGO, iv }, cryptoKey, data);
      return new TextDecoder().decode(dec);
    } catch (e) {
      throw new Error('cnb/github token 解密失败：' + e.message);
    }
  }
  // plain: 前缀 或 裸明文（历史/降级）：直接返回
  if (stored.startsWith(PREFIX_PLAIN)) return stored.slice(PREFIX_PLAIN.length);
  return stored;
}
