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
 *      （内联脚本可 parse、HTML 标签闭合、括号配对），拦住「构建成功但产物不可用」。
 *
 * 用法：node build.mjs [--no-minify] [--skip-verify] [--watch]
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
// 默认开启压缩构建（产物体积小、启动快，远离 Cloudflare 免费版 1MB 上限）。
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
  if (!existsSync(entry)) throw new Error('缺少 web/_stage.entry.js');
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(WEB, '_stage.gen.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    minify: false, // 前端 bundle 阶段已压缩，此处保持可读便于排查
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
  if (!existsSync(entry)) throw new Error('缺少 web/_app.entry.js');
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
  });
  const text = result.outputFiles?.[0]?.text;
  if (!text) throw new Error('前端 bundle 未产出内容');
  console.log(`  ✓ 前端 JS 已打包 (${Math.ceil(Buffer.byteLength(text) / 1024)} KB)`);
  return text;
}

// ---------------------------------------------------------------------------
// 步骤 2：内联兜底 HTML（src/ui.gen.js）—— 用 JSON 字符串字面量，由 esbuild 安全转义
// ---------------------------------------------------------------------------

/**
 * 构建内联兜底 HTML（src/ui.gen.js）。用于 CF Workers 直接粘贴 worker、
 * 或任何没有独立静态托管能力的部署形态。管理面请求仍走函数，但保证可用。
 *
 * 关键改动（消除脆弱 hack）：
 *   旧方案把含反引号/<>/$ 的 HTML 先 base64 再内联，运行时解码，规避「esbuild
 *   改写超长字符串时边界破裂」。但这是把字符串直接拼进 HTML 文本才有的问题；
 *   现在 UI_HTML 只是 src/ui.gen.js 里的一个普通 JS 字符串字面量（经 JSON.stringify
 *   生成，对 " \ 控制字符自动转义，反引号/<> 在双引号串内天然安全），由 esbuild
 *   打包进 worker 时再次安全转义，绝无边界破裂风险。故 base64 中转不再必要。
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

  // --- 注入 CSS：把 <link style.css> 替换为内联 <style>（用模板字符串，非 String.replace）---
  const styleTag = `<style>${css}</style>`;
  html = html.replace(/<link[^>]+style\.css[^>]*>/i, () => styleTag);
  html = html.replace(/<!--\s*BUILD:STYLE\s*-->/i, '');

  // --- 注入 JS：移除原始 <script src=api|app.js>，在 </body> 前插入内联 <script> ---
  // frontendJs 经 escapeScriptBoundary 处理，杜绝 </script> 提前闭合。
  const safeJs = escapeScriptBoundary(frontendJs);
  const scriptTag = `<script>${safeJs}</script>`;
  html = html.replace(/<script[^>]+src=["'](?:\.\/)?(?:api|app)\.js["'][^>]*>\s*<\/script>/gi, '');
  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, () => `${scriptTag}</body>`);
  } else {
    html += scriptTag;
  }

  html = minifyHtml(html);

  // 用 JSON.stringify 生成安全的 JS 字符串字面量（JSON 是 JS 子集，自动转义特殊字符）。
  // 同时保留旧版 UI_HTML_B64 / UI_CSS_B64 兼容导出（未重新构建的旧产物仍可解码）。
  const uiHtmlB64 = Buffer.from(html, 'utf8').toString('base64');
  const uiCssB64 = Buffer.from(css ?? '', 'utf8').toString('base64');
  const out = `/**
 * 自动生成文件 —— 请勿手动编辑
 * 由 build.mjs 从 web/ 内联生成（无静态托管环境兜底用）
 * 生成时间: ${new Date().toISOString()}
 */
// UI_HTML / UI_CSS 为普通 JS 字符串字面量（JSON 安全转义），由 esbuild 打包进
// worker 时再次安全转义，无需 base64 中转，消除超长字符串边界破裂风险。
export const UI_HTML = ${JSON.stringify(html)};
export const UI_CSS = ${JSON.stringify(css ?? '')};
// 兼容旧版消费方（adminPage 的回退分支）。
export const UI_HTML_B64 = ${JSON.stringify(uiHtmlB64)};
export const UI_CSS_B64 = ${JSON.stringify(uiCssB64)};
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

  // 站点根页：移除原始 <link style.css> 与 <script src=...>，改为引用固定 /assets/*
  html = html.replace(/<link[^>]+style\.css[^>]*>/i, `<link rel="stylesheet" href="${assetBase}/app.css">`);
  html = html.replace(/<!--\s*BUILD:STYLE\s*-->/i, '');
  html = html.replace(/<script[^>]+src=["'](?:\.\/)?api\.js["'][^>]*>\s*<\/script>/gi, '');
  html = html.replace(/<script[^>]+src=["'](?:\.\/)?app\.js["'][^>]*>\s*<\/script>/gi, '');
  // 站点根页不注入任何后台路径；管理面 BASE 由运行时 renderAdminPage 注入（no-store）。
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
  banner: {
    js: `// cdn-edge-gateway — built at ${new Date().toISOString()}\n// 构建产物，请勿手动编辑。修改源码请编辑 src/ 目录后重新运行 npm run build`,
  },
};

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
  // 先剔除 SVG 整段（含可能的属性与自闭合子元素），不参与 HTML 标签平衡校验
  const stripped = html.replace(/<svg[\s\S]*?<\/svg>/gi, '');

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
  let inStr = null; // 简易字符串状态：' 或 "
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

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const t0 = Date.now();
  console.log('cdn-edge-gateway 构建开始' + (MINIFY ? '（压缩模式）' : ''));

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

  // 步骤 5：专项语法校验 + 产物自检
  await syntaxChecks(inlineHtml, frontendJs);
  if (!SKIP_VERIFY) {
    await verify();
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
  console.log('                        （ESA 的 EdgeKV 收费无免费额度，持久化需先在 ESA 控制台设 REDIS_URL 指向自建 Webdis/Redis）');
}

async function runWatch() {
  console.log('监听模式启动...');
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
