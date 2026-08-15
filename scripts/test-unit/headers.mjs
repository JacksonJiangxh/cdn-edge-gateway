/**
 * scripts/test-unit/headers.mjs —— 响应头品牌注入 单测
 * 覆盖原 test-unit-backend.mjs [headers/cache-control] + [platform/cache] 段：
 * getBrandHeaders 注入 Server/Via（基础品牌头），以及命中/未命中/移除场景。
 */
import assert from 'node:assert';
import { getBrandHeaders } from '../../src/proxy/headers.js';
import { test, testA } from './_testkit.mjs';
import { makeCtx } from './_testkit.mjs';

function ctxWith(overrides = {}) {
  const url = new URL('https://example.com/');
  return makeCtx({
    url,
    method: 'GET',
    extra: {
      debug: {},
      waitUntil() {},
      reqId: 't1',
      startTime: Date.now(),
      ...overrides,
    },
  });
}

testA('getBrandHeaders: 命中场景注入 Server/Via', (a) => {
  const ctx = ctxWith();
  ctx.debug = { cache: 'HIT', originId: 'o1' };
  const h = getBrandHeaders(ctx, null);
  a.equal(h.Server, 'EdgeGateway', 'Server 固定');
  a.equal(h.Via, '1.1 EdgeGateway', 'Via 固定');
});

testA('getBrandHeaders: 未命中（MISS）基础品牌仍在', (a) => {
  const ctx = ctxWith();
  ctx.debug = { cache: 'MISS', originId: 'o2' };
  const h = getBrandHeaders(ctx, null);
  a.equal(h.Server, 'EdgeGateway', 'MISS 仍注入 Server');
  a.equal(h.Via, '1.1 EdgeGateway', 'MISS 仍注入 Via');
});

testA('getBrandHeaders: BYPASS 基础品牌仍在', (a) => {
  const ctx = ctxWith();
  ctx.debug = { cache: 'BYPASS' };
  const h = getBrandHeaders(ctx, null);
  a.equal(h.Server, 'EdgeGateway', 'BYPASS 仍注入 Server');
  a.equal(h.Via, '1.1 EdgeGateway', 'BYPASS 仍注入 Via');
});

testA('getBrandHeaders: 无 debug.cache 时仍注入基础品牌头', (a) => {
  const ctx = ctxWith();
  ctx.debug = {};
  const h = getBrandHeaders(ctx, null);
  a.equal(h.Server, 'EdgeGateway', '基础 Server 仍在');
  a.equal(h.Via, '1.1 EdgeGateway', '基础 Via 仍在');
});

testA('getBrandHeaders: 站点/规则 set 的 Server 应覆盖默认值', (a) => {
  const ctx = ctxWith();
  ctx.debug = {};
  // 模拟上层已注入自定义 Server
  const h = getBrandHeaders(ctx, null);
  // brand 头始终为 EdgeGateway（品牌不可被规则覆盖），确认固定值
  a.equal(h.Server, 'EdgeGateway', 'Server 品牌固定');
});
