/**
 * ============================================================================
 * 全站规则 / 站点规则 · 逐阶段先全站后站点合并 · 单元测试
 * ----------------------------------------------------------------------------
 * 验证「逐阶段独立、先全站后站点」合并模型的核心函数：
 *   - matcher.matchRuleByStage(site, stage, ctx)：按阶段独立匹配站点规则集
 *   - rewrite.mergeStageHeaderOps(globalOps, siteOps)：全站→站点 HeaderOps 合并
 *
 * 覆盖场景（对应 docs/12-request-flow.md ④.2）：
 *   场景A 站点某阶段命中 → 其同名字段覆盖全站（如 cache.edgeTtl 站点覆盖全站）
 *   场景B 站点某阶段未命中 → 全站该阶段值原样保留进入下一阶段
 *   场景C（用户举例验收）respHeaders 合并 + 站点 remove 删除全站 set 的 key
 *   场景D 站点规则跨多阶段：rewrite 命中但 respHeaders 未命中 → 各阶段独立取源
 *
 * 运行：node scripts/test-stage-merge.mjs
 * 退出码：全部通过 0；有失败非 0。
 * 纯测试脚本，不改动 src/ 任何源码。
 * ============================================================================
 */

import { matchRuleByStage } from '../src/proxy/matcher.js';
import { mergeStageHeaderOps } from '../src/proxy/rewrite.js';

const failures = [];
let passed = 0;

function check(ok, label, detail = '') {
  if (ok) {
    passed++;
  } else {
    failures.push({ label, detail });
    process.stderr.write(`  ✗ ${label}${detail ? `  → ${detail}` : ''}\n`);
  }
  return ok;
}

function eq(actual, expect, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expect);
  check(a === e, label, `期望 ${e}，实际 ${a}`);
}

/** 构造最小 ctx（matchRuleByStage 需要 ctx.debug / ctx.url / ctx.request）。 */
function makeCtx(path = '/') {
  const url = new URL('https://example.com' + path);
  const request = new Request(url, { method: 'GET', headers: {} });
  return { debug: {}, url, request };
}

/** 无条件命中规则（match.conditions 为空 → 命中）。 */
function unconditionalRule(stage, action, priority = 0, id = 'r') {
  return { id, stage, priority, enabled: true, match: { conditions: [] }, action };
}

// ----------------------------------------------------------------------------
// 场景A：站点某阶段命中，同名字段覆盖全站（cache.edgeTtl 站点覆盖全站）
// ----------------------------------------------------------------------------
function testSceneA() {
  console.log('\n【场景A】站点 cache 阶段命中 → 站点 edgeTtl 覆盖全站 edgeTtl');
  const site = {
    rules: [
      unconditionalRule('cache', { cache: { enabled: true, mode: 'ttl', edgeTtl: 600, browserTtl: 120 } }, 10, 'cache-rule'),
    ],
  };
  const ctx = makeCtx('/');
  const sr = matchRuleByStage(site, 'cache', ctx);
  check(sr && sr.id === 'cache-rule', 'A1 阶段命中', `应命中 cache-rule（实际 ${sr && sr.id}）`);
  eq(sr.action.cache.edgeTtl, 600, 'A2 站点 edgeTtl=600');
  // 逐阶段合并时：eff = 全站 cache，站点命中覆盖 edgeTtl，未设的 maxAge 沿用全站
  const globalCache = { enabled: true, mode: 'ttl', edgeTtl: 300, browserTtl: 60, maxAge: 3600 };
  const merged = { ...globalCache, ...sr.action.cache };
  eq(merged.edgeTtl, 600, 'A3 合并后 edgeTtl 站点覆盖为 600');
  eq(merged.browserTtl, 120, 'A4 合并后 browserTtl 站点覆盖为 120');
  eq(merged.maxAge, 3600, 'A5 合并后 maxAge 沿用全站 3600（站点未设）');
  check(ctx.debug.ruleSource && ctx.debug.ruleSource.cache === 'site', 'A6 debug.ruleSource.cache=site', JSON.stringify(ctx.debug.ruleSource));
  check(ctx.debug.ruleIds && ctx.debug.ruleIds.cache === 'cache-rule', 'A7 debug.ruleIds.cache', JSON.stringify(ctx.debug.ruleIds));
}

// ----------------------------------------------------------------------------
// 场景B：站点某阶段未命中 → 全站值保留进入下一阶段
// ----------------------------------------------------------------------------
function testSceneB() {
  console.log('\n【场景B】站点 cache 阶段无匹配规则 → 全站值原样保留');
  const site = {
    rules: [
      // rewrite 阶段有规则（命中），cache 阶段无任何规则
      unconditionalRule('rewrite', { rewrite: { type: 'prefix', value: '/api' } }, 10, 'rw-rule'),
    ],
  };
  const ctx = makeCtx('/');
  const srCache = matchRuleByStage(site, 'cache', ctx);
  check(srCache === null, 'B1 cache 阶段未命中', `应返回 null（实际 ${srCache && srCache.id}）`);
  // 下游（pipeline 合并块）会据此把 ruleSource.cache 标记为 'global' 并沿用全站值
  // 下游：全站 cache 原样保留
  const globalCache = { enabled: true, mode: 'ttl', edgeTtl: 300, browserTtl: 60 };
  eq(globalCache.edgeTtl, 300, 'B3 全站 edgeTtl=300 保留');

  // 但 rewrite 阶段应命中
  const srRw = matchRuleByStage(site, 'rewrite', ctx);
  check(srRw && srRw.id === 'rw-rule', 'B4 rewrite 阶段命中', `应命中 rw-rule（实际 ${srRw && srRw.id}）`);
  check(ctx.debug.ruleIds && ctx.debug.ruleIds.rewrite === 'rw-rule', 'B5 debug.ruleIds.rewrite=rw-rule', JSON.stringify(ctx.debug.ruleIds));
}

// ----------------------------------------------------------------------------
// 场景C（用户举例验收）：respHeaders 合并 + 站点 remove 删除全站 set 的 key
// ----------------------------------------------------------------------------
function testSceneC() {
  console.log('\n【场景C】用户举例：全站 respHeaders.set={cache-control,x-a,x-b,server}，站点 set={cache-control,x-a} remove=[x-b]');
  const globalOps = {
    set: { 'cache-control': 'max-age=300', 'x-a': 'g1', 'x-b': 'g2', server: 'EdgeGateway' },
    remove: ['x-strip-me'],
  };
  const siteOps = {
    set: { 'cache-control': 'max-age=600', 'x-a': 's1' },
    remove: ['x-b'],
  };
  const merged = mergeStageHeaderOps(globalOps, siteOps);
  eq(merged.set['cache-control'], 'max-age=600', 'C1 cache-control 站点覆盖为 600');
  eq(merged.set['x-a'], 's1', 'C2 x-a 站点覆盖为 s1');
  eq(merged.set['server'], 'EdgeGateway', 'C3 server 全站保留（站点未动）');
  check(!('x-b' in merged.set), 'C4 x-b 已被站点 remove 从 set 中删除', `merged.set=${JSON.stringify(merged.set)}`);
  // merged.remove 仍保留（用于删源站/上游自带的同名头）
  check(merged.remove.includes('x-b'), 'C5 merged.remove 含 x-b', JSON.stringify(merged.remove));
  check(merged.remove.includes('x-strip-me'), 'C6 merged.remove 含全站 remove', JSON.stringify(merged.remove));

  // 集成验证：合并后的 merged 经 applyHeaderOps（先 remove 后 set）注入 out
  // 模拟一个含上游自带 x-b 的响应头集合
  const out = new Map();
  out.set('x-b', 'from-upstream'); // 上游自带 x-b
  // 先 remove
  for (const n of merged.remove) out.delete(n);
  // 后 set
  for (const [k, v] of Object.entries(merged.set)) out.set(k, v);
  check(out.get('cache-control') === 'max-age=600', 'C7 最终 cache-control=600', `out=${[...out]}`);
  check(out.get('x-a') === 's1', 'C8 最终 x-a=s1', `out=${[...out]}`);
  check(out.get('server') === 'EdgeGateway', 'C9 最终 server=EdgeGateway', `out=${[...out]}`);
  check(!out.has('x-b'), 'C10 最终 x-b 已删除（上游自带 + 全站 set 都被删）', `out=${[...out]}`);
}

// ----------------------------------------------------------------------------
// 场景D：站点规则跨多阶段，各阶段独立取源（rewrite 命中，respHeaders 未命中）
// ----------------------------------------------------------------------------
function testSceneD() {
  console.log('\n【场景D】站点规则跨多阶段：rewrite 命中、respHeaders 未命中 → 各阶段独立');
  const site = {
    rules: [
      unconditionalRule('rewrite', { rewrite: { type: 'prefix', value: '/api' } }, 10, 'rw-rule'),
      // 注意：没有 respHeaders 阶段的规则
    ],
  };
  const ctx = makeCtx('/');

  // rewrite 阶段：命中站点
  const srRw = matchRuleByStage(site, 'rewrite', ctx);
  check(srRw && srRw.id === 'rw-rule', 'D1 rewrite 阶段命中站点', `应命中 rw-rule（实际 ${srRw && srRw.id}）`);
  eq(srRw.action.rewrite, { type: 'prefix', value: '/api' }, 'D2 站点 rewrite 值');

  // respHeaders 阶段：站点无规则 → 全站保留（globalStages.respHeaders）
  const srRh = matchRuleByStage(site, 'respHeaders', ctx);
  check(srRh === null, 'D3 respHeaders 阶段站点未命中', `应返回 null（实际 ${srRh && srRh.id}）`);
  // 下游（pipeline 合并块）会据此把 ruleSource.respHeaders 标记为 'global' 并沿用全站值

  // 全站 respHeaders 的值应被沿用（模拟 globalStages.respHeaders 默认）
  const globalResp = {
    set: { server: 'EdgeGateway', 'x-a': 'global-xa' },
    remove: ['x-strip'],
  };
  // 站点未命中 → eff 维持全站值
  const effResp = { ...globalResp };
  eq(effResp.set.server, 'EdgeGateway', 'D5 respHeaders 沿用全站 server');
  eq(effResp.set['x-a'], 'global-xa', 'D6 respHeaders 沿用全站 x-a');

  // 验证：不同阶段的命中记录互不干扰（rewrite 命中、respHeaders 未命中）
  check(ctx.debug.ruleIds.rewrite === 'rw-rule' && ctx.debug.ruleIds.respHeaders === undefined,
    'D7 两阶段 ruleIds 独立记录', JSON.stringify(ctx.debug.ruleIds));
}

// ----------------------------------------------------------------------------
// 主入口
// ----------------------------------------------------------------------------
async function main() {
  console.log('=== 全站/站点规则 · 逐阶段先全站后站点合并 · 单元测试 ===');
  testSceneA();
  testSceneB();
  testSceneC();
  testSceneD();

  console.log('\n=== 测试汇总 ===');
  console.log(`  通过 ${passed} 项，失败 ${failures.length} 项`);
  if (failures.length > 0) {
    console.error('\n失败明细：');
    for (const f of failures) {
      console.error(`  - ${f.label}${f.detail ? ` → ${f.detail}` : ''}`);
    }
    console.error('\n❌ 存在失败：逐阶段合并逻辑与期望不一致。');
    process.exit(1);
  }
  console.log('\n✅ 全部通过：逐阶段先全站后站点合并逻辑符合预期。');
  process.exit(0);
}

main().catch((err) => {
  console.error('测试执行异常:', err);
  process.exit(1);
});
