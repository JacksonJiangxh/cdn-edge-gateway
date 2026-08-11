#!/usr/bin/env node
/**
 * ============================================================================
 * cdn-edge-gateway 构建脚本
 * ----------------------------------------------------------------------------
 * 四步走：
 *   1. 把 web/ 下的 HTML + CSS + JS 内联成单个 HTML 字符串 → src/ui.gen.js
 *      （作为「无静态托管环境」的兜底，例如 CF Workers 直接粘贴 worker）
 *   2. 把 web/ 资源输出为独立静态目录 dist/public/（HTML 引用外部
 *      固定 /assets/*，与 ADMIN_PATH 解耦），供 EdgeOne Makers / Cloudflare Pages 静态托管，
 *      命中边缘缓存后管理面请求零函数执行次数，最省额度。
 *      管理面静态资源统一固定输出到 dist/public/assets/，build 期【不读取】
 *      ADMIN_PATH，因此运行时的 adminPath（KV 或环境变量）可任意变更而无需重新构建，
 *      运行时 Worker 收到 /{adminPath}/assets/* 会自动映射到固定 /assets/* 物理资源。
 *   3. 用 esbuild 打包 src/entry.js → 根目录 _worker.js
 *   4. 产物自检（文件完整性 + _worker.js 可加载 + 导出面），拦住「构建成功但产物不可用」
 *
 * 用法：node build.mjs [--no-minify] [--watch]
 *   默认压缩构建；--no-minify 关闭压缩（本地开发/调试需要可读产物时用）
 * ============================================================================
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WEB = join(ROOT, 'web');
const SRC = join(ROOT, 'src');
const DIST_PUBLIC = join(ROOT, 'dist', 'public');

const args = process.argv.slice(2);
// 默认开启压缩构建（产物体积小、启动快，且远离 Cloudflare 免费版 1MB 上限）。
// - 显式传 --minify 仍开启压缩（与默认一致，向后兼容）；
// - 传 --no-minify 才关闭压缩（本地开发/调试需要可读产物时使用）。
const MINIFY = args.includes('--no-minify') ? false : true;
const WATCH = args.includes('--watch');
// 自检默认开启；--skip-verify 仅用于特殊调试场景
const SKIP_VERIFY = args.includes('--skip-verify');

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 安全读取文件，不存在时返回 fallback 而非抛错 */
async function readSafe(path, fallback = '') {
  try {
    if (!existsSync(path)) {
      console.warn(`  ⚠ 缺失（已跳过）: ${path.replace(ROOT + '/', '')}`);
      return fallback;
    }
    return await readFile(path, 'utf8');
  } catch (e) {
    console.warn(`  ⚠ 读取失败: ${path} — ${e.message}`);
    return fallback;
  }
}

/** 保守的 CSS 压缩：去注释、压空白。不做激进优化以免破坏样式 */
function minifyCss(css) {
  if (!MINIFY) return css;
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>~+])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

/**
 * 保守的 HTML 压缩：仅压缩标签间空白，保留 pre/textarea 内容。
 * 关键：不得触碰 <script>/<style> 内部文本——那里是 JS/CSS 源码，一旦被当普通
 * 文本压缩（如误改 $$nav、破坏正则/字符串转义），浏览器解析内联脚本会抛
 * SyntaxError，导致整个前端崩溃、所有交互失效。
 */
function minifyHtml(html) {
  if (!MINIFY) return html;
  // 1) 先抽出 script / style 内容原样暂存，避免被后续空白压缩破坏
  const stash = [];
  const protect = (m) => {
    stash.push(m);
    return '@@STASH' + (stash.length - 1) + '@@';
  };
  let work = html
    .replace(/<script[\s\S]*?<\/script>/gi, protect)
    .replace(/<style[\s\S]*?<\/style>/gi, protect);
  // 2) 压缩其余 HTML
  work = work
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // 3) 放回 script / style 原样内容
  return work.replace(/@@STASH(\d+)@@/g, (_, i) => stash[Number(i)]);
}

// ---------------------------------------------------------------------------
// 步骤 1：内联前端资源（兜底，用于无静态托管环境）
// ---------------------------------------------------------------------------

/**
 * 单独压缩前端 JS（api.js + app.js 拼接），返回压缩后的字符串。
 * 关键：必须从原始源码单独 esbuild 压缩，再内联/写入文件，绝不能把原始
 * 源码直接拼进 HTML 再整体压缩——那样 esbuild 会把内联脚本里的标识符误改写
 * （例如 $$nav 被误改成 $nav），导致浏览器解析内联脚本时抛 SyntaxError，
 * 整个前端崩溃、所有交互失效。
 * @returns {Promise<string>}
 */
async function buildFrontendJs() {
  const apiJs = await readSafe(join(WEB, 'api.js'));
  const appJs = await readSafe(join(WEB, 'app.js'));
  let frontendJs = apiJs + '\n' + appJs;
  // 方案 Y（A1 修复，当前暂定状态1）：前端 UI 资源（api.js+app.js）**不压缩**，
  // 避免 esbuild minify 的死代码消除把"间接引用注册"的 UI 函数（流量序列/站点管理
  // 等，经由 ROUTES/TITLES 对象属性动态取值）误杀，导致线上管理面残缺。经实测，
  // 仅挂 window（方案 X）在 bundle:false+minify:true 下仍会被 esbuild 副作用分析
  // 整条删除，不可靠；故采用方案 Y：前端不压缩、Worker 仍走全局 MINIFY 压缩。
  // 代价仅管理面静态 JS 139KB→187KB、兜底 ui.gen.js 文件 446KB，均在 CF 1MB 内。
  const FRONTEND_MINIFY = false;
  if (FRONTEND_MINIFY) {
    try {
      const r = await esbuild.build({
        stdin: { contents: frontendJs, resolveDir: WEB, loader: 'js' },
        bundle: false,
        minify: true,
        write: false,
        format: 'iife',
        target: 'es2022',
        legalComments: 'none',
      });
      frontendJs = r.outputFiles[0].text;
    } catch (e) {
      console.warn('  ⚠ 前端 JS 压缩失败，回退为未压缩源码:', e.message);
    }
  }
  return frontendJs;
}

/**
 * 构建内联兜底 HTML（src/ui.gen.js）。用于 CF Workers 直接粘贴 worker、
 * 或任何没有独立静态托管能力的部署形态。管理面请求仍走函数，但保证可用。
 */
async function buildInlineUI(frontendJs, css) {
  console.log('▸ [1/4] 内联前端资源（兜底）...');

  let html = await readSafe(join(WEB, 'index.html'));

  if (!html) {
    console.warn('  ⚠ web/index.html 不存在，将生成占位管理面');
    html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>EdgeCDN 管理面</title></head>
<body><p>管理面前端尚未完成构建。</p></body></html>`;
  }

  // --- 注入 CSS ---
  const styleTag = `<style>${css}</style>`;
  if (/<link[^>]+style\.css[^>]*>/i.test(html)) {
    html = html.replace(/<link[^>]+style\.css[^>]*>/i, styleTag);
    html = html.replace(/<!--\s*BUILD:STYLE\s*-->/i, '');
  } else if (css) {
    html = html.replace('</head>', `${styleTag}</head>`);
  }

  // --- 注入 JS ---
  const scriptTag = `<script>\n${frontendJs}\n</script>`;
  html = html.replace(/<script[^>]+src=["'](?:\.\/)?(?:api|app)\.js["'][^>]*>\s*<\/script>/gi, '');
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${scriptTag}</body>`);
  } else {
    html += scriptTag;
  }

  html = minifyHtml(html);

  const out = `/**
 * 自动生成文件 —— 请勿手动编辑
 * 由 build.mjs 从 web/ 目录内联生成（无静态托管环境兜底用）
 * 生成时间: ${new Date().toISOString()}
 */
export const UI_HTML = ${JSON.stringify(html)};
// 以下两导出供 _worker.js 在「无独立静态托管」时也能透传管理面静态资源（兜底）
export const UI_CSS = ${JSON.stringify(css ?? '')};
export const UI_JS = ${JSON.stringify(frontendJs ?? '')};
`;

  await mkdir(SRC, { recursive: true });
  await writeFile(join(SRC, 'ui.gen.js'), out, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`  ✓ src/ui.gen.js 已生成 (${kb} KB)`);
  if (Number(kb) > 500) {
    console.warn(`  ⚠ 前端体积偏大 (${kb} KB)，可能影响 Worker 启动时间`);
  }
}

// ---------------------------------------------------------------------------
// 步骤 2：输出静态资源目录 dist/public（优先托管，最省函数额度）
// ---------------------------------------------------------------------------

/**
 * 构建独立静态资源目录 dist/public/：
 *   dist/public/index.html                站点根页（不含后台路径，零泄露）
 *   dist/public/assets/app.css            压缩样式（固定路径，与 adminPath 解耦）
 *   dist/public/assets/app.js             压缩脚本（api.js + app.js 拼接）
 *
 * 关键设计：管理面静态资源使用【固定物理路径】 dist/public/assets/，
 * 与运行时的 ADMIN_PATH（对外隐藏入口前缀）完全解耦。
 *   - build 期【不再读取】 ADMIN_PATH，因此改 adminPath 无需重新构建；
 *   - 运行期 Worker 收到 /{ADMIN_PATH}/assets/* 请求时，内部映射到固定
 *     /assets/* 物理资源（见 src/api/adminPage.js），对外路径与实现路径分离。
 *
 * 该目录供 EdgeOne Makers / Cloudflare Pages 静态托管使用。命中边缘缓存后，
 * 管理面访问零函数执行次数，是 CF / EO 两平台通用的省额度手段。
 *
 * HTML 中的注入变量（__BASE__ / __PLATFORM__）无法在纯静态页预置，故改为
 * 由运行时的管理面薄层（adminPage.renderAdminPage）在请求时注入；站点根
 * index.html 不加载任何业务代码、也不含后台路径，避免信息泄露。
 */
async function buildPublic(frontendJs, css) {
  console.log('▸ [2/4] 输出静态资源目录 dist/public/...');

  let html = await readSafe(join(WEB, 'index.html'));

  if (!html) {
    console.warn('  ⚠ web/index.html 不存在，跳过静态构建');
    return;
  }

  // 注意：build 阶段【不调用任何删除操作】。原因：
  //   部分受控执行环境带有 safe-delete 守卫，对「删除类操作」按次累计，达到阈值即拦截，
  //   导致 `npm run build` 中断。整目录删除或单文件精确删除都会累计该计数，无法规避。
  // 因此改为「覆盖式写入」：先确保输出目录存在，再对同名文件直接 writeFile 覆盖。
  // 旧产物（如历史 adminPath 子目录 dist/public/<old>/）不会被运行时服务（新架构只用固定 /assets），
  // 残留不影响功能；若需彻底清理，由调用方在 CI/本地手动 `rm -rf dist/public` 一次即可。

  // 管理面资源使用【固定】物理路径 /assets，与 ADMIN_PATH 解耦（build 不读 ADMIN_PATH）。
  const assetBase = '/assets';

  // 移除原始 <link style.css> 与 <script src=...>，改为引用固定 /assets/*
  html = html.replace(/<link[^>]+style\.css[^>]*>/i, `<link rel="stylesheet" href="${assetBase}/app.css">`);
  html = html.replace(/<!--\s*BUILD:STYLE\s*-->/i, '');
  html = html.replace(/<script[^>]+src=["'](?:\.\/)?api\.js["'][^>]*>\s*<\/script>/gi, '');
  html = html.replace(/<script[^>]+src=["'](?:\.\/)?app\.js["'][^>]*>\s*<\/script>/gi, '');
  // 站点根页不注入任何后台路径；管理面 BASE 由运行时 renderAdminPage 注入（no-store）。
  // 前端 api.js 在运行时从 location.pathname 第一段推导 BASE，无需此处预置。
  html = minifyHtml(html);

  // 写出站点根 index.html（无后台路径，零泄露）
  await mkdir(DIST_PUBLIC, { recursive: true });
  await writeFile(join(DIST_PUBLIC, 'index.html'), html, 'utf8');

  // 写出 app.css / app.js（固定 /assets 物理路径，与运行时路由解耦）
  const assetDir = join(DIST_PUBLIC, 'assets');
  await mkdir(assetDir, { recursive: true });
  await writeFile(join(assetDir, 'app.css'), css, 'utf8');
  await writeFile(join(assetDir, 'app.js'), frontendJs, 'utf8');

  console.log('  ✓ dist/public/index.html + assets/app.{css,js} 已生成（资源路径固定，与 ADMIN_PATH 解耦）');
}

// ---------------------------------------------------------------------------
// 步骤 3：打包 Worker
// ---------------------------------------------------------------------------

/**
 * 必须外部化的模块清单。
 *
 * 为什么要显式列出而不是只写 cloudflare:sockets：
 *   本项目产物同时跑在三种运行时上 —— CF Workers（Edge）、EO Edge Function、
 *   EO Cloud Function（Node）。这些模块由「运行时」提供，绝不能被打进 bundle：
 *     - cloudflare:sockets 是 CF 的虚拟模块，esbuild 根本解析不到；
 *     - node:* 系列在 Node 运行时由平台提供，一旦被 esbuild 尝试打包，
 *       要么解析失败直接构建报错，要么塞进一堆 shim 撑爆体积、
 *       并在 Edge 运行时因缺失全局对象而崩溃。
 *
 * 当前 src/ 未直接依赖 node:*，此处属于「防御性声明」：日后若引入任何间接
 * 依赖用到这些模块，构建不会静默把它们打进包，从而避免部署到边缘才炸。
 */
const EXTERNAL_MODULES = [
  // Cloudflare 运行时虚拟模块
  'cloudflare:sockets',
  'cloudflare:workers',
  // Node 内建模块（EO Cloud Function / 本地 Node 由运行时提供）
  'node:assert',
  'node:buffer',
  'node:crypto',
  'node:events',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:https',
  'node:net',
  'node:os',
  'node:path',
  'node:process',
  'node:querystring',
  'node:stream',
  'node:stream/promises',
  'node:stream/web',
  'node:string_decoder',
  'node:timers',
  'node:tls',
  'node:url',
  'node:util',
  'node:zlib',
];

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: [join(SRC, 'entry.js')],
  outfile: join(ROOT, '_worker.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  // neutral 平台：不注入任何 Node/Browser 专有 polyfill，符合边缘运行时
  platform: 'neutral',
  external: EXTERNAL_MODULES,
  minify: MINIFY,
  sourcemap: false,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'info',
  banner: {
    js: `// cdn-edge-gateway — built at ${new Date().toISOString()}\n// 构建产物，请勿手动编辑。修改源码请编辑 src/ 目录后重新运行 npm run build`,
  },
};

async function buildWorker() {
  console.log('▸ [3/4] 打包 Worker...');
  const result = await esbuild.build(buildOptions);

  if (result.errors?.length) {
    throw new Error(`打包失败，共 ${result.errors.length} 个错误`);
  }

  const stat = await readFile(join(ROOT, '_worker.js'), 'utf8');
  const kb = (Buffer.byteLength(stat, 'utf8') / 1024).toFixed(1);
  console.log(`  ✓ _worker.js 已生成 (${kb} KB)`);

  // Workers 免费版脚本上限 1MB（压缩后），给出预警
  if (Number(kb) > 900) {
    console.warn(`  ⚠ 产物体积 ${kb} KB，接近 Workers 1MB 限制。当前已是压缩构建，请精简代码或拆分`);
  }
}

// ---------------------------------------------------------------------------
// 步骤 4：产物自检
// ---------------------------------------------------------------------------

/**
 * 构建后自检，把「构建成功但产物不可用」的问题拦在 CI，而不是拦在生产。
 *
 * 校验三件事：
 *   1. 三个产物文件都存在且非空；
 *   2. _worker.js 能被 Node 真正 import（语法合法、无顶层崩溃、
 *      external 名单没漏 —— 漏了会在这一步抛 ERR_MODULE_NOT_FOUND）；
 *   3. 导出面正确：onRequest 或 default.fetch 至少有一个可用，
 *      否则薄壳 edge-functions/[[default]].js 转发时会 500。
 *
 * 任一不满足即以非零退出码结束，CI 随之失败。
 */
async function verify() {
  console.log('▸ [4/4] 产物自检...');

  // 静态资源实际输出在固定的 dist/public/assets/ 下（与 ADMIN_PATH 解耦，见 buildPublic）。
  const required = [
    join(ROOT, '_worker.js'),
    join(DIST_PUBLIC, 'index.html'),
    join(DIST_PUBLIC, 'assets', 'app.css'),
    join(DIST_PUBLIC, 'assets', 'app.js'),
  ];

  for (const f of required) {
    const rel = f.replace(ROOT + '/', '');
    if (!existsSync(f)) throw new Error(`产物缺失: ${rel}`);
    const content = await readFile(f, 'utf8');
    if (!content.trim()) throw new Error(`产物为空: ${rel}`);
  }
  console.log(`  ✓ 产物文件完整（${required.length} 个）`);

  // 真正加载一次，确保产物可被运行时解析
  let mod;
  try {
    // 加时间戳避免 watch/重复构建时命中 ESM 模块缓存拿到旧产物
    mod = await import(`${pathToFileURL(join(ROOT, '_worker.js')).href}?t=${Date.now()}`);
  } catch (e) {
    throw new Error(`_worker.js 无法被加载: ${e.message}`);
  }

  const hasOnRequest = typeof mod.onRequest === 'function'
    || typeof mod.default?.onRequest === 'function';
  const hasFetch = typeof mod.default?.fetch === 'function';

  if (!hasOnRequest && !hasFetch) {
    throw new Error('_worker.js 未导出 onRequest 或 default.fetch，薄壳将无法转发');
  }

  const exports = [
    hasOnRequest ? 'onRequest' : null,
    hasFetch ? 'default.fetch' : null,
  ].filter(Boolean).join(', ');
  console.log(`  ✓ 入口导出可用: ${exports}`);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  console.log('cdn-edge-gateway 构建开始' + (MINIFY ? '（压缩模式）' : ''));

  // 步骤 1+2：前端 JS 共用一份压缩结果，分别产出内联兜底与静态目录
  const css = await readSafe(join(WEB, 'style.css'));
  // CSS 只压缩一次（C16 修复：原先 buildInlineUI / buildPublic 各调一次 minifyCss，
  // 幂等但冗余），统一在此处压缩后传入，函数内直接复用。
  const minCss = minifyCss(css);
  const frontendJs = await buildFrontendJs();
  await buildInlineUI(frontendJs, minCss);
  await buildPublic(frontendJs, minCss);

  // 步骤 3：打包 worker
  await buildWorker();

  // 步骤 4：自检（--skip-verify 可跳过，仅用于特殊调试）
  if (!SKIP_VERIFY) {
    await verify();
  }

  console.log(`\n构建完成，耗时 ${Date.now() - t0}ms`);
  console.log('部署产物：');
  console.log('  _worker.js          → 边缘函数入口（CF Workers / EO edge-functions 共用）');
  console.log('  edge-functions/     → EO Makers 边缘函数目录，[[default]].js 薄壳转发');
  console.log('  dist/public/        → 管理面静态资源（CF Pages / EO Makers 静态托管，最省额度）');
  console.log('部署命令：');
  console.log('  Cloudflare Workers → npx wrangler deploy');
  // 必须部署仓库根：Pages 要靠根目录的 _worker.js 承载数据面与 /__panel/api/*，
  // 只传 dist/public 会得到「静态页能开、API 全 404」的站点。
  console.log('  Cloudflare Pages   → npx wrangler pages deploy .');
  console.log('  EdgeOne Makers     → npx edgeone makers deploy . -n <project> -t <token>');
}

if (WATCH) {
  console.log('监听模式启动...');
  const css = await readSafe(join(WEB, 'style.css'));
  const frontendJs = await buildFrontendJs();
  await buildInlineUI(frontendJs, css);
  await buildPublic(frontendJs, css);
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('正在监听 src/ 变更（web/ 变更需手动重新运行）');
} else {
  main().catch((err) => {
    console.error('\n构建失败:', err.message);
    process.exit(1);
  });
}
