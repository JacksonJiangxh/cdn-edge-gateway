/**
 * ============================================================================
 * 核心请求分发器
 * ----------------------------------------------------------------------------
 * 职责：判断请求属于「管理面」「管理 API」还是「数据面(CDN 代理)」，分别路由。
 *
 * 路由优先级：
 *   1. /{adminPath}/api/*   → 管理 API（需鉴权）
 *   2. /{adminPath}         → 管理面 HTML
 *   3. /__health            → 健康检查（无需鉴权，仅返回存活标识）
 *   4. 其余全部              → CDN 数据面代理
 *
 * 安全设计：adminPath 是可配置的随机路径（默认 __panel，强烈建议用户修改）。
 * 未命中管理面时，行为与普通数据面完全一致，不泄露管理面存在的任何痕迹。
 * ============================================================================
 */

import { getGlobal } from '../config/store.js';
import { handleApi } from '../api/router.js';
import { renderAdminPage, tryServePanelStatic } from '../api/adminPage.js';
import { handleProxy } from '../proxy/pipeline.js';
import { renderDisguise } from '../proxy/disguise.js';
import { flush } from '../stats/collector.js';
import { getBudgetSnapshot } from '../platform/memBudget.js';

/**
 * 请求主入口
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<Response>}
 */
export async function handleRequest(ctx) {
  const { url } = ctx;
  const pathname = url.pathname;

  // ---- 健康检查：不读 KV，用于探活与部署验证 ----
  if (pathname === '/__health') {
    // memBudget 快照：暴露各域配额使用与估算内存占用（统一内存预算可观测性）。
    // 未初始化时返回 null，不影响探活。
    let memBudget = null;
    try {
      memBudget = getBudgetSnapshot();
    } catch {
      memBudget = null;
    }
    return new Response(
      JSON.stringify({
        ok: true,
        platform: ctx.caps.platform,
        caps: ctx.caps,
        memBudget,
        time: new Date().toISOString(),
      }),
      { headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  }

  // ---- 读取全局配置以确定管理面路径 ----
  // 注意：getGlobal 内部有 isolate 内存缓存，正常情况不会每请求都打 KV
  let global;
  try {
    global = await getGlobal(ctx);
  } catch (err) {
    console.error('[app] getGlobal failed:', err?.message);
    global = null;
  }

  const adminPath = normalizeSeg(global?.adminPath) || '__panel';
  const adminPrefix = `/${adminPath}`;

  // ---- 管理面域名白名单校验 ----
  // adminDomain 留空（默认）= 任何绑定到本运行时的域名 + adminPrefix 都进入管理面（兼容旧逻辑）。
  // adminDomain 非空 = 仅「该域名（忽略大小写、去除端口）」+ adminPrefix 才进入管理面，
  // 其余域名即便 path 命中也按数据面代理处理，规避跨域探测与越界访问。
  const adminDomain = global?.adminDomain ? String(global.adminDomain).trim().toLowerCase() : '';
  const reqHost = ctx.url?.hostname ? ctx.url.hostname.toLowerCase() : '';
  const hostOk = adminDomain === '' || (reqHost !== '' && reqHost === adminDomain);

  // ---- 管理面与管理 API ----
  if (hostOk && (pathname === adminPrefix || pathname.startsWith(adminPrefix + '/'))) {
    const rest = pathname.slice(adminPrefix.length); // '' | '/' | '/api/xxx'

    // 管理 API
    if (rest === '/api' || rest.startsWith('/api/')) {
      const subPath = rest.slice('/api'.length) || '/';
      return handleApi(ctx, subPath, global);
    }

    // 管理面页面与静态资源（仅 GET/HEAD）
    if (rest === '' || rest === '/' || rest === '/index.html' ||
        rest.startsWith('/assets/')) {
      if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      // 优先尝试静态资源服务（dist/public 托管或 worker 内兜底透传），
      // 命中则零额外 KV 读、且可带长期缓存头；未命中（如未构建）回退内联 HTML。
      // 传入真实 adminPath，使静态资源路径与运行时路由对齐（CF / EO 通用）。
      const staticRes = await tryServePanelStatic(ctx, ctx.request, adminPath);
      if (staticRes) return staticRes;
      return renderAdminPage(ctx, adminPath);
    }

    // 管理面下的未知路径：返回与数据面兜底完全一致的伪装页。
    // 若这里返回裸 404，攻击者就能通过「404 vs 伪装页」的差异枚举出 adminPath。
    return renderDisguise(ctx, global?.disguise);
  }

  // ---- 数据面：CDN 代理 ----
  const response = await handleProxy(ctx);

  // 统计落盘（内存聚合，满足阈值才真正写入，见 stats/collector.js）
  try {
    ctx.waitUntil(flush(ctx));
  } catch {
    /* 统计失败绝不影响主流程 */
  }

  return response;
}

/**
 * 规范化路径段：去掉首尾斜杠与空白，防止配置里写成 "/__panel/" 导致匹配失败
 * @param {string|undefined} seg
 * @returns {string}
 */
function normalizeSeg(seg) {
  if (!seg || typeof seg !== 'string') return '';
  return seg.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}
