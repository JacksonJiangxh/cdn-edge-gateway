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
 * 提取真实客户端 IP 的回源/请求头优先级（引擎内部常量，非可配 settings）。
 * 顺序按「可信专有（不可伪造）→ 反代/网关注入 → 通用转发链（易被伪造）」排序：
 *   1) 平台专有真实 IP 头：cf-connecting-ip / true-client-ip / fastly-client-ip /
 *      eo-connecting-ip / ali-cdn-real-ip / akamai-client-ip / cloudfront-viewer-address
 *   2) 反代/网关注入头：x-real-ip / x-client-ip / client-ip / remote-addr /
 *      x-original-forwarded-for / x-envoy-external-address
 *   3) 通用转发链（最后，客户端可任意追加）：x-forwarded-for / forwarded
 *      forwarded 为 RFC7239 结构化头（for=1.2.3.1;proto=https），由 pickClientIp 解析首段。
 * 此前曾作为 settings.request.clientIpHeaders 暴露，现下沉为引擎常量，
 * 因它本质是「流量序列内部量」——其提取结果（${client_ip}）供别的头/动作使用。
 * 放在 vars.js 而非 defaults.js，以避免 defaults↔vars 循环依赖
 * （defaults 顶层会同步调用本模块的 setProductName，若本模块再 import defaults 将触发 TDZ）。
 * 想注入源站头仍用规则 action 的 clientIpHeader + ${client_ip}，无需改此优先级。
 * 发现新头直接在此数组追加即可（改代码即生效，无需动 settings/schema）。
 */
export const CLIENT_IP_HEADERS = Object.freeze([
  // —— 平台专有真实 IP 头（对应平台不可伪造，优先级最高）——
  // Cloudflare
  'cf-connecting-ip',
  // Akamai / Cloudflare Enterprise
  'true-client-ip',
  // Fastly
  'fastly-client-ip',
  // Fastly (SSL 终止处)
  'fastly-ssl-client-ip',
  // 腾讯云 EdgeOne
  'eo-connecting-ip',
  // 阿里云 CDN / DCDN
  'ali-cdn-real-ip',
  // Akamai
  'akamai-client-ip',
  // AWS CloudFront（含端口，pickClientIp 剥离）
  'cloudfront-viewer-address',
  // —— 反代 / 网关注入头 ——
  // Nginx / Caddy / Traefik / Kong
  'x-real-ip',
  // HAProxy / Kong
  'x-client-ip',
  // 通用 / 老旧反代
  'client-ip',
  // 请求头形态（区别于 socket remote_addr）
  'remote-addr',
  // Nginx 原始 XFF（再代理一层时保留）
  'x-original-forwarded-for',
  // Envoy 外部客户端地址
  'x-envoy-external-address',
  // UCloud 反代
  'x-ucloud-remote-ip',
  // —— 通用转发链（最后，客户端可任意追加，最易被伪造）——
  // 事实标准，逗号分隔链
  'x-forwarded-for',
  // RFC7239 结构化头（for=...;...），由 pickClientIp 解析
  'forwarded',
]);

/**
 * 从请求头中按 CLIENT_IP_HEADERS 优先级提取真实客户端 IP。
 *
 * 统一供 matcher.js（${client_ip}）、headers.js（回源头注入）、clientField('remote_addr')
 * 三处复用，避免提取逻辑分叉（尤其 forwarded 不能原样透出整串）。
 *
 * 解析规则：
 *   - forwarded（RFC7239）：取首个 for= 值，剥离可选方括号（IPv6）与端口；
 *     形如 `for=1.2.3.4:5678;proto=https` 或 `for="[2001:db8::1]:443"` → 1.2.3.4 / 2001:db8::1
 *   - cloudfront-viewer-address：形如 `1.2.3.4:1234`（含端口）→ 剥离端口
 *   - 其余：取 headers.get(h) 逗号分隔的首段并 trim（防 x-forwarded-for 链串误用整串）
 *
 * @param {Headers|null|undefined} headers 请求头集合
 * @returns {string} 真实客户端 IP，无命中返回 ''
 */
export function pickClientIp(headers) {
  if (!headers) return '';
  for (const h of CLIENT_IP_HEADERS) {
    const raw = headers.get(h);
    if (!raw) continue;
    const val = raw.trim();
    if (!val) continue;

    if (h === 'forwarded') {
      const ip = parseForwardedFor(val);
      if (ip) return ip;
      continue;
    }
    if (h === 'cloudfront-viewer-address') {
      // 形如 1.2.3.4:1234 或 [ipv6]:port
      const noPort = val.includes(']') ? val.slice(0, val.lastIndexOf(']') + 1) : val.split(':')[0];
      if (noPort) return noPort;
      continue;
    }
    // 通用：取逗号分隔首段（链中第一个即最原始客户端），再 trim
    const first = val.split(',')[0].trim();
    if (first) return first;
  }
  return '';
}

/**
 * 解析 RFC7239 forwarded 头的首个 for= 值。
 * @param {string} forwarded forwarded 头原始值
 * @returns {string} 提取出的 IP（已去端口/方括号），无则 ''
 */
function parseForwardedFor(forwarded) {
  // 非全局正则 + exec，避免 lastIndex 状态污染
  const re = /^for=("?)([^\s;,"]+)\1/i;
  const m = re.exec(forwarded);
  let ip = m ? m[2] : '';
  if (!ip) return '';
  // 去端口（for=1.2.3.4:5678）
  if (ip.includes('.')) ip = ip.split(':')[0];
  else if (ip.startsWith('[')) {
    // IPv6 方括号形式 [2001:db8::1]:443
    const end = ip.indexOf(']');
    if (end > 0) ip = ip.slice(1, end);
  } else if (ip.includes(':')) {
    // IPv6 无方括号（罕见）取首段段
    ip = ip.split(':')[0];
  }
  return ip;
}

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
