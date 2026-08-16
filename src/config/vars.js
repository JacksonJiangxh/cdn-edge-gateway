/**
 * ============================================================================
 * config/vars.js —— 规则动作「内置变量」解析引擎
 * ----------------------------------------------------------------------------
 * 对齐 Cloudflare / EdgeOne / 阿里云 ESA 规则引擎的动态写法：
 * 除了静态值，动作字段的值还支持引用「请求上下文变量」，运行时动态求值。
 *
 * 语法（与用户确认）：大括号风格 `${var}`
 *   - 例：respHeaders.set { "X-Client": "${client_ip}" }
 *        把客户端真实 IP 注入响应头，等价于专业 CDN 的「设置响应头为变量值」。
 *   - 变量名只允许 [a-z0-9_]+（白名单），杜绝任意表达式执行（绝不 eval/Function）。
 *   - 未知变量回退为空串，不抛错、不阻断请求（仅记录 debug note 供排查）。
 *
 * 取数来源：复用 matcher.js buildMatchSubject(ctx) 已算好的特征字段
 * （host/clientIp/method/uri/path/query/country 等），并补充：
 *   - http_<name> ：读取客户端请求头（下划线还原为连字符，如 ${http_x_forwarded_for} → x-forwarded-for）
 *   - cookie_<name>：读取客户端 Cookie 中的某个字段
 *   - query_<name> ：读取 URL 查询参数中的某个字段
 *
 * 性能：expandVars 仅在「字符串含 ${ 」时才进入解析分支，静态值零开销原样返回。
 *
 * 安全：
 *   - 变量名白名单 + 禁止表达式执行（无法注入代码）
 *   - 调用方对头值仍受 isValidHeaderValue 约束（禁 CR/LF）
 *   - 替换结果长度上限由调用方（redirect/rewrite）各自负责
 * ============================================================================
 */

import { buildMatchSubject } from '../proxy/matcher.js';

/** 所有支持的「独立变量名」白名单（不含带 key 的 http_/cookie_/query_ 前缀）。 */
export const SCALAR_VARS = Object.freeze([
  // 客户端访问域名（小写）
  'host',
  // 真实客户端 IP（取自引擎内部 CLIENT_IP_HEADERS 优先级）
  'client_ip',
  // 客户端国家（大写，CF-IPCountry）
  'client_country',
  // 客户端大区（大写，由 ISO 国家码推导）
  'client_continent',
  // 客户端 ASN（取自 cf-asn / asn 头）
  'client_asn',
  // 设备类型（mobile/desktop，由 UA 推导）
  'client_device',
  // HTTP 方法（大写）
  'method',
  // 协议（http/https）
  'scheme',
  // 协议（同 scheme，兼容别名）
  'protocol',
  // 完整请求路径含查询串
  'uri',
  // 请求路径（不含查询串）
  'path',
  // 完整查询串（不含前导 ?）
  'query',
  // 路径末段文件名
  'filename',
  // 文件扩展名（不含点）
  'extension',
  // 文件所在目录（含末尾 /）
  'directory',
  // 客户端 User-Agent
  'user_agent',
  // 客户端 Referer
  'referer',
  // 本次回源源站 id（首要分流维度）
  'origin',
  // 本次回源源站 addr
  'origin_addr',
  // 边缘节点所在国家（取自 cf-...-country，无则回退 client_country）
  'edge_country',
  // 边缘节点编号（取自 cf-ray 第一段，无则空）
  'edge_colo',
  // 本次请求唯一 id（取自 cf-request-id / 自动生成）
  'request_id',
  // 本网关产品名（只读常量，呼应 PRODUCT_NAME）
  'product_name',
  // 直连对端 IP（cf-connecting-ip 优先，否则 socket remote）
  'remote_addr',
]);

/** 带 key 的变量前缀白名单（http_/cookie_/query_）。 */
export const PREFIXED_VARS = Object.freeze(['http_', 'cookie_', 'query_']);

/**
 * 真实客户端 IP 提取（pickClientIp / CLIENT_IP_HEADERS）已下沉到无依赖模块
 * `../utils/clientIp.js`，此处仅做 re-export 以保留对外 API 兼容
 * （scripts/_verify_pickip.mjs 等依赖从 vars.js 取这两个符号）。
 * 下沉目的：打断 vars.js ↔ matcher.js 的循环依赖——matcher.js 现从
 * clientIp.js 直接取 pickClientIp，不再 import vars.js。
 */
import { pickClientIp, CLIENT_IP_HEADERS } from '../utils/clientIp.js';
export { pickClientIp, CLIENT_IP_HEADERS };

/** 变量名整体合法性（标量或带前缀）。 */
const VAR_NAME_RE = /^[a-z0-9_]+$/;
/** ${var} 提取正则。 */
const VAR_REF_RE = /\$\{([a-z0-9_]+)\}/g;
/** 前缀白名单最大键长，防超长键探测。 */
const MAX_KEY_LEN = 256;

let _productName = 'EdgeGateway';
/** 设置产品名常量（来自 defaults.PRODUCT_NAME），避免循环依赖时直接 import。 */
export function setProductName(name) {
  if (typeof name === 'string' && name) _productName = name;
}

/**
 * 解析单个变量名（不含花括号）为字符串值。未知变量返回 ''。
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} name 仅含 [a-z0-9_]
 * @returns {string}
 */
export function resolveVar(ctx, name) {
  if (!name || !VAR_NAME_RE.test(name)) return '';

  // 带 key 前缀
  for (const p of PREFIXED_VARS) {
    if (name.startsWith(p)) {
      const key = name.slice(p.length);
      if (!key || key.length > MAX_KEY_LEN) return '';
      return resolvePrefixedVar(ctx, p, key);
    }
  }

  // 只读常量 / 上下文标量
  switch (name) {
    case 'product_name':
      return _productName;
    case 'request_id':
      return getRequestId(ctx);
    case 'edge_country':
      return edgeField(ctx, 'country') || clientField(ctx, 'country');
    case 'edge_colo':
      return edgeField(ctx, 'colo');
    case 'remote_addr':
      return clientField(ctx, 'remote_addr');
    default:
      break;
  }

  // 其余标量来自 buildMatchSubject 已算好的字段（缓存到 ctx 避免重复计算）。
  // 变量名用下划线（align CDN 习惯），但 subject 字段是驼峰，做别名映射。
  const ALIAS = {
    client_ip: 'clientIp',
    client_country: 'clientCountry',
    client_continent: 'clientContinent',
    client_asn: 'clientAsn',
    client_device: 'clientDevice',
    user_agent: 'userAgent',
    referer: 'referer',
  };
  const subjectKey = ALIAS[name] || name;
  const subject = buildSubject(ctx);
  const v = subject[subjectKey];
  return v === undefined || v === null ? '' : String(v);
}

/** 解析带前缀变量（http_/cookie_/query_）。key 中的 _ 还原为 -。 */
function resolvePrefixedVar(ctx, prefix, key) {
  const headers = ctx?.request?.headers;
  if (prefix === 'http_') {
    if (!headers) return '';
    // 下划线还原为连字符，对齐请求头命名（${http_x_forwarded_for} → x-forwarded-for）
    const hdrName = key.replace(/_/g, '-');
    return headers.get(hdrName) || '';
  }
  if (prefix === 'cookie_') {
    const raw = headers ? headers.get('cookie') || '' : '';
    if (!raw) return '';
    for (const part of raw.split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      if (part.slice(0, eq).trim() === key) return decodeURIComponentSafe(part.slice(eq + 1).trim());
    }
    return '';
  }
  if (prefix === 'query_') {
    const url = ctx?.url;
    if (!url) return '';
    const v = url.searchParams ? url.searchParams.get(key) : '';
    return v == null ? '' : String(v);
  }
  return '';
}

/** 取 buildMatchSubject 结果（缓存进 ctx 以复用，避免每个变量都重算）。 */
function buildSubject(ctx) {
  if (ctx && ctx.__matchSubject) return ctx.__matchSubject;
  const s = buildMatchSubject(ctx);
  if (ctx) ctx.__matchSubject = s;
  return s;
}

/** 客户端直连字段（取自 clientIpHeaders 优先级 / socket remote）。 */
function clientField(ctx, what) {
  const headers = ctx?.request?.headers;
  if (what === 'country') return (headers && headers.get('cf-ipcountry')) || '';
  if (what === 'remote_addr') {
    // 与 ${client_ip} / matcher.js 统一：真实客户端 IP 取自 pickClientIp（CLIENT_IP_HEADERS 优先级）
    if (headers) {
      const ip = pickClientIp(headers);
      if (ip) return ip;
    }
    return ctx?.remoteAddr || '';
  }
  return '';
}

/** 边缘节点字段（cf-ray / cf-...-country）。 */
function edgeField(ctx, what) {
  const headers = ctx?.request?.headers;
  if (!headers) return '';
  if (what === 'country') {
    // 多种 CDN 的「边缘国家」头：优先 cf-...-country（EO/ESA 自有头），回退 cf-ipcountry
    return (
      headers.get('cf-country') ||
      headers.get('eo-country') ||
      headers.get('x-esi-country') ||
      ''
    );
  }
  if (what === 'colo') {
    const ray = headers.get('cf-ray');
    if (ray) return ray.split(' ')[0] || '';
  }
  return '';
}

/** 取/生成请求唯一 id。 */
function getRequestId(ctx) {
  const headers = ctx?.request?.headers;
  const rid = headers && (headers.get('cf-request-id') || headers.get('x-request-id'));
  if (rid) return rid;
  if (ctx && ctx.__requestId) return ctx.__requestId;
  const id = `req_${(Date.now().toString(36))}_${Math.random().toString(36).slice(2, 10)}`;
  if (ctx) ctx.__requestId = id;
  return id;
}

/** 安全解码 URI 组件，失败原样返回。 */
function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * 对字符串做 ${var} 展开。
 * 无 ${ 前缀时原样返回（零开销——这是绝大多数静态配置的路径）。
 * 含 ${ 时，逐个替换白名单内的变量；未知变量回退空串并记录 debug note。
 *
 * @param {string} str 原始配置字符串（可能含 ${var}）
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {{maxLen?: number, label?: string}} [opts]
 *    maxLen：替换后总长度上限，超出则截断（防超长路径/响应体注入）
 * @returns {string}
 */
export function expandVars(str, ctx, opts) {
  if (typeof str !== 'string' || str.indexOf('${') === -1) return str;
  const label = (opts && opts.label) || 'var';
  const maxLen = opts && opts.maxLen ? opts.maxLen : 0;

  const out = str.replace(VAR_REF_RE, (m, name) => {
    // 显式拒绝非法变量名（理论上 VAR_REF_RE 已挡，双保险）
    if (!VAR_NAME_RE.test(name)) return '';
    const val = resolveVar(ctx, name);
    if (val === '' && !SCALAR_VARS.includes(name) && !PREFIXED_VARS.some((p) => name.startsWith(p))) {
      // 未知变量：记 debug，回退空串，不阻断
      if (ctx && ctx.debug && Array.isArray(ctx.debug.notes)) {
        ctx.debug.notes.push(`unknown-var:${name}`);
      }
    }
    return val;
  });

  if (maxLen && out.length > maxLen) {
    return out.slice(0, maxLen);
  }
  return out;
}

/**
 * 提取字符串中出现的变量名集合（供 schema 校验用）。
 * @param {string} str
 * @returns {Set<string>}
 */
export function extractVarNames(str) {
  const out = new Set();
  if (typeof str !== 'string' || str.indexOf('${') === -1) return out;
  let m;
  VAR_REF_RE.lastIndex = 0;
  while ((m = VAR_REF_RE.exec(str)) !== null) {
    out.add(m[1]);
  }
  return out;
}

/**
 * 校验字符串中出现的 ${var} 变量名是否全部合法（在白名单内）。
 * 返回 { ok, unknown: string[] }。
 * @param {string} str
 * @returns {{ok:boolean, unknown:string[]}}
 */
export function validateVarNames(str) {
  const names = extractVarNames(str);
  const unknown = [];
  for (const n of names) {
    if (SCALAR_VARS.includes(n)) continue;
    if (PREFIXED_VARS.some((p) => n.startsWith(p) && n.length > p.length)) continue;
    unknown.push(n);
  }
  return { ok: unknown.length === 0, unknown };
}

/**
 * 是否包含动态变量引用（供调用方快判，避免不必要的解析）。
 * @param {string} str
 * @returns {boolean}
 */
export function hasVars(str) {
  return typeof str === 'string' && str.indexOf('${') !== -1;
}

// ============================================================================
// 双下划线系统占位符体系（__xxx__）
// ----------------------------------------------------------------------------
// 与 ${var}「用户变量」完全隔离的独立体系：
//   - 形态：__name__，全小写字母/数字/下划线，无 ${} 花括号；
//   - 作用：引用本项目运行期内部值（边缘缓存 TTL、调试标记、命中来源等），
//            这些值用户在配置里无法用变量表达，也不应误当成用户变量。
//   - 隔离性：
//       * expandVars 以 indexOf('${') 短路，对 __xxx__ 完全透明；
//       * extractVarNames / validateVarNames 只扫 ${...}，不会误拦截 __xxx__，
//         也无需把 __xxx__ 塞进 SCALAR_VARS 白名单（那样反而混淆两套语义）。
//   - 渲染位置：仅在响应头阶段（applyHeaderOps）求值，不影响请求热路径。
// ============================================================================

/** 匹配 __name__（name 仅含 a-z0-9_），全局、多匹配。 */
export const SYS_REF_RE = /__([a-z0-9_]+)__/g;

/**
 * 把字符串里的 __xxx__ 占位符展开为运行期内部值。
 * 无下划线时直接短路返回，零开销。
 * @param {string} str
 * @param {object} ctx 运行期上下文（含 __globalStages / debug / cache / startTime / caps 等）
 * @returns {string}
 */
export function expandSysVars(str, ctx) {
  if (typeof str !== 'string' || str.indexOf('__') === -1) return str;
  return str.replace(SYS_REF_RE, (m, name) => resolveSysVar(ctx, name));
}

/**
 * 解析单个系统占位符名到运行期内部值。
 * 未知名一律展开为空串（绝不抛错，保持响应头阶段健壮）。
 * @param {object} ctx
 * @param {string} name
 * @returns {string}
 */
function resolveSysVar(ctx, name) {
  const g = ctx && ctx.__globalStages;
  const cache = g && g.cache;
  switch (name) {
    // ---- 边缘缓存参数（来自 DEFAULT_GLOBAL_RULES.cache）----
    case 'edge_ttl':
      return cache && cache.edgeTtl != null ? String(cache.edgeTtl) : '';
    case 'browser_ttl':
      return cache && cache.browserTtl != null ? String(cache.browserTtl) : '';
    case 'swr':
      return cache && cache.staleWhileRevalidate != null ? String(cache.staleWhileRevalidate) : '';
    case 'status_ttl':
      return cache && cache.statusTtl != null ? String(cache.statusTtl) : '';
    // ---- 调试 / 命中标记 ----
    case 'cache':
      return ctx && ctx.debug && ctx.debug.cache != null ? String(ctx.debug.cache) : '';
    case 'site_id':
      return ctx && ctx.debug && ctx.debug.siteId != null ? String(ctx.debug.siteId) : '';
    case 'rule_id':
      return ctx && ctx.debug && ctx.debug.ruleId != null ? String(ctx.debug.ruleId) : '';
    case 'origin_id':
      return ctx && ctx.debug && ctx.debug.originId != null ? String(ctx.debug.originId) : '';
    case 'retry_count':
      return ctx && ctx.debug && ctx.debug.retries != null ? String(ctx.debug.retries) : '';
    case 'edge_time': {
      const start = ctx && ctx.startTime;
      return start != null ? `${Date.now() - start}ms` : '';
    }
    case 'tried_origins':
      return ctx && ctx.debug && Array.isArray(ctx.debug.tried)
        ? ctx.debug.tried.join(',')
        : '';
    // ---- 跨平台差异（CF 双头）：仅 CF 平台展开为值，其余平台展开为空 ----
    case 'cf_cdn_cache_control':
      return ctx && ctx.caps && ctx.caps.platform === 'cf'
        ? 'public, max-age=__edge_ttl__, s-maxage=__edge_ttl__, stale-while-revalidate=__swr__'
        : '';
    default:
      return '';
  }
}
