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
import { DEFAULT_GLOBAL_RULES } from '../config/defaults.js';
import { DEFAULT_CLIENT_IP_HEADER } from '../config/stages-defaults.js';
import { expandVars, expandSysVars } from '../config/vars.js';
import { pickClientIp } from '../utils/clientIp.js';
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
 *   2. 全站缺省回源请求头 set（由规则引擎经 applyHeaderOps 注入）
 *   3. origin.extraHeaders（支持 "@secret:NAME" 从 env 取值）
 *   4. rule.reqHeaders.set / strip
 *   5. 强制剥离敏感头（兜底）
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} origin 选中的源站
 * @param {Object} [ops] 规则中的 reqHeaders，形如 { set:{}, strip:[] }
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
  const forwardWhitelist = new Set((opsForward || []).map((h) => String(h).toLowerCase()));
  const out = new Headers();

  // ---- 1. 白名单透传 ----
  // 只挑白名单里的头，其余（Cookie/Referer/Origin/CF-*/X-Forwarded-*）一律丢弃
  for (const [key, value] of ctx.request.headers) {
    if (forwardWhitelist.has(key.toLowerCase())) {
      out.set(key, value);
    }
  }

  // ---- 2. 全站缺省回源请求头（由规则引擎注入）----
  // 全站兜底默认回源请求头（DEFAULT_GLOBAL_RULES.stages.reqHeaders.set，
  // 含 User-Agent / Accept / Accept-Language / Accept-Encoding 等）已由
  // pipeline ④ 合并块并入 effAction.reqHeaders，并经下方步骤 4 的 applyHeaderOps 统一注入。
  // 此处不再做任何规则外的二次兜底/默认写入——回源请求头如何构造完全由可视化规则引擎
  // （全站缺省 + 站点规则）声明，代码侧不持有第二默认源。

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
  // 含 set 注入 + strip（精确/前缀/正则）删除，统一由 applyHeaderOps 处理。
  applyHeaderOps(out, ops, ctx, env);

  // ---- 5. 客户端 IP 回源头 ----
  // 必须放在 strip 之后：默认头名（规则缺省 DEFAULT_CLIENT_IP_HEADER.name）若命中用户 strip 前缀，
  // 会被 applyHeaderOps 剥离；此处是「用户显式开启」的合法透出，语义上优先于剥离策略。
  // 头名以规则/源站级 clientIpHeader.name 为准，缺失时回落到规则缺省名，不写死第二默认。
  if (clientIpHeader?.enabled) {
    // 复用 pickClientIp 统一提取（含 forwarded / cloudfront-viewer-address 解析），
    // 避免把 forwarded 整串原样透出。
    const ip = pickClientIp(ctx.request.headers);
    if (ip) out.set(clientIpHeader.name || DEFAULT_CLIENT_IP_HEADER.name, ip);
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
 * @param {Object} [ops] 规则中的 respHeaders，形如 { set:{}, strip:[] }
 * @returns {Headers} 返回给客户端的响应头
 */
export async function buildClientHeaders(ctx, originResp, policy, ops) {
  // 规则引擎绝对权威：响应头唯一真相源是全站规则 DEFAULT_GLOBAL_RULES.respHeaders
  // （含站点规则覆盖），由下方 applyHeaderOps(ops) 一次性原样执行。
  // 代码侧不再有任何外置的缓存头 set / delete / statusTtl 覆盖逻辑 —— 用户在
  // 前端 ⑯「节点响应头」阶段改了缺省 = 用户自定义，代码绝不回加、绝不覆盖。
  // 错误码 TTL（statusTtl）、origin 遵循源站等条件语义，均已由用户在规则引擎里
  // 声明式表达，不属于本函数的职责。
  const out = new Headers(originResp.headers);

  // ---- 1. 删除源站的安全策略类响应头 ----
  // 这些头会阻止图片/字体被第三方页面引用，作为 CDN 必须清理。
  // 剥离列表（含 CSP/X-Frame-Options/Set-Cookie 等）统一来自全站规则 stages.respHeaders.strip，
  // 由下方 applyHeaderOps(ops) 统一执行（站点规则 strip 可在此追加/覆盖）。

  // ---- 2/3. 规则级 respHeaders（唯一写入入口）----
  // 调试头 / 品牌头 / 缓存控制头 / 不缓存信号剥离，统一在此由全站规则
  // （stages.respHeaders）的 set/strip 声明式下发；头名与值均可在前端 ⑯「节点响应头」
  // 阶段自由配置、关闭，代码零干预。常规缓存头模板如下（用户可改）：
  //   Cache-Control            : public, max-age=__browser_ttl__, s-maxage=__edge_ttl__, stale-while-revalidate=__swr__, immutable
  //   CDN-Cache-Control        : public, max-age=__edge_ttl__, s-maxage=__edge_ttl__, stale-while-revalidate=__swr__
  //   Cloudflare-CDN-Cache-Control : 仅 CF 平台展开（__cf_cdn_cache_control__）
  applyHeaderOps(out, ops, ctx, null);

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
  // 站点规则 respHeaders.strip:[{type:'exact',value:'server'},{type:'exact',value:'via'}] 也能在此真正生效（单一真相源）。

  return out;
}

/**
 * 应用 HeaderOps（set / strip）。
 *
 * strip 先于 set 执行，这样「先删后加」的配置语义更符合直觉。
 * set 的值同样支持 "@secret:NAME" 引用（仅在提供 env 时生效）。
 *
 * @param {Headers} headers 待修改的头集合
 * @param {Object} [ops] { set:{}, strip:[] }
 * @param {import('../contracts.js').Ctx} [ctx] 上下文，用于记录 debug
 * @param {Object} [env] 环境变量
 * @returns {void}
 */
export function applyHeaderOps(headers, ops, ctx, env) {
  if (!ops) return;

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
      let finalValue = expandVars(maybeSecret, ctx, { label: `header:${key}` });
      // 3) 双下划线系统占位符展开：__edge_ttl__ / __cache__ 等项目内部值。
      //    与 ${} 用户变量完全隔离、独立求值；无 __ 时零开销。
      finalValue = expandSysVars(finalValue, ctx);
      headers.set(key, finalValue);
    }
  }

  // 删除统一走 strip（{type,value} 语法：exact / prefix / regex）。
  // 不再有 remove 字段：精确删除即 type:'exact'，与「额外剥离」完全等价，合并为单一入口。
  if (Array.isArray(ops.strip) && ops.strip.length) {
    stripForbidden(headers, normalizeStripRules(ops.strip));
  }
}

/**
 * 取得品牌响应头（Server / Via）。
 *
 * 品牌头已作为「流量序列默认操作」的一部分收纳进全站规则 stages.respHeaders.set，
 * 此处统一从此处取得，避免引擎外另写死一份造成两处处理同字段的错乱。
 * 尊重站点规则 strip：若合并后的规则动作 respHeaders.set 中已无 server/via
 * （被站点 strip 删除），则返回的对象不含该键，调用方据此不注入。
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
