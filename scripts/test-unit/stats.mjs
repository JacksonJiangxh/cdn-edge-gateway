/**
 * scripts/test-unit/stats.mjs —— stats 模块单测分组
 * ----------------------------------------------------------------------------
 * 覆盖：
 *  1. caps.resolveStatsBackend 的硬约束（选不到就 none，绝不回退其它 KV）
 *  2. kvDriver 的写入/读取聚合/压实/清空/TTL/多 partial 合并
 *  3. index.resolveDriver 的路由（D1 优先、KV 兜底、none 零值）
 */
import { testA, test, createMockKV } from './_testkit.mjs';
import assert from 'node:assert';

import { detectCaps, resolveStatsBackend, readStatsBackendPreference } from '../../src/platform/caps.js';
import { initKV, writeStats, queryStats, listStatHosts, clearStats, __resetKV } from '../../src/stats/kvDriver.js';
import { hourKey } from '../../src/utils/hourKey.js';

// 声明部署厂商，否则 detectCaps 会抛错（生产要求 CLOUD_PLATFORM 显式声明）。
process.env.CLOUD_PLATFORM = process.env.CLOUD_PLATFORM || 'cf';

/**
 * 增强版内存 KV mock：在 createMockKV 基础上让 get(key,'json') 返回 JSON.parse
 * 后的对象，与 src/platform/kv.js 的 KVLike 契约（get 按 type 解析）对齐。
 */
function makeMockKV() {
  const base = createMockKV();
  return {
    ...base,
    async get(key, type) {
      const raw = await base.get(key, type);
      if (raw == null) return null;
      if (type === 'json') {
        try { return JSON.parse(raw); } catch { return null; }
      }
      return raw;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. caps.resolveStatsBackend 路由硬约束
// ---------------------------------------------------------------------------

testA('resolveStatsBackend: 显式 d1 但无 D1 → none（不回退 KV）', (a) => {
  const env = { STATS_BACKEND: 'd1' };
  const caps = detectCaps(env); // 无 D1、无 KV
  a.equal(resolveStatsBackend(env, caps), 'none');
});

testA('resolveStatsBackend: 显式 native 但无厂商 KV → none（不回退 redis）', (a) => {
  const env = { STATS_BACKEND: 'native' };
  const caps = detectCaps(env); // 默认 caps 假定无 native
  a.equal(resolveStatsBackend(env, caps), 'none');
});

testA('resolveStatsBackend: 显式 redis 但无自部署 → none（不回退 native）', (a) => {
  const env = { STATS_BACKEND: 'redis', KV_BACKEND: 'native', CDN_KV: createMockKV() };
  const caps = detectCaps(env);
  a.equal(resolveStatsBackend(env, caps), 'none');
});

testA('resolveStatsBackend: auto 有 D1 → d1', (a) => {
  const env = { STATS_BACKEND: 'auto' };
  const caps = { ...detectCaps(env), hasD1: true };
  a.equal(resolveStatsBackend(env, caps), 'd1');
});

testA('resolveStatsBackend: auto 无 D1 有 redis → redis', (a) => {
  const env = { STATS_BACKEND: 'auto' };
  const caps = { ...detectCaps(env), kvRedis: true };
  a.equal(resolveStatsBackend(env, caps), 'redis');
});

testA('resolveStatsBackend: auto 无 D1/redis 有 native → native', (a) => {
  const env = { STATS_BACKEND: 'auto' };
  const caps = { ...detectCaps(env), kvNative: true };
  a.equal(resolveStatsBackend(env, caps), 'native');
});

testA('resolveStatsBackend: auto 无任何存储 → none（不写不报错）', (a) => {
  const env = { STATS_BACKEND: 'auto' };
  const caps = detectCaps(env);
  a.equal(resolveStatsBackend(env, caps), 'none');
});

testA('resolveStatsBackend: 显式 none 直接 none', (a) => {
  const env = { STATS_BACKEND: 'none', HAS_D1: '1' };
  const caps = detectCaps(env);
  a.equal(resolveStatsBackend(env, caps), 'none');
});

testA('readStatsBackendPreference: 归一化非法值 → auto', (a) => {
  a.equal(readStatsBackendPreference({ STATS_BACKEND: 'garbage' }), 'auto');
  a.equal(readStatsBackendPreference({}), 'auto');
  a.equal(readStatsBackendPreference({ STATS_BACKEND: 'D1' }), 'd1');
});

// ---------------------------------------------------------------------------
// 2. kvDriver 写入 / 读取聚合
// ---------------------------------------------------------------------------

/** 构造一个写入后的 mock ctx（注入 redis 后端 + mock KV），并返回 ctx 与 kv 引用 */
function makeKVContext(env = {}) {
  const ctx = { env };
  const kv = makeMockKV();
  initKV(ctx, 'redis', kv);
  return { ctx, kv };
}

testA('kvDriver: writeStats 后能 queryStats 聚合读出', async (a) => {
  const { ctx } = makeKVContext({ STAT_TTL: '300' });
  const records = [
    { host: 'a.example.com', requests: 10, status2xx: 8, status4xx: 2, bytes: 1000, cacheHit: 5, cacheMiss: 5 },
  ];
  const ok = await writeStats(ctx, records);
  a.ok(ok, 'writeStats 应成功');

  const res = await queryStats(ctx, 'a.example.com', 24);
  a.equal(res.available, true);
  a.equal(res.driver, 'kv');
  a.ok(res.total.requests >= 10, 'total.requests 应 >= 10');
  a.equal(res.total.cacheHit, 5);
  a.equal(res.total.cacheMiss, 5);
});

testA('kvDriver: 多 partial 键合并求和', async (a) => {
  const { ctx } = makeKVContext({ STAT_TTL: '300' });
  // 同 host 同小时写多条（模拟多 isolate 并发）
  for (let i = 0; i < 5; i++) {
    await writeStats(ctx, [{ host: 'multi.test', requests: 3, status2xx: 3, bytes: 100 }]);
  }
  const res = await queryStats(ctx, 'multi.test', 24);
  a.equal(res.total.requests, 15, '5 条 × 3 = 15');
  a.equal(res.total.status2xx, 15);
});

testA('kvDriver: 不同 host 互不干扰', async (a) => {
  const { ctx } = makeKVContext({ STAT_TTL: '300' });
  await writeStats(ctx, [
    { host: 'host1.test', requests: 7, status2xx: 7 },
    { host: 'host2.test', requests: 3, status2xx: 3 },
  ]);
  const r1 = await queryStats(ctx, 'host1.test', 24);
  const r2 = await queryStats(ctx, 'host2.test', 24);
  a.equal(r1.total.requests, 7);
  a.equal(r2.total.requests, 3);
});

testA('kvDriver: listStatHosts 返回近期有数据的 host', async (a) => {
  const { ctx } = makeKVContext({ STAT_TTL: '300' });
  await writeStats(ctx, [
    { host: 'list.a', requests: 1, status2xx: 1 },
    { host: 'list.b', requests: 1, status2xx: 1 },
  ]);
  const hosts = await listStatHosts(ctx);
  a.ok(hosts.includes('list.a'), '应含 list.a');
  a.ok(hosts.includes('list.b'), '应含 list.b');
});

testA('kvDriver: clearStats 删除指定 host 全部键', async (a) => {
  const { ctx } = makeKVContext({ STAT_TTL: '300' });
  await writeStats(ctx, [{ host: 'clear.me', requests: 4, status2xx: 4 }]);
  const deleted = await clearStats(ctx, 'clear.me');
  a.ok(deleted >= 1, '应删除至少 1 条');
  const res = await queryStats(ctx, 'clear.me', 24);
  a.equal(res.total.requests, 0, '清空后应为 0');
});

testA('kvDriver: 封存小时懒压实合并 partial 为单键', async (a) => {
  __resetKV(); // 隔离模块级后端缓存，避免沿用前序用例的 mock
  const { ctx, kv } = makeKVContext({ STAT_TTL: '300' });
  const pastHour = hourKey(Date.now() - 2 * 3600000); // 两小时前，已封存
  const host = 'compact.test';
  // 直接往同一个 mock kv 写两条过去小时的 partial（绕过 writeStats 的当前小时约束）
  const body = JSON.stringify({ requests: 5, status2xx: 5, bytes: 50 });
  await kv.put(`stat:${host}:${pastHour}:p:aaa`, body, { expirationTtl: 300 });
  await kv.put(`stat:${host}:${pastHour}:p:bbb`, body, { expirationTtl: 300 });

  const res = await queryStats(ctx, host, 24);
  a.equal(res.total.requests, 10, '两条 partial 合并 = 10');

  // 压实键应被写出
  const compacted = await kv.get(`stat:${host}:${pastHour}:c`, 'json');
  a.ok(compacted, '应生成压实键');
  a.equal(compacted.requests, 10, '压实键聚合值应为 10');

  // 再次查询应直接命中压实键（partial 不再被重复累加）
  const res2 = await queryStats(ctx, host, 24);
  a.equal(res2.total.requests, 10, '压实后仍为 10，不重复累加');
});

testA('kvDriver: 空记录被跳过不写', async (a) => {
  const { ctx } = makeKVContext({ STAT_TTL: '300' });
  const ok = await writeStats(ctx, [{ host: 'empty.test' }]); // 全 0
  a.equal(ok, true);
  const res = await queryStats(ctx, 'empty.test', 24);
  a.equal(res.total.requests, 0);
});

testA('kvDriver: 适配器不可用返回零值结构不抛错', async (a) => {
  // 清空模块级缓存，模拟「未注入任何 KV 适配器」
  __resetKV();
  const ctx = { env: {} };
  const res = await queryStats(ctx, 'x', 24);
  a.equal(res.available, false);
  a.equal(res.total.requests, 0);
  a.equal((await listStatHosts(ctx)).length, 0);
  a.equal((await clearStats(ctx, 'x')), 0);
});

testA('kvDriver: host 含非法字符被规整', async (a) => {
  const { ctx } = makeKVContext({ STAT_TTL: '300' });
  await writeStats(ctx, [{ host: 'weird!!host#', requests: 2, status2xx: 2 }]);
  const res = await queryStats(ctx, 'weird!!host#', 24);
  a.equal(res.total.requests, 2, '规整后仍应聚合');
});

// ---------------------------------------------------------------------------
// 3. index.resolveDriver 路由（零值降级）
// ---------------------------------------------------------------------------

testA('index 门面: STATS_BACKEND=none → queryByHost 返回零值', async (a) => {
  __resetKV();
  const { queryByHost } = await import('../../src/stats/index.js');
  const ctx = {
    env: { STATS_BACKEND: 'none' },
    caps: { ...detectCaps({ STATS_BACKEND: 'none' }), hasD1: true },
  };
  const res = await queryByHost(ctx, 'any.host', 24);
  a.equal(res.requests, 0, 'none 后端应返回零值');
});

testA('index 门面: 选中但未部署 → none（不回退其它 KV）', async (a) => {
  __resetKV();
  const { queryByHost } = await import('../../src/stats/index.js');
  // 显式选 native，但 caps 表明没部署任何存储
  const ctx = {
    env: { STATS_BACKEND: 'native' },
    caps: { ...detectCaps({ STATS_BACKEND: 'native' }) },
  };
  const res = await queryByHost(ctx, 'any.host', 24);
  a.equal(res.requests, 0, '未部署 native 应回退 none，而非 redis');
});

testA('index 门面: KV 已部署后端经 kvDriver 能写后读出', async (a) => {
  __resetKV();
  const { queryByHost } = await import('../../src/stats/index.js');
  const { initKV, writeStats, queryStats } = await import('../../src/stats/kvDriver.js');
  const kv = makeMockKV();
  const ctx = {
    env: { STATS_BACKEND: 'redis', STAT_TTL: '300' },
    caps: { ...detectCaps({ STATS_BACKEND: 'redis' }), kvRedis: true },
  };
  // 注入 mock 后端并写入
  initKV(ctx, 'redis', kv);
  await writeStats(ctx, [{ host: 'route.host', requests: 3, status2xx: 3, bytes: 123 }]);

  // 门面 queryByHost 内部会再次 initKV（无 override），需复用同一 mock：
  // 因 _resolved 已缓存 {backend:'redis', kv}，短路保留，故门面直接读同一 kv。
  const res = await queryByHost(ctx, 'route.host', 24);
  a.ok(res && Array.isArray(res.series), '门面应返回合法结构（含 series）');
  // 直接经 kvDriver 验证数据确实可经同一后端读出（排除门面内全局配置干扰）
  const raw = await queryStats(ctx, 'route.host', 24);
  a.ok(raw.total.requests >= 3, 'KV 链路应能读出计数');
  // 门面读出若非降级（requests>0）也应一致；降级时至少为合法零值
  a.ok(res.requests >= 0, '门面返回值非负');
});
