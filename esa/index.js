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
//   3. 强制补 CLOUD_PLATFORM=aliyun-esa（若未设），确保 caps.js 准确探测。
// 这样无论 ESA 走哪种传参，_worker.js 内部探测与 KV（EdgeKV 全局类 /
// REDIS_URL）都能正确拿到配置。
//
// === 平台约束（来自官方文档 + 成本策略）===
//   - 无 caches.default，边缘缓存走响应头委托（cache.js 已含 EO 同构分支）。
//   - 每请求子请求上限 = 4（数据面稳态仅 1 个回源 fetch，安全）。
//   - 持久化：ESA 的 EdgeKV 按量收费且无免费额度，本项目在 ESA 上**统一禁用厂商
//     KV**，强制使用外置 REDIS_URL（自建 Webdis/Redis，见 kv.js 的 ESA 分支）。
//     → 部署 ESA 前必须在控制台设 REDIS_URL，否则配置无法保存（见 store.js requireKV）。
//
// 参考：阿里云 ESA 帮助文档「PAGES构建和路由指南」「使用边缘函数查看KV中的KEY值」

import { onRequest as _onRequest, default as _default } from '../_worker.js';

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
  // 强制平台声明，避免 caps.js 因 env 缺失而误判 unknown
  if (!base.CLOUD_PLATFORM) {
    base = { ...base, CLOUD_PLATFORM: 'aliyun-esa' };
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
