/**
 * scripts/test-unit/platform.mjs —— 平台编解码 / 运行时资源预算 单测
 * 覆盖原 test-unit-backend.mjs [platform/keyCodec] 段，并并入原
 * test-mem-budget.mjs（src/platform/memBudget.js 的真实 API）。
 */
import assert from 'node:assert';
import { encodeKey, decodeKey } from '../../src/platform/keyCodec.js';
import {
  initMemBudget,
  registerDomain,
  allocBytes,
  getDomainQuota,
  isMemBudgetReady,
  _resetMemBudgetForTest,
} from '../../src/platform/memBudget.js';
import { test, testA } from './_testkit.mjs';

testA('keyCodec: 编解码互逆', (a) => {
  const raw = 'site:example.com:rule-123';
  a.equal(decodeKey(encodeKey(raw)), raw, '编码后可还原');
});

testA('keyCodec: 含特殊字符不破坏', (a) => {
  const raw = 'a/b:c?d=e&f';
  a.equal(decodeKey(encodeKey(raw)), raw, '含 / : ? & = 不破坏');
});

testA('keyCodec: 非空串互逆', (a) => {
  a.equal(decodeKey(encodeKey('a')), 'a', '非空串互逆');
  a.equal(decodeKey(encodeKey('site:x')), 'site:x', '含分号串互逆');
});

// ===== memBudget（原 test-mem-budget.mjs 并入）=====
testA('memBudget: 初始化后就绪 + 域配额按比例分配', (a) => {
  _resetMemBudgetForTest();
  initMemBudget({ totalBytes: 1000 });
  registerDomain('d1', { weight: 1, estimateBytes: () => 100, evict: () => {} });
  a.equal(isMemBudgetReady(), true, '初始化后就绪');
  a.equal(getDomainQuota('d1') > 0, true, 'd1 获得正配额');
});

testA('memBudget: 超额触发回收 + 分配拒绝', (a) => {
  _resetMemBudgetForTest();
  initMemBudget({ totalBytes: 1000, env: { MEM_BUDGET_BYTES: '1000' } });
  let evicted = 0;
  registerDomain('d2', { weight: 1, estimateBytes: () => 100, evict: () => { evicted++; } });
  // 单条 100B，总预算 1000B，约 10 条后即达硬水位触发 evict；
  // 持续写入到远超配额后 allocBytes 应返回 false（或 evict 被调用）。
  let lastAllow = true;
  for (let i = 0; i < 50; i++) {
    const r = allocBytes('d2', { i });
    if (!r) lastAllow = false;
  }
  a.equal(evicted > 0 || lastAllow === false, true, '超额触发回收或拒绝分配');
});

testA('memBudget: 未注册域默认配额 0（需先注册）', (a) => {
  _resetMemBudgetForTest();
  initMemBudget({ totalBytes: 1000 });
  a.equal(getDomainQuota('unseen'), 0, '未注册域无配额');
  a.equal(allocBytes('unseen', {}), true, '未注册域在降级放行（不抛错）');
});

testA('memBudget: 未初始化不就绪', (a) => {
  _resetMemBudgetForTest();
  a.equal(isMemBudgetReady(), false, '未初始化不就绪');
});
