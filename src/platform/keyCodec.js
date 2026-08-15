/**
 * ============================================================================
 * platform/keyCodec.js —— KV 键名编解码（跨平台字符集归一）
 * ----------------------------------------------------------------------------
 * 【为什么需要这一层】
 *
 * EdgeOne KV 官方文档对 put() 的 key 参数有明确约束：
 *
 *   > key：需要创建或更新的键，长度小于等于 512 B，仅支持数字、字母及下划线。
 *   > (EN) it can only contain numbers, letters, and underscores.
 *
 * 而本项目的键空间大量使用冒号分隔前缀，且 host / IP 天然含点号：
 *
 *   cfg:global            site:_index         site:example.com
 *   pool:_index           pool:{id}           stat:{host}:{hour}:{shard}
 *   lock:{ip}             rl:{host}:{ip}:{m}  hc:{poolId}:{originId}
 *
 * 这些键在 Cloudflare KV 下完全合法（CF 允许任意 UTF-8），但在 EdgeOne 下
 * 可能被拒绝（抛错）或——更糟——被静默截断/损坏导致写进去读不出来。
 *
 * 【策略：统一编码，两平台同构】
 *
 * 不做「按平台分叉」，而是在适配层对所有键统一编码。理由：
 *   1. 编码后的键在 CF 上同样合法，两平台共用一套逻辑，不引入行为差异
 *   2. 上层 9 处调用点（store / stats / security / balancer / migration）
 *      完全无感，仍然使用可读的 `cfg:global` 形式
 *   3. 即便 EdgeOne 当前未强制校验，平台后续补上校验时也不会造成线上事故
 *
 * 【编码方案：可逆的十六进制转义】
 *
 * 必须可逆（而非哈希），因为 stats 的 cleanup 与分片聚合需要从 list() 的
 * 结果反解出原始键来做前缀判断与过期回收。
 *
 *   - 安全字符 [0-9A-Za-z] 原样保留
 *   - 下划线 `_`  → `__`        （转义自身，保证单射）
 *   - 其他任意字节 → `_XX`      （XX 为该 UTF-8 字节的两位大写十六进制）
 *
 * 示例：
 *   cfg:global        → cfg_3Aglobal
 *   site:example.com  → site_3Aexample_2Ecom
 *   lock:192.168.1.1  → lock_3A192_2E168_2E1_2E1
 *   a_b               → a__b
 *
 * 单射性证明：`_` 是唯一的转义引导符，且总是恰好消耗后续 2 个字符
 * （`__` 视为字面下划线）。因此解码无歧义，encode 是单射的，
 * 不同原始键不可能映射到同一编码键（无碰撞风险）。
 *
 * 【长度】
 * 最坏情况（全非安全字符）膨胀 3 倍。EdgeOne 上限 512 B，
 * 故原始键安全长度为 170 B；本项目最长键（stat 分片键）约 80 B，
 * 编码后约 100 B，余量充足。encodeKey 会在超限时抛错以尽早暴露问题。
 * ============================================================================
 */

/** EdgeOne KV 键长度上限（字节）。CF 上限为 512 B，两者一致。 */
const MAX_ENCODED_BYTES = 512;

/**
 * 单字符是否属于免转义的安全集合 [0-9A-Za-z]。
 *
 * 注意：下划线**不在**安全集合内，它是转义引导符，必须被转义成 `__`，
 * 否则 `a_b` 与 `a` + 转义产生的 `_62` 会产生歧义。
 *
 * @param {string} ch 单个字符
 * @returns {boolean} 是否可原样保留
 */
function isSafeChar(ch) {
  return (
    (ch >= '0' && ch <= '9') ||
    (ch >= 'a' && ch <= 'z') ||
    (ch >= 'A' && ch <= 'Z')
  );
}

/** 复用编码器，避免每次调用重新构造。 */
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

/**
 * isolate 级编码结果缓存。
 *
 * 热路径（每请求读 cfg:global / site:{host}）会反复编码同一批固定键，
 * 缓存可省去重复的逐字符扫描。键空间有界（站点数 + 池数 + 少量前缀），
 * 但 stat / rl / lock 这类含变量的键会无限增长，因此设上限并在超限时清空。
 *
 * @type {Map<string,string>}
 */
const _encCache = new Map();
const ENC_CACHE_MAX = 2000;

/**
 * 将逻辑键编码为 EdgeOne / Cloudflare 双平台均合法的物理键。
 *
 * @param {string} key 逻辑键，例如 `site:example.com`
 * @returns {string} 物理键，例如 `site_3Aexample_2Ecom`
 * @throws {TypeError} key 非法（非字符串或空）时抛出
 * @throws {RangeError} 编码后超过 512 B 时抛出
 *
 * @example
 * encodeKey('cfg:global');       // 'cfg_3Aglobal'
 * encodeKey('site:a.com');       // 'site_3Aa_2Ecom'
 * encodeKey('a_b');              // 'a__b'
 */
export function encodeKey(key) {
  if (typeof key !== 'string' || key === '') {
    throw new TypeError(`encodeKey: 键必须是非空字符串，收到 ${JSON.stringify(key)}`);
  }

  const hit = _encCache.get(key);
  if (hit !== undefined) return hit;

  let out = '';
  // 逐「码元」遍历即可：非 ASCII 字符走 TextEncoder 按 UTF-8 字节转义，
  // 代理对的两个码元各自编码其 UTF-8 字节序列，拼接后仍然可逆。
  for (const ch of key) {
    if (isSafeChar(ch)) {
      out += ch;
      continue;
    }
    if (ch === '_') {
      out += '__';
      continue;
    }
    const bytes = TEXT_ENCODER.encode(ch);
    for (let i = 0; i < bytes.length; i++) {
      out += '_' + bytes[i].toString(16).toUpperCase().padStart(2, '0');
    }
  }

  if (out.length > MAX_ENCODED_BYTES) {
    // 编码结果全是 ASCII，故 length 即字节数
    throw new RangeError(
      `encodeKey: 键 "${key}" 编码后为 ${out.length} B，超过 ${MAX_ENCODED_BYTES} B 上限`
    );
  }

  if (_encCache.size >= ENC_CACHE_MAX) _encCache.clear();
  _encCache.set(key, out);
  return out;
}

/**
 * 将物理键解码回逻辑键（encodeKey 的逆运算）。
 *
 * 用于 list() 结果归一化：上层（如 stats cleanup、迁移扫描）拿到的
 * 必须是可读的逻辑键，才能做前缀匹配与业务判断。
 *
 * 对不符合编码规则的输入（例如编码方案启用前写入的历史键）返回 null，
 * 调用方据此识别「未编码的旧键」并触发迁移。
 *
 * @param {string} encoded 物理键
 * @returns {string|null} 逻辑键；输入不是合法编码时返回 null
 *
 * @example
 * decodeKey('site_3Aa_2Ecom');  // 'site:a.com'
 * decodeKey('a__b');            // 'a_b'
 * decodeKey('site:a.com');      // null（含非法字符，说明是未编码的旧键）
 */
export function decodeKey(encoded) {
  if (typeof encoded !== 'string' || encoded === '') return null;

  /** @type {number[]} */
  const bytes = [];
  for (let i = 0; i < encoded.length; i++) {
    const ch = encoded[i];

    if (isSafeChar(ch)) {
      bytes.push(ch.charCodeAt(0));
      continue;
    }

    // 非安全字符只可能是 `_`；出现其他字符说明不是本方案编码的键
    if (ch !== '_') return null;

    const next = encoded[i + 1];
    // 尾部悬空的 `_`
    if (next === undefined) return null;

    if (next === '_') {
      // 字面下划线
      bytes.push(0x5f);
      i += 1;
      continue;
    }

    const hex = encoded.slice(i + 1, i + 3);
    if (hex.length !== 2 || !/^[0-9A-Fa-f]{2}$/.test(hex)) return null;
    bytes.push(parseInt(hex, 16));
    i += 2;
  }

  try {
    // fatal 模式：字节序列不是合法 UTF-8 时抛错，避免返回替换字符导致静默错乱
    return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/**
 * 判断一个物理键是否是本方案编码产物。
 *
 * 仅做字符集检查（不做完整解码），用于快速筛选。
 * 注意纯字母数字的键（如 `abc`）既是合法编码也是合法原文，
 * 此时两种解释一致，不影响正确性。
 *
 * @param {string} s 待检测字符串
 * @returns {boolean} 是否只含 [0-9A-Za-z_]
 */
export function isEncodedKey(s) {
  return typeof s === 'string' && s !== '' && /^[0-9A-Za-z_]+$/.test(s);
}

/**
 * 编码 list() 的 prefix 参数。
 *
 * 【关键约束】前缀编码必须与整键编码「前缀兼容」：
 * 由于本方案是逐字符独立编码、无状态、无块对齐，
 * encode(a + b) === encode(a) + encode(b) 恒成立，
 * 因此 encode(prefix) 一定是 encode(fullKey) 的前缀，前缀列举语义得以保持。
 *
 * 这正是选择「逐字符转义」而非 Base32/Base64 的原因——后者有 5/6 bit
 * 分组对齐，encode(prefix) 不是 encode(full) 的前缀，会破坏 list 语义。
 *
 * 平台兼容性：CF KV 与 EO KV 的 list() 都支持 prefix 参数（按编码后物理
 * 键前缀列举）。本函数是「按前缀列举」能力的公共 API 入口，当前调用点尚未
 * 接入（列举类功能在路线图），保留以支撑后续按前缀扫描/清理，属预留 API，
 * 非死代码。
 *
 * @param {string} prefix 逻辑前缀，例如 `stat:`
 * @returns {string} 物理前缀，例如 `stat_3A`
 */
export function encodePrefix(prefix) {
  if (typeof prefix !== 'string' || prefix === '') return '';
  return encodeKey(prefix);
}

/** 仅供测试：清空编码缓存。 */
export function _resetKeyCodecCache() {
  _encCache.clear();
}
