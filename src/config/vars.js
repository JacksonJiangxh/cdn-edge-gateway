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
  'host',            // 客户端访问域名（小写）
  'client_ip',       // 真实客户端 IP（取自 clientIpHeaders 优先级）
  'client_country',  // 客户端国家（大写，CF-IPCountry）
  'client_continent',// 客户端大区（大写，由 ISO 国家码推导）
  'client_asn',      // 客户端 ASN（取自 cf-asn / asn 头）
  'client_device',   // 设备类型（mobile/desktop，由 UA 推导）
  'method',          // HTTP 方法（大写）
  'scheme',          // 协议（http/https）
  'protocol',        // 协议（同 scheme，兼容别名）
  'uri',             // 完整请求路径含查询串
  'path',            // 请求路径（不含查询串）
  'query',           // 完整查询串（不含前导 ?）
  'filename',        // 路径末段文件名
  'extension',       // 文件扩展名（不含点）
  'directory',       // 文件所在目录（含末尾 /）
  'user_agent',      // 客户端 User-Agent
  'referer',         // 客户端 Referer
  'origin',          // 本次回源源站 id（首要分流维度）
  'origin_addr',     // 本次回源源站 addr
  'edge_country',    // 边缘节点所在国家（取自 cf-...-country，无则回退 client_country）
  'edge_colo',       // 边缘节点编号（取自 cf-ray 第一段，无则空）
  'request_id',      // 本次请求唯一 id（取自 cf-request-id / 自动生成）
  'product_name',    // 本网关产品名（只读常量，呼应 PRODUCT_NAME）
  'remote_addr',     // 直连对端 IP（cf-connecting-ip 优先，否则 socket remote）
]);

/** 带 key 的变量前缀白名单（http_/cookie_/query_）。 */
export const PREFIXED_VARS = Object.freeze(['http_', 'cookie_', 'query_']);

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
    client_asn: 'clientAsn',
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

/** 客户端直连字段（cf-connecting-ip / socket remote）。 */
function clientField(ctx, what) {
  const headers = ctx?.request?.headers;
  if (what === 'country') return (headers && headers.get('cf-ipcountry')) || '';
  if (what === 'remote_addr') {
    const ip = headers && (headers.get('cf-connecting-ip') || headers.get('x-real-ip'));
    if (ip) return ip;
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

/** 把 ISO 国家码推导大区（常用即可，未知返回 ''）。 */
const CONTINENT_MAP = Object.freeze({
  // 北美
  US: 'NA', CA: 'NA', MX: 'NA',
  // 南美
  BR: 'SA', AR: 'SA', CL: 'SA', CO: 'SA', PE: 'SA',
  // 欧洲
  GB: 'EU', DE: 'EU', FR: 'EU', NL: 'EU', ES: 'EU', IT: 'EU', RU: 'EU',
  // 亚洲
  CN: 'AS', JP: 'AS', KR: 'AS', IN: 'AS', SG: 'AS', HK: 'AS', TW: 'AS', TH: 'AS',
  // 大洋洲
  AU: 'OC', NZ: 'OC',
  // 非洲
  ZA: 'AF', EG: 'AF', NG: 'AF', KE: 'AF',
});

/**
 * 推导客户端大区（基于 cf-ipcountry）。仅作为 client_continent 变量的数据源，
 * 不依赖额外库。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {string}
 */
export function resolveContinent(ctx) {
  const cc = (clientField(ctx, 'country') || '').toUpperCase();
  return CONTINENT_MAP[cc] || '';
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
