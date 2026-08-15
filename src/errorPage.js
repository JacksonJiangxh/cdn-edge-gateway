/**
 * ============================================================================
 * errorPage.js —— 伪装错误页（仿 Cloudflare 5xx 拦截页，防盗刷 / 防探测）
 * ----------------------------------------------------------------------------
 * 设计目标：当网关出现异常（回源失败 / 存储不可用 / 未捕获错误）时，
 * 返回一个「仿 Cloudflare 5xx 拦截页」的 HTML，而不是裸 500 文本。
 *
 * 为什么能防盗刷 / 防探测：
 *  - 真实的上游地址、证书、DNS 细节永远不出现（由 errors.js 的 expose=false 保证）。
 *  - 每次返回都带一个随机但「格式真实」的 Ray ID 与边缘节点大区代码，
 *    让扫描器 / 盗刷脚本以为是真实的 Cloudflare 边缘在拦截，难以判断真实架构。
 *  - noindex + 边缘缓存（见 entry.js 的 Cache-Control），避免被搜索引擎收录、
 *    避免失败路径被反复触及而持续消耗 Workers 请求数。
 *
 * 与 Nginx 静态 502 页（backup/docs/502.html）的关系：
 *  - HTML 结构 / 视觉 / 文案对齐你现已在用的那份 Nginx 静态页，
 *    但「服务化」为运行时生成的字符串（无需读取磁盘文件），
 *    且大区与 Ray ID 改为真实 CF 风格（见下方常量）。
 *
 * 安全约束（相对 Nginx 静态页的改造）：
 *  - 原页的 `fetch('https://cloudflare.com/cdn-cgi/trace')` 改为同源 `/cdn-cgi/trace`：
 *    该端点由 Cloudflare 边缘直接响应，**不经过你的 Worker 脚本**，
 *    因此既能显示访客真实 IP（提升伪装可信度），又不会增加 Workers 请求数。
 *  - 移除外链 `https://cloudflare.com/cdn-cgi/styles/main.css`，改为内联 Tailwind 风格样式，
 *    离线可用、无外部可观测信号。
 * ============================================================================
 */

/**
 * 真实 CF 风格的 Ray ID：16 位十六进制（大写），如真实页面所见。
 * @returns {string}
 */
function generateRayId() {
  let s = '';
  for (let i = 0; i < 16; i++) {
    s += '0123456789ABCDEF'[Math.floor(Math.random() * 16)];
  }
  return s;
}

/**
 * 真实 CF 边缘节点大区代码池。
 * 格式对齐真实 Cloudflare 边缘节点命名（机场三字码 + 可选机房编号），
 * 例如 HKG / SJC / NRT / LHR / FRA / LAX / AMS / SIN / CDG / IAD 等。
 * @type {readonly string[]}
 */
const REGION_POOL = Object.freeze([
  'HKG',
  'SJC',
  'NRT',
  'LHR',
  'FRA',
  'LAX',
  'AMS',
  'SIN',
  'CDG',
  'IAD',
  'SYD',
  'YYZ',
  'GRU',
  'MAD',
  'SEA',
  'MIA',
]);

/** 约 30% 概率追加机房编号，模拟真实 "HKG-04" 形态 */
function generateRegionText() {
  const base = REGION_POOL[Math.floor(Math.random() * REGION_POOL.length)];
  if (Math.random() < 0.3) {
    return `${base}-${String(Math.floor(Math.random() * 20) + 1).padStart(2, '0')}`;
  }
  return base;
}

/** 5xx 状态码 → 页面文案 */
const STATUS_COPY = Object.freeze({
  502: { title: 'Bad gateway', what: 'The web server reported a bad gateway error.' },
  503: { title: 'Service temporarily unavailable', what: 'The service is temporarily unavailable.' },
  500: { title: 'Internal server error', what: 'An unexpected error occurred on the server.' },
});

/**
 * 构造伪装错误页 HTML（结构对齐 Nginx 静态 502 页的真实视觉）。
 *
 * @param {Object} opts
 * @param {number} [opts.status=500] HTTP 状态码
 * @param {string} [opts.code='INTERNAL'] 错误码（仅用于日志对齐）
 * @param {string} [opts.reqId] 网关内部请求 ID（不泄露给客户端）
 * @param {string} [opts.domain] 当前访问域名
 * @returns {string} 完整 HTML 文档
 */
export function buildErrorPage({ status = 500, code = 'INTERNAL', reqId = '', domain = '' } = {}) {
  const st = STATUS_COPY[status] ? status : 500;
  const copy = STATUS_COPY[st];
  const rayId = generateRayId();
  const region = generateRegionText();
  const host = domain || 'cloudflare.com';

  return `<!DOCTYPE html>
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
    <title>${host} | ${st}: ${copy.title}</title>
    <style>
      body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#333;background:#fff}
      #cf-wrapper{max-width:960px;margin:0 auto;padding:0 16px}
      .code-label{display:inline-block;margin-left:.5rem;padding:.1rem .5rem;font-size:.8rem;background:#f3f4f6;color:#6b7280;border-radius:.25rem}
      h1{font-weight:300;font-size:2rem;line-height:1.2;margin:.5rem 0}
      .grid{display:flex;flex-wrap:wrap;margin:2rem 0;border-top:1px solid #eee;padding-top:1.5rem}
      .cell{flex:1 1 33%;min-width:200px;padding:1rem;text-align:center}
      .ok{color:#16a34a}.err{color:#dc2626}
      h2{font-size:1.25rem;font-weight:400;margin:.5rem 0}
      .meta{border-top:1px solid #eee;margin-top:1.5rem;padding-top:1rem;font-size:.8rem;color:#6b7280}
      .btn{border:1px solid #ccc;background:#fff;border-radius:.25rem;padding:.1rem .5rem;cursor:pointer;font-size:.8rem}
    </style>
</head>

<body>
    <div id="cf-wrapper">
        <div id="cf-error-details" class="p-0">
            <header class="mx-auto pt-10 lg:pt-6 lg:px-8 w-240 lg:w-full mb-8">
                <h1 class="inline-block sm:block sm:mb-2 font-light text-60 lg:text-4xl text-black-dark leading-tight mr-2">
                    <span class="inline-block">${copy.title}</span>
                    <span class="code-label">Error code ${st}</span>
                </h1>
                <div>
                    Visit <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_${st}" target="_blank" rel="noopener noreferrer">cloudflare.com</a>
                    for more information.
                </div>
                <div class="mt-3" id="cf-timestamp"></div>
            </header>

            <div class="my-8 bg-gradient-gray">
                <div class="w-240 lg:w-full mx-auto">
                    <div class="clearfix md:px-8">
                        <div id="cf-browser-status" class="relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <span class="block md:hidden h-20 bg-center bg-no-repeat"></span>
                                <span class="w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                            </div>
                            <span class="md:block w-full truncate">You</span>
                            <h3 class="md:inline-block mt-3 md:mt-0 text-2xl text-gray-600 font-light leading-1.3">Browser</h3>
                            <span class="leading-1.3 text-2xl text-green-success">Working</span>
                        </div>

                        <div id="cf-cloudflare-status" class="relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_${st}" target="_blank" rel="noopener noreferrer">
                                    <span class="block md:hidden h-20 bg-center bg-no-repeat"></span>
                                    <span class="w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                                </a>
                            </div>
                            <span class="md:block w-full truncate" id="cf-region-name">${region}</span>
                            <h3 class="md:inline-block mt-3 md:mt-0 text-2xl text-gray-600 font-light leading-1.3">
                                <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_${st}" target="_blank" rel="noopener noreferrer">Cloudflare</a>
                            </h3>
                            <span class="leading-1.3 text-2xl text-green-success">Working</span>
                        </div>

                        <div id="cf-host-status" class="cf-error-source relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <span class="block md:hidden h-20 bg-center bg-no-repeat"></span>
                                <span class="w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                            </div>
                            <span class="md:block w-full truncate" id="cf-host-status-name">${host}</span>
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
                        <p>${copy.what}</p>
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
                        Cloudflare Ray ID: <strong class="font-semibold" id="ray-id">${rayId}</strong>
                    </span>
                    <span class="cf-footer-separator sm:hidden">&bull;</span>
                    <span id="cf-footer-item-ip" class="cf-footer-item hidden sm:block sm:mb-1">
                        Your IP: <button type="button" id="cf-footer-ip-reveal" class="btn">Click to reveal</button>
                        <span class="hidden" id="cf-footer-ip">1.1.1.1</span>
                        <span class="cf-footer-separator sm:hidden">&bull;</span>
                    </span>
                    <span class="cf-footer-item sm:block sm:mb-1">
                        <span>Performance &amp; security by</span>
                        <a rel="noopener noreferrer" href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_${st}" id="brand_link" target="_blank">Cloudflare</a>
                    </span>
                </p>
                <script>
                    (function () {
                        // 渲染时间戳（服务端生成，避免客户端时区差异暴露）
                        try {
                            document.getElementById('cf-timestamp').textContent =
                                new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
                        } catch (e) {}

                        // 显示访客真实 IP：同源 /cdn-cgi/trace 由 Cloudflare 边缘直接响应，
                        // 不经过本 Worker 脚本，因此不增加 Workers 请求数。
                        var b = document.getElementById('cf-footer-item-ip');
                        var c = document.getElementById('cf-footer-ip-reveal');
                        if (b && 'classList' in b) {
                            b.classList.remove('hidden');
                            c.addEventListener('click', function () {
                                c.classList.add('hidden');
                                document.getElementById('cf-footer-ip').classList.remove('hidden');
                                fetch('/cdn-cgi/trace').then(function (r) { return r.text(); }).then(function (t) {
                                    var ip = t.split('\\n').find(function (l) { return l.indexOf('ip=') === 0; });
                                    if (ip) document.getElementById('cf-footer-ip').textContent = ip.slice(3);
                                }).catch(function () {});
                            });
                        }
                    })();
                </script>
            </div><!-- /.error-footer -->
        </div><!-- /#cf-error-details -->
    </div><!-- /#cf-wrapper -->
</body>
</html>`;
}
