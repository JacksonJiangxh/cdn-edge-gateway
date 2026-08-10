/**
 * ============================================================================
 * platform/caps.js —— 平台能力探测
 * ----------------------------------------------------------------------------
 * 目标：在 Cloudflare Workers / Cloudflare Pages / EdgeOne Pages 三个运行时上
 * 统一探测「当前 isolate 具备哪些能力」，供上层做降级决策。
 *
 * 设计要点：
 * 1. 绝不静态 import 'cloudflare:sockets'——EdgeOne / Pages 的打包器解析不到该
 *    虚拟模块会直接构建失败。socket 能力只做「运行时特征推断」，真正的动态
 *    import 留给 proxy/engines/socketEngine.js 在确认 hasSocket 后再做。
 * 2. 探测结果按 isolate 缓存（模块级变量），同一 isolate 只算一次，避免在
 *    CF 免费版有限的 CPU 时间里做重复的字符串匹配。
 * 3. 只读 env，不修改任何全局状态。
 * ============================================================================
 */

/**
 * isolate 级缓存。Workers 的模块级变量生命周期等同于 isolate，
 * 一个 isolate 内平台特征不会变化，因此缓存是安全的。
 * @type {import('../contracts.js').Caps|null}
 */
let _cachedCaps = null;

/**
 * 缓存时对应的 env 引用。理论上同一 isolate 的 env 是同一个对象，
 * 但 Pages/EdgeOne 某些版本每次请求会传入新的 env 包装对象，
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
 * 读取 navigator.userAgent，失败返回空串。
 * Cloudflare Workers 在 compatibility_date >= 2022-03-21 时
 * navigator.userAgent === 'Cloudflare-Workers'。
 * @returns {string} UA 字符串（小写）
 */
function readUserAgent() {
  try {
    const nav = safeGlobal('navigator');
    if (nav && typeof nav.userAgent === 'string') {
      return nav.userAgent.toLowerCase();
    }
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * 读取环境变量（同时兼容 env 对象与 Node 的 process.env）。
 * EdgeOne Pages 的边缘函数在部分模式下把变量挂在 process.env 上。
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
 * 判断是否支持 caches.default 边缘缓存。
 * - CF Workers / CF Pages：caches.default 存在
 * - EdgeOne Pages：有 caches（Cache API 的标准子集）但没有 default 实例
 * @returns {boolean} 是否可用边缘缓存
 */
function detectEdgeCache() {
  try {
    const c = safeGlobal('caches');
    return typeof c !== 'undefined' && c !== null && typeof c.default !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * 判断当前运行时是否为 Cloudflare Workers 家族（Workers / Pages Functions）。
 * 依据多个互相独立的特征，任意命中即认为是 CF：
 *   1. navigator.userAgent === 'Cloudflare-Workers'
 *   2. 存在 CF 特有全局类 WebSocketPair
 *   3. 存在 caches.default（EdgeOne 没有）
 * @returns {boolean} 是否 CF 运行时
 */
function detectCloudflareRuntime() {
  const ua = readUserAgent();
  if (ua.includes('cloudflare-workers')) return true;
  if (typeof safeGlobal('WebSocketPair') === 'function') return true;
  if (detectEdgeCache()) return true;
  return false;
}

/**
 * 判断是否为 EdgeOne Pages 运行时。
 * EdgeOne 目前没有稳定的官方运行时指纹，因此采取「显式声明优先 + 反向排除」：
 *   1. CLOUD_PLATFORM=edgeone（推荐用户显式配置，最可靠）
 *   2. 存在 EdgeOne 注入的全局量（EdgeOne / eo / EO_ 前缀）
 *   3. 非 Node、非 CF，但有 fetch/Request 的边缘运行时 → 归类为 edgeone
 * @param {Object} env 环境对象
 * @param {boolean} isCf 是否已判定为 CF 运行时
 * @returns {boolean} 是否 EdgeOne
 */
function detectEdgeOneRuntime(env, isCf) {
  const explicit = (readEnvVar(env, 'CLOUD_PLATFORM') || '').toLowerCase();
  if (explicit === 'edgeone' || explicit === 'tencent' || explicit === 'tencent-edgeone') {
    return true;
  }
  if (isCf) return false;

  // EdgeOne 边缘函数注入的全局对象特征
  if (safeGlobal('EdgeOne') !== undefined) return true;
  if (safeGlobal('eo') !== undefined) return true;
  if (safeGlobal('EdgeRuntime') !== undefined) return true;

  // EdgeOne Cloud Function（Node 运行时）特征：
  // 与 Edge Function 共享同一套 KV 命名空间与键编码约定，必须归类为 edgeone，
  // 否则 configCacheTtl 下限、KV 键名可逆编码等 EO 专属逻辑会退化。
  // 检测手段：EO Cloud Function 注入的全局对象 / 环境变量。
  if (safeGlobal('edgeone') !== undefined) return true;
  if (readEnvVar(env, 'EO_CLOUD_FUNCTION') != null) return true;
  if (readEnvVar(env, 'EDGEONE_CLOUD_FUNCTION') != null) return true;

  // 反向排除：不是 Node，但具备 Web 标准 fetch/Request → 边缘运行时
  const proc = safeGlobal('process');
  const isNode = !!(proc && proc.versions && proc.versions.node);
  if (!isNode && typeof safeGlobal('fetch') === 'function' && typeof safeGlobal('Request') === 'function') {
    return true;
  }
  return false;
}

/**
 * 在已确认是 CF 运行时的前提下，区分 Workers 与 Pages Functions。
 * Pages Functions 的 env 上一定挂着 ASSETS 绑定（静态资源 fetcher），
 * 这是目前唯一稳定可用的区分依据。
 * @param {Object} env 环境对象
 * @returns {'workers'|'pages'} 具体平台
 */
function detectCfSubPlatform(env) {
  const explicit = (readEnvVar(env, 'CLOUD_PLATFORM') || '').toLowerCase();
  if (explicit === 'pages' || explicit === 'cf-pages') return 'pages';
  if (explicit === 'workers' || explicit === 'cf' || explicit === 'cloudflare') return 'workers';

  if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') return 'pages';
  // Pages 构建时会注入 CF_PAGES 系列变量
  if (readEnvVar(env, 'CF_PAGES') != null) return 'pages';
  return 'workers';
}

/**
 * 推断是否支持 cloudflare:sockets（TCP connect）。
 * 只有 CF Workers 家族支持；这里不做实际 import，避免非 CF 平台打包失败。
 * 注意：即使返回 true，调用方仍应把 `await import('cloudflare:sockets')`
 * 包在 try/catch 里，因为 compatibility_flags 未开启时依然会失败。
 *
 * 判定逻辑：
 *  - 非 CF 运行时 → false（Pages/EdgeOne/纯 Node 均无 TCP socket）
 *  - CF 运行时且子平台为 workers → true
 *      cloudflare:sockets 是 Workers 原生支持的能力（只要开启了
 *      compatibility_flags 中的 `sockets` 或直接用较新 compat_date 即可），
 *      Workers 上 connect 不暴露为全局量，因此无法靠全局探测，只能按子平台推断。
 *  - CF 运行时但子平台为 pages → false
 *      Pages Functions 不支持 cloudflare:sockets 模块，必须报告 false 走降级。
 *  - 子平台未知（CF 但既非 workers 也非 pages）→ 保守返回 false
 *
 * @param {boolean} isCf 是否 CF 运行时
 * @param {'workers'|'pages'|'edgeone'|'unknown'} [sub] CF 子平台
 * @returns {boolean} 是否可能支持 socket
 */
function detectSocket(isCf, sub) {
  if (!isCf) return false;
  // connect() 在部分运行时会被直接暴露到全局，命中则百分百可用
  if (typeof safeGlobal('connect') === 'function') return true;
  // Workers 原生支持 cloudflare:sockets；Pages Functions 不支持
  if (sub === 'workers') return true;
  return false;
}

/**
 * 判断 env 上某个绑定是否为「有效的 KV 绑定」。
 * 只做鸭子类型检查：具备 get + put 方法即可。
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
 * 判断 env 上某个绑定是否为「有效的 D1 绑定」。
 * D1 的标志是 prepare 方法。
 * @param {any} binding 待检测对象
 * @returns {boolean} 是否像 D1
 */
function looksLikeD1(binding) {
  return !!(binding && typeof binding === 'object' && typeof binding.prepare === 'function');
}

/**
 * 判断 env 上某个绑定是否为「有效的 R2 绑定」。
 * R2 桶的标志是具备 get / put / head 方法（R2Bucket 接口）。
 * R2 直读用于「回源到 R2」的源站引擎（engine:'r2'），仅 Cloudflare 可用。
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

  const isCf = detectCloudflareRuntime();
  const isEo = detectEdgeOneRuntime(e, isCf);

  // 边缘缓存能力：
  // - CF（Workers / Pages）有标准 caches.default API（hasCacheApi=true）
  // - EO（Makers）虽无 caches.default，但「响应头委托 EO 边缘节点缓存」真实生效
  //   （函数返回的响应带 CDN-Cache-Control 时 EO 边缘会按头缓存），故 hasEdgeCache=true
  // - 额外：EO 支持「边缘函数内 fetch(同站加速域名) 委托节点缓存」(eoEdgeCache)，
  //   命中后零函数调用，是更优省额度路径（见 pipeline.js 路径 A 分支）
  const hasCacheApi = detectEdgeCache();
  const hasEdgeCache = hasCacheApi || isEo;
  const eoEdgeCache = isEo;

  /** @type {'workers'|'pages'|'edgeone'|'unknown'} */
  let platform;
  if (isEo) {
    platform = 'edgeone';
  } else if (isCf) {
    platform = detectCfSubPlatform(e);
  } else {
    platform = 'unknown';
  }

  const caps = Object.freeze({
    platform,
    hasEdgeCache,
    hasCacheApi,
    eoEdgeCache,
    hasSocket: detectSocket(isCf, platform),
    hasD1: looksLikeD1(e.CDN_DB) || looksLikeD1(e.DB) || looksLikeD1(e.D1),
    hasKV: looksLikeKV(e.CDN_KV) || looksLikeKV(e.KV),
    // R2 直读回源：仅在 CF 运行时可用，检测常见绑定名
    hasR2:
      (platform === 'workers' || platform === 'pages') &&
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
