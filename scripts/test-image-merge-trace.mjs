/**
 * ============================================================================
 * 图片请求 · 全站规则 vs 站点规则 逐阶段合并追踪测试
 * ----------------------------------------------------------------------------
 * 目标：一个图片请求进来，全站规则用「内置默认」，站点规则设置一套
 *      「部分阶段有、部分没有、值完全不同」的规则，逐阶段打印：
 *
 *        [阶段] 全站该阶段(默认) → 站点命中/未命中 → 合并后 eff(临时结果)
 *
 *      最终打印客户端响应头，让你一眼看出「哪些环节被站点覆盖、
 *      哪些沿用全站、最终是全站生效还是站点生效」，据此判断当前
 *      pipeline.js ④ 合并块逻辑是否正确。
 *
 * 关键约束（来自 contracts / schema）：每条规则只属单一 stage，落库时
 *      已由 buildActionByStage 裁剪为仅含该阶段字段。故本测试按阶段
 *      逐条构造站点规则，覆盖全部 7 个阶段（部分阶段刻意不覆盖以验「沿用全站」）。
 *
 * 运行：node scripts/test-image-merge-trace.mjs
 * 纯测试脚本，不改动 src/ 任何源码。
 * ============================================================================
 */

import { handleProxy } from '../src/proxy/pipeline.js';
import { invalidateMemCache } from '../src/config/store.js';
import { detectCaps, resetCapsCache } from '../src/platform/caps.js';
import { encodeKey } from '../src/platform/keyCodec.js';
import { DEFAULT_GLOBAL_RULES } from '../src/config/defaults.js';
import { STAGE_ORDER } from '../src/config/stages.js';
import { matchRuleByStage } from '../src/proxy/matcher.js';
import { mergeStageHeaderOps } from '../src/proxy/rewrite.js';
import { deepClone } from '../src/config/defaults.js';

// ----------------------------------------------------------------------------
// 常量
// ----------------------------------------------------------------------------
const PLATFORM = 'cf';
const HOST = 'img.example.com';
const POOL_ID = 'pl_img';
const ORIGIN_ID = 'o_img';
const ORIGIN_ADDR = 'origin.example.net';
const IMG_URL = `https://${HOST}/photo/2024/logo.png`;

// 受控回源响应（图片）
const ORIGIN_RESP_STATUS = 200;
const ORIGIN_RESP_BODY = 'PNGDATA';
const ORIGIN_RESP_HEADERS = {
  'content-type': 'image/png',
  'content-length': '7',
  'cache-control': 'max-age=60',
  'set-cookie': 'sid=1',
  'x-frame-options': 'SAMEORIGIN',
  'x-origin-extra': 'keep-me',
  etag: '"abc"',
};

// ----------------------------------------------------------------------------
// 站点规则：全站默认 vs 站点「值完全不同」、部分阶段不覆盖
//
// 全站默认（DEFAULT_GLOBAL_RULES）回顾：
//   rewrite : {type:'none'}
//   redirect: {enabled:false,status:302,target:'',keepQuery:true}
//   terminate: {forceHttps:true, forceHttpsStatus:301, directResponse:{...}}
//   reqHeaders: set{User-Agent(Chrome131),Accept(html),Accept-Language,Accept-Encoding} / remove[]
//   origin: {hostHeader:{inherit},clientIpHeader:{off},followRedirect:false,originTimeoutMs:0,failover{...}}
//   cache: {enabled:false, mode:'ttl', edgeTtl:15552000, browserTtl:1800, ...}
//   respHeaders: set{server:'${product_name}', via:'1.1 ${product_name}'} / remove[CSP,XFO,Set-Cookie,...]
//
// 站点规则（值完全不同，且刻意「部分有/部分无」）：
//   ✗ rewrite   →【不覆盖】→ 沿用全站 none
//   ✓ redirect  → 站点改写：http→https 之外的场景测不到，这里给 enabled:true 302 到 /cdn-moved
//                 （注意 forceHttps 是 terminate 阶段，redirect 是另一阶段；这里演示 redirect 覆盖）
//   ✗ terminate →【不覆盖】→ 沿用全站 forceHttps=true/301
//   ✓ reqHeaders→ 站点完全替换 UA/Accept，并额外删掉 Accept-Language
//   ✓ origin    → 站点改 hostHeader 为 custom'img-cdn'、开启 clientIpHeader 改名 X-Real-IP
//   ✓ cache     → 站点开启缓存 edgeTtl=86400(1天) browserTtl=3600，与全站 180天/1800 完全不同
//   ✓ respHeaders→ 站点删掉全站 set 的 server/via（remove 应删全站 set key），
//                   并新增 x-img-tag 头；注意：站点【不】继承全站的 remove 列表（验证合并语义）
// ----------------------------------------------------------------------------
function buildSiteRules() {
  return [
    // reqHeaders 阶段
    {
      id: 'r-req',
      priority: 100,
      enabled: true,
      stage: 'reqHeaders',
      match: { conditions: [] },
      action: {
        reqHeaders: {
          set: {
            'User-Agent': 'SiteBot/2.0',
            Accept: 'image/*',
            'X-Site-Req': 'yes',
          },
          remove: ['Accept-Language'],
        },
      },
    },
    // origin 阶段
    {
      id: 'r-origin',
      priority: 100,
      enabled: true,
      stage: 'origin',
      match: { conditions: [] },
      action: {
        origin: {
          hostHeader: { mode: 'custom', custom: 'img-cdn.example.net' },
          clientIpHeader: { enabled: true, name: 'X-Real-IP' },
          followRedirect: true,
          originTimeoutMs: 5000,
        },
      },
    },
    // cache 阶段
    {
      id: 'r-cache',
      priority: 100,
      enabled: true,
      stage: 'cache',
      match: { conditions: [] },
      action: {
        cache: {
          enabled: true,
          mode: 'ttl',
          edgeTtl: 86400,
          staleWhileRevalidate: 0,
          browserTtl: 3600,
          ignoreQuery: false,
          queryWhitelist: [],
          key: { ignoreCase: false, includeScheme: false, headers: [], cookies: [] },
          statusTtl: {},
          preRefresh: false,
          preRefreshPercent: 80,
          offlineCache: false,
        },
      },
    },
    // respHeaders 阶段（关键：站点 remove 应删掉全站 set 的 server/via）
    {
      id: 'r-resp',
      priority: 100,
      enabled: true,
      stage: 'respHeaders',
      match: { conditions: [] },
      action: {
        respHeaders: {
          set: { 'x-img-tag': 'v1' },
          // 站点移除全站注入的 server + via（验证 mergeStageHeaderOps 在合并期删除全站 set key）
          remove: ['server', 'via'],
        },
      },
    },
    // 一条「不命中」的规则，验证跨阶段独立性（path 不匹配）
    {
      id: 'r-nohit',
      priority: 50,
      enabled: true,
      stage: 'reqHeaders',
      match: { conditions: [{ target: 'path', op: 'equal', values: ['/never/matches'] }] },
      action: { reqHeaders: { set: { 'X-Should-Not-Apply': '1' }, remove: [] } },
    },
  ];
}

// ----------------------------------------------------------------------------
// mock 环境
// ----------------------------------------------------------------------------
function createMockKV() {
  const map = new Map();
  return {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, v); },
    async delete(k) { map.delete(k); },
    _map: map,
  };
}

async function seedSiteAndPool(kv) {
  const site = {
    host: HOST,
    enabled: true,
    poolId: POOL_ID,
    defaultHostHeader: { mode: 'accel', custom: '' },
    rules: buildSiteRules(),
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
  };
  // 源站池：让 cache 真正生效需要 origin.cache 也允许，这里给源站开启缓存能力由规则覆盖
  const pool = {
    id: POOL_ID, name: 'img-pool', kind: 'single', strategy: 'chain',
    origins: [
      {
        id: ORIGIN_ID, enabled: true, order: 1, weight: 1, engine: 'fetch',
        scheme: 'https', addr: ORIGIN_ADDR, port: 443, pathPrefix: '',
        extraHeaders: {}, hostHeader: { mode: 'inherit', custom: '' }, sni: null,
        rewrite: { type: 'none', value: '', regexFrom: '', regexTo: '' },
        reqHeaders: { set: {}, remove: [] },
        respHeaders: { set: {}, remove: [] },
        cache: { enabled: false, mode: 'ttl', edgeTtl: 0, browserTtl: 0 },
        followRedirect: false, originTimeoutMs: 0,
        clientIpHeader: { enabled: false, name: 'X-Forwarded-For' },
      },
    ],
    failover: { enabled: true, retryOn: [500, 502, 503, 504, 522, 524], maxRetries: 2, timeoutMs: 10000 },
    createdBy: HOST, updatedAt: Date.now(),
  };
  // 刻意不预置 cfg:global_rules → getGlobalRules 走内置默认 DEFAULT_GLOBAL_RULES + settings
  await kv.put(encodeKey('site:_index'), JSON.stringify({ hosts: [HOST], wildcards: [] }));
  await kv.put(encodeKey('pool:_index'), JSON.stringify({ ids: [POOL_ID] }));
  await kv.put(encodeKey('site:' + HOST), JSON.stringify(site));
  await kv.put(encodeKey('pool:' + POOL_ID), JSON.stringify(pool));
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
  return () => { if (prev === undefined) delete globalThis.caches; else globalThis.caches = prev; };
}

function mockFetch(capture) {
  const prev = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    capture.url = String(input);
    capture.init = init;
    const h = init && init.headers ? init.headers : {};
    capture.headersObj = h instanceof Headers ? h : null;
    return new Response(ORIGIN_RESP_BODY, { status: ORIGIN_RESP_STATUS, headers: ORIGIN_RESP_HEADERS });
  };
  return () => { globalThis.fetch = prev; };
}

function makeCtx(env, urlStr) {
  const url = new URL(urlStr);
  const request = new Request(url, { method: 'GET', headers: { 'user-agent': 'TestClient/1.0', 'x-forwarded-for': '203.0.113.9' } });
  return { request, url, env, caps: detectCaps(env), waitUntil() {}, startTime: Date.now(), reqId: `test-${Math.random().toString(36).slice(2, 10)}`, debug: {} };
}

async function isolate() {
  invalidateMemCache();
  resetCapsCache();
  const cacheMod = await import('../src/platform/cache.js');
  cacheMod.resetCacheHandle && cacheMod.resetCacheHandle();
  cacheMod.resetCacheStats && cacheMod.resetCacheStats();
}

// ----------------------------------------------------------------------------
// 逐阶段合并追踪（复刻 pipeline.js ④ 合并块逻辑，调用真实函数）
// ----------------------------------------------------------------------------
function traceMerge(ctx) {
  const globalStages = deepClone(DEFAULT_GLOBAL_RULES); // 内置默认全站阶段
  const site = ctx.debug.siteHost ? null : null; // site 对象下面单独传入
  return { globalStages };
}

function fmt(v) {
  if (v === undefined || v === null) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ----------------------------------------------------------------------------
// 主场景
// ----------------------------------------------------------------------------
async function runImageScenario() {
  console.log('\n=== 图片请求逐阶段合并追踪 ===');
  console.log(`URL: ${IMG_URL}`);
  console.log(`全站规则: 内置默认 DEFAULT_GLOBAL_RULES`);
  console.log(`站点规则: 4 条覆盖(reqHeaders/origin/cache/respHeaders) + 1 条不命中(reqHeaders path=/never/matches)`);
  console.log(`刻意不覆盖阶段: rewrite(沿用全站 none)、redirect(沿用全站 enabled:false 不跳转)、terminate(沿用全站 forceHttps=301 对 https 不跳)`);
  console.log('');

  const kv = createMockKV();
  await seedSiteAndPool(kv);
  const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
  await isolate();

  const capture = {};
  const restoreFetch = mockFetch(capture);
  const restoreCaches = mockCaches();

  try {
    // 在驱动管线前，先独立跑一遍「逐阶段合并追踪」（用真实 matchRuleByStage）
    const siteDoc = JSON.parse(await kv.get(encodeKey('site:' + HOST)));
    const site = { host: siteDoc.host, rules: siteDoc.rules, poolId: siteDoc.poolId };
    const gStages = deepClone(DEFAULT_GLOBAL_RULES);
    const mergeCtx = { debug: {}, url: new URL(IMG_URL), request: new Request(IMG_URL, { method: 'GET', headers: { 'user-agent': 'TestClient/1.0' } }) };

    console.log('──────────────────────── 逐阶段合并过程 ────────────────────────');
    console.log(`  ${'阶段'.padEnd(12)} ${'全站默认(该阶段)'.padEnd(40)} ${'站点命中'.padEnd(10)} ${'合并后 eff (临时结果)'.padEnd(50)}`);
    console.log('  ' + '-'.repeat(118));

    const effAction = {};
    const traceRows = [];
    for (const stage of STAGE_ORDER) {
      const g = deepClone(gStages[stage] || {});
      const sr = matchRuleByStage(site, stage, mergeCtx);
      let eff, applied;
      if (sr) {
        const action = sr.action || {};
        eff = deepClone(g);
        for (const k of Object.keys(action)) {
          if (k === 'set' || k === 'remove') {
            // HeaderOps 段：用 mergeStageHeaderOps（全站→站点，站点 remove 删全站 set key）
            const merged = mergeStageHeaderOps(g, action);
            eff[k] = merged[k];
          } else {
            eff[k] = deepClone(action[k]);
          }
        }
        applied = `站点「${sr.id}」`;
      } else {
        eff = deepClone(g);
        applied = '全站(无命中)';
        mergeCtx.debug.ruleSource = mergeCtx.debug.ruleSource || {};
        mergeCtx.debug.ruleSource[stage] = 'global';
      }
      Object.assign(effAction, eff);
      const gStr = fmt(g);
      const effStr = fmt(eff).slice(0, 48);
      console.log(`  ${stage.padEnd(12)} ${gStr.padEnd(40).slice(0, 40)} ${applied.padEnd(10)} ${effStr}`);
      traceRows.push({ stage, g, applied, eff });
    }
    console.log('────────────────────────────────────────────────────────────────');
    console.log('');
    console.log('合并后的完整 effAction（喂给下游处理的临时结果）:');
    console.log('  ' + JSON.stringify(effAction, null, 2));
    console.log('');

    // 现在真正驱动管线，看最终实际结果
    const ctx = makeCtx(env, IMG_URL);
    const resp = await handleProxy(ctx);
    const h = resp.headers;

    console.log('──────────────────────── 管线实际执行结果 ────────────────────────');
    console.log(`  ctx.debug.ruleSource: ${fmt(ctx.debug.ruleSource)}`);
    console.log(`  ctx.debug.ruleIds:    ${fmt(ctx.debug.ruleIds)}`);
    console.log(`  ctx.debug.ruleId:     ${fmt(ctx.debug.ruleId)}`);
    console.log(`  ctx.debug.cache:      ${fmt(ctx.debug.cache)}`);
    console.log(`  ctx.debug.originId:   ${fmt(ctx.debug.originId)}`);
    console.log(`  ctx.debug.siteId:     ${fmt(ctx.debug.siteId)}`);
    console.log('');

    console.log('最终客户端响应:');
    console.log(`  status: ${resp.status} ${resp.statusText || ''}`);
    console.log('  headers:');
    for (const [k, v] of h) console.log(`    ${k}: ${v}`);
    const body = await resp.text();
    console.log(`  body: ${body}`);
    console.log('');

    // 回源请求头（验证 reqHeaders 站点覆盖）
    console.log('回源请求(被 mock fetch 捕获):');
    console.log(`  url:    ${fmt(capture.url)}`);
    if (capture.headersObj instanceof Headers) {
      const ua = capture.headersObj.get('user-agent');
      const accept = capture.headersObj.get('accept');
      const al = capture.headersObj.get('accept-language');
      const xsr = capture.headersObj.get('x-site-req');
      console.log(`  User-Agent:      ${fmt(ua)}      ← 期望站点 SiteBot/2.0（覆盖全站 Chrome131）`);
      console.log(`  Accept:          ${fmt(accept)}      ← 期望站点 image/*（覆盖全站 html）`);
      console.log(`  Accept-Language: ${fmt(al)}  ← 期望被站点 remove 删掉`);
      console.log(`  X-Site-Req:      ${fmt(xsr)}  ← 期望站点新增`);
    }
    console.log('');

    // 断言核对：逐字段判断「全站生效 / 站点生效」
    const checks = [];
    const ck = (label, cond, expect, actual) => {
      checks.push({ label, ok: !!cond, expect, actual });
      console.log(`  [${cond ? '✓' : '✗'}] ${label}: 期望=${expect} 实际=${actual}`);
    };

    console.log('──────────────────────── 逐项判定（全站 vs 站点） ────────────────────────');
    // redirect 站点未覆盖 → 沿用全站 enabled:false → 不跳转（请求走完全程）
    // reqHeaders 站点覆盖：UA/Accept 应被站点值覆盖，Accept-Language 被删，X-Site-Req 新增
    ck('reqHeaders 站点覆盖 UA', capture.headersObj instanceof Headers && capture.headersObj.get('user-agent') === 'SiteBot/2.0', 'SiteBot/2.0', capture.headersObj?.get?.('user-agent'));
    ck('reqHeaders 站点覆盖 Accept', capture.headersObj instanceof Headers && capture.headersObj.get('accept') === 'image/*', 'image/*', capture.headersObj?.get?.('accept'));
    ck('reqHeaders 站点 remove Accept-Language', capture.headersObj instanceof Headers && !capture.headersObj.has('accept-language'), '已删除', capture.headersObj?.has?.('accept-language') ? '存在' : '已删除');
    ck('reqHeaders 站点新增 X-Site-Req', capture.headersObj instanceof Headers && capture.headersObj.get('x-site-req') === 'yes', 'yes', capture.headersObj?.get?.('x-site-req'));
    // 修复后：server/via 不再由引擎外 settings 独立注入，而是统一来自全站规则
    // stages.respHeaders.set，经 applyHeaderOps 处理；站点 remove 删掉了 effAction 中
    // 的 server/via，因此最终响应里不应再出现这两个品牌头。
    ck('respHeaders 合并期已删全站 set 的 server', effAction.respHeaders && !('server' in (effAction.respHeaders.set || {})), 'effAction.respHeaders.set 无 server', effAction.respHeaders && JSON.stringify(effAction.respHeaders.set));
    ck('respHeaders 合并期已删全站 set 的 via', effAction.respHeaders && !('via' in (effAction.respHeaders.set || {})), 'effAction.respHeaders.set 无 via', effAction.respHeaders && JSON.stringify(effAction.respHeaders.set));
    ck('最终响应无 Server 头(站点 remove 真正生效)', !h.has('server'), '无 server', h.get('server') || '(无)');
    ck('最终响应无 Via 头(站点 remove 真正生效)', !h.has('via'), '无 via', h.get('via') || '(无)');
    ck('respHeaders 站点新增 x-img-tag', h.get('x-img-tag') === 'v1', 'v1', h.get('x-img-tag'));
    ck('cache 站点覆盖(debug.cache 走缓存判定，非全站 BYPASS)', ctx.debug.cache !== 'BYPASS' && ctx.debug.cache !== undefined, '非 BYPASS(站点 enabled:true)', ctx.debug.cache);
    ck('redirect 沿用全站(enabled:false 不跳转)', resp.status === 200, '200(未跳转)', resp.status);
    ck('terminate 沿用全站 forceHttps=301（https 请求不跳转）', resp.status === 200, '200(https 不跳转)', resp.status);
    ck('rewrite 沿用全站 none（无重写）', capture.url === IMG_URL, IMG_URL, capture.url);

    const failed = checks.filter((c) => !c.ok);
    console.log('');
    console.log(`判定: 通过 ${checks.length - failed.length}/${checks.length}` + (failed.length ? `，失败 ${failed.length}` : '，全部通过 ✅'));
    if (failed.length) {
      console.log('失败项:');
      for (const f of failed) console.log(`  - ${f.label}`);
    }
  } finally {
    restoreFetch();
    restoreCaches();
  }
}

// ----------------------------------------------------------------------------
// 入口
// ----------------------------------------------------------------------------
async function main() {
  console.log('=== 图片请求：全站规则(内置默认) vs 站点规则(值完全不同) 逐阶段合并追踪测试 ===');
  await runImageScenario();
}

main().catch((err) => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
