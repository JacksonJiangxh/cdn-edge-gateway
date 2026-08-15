/**
 * ============================================================================
 * errorPage.js —— 伪装错误页（盗刷防护）
 * ----------------------------------------------------------------------------
 * 设计目标：当网关出现异常（回源失败 / 存储不可用 / 未捕获错误）时，
 * 返回一个「仿 Cloudflare 5xx 错误页」的 HTML，而不是裸 500 文本。
 *
 * 为什么能防盗刷 / 防探测：
 *  - 真实的上游地址、证书、DNS 细节永远不出现（由 errors.js 的 expose=false 保证）。
 *  - 每次返回都带一个随机伪造的 Ray ID 和「大区 - 小区」文案，
 *    让扫描器 / 盗刷脚本 / 自动化工具以为是 Cloudflare 边缘节点在拦截，
 *    难以据此判断真实架构，从而放弃针对性攻击。
 *  - noindex + 随机化，避免被搜索引擎收录、避免形成稳定指纹。
 *
 * 安全约束（相对借鉴源码的改造）：
 *  - 移除原 `fetch('https://cloudflare.com/cdn-cgi/trace')`：
 *    该请求会把真实访客 IP 泄露给第三方，且依赖外部网络，在边缘运行时不可靠。
 *  - 移除对 `https://cloudflare.com/cdn-cgi/styles/main.css` 的外链依赖，
 *    改为内联最小样式，离线可用、无外部可观测信号。
 *  - 所有随机量在服务端生成（Ray ID / 大区），避免客户端 JS 被禁用时失去伪装。
 * ============================================================================
 */

/**
 * 伪造 Ray ID 池（与原借鉴源码同思路：随机化让请求不可关联）。
 * @type {readonly string[]}
 */
const RAY_ID_POOL = Object.freeze([
  '1145141919810CnM',
  '114514gDx1919810',
  '1145141919810Gjb',
  'Qnm1145141919810',
  '19210711949101CN',
  '20200928-GenShin',
  'CnmJBdlGgJBdXQnm',
]);

/**
 * 大区 → 小区映射（伪造的「边缘节点位置」文案）。
 * @type {Record<string, readonly string[]>}
 */
const REGION_MAP = Object.freeze({
  Mondstadt: ['Knights of Favonius', 'Mondstadt City', 'Stormbearer Mountains', 'Windrise'],
  Liyue: ['Liyue Harbor', 'Jueyun Karst', 'The Chasm', 'Guyun Stone Forest'],
  Inazuma: ['Ritou', 'Kamisato Estate', 'Tenshukaku', 'Narukami Island'],
  Sumeru: ['Sumeru City', 'Avidya Forest', 'Desert of Hadramaveth', 'Port Ormos'],
  Fontaine: ['Court of Fontaine', 'Erinnyes Forest', 'Liffey Region', 'Fortress of Meropide'],
  Natlan: ['People of the Springs', 'Stadium of the Sacred Flame', 'Tona Canyon', 'Basalt Mountain'],
});

/** 5xx 状态码 → 页面文案 */
const STATUS_COPY = Object.freeze({
  502: { title: 'Bad gateway', what: 'The web server reported a bad gateway error.' },
  503: { title: 'Service temporarily unavailable', what: 'The service is temporarily unavailable.' },
  500: { title: 'Internal server error', what: 'An unexpected error occurred on the server.' },
});

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 生成随机伪造 Ray ID。
 * @returns {string}
 */
export function generateRayId() {
  return pick(RAY_ID_POOL);
}

/**
 * 生成随机「大区 - 小区」文案（20% 概率仅大区）。
 * @returns {string}
 */
export function generateRegionText() {
  const standaloneChance = 0.2;
  const major = pick(Object.keys(REGION_MAP));
  if (Math.random() < standaloneChance || REGION_MAP[major].length === 0) {
    return major;
  }
  return `${major} - ${pick(REGION_MAP[major])}`;
}

/**
 * 构造伪装错误页 HTML。
 *
 * @param {Object} opts
 * @param {number} [opts.status=500] HTTP 状态码
 * @param {string} [opts.code='INTERNAL'] 错误码（来自 ERROR_CODES，仅用于日志对齐）
 * @param {string} [opts.reqId] 网关内部的请求 ID（不泄露给客户端，仅占位）
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
<html class="no-js" lang="en-US">
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
    </style>
</head>
<body>
    <div id="cf-wrapper">
        <div id="cf-error-details">
            <header>
                <h1>
                    <span>${copy.title}</span>
                    <span class="code-label">Error code ${st}</span>
                </h1>
                <div>Visit <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_${st}" target="_blank" rel="noopener noreferrer">cloudflare.com</a> for more information.</div>
                <div id="cf-timestamp"></div>
            </header>

            <div class="grid">
                <div class="cell">
                    <span class="ok">●</span>
                    <h3>Browser</h3>
                    <span class="ok">Working</span>
                </div>
                <div class="cell">
                    <span class="ok">●</span>
                    <h3>Cloudflare</h3>
                    <span class="ok">Working</span>
                    <div id="cf-region">${region}</div>
                </div>
                <div class="cell">
                    <span class="err">●</span>
                    <h3>Host</h3>
                    <span class="err">Error</span>
                    <div id="cf-host">${host}</div>
                </div>
            </div>

            <div>
                <h2>What happened?</h2>
                <p>${copy.what}</p>
                <h2>What can I do?</h2>
                <p>Please try again in a few minutes.</p>
            </div>

            <div class="meta">
                Cloudflare Ray ID: <strong>${rayId}</strong>
                <span> &bull; </span>
                Performance &amp; security by
                <a rel="noopener noreferrer" href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_${st}" target="_blank">Cloudflare</a>
            </div>
        </div>
    </div>
</body>
</html>`;
}
