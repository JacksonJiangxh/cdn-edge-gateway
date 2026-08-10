/**
 * 登录鉴权 API handlers
 *
 * 安全要点：
 *   1. 登录失败按 IP 计数，5 次锁定 15 分钟
 *   2. 无论成功失败都保证恒定响应耗时，防时序侧信道
 *   3. 密码比对使用恒定时间算法
 *   4. Token 写入 HttpOnly Cookie，前端 JS 无法读取
 */

import { ok, fail } from '../../utils/response.js';
import { ERROR_CODES } from '../../contracts.js';
import {
  verifyPassword,
  hashPassword,
  signToken,
  buildAuthCookie,
  buildClearAuthCookie,
  resolveSecret,
} from '../../security/auth.js';
import {
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  constantDelay,
  getClientIp,
} from '../../security/loginGuard.js';
import { getGlobal, putGlobal } from '../../config/store.js';

/** POST /auth/login  body: { password } */
export async function login(ctx, globalCfg) {
  const t0 = Date.now();
  const ip = getClientIp(ctx.request);

  // ---- 防暴力破解闸门 ----
  const gate = await checkLoginAllowed(ctx, ip);
  if (!gate.allowed) {
    await constantDelay(t0);
    return fail(
      ERROR_CODES.RATE_LIMITED,
      `尝试次数过多，请在 ${gate.retryAfter} 秒后重试`,
      429
    );
  }

  let body;
  try {
    body = await ctx.request.json();
  } catch {
    await constantDelay(t0);
    return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400);
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password) {
    await constantDelay(t0);
    return fail(ERROR_CODES.BAD_REQUEST, '密码不能为空', 400);
  }

  const g = globalCfg || (await getGlobal(ctx));

  // ---- 首次初始化：若尚未设置密码，则用 env.ADMIN_PASSWORD 引导 ----
  if (!g?.passwordHash) {
    const bootstrapPwd = ctx.env?.ADMIN_PASSWORD;
    if (!bootstrapPwd) {
      await constantDelay(t0);
      return fail(
        ERROR_CODES.INTERNAL,
        '尚未初始化管理员密码，请先设置 ADMIN_PASSWORD 环境变量（wrangler secret put ADMIN_PASSWORD）',
        500
      );
    }
    if (password !== bootstrapPwd) {
      await recordLoginFailure(ctx, ip);
      await constantDelay(t0);
      return fail(ERROR_CODES.UNAUTHORIZED, '密码错误', 401);
    }
    // 引导成功：把初始密码固化为哈希写入 KV，后续不再依赖环境变量
    const { hash, salt } = await hashPassword(password);
    g.passwordHash = hash;
    g.passwordSalt = salt;
    await putGlobal(ctx, g);
  } else {
    const valid = await verifyPassword(password, g.passwordHash, g.passwordSalt);
    if (!valid) {
      await recordLoginFailure(ctx, ip);
      await constantDelay(t0);
      return fail(ERROR_CODES.UNAUTHORIZED, '密码错误', 401);
    }
  }

  await recordLoginSuccess(ctx, ip);

  // 密码已验证通过，但仍可能签不出 token：resolveSecret 在无 JWT_SECRET
  // 且 passwordHash 缺失（或 KV 读取异常）时返回空串，signToken 会据此抛错。
  // 此时必须返回 5xx 而不是发出一个用空密钥签名的、人人可伪造的凭证。
  const secret = await resolveSecret(ctx);
  const ttl = g?.tokenTtl || 7200;
  let token;
  try {
    token = await signToken({ sub: 'admin', iat: Math.floor(Date.now() / 1000) }, secret, ttl);
  } catch {
    await constantDelay(t0);
    return fail(
      ERROR_CODES.INTERNAL,
      '无法签发登录凭证：签名密钥不可用，请配置 JWT_SECRET 环境变量后重试',
      500
    );
  }

  await constantDelay(t0);

  const secure = (ctx.request.url || '').startsWith('https://');

  return new Response(JSON.stringify({ ok: true, data: { authed: true, ttl } }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': buildAuthCookie(token, ttl, secure),
      'cache-control': 'no-store',
    },
  });
}

/** POST /auth/logout */
export async function logout(ctx) {
  const secure = (ctx.request.url || '').startsWith('https://');
  return new Response(JSON.stringify({ ok: true, data: { loggedOut: true } }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': buildClearAuthCookie(secure),
      'cache-control': 'no-store',
    },
  });
}

/** POST /auth/password  body: { oldPassword, newPassword } */
export async function changePassword(ctx, globalCfg) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400);
  }

  const oldPwd = String(body?.oldPassword || '');
  const newPwd = String(body?.newPassword || '');

  if (newPwd.length < 8) {
    return fail(ERROR_CODES.BAD_REQUEST, '新密码长度至少 8 位', 400);
  }
  if (newPwd.length > 256) {
    return fail(ERROR_CODES.BAD_REQUEST, '新密码过长', 400);
  }

  const g = globalCfg || (await getGlobal(ctx));
  if (g?.passwordHash) {
    const valid = await verifyPassword(oldPwd, g.passwordHash, g.passwordSalt);
    if (!valid) {
      return fail(ERROR_CODES.UNAUTHORIZED, '原密码错误', 401);
    }
  }

  const { hash, salt } = await hashPassword(newPwd);
  g.passwordHash = hash;
  g.passwordSalt = salt;
  await putGlobal(ctx, g);

  // 改密后签发新 token，避免旧会话失效导致用户被登出。
  // 注意：此时密码「已经改成功并落库」，因此签发失败不能回退为 5xx —— 那会让用户
  // 误以为改密没生效而重试旧密码。正确做法是照常返回成功，但清掉 Cookie 让其重新登录。
  // （派生密钥场景下 passwordHash 已变更，旧 token 本来也已失效。）
  const secret = await resolveSecret(ctx);
  const ttl = g?.tokenTtl || 7200;
  let token = null;
  try {
    token = await signToken(
      { sub: 'admin', iat: Math.floor(Date.now() / 1000) },
      secret,
      ttl
    );
  } catch {
    token = null;
  }

  const secure = (ctx.request.url || '').startsWith('https://');
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'set-cookie': token ? buildAuthCookie(token, ttl, secure) : buildClearAuthCookie(secure),
  };

  return new Response(
    JSON.stringify({ ok: true, data: { changed: true, reloginRequired: !token } }),
    { status: 200, headers }
  );
}
