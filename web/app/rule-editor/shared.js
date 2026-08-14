// 规则编辑器共享的静态映射与工具函数（原 IIFE 顶层定义）。
// 序列视图（renderTrafficSequence）与全站规则编辑器（openGlobalRulesDrawer）共享同一套定义。

import { renderTrafficSequence } from '../views/sequence.js';
import { openGlobalRulesDrawer } from './global.js';
import { buildRuleCard } from './card.js';
export const GLOBAL_STAGE_OPS = {
  rewrite: ['rewrite'],
  redirect: ['redirect'],
  terminate: ['forceHttps', 'directResponse'],
  reqHeaders: ['reqHeaders'],
  origin: ['hostHeader', 'clientIp', 'followRedirect', 'originTimeout', 'originConn'],
  cache: ['cache'],
  respHeaders: ['respHeaders'],
};

// 嵌套型阶段：stages[stage] 的值是该阶段的 action 片段（{type:'none'} 等），
// 而 terminate / origin 是「扁平 action 字段」直接作为 value。
export const NESTED_STAGES = new Set(['rewrite', 'redirect', 'reqHeaders', 'respHeaders', 'cache']);

// 把 stages[stage] 的值包成 buildRuleCard 期望的 rule.action
export function globalStageToAction(stage, value) {
  if (NESTED_STAGES.has(stage)) return { [stage]: value && typeof value === 'object' ? value : {} };
  return value && typeof value === 'object' ? { ...value } : {};
}

// 从 buildRuleCard.read() 的 action 还原出 stages[stage] 的值
export function actionToGlobalStage(stage, action) {
  return NESTED_STAGES.has(stage) ? (action[stage] || {}) : (action || {});
}
