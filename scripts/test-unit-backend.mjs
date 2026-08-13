/**
 * ============================================================================
 * 后端核心模块单元测试（零依赖，手写 node:assert）
 * ----------------------------------------------------------------------------
 * 覆盖：matcher / rewrite / cachekey / balancer(strategy+circuit+failover) /
 *       security/auth / platform/keyCodec / config(defaults+schema+stages)
 *
 * 运行：node scripts/test-unit-backend.mjs
 * 退出码：全部通过 0；有失败非 0。
 * 作为 npm run build verify 链的一环，任一红则部署阻断。
 * ============================================================================
 */

import assert from 'node:assert/strict';

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
} from '../src/config/schema.js';

import {
  STAGE_OPS,
  STAGE_ORDER,
  STAGE_ALIASES,
  normalizeStage,
} from '../src/config/stages.js';

import { DEFAULT_RETRY_ON, CONFIG_VERSION } from '../src/contracts.js';

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
  console.log('后端单元测试（matcher/rewrite/cachekey/balancer/auth/keyCodec/config）...');
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
  // regex：$& 注入防护——用函数回调让替换文本按字面量处理，而非被当作替换模式展开
  assert.equal(applyRewrite('/a/b', { type: 'regex', regexFrom: '/b', regexTo: '$&' }), '/a$&');
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

test('validateGlobal: 平台能力联动（d1 在无 D1 平台被拦截）', () => {
  const r = validateGlobal({ statsDriver: 'd1' }, { platform: 'eo', hasD1: false });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /D1/.test(e)));
});

test('normRule / validateRule: 完整规则规范化 + 默认值补全', () => {
  const input = {
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

test('STAGE_OPS match(a) 反映各阶段归属语义', () => {
  // rewrite 阶段：有非空 rewrite
  assert.equal(STAGE_OPS.rewrite.match({ rewrite: { type: 'prefix', value: '/x' } }), true);
  assert.equal(STAGE_OPS.rewrite.match({ rewrite: { type: 'none' } }), false);
  // respHeaders 阶段：有 set 或 remove
  assert.equal(STAGE_OPS.respHeaders.match({ respHeaders: { set: { 'X-A': '1' } } }), true);
  assert.equal(STAGE_OPS.respHeaders.match({ respHeaders: { set: {} } }), false);
  // origin 阶段：poolId / hostHeader 非默认
  assert.equal(STAGE_OPS.origin.match({ poolId: 'pl_1' }), true);
  assert.equal(STAGE_OPS.origin.match({ hostHeader: { mode: 'custom', custom: 'x' } }), true);
  assert.equal(STAGE_OPS.origin.match({ hostHeader: { mode: 'accel' } }), false); // inherit/accel 不算越界
});

// ============================================================================
console.log('\n[contracts] 全局常量');

test('DEFAULT_RETRY_ON 默认状态吗集合 / CONFIG_VERSION 存在', () => {
  assert.deepEqual([...DEFAULT_RETRY_ON], [500, 502, 503, 504, 522, 524]);
  assert.equal(typeof CONFIG_VERSION, 'string');
});

// ============================================================================
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
