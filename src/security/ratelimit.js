/**
 * ============================================================================
 * security/ratelimit.js —— 按需 KV 标记式限流（极低写入量）
 * ----------------------------------------------------------------------------
 * 【核心策略：纯内存计数 + 仅触发时写 KV 标记】
 *
 * Cloudflare Workers / EdgeOne Pages 免费版 KV 每天仅 1000 次写入。
 * 旧策略每 WRITE_BACK_STEP=5 次请求写一次 KV，600 RPM 的 IP 会产
 * 生 ~120 次写入/分钟，一天轻松超配额。
 *
 * 新策略：
 *   1. 每个 isolate 在内存中独立计数（零 KV 开销）
 *   2. 只有当本地计数器超过阈值 → 才写一条 KV 标记（rl:host:ip:minute = "1"）
 *   3. 其他 isolate 通过定期（30s）读取 KV 发现标记 → 参与联合拦截
 *   4. 标记 TTL = 120 秒，窗口过后自动过期
 *
 * 效果：
 *   - 触发限流前：0 KV 写入，0 KV 读取（本地未超阈值）
 *   - 触发限流后：1 KV 写入 + 每 30s 一次 KV 读取（仅针对嫌疑 IP）
 *   - 一个 IP 从正常到被拦截，全集群最多产生 1 次 KV 写入
 *
 * 代价：跨 isolate 计数精度下降。如果 600 RPM 的流量被 20 个 isolate 均分，
 * 每个只看到 30 req/min，不会触发。这是可接受的取舍——真正攻击会
 * 集中在少数 PoP，单 isolate 必然见顶。
 *
 * 可用性：KV 不可用一律按本地计数判定（fail-safe，不限流胜于误拦）。
 * ============================================================================
 */

import { getKV } from '../platform/kv.js';

// ============================================================================
// 常量
// ============================================================================

/** KV 键前缀。完整形态：`rl:{host}:{ip}:{minute}` */
const RL_PREFIX = 'rl:';

/** KV 条目 TTL（秒）。窗口是 1 分钟，留 2 分钟便于跨窗口读取上一分钟。 */
const RL_TTL_SEC = 120;

/**
 * 从 KV 同步远端标记的最小间隔（毫秒）。
 * 30 秒意味着一个 IP 被其他 isolate 标记后，最晚 30 秒内全校验。
 * 这也控制了 KV 读取频率：每个嫌疑 IP 每分钟最多读 2 次。
 */
const REMOTE_SYNC_INTERVAL_MS = 30000;

/** 内存表最大条目数，超出则整体清理，防止内存无限增长导致 isolate OOM。 */
const MEM_MAX_ENTRIES = 5000;

// ============================================================================
// isolate 级内存状态
// ============================================================================

/**
 * isolate 内的限流状态表。
 * key: `${host}:${ip}:${minute}`
 * value: {
 *   local:      本 isolate 本窗口累计请求数
 *   tripped:    本 isolate 是否已判定该 (host,ip) 需要拦截
 *   remoteAt:   上次从 KV 读取标记的时间戳（ms），用于冷却
 * }
 * @type {Map<string, {local:number, tripped:boolean, remoteAt:number}>}
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
  if (memCounters.size > MEM_MAX_ENTRIES) {
    memCounters.clear();
    lastSweepMinute = minute;
    return;
  }
  if (minute === lastSweepMinute) return;
  lastSweepMinute = minute;
  const suffix = `:${minute}`;
  for (const key of memCounters.keys()) {
    if (!key.endsWith(suffix)) memCounters.delete(key);
  }
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

/**
 * 解析 KV 标记：非空且非 "0" 即为已标记。
 * @param {any} raw KV 返回值
 * @returns {boolean}
 */
function parseFlag(raw) {
  if (raw == null || raw === '' || raw === '0') return false;
  return true;
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
  const kvKey = `${RL_PREFIX}${memKey}`;

  let slot = memCounters.get(memKey);
  if (!slot) {
    slot = { local: 0, tripped: false, remoteAt: 0 };
    memCounters.set(memKey, slot);
  }
  slot.local += 1;

  // 本窗口剩余秒数，用于 Retry-After
  const retryAfter = Math.max(1, 60 - Math.floor((Date.now() % 60000) / 1000));

  // 本 isolate 已判定超限 → 直接拦，零 KV 开销
  if (slot.tripped) {
    return { limited: true, count: limit + 1, rpm: limit, retryAfter };
  }

  const kv = getKV(ctx && ctx.env);
  if (!kv) {
    // KV 不可用：退化为纯 isolate 内计数
    return {
      limited: slot.local > limit,
      count: slot.local,
      rpm: limit,
      retryAfter,
    };
  }

  try {
    const now = Date.now();

    // ---- 本地未超阈值 ----
    // 纯内存计数。仅定期查一次 KV，看其他 isolate 是否已标记本 IP。
    if (slot.local <= limit) {
      if (slot.remoteAt === 0 || now - slot.remoteAt >= REMOTE_SYNC_INTERVAL_MS) {
        const raw = await kv.get(kvKey);
        slot.remoteAt = now;
        if (parseFlag(raw)) {
          slot.tripped = true;
          return { limited: true, count: limit + 1, rpm: limit, retryAfter };
        }
      }
      return { limited: false, count: slot.local, rpm: limit, retryAfter };
    }

    // ---- 本地超阈值 ----
    // 先读 KV 确认：如果其他 isolate 已标记 → 复用标记，拦
    // 如果还没有标记 → 本 isolate 是第一个发现的 → 写入 KV 标记
    const raw = await kv.get(kvKey);
    if (parseFlag(raw)) {
      slot.tripped = true;
      return { limited: true, count: limit + 1, rpm: limit, retryAfter };
    }
    // 首次触发：写入 KV 标记，通知其他 isolate
    await kv.put(kvKey, '1', { expirationTtl: RL_TTL_SEC });
    slot.tripped = true;
    slot.remoteAt = now;
    return { limited: true, count: limit + 1, rpm: limit, retryAfter };
  } catch {
    // KV 读写异常 → 按本地计数判定，不限流胜于误拦
    return {
      limited: slot.local > limit,
      count: slot.local,
      rpm: limit,
      retryAfter,
    };
  }
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
