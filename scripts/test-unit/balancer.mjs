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

testA('selectOrigin: 全部排除返回 null', (a) => {
  const pool = mkPool('chain', [{ id: 'a', healthy: true }]);
  a.equal(selectOrigin(pool, mkCtxFor(), new Set(['a', 'x'])), null, '全排除→null');
});

testA('circuit: 计数达阈值则熔断（isTripped 读取语义）', async (a) => {
  const ctx = mkCtxFor();
  const kv = createMockKV();
  ctx.env = { CDN_KV: kv };
  // 直接写入熔断计数（key 经 encodeKey 编码）
  const key = encodeKey(`hc:${'p-trip'}:${'o-trip'}`);
  await kv.put(key, '3', { expirationTtl: 60 });
  a.equal(await isTripped(ctx, 'p-trip', 'o-trip'), true, '计数>=3 熔断');
});

testA('circuit: recordFailure 单次写入使计数+1', async (a) => {
  const ctx = mkCtxFor();
  const kv = createMockKV();
  ctx.env = { CDN_KV: kv };
  const key = encodeKey(`hc:${'p-rf'}:${'o-rf'}`);
  await recordFailure(ctx, 'p-rf', 'o-rf');
  // 等后台 waitUntil 落盘
  await new Promise((r) => setTimeout(r, 10));
  a.equal(await kv.get(key), '1', '首次失败计数=1');
});

testA('circuit: recordSuccess 清空计数（恢复）', async (a) => {
  const ctx = mkCtxFor();
  const kv = createMockKV();
  ctx.env = { CDN_KV: kv };
  const key = encodeKey(`hc:${'p-rec'}:${'o-rec'}`);
  await kv.put(key, '3', { expirationTtl: 60 });
  a.equal(await isTripped(ctx, 'p-rec', 'o-rec'), true, '先置为熔断');
  await recordSuccess(ctx, 'p-rec', 'o-rec');
  await new Promise((r) => setTimeout(r, 10));
  a.equal(await isTripped(ctx, 'p-rec', 'o-rec'), false, '成功后恢复');
});

testA('circuit: 未失败不熔断', async (a) => {
  const ctx = mkCtxFor();
  ctx.env = { CDN_KV: createMockKV() };
  a.equal(await isTripped(ctx, 'p-new', 'o-new'), false, '初始未熔断');
});
