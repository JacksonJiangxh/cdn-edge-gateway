#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/check.mjs —— 提交前 / CI 静态一致性检查
 * ----------------------------------------------------------------------------
 * 目的：在 build 之外提供一条轻量、快速的「健壮性护栏」，防止三类回归：
 *
 *   1. CLOUD_PLATFORM 取值口径回退：
 *      规范值必须恒为 cf | eo | esa。若仓库中出现非规范赋值（如 edgeone、
 *      cloudflare、aliyun-esa、pages），读走 caps.js 会不一致或触发告警，
 *      本检查会报错拦截（建议改为规范值；别名仅由 caps.js 运行时兜底兼容）。
 *
 *   2. 前端入口缺失：
 *      web/_stage.entry.js 与 web/_app.entry.js 由构建自动生成（scripts/
 *      gen-entries.mjs），仓库中不提交。若缺失，build 会在步骤 0/1 失败。
 *      本检查会在缺失时调用 generateEntries() 重建，确保 `npm run check`
 *      后 build 必然可跑。
 *
 *   3. 前端入口可解析：
 *      用 esbuild transform 校验生成的入口文件语法，防止转义/括号问题。
 *
 * 用法：
 *   node scripts/check.mjs        # 全量静态检查，异常即非零退出
 *   node scripts/check.mjs --fix  # 入口缺失时自动重建（默认已开启，保留 flag 兼容）
 * ============================================================================
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { generateEntries } from './gen-entries.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 规范值（与 src/platform/caps.js 的 VALID_PLATFORMS 对齐） */
const CANONICAL = ['cf', 'eo', 'esa'];

/** 非法取值（历史别名，运行时应由 caps.js 归一；仓库写入处应改为规范值） */
const ILLEGAL_VALUES = ['edgeone', 'cloudflare', 'aliyun-esa', 'alibaba-esa', 'pages'];

/** 需扫描的文件/目录（相对 ROOT） */
const SCAN_TARGETS = [
  'scripts/dev.mjs',
  'scripts/deploy-esa-cli.mjs',
  'esa/index.js',
  'esa.jsonc',
  'wrangler.toml',
  'wrangler.dev.toml',
  'edgeone.json',
  'README.md',
  'docs',
  '.github/workflows',
];

/** 期望由构建自动生成的前端入口 */
const GENERATED_ENTRIES = ['web/_stage.entry.js', 'web/_app.entry.js'];

/** 递归收集目录下需扫描的文件 */
function collectFiles(target) {
  const abs = join(ROOT, target);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isDirectory()) {
    const out = [];
    for (const name of readdirSync(abs)) {
      const child = join(target, name);
      const cAbs = join(ROOT, child);
      if (statSync(cAbs).isDirectory()) {
        // 跳过 node_modules 等
        if (name === 'node_modules' || name === '.git') continue;
        out.push(...collectFiles(child));
      } else {
        out.push(child);
      }
    }
    return out;
  }
  return [target];
}

/** 扫描单个文件里 CLOUD_PLATFORM=xxx 的赋值（含 = 前缀，忽略 # / // 注释） */
function scanFile(rel, problems) {
  const abs = join(ROOT, rel);
  let content;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    return;
  }
  const lines = content.split('\n');
  const re = /CLOUD_PLATFORM\s*=\s*["']?([A-Za-z0-9_-]+)["']?/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = line.trim();
    // 跳过纯注释行（# 或 // 开头）
    if (stripped.startsWith('#') || stripped.startsWith('//')) continue;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line)) !== null) {
      const value = m[1].toLowerCase();
      if (!CANONICAL.includes(value)) {
        problems.push(
          `${rel}:${i + 1}  CLOUD_PLATFORM 取值 "${value}" 非规范（应为 ${CANONICAL.join('|')}）`
        );
      }
    }
  }
}

/** 扫描入口是否可被 esbuild 解析 */
async function checkEntryParseable(problems) {
  for (const rel of GENERATED_ENTRIES) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
      problems.push(`${rel} 缺失——请运行 scripts/gen-entries.mjs 或 npm run build 生成`);
      continue;
    }
    const src = readFileSync(abs, 'utf8');
    try {
      await esbuild.transform(src, { loader: 'js', target: 'es2022' });
    } catch (e) {
      problems.push(`${rel} 语法解析失败：${e.message}`);
    }
  }
}

/**
 * 执行静态一致性检查（供 build.mjs / scripts/check.mjs 复用）。
 * 不主动 process.exit；返回问题数组（空 = 通过）。
 * @param {Object} [opts]
 * @param {boolean} [opts.quiet] 是否静默（build 内部调用时避免重复日志）
 * @returns {Promise<string[]>} 问题列表
 */
export async function runChecks({ quiet = false } = {}) {
  const local = [];
  if (!quiet) console.log('▸ 平台口径静态检查（CLOUD_PLATFORM 应恒为 cf|eo|esa）...');
  const files = SCAN_TARGETS.flatMap(collectFiles);
  for (const rel of files) scanFile(rel, local);

  // 入口缺失则自动重建（构建期中间产物，不提交）
  let rebuilt = false;
  for (const rel of GENERATED_ENTRIES) {
    if (!existsSync(join(ROOT, rel))) {
      await generateEntries();
      rebuilt = true;
    }
  }
  if (rebuilt) {
    if (!quiet) console.log('  ✓ 已自动重建缺失的前端入口');
  }

  if (!quiet) console.log('▸ 前端入口可解析性检查...');
  await checkEntryParseable(local);

  return local;
}

/** 主流程（CLI 入口） */
async function main() {
  const problems = await runChecks();

  if (problems.length) {
    console.error('\n✗ 检查未通过：');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\n修复建议：将 CLOUD_PLATFORM 写入处改为规范值 cf|eo|esa（caps.js 运行时会兼容旧别名，但仓库内建议统一规范写法）；前端入口请运行 npm run build 生成。');
    process.exit(1);
  }

  console.log('✓ 平台口径与前端入口一致性检查全部通过');
}

// 以 `node scripts/check.mjs` 直接运行时走 main()；
// 被 build.mjs import 时仅导出 runChecks()，不触发 CLI。
const isCli = (() => {
  try {
    return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isCli) {
  main().catch((err) => {
    console.error('✗ check 执行异常:', err?.message || err);
    process.exit(1);
  });
}
