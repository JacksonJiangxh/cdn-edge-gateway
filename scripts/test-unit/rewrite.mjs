/**
 * scripts/test-unit/rewrite.mjs —— URL 重写 / 请求头合并 单测
 * 覆盖原 test-unit-backend.mjs [rewrite] + [cache/reqHeaders] 段，
 * 以及原 test-stage-merge.mjs 的 mergeStageHeaderOps 部分（阶段级头合并正确性）。
 */
import assert from 'node:assert';
import {
  applyRewrite,
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

testA('mergeStageHeaderOps: 站点 set 覆盖全站同键，remove 删除全站 set 键', (a) => {
  const globalOps = { set: { 'x-a': '1', server: 'EdgeGateway' }, remove: ['x-drop'] };
  const siteOps = { set: { 'x-a': '2', 'x-b': '3' }, remove: ['server', 'x-drop2'] };
  const merged = mergeStageHeaderOps(globalOps, siteOps);
  a.equal(merged.set['x-a'], '2', 'x-a 被站点覆盖');
  a.equal(merged.set['x-b'], '3', 'x-b 来自站点');
  a.equal('server' in merged.set, false, '站点 remove server 删掉全站 set 的 server');
  a.equal(merged.remove.includes('x-drop'), true, '全站 remove 保留');
  a.equal(merged.remove.includes('x-drop2'), true, '站点 remove 保留');
});

testA('mergeStageHeaderOps: 缺省输入不产生 undefined', (a) => {
  const merged = mergeStageHeaderOps(undefined, undefined);
  a.ok(merged.set && typeof merged.set === 'object', 'set 为对象');
  a.ok(Array.isArray(merged.remove), 'remove 为数组');
});

testA('mergeHeaderOps: 源站打底 + 规则覆盖（remove 仅透传不删 set）', (a) => {
  const merged = mergeHeaderOps({ set: { a: '1' }, remove: ['x'] }, { set: { a: '2' }, remove: ['y'] });
  a.equal(merged.set.a, '2', '规则覆盖源站同键');
  a.equal(merged.remove.includes('x') && merged.remove.includes('y'), true, 'remove 并集');
});

test('mergeHeaderOps: 非法输入不抛错', () => {
  const merged = mergeHeaderOps(null, undefined);
  assert.ok(merged && typeof merged.set === 'object', '返回合法结构');
});
