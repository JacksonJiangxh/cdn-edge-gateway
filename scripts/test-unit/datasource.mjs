/**
 * scripts/test-unit/datasource.mjs —— 数据面管线追踪 单测
 * 并入原 test-global-fallback.mjs 与 test-image-merge-trace.mjs：
 * 驱动真实数据面管线 handleProxy（src/proxy/pipeline.js 的 runPipeline），
 * 校验「站点命中但无规则 → 全站兜底」「站点规则 vs 全站默认逐阶段合并」两类
 * 关键流量序列，断言改为严格 status/响应头/debug 字段校验（去除松散子串判断）。
 *
 * 复用 _testkit.mjs 的 createMockKV / withFakeFetch，消除孤儿脚本的同构 mock。
 */
import assert from 'node:assert';
import { handleProxy } from '../../src/proxy/pipeline.js';
import { invalidateMemCache } from '../../src/config/store.js';
import { detectCaps, resetCapsCache } from '../../src/platform/caps.js';
import { encodeKey } from '../../src/platform/keyCodec.js';
import { STAGE_ORDER } from '../../src/config/stages.js';
import { matchRuleByStage } from '../../src/proxy/matcher.js';
import { mergeStageHeaderOps } from '../../src/proxy/rewrite.js';
import { deepClone } from '../../src/config/factory.js';
import { DEFAULT_GLOBAL_RULES } from '../../src/config/stages-defaults.js';
import { test, testA } from './_testkit.mjs';
import { createMockKV } from './_testkit.mjs';

const PLATFORM = 'cf';
const HOST = 'example.com';
const POOL_ID = 'pl_origin';
const ORIGIN_ID = 'o1';
const ORIGIN_ADDR = 'origin.example.net';

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

async function isolate() {
  invalidateMemCache();
  resetCapsCache();
  const cacheMod = await import('../../src/platform/cache.js');
  cacheMod.resetCacheHandle && cacheMod.resetCacheHandle();
  cacheMod.resetCacheStats && cacheMod.resetCacheStats();
}

function buildSite(overrides = {}) {
  return {
    host: HOST,
    enabled: true,
    poolId: POOL_ID,
    defaultHostHeader: { mode: 'accel', custom: '' },
    rules: [],
    security: {
      refererMode: 'off', refererList: [], allowEmptyReferer: true,
      uaBlacklist: [], ipBlacklist: [], ipWhitelist: [],
      signedUrl: { enabled: false, secret: '', ttl: 3600, param: 'sign' },
      rateLimit: { enabled: false, rpm: 600 },
      botManagement: { enabled: false, mode: 'blacklist', list: [] },
    },
    ipv6Support: false,
    cacheGen: 0,
    updatedAt: Date.now(),
    ...overrides,
  };
}

function buildPool() {
  return {
    id: POOL_ID, name: 'origin-pool', kind: 'single', strategy: 'chain',
    origins: [{
      id: ORIGIN_ID, enabled: true, order: 1, weight: 1, engine: 'fetch',
      scheme: 'https', addr: ORIGIN_ADDR, port: 443, pathPrefix: '',
      extraHeaders: {}, hostHeader: { mode: 'inherit', custom: '' }, sni: null,
      rewrite: { type: 'none', value: '', regexFrom: '', regexTo: '' },
      reqHeaders: { set: {}, remove: [] }, respHeaders: { set: {}, remove: [] },
      cache: { enabled: false, mode: 'ttl', edgeTtl: 0, browserTtl: 0 },
      followRedirect: false, originTimeoutMs: 0,
      clientIpHeader: { enabled: false, name: 'X-Forwarded-For' },
    }],
    failover: { enabled: true, retryOn: [500, 502, 503, 504, 522, 524], maxRetries: 2, timeoutMs: 10000 },
    createdBy: HOST, updatedAt: Date.now(),
  };
}

async function seedSiteAndPool(kv, site, pool) {
  const h = site.host || HOST;
  // 键合并后站点族/源站池族分别落盘 cfg:sites / cfg:pools 单键（物理键经 encodeKey）
  await kv.put(encodeKey('cfg:sites'), JSON.stringify({ hosts: [h], wildcards: [], byHost: { [h]: site } }));
  await kv.put(encodeKey('cfg:pools'), JSON.stringify({ ids: [POOL_ID], byId: { [POOL_ID]: pool } }));
}

function makeCtx(env, urlStr) {
  const url = new URL(urlStr);
  const request = new Request(url, {
    method: 'GET',
    headers: { 'user-agent': 'TestClient/1.0', 'x-forwarded-for': '203.0.113.9' },
  });
  return {
    request, url, env, caps: detectCaps(env), waitUntil() {},
    startTime: Date.now(), reqId: `test-${Math.random().toString(36).slice(2, 10)}`, debug: {},
  };
}

// ===== 场景 1：站点命中、无规则 → 全站兜底 =====
test('datasource: https 走全站兜底 7 阶段 + 响应头改写', async () => {
  const kv = createMockKV();
  await seedSiteAndPool(kv, buildSite(), buildPool());
  const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
  await isolate();

  const capture = {};
  const restoreFetch = (() => {
    const prev = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      capture.url = String(input);
      capture.init = init;
      const hdrs = init && init.headers;
      capture.headersObj = hdrs;
      capture.headerGet = (k) => (hdrs && typeof hdrs.get === 'function' ? hdrs.get(k) : (hdrs ? hdrs[k] : undefined));
      return new Response('<html>hello-from-origin</html>', {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'set-cookie': 'sid=1',
          'content-security-policy': "default-src 'self'",
          'x-frame-options': 'DENY',
          'x-origin-extra': 'keep-me',
        },
      });
    };
    return () => { globalThis.fetch = prev; };
  })();
  const restoreCaches = mockCaches();

  try {
    const ctx = makeCtx(env, `https://${HOST}/`);
    const resp = await handleProxy(ctx);

    assert.strictEqual(ctx.debug.siteId, HOST, '应命中 example.com');
    assert.strictEqual(ctx.debug.blockedBy, undefined, '默认安全全关应放行');
    assert.strictEqual(ctx.debug.originId, ORIGIN_ID, '应选中 o1');
    assert.strictEqual(ctx.debug.ruleId, undefined, '无站点规则 → ruleId 应为空');
    assert.strictEqual(resp.status, 200, 'https 不触发 forceHttps 跳转');
    assert.strictEqual(ctx.debug.cache, 'BYPASS', '全局 cache.enabled=false → BYPASS');

    assert.ok(capture.url, '应发生回源 fetch');
    assert.strictEqual(capture.url, `https://${HOST}/`, 'accel 模式回源 authority 应为加速域名');

    const h = resp.headers;
    assert.strictEqual(h.get('server'), 'EdgeGateway', 'Server 应为 EdgeGateway');
    assert.strictEqual(h.get('via'), '1.1 EdgeGateway', 'Via 应为 1.1 EdgeGateway');
    assert.ok(!h.has('set-cookie'), '应剥离 set-cookie');
    assert.ok(!h.has('content-security-policy'), '应剥离 CSP');
    assert.ok(!h.has('x-frame-options'), '应剥离 XFO');
    assert.strictEqual(h.get('x-cache'), 'BYPASS', 'X-Cache 应为 BYPASS');
    assert.strictEqual(h.get('x-origin-id'), ORIGIN_ID, 'X-Origin-Id 应为 o1');

    const body = await resp.text();
    assert.strictEqual(body, '<html>hello-from-origin</html>', 'body 应原样透传');
  } finally {
    restoreFetch();
    restoreCaches();
  }
});

test('datasource: http 触发全站兜底 forceHttps → 301', async () => {
  const kv = createMockKV();
  await seedSiteAndPool(kv, buildSite(), buildPool());
  const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
  await isolate();

  const capture = {};
  const restoreFetch = (() => {
    const prev = globalThis.fetch;
    globalThis.fetch = async () => {
      capture.url = 'should-not-happen';
      return new Response('x', { status: 200 });
    };
    return () => { globalThis.fetch = prev; };
  })();
  const restoreCaches = mockCaches();

  try {
    const ctx = makeCtx(env, `http://${HOST}/`);
    const resp = await handleProxy(ctx);
    assert.strictEqual(capture.url, undefined, 'http 应被 terminate 拦截、不发生回源');
    assert.strictEqual(resp.status, 301, 'forceHttps 默认 301');
    assert.strictEqual(resp.headers.get('location'), `https://${HOST}/`, 'Location 应指向 https');
    assert.strictEqual(resp.headers.get('server'), 'EdgeGateway', 'Server 应为 EdgeGateway');
    assert.strictEqual(resp.headers.get('cache-control'), 'no-store', '301 应带 no-store');
  } finally {
    restoreFetch();
    restoreCaches();
  }
});

// ===== 场景 2：站点规则 vs 全站默认 逐阶段合并 =====
function buildImageSite() {
  return buildSite({
    host: 'img.example.com',
    rules: [
      { id: 'r-req', priority: 100, enabled: true, stage: 'reqHeaders', match: { conditions: [] },
        action: { reqHeaders: { set: { 'User-Agent': 'SiteBot/2.0', Accept: 'image/*', 'X-Site-Req': 'yes' }, strip: [{ type: 'exact', value: 'accept-language' }] } } },
      { id: 'r-origin', priority: 100, enabled: true, stage: 'origin', match: { conditions: [] },
        action: { origin: { hostHeader: { mode: 'custom', custom: 'img-cdn.example.net' }, clientIpHeader: { enabled: true, name: 'X-Real-IP' }, followRedirect: true, originTimeoutMs: 5000 } } },
      { id: 'r-cache', priority: 100, enabled: true, stage: 'cache', match: { conditions: [] },
        action: { cache: { enabled: true, mode: 'ttl', edgeTtl: 86400, staleWhileRevalidate: 0, browserTtl: 3600, ignoreQuery: false, queryWhitelist: [], key: { ignoreCase: false, includeScheme: false, headers: [], cookies: [] }, statusTtl: {}, preRefresh: false, preRefreshPercent: 80, offlineCache: false } } },
      { id: 'r-resp', priority: 100, enabled: true, stage: 'respHeaders', match: { conditions: [] },
        action: { respHeaders: { set: { 'x-img-tag': 'v1' }, strip: [{ type: 'exact', value: 'server' }, { type: 'exact', value: 'via' }] } } },
      { id: 'r-nohit', priority: 50, enabled: true, stage: 'reqHeaders', match: { conditions: [{ target: 'path', op: 'equal', values: ['/never/matches'] }] },
        action: { reqHeaders: { set: { 'X-Should-Not-Apply': '1' }, strip: [] } } },
    ],
  });
}

test('datasource: 站点规则覆盖全站默认（逐阶段合并语义）', async () => {
  const kv = createMockKV();
  await seedSiteAndPool(kv, buildImageSite(), buildPool());
  const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
  await isolate();

  const capture = {};
  const restoreFetch = (() => {
    const prev = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      capture.url = String(input);
      capture.init = init;
      const hdrs = init && init.headers;
      capture.headersObj = hdrs;
      capture.headerGet = (k) => (hdrs && typeof hdrs.get === 'function' ? hdrs.get(k) : (hdrs ? hdrs[k] : undefined));
      return new Response('PNGDATA', {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '7', 'cache-control': 'max-age=60', 'set-cookie': 'sid=1', 'x-frame-options': 'SAMEORIGIN', 'x-origin-extra': 'keep-me', etag: '"abc"' },
      });
    };
    return () => { globalThis.fetch = prev; };
  })();
  const restoreCaches = mockCaches();

  try {
    const ctx = makeCtx(env, 'https://img.example.com/photo/2024/logo.png');
    const resp = await handleProxy(ctx);
    const h = resp.headers;

    // 站点 reqHeaders 覆盖（UA/Accept 覆盖全站、Accept-Language 删除、X-Site-Req 新增）
    assert.strictEqual(capture.headerGet('user-agent'), 'SiteBot/2.0', '站点覆盖 UA');
    assert.strictEqual(capture.headerGet('accept'), 'image/*', '站点覆盖 Accept');
    assert.ok(!capture.headerGet('accept-language'), '站点 strip 删除了 Accept-Language');
    assert.strictEqual(capture.headerGet('x-site-req'), 'yes', '站点新增 X-Site-Req');

    // 站点 respHeaders strip 删掉全站 set 的 server/via → 最终响应不含
    assert.ok(!h.has('server'), '站点 strip 真正移除了 Server');
    assert.ok(!h.has('via'), '站点 strip 真正移除了 Via');
    assert.strictEqual(h.get('x-img-tag'), 'v1', '站点新增 x-img-tag');

    // 站点 cache 覆盖（非全站 BYPASS）
    assert.notStrictEqual(ctx.debug.cache, 'BYPASS', '站点 cache.enabled=true → 非 BYPASS');

    // 未覆盖阶段沿用全站：redirect 全站 enabled:false 不跳转、terminate 全站 https 不跳、rewrite 全站 none
    assert.strictEqual(resp.status, 200, 'redirect/terminate 沿用全站默认 → 不跳转');
    assert.strictEqual(capture.url, 'https://img.example.com/photo/2024/logo.png', 'rewrite 沿用全站 none');
  } finally {
    restoreFetch();
    restoreCaches();
  }
});

testA('datasource: 合并期 headerOps 用 mergeStageHeaderOps（站点 strip(exact) 删全站 set key）', (a) => {
  const g = deepClone(DEFAULT_GLOBAL_RULES.respHeaders);
  const siteAction = { set: { 'x-img-tag': 'v1' }, strip: [{ type: 'exact', value: 'server' }, { type: 'exact', value: 'via' }] };
  const merged = mergeStageHeaderOps(g, siteAction);
  a.equal('server' in (merged.set || {}), false, '站点 strip(exact) 删掉全站 set 的 server');
  a.equal('via' in (merged.set || {}), false, '站点 strip(exact) 删掉全站 set 的 via');
  a.equal(merged.set['x-img-tag'], 'v1', '站点新增 x-img-tag 保留');
});

testA('datasource: matchRuleByStage 跨阶段独立（不命中规则不影响其它阶段）', (a) => {
  const site = { rules: buildImageSite().rules };
  const mctx = { debug: {}, url: new URL('https://img.example.com/x'), request: new Request('https://img.example.com/x') };
  const reqHit = matchRuleByStage(site, 'reqHeaders', mctx);
  const cacheHit = matchRuleByStage(site, 'cache', mctx);
  a.notEqual(reqHit, null, 'reqHeaders 阶段命中 r-req');
  a.notEqual(cacheHit, null, 'cache 阶段命中 r-cache');
  // r-nohit 路径不匹配，不应污染 reqHeaders 命中结果
  a.equal(reqHit.id, 'r-req', 'reqHeaders 命中应为 r-req（不受 r-nohit 干扰）');
});
