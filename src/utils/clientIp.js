/**
 * ============================================================================
 * utils/clientIp.js —— 真实客户端 IP 提取（无依赖底层模块）
 * ----------------------------------------------------------------------------
 * 从请求头按平台优先级提取真实客户端 IP，供 matcher / headers / vars 三处复用，
 * 避免提取逻辑分叉（尤其 forwarded 不能原样透出整串）。
 *
 * 本模块刻意不依赖 vars.js / matcher.js，以打断「vars ↔ matcher」的循环依赖：
 * 过去 vars.js（为拿 buildMatchSubject）import matcher.js，matcher.js（为拿
 * pickClientIp）又 import vars.js，构成双向循环。把 pickClientIp 下沉到此无依赖
 * 模块后，matcher.js 不再 import vars.js，循环断开，vars.js → matcher.js 成为
 * 单向合法依赖。
 *
 * 解析规则：
 *   - forwarded（RFC7239）：取首个 for= 值，剥离可选方括号（IPv6）与端口；
 *     形如 `for=1.2.3.4:5678;proto=https` 或 `for="[2001:db8::1]:443"` → 1.2.3.4 / 2001:db8::1
 *   - cloudfront-viewer-address：形如 `1.2.3.4:1234`（含端口）→ 剥离端口
 *   - 其余：取 headers.get(h) 逗号分隔的首段并 trim（防 x-forwarded-for 链串误用整串）
 * ============================================================================
 */

/**
 * 真实客户端 IP 头优先级（平台专有 → 反代 → 通用转发链）。
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
 * 统一供 matcher.js（${client_ip}）、headers.js（回源头注入）、vars.clientField（remote_addr）
 * 三处复用。
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
