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
 *     尝试确保 chromium 就绪；缺失则自动安装。
 *   - 【关键】只下二进制是不够的：Debian slim / CNB debian:13-all 这类精简镜像缺
 *     libglib-2.0 / libnss3 等共享库，chrome-headless-shell 会以
 *     "error while loading shared libraries" 启动失败。因此在 Linux + root 环境
 *     下优先走 `playwright install --with-deps chromium`，一次把系统库也装上。
 *   - 该脚本设计为「辅助性、失败不阻断」：任何异常（如离线、平台不支持）都只打印
 *     警告并返回 0，绝不影响 `npm install` 主流程。真正关键的安装失败由 build 中的
 *     e2e-browser.mjs 再次兜底（自动补装依赖并重试）。
 *
 * 用法：由 package.json 的 postinstall 自动调用；也可手动 `node scripts/ensure-...`。
 *      设 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 可完全跳过（如仅做静态检查的环境）。
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

/**
 * 是否可以安装系统级依赖：仅 Linux 且以 root 运行时才有意义。
 * GitHub Actions 的 ubuntu-latest 已自带大部分库；CNB 的 debian 镜像以 root 跑，
 * 正好可以让 `--with-deps` 通过 apt-get 补齐。
 */
function canInstallSystemDeps() {
  if (process.platform !== 'linux') return false;
  try {
    return typeof process.getuid === 'function' && process.getuid() === 0;
  } catch {
    return false;
  }
}

// 检测 playwright 包是否已安装（node_modules/playwright 存在）
function playwrightInstalled() {
  return existsSync(join(ROOT, 'node_modules', 'playwright')) ||
    existsSync(join(ROOT, 'node_modules', '@playwright', 'test'));
}

async function main() {
  if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD) {
    log('已设置 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD，跳过浏览器准备。');
    return;
  }
  if (!playwrightInstalled()) {
    log('playwright 未安装，跳过浏览器二进制准备（不影响 install）。');
    return;
  }

  const withDeps = canInstallSystemDeps();

  // 先探测 chromium 二进制是否已就绪（如 CI 缓存命中）。
  // 注意：--dry-run 只判断「二进制」，不判断系统共享库，故即便命中，
  // Linux/root 下仍需确保系统依赖存在（install-deps 幂等且很快）。
  const probe = spawnSync(
    'npx',
    ['playwright', 'install', '--dry-run', 'chromium'],
    { cwd: ROOT, stdio: 'ignore', env: process.env }
  );

  if (probe.status === 0) {
    log('chromium 二进制已就绪，无需下载。');
    if (withDeps) {
      log('补齐 chromium 运行所需系统共享库（install-deps，幂等）...');
      if (!run('npx', ['playwright', 'install-deps', 'chromium'])) {
        log('警告：install-deps 失败，build 时会再次尝试补装。');
      }
    }
    return;
  }

  if (withDeps) {
    // Linux + root：一次性装二进制 + 系统库，避免「下载 300MB 后启动缺 so」。
    log('正在安装 chromium 及其系统依赖（--with-deps，首次安装需联网）...');
    if (run('npx', ['playwright', 'install', '--with-deps', 'chromium'])) {
      log('chromium 及系统依赖准备完成。');
      return;
    }
    log('警告：--with-deps 安装失败，回退为仅安装浏览器二进制。');
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
