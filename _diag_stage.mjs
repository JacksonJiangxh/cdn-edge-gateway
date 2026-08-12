import { stageForAction } from './src/config/stages.js';
import { normRule } from './src/config/schema.js';

function stageOf(r) {
  const v = normRule(r, 0);
  return stageForAction(v.value.action) || v.value.stage || null;
}

// 受限 ⑯ 抽屉新建的纯响应头规则（克隆默认 action 含 cache 空壳 + respHeaders 已填）
const r1 = { id: 't1', priority: 10, enabled: true, name: '改响应头', match: { conditions: [] },
  action: { poolId: '', rewrite: { type: 'none' }, cache: { enabled: false }, reqHeaders: { set: {}, remove: [] }, respHeaders: { set: { 'X-Foo': '1' }, remove: [] } } };
console.log('纯响应头规则 ->', stageOf(r1), '(期望 ⑯)');

// 受限 ⑪ 抽屉纯缓存规则（含 respHeaders 空壳）
const r2 = { id: 't2', priority: 10, enabled: true, name: '缓存', match: { conditions: [] },
  action: { poolId: '', rewrite: { type: 'none' }, cache: { enabled: true, mode: 'ttl', edgeTtl: 100 }, reqHeaders: { set: {}, remove: [] }, respHeaders: { set: {}, remove: [] } } };
console.log('纯缓存规则 ->', stageOf(r2), '(期望 ⑪)');

// 历史脏数据：旧默认 cache.enabled:true 的响应头规则，且缺 stage
const r3 = { id: 't3', priority: 10, enabled: true, name: '旧响应头', match: { conditions: [] },
  action: { cache: { enabled: true, mode: 'ttl' }, respHeaders: { set: { 'X-Bar': '2' }, remove: [] } } };
console.log('历史脏(含cache+resp,无stage) ->', stageOf(r3));
