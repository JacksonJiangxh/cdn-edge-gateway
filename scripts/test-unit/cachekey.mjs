/**
 * scripts/test-unit/cachekey.mjs —— 缓存键构建 单测
 * 覆盖原 test-unit-backend.mjs [cachekey] 段，并补充：ignoreQuery 清空、
 * queryWhitelist 排序去重、__h 客户端 host 注入、__s scheme 注入、
 * ck.headers 排序注入 等边界断言。
 */
import assert from 'node:assert';
import { buildCacheKey } from '../../src/proxy/cachekey.js';
import { test, testA } from './_testkit.mjs';
import { makeCtx } from './_testkit.mjs';

function ckCtx(url, opts = {}) {
  const ctx = makeCtx({ url, method: 'GET' });
  ctx.clientIp = opts.clientIp || '1.2.3.4';
  ctx.request.headers = new Map(Object.entries(opts.headers || {}));
  return ctx;
}

test('buildCacheKey: query 默认纳入键', () => {
  const ctx = ckCtx('https://e.test/p?a=1&b=2');
  const key = buildCacheKey(ctx, {}, ctx.url, {}).url;
  assert.strictEqual(key.includes('a=1'), true);
  assert.strictEqual(key.includes('b=2'), true);
});

testA('buildCacheKey: ignoreQuery 清空查询串', (a) => {
  const ctx = ckCtx('https://e.test/p?a=1&b=2');
  const key = buildCacheKey(ctx, { ignoreQuery: true }, ctx.url, {}).url;
  a.equal(key.includes('a=1'), false, 'ignoreQuery 后不含 a=1');
  a.equal(key.includes('b=2'), false, 'ignoreQuery 后不含 b=2');
  a.equal(key.includes('/p'), true, '路径仍在键中');
});

testA('buildCacheKey: queryWhitelist 排序保留', (a) => {
  const ctx = ckCtx('https://e.test/p?b=2&a=1');
  const key = buildCacheKey(ctx, { queryWhitelist: ['a', 'b'] }, ctx.url, {}).url;
  const aIdx = key.indexOf('a=1');
  const bIdx = key.indexOf('b=2');
  a.equal(aIdx >= 0 && bIdx >= 0, true, '白名单字段都在键中');
  a.equal(aIdx < bIdx, true, 'a 先于 b（字典序排序）');
  a.equal(key.split('__h').length, 2, '始终含 __h 维度');
});

testA('buildCacheKey: __h 客户端 host 注入', (a) => {
  const ctx = ckCtx('https://host-a.test/p');
  const key = buildCacheKey(ctx, {}, ctx.url, {}).url;
  a.equal(key.includes('__h=' + encodeURIComponent('host-a.test')), true, '__h 含客户端 host');
});

testA('buildCacheKey: __s scheme 注入（key.includeScheme）', (a) => {
  const ctx = ckCtx('https://e.test/p');
  const keyHttps = buildCacheKey(ctx, { key: { includeScheme: true } }, ctx.url, {}).url;
  a.equal(keyHttps.includes('__s=https'), true, '__s=https');

  const ctxHttp = ckCtx('http://e.test/p');
  const keyHttp = buildCacheKey(ctxHttp, { key: { includeScheme: true } }, ctxHttp.url, {}).url;
  a.equal(keyHttp.includes('__s=http'), true, '__s=http（区分协议）');
});

testA('buildCacheKey: __hd 头维度排序注入（key.headers）', (a) => {
  const ctx = ckCtx('https://e.test/p', { headers: { 'x-b': '2', 'x-a': '1' } });
  const key = buildCacheKey(ctx, { key: { headers: ['x-a', 'x-b'] } }, ctx.url, {}).url;
  const decoded = decodeURIComponent(key);
  const aIdx = decoded.indexOf('x-a=1');
  const bIdx = decoded.indexOf('x-b=2');
  a.equal(aIdx >= 0 && bIdx >= 0, true, '两个头字段都注入');
  a.equal(aIdx < bIdx, true, '头字段按名排序（x-a 先于 x-b）');
});

test('buildCacheKey: 无 policy 不抛错', () => {
  const ctx = ckCtx('https://e.test/p?a=1');
  const key = buildCacheKey(ctx, {}, ctx.url, {});
  assert.ok(key instanceof Request && key.url.length > 0);
});

test('buildCacheKey: 非法 originUrl 抛错（不静默返回空键）', () => {
  const ctx = ckCtx('https://e.test/p');
  assert.throws(() => buildCacheKey(ctx, {}, 'not-a-url', {}));
});
