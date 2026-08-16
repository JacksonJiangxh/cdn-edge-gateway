/**
 * ============================================================================
 * security/ratelimit.js —— 纯 isolate 内存限流（零 KV 读写）
 * ----------------------------------------------------------------------------
 * 【核心策略：isolate 内存计数，不跨实例共享，彻底零 KV 写入】
 *
 * 设计约束（2026-08 修订）：只有用户通过控制台修改配置才允许写 KV，
 * 所有 isolate 启动/运行期间必须保持只读。因此限流标记式的 KV 同步被移除，
 * 改为单实例内存计数。
 *
 * 行为：
 *   1. 每个 isolate 在内存中独立计数（零 KV 开销）
 *   2. 本地计数器超过阈值 → 本 isolate 直接拦截（不再写 KV 广播给其它 isolate）
 *   3. 计数随分钟窗口自动回收
 *
 * 代价：跨 isolate 计数精度下降。如果 600 RPM 的流量被 20 个 isolate 均分，
 * 每个只看到 30 req/min，不会触发。这是可接受的取舍——真正攻击会
 * 集中在少数 PoP，单 isolate 必然见顶。
 *
 * 可用性：内存计数永不失败，纯本地判定（fail-safe，不限流胜于误拦）。
 * ============================================================================
 */

import {
  registerDomain,
  allocBytes,
  releaseBytes,
  syncEntries,
  getDomainQuota,
  touchBudget,
} from '../platform/memBudget.js';
import { DEFAULT_GLOBAL_RULES } from '../config/defaults.js';

// ============================================================================
// 常量
// ============================================================================

/** 内存表最大条目数（兜底最大值），超出则整体清理，防止内存无限增长导致 isolate OOM。 */
const MEM_MAX_ENTRIES = DEFAULT_GLOBAL_RULES.security.memMaxEntries;

/**
 * 单条限流计数槽的估算字节（用于 memBudget 记账与配额推导）。
 * 一个 slot 仅含 3 个字段，约 100-200B，取 128B 保守初值，
 * memBudget 会按运行时采样自校准（见 platform/memBudget.js）。
 * @param {any} entry
 * @returns {number}
 */
function estimateSlotBytes(entry) {
  if (!entry || typeof entry !== 'object') return 128;
  try {
    return Math.max(48, JSON.stringify(entry).length + 32);
  } catch {
    return 128;
  }
}

/**
 * 由 memBudget 配额推导的「限流内存表条目上限」。
 * 取 min(MEM_MAX_ENTRIES, 配额字节 / 估算每槽字节)，至少为 1。
 * 内存预算紧张时，限流域（可激进回收）上限随之收紧。
 * @returns {number}
 */
function rlEntryCap() {
  try {
    const quota = getDomainQuota('ratelimit');
    if (quota > 0) {
      const byBytes = Math.floor(quota / estimateSlotBytes(null));
      return Math.max(1, Math.min(MEM_MAX_ENTRIES, byBytes));
    }
  } catch {
    /* 拿不到配额时退回硬上限 */
  }
  return MEM_MAX_ENTRIES;
}

/**
 * 限流域回收回调（memBudget 软/硬水位触发）。
 * ratelimit 域 allowAggressiveEvict=true：限流计数可激进丢弃（短暂失准可接受，
 * fail-safe 设计下 KV 不可用时本就按本地计数判定，内存清空只是回到「从零计数」）。
 *
 * @param {boolean} aggressive 是否激进。软水位即有 aggressive=true：
 *   先清当前分钟槽之外的过期项（sweep），若清后规模仍超过动态上限的一半，
 *   则整体清空（最激进释放）。限流短暂失准但内存安全。
 */
function evictRatelimit(aggressive) {
  try {
    if (memCounters.size === 0) return;
    sweep(currentMinute());
    if (aggressive && memCounters.size > rlEntryCap() * 0.5) {
      const n = memCounters.size;
      memCounters.clear();
      if (n > 0) releaseBytes('ratelimit', n);
    } else {
      syncEntries('ratelimit', memCounters.size);
    }
  } catch {
    /* ignore */
  }
}

// 向统一内存预算单例注册「ratelimit 域」。
// - weight 给到 1（限流计数最不敏感，预算紧张时最先让位）
// - allowAggressiveEvict=true：软水位即可触发 evictRatelimit 释放
registerDomain('ratelimit', {
  weight: 1,
  estimateBytes: estimateSlotBytes,
  evict: evictRatelimit,
  allowAggressiveEvict: true,
});

// ============================================================================
// isolate 级内存状态
// ============================================================================

/**
 * isolate 内的限流状态表（纯内存，不跨实例共享）。
 * key: `${host}:${ip}:${minute}`
 * value: {
 *   local:      本 isolate 本窗口累计请求数
 *   tripped:    本 isolate 是否已判定该 (host,ip) 需要拦截
 * }
 * @type {Map<string, {local:number, tripped:boolean}>}
 */
const memCounters = new Map();

/** 上一次做内存清理时所处的分钟槽，用于按分钟批量回收过期条目。 */
let lastSweepMinute = -1;

/**
 * 当前分钟槽（自 epoch 起的分钟数）。
 * @returns {number} 分钟槽
 */
function currentMinute() {
  return Math.floor(Date.now() / 60000);
}

/**
 * 清理过期的内存计数条目。
 * 每进入新的一分钟做一次；条目数暴涨时强制全清（宁可短暂失准也不能 OOM）。
 * @param {number} minute 当前分钟槽
 * @returns {void}
 */
function sweep(minute) {
  if (memCounters.size > rlEntryCap()) {
    const n = memCounters.size;
    memCounters.clear();
    if (n > 0) releaseBytes('ratelimit', n);
    lastSweepMinute = minute;
    return;
  }
  if (minute === lastSweepMinute) return;
  lastSweepMinute = minute;
  const suffix = `:${minute}`;
  for (const key of memCounters.keys()) {
    if (!key.endsWith(suffix)) {
      memCounters.delete(key);
      releaseBytes('ratelimit', 1);
    }
  }
  // 顺带让 memBudget 检查一次水位，及时触发跨域回收（限流域可激进释放）
  touchBudget();
}

/**
 * 规整 host，防止把非法字符拼进 KV key。
 * @param {string} host 主机名
 * @returns {string} 清洗后的 host
 */
function normHost(host) {
  return String(host || 'unknown').toLowerCase().replace(/[^a-z0-9.\-*_]/g, '').slice(0, 128) || 'unknown';
}

/**
 * 规整 IP，同上。
 * @param {string} ip 客户端 IP
 * @returns {string} 清洗后的 IP
 */
function normIp(ip) {
  return String(ip || 'unknown').replace(/[^0-9a-fA-F.:]/g, '').slice(0, 45).toLowerCase() || 'unknown';
}

// ============================================================================
// 对外接口
// ============================================================================

/**
 * 对 `{host, ip}` 做一次限流计数与判定。
 *
 * 【零写入策略】
 * - 本地计数未超阈值 → 纯内存，不碰 KV（除非冷却时间到，做一次读同步）
 * - 本地计数超出阈值 → 读 KV 确认是否已被标记，若无则写入标记
 * - 本 isolate 已判定拦截 → 零 KV 开销，直接返回 429
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} host 站点主机名
 * @param {string} ip 客户端 IP
 * @param {number} rpm 每分钟允许的请求数；<=0 视为不限流
 * @returns {Promise<{limited:boolean, count:number, rpm:number, retryAfter:number}>}
 *
 * @example
 * const r = await checkRateLimit(ctx, 'img.a.com', ip, 600);
 * if (r.limited) return new Response('Forbidden', { status: 403 });
 */
export async function checkRateLimit(ctx, host, ip, rpm) {
  const limit = Number(rpm);
  if (!Number.isFinite(limit) || limit <= 0) {
    return { limited: false, count: 0, rpm: 0, retryAfter: 0 };
  }

  const minute = currentMinute();
  sweep(minute);

  const h = normHost(host);
  const i = normIp(ip);
  const memKey = `${h}:${i}:${minute}`;

  let slot = memCounters.get(memKey);
  if (!slot) {
    slot = { local: 0, tripped: false };
    memCounters.set(memKey, slot);
    // 新槽记账：memBudget 据此掌握占用并触发水位回收
    allocBytes('ratelimit', slot);
  }
  slot.local += 1;

  // 本窗口剩余秒数，用于 Retry-After
  const retryAfter = Math.max(1, 60 - Math.floor((Date.now() % 60000) / 1000));

  // 本 isolate 已判定超限 → 直接拦，零 KV 开销
  if (slot.tripped) {
    return { limited: true, count: limit + 1, rpm: limit, retryAfter };
  }

  // 纯 isolate 内存判定：本地计数超过阈值即拦截，不写 KV、不跨实例广播。
  if (slot.local > limit) {
    slot.tripped = true;
    return { limited: true, count: slot.local, rpm: limit, retryAfter };
  }

  return { limited: false, count: slot.local, rpm: limit, retryAfter };
}

// ============================================================================
// 全局流量入口限流（纯 isolate 内存，零存储依赖）
// ============================================================================

/**
 * 全局请求频率计数器（纯 isolate 内存，不依赖 KV/D1）。
 * 用当前秒槽作为 key，每秒自动清零，极致轻量。
 *
 * @type {{ second: number, count: number }}
 */
let globalSlot = { second: 0, count: 0 };

/**
 * 对当前请求做一次全局入口限流判定。
 *
 * 这与 `checkRateLimit` 不同：
 *   - checkRateLimit 是「按站点+IP 的精细化限流」，依赖 KV 做跨 isolate 聚合。
 *   - 本函数是「Worker 全局入口限流」，纯 isolate 内存，零存储开销，保护 Worker
 *     不被随机 Host 扫描打垮。
 *
 * 每次调用内部递增 isolate 内计数器。当 `rps` <= 0 时不限流。
 *
 * @param {number} rps 全局每秒允许的最大请求数，0 表示不限制
 * @returns {{ limited: boolean, retryAfter: number }}
 */
export function checkGlobalRateLimit(rps) {
  const limit = Number(rps);
  if (!Number.isFinite(limit) || limit <= 0) {
    return { limited: false, retryAfter: 0 };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (globalSlot.second !== nowSec) {
    globalSlot = { second: nowSec, count: 1 };
    return { limited: false, retryAfter: 0 };
  }

  globalSlot.count += 1;
  if (globalSlot.count <= limit) {
    return { limited: false, retryAfter: 0 };
  }

  return { limited: true, retryAfter: 1 };
}
