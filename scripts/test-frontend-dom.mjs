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
 *   - 遍历全部导航视图（概览/站点/流量序列/源站/缓存/系统），各视图渲染完整且无报错
 *   - 流量序列「改写响应头」「修改请求头」受限抽屉 → 点击「+ 添加规则」→
 *     规则卡片渲染进抽屉且无运行时报错（回归 buildRuleCard 的 ensureExpanded TDZ）
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

/** 等待宏任务 settle（路由渲染 / 抽屉异步数据） */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
 * 单独打包 rule-editor/shared.js 以便单测其转换函数（globalStageToAction /
 * actionToGlobalStage）。shared.js 依赖 sequence.js / global.js / card.js 三个
 * 含 DOM 逻辑的模块，这里用 esbuild 插件把它们替换为桩，只保留 shared.js 自身逻辑。
 * @returns {Promise<{globalStageToAction: Function, actionToGlobalStage: Function}>}
 */
async function loadSharedConversion() {
  const stubPlugin = {
    name: 'stub-dom-deps',
    setup(build) {
      const stubs = new Set([
        resolve(WEB, 'app/views/sequence.js'),
        resolve(WEB, 'app/rule-editor/global.js'),
        resolve(WEB, 'app/rule-editor/card.js'),
      ]);
      build.onResolve({ filter: /.*/ }, (args) => {
        if (stubs.has(resolve(args.resolveDir, args.path))) {
          return { path: args.path, namespace: 'stub' };
        }
      });
      build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
        const name = args.path.split('/').pop();
        if (name === 'sequence.js') return { contents: 'export const renderTrafficSequence = () => {};', loader: 'js' };
        if (name === 'global.js') return { contents: 'export const openGlobalRulesDrawer = () => {};', loader: 'js' };
        if (name === 'card.js') return { contents: 'export const buildRuleCard = {};', loader: 'js' };
        return { contents: 'export default {};', loader: 'js' };
      });
    },
  };
  const result = await esbuild.build({
    entryPoints: [join(WEB, 'app/rule-editor/shared.js')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'es2020',
    write: false,
    logLevel: 'silent',
    plugins: [stubPlugin],
  });
  const code = result.outputFiles[0].text;
  const moduleObj = { exports: {} };
  const fn = new Function('module', 'exports', 'require', code);
  // 桩 require：避免任何残留外部依赖解析失败
  const req = () => ({});
  fn(moduleObj, moduleObj.exports, req);
  return moduleObj.exports;
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
 * 构造一个贴近真实后端的 API 门面 stub，让 app.js 的登录→后台→各视图渲染链路
 * 可正常 settle。数据与真实后端字段对齐（见 web/api.js 契约）。
 * 覆盖：auth / system / sites / pools / cache / stats / config / rules / kv。
 */
function makeApiStub() {
  // 与真实后端契约对齐：web/api.js 的 request() 成功时直接返回 payload.data（解包后）。
  // 因此 list 返回 { sites: [...] } / { pools: [...] }，get 返回对象本身，
  // stats.overview 返回 { enabled, requests, ... }，auth.login 返回 data 等。
  const SITE = {
    host: 'example.com',
    type: 'website',
    tls: 'auto',
    enabled: true,
    poolId: 'p1',
    rules: [],
    security: {},
    cacheGen: 0,
    ipv6Support: false,
    basics: { pathPrefix: '', clientIpHeader: 'X-Forwarded-For', followRedirect: false },
  };
  const POOL = {
    id: 'p1',
    name: '默认源站池',
    kind: 'http',
    strategy: 'roundrobin',
    origins: [{ id: 'o1', addr: '1.2.3.4', weight: 1 }],
  };
  return {
    auth: {
      me: async () => ({ authed: false }),
      login: async () => ({}),
      logout: async () => ({}),
      changePassword: async () => ({}),
    },
    system: {
      info: async () => ({
        platform: 'cf',
        version: '1.0.0',
        caps: { hasEdgeCache: true, hasSocket: false, hasD1: false },
        limitations: [],
      }),
      export: async () => ({}),
      import: async () => ({}),
    },
    sites: {
      list: async () => ({ sites: [SITE] }),
      get: (() => {
        const fn = async (host) => {
          fn.__calls++;
          fn.__lastHost = host;
          return { ...SITE, host };
        };
        fn.__calls = 0;
        fn.__lastHost = null;
        return fn;
      })(),
      saveRules: async () => ({}),
      save: async () => ({}),
      saveBasics: async () => ({}),
      saveSecurity: async () => ({}),
      create: async () => ({}),
      update: async () => ({}),
      remove: async () => ({}),
      templates: async () => ({ templates: [{ id: 'website', name: '通用网站' }] }),
    },
    pools: {
      list: async () => ({ pools: [POOL] }),
      get: async () => ({ ...POOL }),
      save: async () => ({}),
      create: async () => ({}),
      remove: async () => ({}),
    },
    cache: {
      purge: async () => ({}),
    },
    stats: {
      overview: async () => ({
        enabled: true,
        requests: 100,
        hits: 80,
        bytes: 1024000,
        hitRate: 0.8,
        topHosts: [{ host: 'example.com', requests: 100, bytes: 1024000, hitRate: 0.8 }],
      }),
      host: async () => ({ requests: 100, hits: 80, bytes: 1024000, hitRate: 0.8 }),
    },
    config: {
      get: async () => ({}),
      save: async () => ({}),
    },
    rules: {
      global: (() => {
        const fn = async () => {
          fn.__calls++;
          return { stages: {} };
        };
        fn.__calls = 0;
        return fn;
      })(),
      saveGlobal: async () => ({}),
    },
    kv: {
      ping: async () => ({}),
      list: async () => ({ keys: [] }),
      get: async () => ({}),
      put: async () => ({}),
      del: async () => ({}),
    },
  };
}

/**
 * 主测试：jsdom 真实 DOM 执行前端打包产物，跑通登录→后台→全视图→规则抽屉。
 */
export async function runFrontendDomTest() {
  try {
    ({ JSDOM } = await import('jsdom'));
  } catch {
    // jsdom 是 devDependency，正常安装环境必定可用；缺失说明依赖安装损坏，
    // 必须硬失败（由 build.mjs 的 runGuard 收口为构建失败），绝不静默跳过带病部署。
    throw new Error('jsdom 未安装或无法加载。jsdom 为项目 devDependency，请先执行 `npm install` 安装后再构建。');
  }

  console.log('▸ jsdom 前端整链测试（登录 → 进后台 → 全视图 → 规则抽屉）...');

  const code = await bundleFrontend();

  // 加载真实 web/index.html 的 DOM 结构（app.js 依赖其中预置的根节点：
  // #view-app / #content 等；bindStatic 只绑定事件，不创建节点）。
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
      // 开启前端内部测试钩子（web/app.js 仅在 __ENABLE_TEST_HOOK__=true 时挂载 window.__TEST__），
      // 供用例 D 直接断言 OP_BUILDERS.read() 的返回结构（规则保存汇总回归）。
      window.__ENABLE_TEST_HOOK__ = true;
      window.API = makeApiStub();
      // jsdom 未实现 scrollIntoView（浏览器原生支持）；打桩避免 app.js 在
      // mountOp 挂载操作卡后调用 scrollIntoView 时抛 TypeError 造成假失败。
      if (!window.HTMLElement.prototype.scrollIntoView) {
        window.HTMLElement.prototype.scrollIntoView = () => {};
      }
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
    // 兜底，避免极端情况下永不 resolve
    setTimeout(r, 800);
  });
  await sleep(200);

  // 1) API 门面完整挂载
  assert(!!window.API, 'window.API 已挂载');
  assert(typeof window.API?.auth?.login === 'function', 'API.auth.login 为函数');
  assert(typeof window.API?.sites?.list === 'function', 'API.sites.list 为函数');
  assert(typeof window.API?.pools?.list === 'function', 'API.pools.list 为函数');
  assert(typeof window.API?.cache?.purge === 'function', 'API.cache.purge 为函数');

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
    // enterApp 在 login 完成后执行；此处等待一个微任务+宏任务周期。
    try {
      loginForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    } catch (e) {
      errors.push('dispatch submit 抛错: ' + (e && e.message));
    }
  }

  // 等待 enterApp 的异步渲染（loadAll + route）完成
  await sleep(300);

  // 3) 登录后后台可见且已渲染
  assert(viewApp.hidden === false, '登录后 #view-app 变为可见', `hidden=${viewApp.hidden}`);
  assert(content && content.childElementCount > 0, '概览视图已渲染进 #content', `子节点数=${content ? content.childElementCount : -1}`);

  // 4) 全程无运行时错误（核心：拦截语法/标签丢失/转义崩溃）
  assert(errors.length === 0, '登录→后台全程无 console.error / 运行时报错', errors.slice(0, 5).map(String).join(' | '));

  // ── 用例 A：遍历全部导航视图，各视图渲染完整且无新增报错 ─────────────
  console.log('▸ 用例 A：遍历全部导航视图');
  {
    /** 跳转路由并等待异步渲染 settle（app.js 监听 hashchange → route(location.hash)） */
    async function navTo(hash) {
      window.location.hash = hash;
      window.dispatchEvent(new window.HashChangeEvent('hashchange'));
      await sleep(250);
    }

    // 各视图的「标题 + 标志节点」：标题由 #page-title 驱动，标志节点证明该视图内容真正渲染
    const NAV_VIEWS = [
      ['#/overview', '概览', '.cards'],
      ['#/sites', '站点管理', '.section-head'],
      ['#/sequence', '流量序列', '.seq-page'],
      ['#/pools', '源站', '.pool-card, .section-head'],
      ['#/cache', '缓存管理', 'table'],
      ['#/system', '系统设置', '.section-head'],
    ];
    for (const [hash, title, markerSel] of NAV_VIEWS) {
      const errBase = errors.length;
      await navTo(hash);
      const titleEl = doc.getElementById('page-title');
      const titleOk = titleEl && titleEl.textContent.includes(title);
      const contentOk = content.childElementCount > 0;
      const markerOk = !markerSel || !!doc.querySelector(markerSel);
      const noErr = errors.length === errBase;
      assert(
        titleOk && contentOk && markerOk,
        `视图 ${hash}（${title}）渲染完整`,
        `标题=${titleEl ? titleEl.textContent : '(无)'} 子节点=${content.childElementCount} 标志=${!!doc.querySelector(markerSel)}`
      );
      assert(noErr, `视图 ${hash} 渲染无新增报错`, errors.slice(errBase).map(String).join(' | '));
    }
  }

  // ── 用例 B/C：流量序列「改写响应头/修改请求头」抽屉 → 新建规则（TDZ 回归）──
  // 触发链：新建规则默认 action 的 reqHeaders/respHeaders 均为 truthy →
  // activeOpKeys 返回非空 → buildRuleCard 初始挂载同步执行 mountOp →
  // 修复前 1761 行调用 const ensureExpanded（声明于 1814 行）→ TDZ 崩溃 →
  // makeCard 中断、卡片不渲染。用例在修复前应红，修复后应绿。
  console.log('▸ 用例 B/C：受限抽屉「+ 添加规则」回归');
  {
    async function navTo(hash) {
      window.location.hash = hash;
      window.dispatchEvent(new window.HashChangeEvent('hashchange'));
      await sleep(250);
    }

    /** 打开指定标题的受限抽屉，并执行「+ 添加规则」，返回断言上下文 */
    async function openDrawerAndAddRule(stageKeyword, drawerTitleKeyword) {
      await navTo('#/sequence');
      const titleSpan = [...doc.querySelectorAll('.seq-title span')].find((s) => s.textContent.includes(stageKeyword));
      assert(!!titleSpan, `序列页渲染出「${stageKeyword}」阶段卡片`, '站点序列未渲染或被清空');
      if (!titleSpan) return null;

      const errBase = errors.length;
      // openRulesDrawer(host, opts) 异步
      titleSpan.closest('.seq-stage').click();
      await sleep(300);

      const drawer = doc.getElementById('drawer');
      const drawerBody = doc.getElementById('drawer-body');
      const drawerOpen = drawer && drawer.hidden === false;
      const titleOk = drawerBody && drawerBody.textContent.includes(drawerTitleKeyword);
      assert(drawerOpen && titleOk, `「${drawerTitleKeyword}」抽屉已打开`, `hidden=${drawer && drawer.hidden} 标题含=${!!titleOk}`);
      if (!drawerOpen || !drawerBody) return null;

      const addBtn = [...drawerBody.querySelectorAll('button')].find((b) => b.textContent.includes('+ 添加规则'));
      assert(!!addBtn, '抽屉内存在「+ 添加规则」按钮');
      if (!addBtn) return null;

      // 点击 → makeCard(null) → buildRuleCard：修复前 ensureExpanded TDZ 崩溃（errors 增加、卡片不渲染）
      const clickErrBase = errors.length;
      try {
        addBtn.click();
      } catch (e) {
        errors.push('点击「+ 添加规则」抛错: ' + (e && e.message));
      }
      await sleep(80);

      const ruleCard = drawerBody.querySelector('.rules-box .rule-card');
      assert(!!ruleCard, `「+ 添加规则」后新建规则卡片渲染进抽屉`, '修复前 ensureExpanded TDZ 崩溃：卡片未渲染');
      assert(errors.length === clickErrBase, '新建规则过程无新增运行时报错', errors.slice(clickErrBase).map(String).join(' | '));
      return { drawer, drawerBody, errBase };
    }

    // 用例 B：「改写响应头」（respHeaders）—— 本次 bug 的复现路径
    let ctx = await openDrawerAndAddRule('改写响应头', '改写响应头');
    // 关闭抽屉，准备用例 C
    if (ctx) {
      doc.getElementById('drawer-close').click();
      await sleep(60);
      assert(doc.getElementById('drawer').hidden === true, '「改写响应头」抽屉已关闭');
    }

    // 用例 C：「修改请求头」（reqHeaders）—— 同为 truthy 触发点
    ctx = await openDrawerAndAddRule('修改请求头', '修改请求头');
    if (ctx) {
      doc.getElementById('drawer-close').click();
      await sleep(60);
      assert(doc.getElementById('drawer').hidden === true, '「修改请求头」抽屉已关闭');
    }
  }

  // ── 用例 T5：全站兜底非规则型阶段卡片点击不触发 sites.get('__global__') ──
  // 复现 bug：原 web/app.js:501 把 __global__ 当站点 host 跳转
  // → openRulesDrawer('__global__') → API.sites.get('__global__') → 后端 404。
  // 修复后：非规则型阶段卡片改为直接 openGlobalRulesDrawer(no)，内部调
  // API.rules.global()，绝不触发 sites.get。
  console.log('▸ 用例 T5：全站兜底非规则型阶段卡片不触发 sites.get(__global__)');
  {
    // 记录点击前 sites.get / rules.global 调用计数
    const sitesGet = window.API.sites.get;
    const rulesGlobal = window.API.rules.global;
    const beforeSites = sitesGet.__calls || 0;
    const beforeRules = rulesGlobal.__calls || 0;

    // 进入流量序列视图
    window.location.hash = '#/sequence';
    window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    await sleep(250);

    // 切到「全站通用规则」视图（host === '__global__' → renderGlobal）：
    // 全站兜底编辑器在此视图内，卡片 onClick 走 openGlobalRulesDrawer（修复目标）。
    // （站点序列视图里的「回落全站兜底」卡片是规则型阶段、走 openRulesDrawer(host)，
    //   属合法路径，会调用 sites.get(真实host)，不应在此用例断言。）
    const hostSel = doc.querySelector('select');
    assert(!!hostSel, '流量序列视图存在 host 选择器');
    if (hostSel) {
      hostSel.value = '__global__';
      hostSel.dispatchEvent(new window.Event('change'));
      await sleep(250);
    }

    // 找到全站兜底阶段卡片（标题含「全站」或标注「内置默认(无动作)」，
    // 且 onClick 走 openGlobalRulesDrawer 而非站点抽屉）
    const globalStageCards = [...doc.querySelectorAll('.seq-stage')].filter((el) => {
      const txt = el.textContent || '';
      return /全站|内置默认|无动作/.test(txt);
    });
    assert(globalStageCards.length > 0, '流量序列中存在全站兜底阶段卡片', `命中数=${globalStageCards.length}`);

    let triggeredDrawer = false;
    for (const card of globalStageCards) {
      const errBase = errors.length;
      const callsBefore = sitesGet.__calls || 0;
      try {
        card.click();
      } catch (e) {
        errors.push('点击全站兜底卡片抛错: ' + (e && e.message));
      }
      await sleep(250);
      const callsAfter = sitesGet.__calls || 0;
      assert(callsAfter === callsBefore,
        `点击全站兜底卡片「${card.textContent.slice(0, 12).trim()}」未触发 sites.get`,
        `点击后 sites.get 调用 +${callsAfter - callsBefore}`);
      assert(errors.length === errBase, '点击全站兜底卡片无运行时报错',
        errors.slice(errBase).map(String).join(' | '));
      // 任一卡片成功打开全站规则抽屉即可标记
      const drawer = doc.getElementById('drawer');
      if (drawer && drawer.hidden === false) {
        triggeredDrawer = true;
        doc.getElementById('drawer-close')?.click();
        await sleep(60);
      }
    }

    // 总体断言：整个点击过程未新增任何 sites.get 调用（杜绝 __global__ 404）
    const totalSites = (sitesGet.__calls || 0) - beforeSites;
    assert(totalSites === 0,
      'T5 实际：全站兜底卡片点击全程未触发 sites.get（期望 0）', `实际新增 ${totalSites} 次`);
    // 且至少一次触发了 openGlobalRulesDrawer → API.rules.global()
    const totalRules = (rulesGlobal.__calls || 0) - beforeRules;
    assert(totalRules > 0 || triggeredDrawer,
      'T5 实际：全站规则抽屉被打开（等价于调 API.rules.global）', `rules.global 调用 +${totalRules}`);
  }

  // ── 用例 B'/C'：受限模式「添加操作」下拉已移除、操作卡片初始即内联 ────────
  // 复现诉求：受限模式（最小任务包）各阶段只渲染白名单内的固定操作，此前仍渲染
  // 一个「添加操作」下拉，但多数阶段只有 1 个可选项 → 等于定死了还要点一下。
  // 修复后：受限模式进入抽屉新建规则即内联列出 allowedOps 全部卡片，不再有
  // .op-add 下拉；不限模式（完整规则编辑器）保留下拉不动。
  console.log('▸ 用例 B\'/C\'：受限模式移除「添加操作」下拉、初始内联操作卡片');
  {
    async function navTo(hash) {
      window.location.hash = hash;
      window.dispatchEvent(new window.HashChangeEvent('hashchange'));
      await sleep(250);
    }
    async function openDrawerAndAddRule(stageKeyword, drawerTitleKeyword) {
      await navTo('#/sequence');
      const titleSpan = [...doc.querySelectorAll('.seq-title span')].find((s) => s.textContent.includes(stageKeyword));
      if (!titleSpan) { assert(false, `序列页渲染出「${stageKeyword}」阶段卡片`); return null; }
      titleSpan.closest('.seq-stage').click();
      await sleep(300);
      const drawerBody = doc.getElementById('drawer-body');
      const addBtn = [...drawerBody.querySelectorAll('button')].find((b) => b.textContent.includes('+ 添加规则'));
      if (!addBtn) { assert(false, '抽屉内存在「+ 添加规则」按钮'); return null; }
      try { addBtn.click(); } catch (e) { errors.push('点击「+ 添加规则」抛错: ' + (e && e.message)); }
      await sleep(80);
      const ruleCard = drawerBody.querySelector('.rules-box .rule-card');
      if (!ruleCard) { assert(false, '新建规则卡片渲染进抽屉'); return null; }
      return ruleCard;
    }

    // 用例 B'：改写响应头（respHeaders，受限模式白名单仅 1 项）
    let ruleCard = await openDrawerAndAddRule('改写响应头', '改写响应头');
    if (ruleCard) {
      const hasDropdown = !!ruleCard.querySelector('.op-add');
      assert(!hasDropdown, '受限模式规则卡片无「添加操作」下拉(.op-add)', '仍存在多余下拉');
      const opCards = ruleCard.querySelectorAll('.ops-list > .subcard');
      assert(opCards.length >= 1, '受限模式规则卡片初始即内联操作卡片', `内联卡片数=${opCards.length}`);
      doc.getElementById('drawer-close').click();
      await sleep(60);
    }

    // 用例 C'：修改请求头（reqHeaders，同受限单选项）
    ruleCard = await openDrawerAndAddRule('修改请求头', '修改请求头');
    if (ruleCard) {
      assert(!ruleCard.querySelector('.op-add'), '受限模式(reqHeaders)规则卡片无「添加操作」下拉(.op-add)');
      assert(ruleCard.querySelectorAll('.ops-list > .subcard').length >= 1, '受限模式(reqHeaders)规则卡片初始即内联操作卡片');
      doc.getElementById('drawer-close').click();
      await sleep(60);
    }

    // 用例 E：动态变量提示条（.var-hint）在支持 ${var} 的字段旁渲染
    // 复现风险：计划 overview 点名 HeaderOps.set / rewrite.regexTo / redirect.target /
    // hostHeader.custom 均需支持 ${var}，若前端漏挂 varHintBar() 则用户无从知晓可用变量。
    console.log('▸ 用例 E：动态变量提示条渲染（计划点名的变量字段）');
    {
      ruleCard = await openDrawerAndAddRule('改写响应头', '改写响应头');
      if (ruleCard) {
        const hv = ruleCard.querySelector('.hv');
        assert(!!hv, '头值输入框(.hv)存在');
        const hasVarHint = !!ruleCard.querySelector('.var-hint');
        assert(hasVarHint, '头值字段旁渲染动态变量提示条(.var-hint)', 'HeaderOps.set 须在 value 框下挂 varHintBar()');
        doc.getElementById('drawer-close')?.click();
        await sleep(40);
      } else {
        assert(false, '改写响应头规则卡片已打开以校验变量提示');
      }
    }

    // 用例 C''：源站抽屉已移除 pathPrefix 编辑框（⑨ URL 重写可替代）
    console.log('▸ 用例 C\'\'：源站编辑器 pathPrefix 编辑框已移除');
    {
      await navTo('#/pools');
      const editBtn = [...doc.querySelectorAll('#content button')].find((b) => b.textContent.trim() === '编辑');
      if (editBtn) {
        editBtn.click();
        await sleep(120);
        const dBody = doc.getElementById('drawer-body');
        assert(!!dBody, '点击「编辑」打开源站抽屉');
        const hasPathPrefix = !!dBody.querySelector('.o-pathprefix');
        assert(!hasPathPrefix, '源站抽屉不再含 pathPrefix 编辑框(.o-pathprefix)', 'pathPrefix 应通过⑨ Origin Rules 托管，前端不再提供编辑入口');
        // 连接参数保留且带⑨覆盖提示
        const hasOverrideHint = [...dBody.querySelectorAll('.hint')].some((h) => h.textContent.includes('⑨'));
        assert(hasOverrideHint, '源站连接参数区含「⑨ 覆盖」提示');
        doc.getElementById('drawer-close')?.click();
        await sleep(40);
      } else {
        assert(false, '源站列表存在「编辑」按钮以打开源站抽屉');
      }
    }
  }

  // ── 用例 D：规则保存 read() 汇总结构回归 ───────────────────────────────
  // 复现 bug：OP_BUILDERS.cache/reqHeaders/respHeaders/rewrite 的 read() 曾返回扁平
  // 结构 {enabled,edgeTtl,...} / {set,remove} / {type,value,...}，经 buildRuleCard 的
  // Object.assign(action, r()) 被挂到 action 顶层，后端 normRule 只从 action.cache /
  // action.respHeaders / action.reqHeaders / action.rewrite 读取嵌套字段，导致头操作/
  // 缓存配置/路径重写在保存时被静默丢弃（用户在后台「只保留删除项」时尤为明显）。
  // 修复后这些 op 的 read() 必须返回正确的嵌套结构，且删除项/值不丢。
  console.log('▸ 用例 D：规则保存 read() 汇总结构回归（头/缓存/重写丢失修复）');
  {
    const T = window.__TEST__;
    assert(!!T, '测试钩子 window.__TEST__ 已挂载（__ENABLE_TEST_HOOK__=true）', 'app.js 未导出 __TEST__');
    if (T) {
      // respHeaders：用户真实场景——只填删除项，不填修改项（你遇到的 bug）
      const resp = T.getOp('respHeaders')({ respHeaders: { set: {}, remove: ['cache-control'] } }).read();
      assert(
        'respHeaders' in resp && Array.isArray(resp.respHeaders.remove) && resp.respHeaders.remove[0] === 'cache-control' && !('remove' in resp),
        'respHeaders.read() 返回 {respHeaders:{remove:["cache-control"]}}（删除项不丢，不再扁平挂顶层）',
        JSON.stringify(resp)
      );

      // reqHeaders：修改 + 删除并存
      const req = T.getOp('reqHeaders')({ reqHeaders: { set: { 'X-A': '1' }, remove: ['X-B'] } }).read();
      assert(
        'reqHeaders' in req && req.reqHeaders.set['X-A'] === '1' && req.reqHeaders.remove[0] === 'X-B',
        'reqHeaders.read() 返回 {reqHeaders:{set,remove}}（增+删都不丢）',
        JSON.stringify(req)
      );

      // cache：手动改 TTL（模板默认看不出，手动改暴露 bug）
      const cache = T.getOp('cache')({ cache: { enabled: true, mode: 'ttl', edgeTtl: 123, browserTtl: 45 } }).read();
      assert(
        'cache' in cache && cache.cache.edgeTtl === 123 && cache.cache.browserTtl === 45,
        'cache.read() 返回 {cache:{edgeTtl,browserTtl}}（缓存配置不丢）',
        JSON.stringify(cache)
      );

      // rewrite：路径重写
      const rw = T.getOp('rewrite')({ rewrite: { type: 'path', value: '/new' } }).read();
      assert(
        'rewrite' in rw && rw.rewrite.value === '/new',
        'rewrite.read() 返回 {rewrite:{value}}（重写不丢）',
        JSON.stringify(rw)
      );

      // 回归对照：确认嵌套字段确实在 action.<op> 下，而非被挂到 action 顶层
      // （此处断言 resp 顶层绝不出现扁平 set/remove，否则 Object.assign 会丢字段）
      const flatCheck = T.getOp('respHeaders')({ respHeaders: { set: { a: '1' }, remove: ['b'] } }).read();
      assert(
        !('set' in flatCheck) && !('remove' in flatCheck),
        'respHeaders.read() 不再返回扁平 {set,remove}（扁平会被后端 normRule 丢弃）',
        JSON.stringify(flatCheck)
      );
    }
  }

  // ── 用例 E：匹配条件值控件越界回归 ───────────────────────────────────
  // 复现 bug：conditionRow 无论匹配对象选什么（host/path/query 等），值控件都渲染
  // 「文件后缀多选分类框」（.ms-trigger--combo），但该分类框只服务于「文件后缀 /
  // 后缀为 / 后缀不为」条件，对其他匹配条件属越界。修复后：非后缀条件行 valWrap
  // 不含 .ms-trigger--combo，仅普通输入框；后缀条件行才挂载该分类框。
  console.log('▸ 用例 E：匹配条件值控件越界回归（后缀分类框仅服务 extension 条件）');
  {
    const T = window.__TEST__;
    if (T && typeof T.conditionRow === 'function') {
      const hasCombo = (cond) => {
        const { row } = T.conditionRow(cond);
        const valWrap = row.querySelector('.cond-cell:last-of-type') || row;
        return !!valWrap.querySelector('.ms-trigger--combo');
      };
      // 非后缀条件：host / path / query / header 一律不得渲染后缀分类框
      assert(!hasCombo({ target: 'host', op: 'equal', values: [] }),
        '匹配对象=host 不渲染文件后缀分类框（越界已修复）');
      assert(!hasCombo({ target: 'path', op: 'prefix', values: [] }),
        '匹配对象=path 不渲染文件后缀分类框（越界已修复）');
      assert(!hasCombo({ target: 'header', op: 'exists', values: [] }),
        '匹配对象=header 不渲染文件后缀分类框（越界已修复）');
      // 后缀条件：extension 对象 + suffix/notSuffix 操作符必须渲染分类框
      assert(hasCombo({ target: 'extension', op: 'equal', values: [] }),
        '匹配对象=extension 渲染文件后缀分类框（服务正确）');
      assert(hasCombo({ target: 'path', op: 'suffix', values: [] }),
        '操作符=后缀为 渲染文件后缀分类框（服务正确）');
      assert(hasCombo({ target: 'path', op: 'notSuffix', values: [] }),
        '操作符=后缀不为 渲染文件后缀分类框（服务正确）');
    } else {
      assert(false, 'window.__TEST__.conditionRow 已暴露以验证越界修复');
    }
  }

  // 5) 全程无运行时错误（最终汇总）
  assert(errors.length === 0, '全程（登录→全视图→抽屉新建规则）无运行时报错', errors.slice(0, 5).map(String).join(' | '));

  console.error = origConsoleError;
  return { ok: _failures === 0, checks: _checks, failures: _failures };
}

// 动态 import 后赋值
let JSDOM;

/**
 * 纯逻辑单测：前端 rule-editor/shared.js 的「全扁平双向转换契约」。
 * 与后端 stageValueToAction/actionToStageValue 同构，验证前后端一致，
 * 不因 NESTED_STAGES 删除而错位（读取展开到 action 顶层、写回剥离规则专属键）。
 */
export async function runSharedConversionTest() {
  let passed = 0, failed = 0;
  const log = (ok, msg) => {
    if (ok) { passed++; console.log(`  ✓ ${msg}`); }
    else { failed++; console.error(`  ✗ ${msg}`); }
  };
  try {
    const { globalStageToAction, actionToGlobalStage, GLOBAL_STAGE_OPS } = await loadSharedConversion();

    // 读：扁平阶段 terminate 直接展开到 action 顶层（不得反向嵌套 {terminate:{...}}）
    const a1 = globalStageToAction('terminate', { forceHttps: true, forceHttpsStatus: 308, directResponse: { status: 403 } });
    log(JSON.stringify(a1) === JSON.stringify({ forceHttps: true, forceHttpsStatus: 308, directResponse: { status: 403 } }),
      'globalStageToAction(terminate) 展开到 action 顶层，不反向嵌套');

    // 读：嵌套型阶段 rewrite 挂到 action[stage] 子对象（与 normRule 读取约定一致）
    const a2 = globalStageToAction('rewrite', { type: 'prefix', value: '/api' });
    log(JSON.stringify(a2) === JSON.stringify({ rewrite: { type: 'prefix', value: '/api' } }),
      'globalStageToAction(rewrite) 挂到 action.rewrite 子对象（normRule 约定）');

    // 写：扁平型 action → stages[stage]，剥离规则专属键（id/name/match/stage 等）
    const act = { forceHttps: true, forceHttpsStatus: 301, id: 'r1', name: 'x', priority: 0, match: { conditions: [] }, enabled: true, stage: 'terminate' };
    const s1 = actionToGlobalStage('terminate', act);
    log(JSON.stringify(s1) === JSON.stringify({ forceHttps: true, forceHttpsStatus: 301 }),
      'actionToGlobalStage(terminate) 收集顶层字段并剥离规则专属键');
    log(!('terminate' in s1), 'actionToGlobalStage(terminate) 落盘值为扁平字段，不嵌套成 {terminate:{...}}');

    // 结构性回归锚点：前端 GLOBAL_STAGE_OPS.terminate 必须显式含 forceHttpsStatus
    // （与后端 ownedFieldsForStage('terminate') 同构），否则 forceHttpsStatus 会退化为
    // 靠兜底循环隐式收集，一旦兜底收缩即静默丢失（与上一轮「勾选不落盘」同类根因）。
    log(Array.isArray(GLOBAL_STAGE_OPS.terminate) && GLOBAL_STAGE_OPS.terminate.includes('forceHttpsStatus'),
      'GLOBAL_STAGE_OPS.terminate 显式含 forceHttpsStatus（前后端 op 集合同构）');

    // 写：嵌套型阶段 rewrite 取 action[stage] 子对象整体作为落盘值（仍平铺）
    const s2 = actionToGlobalStage('rewrite', { rewrite: { type: 'none' }, id: 'r2', stage: 'rewrite' });
    log(JSON.stringify(s2) === JSON.stringify({ type: 'none' }),
      'actionToGlobalStage(rewrite) 取 action.rewrite 子对象平铺落盘');

    return { ok: failed === 0, checks: passed + failed, failures: failed };
  } catch (e) {
    console.error('  ✗ 前端转换契约测试执行异常:', e && (e.stack || e.message));
    return { ok: false, checks: passed + failed, failures: failed + 1 };
  }
}

async function main() {
  try {
    // 1) 前端全扁平双向转换契约（纯逻辑，不依赖 jsdom）
    const conv = await runSharedConversionTest();
    console.log(`\n前端转换契约测试完成：共 ${conv.checks} 项断言，失败 ${conv.failures} 项`);
    if (!conv.ok) {
      console.error('\n✗ 前端转换契约（globalStageToAction/actionToGlobalStage）未通过。');
      process.exit(1);
    }
    console.log('✓ 前端全扁平双向转换契约通过（与后端同构）');

    // 2) jsdom 整链测试
    const res = await runFrontendDomTest();
    if (res.skipped) {
      console.log('⚠ 前端 DOM 测试已跳过（jsdom 未安装），不影响 build。');
      return;
    }
    console.log(`\njsdom 前端测试完成：共 ${res.checks} 项断言，失败 ${res.failures} 项`);
    if (!res.ok) {
      console.error('\n✗ 前端 DOM 测试未通过：登录后无法进入后台、视图渲染异常或存在运行时报错，请检查 web/app.js 与 web/dom.js。');
      process.exit(1);
    }
    console.log('✓ 前端整链（jsdom 真实 DOM）登录 → 进后台 → 全视图 → 规则抽屉 通过');
  } catch (e) {
    console.error('\n✗ 前端测试执行异常:', e && (e.stack || e.message));
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
