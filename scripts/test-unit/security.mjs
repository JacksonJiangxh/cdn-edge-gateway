/**
 * scripts/test-unit/security.mjs —— 鉴权 / 令牌校验 单测
 * 覆盖原 test-unit-backend.mjs [security/auth] 段：src/security/auth.js 的
 * hashPassword/verifyPassword/verifyToken，补充破坏性用例。
 * （CSRF / 跨站 Origin 校验由 e2e 异常路径直接覆盖，见 e2e-test.mjs）
 */
import assert from 'node:assert';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../../src/security/auth.js';
import { test, testA } from './_testkit.mjs';

testA('hashPassword + verifyPassword: 正确密码通过、错误拒绝', async (a) => {
  const u = await hashPassword('secret', 's1');
  a.equal(typeof u.hash === 'string' && u.hash.length > 0, true, '产出 hash');
  a.equal(await verifyPassword('secret', u.hash, u.salt), true, '正确密码通过');
  a.equal(await verifyPassword('wrong', u.hash, u.salt), false, '错误密码拒绝');
});

testA('hashPassword: 相同明文+盐产生稳定哈希', async (a) => {
  const h1 = await hashPassword('x', 'salt');
  const h2 = await hashPassword('x', 'salt');
  a.equal(h1.hash, h2.hash, '确定性哈希');
});

testA('verifyPassword: 缺字段防异常', async (a) => {
  a.equal(await verifyPassword('x', null, 's'), false, 'null hash 不抛错');
  a.equal(await verifyPassword('x', undefined, 's'), false, 'undefined hash 不抛错');
});

testA('signToken + verifyToken: 合法 token 返回 payload，错误 secret 失败', async (a) => {
  const secret = 'test-secret';
  const jwt = await signToken({ sub: 'admin', role: 'admin' }, secret, 7200);
  a.equal(typeof jwt === 'string' && jwt.split('.').length === 3, true, '签发 JWT 字符串');
  const payload = await verifyToken(jwt, secret);
  a.notEqual(payload, null, '合法 secret 返回 payload');
  a.equal(payload.sub, 'admin', 'payload 内容正确');
  a.equal(await verifyToken(jwt, 'wrong-secret'), null, '错误 secret 返回 null');
});

testA('verifyToken: 缺字段/篡改防异常', async (a) => {
  a.equal(await verifyToken(null, 'x'), null, 'null token 不抛错');
  a.equal(await verifyToken('', 'x'), null, '空 token 不抛错');
  a.equal(await verifyToken('a.b.c', 'x'), null, '格式对但签名错返回 null');
});
