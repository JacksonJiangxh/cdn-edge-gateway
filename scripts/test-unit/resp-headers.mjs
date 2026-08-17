/**
 * scripts/test-unit/resp-headers.mjs —— 响应头精简与跨平台头 单测
 * 覆盖：
 *  - applyHeaderOps 的 set 分支「空值不写」（消除 Cloudflare-CDN-Cache-Control 空头）
 *  - 全站默认 respHeaders.set 不再包含 X-Site-Id（防站点域名泄露）
 *  - 全站默认 respHeaders.strip 已兜底 S3 兼容 / 跨源站通用调试头
 *  - 仓库预设（CNB/GitHub）strip 已覆盖仓库源站专属头
 */
import assert from 'node:assert';
import { applyHeaderOps } from '../../src/proxy/headers.js';
import { DEFAULT_GLOBAL_RULES } from '../../src/config/defaults.js';
import { buildRepoPresetRules } from '../../src/config/repoPresets.js';
import { test, testA } from './_testkit.mjs';
import { makeCtx } from './_testkit.mjs';

/** 构造一个带 caps 的 ctx 桩。platform 默认 'eo'（非 CF，模拟本地 dev / EO / ESA） */
function ctxWith(platform = 'eo', extra = {}) {
  return makeCtx({
    url: 'https://img.example.com/x.png',
    extra: {
      caps: { platform },
      ...extra,
    },
  });
}

/** 把全站默认 respHeaders 转成 applyHeaderOps 需要的 ops 形态 */
function globalRespOps() {
  const def = DEFAULT_GLOBAL_RULES.respHeaders || {};
  return { set: { ...(def.set || {}) }, strip: [...(def.strip || [])] };
}

testA('applyHeaderOps: 非 CF 平台 Cloudflare-CDN-Cache-Control 展开空值不写入', (a) => {
  const ctx = ctxWith('eo'); // 非 CF
  const headers = new Headers();
  // 直接模拟全站默认 set 里的 Cloudflare 头（__cf_cdn_cache_control__ 非 CF 展开为空）
  applyHeaderOps(headers, { set: { 'Cloudflare-CDN-Cache-Control': '' } }, ctx, null);
  a.equal(headers.has('Cloudflare-CDN-Cache-Control'), false, '非 CF 不应写出 Cloudflare 空头');
});

testA('applyHeaderOps: CF 平台正常写入 Cloudflare 头、且值非空前仍写入', (a) => {
  const ctx = ctxWith('cf');
  const headers = new Headers();
  // CF 平台该占位符展开为非空同值，此处直接给非空值验证「非空不误删」
  applyHeaderOps(headers, { set: { 'Cloudflare-CDN-Cache-Control': 'public, max-age=86400' } }, ctx, null);
  a.equal(headers.get('Cloudflare-CDN-Cache-Control'), 'public, max-age=86400', 'CF 非空值应正常写入');
});

testA('applyHeaderOps: 空值跳过不影响正常头写入', (a) => {
  const ctx = ctxWith('eo');
  const headers = new Headers();
  applyHeaderOps(headers, {
    set: {
      'Cache-Control': 'public, max-age=3600', // 正常非空
      'Cloudflare-CDN-Cache-Control': '',        // 空头应跳过
    },
  }, ctx, null);
  a.equal(headers.get('Cache-Control'), 'public, max-age=3600', '正常头仍写入');
  a.equal(headers.has('Cloudflare-CDN-Cache-Control'), false, '空头被跳过');
});

testA('全站默认 respHeaders.set 已移除 X-Site-Id（防站点域名泄露）', (a) => {
  const set = (DEFAULT_GLOBAL_RULES.respHeaders && DEFAULT_GLOBAL_RULES.respHeaders.set) || {};
  a.equal(set['X-Site-Id'], undefined, 'X-Site-Id 不应出现在全站默认 set 中');
});

testA('全站默认 strip 兜底 S3 兼容与跨源站调试头', (a) => {
  const strip = DEFAULT_GLOBAL_RULES.respHeaders.strip || [];
  const flat = strip.map((s) => (typeof s === 'string' ? s.toLowerCase() : `${s.type}:${s.value}`));
  const has = (type, value) => flat.some((x) => x === `${type}:${value}`);
  // S3 兼容
  a.ok(has('exact', 'opc-request-id'), '应剥离 opc-request-id');
  a.ok(has('exact', 'x-amz-request-id'), '应剥离 x-amz-request-id');
  a.ok(has('exact', 'x-amz-version-id'), '应剥离 x-amz-version-id');
  a.ok(has('exact', 'x-amz-server-side-encryption'), '应剥离 x-amz-server-side-encryption');
  a.ok(has('exact', 'x-api-id'), '应剥离 x-api-id');
  // 跨源站通用平台/调试头
  a.ok(has('exact', 'x-request-id'), '应剥离 x-request-id');
  // 注：x-trace-id / x-cache 不再由全站 strip 处理——Headers API 大小写不敏感，
  // 上游自带的这两个头会被全站默认 set 的 X-Trace-Id / X-Cache 同名覆盖，无需 strip。
  a.ok(has('exact', 'content-md5'), '应剥离 content-md5');
  a.ok(has('prefix', 'x-fastly-'), '应前缀剥离 x-fastly-');
});

testA('仓库预设(CNB) strip 覆盖 CNB 源站专属头', (a) => {
  const rules = buildRepoPresetRules('cnb', { repoUser: 'owner', repoName: 'repo', repoPrivate: false });
  const respRule = rules.find((r) => r.id.endsWith('-resp'));
  assert.ok(respRule, '应生成 resp 剥离规则');
  const strip = respRule.action.respHeaders.strip.map((s) =>
    typeof s === 'string' ? s.toLowerCase() : `${s.type}:${s.value}`
  );
  // 兼容纯字符串（exact 语法）与 {type,value} 两种形式
  const has = (v) => strip.some((x) => x === v.toLowerCase() || x === `exact:${v.toLowerCase()}` || x === `prefix:${v.toLowerCase()}`);
  a.ok(has('access-control-allow-credentials'), 'CNB 应剥离 access-control-allow-credentials');
  a.ok(has('access-control-expose-headers'), 'CNB 应剥离 access-control-expose-headers');
  a.ok(has('referrer-policy'), 'CNB 应剥离 referrer-policy');
  a.ok(has('traceparent'), 'CNB 应剥离 traceparent');
  a.ok(has('x-repo-commit'), 'CNB 应剥离 x-repo-commit');
  a.ok(has('x-ratelimit-'), 'CNB 应前缀剥离 x-ratelimit-');
});

testA('仓库预设(GitHub) strip 覆盖 GitHub 源站专属头', (a) => {
  const rules = buildRepoPresetRules('github', { repoUser: 'owner', repoName: 'repo', repoPrivate: false });
  const respRule = rules.find((r) => r.id.endsWith('-resp'));
  assert.ok(respRule, '应生成 resp 剥离规则');
  const strip = respRule.action.respHeaders.strip.map((s) =>
    typeof s === 'string' ? s.toLowerCase() : `${s.type}:${s.value}`
  );
  const has = (v) => strip.some((x) => x === v.toLowerCase() || x === `exact:${v.toLowerCase()}` || x === `prefix:${v.toLowerCase()}`);
  a.ok(has('x-xss-protection'), 'GitHub 应剥离 x-xss-protection');
  a.ok(has('strict-transport-security'), 'GitHub 应剥离 strict-transport-security');
  a.ok(has('x-github-request-id'), 'GitHub 应剥离 x-github-request-id');
  a.ok(has('x-github-'), 'GitHub 应前缀剥离 x-github-');
  a.ok(has('x-fastly-request-id'), 'GitHub 应剥离 x-fastly-request-id');
  a.ok(has('x-timer'), 'GitHub 应剥离 x-timer');
  a.ok(has('source-age'), 'GitHub 应剥离 source-age');
  a.ok(has('x-cache-hits'), 'GitHub 应剥离 x-cache-hits');
});

testA('全站默认与仓库预设 strip 经 applyHeaderOps 实际剔除上游头', (a) => {
  const ctx = ctxWith('eo');
  const headers = new Headers();
  // 模拟一个真实 upstream 响应（来自你贴的三个源站示例）
  headers.set('content-type', 'image/webp');
  headers.set('content-length', '154512');
  headers.set('etag', '"abc"');
  headers.set('opc-request-id', 'yny-1:xxx');
  headers.set('x-amz-request-id', 'yny-1:yyy');
  headers.set('x-fastly-request-id', '7871c0e4');
  headers.set('x-ratelimit-limit', '50');
  headers.set('traceparent', '00-xxx');
  headers.set('x-cache', 'HIT');
  headers.set('source-age', '0');
  // 应用全站默认 + CNB 预设两层 strip
  const ops = globalRespOps();
  applyHeaderOps(headers, ops, ctx, null);
  applyHeaderOps(headers, {
    strip: [
      'x-ratelimit-', 'traceparent', 'x-fastly-request-id', 'source-age', 'x-cache',
    ].map((v) => (v.includes('-') && /-$/.test(v) ? { type: 'prefix', value: v } : v)),
  }, ctx, null);
  a.equal(headers.has('opc-request-id'), false, 'opc-request-id 应被剔除');
  a.equal(headers.has('x-amz-request-id'), false, 'x-amz-request-id 应被剔除');
  a.equal(headers.has('x-fastly-request-id'), false, 'x-fastly-request-id 应被剔除');
  a.equal(headers.has('x-ratelimit-limit'), false, 'x-ratelimit-limit 应被剔除');
  a.equal(headers.has('traceparent'), false, 'traceparent 应被剔除');
  a.equal(headers.has('x-cache'), false, 'x-cache 应被剔除');
  a.equal(headers.has('source-age'), false, 'source-age 应被剔除');
  // 内容头应保留
  a.equal(headers.get('content-type'), 'image/webp', '内容头 content-type 应保留');
  a.equal(headers.get('etag'), '"abc"', '内容头 etag 应保留');
});
