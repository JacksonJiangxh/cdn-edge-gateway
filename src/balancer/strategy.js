/**
 * 负载均衡策略
 * ----------------------------------------------------------------------------
 * 从源站池中挑选一个可用源站，支持 5 种策略。
 *
 * 「可用」的定义（三个过滤条件）：
 *   1. enabled !== false
 *   2. 不在 excludeIds 中（本次请求已经试过并失败的）
 *   3. 未被熔断（由 failover 预先算好并通过 excludeIds 传入）
 *
 * 注意：本函数是同步的（契约要求），而熔断查询是异步的 KV 操作，
 * 因此熔断过滤在 failover 里提前完成，把熔断的源站合并进 excludeIds 传进来。
 */

/**
 * roundrobin 的模块级计数器。
 *
 * 这是「近似轮询」而非严格轮询：
 *  - Worker 是多 isolate 的，每个 isolate 有独立的内存空间和独立计数器
 *  - isolate 会被随时回收重建，计数器随之归零
 *  - 因此全局看是「各 isolate 内部轮询」的叠加，宏观上分布仍然均匀
 * 想要严格轮询必须依赖 Durable Object，代价过高，这里刻意选择近似方案。
 */
const rrCounters = new Map();

/**
 * 从源站池中选择一个源站。
 *
 * @param {Object} pool 源站池
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string[]} [excludeIds] 需要排除的源站 id（已失败的 + 已熔断的）
 * @returns {Object|null} 选中的源站，无可用源站时返回 null
 */
export function selectOrigin(pool, ctx, excludeIds) {
  const exclude = new Set(excludeIds || []);
  const candidates = (pool?.origins || []).filter(
    (o) => o && o.enabled !== false && !exclude.has(o.id)
  );

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  switch (pool.strategy) {
    case 'roundrobin':
      return pickRoundRobin(pool, candidates);
    case 'random':
      return pickRandom(candidates);
    case 'weighted':
      return pickWeighted(candidates);
    case 'iphash':
      return pickIpHash(candidates, ctx);
    case 'chain':
    default:
      // chain 是默认策略，也是用户最主要的需求：
      // 严格按 order 升序，优先用第一个，坏了才往后顺延
      return pickChain(candidates);
  }
}

/**
 * chain：按 order 升序取第一个可用源站。
 *
 * @param {Object[]} candidates 候选源站
 * @returns {Object} 选中的源站
 */
function pickChain(candidates) {
  return candidates.slice().sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))[0];
}

/**
 * roundrobin：isolate 级计数器取模，近似轮询。
 *
 * @param {Object} pool 源站池
 * @param {Object[]} candidates 候选源站
 * @returns {Object} 选中的源站
 */
function pickRoundRobin(pool, candidates) {
  // 先按 order 排序，保证同一 isolate 内的轮询顺序稳定可预期
  const sorted = candidates
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

  const key = pool.id || 'default';
  const prev = rrCounters.get(key) || 0;
  const next = prev + 1;
  // 防止计数器无限增长（虽然 JS 安全整数很大，但保持数值小一些更稳妥）
  rrCounters.set(key, next % 1e9);

  return sorted[prev % sorted.length];
}

/**
 * random：等概率随机。
 *
 * @param {Object[]} candidates 候选源站
 * @returns {Object} 选中的源站
 */
function pickRandom(candidates) {
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * weighted：权重前缀和 + 随机落点。
 *
 * 例：权重 [3,1,1] → 前缀和 [3,4,5]，在 [0,5) 取随机数 r，
 * 找到第一个前缀和 > r 的位置即为命中项，从而实现 3:1:1 的流量分配。
 *
 * @param {Object[]} candidates 候选源站
 * @returns {Object} 选中的源站
 */
function pickWeighted(candidates) {
  const prefix = [];
  let total = 0;
  for (const o of candidates) {
    // 权重非法或为 0 时按 1 处理，避免整池权重和为 0
    const w = Number(o.weight) > 0 ? Number(o.weight) : 1;
    total += w;
    prefix.push(total);
  }

  const r = Math.random() * total;
  for (let i = 0; i < prefix.length; i++) {
    if (r < prefix[i]) return candidates[i];
  }
  // 浮点误差兜底
  return candidates[candidates.length - 1];
}

/**
 * iphash：对客户端 IP 做哈希取模，保证同一客户端稳定落到同一源站。
 *
 * 适用于源站侧有本地会话 / 本地缓存的场景。
 * 取不到 IP 时退化为 chain，保证行为可预期（而不是随机）。
 *
 * @param {Object[]} candidates 候选源站
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Object} 选中的源站
 */
function pickIpHash(candidates, ctx) {
  const ip =
    ctx?.request?.headers?.get('cf-connecting-ip') ||
    ctx?.request?.headers?.get('x-real-ip') ||
    '';

  if (!ip) return pickChain(candidates);

  const sorted = candidates
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

  return sorted[fnv1a(ip) % sorted.length];
}

/**
 * FNV-1a 32 位哈希。
 *
 * 选它是因为实现极短、无依赖、分布均匀，足够满足 IP 分流的需求。
 *
 * @param {string} str 输入字符串
 * @returns {number} 32 位无符号哈希值
 */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619，用移位加法避免大数乘法溢出
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
