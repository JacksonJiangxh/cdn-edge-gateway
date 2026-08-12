/**
 * 请求头 / 响应头处理
 * ----------------------------------------------------------------------------
 * 这是整条管线里安全性最关键的一环。
 *
 * 旧版原型的做法是 `new Headers(request.headers)` 全量透传，带来两个严重问题：
 *  1. 安全：Cookie / Authorization / CF-Connecting-IP 等敏感头被原样发给第三方源站
 *  2. 功能：Referer / Origin 会触发源站防盗链，导致回源 403
 *
 * 现在改为「白名单」模型：回源请求表现得像一个全新的浏览器请求，
 * 只带对内容协商真正必要的头（Range / Accept / If-None-Match ...）。
 */

import {
  FORWARD_HEADER_WHITELIST,
  DEFAULT_UA_HEADERS,
  DEFAULT_STRIP_RESP_HEADERS,
  NO_CACHE_STATUS,
} from '../contracts.js';
import { PRODUCT_NAME } from '../config/defaults.js';

/**
 * 永远不允许出现在回源请求里的头（前缀匹配 + 精确匹配）。
 * 即便被 extraHeaders / rule.reqHeaders 显式设置，也会在最后一步被剥离。
 */
const FORBIDDEN_PREFIXES = ['cf-', 'x-forwarded-'];
const FORBIDDEN_EXACT = new Set(['x-real-ip', 'cookie', 'referer', 'origin']);

/**
 * 分层缓存铁律的模板默认值（当配置未显式给 TTL 时回落到此）：
 * 最前端 CDN 为最终依据 —— 边缘长缓存、浏览器短缓存。
 *   边缘：半年（15552000s）；浏览器：30 分钟（1800s）。
 * 本项目作为「函数层」下发头时自动遵循，模板开箱即符合铁律。
 */
export const TIER_CDN_DEFAULT_EDGE_TTL = 15552000;
export const TIER_CDN_DEFAULT_BROWSER_TTL = 1800;

/**
 * 构造回源请求头。
 *
 * 叠加顺序（后者覆盖前者）：
 *   1. 客户端请求头中命中白名单的部分
 *   2. DEFAULT_UA_HEADERS 伪装头
 *   3. origin.extraHeaders（支持 "@secret:NAME" 从 env 取值）
 *   4. rule.reqHeaders.set / remove
 *   5. 强制剥离敏感头（兜底）
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} origin 选中的源站
 * @param {Object} [ops] 规则中的 reqHeaders，形如 { set:{}, remove:[] }
 * @param {Object} [env] 环境变量，用于解析 "@secret:NAME"
 * @param {Object} [clientIpHeader] 客户端 IP 回源头配置 { enabled, name }
 * @returns {Headers} 回源请求头
 */
export function buildOriginHeaders(ctx, origin, ops, env, clientIpHeader) {
  const out = new Headers();

  // ---- 1. 白名单透传 ----
  // 只挑白名单里的头，其余（Cookie/Referer/Origin/CF-*/X-Forwarded-*）一律丢弃
  for (const [key, value] of ctx.request.headers) {
    if (FORWARD_HEADER_WHITELIST.has(key.toLowerCase())) {
      out.set(key, value);
    }
  }

  // ---- 2. 伪装头 ----
  // 注意用 set 而非 append：如果客户端已带 Accept/Accept-Language，这里统一覆盖，
  // 使回源特征稳定，避免因客户端差异产生过多缓存变体
  for (const [key, value] of Object.entries(DEFAULT_UA_HEADERS)) {
    out.set(key, value);
  }
  // Accept-Encoding 交给运行时自行协商，不强行覆盖客户端的值；
  // 若客户端未提供则给一个通用值
  if (!out.has('accept-encoding')) {
    out.set('Accept-Encoding', 'gzip, deflate, br');
  }

  // ---- 3. origin.extraHeaders（支持 secret 引用）----
  const extra = origin?.extraHeaders || {};
  for (const [key, rawValue] of Object.entries(extra)) {
    const resolved = resolveSecret(rawValue, env);
    if (resolved === null) {
      // secret 取不到：跳过该头并记录，方便面板侧排查配置错误
      appendDebugNote(ctx, `missing-secret:${key}`);
      continue;
    }
    out.set(key, resolved);
  }

  // ---- 4. 规则级 reqHeaders ----
  applyHeaderOps(out, ops, ctx, env);

  // ---- 5. 兜底剥离敏感头 ----
  stripForbidden(out);

  // ---- 6. 客户端 IP 回源头 ----
  // 必须放在 stripForbidden 之后：默认头名 X-Forwarded-For 命中禁用前缀，
  // 若放在之前会被无条件剥离。此处是「用户显式开启」的合法透出，
  // 语义上优先于兜底策略。
  if (clientIpHeader?.enabled) {
    const ip =
      ctx.request.headers.get('cf-connecting-ip') || ctx.request.headers.get('x-real-ip') || '';
    if (ip) out.set(clientIpHeader.name || 'X-Forwarded-For', ip);
  }

  // ---- 关于 Host 头 ----
  // 这里【故意】不设置 Host。CF/EO/ESA 的 fetch 均允许通过 init.headers 设置自定义
  // Host 头（见 docs/07-eo-origin-host.md §五），但本函数专注于「构造通用回源头」，
  // 把自定义 Host 的注入统一收敛到 dispatch()（按规则/源站级 hostHeader 解析后写入），
  // 避免重复逻辑与平台差异散落。
  // 自定义回源 Host 的注入（跨平台统一，见 balancer/failover.js dispatch）：
  //   当解析出的自定义 Host 与 originUrl.hostname 不一致时，在 dispatch() 中
  //   headers.set('Host', ...) 即可，三平台 fetch 均生效，实现「域名/裸IP 源站 + 自定义 Host」。
  //   CF 上「裸 IP + HTTPS + 自定义 SNI」由 fetchEngine 内部自动走 cloudflare:sockets 兜底，
  //   该兜底同样使用 dispatch() 已设好的 Host 头作为 SNI/Host 来源。

  return out;
}

/**
 * 构造返回给客户端的响应头。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Response} originResp 源站响应（或缓存命中的响应）
 * @param {Object} [policy] 缓存策略 CachePolicy
 * @param {Object} [ops] 规则中的 respHeaders，形如 { set:{}, remove:[] }
 * @returns {Headers} 返回给客户端的响应头
 */
export function buildClientHeaders(ctx, originResp, policy, ops) {
  const out = new Headers(originResp.headers);

  // ---- 1. 删除源站的安全策略类响应头 ----
  // 这些头会阻止图片/字体被第三方页面引用，作为 CDN 必须清理
  for (const h of DEFAULT_STRIP_RESP_HEADERS) {
    out.delete(h);
  }

  // ---- 2. Cache-Control / CDN-Cache-Control（分层缓存铁律）----
  // 路径：浏览器 → 最前端 CDN(CF/EO) → 本项目(Worker/Makers) → 源站。
  // 本项目处于「函数层」，其下发的响应头是最前端的兜底依据：
  //   - 浏览器侧：Cache-Control: public, max-age=<browserTtl>, immutable
  //   - 边缘侧：  CDN-Cache-Control: public, max-age=<edgeTtl>（独立维度，不混入 Cache-Control）
  //   - 主动剥离源站带回的不缓存信号（Set-Cookie/Pragma/no-store/private/Expires=0），
  //     保证「最前端 CDN 为最终依据」——即便 CF/EO 面板规则漏设，这里也兜底清掉。
  // 注：immutable 只给浏览器（Cache-Control），不写进 CDN-Cache-Control（边缘不需要）。
  const status = originResp.status;
  const statusTtl = policy?.statusTtl?.[String(status)];

  // 剥离源站带回的一切「不缓存」信号（兜底，确保可缓存内容真被边缘缓存）
  for (const bad of ['set-cookie', 'pragma', 'no-store', 'private']) {
    out.delete(bad);
  }
  if (out.get('expires') === '0') out.delete('expires');

  // 统一下发边缘缓存头：CDN-Cache-Control 只给边缘，不含浏览器 max-age
  const setEdgeCacheControl = (maxAge, swr) => {
    const tail = swr ? `, stale-while-revalidate=${swr}` : '';
    out.set('CDN-Cache-Control', `public, max-age=${maxAge}${tail}`);
  };

  if (statusTtl !== undefined) {
    // 状态码缓存 TTL 优先级最高：允许把 404 等错误码短时间缓存，挡住对源站的重复穿透
    out.set('Cache-Control', `public, max-age=0, s-maxage=${Number(statusTtl) || 0}`);
    setEdgeCacheControl(Number(statusTtl) || 0, policy?.staleWhileRevalidate);
  } else if (NO_CACHE_STATUS.has(status)) {
    // 错误响应绝不允许被浏览器或中间层缓存
    out.set('Cache-Control', 'no-store');
    out.set('CDN-Cache-Control', 'no-store');
  } else if (policy?.enabled && policy.mode !== 'origin') {
    // mode === 'origin' 表示遵循源站缓存策略，此时完全不改写缓存头
    // TTL 取配置值；若为 0 则回落到分层铁律默认值（边缘半年 / 浏览器 30 分钟）
    const edgeTtl = Number(policy.edgeTtl) || TIER_CDN_DEFAULT_EDGE_TTL;
    const browserTtlRaw = Number(policy.browserTtl);
    const browserTtl =
      browserTtlRaw === 0 ? TIER_CDN_DEFAULT_BROWSER_TTL : browserTtlRaw;
    // browserTtl < 0 约定为「不下发 max-age，由源站/浏览器自行决定」
    out.set(
      'Cache-Control',
      browserTtl < 0
        ? `public, s-maxage=${edgeTtl}`
        : `public, max-age=${browserTtl}, immutable, s-maxage=${edgeTtl}`
    );
    setEdgeCacheControl(edgeTtl, policy?.staleWhileRevalidate);
  }

  // ---- 3. 规则级 respHeaders ----
  applyHeaderOps(out, ops, ctx, null);

  // ---- 4. 调试头 ----
  const d = ctx.debug || {};
  setIfPresent(out, 'X-Cache', d.cache);
  setIfPresent(out, 'X-Origin-Id', d.originId);
  setIfPresent(out, 'X-Origin-Addr', d.originAddr);
  setIfPresent(out, 'X-Rule-Id', d.ruleId);
  setIfPresent(out, 'X-Retry-Count', d.retries != null ? String(d.retries) : undefined);
  out.set('X-Edge-Time', `${Date.now() - ctx.startTime}ms`);

  // ---- 5. 品牌响应头（标识本网关，覆盖上游平台/源站的 Server/Via 泄露）----
  // Server：本项目作为独立 CDN 网关的身份标识。
  // Via：RFC 7230 要求的代理链标识，格式为「协议/版本 别名」。
  out.set('Server', PRODUCT_NAME);
  out.set('Via', `1.1 ${PRODUCT_NAME}`);

  return out;
}

/**
 * 应用 HeaderOps（set / remove）。
 *
 * remove 先于 set 执行，这样「先删后加」的配置语义更符合直觉。
 * set 的值同样支持 "@secret:NAME" 引用（仅在提供 env 时生效）。
 *
 * @param {Headers} headers 待修改的头集合
 * @param {Object} [ops] { set:{}, remove:[] }
 * @param {import('../contracts.js').Ctx} [ctx] 上下文，用于记录 debug
 * @param {Object} [env] 环境变量
 * @returns {void}
 */
function applyHeaderOps(headers, ops, ctx, env) {
  if (!ops) return;

  if (Array.isArray(ops.remove)) {
    for (const name of ops.remove) {
      if (name) headers.delete(String(name));
    }
  }

  if (ops.set && typeof ops.set === 'object') {
    for (const [key, rawValue] of Object.entries(ops.set)) {
      if (env) {
        const resolved = resolveSecret(rawValue, env);
        if (resolved === null) {
          appendDebugNote(ctx, `missing-secret:${key}`);
          continue;
        }
        headers.set(key, resolved);
      } else {
        headers.set(key, String(rawValue));
      }
    }
  }
}

/**
 * 解析可能带 "@secret:NAME" 引用的头值。
 *
 * @param {string} rawValue 原始配置值
 * @param {Object} [env] 环境变量
 * @returns {string|null} 解析后的值；secret 不存在时返回 null 表示应跳过该头
 */
function resolveSecret(rawValue, env) {
  const value = String(rawValue ?? '');
  if (!value.startsWith('@secret:')) return value;

  const name = value.slice('@secret:'.length).trim();
  if (!name || !env) return null;

  const secret = env[name];
  if (secret === undefined || secret === null || secret === '') return null;
  return String(secret);
}

/**
 * 剥离所有敏感 / 平台注入的请求头。
 *
 * @param {Headers} headers 待清理的请求头
 * @returns {void}
 */
function stripForbidden(headers) {
  // 先收集再删除，避免在迭代过程中修改集合
  const toDelete = [];
  for (const key of headers.keys()) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_EXACT.has(lower) || FORBIDDEN_PREFIXES.some((p) => lower.startsWith(p))) {
      toDelete.push(key);
    }
  }
  for (const key of toDelete) headers.delete(key);
}

/**
 * 仅在值存在时设置响应头，避免出现 "X-Cache: undefined"。
 *
 * @param {Headers} headers 响应头
 * @param {string} name 头名
 * @param {string} [value] 头值
 * @returns {void}
 */
function setIfPresent(headers, name, value) {
  if (value !== undefined && value !== null && value !== '') {
    headers.set(name, String(value));
  }
}

/**
 * 往 ctx.debug.notes 追加一条调试记录。
 *
 * @param {import('../contracts.js').Ctx} [ctx] 上下文
 * @param {string} note 记录内容
 * @returns {void}
 */
function appendDebugNote(ctx, note) {
  if (!ctx || !ctx.debug) return;
  if (!Array.isArray(ctx.debug.notes)) ctx.debug.notes = [];
  ctx.debug.notes.push(note);
}
