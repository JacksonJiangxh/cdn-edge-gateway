/**
 * scripts/test-unit/rewrite.mjs —— URL 重写 / 请求头合并 单测
 * 覆盖原 test-unit-backend.mjs [rewrite] + [cache/reqHeaders] 段，
 * 以及原 test-stage-merge.mjs 的 mergeStageHeaderOps 部分（阶段级头合并正确性）。
 */
import assert from 'node:assert';
import {
  applyRewrite,
  buildOriginUrl,
  mergeStageHeaderOps,
  mergeHeaderOps,
} from '../../src/proxy/rewrite.js';
import { test, testA } from './_testkit.mjs';
import { makeCtx } from './_testkit.mjs';

function ctxFor(path) {
  const url = new URL('https://example.com' + path);
  return makeCtx({ url, method: 'GET' });
}

test('applyRewrite: prefix 替换', () => {
  const out = applyRewrite('/api/v1/users', { type: 'prefix', value: '/v2' }, ctxFor('/x'));
  assert.strictEqual(out, '/v2/api/v1/users', 'prefix 拼接路径');
});

test('applyRewrite: strip 去除前缀', () => {
  const out = applyRewrite('/api/old', { type: 'strip', value: '/api' }, ctxFor('/x'));
  assert.strictEqual(out, '/old', 'strip 去除 /api 前缀');
});

test('applyRewrite: regex 替换', () => {
  const out = applyRewrite('/img/abc.jpg', { type: 'regex', regexFrom: '^/img/(.*)$', regexTo: '/cdn/$1' }, ctxFor('/x'));
  assert.strictEqual(out, '/cdn/abc.jpg', 'regex 捕获组替换');
});

test('applyRewrite: 空 rewrite（none）返回原路径', () => {
  const out = applyRewrite('/keep', { type: 'none' }, ctxFor('/x'));
  assert.strictEqual(out, '/keep', 'none 不改路径');
});

testA('mergeStageHeaderOps: 站点 set 覆盖全站同键，strip(exact) 删除全站 set 键', (a) => {
  const globalOps = { set: { 'x-a': '1', server: 'EdgeGateway' }, strip: [{ type: 'exact', value: 'x-drop' }] };
  const siteOps = { set: { 'x-a': '2', 'x-b': '3' }, strip: [{ type: 'exact', value: 'server' }, { type: 'exact', value: 'x-drop2' }] };
  const merged = mergeStageHeaderOps(globalOps, siteOps);
  a.equal(merged.set['x-a'], '2', 'x-a 被站点覆盖');
  a.equal(merged.set['x-b'], '3', 'x-b 来自站点');
  a.equal('server' in merged.set, false, '站点 strip(exact) server 删掉全站 set 的 server');
  a.ok(merged.strip.some((x) => x.type === 'exact' && x.value === 'x-drop'), '全站 strip 保留');
  a.ok(merged.strip.some((x) => x.type === 'exact' && x.value === 'x-drop2'), '站点 strip 保留');
});

testA('mergeStageHeaderOps: 缺省输入不产生 undefined', (a) => {
  const merged = mergeStageHeaderOps(undefined, undefined);
  a.ok(merged.set && typeof merged.set === 'object', 'set 为对象');
  a.ok(Array.isArray(merged.strip), 'strip 为数组');
});

testA('mergeHeaderOps: 源站打底 + 规则覆盖（strip 仅透传不删 set）', (a) => {
  const merged = mergeHeaderOps({ set: { a: '1' }, strip: [{ type: 'exact', value: 'x' }] }, { set: { a: '2' }, strip: [{ type: 'exact', value: 'y' }] });
  a.equal(merged.set.a, '2', '规则覆盖源站同键');
  a.ok(merged.strip.some((x) => x.type === 'exact' && x.value === 'x') && merged.strip.some((x) => x.type === 'exact' && x.value === 'y'), 'strip 并集');
});

test('mergeHeaderOps: 非法输入不抛错', () => {
  const merged = mergeHeaderOps(null, undefined);
  assert.ok(merged && typeof merged.set === 'object', '返回合法结构');
});

// ===== buildOriginUrl：仓库型源站回源域名兜底（防回环回归） =====
// 仓库型 engine（cnb/github）addr 为空时，回源域名应兜底到平台真实上游，
// 而非加速域名自身（否则回源打到自己形成无限回环）。

function originUrlFor(origin, hostHeader) {
  const ctx = makeCtx({ url: 'https://edge.example.com/foo' });
  return buildOriginUrl(ctx, origin, { action: {} }, hostHeader);
}

test('buildOriginUrl: cnb 公开地址 addr 空时兜底 cnb.cool（非加速域名）', () => {
  const url = originUrlFor({ engine: 'cnb', addr: '', scheme: 'https', port: 443, repoPrivate: false, hostHeader: { mode: 'inherit', custom: '' } });
  assert.strictEqual(url.host, 'cnb.cool', '回源域名兜底为 cnb.cool，而非 edge.example.com');
});

test('buildOriginUrl: cnb 私有地址 addr 空时兜底 api.cnb.cool', () => {
  const url = originUrlFor({ engine: 'cnb', addr: '', scheme: 'https', port: 443, repoPrivate: true, hostHeader: { mode: 'inherit', custom: '' } });
  assert.strictEqual(url.host, 'api.cnb.cool', '私有仓库兜底 api.cnb.cool');
});

test('buildOriginUrl: github 地址 addr 空时兜底 raw.githubusercontent.com', () => {
  const url = originUrlFor({ engine: 'github', addr: '', scheme: 'https', port: 443, repoPrivate: false, hostHeader: { mode: 'inherit', custom: '' } });
  assert.strictEqual(url.host, 'raw.githubusercontent.com', 'github 兜底 raw.githubusercontent.com');
});

test('buildOriginUrl: cnb addr 非空时优先使用 addr（不误伤）', () => {
  const url = originUrlFor({ engine: 'cnb', addr: 'custom.cnb.example', scheme: 'https', port: 443, repoPrivate: true, hostHeader: { mode: 'inherit', custom: '' } });
  assert.strictEqual(url.host, 'custom.cnb.example', '尊重已填 addr');
});

test('buildOriginUrl: hostHeader.custom 优先于兜底（与 preset 规则同源）', () => {
  const url = originUrlFor(
    { engine: 'cnb', addr: '', scheme: 'https', port: 443, repoPrivate: true, hostHeader: { mode: 'inherit', custom: '' } },
    { mode: 'custom', custom: 'api.cnb.cool' }
  );
  assert.strictEqual(url.host, 'api.cnb.cool', 'custom 优先');
});

test('buildOriginUrl: fetch 源站 addr 空时用加速域名（既有合法语义不变）', () => {
  const url = originUrlFor({ engine: 'fetch', addr: '', scheme: 'https', port: 443, hostHeader: { mode: 'inherit', custom: '' } }, { mode: 'accel', custom: '' });
  assert.strictEqual(url.host, 'edge.example.com', 'fetch+accel 沿用加速域名（无回环，因有真实 addr 或 host 覆盖）');
});

test('buildOriginUrl: r2 引擎不受兜底影响', () => {
  const ctx = makeCtx({ url: 'https://edge.example.com/foo' });
  const url = buildOriginUrl(ctx, { engine: 'r2', addr: '', scheme: 'https', port: 443 }, { action: {} }, { mode: 'inherit', custom: '' });
  assert.strictEqual(url.host, 'edge.example.com', 'r2 缓存键回退站点域名');
});
