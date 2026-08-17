/**
 * 负载均衡策略
 * ----------------------------------------------------------------------------
 * 从源站池中挑选一个可用源站，支持 3 种策略，并内置「统一健康过滤 + fail-open
 * 智能放行 + 软恢复权重」横切逻辑。
 *
 * 两种层次（务必分清）：
 *   - 策略层（本文件 strategy）：决定「每一次请求首选哪个源站」。
 *       · chain    ：严格串行，按 order 升序（1 第一优先）取第一个可用源站，无权重。
 *       · weighted ：平滑加权轮询（SWRR），按 weight 选；未填 weight 时按 order 派生。
 *       · iphash   ：一致性哈希环，按客户端 IP 绑定源站，命中坏源站环内顺时针回退。
 *   - 故障转移层（failover.js）：某源站回源失败 → 排除它 → 再问策略层要一个，
 *     对所有策略生效。chain 的「1→2→3→4 串行回退」正是「策略取最小 order + 故障
 *     转移排除已试」共同实现，本身与权重无关。
 *
 * 「可用」的定义（统一过滤，所有策略共享）：
 *   1. enabled !== false
 *   2. 不在 excludeIds 中（本次请求已经试过并失败的）
 *   3. 未熔断（由 failover 预先算好并通过 excludeIds 传入，含 KV 熔断 + 内存冷却）
 *   4. 软恢复试水期：源站仍可被选中，但权重 ×coeff（低权重试水）
 *
 * fail-open 智能放行：当统一过滤后候选集为空（全员冷却/熔断/已试），不再盲目按
 * 原策略取 order 0，而是优先挑「最近成功时间最新」或「冷却剩余最短」的源站，提高
 * 豁免一击命中率；全部无记录时退回 order 升序第一个（与历史行为一致）。
 *
 * 本函数保持同步（契约要求）：冷却 / 软恢复 / 最近成功 / 软亲和全部走 isolate 内存
 * Map（O(1)），SWRR 为 O(N)、一致性哈希 O(log N)，预算为纯算术，零 KV、零阻塞。
 */

import {
  isPenalized,
  penaltyRemaining,
  lastOkTs,
  softRecoverCoeff,
} from './circuit.js';

/** 一致性哈希环虚拟节点数（每源站 VNODES 个落点，增删源站键迁移最小） */
const VNODES = 128;

/** 软亲和缓存 TTL（毫秒）：环内回退结果按 IP 缓存，避免同 IP 每请求重复走回退路径 */
const AFFINITY_TTL = 60000;

/** 源站池引用 → 一致性哈希环 的缓存（源站列表变化即重建） */
const _ringCache = new Map();

/**
 * roundrobin / weighted 的模块级 SWRR 状态（平滑加权轮询）。
 * key = `${poolId}:${originId}` → current_weight。
 * 注意：isolate 级，多 isolate 宏观叠加仍均匀；回收归零可接受。
 */
const _swrrWeight = new Map();

/**
 * fail-open 智能放行的本地缓存（IP → 备用源站 id，TTL）。
 */
const _affinityMem = new Map();

/**
 * 从源站池中选择一个源站。
 *
 * @param {Object} pool 源站池
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string[]} [excludeIds] 需要排除的源站 id（已失败的 + 已熔断/冷却的）
 * @returns {Object|null} 选中的源站，无可用源站时（含智能放行后仍无）返回 null
 */
export function selectOrigin(pool, ctx, excludeIds) {
  // 防御：测试 / 直接调用场景 ctx.debug 可能未初始化，failopen 分支会 push notes
  if (!ctx.debug) ctx.debug = {};
  if (!Array.isArray(ctx.debug.notes)) ctx.debug.notes = [];

  const exclude = new Set(excludeIds || []);
  const allEnabled = (pool?.origins || []).filter((o) => o && o.enabled !== false);

  // 统一过滤：enabled + exclude（已试 + 熔断 + 冷却）
  const candidates = allEnabled.filter((o) => !exclude.has(o.id) && !isPenalized(ctx, pool.id, o.id));

  // 候选集非空 → 正常策略选源
  if (candidates.length > 0) {
    return pickByStrategy(pool, ctx, candidates);
  }

  // 候选集为空：全员冷却/熔断/已试。走 fail-open 智能放行，挑「最值得一试」的源站。
  const smart = smartRelease(pool, allEnabled, exclude);
  if (smart) {
    if (!Array.isArray(ctx.debug.notes)) ctx.debug.notes = [];
    ctx.debug.notes.push(`failopen:${smart.id}`);
    return smart;
  }

  return null;
}

/**
 * 按策略分发到具体 pick 函数。
 * @param {Object} pool 源站池
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object[]} candidates 候选源站
 * @returns {Object} 选中的源站
 */
function pickByStrategy(pool, ctx, candidates) {
  switch (pool.strategy) {
    case 'weighted':
      return pickSwrr(pool, candidates, weightOf);
    case 'iphash':
      return pickIpHash(pool, ctx, candidates);
    case 'chain':
    default:
      return pickStrictOrder(candidates);
  }
}

/**
 * 计算源站生效权重（软恢复试水期会 ×coeff）。
 *   - 显式配置了 weight(>0) → 用 weight
 *   - 否则 → 按 order 派生（order 从 1 起，越小权重越高，保留主备倾斜但非独占）：
 *       defaultWeight = 池内最大 order − (order − 1) + 1
 *     order 全相等时派生权重也相等 → 退化为均分（≈随机/轮询）。
 *   - 处于软恢复试水期 → 再 ×0.3
 *
 * 该派生逻辑同时承接了原 chain 的「order 派生权重」语义，使未填 weight 的
 * weighted 池与旧的 chain 池行为一致，无需额外分支。
 *
 * @param {Object} origin 源站
 * @param {Object} pool 源站池（用于取 pool.__maxOrder / pool.id 计算试水系数）
 * @returns {number} 生效权重（>=1）
 */
function weightOf(origin, pool) {
  let base;
  if (Number(origin.weight) > 0) {
    base = Number(origin.weight);
  } else {
    const maxOrder = pool.__maxOrder || 0;
    base = Math.max(1, maxOrder - ((Number(origin.order) || 1) - 1) + 1);
  }
  return base * softRecoverCoeff(pool.id, origin.id);
}

/**
 * chain 策略：严格串行，按 order 升序（1 第一优先）取候选集中最小者。
 * 无权重、无轮询状态；与 failover 的「排除已试源站」配合即实现 1→2→3→4 串行回退。
 * 并列 order 时取候选数组先出现者（即源站列表先出现者）。
 *
 * @param {Object[]} candidates 候选源站（已过滤冷却/熔断）
 * @returns {Object} 选中的源站
 */
function pickStrictOrder(candidates) {
  let best = candidates[0];
  let bestOrder = Number(best.order) || 1;
  for (let i = 1; i < candidates.length; i++) {
    const o = candidates[i];
    const ord = Number(o.order) || 1;
    if (ord < bestOrder) {
      best = o;
      bestOrder = ord;
    }
  }
  return best;
}

/**
 * 平滑加权轮询（Smooth Weighted Round Robin，nginx 经典算法）。
 *   - 每次选 max(current_weight + weight) 的源站；选中后该源站 current_weight -= 总权重。
 *   - 严格按权重比例、分布平滑、无随机抖动；模块级 _swrrWeight 保存轮询状态。
 *
 * @param {Object} pool 源站池
 * @param {Object[]} candidates 候选源站
 * @param {(o:Object, pool:Object)=>number} weightOfFn 权重函数
 * @returns {Object} 选中的源站
 */
function pickSwrr(pool, candidates, weightOfFn) {
  // 预计算每个候选的权重
  const weights = candidates.map((o) => Math.max(1, weightOfFn(o, pool)));
  const total = weights.reduce((a, b) => a + b, 0);

  let bestIdx = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const key = `${pool.id}:${candidates[i].id}`;
    const cur = (_swrrWeight.get(key) || 0) + weights[i];
    _swrrWeight.set(key, cur);
    if (cur > bestScore) {
      bestScore = cur;
      bestIdx = i;
    }
  }

  // 选中者减总权重
  const bestKey = `${pool.id}:${candidates[bestIdx].id}`;
  _swrrWeight.set(bestKey, _swrrWeight.get(bestKey) - total);

  return candidates[bestIdx];
}

/**
 * iphash：一致性哈希环 + 虚拟节点，命中坏源站环内顺时针回退 + 软亲和缓存。
 *
 * @param {Object} pool 源站池
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object[]} candidates 候选源站（已过滤冷却/熔断）
 * @returns {Object} 选中的源站
 */
function pickIpHash(pool, ctx, candidates) {
  const ip =
    ctx?.request?.headers?.get('cf-connecting-ip') ||
    ctx?.request?.headers?.get('x-real-ip') ||
    '';

  if (!ip) {
    // 无 IP 退化 weighted（按 weight 选，未填则按 order 派生）
    return pickSwrr(pool, candidates, weightOf);
  }

  // 软亲和：环内曾回退到某备用源站，短期直接命中，避免每请求重复走回退路径。
  const aff = affinityGet(ip);
  if (aff) {
    const hit = candidates.find((o) => o.id === aff);
    if (hit) return hit; // 校验其仍可用，否则失效重查
  }

  const { ring, ids } = buildRing(pool, candidates);
  const hash = fnv1a(ip);

  // 二分找第一个 >= hash 的虚拟节点（环内顺时针回退天然由排序数组 + 取模实现）
  let lo = 0;
  let hi = ring.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ring[mid] < hash) lo = mid + 1;
    else hi = mid;
  }
  const start = lo % ring.length;

  // 顺时针回退：从命中节点开始，找第一个「候选集中且未冷却」的源站
  for (let step = 0; step < ring.length; step++) {
    const idx = (start + step) % ring.length;
    const originId = ids[idx];
    const found = candidates.find((o) => o.id === originId);
    if (found) {
      // 若发生回退（主映射不是该源站），记软亲和
      if (found.id !== primaryOfRing(ring, ids, hash)) {
        affinitySet(ip, found.id);
      }
      return found;
    }
  }

  // 极端兜底（候选集非空时不应到达）
  return candidates[0];
}

/** 返回 hash 命中的主映射源站 id（用于判断是否发生回退） */
function primaryOfRing(ring, ids, hash) {
  let lo = 0;
  let hi = ring.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ring[mid] < hash) lo = mid + 1;
    else hi = mid;
  }
  return ids[lo % ring.length];
}

/**
 * 构建/复用一致性哈希环（按 pool 引用缓存，源站列表变化自动重建）。
 * @param {Object} pool 源站池
 * @param {Object[]} candidates 当前候选源站
 * @returns {{ring:Uint32Array, ids:string[]}}
 */
function buildRing(pool, candidates) {
  const cached = _ringCache.get(pool);
  // 缓存失效条件：候选集 id 集合变化（增删源站）
  if (cached && sameIds(cached.idSet, candidates)) {
    return { ring: cached.ring, ids: cached.ids };
  }

  const points = [];
  for (const o of candidates) {
    for (let v = 0; v < VNODES; v++) {
      points.push({ h: fnv1a(`${o.id}#${v}`), id: o.id });
    }
  }
  points.sort((a, b) => a.h - b.h);
  const ring = new Uint32Array(points.length);
  const ids = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    ring[i] = points[i].h;
    ids[i] = points[i].id;
  }
  const entry = { ring, ids, idSet: new Set(candidates.map((o) => o.id)) };
  _ringCache.set(pool, entry);
  return entry;
}

/** 两个候选集 id 集合是否相同（用于环缓存失效判断） */
function sameIds(set, candidates) {
  if (!set || set.size !== candidates.length) return false;
  for (const o of candidates) if (!set.has(o.id)) return false;
  return true;
}

/**
 * fail-open 智能放行：候选集为空时挑「最值得一试」的源站。
 * 优先级：最近成功时间最新 > 冷却剩余最短 > order 升序第一个。
 *
 * @param {Object} pool 源站池
 * @param {Object[]} allEnabled 所有 enabled 源站（含冷却/熔断）
 * @param {Set<string>} exclude 已试集合（避免把已试的再次放回）
 * @returns {Object|null} 最优放行源站
 */
function smartRelease(pool, allEnabled, exclude) {
  const poolless = allEnabled.filter((o) => !exclude.has(o.id));
  const pool2 = poolless.length > 0 ? poolless : allEnabled;
  if (pool2.length === 0) return null;

  let best = null;
  let bestLastOk = -Infinity;
  let bestPen = Infinity;
  for (const o of pool2) {
    const lo = lastOkTs(pool.id, o.id);
    const pen = penaltyRemaining(pool.id, o.id);
    // 最近成功优先；并列时冷却剩余短优先
    if (lo > bestLastOk || (lo === bestLastOk && pen < bestPen)) {
      best = o;
      bestLastOk = lo;
      bestPen = pen;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 软亲和（纯内存，零 KV）
// ---------------------------------------------------------------------------

/**
 * 读取 IP 软亲和缓存（过期返回 undefined 并清理）。
 * @param {string} ip 客户端 IP
 * @returns {string|undefined} 备用源站 id
 */
function affinityGet(ip) {
  const v = _affinityMem.get(ip);
  if (v === undefined) return undefined;
  if (Date.now() > v.until) {
    _affinityMem.delete(ip);
    return undefined;
  }
  return v.originId;
}

/**
 * 写入 IP 软亲和缓存。
 * @param {string} ip 客户端 IP
 * @param {string} originId 备用源站 id
 */
function affinitySet(ip, originId) {
  _affinityMem.set(ip, { originId, until: Date.now() + AFFINITY_TTL });
}

// ---------------------------------------------------------------------------
// order 派生权重所需的「最大 order」预计算（供 weightOf 未填 weight 时派生）
// ---------------------------------------------------------------------------

/**
 * 在 selectOrigin 外暴露一个轻量预计算入口：给 pool 挂上 __maxOrder（仅本 isolate 复用）。
 * 由 failover 在调用前设置；缺失时 weightOf 退化为 1（不影响正确性）。
 * 这里提供导出函数以便 failover 统一调用。
 *
 * @param {Object} pool 源站池
 */
export function primeChainWeights(pool) {
  const orders = (pool?.origins || [])
    .filter((o) => o && o.enabled !== false)
    .map((o) => Number(o.order) || 1);
  pool.__maxOrder = orders.length ? Math.max(...orders) : 0;
}

/**
 * FNV-1a 32 位哈希。
 * @param {string} str 输入字符串
 * @returns {number} 32 位无符号哈希值
 */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
