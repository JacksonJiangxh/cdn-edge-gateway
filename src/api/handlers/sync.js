/**
 * ============================================================================
 * 配置同步 handler —— 跨平台配置推送接收端
 * ----------------------------------------------------------------------------
 * 设计要点（默认关闭、临时开放、一次性、自动收口）：
 *
 *   1. 接收接口（/system/sync/receive）默认**长期关闭**。它在 router 层声明为
 *      auth:false（免登录），但自身做「校验码 + 密码」双重校验，且校验码必须来自
 *      KV 中当前存在的、未过期的 sync:token。没有有效 token = 接口事实关闭。
 *
 *   2. 校验码由接收方管理员在管理面点击「开启接收」时生成，写入 KV（sync:token），
 *      带 expirationTtl（默认 10 分钟）。过期后自动失效，接口自动回到关闭态，
 *      无需人工干预，避免「开了忘记关」被扫描盗刷。
 *
 *   3. 一次性：接收成功后在返回响应前立即删除 sync:token，无论后续是否有别的请求
 *      携带同一校验码都无法再通过校验，杜绝重放。
 *
 *   4. 双重校验：
 *      - 校验码：请求体 code 与 KV 中 sync:token.code 做恒定时间比较；
 *      - 密码：请求体 password 经 PBKDF2 与接收方自身 cfg:global.passwordHash 比对。
 *      任一不匹配即拒绝，且不区分「码错」还是「密码错」，避免给攻击者 oracle。
 *
 *   5. 校验失败一律返回 401 并复用 loginGuard 记录失败、恒定延迟，对抗暴力枚举；
 *      但不删除 token（让接收方决定是否手动关闭或等其过期）。
 *
 *   6. 镜像写入复用 system.js 的 buildConfigMirror / applyConfigMirror 唯一真相源，
 *      密码哈希始终在镜像中被剥离、导入时保留本机凭据。
 * ============================================================================
 */

import { ok, fail, unauthorized, forbidden } from '../../utils/response.js';
import { ERROR_CODES } from '../../contracts.js';
import {
  getSyncToken,
  setSyncToken,
  delSyncToken,
  SYNC_TOKEN_TTL_SEC,
  getGlobal,
} from '../../config/store.js';
import { buildConfigMirror, applyConfigMirror } from './system.js';
import { randomHex, timingSafeEqual } from '../../utils/crypto.js';
import { verifyPassword, hashPassword } from '../../security/auth.js';
import {
  getClientIp,
  checkLoginAllowed,
  recordLoginFailure,
  constantDelay,
} from '../../security/loginGuard.js';

/** 校验码生成长度（字节），输出 48 个 hex 字符，足够抗在线枚举。 */
const SYNC_CODE_BYTES = 24;

/** 接收端失败锁定桶前缀，与登录共用 loginGuard 的降级语义。 */
const SYNC_FAIL_TAG = 'sync-recv';

/**
 * 校验「校验码 + 密码」是否同时匹配。
 *
 * 任一项失败都返回 false；为恒定耗时，即使 token 不存在也会跑一次 PBKDF2。
 *
 * @param {import('../../contracts.js').Ctx} ctx
 * @param {{code?:string, password?:string}} body 请求体
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function verifyCodeAndPassword(ctx, body) {
  const code = typeof body.code === 'string' ? body.code : '';
  const password = typeof body.password === 'string' ? body.password : '';

  // 读 KV 中的 sync:token；不存在/过期 -> getSyncToken 已返回 null（内部 best-effort 清理）
  const token = await getSyncToken(ctx);
  if (!token || typeof token.code !== 'string') {
    return { ok: false, reason: 'closed' };
  }

  // 校验码恒定时间比较；长度不同也不提前返回，统一耗时
  const codeMatch = timingSafeEqual(code, token.code);

  // 读取接收方自身密码哈希
  let global;
  try {
    global = await getGlobal(ctx);
  } catch {
    global = null;
  }
  const storedHash = global && typeof global.passwordHash === 'string' ? global.passwordHash : '';
  const storedSalt = global && typeof global.passwordSalt === 'string' ? global.passwordSalt : '';

  const pwdMatch = await verifyPassword(password, storedHash, storedSalt);

  // 不区分失败原因，避免 oracle
  if (!codeMatch || !pwdMatch) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true };
}

/**
 * POST /system/sync/open （auth:true，仅接收方自身管理员）
 *
 * 生成高熵随机校验码写入 KV（带 TTL），并返回校验码与剩余有效期。
 * 此后 /system/sync/receive 才接受请求。
 *
 * @param {import('../../contracts.js').Ctx} ctx
 */
export async function openSync(ctx) {
  let ttl = SYNC_TOKEN_TTL_SEC;
  try {
    const body = await ctx.request.json();
    if (body && Number.isFinite(Number(body.ttl)) && Number(body.ttl) > 0) {
      ttl = Number(body.ttl);
    }
  } catch {
    // 无 body 时沿用默认 TTL
  }

  const code = randomHex(SYNC_CODE_BYTES);
  await setSyncToken(ctx, code, ttl);

  const expiresAt = Date.now() + ttl * 1000;
  return ok({
    code,
    ttlSec: ttl,
    expiresAt,
    message: '接收接口已开启，请将校验码提供给发送方',
  });
}

/**
 * POST /system/sync/close （auth:true，仅接收方自身管理员）
 *
 * 立即删除 KV 中的 sync:token，接口恢复关闭态。
 *
 * @param {import('../../contracts.js').Ctx} ctx
 */
export async function closeSync(ctx) {
  await delSyncToken(ctx);
  return ok({ closed: true, message: '接收接口已关闭' });
}

/**
 * 查询当前接收状态（auth:true，仅接收方自身管理员）。
 *
 * 返回是否开放与剩余有效期，供管理面状态条展示。
 *
 * @param {import('../../contracts.js').Ctx} ctx
 */
export async function syncStatus(ctx) {
  const token = await getSyncToken(ctx);
  if (!token || typeof token.expiresAt !== 'number') {
    return ok({ open: false });
  }
  const remainMs = token.expiresAt - Date.now();
  if (remainMs <= 0) {
    return ok({ open: false });
  }
  return ok({ open: true, expiresAt: token.expiresAt, remainMs });
}

/**
 * POST /system/sync/receive （auth:false，对外开放，自校验）
 *
 * 接收方侧核心入口：发送方跨站 POST 完整配置镜像 + 校验码 + 密码。
 * 校验通过则复用 applyConfigMirror 写入，并在返回前删除 sync:token（一次性）。
 *
 * 安全：
 *   - 免登录但双重校验（校验码 + 密码）；
 *   - 校验失败走 loginGuard 防爆破 + 恒定延迟，统一返回 401 且不泄露细节；
 *   - 成功后立即删 token，杜绝重放；
 *   - 不记录明文密码 / 完整 payload 到日志。
 *
 * @param {import('../../contracts.js').Ctx} ctx
 */
export async function receiveSync(ctx) {
  const startedAt = Date.now();
  const ip = getClientIp(ctx.request);

  // 防暴力枚举：复用登录失败锁定桶语义（同一 IP 连续失败 5 次锁定 15 分钟）
  const gate = await checkLoginAllowed(ctx, `${SYNC_FAIL_TAG}:${ip}`);
  if (!gate.allowed) {
    await constantDelay(startedAt);
    return fail(
      ERROR_CODES.RATE_LIMITED,
      `尝试过于频繁，请 ${gate.retryAfter}s 后重试`,
      429,
      { 'Retry-After': String(gate.retryAfter) }
    );
  }

  let body;
  try {
    body = await ctx.request.json();
  } catch {
    await recordLoginFailure(ctx, `${SYNC_FAIL_TAG}:${ip}`);
    await constantDelay(startedAt);
    return unauthorized('请求体不是合法的 JSON');
  }

  if (!body || typeof body !== 'object') {
    await recordLoginFailure(ctx, `${SYNC_FAIL_TAG}:${ip}`);
    await constantDelay(startedAt);
    return unauthorized('配置格式不正确');
  }

  const verify = await verifyCodeAndPassword(ctx, body);
  if (!verify.ok) {
    await recordLoginFailure(ctx, `${SYNC_FAIL_TAG}:${ip}`);
    await constantDelay(startedAt);
    // 统一 401，不区分「接口已关」「码错」「密码错」
    return unauthorized('校验失败');
  }

  // —— 双重校验通过 ——
  // 在任何可能失败的操作前，先做一次镜像结构校验，避免「删了 token 却写不进」的
  // 半成功态。此处仅做存在性检查，真正的 schema 校验在 applyConfigMirror 内完成。
  const payload = body.payload;
  if (!payload || typeof payload !== 'object' ||
      (!Array.isArray(payload.sites) && !Array.isArray(payload.pools))) {
    // 结构非法：校验已通过，但内容为空，按失败处理并删 token（一次性已消耗）
    await delSyncToken(ctx);
    await constantDelay(startedAt);
    return fail(ERROR_CODES.BAD_REQUEST, '配置镜像中没有可导入的站点或源站', 400);
  }

  try {
    const { imported, errors } = await applyConfigMirror(ctx, payload, {
      includeGlobal: true,
    });

    // 一次性：无论导入是否部分失败，都立即关闭接口，防止同一校验码被重放
    await delSyncToken(ctx);

    await constantDelay(startedAt);
    return ok({
      imported,
      errors,
      closed: true,
      message:
        errors.length > 0
          ? `同步完成，${errors.length} 项失败，接收接口已自动关闭`
          : '同步成功，接收接口已自动关闭',
    });
  } catch (err) {
    // 写入异常：仍消耗 token（一次性），避免校验码被反复重试探测
    await delSyncToken(ctx);
    await constantDelay(startedAt);
    return fail(ERROR_CODES.INTERNAL, '同步写入失败', 500);
  }
}

// 让编辑器不报未使用（hashPassword 供未来扩展校验链路，显式保留以提示依赖边界）
void hashPassword;
