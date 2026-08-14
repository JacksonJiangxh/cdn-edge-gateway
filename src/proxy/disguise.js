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
 * ============================================================================
 */

import { DEFAULT_DISGUISE, DEFAULT_GLOBAL_RULES } from '../config/defaults.js';

/**
 * 伪装页 Server 头指纹（默认 'nginx'）。
 * 此值本质是「流量序列内部量」——伪装页要表现得像一台普通 nginx，故不作为可配项。
 * 若需变更伪装指纹，改此引擎常量即可，无需在管理面板暴露。
 */
const DISGUISE_SERVER_NAME = 'nginx';

/**
 * 内置静态伪装页。
 *
 * 刻意模仿 nginx 默认欢迎页：这是互联网上最常见、最不值得深究的页面之一，
 * 扫描器看到它通常会直接判定为「未配置的空站点」而跳过。
 */
const STATIC_HTML = `<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
    body {
        width: 35em;
        margin: 0 auto;
        font-family: Tahoma, Verdana, Arial, sans-serif;
    }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
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
  // 伪装成普通 nginx 的服务端指纹：Server 名取自引擎常量 DISGUISE_SERVER_NAME（'nginx'），
  // 属引擎内部量，不作为可配项。
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
    // 伪装成普通 nginx 的服务端指纹：Server 名取自引擎常量 DISGUISE_SERVER_NAME（'nginx'），
    // 属引擎内部量，不作为可配项。
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
