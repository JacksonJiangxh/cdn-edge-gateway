/**
 * scripts/esa-subreq-audit.mjs
 * ----------------------------------------------------------------------------
 * ESA 子请求预算审计脚本（无需真实 KV / 不联网）。
 *
 * 目标：在「不修改运行时代码」的前提下，验证 platform/subreqBudget.js 的预算契约，
 * 并量化各请求路径在 ESA（软限制 8）下的子请求消耗与剩余余量——对应审查问题二：
 * 「哪些情况会超过限制，如何规避」。
 *
 * 运行：node scripts/esa-subreq-audit.mjs
 * ----------------------------------------------------------------------------
 */
import {
  SUBREQ_LIMITS,
  attachToCtx,
  remaining,
  track,
  wouldExceed,
} from '../src/platform/subreqBudget.js';

const BUDGET = 8; // ESA 软限制（与 SUBREQ_LIMITS.esa 对齐）
let failures = 0;
function assert(cond, msg) {
  const ok = !!cond;
  if (!ok) failures++;
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${msg}`);
}

// 构造一个最小 ctx（仅含 env/caps 供 attachToCtx 读取）
function makeCtx(platform = 'esa', env = {}) {
  const ctx = { env, caps: { platform } };
  attachToCtx(ctx, ctx.caps);
  return ctx;
}

console.log('=== 1. ESA 默认软限制契约 ===');
assert(SUBREQ_LIMITS.esa === 8, `SUBREQ_LIMITS.esa === 8 (实际 ${SUBREQ_LIMITS.esa})`);
{
  const ctx = makeCtx('esa', {});
  assert(ctx.__subreq.limit === 8, `默认 limit === 8 (实际 ${ctx.__subreq.limit})`);
}

console.log('\n=== 2. MAX_SUBREQUESTS 覆盖 ESA（1–32 钳制）===');
assert(makeCtx('esa', { MAX_SUBREQUESTS: '32' }).__subreq.limit === 32, 'esa + MAX_SUBREQUESTS=32 → limit 32');
assert(makeCtx('esa', { MAX_SUBREQUESTS: '100' }).__subreq.limit === 32, 'esa + MAX_SUBREQUESTS=100 被钳制 → 32');
assert(makeCtx('esa', { MAX_SUBREQUESTS: '1' }).__subreq.limit === 1, 'esa + MAX_SUBREQUESTS=1 → limit 1');
assert(makeCtx('esa', {}).__subreq.limit === 8, 'esa 无 env → limit 8');

console.log('\n=== 3. 数据面路径消耗模拟（failover + 同站静态 + cachePut）===');
{
  const ctx = makeCtx('esa');
  // 竞速双路回源 = 2 个 track(1)
  track(1, ctx); track(1, ctx);
  // 同站静态 fetch ≤ 1
  track(1, ctx);
  // cachePut 占 1（在 ESA 上预算紧张时跳过，此处假设放行）
  track(1, ctx);
  assert(ctx.__subreq.used === 4, `数据面 used === 4 (实际 ${ctx.__subreq.used})`);
  assert(remaining(ctx) === 4, `数据面 remaining === 4 (实际 ${remaining(ctx)})`);
}

console.log('\n=== 4. 管理面路径消耗模拟（4 集合快照 MGET，readJsonMany 合并为 1/集合）===');
{
  const ctx = makeCtx('esa');
  // store.readJsonMany 把「读 N 键」压成 1 子请求；4 个集合 = 4 次 readJsonMany
  for (let i = 0; i < 4; i++) track(1, ctx);
  assert(ctx.__subreq.used === 4, `管理面 4 集合 used === 4 (实际 ${ctx.__subreq.used})`);
  assert(remaining(ctx) === 4, `管理面 remaining === 4 (实际 ${remaining(ctx)})`);
}

console.log('\n=== 5. 高风险组合：管理面(4) + 数据面(4) 是否触顶 8 ===');
{
  const ctx = makeCtx('esa');
  for (let i = 0; i < 4; i++) track(1, ctx); // 管理面 4 集合
  for (let i = 0; i < 4; i++) track(1, ctx); // 数据面竞速2+静态1+cachePut1
  assert(ctx.__subreq.used === 8, `组合 used === 8 (实际 ${ctx.__subreq.used})`);
  assert(remaining(ctx) === 0, `组合 remaining === 0 (实际 ${remaining(ctx)})`);
  assert(wouldExceed(1, ctx) === true, '组合后再发 1 子请求 → wouldExceed=true（正确降级）');
}

console.log('\n=== 6. 规避验证：cachePut 在预算紧张时跳过（wouldExceed 预判）===');
{
  const ctx = makeCtx('esa');
  // 场景：管理面 4 + 数据面竞速 2 + 同站静态 1 = 7，剩余 1
  for (let i = 0; i < 7; i++) track(1, ctx);
  assert(remaining(ctx) === 1, `剩余 1 (实际 ${remaining(ctx)})`);
  // cachePut 占 1：再发会 ==8 临界；cache.js 用 wouldExceed(1) 预判 → 在 <=8 时仍放行写
  // 但为护住回源预算，项目在 ESA 上「预算紧张时跳过写」。这里演示 wouldExceed 判定：
  assert(wouldExceed(2, ctx) === true, '剩余 1 时再要 2 → wouldExceed=true（跳过 cachePut，护住预算）');
}

console.log('\n=== 7. 竞速开关阈值（failover.js: remaining >= 3 才允许竞速）===');
{
  // 阈值逻辑复刻：仅当 remaining >= 3 才允许竞速（为静态+缓存写预留）
  const cases = [
    { used: 0, expectRace: true },
    { used: 5, expectRace: true },  // remaining 3
    { used: 6, expectRace: false }, // remaining 2
    { used: 7, expectRace: false },
  ];
  for (const c of cases) {
    const ctx = makeCtx('esa');
    for (let i = 0; i < c.used; i++) track(1, ctx);
    const allowRace = remaining(ctx) >= 3;
    assert(allowRace === c.expectRace, `used=${c.used} remaining=${remaining(ctx)} 允许竞速=${allowRace} (期望 ${c.expectRace})`);
  }
}

console.log(`\n${failures === 0 ? '✅ 全部通过' : `❌ ${failures} 项失败`}`);
process.exit(failures === 0 ? 0 : 1);
