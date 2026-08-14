#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/gen-entries.mjs —— 构建期自动生成前端入口文件
 * ----------------------------------------------------------------------------
 * 目的：彻底取代「手写 gitignored 入口文件」的脆弱范式。
 *
 * 历史问题：build.mjs 依赖 web/_stage.entry.js 与 web/_app.entry.js 两个入口，
 * 但它们被 .gitignore 排除且仓库中不存在，缺失即 throw，导致 `npm run build`
 * 开箱即无法运行。用户只能靠手写补齐，而手写入口正是「非标准导出 / 误转义 /
 * 括号丢失」等语法问题的最大来源。
 *
 * 方案：由本脚本在构建期从唯一真相源自动生成这两个入口——
 *   - web/_stage.entry.js：从 src/config/stages.js re-export 前端阶段字典子集，
 *     供 esbuild 抽取生成 web/_stage.gen.js（web/app.js import 用）。
 *   - web/_app.entry.js：聚合 web/api.js + web/app.js，作为前端 bundle 输入。
 *
 * 生成物仍是构建期中间产物（保持 .gitignore 排除），但由构建自动生成，
 * 不依赖任何手写内容，从根上消除语法/转义风险。build.mjs 与 dev 流程复用本模块。
 *
 * 用法：
 *   node scripts/gen-entries.mjs          # 生成两个入口（build.mjs 内部调用）
 * ============================================================================
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 本文件位于 scripts/ 下，项目根 = scripts/ 的上一级。
// 不能直接用 dirname(import.meta.url)（那会是 scripts/），否则入口会写到 scripts/web/。
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 前端所需的阶段字典子集。
 * 含「全站独有阶段」（GLOBAL_ONLY_*）：这些阶段承载原先藏在 settings 双轨里的
 * 全站参数（匹配站点默认协议 / 安全校验限速 / 错误处理文案），单轨化后需由
 * 前端「全站通用规则」视图渲染，故一并抽取到前端字典，保持单一真相源。
 * @type {readonly string[]}
 */
const STAGE_SUBSET = [
  'STAGE_ORDER',
  'STAGE_OPS',
  'STAGE_ALIASES',
  'normalizeStage',
  'GLOBAL_ONLY_STAGE_ORDER',
  'GLOBAL_ONLY_STAGE_OPS',
  'isGlobalOnlyStage',
];

/**
 * 生成 web/_stage.entry.js：显式 re-export src/config/stages.js 的前端子集。
 *
 * 用显式具名导出而非 `export *`，确保 esbuild 只抽取前端真正需要的符号，
 * 避免把 stages.js 中仅供后端使用的其它导出一并打包进前端 bundle。
 * @returns {Promise<string>} 生成的文件路径
 */
async function genStageEntry() {
  const names = STAGE_SUBSET.join(', ');
  const src =
    `// 自动生成文件 —— 请勿手动编辑\n` +
    `// 由 scripts/gen-entries.mjs 从 src/config/stages.js 抽取前端阶段字典子集生成，\n` +
    `// 供 build.mjs 打包产出 web/_stage.gen.js（web/app.js import 用）。\n` +
    `// 修改阶段字典请编辑 src/config/stages.js 后重新运行 npm run build。\n` +
    `export { ${names} } from '../src/config/stages.js';\n`;
  const target = join(ROOT, 'web', '_stage.entry.js');
  await writeFile(target, src, 'utf8');
  return target;
}

/**
 * 生成 web/_app.entry.js：聚合管理面前端两个源文件作为 esbuild bundle 输入。
 *
 * 通过副作用 import（import './api.js'）确保 api.js 的 window.API 全局赋值先执行，
 * 再 import './app.js'（app.js 顶层 IIFE 依赖 window.API）。顺序不可颠倒。
 * @returns {Promise<string>} 生成的文件路径
 */
async function genAppEntry() {
  const src =
    `// 自动生成文件 —— 请勿手动编辑\n` +
    `// 由 scripts/gen-entries.mjs 聚合管理面前端源文件生成，供 build.mjs 打包前端 bundle。\n` +
    `// 顺序约定：api.js 必须先于 app.js 执行（app.js 顶层 IIFE 依赖 window.API）。\n` +
    `import './api.js';\n` +
    `import './app.js';\n`;
  const target = join(ROOT, 'web', '_app.entry.js');
  await writeFile(target, src, 'utf8');
  return target;
}

/**
 * 生成全部前端入口文件。供 build.mjs / dev 流程复用。
 * @returns {Promise<string[]>} 生成的绝对路径列表
 */
export async function generateEntries() {
  await mkdir(join(ROOT, 'web'), { recursive: true });
  const targets = [];
  targets.push(await genStageEntry());
  targets.push(await genAppEntry());
  return targets;
}

// 直接以 `node scripts/gen-entries.mjs` 运行时：生成后打印路径并退出。
// 作为模块被 build.mjs import 时则走 generateEntries() 导出，不触发 CLI 逻辑。
// argv[1] 可能是相对/绝对路径，统一 resolve 后再与模块自身绝对路径比对。
const isCli = (() => {
  try {
    return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isCli) {
  generateEntries()
    .then((targets) => {
      for (const t of targets) console.log(`✓ 已生成前端入口: ${t.replace(ROOT + '/', '')}`);
    })
    .catch((err) => {
      console.error('✗ 生成前端入口失败:', err?.message || err);
      process.exit(1);
    });
}
