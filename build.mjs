#!/usr/bin/env node
/**
 * ============================================================================
 * cdn-edge-gateway 构建脚本
 * ----------------------------------------------------------------------------
 * 设计原则：用 esbuild 原生能力（bundle / text / JSON 字面量）替代「字符串
 * 拼接 + 正则注入 + base64 内联」的脆弱范式，从根上消除构建期误转义、括号
 * 丢失、<> 标签丢失等语法错误。
 *
 * 步骤：
 *   0. 由后端唯一真相源 src/config/stages.js 生成 web/_stage.gen.js（ESM），
 *      供 web/app.js import —— 消除「前端硬编码副本 + 文本切片断言同步」。
 *   1. 用 esbuild bundle web/_app.entry.js（api.js + app.js）生成前端 JS，
 *      同时产出「内联兜底字符串」与「静态目录」两份（均走正常压缩）。
 *   2. 把 web/index.html 注入 CSS / JS 后，整体以 JSON 字符串字面量写入
 *      src/ui.gen.js（UI_HTML / UI_CSS），由 esbuild 打包 worker 时安全转义。
 *   3. 把 web/index.html 输出为独立静态目录 dist/public/（引用固定 /assets/*），
 *      供 EdgeOne Makers / Cloudflare Pages 静态托管，命中边缘缓存最省额度。
 *   4. 用 esbuild 打包 src/entry.js → 根目录 _worker.js。
 *   5. 产物自检（文件完整性 + _worker.js 可加载 + 导出面）+ 专项语法校验
 *      （内联脚本可 parse、HTML 标签闭合、括号配对）+ 端到端测试
 *      （用产物跑通登录/鉴权/后台 + Node 沙箱执行前端 JS 验证 window.API），
 *      拦住「构建成功但产物不可用」及「登录后进不去后台」这类运行时问题。
 *
 * 用法：node build.mjs [--no-minify] [--skip-verify] [--watch]
 * ============================================================================
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { generateEntries } from './scripts/gen-entries.mjs';
import { runChecks } from './scripts/check.mjs';
import { runE2E } from './scripts/e2e-test.mjs';
import { runFrontendDomTest } from './scripts/test-frontend-dom.mjs';
import { runFrontendBrowserTest } from './scripts/e2e-browser.mjs';
import { runBackendUnitTests } from './scripts/test-unit/index.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WEB = join(ROOT, 'web');
const SRC = join(ROOT, 'src');
const DIST_PUBLIC = join(ROOT, 'dist', 'public');

const args = process.argv.slice(2);
// 默认开启压缩构建（产物体积小、启动快，远离 Cloudflare 免费版 1MB 上限）。
const MINIFY = args.includes('--no-minify') ? false : true;
const WATCH = args.includes('--watch');
// 自检默认开启；--skip-verify 仅用于本地特殊调试场景。
// 关键护栏：CI 环境（process.env.CI 为真）下忽略 --skip-verify，强制跑全部测试，
// 杜绝「绕过测试带病部署」。本地调试可用 --skip-verify 加速，但部署链路不应使用。
const SKIP_VERIFY = args.includes('--skip-verify') && !process.env.CI;
// 烘焙配置（方案 A：静态部署 / 不依赖 KV）。--bake <file> 接收一份「系统设置 → 导出配置」
// 下载的 JSON 镜像（结构见 buildConfigMirror 的 payload），将其转写为
// src/config/baked.generated.js 供 ESA 在 STATIC_CONFIG=1 模式下直接读取，完全不依赖任何 KV。
const BAKE_ARG_INDEX = args.indexOf('--bake');
const BAKE_FILE = BAKE_ARG_INDEX >= 0 ? args[BAKE_ARG_INDEX + 1] : null;

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
 * SyntaxError，导致整个前端崩溃、所有交互失效。这是合理的结构性防护，保留。
 */
function minifyHtml(html) {
  if (!MINIFY) return html;
  const stash = [];
  const protect = (m) => {
    stash.push(m);
    return '@@STASH' + (stash.length - 1) + '@@';
  };
  let work = html
    .replace(/<script[\s\S]*?<\/script>/gi, protect)
    .replace(/<style[\s\S]*?<\/style>/gi, protect);
  work = work
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return work.replace(/@@STASH(\d+)@@/g, (_, i) => stash[Number(i)]);
}

/**
 * 把字符串里的 </script 转义为 <\/script，避免内联进 HTML 的 <script> 时
 * 提前闭合标签（标准内联防穿透做法，独立于 esbuild 转义）。
 */
function escapeScriptBoundary(s) {
  return s.replace(/<\/script/gi, '<\\/script');
}

// ---------------------------------------------------------------------------
// 步骤 0：由后端真相源生成 web/_stage.gen.js（前端阶段字典单一来源）
// ---------------------------------------------------------------------------

/**
 * 用 esbuild 从 src/config/stages.js 抽取前端所需子集（STAGE_ORDER / STAGE_OPS /
 * STAGE_ALIASES / normalizeStage），打包成 web/_stage.gen.js（ESM）。
 * 之后 web/app.js 直接 import 该文件，不再维护硬编码副本，从根上消除
 * 「改一处漏一处」的 action→stage 越界风险。
 */
async function buildStageGen() {
  console.log('▸ [0/5] 生成前端阶段字典 web/_stage.gen.js（单一来源）...');
  const entry = join(WEB, '_stage.entry.js');
  // 入口由 scripts/gen-entries.mjs 在 build 早期自动生成；此处兜底再确认一次，
  // 防止生成步骤被跳过导致后续 esbuild 读不到输入而报错（报错信息更可读）。
  if (!existsSync(entry)) throw new Error('缺少 web/_stage.entry.js（请确认已执行 gen-entries）');
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(WEB, '_stage.gen.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    // 前端 bundle 阶段已压缩，此处保持可读便于排查
    minify: false,
    write: true,
    legalComments: 'none',
  });
  console.log('  ✓ web/_stage.gen.js 已生成（来自 src/config/stages.js）');
}

// ---------------------------------------------------------------------------
// 步骤 1：前端 JS（esbuild bundle，正常压缩）
// ---------------------------------------------------------------------------

/**
 * 用 esbuild 正常 bundle 前端（api.js + app.js，经 web/_app.entry.js 聚合）。
 * 返回压缩后的 JS 字符串，供「内联兜底」与「静态目录」两份复用。
 *
 * 为何可安全 minify（消除旧版「前端不压缩」妥协）：
 *   - api.js 顶层挂 window.API 是有副作用的全局赋值，esbuild 不会消除；
 *   - app.js 顶层 IIFE 立即执行（渲染管理面），也是副作用入口，不会被死代码消除；
 *   - 内部一律经 window.API 属性访问调用，属性名不参与 mangle，引用链完整。
 * 因此无需「方案 Y（前端不压缩）」的脆弱妥协。
 * @returns {Promise<string>}
 */
async function buildFrontendJs() {
  console.log('▸ [1/5] 打包前端 JS（esbuild bundle + 压缩）...');
  const entry = join(WEB, '_app.entry.js');
  if (!existsSync(entry)) throw new Error('缺少 web/_app.entry.js（请确认已执行 gen-entries）');
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify: MINIFY,
    write: false,
    format: 'iife',
    target: 'es2022',
    platform: 'browser',
    // 前端无 Node 依赖，无需 external；如有则在此声明
    legalComments: 'none',
    sourcemap: false,
    // 关闭 tree-shaking：原版 app.js 为顶层 IIFE 立即执行，闭包内全部代码均保留；
    // 拆为 ESM 子模块后，规则编辑器等经 _OP_BUILDERS 注册表「动态调用」，静态分析
    // 无法判定其可达，会被摇掉导致运行时功能缺失。关闭后行为与原 IIFE 版完全一致。
    treeShaking: false,
  });
  const text = result.outputFiles?.[0]?.text;
  if (!text) throw new Error('前端 bundle 未产出内容');
  console.log(`  ✓ 前端 JS 已打包 (${Math.ceil(Buffer.byteLength(text) / 1024)} KB)`);
  return text;
}

// ---------------------------------------------------------------------------
// 步骤 2：内联兜底 HTML（src/ui.gen.js）—— 用 JSON 字符串字面量，由 esbuild 安全转义
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 注入标记：web/index.html 中「单一注入真相源」的显式锚点。
// build 用「标记替换」取代「正则猜标签结构」，HTML 结构变更不再导致注入失配。
// 这两个标记在 index.html 中必须唯一且位置稳定（STYLE 在 <head>、SCRIPT 在 </body> 前）。
// ---------------------------------------------------------------------------
const MARK = {
  STYLE: '<!-- BUILD:STYLE -->',
  SCRIPT: '<!-- BUILD:SCRIPT -->',
};

/**
 * 校验 index.html 中注入标记存在且唯一。
 * 任一缺失或重复都会显式失败——把「结构猜错/标记删掉 → 产物缺资源」的隐性
 * 回归变成构建期可读错误。
 * @param {string} html
 * @param {string} label 用于报错提示
 */
function assertMarkers(html, label) {
  const countStyle = html.split(MARK.STYLE).length - 1;
  const countScript = html.split(MARK.SCRIPT).length - 1;
  if (countStyle !== 1) {
    throw new Error(`${label}: index.html 中 BUILD:STYLE 标记出现 ${countStyle} 次（须恰好 1 次）`);
  }
  if (countScript !== 1) {
    throw new Error(`${label}: index.html 中 BUILD:SCRIPT 标记出现 ${countScript} 次（须恰好 1 次）`);
  }
}

/**
 * 内联注入：把 STYLE 标记替换为内联 <style>；把「SCRIPT 标记 + 其后原始
 * <script src=api|app.js>…</script> 块」整体替换为内联 <script>。
 * 替换完成后断言内联产物存在，否则抛错。
 * @param {string} html
 * @param {string} css
 * @param {string} safeJs 已做 </script> 边界转义的 JS
 */
function injectInline(html, css, safeJs) {
  assertMarkers(html, '内联注入');
  let out = html;
  // 移除 index.html 中用于本地开发的原始 <link rel="stylesheet" href="style.css">，
  // 它只是开发真相源引用，构建后不应残留（内联版已由 <style> 替代）。
  out = out.replace(/<link[^>]*style\.css[^>]*>/i, '');
  out = out.replace(MARK.STYLE, () => `<style>${css}</style>`);
  // 吃掉「SCRIPT 标记 + 其后一个或多个原始 <script src=…></script> 块」直到 </body>，
  // 整体替换为内联 <script>。标记保留作为定位锚点；(?:…)+ 兼容 api.js+app.js 多块结构。
  out = out.replace(
    new RegExp(
      `${escapeRegExp(MARK.SCRIPT)}\\s*(?:<script[^>]*>\\s*<\\/script>\\s*)+<\\/body>`,
      'i'
    ),
    () => `${MARK.SCRIPT}<script>${safeJs}</script></body>`
  );
  if (!/<style>[\s\S]*<\/style>/.test(out) || !/<script>[\s\S]*<\/script>/.test(out)) {
    throw new Error('内联注入后缺少 style/script 产物');
  }
  return out;
}

/**
 * 静态注入：把 STYLE 标记替换为外部 <link rel="stylesheet" href="/assets/app.css">；
 * 把「SCRIPT 标记 + 其后原始脚本块」整体替换为外部 <script src="/assets/app.js">。
 * 替换完成后断言外部资源引用存在。
 * @param {string} html
 * @param {string} assetBase 固定物理资源路径前缀（默认 /assets）
 */
function injectExternal(html, assetBase) {
  assertMarkers(html, '静态注入');
  let out = html;
  // 移除 index.html 中用于本地开发的原始 <link rel="stylesheet" href="style.css">，
  // 它只是开发真相源引用，静态版已由外部 <link href="/assets/app.css"> 替代。
  out = out.replace(/<link[^>]*style\.css[^>]*>/i, '');
  out = out.replace(MARK.STYLE, () => `<link rel="stylesheet" href="${assetBase}/app.css">`);
  out = out.replace(
    new RegExp(
      `${escapeRegExp(MARK.SCRIPT)}\\s*(?:<script[^>]*>\\s*<\\/script>\\s*)+<\\/body>`,
      'i'
    ),
    () => `${MARK.SCRIPT}<script src="${assetBase}/app.js"></script></body>`
  );
  if (!/rel="stylesheet"[^>]*app\.css/.test(out) || !/<script[^>]*app\.js/.test(out)) {
    throw new Error('静态注入后缺少外部 css/js 引用');
  }
  return out;
}

/** 正则元字符转义，用于把字面标记安全嵌入 RegExp 构造 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 构建内联兜底 HTML（src/ui.gen.js）。用于 CF Workers 直接粘贴 worker、
 * 或任何没有独立静态托管能力的部署形态。管理面请求仍走函数，但保证可用。
 *
 * 关键改动（消除脆弱 hack）：
 *   - 注入改用 BUILD:STYLE / BUILD:SCRIPT 显式标记替换（见 injectInline），
 *     不再用正则去猜 <link style.css> / <script src=api|app.js> / </body> 的位置。
 *   - 移除 base64 双份冗余：不再导出 UI_HTML_B64 / UI_CSS_B64（旧产物无需兼容），
 *     仅导出直接字符串 UI_HTML / UI_CSS，体积更小、消费方更简单。
 *   - UI_HTML 只是 src/ui.gen.js 里的普通 JS 字符串字面量（经 JSON.stringify 生成，
 *     对 " \ 控制字符自动转义，反引号/<> 在双引号串内天然安全），由 esbuild 打包
 *     进 worker 时再次安全转义，绝无边界破裂风险。
 *
 * @param {string} frontendJs 已压缩前端 JS
 * @param {string} css 已压缩 CSS
 */
async function buildInlineUI(frontendJs, css) {
  console.log('▸ [2/5] 内联前端资源（兜底）→ src/ui.gen.js...');

  let html = await readSafe(join(WEB, 'index.html'));

  if (!html) {
    console.warn('  ⚠ web/index.html 不存在，将生成占位管理面');
    html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>EdgeCDN 管理面</title></head>
<body><p>管理面前端尚未完成构建。</p></body></html>`;
  }

  // frontendJs 经 escapeScriptBoundary 处理，杜绝 </script> 提前闭合。
  const safeJs = escapeScriptBoundary(frontendJs);
  html = injectInline(html, css, safeJs);

  html = minifyHtml(html);

  // 用 JSON.stringify 生成安全的 JS 字符串字面量（JSON 是 JS 子集，自动转义特殊字符）。
  const out = `/**
 * 自动生成文件 —— 请勿手动编辑
 * 由 build.mjs 从 web/ 内联生成（无静态托管环境兜底用）
 * 生成时间: ${new Date().toISOString()}
 */
// UI_HTML / UI_CSS 为普通 JS 字符串字面量（JSON 安全转义），由 esbuild 打包进
// worker 时再次安全转义，无需 base64 中转，消除超长字符串边界破裂风险。
export const UI_HTML = ${JSON.stringify(html)};
export const UI_CSS = ${JSON.stringify(css ?? '')};
`;

  await mkdir(SRC, { recursive: true });
  await writeFile(join(SRC, 'ui.gen.js'), out, 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`  ✓ src/ui.gen.js 已生成 (${kb} KB)`);
  if (Number(kb) > 500) {
    console.warn(`  ⚠ 前端体积偏大 (${kb} KB)，可能影响 Worker 启动时间`);
  }
  return html;
}

// ---------------------------------------------------------------------------
// 步骤 3：输出静态资源目录 dist/public（优先托管，最省函数额度）
// ---------------------------------------------------------------------------

async function buildPublic(frontendJs, css) {
  console.log('▸ [3/5] 输出静态资源目录 dist/public/...');

  // 注意：build 阶段【不调用任何删除操作】，避免部分受控环境对删除类操作计数拦截。
  // 改为「覆盖式写入」，旧产物残留不影响功能；彻底清理由调用方手动 rm -rf dist/public。

  let html = await readSafe(join(WEB, 'index.html'));
  if (!html) {
    console.warn('  ⚠ web/index.html 不存在，跳过静态构建');
    return;
  }

  // 管理面资源使用【固定】物理路径 /assets，与 ADMIN_PATH 解耦（build 不读 ADMIN_PATH）。
  const assetBase = '/assets';
  const safeJs = escapeScriptBoundary(frontendJs);

  // 站点根页：把 BUILD:STYLE / BUILD:SCRIPT 标记替换为固定 /assets/* 引用。
  // 不注入任何后台路径；管理面 BASE 由运行时 renderAdminPage 注入（no-store）。
  html = injectExternal(html, assetBase);
  html = minifyHtml(html);

  await mkdir(DIST_PUBLIC, { recursive: true });
  await writeFile(join(DIST_PUBLIC, 'index.html'), html, 'utf8');

  const assetDir = join(DIST_PUBLIC, 'assets');
  await mkdir(assetDir, { recursive: true });
  await writeFile(join(assetDir, 'app.css'), css, 'utf8');
  await writeFile(join(assetDir, 'app.js'), safeJs, 'utf8');

  console.log('  ✓ dist/public/index.html + assets/app.{css,js} 已生成（资源路径固定，与 ADMIN_PATH 解耦）');
}

// ---------------------------------------------------------------------------
// 步骤 4：打包 Worker
// ---------------------------------------------------------------------------

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
  platform: 'neutral',
  external: EXTERNAL_MODULES,
  minify: MINIFY,
  sourcemap: false,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'info',
  // 把平台默认值烘焙进产物：caps.js 读不到运行时 CLOUD_PLATFORM 时用它兜底。
  //
  // 为什么默认 'cf'：_worker.js 只有 CF（Workers / Pages）会作为入口被【直接】加载；
  // EO 与 ESA 都经各自薄壳（edge-functions/[[default]].js、esa/index.js）转发，
  // 薄壳会在调用前把 env.CLOUD_PLATFORM 强制置为 'eo' / 'esa'，优先级高于此默认值。
  // 于是三平台都无需任何控制台/API 配置即可正确判定厂商。
  define: {
    __BUILD_PLATFORM__: JSON.stringify('cf'),
  },
  banner: {
    js: `// cdn-edge-gateway — built at ${new Date().toISOString()}\n// 构建产物，请勿手动编辑。修改源码请编辑 src/ 目录后重新运行 npm run build`,
  },
};

// ---------------------------------------------------------------------------
// 步骤 -1.5：烘焙配置生成（方案 A：静态部署 / 不依赖 KV）
// ---------------------------------------------------------------------------

const BAKED_OUT = join(ROOT, 'src/config/baked.generated.js');

/**
 * 把「系统设置 → 导出配置」下载的 JSON 镜像转写为 src/config/baked.generated.js。
 * 该文件 git 不追踪（.gitignore 已排除），由部署专属配置生成，供 ESA 在
 * STATIC_CONFIG=1 模式下直接 import 读取，实现「完全不依赖 KV」。
 *
 * 安全约定：导出的镜像本就剥离了 passwordHash / passwordSalt（见 buildConfigMirror），
 * 因此烘焙产物不含任何管理员凭据，ESA 端天然无法修改配置，只有执行副本。
 *
 * @param {string|null} file  传入 --bake <file> 的 JSON 路径；为 null 时跳过（不烘焙）。
 */
async function bakeConfigFile(file) {
  const raw = await readFile(file, 'utf8');
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    throw new Error(`烘焙失败：--bake 指定的文件不是合法 JSON（${file}）。\n  请用「系统设置 → 导出配置」下载的文件，或此前已生成的 baked 文件。`);
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('烘焙失败：配置镜像格式异常（顶层应为对象）。');
  }

  // 兼容两种来源：① 管理后台导出的 payload（含 global/globalRules/sites/pools）；
  // ② 已生成的 baked 文件（含 BAKED_CONFIG 对象）。统一归一为归一结构。
  const norm = payload.BAKED_CONFIG ? payload.BAKED_CONFIG : payload;
  const cleaned = {
    version: typeof norm.version === 'number' ? norm.version : 1,
    exportedAt: norm.exportedAt ?? null,
    global: norm.global ?? null,
    globalRules: norm.globalRules ?? null,
    sites: Array.isArray(norm.sites) ? norm.sites : [],
    pools: Array.isArray(norm.pools) ? norm.pools : [],
  };

  const body =
    `/**\n` +
    ` * 自动生成（方案 A 静态烘焙配置）。请勿手改；由构建脚本写入。\n` +
    ` * 来源：主节点「系统设置 → 导出配置」生成的镜像。git 不追踪。\n` +
    ` * 更新配置 = 重新导出 → 重新构建部署（ESA 为只读边缘执行壳）。\n` +
    ` */\n\n` +
    `export const BAKED_CONFIG = ${JSON.stringify(cleaned, null, 2)};\n`;

  await writeFile(BAKED_OUT, body, 'utf8');
  const kb = (Buffer.byteLength(body, 'utf8') / 1024).toFixed(1);
  console.log(`  ✓ 已烘焙配置 → src/config/baked.generated.js (${kb} KB，含 ${cleaned.sites.length} 站点 / ${cleaned.pools.length} 连接池)`);
}

/**
 * 主流程钩子：若指定了 --bake 则生成烘焙文件（含完整配置）；否则跳过。
 * 不强制要求文件存在——src/config/baked.defaults.js 已入库（空占位，无机密），
 * store.js 静态 import 它即可保证「干净检出未 --bake」时 import 永不失败；
 * 运行时若检测到 baked.generated.js（git 不追踪）存在则加载其覆盖。
 */
async function maybeBakeConfig() {
  if (!BAKE_FILE) {
    if (existsSync(BAKED_OUT)) {
      console.log('  · 沿用既有 src/config/baked.generated.js（未指定 --bake）');
    } else {
      console.log('  · 未指定 --bake，无需烘焙文件（将使用入库的默认空占位 + 内置默认值）；如需完整配置请加 --bake <导出文件>');
    }
    return;
  }
  if (!existsSync(BAKE_FILE)) {
    throw new Error(`烘焙失败：--bake 指定的文件不存在（${BAKE_FILE}）。`);
  }
  await bakeConfigFile(BAKE_FILE);
}

async function buildWorker() {
  console.log('▸ [4/5] 打包 Worker...');
  const result = await esbuild.build(buildOptions);

  if (result.errors?.length) {
    throw new Error(`打包失败，共 ${result.errors.length} 个错误`);
  }

  const stat = await readFile(join(ROOT, '_worker.js'), 'utf8');
  const kb = (Buffer.byteLength(stat, 'utf8') / 1024).toFixed(1);
  console.log(`  ✓ _worker.js 已生成 (${kb} KB)`);

  if (Number(kb) > 900) {
    console.warn(`  ⚠ 产物体积 ${kb} KB，接近 Workers 1MB 限制。当前已是压缩构建，请精简代码或拆分`);
  }
}

// ---------------------------------------------------------------------------
// 步骤 5a：专项语法校验（持续拦截回归）
// ---------------------------------------------------------------------------

/**
 * 轻量栈式校验 HTML 标签闭合（忽略 void 元素与注释/声明）。
 * 仅做结构校验，不追求完整 HTML 解析（那是浏览器职责）。
 *
 * 注意：SVG 使用 XML 自闭合规则（<path/> 等），与 HTML void 元素不同，
 * 且内部子元素嵌套复杂，HTML 校验器不该深入。故在校验前整体剔除 <svg>…</svg>
 * 段，避免误报（SVG 本身由浏览器按 XML 解析，结构正确性由前端 bundle 保证）。
 * @param {string} html
 * @returns {string|null} 错误信息，null 表示通过
 */
function checkHtmlTagBalance(html) {
  let stripped = html;
  // 先剔除 SVG 整段（含可能的属性与自闭合子元素），不参与 HTML 标签平衡校验
  stripped = stripped.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  // 再剔除 <script>…</script> 整段：内联兜底产物会把前端 bundle 注入 <script> 内，
  // 而 bundle 源码中大量 JS 正则/字符串（如 /</g、</g、</div）会被粗粒度标签正则
  // 误判为 HTML 闭合标签。JS 内容的正确性由独立的 checkJsParse 负责，此处仅校验
  // HTML 结构，故整段剔除，与 syntaxChecks 对括号校验的预处理保持一致。
  stripped = stripped.replace(/<script[\s\S]*?<\/script>/gi, '');
  // 最后剔除 <style>…</style> 整段：CSS 选择器/内容（如 @media、> 子代选择符）同样
  // 可能干扰粗粒度标签扫描，且样式正确性不由 HTML 结构校验保证。
  stripped = stripped.replace(/<style[\s\S]*?<\/style>/gi, '');

  const voidTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  const stack = [];
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const raw = m[0];
    if (raw.startsWith('<!') || raw.startsWith('<?')) continue;
    const isClose = raw.startsWith('</');
    const tag = m[1].toLowerCase();
    const selfClose = m[2] === '/' || voidTags.has(tag);
    if (isClose) {
      const top = stack.pop();
      if (top !== tag) {
        return `HTML 标签不匹配：期望闭合 </${top}>，实际遇到 </${tag}>（pos ${m.index}）`;
      }
    } else if (!selfClose) {
      stack.push(tag);
    }
  }
  if (stack.length) {
    return `HTML 存在未闭合标签：${stack.join(', ')}`;
  }
  return null;
}

/**
 * 校验一段 JS 源码能否被 esbuild 成功解析（不打包，仅 transform）。
 * 解析失败即说明存在括号/语法问题，应拦截。
 * @param {string} js
 * @param {string} label
 * @returns {Promise<string|null>}
 */
async function checkJsParse(js, label) {
  try {
    await esbuild.transform(js, { loader: 'js', target: 'es2022' });
    return null;
  } catch (e) {
    return `${label} 语法解析失败：${e.message}`;
  }
}

/**
 * 校验字符串字面量内外的大/中/小括号是否配对（粗粒度护栏，针对拼接产物）。
 * @param {string} s
 * @returns {string|null}
 */
function checkBracketBalance(s) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const open = new Set(['(', '[', '{']);
  const stack = [];
  // 简易字符串状态：' 或 "
  let inStr = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (open.has(ch)) stack.push(ch);
    else if (pairs[ch]) {
      if (stack.pop() !== pairs[ch]) {
        return `括号不配对：遇到 ${ch} 但栈顶不匹配`;
      }
    }
  }
  if (stack.length) return `括号未闭合：${stack.join('')}`;
  return null;
}

async function syntaxChecks(inlineHtml, inlineJs) {
  console.log('▸ [5/5] 专项语法校验（标签闭合 / 脚本解析 / 括号配对）...');

  const htmlErr = checkHtmlTagBalance(inlineHtml);
  if (htmlErr) throw new Error(`内联 HTML ${htmlErr}`);

  const jsErr = await checkJsParse(inlineJs, '内联前端脚本');
  if (jsErr) throw new Error(jsErr);

  // 括号配对校验仅针对标签结构（剔除 script/style 内部源码，避免 JS/CSS 内的
  // 字符串字面量干扰粗粒度扫描），作为 HTML 结构护栏的补充。
  const structural = inlineHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '');
  const brErr = checkBracketBalance(structural);
  if (brErr) throw new Error(`内联 HTML ${brErr}`);

  console.log('  ✓ 内联 HTML 标签闭合 / 脚本可解析 / 括号配对 均通过');
}

// ---------------------------------------------------------------------------
// 步骤 5b：产物自检
// ---------------------------------------------------------------------------

async function verify() {
  console.log('▸ 产物自检...');

  // 平台口径一致性 + 前端入口可解析（复用 scripts/check.mjs 的 runChecks）。
  // 拦截「CLOUD_PLATFORM 取值回退到非规范别名」与「自动生成入口损坏」两类回归。
  const checkProblems = await runChecks({ quiet: true });
  if (checkProblems.length) {
    throw new Error(
      '静态一致性检查未通过：\n  - ' + checkProblems.join('\n  - ')
    );
  }

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

  let mod;
  try {
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

/**
 * 测试护栏收口：统一检查各子测试返回的 { ok, skipped }，把「构建质量闸门」真正落地。
 *
 * 设计目标（对齐「测试必须植入构建、绝不能带病部署」）：
 *   - 子测试在 build 流程中以「导出函数」形式被 await，它们失败时只返回
 *     { ok:false } 或 { skipped:true } 而不会抛错；若此处不检查，build 会带着
 *     失败的测试结果以「成功」退出，部署后才发现不可用。
 *   - 因此这里显式检查：失败 → throw（build 非零退出，阻断部署）；
 *   - skipped 默认视为「本环境依赖应当可用却缺失」→ 默认 throw（硬失败），
 *     仅当 allowSkip=true（如显式 ALLOW_SKIP_BROWSER_TEST=1）时才放行并警告。
 *
 * @param {string} label  测试名称（用于报错信息）
 * @param {() => Promise<{ok?:boolean, skipped?:boolean, failures?:number}>} fn
 * @param {{ allowSkip?: boolean }} [opts]
 */
export async function runGuard(label, fn, opts = {}) {
  let res;
  try {
    res = await fn();
  } catch (e) {
    // 子测试自身抛错（如断言异常、环境错误）→ 直接阻断构建
    throw new Error(`✗ ${label} 执行异常，构建中止（禁止带病部署）：${e && (e.stack || e.message)}`);
  }
  if (res && res.skipped) {
    if (opts.allowSkip) {
      console.log(`  ⚠ ${label} 已跳过（依赖不可用，已显式允许放行）`);
      return;
    }
    // 默认：依赖应当可用却缺失 → 硬失败，避免漏测带病部署
    throw new Error(
      `✗ ${label} 被跳过：依赖不可用，但本环境应当已安装（jsdom/playwright 均为 devDependency，且 postinstall 会准备浏览器二进制）。\n` +
      `  请先执行 \`npm install\` 安装依赖后重试构建；若确属受限环境，可设 ALLOW_SKIP_BROWSER_TEST=1 显式放行。`
    );
  }
  if (!res || res.ok === false) {
    throw new Error(
      `✗ ${label} 未通过（失败 ${res?.failures ?? '?'} 项断言），构建中止，禁止带病部署。\n` +
      `  请修复前端/产物问题后重新构建。`
    );
  }
  console.log(`  ✓ ${label} 通过`);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  console.log('cdn-edge-gateway 构建开始' + (MINIFY ? '（压缩模式）' : ''));

  // 步骤 -1：自动生成前端入口（web/_stage.entry.js + web/_app.entry.js）。
  // 取代「手写 gitignored 入口文件」，从根上消除非标准导出/误转义导致的构建期语法错误。
  await generateEntries();

  // 步骤 -1.5：烘焙配置生成（方案 A：静态部署 / 不依赖 KV）。
  // 接收「系统设置 → 导出配置」下载的 JSON 镜像，转写为 src/config/baked.generated.js，
  // 供 ESA 在 STATIC_CONFIG=1 模式下直接 import 读取，完全不依赖任何 KV / Redis。
  await maybeBakeConfig();

  // 步骤 0：前端阶段字典单一来源（取代旧的文本切片一致性断言）
  await buildStageGen();

  // 步骤 1：前端 JS 共用一份压缩结果
  const cssRaw = await readSafe(join(WEB, 'style.css'));
  const minCss = minifyCss(cssRaw);
  const frontendJs = await buildFrontendJs();

  // 步骤 2：内联兜底 HTML → src/ui.gen.js（返回最终 html 供专项校验）
  const inlineHtml = await buildInlineUI(frontendJs, minCss);

  // 步骤 3：静态目录
  await buildPublic(frontendJs, minCss);

  // 步骤 4：打包 worker
  await buildWorker();
  await syntaxChecks(inlineHtml, frontendJs);
  if (!SKIP_VERIFY) {
    // 产物自检：文件完整性 / 入口导出可用 / 平台口径一致性（失败直接 throw）
    await verify();
    // 单元层：后端核心模块（matcher/rewrite/cachekey/balancer/auth/keyCodec/config）
    // 直接 import 源码，纯内存、无 KV/网络依赖、秒级完成。先于产物依赖的 e2e，
    // 作为「构建质量闸门」第一道，把核心逻辑回归挡在最前。
    await runGuard('后端核心模块单元测试', runBackendUnitTests);
    // 端到端：用真实产物 _worker.js 跑通「健康检查→管理面→登录→鉴权→后台」，
    // 并在 Node 沙箱执行前端 JS 验证 window.API 挂载。runGuard 确保失败即阻断部署。
    await runGuard('端到端 e2e（HTTP 全流程 + 前端可执行性）', runE2E);
    // 前端整链双轨测试：用「构建结果代码」跑真实 DOM，拦截「构建成功但登录后
    // 进不去后台、控制台报语法定位」这类回归（jsdom 本地秒级 + Playwright 真实
    // 浏览器解析，分别覆盖模拟 DOM 与真实引擎）。二选一缺依赖即硬失败，杜绝漏测。
    await runGuard('前端整链 jsdom（登录 → 进后台）', runFrontendDomTest);
    // Playwright 默认硬测（postinstall 已装浏览器）；仅 ALLOW_SKIP_BROWSER_TEST=1
    // 时允许跳过，作为受限环境的显式逃生舱，绝不默认静默放行。
    await runGuard(
      '前端整链 Playwright 真实浏览器（登录 → 进后台）',
      runFrontendBrowserTest,
      { allowSkip: !!process.env.ALLOW_SKIP_BROWSER_TEST }
    );
  }

  console.log(`\n构建完成，耗时 ${Date.now() - t0}ms`);
  console.log('部署产物：');
  console.log('  _worker.js          → 边缘函数入口（CF Workers / EO edge-functions 共用）');
  console.log('  edge-functions/     → EO Makers 边缘函数目录，[[default]].js 薄壳转发');
  console.log('  esa/index.js        → 阿里云 ESA 边缘函数入口薄壳（转发 _worker.js）');
  console.log('  dist/public/        → 管理面静态资源（CF Pages / EO Makers / ESA Pages 静态托管，最省额度）');
  console.log('部署命令：');
  console.log('  Cloudflare Workers → npx wrangler deploy');
  console.log('  Cloudflare Pages   → npx wrangler pages deploy .');
  console.log('  EdgeOne Makers     → npx edgeone makers deploy . -n <project> -t <token>');
  console.log('  阿里云 ESA Pages    → npm install esa-cli -g && esa-cli login && npm run build && esa-cli commit && esa-cli deploy');
  console.log('                        （ESA 默认走「静态烘焙配置」：构建时加 --bake <导出配置.json> 即可，完全不依赖 KV；');
  console.log('                         若改用外置 Redis，需在 ESA 控制台把 STATIC_CONFIG 设为 0 并设 REDIS_URL 指向自建 Webdis/Redis）');
}

async function runWatch() {
  console.log('监听模式启动...');
  await generateEntries();
  await buildStageGen();
  const cssRaw = await readSafe(join(WEB, 'style.css'));
  const frontendJs = await buildFrontendJs();
  await buildInlineUI(frontendJs, cssRaw);
  await buildPublic(frontendJs, cssRaw);
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('正在监听 src/ 变更（web/ 变更需手动重新运行）');
}

if (WATCH) {
  runWatch().catch((err) => {
    console.error('\n监听构建失败:', err.message);
    process.exit(1);
  });
} else {
  main().catch((err) => {
    console.error('\n构建失败:', err.message);
    process.exit(1);
  });
}
