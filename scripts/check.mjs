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
 *      同时校验 web/_stage.gen.js（由 build.mjs 步骤 0 用 esbuild 打包生成、
 *      被 web/app.js import 的产物）的存在性与可解析性，拦截「构建成功但该
 *      产物损坏」的回归。该产物同样被 .gitignore 排除，CI 全新克隆时必然
 *      缺失，故缺失时由本脚本用 esbuild 直接重建（而非报错要求先跑 build，
 *      否则 check → build 的流水线顺序会形成「先有鸡还是先有蛋」的死锁）。
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
  // CNB 平台流水线（与 GitHub Actions 并列的第二个 CI 系统），
  // 防止在 .cnb.yml 里把 CLOUD_PLATFORM 写成非规范别名。
  '.cnb.yml',
];

/** 期望由构建自动生成的前端入口（可被 gen-entries.mjs 轻量重建） */
const GENERATED_ENTRIES = ['web/_stage.entry.js', 'web/_app.entry.js'];

/**
 * 期望由构建自动生成、且【需 esbuild bundle 才能重建】的产物。
 *
 * web/_stage.gen.js 由 build.mjs 的 buildStageGen() 用 esbuild 打包 _stage.entry.js
 * 生成，并被 web/app.js import。它被 .gitignore 排除，因此 CI（CNB / GitHub
 * Actions）全新克隆后必然不存在——而流水线顺序是 check → build，若此处直接
 * 报错要求「先跑 npm run build」，check 将永远无法通过（本地能过只是因为残留
 * 了上次构建的产物）。故缺失时在此用 esbuild 重建，逻辑与 buildStageGen() 一致。
 */
const GENERATED_BUNDLE = ['web/_stage.gen.js'];

/**
 * 重建 web/_stage.gen.js —— 与 build.mjs 的 buildStageGen() 保持同构。
 * 从 web/_stage.entry.js（由 gen-entries.mjs 生成）打包出 ESM 产物。
 */
async function rebuildStageGen() {
  await esbuild.build({
    entryPoints: [join(ROOT, 'web/_stage.entry.js')],
    outfile: join(ROOT, 'web/_stage.gen.js'),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    minify: false,
    write: true,
    legalComments: 'none',
  });
}

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

/**
 * 扫描入口是否可被 esbuild 解析。
 * @param {string[]} problems 问题收集数组
 * @param {boolean} [quiet] 是否静默（build 内部调用时避免重复日志）
 */
async function checkEntryParseable(problems, quiet = false) {
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
  // 由 esbuild bundle 生成的产物（_stage.gen.js）：被 .gitignore 排除，CI 全新
  // 克隆后必然缺失。此处按需重建（而非报错），再校验可解析性，既保证 check 在
  // 干净仓库可独立通过，又能继续拦截「产物存在但已损坏」的回归。
  for (const rel of GENERATED_BUNDLE) {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) {
      try {
        await rebuildStageGen();
      } catch (e) {
        problems.push(`${rel} 缺失且重建失败：${e.message}`);
        continue;
      }
      if (!existsSync(abs)) {
        problems.push(`${rel} 缺失——重建未产出文件，请运行 npm run build 排查`);
        continue;
      }
      if (!quiet) console.log(`  ✓ 已自动重建缺失的 ${rel}`);
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
 * 跨平台「平台开关 vs 运行时变量」护栏。
 *
 * Cloudflare 的 assets / preview_urls / observability / [cache] 是【平台级开关】，
 * 不是运行时 env。若被误写入 [vars] 段，wrangler 会注入成 env.assets /
 * env.preview_urls / env.observability，既无意义又污染变量页面（见 2026-08 部署事故）。
 * EdgeOne 的 edgeone.json 的 env 只应含真变量，同样不得混入开关类键。
 * 本检查在 CI 静态阶段拦截这类退化，确保「开关永远在顶层、变量永远在 [vars]/控制台」。
 *
 * @param {string[]} problems 问题收集数组
 */
function checkPlatformSwitches(problems) {
  // ---- CF：wrangler.toml 平台开关不得出现在 [vars] 段内 ----
  const wf = join(ROOT, 'wrangler.toml');
  if (existsSync(wf)) {
    const lines = readFileSync(wf, 'utf8').split('\n');
    const SWITCH_KEYS = ['assets', 'preview_urls', 'observability', 'cache'];
    let inVars = false;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const head = raw.trim();
      if (/^\[vars\]/.test(head)) { inVars = true; continue; }
      // 遇到任意其它顶层表（[xxx]）离开 vars 段
      if (/^\[[^\]]+\]/.test(head) && !/^\[vars\]/.test(head)) { inVars = false; continue; }
      if (!inVars) continue;
      const m = head.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m && SWITCH_KEYS.includes(m[1])) {
        problems.push(
          `wrangler.toml:${i + 1}  平台开关 "${m[1]}" 误写入 [vars] 段——它应位于顶层（不是运行时 env），否则会被注入成 env.${m[1]}`
        );
      }
    }
  }

  // ---- EO：edgeone.json 的 env 只含白名单真变量 ----
  const ef = join(ROOT, 'edgeone.json');
  if (existsSync(ef)) {
    try {
      const envObj = JSON.parse(readFileSync(ef, 'utf8')).env || {};
      const ALLOWED = new Set(['NODE_VERSION', 'CLOUD_PLATFORM']);
      const SWITCH_LIKE = ['assets', 'preview_urls', 'observability', 'cache', 'compatibility_date', 'compatibility_flags'];
      for (const k of Object.keys(envObj)) {
        if (SWITCH_LIKE.includes(k)) {
          problems.push(
            `edgeone.json  env."${k}" 是平台开关/配置项，不应放在 edgeone.json 的 env（EO 无此类顶层开关，且 env 只用于运行时变量）`
          );
        }
        if (!ALLOWED.has(k)) {
          problems.push(
            `edgeone.json  env."${k}" 不在白名单（${[...ALLOWED].join('|')}）——若确为运行时变量请补入白名单，否则勿放进 env`
          );
        }
      }
    } catch (e) {
      problems.push(`edgeone.json 解析失败：${e.message}`);
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

  if (!quiet) console.log('▸ 平台开关 vs 运行时变量 护栏...');
  checkPlatformSwitches(local);

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
  await checkEntryParseable(local, quiet);

  return local;
}

/** 主流程（CLI 入口） */
async function main() {
  const problems = await runChecks();

  if (problems.length) {
    console.error('\n✗ 检查未通过：');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\n修复建议：将 CLOUD_PLATFORM 写入处改为规范值 cf|eo|esa（caps.js 运行时会兼容旧别名，但仓库内建议统一规范写法）；前端入口/产物本脚本会自动重建，若重建失败请检查 web/ 与 src/config/stages.js 的语法。');
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
