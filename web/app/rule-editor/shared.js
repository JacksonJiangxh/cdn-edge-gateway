// 规则编辑器共享的静态映射与工具函数（原 IIFE 顶层定义）。
// 序列视图（renderTrafficSequence）与全站规则编辑器（openGlobalRulesDrawer）共享同一套定义。

import { renderTrafficSequence } from '../views/sequence.js';
import { openGlobalRulesDrawer } from './global.js';
import { buildRuleCard } from './card.js';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export const GLOBAL_STAGE_OPS = {
  rewrite: ['rewrite'],
  redirect: ['redirect'],
  terminate: ['forceHttps', 'directResponse'],
  reqHeaders: ['reqHeaders'],
  origin: ['hostHeader', 'clientIp', 'followRedirect', 'originTimeout', 'originConn'],
  cache: ['cache'],
  respHeaders: ['respHeaders'],
};

// 规则专属键（不属于「动作字段」）：还原 stages[stage] 时须剔除。
const RULE_OWNED_KEYS = new Set(['id', 'name', 'note', 'priority', 'match', 'enabled', 'stage']);

// 全扁平落盘形态下，所有阶段的 stages[stage] 一律平铺该阶段在 action 里的对应字段
// （terminate 平铺 forceHttps/...、rewrite 平铺 type/value 到 stages.rewrite 顶层，
// 落盘无嵌套片段）。但 normRule 内部读取约定是「混合」的：嵌套型阶段（rewrite/cache/
// reqHeaders/...）整段动作挂在 action[stage] 子对象上；扁平型阶段（terminate/origin）
// 字段分散在 action 顶层。故转换需按阶段类型映射，与后端 stageValueToAction/
// actionToStageValue 同构。

// 判定嵌套型阶段：该 stage 的 allowedOps 仅含唯一元素且该元素名 == stage 本身
// （如 GLOBAL_STAGE_OPS.rewrite=['rewrite']、terminate=['forceHttps','directResponse'] 非嵌套）。
function isNestedStage(stage) {
  const ops = GLOBAL_STAGE_OPS[stage];
  return Array.isArray(ops) && ops.length === 1 && ops[0] === stage;
}

// 把 stages[stage] 的扁平值包成 buildRuleCard 期望的 rule.action
export function globalStageToAction(stage, value) {
  const v = value && typeof value === 'object' ? value : {};
  // 嵌套型：整段值挂到 action[stage] 子对象（normRule 读取约定）
  if (isNestedStage(stage)) return { [stage]: v };
  // 扁平型：直接展开为 action 顶层字段
  return { ...v };
}

// 从 buildRuleCard.read() 的 action 还原出 stages[stage] 的扁平值
export function actionToGlobalStage(stage, action) {
  const a = action && typeof action === 'object' ? action : {};
  // 嵌套型：取 action[stage] 子对象整体作为落盘值（其自身已是平铺结构）
  if (isNestedStage(stage)) return isObj(a[stage]) ? { ...a[stage] } : {};
  // 扁平型：收集该阶段允许的顶层字段（GLOBAL_STAGE_OPS[stage] 即字段名集合），并剔除规则专属键
  const out = {};
  const ops = GLOBAL_STAGE_OPS[stage] || [];
  for (const k of ops) {
    // 回退：若 action 顶层没有该 op 名，再看 action[op]（极少数 op 名与字段名不同，如 originConn→engine/scheme/port）
    if (k in a) out[k] = a[k];
  }
  for (const k of Object.keys(a)) {
    if (RULE_OWNED_KEYS.has(k)) continue;
    if (!(k in out)) out[k] = a[k]; // 兜底收集未枚举到的动作字段
  }
  return out;
}
