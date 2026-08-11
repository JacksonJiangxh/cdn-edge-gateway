/**
 * ============================================================================
 * security/guard.js —— 数据面安全防护
 * ----------------------------------------------------------------------------
 * 在回源之前对客户端请求做多层校验，按以下顺序逐条检查，任一条不通过即拦截：
 *   1. IP 白名单（非空则仅放行名单内）
 *   2. IP 黑名单（支持 IPv4 CIDR /8 /16 /24，以及精确匹配、前缀通配）
 *   3. UA 黑名单（子串匹配 或 /regex/ 形式的正则匹配）
 *   3.5 自动程序 Bot 管理（独立包 ②.3：blacklist 拦截命中 / allowlist 仅放行命中）
 *   4. Referer 防盗链（off / whitelist / blacklist 三模式）
 *   5. 签名 URL 校验（HMAC-SHA256 over `path + expire`）
 *   6. 限流（委托 ratelimit.js）
 *
 * 【拦截响应的设计】
 * 所有拦截统一返回 403 + 极简响应体 `Forbidden`，**不透露具体命中了哪条规则**。
 * 原因：如果告诉攻击者「你被 UA 黑名单拦了」，他换个 UA 就能继续探测；
 * 逐条反馈等同于给攻击者一个免费的规则枚举 oracle。
 * 真实原因只写进 `ctx.debug.blockedBy`，仅在调试头中对运维可见。
 * ============================================================================
 */

// 注意：签名 URL 校验位于数据面热路径（每请求都跑），
// 必须用 HMAC（微秒级），绝不能用 PBKDF2（30~80ms CPU，会直接打爆 CPU 配额）。
import { hmacSha256, verifyHmacSha256 } from '../utils/crypto.js';
import { getClientIp } from './loginGuard.js';
import { checkRateLimit } from './ratelimit.js';

/** 统一的拦截响应体，简短且无信息量。 */
const BLOCK_BODY = 'Forbidden';

/**
 * 构造统一的拦截响应。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} reason 内部原因标记，仅写入 debug，不进响应体
 * @param {number} [status=403] HTTP 状态码
 * @returns {Response} 拦截响应
 */
function block(ctx, reason, status = 403) {
  try {
    if (ctx && ctx.debug) ctx.debug.blockedBy = reason;
  } catch {
    /* ignore */
  }
  return new Response(BLOCK_BODY, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// ============================================================================
// 1 & 2. IP 匹配
// ============================================================================

/**
 * 把 IPv4 点分字符串转成 32 位无符号整数。
 * @param {string} ip IPv4 字符串
 * @returns {number|null} 整数值；非 IPv4 返回 null
 */
function ipv4ToInt(ip) {
  const parts = String(ip).split('.');
  if (parts.length !== 4) return null;
  let val = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    val = (val << 8) | n;
  }
  return val >>> 0;
}

/**
 * 判断 IP 是否命中单条规则。支持三种写法：
 *   - 精确匹配： `1.2.3.4` / IPv6 全串
 *   - CIDR：     `10.0.0.0/8` `172.16.0.0/16` `192.168.1.0/24`（IPv4，任意 0-32 位）
 *   - 前缀通配： `1.2.3.*` 或 `2001:db8:*`
 *
 * @param {string} ip 客户端 IP
 * @param {string} rule 规则字符串
 * @returns {boolean} 是否命中
 */
function ipMatchesRule(ip, rule) {
  const r = String(rule || '').trim().toLowerCase();
  const target = String(ip || '').trim().toLowerCase();
  if (!r || !target || target === 'unknown') return false;

  // CIDR
  const slash = r.indexOf('/');
  if (slash > 0) {
    const base = r.slice(0, slash);
    const bits = parseInt(r.slice(slash + 1), 10);
    if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;

    const baseInt = ipv4ToInt(base);
    const ipInt = ipv4ToInt(target);
    // 仅支持 IPv4 CIDR：base/target 任一无法解析为 IPv4（如 IPv6）则视为不匹配，直接 false
    if (baseInt === null || ipInt === null) return false;
    if (bits === 0) return true;
    const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
    return (baseInt & mask) === (ipInt & mask);
  }

  // 前缀通配
  if (r.endsWith('*')) {
    return target.startsWith(r.slice(0, -1));
  }

  // 精确匹配
  return target === r;
}

/**
 * 判断 IP 是否命中列表中任意一条规则。
 * @param {string} ip 客户端 IP
 * @param {string[]} list 规则列表
 * @returns {boolean} 是否命中
 */
function ipInList(ip, list) {
  if (!Array.isArray(list) || list.length === 0) return false;
  for (const rule of list) {
    if (ipMatchesRule(ip, rule)) return true;
  }
  return false;
}

// ============================================================================
// 3. UA 匹配
// ============================================================================

/**
 * 判断 UA 是否命中黑名单。
 * 仅做大小写不敏感的子串匹配。
 * 不再支持正则 —— 正则不仅有灾难性回溯的 CPU 风险，且 Workers 免费版
 * CPU 配额有限，一个恶意构造的 regex 可能耗尽 isolate 的所有 CPU 时间。
 * 子串匹配的速度远快于正则，且对于 UA 黑/白名单场景完全够用。
 *
 * @param {string} ua 客户端 User-Agent
 * @param {string[]} list UA 黑名单
 * @returns {boolean} 是否命中
 */
function uaBlocked(ua, list) {
  if (!Array.isArray(list) || list.length === 0) return false;
  const target = String(ua || '');
  const lower = target.toLowerCase();

  for (const raw of list) {
    const rule = String(raw || '').trim();
    if (!rule) continue;
    if (lower.includes(rule.toLowerCase())) return true;
  }
  return false;
}

// ============================================================================
// 4. Referer 防盗链
// ============================================================================

/**
 * 从 Referer 头中提取主机名。
 * @param {string} referer Referer 原始值
 * @returns {string} 小写主机名；无法解析返回空串
 */
function refererHost(referer) {
  try {
    if (!referer) return '';
    return new URL(referer).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * 判断域名是否匹配单条规则。支持：
 *   - 精确：      `example.com`
 *   - 通配子域：  `*.example.com`（匹配 a.example.com、a.b.example.com，
 *                 同时也匹配裸域 example.com —— 这是用户配置时的普遍预期）
 *   - 全通配：    `*`
 * 规则里带协议或路径（如 `https://a.com/`）时自动提取其 hostname。
 *
 * @param {string} host 待判定主机名（已小写）
 * @param {string} rule 规则
 * @returns {boolean} 是否匹配
 */
function domainMatches(host, rule) {
  let r = String(rule || '').trim().toLowerCase();
  if (!r || !host) return false;
  if (r === '*') return true;

  // 规则里写了完整 URL 时提取 hostname
  if (r.includes('://')) {
    try {
      r = new URL(r).hostname.toLowerCase();
    } catch {
      /* 保持原值 */
    }
  }
  r = r.replace(/\/.*$/, '').replace(/:\d+$/, '');

  if (r.startsWith('*.')) {
    const base = r.slice(2);
    if (!base) return false;
    return host === base || host.endsWith(`.${base}`);
  }
  return host === r;
}

/**
 * Referer 防盗链检查。
 * @param {Request} request 客户端请求
 * @param {import('../contracts.js').Security} sec 站点安全配置
 * @returns {boolean} true = 应当拦截
 */
function refererBlocked(request, sec) {
  const mode = sec.refererMode;
  if (mode !== 'whitelist' && mode !== 'blacklist') return false;

  const raw = request.headers.get('Referer') || '';
  const host = refererHost(raw);

  // 空 Referer（直连、隐私策略剥离、部分客户端）单独由开关控制
  if (!host) {
    // allowEmptyReferer 未显式配置时默认放行，避免误伤大量正常直连流量
    return sec.allowEmptyReferer === false;
  }

  const list = Array.isArray(sec.refererList) ? sec.refererList : [];
  let hit = false;
  for (const rule of list) {
    if (domainMatches(host, rule)) {
      hit = true;
      break;
    }
  }

  if (mode === 'whitelist') {
    // 白名单为空时视为「未配置」，全部放行，避免误配导致站点整体不可用
    if (list.length === 0) return false;
    return !hit;
  }
  // blacklist
  return hit;
}

// ============================================================================
// 5. 签名 URL
// ============================================================================

/**
 * 校验签名 URL。
 *
 * 约定：`?{param}={signature}&t={expire}`
 *   signature = HMAC-SHA256(secret, `${path}${expire}`)，**base64url 编码**
 *               （`utils/crypto.js` 的 hmacSha256 原生返回该格式，可直接放进
 *               查询串，无需 percent-encoding）
 *   expire    = 绝对过期时间（Unix 秒）
 *
 * 校验点：
 *   - 缺参 / expire 非法 → 拦截
 *   - 当前时间 > expire  → 拦截（过期）
 *   - 签名不匹配         → 拦截（恒定时间比较，防时序侧信道逐字节爆破）
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {{enabled:boolean, secret:string, ttl:number, param:string}} cfg 签名配置
 * @returns {Promise<boolean>} true = 应当拦截
 */
/**
 * 构造签名原文。校验侧与生成侧必须使用同一函数，任何不对称都会导致全部签名失效。
 *
 * 原文包含 host，使签名与站点绑定，防止链接被跨站重放。
 * 用 `\n` 作分隔符（host/path 中均不可能出现），避免
 * `host=a.com,path=/b` 与 `host=a.com/b,path=''` 被拼成同一串的歧义。
 *
 * @param {string} host 请求主机名
 * @param {string} pathname 资源路径
 * @param {number|string} expire 过期时间戳（秒）
 * @returns {string} 用于 HMAC 的签名原文
 */
function signaturePayload(host, pathname, expire) {
  return `${String(host || '').toLowerCase()}\n${pathname}\n${expire}`;
}

async function signedUrlBlocked(ctx, cfg) {
  const param = String(cfg.param || 'sign');
  const secret = String(cfg.secret || '');
  // 未配置密钥时无法校验；此时拦截而不是放行，避免「开了开关却形同虚设」
  if (!secret) return true;

  const q = ctx.url.searchParams;
  const provided = q.get(param);
  const expireRaw = q.get('t');
  if (!provided || !expireRaw) return true;

  if (!/^\d{1,15}$/.test(expireRaw)) return true;
  const expire = parseInt(expireRaw, 10);
  if (!Number.isFinite(expire)) return true;

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > expire) return true;

  // 可选的最大有效期约束：防止签发一个 100 年后过期的永久链接
  const ttl = Number(cfg.ttl);
  if (Number.isFinite(ttl) && ttl > 0 && expire - nowSec > ttl) return true;

  try {
    // verifyHmacSha256 内部重算签名并做恒定时间比较，异常吞掉返回 false。
    // 注意签名是 base64url，**大小写敏感**，绝不能做 toLowerCase 归一化。
    //
    // 签名串包含 host：否则同一密钥签出的链接可在任意共用该配置的站点间复用
    // （跨站重放）。host 取自 Host 头并小写归一，与 buildSignedQuery 严格对称。
    const okSig = await verifyHmacSha256(
      secret,
      signaturePayload(ctx.url.hostname, ctx.url.pathname, expire),
      String(provided)
    );
    return !okSig;
  } catch {
    // 计算失败时保守拦截
    return true;
  }
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * 数据面安全检查总入口。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {import('../contracts.js').Site|null} site 命中的站点配置
 * @returns {Promise<Response|null>} null = 放行；Response = 拦截（统一 403）
 *
 * @example
 * const blocked = await checkSecurity(ctx, site);
 * if (blocked) return blocked;
 */
export async function checkSecurity(ctx, site) {
  try {
    const sec = site && site.security;
    if (!sec || typeof sec !== 'object') return null;

    const request = ctx.request;
    const ip = getClientIp(request);

    // ---- 1. IP 白名单：非空则只允许名单内 ----
    if (Array.isArray(sec.ipWhitelist) && sec.ipWhitelist.length > 0) {
      if (!ipInList(ip, sec.ipWhitelist)) return block(ctx, 'ip-whitelist');
    }

    // ---- 2. IP 黑名单 ----
    if (ipInList(ip, sec.ipBlacklist)) return block(ctx, 'ip-blacklist');

    // ---- 3. UA 黑名单 ----
    if (uaBlocked(request.headers.get('User-Agent') || '', sec.uaBlacklist)) {
      return block(ctx, 'ua-blacklist');
    }

    // ---- 3.5 自动程序（Bot 管理）：独立于 ②.2 的 UA 黑名单 ----
    // 这是 ②.3 真正独立的最小任务包：单独的 enabled / mode / list，
    // 不依赖 ②.2 的 uaBlacklist，避免「Bot 维度」被 UA 黑名单偷走。
    const bm = sec.botManagement;
    if (bm && bm.enabled === true) {
      const ua = request.headers.get('User-Agent') || '';
      const hit = uaBlocked(ua, bm.list || []);
      // blacklist：命中则拦截；allowlist：未命中则拦截（仅放行名单内良性 Bot）
      const blocked = bm.mode === 'allowlist' ? !hit : hit;
      if (blocked) return block(ctx, 'bot-management');
    }

    // ---- 4. Referer 防盗链 ----
    if (refererBlocked(request, sec)) return block(ctx, 'referer');

    // ---- 5. 签名 URL ----
    if (sec.signedUrl && sec.signedUrl.enabled === true) {
      if (await signedUrlBlocked(ctx, sec.signedUrl)) return block(ctx, 'signed-url');
    }

    // ---- 6. 限流 ----
    if (sec.rateLimit && sec.rateLimit.enabled === true) {
      const host = (site && site.host) || ctx.url.hostname;
      const r = await checkRateLimit(ctx, host, ip, sec.rateLimit.rpm);
      if (r.limited) {
        // 限流用 429 更符合语义，且响应体同样不含细节
        const resp = block(ctx, 'ratelimit', 429);
        try {
          resp.headers.set('Retry-After', String(r.retryAfter));
        } catch {
          /* headers 不可变时忽略 */
        }
        return resp;
      }
    }

    return null;
  } catch (err) {
    // 【fail-closed】安全检查自身异常时必须拦截，不能放行。
    //
    // 早期实现在此 return null（fail-open），这是一个严重缺陷：任何异常
    // —— KV 抖动导致限流读失败、正则回溯超时、配置字段类型异常 ——
    // 都会让防盗链 / IP 黑名单 / 限流 / 签名 URL 全部静默失效，
    // 且攻击者可以主动构造畸形输入触发异常来绕过所有防护。
    //
    // 之所以能安全地改为 fail-closed：进入 catch 的前提是 sec 存在且合法
    // （见开头的 `if (!sec) return null`），即用户**确实配置了**安全规则。
    // 未配置安全策略的站点根本不会走到这里，因此不存在「误伤整站」的风险。
    try {
      console.error('[guard] 安全检查异常，按 fail-closed 拦截：', String((err && err.message) || err));
    } catch {
      /* ignore */
    }
    try {
      return block(ctx, 'guard-error');
    } catch {
      // 连 block() 都失败时，兜底返回一个最小 403，绝不放行。
      return new Response('Forbidden', {
        status: 403,
        headers: { 'cache-control': 'no-store' },
      });
    }
  }
}

/**
 * 生成一个签名 URL 的查询串，供管理后台「生成防盗链地址」功能使用。
 *
 * @param {string} pathname 资源路径（如 `/img/a.jpg`）
 * @param {string} secret 签名密钥
 * @param {number} ttl 有效期（秒）
 * @param {string} [param='sign'] 签名参数名
 * @param {string} [host=''] 链接所属主机名，**必须**与访问时的 Host 一致，
 *   否则校验必定失败。签名与 host 绑定是为了防止跨站重放。
 * @returns {Promise<string>} 形如 `sign=abc...&t=1712345678` 的查询串
 */
export async function buildSignedQuery(pathname, secret, ttl, param = 'sign', host = '') {
  const expire = Math.floor(Date.now() / 1000) + (Number(ttl) > 0 ? Math.floor(Number(ttl)) : 3600);
  // 与 signedUrlBlocked 严格对称：共用 signaturePayload() 构造原文，
  // 同样的 base64url 编码。base64url 字符集（A-Za-z0-9-_）本身即 URL 安全，
  // 无需再 encodeURIComponent。
  const sig = await hmacSha256(String(secret || ''), signaturePayload(host, pathname, expire));
  return `${encodeURIComponent(param)}=${sig}&t=${expire}`;
}
