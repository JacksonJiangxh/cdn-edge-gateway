/**
 * ============================================================================
 * migration/index.js —— 数据规范化引擎（部署时一次性运行，零维护、全自动）
 * ----------------------------------------------------------------------------
 *
 * 设计原则：
 *   1. 以 schema.validate 为唯一权威：schema 函数定义了「最新格式」，
 *      validate 本身已实现宽进严出（补默认值、钳制类型、剥离废弃字段），
 *      不需要额外维护版本号或字段映射表
 *
 *   2. 部署时触发：Worker/Pages 每次部署后冷启动，isolate 全局代码重新执行，
 *      首次请求通过 waitUntil 触发全库扫描规范化，之后不再重复（同 isolate 内）
 *
 *   3. 差异驱动：只有当 raw JSON ≠ validate(raw) 时才写回 KV，
 *      避免无效写入消耗配额
 *
 *   4. 幂等安全：写回失败不阻塞请求，下次部署重试
 *
 * 工作原理：
 *   每次部署（粘贴 Worker 代码 / Pages 触发部署）→ isolate 销毁重建 →
 *   首个请求 → dispatch() 里通过 waitUntil 调用 normalizeAllAtStartup() →
 *   扫描 cfg:global、site:_index 列出的全部站点、pool:_index 列出的全部源站池 →
 *   逐个 validate 并比较 → 有差异则写回 KV →
 *   完成后设 _startupDone=true，同 isolate 后续请求跳过
 *
 * 开发者不需要做任何事情：
 *   - 新增字段 → 加进 schema 并配好默认值，部署后自动补上
 *   - 修改字段类型 → schema 的 int()/str()/bool() 会自动钳制
 *   - 废弃字段 → 从 schema 输出中移除，部署后自动剥离
 *
 * ============================================================================
 */

import { getKV } from '../platform/kv.js';
import { encodeKey, isEncodedKey } from '../platform/keyCodec.js';
import { validateGlobal, validateSite, validatePool } from '../config/schema.js';

// ============================================================================
// KV Key 常量（与 store.js 保持一致）
// ============================================================================

const K_GLOBAL = 'cfg:global';
const K_SITE_INDEX = 'site:_index';
const K_POOL_INDEX = 'pool:_index';
const kSite = (host) => `site:${host}`;
const kPool = (id) => `pool:${id}`;

// ============================================================================
// 启动规范化（部署后运行一次，同 isolate 内不会重复）
// ============================================================================

/** isolate 级别标志：一次性运行后置 true，同 isolate 后续调用直接跳过 */
let _startupDone = false;

/**
 * 部署后启动时全库扫描规范化。
 *
 * 在 entry.js 的 dispatch() 中通过 waitUntil 调用，
 * 不阻塞请求响应，后台完成全量数据对齐。
 *
 * @param {Object} env 平台环境变量（含 KV 绑定）
 * @returns {Promise<{normalized:number, scanned:number, message:string}>}
 */
export async function normalizeAllAtStartup(env) {
  if (_startupDone) {
    return { normalized: 0, scanned: 0, message: 'already done in this isolate' };
  }
  _startupDone = true;

  const kv = getKV(env);
  if (!kv) {
    console.warn('[normalize] startup skipped: no KV binding');
    return { normalized: 0, scanned: 0, message: 'no KV' };
  }

  let normalized = 0;
  let scanned = 0;
  const startTs = Date.now();

  try {
    // ---- 0. 键名编码迁移（必须最先执行）----
    // 引入 keyCodec 后，所有读写都经过编码；编码前写入的历史键（字面量
    // `cfg:global` 等）对上层已不可见。必须先把它们搬到编码后的新键，
    // 否则后续步骤会把老数据当成「不存在」，导致配置看起来被清空。
    await migrateLegacyKeys(kv);

    // ---- 1. 全局配置 ----
    const global = await kv.get(K_GLOBAL, 'json');
    if (global && typeof global === 'object') {
      scanned++;
      const res = validateGlobal(global);
      if (res.ok && deepDiff(global, res.value)) {
        try {
          await kv.put(K_GLOBAL, JSON.stringify(res.value));
          normalized++;
          console.log('[normalize] global config updated');
        } catch (e) {
          console.error('[normalize] global config write failed:', e?.message);
        }
      }
    }

    // ---- 2. 全部站点 ----
    const siteIdx = await kv.get(K_SITE_INDEX, 'json');
    const siteHosts =
      siteIdx && Array.isArray(siteIdx.hosts) ? siteIdx.hosts.filter((h) => typeof h === 'string') : [];
    if (siteHosts.length > 0) {
      normalized += await batchNormalize(kv, siteHosts, kSite, validateSite, 'site');
      scanned += siteHosts.length;
    }

    // ---- 3. 全部源站池 ----
    const poolIdx = await kv.get(K_POOL_INDEX, 'json');
    const poolIds =
      poolIdx && Array.isArray(poolIdx.ids) ? poolIdx.ids.filter((x) => typeof x === 'string') : [];
    if (poolIds.length > 0) {
      normalized += await batchNormalize(kv, poolIds, kPool, validatePool, 'pool');
      scanned += poolIds.length;
    }

    const elapsed = Date.now() - startTs;
    console.log(
      `[normalize] startup done: scanned=${scanned} updated=${normalized} elapsed=${elapsed}ms`
    );
    return { normalized, scanned, message: 'ok' };
  } catch (err) {
    console.error('[normalize] startup failed:', err?.message);
    // 失败不阻塞请求，下次部署重试
    return { normalized, scanned, message: `error: ${err?.message || 'unknown'}` };
  }
}

// ============================================================================
// 键名编码迁移（一次性，幂等）
// ============================================================================

/**
 * 迁移哨兵键。存在即表示本命名空间已完成键名编码迁移，
 * 后续部署直接跳过全量 list，避免每次冷启动都扫一遍 KV 浪费配额。
 * 注意：这里写的是**逻辑键**，实际落盘为 `_5F__5Fkeycodec__5Fmigrated__5F...`。
 */
const K_CODEC_SENTINEL = '__keycodec_migrated__';

/**
 * 把「编码方案启用前写入的历史键」搬迁到编码后的新键。
 *
 * 背景：keyCodec 启用后，`kv.get('cfg:global')` 实际读的是物理键
 * `cfg_3Aglobal`；而历史数据存在字面量物理键 `cfg:global` 下，
 * 两者不是同一个键，老数据会「凭空消失」。
 *
 * 策略（读旧 → 写新 → 删旧，逐键幂等）：
 *   1. 全量 list（走 raw 通道，拿未解码的物理键）
 *   2. 物理键若已符合 [0-9A-Za-z_]，说明它要么本就是编码产物、
 *      要么是纯字母数字（编码后与自身相同），跳过
 *   3. 否则视为历史键：raw 读原值 → 以「该物理键作为逻辑键」编码后写入新键
 *      → 删除旧键
 *
 * 安全性：
 *   - 幂等：中途失败后重跑，已搬迁的键在第 2 步被跳过，未搬迁的继续
 *   - 不覆盖：若新键已有值（说明迁移后又产生了新数据），保留新值只删旧键，
 *     避免用陈旧数据覆盖运行中写入的最新数据
 *   - 失败不抛：单键失败仅记日志，不阻断整体流程与请求
 *
 * @param {import('../platform/kv.js').KVLike} kv KV 适配器（需带 raw 通道）
 * @returns {Promise<{migrated:number, skipped:number, failed:number}>}
 */
async function migrateLegacyKeys(kv) {
  const stat = { migrated: 0, skipped: 0, failed: 0 };

  // 无 raw 通道（理论上不会发生）则无法访问历史键，安全跳过
  if (!kv.raw || typeof kv.raw.list !== 'function') return stat;

  // 哨兵：已迁移过就不再全量扫描
  try {
    const done = await kv.get(K_CODEC_SENTINEL, 'text');
    if (done) return stat;
  } catch {
    /* 读哨兵失败则照常执行迁移，幂等设计保证重复执行安全 */
  }

  try {
    let cursor;
    let guard = 0;
    do {
      // 全量列举（不带 prefix）：历史键前缀各异，无法按前缀筛选
      const page = await kv.raw.list(cursor ? { cursor } : {});
      const keys = Array.isArray(page.keys) ? page.keys : [];

      for (const item of keys) {
        const physKey = item && item.name;
        if (typeof physKey !== 'string' || physKey === '') continue;

        // 已是合法编码字符集 → 无需搬迁
        if (isEncodedKey(physKey)) {
          stat.skipped++;
          continue;
        }

        // 历史键：把它的字面量当作逻辑键重新编码
        let newPhysKey;
        try {
          newPhysKey = encodeKey(physKey);
        } catch (e) {
          console.error(`[keycodec] 键 "${physKey}" 编码失败，跳过:`, e?.message);
          stat.failed++;
          continue;
        }

        try {
          const val = await kv.raw.get(physKey);
          if (val === null) {
            // 读不到值（可能已过期），直接清理旧键
            await kv.raw.delete(physKey);
            stat.skipped++;
            continue;
          }

          // 不覆盖迁移后产生的新数据
          const existing = await kv.raw.get(newPhysKey);
          if (existing === null) {
            await kv.put(physKey, val); // put 内部会编码成 newPhysKey
          }

          await kv.raw.delete(physKey);
          stat.migrated++;
        } catch (e) {
          console.error(`[keycodec] 键 "${physKey}" 迁移失败:`, e?.message);
          stat.failed++;
        }
      }

      cursor = page.list_complete ? undefined : page.cursor;
      guard++;
    } while (cursor && guard < 100); // 上限保护，避免 cursor 异常导致死循环

    // 仅在无失败时落哨兵，否则下次部署继续重试残留键
    if (stat.failed === 0) {
      try {
        await kv.put(K_CODEC_SENTINEL, String(Date.now()));
      } catch {
        /* 哨兵写失败无妨，下次重跑仍是幂等的 */
      }
    }

    if (stat.migrated > 0 || stat.failed > 0) {
      console.log(
        `[keycodec] 键名迁移完成: migrated=${stat.migrated} skipped=${stat.skipped} failed=${stat.failed}`
      );
    }
  } catch (err) {
    console.error('[keycodec] 键名迁移异常终止:', err?.message);
  }

  return stat;
}

/**
 * 批量规范化：每次并发 BATCH 条读取，对比后按需写回。
 *
 * @param {import('../platform/kv.js').KVLike} kv
 * @param {string[]} ids 站点 host 列表或源站池 id 列表
 * @param {(id:string)=>string} keyFn 键名函数
 * @param {(raw:object)=>any} validateFn validateSite / validatePool
 * @param {string} label 日志标签
 * @returns {Promise<number>} 实际写回的条目数
 */
async function batchNormalize(kv, ids, keyFn, validateFn, label) {
  const BATCH = 10;
  let updated = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const pairs = await Promise.all(
      batch.map(async (id) => {
        try {
          const raw = await kv.get(keyFn(id), 'json');
          return { id, raw };
        } catch {
          return { id, raw: null };
        }
      })
    );

    for (const { id, raw } of pairs) {
      if (!raw || typeof raw !== 'object') continue;
      const res = validateFn(raw);
      if (!res || !res.ok || !res.value) continue;
      if (!deepDiff(raw, res.value)) continue;

      try {
        await kv.put(keyFn(id), JSON.stringify(res.value));
        updated++;
        console.log(`[normalize] ${label} "${id}" updated`);
      } catch (e) {
        console.error(`[normalize] ${label} "${id}" write failed:`, e?.message);
      }
    }
  }

  return updated;
}

// ============================================================================
// 深度比较（忽略 version 字段和键顺序）
// ============================================================================

/**
 * 深度比较两个对象是否「实质相等」。
 *
 * 为什么不用 JSON.stringify 直接比：
 *   - 对象键在不同上下文中可能有不同遍历顺序
 *   - version 字段只是元数据，不应参与迁移判定
 */
function deepDiff(a, b) {
  return stableStringify(a) !== stableStringify(b);
}

/**
 * 稳定字符串化：递归处理，键按字母排序，过滤 version。
 */
function stableStringify(v) {
  if (v === null || typeof v !== 'object') {
    return JSON.stringify(v);
  }

  if (Array.isArray(v)) {
    return '[' + v.map(stableStringify).join(',') + ']';
  }

  // 普通对象：按键排序，跳过 version
  const keys = Object.keys(v)
    .filter((k) => k !== 'version')
    .sort();

  const pairs = keys.map((k) => {
    return JSON.stringify(k) + ':' + stableStringify(v[k]);
  });

  return '{' + pairs.join(',') + '}';
}
