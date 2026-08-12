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

  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    // 包已安装但浏览器二进制缺失：自动安装 chromium，确保这道真实浏览器护栏
    // 真正执行（而不是静默跳过导致回归漏检）。仅在安装失败时才优雅跳过。
    console.log('  ! Playwright 浏览器二进制未就绪，尝试自动安装 chromium...');
    const installRes = spawnSync('npx', ['playwright', 'install', 'chromium'], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    if (installRes.status !== 0) {
      // 自动安装失败：playwright 已是 devDependency + postinstall 会预装浏览器，
      // 正常环境不应走到这里。默认硬失败（由 build 收口阻断部署），仅当显式
      // ALLOW_SKIP_BROWSER_TEST=1 时才跳过，作为受限环境的显式逃生舱。
      if (process.env.ALLOW_SKIP_BROWSER_TEST) {
        console.log('  ! 自动安装 chromium 失败，已按 ALLOW_SKIP_BROWSER_TEST=1 跳过（不阻断 build）。');
        console.log('    手动安装：npx playwright install chromium');
        return { ok: true, skipped: true, checks: 0, failures: 0 };
      }
      throw new Error(
        'Playwright chromium 自动安装失败（退出码 ' + installRes.status + '）。\n' +
        '  postinstall 本应已预装浏览器二进制；请检查网络/平台依赖，或手动执行 `npx playwright install chromium`。\n' +
        '  若确属受限环境，可设 ALLOW_SKIP_BROWSER_TEST=1 显式放行（不建议用于生产部署）。'
      );
    }
    // 安装成功，重试启动
    try {
      browser = await chromium.launch();
    } catch (e) {
      if (process.env.ALLOW_SKIP_BROWSER_TEST) {
        console.log('  ! 浏览器二进制已安装但启动失败，已按 ALLOW_SKIP_BROWSER_TEST=1 跳过（不阻断 build）。');
        console.log('    错误：' + (e && (e.message || String(e))));
        return { ok: true, skipped: true, checks: 0, failures: 0 };
      }
      throw new Error(
        'Playwright chromium 已安装但启动失败：' + (e && (e.message || String(e))) + '\n' +
        '  可能是缺少系统共享库，请执行 `npx playwright install-deps chromium` 后重试。'
      );
    }
  }
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
