/**
 * ============================================================================
 * 管理面 HTML 渲染与静态资源服务
 * ----------------------------------------------------------------------------
 * 设计目标：管理面请求「优先走静态托管、其次走内联兜底」，对两平台都最省额度。
 *
 *   1. 静态优先（最省额度）：build.mjs 同时产出 dist/public/ 目录（HTML 引用外部
 *      /{adminPath}/assets/*）。当部署形态支持静态托管时，这些请求命中边缘缓存后零函数
 *      执行次数：
 *        - CF Workers：通过 wrangler.toml 的 assets 绑定（env.ASSETS）走 CF 静态资产层；
 *        - EO Makers：边缘函数静态目录托管；
 *        - CF Pages：Pages 静态层。
 *   2. 内联兜底（兼容 worker 直接粘贴/无静态层）：同一份 _worker.js 也可把 /{adminPath}/assets/*
 *      作为静态内容透传（资源字节由 build.mjs 写入 ui.gen.js 的 UI_CSS/UI_JS 导出），
 *      保证无静态目录环境（如纯 Dashboard 粘贴 _worker.js，无 ASSETS 绑定）也能完整运行管理面。
 *
 * UI_HTML / UI_CSS / UI_JS 均由 build.mjs 从 web/ 生成（src/ui.gen.js）。
 * 为避免未构建时报错，这里做了动态兜底。
 * ============================================================================
 */

/**
 * 以静态方式响应「已确认为管理面」的请求。
 *
 * ⚠️ 安全边界：本函数**不负责判定「某请求是否属于管理面」**。那道门在 core/app.js
 * 里完成——只有当请求路径第一段**等于**运行时配置的 adminPath 时，app.js 才会把
 * 请求交给本函数。本函数拿到的 req 已经是「通过了第一层 adminPath 校验」的请求，
 * 因此这里**只接受与传入 adminPath 完全一致的路径前缀**，绝不使用「任意前缀」正则，
 * 否则会绕过第一层防护，让攻击者用任意前缀都能拿到管理面 JS。
 *
 *   对外：GET /{adminPath}/assets/app.css|app.js   （adminPath 必须等于配置值）
 *   对内：固定映射到物理资源 /assets/app.{css,js}（构建期固定路径，与 adminPath 解耦）
 *   对外：GET /{adminPath} | /{adminPath}/         → 返回运行时注入的兜底 HTML
 *
 * 设计：adminPath 仅作为「浏览器访问入口前缀」，运行时把 /{adminPath}/assets/*
 * 重写为固定的 /assets/* 物理资源。因此 build 期无需读取 ADMIN_PATH，改 adminPath
 * 不必重新构建。兼容历史默认前缀 /__panel（仅在配置值恰为 __panel 时生效）。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @param {Request} req 已被 app.js 判定为「属于管理面」的请求
 * @param {string} adminPath 运行时的管理面入口前缀（如 "__panel"），必须与配置值一致
 * @returns {Promise<Response|null>}
 */
export async function tryServePanelStatic(ctx, req, adminPath) {
  const path = (adminPath || '__panel').replace(/^\/+|\/+$/g, '') || '__panel';
  const url = new URL(req.url);
  const pathname = url.pathname;

  // 严格前缀匹配：只接受「配置值本身」作为管理面前缀。不使用 /[^/]+/ 这类宽松匹配，
  // 否则任意 /x/assets/* 都会被当作管理面资源返回，等于卸掉了第一层防护。
  const prefix = `/${path}`;
  if (pathname !== prefix && pathname !== prefix + '/' && !pathname.startsWith(prefix + '/')) {
    return null;
  }

  // 管理面静态资源：/{adminPath}/assets/* → 重写为固定物理 /assets/*
  if (pathname.startsWith(prefix + '/assets/')) {
    const file = pathname.slice((prefix + '/assets/').length);
    if (file !== 'app.css' && file !== 'app.js') return null; // 只允许这两个白名单文件
    const isCss = file.endsWith('.css');
    // 优先走 Cloudflare Workers Static Assets 绑定（env.ASSETS）：ASSETS 按 URL 路径取文件，
    // 对外是 /{adminPath}/assets/*，物理是 /assets/*，故重写为固定物理路径去取。
    const assets = ctx?.env?.ASSETS;
    if (assets?.fetch) {
      try {
        const physReq = new Request(url.origin + '/assets/' + file, req);
        const assetResp = await assets.fetch(physReq);
        if (assetResp && assetResp.status < 400) {
          const headers = new Headers(assetResp.headers);
          headers.set('cache-control', 'public, max-age=86400, immutable');
          headers.set('x-content-type-options', 'nosniff');
          return new Response(assetResp.body, { status: assetResp.status, headers });
        }
      } catch {
        /* ASSETS 不可用则回退内联兜底 */
      }
    }
    // 回退：从 ui.gen.js 内联字节透传（无静态目录环境也完整可用）
    try {
      const mod = await import('../ui.gen.js');
      const body = isCss ? mod.UI_CSS : mod.UI_JS;
      if (body) {
        return new Response(body, {
          status: 200,
          headers: {
            'content-type': isCss ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
            'cache-control': 'public, max-age=86400, immutable',
            'x-content-type-options': 'nosniff',
          },
        });
      }
    } catch {
      /* 无静态资源则回退内联 HTML */
    }
    return null;
  }

  // 管理面根路径：返回运行时注入 BASE 的兜底 HTML（BASE 用对外前缀，浏览器据此拼 API）
  if (pathname === prefix || pathname === prefix + '/') {
    return renderAdminPage(ctx, path);
  }

  return null;
}

/**
 * 渲染管理后台页面
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} adminPath 管理面路径段（不含斜杠）
 * @returns {Promise<Response>}
 */
export async function renderAdminPage(ctx, adminPath) {
  let html;
  try {
    // 动态 import：未执行构建时 ui.gen.js 可能不存在，避免整体崩溃
    const mod = await import('../ui.gen.js');
    html = mod.UI_HTML;
  } catch {
    html = FALLBACK_HTML;
  }

  if (!html) html = FALLBACK_HTML;

  // 注入基础路径，前端所有 API 请求以此为前缀
  const injected = html.replace(
    '</head>',
    `<script>window.__BASE__=${JSON.stringify('/' + adminPath)};` +
      `window.__PLATFORM__=${JSON.stringify(ctx.caps.platform)};</script></head>`
  );

  return new Response(injected, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // 管理面绝不允许被缓存或被嵌入 iframe
      'cache-control': 'no-store, no-cache, must-revalidate',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

/** 未构建时的占位页 */
const FALLBACK_HTML = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EdgeCDN 管理面</title>
<style>
body{background:#0f1115;color:#e6e6e6;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{max-width:520px;padding:32px;background:#171a21;border:1px solid #262b36;border-radius:12px}
h1{margin:0 0 12px;font-size:18px}code{background:#0b0d11;padding:2px 6px;border-radius:4px}
</style></head><body><div class="box">
<h1>管理面尚未构建</h1>
<p>请在项目根目录执行 <code>npm install &amp;&amp; npm run build</code> 生成前端资源后重新部署。</p>
</div></body></html>`;
