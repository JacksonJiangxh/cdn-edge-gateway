/**
 * scripts/test-unit/balancer.mjs —— 负载均衡 / 熔断 / 故障转移 单测
 * 覆盖原 test-unit-backend.mjs balancer(strategy/circuit) 段，调用真实
 * src/balancer/{strategy,circuit}.js，断言行为而非内部字段。
 */
import assert from 'node:assert';
import { selectOrigin, primeChainWeights } from '../../src/balancer/strategy.js';
import { isTripped, recordFailure, recordSuccess } from '../../src/balancer/circuit.js';
import { requestWithFailover } from '../../src/balancer/failover.js';
import { test, testA } from './_testkit.mjs';
import { makeCtx, createMockKV, withFakeFetch, mockResponse } from './_testkit.mjs';
import { encodeKey } from '../../src/platform/keyCodec.js';

function mkPool(strategy, origins) {
  const pool = {
    id: 'p1',
    strategy,
    origins: origins.map((o, i) => ({ id: 'o' + i, enabled: true, healthy: true, weight: 1, ...o })),
  };
  primeChainWeights(pool); // 预计算 __maxOrder，使未填 weight 时 order 派生权重生效
  return pool;
}

function mkCtxFor() {
  const c = makeCtx({ url: 'https://example.com/', method: 'GET' });
  // circuit 内部 ctx.waitUntil(promise) 提交 KV 写入；这里改为同步等待其完成，
  // 否则 isTripped 读取时写入尚未落盘。
  c.waitUntil = (p) => Promise.resolve(p);
  return c;
}

testA('selectOrigin: weighted 均分（权重相等即轮流，连续不同）', (a) => {
  const pool = mkPool('weighted', [{}, {}]);
  const first = selectOrigin(pool, mkCtxFor());
  const second = selectOrigin(pool, mkCtxFor());
  a.notEqual(first.id, second.id, '权重相等时两次选择不同（轮询）');
});

testA('selectOrigin: 未填 weight 时按 order 派生权重（chain 旧语义迁移）', (a) => {
  // weighted 池不填 weight（注意：不能带 weight 字段，否则 weightOf 走显式分支），
  // order=[1,5] 派生权重 [5,1]，long-run 倾向先选 o0
  const pool = {
    id: 'p1', strategy: 'weighted',
    origins: [
      { id: 'o0', enabled: true, healthy: true, order: 1 },
      { id: 'o1', enabled: true, healthy: true, order: 5 },
    ],
  };
  primeChainWeights(pool);
  let first = 0;
  for (let i = 0; i < 200; i++) if (selectOrigin(pool, mkCtxFor()).id === 'o0') first++;
  a.equal(first > 100, true, 'order 小的源站被优先选中（派生权重更高）');
});

testA('selectOrigin: weighted 概率分布', (a) => {
  const pool = mkPool('weighted', [{ weight: 9 }, { weight: 1 }]);
  let heavy = 0;
  for (let i = 0; i < 100; i++) if (selectOrigin(pool, mkCtxFor()).id === 'o0') heavy++;
  a.equal(heavy > 50, true, '权重 9 占比 > 50%');
});

testA('selectOrigin: chain 严格串行 —— 按 order 升序取首个可用（无权重、非轮询）', (a) => {
  // order=[2,1]：即使 o1 排在数组后面，也应选 order 最小的 o1（不是数组首位 o0）
  const pool = mkPool('chain', [{ order: 2 }, { order: 1 }]);
  a.equal(selectOrigin(pool, mkCtxFor()).id, 'o1', 'chain 取 order 最小者（o1）');
});

testA('selectOrigin: chain 排除坏源站后下一个 order 顶上（1→2→3→4 串行）', (a) => {
  const pool = mkPool('chain', [{ order: 1 }, { order: 2 }, { order: 3 }]);
  a.equal(selectOrigin(pool, mkCtxFor(), new Set(['o0'])).id, 'o1', '排除 order1 后选 order2');
  a.equal(selectOrigin(pool, mkCtxFor(), new Set(['o0', 'o1'])).id, 'o2', '再排除后选 order3');
});

testA('selectOrigin: chain 多次选择固定为同一 order 最小者（非轮询）', (a) => {
  // 与 weighted 不同：chain 不轮询，相同候选集下每次都选同一个
  const pool = mkPool('chain', [{ order: 1 }, { order: 2 }]);
  const a1 = selectOrigin(pool, mkCtxFor()).id;
  const a2 = selectOrigin(pool, mkCtxFor()).id;
  a.equal(a1, a2, 'chain 固定取 order 最小者，不轮询');
});

testA('selectOrigin: 跳过被排除（熔断）源站', (a) => {
  const pool = mkPool('chain', [{ id: 'a', healthy: true }, { id: 'b', healthy: true }]);
  const picked = selectOrigin(pool, mkCtxFor(), new Set(['a']));
  a.equal(picked.id, 'b', '排除 a 后选 b');
});

testA('selectOrigin: 无可用源站（空池）返回 null', (a) => {
  const pool = mkPool('chain', []);
  a.equal(selectOrigin(pool, mkCtxFor(), new Set()), null, '空池→null');
});

testA('selectOrigin: 全部排除→fail-open 智能放行（返回最佳兜底源站）', (a) => {
  const pool = mkPool('chain', [{ id: 'a', healthy: true }, { id: 'b', healthy: true }]);
  const picked = selectOrigin(pool, mkCtxFor(), new Set(['a', 'b']));
  // 全员不可用时不再盲目返回 null，而是挑「最值得一试」的源站（fail-open 兜底取数）
  a.notEqual(picked, null, '全员排除仍返回兜底源站（不拒绝服务）');
  a.ok(['a', 'b'].includes(picked.id), '兜底源站在 enabled 集合内');
});

testA('circuit: 累计失败达阈值则熔断（内存计数即时生效）', async (a) => {
  const ctx = mkCtxFor();
  ctx.env = { CDN_KV: createMockKV() };
  // 连续 3 次失败：recordFailure 内存计数立即 +1，第 3 次即达阈值（无需等 KV 落盘）
  await recordFailure(ctx, 'p-trip', 'o-trip');
  await recordFailure(ctx, 'p-trip', 'o-trip');
  await recordFailure(ctx, 'p-trip', 'o-trip');
  a.equal(await isTripped(ctx, 'p-trip', 'o-trip'), true, '计数>=3 熔断（L1 即时）');
});

testA('circuit: recordFailure 单次失败使内存计数+1（不足阈值不熔断）', async (a) => {
  const ctx = mkCtxFor();
  // 纯 isolate 内存：每次 recordFailure 内存计数+1，但 <3 不熔断
  await recordFailure(ctx, 'p-rf', 'o-rf');
  a.equal(await isTripped(ctx, 'p-rf', 'o-rf'), false, '1 次失败不熔断（计数=1）');
  await recordFailure(ctx, 'p-rf', 'o-rf');
  a.equal(await isTripped(ctx, 'p-rf', 'o-rf'), false, '2 次失败不熔断（计数=2）');
});

testA('circuit: recordSuccess 清空计数（恢复）', async (a) => {
  const ctx = mkCtxFor();
  // 先累计到熔断（内存即时）
  await recordFailure(ctx, 'p-rec', 'o-rec');
  await recordFailure(ctx, 'p-rec', 'o-rec');
  await recordFailure(ctx, 'p-rec', 'o-rec');
  a.equal(await isTripped(ctx, 'p-rec', 'o-rec'), true, '先置为熔断');
  await recordSuccess(ctx, 'p-rec', 'o-rec');
  a.equal(await isTripped(ctx, 'p-rec', 'o-rec'), false, '成功后恢复（内存清，纯内存无 KV）');
});

testA('circuit: 未失败不熔断', async (a) => {
  const ctx = mkCtxFor();
  ctx.env = { CDN_KV: createMockKV() };
  a.equal(await isTripped(ctx, 'p-new', 'o-new'), false, '初始未熔断');
});

/* ---------------------------------------------------------------------------
 * 多源站「按源站求值规则」回归用例
 * ---------------------------------------------------------------------------
 * 复现并锁定曾导致「源站池启用 2 个源站后回源必然 404」的缺陷：
 * 站点规则以 origin 为匹配条件，CNB 与 GitHub 的 raw 路径格式完全不同；
 * 若规则只在请求级求值一次就冻结，换源 / 竞速时就会把 A 源站的路径打到
 * B 源站域名上。这里断言 requestWithFailover 在每次尝试都按「本次实际
 * 使用的源站」重新求值 rewrite，并断言 404 会触发换源。
 */
function mkOriginBoundSite() {
  // 两条 rewrite 规则各自绑定一个源站（match.target='origin'），重写目标路径格式不同 ——
  // 正是「CNB raw 路径 vs GitHub raw 路径」的最小复现。
  return {
    rules: [
      {
        // conditions 为二维数组（外 OR 内 AND）；写成一维会被 filter 丢弃而「匹配全部」。
        id: 'r-cnb', priority: 100, enabled: true, stage: 'rewrite',
        match: { conditions: [[{ target: 'origin', op: 'equal', values: ['o0'] }]] },
        action: { rewrite: { type: 'regex', regexFrom: '^/img/(.*)$', regexTo: '/owner/repo/-/git/raw/main/$1' } },
      },
      {
        id: 'r-gh', priority: 100, enabled: true, stage: 'rewrite',
        match: { conditions: [[{ target: 'origin', op: 'equal', values: ['o1'] }]] },
        action: { rewrite: { type: 'regex', regexFrom: '^/img/(.*)$', regexTo: '/owner/repo/main/$1' } },
      },
    ],
  };
}

testA('failover: 每次尝试按 origin 重新求值 rewrite（多源站不再错配路径）', async (a) => {
  const ctx = mkCtxFor();
  ctx.url = new URL('https://example.com/img/a.webp');
  ctx.request = { method: 'GET', url: ctx.url.toString(), headers: new Map() };
  ctx.debug = { tried: [], notes: [] };
  ctx.__globalStages = {};

  const pool = {
    id: 'p-multi',
    strategy: 'chain',
    // chain 策略下顺序取首个可用，便于确定性断言换源顺序
    origins: [
      { id: 'o0', enabled: true, healthy: true, weight: 1, addr: 'cnb.example', scheme: 'https', port: 443 },
      { id: 'o1', enabled: true, healthy: true, weight: 1, addr: 'gh.example', scheme: 'https', port: 443 },
    ],
    failover: { enabled: true, maxRetries: 2, retryOn: ['4xx5xx'], timeoutMs: 5000 },
  };

  const seen = [];
  await withFakeFetch(async (url) => {
    seen.push(String(url));
    // 首个源站（CNB 路径）一律 404 —— 模拟「该源站没有这个文件」，
    // 第二个源站（GitHub 路径）才有文件。
    if (String(url).includes('/-/git/raw/main/')) return mockResponse(404, 'nope');
    return mockResponse(200, 'IMG');
  }, async () => {
    // hostHeader=inherit：回源 host 取 origin.addr，使「域名 + 路径」的配对可断言
    const resp = await requestWithFailover(ctx, pool, null, { mode: 'inherit', custom: '' }, {
      site: mkOriginBoundSite(),
    });
    a.equal(resp.status, 200, '404 触发换源后最终 200（而非把 404 返回客户端）');
  });

  a.equal(seen.length >= 2, true, '至少发生一次换源');
  a.ok(seen.some((u) => u.includes('cnb.example') && u.includes('/-/git/raw/main/')),
    'CNB 源站使用 CNB 规则的路径');
  a.ok(seen.some((u) => u.includes('gh.example') && u.includes('/owner/repo/main/')),
    'GitHub 源站使用 GitHub 规则的路径');
  // 核心反向断言：绝不能出现「GitHub 域名 + CNB 路径」的错配组合
  a.equal(seen.some((u) => u.includes('gh.example') && u.includes('/-/git/raw/main/')), false,
    '不出现 GitHub 域名 + CNB 路径的错配');
  a.equal(seen.some((u) => u.includes('cnb.example') && !u.includes('/-/git/raw/main/')), false,
    '不出现 CNB 域名 + GitHub 路径的错配');
});

testA('failover: 单源站池 404 不换源（保持既有语义，零回归）', async (a) => {
  const ctx = mkCtxFor();
  ctx.url = new URL('https://example.com/img/a.webp');
  ctx.request = { method: 'GET', url: ctx.url.toString(), headers: new Map() };
  ctx.debug = { tried: [], notes: [] };
  ctx.__globalStages = {};

  const pool = {
    id: 'p-single',
    strategy: 'chain',
    origins: [{ id: 'o0', enabled: true, healthy: true, weight: 1, addr: 'cnb.example', scheme: 'https', port: 443 }],
    failover: { enabled: true, maxRetries: 3, retryOn: ['4xx5xx'], timeoutMs: 5000 },
  };

  let calls = 0;
  await withFakeFetch(async () => { calls++; return mockResponse(404, 'nope'); }, async () => {
    const resp = await requestWithFailover(ctx, pool, null, undefined, { site: mkOriginBoundSite() });
    a.equal(resp.status, 404, '单源站 404 原样返回');
  });
  a.equal(calls, 1, '单源站只打一次（failover 强制关闭）');
});

testA('failover: 首选源站被复用，同一请求不重复推进 SWRR', async (a) => {
  const ctx = mkCtxFor();
  ctx.url = new URL('https://example.com/img/a.webp');
  ctx.request = { method: 'GET', url: ctx.url.toString(), headers: new Map() };
  ctx.debug = { tried: [], notes: [] };
  ctx.__globalStages = {};

  const pool = {
    id: 'p-pref',
    strategy: 'weighted',
    origins: [
      { id: 'o0', enabled: true, healthy: true, weight: 1, addr: 'a.example', scheme: 'https', port: 443 },
      { id: 'o1', enabled: true, healthy: true, weight: 1, addr: 'b.example', scheme: 'https', port: 443 },
    ],
    failover: { enabled: true, maxRetries: 2, retryOn: ['4xx5xx'], timeoutMs: 5000 },
  };

  const hosts = [];
  await withFakeFetch(async (url) => {
    hosts.push(new URL(String(url)).hostname);
    return mockResponse(200, 'OK');
  }, async () => {
    // 显式指定首选源站为 o1：首次尝试必须就用 o1，而不是再选一次源
    const preferred = pool.origins[1];
    const resp = await requestWithFailover(ctx, pool, null, { mode: 'inherit', custom: '' }, {
      site: mkOriginBoundSite(), preferredOrigin: preferred,
    });
    a.equal(resp.status, 200, '回源成功');
  });
  a.equal(hosts[0], 'b.example', '首次尝试复用管线已选中的首选源站 o1');
});
