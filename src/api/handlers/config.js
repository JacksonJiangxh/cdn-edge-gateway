/**
 * 全局配置 API handlers
 *
 * 安全要点：
 *  - GET 返回时剥离 passwordHash / passwordSalt，避免凭据随响应外泄
 *  - PUT 通过 validateGlobal(input, caps) 做平台能力联动校验
 *    （如 EdgeOne 上选 d1 统计驱动会被拦截）
 */

import { ok, fail } from '../../utils/response.js';
import { ERROR_CODES } from '../../contracts.js';
import { getGlobal, putGlobal } from '../../config/store.js';
import { validateGlobal } from '../../config/schema.js';

/** GET /config/global —— 返回全局配置（不含凭据哈希） */
export async function get(ctx) {
  const g = await getGlobal(ctx);
  if (!g) return fail(ERROR_CODES.NOT_FOUND, '全局配置不存在', 404);

  // 剥离敏感字段
  const safe = { ...g };
  delete safe.passwordHash;
  delete safe.passwordSalt;
  return ok(safe);
}

/** PUT /config/global —— 保存全局配置 */
export async function put(ctx) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400);
  }

  // 平台能力联动校验：caps 缺失时仅做宽松校验
  // 传入现有配置，使「留空字段」沿用已存储值而非默认 __panel
  const existing = await getGlobal(ctx);
  const res = validateGlobal(body, ctx.caps, existing || undefined);
  if (!res.ok) {
    return fail(ERROR_CODES.BAD_REQUEST, '配置校验失败: ' + res.errors.join('; '), 400);
  }

  // 保留既有凭据哈希，防止前端误清空密码
  const value = res.value;
  if (existing) {
    value.passwordHash = existing.passwordHash || '';
    value.passwordSalt = existing.passwordSalt || '';
  }

  await putGlobal(ctx, value);
  const safe = { ...value };
  delete safe.passwordHash;
  delete safe.passwordSalt;
  return ok(safe);
}
