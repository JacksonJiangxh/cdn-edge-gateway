/**
 * 源站管理 API handlers。
 *
 * 「单一源站」(kind='single') 与「源站池」(kind='pool') 是同一实体的两种形态，
 * 同表存储、同一引用方式（站点/规则的 poolId），统一在「源站」标签页纵览。
 */

import { ok, fail } from '../../utils/response.js';
import { ERROR_CODES } from '../../contracts.js';
import {
  listPools,
  getPool,
  putPool,
  deletePool,
  listAllSites,
  getGlobalRules,
} from '../../config/store.js';
import { validatePool } from '../../config/schema.js';
import { isObj } from '../../config/schema.js';

/**
 * 汇总所有源站（single + pool）的被引用情况。
 * 引用来源三类：站点默认上游、站点规则 action.poolId、全站通用规则 action.poolId。
 *
 * @returns {Promise<{map:Map<string,Array<{type:string,host:string,label:string,detail:string}>>, truncated:boolean}>}
 */
async function collectRefs(ctx) {
  /** @type {Map<string, Array<{type:string,host:string,label:string,detail:string}>>} */
  const map = new Map();
  const add = (poolId, ref) => {
    if (!poolId) return;
    const arr = map.get(poolId);
    if (arr) arr.push(ref);
    else map.set(poolId, [ref]);
  };

  const { sites, truncated } = await listAllSites(ctx);
  /** 尚未迁移的历史站点（仍带内联 origins），用于前端提示 */
  const legacySites = [];
  for (const s of sites) {
    if (s.poolId) {
      add(s.poolId, {
        type: 'site',
        host: s.host,
        label: s.host,
        detail: '站点默认源站',
      });
    } else if (Array.isArray(s.origins) && s.origins.length > 0) {
      legacySites.push(s.host);
    }
    for (const r of s.rules || []) {
      const pid = r?.action?.poolId;
      if (!pid) continue;
      add(pid, {
        type: 'rule',
        host: s.host,
        label: s.host,
        detail: `规则「${r.name || r.id}」覆盖回源`,
      });
    }
  }

  try {
    const globalRules = await getGlobalRules(ctx);
    if (Array.isArray(globalRules)) {
      for (const r of globalRules) {
        const pid = r?.action?.poolId;
        if (!pid) continue;
        add(pid, {
          type: 'globalRule',
          host: '',
          label: '全站通用规则',
          detail: `规则「${r.name || r.id}」覆盖回源`,
        });
      }
    }
  } catch {
    // 读取失败按「引用信息不完整」处理，由 truncated 语义提示前端谨慎删除
  }

  return { map, truncated, legacySites };
}

/**
 * GET /pools
 * 返回全部源站（kind=single 单一源站 + kind=pool 源站池），并附带引用统计。
 * 前端「源站」标签页据此纵览全局：谁在用、被几处用、能否安全删除。
 */
export async function list(ctx) {
  const pools = await listPools(ctx);
  const { map, truncated, legacySites } = await collectRefs(ctx);

  const enriched = pools.map((p) => {
    const refs = map.get(p.id) || [];
    return {
      ...p,
      kind: p.kind || (Array.isArray(p.origins) && p.origins.length === 1 ? 'single' : 'pool'),
      refs,
      refCount: refs.length,
      // 无引用且引用信息完整时才允许安全删除
      deletable: refs.length === 0 && !truncated,
    };
  });

  return ok({ pools: enriched, refsTruncated: truncated, legacySites });
}

/** GET /pools/:id/refs —— 单个源站的引用明细 */
export async function refs(ctx, id) {
  const pool = await getPool(ctx, id);
  if (!pool) return fail(ERROR_CODES.NOT_FOUND, `源站不存在: ${id}`, 404);
  const { map, truncated } = await collectRefs(ctx);
  const list_ = map.get(id) || [];
  return ok({ id, refs: list_, refCount: list_.length, truncated });
}

/** GET /pools/:id */
export async function get(ctx, id) {
  const pool = await getPool(ctx, id);
  if (!pool) return fail(ERROR_CODES.NOT_FOUND, `源站池不存在: ${id}`, 404);
  return ok(pool);
}

/**
 * 写入池配置的共享逻辑。
 * @param {object} body 请求体
 * @param {string|null} urlId URL 中的 id（更新场景）；为空表示新建，由系统自动生成 id
 */
async function savePool(ctx, body, urlId) {
  if (urlId) body.id = urlId; // 更新场景以 URL 中的机器 id 为准（用户不可改）
  const res = validatePool(body, ctx.caps);
  if (!res.ok) {
    return fail(ERROR_CODES.BAD_REQUEST, '配置校验失败: ' + res.errors.join('; '), 400);
  }
  res.value.updatedAt = Date.now();
  await putPool(ctx, res.value);
  return ok(res.value);
}

/** POST /pools —— 新建（机器 id 由系统自动生成，用户无需也不应传 id） */
export async function create(ctx) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400);
  }
  if (!isObj(body)) return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法对象', 400);
  return savePool(ctx, body, null);
}

/** PUT /pools/:id */
export async function put(ctx, id) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400);
  }
  if (!isObj(body)) return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法对象', 400);
  return savePool(ctx, body, id);
}

/** DELETE /pools/:id —— 需检查是否仍被站点 / 规则引用 */
export async function remove(ctx, id) {
  const pool = await getPool(ctx, id);
  if (!pool) return fail(ERROR_CODES.NOT_FOUND, `源站不存在: ${id}`, 404);

  const kindName = (pool.kind || 'pool') === 'single' ? '单一源站' : '源站池';

  // 引用检查：防止删除后站点/全局规则指向空上游导致全站 502
  const { map, truncated } = await collectRefs(ctx);
  const refs = map.get(id) || [];

  // 站点未扫全时不能判定「无引用」：漏掉的站点可能正引用它，
  // 一旦误删会导致这些站点全站 502。此处保守拒绝，要求人工确认。
  if (refs.length === 0 && truncated) {
    return fail(
      ERROR_CODES.CONFLICT,
      '站点数量过多，无法完成引用检查，为避免误删已阻止本次操作',
      409
    );
  }

  if (refs.length > 0) {
    const who = [...new Set(refs.map((r) => `${r.label}（${r.detail}）`))];
    return fail(
      ERROR_CODES.CONFLICT,
      `该${kindName}仍被以下对象引用，无法删除：${who.join('、')}`,
      409
    );
  }

  await deletePool(ctx, id);
  return ok({ deleted: id });
}
