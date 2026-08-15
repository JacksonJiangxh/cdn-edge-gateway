/**
 * scripts/test-unit/matcher.mjs —— 路由匹配 / 规则选择 单测
 * 覆盖原 test-unit-backend.mjs [matcher] 段 + 原 test-stage-merge.mjs 的
 * matchRuleByStage 部分（规则按阶段筛选正确性）。
 */
import assert from 'node:assert';
import {
  evalCondition,
  buildMatchSubject,
  matchRule,
  matchRuleByStage,
} from '../../src/proxy/matcher.js';
import { test, testA } from './_testkit.mjs';

function mkCtx(path = '/x', method = 'GET', headers = {}) {
  const url = new URL('https://example.com' + path);
  return {
    method,
    url,
    request: new Request(url, { method, headers }),
    debug: {},
  };
}

function mkRule(stage, conds, extra = {}) {
  return {
    id: 'r-' + stage,
    priority: 10,
    enabled: true,
    stage,
    match: { conditions: [[...conds]] },
    action: { type: 'none', ...extra },
  };
}

test('evalCondition: path equal 命中/不命中', () => {
  const c = { target: 'path', op: 'equal', values: ['/a'] };
  const subj = buildMatchSubject(mkCtx('/a'));
  assert.strictEqual(evalCondition(c, subj), true);
  assert.strictEqual(evalCondition(c, buildMatchSubject(mkCtx('/b'))), false);
});

test('evalCondition: method op', () => {
  const c = { target: 'method', op: 'equal', values: ['POST'] };
  const subj = buildMatchSubject(mkCtx('/a', 'POST'));
  assert.strictEqual(evalCondition(c, subj), true);
  assert.strictEqual(evalCondition(c, buildMatchSubject(mkCtx('/a', 'GET'))), false);
});

test('evalCondition: header contain', () => {
  const c = { target: 'header', key: 'x-flag', op: 'contain', values: ['yes'] };
  const subj = buildMatchSubject(mkCtx('/a', 'GET', { 'x-flag': 'yes-please' }));
  assert.strictEqual(evalCondition(c, subj), true);
  assert.strictEqual(evalCondition(c, buildMatchSubject(mkCtx('/a', 'GET', {}))), false);
});

test('evalCondition: query equal', () => {
  const c = { target: 'query', key: 'q', op: 'equal', values: ['1'] };
  const subj = buildMatchSubject(mkCtx('/?q=1'));
  assert.strictEqual(evalCondition(c, subj), true);
  assert.strictEqual(evalCondition(c, buildMatchSubject(mkCtx('/?q=2'))), false);
});

test('evalCondition: 缺失 key 的目标视为不命中（不抛错）', () => {
  const c = { target: 'header', op: 'equal', values: ['1'] }; // 无 key
  assert.strictEqual(evalCondition(c, buildMatchSubject(mkCtx('/a'))), false);
});

test('evalCondition: prefix / suffix 操作符', () => {
  const p = { target: 'path', op: 'prefix', values: ['/api'] };
  assert.strictEqual(evalCondition(p, buildMatchSubject(mkCtx('/api/x'))), true);
  const s = { target: 'path', op: 'suffix', values: ['.jpg'] };
  assert.strictEqual(evalCondition(s, buildMatchSubject(mkCtx('/a/b.jpg'))), true);
});

test('matchRule: 全部条件命中才匹配', () => {
  const site = { rules: [mkRule('rewrite', [{ target: 'method', op: 'equal', values: ['GET'] }])] };
  const ctx = mkCtx('/x', 'GET');
  const r = matchRule(site, ctx);
  assert.strictEqual(r && r.id, 'r-rewrite');
  assert.strictEqual(ctx.debug.ruleId, 'r-rewrite', '命中规则写入 debug.ruleId');
});

test('matchRule: 禁用规则永不命中，空站点返回 null', () => {
  const site = { rules: [{ ...mkRule('rewrite', []), enabled: false }] };
  assert.strictEqual(matchRule(site, mkCtx('/x')), null);
  assert.strictEqual(matchRule({ rules: [] }, mkCtx('/x')), null);
});

test('matchRuleByStage: 仅返回指定阶段的规则', () => {
  const site = { rules: [mkRule('rewrite', []), mkRule('origin', []), mkRule('cache', [])] };
  const ctx = mkCtx('/x');
  const rewriteOnly = matchRuleByStage(site, 'rewrite', ctx);
  assert.strictEqual(rewriteOnly && rewriteOnly.id, 'r-rewrite');

  const originOnly = matchRuleByStage(site, 'origin', ctx);
  assert.strictEqual(originOnly && originOnly.id, 'r-origin');
});

test('matchRuleByStage: 无匹配阶段返回 null（非 undefined/非异常）', () => {
  const site = { rules: [mkRule('rewrite', [])] };
  const none = matchRuleByStage(site, 'terminate', mkCtx('/x'));
  assert.strictEqual(none, null);
});

test('matchRule 优先级：高 priority 优先', () => {
  const hi = { ...mkRule('rewrite', []), priority: 100, id: 'hi' };
  const lo = { ...mkRule('rewrite', []), priority: 1, id: 'lo' };
  const ctx = mkCtx('/x');
  const best = matchRule({ rules: [lo, hi] }, ctx);
  assert.strictEqual(best.id, 'hi');
});
