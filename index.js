/**
 * 通用 CDN 加速 Worker
 *
 * 功能：
 * 1. Host 匹配（由 Cloudflare Route / Custom Domain 负责，代码内可选二次过滤）
 * 2. URL 路径重写：prefix + 原始路径（等价于 concat(prefix, http.request.uri.path)）
 * 3. 请求头覆写：UA / Accept / Accept-Language / Accept-Encoding / Authorization
 * 4. 响应头清理：删除 CORP / CSP / X-Frame-Options，添加自定义标识头
 * 5. 边缘缓存：忽略查询参数构造缓存键，静态文件浏览器 30min + 边缘 180天
 * 6. 错误码不缓存（4xx/5xx）
 */

// ========== 通用 CDN 行为（写死，各部署通用）==========
const REQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36 Edg/148.0.0.0',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
};

const RES_HEADERS_TO_DELETE = [
  'cross-origin-resource-policy',
  'content-security-policy',
  'x-frame-options',
];

const RES_HEADERS_TO_ADD = {
  'Content-Disposition': 'inline',
  'X-Cdn-Client': 'TouchEO',
  'X-Img-From': 'cnb',
};

const STATIC_BROWSER_TTL = 1800;      // 30min
const STATIC_EDGE_TTL    = 15552000;  // 180天

const STATIC_EXTS = new Set([
  '7z','avi','avif','apk','bin','bmp','bz2','class','css','csv','doc','docx','dmg',
  'ejs','eot','eps','exe','flac','gif','gz','ico','iso','jar','jpg','jpeg','js',
  'mid','midi','mkv','mp3','mp4','ogg','otf','pdf','pict','pls','png','ppt','pptx',
  'ps','rar','svg','svgz','swf','tar','tif','tiff','ttf','webm','webp','woff','woff2',
  'xls','xlsx','zip','zst'
]);

const ERROR_CODES = new Set([
  400,401,402,403,404,405,406,407,408,409,410,411,412,413,414,415,416,417,418,
  421,422,423,424,425,426,428,429,431,500,501,502,503,504,505,506,507,508,510,
  511,520,521,522,523,524,525,526,527
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 可选：多域名共用时按正则二次过滤（空则放行所有）
    if (env.HOST_MATCH_REGEX) {
      const re = new RegExp(env.HOST_MATCH_REGEX, 'i');
      if (!re.test(url.hostname)) {
        return fetch(request);
      }
    }

    // 必填：回源域名
    const originHost = env.ORIGIN_HOST;
    if (!originHost) {
      return new Response('Config error: ORIGIN_HOST is required', { status: 500 });
    }

    const originScheme = env.ORIGIN_SCHEME || 'https';
    const pathPrefix   = env.PATH_PREFIX || '';

    // URL 路径重写：concat(prefix, http.request.uri.path)
    const rewrittenPath = pathPrefix
      ? `${pathPrefix}${url.pathname}`
      : url.pathname;
    const originUrl = new URL(rewrittenPath, `${originScheme}://${originHost}`);
    originUrl.search = url.search;  // 查询字符串保留

    // 缓存键：忽略 QueryString（FullURLCache: on 但 QueryString: off）
    const cacheKeyUrl = new URL(originUrl);
    cacheKeyUrl.search = '';
    const cacheKey = new Request(cacheKeyUrl.toString(), request);

    // 查边缘缓存
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      return buildResponse(cached, url);
    }

    // 构造回源请求
    const headers = new Headers(request.headers);
    for (const [k, v] of Object.entries(REQ_HEADERS)) {
      headers.set(k, v);
    }
    if (env.REQ_AUTH) {
      headers.set('Authorization', env.REQ_AUTH);
    }

    const originReq = new Request(originUrl, {
      method: request.method,
      headers,
      body: request.body,
    });

    let response;
    try {
      response = await fetch(originReq);
    } catch (err) {
      return new Response(`Origin error: ${err.message}`, { status: 502 });
    }

    response = buildResponse(response, url);

    // 错误码不写缓存
    if (!ERROR_CODES.has(response.status)) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  }
};

function buildResponse(response, url) {
  const headers = new Headers(response.headers);
  const status = response.status;
  const ext = url.pathname.split('.').pop().toLowerCase();

  // 缓存策略
  if (ERROR_CODES.has(status)) {
    headers.set('Cache-Control', 'no-store');
  } else if (STATIC_EXTS.has(ext)) {
    headers.set('Cache-Control',
      `public, max-age=${STATIC_BROWSER_TTL}, s-maxage=${STATIC_EDGE_TTL}`);
  }

  // 删除响应头
  for (const h of RES_HEADERS_TO_DELETE) {
    headers.delete(h);
  }

  // 添加响应头
  for (const [k, v] of Object.entries(RES_HEADERS_TO_ADD)) {
    headers.set(k, v);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}