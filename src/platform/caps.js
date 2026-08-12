/**
 * ============================================================================
 * platform/caps.js —— 平台能力探测
 * ----------------------------------------------------------------------------
 * 目标：在 Cloudflare / EdgeOne / 阿里云 ESA 三个厂商的运行时上统一探测
 * 「当前 isolate 具备哪些能力」，供上层做降级决策。
 *
 * 设计要点（2026-08 修订）：
 * 1. 部署厂商（platform）必须由环境变量 CLOUD_PLATFORM 显式声明，取值三档：
 *      'cf'  → Cloudflare（Workers 或 Pages Functions，二者不再区分）
 *      'eo'  → EdgeOne（腾讯云边缘函数 / Makers）
 *      'esa' → 阿里云边缘安全加速（ESA）函数
 *    未设置或取值非法 → 抛错。禁止再靠运行时指纹猜测厂商，避免跨厂商误用。
 * 2. 认知基线（见 docs/07-eo-origin-host.md §五）：
 *      - fetch 可自定义 Host 头：CF / EO / ESA 三平台均支持。
 *      - 不再区分 Cloudflare Workers / Pages：二者同 workerd 运行时，fetch 行为
 *        完全一致，历史上「pages 无 socket」一说已被 CF 官方文档与实测推翻。
 *      - SOCKS / cloudflare:sockets 不再是可选回源引擎（engine 枚举已无 'socket'），
 *        仅 CF 上「裸 IP + HTTPS + 自定义 SNI」作为 fetch 引擎的内部自动兜底。
 * 3. 探测结果按 isolate 缓存（模块级变量），同一 isolate 只算一次，避免重复开销。
 * 4. 只读 env，不修改任何全局状态。
 * ============================================================================
 */

/**
 * 合法的 CLOUD_PLATFORM 取值。
 * @type {readonly ['cf', 'eo', 'esa']}
 */
export const VALID_PLATFORMS = ['cf', 'eo', 'esa'];

/**
 * 旧别名 → 规范值 归一映射。
 *
 * 历史版本中 dev.mjs / esa 薄壳 / 文档曾使用 edgeone / cloudflare / aliyun-esa /
 * pages 等别名，且 kv.js 的 isEsaPlatform 曾直读别名。为避免「有的地方容忍别名、
 * 有的地方 throw」的双标准，这里把别名统一收口到单一实现：读到的任何取值都先经
 * 本映射归一为规范值（cf|eo|esa），再参与平台判断。
 *
 * @type {Readonly<Record<string, 'cf'|'eo'|'esa'>>}
 */
export const PLATFORM_ALIASES = Object.freeze({
  cf: 'cf',
  'cloudflare': 'cf',
  'workers': 'cf',
  'pages': 'cf',
  eo: 'eo',
  'edgeone': 'eo',
  es: 'esa',
  esa: 'esa',
  'aliyun-esa': 'esa',
  'alibaba-esa': 'esa',
  'aliyun': 'esa',
  'alibaba': 'esa',
});

/**
 * isolate 级缓存。Workers 的模块级变量生命周期等同于 isolate，
 * 一个 isolate 内平台特征不会变化，因此缓存是安全的。
 * @type {import('../contracts.js').Caps|null}
 */
let _cachedCaps = null;

/**
 * 缓存时对应的 env 引用。Pages/EdgeOne 某些版本每次请求会传入新的 env 包装对象，
 * 这里只用它做「绑定类能力」的复查，平台类能力仍复用缓存。
 * @type {Object|null}
 */
let _cachedEnvRef = null;

/**
 * 安全地读取 globalThis 上某个属性，任何异常都吞掉。
 * 某些运行时对未定义全局量的访问会抛 ReferenceError 而不是返回 undefined。
 * @param {string} name 全局属性名
 * @returns {any} 属性值，不存在或异常时返回 undefined
 */
function safeGlobal(name) {
  try {
    return globalThis[name];
  } catch {
    return undefined;
  }
}

/**
 * 读取环境变量（同时兼容 env 对象与 Node 的 process.env）。
 * @param {Object} env 平台传入的环境对象
 * @param {string} key 变量名
 * @returns {string|undefined} 变量值
 */
function readEnvVar(env, key) {
  if (env && env[key] != null) return String(env[key]);
  try {
    const proc = safeGlobal('process');
    if (proc && proc.env && proc.env[key] != null) return String(proc.env[key]);
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * 判断当前运行时是否支持 Cache API（三平台均原生支持）：
 *  - Cloudflare：caches.default 标准实例
 *  - EdgeOne：caches.default（基于 Web Cache API，接口与 CF 一致；缓存仅节点本地化、不跨节点复制）
 *  - 阿里云 ESA：全局 `cache` 单实例（非 caches.default、无命名空间 open）
 * 注：探测只回答「运行时是否存在 Cache API 句柄」，节点本地化 / 单实例 / HTTP-key
 * 等差异由 caps 上的 cacheIsNodeLocal / cacheSingleInstance / cacheKeyHttpOnly 描述。
 * @returns {boolean} 是否可用 Cache API
 */
function detectCacheApi() {
  // CF / EO：caches.default
  try {
    const c = safeGlobal('caches');
    if (typeof c !== 'undefined' && c !== null && typeof c.default !== 'undefined') {
      return true;
    }
  } catch {
    /* ignore */
  }
  // ESA：全局 cache 单实例
  try {
    const cache = safeGlobal('cache');
    if (typeof cache !== 'undefined' && cache !== null && typeof cache.put === 'function') {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * 判断 env 上某个绑定是否为「有效的 KV 绑定」。
 * @param {any} binding 待检测对象
 * @returns {boolean} 是否像 KV
 */
function looksLikeKV(binding) {
  return !!(
    binding &&
    typeof binding === 'object' &&
    typeof binding.get === 'function' &&
    typeof binding.put === 'function'
  );
}

/**
 * 是否配置了自部署 Webdis/Redis 后端（REDIS_URL）。
 * @param {Object} env 环境对象
 * @returns {boolean} 是否可用 Redis 后端
 */
function hasRedisBackend(env) {
  const url = env && (env.REDIS_URL || env.REDIS_URL_KV);
  return typeof url === 'string' && url.trim() !== '';
}

/**
 * 判断 env 上某个绑定是否为「有效的 D1 绑定」（prepare 方法标志）。
 * @param {any} binding 待检测对象
 * @returns {boolean} 是否像 D1
 */
function looksLikeD1(binding) {
  return !!(binding && typeof binding === 'object' && typeof binding.prepare === 'function');
}

/**
 * 判断 env 上某个绑定是否为「有效的 R2 绑定」（get / put / head 方法标志）。
 * @param {any} binding 待检测对象
 * @returns {boolean} 是否像 R2 桶
 */
function looksLikeR2(binding) {
  return !!(
    binding &&
    typeof binding === 'object' &&
    typeof binding.get === 'function' &&
    typeof binding.put === 'function' &&
    typeof binding.head === 'function'
  );
}

/**
 * 读取并归一化部署厂商环境变量 CLOUD_PLATFORM。
 *
 * 返回值恒为规范值 cf | eo | esa 之一：
 *   - 未设置 → 抛错（强制显式声明，禁止运行时指纹猜测）；
 *   - 规范值 / 历史别名（edgeone / cloudflare / aliyun-esa / pages 等）→ 归一为规范值，
 *     若为别名则 console.warn 提示使用规范值（向后兼容，不再 throw）；
 *   - 其它未知取值 → 抛错。
 * @param {Object} env 环境对象
 * @returns {'cf'|'eo'|'esa'} 归一化后的厂商标识
 * @throws {Error} 未设置或取值非法时
 */
function readPlatform(env) {
  const declared = (readEnvVar(env, 'CLOUD_PLATFORM') || '').toLowerCase().trim();
  if (!declared) {
    throw new Error(
      '[caps] 必须设置环境变量 CLOUD_PLATFORM 以声明部署厂商，' +
      '取值为 cf / eo / esa 之一（分别对应 Cloudflare / EdgeOne / 阿里云 ESA）。'
    );
  }
  const canonical = PLATFORM_ALIASES[declared];
  if (!canonical) {
    throw new Error(
      `[caps] CLOUD_PLATFORM 取值 "${declared}" 非法，必须为 cf / eo / esa 之一` +
      `（亦兼容旧别名 edgeone / cloudflare / aliyun-esa / pages）。`
    );
  }
  if (canonical !== declared) {
    // 历史别名向后兼容：不阻断运行，仅告警提示规范化
    console.warn(`[caps] CLOUD_PLATFORM="${declared}" 已归一为 "${canonical}"，建议显式使用 cf / eo / esa。`);
  }
  return canonical;
}

/**
 * 探测平台能力。结果在同一 isolate 内缓存，重复调用零成本。
 *
 * @param {Object} [env] 平台环境变量与绑定对象
 * @returns {import('../contracts.js').Caps} 平台能力描述
 *
 * @example
 * const caps = detectCaps(env);
 * if (caps.hasEdgeCache) { ... }
 */
export function detectCaps(env) {
  const e = env || {};

  // 命中缓存：平台类特征不变，但绑定可能随 env 变化，故 env 引用变了就重算绑定位
  if (_cachedCaps && _cachedEnvRef === e) {
    return _cachedCaps;
  }

  const platform = readPlatform(e);

  // 边缘缓存能力（三平台均真实生效）：
  // - CF / EO：caches.default 标准 Cache API（hasCacheApi=true）
  // - ESA：全局 cache 单实例（hasCacheApi=true，但无 caches.default / open 命名空间）
  // - EO 额外支持「边缘函数内 fetch(同站加速域名) 委托节点缓存」(eoEdgeCache)，命中后零函数调用
  const hasCacheApi = detectCacheApi();
  const hasEdgeCache = hasCacheApi || platform === 'eo' || platform === 'esa';
  const eoEdgeCache = platform === 'eo';

  // 平台缓存差异标志（详见 docs/11-architecture.md §4.1）：
  //  - EO 的 caches.default 仅节点本地化、不跨节点复制（cacheIsNodeLocal）
  //  - ESA 仅提供全局单实例 cache、无 caches.default / open（cacheSingleInstance）
  //  - ESA 的 Cache 操作与 fetch 共享 32 子请求硬上限（cacheSubreqLimit）
  //  - ESA 的 put key 必须为 http URL（cacheKeyHttpOnly：引擎不支持 https key）
  const cacheIsNodeLocal = platform === 'eo';
  const cacheSingleInstance = platform === 'esa';
  const cacheSubreqLimit = platform === 'esa' ? 32 : Infinity;
  const cacheKeyHttpOnly = platform === 'esa';

  const hasNativeKV = looksLikeKV(e.CDN_KV) || looksLikeKV(e.KV);

  /** @type {import('../contracts.js').Caps} */
  const caps = Object.freeze({
    platform,
    hasEdgeCache,
    hasCacheApi,
    eoEdgeCache,
    cacheIsNodeLocal,
    cacheSingleInstance,
    cacheSubreqLimit,
    cacheKeyHttpOnly,
    // 每请求子请求（fetch）预算上限：
    //   - ESA 硬限制 = 32（官方文档：Cache 操作与 fetch 共享 32 子请求预算）
    //   - CF / EO 宽松（远大于 32），给一个大数防误伤
    //   用途：管理面 listSites 等批读据此控制合并（见 store.js / kv.js）
    maxSubRequests: platform === 'esa' ? 32 : 1000,
    // 仅 Cloudflare 支持 fetch 直连裸 IP / 自定义端口 / 自定义 SNI
    hasRawIpFetch: platform === 'cf',
    // 仅 Cloudflare 有 cloudflare:sockets，用于「裸 IP + HTTPS + 自定义 SNI」内部兜底
    hasSocket: platform === 'cf',
    hasD1: looksLikeD1(e.CDN_DB) || looksLikeD1(e.DB) || looksLikeD1(e.D1),
    hasKV: hasNativeKV || hasRedisBackend(e),
    // KV 实际后端类型：native（平台 KV）/ redis（自部署 Webdis）/ none
    kvBackend: hasNativeKV ? 'native' : hasRedisBackend(e) ? 'redis' : 'none',
    // R2 直读回源：仅在 CF 可用，检测常见绑定名
    hasR2:
      platform === 'cf' &&
      (looksLikeR2(e.CDN_R2) ||
        looksLikeR2(e.R2) ||
        Object.values(e).some((v) => looksLikeR2(v))),
  });

  _cachedCaps = caps;
  _cachedEnvRef = e;
  return caps;
}

/**
 * 清空能力探测缓存。仅用于测试或热重载场景，生产代码不应调用。
 * @returns {void}
 */
export function resetCapsCache() {
  _cachedCaps = null;
  _cachedEnvRef = null;
}
