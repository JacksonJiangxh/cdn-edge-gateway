/**
 * ============================================================================
 * 伪装页
 * ----------------------------------------------------------------------------
 * 当请求的 host 没有匹配到任何已配置站点时，返回一个「看起来平平无奇」的页面，
 * 而不是暴露「这里是一个可配置的反代网关」的 404 文案。
 *
 * 设计要点：
 *  1. 响应体与响应头都不得包含 host、路径、配置项等任何可用于指纹识别的信息。
 *  2. 不携带 X-Request-Id 等自研头部——那本身就是最强的指纹。
 *  3. static 模式零 subrequest 开销，是默认选择；
 *     proxy 模式更逼真，但每次请求消耗一次 subrequest，且失败时必须降级。
 *  4. 任何异常都不能冒泡：伪装页是兜底路径，它自己绝不能成为故障源。
 *  5. 【配额优化】伪装页响应设置长 CDN 缓存（24h），让 CF 边缘直接缓存，
 *     后续同一未授权 URL 的请求不再打到 Workers，节省每日 10W 次请求配额。
 *     proxy 模式额外增加 isolate 级内存缓存，同一 isolate 内只 fetch 一次目标。
 *  6. 【指纹自洽】内置静态页是「仿 Cloudflare 5xx 拦截页」，故 Server 响应头同步为
 *     `cloudflare`（而非 nginx），避免出现「页面声称 CF、响应头却是 nginx」的致命矛盾。
 * ============================================================================
 */

import { DEFAULT_DISGUISE, DEFAULT_GLOBAL_RULES } from '../config/defaults.js';

/**
 * 伪装页 Server 头指纹（默认 'cloudflare'）。
 * 与内置 STATIC_HTML（仿 Cloudflare 5xx 拦截页）语义自洽：
 * 页面声称是 Cloudflare 拦截页，响应头也必须是 cloudflare，否则「页面 CF、头 nginx」
 * 的矛盾会成为最强的「这是假 CF」指纹。
 * 此值本质是「流量序列内部量」，不作为可配项；若需变更伪装指纹，改此引擎常量即可。
 */
const DISGUISE_SERVER_NAME = 'cloudflare';

/**
 * 内置静态伪装页。
 *
 * 仿 Cloudflare 5xx 拦截页（对齐现有 Nginx 静态 502 页的视觉），用于「host 未匹配到站点」
 * 时的兜底：让扫描器 / 盗刷脚本以为是真实的 Cloudflare 边缘在拦截，从而放弃进一步探测。
 *
 * 遵循伪装页设计要点（见文件头）：
 *  - 无域名 / 无 host 指纹；
 *  - 无 Click-to-reveal IP 等 JS 交互（静态页，可被边缘稳定长缓存、零失败面）；
 *  - 所有可辨识字段（Ray ID / 大区）采用「固定但格式真实」的占位值：
 *    真实 CF 每次请求 Ray ID 不同，但本伪装页依赖长 CDN 缓存省 Workers 配额，
 *    故用固定值以保证缓存命中；取值刻意写成真实 CF 的 16 位 hex / 机场码形态，
 *    外观与真实页无差异，又不泄露任何配置信息；
 *  - 内联样式，无外部依赖、无外部可观测信号；
 *  - `Server` 响应头同步为 `cloudflare`（见 staticDisguise），与页面语义自洽，
 *    避免出现「页面声称 CF、响应头却是 nginx」的致命指纹矛盾。
 *
 * 注意：本页与 src/errorPage.js 的 buildErrorPage（异常兜底页，带随机 Ray ID / IP reveal）
 * 用途不同——disguise 必须「静态 + 可缓存 + 零失败」，故不复用，独立维护此静态版。
 */
const STATIC_HTML = `<!DOCTYPE html>
<!--[if lt IE 7]><html class="no-js ie6 oldie" lang="en-US"><![endif]-->
<!--[if IE 7]><html class="no-js ie7 oldie" lang="en-US"><![endif]-->
<!--[if IE 8]><html class="no-js ie8 oldie" lang="en-US"><![endif]-->
<!--[if gt IE 8]><!-->
<html class="no-js" lang="en-US">
<!--<![endif]-->
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=Edge">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>502: Bad gateway</title>
    <style>
      body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#333;background:#fff}
      #cf-wrapper{max-width:960px;margin:0 auto;padding:0 16px}
      .code-label{display:inline-block;margin-left:.5rem;padding:.1rem .5rem;font-size:.8rem;background:#f3f4f6;color:#6b7280;border-radius:.25rem}
      h1{font-weight:300;font-size:2rem;line-height:1.2;margin:.5rem 0}
      .grid{display:flex;flex-wrap:wrap;margin:2rem 0;border-top:1px solid #eee;padding-top:1.5rem}
      .cell{flex:1 1 33%;min-width:200px;padding:1rem;text-align:center}
      .ok{color:#16a34a}.err{color:#dc2626}
      h2{font-size:1.25rem;font-weight:400;margin:.5rem 0}
      .cf-error-footer{margin-top:1.5rem;padding-top:1rem;border-top:1px solid #eee;font-size:.8rem;color:#6b7280}
    </style>
</head>

<body>
    <div id="cf-wrapper">
        <div id="cf-error-details">
            <header>
                <h1>
                    <span>Bad gateway</span>
                    <span class="code-label">Error code 502</span>
                </h1>
                <div>Visit <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_502" target="_blank" rel="noopener noreferrer">cloudflare.com</a> for more information.</div>
                <div class="mt-3">2026-03-28 07:42:15 UTC</div>
            </header>

            <div class="grid">
                <div class="cell">
                    <span class="ok">&#9679;</span>
                    <h3>Browser</h3>
                    <span class="ok">Working</span>
                </div>
                <div class="cell">
                    <span class="ok">&#9679;</span>
                    <h3>Cloudflare</h3>
                    <span class="ok">Working</span>
                    <div>SJC</div>
                </div>
                <div class="cell">
                    <span class="err">&#9679;</span>
                    <h3>Host</h3>
                    <span class="err">Error</span>
                </div>
            </div>

            <div>
                <h2>What happened?</h2>
                <p>The web server reported a bad gateway error.</p>
                <h2>What can I do?</h2>
                <p>Please try again in a few minutes.</p>
            </div>

            <div class="cf-error-footer">
                Cloudflare Ray ID: <strong>f3b9e1a7c2d4f608</strong>
                <span> &bull; </span>
                Performance &amp; security by
                <a rel="noopener noreferrer" href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_502" target="_blank">Cloudflare</a>
            </div>
        </div>
    </div>
</body>
</html>
`;

// ============================================================================
// 伪装页缓存策略
// ============================================================================
// 伪装页 TTL / isolate 缓存时长等参数，已从本文件的硬编码常量迁移到
// 「缓存」阶段的全站默认动作 stages.cache.disguise（见 config/defaults.js）——
// 因为「伪装页缓存多久」本质是缓存配置，理应和其他缓存项在同一处可视化。
// 运行时由 renderDisguise 从 ctx.__globalStages.cache.disguise 读取，用户改完即生效。
//
// 反代模式的伪装 UA 不再单独配置：直接复用「修改请求头」阶段的默认 User-Agent
// （stages.reqHeaders.set['User-Agent']），避免同一个「回源时假装成什么浏览器」
// 的语义在两处各配一份。

/** 反代模式 isolate 级缓存：{ key, body, status, headers, cachedAt } */
let _proxyDisguiseCache = null;

/**
 * 生成伪装响应。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {import('../contracts.js').Disguise} [disguise] 伪装策略，缺省用默认值
 * @returns {Promise<Response>}
 */
export async function renderDisguise(ctx, disguise) {
  const cfg = disguise || DEFAULT_DISGUISE;
  // 伪装页缓存参数来自「缓存」阶段的全站默认（stages.cache.disguise）
  const gStages = ctx.__globalStages || {};
  const gCache = (gStages.cache && typeof gStages.cache === 'object') ? gStages.cache : DEFAULT_GLOBAL_RULES.cache;
  const dg = (gCache.disguise && typeof gCache.disguise === 'object')
    ? gCache.disguise
    : DEFAULT_GLOBAL_RULES.cache.disguise;
  // 反代伪装 UA 复用「修改请求头」阶段的默认 User-Agent（单一真相源，见文件头说明）
  const gReq = (gStages.reqHeaders && typeof gStages.reqHeaders === 'object')
    ? gStages.reqHeaders
    : DEFAULT_GLOBAL_RULES.reqHeaders;
  const proxyUA = (gReq.set && (gReq.set['User-Agent'] || gReq.set['user-agent']))
    || DEFAULT_GLOBAL_RULES.reqHeaders.set['User-Agent'];

  try {
    if (cfg.mode === 'none') {
      return new Response('Not Found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    if (cfg.mode === 'proxy' && cfg.target) {
      const res = await proxyDisguise(ctx, cfg.target, dg, proxyUA);
      if (res) return res;
      // 反代失败：静默降级到静态页，绝不暴露上游错误
    }

    return staticDisguise(cfg.status, dg);
  } catch {
    // 伪装页自身出错也必须给出一个干净的页面
    return staticDisguise(DEFAULT_DISGUISE.status, dg);
  }
}

/**
 * 静态伪装页。
 * @param {number} [status]
 * @param {{cdnMaxAge:number}} dg 伪装页缓存参数（stages.cache.disguise）
 * @returns {Response}
 */
function staticDisguise(status, dg) {
  const code = Number.isInteger(status) && status >= 200 && status <= 599 ? status : 200;
  const maxAge = dg?.cdnMaxAge ?? 86400;
  // 服务端指纹与页面语义自洽：Server 名取自引擎常量 DISGUISE_SERVER_NAME（'cloudflare'），
  // 与仿 CF 拦截页一致，避免「页面 CF、头 nginx」的致命指纹矛盾。
  const serverName = DISGUISE_SERVER_NAME;
  return new Response(STATIC_HTML, {
    status: code,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // 伪装页内容固定，长 CDN 缓存让同一未授权 URL 的后续请求由 CF 边缘直接返回，
      // 不再消耗 Workers 配额；s-maxage 专用于共享缓存（CDN）
      'cache-control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      // 抹掉可能的服务端指纹，让响应头看起来像一台普通的 nginx
      server: serverName,
    },
  });
}

/**
 * 反代模式伪装页。
 *
 * 只取上游的正文与少量安全头部，丢弃 set-cookie 等可能串味的头，
 * 避免把上游站点的会话状态泄漏给访客。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} target 绝对 URL（schema 已保证 http/https）
 * @param {{cdnMaxAge:number, isolateTtlMs:number}} dg 伪装页缓存参数（stages.cache.disguise）
 * @param {string} proxyUA 反代模式使用的伪装 UA（复用 stages.reqHeaders.set 的 User-Agent）
 * @returns {Promise<Response|null>} 失败返回 null 交由调用方降级
 */
async function proxyDisguise(ctx, target, dg, proxyUA) {
  // isolate 级缓存：同一 target 在 isolate 生命周期内只 fetch 一次
  const isolateTtl = dg?.isolateTtlMs ?? 600000;
  const now = Date.now();
  if (_proxyDisguiseCache && _proxyDisguiseCache.key === target &&
      (now - _proxyDisguiseCache.cachedAt) < isolateTtl) {
    return new Response(_proxyDisguiseCache.body, {
      status: _proxyDisguiseCache.status,
      headers: new Headers(_proxyDisguiseCache.headers),
    });
  }

  try {
    const upstream = await fetch(target, {
      method: 'GET',
      headers: {
        // 使用通用 UA（来自 stages.reqHeaders.set['User-Agent']），不透传访客的任何身份信息
        'user-agent': proxyUA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined,
    });

    if (!upstream || !upstream.ok) return null;

    // 把上游 body 读成字符串：既是 isolate 缓存所必需，也便于后续复用。
    // 限制读取上限，避免整页无界驻留内存（伪装页通常是小 HTML，超阈值直接拒绝）。
    const MAX_BODY = 512 * 1024;
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BODY) return null;
    const body = new TextDecoder().decode(buf);
    const ct = upstream.headers.get('content-type');
    const maxAge = dg?.cdnMaxAge ?? 86400;
    // 服务端指纹与页面语义自洽：Server 名取自引擎常量 DISGUISE_SERVER_NAME（'cloudflare'），
    // 与仿 CF 拦截页一致，避免「页面 CF、头 nginx」的致命指纹矛盾。
    const serverName = DISGUISE_SERVER_NAME;

    const headers = {
      'content-type': ct || 'text/html; charset=utf-8',
      // 长 CDN 缓存：伪装页内容固定，同一未授权 URL 的后续请求由 CF 边缘直接返回
      'cache-control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
      'server': serverName,
    };

    // 写入 isolate 缓存
    _proxyDisguiseCache = { key: target, body, status: upstream.status, headers, cachedAt: now };

    return new Response(body, {
      status: upstream.status,
      headers: new Headers(headers),
    });
  } catch {
    return null;
  }
}
