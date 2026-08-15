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

import { getGlobalRules } from '../config/store.js';
import { DEFAULT_GLOBAL_RULES, DEBUG_HEADER_NAMES, NO_CACHE_STATUS_LIST } from '../config/defaults.js';
import { expandVars, pickClientIp } from '../config/vars.js';
import { resolveContentType } from '../utils/mime.js';

/**
 * 读取某个全站阶段的默认动作（单轨：唯一真相源是全站规则的 stages）。
 *
 * 优先读 ctx.__globalStages（pipeline 开头已预取并缓存），缺失时兜底自行读取一次并缓存，
 * 最终回落到内置冻结默认值，保证「管理面没配过」与「KV 读失败」都不会让主链路崩。
 *
 * 单轨化：过去这里读的是与 stages 并列的 settings 段（ctx.__globalSettings）——
 * 一批前端看不见却在后端生效的隐藏配置。现在它们都是对应阶段的默认动作。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} stage 阶段名（如 'reqHeaders' / 'cache'）
 * @returns {Promise<Record<string, any>>} 该阶段的默认动作（永不为 null）
 */
async function getGlobalStage(ctx, stage) {
  let stages = ctx && ctx.__globalStages;
  if (!stages) {
    try {
      const g = await getGlobalRules(ctx);
      stages = (g && g.stages) || {};
    } catch {
      stages = {};
    }
    if (ctx) ctx.__globalStages = stages;
  }
  const v = stages[stage];
  return (v && typeof v === 'object') ? v : (DEFAULT_GLOBAL_RULES[stage] || {});
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
  // 透传白名单 / 剥离规则来自「修改请求头」阶段（全站默认 + 站点命中规则已合并到 ops）。
  // ops 即 pipeline ④ 合并出的 effAction.reqHeaders（含全站兜底与站点覆盖/追加）。
  // 站点规则可在「流量序列 · 修改请求头」里可视化收窄或扩充 strip / forwardWhitelist，
  // 因此这里以 ops 为准：站点未设则回落全站 getGlobalStage 的值，站点设了则与全站合并/覆盖。
  const gRh = await getGlobalStage(ctx, 'reqHeaders');
  const opsForward = ops && Array.isArray(ops.forwardWhitelist) ? ops.forwardWhitelist : gRh.forwardWhitelist;
  const opsStrip = ops && Array.isArray(ops.strip) ? ops.strip : gRh.strip;
  const forwardWhitelist = new Set((opsForward || []).map((h) => String(h).toLowerCase()));
  const stripRules = normalizeStripRules(opsStrip);
  const out = new Headers();

  // ---- 1. 白名单透传 ----
  // 只挑白名单里的头，其余（Cookie/Referer/Origin/CF-*/X-Forwarded-*）一律丢弃
  for (const [key, value] of ctx.request.headers) {
    if (forwardWhitelist.has(key.toLowerCase())) {
      out.set(key, value);
    }
  }

  // ---- 2. 兜底伪装头 ----
  // 全站兜底默认回源请求头（DEFAULT_GLOBAL_RULES.stages.reqHeaders.set）已由
  // pipeline ④ 合并块并入 effAction.reqHeaders，并经下方步骤 4 的 applyHeaderOps 统一注入，
  // 此处不再从 settings/常量二次注入，避免「规则序列内 + 引擎外」两处写入同字段造成错乱。
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
  stripForbidden(out, stripRules);

  // ---- 6. 客户端 IP 回源头 ----
  // 必须放在 stripForbidden 之后：默认头名 X-Forwarded-For 命中禁用前缀，
  // 若放在之前会被无条件剥离。此处是「用户显式开启」的合法透出，
  // 语义上优先于兜底策略。
  if (clientIpHeader?.enabled) {
    // 复用 pickClientIp 统一提取（含 forwarded / cloudfront-viewer-address 解析），
    // 避免把 forwarded 整串原样透出。
    const ip = pickClientIp(ctx.request.headers);
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
export async function buildClientHeaders(ctx, originResp, policy, ops) {
  // 错误码缓存由 statusTtl 统一表达（命中状态码 → 缓存秒数；0 = no-store）。
  // 原 noCacheStatus 黑名单已并入 statusTtl（TTL=0 即 no-store），此处不再单独读取。
  // 三个缓存头 TTL 回落值：优先用 policy（已含全站兜底默认 edgeTtl/browserTtl）。
  const DEFAULT_EDGE_TTL = Number(policy?.edgeTtl) || 15552000;
  const DEFAULT_BROWSER_TTL = Number(policy?.browserTtl) || 1800;
  const out = new Headers(originResp.headers);

  // ---- 1. 删除源站的安全策略类响应头 ----
  // 这些头会阻止图片/字体被第三方页面引用，作为 CDN 必须清理。
  // 剥离列表（含 CSP/X-Frame-Options/Set-Cookie 等）统一来自全站规则 stages.respHeaders.remove，
  // 由下方步骤 3 的 applyHeaderOps(ops) 统一执行（站点规则 remove 可在此追加/覆盖），
  // 不再由 settings.respHeaders.stripDefaults 在引擎外二次剥离，避免两处处理同字段。

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
  // statusTtl 支持段通配键（4xx/5xx/52x），与 noCacheStatus 语法统一：
  // 精确码优先，未命中再按通配键查找（多个通配键命中时取最具体的，即 'x' 最少的）。
  const statusTtl = lookupStatusTtl(policy?.statusTtl, status);
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
    // 状态码缓存 TTL 优先级最高：允许把 404 等错误码短时间缓存，挡住对源站的重复穿透。
    const ttl = Number(statusTtl) || 0;
    if (ttl <= 0) {
      // ttl=0 的语义是「明确不要缓存这个状态码」，必须下发 no-store。
      // 旧实现写的是 s-maxage=0，那只表示「立即过期但仍可被存储/条件复用」，
      // 会让 CDN 保留副本并可能返回 stale 内容——与用户填 0 的意图不符。
      out.set('Cache-Control', 'no-store');
      out.set('CDN-Cache-Control', 'no-store');
      if (isCf) out.set('Cloudflare-CDN-Cache-Control', 'no-store');
    } else {
      out.set('Cache-Control', `public, max-age=0, s-maxage=${ttl}`);
      setEdgeCacheControl(ttl, policy?.staleWhileRevalidate);
    }
  } else if (NO_CACHE_STATUS_LIST.includes(status)) {
    // 引擎铁律兜底：用户未用 statusTtl 显式配置该码、且该码属于「不应缓存」内置枚举
    // （4xx/5xx 等错误码，见 contracts.js 的 NO_CACHE_STATUS）时，强制下发 no-store。
    // 与 platform/cache.js 的 isCacheable 第 5 步兜底层级一致，保证「响应头下发」与
    // 「是否落盘」两处判定对错误码的行为统一。
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
  // 调试头已下沉为「全站规则 + 引擎常量」，不再作为可配 settings：
  //   - 头名统一取自 DEBUG_HEADER_NAMES（默认值见下方常量，与旧 settings.debug 行为一致）；
  //   - 默认始终开启；若想关闭，在站点规则 stages.respHeaders.remove 中移除对应头即可
  //     （如 remove:['x-cache','x-rule-id','x-origin-id','x-retry-count','x-edge-time']）。
  // 调试字段的「值」仍来自 ctx.debug（运行时注入的 ruleId/cache/originId/retries）。
  {
    const d = ctx.debug || {};
    const names = DEBUG_HEADER_NAMES;
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

  // ---- 4.5 内容类型纠正（网关作为中间人的责任）----
  // 项目本质是边缘网关：代替用户去上游源站（CNB / Git raw 等）拉取资源再回传。
  // 上游 raw 接口返回的 Content-Type 常常不正确（缺失、text/plain、octet-stream、
  // 或带 charset 的文本类型），而部分浏览器不会回退到 URL 后缀名判定，导致图片等
  // 资源出现「未知类型」错误。作为中间人，此处按「请求 URL 后缀名」自动纠正为正确 MIME。
  //
  // 零 body 成本：只依据 URL 后缀名，绝不读取响应体（无内存压力，大文件友好）。
  // 智能触发：仅当上游 Content-Type 缺失/通用/疑似错误，且能从后缀名推导出可信 MIME 时才覆盖；
  //           上游已给出具体可信类型则尊重之。
  // 可关闭：是否启用由全站默认阶段 fixContentType.enabled 控制（见 config/stages-defaults.js）。
  try {
    const fixCfg = (ctx && ctx.__globalStages && ctx.__globalStages.fixContentType)
      || DEFAULT_GLOBAL_RULES.fixContentType;
    if (fixCfg && fixCfg.enabled !== false) {
      const upstreamCt = out.get('content-type');
      const requestUrl = (ctx && ctx.request && ctx.request.url) || '';
      const res = resolveContentType(upstreamCt, requestUrl);
      if (res.changed && res.contentType) {
        out.set('content-type', res.contentType);
        appendDebugNote(ctx, `fix-content-type:${upstreamCt || '∅'}→${res.contentType}`);
      }
    }
  } catch {
    // 纠正失败绝不影响主链路：保留上游原始 Content-Type 原样下发
  }

  // ---- 5. 品牌响应头（Server/Via）----
  // 不再于引擎外从 settings 写死注入。品牌头已作为全站规则 stages.respHeaders.set 的
  // server/via 项，由上方步骤 3 的 applyHeaderOps(ops) 统一经 ${product_name} 展开注入，
  // 站点规则 respHeaders.remove:['server','via'] 也能在此真正生效（单一真相源）。

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
 * 取得品牌响应头（Server / Via）。
 *
 * 品牌头已作为「流量序列默认操作」的一部分收纳进全站规则 stages.respHeaders.set，
 * 此处统一从此处取得，避免引擎外另写死一份造成两处处理同字段的错乱。
 * 尊重站点规则 remove：若合并后的规则动作 respHeaders.set 中已无 server/via
 * （被站点 remove 删除），则返回的对象不含该键，调用方据此不注入。
 *
 * 取值优先级：
 *   1. 合并后的规则动作 rule.action.respHeaders.set.server|via（支持 ${product_name} 展开）
 *   2. 全站兜底 DEFAULT_GLOBAL_RULES.respHeaders.set（保证缺规则时仍有品牌标识）
 *
 * @param {import('../contracts.js').Ctx} ctx 上下文（用于 ${var} 展开）
 * @param {Object} [rule] 合并后的规则（含 action.respHeaders.set）
 * @returns {{Server?:string, Via?:string}}
 */
export function getBrandHeaders(ctx, rule) {
  const set =
    (rule && rule.action && rule.action.respHeaders && rule.action.respHeaders.set) || {};
  const fallbackSet = (DEFAULT_GLOBAL_RULES.respHeaders && DEFAULT_GLOBAL_RULES.respHeaders.set) || {};

  const resolve = (key, fbKey) => {
    const raw = set[key] !== undefined ? set[key] : fallbackSet[fbKey || key];
    if (raw === undefined || raw === null || raw === '') return undefined;
    return expandVars(String(raw), ctx, { label: `brand:${key}` });
  };

  const out = {};
  const server = resolve('server');
  if (server !== undefined) out.Server = server;
  const via = resolve('via');
  if (via !== undefined) out.Via = via;
  return out;
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
 * 在「状态码 → TTL」映射里查出某状态码对应的 TTL。
 *
 * 键支持与 noCacheStatus 相同的写法：精确码（`404`）与段通配（`4xx` / `52x`）。
 * 匹配优先级：精确码 > 十位段（52x） > 百位段（5xx）——即通配位越少越具体、优先级越高，
 * 这样用户可以写「5xx 缓存 5 秒，但 503 不缓存」这类自然规则。
 *
 * @param {Record<string, any>|undefined|null} map 状态码→TTL 映射
 * @param {number} status HTTP 状态码
 * @returns {number|undefined} 命中的 TTL；未命中返回 undefined
 */
function lookupStatusTtl(map, status) {
  if (!map || typeof map !== 'object') return undefined;
  const s = String(status);
  // 1) 精确码优先（用户显式值，含 ! 例外键之外的任何精确码）
  if (map[s] !== undefined) return map[s];
  // 2) 段通配：按「通配位数量」升序选最具体的一条；`!` 前缀键为「例外」，
  //    表示命中该码时不受任何段通配 no-store 约束（走常规缓存，返回 undefined）。
  let best;
  let bestWildcards = 99;
  let excluded = false;
  for (const key of Object.keys(map)) {
    const k = String(key).trim().toLowerCase();
    const negate = k.charCodeAt(0) === 33; /* '!' */
    const base = negate ? k.slice(1) : k;
    if (base.length !== 3) continue;
    let ok = true;
    let wildcards = 0;
    for (let i = 0; i < 3; i++) {
      const bc = base.charCodeAt(i);
      if (bc === 120 /* 'x' */) wildcards++;
      // 非数字非 'x'
      else if (bc < 48 || bc > 57) { ok = false; break; }
      else if (bc !== s.charCodeAt(i)) { ok = false; break; }
    }
    if (!ok) continue;
    if (negate) excluded = true;
    else if (wildcards < bestWildcards) {
      bestWildcards = wildcards;
      best = map[key];
    }
  }
  // 3) 被 `!` 例外命中 → 排除段通配的 no-store，走常规缓存（用默认 TTL）
  if (excluded) return undefined;
  return best;
}

/**
 * 把「修改请求头」阶段的 strip 配置规范化为可高效判定的形态。
 *
 * 统一语法为 `{type, value}`，type ∈ prefix | exact | regex：
 *   - prefix：头名以 value 开头即剥离（如 `cf-` 剥离全部 cf-* 头）
 *   - exact ：头名精确等于 value 即剥离
 *   - regex ：头名匹配该正则即剥离（高级用法）
 * 兼容纯字符串元素（视为 exact）与旧的 {prefixes, exact} 对象形态。
 * 非法正则在此静默跳过（schema 层已给出报错），避免热路径抛异常打断回源。
 *
 * @param {any} strip 阶段配置里的 strip 值
 * @returns {{prefixes: string[], exact: Set<string>, regexes: RegExp[]}}
 */
function normalizeStripRules(strip) {
  const prefixes = [];
  const exact = new Set();
  const regexes = [];

  /** 兜底：配置缺失时用内置默认，保证敏感头始终被剥离（安全默认） */
  const src = Array.isArray(strip) && strip.length
    ? strip
    : DEFAULT_GLOBAL_RULES.reqHeaders.strip;

  for (const item of src || []) {
    if (!item) continue;
    // 纯字符串 → exact
    if (typeof item === 'string') { exact.add(item.toLowerCase()); continue; }
    const type = String(item.type || 'exact').toLowerCase();
    const value = String(item.value || '').toLowerCase();
    if (!value) continue;
    if (type === 'prefix') prefixes.push(value);
    else if (type === 'regex') {
      try { regexes.push(new RegExp(value)); } catch { /* 非法正则忽略，见上方说明 */ }
    } else exact.add(value);
  }
  return { prefixes, exact, regexes };
}

/**
 * 剥离所有敏感 / 平台注入的请求头。
 * 剥离规则来自「修改请求头」阶段的全站默认（stages.reqHeaders.strip，可在管理面调整）。
 *
 * @param {Headers} headers 待清理的请求头
 * @param {{prefixes: string[], exact: Set<string>, regexes: RegExp[]}} [rules] 规范化后的剥离规则
 * @returns {void}
 */
function stripForbidden(headers, rules) {
  const { prefixes, exact, regexes } = rules || normalizeStripRules(null);
  // 先收集再删除，避免在迭代过程中修改集合
  const toDelete = [];
  for (const key of headers.keys()) {
    const lower = key.toLowerCase();
    if (
      exact.has(lower)
      || prefixes.some((p) => lower.startsWith(p))
      || regexes.some((re) => re.test(lower))
    ) {
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
