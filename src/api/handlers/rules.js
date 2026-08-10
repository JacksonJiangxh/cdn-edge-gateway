import { ok, fail } from '../../utils/response.js';
import { ERROR_CODES } from '../../contracts.js';
import { getGlobalRules, putGlobalRules } from '../../config/store.js';
import { validateRule } from '../../config/schema.js';

/** GET /rules/global —— 读取全站通用（兜底）规则 */
export async function listGlobal(ctx) {
  const rules = await getGlobalRules(ctx);
  return ok({ rules });
}

/** PUT /rules/global —— 覆盖写入全站通用（兜底）规则 */
export async function putGlobal(ctx) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400);
  }
  if (!Array.isArray(body)) {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体应为规则数组', 400);
  }

  const normalized = [];
  for (let i = 0; i < body.length; i++) {
    const res = validateRule(body[i]);
    if (!res.ok) {
      return fail(ERROR_CODES.BAD_REQUEST, `第 ${i + 1} 条规则校验失败: ${res.errors.join('; ')}`, 400);
    }
    normalized.push(res.value);
  }

  await putGlobalRules(ctx, normalized);
  return ok({ rules: normalized });
}
