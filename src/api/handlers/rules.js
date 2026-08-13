import { ok, fail } from '../../utils/response.js';
import { ERROR_CODES } from '../../contracts.js';
import { getGlobalRules, putGlobalRules } from '../../config/store.js';
import { validateGlobalRulesStages } from '../../config/schema.js';
import { DEFAULT_GLOBAL_RULES } from '../../config/defaults.js';

/** GET /rules/global —— 读取全站通用（兜底）规则（stages 阶段映射 + settings 全局默认参数） */
export async function listGlobal(ctx) {
  const g = await getGlobalRules(ctx);
  return ok({ stages: g.stages, settings: g.settings });
}

/** PUT /rules/global —— 覆盖写入全站通用（兜底）规则（stages 阶段映射 + settings 全局默认参数） */
export async function putGlobal(ctx) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400);
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体应为 { stages: {...}, settings: {...} } 对象', 400);
  }

  const res = validateGlobalRulesStages(body, DEFAULT_GLOBAL_RULES);
  if (!res.ok) {
    return fail(ERROR_CODES.BAD_REQUEST, `全站规则校验失败: ${res.errors.join('; ')}`, 400);
  }

  await putGlobalRules(ctx, res.value.stages, res.value.settings);
  return ok({ stages: res.value.stages, settings: res.value.settings });
}
