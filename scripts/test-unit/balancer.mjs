/**
 * scripts/test-unit/balancer.mjs —— 负载均衡 / 熔断 / 故障转移 单测
 * 覆盖原 test-unit-backend.mjs balancer(strategy/circuit) 段，调用真实
 * src/balancer/{strategy,circuit}.js，断言行为而非内部字段。
 */
import assert from 'node:assert';
import { selectOrigin } from '../../src/balancer/strategy.js';
import { isTripped, recordFailure, recordSuccess } from '../../src/balancer/circuit.js';
import { test, testA } from './_testkit.mjs';
import { makeCtx, createMockKV } from './_testkit.mjs';
import { encodeKey } from '../../src/platform/keyCodec.js';

function mkPool(strategy, origins) {
  return {
    id: 'p1',
    strategy,
    origins: origins.map((o, i) => ({ id: 'o' + i, enabled: true, healthy: true, weight: 1, ...o })),
  };
}

function mkCtxFor() {
  const c = makeCtx({ url: 'https://example.com/', method: 'GET' });
  // circuit 内部 ctx.waitUntil(promise) 提交 KV 写入；这里改为同步等待其完成，
  // 否则 isTripped 读取时写入尚未落盘。
  c.waitUntil = (p) => Promise.resolve(p);
  return c;
}

testA('selectOrigin: roundrobin 轮询（连续不同）', (a) => {
  const pool = mkPool('roundrobin', [{}, {}]);
  const first = selectOrigin(pool, mkCtxFor());
  const second = selectOrigin(pool, mkCtxFor());
  a.notEqual(first.id, second.id, '两次选择不同');
});

testA('selectOrigin: weighted 概率分布', (a) => {
  const pool = mkPool('weighted', [{ weight: 9 }, { weight: 1 }]);
  let heavy = 0;
  for (let i = 0; i < 100; i++) if (selectOrigin(pool, mkCtxFor()).id === 'o0') heavy++;
  a.equal(heavy > 50, true, '权重 9 占比 > 50%');
});

testA('selectOrigin: chain 顺序取首个健康', (a) => {
  const pool = mkPool('chain', [{ healthy: true }, { healthy: false }]);
  a.equal(selectOrigin(pool, mkCtxFor()).id, 'o0', 'chain 取首个健康');
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

testA('circuit: recordFailure 单次写入使计数+1', async (a) => {
  const ctx = mkCtxFor();
  const kv = createMockKV();
  ctx.env = { CDN_KV: kv };
  const key = encodeKey(`hc:${'p-rf'}:${'o-rf'}`);
  await recordFailure(ctx, 'p-rf', 'o-rf');
  // 等后台 waitUntil 落盘（写合并：窗口内多次失败合并为一次 KV 读改写）
  await new Promise((r) => setTimeout(r, 10));
  a.equal(await kv.get(key), '1', '首次失败计数=1');
});

testA('circuit: recordSuccess 清空计数（恢复）', async (a) => {
  const ctx = mkCtxFor();
  ctx.env = { CDN_KV: createMockKV() };
  // 先累计到熔断（内存即时）
  await recordFailure(ctx, 'p-rec', 'o-rec');
  await recordFailure(ctx, 'p-rec', 'o-rec');
  await recordFailure(ctx, 'p-rec', 'o-rec');
  a.equal(await isTripped(ctx, 'p-rec', 'o-rec'), true, '先置为熔断');
  await recordSuccess(ctx, 'p-rec', 'o-rec');
  await new Promise((r) => setTimeout(r, 10));
  a.equal(await isTripped(ctx, 'p-rec', 'o-rec'), false, '成功后恢复（内存清 + KV delete）');
});

testA('circuit: 未失败不熔断', async (a) => {
  const ctx = mkCtxFor();
  ctx.env = { CDN_KV: createMockKV() };
  a.equal(await isTripped(ctx, 'p-new', 'o-new'), false, '初始未熔断');
});
