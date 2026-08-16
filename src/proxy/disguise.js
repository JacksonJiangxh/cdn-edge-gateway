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
 * 内置静态伪装页。
 *
 * 直接复刻上游项目 502 模板（JacksonJiangxh/JacksonJiangxh.github.io/static-pages/502.html）：
 *  - 引用 cloudflare.com/cdn-cgi/styles/main.css 还原官方 Cloudflare 5xx 拦截页视觉；
 *  - 浏览器端 JS 按当前域名、时间、Ray ID、节点大区实时填充，呈现“真实”细节；
 *  - 不暴露本项目的配置指纹。
 * 页面内容固定，适合 CDN 长期缓存；JS 仅在客户端运行，不增加 Workers 开销。
 *
 * 注意：本页与 src/errorPage.js 的 buildErrorPage（异常兜底页）用途不同，
 * 这里用于 host 未匹配时的静态伪装响应。
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
    <title id="page-title">cloudflare.com | 502: Bad gateway</title>
    <link rel="stylesheet" href="https://cloudflare.com/cdn-cgi/styles/main.css">

    <script>
        /* ==========  配置区：后续只改这里 ========== */
        const rayIdList = [
            '1145141919810CnM',
            '114514gDx1919810',
            '1145141919810Gjb',
            'Qnm1145141919810',
            '19210711949101CN',
            '20200928-GenShin',
            'CnmJBdlGgJBdXQnm'
        ];

        // 大区 → 小区（数组为空时代表只有大区本身）
        const regionMap = {
            Mondstadt: [
                'Knights of Favonius',
                'Mondstadt City',
                'Stormbearer Mountains',
                'Windrise'
            ],
            Liyue: [
                'Liyue Harbor',
                'Jueyun Karst',
                'The Chasm',
                'Guyun Stone Forest'
            ],
            Inazuma: [
                'Ritou',
                'Kamisato Estate',
                'Tenshukaku',
                'Narukami Island'
            ],
            Sumeru: [
                'Sumeru City',
                'Avidya Forest',
                'Desert of Hadramaveth',
                'Port Ormos'
            ],
            Fontaine: [
                'Court of Fontaine',
                'Erinnyes Forest',
                'Liffey Region',
                'Fortress of Meropide'
            ],
            Natlan: [
                'People of the Springs',
                'Stadium of the Sacred Flame',
                'Tona Canyon',
                'Basalt Mountain'
            ]
        };

        /* ==========  逻辑区：无需改动 ========== */
        function pickRandom(arr) {
            return arr[Math.floor(Math.random() * arr.length)];
        }

        function generateRayId() {
            return pickRandom(rayIdList);
        }

        function generateRegionText() {
            const standaloneChance = 0.20;          // 20% 仅大区
            const majorRegions = Object.keys(regionMap);

            const major = pickRandom(majorRegions);
            if (Math.random() < standaloneChance || regionMap[major].length === 0) {
                return major;
            }
            const detail = pickRandom(regionMap[major]);
            return \`\${major} - \${detail}\`;
        }

        function formatUTCTime() {
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            return \`\${now.getUTCFullYear()}-\${pad(now.getUTCMonth() + 1)}-\${pad(now.getUTCDate())} \${pad(now.getUTCHours())}:\${pad(now.getUTCMinutes())}:\${pad(now.getUTCSeconds())} UTC\`;
        }

        async function fetchIP() {
            try {
                const res = await fetch('https://cloudflare.com/cdn-cgi/trace');
                const text = await res.text();
                const ip = text.split('\n').find(l => l.startsWith('ip='))?.split('=')[1];
                if (ip) document.getElementById('cf-footer-ip').textContent = ip;
            } catch {}
        }

        document.addEventListener('DOMContentLoaded', () => {
            const domain = window.location.hostname;
            document.title = \`\${domain} | 502: Bad gateway\`;
            document.getElementById('cf-host-status-name').textContent = domain;
            document.querySelector('.mt-3').textContent = formatUTCTime();

            document.getElementById('ray-id').textContent = generateRayId();
            document.getElementById('cf-region-name').textContent = generateRegionText();

            fetchIP();
        });
    </script>
</head>

<body>
    <div id="cf-wrapper">
        <div id="cf-error-details" class="p-0">
            <header class="mx-auto pt-10 lg:pt-6 lg:px-8 w-240 lg:w-full mb-8">
                <h1 class="inline-block sm:block sm:mb-2 font-light text-60 lg:text-4xl text-black-dark leading-tight mr-2">
                    <span class="inline-block">Bad gateway</span>
                    <span class="code-label">Error code 502</span>
                </h1>
                <div>
                    Visit <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_502" target="_blank" rel="noopener noreferrer">cloudflare.com</a>
                    for more information.
                </div>
                <div class="mt-3">2000-00-00 00:00:00 UTC</div>
            </header>

            <div class="my-8 bg-gradient-gray">
                <div class="w-240 lg:w-full mx-auto">
                    <div class="clearfix md:px-8">
                        <div id="cf-browser-status" class="relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <span class="cf-icon-browser block md:hidden h-20 bg-center bg-no-repeat"></span>
                                <span class="cf-icon-ok w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                            </div>
                            <span class="md:block w-full truncate">You</span>
                            <h3 class="md:inline-block mt-3 md:mt-0 text-2xl text-gray-600 font-light leading-1.3">Browser</h3>
                            <span class="leading-1.3 text-2xl text-green-success">Working</span>
                        </div>

                        <div id="cf-cloudflare-status" class="relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_502" target="_blank" rel="noopener noreferrer">
                                    <span class="cf-icon-cloud block md:hidden h-20 bg-center bg-no-repeat"></span>
                                    <span class="cf-icon-ok w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                                </a>
                            </div>
                            <span class="md:block w-full truncate" id="cf-region-name">Liyue</span>
                            <h3 class="md:inline-block mt-3 md:mt-0 text-2xl text-gray-600 font-light leading-1.3">
                                <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_502" target="_blank" rel="noopener noreferrer">Cloudflare</a>
                            </h3>
                            <span class="leading-1.3 text-2xl text-green-success">Working</span>
                        </div>

                        <div id="cf-host-status" class="cf-error-source relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <span class="cf-icon-server block md:hidden h-20 bg-center bg-no-repeat"></span>
                                <span class="cf-icon-error w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                            </div>
                            <span class="md:block w-full truncate" id="cf-host-status-name">cloudflare.com</span>
                            <h3 class="md:inline-block mt-3 md:mt-0 text-2xl text-gray-600 font-light leading-1.3">Host</h3>
                            <span class="leading-1.3 text-2xl text-red-error">Error</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="w-240 lg:w-full mx-auto mb-8 lg:px-8">
                <div class="clearfix">
                    <div class="w-1/2 md:w-full float-left pr-6 md:pb-10 md:pr-0 leading-relaxed">
                        <h2 class="text-3xl font-normal leading-1.3 mb-4">What happened?</h2>
                        <p>The web server reported a bad gateway error.</p>
                    </div>
                    <div class="w-1/2 md:w-full float-left leading-relaxed">
                        <h2 class="text-3xl font-normal leading-1.3 mb-4">What can I do?</h2>
                        <p class="mb-6">Please try again in a few minutes.</p>
                    </div>
                </div>
            </div>

            <div class="cf-error-footer cf-wrapper w-240 lg:w-full py-10 sm:py-4 sm:px-8 mx-auto text-center sm:text-left border-solid border-0 border-t border-gray-300">
                <p class="text-13">
                    <span class="cf-footer-item sm:block sm:mb-1">
                        Cloudflare Ray ID: <strong class="font-semibold" id="ray-id">1145141919810CnM</strong>
                    </span>
                    <span class="cf-footer-separator sm:hidden">&bull;</span>
                    <span id="cf-footer-item-ip" class="cf-footer-item hidden sm:block sm:mb-1">
                        Your IP: <button type="button" id="cf-footer-ip-reveal" class="cf-footer-ip-reveal-btn">Click to reveal</button>
                                                <span class="hidden" id="cf-footer-ip">1.1.1.1</span>
                        <span class="cf-footer-separator sm:hidden">&bull;</span>
                    </span>
                    <span class="cf-footer-item sm:block sm:mb-1">
                        <span>Performance &amp; security by</span>
                        <a rel="noopener noreferrer" href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_502" id="brand_link" target="_blank">Cloudflare</a>
                    </span>
                </p>
                <script>
                    (function () {
                        var b = document.getElementById("cf-footer-item-ip");
                        var c = document.getElementById("cf-footer-ip-reveal");
                        if (b && "classList" in b) {
                            b.classList.remove("hidden");
                            c.addEventListener("click", function () {
                                c.classList.add("hidden");
                                document.getElementById("cf-footer-ip").classList.remove("hidden");
                            });
                        }
                    })();
                </script>
            </div><!-- /.error-footer -->
        </div><!-- /#cf-error-details -->
    </div><!-- /#cf-wrapper -->
</body>
</html>`;

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
  const maxAge = dg.cdnMaxAge;
  // 服务端指纹与页面语义自洽：Server 名取自规则缺省 error.disguiseServer（'cloudflare'），
  // 与仿 CF 拦截页一致，避免「页面 CF、头 nginx」的致命指纹矛盾。单一真源为 stages 缺省。
  const serverName = DEFAULT_GLOBAL_RULES.error.disguiseServer;
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
  const isolateTtl = dg.isolateTtlMs;
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
    const maxAge = dg.cdnMaxAge;
    // 服务端指纹与页面语义自洽：Server 名取自规则缺省 error.disguiseServer（'cloudflare'），
    // 与仿 CF 拦截页一致，避免「页面 CF、头 nginx」的致命指纹矛盾。单一真源为 stages 缺省。
    const serverName = DEFAULT_GLOBAL_RULES.error.disguiseServer;

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
