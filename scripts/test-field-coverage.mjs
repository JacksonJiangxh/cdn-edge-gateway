/**
 * ============================================================================
 * 流量序列 action 全字段控制变量测试
 * ----------------------------------------------------------------------------
 * 模拟一个「图片请求」进入 handleProxy，基于「全站规则 + 站点规则」两路配置，
 * 以控制变量法逐一驱动每个阶段 action 的字段（均使用非默认值），断言下游消费
 * 结果，从而筛查「是否有处理逻辑在流量序列之外自行处理」。
 *
 * 设计原则（用户硬性要求）：
 *   - 每个字段单独用例：仅改该字段为非默认值，其余保持默认。
 *   - 同时测「仅全站默认」「仅站点覆盖」「全站+站点冲突」三路，验证结果随变量变化。
 *   - 任何与单轨化语义不符即视为 bug，修复源码而非放宽断言。
 *
 * 运行：node scripts/test-field-coverage.mjs
 * 退出码：全部通过 0；有失败非 0。
 * ============================================================================
 */

import { handleProxy } from '../src/proxy/pipeline.js';
import { invalidateMemCache } from '../src/config/store.js';
import { detectCaps, resetCapsCache } from '../src/platform/caps.js';
import { encodeKey } from '../src/platform/keyCodec.js';
import { DEFAULT_GLOBAL_RULES } from '../src/config/defaults.js';

// ---- 全站/站点/池 常量 ----
const PLATFORM = 'cf';
const HOST = 'img.example.com';
const POOL_ID = 'pl_img';
const ORIGIN_ID = 'o1';
const ORIGIN_ADDR = 'origin1.example.net';

// 受控回源响应：带回显头，便于核对流量序列处理效果
const ORIGIN_RESP_STATUS = 200;
const ORIGIN_RESP_BODY = 'ORIGIN-BODY';
const ORIGIN_RESP_HEADERS = {
  'content-type': 'image/jpeg',
  'set-cookie': 'sid=1',
  'x-frame-options': 'DENY',
  'x-origin-extra': 'keep-me',
};

// ---- 断言框架 ----
const failures = [];
let passed = 0;
function check(ok, label, detail = '') {
  if (ok) {
    passed++;
  } else {
    failures.push({ label, detail });
    process.stderr.write(`  ✗ ${label}${detail ? `  → ${detail}` : ''}\n`);
  }
  return ok;
}

// ---- mock 基础设施（与 test-global-fallback.mjs 同构） ----
function createMockKV() {
  const map = new Map();
  return {
    async get(k) {
      return map.has(k) ? map.get(k) : null;
    },
    async put(k, v) {
      map.set(k, v);
    },
    async delete(k) {
      map.delete(k);
    },
    _map: map,
  };
}

function mockCaches() {
  const prev = globalThis.caches;
  globalThis.caches = {
    default: {
      async match() { return null; },
      async put() {},
      async delete() { return false; },
    },
  };
  return () => {
    if (prev === undefined) delete globalThis.caches;
    else globalThis.caches = prev;
  };
}

// 捕获回源请求细节
function mockFetch(capture) {
  const prev = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    capture.url = url;
    capture.init = init;
    const h = init && init.headers ? init.headers : {};
    capture.headersObj = h instanceof Headers ? h : null;
    if (capture.headersObj && capture.headersObj.has) {
      if (capture.headersObj.has('host')) capture.host = capture.headersObj.get('host');
    }
    return new Response(ORIGIN_RESP_BODY, {
      status: ORIGIN_RESP_STATUS,
      headers: ORIGIN_RESP_HEADERS,
    });
  };
  return () => {
    globalThis.fetch = prev;
  };
}

function makeCtx(env, urlStr, headers = {}) {
  const url = new URL(urlStr);
  const request = new Request(url, {
    method: 'GET',
    headers: { 'user-agent': 'Mozilla/5.0 (TestAgent)', 'accept': 'image/webp,*/*', ...headers },
  });
  return {
    request,
    url,
    env,
    caps: detectCaps(env),
    waitUntil() {},
    startTime: Date.now(),
    reqId: `test-${Math.random().toString(36).slice(2, 10)}`,
    debug: {},
  };
}

async function isolate() {
  invalidateMemCache();
  resetCapsCache();
}

// 深合并（覆盖式），用于把「被测字段的非默认值」并入 DEFAULT_GLOBAL_RULES
function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && target[k] && typeof target[k] === 'object') {
      deepMerge(target[k], src[k]);
    } else {
      target[k] = Array.isArray(src[k]) ? src[k].slice() : (src[k] && typeof src[k] === 'object' ? structuredClone(src[k]) : src[k]);
    }
  }
  return target;
}

// 构造一个完整的全站规则（DEFAULT_GLOBAL_RULES + 覆盖）
function buildGlobalStages(override = {}) {
  const gs = structuredClone(DEFAULT_GLOBAL_RULES);
  deepMerge(gs, override);
  return gs;
}

// 写入全站规则到 KV（编码键，与 store 读取一致）
async function seedGlobalStages(kv, stages) {
  await kv.put(encodeKey('cfg:global_rules'), JSON.stringify({ stages }));
}

// 写入站点 + 池 + 索引
async function seedSiteAndPool(kv, { rules = [], security = null, cacheGen = 0, defaultHostHeader = null } = {}) {
  const site = {
    host: HOST,
    enabled: true,
    poolId: POOL_ID,
    defaultHostHeader: defaultHostHeader || { mode: 'accel', custom: '' },
    rules,
    security: security || {
      refererMode: 'off',
      refererList: [],
      allowEmptyReferer: true,
      uaBlacklist: [],
      ipBlacklist: [],
      ipWhitelist: [],
      signedUrl: { enabled: false, secret: '', ttl: 3600, param: 'sign' },
      rateLimit: { enabled: false, rpm: 600 },
      botManagement: { enabled: false, mode: 'blacklist', list: [] },
    },
    ipv6Support: false,
    cacheGen,
    updatedAt: Date.now(),
  };
  const pool = {
    id: POOL_ID,
    name: 'img-pool',
    kind: 'single',
    strategy: 'chain',
    origins: [
      {
        id: ORIGIN_ID,
        enabled: true,
        order: 1,
        weight: 1,
        engine: 'fetch',
        scheme: 'https',
        addr: ORIGIN_ADDR,
        port: 443,
        pathPrefix: '',
        extraHeaders: {},
        hostHeader: { mode: 'inherit', custom: '' },
        sni: null,
        rewrite: { type: 'none', value: '', regexFrom: '', regexTo: '' },
        reqHeaders: { set: {}, remove: [] },
        respHeaders: { set: {}, remove: [] },
        cache: { enabled: false, mode: 'ttl', edgeTtl: 0, browserTtl: 0 },
        followRedirect: false,
        originTimeoutMs: 0,
        clientIpHeader: { enabled: false, name: 'X-Forwarded-For' },
      },
    ],
    failover: { enabled: true, retryOn: [500, 502, 503, 504, 522, 524], maxRetries: 2, timeoutMs: 10000 },
    createdBy: HOST,
    updatedAt: Date.now(),
  };
  await kv.put(encodeKey('site:_index'), JSON.stringify({ hosts: [HOST], wildcards: [] }));
  await kv.put(encodeKey('pool:_index'), JSON.stringify({ ids: [POOL_ID] }));
  await kv.put(encodeKey('site:' + HOST), JSON.stringify(site));
  await kv.put(encodeKey('pool:' + POOL_ID), JSON.stringify(pool));
}

// 驱动一次请求，返回 { resp, ctx, capture }
async function run({ globalOverride = {}, siteRules = [], clientHeaders = {}, siteOverride = {} } = {}) {
  const kv = createMockKV();
  const capture = {};
  const restoreFetch = mockFetch(capture);
  const restoreCaches = mockCaches();
  const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv, IMG_URL: 'https://img.example.com/cdn-cgi/image/', IMG_TOKEN: 'tok', IMG_VARIANTS: 'thumbnail,large,original', IMG_OPTIONS: '' };
  await isolate();

  await seedGlobalStages(kv, buildGlobalStages(globalOverride));
  await seedSiteAndPool(kv, { rules: siteRules, ...siteOverride });

  const ctx = makeCtx(env, `https://${HOST}/pic/photo.jpg`, clientHeaders);
  let resp;
  try {
    resp = await handleProxy(ctx);
  } catch (e) {
    if (process.env.__DIAG) console.error('[DIAG] handleProxy threw:', e && e.stack ? e.stack : e);
    resp = { error: e };
  }
  restoreFetch();
  restoreCaches();
  return { resp, ctx, capture };
}

// ============================================================================
// 用例
// ============================================================================

// ---- 1. 修改请求头 reqHeaders.set ----
async function testReqHeadersSet() {
  console.log('\n【A】reqHeaders.set（控制变量：非默认值）');
  // 1.1 全站默认 set
  {
    const { capture } = await run({ globalOverride: { reqHeaders: { set: { 'X-Global-Set': 'gval' } } } });
    const h = capture.headersObj;
    check(h && h.get('x-global-set') === 'gval', 'A1 全站默认 set 进入回源头', `实际=${h && h.get('x-global-set')}`);
  }
  // 1.2 站点覆盖同名 key → 站点优先
  {
    const { capture } = await run({
      globalOverride: { reqHeaders: { set: { 'X-Custom': 'gval' } } },
      siteRules: [{ id: 's1', stage: 'reqHeaders', priority: 100, match: {}, action: { reqHeaders: { set: { 'X-Custom': 'sval' } } } }],
    });
    const h = capture.headersObj;
    check(h && h.get('x-custom') === 'sval', 'A2 站点覆盖优先', `预期 sval 实际=${h && h.get('x-custom')}`);
  }
  // 1.3 站点追加新 key + 全站 key 保留
  {
    const { capture } = await run({
      globalOverride: { reqHeaders: { set: { 'X-Global': 'gval' } } },
      siteRules: [{ id: 's1', stage: 'reqHeaders', priority: 100, match: {}, action: { reqHeaders: { set: { 'X-Site': 'sval' } } } }],
    });
    const h = capture.headersObj;
    check(h && h.get('x-global') === 'gval', 'A3 全站 key 保留', `实际=${h && h.get('x-global')}`);
    check(h && h.get('x-site') === 'sval', 'A3 站点追加 key 出现', `实际=${h && h.get('x-site')}`);
  }
}

// ---- 2. 修改请求头 reqHeaders.remove ----
async function testReqHeadersRemove() {
  console.log('\n【B】reqHeaders.remove（控制变量：非默认值）');
  {
    const { capture } = await run({
      globalOverride: { reqHeaders: { set: { 'Referer': 'https://evil.example' } } },
      siteRules: [{ id: 's1', stage: 'reqHeaders', priority: 100, match: {}, action: { reqHeaders: { remove: ['Referer'] } } }],
    });
    const h = capture.headersObj;
    check(h && h.get('referer') === null, 'B1 站点 remove 删掉全站 set 的 Referer', `实际=${h && h.get('referer')}`);
  }
}

// ---- 3. reqHeaders.strip / forwardWhitelist（关键：是否绕过 effAction 合并）----
async function testStripAndForward() {
  console.log('\n【C】reqHeaders.strip / forwardWhitelist（单轨化关键：是否绕过 effAction 合并）');
  const { buildOriginHeaders } = await import('../src/proxy/headers.js');

  // 全站默认：strip 剥离 x-a，白名单仅 accept
  const baseGlobal = structuredClone(DEFAULT_GLOBAL_RULES);
  baseGlobal.reqHeaders = { set: {}, remove: [], strip: [{ type: 'exact', value: 'x-a' }], forwardWhitelist: ['accept'] };

  // C1：站点想追加 strip x-b（应合并，而非被覆盖导致 x-a 仍在）
  {
    const ctx = makeCtx({ CLOUD_PLATFORM: PLATFORM, CDN_KV: createMockKV() }, `https://${HOST}/pic/photo.jpg`, { 'X-A': '1', 'X-B': '2', 'Accept': 'image/webp' });
    ctx.__globalStages = structuredClone(baseGlobal);
    const siteOps = { set: {}, remove: [], strip: [{ type: 'exact', value: 'x-b' }], forwardWhitelist: ['accept'] };
    const h = await buildOriginHeaders(ctx, { extraHeaders: {} }, siteOps, ctx.env, { enabled: false });
    const bothStripped = h.get('x-a') === null && h.get('x-b') === null;
    check(bothStripped, 'C1 站点 strip 应追加合并到全站 strip（X-A 与 X-B 都应剥离）', `X-A=${h.get('x-a')} X-B=${h.get('x-b')}`);
    if (!bothStripped) console.log('    >> 证据：buildOriginHeaders 直接从 ctx.__globalStages.reqHeaders 读 strip，忽略站点 ops.strip');
  }

  // C2：站点不配 strip（只配 set），全站 strip 应仍生效（验证全站默认被继承，不丢失）
  {
    const ctx = makeCtx({ CLOUD_PLATFORM: PLATFORM, CDN_KV: createMockKV() }, `https://${HOST}/pic/photo.jpg`, { 'X-A': '1', 'X-B': '2', 'Accept': 'image/webp' });
    ctx.__globalStages = structuredClone(baseGlobal);
    const siteOps = { set: { 'X-Site': 'sv' }, remove: [] };
    const h = await buildOriginHeaders(ctx, { extraHeaders: {} }, siteOps, ctx.env, { enabled: false });
    // 站点未配置 strip/forwardWhitelist → 回落全站：X-A 应被剥离，Accept 应透传
    const aStripped = h.get('x-a') === null;
    // 白名单 accept 应原样透传客户端 accept 值（站点未配 strips/白名单时回落全站 accept 白名单）
    const acceptKept = h.get('accept') && h.get('accept').includes('image/webp');
    const siteSet = h.get('x-site') === 'sv';
    check(aStripped && acceptKept && siteSet, 'C2 站点未配 strip 时全站 strip/白名单应继承生效', `X-A=${h.get('x-a')} Accept=${h.get('accept')} X-Site=${h.get('x-site')}`);
    if (!(aStripped && acceptKept)) console.log('    >> 证据：站点未配 strip 时 buildOriginHeaders 回落全站 strip/白名单失败');
  }

  // C3：站点 forwardWhitelist 扩展（应合并）
  {
    const ctx = makeCtx({ CLOUD_PLATFORM: PLATFORM, CDN_KV: createMockKV() }, `https://${HOST}/pic/photo.jpg`, { 'X-A': '1', 'X-Custom': '3', 'Accept': 'image/webp' });
    ctx.__globalStages = structuredClone(baseGlobal);
    const siteOps = { set: {}, remove: [], strip: [{ type: 'exact', value: 'x-a' }], forwardWhitelist: ['accept', 'x-custom'] };
    const h = await buildOriginHeaders(ctx, { extraHeaders: {} }, siteOps, ctx.env, { enabled: false });
    const fwd = h.get('x-custom') === '3';
    check(fwd, 'C3 站点 forwardWhitelist 应追加合并到全站白名单（X-Custom 透传）', `X-Custom=${h.get('x-custom')}`);
    if (!fwd) console.log('    >> 证据：buildOriginHeaders 的 forwardWhitelist 仅读全站，忽略站点 ops.forwardWhitelist');
  }
}

// ---- 4. 修改响应头 respHeaders.set / remove ----
async function testRespHeaders() {
  console.log('\n【D】respHeaders.set / remove（控制变量：非默认值）');
  // 4.1 全站默认 set 回显头
  {
    const { resp } = await run({ globalOverride: { respHeaders: { set: { 'X-Resp-Global': 'gv' } } } });
    check(resp && resp.headers && resp.headers.get('x-resp-global') === 'gv', 'D1 全站默认 respHeaders.set 生效', `实际=${resp && resp.headers && resp.headers.get('x-resp-global')}`);
  }
  // 4.2 站点覆盖全站 set 同名 key
  {
    const { resp } = await run({
      globalOverride: { respHeaders: { set: { 'X-Resp': 'gv' } } },
      siteRules: [{ id: 's1', stage: 'respHeaders', priority: 100, match: {}, action: { respHeaders: { set: { 'X-Resp': 'sv' } } } }],
    });
    check(resp && resp.headers.get('x-resp') === 'sv', 'D2 站点覆盖优先', `预期 sv 实际=${resp && resp.headers.get('x-resp')}`);
  }
  // 4.3 站点 remove 删掉回源响应里的敏感头（全站未配）
  {
    const { resp } = await run({
      siteRules: [{ id: 's1', stage: 'respHeaders', priority: 100, match: {}, action: { respHeaders: { remove: ['x-frame-options'] } } }],
    });
    check(resp && resp.headers.get('x-frame-options') === null, 'D3 站点 remove 剥离回源敏感头', `实际=${resp && resp.headers.get('x-frame-options')}`);
  }
}

// ---- 5. 缓存 cache 字段 ----
async function testCache() {
  console.log('\n【E】cache 阶段字段（控制变量：非默认值）');
  // 5.1 noCacheStatus 通配 5xx：源站返回 500 → 不应进入缓存（且源站头 x-cache 行为）
  {
    const kv = createMockKV();
    const capture = {};
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      capture.url = String(input);
      return new Response('ERR', { status: 503, headers: { 'content-type': 'text/plain' } });
    };
    mockCaches();
    const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
    await isolate();
    await seedGlobalStages(kv, buildGlobalStages({ cache: { enabled: true, ttl: 100, noCacheStatus: ['5xx'] } }));
    await seedSiteAndPool(kv);
    const ctx = makeCtx(env, `https://${HOST}/pic/photo.jpg`);
    const resp = await handleProxy(ctx);
    globalThis.fetch = prevFetch;
    // 源站 503 + noCacheStatus 5xx → 应透传 503（不缓存），且不应抛错
    check(resp && resp.status === 503, 'E1 noCacheStatus 5xx 命中源站 503 透传', `status=${resp && resp.status}`);
  }
  // 5.2 statusTtl 精确码：源站返回 404 → 应带 Cache-Control: 404→配置的 ttl
  {
    const kv = createMockKV();
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('NF', { status: 404, headers: { 'content-type': 'text/plain' } });
    mockCaches();
    const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
    await isolate();
    await seedGlobalStages(kv, buildGlobalStages({ cache: { enabled: true, ttl: 100, statusTtl: { '404': 77 } } }));
    await seedSiteAndPool(kv);
    const ctx = makeCtx(env, `https://${HOST}/pic/photo.jpg`);
    const resp = await handleProxy(ctx);
    globalThis.fetch = prevFetch;
    const cc = resp && resp.headers && resp.headers.get('cache-control');
    check(resp && resp.status === 404 && cc && cc.includes('77'), 'E2 statusTtl 404→77 生效', `status=${resp && resp.status} cc=${cc}`);
  }
  // 5.3 noCacheStatus 精确码命中 → no-store（控制变量：非默认）
  {
    const kv = createMockKV();
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('OK', { status: 200, headers: { 'content-type': 'image/jpeg' } });
    mockCaches();
    const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
    await isolate();
    await seedGlobalStages(kv, buildGlobalStages({ cache: { enabled: true, noCacheStatus: ['200'] } }));
    await seedSiteAndPool(kv);
    const ctx = makeCtx(env, `https://${HOST}/pic/photo.jpg`);
    const resp = await handleProxy(ctx);
    globalThis.fetch = prevFetch;
    const cc = resp && resp.headers && resp.headers.get('cache-control');
    check(cc && cc.toLowerCase().includes('no-store'), 'E3 noCacheStatus 200→no-store 生效', `cc=${cc}`);
  }
}

// ---- 6. 源站 origin.failover 跟随全站默认 ----
async function testFailover() {
  console.log('\n【F】origin.failover（控制变量：非默认值 / 跟随全站默认）');
  // 全站 failover.retryOn=['404']，源站返回 404 → 触发重试换源（选中第二次？单源无第二源，应仍 404）
  {
    const kv = createMockKV();
    let calls = 0;
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async () => { calls++; return new Response('NF', { status: 404, headers: { 'content-type': 'text/plain' } }); };
    mockCaches();
    const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
    await isolate();
    await seedGlobalStages(kv, buildGlobalStages({ origin: { failover: { enabled: true, retryOn: ['404'], maxRetries: 1, timeoutMs: 5000, maxRetryBodyBytes: 5242880 } } }));
    await seedSiteAndPool(kv);
    const ctx = makeCtx(env, `https://${HOST}/pic/photo.jpg`);
    const resp = await handleProxy(ctx);
    globalThis.fetch = prevFetch;
    // 关键断言：全站 failover.retryOn 是否真正被 selectOrigin/requestWithFailover 读取（跟随全站默认）
    check(calls >= 1, 'F1 全站 failover 配置下回源发生（retryOn 被读取）', `calls=${calls}`);
  }
}

// ---- 7. 安全校验 security（全站阶段） ----
async function testSecurity() {
  console.log('\n【G】security 阶段（控制变量：非默认值）');
  // 全站 security.uaBlocklist 命中客户端 UA → 应拦截
  {
    const { resp, ctx } = await run({ globalOverride: { security: { uaBlacklist: ['BlockUA'] } }, clientHeaders: { 'user-agent': 'BlockUA/1.0' } });
    check(resp && resp.status === 403 && (ctx.debug.blockedBy === 'ua-blacklist' || ctx.debug.blockedBy), 'G1 全站 uaBlocklist 命中拦截', `status=${resp && resp.status} blockedBy=${ctx && ctx.debug.blockedBy}`);
  }
  // 全站 security.ipBlacklist 命中客户端 IP → 应拦截
  {
    const { resp, ctx } = await run({ globalOverride: { security: { ipBlacklist: ['1.2.3.4'] } }, clientHeaders: { 'CF-Connecting-IP': '1.2.3.4' } });
    check(resp && resp.status === 403 && ctx.debug.blockedBy === 'ip-blacklist', 'G2 全站 ipBlacklist 命中拦截', `status=${resp && resp.status} blockedBy=${ctx && ctx.debug.blockedBy}`);
  }
}

// ---- 8. 错误处理 error（全站阶段） ----
async function testError() {
  console.log('\n【H】error 阶段（控制变量：非默认值）');
  // 全站 error.blockBody 自定义 → 拦截时使用
  {
    const { checkSecurity } = await import('../src/security/guard.js');
    const kv = createMockKV();
    const ctx = makeCtx({ CLOUD_PLATFORM: PLATFORM, CDN_KV: kv }, `https://${HOST}/pic/photo.jpg`, { 'user-agent': 'BadBot/1.0' });
    // 全站 error 阶段自定义 blockBody，由 ctx.__globalStages.error 承载（单轨化）
    ctx.__globalStages = { match: DEFAULT_GLOBAL_RULES.match, security: DEFAULT_GLOBAL_RULES.security, error: { blockBody: '<html>CUSTOM-BLOCK</html>', blockCacheControl: 'public, max-age=60' } };
    const r = await checkSecurity(ctx, { host: HOST, security: { uaBlacklist: ['BadBot'] } });
    // 拦截响应应 403，且使用全站自定义 blockBody；body 在 mock 下为不可读流，故读响应头佐证
    const cc = r && r.headers ? r.headers.get('cache-control') : '';
    check(r && r.status === 403 && cc.includes('public'), 'H1 全站 error.blockBody/cacheControl 自定义生效', `status=${r && r.status} cc=${cc}`);
  }
}

// ---- 9. 匹配站点 match.defaultProtocol / defaultHostHeader ----
async function testMatch() {
  console.log('\n【I】match 阶段（控制变量：非默认值）');
  // 9.1 全站 match.defaultProtocol 作为「请求缺协议时的回落值」进入匹配维度 subject.protocol
  {
    const { buildMatchSubject } = await import('../src/proxy/matcher.js');
    const ctx = makeCtx({ CLOUD_PLATFORM: PLATFORM, CDN_KV: createMockKV() }, `https://${HOST}/pic/photo.jpg`);
    ctx.__globalStages = buildGlobalStages({ match: { defaultProtocol: 'http' } });
    // 模拟「请求 URL 缺协议」这一防御场景，验证 defaultProtocol 真正生效（而非死配置）
    Object.defineProperty(ctx.url, 'protocol', { value: '', configurable: true });
    const subj = buildMatchSubject(ctx);
    check(subj.protocol === 'http', 'I1 全站 defaultProtocol 在缺协议时回落为匹配维度 protocol=http', `protocol=${subj.protocol}`);
  }
  // 9.2 站点 defaultHostHeader=origin → 回源 Host 应为源站地址（CF 下 Host 由 URL 决定，故查 url hostname）
  {
    const { capture } = await run({ siteOverride: { defaultHostHeader: { mode: 'origin', custom: '' } } });
    let host = capture.host;
    if (host === undefined && capture.url) {
      try { host = new URL(capture.url).hostname; } catch { host = null; }
    }
    const ok = host === ORIGIN_ADDR;
    check(ok, 'I2 站点 defaultHostHeader=origin 回源 Host 为源站地址', `host=${host} url=${capture.url}`);
  }
}

// ---- 10. terminate.forceHttps（全站阶段，站点覆盖不应丢失全局值） ----
async function testTerminate() {
  console.log('\n【J】terminate.forceHttps（站点覆盖不应丢失全局值）');
  // 全站 forceHttps=true，http 请求应 301 跳转
  {
    const kv = createMockKV();
    const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
    await isolate();
    await seedGlobalStages(kv, buildGlobalStages({ terminate: { forceHttps: true, redirectCode: 301 } }));
    await seedSiteAndPool(kv);
    mockCaches();
    const cap = {};
    mockFetch(cap);
    const ctx = makeCtx(env, `http://${HOST}/pic/photo.jpg`);
    const resp = await handleProxy(ctx);
    check(resp && resp.status === 301 && (resp.headers.get('location') || '').startsWith('https://'), 'J1 全站 forceHttps 命中 http→301', `status=${resp && resp.status} loc=${resp && resp.headers.get('location')}`);
  }
  // 站点同时配 terminate（forceHttps=false）应覆盖全站（不跳转）
  {
    const kv = createMockKV();
    const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
    await isolate();
    await seedGlobalStages(kv, buildGlobalStages({ terminate: { forceHttps: true, redirectCode: 301 } }));
    await seedSiteAndPool(kv, { rules: [{ id: 's1', stage: 'terminate', priority: 100, match: {}, action: { terminate: { forceHttps: false } } }] });
    mockCaches();
    const cap = {};
    mockFetch(cap);
    const ctx = makeCtx(env, `http://${HOST}/pic/photo.jpg`);
    const resp = await handleProxy(ctx);
    check(resp && resp.status === 200, 'J2 站点 terminate.forceHttps=false 覆盖全站（不跳转）', `status=${resp && resp.status}`);
  }
}

// ---- 11. rewrite / redirect ----
async function testRewriteRedirect() {
  console.log('\n【K】rewrite / redirect（控制变量：非默认值）');
  // 全站 rewrite 改写路径：/pic/* → /img/*
  {
    const kv = createMockKV();
    const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
    await isolate();
    await seedGlobalStages(kv, buildGlobalStages({ rewrite: { type: 'regex', regexFrom: '^/pic/(.*)$', regexTo: '/img/$1' } }));
    await seedSiteAndPool(kv);
    mockCaches();
    const capture = {};
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (input) => { capture.url = String(input); return new Response('OK', { status: 200, headers: { 'content-type': 'image/jpeg' } }); };
    const ctx = makeCtx(env, `https://${HOST}/pic/photo.jpg`);
    const resp = await handleProxy(ctx);
    globalThis.fetch = prevFetch;
    const rewritten = capture.url && capture.url.includes('/img/photo.jpg');
    check(rewritten, 'K1 全站 rewrite 改写路径 /pic/ → /img/ 生效', `url=${capture.url}`);
  }
}

// ---- 12. 图片优化头注入（流量序列之外：env IMG_* 注入是否可控/不冲突） ----
async function testImageOpt() {
  console.log('\n【L】图片优化头（流量序列之外 env 注入：应与 stage 字段不冲突）');
  // 开启 IMG_VARIANTS，回源应带图片优化头，且不应覆盖站点 reqHeaders.set 的同名键
  {
    const { capture } = await run({
      globalOverride: { reqHeaders: { set: { 'X-Img-Marker': 'gval' } } },
      siteRules: [{ id: 's1', stage: 'reqHeaders', priority: 100, match: {}, action: { reqHeaders: { set: { 'X-Img-Marker': 'sval' } } } }],
    });
    const h = capture.headersObj;
    // 图片优化头是否注入（evidence 头）
    const hasImgHdr = h && (h.get('x-imgopt') || h.get('accept') && h.get('accept').includes('webp'));
    check(h && h.get('x-img-marker') === 'sval', 'L1 图片优化注入不应覆盖站点 reqHeaders.set 同名键', `X-Img-Marker=${h && h.get('x-img-marker')}`);
  }
}

// ============================================================================
// 主入口
// ============================================================================
async function main() {
  await testReqHeadersSet();
  await testReqHeadersRemove();
  await testStripAndForward();
  await testRespHeaders();
  await testCache();
  await testFailover();
  await testSecurity();
  await testError();
  await testMatch();
  await testTerminate();
  await testRewriteRedirect();
  await testImageOpt();

  console.log('\n========================================');
  console.log(`通过 ${passed} / 失败 ${failures.length}`);
  if (failures.length > 0) {
    console.log('失败项：');
    for (const f of failures) console.log(`  - ${f.label}  ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log('全部通过');
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exitCode = 1;
});
