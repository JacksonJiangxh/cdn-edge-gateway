import { ok, fail } from '../../utils/response.js';
import { ERROR_CODES } from '../../contracts.js';
import { getGlobalRules, putGlobalRules } from '../../config/store.js';
import { validateGlobalRulesStages } from '../../config/schema.js';
import { DEFAULT_GLOBAL_RULES } from '../../config/defaults.js';

/**
 * GET /rules/global —— 读取全站通用（兜底）规则。
 *
 * 单轨化后响应只有 stages：原先并列的 settings 段（一批前端不可见、后端却生效的
 * 隐藏全局参数）已按业务本质并入各阶段的默认动作，其中 match / security / error
 * 三个「全站独有阶段」承载了原 settings 里跨请求维度的配置。
 */
export async function listGlobal(ctx) {
  const g = await getGlobalRules(ctx);
  return ok({ stages: g.stages });
}

/** PUT /rules/global —— 覆盖写入全站通用（兜底）规则（stages 阶段映射，单轨） */
export async function putGlobal(ctx) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400);
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体应为 { stages: {...} } 对象', 400);
  }

  const res = validateGlobalRulesStages(body, DEFAULT_GLOBAL_RULES);
  if (!res.ok) {
    return fail(ERROR_CODES.BAD_REQUEST, `全站规则校验失败: ${res.errors.join('; ')}`, 400);
  }

  await putGlobalRules(ctx, res.value.stages);
  return ok({ stages: res.value.stages });
}
