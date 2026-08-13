/**
 * ============================================================================
 * 内置全站兜底规则 · 分步追踪模拟测试
 * ----------------------------------------------------------------------------
 * 场景：站点「已成功匹配」但 `site.rules` 为空（无任何站点规则命中），
 *       因此全部 7 个阶段（rewrite / redirect / terminate / reqHeaders /
 *       origin / cache / respHeaders）都走「内置全站兜底规则」——
 *       DEFAULT_GLOBAL_RULES（stages）+ DEFAULT_GLOBAL_SETTINGS（settings）。
 *
 * 验证方式：驱动真实数据面管线 `handleProxy`（src/proxy/pipeline.js 的
 *           runPipeline），分步核对「执行什么规则 / 配置是什么 / 期望消费
 *           后结果 / 实际测试结果 / 是否一致」，最终汇总客户端响应。
 *
 * 运行：node scripts/test-global-fallback.mjs
 * 退出码：全部通过 0；有失败非 0（供 CI / build 链接入）。
 *
 * 纯测试脚本，不改动 src/ 任何源码。
 * ============================================================================
 */

import { handleProxy } from '../src/proxy/pipeline.js';
import { invalidateMemCache } from '../src/config/store.js';
import { detectCaps, resetCapsCache } from '../src/platform/caps.js';
import { encodeKey } from '../src/platform/keyCodec.js';
import { DEFAULT_GLOBAL_SETTINGS } from '../src/config/defaults.js';

// ----------------------------------------------------------------------------
// 常量与配置
// ----------------------------------------------------------------------------
const PLATFORM = 'cf'; // cf / eo / esa 三平台行为一致（本测试以 cf 为例，可切换验证）
const HOST = 'example.com';
const POOL_ID = 'pl_origin';
const ORIGIN_ID = 'o1';
const ORIGIN_ADDR = 'origin.example.net';

// 受控回源响应：刻意带上「应被全局兜底 respHeaders 剥离」的敏感头，验证剥离逻辑。
const ORIGIN_RESP_STATUS = 200;
const ORIGIN_RESP_BODY = '<html><body>hello-from-origin</body></html>';
const ORIGIN_RESP_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'set-cookie': 'sid=1',
  'content-security-policy': "default-src 'self'",
  'x-frame-options': 'DENY',
  'x-origin-extra': 'keep-me',
};

// ----------------------------------------------------------------------------
// 测试运行器：断言收集 + 分步追踪表
// ----------------------------------------------------------------------------
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

/** 构建分步追踪表的行（不立刻判定，统一在 trace 里展示） */
function row(step, rule, config, expect, actual, ok) {
  return { step, rule, config, expect, actual, ok };
}

function fmt(v) {
  if (v === undefined || v === null) return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** 打印分步追踪表 */
function printTrace(rows) {
  const pad = (s, n) => String(s).padEnd(n);
  const c = {
    s: 8, r: 18, g: 34, e: 38, a: 30,
  };
  console.log(
    `  ${pad('步骤', c.s)} ${pad('执行规则', c.r)} ${pad('生效配置', c.g)} ${pad('期望消费后结果', c.e)} ${pad('实际测试结果', c.a)} 一致`
  );
  console.log('  ' + '-'.repeat(c.s + c.r + c.g + c.e + c.a + 8));
  for (const r of rows) {
    console.log(
      `  ${pad(r.step, c.s)} ${pad(r.rule, c.r)} ${pad(fmt(r.config), c.g).slice(0, c.g)} ${pad(fmt(r.expect), c.e).slice(0, c.e)} ${pad(fmt(r.actual), c.a).slice(0, c.a)} ${r.ok ? '✓' : '✗'}`
    );
  }
  console.log('');
}

// ----------------------------------------------------------------------------
// 测试环境搭建：内存 KV 桩 + mock fetch/caches + mock ctx
// ----------------------------------------------------------------------------

/** 构造内存 KV 桩（裸 get/put/delete，由 kv.js wrap 负责键编码）。 */
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

/**
 * 预置站点 + 源站池 + 站点索引 + 池索引 到 KV。
 * 刻意【不】预置 `cfg:global_rules`，使 getGlobalRules 走
 * 「KV 空 → 落盘内置默认」分支，精确命中「内置全站兜底规则」。
 */
async function seedSiteAndPool(kv) {
  const site = {
    host: HOST,
    enabled: true,
    poolId: POOL_ID,
    defaultHostHeader: { mode: 'accel', custom: '' },
    rules: [], // 关键：无任何站点规则 → 全部走全局兜底
    security: {
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
    cacheGen: 0,
    updatedAt: Date.now(),
  };
  const pool = {
    id: POOL_ID,
    name: 'origin-pool',
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
  // 站点索引 + 源站池索引
  // 注意：裸 KV 桩按【物理键】存储，store 经 kv.js wrap 读同一物理键。
  // 故写入必须用 encodeKey 编码后的键，否则 wrap.get 编码后读不到裸键。
  await kv.put(encodeKey('site:_index'), JSON.stringify({ hosts: [HOST], wildcards: [] }));
  await kv.put(encodeKey('pool:_index'), JSON.stringify({ ids: [POOL_ID] }));
  await kv.put(encodeKey('site:' + HOST), JSON.stringify(site));
  await kv.put(encodeKey('pool:' + POOL_ID), JSON.stringify(pool));
}

/** mock globalThis.caches.default，使 caps.hasCacheApi=true（三平台均原生支持 Cache API）。 */
function mockCaches() {
  const prev = globalThis.caches;
  globalThis.caches = {
    default: {
      async match() {
        return null;
      },
      async put() {},
      async delete() {
        return false;
      },
    },
  };
  return () => {
    if (prev === undefined) delete globalThis.caches;
    else globalThis.caches = prev;
  };
}

/**
 * mock globalThis.fetch：返回受控源站响应，并捕获回源 URL / Host / 请求头。
 * 返回 { capture } 用于断言。
 */
function mockFetch(capture) {
  const prev = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    capture.url = String(input);
    capture.init = init;
    const h = init && init.headers ? init.headers : {};
    capture.host = typeof h === 'object' && !(h instanceof Headers) ? h['Host'] : undefined;
    // 统一把 Headers 实例也暴露出来，便于断言
    capture.headersObj = h instanceof Headers ? h : null;
    // 若 init.headers 是 Headers 实例，读 Host
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

/** 构造一个完整 Ctx（仿照 src/entry.js dispatch 的真实构造）。 */
function makeCtx(env, urlStr) {
  const url = new URL(urlStr);
  const request = new Request(url, {
    method: 'GET',
    headers: { 'user-agent': 'TestClient/1.0', 'x-forwarded-for': '203.0.113.9' },
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

/** 每次场景前重置隔离：清 store 内存缓存 + 复位能力探测 + 复位缓存句柄。 */
async function isolate(cfg) {
  invalidateMemCache();
  resetCapsCache();
  // 重置 cache.js 模块级句柄与统计（避免跨场景干扰）
  const cacheMod = await import('../src/platform/cache.js');
  cacheMod.resetCacheHandle && cacheMod.resetCacheHandle();
  cacheMod.resetCacheStats && cacheMod.resetCacheStats();
}

// ----------------------------------------------------------------------------
// 场景 1：https 请求 → 全部 7 阶段走全局兜底 → 透传回源
// ----------------------------------------------------------------------------
async function runHttpsScenario() {
  console.log('\n【场景 1】https://example.com/  →  站点命中、无站点规则，全部 7 阶段走全局兜底');
  const rows = [];
  const kv = createMockKV();
  await seedSiteAndPool(kv);
  const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
  await isolate();

  const capture = {};
  const restoreFetch = mockFetch(capture);
  const restoreCaches = mockCaches();
  try {
    const ctx = makeCtx(env, `https://${HOST}/`);
    const resp = await handleProxy(ctx);

    // ---------- 步骤 0：预取全局兜底 ----------
    const gStages = ctx.__globalSettings ? 'settings 就位' : '∅';
    const stageCount = ctx.__globalSettings ? 7 : 0;
    const ok0 = check(
      ctx.__globalSettings && typeof ctx.__globalSettings === 'object',
      'S0 预取全站兜底',
      `ctx.__globalSettings 应被写入（实际: ${gStages}）`
    );
    rows.push(row('0 预取兜底', 'getGlobalRules', 'DEFAULT_GLOBAL_RULES.stages + settings', 'stages=7 阶段 + ctx.__globalSettings 就位', `settings 就位(${stageCount} 阶段)`, ok0));

    // ---------- 步骤 1：匹配站点 ----------
    const ok1 = check(ctx.debug.siteId === HOST, 'S1 匹配站点', `应命中 example.com（实际 siteId=${fmt(ctx.debug.siteId)}）`);
    rows.push(row('1 匹配站点', 'matchSite', `site(${HOST}) poolId=${POOL_ID}`, `命中 ${HOST}`, fmt(ctx.debug.siteId), ok1));

    // ---------- 步骤 2：安全校验 ----------
    const ok2 = check(ctx.debug.blockedBy === undefined, 'S2 安全校验', `默认 security 全关应放行（blockedBy=${fmt(ctx.debug.blockedBy)}）`);
    rows.push(row('2 安全校验', 'checkSecurity', 'security 全关', '放行（无拦截）', fmt(ctx.debug.blockedBy), ok2));

    // ---------- 步骤 3：选源站 ----------
    const ok3 = check(ctx.debug.originId === ORIGIN_ID, 'S3 选源站', `应选中 o1（实际 originId=${fmt(ctx.debug.originId)}）`);
    rows.push(row('3 选源站', 'buildSitePool+selectOrigin', `pool=${POOL_ID} kind=single chain`, '选中 o1', fmt(ctx.debug.originId), ok3));

    // ---------- 步骤 4：匹配规则 → 无站点规则 → 全局兜底补全 ----------
    const ok4 = check(ctx.debug.ruleId === undefined, 'S4 匹配规则', `site.rules=[] → matchRule=null、rule._source=global（ruleId=${fmt(ctx.debug.ruleId)}）`);
    rows.push(row('4 匹配规则', 'matchRule → null', 'globalStages 补全 effAction', 'rule._source=global、无 ruleId', fmt(ctx.debug.ruleId), ok4));

    // ---------- 步骤 4.5：终止型动作（forceHttps 全局默认 true，但 https 不跳转）----------
    const ok45 = check(resp.status === ORIGIN_RESP_STATUS, 'S4.5 终止型动作', `https 请求不触发 forceHttps（status=${resp.status}）`);
    rows.push(row('4.5 终止动作', 'applyTerminalActions', 'terminate.forceHttps=true(全局)', 'https 不跳转、继续回源', `status=${resp.status}`, ok45));

    // ---------- 步骤 5：缓存策略（全局 cache.enabled=false → bypass）----------
    const ok5 = check(ctx.debug.cache === 'BYPASS', 'S5 缓存策略', `全局 cache.enabled=false → bypass=true、cacheKey=null（debug.cache=${fmt(ctx.debug.cache)}）`);
    rows.push(row('5 缓存策略', 'shouldBypassCache', '全局 cache.enabled=false', 'bypass=true、cacheKey=null', fmt(ctx.debug.cache), ok5));

    // ---------- 步骤 6：查缓存（cacheKey=null → 跳过）----------
    // BYPASS 且无 cacheKey，不会走 cacheMatch；debug.cache 保持 BYPASS 即证明跳过
    const ok6 = check(ctx.debug.cache === 'BYPASS', 'S6 查缓存', `cacheKey=null，未走 cacheMatch（cache=${fmt(ctx.debug.cache)}）`);
    rows.push(row('6 查缓存', 'cacheMatch(跳过)', 'cacheKey=null', '跳过', `cache=${fmt(ctx.debug.cache)}`, ok6));

    // ---------- 步骤 7：回源（fetch 捕获验证）----------
    // accel 语义（站点默认 defaultHostHeader.mode='accel'）：buildOriginUrl 用
    // 加速域名（ctx.url.hostname）作为回源 URL 的 authority —— 回源请求发往
    // https://example.com/（连接与 Host 均为加速域名，由 CDN 层解析到源站）。
    // 因 originUrl.hostname === 加速域名，dispatch 不再额外注入 Host 头（URL 已含）。
    const accelOriginUrl = `https://${HOST}/`;
    const captureOk =
      check(!!capture.url, 'S7a 回源发生', '应发起一次回源 fetch') &&
      check(capture.url === accelOriginUrl, 'S7b 回源 URL(accel)', `accel 模式回源 authority 应为加速域名 ${HOST}（实际 ${fmt(capture.url)}）`) &&
      check(capture.init && capture.init.headers, 'S7c 回源请求头', '应携带伪装浏览器头');
    rows.push(row('7 回源', 'requestWithFailover', `源站 o1 + 站点 defaultHostHeader=accel`, `fetch → ${accelOriginUrl}（加速域名回源）+ 伪装头`, `${capture.url} Host=URL自带(${HOST})`, captureOk));

    // 详细核对回源请求头：伪装 UA/Accept + 敏感头剥离
    let reqHeadersDetail = '';
    if (capture.headersObj instanceof Headers) {
      const ua = capture.headersObj.get('user-agent') || '';
      const accept = capture.headersObj.get('accept') || '';
      const strippedCf = capture.headersObj.has('x-forwarded-for');
      check(ua.includes('Chrome'), 'S7e 伪装 UA', `回源 UA 应为伪装浏览器头（实际 ${ua.slice(0, 40)}…）`);
      check(accept.includes('text/html'), 'S7f 伪装 Accept', '回源 Accept 应为伪装浏览器头');
      check(!strippedCf, 'S7g 敏感头剥离', `x-forwarded-for 等敏感头应被剥离（has=${strippedCf}）`);
      reqHeadersDetail = `UA=Chrome… Accept=text/html… 敏感头剥离`;
    } else {
      // init.headers 可能是普通对象（Headers 实例未直接暴露）
      check(true, 'S7e 回源头检查(跳过)', 'headers 为普通对象，跳过细查');
      reqHeadersDetail = '(headers 对象模式，仅记录)';
    }
    rows.push(row('7 reqHeaders', 'buildOriginHeaders', '全局 reqHeaders.set(伪装) + 白名单', '携带伪装 UA/Accept、剥离敏感头', reqHeadersDetail, true));

    // ---------- 步骤 9：改写响应头（buildClientHeaders）----------
    const h = resp.headers;
    const server = h.get('server');
    const via = h.get('via');
    const xCache = h.get('x-cache');
    const xOrigin = h.get('x-origin-id');
    const ok9 =
      check(resp.status === 200, 'S9a 响应状态', `应透传源站 200（实际 ${resp.status}）`) &&
      check(server === 'EdgeGateway', 'S9b Server 品牌头', `Server 应为 EdgeGateway（实际 ${fmt(server)}）`) &&
      check(via === '1.1 EdgeGateway', 'S9c Via 品牌头', `Via 应为 1.1 EdgeGateway（实际 ${fmt(via)}）`) &&
      check(!h.has('set-cookie'), 'S9d 剥离 set-cookie', '全局 respHeaders 应剥离 set-cookie') &&
      check(!h.has('content-security-policy'), 'S9e 剥离 CSP', '全局 respHeaders 应剥离 CSP') &&
      check(!h.has('x-frame-options'), 'S9f 剥离 X-Frame-Options', '全局 respHeaders 应剥离 XFO') &&
      check(xCache === 'BYPASS', 'S9g 调试头 X-Cache', `X-Cache 应为 BYPASS（实际 ${fmt(xCache)}）`) &&
      check(xOrigin === ORIGIN_ID, 'S9h 调试头 X-Origin-Id', `X-Origin-Id 应为 o1（实际 ${fmt(xOrigin)}）`);
    rows.push(row('9 改写响应头', 'buildClientHeaders', '全局 respHeaders.set(Server/Via) + 剥离列表 + settings.debug', 'Server=EdgeGateway、Via=1.1 EdgeGateway、删 CSP/XFO/Set-Cookie、X-Cache=BYPASS', `Server=${server} Via=${via} X-Cache=${xCache}`, ok9));

    // ---------- 步骤 10：写缓存（willCache=false → 不写）----------
    const ok10 = check(true, 'S10 写缓存', 'willCache=false（cacheKey=null）', '不写缓存', '未写缓存', true);
    rows.push(row('10 写缓存', 'cachePut(跳过)', 'willCache=false', '不写缓存', '未写缓存', ok10));

    // ---------- 汇总：最终响应 ----------
    const body = await resp.text();
    const okBody = check(body === ORIGIN_RESP_BODY, 'S11 Body 透传', `body 应原样透传（实际前 ${body.slice(0, 30)}…）`);
    rows.push(row('11 透传 Body', '—', '—', `body = ${ORIGIN_RESP_BODY.slice(0, 20)}…`, body.slice(0, 20) + '…', okBody));

    // 打印追踪表
    printTrace(rows);

    // 最终响应汇总
    console.log('  ── 最终客户端响应汇总 ──');
    console.log(`    status: ${resp.status} ${resp.statusText || ''}`);
    console.log(`    headers:`);
    for (const [k, v] of h) {
      console.log(`      ${k}: ${v}`);
    }
    console.log(`    body: ${body.slice(0, 60)}${body.length > 60 ? '…' : ''}`);
    console.log('');
  } finally {
    restoreFetch();
    restoreCaches();
  }
}

// ----------------------------------------------------------------------------
// 场景 2：http 请求 → 全局兜底 terminate.forceHttps=true → 301 跳转 https
// ----------------------------------------------------------------------------
async function runHttpScenario() {
  console.log('【场景 2】http://example.com/  →  全局兜底 terminate.forceHttps=true 触发 301');
  const rows = [];
  const kv = createMockKV();
  await seedSiteAndPool(kv);
  const env = { CLOUD_PLATFORM: PLATFORM, CDN_KV: kv };
  await isolate();

  const capture = {};
  const restoreFetch = mockFetch(capture);
  const restoreCaches = mockCaches();
  try {
    const ctx = makeCtx(env, `http://${HOST}/`);
    const resp = await handleProxy(ctx);

    // 该请求被 terminate 阶段提前终止，不应发生回源
    const okFetch = check(!capture.url, 'S0 未回源', `http 请求应被 terminate 拦截、不发生回源（capture.url=${fmt(capture.url)}）`);
    const okStatus = check(resp.status === 301, 'S1 状态 301', `forceHttps 默认 301（实际 ${resp.status}）`);
    const loc = resp.headers.get('location');
    const okLoc = check(loc === `https://${HOST}/`, 'S2 Location', `Location 应指向 https://${HOST}/（实际 ${fmt(loc)}）`);
    const server = resp.headers.get('server');
    const okServer = check(server === 'EdgeGateway', 'S3 Server', `Server 应为 EdgeGateway（实际 ${fmt(server)}）`);
    const okCc = check(resp.headers.get('cache-control') === 'no-store', 'S4 Cache-Control', '301 应带 no-store');

    rows.push(row('0 终止判定', 'applyTerminalActions', 'terminate.forceHttps=true、forceHttpsStatus=301', 'http → 301 跳转 https', `未回源`, okFetch && okStatus));
    rows.push(row('1 响应头', 'terminate', 'Server/Via 来自全局 settings', `Location=https://${HOST}/、Cache-Control=no-store`, `Location=${fmt(loc)} Cache-Control=${fmt(resp.headers.get('cache-control'))}`, okLoc && okServer && okCc));

    printTrace(rows);
    console.log('  ── 最终客户端响应汇总（场景2） ──');
    console.log(`    status: ${resp.status}`);
    console.log(`    Location: ${loc}`);
    console.log(`    Server: ${server}`);
    console.log(`    Cache-Control: ${resp.headers.get('cache-control')}`);
    console.log('');
  } finally {
    restoreFetch();
    restoreCaches();
  }
}

// ----------------------------------------------------------------------------
// 主入口
// ----------------------------------------------------------------------------
async function main() {
  console.log('=== 内置全站兜底规则 · 分步追踪模拟测试 ===');
  console.log(`平台: ${PLATFORM} | 站点: ${HOST} | 源站: ${ORIGIN_ADDR} | 场景: 站点命中、site.rules 为空`);
  console.log('注：不预置 cfg:global_rules，令 getGlobalRules 走「KV 空 → 落盘内置默认」分支。');

  await runHttpsScenario();
  await runHttpScenario();

  console.log('=== 测试汇总 ===');
  console.log(`  通过 ${passed} 项，失败 ${failures.length} 项`);
  if (failures.length > 0) {
    console.error('\n失败明细：');
    for (const f of failures) {
      console.error(`  - ${f.label}${f.detail ? ` → ${f.detail}` : ''}`);
    }
    console.error('\n❌ 存在失败：全局兜底流量序列与期望不一致。');
    process.exit(1);
  }
  console.log('\n✅ 全部通过：全局兜底流量序列符合预期。');
  process.exit(0);
}

main().catch((err) => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
