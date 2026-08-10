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
 * 尝试以静态方式响应管理面请求。
 *   - GET /{adminPath}/assets/app.css → 透传构建期产出的 CSS（长期缓存）
 *   - GET /{adminPath}/assets/app.js  → 透传构建期产出的 JS（长期缓存）
 *   - GET /{adminPath} | /{adminPath}/ → 返回 SSG + 运行时注入的兜底 HTML
 * 返回 null 表示不是管理面请求，交由调用方继续路由。
 *
 * adminPath 必须与构建期 ADMIN_PATH、运行时 KV/ADMIN_PATH 完全一致，否则静态
 * 物理路径与运行时路由错位会导致资源 404。为兼容旧产物，仍兜底匹配 /__panel。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @param {Request} req
 * @param {string} [adminPath] 运行时的管理面路径段（如 "__panel"），缺省回退 __panel
 * @returns {Promise<Response|null>}
 */
export async function tryServePanelStatic(ctx, req, adminPath) {
  const path = (adminPath || '__panel').replace(/^\/+|\/+$/g, '') || '__panel';
  const url = new URL(req.url);
  const pathname = url.pathname;

  // 静态资源：长期缓存（内容由构建产出，重部署即更新）
  // 匹配 /{adminPath}/assets/*，并兼容历史 /__panel/assets/*
  const assetRe = /^\/(?:__panel|[^/]+)\/assets\/(app\.(?:css|js))$/;
  const m = pathname.match(assetRe);
  if (m) {
    const seg = pathname.split('/')[1];
    // 仅当路径段与运行时 adminPath 一致、或为历史默认 __panel 时才命中
    if (seg === path || seg === '__panel') {
      // 优先走 Cloudflare Workers Static Assets 绑定（env.ASSETS）：命中 CF 静态层，
      // 边缘缓存、零函数计费，与 CF Pages / EO Makers 静态托管等价。
      // 仅 CF Workers 形态部署（wrangler.toml 含 assets 绑定）时 ctx.env.ASSETS 存在；
      // 纯 Dashboard 粘贴 _worker.js 时不存在，自动回退到下方 ui.gen.js 内联兜底。
      const assets = ctx?.env?.ASSETS;
      if (assets?.fetch) {
        try {
          const assetResp = await assets.fetch(req);
          if (assetResp && assetResp.status < 400) {
            // 叠加长期缓存头（ASSETS 层已带边缘缓存，此处确保浏览器端强缓存）
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
        const isCss = pathname.endsWith('.css');
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
    }
  }

  // 管理面根路径：返回 SSG + 运行时注入的兜底 HTML
  if (pathname === `/${path}` || pathname === `/${path}/` || pathname === '/__panel' || pathname === '/__panel/') {
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
