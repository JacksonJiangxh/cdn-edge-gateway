/**
 * ============================================================================
 * 后端核心模块单元测试（零依赖，手写 node:assert）
 * ----------------------------------------------------------------------------
 * 覆盖：matcher / rewrite / cachekey / balancer(strategy+circuit+failover) /
 *       security/auth / platform/keyCodec / config(defaults+schema+stages) /
 *       proxy/headers(buildClientHeaders 三平台缓存头策略)
 *
 * 运行：node scripts/test-unit-backend.mjs
 * 退出码：全部通过 0；有失败非 0。
 * 作为 npm run build verify 链的一环，任一红则部署阻断。
 * ============================================================================
 */

import assert from 'node:assert/strict';

import {
  buildClientHeaders,
} from '../src/proxy/headers.js';

import {
  buildMatchSubject,
  evalCondition,
  isRuleMatched,
} from '../src/proxy/matcher.js';

import {
  mergeRewrite,
  mergeHeaderOps,
  applyRewrite,
  joinPath,
} from '../src/proxy/rewrite.js';

import {
  expandVars,
  hasVars,
  validateVarNames,
  extractVarNames,
} from '../src/config/vars.js';

import { DEFAULT_GLOBAL_SETTINGS } from '../src/config/defaults.js';

import {
  buildCacheKey,
  shouldBypassCache,
} from '../src/proxy/cachekey.js';

import { selectOrigin } from '../src/balancer/strategy.js';
import { requestWithFailover } from '../src/balancer/failover.js';
import { isTripped, recordFailure, recordSuccess } from '../src/balancer/circuit.js';

import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  buildAuthCookie,
  buildClearAuthCookie,
  parseAuthCookie,
  AUTH_COOKIE_NAME,
} from '../src/security/auth.js';

import { encodeKey, decodeKey, isEncodedKey } from '../src/platform/keyCodec.js';

import {
  DEFAULT_GLOBAL,
  DEFAULT_SITE,
  DEFAULT_POOL,
  DEFAULT_RULE,
  DEFAULT_RULE_ACTION,
  DEFAULT_GLOBAL_RULES,
  cloneGlobalRules,
  cloneGlobalSettings,
  POOL_KINDS,
  MATCH_TARGETS,
  MATCH_OPERATORS,
  TARGETS_NEED_KEY,
} from '../src/config/defaults.js';

import {
  validateHost,
  normRule,
  validateRule,
  validateSite,
  validatePool,
  validateGlobal,
  validateGlobalRulesStages,
} from '../src/config/schema.js';

import {
  STAGE_OPS,
  STAGE_ORDER,
  STAGE_ALIASES,
  normalizeStage,
} from '../src/config/stages.js';

import { DEFAULT_RETRY_ON, CONFIG_VERSION } from '../src/contracts.js';
import { STAGE_OP_FIELDS } from '../src/config/schema.js';

import {
  getGlobalRules,
  putGlobalRules,
  ensureGlobalRulesSeeded,
  invalidateMemCache,
} from '../src/config/store.js';

// ----------------------------------------------------------------------------
// 测试运行器（极简 TAP 风格，零依赖）
// ----------------------------------------------------------------------------

// 测试以「注册」方式进入队列，由 runBackendUnitTests() 统一执行，以便被 build.mjs
// 的 runGuard 以 { ok, failures } 契约调用；直接 `node scripts/test-unit-backend.mjs`
// 也会在文件作为主模块时执行同一入口。
const _queue = [];

/** 注册同步测试（断言内抛错即记为失败并收集上下文） */
function test(name, fn) {
  _queue.push([name, fn, false]);
}

/** 注册异步测试 */
function testA(name, fn) {
  _queue.push([name, fn, true]);
}

/**
 * 统一执行所有注册用例。返回 { ok, failures }，供 build.mjs runGuard 收口。
 * @returns {Promise<{ok:boolean, failures:number}>}
 */
export async function runBackendUnitTests() {
  let passed = 0;
  let failed = 0;
  const failures = [];
  console.log('后端单元测试（matcher/rewrite/cachekey/balancer/auth/keyCodec/config/headers）...');
  for (const [name, fn, isAsync] of _queue) {
    try {
      if (isAsync) await fn();
      else fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      failures.push({ name, err });
      console.error(`  ✗ ${name}`);
      console.error(`      ${err.message}`);
    }
  }
  console.log(`\n后端单元测试完成：通过 ${passed} 项，失败 ${failed} 项。`);
  if (failed > 0) {
    console.error('\n失败明细：');
    for (const f of failures) {
      console.error(`- ${f.name}: ${f.err.stack || f.err.message}`);
    }
    return { ok: false, failures: failed };
  }
  console.log('全部后端单元测试通过 ✓');
  return { ok: true, failures: 0 };
}

// ----------------------------------------------------------------------------
// 测试辅助：构造请求上下文
// ----------------------------------------------------------------------------

/**
 * 构造一个最小但完整的 Ctx，供 matcher / cachekey / cachekey 使用。
 * @param {Object} opts
 */
function makeCtx(opts = {}) {
  const headers = new Headers(opts.headers || {});
  const url = new URL(opts.url || 'https://example.com/path/to/file.html?b=2&a=1');
  return {
    request: new Request(url, { method: opts.method || 'GET', headers }),
    url,
    env: opts.env || {},
    waitUntil() {},
    debug: {},
    ...opts.ctx,
  };
}

// ============================================================================
console.log('\n[matcher] 条件匹配 + 操作符全集 + OR/AND 语义');

test('buildMatchSubject 提取路径/扩展名/查询等特征', () => {
  const ctx = makeCtx({ url: 'https://img.example.com/img/photo.PNG?x=1' });
  const s = buildMatchSubject(ctx);
  assert.equal(s.host, 'img.example.com');
  assert.equal(s.extension, 'png'); // 小写化
  assert.equal(s.filename, 'photo.PNG');
  assert.equal(s.method, 'GET');
  assert.equal(s.protocol, 'https');
});

test('evalCondition: exists / notExists 不受值缺失影响', () => {
  const ctx = makeCtx({ url: 'https://x.com/', headers: { 'x-flag': '1' } });
  const s = buildMatchSubject(ctx);
  assert.equal(evalCondition({ target: 'header', op: 'exists', key: 'x-flag' }, s), true);
  assert.equal(evalCondition({ target: 'header', op: 'exists', key: 'x-missing' }, s), false);
  assert.equal(evalCondition({ target: 'header', op: 'notExists', key: 'x-missing' }, s), true);
  assert.equal(evalCondition({ target: 'header', op: 'notExists', key: 'x-flag' }, s), false);
});

test('evalCondition: equal / notEqual 大小写默认不敏感', () => {
  const s = buildMatchSubject(makeCtx({ headers: { 'user-agent': 'Mozilla' } }));
  assert.equal(evalCondition({ target: 'header', op: 'equal', key: 'user-agent', values: ['mozilla'] }, s), true);
  assert.equal(evalCondition({ target: 'header', op: 'notEqual', key: 'user-agent', values: ['chrome'] }, s), true);
  // ignoreCase=false 时区分大小写
  assert.equal(
    evalCondition({ target: 'header', op: 'equal', key: 'user-agent', values: ['mozilla'], ignoreCase: false }, s),
    false
  );
});

test('evalCondition: contain / notContain / prefix / suffix / notPrefix / notSuffix', () => {
  const s = buildMatchSubject(makeCtx({ url: 'https://x.com/abc/def.html' }));
  assert.equal(evalCondition({ target: 'path', op: 'contain', values: ['/def'] }, s), true);
  assert.equal(evalCondition({ target: 'path', op: 'notContain', values: ['/xyz'] }, s), true);
  assert.equal(evalCondition({ target: 'path', op: 'prefix', values: ['/abc'] }, s), true);
  assert.equal(evalCondition({ target: 'path', op: 'notPrefix', values: ['/zzz'] }, s), true);
  assert.equal(evalCondition({ target: 'path', op: 'suffix', values: ['.html'] }, s), true);
  assert.equal(evalCondition({ target: 'path', op: 'notSuffix', values: ['.php'] }, s), true);
});

test('evalCondition: regex / notRegex + 非法正则容错（不抛错、失配）', () => {
  const s = buildMatchSubject(makeCtx({ url: 'https://x.com/api/v2/users' }));
  assert.equal(evalCondition({ target: 'path', op: 'regex', values: ['^/api/v\\d+/'] }, s), true);
  assert.equal(evalCondition({ target: 'path', op: 'notRegex', values: ['^/static/'] }, s), true);
  // 非法正则（未闭合括号）：外层 try/catch 兜底，条件失配而非抛出
  assert.equal(evalCondition({ target: 'path', op: 'regex', values: ['(a'] }, s), false);
});

test('evalCondition: query 无 key 时退化为整串，有 key 取参数', () => {
  const ctx = makeCtx({ url: 'https://x.com/?token=abc&page=2' });
  const s = buildMatchSubject(ctx);
  assert.equal(evalCondition({ target: 'query', op: 'contain', values: ['token=abc'] }, s), true);
  assert.equal(evalCondition({ target: 'query', op: 'equal', key: 'page', values: ['2'] }, s), true);
});

test('evalCondition: cookie 解析', () => {
  const ctx = makeCtx({ url: 'https://x.com/', headers: { cookie: 'sid=xyz; theme=dark' } });
  const s = buildMatchSubject(ctx);
  assert.equal(evalCondition({ target: 'cookie', op: 'equal', key: 'sid', values: ['xyz'] }, s), true);
  assert.equal(evalCondition({ target: 'cookie', op: 'exists', key: 'theme' }, s), true);
});

test('evalCondition: 需要 key 的 target 缺 key 时失配（非 header/query 的特殊处理）', () => {
  const s = buildMatchSubject(makeCtx({}));
  // header 缺 key：配置无效 → 失配
  assert.equal(evalCondition({ target: 'header', op: 'exists', values: [] }, s), false);
});

test('isRuleMatched: 外 OR 内 AND 二维语义', () => {
  const rule = {
    match: {
      conditions: [
        [{ target: 'path', op: 'prefix', values: ['/a'] }, { target: 'method', op: 'equal', values: ['GET'] }],
        [{ target: 'path', op: 'prefix', values: ['/b'] }],
      ],
    },
  };
  const sGetA = buildMatchSubject(makeCtx({ url: 'https://x.com/a/1' }));
  const sPostA = buildMatchSubject(makeCtx({ url: 'https://x.com/a/1', method: 'POST' }));
  const sB = buildMatchSubject(makeCtx({ url: 'https://x.com/b/1' }));
  const sC = buildMatchSubject(makeCtx({ url: 'https://x.com/c/1' }));
  assert.equal(isRuleMatched(rule, sGetA), true); // 组0 全过
  assert.equal(isRuleMatched(rule, sPostA), false); // 组0 内 method 不过，组1 不过
  assert.equal(isRuleMatched(rule, sB), true); // 组1 过
  assert.equal(isRuleMatched(rule, sC), false); // 都不过
});

test('isRuleMatched: 空 conditions 匹配一切', () => {
  assert.equal(isRuleMatched({}, buildMatchSubject(makeCtx({}))), true);
  assert.equal(isRuleMatched({ match: { conditions: [] } }, buildMatchSubject(makeCtx({}))), true);
});

// ============================================================================
console.log('\n[rewrite] 路径重写合并 + HeaderOps 合并');

test('mergeRewrite: 规则级非 none 优先，否则回退源站级，皆无则 none', () => {
  const rr = { type: 'prefix', value: '/api' };
  const or = { type: 'strip', value: '/old' };
  assert.deepEqual(mergeRewrite(or, rr), rr);
  assert.deepEqual(mergeRewrite(or, { type: 'none' }), or);
  assert.deepEqual(mergeRewrite(null, null).type, 'none');
});

test('mergeHeaderOps: set 浅合并、remove 去重', () => {
  const a = { set: { 'X-A': '1', 'X-B': '2' }, remove: ['x-c', 'x-d'] };
  const b = { set: { 'X-B': '2b', 'X-E': '3' }, remove: ['x-d', 'x-f'] };
  const m = mergeHeaderOps(a, b);
  assert.deepEqual(m.set, { 'X-A': '1', 'X-B': '2b', 'X-E': '3' }); // 规则级覆盖同键
  assert.deepEqual(m.remove.sort(), ['x-c', 'x-d', 'x-f']); // 去重
});

test('applyRewrite: none / prefix / strip / regex 四模式', () => {
  assert.equal(applyRewrite('/x.png', { type: 'none' }), '/x.png');
  assert.equal(applyRewrite('/x.png', { type: 'prefix', value: '/img' }), '/img/x.png');
  assert.equal(applyRewrite('/old/x.png', { type: 'strip', value: '/old' }), '/x.png');
  assert.equal(applyRewrite('/old/x.png', { type: 'strip', value: '/nope' }), '/old/x.png'); // 不以该前缀开头则不动
  // regex：捕获组/特殊模式生效（对齐 CF/EO 路径重写），此处 $& 展开为匹配到的 /b
  assert.equal(applyRewrite('/a/b', { type: 'regex', regexFrom: '/b', regexTo: '$&' }), '/a/b');
});

test('applyRewrite: 非法正则容错保持原路径', () => {
  assert.equal(applyRewrite('/a/b', { type: 'regex', regexFrom: '(', regexTo: 'x' }), '/a/b');
});

test('joinPath 消重斜杠并保证前导 /', () => {
  assert.equal(joinPath('/a/', '/b'), '/a/b');
  assert.equal(joinPath('', '/b'), '/b');
});

// ============================================================================
console.log('\n[cachekey] 查询串忽略/白名单排序 + host 维度');

test('buildCacheKey: ignoreQuery 丢弃全部查询串', () => {
  const ctx = makeCtx({ url: 'https://a.com/x?b=1&a=2' });
  const key = buildCacheKey(ctx, { ignoreQuery: true }, 'https://origin.com/x?b=1&a=2');
  const u = new URL(key.url);
  assert.equal(u.searchParams.get('b'), null);
  assert.equal(u.searchParams.get('a'), null);
  assert.equal(u.searchParams.get('__h'), 'a.com'); // 仍带 host 维度
});

test('buildCacheKey: 白名单按 key+value 排序，消除参数顺序碎片', () => {
  const ctx = makeCtx({ url: 'https://a.com/x?b=2&a=1' });
  const p1 = buildCacheKey(ctx, { ignoreQuery: false, queryWhitelist: ['a', 'b'] }, 'https://o.com/x?b=2&a=1');
  const p2 = buildCacheKey(ctx, { ignoreQuery: false, queryWhitelist: ['a', 'b'] }, 'https://o.com/x?a=1&b=2');
  const u1 = new URL(p1.url);
  const u2 = new URL(p2.url);
  assert.equal(u1.searchParams.toString(), u2.searchParams.toString());
  assert.equal(u1.searchParams.get('a'), '1');
  assert.equal(u1.searchParams.get('b'), '2');
});

test('buildCacheKey: 无白名单全保留并排序', () => {
  const ctx = makeCtx({ url: 'https://a.com/x?z=1&y=2' });
  const key = buildCacheKey(ctx, { ignoreQuery: false, queryWhitelist: [] }, 'https://o.com/x?z=1&y=2');
  const u = new URL(key.url);
  assert.equal(u.searchParams.get('y'), '2');
  assert.equal(u.searchParams.get('z'), '1');
});

test('buildCacheKey: 缓存键是 GET 方法 Request，不含客户端头', () => {
  const ctx = makeCtx({ url: 'https://a.com/x', headers: { authorization: 'Bearer t' } });
  const key = buildCacheKey(ctx, { ignoreQuery: true }, 'https://o.com/x');
  assert.equal(key.method, 'GET');
});

test('shouldBypassCache: 非 GET / Range / 凭证 应绕过', () => {
  assert.equal(shouldBypassCache(makeCtx({ method: 'POST' }), { enabled: true }), true);
  assert.equal(shouldBypassCache(makeCtx({ headers: { range: 'bytes=0-10' } }), { enabled: true }), true);
  assert.equal(shouldBypassCache(makeCtx({ headers: { authorization: 'x' } }), { enabled: true }), true);
  assert.equal(shouldBypassCache(makeCtx({}), { enabled: true }), false); // GET 且无害 → 不绕过
  assert.equal(shouldBypassCache(makeCtx({}), { enabled: false }), true);
});

// ============================================================================
console.log('\n[balancer/strategy] 选源策略');

test('selectOrigin: 空/单源/全部排除时返回 null 或唯一源', () => {
  const pool = { strategy: 'chain', origins: [{ id: 'o1', order: 0 }, { id: 'o2', order: 1 }] };
  assert.equal(selectOrigin({ strategy: 'chain', origins: [] }, makeCtx(), []), null);
  assert.equal(selectOrigin(pool, makeCtx(), ['o1', 'o2']), null); // 全排除
  const single = { strategy: 'chain', origins: [{ id: 'only', order: 0 }] };
  assert.equal(selectOrigin(single, makeCtx(), []).id, 'only');
});

test('selectOrigin: chain 按 order 升序取第一个可用', () => {
  const pool = {
    strategy: 'chain',
    origins: [
      { id: 'o2', order: 2, enabled: false },
      { id: 'o1', order: 1, enabled: true },
      { id: 'o3', order: 3, enabled: true },
    ],
  };
  assert.equal(selectOrigin(pool, makeCtx(), []).id, 'o1');
  assert.equal(selectOrigin(pool, makeCtx(), ['o1']).id, 'o3'); // 跳过已排除
});

test('selectOrigin: roundrobin 近似轮询（模块级计数器）', () => {
  const pool = {
    id: 'rr-test-pool',
    strategy: 'roundrobin',
    origins: [{ id: 'a', order: 1 }, { id: 'b', order: 2 }, { id: 'c', order: 3 }],
  };
  const seen = new Set();
  seen.add(selectOrigin(pool, makeCtx(), []).id);
  seen.add(selectOrigin(pool, makeCtx(), []).id);
  seen.add(selectOrigin(pool, makeCtx(), []).id);
  // 三次连续调用应轮到全部三个（计数器从 0 起、取模）
  assert.equal(seen.size, 3);
  // 第四轮回到起点
  assert.equal(selectOrigin(pool, makeCtx(), []).id, 'a');
});

test('selectOrigin: weighted 按权重分布（大样本统计）', () => {
  const pool = {
    id: 'w-test',
    strategy: 'weighted',
    origins: [{ id: 'a', weight: 3 }, { id: 'b', weight: 1 }],
  };
  let aCount = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    if (selectOrigin(pool, makeCtx(), []).id === 'a') aCount++;
  }
  // 权重 3:1，a 命中率应在 ~75% ± 10%
  const ratio = aCount / N;
  assert.ok(ratio > 0.6 && ratio < 0.9, `weighted a-ratio=${ratio} 应在 0.6~0.9`);
});

test('selectOrigin: iphash 同一 IP 稳定落同一源站', () => {
  const pool = {
    id: 'ip-test',
    strategy: 'iphash',
    origins: [{ id: 'a', order: 1 }, { id: 'b', order: 2 }],
  };
  const ctx = makeCtx({ headers: { 'cf-connecting-ip': '1.2.3.4' } });
  const first = selectOrigin(pool, ctx, []).id;
  for (let i = 0; i < 5; i++) {
    assert.equal(selectOrigin(pool, ctx, []).id, first);
  }
});

test('selectOrigin: iphash 无 IP 时退化为 chain', () => {
  const pool = {
    id: 'ip-test2',
    strategy: 'iphash',
    origins: [{ id: 'a', order: 1 }, { id: 'b', order: 2 }],
  };
  assert.equal(selectOrigin(pool, makeCtx(), []).id, 'a');
});

// ============================================================================
console.log('\n[balancer/circuit] 熔断（内存模式，无 KV 降级为不熔断）');

testA('isTripped: 无 KV 时降级为 false，不抛错', async () => {
  const ctx = makeCtx({ env: {} }); // 无 KV 绑定
  assert.equal(await isTripped(ctx, 'p1', 'o1'), false);
});

testA('recordFailure / isTripped / recordSuccess 经 L1 内存生效', async () => {
  const ctx = makeCtx({ env: {} });
  // 无 KV：recordFailure 静默，isTripped 走 L1（无 KV 写不进，保持 false 降级）
  await recordFailure(ctx, 'p1', 'o1');
  await recordSuccess(ctx, 'p1', 'o1');
  assert.equal(await isTripped(ctx, 'p1', 'o1'), false); // 降级
});

// ============================================================================
console.log('\n[balancer/failover] 故障转移（用内存 fetch 桩）');

/**
 * 用一个可控的「假 fetch」替换全局 fetch，驱动 failover 在不同源站上成功/失败。
 * failover.js 内部用 fetchEngine.dispatch → fetchOrigin → ctx.env.fetch 或全局 fetch。
 * 这里直接覆盖 globalThis.fetch 以模拟源站响应。
 */
async function withFakeFetch(handler, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await fn();
  } finally {
    globalThis.fetch = prev;
  }
}

function fakeResp(status, body = 'ok') {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}

testA('requestWithFailover: 多源站，第一个 502 自动换到第二个成功', async () => {
  const pool = {
    id: 'fb1',
    strategy: 'chain',
    origins: [
      { id: 'o1', order: 1, engine: 'fetch', scheme: 'https', addr: 'a.com', port: 443, hostHeader: { mode: 'origin' } },
      { id: 'o2', order: 2, engine: 'fetch', scheme: 'https', addr: 'b.com', port: 443, hostHeader: { mode: 'origin' } },
    ],
    failover: { enabled: true, retryOn: [500, 502, 503, 504], maxRetries: 2, timeoutMs: 1000 },
  };
  let count = 0;
  const ctx = makeCtx({ url: 'https://site.com/x' });
  const resp = await withFakeFetch(async (url) => {
    count++;
    const u = new URL(url);
    if (u.hostname === 'a.com') return fakeResp(502);
    return fakeResp(200, 'from-b');
  }, async () => requestWithFailover(ctx, pool, null, null));

  assert.equal(resp.status, 200);
  assert.ok(count >= 2, '应至少尝试两个源站');
  assert.deepEqual(ctx.debug.tried.sort(), ['o1', 'o2']);
});

testA('requestWithFailover: 全部失败返回 502 且列出尝试过的源站', async () => {
  const pool = {
    id: 'fb2',
    strategy: 'chain',
    origins: [
      { id: 'o1', order: 1, engine: 'fetch', scheme: 'https', addr: 'a.com', port: 443, hostHeader: { mode: 'origin' } },
      { id: 'o2', order: 2, engine: 'fetch', scheme: 'https', addr: 'b.com', port: 443, hostHeader: { mode: 'origin' } },
    ],
    failover: { enabled: true, retryOn: [500], maxRetries: 2, timeoutMs: 1000 },
  };
  const ctx = makeCtx({ url: 'https://site.com/x' });
  // 两个源站都抛连接异常（非状态码），failover 收尾无可用响应 → 回退 502。
  const resp = await withFakeFetch(() => { throw new Error('connection refused'); }, () =>
    requestWithFailover(ctx, pool, null, null)
  );
  assert.equal(resp.status, 502);
});

testA('requestWithFailover: fetch 抛异常必换源（不受 retryOn 限制）', async () => {
  const pool = {
    id: 'fb3',
    strategy: 'chain',
    origins: [
      { id: 'o1', order: 1, engine: 'fetch', scheme: 'https', addr: 'a.com', port: 443, hostHeader: { mode: 'origin' } },
      { id: 'o2', order: 2, engine: 'fetch', scheme: 'https', addr: 'b.com', port: 443, hostHeader: { mode: 'origin' } },
    ],
    failover: { enabled: true, retryOn: [], maxRetries: 2, timeoutMs: 1000 },
  };
  const ctx = makeCtx({ url: 'https://site.com/x' });
  const resp = await withFakeFetch(async (url) => {
    const u = new URL(url);
    if (u.hostname === 'a.com') throw new Error('conn refused');
    return fakeResp(200, 'ok');
  }, () => requestWithFailover(ctx, pool, null, null));
  assert.equal(resp.status, 200);
});

// ============================================================================
console.log('\n[security/auth] 密码哈希 / JWT / Cookie / 恒定时间比较');

testA('hashPassword + verifyPassword 一致，错误密码拒绝', async () => {
  const { hash, salt } = await hashPassword('admin123');
  assert.ok(hash && salt, '应返回 hash 与 salt');
  assert.equal(await verifyPassword('admin123', hash, salt), true);
  assert.equal(await verifyPassword('wrong', hash, salt), false);
});

testA('signToken / verifyToken 正常往返；篡改签名拒绝', async () => {
  const secret = 'a-very-secret-key-123456';
  const token = await signToken({ sub: 'admin', role: 'admin' }, secret, 7200);
  const claims = await verifyToken(token, secret);
  assert.ok(claims, '应校验通过');
  assert.equal(claims.sub, 'admin');

  // 篡改签名段
  const parts = token.split('.');
  parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith('A') ? 'B' : 'A');
  assert.equal(await verifyToken(parts.join('.'), secret), null);
});

testA('verifyToken: 过期 token 拒绝（exp 远早于 now，超出时钟偏移容忍）', async () => {
  const secret = 'sec';
  const past = Math.floor(Date.now() / 1000) - 100; // 早于 now 100s（> CLOCK_SKEW 30s）
  const token = await signToken({ sub: 'admin', exp: past }, secret);
  assert.equal(await verifyToken(token, secret), null);
});

testA('verifyToken: 未来 nbf token 拒绝', async () => {
  const secret = 'sec';
  const future = Math.floor(Date.now() / 1000) + 100;
  const token = await signToken({ sub: 'admin', nbf: future }, secret);
  assert.equal(await verifyToken(token, secret), null);
});

testA('signToken: 空密钥抛出（安全红线）', async () => {
  await assert.rejects(() => signToken({ sub: 'x' }, ''), /空密钥/);
  await assert.rejects(() => signToken({ sub: 'x' }, undefined), /空密钥/);
});

test('buildAuthCookie / parseAuthCookie 往返', () => {
  const cookie = buildAuthCookie('tok123', 7200);
  assert.ok(cookie.includes(`${AUTH_COOKIE_NAME}=tok123`));
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('SameSite=Strict'));
  // 解析回 token
  const req = new Request('https://x.com/', { headers: { Cookie: `foo=bar; ${AUTH_COOKIE_NAME}=tok123; baz=1` } });
  assert.equal(parseAuthCookie(req), 'tok123');
  // 空 token（登出）解析为 null
  const req2 = new Request('https://x.com/', { headers: { Cookie: `${AUTH_COOKIE_NAME}=` } });
  assert.equal(parseAuthCookie(req2), null);
});

test('parseAuthCookie: 优先 Cookie，回退 Authorization Bearer', () => {
  const req = new Request('https://x.com/', { headers: { Authorization: 'Bearer abcdef' } });
  assert.equal(parseAuthCookie(req), 'abcdef');
});

test('buildClearAuthCookie: 登出（Max-Age=0 且无值）', () => {
  const c = buildClearAuthCookie();
  assert.ok(c.includes(`${AUTH_COOKIE_NAME}=`));
  assert.ok(c.includes('Max-Age=0'));
});

// ============================================================================
console.log('\n[platform/keyCodec] 单射 + 可逆');

test('encodeKey: 冒号/点/下划线 转义正确（无碰撞）', () => {
  assert.equal(encodeKey('cfg:global'), 'cfg_3Aglobal');
  assert.equal(encodeKey('site:example.com'), 'site_3Aexample_2Ecom');
  assert.equal(encodeKey('a_b'), 'a__b');
});

test('decodeKey: 是 encodeKey 的逆，且对所有样例可逆', () => {
  const samples = ['cfg:global', 'site:example.com', 'a_b', 'lock:192.168.1.1', 'pool:pl_abc', 'plain', 'xÿz'];
  for (const k of samples) {
    assert.equal(decodeKey(encodeKey(k)), k, `应可逆: ${k}`);
  }
});

test('encodeKey 单射性：不同输入不映射到同一键', () => {
  const inputs = ['a.com', 'a_com', 'a:com', 'a.com_', 'a。com', 'A.com'];
  const out = inputs.map((i) => encodeKey(i));
  assert.equal(new Set(out).size, out.length, '编码键应与输入一一对应，无碰撞');
});

test('decodeKey: 非法输入返回 null（历史未编码键识别）', () => {
  assert.equal(decodeKey('site:a.com'), null); // 含非法字符，说明是旧键
  assert.equal(decodeKey(''), null);
  assert.equal(decodeKey(123), null);
});

test('isEncodedKey: 仅含 [0-9A-Za-z_] 视为已编码', () => {
  assert.equal(isEncodedKey('cfg_3Aglobal'), true);
  assert.equal(isEncodedKey('site:a.com'), false);
  assert.equal(isEncodedKey(''), false);
});

test('encodeKey: 非法输入抛错', () => {
  assert.throws(() => encodeKey(''), TypeError);
  assert.throws(() => encodeKey(null), TypeError);
});

// ============================================================================
console.log('\n[config/defaults] 默认结构完整且冻结');

test('DEFAULT_GLOBAL 含必要字段且冻结', () => {
  assert.equal(DEFAULT_GLOBAL.adminPath, '__panel');
  assert.equal(DEFAULT_GLOBAL.configCacheTtl, 60);
  assert.equal(DEFAULT_GLOBAL.version, CONFIG_VERSION);
  assert.ok(Object.isFrozen(DEFAULT_GLOBAL));
});

test('DEFAULT_RULE_ACTION / DEFAULT_RULE 结构合理', () => {
  assert.equal(DEFAULT_RULE_ACTION.rewrite.type, 'none');
  assert.equal(DEFAULT_RULE.enabled, true);
  assert.ok(Array.isArray(MATCH_TARGETS));
  assert.ok(MATCH_TARGETS.includes('header'));
  assert.ok(MATCH_OPERATORS.includes('regex'));
  assert.deepEqual([...TARGETS_NEED_KEY].sort(), ['cookie', 'header', 'query']);
});

test('POOL_KINDS / DEFAULT_POOL / DEFAULT_SITE 基本契约', () => {
  assert.deepEqual([...POOL_KINDS], ['single', 'pool']);
  assert.equal(DEFAULT_POOL.kind, 'single');
  assert.equal(DEFAULT_POOL.strategy, 'chain');
  assert.equal(DEFAULT_POOL.failover.timeoutMs, 10000);
  assert.equal(DEFAULT_SITE.host, '');
  assert.equal(DEFAULT_SITE.cacheGen, 0);
});

// ============================================================================
console.log('\n[config/schema] 校验与规范化');

test('validateHost: 正常 / 含端口 / 含协议 / 单独通配 拒绝', () => {
  assert.equal(validateHost('img.example.com').ok, true);
  assert.equal(validateHost('*.example.com').ok, true);
  assert.equal(validateHost('a.com:8080').ok, false); // 端口
  assert.equal(validateHost('https://a.com').ok, false); // 协议
  assert.equal(validateHost('*').ok, false); // 全匹配通配拒绝
  assert.equal(validateHost('').ok, false);
});

test('validateGlobal: 留空沿用 current，adminPath 非法字符回落默认', () => {
  const r1 = validateGlobal({ adminPath: 'myadmin' }, null, {});
  assert.equal(r1.ok, true);
  assert.equal(r1.value.adminPath, 'myadmin');

  // 留空 → 沿用 current
  const r2 = validateGlobal({}, null, { adminPath: 'existing', configCacheTtl: 30 });
  assert.equal(r2.value.adminPath, 'existing');
  assert.equal(r2.value.configCacheTtl, 30);

  // 非法 adminPath（带空格）→ 回落默认 __panel
  const r3 = validateGlobal({ adminPath: 'bad path' }, null, {});
  assert.equal(r3.value.adminPath, '__panel');

  // statsDriver 枚举钳制
  const r4 = validateGlobal({ statsDriver: 'mysql' }, null, {});
  assert.equal(r4.value.statsDriver, 'kv');
});

test('validateGlobal: adminDomain 留空沿用 / 规范化去端口小写 / 非法回落', () => {
  // 1) 留空（未提供）→ 沿用 current，无 current 则默认空串
  const r1 = validateGlobal({}, null, { adminDomain: 'panel.example.com' });
  assert.equal(r1.value.adminDomain, 'panel.example.com');

  const r2 = validateGlobal({}, null, {});
  assert.equal(r2.value.adminDomain, '');

  // 2) 填写 → trim、小写、去端口
  const r3 = validateGlobal({ adminDomain: '  Panel.Example.COM:443  ' }, null, {});
  assert.equal(r3.value.adminDomain, 'panel.example.com');

  // 3) 非法值（含协议/非法字符）→ 回落 current，无 current 则空串
  const r4 = validateGlobal({ adminDomain: 'https://bad' }, null, { adminDomain: 'good.example.com' });
  assert.equal(r4.value.adminDomain, 'good.example.com');

  const r5 = validateGlobal({ adminDomain: 'http://bad' }, null, {});
  assert.equal(r5.value.adminDomain, '');
});

test('validateGlobal: 平台能力联动（d1 在无 D1 平台被拦截）', () => {
  const r = validateGlobal({ statsDriver: 'd1' }, { platform: 'eo', hasD1: false });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /D1/.test(e)));
});

test('normRule / validateRule: 完整规则规范化 + 默认值补全', () => {
  const input = {
    stage: 'rewrite',
    priority: 10,
    enabled: true,
    match: { conditions: [[{ target: 'path', op: 'prefix', values: ['/api'] }]] },
    action: { poolId: 'pl_1', rewrite: { type: 'prefix', value: '/v1' } },
  };
  const r = validateRule(input);
  assert.equal(r.ok, true);
  assert.equal(r.value.priority, 10);
  assert.equal(r.value.action.rewrite.type, 'prefix');
  assert.equal(r.value.action.rewrite.value, '/v1');
  assert.ok(r.value.id, '应自动生成 id');
});

test('normRule: 按阶段裁剪落库（去冗余）—— 只写本阶段 allowedOps 的字段', () => {
  // respHeaders 阶段：只配了删除响应头，不应落库 cache/rewrite/redirect 等空壳
  const respRule = normRule({
    stage: 'respHeaders',
    match: { conditions: [] },
    action: { respHeaders: { set: {}, remove: ['cache-control'] } },
  }, 0).value;
  assert.ok(respRule.action.respHeaders && respRule.action.respHeaders.remove[0] === 'cache-control', 'respHeaders 阶段保留 respHeaders 字段');
  assert.equal(respRule.action.cache, undefined, 'respHeaders 阶段不落库 cache 空壳');
  assert.equal(respRule.action.rewrite, undefined, 'respHeaders 阶段不落库 rewrite 空壳');
  assert.equal(respRule.action.redirect, undefined, 'respHeaders 阶段不落库 redirect 空壳');
  assert.equal(respRule.action.reqHeaders, undefined, 'respHeaders 阶段不落库 reqHeaders 空壳');

  // cache 阶段：只配了缓存，不应落库 respHeaders/rewrite 等空壳
  const cacheRule = normRule({
    stage: 'cache',
    match: { conditions: [[{ target: 'extension', op: 'equal', values: ['js'] }]] },
    action: { cache: { enabled: true, mode: 'ttl', edgeTtl: 3600 } },
  }, 0).value;
  assert.ok(cacheRule.action.cache && cacheRule.action.cache.edgeTtl === 3600, 'cache 阶段保留 cache 字段');
  assert.equal(cacheRule.action.respHeaders, undefined, 'cache 阶段不落库 respHeaders 空壳');
  assert.equal(cacheRule.action.rewrite, undefined, 'cache 阶段不落库 rewrite 空壳');

  // 回源级字段（clientIpHeader / followRedirect / originTimeoutMs）属于 Origin 阶段，
  // 非 origin 阶段不落库（它们只在回源阶段消费，不是「全局字段」）。
  const withClientIp = normRule({
    stage: 'respHeaders',
    match: { conditions: [] },
    action: { respHeaders: { set: {}, remove: ['x'] }, clientIpHeader: { enabled: true, name: 'X-Real-IP' } },
  }, 0).value;
  assert.equal(withClientIp.action.clientIpHeader, undefined, 'clientIpHeader 是 origin 阶段专属，respHeaders 阶段不落库');

  // origin 阶段：保留全部回源级字段（含 clientIp / followRedirect / originTimeout）
  const originRule = normRule({
    stage: 'origin',
    match: { conditions: [] },
    action: {
      targetPool: 'pl_1',
      clientIpHeader: { enabled: true, name: 'X-Real-IP' },
      followRedirect: true,
      originTimeoutMs: 5000,
    },
  }, 0).value;
  assert.equal(originRule.action.clientIpHeader && originRule.action.clientIpHeader.name, 'X-Real-IP', 'origin 阶段保留 clientIpHeader');
  assert.equal(originRule.action.followRedirect, true, 'origin 阶段保留 followRedirect');
  assert.equal(originRule.action.originTimeoutMs, 5000, 'origin 阶段保留 originTimeoutMs');
  assert.equal(originRule.action.respHeaders, undefined, 'origin 阶段不落库 respHeaders 空壳');

  // 缺省 stage：无旧数据，统一回退到 cache 阶段裁剪（绝不写全字段，不兼容反推兜底）。
  const legacy = normRule({
    match: { conditions: [] },
    action: { rewrite: { type: 'prefix', value: '/v1' } },
  }, 0).value;
  assert.equal(legacy.action.rewrite, undefined, '缺省 stage 回退 cache 阶段裁剪，rewrite 字段被裁（无反推兜底）');
});

test('normRule: 非法 target/op 被拒绝并收集错误', () => {
  const input = {
    match: { conditions: [[{ target: 'bogus', op: 'equal', values: ['x'] }]] },
    action: {},
  };
  const r = normRule(input, 0);
  assert.ok(r.errors.length > 0, '应收集到不支持的匹配对象错误');
});

test('normRule: header/cookie 缺 key 报错', () => {
  const input = {
    match: { conditions: [[{ target: 'header', op: 'exists' }]] },
    action: {},
  };
  const r = normRule(input, 0);
  assert.ok(r.errors.some((e) => /键名/.test(e)));
});

test('normRule: 正则类值做 ReDoS 防护', () => {
  const input = {
    match: {
      conditions: [[{ target: 'path', op: 'regex', values: ['(a+)+$'] }]],
    },
    action: {},
  };
  const r = normRule(input, 0);
  assert.ok(r.errors.some((e) => /嵌套量词|ReDoS|正则/.test(e)));
});

test('validateSite: 正常站点 + 规则按优先级降序固化', () => {
  const input = {
    host: 'img.example.com',
    poolId: 'pl_1',
    rules: [
      { id: 'r1', priority: 5, match: { conditions: [] }, action: {} },
      { id: 'r2', priority: 50, match: { conditions: [] }, action: {} },
    ],
  };
  const r = validateSite(input);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.rules.map((x) => x.id), ['r2', 'r1']); // 降序
});

test('validateSite: 非法 host 直接失败', () => {
  const r = validateSite({ host: 'bad host', rules: [] });
  assert.equal(r.ok, false);
});

test('validatePool: single 只能有一个源站；pool 支持多源站 + 策略', () => {
  const singleOne = {
    kind: 'single',
    name: 's1',
    origins: [{ engine: 'fetch', scheme: 'https', addr: 'a.com', port: 443 }],
  };
  assert.equal(validatePool(singleOne).ok, true);

  const singleMany = { kind: 'single', name: 's', origins: [{ engine: 'fetch', addr: 'a.com' }, { engine: 'fetch', addr: 'b.com' }] };
  assert.equal(validatePool(singleMany).ok, false);

  const poolMulti = {
    kind: 'pool',
    name: 'p',
    strategy: 'roundrobin',
    origins: [
      { engine: 'fetch', addr: 'a.com' },
      { engine: 'fetch', addr: 'b.com', weight: 2 },
    ],
  };
  const rp = validatePool(poolMulti);
  assert.equal(rp.ok, true);
  assert.equal(rp.value.strategy, 'roundrobin');
});

test('validatePool: 空源站与无启用源站被拒', () => {
  assert.equal(validatePool({ kind: 'pool', name: 'x', origins: [] }).ok, false);
  const r = validatePool({ kind: 'pool', name: 'x', origins: [{ engine: 'fetch', addr: 'a.com', enabled: false }] });
  assert.equal(r.ok, false);
});

test('LIMITS: 规则上限存在且合理（内部常量已用于校验）', () => {
  // RULES_MAX 作为内部常量未导出，这里通过 validateSite 行为间接确认存在
  const many = {
    host: 'a.com',
    rules: Array.from({ length: 51 }, (_, i) => ({ id: `r${i}`, priority: i, match: { conditions: [] }, action: {} })),
  };
  const r = validateSite(many);
  assert.equal(r.ok, false); // 超过 50 条规则被拒
  assert.ok(r.errors.some((e) => /50/.test(e)));
});

// ============================================================================
console.log('\n[config/stages] 阶段字典 + 白名单语义');

test('STAGE_ORDER 与 STAGE_OPS key 一致', () => {
  assert.deepEqual(STAGE_ORDER, Object.keys(STAGE_OPS));
});

test('每个阶段的 allowedOps 非空且唯一映射', () => {
  for (const key of STAGE_ORDER) {
    const ops = STAGE_OPS[key].allowedOps;
    assert.ok(Array.isArray(ops) && ops.length > 0, `${key} 应有 allowedOps`);
    // allowedOps 在该阶段内唯一
    assert.equal(new Set(ops).size, ops.length);
  }
});

test('normalizeStage: 英文名 / 旧带圈数字别名 / 非法值', () => {
  assert.equal(normalizeStage('rewrite'), 'rewrite');
  assert.equal(normalizeStage('⑤'), 'rewrite');
  assert.equal(normalizeStage('⑪'), 'cache');
  assert.equal(normalizeStage('nope'), null);
  assert.equal(normalizeStage(''), null);
});

test('STAGE_OPS allowedOps 收敛各阶段归属（无反推，全部以 stage 为准）', () => {
  // 阶段归属完全由 rule.stage 决定，allowedOps 是「该阶段表单能配哪些 op」的权威约束；
  // 不存在由 action 反推 stage 的兜底逻辑（无旧数据，无需兼容）。
  assert.deepEqual(STAGE_OPS.rewrite.allowedOps, ['rewrite']);
  assert.deepEqual(STAGE_OPS.respHeaders.allowedOps, ['respHeaders']);
  assert.ok(!STAGE_OPS.rewrite.match, 'rewrite 阶段已无 match 反推函数');
  assert.ok(!STAGE_OPS.respHeaders.match, 'respHeaders 阶段已无 match 反推函数');
  // origin 阶段含回源级 op（clientIp / followRedirect / originTimeout）
  assert.ok(STAGE_OPS.origin.allowedOps.includes('clientIp'), 'origin 阶段允许 clientIp 透传');
  assert.ok(STAGE_OPS.origin.allowedOps.includes('followRedirect'), 'origin 阶段允许回源跟随重定向');
  assert.ok(STAGE_OPS.origin.allowedOps.includes('originTimeout'), 'origin 阶段允许回源超时');
});

test('origin.allowedOps 仅含 op 级 key，不得混入 originConn 的子字段', () => {
  // 根因防护：engine / scheme / port 是 originConn 这个 op 的「子字段」
  // （前端 originConn 卡片内渲染、read() 一并返回；后端 STAGE_OP_FIELDS.originConn
  // 落库时写入）。allowedOps 是 op 级白名单，必须与前端 ACTION_GROUPS 的 value 对齐。
  // 若误把 engine/scheme/port 当独立 op 列进 allowedOps，前端受限模式下拉会与白名单错位 → 空。
  const ops = STAGE_OPS.origin.allowedOps;
  for (const bad of ['engine', 'scheme', 'port']) {
    assert.ok(!ops.includes(bad), `origin.allowedOps 不应含子字段 ${bad}（它属于 originConn op）`);
  }
  // originConn 这个承载三字段的 op 本身必须在白名单内，否则前端「回源连接参数」卡片无法添加
  assert.ok(ops.includes('originConn'), 'origin.allowedOps 必须含 originConn（承载 engine/scheme/port 的卡片）');
});

test('白名单里的 op 全部是合法 op（不得混入任何 op 的子字段）', () => {
  // 通用防护：防止再次把「某 op 的子字段」误当成独立 op 塞进 allowedOps
  // （典型翻车：engine/scheme/port 是 originConn 的子字段，不是独立 op；
  //  poolId/inlineOrigins 是 targetPool 的子字段）。
  // 注意：很多 op 的「字段名」与「op key」同名（如 rewrite、reqHeaders），
  // 所以判断「子字段混入」必须只看「字段值为数组的那些子字段」，而非所有字段名。
  const legalOps = new Set(Object.keys(STAGE_OP_FIELDS));
  // 子字段 = 「字段值为数组」且「字段名 ≠ op key 自身」的那些（op key 与字段同名是合法的，不算子字段）
  const subFields = new Set(
    Object.entries(STAGE_OP_FIELDS).flatMap(([opKey, v]) =>
      Array.isArray(v) ? v.filter((f) => f !== opKey) : []
    )
  );
  const allAllowed = new Set(Object.values(STAGE_OPS).flatMap((s) => s.allowedOps));
  for (const op of allAllowed) {
    assert.ok(legalOps.has(op), `allowedOps 含未知 op：${op}（应属于 STAGE_OP_FIELDS 的 key）`);
    assert.ok(!subFields.has(op), `allowedOps 含子字段 ${op}（它属于某个 op 的子字段，不能当独立 op）`);
  }
});

test('每个 op 至少被一个阶段接纳（无孤儿 op 永远落不了库）', () => {
  const allAllowed = new Set(Object.values(STAGE_OPS).flatMap((s) => s.allowedOps));
  for (const op of Object.keys(STAGE_OP_FIELDS)) {
    assert.ok(allAllowed.has(op), `op ${op} 未出现在任何阶段的 allowedOps 中 → 该 op 字段永远无法落库`);
  }
});

// ============================================================================
console.log('\n[contracts] 全局常量');

test('DEFAULT_RETRY_ON 默认状态吗集合 / CONFIG_VERSION 存在', () => {
  assert.deepEqual([...DEFAULT_RETRY_ON], [500, 502, 503, 504, 522, 524]);
  assert.equal(typeof CONFIG_VERSION, 'string');
});

// ============================================================================
console.log('\n[headers/cache-control] buildClientHeaders 三平台缓存头策略');

/**
 * 构造带平台标识的 ctx（buildClientHeaders 依赖 ctx.caps.platform 决定
 * 是否额外下发 Cloudflare-CDN-Cache-Control）。
 * @param {('cf'|'eo'|'esa'|string)} platform
 */
function makeCacheCtx(platform = 'eo') {
  // 注入 mock kv，使 getGlobalSettings 走「读取为空 → 返回内置默认」分支，
  // 等价于运行时未配置 settings 的情况（与原写死常量行为一致）。
  const ctx = makeCtx({ ctx: { caps: { platform } } });
  ctx.env = Object.assign({}, ctx.env, {
    KV: { get: async () => null, put: async () => {}, delete: async () => {} },
  });
  // store.readJson 优先用 ctx.env.KV，其次 ctx.KV；这里直接挂到 ctx 上双保险
  ctx.KV = ctx.env.KV;
  return ctx;
}

/** 构造一个源站响应；默认带会污染缓存的 set-cookie / no-store，用于验证剥离逻辑。 */
function makeOriginResp(status = 200, headers = { 'set-cookie': 'sid=1', 'cache-control': 'no-store, private' }) {
  return new Response('ok', { status, headers });
}

/** 把 Cache-Control 头按指令拆分，便于断言是否含 max-age / s-maxage / immutable / no-store。 */
function ccDirectives(h) {
  return new Set(
    (h || '')
      .toLowerCase()
      .split(',')
      .map((s) => s.trim().split('=')[0].trim())
  );
}

test('可缓存（CF）：三个头均含 max-age + s-maxage，且额外下发 Cloudflare-CDN-Cache-Control', async () => {
  const ctx = makeCacheCtx('cf');
  const out = await buildClientHeaders(
    ctx,
    makeOriginResp(200),
    { enabled: true, edgeTtl: 15552000, browserTtl: 1800 },
    0
  );
  const cc = out.get('cache-control');
  const cdn = out.get('cdn-cache-control');
  const cfcdn = out.get('cloudflare-cdn-cache-control');

  // 三个头都要存在
  assert.ok(cc, 'Cache-Control 应存在');
  assert.ok(cdn, 'CDN-Cache-Control 应存在');
  assert.ok(cfcdn, 'CF 平台应额外下发 Cloudflare-CDN-Cache-Control');

  // 三个头均同时含 max-age 与 s-maxage（万无一失）
  for (const h of [cc, cdn, cfcdn]) {
    const d = ccDirectives(h);
    assert.ok(d.has('max-age'), `头应包含 max-age: ${h}`);
    assert.ok(d.has('s-maxage'), `头应包含 s-maxage: ${h}`);
  }

  // 源站带回的 set-cookie / no-store / private 已被剥离
  assert.equal(out.get('set-cookie'), null, 'set-cookie 应被剥离');
  assert.ok(!ccDirectives(cc).has('no-store'), 'Cache-Control 不应含 no-store');
  assert.ok(!ccDirectives(cc).has('private'), 'Cache-Control 不应含 private');

  // 浏览器侧 max-age=1800、边缘 s-maxage=15552000
  assert.ok(/max-age=1800/.test(cc), 'Cache-Control 浏览器 max-age 应为 1800');
  assert.ok(/s-maxage=15552000/.test(cc), 'Cache-Control 边缘 s-maxage 应为 15552000');
  assert.ok(/max-age=15552000/.test(cdn), 'CDN-Cache-Control max-age 应为 15552000');
  assert.ok(/s-maxage=15552000/.test(cdn), 'CDN-Cache-Control s-maxage 应为 15552000');
});

test('可缓存（EO / ESA）：仅 Cache-Control + CDN-Cache-Control，无 Cloudflare 专有头', async () => {
  for (const platform of ['eo', 'esa']) {
    const ctx = makeCacheCtx(platform);
    const out = await buildClientHeaders(
      ctx,
      makeOriginResp(200),
      { enabled: true, edgeTtl: 15552000, browserTtl: 1800 },
      0
    );
    assert.ok(out.get('cache-control'), `${platform}: Cache-Control 应存在`);
    assert.ok(out.get('cdn-cache-control'), `${platform}: CDN-Cache-Control 应存在`);
    assert.equal(out.get('cloudflare-cdn-cache-control'), null, `${platform}: 不应下发 Cloudflare-CDN-Cache-Control`);
    // 仍满足三头（此处两标准头）均含 max-age + s-maxage
    assert.ok(/max-age=1800/.test(out.get('cache-control')), `${platform}: Cache-Control 含 max-age`);
    assert.ok(/s-maxage=15552000/.test(out.get('cache-control')), `${platform}: Cache-Control 含 s-maxage`);
    assert.ok(/s-maxage=15552000/.test(out.get('cdn-cache-control')), `${platform}: CDN-Cache-Control 含 s-maxage`);
  }
});

test('TTL 回落默认：edgeTtl/browserTtl 为 0 时使用常量默认（半年/30分钟）', async () => {
  const ctx = makeCacheCtx('cf');
  const out = await buildClientHeaders(ctx, makeOriginResp(200), { enabled: true, edgeTtl: 0, browserTtl: 0 }, 0);
  const cc = out.get('cache-control');
  const cdn = out.get('cdn-cache-control');
  assert.ok(/max-age=1800/.test(cc), '浏览器应回落到默认 1800');
  assert.ok(/s-maxage=15552000/.test(cc), '边缘应回落到默认 15552000');
  assert.ok(/max-age=15552000/.test(cdn), 'CDN-Cache-Control 应回落到默认 15552000');
});

test('browserTtl < 0：Cache-Control 不下发 max-age（仅 s-maxage，交浏览器/源站决定）', async () => {
  const ctx = makeCacheCtx('cf');
  const out = await buildClientHeaders(ctx, makeOriginResp(200), { enabled: true, edgeTtl: 100, browserTtl: -1 }, 0);
  const cc = out.get('cache-control');
  assert.ok(!/max-age=/.test(cc) && /s-maxage=100/.test(cc), `应仅带 s-maxage=100: ${cc}`);
  // 边缘头仍带 max-age
  assert.ok(/max-age=100/.test(out.get('cdn-cache-control')), 'CDN-Cache-Control 仍应带 max-age');
});

test('statusTtl：错误状态码被短时间边缘缓存（s-maxage=statusTtl，浏览器 max-age=0）', async () => {
  const ctx = makeCacheCtx('cf');
  const out = await buildClientHeaders(ctx, makeOriginResp(404), { enabled: true, edgeTtl: 15552000, browserTtl: 1800, statusTtl: { '404': 60 } }, 0);
  const cc = out.get('cache-control');
  assert.ok(/max-age=0/.test(cc), '404 时浏览器 max-age 应为 0');
  assert.ok(/s-maxage=60/.test(cc), '404 时边缘 s-maxage 应为 statusTtl=60');
  assert.ok(/s-maxage=60/.test(out.get('cdn-cache-control')), 'CDN-Cache-Control 应同步 statusTtl');
  assert.ok(out.get('cloudflare-cdn-cache-control'), 'CF 下 404 也应下发 Cloudflare-CDN-Cache-Control');
});

test('NO_CACHE_STATUS：错误响应三头均为 no-store（含 CF 专有头）', async () => {
  const ctx = makeCacheCtx('cf');
  const out = await buildClientHeaders(ctx, makeOriginResp(500), { enabled: true, edgeTtl: 15552000, browserTtl: 1800 }, 0);
  assert.equal(out.get('cache-control'), 'no-store', '500 应为 no-store');
  assert.equal(out.get('cdn-cache-control'), 'no-store', 'CDN-Cache-Control 应为 no-store');
  assert.equal(out.get('cloudflare-cdn-cache-control'), 'no-store', 'CF 下 500 专有头也应为 no-store');
});

test('mode=origin：完全不改写缓存头（源站 no-store 透传，不下发 CDN 头）', async () => {
  const ctx = makeCacheCtx('cf');
  const out = await buildClientHeaders(ctx, makeOriginResp(200), { enabled: true, mode: 'origin', edgeTtl: 100, browserTtl: 10 }, 0);
  // 源站头（小写）原样保留
  assert.ok(/no-store/.test(out.get('cache-control')), '源站 no-store 应透传');
  assert.equal(out.get('cdn-cache-control'), null, 'origin 模式不应下发 CDN-Cache-Control');
  assert.equal(out.get('cloudflare-cdn-cache-control'), null, 'origin 模式不应下发 Cloudflare-CDN-Cache-Control');
});

// ============================================================================
console.log('\n[config/global-rules] 全站兜底规则（阶段→默认动作映射）');

test('DEFAULT_GLOBAL_RULES 覆盖全部 STAGE_ORDER 且为阶段映射结构', () => {
  assert.deepEqual(Object.keys(DEFAULT_GLOBAL_RULES).sort(), [...STAGE_ORDER].sort(), 'DEFAULT_GLOBAL_RULES 键应等于 STAGE_ORDER');
  // 安全基线：默认强制 HTTPS（301）
  assert.equal(DEFAULT_GLOBAL_RULES.terminate.forceHttps, true);
  assert.equal(DEFAULT_GLOBAL_RULES.terminate.forceHttpsStatus, 301);
  // 安全基线：默认不缓存
  assert.equal(DEFAULT_GLOBAL_RULES.cache.enabled, false);
  // 默认空操作：rewrite 不重写、redirect 关闭、reqHeaders/respHeaders 不增删
  assert.equal(DEFAULT_GLOBAL_RULES.rewrite.type, 'none');
  assert.equal(DEFAULT_GLOBAL_RULES.redirect.enabled, false, '默认不应开启重定向');
  assert.ok(Array.isArray(DEFAULT_GLOBAL_RULES.reqHeaders.remove));
  assert.ok(Array.isArray(DEFAULT_GLOBAL_RULES.respHeaders.remove));
});

test('cloneGlobalRules 返回独立深拷贝（修改副本不影响原对象）', () => {
  const a = cloneGlobalRules();
  const b = cloneGlobalRules();
  assert.notEqual(a, b, '应为不同对象');
  // 修改副本的内部字段，原对象不受影响
  a.cache.enabled = true;
  a.terminate.forceHttps = false;
  assert.equal(b.cache.enabled, false, '修改副本不应影响原对象 cache.enabled');
  assert.equal(b.terminate.forceHttps, true, '修改副本不应影响原对象 forceHttps');
});

test('validateGlobalRulesStages: 合法 stages 原样通过校验', () => {
  const input = cloneGlobalRules();
  const r = validateGlobalRulesStages(input);
  assert.equal(r.ok, true, `合法 stages 应校验通过，但得到: ${r.errors.join('; ')}`);
  assert.deepEqual(Object.keys(r.value.stages).sort(), [...STAGE_ORDER].sort(), '校验后保留全部阶段');
  // 不应保留冗余字段（value.stages 仅含合法 stage 的 action 片段）
  for (const stage of STAGE_ORDER) {
    assert.ok(r.value.stages[stage] !== undefined, `${stage} 应有默认动作`);
  }
  // settings 段应随合法输入一并返回（与 stages 并列）
  assert.ok(r.value.settings && typeof r.value.settings === 'object', '校验后应返回 settings 段');
});

test('validateGlobalRulesStages: 未知 stage key 被忽略，缺失阶段用 base 补全', () => {
  const input = {
    rewrite: { type: 'prefix', value: '/v1' },
    __bogus: { foo: 'bar' }, // 未知 key，应被忽略
    // 故意缺失 redirect / reqHeaders 等，应由 base 补全
  };
  const r = validateGlobalRulesStages(input, cloneGlobalRules());
  assert.equal(r.ok, true, `缺失+未知 key 应仍通过校验，但得到: ${r.errors.join('; ')}`);
  assert.equal(r.value.stages.__bogus, undefined, '未知 stage key 应被丢弃');
  assert.equal(r.value.stages.rewrite.type, 'prefix', '已知 stage 的合法值应保留');
  // 缺失阶段应用 base（DEFAULT_GLOBAL_RULES）补全
  assert.equal(r.value.stages.redirect.enabled, false, '缺失 redirect 应由 base 补全为默认关闭重定向');
  assert.equal(r.value.stages.cache.enabled, false, '缺失 cache 应由 base 补全为默认不缓存');
});

test('validateGlobalRulesStages: 某阶段非法值被拒绝并收集错误', () => {
  const input = {
    rewrite: { type: 'none' },
    cache: 'not-an-object', // cache 应为 CachePolicy 对象，非法
  };
  const r = validateGlobalRulesStages(input, cloneGlobalRules());
  assert.equal(r.ok, false, '非法字段应校验失败');
  assert.ok(r.errors.some((e) => /cache/.test(e)), '错误应指向 cache 阶段');
});

// ----------------------------------------------------------------------------
// 全站通用规则落盘：期望 expected vs 实际 actual + 模拟触发
// 内存 KV 桩：duck-typed，满足 getKV 所需 get/put，物理键存储。
// 由于 store 模块级缓存 _mem / _seedPromise 跨测试共享，每个用例用独立
// KV 桩 + invalidateMemCache() 隔离；bumpVersion 不可导出，用读回 cfg:version
// 实际值断言 bump 次数（initial = 0，每次 +1）。
// ----------------------------------------------------------------------------

// store.js 经 getKV → wrap 会对键名做 encodeKey 编码（cfg:global_rules → cfg_3Aglobal_5Frules）。
// 测试桩是「裸 KV 绑定」，由 wrap 负责编码；测试读回/预置必须用编码后的物理键，
// 否则与 store 实际写入的物理键不匹配（导致读回为 null 或脏数据）。
const GR_KEY = encodeKey('cfg:global_rules');
const VER_KEY = encodeKey('cfg:version');

/** 构造一个内存 KV 桩 + 注入 ctx.env.CDN_KV 的 makeCtx */
function makeGlobalCtx() {
  const map = new Map();
  const kv = {
    async get(k) { return map.has(k) ? map.get(k) : null; },
    async put(k, v) { map.set(k, v); return undefined; },
    async delete(k) { map.delete(k); return undefined; },
    _map: map, // 便于测试直接读回实际值
  };
  const ctx = makeCtx({ env: { CDN_KV: kv } });
  return { ctx, kv, map };
}

/** 读回 KV 中 cfg:global_rules 的实际解析对象（物理键） */
async function readGlobalRulesActual(kv) {
  const raw = await kv.get(GR_KEY);
  return raw ? JSON.parse(raw) : null;
}
/** 读回 KV 中 cfg:version 的实际值（物理键，存储为整数） */
async function readVersionActual(kv) {
  const raw = await kv.get(VER_KEY);
  if (raw == null) return 0;
  try { return Number(JSON.parse(raw)) || 0; } catch { return 0; }
}

// T1. 模拟冷启动 seeding 落盘（空 KV）
testA('T1 落盘(冷启动): 空 KV 经 putGlobalRules 播种全 7 阶段 + bump 一次', async () => {
  const { ctx, kv } = makeGlobalCtx();
  invalidateMemCache();
  // 模拟触发：ensureGlobalRulesSeeded（无模块级 _seedPromise 时第一次进入）
  await ensureGlobalRulesSeeded(ctx);

  // 期望 expected
  const expectedStages = cloneGlobalRules();
  const expectedKeys = [...STAGE_ORDER].sort();

  // 实际 actual
  const actual = await readGlobalRulesActual(kv);
  assert.ok(actual !== null, '实际：KV 中 cfg:global_rules 应已落盘');
  assert.deepEqual(Object.keys(actual.stages).sort(), expectedKeys,
    `实际 stages 键集应 === 全部 7 阶段，得到: ${Object.keys(actual.stages).sort().join(',')}`);
  // 每阶段非空对象
  for (const stage of STAGE_ORDER) {
    assert.ok(actual.stages[stage] && typeof actual.stages[stage] === 'object',
      `实际：阶段 ${stage} 应为非空对象`);
  }
  // 与期望结构一致
  assert.deepEqual(Object.keys(actual.stages).sort(), Object.keys(expectedStages).sort(),
    '实际键集与期望 base 键集一致');
  // bumpVersion 恰好一次（从 0 → 1）
  const v = await readVersionActual(kv);
  assert.equal(v, 1, `实际 cfg:version 应 bump 一次到 1，得到: ${v}`);
});

// T2. 部分缺失 stages 读取补全
testA('T2 读取补全: 部分缺失的非空 stages 由 base 合并补全 + bump 一次', async () => {
  const { ctx, kv } = makeGlobalCtx();
  invalidateMemCache();
  // 设置：KV 仅 2/7 阶段
  const partial = {
    stages: {
      rewrite: { type: 'prefix', value: '/v1' },
      cache: { enabled: false },
    },
    settings: { rulesVersion: 1, defaultUpstream: 'pool:main' },
  };
  await kv.put(GR_KEY, JSON.stringify(partial));

  // 模拟触发：getGlobalRules
  const got = await getGlobalRules(ctx);

  // 期望 expected：返回含全部 7 阶段，缺失阶段由 cloneGlobalRules 补全
  assert.deepEqual(Object.keys(got.stages).sort(), [...STAGE_ORDER].sort(),
    `期望返回全部 7 阶段，得到: ${Object.keys(got.stages).sort().join(',')}`);
  assert.equal(got.stages.rewrite.type, 'prefix', '已有 rewrite.type 应保留 prefix');
  assert.equal(got.stages.cache.enabled, false, '已有 cache.enabled 应保留 false');
  assert.equal(got.stages.redirect.enabled, false, '缺失 redirect 由 base 补全为默认关闭');
  assert.ok(got.stages.reqHeaders && typeof got.stages.reqHeaders === 'object', '缺失 reqHeaders 由 base 补全');
  assert.ok(got.stages.origin && typeof got.stages.origin === 'object', '缺失 origin 由 base 补全');
  assert.ok(got.stages.respHeaders && typeof got.stages.respHeaders === 'object', '缺失 respHeaders 由 base 补全');
  assert.ok(got.stages.terminate && typeof got.stages.terminate === 'object', '缺失 terminate 由 base 补全');

  // 实际 actual：KV 应被改写为合并后全量（仅新增 key 时写回 + bump）
  const actual = await readGlobalRulesActual(kv);
  assert.deepEqual(Object.keys(actual.stages).sort(), [...STAGE_ORDER].sort(),
    '实际 KV 应被改写为合并后全量 7 阶段');
  const v = await readVersionActual(kv);
  assert.equal(v, 1, `实际 cfg:version 应因新增 key 而 bump 一次到 1，得到: ${v}`);
});

// T3. 模拟人工编辑调用 putGlobalRules
testA('T3 模拟人工编辑: putGlobalRules 落盘后全 7 阶段 + rewrite.type=none', async () => {
  const { ctx, kv } = makeGlobalCtx();
  invalidateMemCache();
  // 先播种完整结构
  await ensureGlobalRulesSeeded(ctx);

  // 模拟触发：等价于前端 openGlobalRulesDrawer → API.rules.saveGlobal
  // 输入仅改 rewrite.type='none'，其余阶段缺失由 validateGlobalRulesStages 补
  const inputStages = { rewrite: { type: 'none' } };
  const inputSettings = { rulesVersion: 2, defaultUpstream: 'pool:edge' };
  await putGlobalRules(ctx, inputStages, inputSettings);

  // 期望 expected：落盘后 stages 仍含全 7 阶段，rewrite.type==='none'，其余保留 base 默认
  const actual = await readGlobalRulesActual(kv);
  assert.deepEqual(Object.keys(actual.stages).sort(), [...STAGE_ORDER].sort(),
    '期望：落盘后保留全部 7 阶段（缺失由校验补全）');
  assert.equal(actual.stages.rewrite.type, 'none', '期望：rewrite.type 应被人工编辑为 none');
  assert.equal(actual.stages.cache.enabled, false, '期望：未编辑的 cache 保留 base 默认关闭');
  // settings 经 validateGlobalSettings 用内置默认基线裁剪/补全：未知字段(rulesVersion/defaultUpstream)被忽略，
  // 合法段(security/request/...)保留内置默认。语义与人工在管理面编辑等价。
  assert.ok(actual.settings && typeof actual.settings === 'object', '期望：settings 段存在且为对象');
  assert.equal(actual.settings.security.rateLimitRpm, 600, '期望：settings.security 来自内置默认基线');
  assert.deepEqual(actual.settings.request.clientIpHeaders, ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for'],
    '期望：settings.request 来自内置默认基线');
  // 与 T1 落盘结构对比：语义一致（程序自动化 == 人工逐一设置）
  const expectedKeys = [...STAGE_ORDER].sort();
  assert.deepEqual(Object.keys(actual.stages).sort(), expectedKeys, '实际键集与期望一致');
});

// T4. 幂等：已全量时 getGlobalRules 不重复写回/bump
testA('T4 幂等: 已全量时 getGlobalRules 不再写回、bumpVersion 不额外触发', async () => {
  const { ctx, kv } = makeGlobalCtx();
  invalidateMemCache();
  // 设置：KV 已全量 7 阶段 = cloneGlobalRules()
  await kv.put(GR_KEY, JSON.stringify({ stages: cloneGlobalRules(), settings: cloneGlobalSettings() }));
  const vBefore = await readVersionActual(kv); // 0（未 bump 过）

  // 模拟触发：getGlobalRules（应直接原样返回，无新增 key → 不写回、不 bump）
  const got = await getGlobalRules(ctx);
  assert.deepEqual(Object.keys(got.stages).sort(), [...STAGE_ORDER].sort(),
    '已全量时应原样返回全部 7 阶段');

  const vAfter = await readVersionActual(kv);
  assert.equal(vAfter, vBefore, `幂等：已全量时 cfg:version 不应被额外 bump（前 ${vBefore} 后 ${vAfter}）`);
});


test('validateGlobalRulesStages: 顶层非法类型（数组/字符串）被拒', () => {
  assert.equal(validateGlobalRulesStages([]).ok, false, '数组应被拒');
  assert.equal(validateGlobalRulesStages('x').ok, false, '字符串应被拒');
  assert.equal(validateGlobalRulesStages(null).ok, false, 'null 应被拒');
});


// ============================================================================
// ============================================================================
console.log('\n[vars] 内置变量 ${var} 解析引擎（动态规则写法）');

test('expandVars: 静态值（无 ${ 前缀）原样零开销透传', () => {
  const ctx = makeCtx({ url: 'https://x.com/' });
  assert.equal(expandVars('X-Foo', ctx), 'X-Foo');
  assert.equal(expandVars('', ctx), '');
  assert.equal(expandVars('no-dollar-here', ctx), 'no-dollar-here');
});

test('expandVars: 标量变量替换（host/client_ip/method/path）', () => {
  const ctx = makeCtx({ url: 'https://cdn.example.com/a/b?x=1', headers: { 'cf-connecting-ip': '1.2.3.4' } });
  assert.equal(expandVars('${host}', ctx), 'cdn.example.com');
  assert.equal(expandVars('${client_ip}', ctx), '1.2.3.4');
  assert.equal(expandVars('${method}', ctx), 'GET');
  assert.equal(expandVars('${path}', ctx), '/a/b');
});

test('expandVars: 带 key 前缀变量（http_/query_/cookie_）', () => {
  const ctx = makeCtx({
    url: 'https://x.com/?token=abc',
    headers: { 'x-forwarded-for': '9.9.9.9', cookie: 'sid=xyz' },
  });
  // http_ 下划线还原为连字符
  assert.equal(expandVars('${http_x_forwarded_for}', ctx), '9.9.9.9');
  assert.equal(expandVars('${query_token}', ctx), 'abc');
  assert.equal(expandVars('${cookie_sid}', ctx), 'xyz');
});

test('expandVars: 混合文本 + 多个变量', () => {
  const ctx = makeCtx({ url: 'https://x.com/p', headers: { 'x-foo': 'bar' } });
  assert.equal(expandVars('client=${client_ip} via=${http_x_foo}', ctx), 'client= via=bar');
});

test('expandVars: 未知变量回退空串、不抛错、记 debug note', () => {
  const ctx = makeCtx({ url: 'https://x.com/' });
  ctx.debug = { notes: [] };
  assert.equal(expandVars('a${not_a_real_var}b', ctx), 'ab');
  assert.ok(ctx.debug.notes.includes('unknown-var:not_a_real_var'), '应记录未知变量 debug note');
});

test('expandVars: 非法变量名（含大写/点）原样保留、不展开', () => {
  const ctx = makeCtx({ url: 'https://x.com/' });
  // ${a.b} 中的 . 不匹配 [a-z0-9_]+，整段 ${a.b} 不被识别为变量引用，原样保留
  assert.equal(expandVars('x=${a.b}y', ctx), 'x=${a.b}y');
  // ${CLIENT} 大写不匹配白名单，原样保留（强类型：不展开未知大写变量）
  assert.equal(expandVars('x=${CLIENT}y', ctx), 'x=${CLIENT}y');
});

test('expandVars: maxLen 截断防超长注入', () => {
  const ctx = makeCtx({ url: 'https://x.com/', headers: { 'x-long': 'ZZZZZZZZZZ' } });
  const out = expandVars('${http_x_long}', ctx, { maxLen: 4 });
  assert.equal(out.length, 4);
});

test('hasVars / extractVarNames / validateVarNames 辅助', () => {
  assert.equal(hasVars('plain'), false);
  assert.equal(hasVars('${host}'), true);
  assert.deepEqual([...extractVarNames('${client_ip}-${http_x_foo}')].sort(), ['client_ip', 'http_x_foo']);
  // 合法变量名
  assert.equal(validateVarNames('${host}/${path}?ip=${client_ip}').ok, true);
  // 大写变量名不被正则识别为变量引用 → validateVarNames 视为无变量（ok=true），
  // 且 expandVars 原样保留（不展开未知大写变量，强类型防误用）
  assert.equal(validateVarNames('${Host}').ok, true);
  assert.equal(expandVars('x=${Host}y', makeCtx({ url: 'https://x.com/' })), 'x=${Host}y');
});

test('expandVars: client_continent 由 CF-IPCountry 推导（CN→AS）', () => {
  const ctx = makeCtx({ url: 'https://x.com/', headers: { 'cf-ipcountry': 'CN' } });
  assert.equal(expandVars('${client_continent}', ctx), 'AS');
  // 未知国家码回退空串
  const ctx2 = makeCtx({ url: 'https://x.com/', headers: { 'cf-ipcountry': 'ZZ' } });
  assert.equal(expandVars('${client_continent}', ctx2), '');
});

test('expandVars: client_asn 取自 cf-asn / asn 头', () => {
  const ctx = makeCtx({ url: 'https://x.com/', headers: { 'cf-asn': '13335' } });
  assert.equal(expandVars('${client_asn}', ctx), '13335');
  // 非 CF 平台回退 asn 头
  const ctx2 = makeCtx({ url: 'https://x.com/', headers: { asn: '64512' } });
  assert.equal(expandVars('${client_asn}', ctx2), '64512');
  // 两个头都没有 → 空串
  const ctx3 = makeCtx({ url: 'https://x.com/' });
  assert.equal(expandVars('${client_asn}', ctx3), '');
});

test('expandVars: client_device 由 UA 粗分 mobile/bot/desktop', () => {
  const mobile = makeCtx({ url: 'https://x.com/', headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15' } });
  assert.equal(expandVars('${client_device}', mobile), 'mobile');
  const bot = makeCtx({ url: 'https://x.com/', headers: { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } });
  assert.equal(expandVars('${client_device}', bot), 'bot');
  const desktop = makeCtx({ url: 'https://x.com/', headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36' } });
  assert.equal(expandVars('${client_device}', desktop), 'desktop');
  // 无 UA → desktop（默认）
  const noUa = makeCtx({ url: 'https://x.com/' });
  assert.equal(expandVars('${client_device}', noUa), 'desktop');
});

test('expandVars: 三变量组合解析（CN/ASN=13335/iPhone）', () => {
  const ctx = makeCtx({
    url: 'https://x.com/',
    headers: {
      'cf-ipcountry': 'CN',
      'cf-asn': '13335',
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15',
    },
  });
  assert.equal(expandVars('${client_continent}/${client_asn}/${client_device}', ctx), 'AS/13335/mobile');
});

test('DEFAULT_GLOBAL_SETTINGS.debug 默认保持原调试头行为（可配置、默认开启）', () => {
  assert.equal(DEFAULT_GLOBAL_SETTINGS.debug.enabled, true);
  assert.equal(DEFAULT_GLOBAL_SETTINGS.debug.headers.originId, 'X-Origin-Id');
  assert.equal(DEFAULT_GLOBAL_SETTINGS.debug.headers.cache, 'X-Cache');
  assert.equal(DEFAULT_GLOBAL_SETTINGS.debug.headers.ruleId, 'X-Rule-Id');
  assert.equal(DEFAULT_GLOBAL_SETTINGS.debug.headers.retryCount, 'X-Retry-Count');
  assert.equal(DEFAULT_GLOBAL_SETTINGS.debug.headers.edgeTime, 'X-Edge-Time');
});

test('applyRewrite regexTo：捕获组 $1..$9 真正生效', () => {
  const ctx = makeCtx({ url: 'https://x.com/api/v1/users' });
  const out = applyRewrite('/api/v1/users', { type: 'regex', regexFrom: '^/api/(v\\d+)/(.*)$', regexTo: '/v2/$1/$2' }, ctx);
  assert.equal(out, '/v2/v1/users');
});

test('applyRewrite regexTo：支持 ${var} 与捕获组混合', () => {
  const ctx = makeCtx({ url: 'https://x.com/img/photo.png', headers: { 'x-cdn': 'cdn1' } });
  const out = applyRewrite('/img/photo.png', { type: 'regex', regexFrom: '^/img/(.+)$', regexTo: '/${http_x_cdn}/asset/$1' }, ctx);
  assert.equal(out, '/cdn1/asset/photo.png');
});

test('applyRewrite regexTo：超长替换结果回退原路径（防注入）', () => {
  const ctx = makeCtx({ url: 'https://x.com/a' });
  // 用一个会让结果膨胀的替换，超出 8192 上限则回退原路径
  const out = applyRewrite('/a', { type: 'regex', regexFrom: 'a', regexTo: 'X'.repeat(9000) }, ctx);
  assert.equal(out, '/a', '超长替换应回退原路径');
});

test('applyRewrite regex：非法正则容错（不抛错、保持原路径）', () => {
  const ctx = makeCtx({ url: 'https://x.com/(' });
  const out = applyRewrite('/(', { type: 'regex', regexFrom: '(', regexTo: 'x' }, ctx);
  assert.equal(out, '/(');
});

// 直接运行入口（node scripts/test-unit-backend.mjs）
// ============================================================================
import { pathToFileURL } from 'node:url';
const _isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (_isMain) {
  runBackendUnitTests()
    .then((res) => process.exit(res.ok ? 0 : 1))
    .catch((err) => {
      console.error('后端单元测试执行异常:', err);
      process.exit(1);
    });
}
