#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/test-frontend-dom.mjs —— 前端整链「真实 DOM」快跑测试（jsdom）
 * ----------------------------------------------------------------------------
 * 目的：拦截「build 成功但登录后进不去后台、控制台报语法定位错误」这类问题。
 * 现有 scripts/e2e-test.mjs 的 Node 沙箱用极简 DOM 桩，只能验证 window.API
 * 挂载 + 不抛 SyntaxError；本脚本进一步用 jsdom 提供【真实 DOM 实现】，把前端
 * 源码经 esbuild 打包成 IIFE 后真正执行，模拟「登录 → enterApp → 渲染后台」，
 * 断言：
 *   - 注入脚本无语法错误、未触发 window.onerror
 *   - window.API 各门面挂载完整
 *   - 登录流程可触发 enterApp()，#view-app 由 hidden 变为可见
 *   - 概览视图渲染到 #content，关键节点（如站点卡片/统计卡）存在
 *   - 全程无 console.error（捕获构建内联/转义/标签丢失导致的运行时报错）
 *
 * 零二进制依赖思路：jsdom 为纯 JS，本地秒级；与 build.mjs 解耦，可单独快跑。
 * jsdom 为项目 devDependency，缺失视为依赖安装损坏，由 build.mjs 的 runGuard
 * 收口为构建失败（硬失败，绝不静默跳过带病部署）。
 *
 * 用法：
 *   node scripts/test-frontend-dom.mjs
 * ============================================================================
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'web');

let _checks = 0;
let _failures = 0;
function assert(cond, label, detail) {
  _checks++;
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    _failures++;
    console.log(`  ✗ ${label}${detail ? ' —— ' + detail : ''}`);
  }
}

/**
 * 用 esbuild 把 web/app.js（含 import dom.js / _stage.gen.js）打包成单文件 IIFE，
 * 解析所有 ESM import，等价于 build 产物的「语法健全 + 模块解析」校验。
 * @returns {Promise<string>} 打包后的 JS 源码
 */
async function bundleFrontend() {
  const stageGen = join(WEB, '_stage.gen.js');
  if (!existsSync(stageGen)) {
    throw new Error(
      '缺少 web/_stage.gen.js（由 build.mjs 步骤 0 生成）。\n请先运行 `npm run build` 或 `npm run gen` 生成后再跑前端 DOM 测试。'
    );
  }
  const result = await esbuild.build({
    entryPoints: [join(WEB, 'app.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    write: false,
    logLevel: 'silent',
    // dom.js / api.js 走相对 import，esbuild 自动解析；_stage.gen.js 同理。
  });
  return result.outputFiles[0].text;
}

/**
 * 读取 web/index.html 作为测试用 DOM 骨架（app.js 依赖其中预置根节点）。
 * @returns {Promise<string>}
 */
async function readHtml() {
  const p = join(WEB, 'index.html');
  if (!existsSync(p)) throw new Error('缺少 web/index.html');
  const { readFile } = await import('node:fs/promises');
  return readFile(p, 'utf8');
}

/**
 * 构造一个贴近真实后端的 API 门面 stub，让 app.js 的登录→后台链路可正常 settle。
 * 数据与真实后端字段对齐（见 web/api.js 契约）。
 */
function makeApiStub() {
  const ok = (data) => ({ ok: true, data });
  return {
    auth: {
      me: async () => ({ authed: false }),
      login: async () => ok({}),
      logout: async () => ok({}),
    },
    system: {
      info: async () =>
        ok({
          platform: 'cf',
          version: '1.0.0',
          caps: { hasEdgeCache: true, hasSocket: false, hasD1: false },
          limitations: [],
        }),
    },
    sites: {
      list: async () => ok({ sites: [{ host: 'example.com', type: 'website', tls: 'auto', enabled: true }] }),
      templates: async () => ok({ templates: [{ id: 'website', name: '通用网站' }] }),
    },
    pools: {
      list: async () => ok({ pools: [{ id: 'p1', name: '默认源站池', kind: 'http', origins: [{ addr: '1.2.3.4', weight: 1 }] }] }),
    },
    cache: {
      get: async () => ok({ ttl: 3600, staleWhileRevalidate: 86400 }),
    },
    stats: {
      overview: async () => ok({ requests: 100, hits: 80, bytes: 1024000 }),
    },
    config: {
      get: async () => ok({}),
    },
    rules: {
      list: async () => ok({ rules: [] }),
    },
    kv: {
      list: async () => ok({ keys: [] }),
    },
  };
}

/**
 * 主测试：jsdom 真实 DOM 执行前端打包产物，跑通登录→后台。
 */
export async function runFrontendDomTest() {
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    // jsdom 是 devDependency，正常安装环境必定可用；缺失说明依赖安装损坏，
    // 必须硬失败（由 build.mjs 的 runGuard 收口为构建失败），绝不静默跳过带病部署。
    throw new Error('jsdom 未安装或无法加载。jsdom 为项目 devDependency，请先执行 `npm install` 安装后再构建。');
  }

  console.log('▸ jsdom 前端整链测试（登录 → 进后台）...');

  const code = await bundleFrontend();

  // 加载真实 web/index.html 的 DOM 结构（app.js 依赖其中预置的根节点：
  // #view-app / #content / #content 等；bindStatic 只绑定事件，不创建节点）。
  // 移除开发用 <script src=...>，替换为打包后的 code，使测试形态与 build 产物一致。
  const htmlRaw = await readHtml();
  const html = htmlRaw
    .replace(/<script[^>]*src=[^>]*><\/script>/gi, '')
    .replace('<!-- BUILD:SCRIPT -->', `<script>${code}</script>`);

  // 用 runScripts:'dangerously' + 注入 <script> 的方式，让 jsdom 完整模拟浏览器
  // 生命周期：脚本执行时 readyState 进入 'interactive'，随后 jsdom 自动派发
  // DOMContentLoaded，app.js 的 boot() 与真实浏览器完全一致的路径执行
  // （bindStatic → ensureAuth → showLogin/enterApp）。无需手动 dispatch，也避免
  // outside-only 下 readyState 卡在 'loading' 导致 boot 不执行、白屏却测试通过的假阴性。
  // 用 beforeParse 钩子在脚本执行前注入 window.API / __BASE__ / __PLATFORM__。
  const errors = [];
  const origConsoleError = console.error;

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://e2e.test/__panel',
    beforeParse(window) {
      window.__BASE__ = '/__panel';
      window.__PLATFORM__ = 'cf';
      window.API = makeApiStub();
      window.addEventListener('error', (e) => errors.push(e.error || e.message));
      const origErr = window.console.error;
      window.console.error = (...args) => {
        errors.push('[console.error] ' + args.map(String).join(' '));
        origErr.apply(window.console, args);
      };
    },
  });
  const { window } = dom;

  // 等待 jsdom 完成 DOMContentLoaded + 启动异步（ensureAuth 等）settle
  await new Promise((r) => {
    if (window.document.readyState === 'complete') return r();
    window.addEventListener('DOMContentLoaded', r);
    window.addEventListener('load', r);
    setTimeout(r, 800); // 兜底，避免极端情况下永不 resolve
  });
  await new Promise((r) => setTimeout(r, 200));

  // 1) API 门面完整挂载
  assert(!!window.API, 'window.API 已挂载');
  assert(typeof window.API?.auth?.login === 'function', 'API.auth.login 为函数');
  assert(typeof window.API?.sites?.list === 'function', 'API.sites.list 为函数');
  assert(typeof window.API?.pools?.list === 'function', 'API.pools.list 为函数');
  assert(typeof window.API?.cache?.get === 'function', 'API.cache.get 为函数');

  // 2) 登录流程拉起后台：模拟提交登录表单 → enterApp()
  //    app.js 在 boot 时绑定 #login-form 的 submit；我们直接派发 submit 事件。
  const doc = window.document;
  const loginForm = doc.getElementById('login-form');
  const pwd = doc.getElementById('login-pwd');
  const viewApp = doc.getElementById('view-app');
  const content = doc.getElementById('content');

  assert(!!loginForm, '#login-form 存在于 DOM');
  assert(!!pwd, '#login-pwd 存在于 DOM');
  assert(!!viewApp, '#view-app 存在于 DOM');
  assert(!!content, '#content 挂载点存在');

  // 登录前：后台应隐藏
  assert(viewApp.hidden === true || viewApp.hasAttribute('hidden'), '登录前 #view-app 隐藏');

  // 派发登录提交事件（app.js 的 submit 处理器会调用 doLogin → enterApp）
  if (loginForm) {
    // 同步触发（不等待异步网络）：submit 处理器内部 await API.auth.login，
    // enterApp 在 login 完成后执行；此处 we 等待一个微任务+宏任务周期。
    try {
      loginForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    } catch (e) {
      errors.push('dispatch submit 抛错: ' + (e && e.message));
    }
  }

  // 等待 enterApp 的异步渲染（loadAll + route）完成
  await new Promise((r) => setTimeout(r, 300));

  // 3) 登录后后台可见且已渲染
  assert(viewApp.hidden === false, '登录后 #view-app 变为可见', `hidden=${viewApp.hidden}`);
  assert(content && content.childElementCount > 0, '概览视图已渲染进 #content', `子节点数=${content ? content.childElementCount : -1}`);

  // 4) 全程无运行时错误（核心：拦截语法/标签丢失/转义崩溃）
  assert(errors.length === 0, '登录→后台全程无 console.error / 运行时报错', errors.slice(0, 5).join(' | '));

  console.error = origConsoleError;
  return { ok: _failures === 0, checks: _checks, failures: _failures };
}

let JSDOM; // 动态 import 后赋值

async function main() {
  try {
    const res = await runFrontendDomTest();
    if (res.skipped) {
      console.log('⚠ 前端 DOM 测试已跳过（jsdom 未安装），不影响 build。');
      return;
    }
    console.log(`\njsdom 前端测试完成：共 ${res.checks} 项断言，失败 ${res.failures} 项`);
    if (!res.ok) {
      console.error('\n✗ 前端 DOM 测试未通过：登录后无法进入后台或存在运行时报错，请检查 web/app.js 与 web/dom.js。');
      process.exit(1);
    }
    console.log('✓ 前端整链（jsdom 真实 DOM）登录 → 进后台 通过');
  } catch (e) {
    console.error('\n✗ 前端 DOM 测试执行异常:', e && (e.stack || e.message));
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
