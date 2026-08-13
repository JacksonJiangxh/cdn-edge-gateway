/**
 * 站点与规则匹配（对齐 EdgeOne 规则引擎）
 * ----------------------------------------------------------------------------
 * matchSite: 根据请求 Host 找到对应的站点配置（精确 > 泛域名，泛域名逻辑在 store 内）
 * matchRule: 在站点的 rules 中按 priority 降序找到第一个命中的规则
 *
 * 条件模型（EO 语义）：
 *   match.conditions 是二维数组 —— 外层 OR，内层 AND。
 *     [[c1, c2], [c3]]  ==>  (c1 && c2) || c3
 *   空数组 = 匹配一切。
 */

import { getSite } from '../config/store.js';
import { TARGETS_NEED_KEY, DEFAULT_GLOBAL_SETTINGS } from '../config/defaults.js';

/**
 * 匹配站点配置。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Promise<Object|null>} 命中的 Site，未命中或被禁用返回 null
 */
export async function matchSite(ctx) {
  const host = String(ctx.url.hostname || '').toLowerCase().replace(/:\d+$/, '');
  if (!host) return null;

  let site = null;
  try {
    site = await getSite(ctx, host);
  } catch (err) {
    ctx.debug.siteError = err?.message || String(err);
    return null;
  }

  if (!site) return null;
  if (site.enabled === false) return null;

  ctx.debug.siteId = site.host;
  return site;
}

/**
 * 从请求上下文提取匹配所需的全部特征，只算一次供所有规则复用。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Object} 请求特征
 */
export function buildMatchSubject(ctx) {
  const url = ctx.url;
  const pathname = url.pathname;
  const seg = pathname.split('/').pop() || '';
  const dot = seg.lastIndexOf('.');
  const ext = dot > 0 && dot !== seg.length - 1 ? seg.slice(dot + 1).toLowerCase() : '';
  const headers = ctx.request.headers;

  // 请求接收层默认参数：取自全站兜底 settings.request（可被用户在管理面板调整，
  // 无需改代码）。clientIpHeaders 为提取真实客户端 IP 的回源头优先级；
  // defaultProtocol 为协议回落值（当 url.protocol 缺失时）。
  const reqSettings =
    (ctx.__globalSettings && ctx.__globalSettings.request) || DEFAULT_GLOBAL_SETTINGS.request;
  const clientIpHeaders = reqSettings.clientIpHeaders || ['cf-connecting-ip', 'x-real-ip'];
  let clientIp = '';
  for (const h of clientIpHeaders) {
    const v = headers.get(h);
    if (v) { clientIp = v; break; }
  }
  const protocol = (url.protocol || `${reqSettings.defaultProtocol}:`).replace(':', '');

  return {
    host: String(url.hostname || '').toLowerCase(),
    path: pathname,
    fullUrl: url.href,
    query: url.search.replace(/^\?/, ''),
    extension: ext,
    filename: seg,
    directory: pathname.slice(0, pathname.lastIndexOf('/') + 1),
    method: (ctx.request.method || 'GET').toUpperCase(),
    protocol,
    clientIp,
    clientCountry: (headers.get('cf-ipcountry') || '').toUpperCase(),
    userAgent: headers.get('user-agent') || '',
    referer: headers.get('referer') || '',
    // 首要分流（选源站）选出的本次回源对象。在 matchRule 之前由 pipeline 写入 ctx.origin，
    // 作为规则引擎的「首要条件」维度：oriX AND 规则引擎 的分支即由它产生。
    // 取 id + addr 组合，便于规则用 equal/contain 精确或模糊匹配某个源站。
    origin: ctx.origin ? `${ctx.origin.id}` : '',
    originAddr: ctx.origin ? `${ctx.origin.addr}` : '',
    _headers: headers,
    _url: url,
  };
}

/**
 * 取出某个匹配对象的实际值。
 *
 * header/cookie/query 需要 key 定位；返回 null 表示「不存在」，
 * 这与「存在但为空串」在 exists/notExists 语义下不同，必须区分。
 *
 * @param {Object} subject buildMatchSubject 的结果
 * @param {Object} cond 条件
 * @returns {string|null} 值，不存在返回 null
 */
function resolveValue(subject, cond) {
  const target = cond.target;

  if (target === 'header') {
    return subject._headers.get(cond.key || '');
  }

  if (target === 'cookie') {
    const raw = subject._headers.get('cookie') || '';
    const name = cond.key || '';
    if (!name) return null;
    for (const part of raw.split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
    }
    return null;
  }

  if (target === 'query') {
    // 无 key 时退化为整个查询串
    if (!cond.key) return subject.query;
    return subject._url.searchParams.get(cond.key);
  }

  // origin / originAddr：首要分流选出的本次回源对象维度。
  // 规则可写 target:'origin'（匹配源站 id）或 target:'originAddr'（匹配源站 addr）。
  if (target === 'origin' || target === 'originAddr') {
    return subject[target] ?? null;
  }

  const v = subject[target];
  return v === undefined ? null : v;
}

/**
 * 执行一个操作符比较。
 *
 * @param {string} op 操作符
 * @param {string|null} actual 实际值（null=不存在）
 * @param {string[]} values 期望值列表（多值 OR）
 * @param {boolean} ignoreCase 是否忽略大小写
 * @returns {boolean}
 */
function applyOperator(op, actual, values, ignoreCase) {
  // 存在性判断优先处理：不依赖 values
  if (op === 'exists') return actual !== null;
  if (op === 'notExists') return actual === null;

  // 其余操作符在「值不存在」时一律不命中；
  // 取反类操作符（notEqual 等）同样返回 false —— 不存在的东西谈不上"不等于"，
  // 这与 EO 的行为一致，避免规则在缺失字段上意外全量命中。
  if (actual === null) return false;

  const list = Array.isArray(values) ? values : [];
  if (list.length === 0) return false;

  const a = ignoreCase ? actual.toLowerCase() : actual;
  const norm = (s) => (ignoreCase ? String(s).toLowerCase() : String(s));

  // 正则单独处理：用户输入必须容错，非法正则让该条件失配而非 500
  if (op === 'regex' || op === 'notRegex') {
    const hit = list.some((v) => {
      try {
        return new RegExp(String(v), ignoreCase ? 'i' : '').test(actual);
      } catch {
        return false;
      }
    });
    return op === 'regex' ? hit : !hit;
  }

  let hit = false;
  switch (op) {
    case 'equal':
    case 'notEqual':
      hit = list.some((v) => a === norm(v));
      return op === 'equal' ? hit : !hit;
    case 'contain':
    case 'notContain':
      hit = list.some((v) => a.includes(norm(v)));
      return op === 'contain' ? hit : !hit;
    case 'prefix':
    case 'notPrefix':
      hit = list.some((v) => a.startsWith(norm(v)));
      return op === 'prefix' ? hit : !hit;
    case 'suffix':
    case 'notSuffix':
      hit = list.some((v) => a.endsWith(norm(v)));
      return op === 'suffix' ? hit : !hit;
    default:
      return false;
  }
}

/**
 * 求值单个条件。
 *
 * @param {Object} cond 条件
 * @param {Object} subject 请求特征
 * @returns {boolean}
 */
export function evalCondition(cond, subject) {
  if (!cond || !cond.target || !cond.op) return false;
  // 需要 key 的类型缺 key 时视为配置无效 → 不命中
  if (TARGETS_NEED_KEY.includes(cond.target) && !cond.key && cond.target !== 'query') {
    return false;
  }
  const ignoreCase = cond.ignoreCase !== false;
  const actual = resolveValue(subject, cond);
  return applyOperator(cond.op, actual, cond.values, ignoreCase);
}

/**
 * 判断规则是否命中。
 *
 * 匹配条件以 match.conditions 二维数组（外 OR 内 AND）为准；无 conditions 视为匹配全部。
 * 旧版扁平快捷字段（pathPrefix / pathRegex / extIn / methodIn）已废弃，开发阶段不保留兼容。
 *
 * @param {Object} rule 规则
 * @param {Object} subject 请求特征
 * @returns {boolean}
 */
export function isRuleMatched(rule, subject) {
  const m = rule?.match || {};

  const groups = Array.isArray(m.conditions) ? m.conditions.filter((g) => Array.isArray(g) && g.length) : [];
  if (groups.length === 0) return true;

  // 外层 OR：任一组全通过即命中
  return groups.some((group) => group.every((c) => evalCondition(c, subject)));
}

/**
 * 在站点规则中匹配第一个命中的规则。
 *
 * 语义：按 priority 降序，命中即停；enabled === false 跳过。
 *
 * @param {Object} site 站点配置
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Object|null} 命中的 Rule，未命中返回 null
 */
export function matchRule(site, ctx) {
  const rules = Array.isArray(site?.rules) ? site.rules : [];
  if (rules.length === 0) return null;

  const subject = buildMatchSubject(ctx);

  const sorted = rules
    .filter((r) => r && r.enabled !== false)
    .slice()
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));

  for (const rule of sorted) {
    if (isRuleMatched(rule, subject)) {
      ctx.debug.ruleId = rule.id;
      return rule;
    }
  }
  return null;
}
