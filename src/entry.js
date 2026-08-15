/**
 * ============================================================================
 * cdn-edge-gateway 统一入口
 * ----------------------------------------------------------------------------
 * 同一份代码同时支持三个平台，靠「双导出」实现，无需条件编译：
 *
 *   Cloudflare Workers     →  export default { fetch }
 *   Cloudflare Pages       →  export async function onRequest(context)
 *   EdgeOne Pages          →  export async function onRequest(context)
 *
 * 该写法参考 Blog-CDN-Gateway 项目，是三平台兼容的最简方案。
 * ============================================================================
 */

import { detectCaps } from './platform/caps.js';
import { preloadKV } from './platform/kv.js';
import { initMemBudget } from './platform/memBudget.js';
import { handleRequest } from './core/app.js';
import { resolveRequestId, REQUEST_ID_HEADER } from './utils/reqid.js';
import { normalizeError, sanitizeMessage } from './utils/errors.js';
import { buildErrorPage } from './errorPage.js';

/**
 * Cloudflare Pages / EdgeOne Pages 入口
 * @param {{request: Request, env: Object, waitUntil?: Function}} context
 */
export async function onRequest(context) {
  const env = context?.env || {};
  // Pages / EdgeOne 的 context 本身带 waitUntil；EdgeOne 部分环境可能没有
  const waitUntil =
    typeof context?.waitUntil === 'function'
      ? context.waitUntil.bind(context)
      : null;
  return dispatch(context.request, env, waitUntil);
}

/**
 * Cloudflare Workers 入口
 */
export default {
  async fetch(request, env = {}, ctx = null) {
    const waitUntil =
      ctx && typeof ctx.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : null;
    return dispatch(request, env || {}, waitUntil);
  },
};

/**
 * 三平台收敛点：构造统一 Ctx 后交给核心 app 处理
 * @param {Request} request
 * @param {Object} env
 * @param {Function|null} waitUntilFn
 * @returns {Promise<Response>}
 */
async function dispatch(request, env, waitUntilFn) {
  // 兜底：某些平台不提供 waitUntil，此时退化为「立即执行但不阻塞返回」
  const pending = [];
  const waitUntil = waitUntilFn
    ? waitUntilFn
    : (p) => {
        // 无 waitUntil 支持时，至少捕获异常避免 unhandled rejection
        pending.push(Promise.resolve(p).catch(() => {}));
      };

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const reqId = resolveRequestId(request);

  const caps = detectCaps(env);

  // 初始化 isolate 级内存预算单例（统一按 128MB 假设，env.MEM_BUDGET_BYTES 可覆盖）。
  // 各内存域（config/stats/ratelimit）在各自模块加载时自注册到该单例，
  // 此处只负责把平台内存上限与运行时 env 注入。幂等，重复调用安全。
  try {
    initMemBudget({ totalBytes: caps.memBudgetBytes, env });
  } catch (e) {
    console.error('[entry] initMemBudget 失败，降级为无统一内存管理:', e?.message);
  }

  // 预热 KV 适配器并填充 isolate 级包装缓存。
  // CF 与 EdgeOne 均通过 CDN_KV / KV 绑定提供 KV，包装是纯同步操作，
  // 此处不产生实际网络开销；store.js 既有的 30s 内存缓存进一步分摊读压力。
  try {
    await preloadKV(env, caps);
  } catch (e) {
    console.error('[entry] preloadKV 失败，配置存储降级为无持久化:', e?.message);
  }

  /** @type {import('./contracts.js').Ctx} */
  const ctx = {
    request,
    url,
    env,
    caps,
    waitUntil,
    startTime: Date.now(),
    reqId,
    debug: {},
  };

  try {
    const response = await handleRequest(ctx);
    return withRequestId(response, reqId);
  } catch (err) {
    // 最外层兜底，绝不让 Worker 崩溃暴露平台错误页。
    // 此处一律按「不可信来源」处理：只记录脱敏后的原因，对外仅给 reqId。
    const appErr = normalizeError(err);
    console.error(
      `[entry] unhandled error reqId=${reqId} code=${appErr.code} msg=${sanitizeMessage(appErr.message)}`,
      appErr.cause instanceof Error ? appErr.cause.stack : undefined
    );
    // 返回「仿 Cloudflare 5xx 伪装页」而非裸文本：保留正确状态码（502/503/500），
    // 随机 Ray ID + 大区文案用于防盗刷 / 防探测；真实内部细节不出现。
    // 强制边缘缓存：失败路径（如被探测的坏 URL）会被 Cloudflare 边缘缓存 60s，
    // 命中后不再进入本 Worker，避免反复消耗 Workers 请求数（防盗刷的关键一环）。
    const status = appErr.status || 500;
    const html = buildErrorPage({
      status,
      code: appErr.code,
      reqId,
      domain: url ? url.hostname : '',
    });
    return new Response(html, {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=60',
        'x-robots-tag': 'noindex, nofollow',
        [REQUEST_ID_HEADER]: reqId,
      },
    });
  }
}

/**
 * 给响应补上 X-Request-Id。
 *
 * Response 的 headers 在部分运行时是 immutable（如缓存命中返回的对象），
 * 直接 set 会抛异常，因此失败时原样返回，不影响主链路。
 *
 * @param {Response} response
 * @param {string} reqId
 * @returns {Response}
 */
function withRequestId(response, reqId) {
  if (!response || !reqId) return response;
  try {
    if (response.headers.has(REQUEST_ID_HEADER)) return response;
    response.headers.set(REQUEST_ID_HEADER, reqId);
    return response;
  } catch {
    // headers immutable：重建一个可写副本。
    // 注意 204/304 等无 body 状态码不能带 body，否则运行时会抛错。
    try {
      const h = new Headers(response.headers);
      h.set(REQUEST_ID_HEADER, reqId);
      const noBody = response.status === 204 || response.status === 304;
      return new Response(noBody ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: h,
      });
    } catch {
      return response;
    }
  }
}
