import { readFileSync, writeFileSync, existsSync } from 'fs';

// 每个文件应导出的符号（与 MODULES 总表一致）
const EXPORTS = {
  'app/ui.js': ['toast', 'openDrawer', 'closeDrawer', 'scrollToAnchor', 'confirmDialog', 'ensureAuth', 'doLogin', 'doLogout', 'showLogin', 'enterApp'],
  'app/router.js': ['route', '$$nav'],
  'app/rule-editor/shared.js': ['GLOBAL_STAGE_OPS', 'globalStageToAction', 'actionToGlobalStage'],
  'app/rule-editor/conditions.js': ['conditionRow', 'conditionsEditor', 'normalizeMatchForEditor'],
  'app/rule-editor/status.js': ['statusQuickPick', 'statusTtlEditor', 'statusPatternListEditor', 'stripRuleEditor', 'stringListEditor'],
  'app/rule-editor/ops.js': ['headerEditor', 'cacheEditor', 'rewriteEditor', 'previewRewrite'],
  'app/rule-editor/card.js': ['section', 'opSection', 'buildRuleCard', 'getOp'],
  'app/rule-editor/global.js': ['openGlobalRulesDrawer', 'openGlobalOnlyStageDrawer', 'openCacheGenDrawer'],
  'app/views/overview.js': ['renderOverview', 'loadAll'],
  'app/views/sites.js': ['renderSites', 'openSiteDrawer', 'openInitialOriginDrawer', 'openSecurityDrawer', 'openRulesDrawer', 'removeSite'],
  'app/views/sequence.js': ['renderTrafficSequence', 'seqGroup', 'seqStage', 'seqRuleInPack'],
  'app/views/pools.js': ['poolKind', 'originSummary', 'buildPoolOptions', 'refsCell', 'renderPools', 'openRefsDrawer', 'openPoolDrawer', 'removePool'],
  'app/views/cache.js': ['renderCache', 'purgeSite'],
  'app/views/system.js': ['renderSystem', 'importConfig', 'openChangePassword', 'exportConfig'],
  'app/util.js': ['fmtNum', 'fmtRate', 'fmtDate', 'humanSecs', 'statCard', 'poolName', 'ruleStage', 'humanDuration', 'table', 'actions', 'renderPlatBadge', 'field', 'varHintBar', 'selectWithGroups', 'select', 'multiSelectPanel'],
};

for (const [f, syms] of Object.entries(EXPORTS)) {
  const path = 'web/' + f;
  if (!existsSync(path)) { console.log('SKIP', path); continue; }
  let code = readFileSync(path, 'utf8');

  for (const name of syms) {
    // 已导出则跳过
    const already = new RegExp(`export\\s+(?:async\\s+)?(?:function\\s+${name}\\b|const\\s+${name}\\b)`);
    if (already.test(code)) continue;
    // function X(  （允许前导缩进）
    let re = new RegExp(`(\\n)(\\s*(?:async\\s+)?function\\s+${name}\\s*\\()`);
    if (re.test(code)) { code = code.replace(re, `$1export $2`); continue; }
    // const X = ( ... ) | const X = async ( | const X = function
    re = new RegExp(`(\\n)(\\s*const\\s+${name}\\s*=\\s*(?:async\\s+)?(\\(|function\\b))`);
    if (re.test(code)) { code = code.replace(re, `$1export $2`); continue; }
    // let X = 
    re = new RegExp(`(\\n)(\\s*let\\s+${name}\\s*=\\s*(?:async\\s+)?(\\(|function\\b))`);
    if (re.test(code)) { code = code.replace(re, `$1export $2`); continue; }
    console.log('  !! NOT FOUND for export:', f, name);
  }
  writeFileSync(path, code);
  console.log('exports ensured:', f);
}
console.log('DONE');
