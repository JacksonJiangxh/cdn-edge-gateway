import { readFileSync, writeFileSync, existsSync } from 'fs';

const SYM = {
  'el': 'dom.js', '$': 'dom.js', 'clear': 'dom.js', 'escapeHtml': 'dom.js',
  'STAGE_ORDER': '_stage.gen.js', 'STAGE_OPS': '_stage.gen.js', 'STAGE_ALIASES': '_stage.gen.js',
  'normalizeStage': '_stage.gen.js', 'GLOBAL_ONLY_STAGE_OPS': '_stage.gen.js', 'isGlobalOnlyStage': '_stage.gen.js',
  'APP_DATA': 'state.js', 'globalStages': 'state.js', 'GLOBAL_STAGES': 'state.js', 'API': 'state.js', 'PLATFORM': 'state.js',
  'fmtNum': 'util.js', 'fmtRate': 'util.js', 'fmtDate': 'util.js', 'humanSecs': 'util.js', 'statCard': 'util.js',
  'poolName': 'util.js', 'ruleStage': 'util.js', 'humanDuration': 'util.js', 'table': 'util.js', 'actions': 'util.js',
  'renderPlatBadge': 'util.js', 'field': 'util.js', 'varHintBar': 'util.js', 'selectWithGroups': 'util.js',
  'select': 'util.js', 'multiSelectPanel': 'util.js',
  'toast': 'ui.js', 'openDrawer': 'ui.js', 'closeDrawer': 'ui.js', 'scrollToAnchor': 'ui.js', 'confirmDialog': 'ui.js',
  'ensureAuth': 'ui.js', 'doLogin': 'ui.js', 'doLogout': 'ui.js', 'showLogin': 'ui.js', 'enterApp': 'ui.js',
  'route': 'router.js', '$$nav': 'router.js',
  'GLOBAL_STAGE_OPS': 'rule-editor/shared.js', 'NESTED_STAGES': 'rule-editor/shared.js',
  'globalStageToAction': 'rule-editor/shared.js', 'actionToGlobalStage': 'rule-editor/shared.js',
  'conditionRow': 'rule-editor/conditions.js', 'conditionsEditor': 'rule-editor/conditions.js', 'normalizeMatchForEditor': 'rule-editor/conditions.js',
  'statusQuickPick': 'rule-editor/status.js', 'statusTtlEditor': 'rule-editor/status.js', 'statusPatternListEditor': 'rule-editor/status.js',
  'stripRuleEditor': 'rule-editor/status.js', 'stringListEditor': 'rule-editor/status.js',
  'headerEditor': 'rule-editor/ops.js', 'cacheEditor': 'rule-editor/ops.js', 'rewriteEditor': 'rule-editor/ops.js', 'previewRewrite': 'rule-editor/ops.js',
  'section': 'rule-editor/card.js', 'opSection': 'rule-editor/card.js', 'buildRuleCard': 'rule-editor/card.js', 'getOp': 'rule-editor/card.js',
  'openGlobalRulesDrawer': 'rule-editor/global.js', 'openGlobalOnlyStageDrawer': 'rule-editor/global.js', 'openCacheGenDrawer': 'rule-editor/global.js',
  'MATCH_TARGET_OPTS': 'rule-editor/conditions.js', 'MATCH_OP_OPTS': 'rule-editor/conditions.js',
  'TARGETS_WITH_KEY': 'rule-editor/conditions.js', 'OPS_NO_VALUE': 'rule-editor/conditions.js',
  'EXTENSION_PRESETS': 'rule-editor/conditions.js', 'ERROR_CODE_PRESETS': 'rule-editor/conditions.js',
  'EXTENSION_GROUPS': 'rule-editor/conditions.js', 'ERROR_CODE_GROUPS': 'rule-editor/conditions.js',
  'STATUS_PATTERN_RE': 'rule-editor/status.js', 'STATUS_PATTERN_HINT': 'rule-editor/status.js', 'STATUS_PATTERN_GROUPS': 'rule-editor/status.js',
  'renderOverview': 'views/overview.js', 'loadAll': 'views/overview.js',
  'renderSites': 'views/sites.js', 'openSiteDrawer': 'views/sites.js', 'openInitialOriginDrawer': 'views/sites.js',
  'openSecurityDrawer': 'views/sites.js', 'openRulesDrawer': 'views/sites.js', 'removeSite': 'views/sites.js',
  'renderTrafficSequence': 'views/sequence.js', 'seqGroup': 'views/sequence.js', 'seqStage': 'views/sequence.js', 'seqRuleInPack': 'views/sequence.js',
  'poolKind': 'views/pools.js', 'originSummary': 'views/pools.js', 'buildPoolOptions': 'views/pools.js', 'refsCell': 'views/pools.js',
  'renderPools': 'views/pools.js', 'openRefsDrawer': 'views/pools.js', 'openPoolDrawer': 'views/pools.js', 'removePool': 'views/pools.js',
  'renderCache': 'views/cache.js', 'purgeSite': 'views/cache.js',
  'renderSystem': 'views/system.js', 'importConfig': 'views/system.js', 'openChangePassword': 'views/system.js', 'exportConfig': 'views/system.js',
};

function dirOf(f) {
  if (f.startsWith('rule-editor/')) return 'rule-editor';
  if (f.startsWith('views/')) return 'views';
  return 'app';
}
function catOf(target) {
  if (target === 'dom.js' || target === '_stage.gen.js') return 'web';
  if (target.startsWith('rule-editor/')) return 'rule-editor';
  if (target.startsWith('views/')) return 'views';
  return 'app';
}
function relPath(fromFile, target) {
  const from = dirOf(fromFile);
  const cat = catOf(target);
  const base = target.split('/')[1];
  if (from === 'app') {
    if (cat === 'web') return '../' + target;
    if (cat === 'app') return './' + target;
    if (cat === 'rule-editor') return './rule-editor/' + base;
    if (cat === 'views') return './views/' + base;
  }
  if (from === 'rule-editor') {
    if (cat === 'web') return '../../' + target;
    if (cat === 'app') return '../' + target;
    if (cat === 'rule-editor') return './' + base;
    if (cat === 'views') return '../views/' + base;
  }
  if (from === 'views') {
    if (cat === 'web') return '../../' + target;
    if (cat === 'app') return '../' + target;
    if (cat === 'rule-editor') return '../rule-editor/' + base;
    if (cat === 'views') return './' + base;
  }
  return './' + target;
}

const files = [
  'util.js', 'ui.js', 'router.js', 'state.js',
  'rule-editor/conditions.js', 'rule-editor/status.js', 'rule-editor/ops.js',
  'rule-editor/card.js', 'rule-editor/global.js', 'rule-editor/shared.js',
  'views/overview.js', 'views/sites.js', 'views/sequence.js',
  'views/pools.js', 'views/cache.js', 'views/system.js',
];

const IDENT = /[A-Za-z_$][A-Za-z0-9_$]*/g;

for (const f of files) {
  const path = 'web/app/' + f;
  if (!existsSync(path)) { console.log('SKIP', path); continue; }
  let code = readFileSync(path, 'utf8');
  code = code.split('\n').filter((l) => !/^\s*import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/.test(l)).join('\n');

  const defined = new Set();
  const defRe = /export\s+(?:async\s+)?(?:function\s+([A-Za-z_$][A-Za-z0-9_$]*)|const\s+([A-Za-z_$][A-Za-z0-9_$]*))|(?:function|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=|\(|\()/g;
  let m;
  while ((m = defRe.exec(code))) defined.add(m[1] || m[2] || m[3]);

  const used = new Set();
  let mm; const re = new RegExp(IDENT);
  while ((mm = re.exec(code))) used.add(mm[0]);

  const rel = f;
  for (const sym of Object.keys(SYM)) {
    if (SYM[sym] !== rel) continue;
    if (new RegExp(`export\\s+(?:const|let)\\s+${sym}\\b`).test(code)) continue;
    const ce = new RegExp(`(\\n)(\\s*const\\s+${sym}\\s*=)`);
    if (ce.test(code)) { code = code.replace(ce, `$1export $2`); }
  }

  const need = {};
  for (const sym of used) {
    if (!Object.hasOwn(SYM, sym)) continue;
    const target = SYM[sym];
    if (defined.has(sym)) continue;
    if (target === f) continue;
    (need[target] = need[target] || new Set()).add(sym);
  }

  const existing = new Set();
  const existRe = /import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = existRe.exec(code))) {
    const p = m[2];
    m[1].split(',').forEach((s) => existing.add(p + ':' + s.trim()));
  }

  let imports = '';
  for (const [target, syms] of Object.entries(need)) {
    const p = relPath(f, target);
    const list = [...syms].filter((s) => !existing.has(p + ':' + s)).sort();
    if (list.length) imports += `import { ${list.join(', ')} } from '${p}';\n`;
  }

  if (imports) {
    const lines = code.split('\n');
    let idx = 0;
    while (idx < lines.length && (lines[idx].trim() === '' || lines[idx].trim().startsWith('//'))) idx++;
    lines.splice(idx, 0, imports.trimEnd());
    code = lines.join('\n');
  }
  writeFileSync(path, code);
  console.log('processed:', f, imports ? 'imports added' : 'none');
}
console.log('DONE');
