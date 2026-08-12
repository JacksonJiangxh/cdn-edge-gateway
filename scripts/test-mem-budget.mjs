#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/test-mem-budget.mjs —— 统一内存预算（memBudget）单元测试
 * ----------------------------------------------------------------------------
 * 验证 src/platform/memBudget.js 的核心契约：
 *   1. 配额按权重分配，且总量 <= 总预算（预留 5% 边距）
 *   2. 软水位只触发「可激进域」（stats/ratelimit）evict，不触发 config
 *   3. 硬水位强制 trim 到软水位之下（不 OOM）；极端情况下 config 也被迫 evict
 *   4. 三处收敛模块（store/collector/ratelimit）的 cap 随预算变动
 *   5. release 正确抵消 alloc，记账准确
 *
 * 用法：
 *   node scripts/test-mem-budget.mjs
 *   非零退出 = 有用例失败
 * ============================================================================
 */

import {
  initMemBudget,
  registerDomain,
  allocBytes,
  releaseBytes,
  getDomainQuota,
  syncEntries,
  getBudgetSnapshot,
  _resetMemBudgetForTest,
} from '../src/platform/memBudget.js';

let passed = 0;
let failed = 0;
const failures = [];

function ok(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    failures.push(msg);
    console.error(`  ✗ ${msg}`);
  }
}

function section(t) {
  console.log(`\n# ${t}`);
}

// 辅助：注册三个 mock 域（权重同真实模块：config=3, stats=2, ratelimit=1）。
// mock 域维护本地条目数，evict 时按 aggressive 收缩并 syncEntries 回传（符合真实契约）。
function registerMockDomains() {
  return {
    statsCount: 0,
    rlCount: 0,
    cfgEvicts: 0,
    register() {
      registerDomain('config', { weight: 3, estimateBytes: () => 1024, evict: () => { this.cfgEvicts += 1; syncEntries('config', 0); }, allowAggressiveEvict: false });
      registerDomain('stats', { weight: 2, estimateBytes: () => 1024, evict: (a) => { this.statsCount = a ? Math.ceil(this.statsCount / 2) : this.statsCount; syncEntries('stats', this.statsCount); }, allowAggressiveEvict: true });
      registerDomain('ratelimit', { weight: 1, estimateBytes: () => 1024, evict: (a) => { this.rlCount = a ? Math.ceil(this.rlCount / 2) : this.rlCount; syncEntries('ratelimit', this.rlCount); }, allowAggressiveEvict: true });
    },
  };
}

// ============================================================================
// 用例 A：配额分配
// ============================================================================
section('A. 配额按权重分配，总量 <= 总预算');
{
  _resetMemBudgetForTest();
  const TOTAL = 128 * 1024 * 1024;
  initMemBudget({ totalBytes: TOTAL });
  registerMockDomains().register();

  const qCfg = getDomainQuota('config');
  const qStats = getDomainQuota('stats');
  const qRl = getDomainQuota('ratelimit');

  ok(qCfg > 0 && qStats > 0 && qRl > 0, '三个域均获得非零配额');
  ok(qCfg > qStats && qStats > qRl, '配额大小顺序 config > stats > ratelimit（按权重）');
  const sum = qCfg + qStats + qRl;
  ok(sum <= TOTAL, `配额之和(${sum}) <= 总预算(${TOTAL})`);
}

// ============================================================================
// 用例 B：域超自身配额时，可激进域被 evict，保守域（config）不被 evict
// ============================================================================
section('B. 域超配额触发 stats/ratelimit 回收，不触发 config');
{
  _resetMemBudgetForTest();
  const TOTAL = 10 * 1024 * 1024;
  initMemBudget({ totalBytes: TOTAL });
  const st = registerMockDomains();
  st.register();

  // 把 stats 域填到超过其自身配额（每 alloc 末尾会触发域级回收）
  const statsQuota = getDomainQuota('stats');
  const fillStats = Math.floor(statsQuota / 1024) + 50;
  st.statsCount = fillStats;
  for (let i = 0; i < fillStats; i++) allocBytes('stats', null);

  // 把 ratelimit 域也填到超过其自身配额
  const rlQuota = getDomainQuota('ratelimit');
  const fillRl = Math.floor(rlQuota / 1024) + 50;
  st.rlCount = fillRl;
  for (let i = 0; i < fillRl; i++) allocBytes('ratelimit', null);

  // config 域填少量（不超配额，也不应被回收）
  for (let i = 0; i < 10; i++) allocBytes('config', null);

  const snap = getBudgetSnapshot();
  ok(snap.domains.stats.usedBytes <= statsQuota, `stats 域占用(${snap.domains.stats.usedBytes})被抑制在其配额(${statsQuota})之内（超配额即 evict）`);
  ok(snap.domains.ratelimit.usedBytes <= rlQuota, `ratelimit 域占用(${snap.domains.ratelimit.usedBytes})被抑制在其配额(${rlQuota})之内`);
  ok(st.statsCount < fillStats, `stats 域 evict 被实际调用（条目从 ${fillStats} 降到 ${st.statsCount}）`);
  ok(st.cfgEvicts === 0, 'config 域未被 evict（保守保护）');
}

// ============================================================================
// 用例 C1：硬水位强制 trim 到软水位之下（不 OOM）
// ============================================================================
section('C1. 硬水位强制 trim 到软水位之下（不 OOM）');
{
  _resetMemBudgetForTest();
  const TOTAL = 100 * 1024; // 100KB
  initMemBudget({ totalBytes: TOTAL });
  registerMockDomains().register();

  // 交叉填满三域，反复越过硬水位；每次 alloc 末尾的 maybeReclaim 会 trim。
  for (let i = 0; i < 300; i++) {
    allocBytes('config', null);
    allocBytes('stats', null);
    allocBytes('ratelimit', null);
  }

  const snap = getBudgetSnapshot();
  ok(snap.usedBytes <= TOTAL * 0.7 + 1, `硬水位回收后 usedBytes(${snap.usedBytes}) <= 软水位(70%)=${(TOTAL * 0.7) | 0}`);
}

// ============================================================================
// 用例 C2：清完激进域仍超时，config 也被强制 evict
// ============================================================================
section('C2. 清完激进域仍超时 → config 也被强制 evict');
{
  _resetMemBudgetForTest();
  const TOTAL = 100 * 1024;
  let cfgEvicts = 0;
  initMemBudget({ totalBytes: TOTAL });
  // config 权重主导（配额 ~83%TOTAL），使「清完 stats/rl 后仍超软水位」→ 被迫清 config
  registerDomain('config', { weight: 10, estimateBytes: () => 1024, evict: () => { cfgEvicts += 1; syncEntries('config', 0); }, allowAggressiveEvict: false });
  registerDomain('stats', { weight: 1, estimateBytes: () => 1024, evict: () => { syncEntries('stats', 0); }, allowAggressiveEvict: true });
  registerDomain('ratelimit', { weight: 1, estimateBytes: () => 1024, evict: () => { syncEntries('ratelimit', 0); }, allowAggressiveEvict: true });

  for (let i = 0; i < 200; i++) allocBytes('config', null);

  const snap = getBudgetSnapshot();
  ok(snap.usedBytes <= TOTAL * 0.7 + 1, `硬水位回收后 usedBytes(${snap.usedBytes}) <= 70%TOTAL`);
  ok(cfgEvicts >= 1, '清完激进域(本就空)后仍超 → config 被迫 evict');
}

// ============================================================================
// 用例 D：三处收敛模块的 cap 随预算变动
// ============================================================================
section('D. 收敛模块（store/collector/ratelimit）上限随预算变动');
{
  await import('../src/config/store.js');
  await import('../src/stats/collector.js');
  await import('../src/security/ratelimit.js');

  _resetMemBudgetForTest();
  initMemBudget({ totalBytes: 128 * 1024 * 1024 });
  const qCfgBig = getDomainQuota('config');
  const qStatsBig = getDomainQuota('stats');
  const qRlBig = getDomainQuota('ratelimit');
  ok(qCfgBig > 0 && qStatsBig > 0 && qRlBig > 0, '大预算下三域均有配额');

  _resetMemBudgetForTest();
  initMemBudget({ totalBytes: 64 * 1024 });
  const qCfgSmall = getDomainQuota('config');
  const qStatsSmall = getDomainQuota('stats');
  const qRlSmall = getDomainQuota('ratelimit');
  ok(qCfgSmall > 0, '小预算下 config 仍有配额（>=1 条目）');
  ok(qCfgSmall <= qCfgBig && qStatsSmall <= qStatsBig && qRlSmall <= qRlBig, '预算缩小后各域配额不增（收敛生效）');
}

// ============================================================================
// 用例 E：release 与 alloc 抵消，记账准确
// ============================================================================
section('E. release 正确抵消 alloc，记账准确');
{
  _resetMemBudgetForTest();
  initMemBudget({ totalBytes: 128 * 1024 * 1024 });
  registerDomain('config', { weight: 1, estimateBytes: () => 500, evict: () => {}, allowAggressiveEvict: false });

  allocBytes('config', null);
  allocBytes('config', null);
  allocBytes('config', null);
  const mid = getBudgetSnapshot().domains.config.usedBytes;
  ok(mid === 1500, `3 次 alloc 记账 1500B（实际=${mid}）`);
  releaseBytes('config', 3);
  const after = getBudgetSnapshot().domains.config.usedBytes;
  ok(after === 0, `release 3 条后归零（实际=${after}）`);
}

// ============================================================================
// 结果汇总
// ============================================================================
console.log(`\n========================================`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed > 0) {
  console.error('失败用例：');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
} else {
  console.log('全部通过 ✓');
  process.exit(0);
}
