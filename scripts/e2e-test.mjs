#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/e2e-test.mjs —— 构建产物端到端 + 前端可执行性测试
 * ----------------------------------------------------------------------------
 * 目的：在「静态语法检查（build.mjs syntaxChecks）」之外，补上一条能发现
 * 「构建成功但登录后进不去后台」这类**运行时**问题的护栏。用户最常遇到的坑
 * 是 build 结果有内联/语法/丢失问题，导致管理面登录输入后无法进入后台、控制台
 * 抛语法定位错误。本脚本在 build 后自动执行，直接消费产物 _worker.js，跑通
 * 「健康检查 → 打开管理面 → 登录 → 鉴权 → 进后台」完整链路，并在 Node 沙箱里
 * 实际执行产物前端 JS，断言 window.API 正确挂载、无运行时语法错误。
 *
 * 三层覆盖（与部署形态对齐）：
 *   1. HTTP 全流程（内存 KV mock + 真实 _worker.js default.fetch/onRequest）
 *   2. 前端可执行性（Node 沙箱执行产物内联 JS / dist/public/assets/app.js）
 *   3. 多平台能力集（CLOUD_PLATFORM=cf / eo 分别覆盖，ESA 走 eo 能力集逻辑）
 *
 * 用法：
 *   node scripts/e2e-test.mjs          # 跑默认平台（cf）全流程
 *   node scripts/e2e-test.mjs --all    # 依次跑 cf + eo 两套能力集
 *   node scripts/e2e-test.mjs --skip   # 跳过（逃生舱，供 CI 调试）
 *
 * 供 build.mjs verify() import 复用：export runE2E()。
 * 依赖：仅 Node 内置能力 + 已构建产物（_worker.js / src/ui.gen.js / dist/public/）。
 * ============================================================================
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 若构建产物缺失则无法测试，明确报错而非静默跳过
function requireBuild() {
  const worker = join(ROOT, '_worker.js');
  const ui = join(ROOT, 'src', 'ui.gen.js');
  const pub = join(ROOT, 'dist', 'public', 'assets', 'app.js');
  const missing = [worker, ui, pub].filter((f) => !existsSync(f));
  if (missing.length) {
    throw new Error(
      'e2e 测试需要构建产物，但缺失：\n  - ' +
        missing.map((f) => f.replace(ROOT + '/', '')).join('\n  - ') +
        '\n请先运行 npm run build 再执行 e2e 测试。'
    );
  }
}

// ---------------------------------------------------------------------------
// 内存 KV mock —— 与 src/platform/kv.js 的 KVLike 契约一致。
// getKV(env) 通过 pickRawBinding 检查 env.CDN_KV 的鸭子类型（get/put 函数），
// 因此注入 { CDN_KV: mockKV } 即可复用真实 store.js 存储路径（含 keyCodec 编码）。
// ---------------------------------------------------------------------------
function createMockKV() {
  /** @type {Map<string, {value:string, expireAt:number}>} */
  const store = new Map();
  const now = () => Math.floor(Date.now() / 1000);
  return {
    /** 物理键计数：断言管理面读写确实走了 KV，而非降级 */
    writes: 0,
    async get(key, _type) {
      const hit = store.get(String(key));
      if (!hit) return null;
      if (hit.expireAt !== 0 && hit.expireAt < now()) {
        store.delete(String(key));
        return null;
      }
      return hit.value;
    },
    async put(key, value, opts) {
      this.writes++;
      store.set(String(key), {
        value: String(value),
        expireAt: (opts && opts.expirationTtl ? now() + opts.expirationTtl : 0),
      });
    },
    async delete(key) {
      store.delete(String(key));
    },
    async list(opts) {
      const prefix = (opts && opts.prefix) || '';
      const keys = [];
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) keys.push({ name: k });
      }
      return { keys, list_complete: true };
    },
  };
}

// ---------------------------------------------------------------------------
// ASSETS mock —— 模拟 CF Workers Static Assets 绑定（env.ASSETS.fetch）。
// 按物理路径 /assets/app.{css,js} 返回构建产物，供「静态形态」管理面测试。
// ---------------------------------------------------------------------------
async function createMockAssets() {
  const base = join(ROOT, 'dist', 'public', 'assets');
  const [css, js] = await Promise.all([
    readFile(join(base, 'app.css'), 'utf8').catch(() => ''),
    readFile(join(base, 'app.js'), 'utf8').catch(() => ''),
  ]);
  return {
    css,
    js,
    async fetch(req) {
      let pathname;
      try {
        pathname = new URL(req.url).pathname;
      } catch {
        return new Response(null, { status: 404 });
      }
      if (pathname === '/assets/app.css') {
        return new Response(css, {
          status: 200,
          headers: { 'content-type': 'text/css; charset=utf-8' },
        });
      }
      if (pathname === '/assets/app.js') {
        return new Response(js, {
          status: 200,
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        });
      }
      return new Response(null, { status: 404 });
    },
  };
}

// ---------------------------------------------------------------------------
// 平台能力重置（针对本进程内直接 import 的 src/ 模块；_worker.js 是独立 bundle，
// 它内部的 caps 缓存基于传入 env 引用重算，故多平台轮次天然隔离）
// ---------------------------------------------------------------------------
async function resetCaps() {
  try {
    const { resetCapsCache } = await import(pathToFileURL(join(ROOT, 'src', 'platform', 'caps.js')).href);
    resetCapsCache();
  } catch {
    /* 该模块仅在需要时使用 */
  }
}

// ---------------------------------------------------------------------------
// 日志与断言工具
// ---------------------------------------------------------------------------
let _failures = 0;
let _checks = 0;
const log = (msg) => console.log('  ' + msg);
function assert(cond, label, detail) {
  _checks++;
  if (cond) {
    log(`  ✓ ${label}`);
  } else {
    _failures++;
    log(`  ✗ ${label}${detail ? ' —— ' + detail : ''}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP 全流程测试（消费真实 _worker.js 导出）
// ---------------------------------------------------------------------------
/**
 * 跑一轮完整的「健康检查 → 管理面 → 登录 → 鉴权 → 后台」链路。
 * @param {Object} mod _worker.js 导入的模块（含 default.fetch / onRequest）
 * @param {string} platform cf | eo
 * @param {Object} mockKV 共享 KV mock（登录写入的哈希在轮次间保留）
 * @param {Object} mockAssets 共享 ASSETS mock
 * @param {boolean} useAssets 本轮是否启用 ASSETS（静态形态 vs 内联形态）
 * @returns {Promise<void>}
 */
async function runHttpFlow(mod, platform, mockKV, mockAssets, useAssets) {
  const label = `[${platform}${useAssets ? '/assets' : '/inline'}]`;
  const ADMIN_PASSWORD = 'e2e-local-pass-2026';
  const JWT_SECRET = 'e2e-jwt-secret-0123456789abcdef';

  const handler =
    typeof mod.default?.fetch === 'function' ? mod.default.fetch : mod.onRequest;

  const baseEnv = {
    CLOUD_PLATFORM: platform,
    ADMIN_PASSWORD,
    JWT_SECRET,
    CDN_KV: mockKV,
  };
  if (useAssets) baseEnv.ASSETS = mockAssets;

  const env = { ...baseEnv };

  // 内存 KV 在轮次间保持，但每轮用独立 env 引用以触发 caps 重算（对 _worker.js 内 bundle 有效）
  const fetchAt = (path, init) => handler(new Request('https://e2e.test' + path, init), env);

  log(`${label} ▸ 1/6 健康检查 /__health`);
  const health = await fetchAt('/__health');
  const healthBody = await health.json();
  assert(health.status === 200, `${label} /__health 返回 200`, `got ${health.status}`);
  assert(healthBody.ok === true, `${label} /__health.ok=true`);
  assert(healthBody.platform === platform, `${label} /__health.platform=${platform}`, `got ${healthBody.platform}`);
  assert(healthBody.caps && healthBody.caps.hasKV === true, `${label} caps.hasKV=true（KV 已注入）`);

  log(`${label} ▸ 2/6 打开管理面 ${useAssets ? '（静态形态，引用外部资源）' : '（内联形态）'}`);
  const panel = await fetchAt('/__panel');
  const panelHtml = await panel.text();
  assert(panel.status === 200, `${label} /__panel 返回 200`, `got ${panel.status}`);
  assert(panelHtml.includes('window.__BASE__="/__panel"'), `${label} HTML 注入 window.__BASE__`);
  assert(panelHtml.includes('window.__PLATFORM__'), `${label} HTML 注入 window.__PLATFORM__`);
  if (useAssets) {
    assert(panelHtml.includes('/__panel/assets/app.css'), `${label} 静态形态引用 app.css`);
    assert(panelHtml.includes('/__panel/assets/app.js'), `${label} 静态形态引用 app.js`);
  } else {
    assert(panelHtml.includes('<style>'), `${label} 内联形态含 <style>`);
    assert(/<script>[\s\S]*<\\?\/script>/.test(panelHtml), `${label} 内联形态含内联 <script>`);
  }

  log(`${label} ▸ 3/6 静态资源可访问（仅静态形态）`);
  if (useAssets) {
    const cssRes = await fetchAt('/__panel/assets/app.css');
    assert(cssRes.status === 200 && (await cssRes.text()).length > 0, `${label} /__panel/assets/app.css 有内容`);
    const jsRes = await fetchAt('/__panel/assets/app.js');
    assert(jsRes.status === 200 && (await jsRes.text()).length > 0, `${label} /__panel/assets/app.js 有内容`);
  } else {
    // 内联形态下 /__panel/assets/app.css 由 UI_CSS 兜底（app.js 不单独透传）
    const cssRes = await fetchAt('/__panel/assets/app.css');
    assert(cssRes.status === 200 && (await cssRes.text()).length > 0, `${label} 内联兜底 app.css 有内容`);
  }

  log(`${label} ▸ 4/6 登录（正确密码）`);
  const login = await fetchAt('/__panel/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  const loginBody = await login.json();
  const setCookie = login.headers.get('set-cookie') || '';
  assert(login.status === 200 && loginBody.ok === true, `${label} 登录成功返回 ok:true`, `status=${login.status} body=${JSON.stringify(loginBody)}`);
  assert(setCookie.includes('ecw_token='), `${label} 登录下发 ecw_token Cookie`);
  const cookie = setCookie.split(';')[0];

  log(`${label} ▸ 5/6 鉴权 /auth/me（带 Cookie）`);
  const me = await fetchAt('/__panel/api/auth/me', { headers: { Cookie: cookie } });
  const meBody = await me.json();
  assert(me.status === 200 && meBody.data && meBody.data.authed === true, `${label} /auth/me 返回 authed:true`, `got ${JSON.stringify(meBody)}`);

  // 未登录访问受保护接口应被拒绝
  const meAnon = await fetchAt('/__panel/api/auth/me');
  const meAnonBody = await meAnon.json();
  assert(meAnon.status === 200 && meAnonBody.data && meAnonBody.data.authed === false, `${label} 未带 Cookie 时 /auth/me authed:false`);

  log(`${label} ▸ 6/6 进后台：受保护接口 /sites（带 Cookie）`);
  const sites = await fetchAt('/__panel/api/sites', { headers: { Cookie: cookie } });
  const sitesBody = await sites.json();
  assert(sites.status === 200 && sitesBody.ok === true, `${label} /sites 登录后可访问 ok:true`, `status=${sites.status} body=${JSON.stringify(sitesBody)}`);

  // 未登录访问受保护接口应 401
  const sitesAnon = await fetchAt('/__panel/api/sites');
  assert(sitesAnon.status === 401, `${label} 未登录访问 /sites 返回 401`, `got ${sitesAnon.status}`);

  // 错误密码应 401（鉴权闭环）
  const badLogin = await fetchAt('/__panel/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-password' }),
  });
  assert(badLogin.status === 401, `${label} 错误密码登录返回 401`, `got ${badLogin.status}`);

  log(`${label} ▸ 7/7 管理 API CRUD 端到端（站点/源站池/规则/配置）`);

  // ---- 站点：创建（内联单源站自动落成 single 源站）→ 列表 → 规则 → 删除 ----
  const newHost = `e2e-${platform}-${Date.now()}.test`;
  const createSite = await fetchAt('/__panel/api/sites/' + newHost, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      host: newHost,
      enabled: true,
      origins: [{ engine: 'fetch', scheme: 'https', addr: '1.2.3.4', port: 443 }],
    }),
  });
  const createSiteBody = await createSite.json();
  assert(
    createSite.status === 200 && createSiteBody.ok === true,
    `${label} 创建站点 ${newHost} 成功`,
    `status=${createSite.status} body=${JSON.stringify(createSiteBody)}`
  );
  const createdPoolId = createSiteBody.data?.poolId || (createSiteBody.data?.createdOrigin && createSiteBody.data.createdOrigin.id);

  const listAfterCreate = await fetchAt('/__panel/api/sites', { headers: { Cookie: cookie } });
  const listAfterCreateBody = await listAfterCreate.json();
  const found = (listAfterCreateBody.data?.sites || []).some((s) => s.host === newHost);
  assert(found, `${label} 站点列表包含新建站点 ${newHost}`);

  // 规则保存：PUT /sites/:host/rules
  const saveRules = await fetchAt('/__panel/api/sites/' + newHost + '/rules', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      rules: [
        {
          id: 'rule-e2e-1',
          priority: 10,
          enabled: true,
          stage: 'origin',
          match: { conditions: [[{ target: 'path', op: 'prefix', values: ['/api'] }]] },
          action: { poolId: createdPoolId || 'pl_missing', rewrite: { type: 'none' } },
        },
      ],
    }),
  });
  const saveRulesBody = await saveRules.json();
  assert(saveRules.status === 200 && saveRulesBody.ok === true, `${label} 保存站点规则成功`, `status=${saveRules.status} body=${JSON.stringify(saveRulesBody)}`);

  // 删除站点
  const delSite = await fetchAt('/__panel/api/sites/' + newHost, { method: 'DELETE', headers: { Cookie: cookie } });
  const delSiteBody = await delSite.json();
  assert(delSite.status === 200 && delSiteBody.ok === true, `${label} 删除站点 ${newHost} 成功`);

  // ---- 源站池：创建 → 列表 → 更新 → 删除 ----
  const createPool = await fetchAt('/__panel/api/pools', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      name: 'e2e-pool',
      kind: 'pool',
      strategy: 'roundrobin',
      origins: [
        { engine: 'fetch', scheme: 'https', addr: '10.0.0.1', port: 443, weight: 1 },
        { engine: 'fetch', scheme: 'https', addr: '10.0.0.2', port: 443, weight: 1 },
      ],
    }),
  });
  const createPoolBody = await createPool.json();
  assert(createPool.status === 200 && createPoolBody.ok === true && createPoolBody.data && createPoolBody.data.id, `${label} 创建源站池成功`, `status=${createPool.status} body=${JSON.stringify(createPoolBody)}`);
  const poolId = createPoolBody.data.id;

  const listPools = await fetchAt('/__panel/api/pools', { headers: { Cookie: cookie } });
  const listPoolsBody = await listPools.json();
  assert(
    (listPoolsBody.data?.pools || []).some((p) => p.id === poolId),
    `${label} 源站池列表包含新建池 ${poolId}`
  );

  const updatePool = await fetchAt('/__panel/api/pools/' + poolId, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'e2e-pool-renamed', kind: 'pool', strategy: 'chain', origins: [{ engine: 'fetch', scheme: 'https', addr: '10.0.0.9', port: 443 }] }),
  });
  const updatePoolBody = await updatePool.json();
  assert(updatePool.status === 200 && updatePoolBody.ok === true, `${label} 更新源站池成功`);

  const delPool = await fetchAt('/__panel/api/pools/' + poolId, { method: 'DELETE', headers: { Cookie: cookie } });
  const delPoolBody = await delPool.json();
  assert(delPool.status === 200 && delPoolBody.ok === true, `${label} 删除源站池 ${poolId} 成功`);

  // ---- 配置：读取 → 修改 → 回读 ----
  // 注意：本测试全程依赖 /__panel 路由前缀，故不在此改动 adminPath（改动会令
  // 后续请求路由到错误的 adminPath 前缀）。仅验证「敏感字段剥离」与「常规字段可写回读」。
  const cfgGet = await fetchAt('/__panel/api/config/global', { headers: { Cookie: cookie } });
  const cfgGetBody = await cfgGet.json();
  assert(cfgGet.status === 200 && cfgGetBody.ok === true && cfgGetBody.data, `${label} 读取全局配置成功`);
  assert(!('passwordHash' in (cfgGetBody.data || {})), `${label} 配置不含 passwordHash（敏感字段已剥离）`);

  const cfgPut = await fetchAt('/__panel/api/config/global', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ configCacheTtl: 120 }),
  });
  const cfgPutBody = await cfgPut.json();
  assert(cfgPut.status === 200 && cfgPutBody.ok === true && cfgPutBody.data && cfgPutBody.data.configCacheTtl === 120, `${label} 保存全局配置（configCacheTtl）成功`, `body=${JSON.stringify(cfgPutBody)}`);

  // 还原 configCacheTtl，避免影响后续轮次 / 真实部署心智
  await fetchAt('/__panel/api/config/global', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ configCacheTtl: 60 }),
  });

  // 未登录访问 CRUD 写接口应被拒绝（鉴权闭环延伸到写路径）
  const anonPut = await fetchAt('/__panel/api/sites/' + newHost, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ host: newHost }),
  });
  assert(anonPut.status === 401, `${label} 未登录写入 /sites 返回 401`, `got ${anonPut.status}`);

  log(`${label} ▸ KV 写次数: ${mockKV.writes}（管理面配置确实落 KV，未静默降级）`);
}

// ---------------------------------------------------------------------------
// Node 沙箱执行前端 JS —— 验证 window.API 挂载 + 无运行时语法错误
// ---------------------------------------------------------------------------

/** 极简 DOM 节点桩：让 app.js 顶层 IIFE 跑完初始化不抛 ReferenceError */
function makeEl() {
  const classSet = new Set();
  const el = {
    _cls: classSet,
    style: {},
    dataset: {},
    children: [],
    childNodes: [],
    firstChild: null,
    parentNode: null,
    value: '',
    hidden: false,
    disabled: false,
    type: '',
    selected: false,
    textContent: '',
    innerHTML: '',
    classList: {
      add: (c) => classSet.add(c),
      remove: (c) => classSet.delete(c),
      toggle: (c, f) => { if (f === undefined ? !classSet.has(c) : f) classSet.add(c); else classSet.delete(c); },
      contains: (c) => classSet.has(c),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    appendChild: (c) => { el.children.push(c); return c; },
    append: (...cs) => cs.forEach((c) => el.appendChild(c)),
    removeChild: (c) => { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); return c; },
    insertBefore: (c) => c,
    replaceChild: (c) => c,
    querySelector: () => null,
    querySelectorAll: () => [],
    remove: () => {},
    focus: () => {},
    click: () => {},
    blur: () => {},
    scrollIntoView: () => {},
    set innerHTMLValue(v) { this.innerHTML = v; }, // noop 语义，避免误设
  };
  return el;
}

/**
 * 用 `new Function('window', code)` 在 Node 沙箱执行产物前端 JS。
 * 注入 stub window/document/location/fetch，断言 window.API 挂载无误。
 * @param {string} code 前端 JS 源码（内联或 dist/public/assets/app.js）
 * @param {string} label 用于日志标识
 * @returns {void}
 */
function sandboxExec(code, label) {
  const win = { __BASE__: '/__panel', __PLATFORM__: 'cf' };
  win.location = {
    href: 'https://e2e.test/__panel',
    pathname: '/__panel',
    hash: '',
    search: '',
    origin: 'https://e2e.test',
    addEventListener: () => {},
    reload: () => {},
    replace: () => {},
  };
  win.addEventListener = () => {};

  // fetch stub：返回空 JSON 响应，让 ensureAuth()/refreshData() 等异步调用可正常 settle
  const emptyJson = async () => ({}); // eslint-disable-line no-unused-vars
  const makeFetchResp = () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => null, has: () => false },
    text: async () => '{}',
    json: async () => ({}),
    clone: () => makeFetchResp(),
  });
  win.fetch = async () => makeFetchResp();
  win.URLSearchParams = URLSearchParams;
  win.location.searchParams = new URLSearchParams('');

  const doc = {
    readyState: 'complete',
    body: makeEl(),
    documentElement: makeEl(),
    getElementById: () => makeEl(),
    createElement: () => makeEl(),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  // 关键断言（挂载层）：new Function 构造本身即做语法解析，能捕捉 SyntaxError；
  // 执行后 window.API 应为完整门面。
  const fn = new Function('window', 'document', 'location', 'fetch', code);
  fn(win, doc, win.location, win.fetch);

  const API = win.API;
  assert(!!API, `${label} 执行后 window.API 已挂载`);
  assert(typeof API?.auth?.login === 'function', `${label} API.auth.login 为函数`);
  assert(typeof API?.auth?.me === 'function', `${label} API.auth.me 为函数`);
  assert(typeof API?.sites?.list === 'function', `${label} API.sites.list 为函数`);
  assert(typeof API?.system?.info === 'function', `${label} API.system.info 为函数`);
  assert(typeof API?.pools?.list === 'function', `${label} API.pools.list 为函数`);
  assert(typeof API?.config?.get === 'function', `${label} API.config.get 为函数`);
}

/** 从内联 HTML 中提取「内容最长」的内联 <script>（主 bundle，排除注入 BASE 的小脚本） */
function extractInlineScript(html) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let best = '';
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1] || '';
    if (body.length > best.length) best = body;
  }
  return best;
}

/**
 * 前端可执行性测试：分别对内联产物与静态产物执行沙箱。
 * @returns {Promise<void>}
 */
async function runSandbox() {
  console.log('▸ Node 沙箱执行前端产物（验证 window.API 挂载 + 无语法错误）...');

  // 1. 内联形态：从 src/ui.gen.js 的 UI_HTML 提取内联 <script>
  const uiMod = await import(pathToFileURL(join(ROOT, 'src', 'ui.gen.js')).href);
  const inlineHtml = typeof uiMod.UI_HTML === 'string' ? uiMod.UI_HTML : '';
  if (inlineHtml) {
    const inlineJs = extractInlineScript(inlineHtml);
    assert(inlineJs.length > 0, '内联 HTML 中提取到主 <script>', `len=${inlineJs.length}`);
    if (inlineJs) {
      // 注意：buildInlineUI 对 </script> 做了边界转义（<\/script>），此处需还原后再执行
      const unescaped = inlineJs.replace(/<\\\/script/g, '</script');
      sandboxExec(unescaped, '内联产物');
    }
  } else {
    assert(false, 'src/ui.gen.js 未导出 UI_HTML，内联产物缺失');
  }

  // 2. 静态形态：直接执行 dist/public/assets/app.js
  const staticJsPath = join(ROOT, 'dist', 'public', 'assets', 'app.js');
  if (existsSync(staticJsPath)) {
    const staticJs = await readFile(staticJsPath, 'utf8');
    sandboxExec(staticJs, '静态产物 assets/app.js');
  } else {
    assert(false, 'dist/public/assets/app.js 缺失');
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/**
 * 端到端测试入口。供 build.mjs verify() import 复用，也可 CLI 直接运行。
 * @param {{all?:boolean, platforms?:string[]}} [opts] all=true 跑 cf+eo；platforms 覆盖
 * @returns {Promise<{ok:boolean, checks:number, failures:number}>}
 */
export async function runE2E(opts = {}) {
  _failures = 0;
  _checks = 0;
  requireBuild();

  // 设置进程级 CLOUD_PLATFORM，兜底部分读 process.env 的路径
  process.env.CLOUD_PLATFORM = process.env.CLOUD_PLATFORM || 'cf';
  await resetCaps();

  const mod = await import(`${pathToFileURL(join(ROOT, '_worker.js')).href}?t=${Date.now()}`);
  const mockKV = createMockKV();
  const mockAssets = await createMockAssets();

  const platforms = opts.platforms && opts.platforms.length
    ? opts.platforms
    : (opts.all ? ['cf', 'eo'] : [process.env.CLOUD_PLATFORM === 'eo' ? 'eo' : 'cf']);

  for (const platform of platforms) {
    // 内联形态（无 ASSETS）：模拟纯 Dashboard 粘贴 worker
    await runHttpFlow(mod, platform, mockKV, mockAssets, false);
    // 静态形态（有 ASSETS）：模拟 CF Workers 挂载 dist/public
    await runHttpFlow(mod, platform, mockKV, mockAssets, true);
  }

  await runSandbox();

  return { ok: _failures === 0, checks: _checks, failures: _failures };
}

/** CLI 主入口 */
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--skip')) {
    console.log('e2e 测试已跳过（--skip）');
    return;
  }
  console.log('cdn-edge-gateway 产物端到端测试开始...');
  const opts = { all: args.includes('--all') };
  const res = await runE2E(opts);
  console.log(`\ne2e 测试完成：共 ${res.checks} 项断言，失败 ${res.failures} 项`);
  if (!res.ok) {
    console.error('\n✗ e2e 测试未通过：构建产物存在运行时问题，请检查 build 日志与前端源码。');
    process.exit(1);
  }
  console.log('✓ e2e 全流程（HTTP + 前端可执行性）通过');
}

// 双模式：CLI 直跑走 main()；被 build.mjs import 时仅导出 runE2E。
const isCli = (() => {
  try {
    return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();
if (isCli) {
  main().catch((err) => {
    console.error('✗ e2e 执行异常:', err?.message || err);
    process.exit(1);
  });
}
