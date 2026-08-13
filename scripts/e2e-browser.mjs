#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/e2e-browser.mjs —— 无头浏览器「真实解析」前端测试（Playwright）
 * ----------------------------------------------------------------------------
 * 目的：在 CI 中提供覆盖度最高的护栏。jsdom 仍是「模拟 DOM」；Playwright 用
 * 真实 Chromium 加载 build 产出的【内联形态 HTML】（src/ui.gen.js.UI_HTML），
 * 由真实浏览器解析引擎执行内联 <script>，捕获：
 *   - pageerror（语法错误 / 运行时崩溃，等价于「登录后控制台报语法定位」）
 *   - console.error（转义/标签丢失导致的渲染异常）
 * 并真实点击登录按钮，断言可进入后台（#view-app 可见、#content 有内容）。
 *
 * 这是 build.mjs 步骤 5 的第二道闸：拦截「构建成功但产物不可用」。
 *
 * 依赖：playwright（devDependency）。playwright 包缺失时由包管理器保证已装；
 * 浏览器二进制缺失时本脚本会自动 `npx playwright install chromium`。
 * 仅当自动安装仍失败、且显式设置 ALLOW_SKIP_BROWSER_TEST=1 时才跳过，否则硬失败
 * （由 build.mjs 的 runGuard 收口为构建失败，杜绝带病部署）。
 * 用法：
 *   node scripts/e2e-browser.mjs
 *   ALLOW_SKIP_BROWSER_TEST=1 node scripts/e2e-browser.mjs   # 受限环境显式放行
 * ============================================================================
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let _checks = 0;
let _failures = 0;
function assert(cond, label, detail) {
  _checks++;
  if (cond) console.log(`  ✓ ${label}`);
  else {
    _failures++;
    console.log(`  ✗ ${label}${detail ? ' —— ' + detail : ''}`);
  }
}

/**
 * 在无后端环境下验证「真实浏览器解析产物 + 登录→后台渲染」所需的 API 桩脚本。
 *
 * 关键点：web/app.js 在模块顶层执行 `const API = window.API` 捕获引用，而打包
 * 后的 api.js 随后会用 `window.API = API` 覆盖。为让无后端的 e2e 也能验证前端
 * 渲染逻辑（而非后端集成——后端集成由 scripts/e2e-test.mjs 沙箱覆盖），本桩
 * 脚本注入到 <head> 最前，并在所有页面脚本之前运行，【拦截 window.API 的赋值】，
 * 使 api.js 的赋值被丢弃、固定为下面的 STUB，从而 app.js 捕获到的就是 STUB。
 *
 * 设计为纯字符串（非 addInitScript），因为 Playwright 的 setContent 路径下
 * addInitScript 不一定注入；直接内联进 HTML 最可靠。
 *
 * 用 Proxy 兜底：任意未显式声明的方法/命名空间都返回 resolved 的空数据，最大化
 * 兼容 app.js 各视图调用。关键 auth 行为：
 *   - me()    → { authed:false }（启动时落到登录页，#login-btn 可见）
 *   - login() → resolved（点击登录后进入后台，触发 enterApp/loadAll/route）
 *
 * 注意：脚本正文内不得出现 `</script` 字面量（会截断内联 HTML）。
 */
/** Linux + root 才有能力通过 apt-get 安装系统共享库 */
function canInstallSystemDeps() {
  if (process.platform !== 'linux') return false;
  try {
    return typeof process.getuid === 'function' && process.getuid() === 0;
  } catch {
    return false;
  }
}

function sh(cmd, args) {
  return spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
}

/**
 * 判断启动失败是否属于「缺少系统共享库」。
 * 典型报错：chrome-headless-shell: error while loading shared libraries:
 *          libglib-2.0.so.0: cannot open shared object file
 * 这类失败可以通过 `playwright install-deps chromium` 自愈，属于环境问题而非产物问题。
 */
function isMissingSharedLibrary(err) {
  const msg = String((err && (err.message || err)) || '');
  return /error while loading shared libraries|cannot open shared object file|libnss3|libglib|libgobject|Host system is missing dependencies/i.test(msg);
}

/**
 * 尝试补装 chromium 运行所需的系统共享库。
 * 优先用 playwright 官方 install-deps（内部按发行版调 apt-get 装准确的包集合）；
 * 失败时回退为直接 apt-get 安装最小必需集，兼容 playwright 尚未适配的新发行版
 * （如 Debian 13 trixie，官方 install-deps 可能因版本判定而拒绝执行）。
 */
function installSystemDeps() {
  console.log('  ! 检测到缺少系统共享库，尝试自动补装（playwright install-deps chromium）...');
  if (sh('npx', ['playwright', 'install-deps', 'chromium']).status === 0) return true;

  console.log('  ! install-deps 失败，回退为直接 apt-get 安装最小依赖集...');
  if (spawnSync('sh', ['-c', 'command -v apt-get'], { stdio: 'ignore' }).status !== 0) {
    console.log('  ! 当前系统无 apt-get，无法自动补装依赖。');
    return false;
  }
  // Playwright 官方 chromium 运行时最小依赖集（Debian/Ubuntu 通用名）
  const pkgs = [
    'libglib2.0-0', 'libnss3', 'libnspr4', 'libdbus-1-3', 'libatk1.0-0',
    'libatk-bridge2.0-0', 'libcups2', 'libdrm2', 'libxkbcommon0', 'libatspi2.0-0',
    'libx11-6', 'libxcomposite1', 'libxdamage1', 'libxext6', 'libxfixes3',
    'libxrandr2', 'libgbm1', 'libpango-1.0-0', 'libcairo2', 'libasound2',
    'libudev1', 'fonts-liberation', 'ca-certificates',
  ];
  // Debian 13 起部分包改名（libasound2 → libasound2t64 等），逐包安装避免整批失败
  const script =
    'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq || true; ' +
    pkgs.map((p) => `apt-get install -y --no-install-recommends ${p} >/dev/null 2>&1 || apt-get install -y --no-install-recommends ${p}t64 >/dev/null 2>&1 || true`).join('; ');
  sh('sh', ['-c', script]);
  return true;
}

function apiStubScript() {
  return [
    '<script>',
    '(function(){',
    "var empty={ok:true,data:{},sites:[],pools:[],rules:[],templates:[],stats:null};",
    'var resolved=function(){return Promise.resolve(empty);};',
    'var STUB=new Proxy({auth:{me:function(){return Promise.resolve({authed:false});},login:function(){return Promise.resolve({ok:true});},logout:function(){return Promise.resolve({ok:true});}}},',
    '{get:function(t,ns){if(ns in t)return t[ns];return new Proxy({},{get:function(){return resolved;}});}});',
    "var _r;Object.defineProperty(window,'API',{configurable:true,enumerable:true,get:function(){return STUB;},set:function(v){_r=v;}});",
    '})();',
    '</script>',
  ].join('');
}

/**
 * 启动 chromium，失败时按「原因分类」自愈后重试。
 *
 * 重试链（每步都幂等、可在 CI 反复执行）：
 *   1) 直接启动
 *   2) 缺共享库 → install-deps / apt-get 补装 → 重试
 *   3) 缺二进制 → playwright install chromium → 重试
 *   4) 仍失败且能装系统依赖 → playwright install --with-deps chromium → 重试
 *   5) 全部失败 → 抛错阻断构建（仅 ALLOW_SKIP_BROWSER_TEST=1 时返回跳过标记）
 *
 * @returns {Promise<import('playwright').Browser | {__skipped:true}>}
 */
async function launchWithSelfHeal(chromium) {
  const attempts = [];
  // 容器内以 root 运行时必须关闭 sandbox；/dev/shm 常被限制为 64MB，
  // 需 --disable-dev-shm-usage 否则页面会随机崩溃。本地非 root 不加这些参数。
  const launchOpts = canInstallSystemDeps()
    ? { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] }
    : {};
  const tryLaunch = async () => {
    try {
      return await chromium.launch(launchOpts);
    } catch (e) {
      attempts.push(e);
      return null;
    }
  };

  let browser = await tryLaunch();
  if (browser) return browser;

  const first = attempts[0];

  // 阶段 A：缺系统共享库（最常见于 debian-slim / CNB 镜像）
  if (isMissingSharedLibrary(first) && canInstallSystemDeps()) {
    if (installSystemDeps()) {
      browser = await tryLaunch();
      if (browser) {
        console.log('  ✓ 系统共享库已补装，chromium 启动成功');
        return browser;
      }
    }
  }

  // 阶段 B：缺浏览器二进制
  console.log('  ! chromium 启动失败，尝试安装浏览器二进制...');
  const withDeps = canInstallSystemDeps();
  const installArgs = withDeps
    ? ['playwright', 'install', '--with-deps', 'chromium']
    : ['playwright', 'install', 'chromium'];
  const installRes = sh('npx', installArgs);

  if (installRes.status === 0) {
    browser = await tryLaunch();
    if (browser) {
      console.log('  ✓ chromium 安装完成并启动成功');
      return browser;
    }
  } else if (withDeps) {
    // --with-deps 在新发行版上可能因版本判定失败：退回「仅二进制 + 手动补库」
    console.log('  ! --with-deps 安装失败，回退为「二进制 + 手动补库」...');
    if (sh('npx', ['playwright', 'install', 'chromium']).status === 0) {
      installSystemDeps();
      browser = await tryLaunch();
      if (browser) {
        console.log('  ✓ chromium 安装完成并启动成功');
        return browser;
      }
    }
  }

  // 阶段 C：安装后仍启动失败，且报错仍指向共享库 → 再补一次库
  const last = attempts[attempts.length - 1];
  if (isMissingSharedLibrary(last) && canInstallSystemDeps()) {
    if (installSystemDeps()) {
      browser = await tryLaunch();
      if (browser) {
        console.log('  ✓ 系统共享库已补装，chromium 启动成功');
        return browser;
      }
    }
  }

  const detail = (last && (last.message || String(last))) || '未知错误';
  if (process.env.ALLOW_SKIP_BROWSER_TEST) {
    console.log('  ! chromium 自愈后仍无法启动，已按 ALLOW_SKIP_BROWSER_TEST=1 跳过（不阻断 build）。');
    console.log('    错误：' + detail);
    return { __skipped: true };
  }
  throw new Error(
    'Playwright chromium 无法启动（已自动尝试安装二进制与系统依赖）：' + detail + '\n' +
    (isMissingSharedLibrary(last)
      ? '  仍缺少系统共享库。请在 CI 镜像中预装依赖，例如：\n' +
        '    npx playwright install --with-deps chromium\n' +
        '  或在 root 环境执行 `npx playwright install-deps chromium`。\n'
      : '  请检查网络与运行环境（容器需允许 --no-sandbox / 足够的 /dev/shm）。\n') +
    '  若确属受限环境，可设 ALLOW_SKIP_BROWSER_TEST=1 显式放行（不建议用于生产部署）。'
  );
}

export async function runFrontendBrowserTest() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('  ! playwright 未安装，跳过无头浏览器测试（CI 建议安装以覆盖真实浏览器解析）。');
    console.log('    安装：npm install --save-dev playwright && npx playwright install chromium');
    return { ok: true, skipped: true, checks: 0, failures: 0 };
  }

  const uiPath = join(ROOT, 'src', 'ui.gen.js');
  if (!existsSync(uiPath)) {
    console.log('  ! 缺少 src/ui.gen.js（build 内联产物），跳过无头浏览器测试。请先 npm run build。');
    return { ok: true, skipped: true, checks: 0, failures: 0 };
  }

  console.log('▸ Playwright 无头浏览器测试（真实解析内联产物 + 登录→后台）...');

  const uiMod = await import(pathToFileURL(uiPath).href);
  let html = typeof uiMod.UI_HTML === 'string' ? uiMod.UI_HTML : '';
  if (!html) {
    assert(false, 'src/ui.gen.js 未导出 UI_HTML');
    return { ok: false, checks: _checks, failures: _failures };
  }
  // buildInlineUI 对 </script> 做了边界转义（<\/script>），加载前还原
  html = html.replace(/<\\\/script/g, '</script');

  // ── 启动浏览器：多阶段自愈 ──
  // 失败原因分两类，需分别处理，不能一概而论：
  //   A. 浏览器二进制缺失      → playwright install chromium
  //   B. 系统共享库缺失(libglib)→ playwright install-deps chromium / apt-get
  // 精简镜像（CNB debian:13-all）上 B 极常见，旧实现只处理 A，于是「下载 300MB
  // 后照样启动失败」。这里按需逐层修复并重试，让 CI 自己具备跑浏览器的能力，
  // 而不是跳过测试（跳过 = 带病部署）。
  const browser = await launchWithSelfHeal(chromium);
  if (browser && browser.__skipped) return { ok: true, skipped: true, checks: 0, failures: 0 };
  const page = await browser.newPage({ baseURL: 'https://e2e.test' });

  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // 将 API 桩脚本注入到 <head> 最前（在所有页面脚本之前运行，拦截 window.API
  // 赋值，使无后端也能验证渲染链路）。addInitScript 在 setContent 路径下不一定
  // 注入，故直接内联进 HTML 最可靠。
  if (html.includes('<head')) {
    html = html.replace('<head', '<head>' + apiStubScript());
  } else {
    html = apiStubScript() + html;
  }

  // 用 setContent 直接渲染内联 HTML（含内联 <script> 由真实引擎执行）
  await page.setContent(html, { waitUntil: 'load' });

  // 1) 注入脚本无语法错误（pageerror 捕获语法/运行时崩溃）
  assert(pageErrors.length === 0, '内联脚本在真实浏览器中无 pageerror（语法/崩溃）', pageErrors.slice(0, 3).join(' | '));

  // 2) API 门面已挂载（e2e 注入的 stub，供无后端环境验证渲染链路）
  const apiOk = await page.evaluate(() => {
    const A = window.API;
    return !!(A && A.auth && typeof A.auth.login === 'function');
  });
  assert(apiOk, 'window.API 门面在真实浏览器中完整挂载');

  // 3) 登录 → 进后台：点击登录按钮（API 桩使 login() 直接成功，触发 enterApp 渲染）
  const loginBtn = await page.$('#login-btn');
  assert(!!loginBtn, '#login-btn 存在');
  if (loginBtn) {
    await loginBtn.click();
    // 等待 enterApp 异步渲染
    await page.waitForTimeout(500);
  }

  const entered = await page.evaluate(() => {
    const viewApp = document.getElementById('view-app');
    const content = document.getElementById('content');
    return {
      appVisible: !!viewApp && viewApp.hidden === false,
      contentChildren: content ? content.childElementCount : -1,
    };
  });
  assert(entered.appVisible, '点击登录后 #view-app 可见（真实浏览器）');
  assert(entered.contentChildren > 0, '后台视图已渲染进 #content（真实浏览器）', `子节点=${entered.contentChildren}`);

  // 4) 全程无 console.error
  assert(consoleErrors.length === 0, '登录→后台全程无 console.error', consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  return { ok: _failures === 0, checks: _checks, failures: _failures };
}

async function main() {
  try {
    const res = await runFrontendBrowserTest();
    if (res.skipped) {
      console.log('⚠ 无头浏览器测试已跳过（playwright 未安装或产物缺失），不影响 build。');
      return;
    }
    console.log(`\n无头浏览器测试完成：共 ${res.checks} 项断言，失败 ${res.failures} 项`);
    if (!res.ok) {
      console.error('\n✗ 无头浏览器测试未通过：真实浏览器解析产物存在语法/运行时问题。');
      process.exit(1);
    }
    console.log('✓ 无头浏览器（真实解析）登录 → 进后台 通过');
  } catch (e) {
    console.error('\n✗ 无头浏览器测试执行异常:', e && (e.stack || e.message));
    process.exit(1);
  }
}

const isCli = (() => {
  try {
    return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isCli) main();
