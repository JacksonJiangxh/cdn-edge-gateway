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

import { getClientIp } from './loginGuard.js';
import { checkRateLimit } from './ratelimit.js';
import { DEFAULT_GLOBAL_RULES } from '../config/defaults.js';

/**
 * 合并「全站安全校验兜底 → 站点安全配置」：站点字段覆盖同名全站字段，
 * 站点未设的字段沿用全站兜底。
 *
 * 关键纠偏：站点 security 在管理面是「整份默认空对象」（每个字段都带值，
 * 名单默认是空数组）。若站点整份覆盖全站，全站配好的 uaBlacklist / ipBlacklist
 * 等会被站点的空名单「清空」——这与单轨化「全站默认 + 站点覆盖」的直觉相悖。
 * 因此数组类字段仅在「站点数组非空」时才覆盖全站（空数组视为「站点未自定义该名单」，
 * 继承全站）；标量字段站点给了值（含 false / 0 / ''）即覆盖。
 *
 * 仅做一层浅合并——security 内部结构扁平，无嵌套对象需要递归。
 * @param {Object} gSec 全站兜底 security（stages.security）
 * @param {Object} siteSec 站点 security（覆盖层）
 * @returns {Object} 合并后的 security 配置
 */
function mergeSecurity(gSec, siteSec) {
  const out = { ...(gSec || {}) };
  for (const k of Object.keys(siteSec || {})) {
    const sv = siteSec[k];
    if (sv === undefined) continue;
    // 数组字段：仅当站点非空时才覆盖全站；空数组表示「站点未自定义」，继承全站名单
    if (Array.isArray(sv)) {
      if (sv.length > 0) out[k] = sv;
    } else {
      out[k] = sv;
    }
  }
  return out;
}

/**
 * 构造统一的拦截响应。
 *
 * 拦截体 / 缓存控制来自「错误处理」阶段的全站默认（stages.error），
 * 用户可在「全站通用规则 · 错误处理」里改（含直接粘贴一整页自定义错误页 HTML），
 * 无需改代码。单轨化前这两项藏在 settings.error 里，前端完全不可见。
 *
 * 响应 Content-Type 依据 blockBody 是否为 HTML 自动判定：
 * 用户粘贴 HTML 却仍以 text/plain 下发会让浏览器显示源码，是很常见的坑。
 *
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
  const err = (ctx && ctx.__globalStages && ctx.__globalStages.error) || DEFAULT_GLOBAL_RULES.error;
  const body = err.blockBody || 'Forbidden';
  const isHtml = /^\s*(?:<!doctype html|<html)/i.test(body);
  return new Response(body, {
    status,
    headers: {
      'Content-Type': isHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': err.blockCacheControl || 'no-store',
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

// 说明：此处原有「5. 签名 URL」一节（signaturePayload / signedUrlBlocked）。
// 该功能实现不完整（管理面无签发入口、密钥缺失时的行为反直觉、与 CDN 缓存键
// 相互冲突），属于「看着有、实际不可用」的半成品，已整体移除，
// 避免用户以为开关一开就有防盗链保护。防盗链请使用 Referer 校验（第 4 节）。

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
    // 单轨化：security 是「全站通用规则 · 安全校验」阶段的默认 action，
    // 站点 security 对其做逐字段覆盖。全站兜底必须参与校验，否则全站安全策略
    // （uaBlacklist / ipBlacklist / rateLimit / referer 等）形同虚设。
    const gSec = (ctx && ctx.__globalStages && ctx.__globalStages.security) || DEFAULT_GLOBAL_RULES.security;
    const siteSec = (site && site.security) || {};
    const sec = mergeSecurity(gSec, siteSec);
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

    // ---- 5. 限流 ----
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
    // 都会让防盗链 / IP 黑名单 / 限流全部静默失效，
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

// 说明：此处原有 buildSignedQuery（供管理后台「生成防盗链地址」用），
// 随签名 URL 功能一并移除——管理面并未接入该入口，属于死代码。
