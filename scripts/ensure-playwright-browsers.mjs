#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/ensure-playwright-browsers.mjs —— postinstall 幂等准备浏览器二进制
 * ----------------------------------------------------------------------------
 * 目的：在 `npm install` 阶段就把 Playwright 的 chromium 二进制准备好，使 build
 * 流程中的「无头浏览器真实解析测试」默认可用，不再静默跳过导致回归漏检。
 *
 * 行为：
 *   - 项目已声明 playwright 为 devDependency，本脚本仅在 playwright 包确实存在时
 *     尝试确保 chromium 就绪；缺失则自动 `npx playwright install chromium`。
 *   - 该脚本设计为「辅助性、失败不阻断」：任何异常（如离线、平台不支持）都只打印
 *     警告并返回 0，绝不影响 `npm install` 主流程。真正关键的安装失败由 build 中的
 *     e2e-browser.mjs 再次兜底（自动重试安装）。
 *
 * 用法：由 package.json 的 postinstall 自动调用；也可手动 `node scripts/ensure-...`。
 * ============================================================================
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function log(msg) {
  console.log('[ensure-playwright] ' + msg);
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  return res.status === 0;
}

// 检测 playwright 包是否已安装（node_modules/playwright 存在）
function playwrightInstalled() {
  return existsSync(join(ROOT, 'node_modules', 'playwright')) ||
    existsSync(join(ROOT, 'node_modules', '@playwright', 'test'));
}

async function main() {
  if (!playwrightInstalled()) {
    log('playwright 未安装，跳过浏览器二进制准备（不影响 install）。');
    return;
  }

  // 先探测 chromium 是否已就绪：用 playwright 的 CLI 列出浏览器，检查退出码。
  // 注意：不解析输出内容，仅以「能否成功列出/探测」判断，避免版本路径耦合。
  const probe = spawnSync(
    'npx',
    ['playwright', 'install', '--dry-run', 'chromium'],
    { cwd: ROOT, stdio: 'ignore', env: process.env }
  );

  // --dry-run 在多数版本可用；若不支持（返回非 0）则直接尝试实际安装（幂等）。
  if (probe.status === 0) {
    log('chromium 已就绪，无需下载。');
    return;
  }

  log('正在下载 chromium 浏览器二进制（首次安装，可能需要联网）...');
  const ok = run('npx', ['playwright', 'install', 'chromium']);
  if (ok) {
    log('chromium 准备完成。');
  } else {
    // 失败不阻断 install：后续 build 中的 e2e-browser.mjs 会再次尝试安装。
    log('警告：chromium 下载失败（可能离线或网络受限）。build 时会再次尝试自动安装。');
  }
}

main().catch((e) => {
  // 任何意外都只警告、不抛出，确保 npm install 不被破坏。
  log('脚本异常（已忽略）：' + (e && (e.stack || e.message)));
});
