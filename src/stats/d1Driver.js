/**
 * ============================================================================
 * stats/d1Driver.js —— D1 统计驱动
 * ----------------------------------------------------------------------------
 * D1 只在 Cloudflare（Workers / Pages）平台可用，EdgeOne Pages 上没有 D1。
 * 因此本模块所有对外函数在「无 D1 绑定」时都**优雅降级**：
 *   - writeStats 返回 false（由 collector 自动回落到 kvDriver）
 *   - queryStats 返回 `available:false` 的空结构（管理面据此提示用户）
 * 绝不抛异常、绝不阻断主流程。
 *
 * 相比 KV 驱动的优势：
 *   - `INSERT ... ON CONFLICT DO UPDATE` 是**原子**的服务端自增，
 *     不存在 KV 那种 read-modify-write 覆盖丢失问题，因此无需分片。
 *   - `db.batch()` 把一次 flush 的所有 host 打包成一个事务，成本和延迟都更低。
 * ============================================================================
 */

/** 聚合表名。 */
const TABLE = 'stats_hourly';

import { hourKey } from '../utils/hourKey.js';

/** 建表语句是否已在本 isolate 内执行过（避免每次 flush 都跑一遍 DDL）。 */
let schemaReady = false;

/** 查询回溯小时数上限。 */
const MAX_QUERY_HOURS = 24 * 90;

/**
 * 从 env 中取出 D1 绑定。
 * 绑定名与 platform/caps.js 的探测顺序保持一致：CDN_DB → DB → D1。
 * @param {Object} env 环境对象
 * @returns {Object|null} D1 Database 实例，不可用返回 null
 */
function getD1(env) {
  try {
    const e = env || {};
    for (const name of ['CDN_DB', 'DB', 'D1']) {
      const b = e[name];
      if (b && typeof b.prepare === 'function' && typeof b.batch === 'function') return b;
    }
    // 部分运行时只有 prepare 没有 batch，也当作可用（batch 走降级路径）
    for (const name of ['CDN_DB', 'DB', 'D1']) {
      const b = e[name];
      if (b && typeof b.prepare === 'function') return b;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * D1 是否可用。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {boolean} 是否可用
 */
export function isAvailable(ctx) {
  return getD1(ctx && ctx.env) !== null;
}

/**
 * 建表（幂等）。使用 `CREATE TABLE IF NOT EXISTS`，多 isolate 并发执行也安全。
 *
 * 表结构与契约中的字段一一对应，另外补了 status_other / duration 相关列
 * 用于更完整的展示。主键 (host, hour) 保证每个站点每小时一行。
 *
 * @param {Object} db D1 实例
 * @returns {Promise<boolean>} 是否成功
 */
async function ensureSchema(db) {
  if (schemaReady) return true;
  try {
    const ddl = [
      db.prepare(
        `CREATE TABLE IF NOT EXISTS ${TABLE} (
           host        TEXT    NOT NULL,
           hour        TEXT    NOT NULL,
           requests    INTEGER NOT NULL DEFAULT 0,
           status_2xx  INTEGER NOT NULL DEFAULT 0,
           status_3xx  INTEGER NOT NULL DEFAULT 0,
           status_4xx  INTEGER NOT NULL DEFAULT 0,
           status_5xx  INTEGER NOT NULL DEFAULT 0,
           status_other INTEGER NOT NULL DEFAULT 0,
           bytes       INTEGER NOT NULL DEFAULT 0,
           cache_hit   INTEGER NOT NULL DEFAULT 0,
           cache_miss  INTEGER NOT NULL DEFAULT 0,
           dur_sum     INTEGER NOT NULL DEFAULT 0,
           dur_p95     INTEGER NOT NULL DEFAULT 0,
           updated_at  INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (host, hour)
         )`
      ),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_${TABLE}_hour ON ${TABLE} (hour)`),
      db.prepare(
        `CREATE TABLE IF NOT EXISTS stats_origin_hourly (
           host      TEXT    NOT NULL,
           hour      TEXT    NOT NULL,
           origin_id TEXT    NOT NULL,
           requests  INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (host, hour, origin_id)
         )`
      ),
    ];

    if (typeof db.batch === 'function') {
      await db.batch(ddl);
    } else {
      for (const stmt of ddl) await stmt.run();
    }
    schemaReady = true;
    return true;
  } catch {
    // 建表失败（权限 / 只读副本）→ 本次不写，交由上层降级
    return false;
  }
}

/**
 * 把时间戳格式化为 `yyyymmddhh`（UTC），与 kvDriver 保持一致。
 * @param {number} [ts] 时间戳（ms）
/**
 * 规整 host。虽然全部走参数化绑定不存在 SQL 注入，
 * 但仍然限制字符集与长度，避免脏数据污染统计表。
 * @param {string} host 主机名
 * @returns {string} 清洗后的 host
 */
function normHost(host) {
  const s = String(host || 'unknown').toLowerCase().replace(/[^a-z0-9.\-_*]/g, '');
  return s.slice(0, 128) || 'unknown';
}

/**
 * 安全转非负整数。
 * @param {any} v 任意值
 * @returns {number} 非负整数
 */
function int(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ============================================================================
// 写入
// ============================================================================

/**
 * 批量写入统计（由 collector.flush 调用）。
 *
 * 使用 upsert：同一 (host, hour) 已存在时在服务端做原子累加，
 * 因此多 isolate 并发写入不会互相覆盖 —— 这是 D1 相比 KV 的核心优势。
 * 所有语句打包进一次 `db.batch()`，作为单个事务提交。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object[]} records collector 产出的扁平统计记录数组
 * @returns {Promise<boolean>} true=已写入；false=D1 不可用，调用方应降级到 KV
 */
export async function writeStats(ctx, records) {
  const db = getD1(ctx && ctx.env);
  if (!db) return false;
  if (!Array.isArray(records) || records.length === 0) return true;

  const ready = await ensureSchema(db);
  if (!ready) return false;

  const hour = hourKey();
  const now = Date.now();

  const upsert = `INSERT INTO ${TABLE}
      (host, hour, requests, status_2xx, status_3xx, status_4xx, status_5xx,
       status_other, bytes, cache_hit, cache_miss, dur_sum, dur_p95, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    ON CONFLICT (host, hour) DO UPDATE SET
      requests     = requests     + excluded.requests,
      status_2xx   = status_2xx   + excluded.status_2xx,
      status_3xx   = status_3xx   + excluded.status_3xx,
      status_4xx   = status_4xx   + excluded.status_4xx,
      status_5xx   = status_5xx   + excluded.status_5xx,
      status_other = status_other + excluded.status_other,
      bytes        = bytes        + excluded.bytes,
      cache_hit    = cache_hit    + excluded.cache_hit,
      cache_miss   = cache_miss   + excluded.cache_miss,
      dur_sum      = dur_sum      + excluded.dur_sum,
      dur_p95      = MAX(dur_p95, excluded.dur_p95),
      updated_at   = excluded.updated_at`;

  const originUpsert = `INSERT INTO stats_origin_hourly (host, hour, origin_id, requests)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT (host, hour, origin_id) DO UPDATE SET
      requests = requests + excluded.requests`;

  const stmts = [];
  for (const rec of records) {
    const host = normHost(rec && rec.host);
    const requests = int(rec.requests);
    const durSum = int(rec.durSum) || int(rec.durAvg) * requests;

    stmts.push(
      db.prepare(upsert).bind(
        host,
        hour,
        requests,
        int(rec.status2xx),
        int(rec.status3xx),
        int(rec.status4xx),
        int(rec.status5xx),
        int(rec.statusOther),
        int(rec.bytes),
        int(rec.cacheHit),
        int(rec.cacheMiss),
        durSum,
        int(rec.durP95),
        now
      )
    );

    if (rec.origins && typeof rec.origins === 'object') {
      for (const [oid, n] of Object.entries(rec.origins)) {
        stmts.push(
          db.prepare(originUpsert).bind(host, hour, String(oid).slice(0, 64), int(n))
        );
      }
    }
  }

  try {
    if (typeof db.batch === 'function') {
      await db.batch(stmts);
    } else {
      for (const s of stmts) await s.run();
    }
    return true;
  } catch (err) {
    try {
      console.warn('[stats/d1] 写入失败：', String((err && err.message) || err));
    } catch {
      /* ignore */
    }
    // 写入失败可能是表结构变更导致，下次重新建表
    schemaReady = false;
    return false;
  }
}

// ============================================================================
// 查询
// ============================================================================

/**
 * 空聚合结构。
 * @returns {Object} 归零的统计对象
 */
function emptyAgg() {
  return {
    requests: 0,
    status2xx: 0,
    status3xx: 0,
    status4xx: 0,
    status5xx: 0,
    statusOther: 0,
    bytes: 0,
    cacheHit: 0,
    cacheMiss: 0,
    durSum: 0,
    durAvg: 0,
    cacheHitRate: 0,
  };
}

/**
 * 把 D1 行映射为标准统计对象。
 * @param {Object} row D1 查询结果行
 * @returns {Object} 标准统计对象
 */
function rowToAgg(row) {
  const requests = int(row.requests);
  const hit = int(row.cache_hit);
  const miss = int(row.cache_miss);
  const durSum = int(row.dur_sum);
  const chTotal = hit + miss;
  return {
    hour: row.hour,
    requests,
    status2xx: int(row.status_2xx),
    status3xx: int(row.status_3xx),
    status4xx: int(row.status_4xx),
    status5xx: int(row.status_5xx),
    statusOther: int(row.status_other),
    bytes: int(row.bytes),
    cacheHit: hit,
    cacheMiss: miss,
    durSum,
    durP95: int(row.dur_p95),
    durAvg: requests > 0 ? Math.round(durSum / requests) : 0,
    cacheHitRate: chTotal > 0 ? Math.round((hit / chTotal) * 10000) / 100 : 0,
  };
}

/**
 * 查询指定 host 最近 N 小时的统计。接口形状与 kvDriver.queryStats 完全一致，
 * 便于管理后台无差别消费。
 *
 * D1 不可用时返回 `available:false` 的空结构，不抛异常。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} host 主机名
 * @param {number} [hours=24] 回溯小时数
 * @returns {Promise<{driver:string, host:string, hours:number, total:Object, series:Object[], available:boolean}>}
 */
export async function queryStats(ctx, host, hours = 24) {
  const h = Math.min(MAX_QUERY_HOURS, Math.max(1, Math.floor(Number(hours) || 24)));
  const target = normHost(host);
  const result = {
    driver: 'd1',
    host: target,
    hours: h,
    total: emptyAgg(),
    series: [],
    available: false,
  };

  const db = getD1(ctx && ctx.env);
  if (!db) return result;

  const ready = await ensureSchema(db);
  if (!ready) return result;
  result.available = true;

  const since = hourKey(Date.now() - (h - 1) * 3600000);

  try {
    const res = await db
      .prepare(
        `SELECT * FROM ${TABLE} WHERE host = ?1 AND hour >= ?2 ORDER BY hour ASC LIMIT ?3`
      )
      .bind(target, since, h)
      .all();

    const rows = (res && res.results) || [];
    const total = emptyAgg();
    for (const row of rows) {
      const agg = rowToAgg(row);
      result.series.push(agg);
      total.requests += agg.requests;
      total.status2xx += agg.status2xx;
      total.status3xx += agg.status3xx;
      total.status4xx += agg.status4xx;
      total.status5xx += agg.status5xx;
      total.statusOther += agg.statusOther;
      total.bytes += agg.bytes;
      total.cacheHit += agg.cacheHit;
      total.cacheMiss += agg.cacheMiss;
      total.durSum += agg.durSum;
    }
    total.durAvg = total.requests > 0 ? Math.round(total.durSum / total.requests) : 0;
    const chTotal = total.cacheHit + total.cacheMiss;
    total.cacheHitRate = chTotal > 0 ? Math.round((total.cacheHit / chTotal) * 10000) / 100 : 0;
    result.total = total;

    // 附带源站分布
    try {
      const oRes = await db
        .prepare(
          `SELECT origin_id, SUM(requests) AS n FROM stats_origin_hourly
           WHERE host = ?1 AND hour >= ?2 GROUP BY origin_id ORDER BY n DESC LIMIT 32`
        )
        .bind(target, since)
        .all();
      const origins = {};
      for (const row of (oRes && oRes.results) || []) origins[row.origin_id] = int(row.n);
      result.total.origins = origins;
    } catch {
      result.total.origins = {};
    }
  } catch (err) {
    try {
      console.warn('[stats/d1] 查询失败：', String((err && err.message) || err));
    } catch {
      /* ignore */
    }
  }

  return result;
}

/**
 * 列出有统计数据的 host（管理后台下拉框用）。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Promise<string[]>} host 列表
 */
export async function listStatHosts(ctx) {
  const db = getD1(ctx && ctx.env);
  if (!db) return [];
  if (!(await ensureSchema(db))) return [];
  try {
    const res = await db.prepare(`SELECT DISTINCT host FROM ${TABLE} LIMIT 500`).all();
    return ((res && res.results) || []).map((r) => r.host);
  } catch {
    return [];
  }
}

/**
 * 清空指定 host 的统计数据。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {string} host 主机名
 * @returns {Promise<boolean>} 是否成功
 */
export async function clearStats(ctx, host) {
  const db = getD1(ctx && ctx.env);
  if (!db) return false;
  if (!(await ensureSchema(db))) return false;
  const target = normHost(host);
  try {
    const stmts = [
      db.prepare(`DELETE FROM ${TABLE} WHERE host = ?1`).bind(target),
      db.prepare(`DELETE FROM stats_origin_hourly WHERE host = ?1`).bind(target),
    ];
    if (typeof db.batch === 'function') await db.batch(stmts);
    else for (const s of stmts) await s.run();
    return true;
  } catch {
    return false;
  }
}

/**
 * 清理超过保留期的历史数据（与 KV 的 7 天 TTL 对齐，可由管理面定期触发）。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {number} [keepDays=30] 保留天数
 * @returns {Promise<boolean>} 是否成功
 */
export async function pruneStats(ctx, keepDays = 30) {
  const db = getD1(ctx && ctx.env);
  if (!db) return false;
  if (!(await ensureSchema(db))) return false;
  const days = Math.max(1, Math.floor(Number(keepDays) || 30));
  const cutoff = hourKey(Date.now() - days * 24 * 3600000);
  try {
    const stmts = [
      db.prepare(`DELETE FROM ${TABLE} WHERE hour < ?1`).bind(cutoff),
      db.prepare(`DELETE FROM stats_origin_hourly WHERE hour < ?1`).bind(cutoff),
    ];
    if (typeof db.batch === 'function') await db.batch(stmts);
    else for (const s of stmts) await s.run();
    return true;
  } catch {
    return false;
  }
}
