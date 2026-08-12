/**
 * ============================================================================
 * 管理 API 路由
 * ----------------------------------------------------------------------------
 * 所有路径均相对于 /{adminPath}/api
 *
 * 设计：声明式路由表 + 中间件式鉴权。
 *
 * 每条路由自带 `auth` 元数据，鉴权由统一的中间件链执行，而不是在入口处
 * 用 PUBLIC_PATHS 黑/白名单硬编码。这样做的好处是：
 *   1. 新增路由时「要不要鉴权」是必填项，不会因为忘记加进白名单而意外裸奔；
 *   2. 鉴权判定发生在**路由匹配之后**，未匹配的路径直接 404，
 *      不会因为先过鉴权而把「接口是否存在」的信息泄露给未认证用户。
 *
 * 错误处理统一走 failFrom()：业务错误(expose=true)回传真实原因，
 * 系统错误(expose=false)对外只给「服务器内部错误」+ reqId。
 * ============================================================================
 */

import { ok, failFrom } from '../utils/response.js';
import {
  NotFoundError,
  ValidationError,
  AuthenticationError,
  sanitizeMessage,
} from '../utils/errors.js';
import { authenticate } from '../security/auth.js';
import * as authH from './handlers/auth.js';
import * as sitesH from './handlers/sites.js';
import * as poolsH from './handlers/pools.js';
import * as cacheH from './handlers/cache.js';
import * as statsH from './handlers/stats.js';
import * as systemH from './handlers/system.js';
import * as configH from './handlers/config.js';
import * as rulesH from './handlers/rules.js';
import * as kvH from './handlers/kv.js';

/**
 * 路由表。
 *
 * `path` 为字符串时做全等匹配；为正则时，捕获组会作为参数传给 handler
 * （经 decodeParam 校验，非法则 400）。
 *
 * `auth: false` 必须显式声明，缺省视为需要鉴权 —— 安全默认值。
 *
 * @type {ReadonlyArray<{
 *   method: string,
 *   path: string|RegExp,
 *   auth?: boolean,
 *   paramName?: string,
 *   handler: Function
 * }>}
 */
const ROUTES = Object.freeze([
  // ---------- auth ----------
  { method: 'POST', path: '/auth/login', auth: false, handler: (ctx, g) => authH.login(ctx, g) },
  { method: 'POST', path: '/auth/logout', auth: true, handler: (ctx) => authH.logout(ctx) },
  { method: 'GET', path: '/auth/me', auth: false, handler: async (ctx) => {
    const claims = await authenticate(ctx);
    return ok({ authed: !!(claims && claims.sub) });
  } },
  { method: 'POST', path: '/auth/password', handler: (ctx, g) => authH.changePassword(ctx, g) },

  // ---------- sites ----------
  { method: 'GET', path: '/sites', handler: (ctx) => sitesH.list(ctx) },
  // 必须排在 /sites/:host 之前，否则 'templates' 会被当成 host 匹配掉
  { method: 'GET', path: '/sites/templates', handler: () => sitesH.templates() },
  { method: 'GET', path: /^\/sites\/([^/]+)$/, paramName: 'host', handler: (ctx, g, host) => sitesH.get(ctx, host) },
  { method: 'PUT', path: /^\/sites\/(.+)\/basics$/, paramName: 'host', handler: (ctx, g, host) => sitesH.saveBasics(ctx, host) },
  { method: 'PUT', path: /^\/sites\/(.+)\/rules$/, paramName: 'host', handler: (ctx, g, host) => sitesH.saveRules(ctx, host) },
  { method: 'PUT', path: /^\/sites\/(.+)\/security$/, paramName: 'host', handler: (ctx, g, host) => sitesH.saveSecurity(ctx, host) },
  { method: 'PUT', path: /^\/sites\/([^/]+)$/, paramName: 'host', handler: (ctx, g, host) => sitesH.put(ctx, host) },
  { method: 'DELETE', path: /^\/sites\/([^/]+)$/, paramName: 'host', handler: (ctx, g, host) => sitesH.remove(ctx, host) },

  // ---------- pools ----------
  { method: 'GET', path: '/pools', handler: (ctx) => poolsH.list(ctx) },
  { method: 'POST', path: '/pools', handler: (ctx) => poolsH.create(ctx) },
  { method: 'GET', path: /^\/pools\/([^/]+)\/refs$/, paramName: 'pool id', handler: (ctx, g, id) => poolsH.refs(ctx, id) },
  { method: 'GET', path: /^\/pools\/([^/]+)$/, paramName: 'pool id', handler: (ctx, g, id) => poolsH.get(ctx, id) },
  { method: 'PUT', path: /^\/pools\/([^/]+)$/, paramName: 'pool id', handler: (ctx, g, id) => poolsH.put(ctx, id) },
  { method: 'DELETE', path: /^\/pools\/([^/]+)$/, paramName: 'pool id', handler: (ctx, g, id) => poolsH.remove(ctx, id) },

  // ---------- 全站通用规则（兜底）----------
  { method: 'GET', path: '/rules/global', handler: (ctx) => rulesH.listGlobal(ctx) },
  { method: 'PUT', path: '/rules/global', handler: (ctx) => rulesH.putGlobal(ctx) },

  // ---------- cache ----------
  { method: 'POST', path: '/cache/purge', handler: (ctx) => cacheH.purge(ctx) },

  // ---------- stats ----------
  { method: 'GET', path: '/stats/overview', handler: (ctx) => statsH.overview(ctx) },
  { method: 'GET', path: /^\/stats\/host\/(.+)$/, paramName: 'host', handler: (ctx, g, host) => statsH.byHost(ctx, host) },

  // ---------- system ----------
  { method: 'GET', path: '/system/info', handler: (ctx, g) => systemH.info(ctx, g) },
  { method: 'GET', path: '/system/export', handler: (ctx) => systemH.exportAll(ctx) },
  { method: 'POST', path: '/system/import', handler: (ctx) => systemH.importAll(ctx) },

  // ---------- config ----------
  { method: 'GET', path: '/config/global', handler: (ctx) => configH.get(ctx) },
  { method: 'PUT', path: '/config/global', handler: (ctx) => configH.put(ctx) },

  // ---------- KV 直读直写 + Redis/Webdis 连通性探测（无原生 KV 平台兜底）----------
  // 注意顺序：/kv/ping 必须在 /kv/:key 之前，否则 'ping' 会被当成 key 匹配
  { method: 'GET', path: '/kv/ping', handler: (ctx) => kvH.ping(ctx) },
  { method: 'GET', path: '/kv', handler: (ctx) => kvH.listKeys(ctx) },
  { method: 'GET', path: /^\/kv\/([^/]+)$/, paramName: 'key', handler: (ctx, g, key) => kvH.getKey(ctx, key) },
  { method: 'PUT', path: /^\/kv\/([^/]+)$/, paramName: 'key', handler: (ctx, g, key) => kvH.putKey(ctx, key) },
  { method: 'DELETE', path: /^\/kv\/([^/]+)$/, paramName: 'key', handler: (ctx, g, key) => kvH.delKey(ctx, key) },
]);

/**
 * 管理 API 总入口
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} subPath 形如 '/sites/img.a.com'
 * @param {Object|null} global 已加载的全局配置
 * @returns {Promise<Response>}
 */
export async function handleApi(ctx, subPath, global) {
  const method = ctx.request.method.toUpperCase();
  const reqId = ctx.reqId;

  // 标记这是「管理面」请求：store 层据此让读路径绕过 L1 内存缓存，
  // 直接读 KV，确保「新建/删除/修改后立刻列表可见」，不被跨 isolate
  // 的 L1 陈旧缓存误导（数据面仍走完整 L1 缓存以保性能）。
  ctx.mgmt = true;

  // CORS 预检：管理面与 API 同源，理论上不会触发，保险起见处理
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const path = subPath.replace(/\/+$/, '') || '/';

  try {
    const matched = matchRoute(method, path);
    if (!matched) {
      throw new NotFoundError(`接口不存在: ${method} ${path}`);
    }

    // ---- 鉴权中间件：默认需要鉴权，仅 auth:false 放行 ----
    if (matched.route.auth !== false) {
      if (!(await isAuthed(ctx))) {
        throw new AuthenticationError('未登录或登录已过期');
      }
    }

    // ---- 路径参数校验 ----
    let param;
    if (matched.raw !== undefined) {
      param = decodeParam(matched.raw);
      if (!param) {
        throw new ValidationError(`非法的 ${matched.route.paramName || '路径'} 参数`);
      }
    }

    // ---- CSRF 防护：写入类方法校验同源 ----
    // 管理面与 API 同源，跨站页面构造的请求（form / fetch with credentials）会带 Origin，
    // 且 Origin 会指向攻击者的域。登录态走 Cookie，若不校验 Origin，任意第三方页面即可
    // 以管理员身份发起写入（如改 origin、清缓存、logout 踢人）。
    const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);
    if (WRITE_METHODS.has(method)) {
      await assertSameOrigin(ctx);
    }

    return await matched.route.handler(ctx, global, param);
  } catch (err) {
    // 仅对非预期错误打日志；业务错误(expose)属正常流程，无需污染日志
    if (!err || err.expose !== true) {
      console.error(
        `[api] error reqId=${reqId} ${method} ${path}: ${sanitizeMessage(err?.message)}`,
        err?.stack
      );
    }
    return failFrom(err, { reqId });
  }
}

/**
 * 在路由表中查找匹配项。
 * @param {string} method
 * @param {string} path
 * @returns {{route: Object, raw?: string}|null}
 */
function matchRoute(method, path) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;

    if (typeof route.path === 'string') {
      if (route.path === path) return { route };
      continue;
    }

    const m = path.match(route.path);
    if (m) return { route, raw: m[1] };
  }
  return null;
}

/**
 * 校验请求是否已登录。
 *
 * authenticate() 成功时返回 JWT 的 claims 对象（形如 `{ sub:'admin', iat, exp }`），
 * 失败时返回 null。签名校验、alg 降级防护、exp/nbf 过期判断均已在
 * security/auth.js 的 verifyToken() 内完成，此处只需确认主体存在。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<boolean>}
 */
async function isAuthed(ctx) {
  try {
    const claims = await authenticate(ctx);
    return !!(claims && claims.sub);
  } catch {
    return false;
  }
}

/**
 * 同源校验（CSRF 防护）。
 *
 * 浏览器对跨站请求会自动带上 Cookie，但 CORS 规范下「带凭据的跨站 fetch」不会真正
 * 发出（被浏览器拦截），攻击者可改用 `<form>` / `<img>` 等方式绕过 CORS 发起简单请求。
 * 这类请求必然带 `Origin` 且指向攻击者域；同源页面则不带 Origin 或 Origin 与主站一致。
 * 据此拒绝任何 Origin 与本站不符的写入类请求。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<void>}
 * @throws {AuthenticationError} 跨站请求
 */
async function assertSameOrigin(ctx) {
  const origin = ctx.request.headers.get('origin');
  // 无 Origin 视为同源（浏览器同源请求不带 Origin；非浏览器工具不带则放行，由鉴权兜底）
  if (!origin) return;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AuthenticationError('非法的 Origin 头');
  }
  const selfHost = (() => {
    try {
      return new URL(ctx.request.url).host;
    } catch {
      return null;
    }
  })();
  if (selfHost && originHost !== selfHost) {
    throw new AuthenticationError('跨站请求被拒绝（CSRF 防护）');
  }
}

/**
 * 安全解码路径参数，失败返回空串。
 *
 * 先对原始串做一次特征检查，再解码后复检 —— 两段式是为了拦住
 * 双重编码绕过（如 `%252e%252e` 解一次得到 `%2e%2e`，再解才是 `..`）。
 *
 * @param {string} s 原始（未解码）路径片段
 * @returns {string} 合法值，非法时为空串
 */
function decodeParam(s) {
  if (typeof s !== 'string' || s === '') return '';

  let v;
  try {
    v = decodeURIComponent(s).trim();
  } catch {
    // 非法的百分号序列（如孤立的 '%'）
    return '';
  }
  if (!v) return '';

  // 解码后仍残留百分号编码 → 说明原串是多重编码（如 '%252e%252e' 解一次得到
  // '%2e%2e'）。此时直接拒绝，而不是再解一次 —— 再解会陷入「解到什么时候为止」
  // 的军备竞赛，而合法的 host / pool id 本就不含 '%'。
  if (v.includes('%')) return '';

  // 路径穿越与分隔符
  if (v.includes('/') || v.includes('\\') || v.includes('..')) return '';
  // 控制字符（含 NUL 与 DEL），防日志注入与截断攻击
  if (/[\x00-\x1f\x7f]/.test(v)) return '';
  if (v.length > 255) return '';

  return v;
}

/**
 * CORS 预检响应头。
 *
 * 鉴权走 Cookie，同时也支持 Authorization: Bearer，因此两者都要放行；
 * 否则跨域场景下浏览器预检会直接拒绝携带 Authorization 的请求。
 */
function corsHeaders() {
  return {
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '86400',
  };
}
