// cdn-edge-gateway — EdgeOne Makers 边缘函数薄壳
//
// 对齐 2026 官方 Makers 范式（目录 ./edge-functions/、Catch-all 文件名 [[default]].js）。
// 本文件不承载任何业务逻辑，仅把请求转发给打包产物 _worker.js，
// 由它内部的 onRequest(context) 统一处理数据面代理与 /__panel/api/* 管理面。
//
// 为什么全部动态请求收口在 Edge Functions（而非分流给 cloud-functions）：
//   本项目配置存储只用 KV（站点/源站池/规则全部存 KV），而官方明确：
//     「EdgeOne Makers KV 当前仅支持在 Edge Functions 中使用」。
//   数据面代理 handleProxy 必须与 /__panel/api/* 一样读 KV 才能拿到站点与源站配置，
//   因此 Cloud Functions（云端 Node）拿不到 CDN_KV，无法承载任何需要配置的请求。
//   在「KV-only」现状下，全站动态请求都必须在 Edge Functions 跑通——这是硬约束，不是取舍。
//
// Cloud Functions 的预留角色（见同仓 cloud-functions/README.md）：
//   承载「不依赖 KV 的重活」——大数据转码、AI 推理、独立 MySQL/Blob 业务、后台批处理等。
//   一旦引入这类场景，应在 cloud-functions/ 下新增路由，而非塞进本 Edge 入口。
//   跨平台存储统一策略：CF 侧未来用 D1、EO 侧对应用 Blob（对象存储，cloud-functions 经 SDK 访问），
//   两者封装在同一存储抽象层之后，调用方无感知（详见 docs/10-architecture.md 的「存储抽象」章节）。
//
// 静态资源（dist/public/ 下的 index.html、assets/*）由 Makers 自动托管，
// 与函数路由冲突时静态资源优先，无需在 edgeone.json 里写 routes。
//
// 参考：Tencent Cloud EdgeOne Makers 文档（Functions > 概览 / Cloud Functions > Node.js）

// 复用同一打包产物：CF Workers / EO Edge Function 共用。
// _worker.js（由 src/entry.js 打包）同时 export default { fetch }（CF Workers 范式）
// 与 export async function onRequest(context)（Pages/EO 范式）。为与 esa/index.js
// 薄壳保持对称、避免将来入口约定变化时 EO 链路断裂，这里同时转发两者。
import _worker, { onRequest as _onRequest } from '../_worker.js';

/**
 * EO V8 运行时兼容性垫片（仅 EdgeOne 薄壳内生效，不影响 CF / ESA 共用代码）。
 *
 * EO edge-functions 的 V8 runtime 与 Cloudflare workerd 存在差异，基于
 * .codebuddy/skills/edgeone-makers-tools 实证的约束：
 *   1. Response.json() 在 EO V8 runtime 不可用（runtime error，非 lint warning）。
 *   2. new Headers(...) 为 lint 禁忌（运行时通常可用，这里做防御性兜底）。
 *
 * 为「不改 src/ 共用代码、不影响 CF 路径」，仅在 EO 薄壳入口做一次运行时补丁：
 *   - 若 Response.json 缺失则补一个标准实现（new Response(JSON.stringify(...))）；
 *   - 若 Headers 全局缺失（极端场景）则补一个最小实现。
 * 这些补丁对所有经由本薄壳的请求透明生效，CF Workers 与 ESA 的 _worker.js
 * 入口不经过本文件，故完全不受影响。
 */
function installEoRuntimePolyfills() {
  try {
    if (typeof Response !== 'undefined' && typeof Response.json !== 'function') {
      // 静态方法补丁：保持与标准 Response.json 一致的最小签名
      Response.json = function json(data, init) {
        const headers = (init && init.headers) || { 'content-type': 'application/json' };
        return new Response(JSON.stringify(data), { ...init, headers });
      };
    }
    if (typeof Headers === 'undefined') {
      // 极端防御：EO 实际支持 new Headers，此分支几乎不触发
      globalThis.Headers = class {
        constructor(init) {
          this._m = new Map();
          if (init) {
            if (init instanceof Headers) init.forEach((v, k) => this._m.set(k.toLowerCase(), v));
            else if (Array.isArray(init)) init.forEach(([k, v]) => this._m.set(String(k).toLowerCase(), v));
            else if (typeof init === 'object') Object.entries(init).forEach(([k, v]) => this._m.set(k.toLowerCase(), v));
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
}

/**
 * 合并出运行时 env，并强制补齐平台声明（与 esa/index.js 的 resolveEnv 对称）。
 *
 * 为什么必须兜底：CLOUD_PLATFORM 缺失会让 caps.js 启动即抛错。CF Workers 侧
 * 由 wrangler.toml 的 [vars] 随 deploy 注入，但 EO Makers 侧的 edgeone.json
 * "env" 主要作用于构建期，未必透传到边缘运行时；若只依赖用户在控制台手工
 * 添加变量，一旦漏配就是全站 500。这里在薄壳内固定补 'eo'，使 EO 部署
 * 「零手工配置」即可运行；用户若在控制台显式设了值，则以控制台的为准。
 *
 * @param {any} passedEnv 平台注入的 env
 * @returns {Object} 合并后的 env
 */
function resolveEnv(passedEnv) {
  let base = {};
  if (passedEnv && typeof passedEnv === 'object') {
    base = passedEnv;
  } else if (typeof process !== 'undefined' && process.env && typeof process.env === 'object') {
    base = process.env;
  }
  if (!base.CLOUD_PLATFORM) {
    base = { ...base, CLOUD_PLATFORM: 'eo' };
  }
  return base;
}

export default {
  async fetch(request, env, ctx) {
    installEoRuntimePolyfills();
    const resolvedEnv = resolveEnv(env);
    const waitUntil =
      ctx && typeof ctx.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : null;
    if (_worker && typeof _worker.fetch === 'function') {
      return _worker.fetch(request, resolvedEnv, { waitUntil });
    }
    return _onRequest({ request, env: resolvedEnv, waitUntil });
  },
};

export async function onRequest(context) {
  installEoRuntimePolyfills();
  return _onRequest({
    request: context.request,
    env: resolveEnv(context?.env),
    waitUntil:
      context && typeof context.waitUntil === 'function'
        ? context.waitUntil.bind(context)
        : null,
  });
}
