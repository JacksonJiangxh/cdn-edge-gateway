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
 * 构建期由 esbuild `define` 注入的平台默认值（规范值 cf|eo|esa）。
 * 直接 import 源码运行（单元测试等）时该标识符不存在，故所有读取处
 * 必须用 typeof 守卫。
 * @type {string|undefined}
 */
/* global __BUILD_PLATFORM__ */

/**
 * isolate 内存预算默认上限（字节）。统一按 128MB 假设规划。
 * 实际值可由运行时环境变量 MEM_BUDGET_BYTES 覆盖（见 platform/memBudget.js）。
 * 预留 64KB 给运行时自身开销（编译后代码、栈、V8 内部），应用内存按此值管理。
 * @type {number}
 */
const DEFAULT_MEM_BUDGET_BYTES = 128 * 1024 * 1024 - 64 * 1024;

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
 * 读取数值型环境变量（兼容 env 对象与 Node 的 process.env），解析失败返回 undefined。
 * @param {Object} env 平台传入的环境对象
 * @param {string} key 变量名
 * @returns {number|undefined} 解析出的数值
 */
function readNumEnv(env, key) {
  const raw = readEnvVar(env, key);
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
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
 * 读取 KV 后端偏好开关（env.KV_BACKEND）。
 *
 * 为什么用环境变量而不是配置项：配置本身就存放在 KV 里，若把「用哪个 KV 后端」
 * 写进 cfg:global，就会形成「读配置前必须先知道用哪个后端」的循环依赖。
 * 因此该开关只来自平台环境变量，管理面仅做只读展示。
 *
 * @param {Object} env 环境对象
 * @returns {'auto'|'native'|'redis'} 归一化后的偏好；无效值一律回落 'auto'
 */
export function readKvBackendPreference(env) {
  const raw = env && env.KV_BACKEND;
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'native' || v === 'kv' || v === 'platform') return 'native';
  if (v === 'redis' || v === 'webdis') return 'redis';
  return 'auto';
}

/**
 * 在「平台 KV」与「自部署 Webdis」之间决策实际生效后端。
 *
 * 规则（与 kv.js getKV 的候选排序保持单一真相源）：
 *   - preference='redis'  → 强制 Webdis；未配置 REDIS_URL 时降级回平台 KV
 *   - preference='native' → 强制平台 KV；无原生绑定时降级回 Webdis
 *   - preference='auto'   → **默认 Webdis 优先**（两者同时存在时用 Webdis）
 * 任一侧都不可用时返回 'none'。降级而非硬失败，避免误配开关直接丢掉持久化。
 *
 * @param {boolean} nativeOk 是否探测到平台 KV 绑定
 * @param {boolean} redisOk 是否配置了 REDIS_URL
 * @param {'auto'|'native'|'redis'} preference 偏好
 * @returns {'native'|'redis'|'none'} 实际生效后端
 */
export function decideKvBackend(nativeOk, redisOk, preference) {
  const order =
    preference === 'native' ? ['native', 'redis'] : ['redis', 'native'];
  for (const cand of order) {
    if (cand === 'native' && nativeOk) return 'native';
    if (cand === 'redis' && redisOk) return 'redis';
  }
  return 'none';
}

/**
 * 读取统计落盘后端开关（env.STATS_BACKEND）。
 *
 * 与 KV_BACKEND 不同：KV_BACKEND 决定「配置存哪」，而统计后端是**独立**开关，
 * 因为它可能在「配置存厂商 KV」的同时「统计存自部署 KV」（EO/ESA 无 D1 时只能如此）。
 *
 * 取值归一为：'d1' | 'redis' | 'native' | 'auto' | 'none'。
 * 无效值一律回落 'auto'（受实际部署可用性约束，见 resolveStatsBackend）。
 * 注意：统一管理面不把本开关写进 cfg:global，避免「读配置前需先知道用哪个后端」的循环依赖。
 *
 * @param {Object} env 环境对象
 * @returns {'d1'|'redis'|'native'|'auto'|'none'} 归一化后的偏好
 */
export function readStatsBackendPreference(env) {
  const raw = env && env.STATS_BACKEND;
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (v === 'd1' || v === 'd1only') return 'd1';
  if (v === 'redis' || v === 'webdis' || v === 'self' || v === 'selfhost') return 'redis';
  if (v === 'native' || v === 'kv' || v === 'platform') return 'native';
  if (v === 'none' || v === 'off' || v === 'disabled') return 'none';
  return 'auto';
}

/**
 * 统计落盘键 TTL（秒）。默认 3 天（259200）。
 *
 * 跟随 KV 存储约束：EdgeOne KV 仅 1GB 空间、按占用计费，3 天窗口是命名空间主要
 * 膨胀源，砍到 3 天约降 57% 空间占用；Cloudflare KV 收紧 TTL 对写次数无影响、纯省空间。
 * 统计用途是看趋势/量级而非对账，3 天窗口已足够覆盖绝大多数运维排查。
 * 查询窗口跟随本值推导，避免「窗口远大于存活期」造成的无效 KV 读。
 *
 * @param {Object} env 环境对象
 * @returns {number} TTL 秒数
 */
export function readStatsTtl(env) {
  const n = readNumEnv(env, 'STAT_TTL');
  // 下限 60s（CF KV 硬性最小 expirationTtl），上限 30 天，避免误设导致即时过期或永久堆积
  if (n != null) return Math.min(30 * 24 * 3600, Math.max(60, Math.floor(n)));
  return 3 * 24 * 3600;
}

/**
 * 统计聚合 host 数封顶（防止 KV/config 被构造 Host 头打爆空间或内存）。
 * 默认 500，可由 STAT_MAX_HOSTS 覆盖（值需 > 0）。
 * @param {Object} env 环境对象
 * @returns {number} 最大 host 数
 */
export function readStatsMaxHosts(env) {
  const n = readNumEnv(env, 'STAT_MAX_HOSTS');
  if (n != null) return Math.max(1, Math.floor(n));
  return 500;
}

/**
 * 解析统计落盘实际生效的后端。
 *
 * 这是统计存储选型的**单一真相源**，stats/index.js 与 stats/kvDriver.js 都调用它，
 * 保证路由与 KV 适配器选取一致。
 *
 * 决策规则（硬约束：选了未部署的后端 → 直接判定 none，**绝不静默回退到其它 KV**）：
 *   - 'none'           → none（统计完全禁用，零值降级）
 *   - 'd1'             → 仅当 caps.hasD1 时生效，否则 none
 *   - 'redis'          → 仅当 caps.kvRedis（自部署 Webdis）时生效，否则 none
 *   - 'native'         → 仅当 caps.kvNative（平台厂商 KV）时生效，否则 none
 *   - 'auto'（缺省）   → 在「已部署集合」中选优先级最高者：
 *                        d1 > redis(自部署) > native(厂商)；都无则 none
 *
 * ⚠️ 关键约束：任何分支都不得把统计意外落到厂商 KV 侵蚀其读写次数额度。
 * 因此显式选 native 但没部署 → none（而非落到 redis）；auto 只选「已部署的最高优先级」，
 * 不会把统计塞给没被选中的 KV。
 *
 * @param {Object} env 环境对象
 * @param {import('../contracts.js').Caps} [caps] 可选，未传时内部 detectCaps
 * @returns {'d1'|'redis'|'native'|'none'} 实际生效后端
 */
export function resolveStatsBackend(env, caps) {
  const c = caps || detectCaps(env);
  const pref = readStatsBackendPreference(env);

  if (pref === 'none') return 'none';
  if (pref === 'd1') return c.hasD1 ? 'd1' : 'none';
  if (pref === 'redis') return c.kvRedis ? 'redis' : 'none';
  if (pref === 'native') return c.kvNative ? 'native' : 'none';

  // auto：在已部署集合中选优先级最高者
  if (c.hasD1) return 'd1';
  if (c.kvRedis) return 'redis';
  if (c.kvNative) return 'native';
  return 'none';
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
/**
 * 把原始声明串归一为规范厂商标识，不做任何告警 / 抛错。
 * @param {string} raw 已 lower/trim 的声明串（来自 CLOUD_PLATFORM 或构建期烘焙值）
 * @returns {'cf'|'eo'|'esa'|undefined} 归一后的规范值；未设置或非法返回 undefined
 */
function normalizePlatform(raw) {
  const declared = (raw || '').toLowerCase().trim();
  if (!declared) return undefined;
  return PLATFORM_ALIASES[declared];
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
  // 优先级：运行时 env / process.env > 构建期烘焙的默认值。
  //
  // __BUILD_PLATFORM__ 由 build.mjs 通过 esbuild define 注入（未注入时为 undefined，
  // 例如 vitest 直接 import 源码的场景），值为构建目标平台的规范值。
  // 这样 CF Workers/Pages 无需任何控制台变量即可运行——与 EO/ESA 薄壳里
  // 硬编码平台声明的做法等价，只是 CF 没有薄壳，故改在构建期烘焙进产物。
  // 运行时显式设置的 CLOUD_PLATFORM 仍然优先，保留「同一份产物临时改判」的能力。
  // 用 typeof 守卫读取，未注入时不会抛 ReferenceError（部分运行时对未声明
  // 标识符的裸访问会抛错，故不能直接写 __BUILD_PLATFORM__ || ''）。
  const baked = typeof __BUILD_PLATFORM__ === 'string' ? __BUILD_PLATFORM__ : '';
  const canonical = normalizePlatform(readEnvVar(env, 'CLOUD_PLATFORM') || baked || '');
  if (!canonical) {
    const declared = (readEnvVar(env, 'CLOUD_PLATFORM') || baked || '')
      .toLowerCase()
      .trim();
    throw new Error(
      `[caps] 必须设置环境变量 CLOUD_PLATFORM 以声明部署厂商，取值为 cf / eo / esa 之一` +
      `（亦兼容旧别名 edgeone / cloudflare / aliyun-esa / pages）。` +
      (declared ? `当前取值 "${declared}" 非法。` : '当前未设置。')
    );
  }
  const declared = (readEnvVar(env, 'CLOUD_PLATFORM') || baked || '')
    .toLowerCase()
    .trim();
  if (canonical !== declared) {
    // 历史别名向后兼容：不阻断运行，仅告警提示规范化
    console.warn(`[caps] CLOUD_PLATFORM="${declared}" 已归一为 "${canonical}"，建议显式使用 cf / eo / esa。`);
  }
  return canonical;
}

/**
 * 安全读取并归一化部署厂商，未设置 / 非法时返回 fallback（**不抛错**）。
 *
 * 用于 KV 适配器等「不应因平台变量缺失而崩溃」的场景（例如 REDIS_PREFIX 的
 * 平台自适应默认前缀：取不到平台就回退为无前缀，而非整条存储链路报错）。
 * 归一逻辑与 {@link readPlatform} 完全一致（共用 normalizePlatform），仅错误处理不同。
 *
 * @param {Object} env 环境对象
 * @param {string} [fallback=''] 取不到合规平台时的回退值
 * @returns {'cf'|'eo'|'esa'|string} 规范厂商标识或 fallback
 */
export function readPlatformSafe(env, fallback = '') {
  const baked = typeof __BUILD_PLATFORM__ === 'string' ? __BUILD_PLATFORM__ : '';
  const canonical = normalizePlatform(readEnvVar(env, 'CLOUD_PLATFORM') || baked || '');
  return canonical || fallback;
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
  //  - ESA 的 Cache 操作与 fetch 共享子请求约束。官方文档给出两个数值且未说明关系：
  //    《fetchAPI》「每次可发起 4 个子请求，4 个及以上需申请配额」、
  //    《Cache API》「共享 32 个子请求」。保守取较小值 4（待真机实测确证）。
  //  - ESA 的 put key 必须为 http URL（cacheKeyHttpOnly：引擎不支持 https key）
  const cacheIsNodeLocal = platform === 'eo';
  const cacheSingleInstance = platform === 'esa';
  // cacheSubreqLimit：Cache API 操作与 fetch 共享同一预算。ESA=4（保守，待实测）；
  // CF=50（Free 档硬限；Paid 经 MAX_SUBREQUESTS 提至 1000）；EO=100（官方未单列硬限，
  // 取免费档近似上限避免无限大，详见 subreqBudget.js 的 SUBREQ_LIMITS）。
  const cacheSubreqLimit =
    platform === 'esa' ? 4 :
    platform === 'eo' ? 100 :
    50; // cf：Free 档硬限 50
  const cacheKeyHttpOnly = platform === 'esa';

  // EO Makers 的 KV 是「绑定时自定义名的运行时全局变量」，不通过 env 注入，
  // 故 env.CDN_KV / env.KV 恒为 undefined；需与 kv.js 的 getKV() 对齐，同时查 globalThis。
  const hasNativeKV =
    looksLikeKV(e.CDN_KV) ||
    looksLikeKV(e.KV) ||
    looksLikeKV(safeGlobal('CDN_KV')) ||
    looksLikeKV(safeGlobal('KV'));

  // 双后端并存判定：平台 KV 与自部署 Webdis 各自独立探测，
  // 再由 KV_BACKEND 偏好决定谁生效（默认 Webdis 优先）。
  const hasRedisKV = hasRedisBackend(e);
  const kvPreference = readKvBackendPreference(e);
  const kvEffective = decideKvBackend(hasNativeKV, hasRedisKV, kvPreference);
  // 是否因显式 KV_BACKEND 而偏离了默认（auto）决策——供管理面提示用
  const kvOverridden =
    kvPreference !== 'auto' &&
    kvEffective !== decideKvBackend(hasNativeKV, hasRedisKV, 'auto');

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
    // 每请求子请求（fetch）预算上限（隐藏默认，用户无需设置；详见 docs/dev/17-platform-limits.md
    // 与 platform/subreqBudget.js 的 SUBREQ_LIMITS，二者取值必须保持一致）：
    //   - ESA = 4（保守值；官方 fetchAPI「每次可发起 4 个子请求」与 Cache API「共享 32 个」
    //     两处表述冲突，取较小值，待真机实测；实测 32 有效则改回）
    //   - CF = 50（保守对齐 **Cloudflare Pages Free 档硬限 50/请求**；Paid 档为 1000，但代码
    //     无法探测档位，且 Free 档用户占多数，故以内置 50 规划最安全；确在 Paid 档且站点极多
    //     可经环境变量 MAX_SUBREQUESTS 提到 1000）
    //   - EO = 100（**EO 官方文档未单列子请求硬上限**；用户要求「给大约数值避免无限大」，
    //     取 100 作为免费档近似上限，仅作代码层防护，非官方硬限）
    //   用途：该值由 platform/subreqBudget.js 落地为真实运行时守卫（回源 / 缓存写 / 批读计数），
    //   不再是纯声明——预算耗尽时降级而非盲目重试（详见 failover.js / cache.js / store.js）。
    maxSubRequests:
      platform === 'esa' ? 4 :
      platform === 'eo' ? 100 :
      50, // cf：Free 档硬限 50；Paid=1000 可经 MAX_SUBREQUESTS 覆盖
    // isolate 内存预算上限（字节），供 memBudget 统一内存管理使用。
    // 统一按 128MB 假设规划（CF 标准 128MB、ESA 函数侧 128MB 见 esa.jsonc；
    // ESA 文档 512MB 为企业另一档配额，不在本假设内）。可由环境变量
    // MEM_BUDGET_BYTES 在运行时覆盖（见 platform/memBudget.js）。
    // 预留 64KB 给运行时本身（编译后代码、栈、V8 内部开销），不计入应用内存。
    memBudgetBytes: DEFAULT_MEM_BUDGET_BYTES,
    // 支持「fetch 直连裸 IP / 自定义端口」的平台：
    //   - CF：标准 fetch 直连裸 IP（HTTP 可用；HTTPS + 自定义 SNI 由 fetchEngine 内部走 cloudflare:sockets 兜底）。
    //   - EO：官方文档（cloud.tencent.com/document/product/1552/81897 Fetch 页）列尽的运行时限制
    //         仅含次数/并发/超时，未禁止裸 IP；fetch 基于 Web APIs 标准，允许直接 fetch 裸 IP。
    //         仅 EO 无可编程 TCP，无法在代码层自建 SNI，故「HTTPS + 裸 IP + 自定义 SNI」需走
    //         EO 平台源站组兜底（由控制台回源 Host 注入），代码层不作 sockets 兜底。
    //   - ESA：官方文档明确不支持裸 IP / 自定义端口，false。
    hasRawIpFetch: platform === 'cf' || platform === 'eo',
    // 仅 Cloudflare 有 cloudflare:sockets，用于「Host 头 ≠ URL 主机名（即需要自定义 SNI）」时
    // 的内部自动兜底（CF 上无论裸 IP 还是域名，只要回源 Host 与 URL hostname 不同就需自建 TCP 设 SNI）。
    hasSocket: platform === 'cf',
    hasD1: looksLikeD1(e.CDN_DB) || looksLikeD1(e.DB) || looksLikeD1(e.D1),
    hasKV: hasNativeKV || hasRedisKV,
    // KV 实际生效后端：native（平台 KV）/ redis（自部署 Webdis）/ none
    // ⚠️ 默认（KV_BACKEND 未设或 auto）在两者并存时选 **redis**（自部署 Webdis 优先）
    kvBackend: kvEffective,
    // 双后端各自的「存在性」——供管理面分别展示与分别探测
    kvNative: hasNativeKV,
    kvRedis: hasRedisKV,
    // KV_BACKEND 偏好原始归一值：auto / native / redis
    kvBackendPreference: kvPreference,
    // 是否因显式 KV_BACKEND 覆盖了默认决策
    kvBackendOverridden: kvOverridden,
    // R2 直读回源：仅在 CF 可用，检测常见绑定名
    hasR2:
      platform === 'cf' &&
      (looksLikeR2(e.CDN_R2) ||
        looksLikeR2(e.R2) ||
        Object.values(e).some((v) => looksLikeR2(v))),
    // 「边缘静态托管层」能力：具备则管理面前端资源（/assets/app.{css,js}）可命中
    // 边缘静态层，浏览器重复访问零函数执行次数，最省额度。
    //   - CF：Pages/Workers Static Assets（env.ASSETS 绑定），物理 /assets/* 按 URL 取；
    //   - EO：Makers 静态目录托管（dist/eo-public/ 静态根），URL 物理 /assets/* 直接命中；
    //   - ESA：官方《PAGES构建和路由指南》证实 assets.directory 提供静态托管，静态文件按
    //         「目录结构直接映射」对外暴露（/dist/file.html → /file，/dist/folder/index.html
    //         → /folder/），故 dist/public/assets/app.{css,js} 以物理 /assets/* 可访问；
    //         默认模式（不配 notFoundStrategy）下未命中静态资源则「执行 ER 函数」。故 ESA
    //         同样具备静态托管层（hasStaticHosting=true），管理面走外部 /assets/* 引用。
    // 注：三平台静态资产对外路径都是「与 adminPath 解耦的固定物理 /assets/*」（adminPath 为
    // 运行时可变变量，静态层按目录映射无法感知前缀），仅管理面根 HTML 入口走 /{adminPath}。
    hasStaticHosting: platform === 'eo' || platform === 'cf' || platform === 'esa',
    // 平台单次请求总执行上限（墙钟）：用于推导回源总时间预算硬顶。
    //   - ESA 函数单次执行响应时间上限 = 120s（阿里云官方《什么是函数和Pages》）；
    //     网关等待函数返回首个数据的首字节约束 = 10s，超时网关主动断连返回 504（firstByteMs）。
    //   - EdgeOne 单次请求执行上限 = 120s（docs/appendix/status-codes.md）。
    //   - Cloudflare Workers 默认挂钟上限 = 30s（CPU 上限另计，回源不受 CPU 限制）。
    // 均可被环境变量 EXECUTION_LIMIT_MS / FIRST_BYTE_LIMIT_MS 覆盖（测试/特殊部署）。
    maxExecutionMs: readNumEnv(e, 'EXECUTION_LIMIT_MS') ?? (platform === 'cf' ? 30000 : 120000),
    firstByteMs:
      platform === 'esa'
        ? (readNumEnv(e, 'FIRST_BYTE_LIMIT_MS') ?? 10000)
        : (readNumEnv(e, 'FIRST_BYTE_LIMIT_MS') ?? undefined),
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
