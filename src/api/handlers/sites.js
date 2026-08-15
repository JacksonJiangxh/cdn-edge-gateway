/**
 * 站点管理 API handlers
 */

import { ok, fail } from '../../utils/response.js';
import { ERROR_CODES } from '../../contracts.js';
import {
  listSites,
  getSite,
  putSite,
  deleteSite,
  listPools,
  putPool,
} from '../../config/store.js';
import { validateSite, validatePool, normRule } from '../../config/schema.js';
import { listTemplates, TEMPLATE_PARAM_META } from '../../config/templates.js';
import { normalizeStage } from '../../config/stages.js';

/**
 * 「单一源站」联动创建。
 *
 * 站点侧不再存内联源站：当请求体用 `origins`（用户在新建站点里直接填了源站地址）
 * 而没给 poolId 时，把它落成一条 kind='single' 的源站记录，并回填 poolId。
 *
 * 幂等：先按「地址指纹」在既有 single 源站里找同构的复用，避免每存一次站点
 * 就多出一条重复源站。指纹取 engine/scheme/addr/port/pathPrefix 五元组。
 *
 * @param {object} ctx
 * @param {object} body 站点请求体（会被就地改写 poolId 并删除 origins 等旧字段）
 * @returns {Promise<{ok:true, created?:object}|{ok:false, error:string}>}
 */
async function ensureSingleOrigin(ctx, body) {
  const origins = Array.isArray(body.origins) ? body.origins : [];

  // 已显式指定上游 → 清掉遗留内联字段即可
  if (body.poolId) {
    delete body.origins;
    delete body.originStrategy;
    delete body.originFailover;
    return { ok: true };
  }

  if (origins.length === 0) return { ok: true };

  if (origins.length > 1) {
    return {
      ok: false,
      error: '站点只能绑定一个源站；需要多个源站请先在「源站」页新建源站池，再在此处选择',
    };
  }

  const fp = (o) => [
    o?.engine || 'fetch',
    o?.scheme || 'https',
    String(o?.addr || '').toLowerCase(),
    String(o?.port ?? ''),
    o?.pathPrefix || '',
  ].join('|');

  // 先按 schema 把入参规范化（补 engine/scheme/port/pathPrefix 默认值），
  // 否则入参"未填 port"与已落库"port 被补成 443"的指纹不一致，导致同地址查重失败、重复建源站。
  const addr = String(origins[0]?.addr || '').toLowerCase();
  const res = validatePool(
    {
      name: addr || body.host,
      kind: 'single',
      strategy: 'chain',
      origins,
      failover: body.originFailover,
      createdBy: body.host || '',
    },
    ctx.caps
  );
  if (!res.ok) return { ok: false, error: '源站校验失败: ' + res.errors.join('; ') };

  const want = fp(res.value.origins[0]);

  // 复用已存在的同构单一源站（基于规范化后的指纹比对）
  try {
    const pools = await listPools(ctx);
    const hit = pools.find(
      (p) => (p.kind || (p.origins?.length === 1 ? 'single' : 'pool')) === 'single'
        && Array.isArray(p.origins)
        && p.origins.length === 1
        && fp(p.origins[0]) === want
    );
    if (hit) {
      body.poolId = hit.id;
      delete body.origins;
      delete body.originStrategy;
      delete body.originFailover;
      return { ok: true };
    }
  } catch {
    // 列举失败不阻塞创建，退化为「总是新建一条」
  }

  res.value.updatedAt = Date.now();
  await putPool(ctx, res.value);

  body.poolId = res.value.id;
  delete body.origins;
  delete body.originStrategy;
  delete body.originFailover;
  return { ok: true, created: res.value };
}

/**
 * GET /sites/templates
 * 返回新建站点可选的场景模板与各自的建议参数，供前端渲染选择器。
 * 同时返回参数元信息（名称/说明/取值范围），前端据此把参数渲染成
 * 带解释的可编辑输入框——让用户看见并按需修改，而不是被默认值悄悄决定。
 */
export async function templates() {
  return ok({ templates: listTemplates(), paramMeta: TEMPLATE_PARAM_META });
}

/** GET /sites?offset=0&limit=50 */
export async function list(ctx) {
  const offset = Number(ctx.url.searchParams.get('offset')) || 0;
  const limitRaw = ctx.url.searchParams.get('limit');
  const { sites, total, truncated } = await listSites(ctx, {
    offset,
    limit: limitRaw ? Number(limitRaw) : undefined,
  });
  // 返回完整站点对象（含 rules / cacheGen 等），前端需要它们用于编辑；
  // 键名用 `sites` 以与前端 APP_DATA.sites = data.sites 对齐。
  // 站点数量级不大，规则内联返回不会造成响应体膨胀。
  return ok({ sites, total, offset, truncated });
}

/** GET /sites/:host */
export async function get(ctx, host) {
  const site = await getSite(ctx, host.toLowerCase(), { exact: true });
  if (!site) return fail(ERROR_CODES.NOT_FOUND, `站点不存在: ${host}`, 404);
  return ok(site);
}

/** PUT /sites/:host */
export async function put(ctx, host) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400);
  }

  // 以 URL 中的 host 为准，防止 body 与路径不一致造成写错 key
  body.host = host.toLowerCase();

  // 注意：新建站点时「场景模板」不再在此处偷偷套用。模板只是「参数预设 + 规则生成器」，
  // 其产物的标准 Rule[] 由调用方通过流量序列的规则接口（PUT /sites/:host/rules）提交，
  // 与用户在「流量序列 → 规则」里手动添加完全等价。这里只负责落站点基础信息。

  // 「单一源站」联动：直接填写的源站地址 → 自动落成一条 kind='single' 源站并回填 poolId
  const prov = await ensureSingleOrigin(ctx, body);
  if (!prov.ok) return fail(ERROR_CODES.BAD_REQUEST, prov.error, 400);

  const res = validateSite(body);
  if (!res.ok) {
    return fail(ERROR_CODES.BAD_REQUEST, '配置校验失败: ' + res.errors.join('; '), 400);
  }

  res.value.updatedAt = Date.now();
  await putSite(ctx, res.value);
  // createdOrigin 让前端可以提示「已自动为你创建源站 xxx」并刷新源站列表
  return ok({ ...res.value, createdOrigin: prov.created || null });
}

/** DELETE /sites/:host */
export async function remove(ctx, host) {
  const h = host.toLowerCase();
  const existing = await getSite(ctx, h, { exact: true });
  if (!existing) return fail(ERROR_CODES.NOT_FOUND, `站点不存在: ${host}`, 404);
  await deleteSite(ctx, h);
  return ok({ deleted: h });
}

// ---------------------------------------------------------------------------
// 片段 API：各段只提交自己那段字段，后端浅合并后储存（Nginx include 思想，绝不越界）。
// 这样前端每个模块（基础/规则/安全）都能独立保存，互不覆盖其它段。
// ---------------------------------------------------------------------------

// 基础 & 源站段：host/enabled/ipv6/poolId/defaultHostHeader
// 站点级内联源站已废弃：若请求体仍带 origins，会被 ensureSingleOrigin 转成 single 源站后回填 poolId。
const BASICS_KEYS = ['host', 'enabled', 'ipv6Support', 'poolId', 'defaultHostHeader'];
export async function saveBasics(ctx, host) {
  const h = host.toLowerCase();
  let body;
  try { body = await ctx.request.json(); } catch { return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400); }
  if (!body || typeof body !== 'object') return fail(ERROR_CODES.BAD_REQUEST, '请求体必须是 JSON 对象', 400);
  const existing = await getSite(ctx, h, { exact: true });
  if (!existing) return fail(ERROR_CODES.NOT_FOUND, `站点不存在: ${host}`, 404);

  body.host = h;
  const prov = await ensureSingleOrigin(ctx, body);
  if (!prov.ok) return fail(ERROR_CODES.BAD_REQUEST, prov.error, 400);

  const merged = { ...existing };
  for (const k of BASICS_KEYS) {
    if (k in body) merged[k] = body[k];
  }
  merged.host = h;
  // 主键不可改
  merged.host = h;
  merged.cacheGen = existing.cacheGen || 0;
  merged.updatedAt = Date.now();

  const vres = validateSite(merged);
  if (!vres.ok) return fail(ERROR_CODES.BAD_REQUEST, '配置校验失败: ' + vres.errors.join('; '), 400);

  await putSite(ctx, vres.value);
  return ok({ host: h, basics: 'ok', poolId: vres.value.poolId, createdOrigin: prov.created || null });
}

// 路由规则段：仅 rules
export async function saveRules(ctx, host) {
  const h = host.toLowerCase();
  let body;
  try { body = await ctx.request.json(); } catch { return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400); }
  if (!body || typeof body !== 'object') return fail(ERROR_CODES.BAD_REQUEST, '请求体必须是 JSON 对象', 400);
  if (!('rules' in body) || !Array.isArray(body.rules)) return fail(ERROR_CODES.BAD_REQUEST, 'rules 必须是数组', 400);
  const existing = await getSite(ctx, h, { exact: true });
  if (!existing) return fail(ERROR_CODES.NOT_FOUND, `站点不存在: ${host}`, 404);
  // 阶段索引（rule.stage）只来自「前端受限抽屉入口」，绝不反推。
  // 下拉框选项受 allowedOps 约束，用户在「选择新建什么操作」那一刻阶段即唯一确定，
  // 落库必带 r.stage。反推（stageForAction 按 STAGE_ORDER 顺序猜）不可控（曾致 origin 抢 respHeaders
  // 越界），已彻底移除。
  // 兼容层：r.stage 经 normalizeStage 归一——老数据里的旧带圈数字（'⑪' 等）自动转成英文名（'cache'），
  // 不会因 key 改名而丢失阶段；缺 r.stage 的脏数据落库为 null —— 流量序列不渲染，但进任意
  // 抽屉保存一次即自愈（落库必带 stage），比「猜一个错误阶段」更可控。
  const normedRules = (body.rules || []).map((r, i) => {
    const v = normRule(r, i);
    if (!v.value) return r;
    const stage = normalizeStage(r.stage) || null;
    return { ...v.value, stage };
  });
  const merged = { ...existing, rules: normedRules, cacheGen: existing.cacheGen || 0, updatedAt: Date.now() };
  await putSite(ctx, merged);
  return ok({ host: h, rules: 'ok' });
}

// 安全防护段：仅 security
export async function saveSecurity(ctx, host) {
  const h = host.toLowerCase();
  let body;
  try { body = await ctx.request.json(); } catch { return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400); }
  if (!body || typeof body !== 'object') return fail(ERROR_CODES.BAD_REQUEST, '请求体必须是 JSON 对象', 400);
  if (!('security' in body) || typeof body.security !== 'object') return fail(ERROR_CODES.BAD_REQUEST, 'security 必须是对象', 400);
  const existing = await getSite(ctx, h, { exact: true });
  if (!existing) return fail(ERROR_CODES.NOT_FOUND, `站点不存在: ${host}`, 404);
  const merged = { ...existing, security: body.security, cacheGen: existing.cacheGen || 0, updatedAt: Date.now() };
  await putSite(ctx, merged);
  return ok({ host: h, security: 'ok' });
}
