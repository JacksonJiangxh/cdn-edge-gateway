import { readFileSync, writeFileSync, existsSync } from 'fs';

// 路径规则：
//  dom.js / _stage.gen.js 位于 web/
//  util/state/router/ui.js 位于 web/app/
//  rule-editor/* 位于 web/app/rule-editor/
//  views/* 位于 web/app/views/
// 因此：
//   - 子目录文件(rule-editor, views)引用 dom/_stage 用 '../../'
//   - 子目录文件引用 util/state/router/ui 用 '../'
//   - web/app 根文件引用 dom/_stage 用 '../'

const IMPORTS = {
  'app/util.js': [
    "import { el, $ } from '../dom.js';",
    "import { normalizeStage } from '../_stage.gen.js';",
    "import { APP_DATA, PLATFORM } from './state.js';",
  ],
  'app/ui.js': [
    "import { el, $ } from '../dom.js';",
    "import { route } from './router.js';",
    "import { loadAll } from './views/overview.js';",
  ],
  'app/rule-editor/conditions.js': [
    "import { el, $ } from '../../dom.js';",
    "import { field, multiSelectPanel, select } from '../util.js';",
  ],
  'app/rule-editor/status.js': [
    "import { el, $ } from '../../dom.js';",
    "import { field, humanDuration, select } from '../util.js';",
  ],
  'app/rule-editor/ops.js': [
    "import { $, clear, el } from '../../dom.js';",
    "import { field, humanDuration, select, varHintBar } from '../util.js';",
    "import { statusPatternListEditor, statusTtlEditor } from './status.js';",
    "import { section } from './card.js';",
    "import { normalizeMatchForEditor } from './conditions.js';",
  ],
  'app/rule-editor/card.js': [
    "import { el } from '../../dom.js';",
    "import { STAGE_OPS } from '../../_stage.gen.js';",
    "import { conditionsEditor, normalizeMatchForEditor } from './conditions.js';",
    "import { cacheEditor, headerEditor, rewriteEditor } from './ops.js';",
    "import { stringListEditor, stripRuleEditor } from './status.js';",
  ],
  'app/rule-editor/global.js': [
    "import { GLOBAL_ONLY_STAGE_OPS, STAGE_OPS, isGlobalOnlyStage } from '../../_stage.gen.js';",
    "import { GLOBAL_STAGE_OPS, actionToGlobalStage, globalStageToAction } from './shared.js';",
    "import { API, globalStages } from '../state.js';",
    "import { openDrawer, toast } from '../ui.js';",
    "import { route } from '../router.js';",
    "import { buildPoolOptions } from '../views/pools.js';",
    "import { buildRuleCard } from './card.js';",
  ],
  'app/views/overview.js': [
    "import { el } from '../../dom.js';",
    "import { table, actions, statCard, fmtNum, fmtRate } from '../util.js';",
    "import { APP_DATA, API } from '../state.js';",
  ],
  'app/views/sites.js': [
    "import { el } from '../../dom.js';",
    "import { table, actions, poolName, ruleStage } from '../util.js';",
    "import { openDrawer, confirmDialog, toast } from '../ui.js';",
    "import { route } from '../router.js';",
    "import { APP_DATA, API } from '../state.js';",
    "import { buildRuleCard } from '../rule-editor/card.js';",
    "import { openGlobalRulesDrawer } from '../rule-editor/global.js';",
  ],
  'app/views/sequence.js': [
    "import { el } from '../../dom.js';",
    "import { table, actions, poolName, ruleStage } from '../util.js';",
    "import { openDrawer, confirmDialog, toast } from '../ui.js';",
    "import { route } from '../router.js';",
    "import { globalStages } from '../state.js';",
    "import { STAGE_ORDER, normalizeStage } from '../../_stage.gen.js';",
    "import { buildRuleCard, section } from '../rule-editor/card.js';",
    "import { openGlobalOnlyStageDrawer, openGlobalRulesDrawer } from '../rule-editor/global.js';",
  ],
  'app/views/pools.js': [
    "import { el } from '../../dom.js';",
    "import { table, actions, poolName } from '../util.js';",
    "import { openDrawer, confirmDialog, toast } from '../ui.js';",
    "import { route } from '../router.js';",
    "import { APP_DATA, API } from '../state.js';",
    "import { buildRuleCard } from '../rule-editor/card.js';",
  ],
  'app/views/cache.js': [
    "import { el } from '../../dom.js';",
    "import { table, actions } from '../util.js';",
    "import { openDrawer, confirmDialog, toast } from '../ui.js';",
    "import { route } from '../router.js';",
    "import { API } from '../state.js';",
    "import { buildRuleCard } from '../rule-editor/card.js';",
  ],
  'app/views/system.js': [
    "import { el } from '../../dom.js';",
    "import { table, actions } from '../util.js';",
    "import { openDrawer, confirmDialog, toast } from '../ui.js';",
    "import { route } from '../router.js';",
    "import { API } from '../state.js';",
    "import { buildRuleCard } from '../rule-editor/card.js';",
  ],
};

for (const [f, lines] of Object.entries(IMPORTS)) {
  const path = 'web/' + f;
  if (!existsSync(path)) { console.log('SKIP', path); continue; }
  let code = readFileSync(path, 'utf8').split('\n');
  code = code.filter((l) => !/^\s*import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*$/.test(l));
  let idx = 0;
  while (idx < code.length && (code[idx].trim() === '' || code[idx].trim().startsWith('//'))) idx++;
  code.splice(idx, 0, ...lines);
  writeFileSync(path, code.join('\n'));
  console.log('rewrote imports:', f);
}
console.log('DONE');
