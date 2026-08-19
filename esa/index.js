// cdn-edge-gateway — 阿里云 ESA Functions / Pages 入口薄壳
//
// 对齐 ESA 官方 Pages 构建约定（esa.jsonc 的 `entry` 字段指向本文件）。
// 本文件不承载任何业务逻辑，仅把请求转发给统一打包产物 _worker.js。
//
// === ESA 入口范式（来自官方文档《使用边缘函数查看KV中的KEY值》）===
//   export default { async fetch(request) { ... } }
// 即 CF Workers 同构范式。本项目 _worker.js 已原生 export default { fetch }，
// 故本薄壳直接转发 default.fetch，几乎零成本。
//
// === env 注入不确定性 ===
// ESA 文档示例 fetch 只写 request 一个参数，但 CF Workers 范式是
// fetch(request, env, ctx)。为兼容两种可能，本薄壳：
//   1. 若 fetch 被传入第二参数 env，优先使用；
//   2. 否则回退到 process.env（ESA 构建文档确认运行时可读 process.env）；
//   3. 强制补 CLOUD_PLATFORM=esa（规范值，若未设），确保 caps.js 准确探测。
// 这样无论 ESA 走哪种传参，_worker.js 内部探测与 KV（EdgeKV 全局类 /
// REDIS_URL）都能正确拿到配置。
//
// === 平台约束（依据阿里云 ESA 官方文档）===
//   - Cache API 可用：官方《Cache API》文档确认 ESA 提供全局 `cache` 单实例
//     （cache.put / cache.get / cache.delete）。caps.js 据此把 ESA 的 hasCacheApi /
//     hasEdgeCache 置 true；注意 ESA 是单实例、无 caches.default / open 命名空间。
//   - 每请求子请求预算（官方文档存在两处表述，二者关系官方未说明，按保守值取小）：
//     · 《fetchAPI》文档 L5/L26：「目前每次可以发起 4 个子请求；需要 4 个及以上需申请配额」。
//     · 《Cache API》文档：「Cache 操作与 fetch 共享 32 个子请求约束」。
//     → 二者冲突，官方未统一口径；本项目取较小值 **4** 作为运行时安全预算
//       （maxSubRequests=4、cacheSubreqLimit=4），并标注「待真机实测确证」。
//       数据面稳态仅 1 个回源 fetch（+ 至多 1 个静态同站 fetch）≈ 2，仍在 4 内，安全。
//     * 注：若真机实测证实 32 为有效硬上限，再把两值调回 32 即可（单点修改）。
//   - 持久化：
//     本项目为 ESA 提供两种持久化形态，**按 REDIS_URL 是否配置自动选择**：
//     (A) 外置自部署 Webdis（首选）：只要控制台配置了 REDIS_URL（或 REDIS_URL_KV），
//         resolveEnv 就【不再】注入 STATIC_CONFIG=1，ESA 直接进入可写模式，
//         管理面可正常保存配置（与 CF / EO 行为一致）。见 platform/redis-kv.js。
//     (B) 静态烘焙配置（兜底）：**未配置 REDIS_URL** 时才默认注入 STATIC_CONFIG=1，
//         运行时直接读取源码内置的 src/config/baked.generated.js（由主节点「导出配置」
//         后构建生成、git 不追踪），完全不依赖任何 KV / Redis。ESA 成为纯只读的
//         边缘执行壳，配置变更 = 重新导出 + 重新构建部署。
//     两种形态均可被控制台显式覆盖：显式 STATIC_CONFIG=1 强制只读烘焙（即使配了
//     REDIS_URL）；显式 STATIC_CONFIG=0/false 强制可写（无 REDIS_URL 时配置无法
//     保存，见 store.js requireKV）。
//     注：ESA 的厂商 EdgeKV 按量收费且无免费额度，本项目统一禁用（见 kv.js）。
//
// 参考：阿里云 ESA 帮助文档「PAGES构建和路由指南」「使用边缘函数查看KV中的KEY值」

import { onRequest as _onRequest, default as _default } from '../_worker.js';

/**
 * ESA 运行时兼容性垫片（仅 ESA 薄壳内生效，不影响 CF / EO 共用代码）。
 *
 * 参照 EO 薄壳的 installEoRuntimePolyfills 思路：把「平台差异补丁」收口在薄壳，
 * 不污染 src/ 三平台共用代码。文档依据的 ESA 差异（源：《RuntimeAPI手册》《fetchAPI.md》）：
 *   1. Response.json 静态方法：ESA RuntimeAPI 手册列出的 Response 为标准 Response，
 *      标准 Response 含 json() 静态方法；为稳健起见，仅在运行时确实缺失该静态方法时
 *      补一个标准实现（new Response(JSON.stringify(...))），避免返回 JSON 的管理面 API 5xx。
 *   2. Headers 全局：ESA 支持 new Headers（RuntimeAPI 手册已列），此处做极端防御性兜底（几乎不触发）。
 *   3. console：官方《RuntimeAPI手册》明确 ESA **同时支持 console.log() 与 console.alert()**
 *      两种方法（log 用于控制台调试环境 debug 打印，alert 用于输出关键信息至日志）。
 *      故无需把 log 代理到 alert——本项目不再做 log→alert 重定向，避免改变既有日志语义。
 *      下方代理逻辑改为：仅在 console.alert 真实存在、且 console.log 不存在时才把
 *      log 兜底到 alert（双保险，正常情况下不触发）。
 */
function installEsaRuntimePolyfills() {
  try {
    if (typeof Response !== 'undefined' && typeof Response.json !== 'function') {
      Response.json = function json(data, init) {
        const headers = (init && init.headers) || { 'content-type': 'application/json' };
        return new Response(JSON.stringify(data), { ...init, headers });
      };
    }
    if (typeof Headers === 'undefined') {
      globalThis.Headers = class {
        constructor(init) {
          this._m = new Map();
          if (init) {
            if (init instanceof Headers) init.forEach((v, k) => this._m.set(k.toLowerCase(), v));
            else if (Array.isArray(init)) init.forEach(([k, v]) => this._m.set(String(k).toLowerCase(), v));
            else if (typeof init === 'object') Object.entries(init).forEach(([k, v]) => this._m.set(String(k).toLowerCase(), v));
          }
        }
        get(k) { return this._m.get(String(k).toLowerCase()); }
        set(k, v) { this._m.set(String(k).toLowerCase(), v); }
        has(k) { return this._m.has(String(k).toLowerCase()); }
        delete(k) { return this._m.delete(String(k).toLowerCase()); }
        forEach(fn) { this._m.forEach((v, k) => fn(v, k, this)); }
        get entries() { return this._m.entries.bind(this._m); }
        [Symbol.iterator]() { return this._m.entries(); }
      };
    }
  } catch {
    /* 补丁失败不阻断主流程 */
  }

  try {
    // 官方《RuntimeAPI手册》：ESA 同时支持 console.log() 与 console.alert()，二者都可用，
    // 故无需把 log 重定向到 alert（会改变既有日志语义 / 双写噪声）。
    // 仅当运行时的 console.log 缺失、但 console.alert 存在时，才把 log/info/warn/error
    // 兜底到 alert，保证排障日志仍有出口（极端运行时差异兜底，正常不触发）。
    if (
      typeof console !== 'undefined' &&
      typeof console.alert === 'function' &&
      typeof console.log !== 'function'
    ) {
      const alert = console.alert.bind(console);
      const prefix = (label) => (msg, ...rest) => {
        try {
          const s = typeof msg === 'string' ? msg : JSON.stringify(msg);
          alert(`[${label}] ${s}`, ...rest);
        } catch {
          /* alert 异常不影响主流程 */
        }
      };
      console.log = prefix('log');
      if (typeof console.info !== 'function') console.info = prefix('info');
      if (typeof console.warn !== 'function') console.warn = prefix('warn');
      if (typeof console.error !== 'function') console.error = prefix('error');
    }
  } catch {
    /* 日志代理失败不阻断主流程 */
  }
}

/**
 * 合并出运行时 env：优先 fetch 第二参数，回退 process.env，强制平台声明。
 * @param {any} passedEnv fetch 可能传入的 env（CF Workers 范式第二参数）
 * @returns {Object} 合并后的 env
 */
function resolveEnv(passedEnv) {
  let base = {};
  if (passedEnv && typeof passedEnv === 'object') {
    base = passedEnv;
  } else if (typeof process !== 'undefined' && process.env && typeof process.env === 'object') {
    base = process.env;
  }
  // 强制平台声明，避免 caps.js 因 env 缺失而误判 unknown。
  // 用规范值 esa（旧版用 aliyun-esa，caps.js 现已归一，但保持规范写法）。
  if (!base.CLOUD_PLATFORM) {
    base = { ...base, CLOUD_PLATFORM: 'esa' };
  }
  // 「静态烘焙配置」仅作为**无外置 KV 时的兜底**：
  //   - 配了 REDIS_URL（自部署 Webdis）→ 不注入 STATIC_CONFIG，ESA 进入可写模式，
  //     与 CF / EO 行为一致（管理面可保存配置）。
  //   - 未配 REDIS_URL           → 默认注入 STATIC_CONFIG=1，读源码内置烘焙配置，
  //     ESA 成为纯只读边缘执行壳（避免「既不能读配置也不能保存」的死状态）。
  // 显式设置一律尊重：STATIC_CONFIG=1 即使配了 REDIS_URL 也强制只读烘焙；
  // STATIC_CONFIG=0/false 强制可写。
  const explicit =
    base.STATIC_CONFIG !== undefined &&
    base.STATIC_CONFIG !== null &&
    base.STATIC_CONFIG !== '';
  if (explicit) {
    // 归一化显式真值为 '1'，其余（'0'/'false' 等）原样交给 store.isBakedMode 判定
    if (base.STATIC_CONFIG === true || base.STATIC_CONFIG === '1') {
      base = { ...base, STATIC_CONFIG: '1' };
    }
    return base;
  }

  const redisUrl = base.REDIS_URL || base.REDIS_URL_KV;
  const hasRedis = typeof redisUrl === 'string' && redisUrl.trim() !== '';
  if (!hasRedis) {
    base = { ...base, STATIC_CONFIG: '1' };
  }
  return base;
}

/**
 * ESA Pages / Functions 主入口（CF Workers 同构范式）。
 * @param {Request} request
 * @param {Object} [env] 可能由平台注入（CF Workers 范式）
 * @param {{waitUntil?: Function}} [ctx]
 */
export default {
  async fetch(request, env, ctx) {
    installEsaRuntimePolyfills();
    if (_default && typeof _default.fetch === 'function') {
      const resolvedEnv = resolveEnv(env);
      const waitUntil =
        ctx && typeof ctx.waitUntil === 'function'
          ? ctx.waitUntil.bind(ctx)
          : null;
      return _default.fetch(request, resolvedEnv, { waitUntil });
    }
    // 极端兜底：default.fetch 不存在时用 onRequest 包装
    return _onRequest({
      request,
      env: resolveEnv(env),
      waitUntil: ctx && ctx.waitUntil ? ctx.waitUntil.bind(ctx) : null,
    });
  },
};

// 同时保留 CF Pages / EO 同构范式（若 ESA 某形态以 onRequest(context) 调用）。
export async function onRequest(context) {
  installEsaRuntimePolyfills();
  const env = resolveEnv(context?.env);
  return _onRequest({
    request: context.request,
    env,
    waitUntil:
      context && typeof context.waitUntil === 'function'
        ? context.waitUntil.bind(context)
        : null,
  });
}
