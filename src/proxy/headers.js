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

import { getGlobalSettings } from '../config/store.js';
import { DEFAULT_GLOBAL_SETTINGS } from '../config/defaults.js';
import { expandVars } from '../config/vars.js';

/**
 * 获取全站兜底「全局默认参数」（settings 段）。
 * 优先读 ctx.__globalSettings（pipeline 已缓存），缺失时回退内置冻结默认值。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<Record<string, any>>}
 */
async function getSettings(ctx) {
  if (ctx && ctx.__globalSettings) return ctx.__globalSettings;
  const s = await getGlobalSettings(ctx);
  if (ctx) ctx.__globalSettings = s;
  return s;
}

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
export async function buildOriginHeaders(ctx, origin, ops, env, clientIpHeader) {
  const S = await getSettings(ctx);
  const rh = S.reqHeaders || DEFAULT_GLOBAL_SETTINGS.reqHeaders;
  // 透传白名单 / 前缀剥离（来自全站兜底 settings，可被用户调整）
  const forwardWhitelist = new Set((rh.forwardWhitelist || []).map((h) => h.toLowerCase()));
  const stripPrefixes = (rh.stripPrefixes || []).map((p) => p.toLowerCase());
  const stripExact = new Set((rh.stripExact || []).map((h) => h.toLowerCase()));
  const out = new Headers();

  // ---- 1. 白名单透传 ----
  // 只挑白名单里的头，其余（Cookie/Referer/Origin/CF-*/X-Forwarded-*）一律丢弃
  for (const [key, value] of ctx.request.headers) {
    if (forwardWhitelist.has(key.toLowerCase())) {
      out.set(key, value);
    }
  }

  // ---- 2. 伪装头 ----
  // 注意用 set 而非 append：如果客户端已带 Accept/Accept-Language，这里统一覆盖，
  // 使回源特征稳定，避免因客户端差异产生过多缓存变体。
  // 这些值来自全站兜底默认回源请求头（DEFAULT_GLOBAL_RULES.stages.reqHeaders.set，
  // 经由 effRule 并入 ops 后由下方步骤 4 注入；此处仅作兜底，确保即使 ops 缺失也有合理默认）。
  for (const [key, value] of Object.entries(getDefaultReqHeaderSet(S))) {
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
  stripForbidden(out, stripPrefixes, stripExact);

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
 * 取全站兜底默认回源请求头 set 映射。
 * 默认来自 DEFAULT_GLOBAL_RULES.stages.reqHeaders.set（已在 pipeline 中并入规则 ops），
 * 但此处额外提供一份静态兜底，保证即使 ops 未传入也能注入合理的伪装浏览器头。
 * @param {Record<string, any>} S settings
 * @returns {Record<string, string>}
 */
function getDefaultReqHeaderSet(S) {
  // 优先用站点/全站默认的 reqHeaders.set（来自 stages），否则用内置常量级默认值。
  // 注意：DEFAULT_GLOBAL_SETTINGS 不含这组 set（它由 stages.reqHeaders.set 承载），
  // 故这里回退到一个稳定的内置默认，与旧 DEFAULT_UA_HEADERS 一致。
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };
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
export async function buildClientHeaders(ctx, originResp, policy, ops) {
  const S = await getSettings(ctx);
  const rph = S.respHeaders || DEFAULT_GLOBAL_SETTINGS.respHeaders;
  const noCacheStatus = new Set((S.cache?.noCacheStatus) || DEFAULT_GLOBAL_SETTINGS.cache.noCacheStatus);
  // 三个缓存头 TTL 回落值：优先用 policy（已含全站兜底默认 edgeTtl/browserTtl），
  // 再回落到 settings.respHeaders 无关，这里 edgeTtl/browserTtl 来自 policy 默认。
  const DEFAULT_EDGE_TTL = Number(policy?.edgeTtl) || 15552000;
  const DEFAULT_BROWSER_TTL = Number(policy?.browserTtl) || 1800;
  const out = new Headers(originResp.headers);

  // ---- 1. 删除源站的安全策略类响应头 ----
  // 这些头会阻止图片/字体被第三方页面引用，作为 CDN 必须清理。
  // 剥离列表来自全站兜底 settings.respHeaders.stripDefaults（可被用户调整）。
  for (const h of rph.stripDefaults || []) {
    out.delete(h);
  }

  // ---- 2. Cache-Control / CDN-Cache-Control（分层缓存铁律）----
  // 路径：浏览器 → 最前端 CDN(CF/EO) → 本项目(Worker/Makers) → 源站。
  // 本项目处于「函数层」，其下发的响应头是最前端的兜底依据。
  //
  // 跨平台头策略（三平台通用）：
  //   - Cache-Control       : public, max-age=<browserTtl>, immutable, s-maxage=<edgeTtl>
  //                           （浏览器 max-age + 边缘 s-maxage 同头给出，避免任一消费方只看其一而漏判）
  //   - CDN-Cache-Control   : public, max-age=<edgeTtl>, s-maxage=<edgeTtl>
  //                           （RFC 9213 标准头，CF/EO/ESA 均消费；会被透传浏览器但浏览器忽略，无害）
  // 注：immutable 只给浏览器（Cache-Control），不写进 CDN-Cache-Control（边缘不需要）。
  //
  // Cloudflare 专属增强：
  //   CF 的 Workers Cache 会绕过 zone 级 Cache Rules，且 CF 额外支持专有头
  //   Cloudflare-CDN-Cache-Control（与 CDN-Cache-Control 语义一致，但 CF 消费后
  //   不向浏览器透传）。当平台 == 'cf' 时额外下发该头，使边缘 TTL 仅在 CF 内部可见、
  //   彻底不泄漏给下游。该头为 CF 专有，EO/ESA 不认识，故仅 CF 下发。
  //
  // 核心前提：三个头均同时携带 max-age 与 s-maxage，确保各平台无论按哪个头/
  // 哪个字段消费都能拿到正确 TTL（CF Workers Cache 按 RFC 9111 透传 Cache-Control；
  // 标准 CDN-Cache-Control / Cloudflare-CDN-Cache-Control 供各 CDN 边缘决策）。
  const status = originResp.status;
  const statusTtl = policy?.statusTtl?.[String(status)];
  const isCf = ctx?.caps?.platform === 'cf';

  // 剥离源站带回的一切「不缓存」信号（兜底，确保可缓存内容真被边缘缓存）
  for (const bad of ['set-cookie', 'pragma', 'no-store', 'private']) {
    out.delete(bad);
  }
  if (out.get('expires') === '0') out.delete('expires');

  // 统一下发边缘缓存头。三个头（CF 时含 Cloudflare-CDN-Cache-Control）均带
  // max-age + s-maxage，保证万无一失。swr 可选追加 stale-while-revalidate。
  const setEdgeCacheControl = (edgeTtl, swr) => {
    const tail = swr ? `, stale-while-revalidate=${swr}` : '';
    const edgeVal = `public, max-age=${edgeTtl}, s-maxage=${edgeTtl}${tail}`;
    out.set('CDN-Cache-Control', edgeVal);
    if (isCf) out.set('Cloudflare-CDN-Cache-Control', edgeVal);
  };

  if (statusTtl !== undefined) {
    // 状态码缓存 TTL 优先级最高：允许把 404 等错误码短时间缓存，挡住对源站的重复穿透
    out.set('Cache-Control', `public, max-age=0, s-maxage=${Number(statusTtl) || 0}`);
    setEdgeCacheControl(Number(statusTtl) || 0, policy?.staleWhileRevalidate);
  } else if (noCacheStatus.has(status)) {
    // 错误响应绝不允许被浏览器或中间层缓存
    out.set('Cache-Control', 'no-store');
    out.set('CDN-Cache-Control', 'no-store');
    if (isCf) out.set('Cloudflare-CDN-Cache-Control', 'no-store');
  } else if (policy?.enabled && policy.mode !== 'origin') {
    // mode === 'origin' 表示遵循源站缓存策略，此时完全不改写缓存头
    // TTL 取配置值；若为 0 则回落到分层铁律默认值（边缘半年 / 浏览器 30 分钟）
    const edgeTtl = Number(policy.edgeTtl) || DEFAULT_EDGE_TTL;
    const browserTtlRaw = Number(policy.browserTtl);
    const browserTtl =
      browserTtlRaw === 0 ? DEFAULT_BROWSER_TTL : browserTtlRaw;
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
  // 头名与开关来自全站兜底 settings.debug（可在管理面板改名/关闭，默认保持原行为）。
  // 调试字段的「值」仍来自 ctx.debug（运行时注入的 ruleId/cache/originId/retries）。
  const dbg = S.debug || DEFAULT_GLOBAL_SETTINGS.debug;
  if (dbg && dbg.enabled) {
    const d = ctx.debug || {};
    const names = dbg.headers || DEFAULT_GLOBAL_SETTINGS.debug.headers;
    setIfPresent(out, names.cache, d.cache);
    // 仅下发源站内部 id（X-Origin-Id），用于标识「本次回源选中的上游源」调试信息。
    // 注意：绝不下发 X-Origin-Addr —— 其值为 origin.addr:port（完整域名/IP+端口），
    // 暴露给浏览器会直接泄露源站地址，成为攻击者直连源站绕过 CDN 的入口。
    // 已有 X-Origin-Id 足以表达「去了哪个上游源」，无需暴露完整地址。
    setIfPresent(out, names.originId, d.originId);
    setIfPresent(out, names.ruleId, d.ruleId);
    setIfPresent(out, names.retryCount, d.retries != null ? String(d.retries) : undefined);
    setIfPresent(out, names.edgeTime, `${Date.now() - ctx.startTime}ms`);
  }

  // ---- 5. 品牌响应头（标识本网关，覆盖上游平台/源站的 Server/Via 泄露）----
  // Server：本项目作为独立 CDN 网关的身份标识（来自全站兜底 settings.respHeaders.serverName）。
  // Via：RFC 7230 要求的代理链标识，格式为「协议/版本 别名」（settings.respHeaders.viaName）。
  // 二者均可在 settings 中调整，实现「改品牌名无需改代码」。
  out.set('Server', rph.serverName);
  out.set('Via', rph.viaName);

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
      // 1) secret 引用优先（@secret:NAME），拿不到则跳过该头
      const maybeSecret = env ? resolveSecret(rawValue, env) : String(rawValue ?? '');
      if (env && maybeSecret === null) {
        appendDebugNote(ctx, `missing-secret:${key}`);
        continue;
      }
      // 2) 动态变量展开：${client_ip} / ${http_x_forwarded_for} 等运行时求值。
      //    静态值（不含 ${）零开销原样透传；头值仍受 Headers 约束（禁 CR/LF）。
      const finalValue = expandVars(maybeSecret, ctx, { label: `header:${key}` });
      headers.set(key, finalValue);
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
 * 前缀 / 精确名单来自全站兜底 settings.reqHeaders（可在管理面板调整）。
 *
 * @param {Headers} headers 待清理的请求头
 * @param {string[]} [stripPrefixes] 命中即剥离的头名前缀（小写）
 * @param {Set<string>} [stripExact] 精确命中的头名集合（小写）
 * @returns {void}
 */
function stripForbidden(headers, stripPrefixes, stripExact) {
  const prefixes = stripPrefixes || DEFAULT_GLOBAL_SETTINGS.reqHeaders.stripPrefixes;
  const exact = stripExact || new Set(DEFAULT_GLOBAL_SETTINGS.reqHeaders.stripExact);
  // 先收集再删除，避免在迭代过程中修改集合
  const toDelete = [];
  for (const key of headers.keys()) {
    const lower = key.toLowerCase();
    if (exact.has(lower) || (prefixes.some && prefixes.some((p) => lower.startsWith(p)))) {
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
