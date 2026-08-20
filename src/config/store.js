/**
 * ============================================================================
 * config/store.js —— 配置存储层（KV + isolate 内存缓存）
 * ----------------------------------------------------------------------------
 * 两级缓存设计：
 *
 *   请求 → [L1: isolate 内存 Map] → [L2: KV] → [L3: defaults 兜底]
 *
 * L1 的意义：Workers 的 isolate 会被复用来处理成百上千个请求，
 * 加一层 30 秒内存缓存后，绝大多数请求的 KV 读取次数降为 0，
 * 既省配额又省延迟（KV 冷读约 10-100ms，内存读 <0.01ms）。
 *
 * 一致性权衡：
 *   - KV 本身是最终一致的，写入后全球同步需数十秒
 *   - 叠加 L1 缓存后，配置变更最长需要 configCacheTtl + KV同步时间 才全量生效
 *   - 这对 CDN 配置场景完全可接受，管理面会向用户提示
 *
 * 降级策略：
 *   - 读失败 → 返回默认值，保证数据面不中断（CDN 可用性优先）
 *   - 写失败 → 抛出明确错误，让管理面告知用户，绝不静默失败
 * ============================================================================
 */

import { getKV } from '../platform/kv.js';
import { track as trackSubreq } from '../platform/subreqBudget.js';
import { encryptSecret } from '../utils/cipher.js';
import { BAKE_DEFAULTS } from './baked.defaults.js';
import {
  DEFAULT_GLOBAL,
  DEFAULT_GLOBAL_RULES,
  cloneGlobal,
  cloneGlobalRules,
  deepClone,
} from './defaults.js';
import { STAGE_ORDER, GLOBAL_ONLY_STAGE_ORDER } from './stages.js';
import { validateGlobal, validateGlobalRulesStages } from './schema.js';
import { registerDomain, allocBytes, releaseBytes, syncEntries } from '../platform/memBudget.js';

// ============================================================================
// 全局版本号（ProxySQL 式三层模型的核心：runtime 内存 ↔ canonical 内存 ↔ 存储）
// ----------------------------------------------------------------------------
// 多 isolate 下没有共享内存，因此用 KV 里的单一版本号 key 充当「跨 isolate 广播」：
//   - 任何写入（全局配置 / 站点 / 源站池 / 全站规则）完成后自增版本号
//   - 读取命中 L1 前，先比对「本地缓存的版本号」与「KV 当前版本号」
//     - 一致 → 直接返回 L1（<0.01ms，省配额）
//     - 不一致 → 丢弃 L1、重拉 KV、刷新本地
// 版本号本身极小，本地再缓存采用「指数动态退避三档」[2s,60s,180s] 进一步省配额：
// 空闲越久轮询越慢（稳态 180s/次 → 每 isolate ≈ 480 次/天，远低于 10 万/天上限），
// 一旦检测到变更立即回到 2s 激进档快速收敛（2~6s 内全站生效）。这是「主动失效」
// 而非「盲等 TTL 过期」，彻底消除「改了配置必须重新部署才生效」的问题。
// 三个平台（CF Workers / EdgeOne / 阿里云 ESA）统一以 KV 免费读 10 万/天为额度上限。
// 写入流程统一为：改本地内存(立即生效本 isolate) → 落库 KV → 自增版本号。
// ============================================================================

/**
 * 全局版本号 key（单一值，跨 isolate 真相源广播位）。
 * 值语义：分钟级 UTC 时间戳（Math.floor(Date.now()/1000/60)），整数。
 * 同一分钟内任意写入值相同，仅用于跨 isolate 相等性比对以判断配置是否变化；
 * 不表示「连续递增序列」，旧的数字版本号在首次写入时被时间戳直接覆盖。
 */
const K_VERSION = 'cfg:version';

/**
 * 版本号本地再缓存时长（毫秒）——采用「分档线性回退」，而非指数退避。
 * 档位表（秒）：[2, 20, 60, 120, 200, 300, 400, 500, 600, 600]，共 10 档。
 *   - 起步 2s 激进档，每档连续命中 VERSION_HOLD_ROUNDS 次版本号不变后才退到
 *     下一档（步进恒为 1，不跳跃，符合「线性回退」）。
 *   - 命中版本号变化立即回到 0 档（2s），全站快速收敛到新配置。
 *   - 稳态封顶 600s：达上限后每 isolate ≈ 86400/600 ≈ 144 次/天，远低于额度。
 * 达到 600s 上限的时间（理想静态、无版本变化，每档 hold=9 次）：
 *   通过前 8 档（2/20/60/120/200/300/400/500s）即进入 600s 封顶档：
 *     累计 = 9*(2+20+60+120+200+300+400+500) = 9*1602 = 14418s ≈ 4.0 小时。
 *   满足「理想静态约 4 小时后才达到 600 秒上限」的约束。
 * 常数可按需微调（HOLD 越小收敛越快、KV 读越多），但不改变
 * 「2s 起、600s 封顶、约 4 小时达上限、每档触发 N 次」的约束。
 */
const VERSION_POLL_LEVELS_MS = [2_000, 20_000, 60_000, 120_000, 200_000, 300_000, 400_000, 500_000, 600_000, 600_000];
/** 每档连续命中（版本号不变）多少次后才退避到下一档。 */
const VERSION_HOLD_ROUNDS = 9;

/**
 * 全局配置变更回调（如 statsDriver 切换需重建单例）。
 * 由 collector.js 等模块在初始化时注册，store.js 不反向 import 它们，
 * 避免循环依赖。getGlobal 检测到相关字段变化时调用。
 * @type {Array<(next:object, prev:object|null)=>void>}
 */
const _globalChangeListeners = [];

/** 注册全局配置变更监听（幂等：同一函数只注册一次）。 */
export function onGlobalChange(fn) {
  if (typeof fn === 'function' && !_globalChangeListeners.includes(fn)) {
    _globalChangeListeners.push(fn);
  }
}

/**
 * 版本号读取（分档线性回退）：先走本地退避缓存，未命中才读 KV。
 * 返回 Promise<number>（无版本号时返回 0，表示「首次/未初始化」）。
 * 读取失败降级为 -1，调用方据此选择「保守：不失效」（宁可多等，绝不丢配置）。
 *
 * 退避状态机（详见 VERSION_POLL_LEVELS_MS 注释）：
 *   - 本次读到的版本号与上次不同（检测到配置变更）→ 回到 0 档（2s），
 *     并把 holdLeft 重置为 VERSION_HOLD_ROUNDS，全站快速收敛到新值。
 *   - 本次读到的版本号与上次相同（空闲）→ holdLeft 减 1；
 *       若仍 > 0 则维持当前档位，否则退到下一档并重置 holdLeft（每档触发
 *       VERSION_HOLD_ROUNDS 次后才回退，步进恒为 1，符合「分档线性回退」）。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<number>}
 */
let _verState = {
  // 最近一次从 KV 读到的版本号
  value: 0,
  // 当前轮询档位下标（0=2s, …, 8/9=600s 封顶）
  level: 0,
  // 当前档剩余保持轮数（每档触发 VERSION_HOLD_ROUNDS 次后才退到下一档）
  holdLeft: VERSION_HOLD_ROUNDS,
  // 本地退避缓存过期时间（ms 时间戳）
  expireAt: 0,
};
async function readVersion(ctx) {
  const now = Date.now();
  if (_verState.expireAt > now) return _verState.value;

  const raw = await readJson(ctx, K_VERSION);
  const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;

  if (_verState.value !== v) {
    // 版本号变化：回到激进档（2s），满 hold，快速稳定全站
    _verState.level = 0;
    _verState.holdLeft = VERSION_HOLD_ROUNDS;
  } else if (_verState.holdLeft > 1) {
    // 空闲且当前档未触发满：维持当前档，hold 减 1
    _verState.holdLeft -= 1;
  } else {
    // 当前档已触发满：线性退到下一档（步进 1，不跳跃），并重置 hold
    _verState.level = Math.min(_verState.level + 1, VERSION_POLL_LEVELS_MS.length - 1);
    _verState.holdLeft = VERSION_HOLD_ROUNDS;
  }

  _verState.value = v;
  _verState.expireAt = now + VERSION_POLL_LEVELS_MS[_verState.level];
  return v;
}

/**
 * 当前分钟级 UTC 时间戳作为配置版本号。
 * 取 Date.now()（毫秒）向下取整到分钟：Math.floor(now / 1000 / 60)。
 * 同一分钟内的任意时刻结果相同（余数被 floor 截断），跨分钟边界 +1。
 * 仅用于跨 isolate 判断「配置是否变化」，不依赖连续递增或大小比较。
 * @returns {number} 整数，分钟级时间戳
 */
function currentMinuteVersion() {
  return Math.floor(Date.now() / 1000 / 60);
}

/**
 * 以分钟级 UTC 时间戳刷新全局版本号（写入完成后调用）。
 * 失败不抛（版本号只是优化，写入本身已落库），仅吞掉并记录。
 * 旧的数字版本号在首次调用时被时间戳直接覆盖，不兼容、不迁移。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<void>}
 */
async function bumpVersion(ctx) {
  try {
    // 直接写入当前分钟级时间戳（不读旧值、不 +1）。
    // 同 1 分钟内多次写入为同一值，仅分钟边界变化时才触发其它 isolate 重拉。
    const next = currentMinuteVersion();
    await writeJson(ctx, K_VERSION, next);
    // 刷新本地版本号状态：立即看到自己刚写入的新版本，并进入激进档（2s），
    // 使本 isolate 后续请求快速稳定（其它 isolate 经 KV 版本号同步后各自收敛）。
    _verState.value = next;
    _verState.level = 0;
    _verState.holdLeft = VERSION_HOLD_ROUNDS;
    _verState.expireAt = Date.now() + VERSION_POLL_LEVELS_MS[0];
  } catch (err) {
    console.error('[store] 刷新配置版本号失败（已忽略，写入本身已落库）:', err?.message);
  }
}

/**
 * 通知全局配置变更监听者（如 statsDriver 重建）。
 * @param {object} next 新配置
 * @param {object|null} prev 旧配置（可能来自 L1，可能为 null）
 */
function emitGlobalChange(next, prev) {
  for (const fn of _globalChangeListeners) {
    try {
      fn(next, prev);
    } catch (err) {
      console.error('[store] onGlobalChange 监听器异常（已忽略）:', err?.message);
    }
  }
}

// ----------------------------------------------------------------------------
// KV Key 常量
// ----------------------------------------------------------------------------

const K_GLOBAL = 'cfg:global';

/**
 * 站点族合并键：原「site:_index + site:<host>×N」散乱多键合并为单键。
 * 结构 = { hosts:[], wildcards:[{pattern,host}], byHost:{ host:site } }。
 * 使全量快照加载只读固定 5 键（cfg:version / cfg:global / cfg:global_rules /
 * cfg:sites / cfg:pools），读键数不随站点/源站池数量增长。
 */
const K_SITES = 'cfg:sites';

/**
 * 源站池族合并键：原「pool:_index + pool:<id>×M」散乱多键合并为单键。
 * 结构 = { ids:[], byId:{ id:pool } }。理由同 K_SITES。
 */
const K_POOLS = 'cfg:pools';

/**
 * 配置同步「接收开关」键。
 *
 * 该键存在且未过期 == 接收接口开放；键不存在 == 接收接口拒绝一切请求。
 * 开关完全由数据（KV）承载，不依赖任何源码/环境变量改动或重新部署，
 * 因此「临时开放一次、用完即关」无需发版。
 * 值结构见 SyncToken typedef。
 */
const K_SYNC_TOKEN = 'sync:token';

/**
 * 配置同步校验码默认有效期（秒）= 10 分钟。
 *
 * 取值权衡：足够完成一次人工「复制校验码 → 到发送方粘贴 → 推送」的操作，
 * 又足够短以至于即便用户忘记手动关闭，接口也会自动收口。
 * 同时必须 >= 60，因为 CF KV 的 expirationTtl 最小值为 60 秒
 * （见 platform/kv.js 的 put，会强制 Math.max(60, ttl)）。
 */
export const SYNC_TOKEN_TTL_SEC = 600;

/**
 * 单次 listSites 调用最多读取的站点数。
 * Workers 单请求 subrequest 上限为 50（免费版），这里留出余量给
 * 索引读、鉴权、统计等其它 KV 操作。
 */
const MAX_SITES_PER_LIST = 30;

/**
 * listAllSites 自动翻页的总量硬上限。
 * 超过此数量时停止扫描并返回 truncated=true，宁可少返回也不让请求被平台掐断。
 */
const MAX_TOTAL_SITES_SCAN = 300;

// ----------------------------------------------------------------------------
// L1 内存缓存
// ----------------------------------------------------------------------------

/** @type {Map<string, {value:any, expireAt:number}>} */
const _mem = new Map();

/** 内存缓存条目硬上限（兜底最大值），防止泛域名场景下无限增长导致 isolate 内存溢出 */
const MEM_MAX = 500;

/**
 * 单条配置对象的估算字节（用于 memBudget 记账与配额推导）。
 * 站点/源站池配置序列化后通常几百 B ~ 几 KB，取 2048B 作为保守初值，
 * memBudget 会按运行时采样自校准（见 platform/memBudget.js）。
 * @param {any} entry
 * @returns {number}
 */
function estimateConfigBytes(entry) {
  if (!entry || typeof entry !== 'object') return 2048;
  try {
    return Math.max(64, JSON.stringify(entry).length + 64);
  } catch {
    return 2048;
  }
}

/**
 * 把当前 _mem 条目数回传给 memBudget（evict 后校正记账，避免只增不减）。
 * @param {boolean} aggressive 是否激进回收（config 域只在硬水位被调用，且只清过期项）
 * @returns {void}
 */
function evictConfig(aggressive) {
  // config 域保守：只清过期项，绝不丢弃未过期配置。
  // 清后下次读会回退真实 KV（memGet miss → readJson），保证前端渲染永远正确。
  // 即便 aggressive=true（硬水位兜底），也只清过期项——未过期配置宁可占用内存
  // 也不返回陈旧/缺失，宁可让硬水位触发 ratelimit/stats 等可容忍域先释放。
  const now = Date.now();
  for (const [k, v] of _mem) {
    if (now > v.expireAt) _mem.delete(k);
  }
  syncEntries('config', _mem.size);
}

// 向统一内存预算单例注册「config 域」。
// - weight 给到 3（相对 stats/ratelimit 更高权重，配置是高频热路径，应优先保活）
// - allowAggressiveEvict=false：软水位永不主动清配置；仅硬水位时 evict(true)
//   也只清过期项，且清后读必回 KV（见 evictConfig 注释），保证配置及时生效与正确。
registerDomain('config', {
  weight: 3,
  estimateBytes: estimateConfigBytes,
  evict: evictConfig,
  allowAggressiveEvict: false,
});

/**
 * 由 memBudget 配额推导的「配置 L1 条目上限」。
 * 取 min(MEM_MAX, 配额字节 / 估算每条约字节)，并至少为 1。
 * 这样内存预算缩小时，配置缓存条目上限随之收紧，形成跨域统一约束。
 * @returns {number}
 */
function configEntryCap() {
  try {
    const snap = getDomainQuota('config');
    if (snap > 0) {
      const byBytes = Math.floor(snap / estimateConfigBytes(null));
      return Math.max(1, Math.min(MEM_MAX, byBytes));
    }
  } catch {
    /* 拿不到配额时退回硬上限 */
  }
  return MEM_MAX;
}

/** 默认缓存 TTL（毫秒），实际值以 GlobalConfig.configCacheTtl 为准 */
let _ttlMs = 30_000;

/**
 * configCacheTtl=0（要求配置实时生效）时使用的最小缓存窗口。
 * 取一个足够短、用户无感的值，仅用于合并瞬时重复读、防止缓存穿透。
 */
const MIN_MEM_TTL_MS = 1_000;

/**
 * EdgeOne 平台下的 configCacheTtl 下限（毫秒）= 120 秒。
 *
 * 原因：EdgeOne KV 的读请求虽不计入 300 万次 Edge Function 执行额度
 * （KV 仅按空间占用计费），但每次冷读仍有 10-100ms 延迟，且跨节点最终
 * 一致窗口约 60 秒。把内存缓存窗口压到过低（如默认 30s 甚至 0）既拉高延迟，
 * 又无法缩短配置生效时间（被 KV 同步延迟卡死）。因此在 EO 平台把下限抬到
 * 120s：相同延迟体验下进一步压低 KV 读次数，同时让缓存窗口 >= KV 同步延迟，
 * 避免频繁读到旧值。该下限只作用于运行时生效值，不写回 KV、不覆盖用户显式
 * 设置的更大值。
 */
const EO_MIN_CONFIG_TTL_MS = 120_000;

// ----------------------------------------------------------------------------
// 启动时全量快照加载
// ----------------------------------------------------------------------------
//
// KV 定位：持久化静态配置文件存储，仅作为「启动时的初始数据源」。系统启动后
// 通过 loadConfigSnapshot 一次性把固定 5 键（cfg:version / cfg:global /
// cfg:global_rules / cfg:sites / cfg:pools）全量读入内存，之后运行时数据面
// 只读内存，不再访问 KV。KV 仅在开发期/部署初期由后台管理写入，运行时无写。
//
// 同步策略：「版本感知 + 全量快照」。后台 reconcileVersion 定期比对 KV 版本号
// 与本地 _cachedGlobalVersion，不一致则 reloadConfigSnapshot 整体重拉一遍，
// 而不是按需逐键拉取。

/** 快照是否已加载（本 isolate 生命周期内标志）。 */
let _snapshotLoaded = false;
/** 快照加载并发去重：同一 isolate 冷启动并发请求只打一次 KV。 */
let _snapshotPromise = null;

/**
 * 全量快照的持久内存副本（无 TTL 引用，独立于 _mem 的 TTL/LRU 缓存）。
 * 快照加载后运行时数据面一律从这里读，实现「启动加载后纯内存、不再访问 KV」。
 * 结构：{ version:number, global:object, globalRules:{stages}, sites:object, pools:object }
 */
const _snapshotState = {
  version: 0,
  global: null,
  globalRules: null,
  sites: null,
  pools: null,
};

/**
 * 旧散乱键迁移 → 新合并键 cfg:sites。
 * 当新键缺失但旧键（site:_index + 若干 site:<host>）存在时，一次性重建。
 * 仅在快照加载阶段调用（非运行时写），避免破坏开发期已写入的存量数据。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<{hosts:string[], wildcards:Array<{pattern:string,host:string}>, byHost:Object<string,object>}|null>}
 *  成功迁移返回新集合；无迁移必要返回 null。
 */
async function migrateLegacySiteKeys(ctx) {
  const entityKeys = [];
  // 一次性批量读：索引 + 所有实体键（仅占 1 个子请求预算，规避 ESA 4 子请求上限）。
  // 先以 site:_index 占位推断实体键，但索引本身未知前无法确定实体键集合；
  // 故分两段：索引单独读（决定是否存在及实体键），实体批量读合并为一次子请求。
  const idx = await readJson(ctx, 'site:_index');
  if (!idx || !Array.isArray(idx.hosts)) return null;
  const hosts = idx.hosts.filter((h) => typeof h === 'string');
  if (hosts.length === 0) return null;
  for (const host of hosts) entityKeys.push(`site:${String(host).toLowerCase()}`);
  const sites = await readJsonMany(ctx, entityKeys);
  const coll = { hosts: [], wildcards: [], byHost: {} };
  hosts.forEach((host, i) => {
    const h = String(host).toLowerCase();
    const site = sites[i];
    if (site && typeof site === 'object') {
      coll.byHost[h] = site;
      coll.hosts.push(h);
      if (h.startsWith('*.')) coll.wildcards.push({ pattern: h, host: h });
    }
  });
  if (coll.hosts.length > 0) {
    await writeJson(ctx, K_SITES, coll);
    return coll;
  }
  return null;
}

/**
 * 旧散乱键迁移 → 新合并键 cfg:pools。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<{ids:string[], byId:Object<string,object>}|null>}
 */
async function migrateLegacyPoolKeys(ctx) {
  const idx = await readJson(ctx, 'pool:_index');
  if (!idx || !Array.isArray(idx.ids)) return null;
  const ids = idx.ids.filter((x) => typeof x === 'string');
  if (ids.length === 0) return null;
  const entityKeys = ids.map((id) => `pool:${id}`);
  const pools = await readJsonMany(ctx, entityKeys);
  const coll = { ids: [], byId: {} };
  ids.forEach((id, i) => {
    const pool = pools[i];
    if (pool && typeof pool === 'object') {
      coll.byId[id] = pool;
      coll.ids.push(id);
    }
  });
  if (coll.ids.length > 0) {
    await writeJson(ctx, K_POOLS, coll);
    return coll;
  }
  return null;
}

/**
 * 全量加载配置快照进内存（启动时一次性）。
 *
 * 幂等、模块级去重：仅在 _snapshotLoaded 为假时执行，冷启动一次性读 KV 的
 * 固定 5 键（cfg:version / cfg:global / cfg:global_rules / cfg:sites /
 * cfg:pools），校验/规范化后写入 _mem 缓存，并刷新 _cachedGlobalVersion 与
 * _ttlMs。任何单项读取失败不阻塞整体（能读多少算多少，缺失项由 defaults 兜底），
 * 保证可用性优先。旧散乱键（site:_index/site:*、pool:_index/pool:*）若存在则
 * 在此阶段迁移为合并键。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<void>}
 */
export async function loadConfigSnapshot(ctx) {
  if (_snapshotLoaded) return;
  if (_snapshotPromise) return _snapshotPromise;

  _snapshotPromise = (async () => {
    // 烘焙模式（ESA 静态壳）不读 KV，无需快照，直接标记就绪。
    if (isBakedMode(ctx)) {
      _snapshotLoaded = true;
      return;
    }

    // 1~5. 一次性批量读取全部固定配置键（仅 1 次子请求预算，规避 ESA 4 子请求上限）
    // 原方案逐键 readJson 共 5 次子请求，在 ESA 上直接撞线降级；改为 readJsonMany
    // 后后端（Webdis MGET / CF-EO 并行 GET）合并为一次/少量请求。
    const [verRaw, rawGlobal, rawRules, rawSites, rawPools] = await readJsonMany(ctx, [
      K_VERSION,
      K_GLOBAL,
      K_GLOBAL_RULES,
      K_SITES,
      K_POOLS,
    ]);

    // 1. 版本号
    const ver = typeof verRaw === 'number' && Number.isFinite(verRaw) ? verRaw : 0;
    _verState.value = ver;
    _cachedGlobalVersion = ver;
    _snapshotState.version = ver;

    // 2. 全局配置
    try {
      const cfg = rawGlobal ? validateGlobal(rawGlobal).value : cloneGlobal();
      _ttlMs = Math.max(0, (cfg.configCacheTtl ?? 60) * 1000);
      if (
        (ctx?.caps?.platform === 'edgeone' || ctx?.caps?.platform === 'eo') &&
        _ttlMs < EO_MIN_CONFIG_TTL_MS
      ) {
        _ttlMs = EO_MIN_CONFIG_TTL_MS;
      }
      _snapshotState.global = cfg;
      memSet(K_GLOBAL, cfg);
    } catch (err) {
      console.error('[store] 快照加载全局配置失败（已降级为默认值）:', err?.message);
    }

    // 3. 全站规则（规范化后进内存，供 getGlobalRules 纯内存读）
    try {
      const stages = _normalizeGlobalRulesInMemory(rawRules);
      _snapshotState.globalRules = { stages };
      memSet(K_GLOBAL_RULES, { stages });
    } catch (err) {
      console.error('[store] 快照加载全站规则失败（已降级为默认值）:', err?.message);
    }

    // 4. 站点族 + 5. 源站池族（含旧散乱键迁移）
    try {
      let coll = rawSites;
      let siteColl = coll && typeof coll === 'object' ? normalizeSiteCollection(coll) : null;
      if (!siteColl || (siteColl.hosts.length === 0 && !coll)) {
        const migrated = await migrateLegacySiteKeys(ctx);
        siteColl = siteColl || normalizeSiteCollection(null);
        if (migrated) siteColl = migrated;
      }
      _snapshotState.sites = siteColl;
      memSet(K_SITES, siteColl);
    } catch (err) {
      console.error('[store] 快照加载站点失败（已降级为空）:', err?.message);
    }
    try {
      let coll = rawPools;
      let poolColl = coll && typeof coll === 'object' ? normalizePoolCollection(coll) : null;
      if (!poolColl || (poolColl.ids.length === 0 && !coll)) {
        const migrated = await migrateLegacyPoolKeys(ctx);
        poolColl = poolColl || normalizePoolCollection(null);
        if (migrated) poolColl = migrated;
      }
      _snapshotState.pools = poolColl;
      memSet(K_POOLS, poolColl);
    } catch (err) {
      console.error('[store] 快照加载源站池失败（已降级为空）:', err?.message);
    }

    _snapshotLoaded = true;
    console.log('[store] 配置快照已全量加载（cfg:version=' + ver + '）');
  })().catch((err) => {
    // 整体兜底：即使失败也标记已尝试，避免每请求重试；缺失项由读取路径兜底。
    console.error('[store] 配置快照加载失败（已降级，读取路径将按需兜底）:', err?.message);
    _snapshotLoaded = true;
  }).finally(() => {
    _snapshotPromise = null;
  });

  return _snapshotPromise;
}

/**
 * 全量快照重载（版本号比对命中变化时调用）：清空 config 内存缓存后整体重拉。
 * 这是「全量快照」的核心——版本号一变，一次性重拉全部配置，而非按需逐键更新。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<void>}
 */
export async function reloadConfigSnapshot(ctx) {
  _snapshotLoaded = false;
  invalidateMemCache();
  await loadConfigSnapshot(ctx);
}

/**
 * 本 isolate 是否已加载配置快照（供运行时读取函数判断纯内存读）。
 * @returns {boolean}
 */
export function isSnapshotLoaded() {
  return _snapshotLoaded;
}

/** reconcileVersion 并发去重：同一 isolate 同一时刻只跑一次版本比对。 */
let _reconcileInFlight = false;

/**
 * 后台版本号比对（请求末尾由 ctx.waitUntil 触发，不阻塞响应）。
 *
 * 同步策略核心：「版本感知 + 全量快照」。按分档线性回退状态机周期性读取 KV
 * 版本号（readVersion 内部由 expireAt 限流，实际读 KV 频率受回退档位控制），
 * 与本地 _cachedGlobalVersion 比对：
 *   - 不一致 → 配置变更，reloadConfigSnapshot 整体重拉全部配置进内存；
 *   - 一致   → 无事，仅维持回退状态。
 * 幂等去重：并发请求只执行一次比对，避免打爆 KV 读额度。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<void>}
 */
export async function reconcileVersion(ctx) {
  if (_reconcileInFlight) return;
  _reconcileInFlight = true;
  try {
    // 快照未加载（冷启动首个请求竞态）先补一次加载，保证后续比对有基准版本号。
    if (!_snapshotLoaded) {
      await loadConfigSnapshot(ctx);
      return;
    }
    // 受回退状态机限流的版本号读取；未到轮询时刻时 expireAt 直接短路，零 KV 读。
    const v = await readVersion(ctx);
    if (v < 0) return; // 版本号读取失败，保守不失效（宁可多等，绝不丢配置）
    if (v !== _cachedGlobalVersion) {
      console.log(`[store] 检测到配置版本号变化（${_cachedGlobalVersion} → ${v}），全量重拉快照`);
      await reloadConfigSnapshot(ctx);
    }
  } catch (err) {
    // 后台任务失败不影响请求响应，仅记录
    console.error('[store] reconcileVersion 失败（已忽略）:', err?.message);
  } finally {
    _reconcileInFlight = false;
  }
}

/**
 * 读 L1 内存缓存。
 *
 * 管理面（`ctx.mgmt` 为真）请求会**跳过 L1 读缓存**直读 KV：
 * 管理面全是人工低频操作，单次多几十毫秒完全可接受；而 L1 缓存在
 * 多 isolate 间不共享，写入只清当前 isolate，会导致「刚新建的站点在
 * 列表里看不到、刷新也读不到、必须等 TTL 过期（或退出重登恰好命中写入
 * isolate）才出现」的一致性问题。让管理面读绕过 L1 即可让写后立刻读
 * 到最新 KV 值。数据面（CDN 请求）仍走完整 L1 缓存以保性能。
 */
function memGet(ctx, key) {
  if (ctx && ctx.mgmt) return undefined;
  const hit = _mem.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expireAt) {
    _mem.delete(key);
    return undefined;
  }
  // 【真 LRU】命中后重新插入，把该键移到 Map 尾部（最近使用端）。
  // 旧实现命中时不移动位置，淘汰순序完全由「插入时间」决定，实为 FIFO：
  // 高频访问的热点站点会被一批一次性访问的冷门域名挤出缓存，命中率骤降。
  _mem.delete(key);
  _mem.set(key, hit);
  return hit.value;
}

function memSet(key, value) {
  // 【为什么 TTL<=0 仍要缓存】configCacheTtl=0 语义是「配置改动立即生效」，
  // 而不是「关闭防穿透」。旧实现在此直接 return，导致不存在的 host 无法被
  // 负缓存拦截：攻击者用随机子域名扫描即可让每个请求都直穿 KV，打爆读配额。
  // 因此这里对 TTL<=0 退化为一个极短的保护窗口，既保证配置几乎实时生效，
  // 又能把同一瞬间的重复穿透合并掉。
  const ttl = _ttlMs > 0 ? _ttlMs : MIN_MEM_TTL_MS;

  // 若键已存在，先记一笔释放，再写入时会重新 alloc（保持记账准确）。
  if (_mem.has(key)) releaseBytes('config', 1);

  // LRU：超限时淘汰最久未使用的（Map 头部），并释放其记账字节。
  // 上限由 memBudget 配额动态推导（configEntryCap），MEM_MAX 仅作兜底。
  const cap = configEntryCap();
  while (_mem.size >= cap) {
    const oldest = _mem.keys().next().value;
    if (oldest === undefined) break;
    _mem.delete(oldest);
    releaseBytes('config', 1);
  }
  _mem.set(key, { value, expireAt: Date.now() + ttl });
  // 写入即记账：memBudget 据此掌握占用并触发水位回收（统计/限流域优先释放）。
  allocBytes('config', value);
}

function memDel(key) {
  if (_mem.has(key)) {
    _mem.delete(key);
    releaseBytes('config', 1);
  }
}

/**
 * 清空 isolate 内存缓存。
 * 任何写操作后都应调用，使当前 isolate 立即看到新值。
 * 注意：只影响当前 isolate，其他 isolate 仍需等待 TTL 自然过期。
 */
export function invalidateMemCache() {
  const n = _mem.size;
  _mem.clear();
  if (n > 0) releaseBytes('config', n);
}

// ----------------------------------------------------------------------------
// 内部工具
// ----------------------------------------------------------------------------

/**
 * 是否处于「烘焙配置」模式（方案 A：静态部署 / 不依赖 KV）。
 *
 * 触发条件：环境变量 STATIC_CONFIG === '1'（ESA 端的 resolveEnv 会默认带上），
 * 且（可选地）存在部署专属的 baked.generated.js。在此模式下所有读取直接
 * 返回烘焙对象、所有写入被拒绝——ESA 成为纯只读的边缘执行壳。
 *
 * 该模式通过环境变量开关而非运行时探测，是为了让「是否使用烘焙配置」成为部署
 * 形态决策（构建/控制台设置），而非依赖 KV 可用性自动推断，避免与主节点行为混淆。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {boolean}
 */
export function isBakedMode(ctx) {
  return !!(ctx?.env && ctx.env.STATIC_CONFIG === '1');
}

/**
 * 烘焙模式下「写入被拒」的统一错误。烘焙配置来自主节点导出的镜像，ESA 只有
 * 执行副本、没有管理权限，任何写操作都必须明确失败而非静默落到不存在的 KV。
 */
function throwBakedReadOnly(ctx) {
  const platform = ctx?.caps?.platform;
  const where = platform === 'aliyun-esa' || platform === 'esa' ? '阿里云 ESA' : '当前（烘焙配置）';
  throw new Error(
    `${where}运行在静态烘焙配置模式下，配置只读，无法在此节点修改。` +
      '请在主节点（如 Cloudflare 部署）修改配置后，重新导出并在这里重新构建部署。',
  );
}

/**
 * 懒加载部署专属烘焙配置（baked.generated.js，git 不追踪、由 --bake 生成）。
 * - 首次需要时动态 import（缓存结果，避免每次请求重复 import）；
 * - 文件不存在（CI 干净检出且未 --bake）或解析失败时，回退到入库的 BAKE_DEFAULTS
 *   （空占位），使 ESA 端走内置默认值——构建与运行都不会因模块缺失而崩。
 * 本加载器只在 isBakedMode 分支内被调用，非烘焙模式不会触发动态 import。
 * @returns {Promise<object>}
 */
let _bakedLoaded = null;
async function loadBaked() {
  if (_bakedLoaded) return _bakedLoaded;
  try {
    const mod = await import('./baked.generated.js');
    _bakedLoaded = mod.BAKED_CONFIG && typeof mod.BAKED_CONFIG === 'object' ? mod.BAKED_CONFIG : BAKE_DEFAULTS;
  } catch {
    _bakedLoaded = BAKE_DEFAULTS;
  }
  return _bakedLoaded;
}

/**
 * 在烘焙模式下取出对应 key 的静态对象（供 getXxx 直接返回，跳过 KV 与 L1）。
 * 不存在则返回 null，由调用方回退到内置默认。
 * @param {'global'|'globalRules'|'sites'|'pools'} key
 * @returns {Promise<any>}
 */
async function bakedGet(key) {
  const cfg = await loadBaked();
  const v = cfg?.[key];
  if (v === undefined) return null;
  return v;
}

/**
 * 获取 KV，不存在时抛出面向用户的明确错误（仅用于写路径）
 */
function requireKV(ctx) {
  if (isBakedMode(ctx)) {
    // 烘焙模式下 KV 必然不可用，直接报「只读」，不再往下走 REDIS_URL 提示分支。
    throwBakedReadOnly(ctx);
  }
  const kv = getKV(ctx.env);
  if (!kv) {
    const platform = ctx?.caps?.platform;
    let hint;
    if (platform === 'edgeone' || platform === 'eo') {
      hint = '未检测到 KV 绑定，配置无法保存。EdgeOne 请在「项目设置 → 存储绑定」中创建 KV 命名空间，并以 CDN_KV 为变量名绑定到本项目（KV 仅在 Edge Functions 中可用）';
    } else if (platform === 'aliyun-esa' || platform === 'esa') {
      hint = '未检测到 KV 绑定，配置无法保存。阿里云 ESA 的 EdgeKV 按量收费且无免费额度，本项目在 ESA 上统一禁用厂商 KV，持久化必须使用外置 Redis：请在 ESA 控制台设置环境变量 REDIS_URL（指向自建 Webdis/Redis，形如 https://your-webdis.example.com），可选 REDIS_TOKEN / REDIS_PREFIX。详见 docs/14-deploy-esa.md';
    } else {
      hint = '未检测到 KV 绑定，配置无法保存。请先创建 KV Namespace 并以 CDN_KV 为变量名绑定到本项目';
    }
    throw new Error(hint);
  }
  return kv;
}

/** 安全读取 JSON，失败返回 null（读路径专用，绝不抛错） */
async function readJson(ctx, key) {
  const kv = getKV(ctx.env);
  if (!kv) return null;
  // 子请求预算守卫：每次 KV 读都占 1 个子请求。ESA 每请求仅 ~4（官方两处冲突待实测），
  // 管理面一次请求常读多个集合（sites/pools/rules/stats），若无守卫易撞限。
  // 预算不足时直接返回 null，由上层走内存缓存 / 默认值优雅降级，绝不盲目撞墙。
  if (!trackSubreq(1, ctx)) {
    console.warn(`[store] 子请求预算不足，跳过读取 ${key}`);
    return null;
  }
  try {
    return await kv.get(key, 'json');
  } catch (err) {
    console.error(`[store] 读取 ${key} 失败:`, err?.message);
    return null;
  }
}

/**
 * 批量安全读取 JSON（读路径专用，绝不抛错）。
 * 核心优化：把「读 N 个键 = N 次子请求预算」合并为「1 次」。
 * ESA 强制每请求最多 ~4 个 fetch 子请求，逐键 GET 在快照加载（version/global/
 * rules/sites/pools 共 5 键）或旧散乱键迁移（索引 + 逐实体）时极易撞限并降级为 null。
 * 后端若支持批量读（Webdis 走单次 MGET，CF/EO/ESA 走并行 GET），本函数优先调用
 * kv.batchGet 合并为一次/少量请求；旧适配器或测试桩若无 batchGet 方法，则回退到
 * 逐键 readJson（行为与原先完全一致，零侵入）。
 * 返回数组与 keys 严格同序，任意键缺失/失败对应位为 null。
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string[]} keys 键名数组
 * @returns {Promise<(any|null)[]>}
 */
async function readJsonMany(ctx, keys) {
  const list = Array.isArray(keys) ? keys : [];
  const kv = getKV(ctx.env);
  if (!kv) return list.map(() => null);
  // 整组批量读只占 1 个子请求预算（而非每键各 1），把 N 次子请求压成 1 次。
  if (!trackSubreq(1, ctx)) {
    console.warn(`[store] 子请求预算不足，跳过批量读取 ${list.length} 个键`);
    return list.map(() => null);
  }
  if (typeof kv.batchGet === 'function') {
    try {
      const res = await kv.batchGet(list, 'json');
      if (Array.isArray(res) && res.length === list.length) return res;
      // 长度不符（不应发生）→ 回退逐键，保证顺序与数量正确
      console.warn('[store] batchGet 返回长度异常，回退逐键读取');
    } catch (err) {
      console.error('[store] 批量读取失败，回退逐键:', err?.message);
    }
  }
  // 回退：逐键（每个键各自扣 1 预算；无 batchGet 时的兼容路径）
  return Promise.all(list.map((k) => readJson(ctx, k)));
}

/** 写入 JSON，失败向上抛 */
async function writeJson(ctx, key, value) {
  const kv = requireKV(ctx);
  await kv.put(key, JSON.stringify(value));
}

// ----------------------------------------------------------------------------
// 全局配置
// ----------------------------------------------------------------------------

/**
 * 读取全局配置。
 * adminPath 的优先级：KV 中的显式配置 > env.ADMIN_PATH > 默认值
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<import('../contracts.js').GlobalConfig>}
 */
export async function getGlobal(ctx) {
  // 烘焙模式：直接返回烤制的 global（合并内置默认补齐缺失字段），跳过 KV / 版本号 / L1。
  if (isBakedMode(ctx)) {
    const raw = await bakedGet('global');
    const cfg = raw ? validateGlobal(raw).value : cloneGlobal();
    // adminPath 同样允许 env 兜底（见下方非烘焙分支的同款逻辑）。
    const envPath = ctx.env?.ADMIN_PATH;
    if (
      typeof envPath === 'string' &&
      /^[a-zA-Z0-9_/-]+$/.test(envPath) &&
      (cfg.adminPath === '__panel' || cfg.adminPath == null || cfg.adminPath === '')
    ) {
      cfg.adminPath = envPath.replace(/^\/+/, '').replace(/\/+$/, '') || cfg.adminPath;
    }
    return cfg;
  }

  // —— 运行时纯内存读（启动时全量快照已加载）——
  // KV 定位为「启动时的初始数据源」：快照加载后配置即持久使用，运行时不再读 KV。
  // 版本号比对已从热路径移除，改由后台 reconcileVersion 周期性比对、命中变化
  // 时 reloadConfigSnapshot 整体重拉。此处：
  //   - 快照已加载：数据面直接读持久内存快照 _snapshotState.global，零 KV 读
  //     （不依赖 TTL 缓存，彻底「启动加载后纯内存」）；
  //     管理面（ctx.mgmt）仍绕过快照直读 KV，确保写后立刻读到最新值。
  //   - 快照未加载（冷启动竞态）：回退到原 KV 直读路径，保证可用性。
  if (_snapshotLoaded && !ctx?.mgmt && _snapshotState.global) {
    return _snapshotState.global;
  }
  const cached = memGet(ctx, K_GLOBAL);
  if (_snapshotLoaded && cached) {
    if (!ctx?.mgmt) return cached;
    // 管理面要求直读最新 KV，丢弃快照缓存走下方 readJson
    memDel(K_GLOBAL);
  }

  const raw = await readJson(ctx, K_GLOBAL);

  let cfg;
  if (raw) {
    const res = validateGlobal(raw);
    cfg = res.value;
  } else {
    cfg = cloneGlobal();
  }

  // 环境变量的 adminPath 作为「兜底层」（非推荐路径，仅当用户确实在 Dashboard
  // 主动设了 ADMIN_PATH 变量时生效）：
  //   - 当 KV 中【未显式配置】adminPath（即仍为内置默认 __panel，或 KV 空）时，
  //     用环境变量覆盖，作为额外兜底。
  //   - 当用户已在管理面【显式】配置过 adminPath（非默认值），KV 优先，不被环境变量覆盖。
  // 正常推荐路径：部署脚本刻意不传 ADMIN_PATH，运行时用内置默认 __panel 兜底，
  // 部署后由用户在管理面把入口前缀改成随机串并存进 KV（最高优先级生效）。
  // 优先级最终为：KV 显式配置 > env.ADMIN_PATH（兜底）> 内置默认 __panel。
  const envPath = ctx.env?.ADMIN_PATH;
  if (
    typeof envPath === 'string' &&
    /^[a-zA-Z0-9_/-]+$/.test(envPath) &&
    (cfg.adminPath === '__panel' || cfg.adminPath == null || cfg.adminPath === '')
  ) {
    cfg.adminPath = envPath.replace(/^\/+/, '').replace(/\/+$/, '') || cfg.adminPath;
  }

  // 【顺序要求】必须先更新 _ttlMs 再 memSet，否则本次写入会沿用上一次的 TTL。
  //
  // 更重要的是：其它 getXxx（getSite/getPool）同样依赖 _ttlMs，而它们并不会
  // 自己去读全局配置。过去这依赖「app.js 在每个请求最前面先调 getGlobal」这一
  // 隐式顺序，一旦调整路由顺序或新增入口就会静默退化为默认 30s TTL。
  // 这里把它固化为函数内不变式：_ttlMs 只在此处被赋值，且永远早于任何 memSet。
  let ttlMs = Math.max(0, (cfg.configCacheTtl ?? 60) * 1000);
  // EdgeOne 平台抬高低限：详见 EO_MIN_CONFIG_TTL_MS 注释。
  // 兼容新旧 platform 标识（edgeone / eo）。
  if ((ctx?.caps?.platform === 'edgeone' || ctx?.caps?.platform === 'eo') && ttlMs < EO_MIN_CONFIG_TTL_MS) {
    ttlMs = EO_MIN_CONFIG_TTL_MS;
  }
  _ttlMs = ttlMs;

  // 快照未加载（冷启动兜底直读 KV）时，同步刷新本地版本号基准，
  // 使后续后台 reconcileVersion 有正确的比对起点。
  if (!_snapshotLoaded) {
    const newVer = await readVersion(ctx);
    _cachedGlobalVersion = newVer >= 0 ? newVer : _cachedGlobalVersion;
  }

  // 检测「配置内容变更」并通知监听者（如 statsDriver 切换需重建单例）。
  // 仅在确实重拉了 KV（非 L1 命中）时发生，避免每次请求都触发监听器。
  if (cached && cached !== cfg) {
    emitGlobalChange(cfg, cached);
  }

  memSet(K_GLOBAL, cfg);
  return cfg;
}

/**
 * 本 isolate 最近一次 getGlobal 看到的配置版本号。
 * 用于「主动失效」：下次 getGlobal 时与 KV 当前版本号比对，不一致则重拉。
 * 模块级单例，跨请求复用（isolate 生命周期内有效）。
 * @type {number}
 */
let _cachedGlobalVersion = 0;

/**
 * 写入全局配置
 * @param {import('../contracts.js').Ctx} ctx
 * @param {import('../contracts.js').GlobalConfig} global
 */
export async function putGlobal(ctx, global) {
  if (isBakedMode(ctx)) throwBakedReadOnly(ctx);
  const res = validateGlobal(global);
  // 校验会剥离未知字段，但密码哈希必须原样保留
  const value = {
    ...res.value,
    passwordHash: global.passwordHash || '',
    passwordSalt: global.passwordSalt || '',
  };
  // 写前先读旧值，供「变更监听」判断 statsDriver 等是否真的变化（避免无谓清桶）
  const prev = await readJson(ctx, K_GLOBAL);
  let prevCfg = null;
  if (prev) {
    try { prevCfg = validateGlobal(prev).value; } catch { prevCfg = null; }
  }

  await writeJson(ctx, K_GLOBAL, value);
  memDel(K_GLOBAL);
  memSet(K_GLOBAL, value);
  // 同步持久内存快照，使本 isolate 写后立即生效（数据面读 _snapshotState.global）
  _snapshotState.global = value;
  _ttlMs = Math.max(0, (value.configCacheTtl ?? 30) * 1000);

  // —— ProxySQL 式写入协议：改本地内存(立即生效本 isolate) → 落库 KV → 自增版本号 ——
  // 立即通知本 isolate 的监听者（如 statsDriver 重建），让本次写入立刻在本 isolate 生效；
  // 自增版本号则广播给其它 isolate，使其在 2s 内（KV 版本号同步窗口）自动重拉并生效。
  emitGlobalChange(value, prevCfg);
  await bumpVersion(ctx);
}

// ----------------------------------------------------------------------------
// 站点索引
// ----------------------------------------------------------------------------

/**
 * 规范化站点族集合：把任意历史形态的 cfg:sites 数据整理成稳定结构
 * `{ hosts:[], wildcards:[{pattern,host}], byHost:{ host:site } }`。
 * 幂等、纯函数，缺省回退到空索引语义（与 DEFAULT_SITE_INDEX 等价）。
 * @param {any} raw readJson(K_SITES) 返回值（可能为 null/旧结构）
 * @returns {{hosts:string[], wildcards:Array<{pattern:string,host:string}>, byHost:Object<string,object>}}
 */
function normalizeSiteCollection(raw) {
  const coll = {
    hosts: [],
    wildcards: [],
    byHost: {},
  };
  if (!raw || typeof raw !== 'object') return coll;

  // 优先按合并键结构（byHost）重建；兼容旧 {hosts, wildcards} 索引结构。
  if (raw.byHost && typeof raw.byHost === 'object') {
    for (const [host, site] of Object.entries(raw.byHost)) {
      if (!site || typeof site !== 'object') continue;
      const h = String(host).toLowerCase();
      if (site.host !== undefined && String(site.host).toLowerCase() !== h) site.host = h;
      coll.byHost[h] = site;
      if (!coll.hosts.includes(h)) coll.hosts.push(h);
      if (h.startsWith('*.')) coll.wildcards.push({ pattern: h, host: h });
    }
  } else if (Array.isArray(raw.hosts)) {
    // 旧 {hosts, wildcards} 索引：仅能还原 host 列表，实体数据需要时逐条缺失。
    coll.hosts = raw.hosts.filter((h) => typeof h === 'string').map((h) => h.toLowerCase());
    coll.wildcards = Array.isArray(raw.wildcards)
      ? raw.wildcards.filter((w) => w && typeof w.pattern === 'string')
      : [];
    // 由索引补齐 byHost 空壳，保证按 host 读取至少能命中列表。
    for (const h of coll.hosts) coll.byHost[h] = coll.byHost[h] || null;
  }
  return coll;
}

/**
 * 加载站点族集合（cfg:sites 单键）。
 * - 烘焙模式：由烤制的 sites 列表现场构建，结果进 L1 缓存。
 * - 普通模式：读 KV 单键 cfg:sites，规范化后进 L1 缓存（整族一个缓存键）。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<{hosts:string[], wildcards:Array<{pattern:string,host:string}>, byHost:Object<string,object>}>}
 */
async function getSiteCollection(ctx) {
  // 快照就绪后数据面直接读持久内存快照，零 KV 读（KV 仅是启动时初始数据源）。
  if (_snapshotLoaded && !ctx?.mgmt && _snapshotState.sites) return _snapshotState.sites;

  const cached = memGet(ctx, K_SITES);
  if (cached) return cached;

  let coll;
  if (isBakedMode(ctx)) {
    const sites = await bakedGet('sites') || [];
    coll = { hosts: [], wildcards: [], byHost: {} };
    for (const s of sites) {
      if (!s || typeof s.host !== 'string') continue;
      const h = String(s.host).toLowerCase();
      coll.byHost[h] = s;
      if (!coll.hosts.includes(h)) coll.hosts.push(h);
      if (h.startsWith('*.')) coll.wildcards.push({ pattern: h, host: h });
    }
  } else {
    const raw = await readJson(ctx, K_SITES);
    coll = normalizeSiteCollection(raw);
  }

  memSet(K_SITES, coll);
  return coll;
}

/**
 * 读取站点索引（hosts + wildcards），供路由匹配与列表使用。
 * 键合并后为 cfg:sites 集合的便捷视图。
 * @param {import('../contracts.js').Ctx} ctx
 */
async function getSiteIndex(ctx) {
  const coll = await getSiteCollection(ctx);
  return { hosts: coll.hosts, wildcards: coll.wildcards };
}

/**
 * 把更新后的站点族集合整体落盘 cfg:sites，并同步内存缓存。
 * @param {import('../contracts.js').Ctx} ctx
 * @param {{hosts:string[], wildcards:Array<{pattern:string,host:string}>, byHost:Object<string,object>}} coll
 */
async function putSiteCollection(ctx, coll) {
  await writeJson(ctx, K_SITES, coll);
  memDel(K_SITES);
  memSet(K_SITES, coll);
  // 同步持久内存快照，使本 isolate 写后立即生效（数据面读 _snapshotState.sites）
  if (_snapshotLoaded) _snapshotState.sites = coll;
}

/** @deprecated 键合并后站点索引不再独立成键，写入统一走 putSiteCollection */
async function putSiteIndex(ctx, idx) {
  const coll = await getSiteCollection(ctx);
  coll.hosts = idx.hosts || [];
  coll.wildcards = idx.wildcards || [];
  await putSiteCollection(ctx, coll);
}

/**
 * 泛域名匹配：`*.example.com` 匹配 `a.example.com`、`a.b.example.com`
 * 但不匹配 `example.com` 本身（与主流 CDN 行为一致）
 */
function wildcardMatch(pattern, host) {
  if (!pattern.startsWith('*.')) return false;
  const base = pattern.slice(2);
  return host.endsWith('.' + base);
}

// ----------------------------------------------------------------------------
// 站点
// ----------------------------------------------------------------------------

/**
 * 读取站点配置
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} host 客户端请求的 host（应为小写）
 * @param {{exact?:boolean}} [options] exact=true 时只做精确匹配，不回退泛域名
 * @returns {Promise<import('../contracts.js').Site|null>}
 *
 * @example
 * // 数据面：允许泛域名回退
 * const site = await getSite(ctx, 'a.example.com');
 * // 管理面：必须精确，避免编辑 A 却保存成 B
 * const site = await getSite(ctx, 'a.example.com', { exact: true });
 */
export async function getSite(ctx, host, options = {}) {
  if (!host || typeof host !== 'string') return null;
  const h = host.toLowerCase();
  const memKey = `${h}#s${options.exact ? 'e' : ''}`;

  const cached = memGet(ctx, memKey);
  if (cached !== undefined) return cached;

  // 键合并后：整个站点族在一个 cfg:sites 键里，单次读即覆盖全部站点。
  const coll = await getSiteCollection(ctx);

  // ---- 1. 精确匹配 ----
  let site = coll.byHost[h] || null;

  // ---- 2. 泛域名回退 ----
  if (!site && !options.exact) {
    // 按 pattern 长度降序，保证 *.a.b.com 优先于 *.b.com（更具体的优先）
    const sorted = [...(coll.wildcards || [])].sort(
      (x, y) => (y.pattern?.length || 0) - (x.pattern?.length || 0)
    );
    for (const w of sorted) {
      if (w?.pattern && wildcardMatch(w.pattern, h)) {
        site = coll.byHost[w.pattern] || null;
        break;
      }
    }
  }

  // 缓存 null 结果，避免不存在的 host 被反复打 KV（防缓存穿透）
  const result = site || null;
  memSet(memKey, result);
  return result;
}

/**
 * 写入站点配置，并同步维护索引
 * @param {import('../contracts.js').Ctx} ctx
 * @param {import('../contracts.js').Site} site
 */
export async function putSite(ctx, site) {
  if (isBakedMode(ctx)) throwBakedReadOnly(ctx);
  const host = String(site.host).toLowerCase();

  // 键合并后站点族整体落盘 cfg:sites（单次 put），不再有「索引键 + 实体键」
  // 两次写的跨键不一致窗口：要么整个族写成功，要么没写，天然原子。
  const coll = await getSiteCollection(ctx);
  const isWildcard = host.startsWith('*.');
  if (!site.host || String(site.host).toLowerCase() !== host) site.host = host;

  if (!coll.hosts.includes(host)) coll.hosts.push(host);
  if (isWildcard && !(coll.wildcards || []).some((w) => w.pattern === host)) {
    coll.wildcards.push({ pattern: host, host });
  }
  coll.byHost[host] = site;

  await putSiteCollection(ctx, coll);

  invalidateMemCache();
  // 广播版本号，使其它 isolate 在 2s 内重新拉取（ProxySQL 式生效）
  await bumpVersion(ctx);
}

/**
 * 删除站点配置
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} host
 */
export async function deleteSite(ctx, host) {
  if (isBakedMode(ctx)) throwBakedReadOnly(ctx);
  const h = String(host).toLowerCase();

  // 键合并后：从整个 cfg:sites 集合中移除该站点，单次整体落盘，无跨键不一致窗口。
  const coll = await getSiteCollection(ctx);
  coll.hosts = coll.hosts.filter((x) => x !== h);
  coll.wildcards = (coll.wildcards || []).filter((w) => w.pattern !== h);
  delete coll.byHost[h];

  await putSiteCollection(ctx, coll);

  invalidateMemCache();
  await bumpVersion(ctx);
}

/**
 * 分页列出站点。
 * 依赖索引而非 KV list —— EdgeOne 的 list 支持不完整，且索引读取更快。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @param {{offset?:number, limit?:number}} [options] 分页参数，
 *   limit 上限为 MAX_SITES_PER_LIST，超出会被夹紧。
 * @returns {Promise<{sites:import('../contracts.js').Site[], total:number,
 *   offset:number, truncated:boolean}>} truncated=true 表示还有后续页
 */
export async function listSites(ctx, options) {
  // 键合并后整个站点族在单个 cfg:sites 键里，读一次集合即可拿到全部站点，
  // 不再对每个站点发一次 KV 读（消除了旧实现 N 次 subrequest 撞限的问题）。
  const coll = await getSiteCollection(ctx);
  const allHosts = coll.hosts || [];
  if (allHosts.length === 0) {
    return { sites: [], total: 0, offset: 0, truncated: false };
  }

  const offset = Math.max(0, Math.floor(Number(options?.offset) || 0));
  const rawLimit = Math.floor(Number(options?.limit) || MAX_SITES_PER_LIST);
  const limit = Math.min(Math.max(rawLimit, 1), MAX_SITES_PER_LIST);

  const hosts = allHosts.slice(offset, offset + limit);
  const out = [];
  for (const h of hosts) {
    // 悬空索引（索引有但实体缺失）静默跳过
    const s = coll.byHost[h];
    if (s && typeof s === 'object') out.push(s);
  }

  return {
    sites: out,
    total: allHosts.length,
    offset,
    truncated: offset + hosts.length < allHosts.length,
  };
}

/**
 * 读取「全部」站点（自动翻页）。
 *
 * 供确实需要全量数据的场景使用：配置导出、源站池引用检查、统计聚合。
 * 与 listSites 的区别是它会循环翻页直到取完，因此**可能发出大量 KV 读**；
 * 站点数超过 MAX_TOTAL_SITES_SCAN 时会停止并置 truncated=true，
 * 避免无上限地消耗 subrequest 配额。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<{sites:import('../contracts.js').Site[], truncated:boolean}>}
 */
export async function listAllSites(ctx) {
  const acc = [];
  let offset = 0;
  let truncated = false;

  for (;;) {
    const page = await listSites(ctx, { offset, limit: MAX_SITES_PER_LIST });
    acc.push(...page.sites);
    if (!page.truncated) break;

    offset += MAX_SITES_PER_LIST;
    if (acc.length >= MAX_TOTAL_SITES_SCAN) {
      truncated = true;
      break;
    }
  }

  return { sites: acc, truncated };
}

// ----------------------------------------------------------------------------
// 源站池
// ----------------------------------------------------------------------------

/**
 * 规范化源站池族集合：把任意历史形态的 cfg:pools 数据整理成稳定结构
 * `{ ids:[], byId:{ id:pool } }`。幂等、纯函数。
 * @param {any} raw readJson(K_POOLS) 返回值（可能为 null/旧结构）
 * @returns {{ids:string[], byId:Object<string,object>}}
 */
function normalizePoolCollection(raw) {
  const coll = { ids: [], byId: {} };
  if (!raw || typeof raw !== 'object') return coll;
  if (raw.byId && typeof raw.byId === 'object') {
    for (const [id, pool] of Object.entries(raw.byId)) {
      if (!pool || typeof pool !== 'object') continue;
      const pid = String(id);
      if (pool.id !== undefined && String(pool.id) !== pid) pool.id = pid;
      coll.byId[pid] = pool;
      if (!coll.ids.includes(pid)) coll.ids.push(pid);
    }
  } else if (Array.isArray(raw.ids)) {
    // 旧 {ids} 索引结构：仅能还原 id 列表。
    coll.ids = raw.ids.filter((x) => typeof x === 'string');
    for (const id of coll.ids) coll.byId[id] = coll.byId[id] || null;
  }
  return coll;
}

/**
 * 加载源站池族集合（cfg:pools 单键）。
 * - 烘焙模式：由烤制的 pools 列表现场构建，结果进 L1 缓存。
 * - 普通模式：读 KV 单键 cfg:pools，规范化后进 L1 缓存。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<{ids:string[], byId:Object<string,object>}>}
 */
async function getPoolCollection(ctx) {
  // 快照就绪后数据面直接读持久内存快照，零 KV 读（KV 仅是启动时初始数据源）。
  if (_snapshotLoaded && !ctx?.mgmt && _snapshotState.pools) return _snapshotState.pools;

  const cached = memGet(ctx, K_POOLS);
  if (cached) return cached;

  let coll;
  if (isBakedMode(ctx)) {
    const pools = await bakedGet('pools') || [];
    coll = { ids: [], byId: {} };
    for (const p of pools) {
      if (!p || typeof p.id !== 'string') continue;
      const pid = String(p.id);
      coll.byId[pid] = p;
      if (!coll.ids.includes(pid)) coll.ids.push(pid);
    }
  } else {
    const raw = await readJson(ctx, K_POOLS);
    coll = normalizePoolCollection(raw);
  }

  memSet(K_POOLS, coll);
  return coll;
}

/**
 * 读取源站池索引（ids 列表），供列表与管理面使用。
 * 键合并后为 cfg:pools 集合的便捷视图。
 * @param {import('../contracts.js').Ctx} ctx
 */
async function getPoolIndex(ctx) {
  const coll = await getPoolCollection(ctx);
  return { ids: coll.ids };
}

/**
 * 把更新后的源站池族集合整体落盘 cfg:pools，并同步内存缓存。
 * @param {import('../contracts.js').Ctx} ctx
 * @param {{ids:string[], byId:Object<string,object>}} coll
 */
async function putPoolCollection(ctx, coll) {
  await writeJson(ctx, K_POOLS, coll);
  memDel(K_POOLS);
  memSet(K_POOLS, coll);
  // 同步持久内存快照，使本 isolate 写后立即生效（数据面读 _snapshotState.pools）
  if (_snapshotLoaded) _snapshotState.pools = coll;
}

/** @deprecated 键合并后源站池索引不再独立成键，写入统一走 putPoolCollection */
async function putPoolIndex(ctx, idx) {
  const coll = await getPoolCollection(ctx);
  coll.ids = idx.ids || [];
  await putPoolCollection(ctx, coll);
}

/**
 * 读取源站池
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} poolId
 * @returns {Promise<import('../contracts.js').OriginPool|null>}
 */
export async function getPool(ctx, poolId) {
  if (!poolId || typeof poolId !== 'string') return null;
  const memKey = `#pool:${poolId}`;

  const cached = memGet(ctx, memKey);
  if (cached !== undefined) return cached;

  // 键合并后：整个源站池族在 cfg:pools 单键里，读一次集合即可按 id 取到。
  const coll = await getPoolCollection(ctx);
  const pool = coll.byId[poolId] || null;

  memSet(memKey, pool);
  return pool;
}

/**
 * 写入源站池
 * @param {import('../contracts.js').Ctx} ctx
 * @param {import('../contracts.js').OriginPool} pool
 */
export async function putPool(ctx, pool) {
  const id = String(pool.id);
  // 仓库型源站（cnb/github）的访问令牌在落盘前用平台主密钥（复用 JWT_SECRET 派生，
  // AES-256-GCM）加密（站点级独立、灵活可配）。
  // 已加密（enc:）/降级明文（plain:）前缀的值跳过，避免重复加密。
  if (Array.isArray(pool.origins)) {
    for (const o of pool.origins) {
      // 仓库型源站（cnb/github）：token 站点级加密落盘（明文或已加密串均处理）。
      if (o && (o.engine === 'cnb' || o.engine === 'github')) {
        const field = o.engine === 'cnb' ? 'cnbTokenEnc' : 'githubTokenEnc';
        const v = o[field];
        if (typeof v === 'string' && v && !v.startsWith('enc:') && !v.startsWith('plain:')) {
          o[field] = await encryptSecret(v, ctx);
        }
      }
    }
  }
  // 键合并后源站池族整体落盘 cfg:pools（单次 put），不再有「索引键 + 实体键」
  // 两次写的跨键不一致窗口。
  const coll = await getPoolCollection(ctx);
  if (!coll.ids.includes(id)) coll.ids.push(id);
  coll.byId[id] = pool;

  await putPoolCollection(ctx, coll);

  invalidateMemCache();
  await bumpVersion(ctx);
}

/**
 * 删除源站池
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} poolId
 */
export async function deletePool(ctx, poolId) {
  const id = String(poolId);

  // 键合并后：从整个 cfg:pools 集合中移除该池，单次整体落盘，无跨键不一致窗口。
  const coll = await getPoolCollection(ctx);
  coll.ids = coll.ids.filter((x) => x !== id);
  delete coll.byId[id];

  await putPoolCollection(ctx, coll);

  invalidateMemCache();
  await bumpVersion(ctx);
}

/**
 * 列出全部源站池
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<import('../contracts.js').OriginPool[]>}
 */
export async function listPools(ctx) {
  // 键合并后整个源站池族在 cfg:pools 单键里，读一次集合即可拿到全部池，
  // 不再对每个池发一次 KV 读。
  const coll = await getPoolCollection(ctx);
  const ids = coll.ids || [];
  if (ids.length === 0) return [];

  const out = [];
  for (const id of ids) {
    const p = coll.byId[id];
    if (p && typeof p === 'object') out.push(p);
  }
  return out;
}

// ----------------------------------------------------------------------------
// 全站通用规则（兜底）
// ----------------------------------------------------------------------------

const K_GLOBAL_RULES = 'cfg:global_rules';

// 冷启动播种去重：每个 isolate 生命周期内仅触发一次检测+写盘。
// 用 Promise 而非布尔，保证并发冷启动请求只打一次 KV（首请求拿到 Promise，其余复用）。
let _seedPromise = null;

/**
 * 把旧的「全站通用规则 Rule[]」结构迁移成新的「阶段→默认动作」映射。
 * 旧数据每阶段可能有多条带 conditions 的规则，这里取每阶段「第一条」的 action
 * 对应阶段字段作为兜底（无条件的默认动作语义），丢弃匹配条件。
 * @param {{rules?: any[]}} data 旧结构
 * @returns {Record<string, any>} stages 映射
 */
function migrateGlobalRulesFromArray(data) {
  /** @type {Record<string, any>} */
  const stages = {};
  const rules = Array.isArray(data.rules) ? data.rules : [];
  const base = cloneGlobalRules();
  for (const stage of STAGE_ORDER) {
    const first = rules.find((r) => r && r.stage === stage && r.action);
    stages[stage] = first ? deepClone(first.action[stage]) : base[stage];
  }
  // 全站独有阶段（match/security/error）从来不会出现在旧的 rules 数组里
  // （它们不是规则动作），直接用内置默认铺底，后续由 foldLegacySettingsIntoStages
  // 把老 settings 里的对应值覆盖上来。
  for (const stage of GLOBAL_ONLY_STAGE_ORDER) {
    stages[stage] = base[stage];
  }
  return stages;
}

/**
 * 冷启动主动播种：部署后 isolate 首次处理请求时，若 KV 中全站规则缺失/为空结构，
 * 则从内置 DEFAULT_GLOBAL_RULES 写入 KV，使后续管理面与数据面
 * 读取始终命中一致、非空的全站规则（规范化「内置写入落盘」的触发时机）。
 *
 * 设计：
 *  - 每个 isolate 仅执行一次（模块级 _seedPromise 去重，并发首请求复用）。
 *  - fire-and-forget：调用方不 await，播种失败仅记日志不影响请求，由 getGlobalRules
 *    惰性兜底继续保障落盘（CDN 可用性优先）。
 *  - 幂等：仅当确实写入时才 bumpVersion，避免无谓的版本号自增触发全站失效。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<void>}
 */
export async function ensureGlobalRulesSeeded(ctx) {
  if (_seedPromise) return _seedPromise;
  _seedPromise = (async () => {
    const data = await readJson(ctx, K_GLOBAL_RULES);
    const normalized = _normalizeGlobalRulesInMemory(data);

    // 触发一次性落盘的判定：
    // 1. KV 中完全缺失或 stages 为空对象；
    // 2. 旧数组格式 { rules: [...] }；
    // 3. 仍带已废弃的 settings 段；
    // 4. 缺失某些阶段 key（升级补齐）。
    // 这些只在 isolate 冷启动时检测一次并落盘，之后所有请求只读不写。
    const hasOldArray = data && Array.isArray(data.rules);
    const hasLegacySettings = !!(data && data.settings && typeof data.settings === 'object');
    const hasEmptyStages = !data || !(data.stages && typeof data.stages === 'object'
      && Object.keys(data.stages).length > 0);
    const base = cloneGlobalRules();
    const missingStages = data && data.stages && typeof data.stages === 'object'
      && ALL_GLOBAL_STAGE_KEYS.some((stage) => data.stages[stage] === undefined);

    if (hasOldArray || hasLegacySettings || hasEmptyStages || missingStages) {
      // 关键：经由统一写入入口 putGlobalRules 落盘，与人工在管理面编辑走同一
      // validateGlobalRulesStages 校验 + 落盘 + invalidateMemCache + bumpVersion 逻辑，
      // 禁止直接裸写 KV（满足「程序模拟人工编辑、与人工逐一设置完全等价」要求）。
      await putGlobalRules(ctx, normalized);
    }
  })().catch((err) => {
    console.error('[store] 全站规则冷启动播种/迁移失败（忽略，由读取路径兜底）:', err?.message);
  }).finally(() => {
    // 失败/成功都只试一次：失败也不清 _seedPromise，避免异常态下每个请求重试打 KV。
  });
  return _seedPromise;
}

/**
 * 读取全站通用（兜底）规则：阶段→默认动作映射，每个阶段 1 条、无条件。
 *
 * 兜底语义：KV 为空时写入内置保守默认（DEFAULT_GLOBAL_RULES）并返回，之后用户可改。
 * 旧版 Rule[] 结构、以及旧版并列的 settings 段都会被一次性迁移进 stages 并写回，
 * 保证灰度无中断。
 *
 * 单轨化后返回结构只有 { stages }：所有全站默认参数（含原 settings 段的
 * 透传白名单 / 限速 / 拦截文案 / 伪装页 TTL 等）都是某个阶段的默认动作。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<{stages: Record<string, any>}>}
 */
/**
 * 【一次性向后兼容迁移】把旧数据的 settings 段折叠进 stages（单轨化）。
 *
 * 历史背景：全站规则曾以 `{ stages, settings }` 双轨落盘——stages 是各阶段默认动作，
 * settings 是一批「对前端完全隐藏」的全局参数（透传白名单 / 限速 / 拦截文案 / 伪装页 TTL…）。
 * 用户在管理面看不到也改不了 settings，后端却按它生效，属于典型的双轨陷阱。
 *
 * 现已单轨化：所有原 settings 字段都归入其业务本质所属的阶段（见 defaults.js 的映射表），
 * 运行时与管理面都只读 stages。本函数负责把老 KV 里残留的 settings 逐字段搬进 stages，
 * 使升级后的首次读取即完成迁移（幂等：已迁移过的数据再跑一次结果不变）。
 *
 * 迁移原则：**stages 已有的用户值优先**，settings 只填补 stages 中缺失的字段。
 * 因为 stages 是用户在管理面唯一能编辑的一轨，其值代表用户真实意图。
 *
 * @param {Record<string, any>} stages 新轨（阶段→默认动作）
 * @param {Record<string, any>=} legacySettings 旧轨 settings 段（可能为 undefined）
 * @returns {Record<string, any>} 新的 stages 对象（不修改入参）
 */
function foldLegacySettingsIntoStages(stages, legacySettings) {
  const out = deepClone(stages);
  const s = legacySettings && typeof legacySettings === 'object' ? legacySettings : null;
  if (!s) return out;

  /** 取/建某阶段对象 */
  const stage = (k) => (out[k] && typeof out[k] === 'object' ? out[k] : (out[k] = {}));
  /** 仅当目标字段缺失时才填入（stages 用户值优先） */
  const fill = (obj, key, val) => {
    if (val !== undefined && val !== null && obj[key] === undefined) obj[key] = deepClone(val);
  };
  /** 把数组并入目标数组并去重（大小写不敏感，用于头名） */
  const mergeHeaderList = (obj, key, list) => {
    if (!Array.isArray(list) || !list.length) return;
    const arr = Array.isArray(obj[key]) ? (obj[key] = [...obj[key]]) : (obj[key] = []);
    for (const h of list) {
      if (!arr.some((x) => String(x).toLowerCase() === String(h).toLowerCase())) arr.push(h);
    }
  };

  // settings.reqHeaders.forwardWhitelist → stages.reqHeaders
  if (s.reqHeaders && typeof s.reqHeaders === 'object') {
    const rh = stage('reqHeaders');
    fill(rh, 'forwardWhitelist', s.reqHeaders.forwardWhitelist);
    // proxyUserAgent 已删除：反代统一复用 stages.reqHeaders.set['User-Agent']，不再单独配置。
  }

  // settings.cache.noCacheStatus → stages.cache.statusTtl（TTL=0 即 no-store）
  // settings.disguise.*         → stages.cache.disguise
  if (s.cache && typeof s.cache === 'object' && Array.isArray(s.cache.noCacheStatus)) {
    const ttls = {};
    for (const p of s.cache.noCacheStatus) {
      const raw = String(p).toLowerCase();
      // 保留 `!` 例外键（!418 = 418 不受段通配 no-store 约束，走常规缓存），
      // 非例外项等价于 TTL=0（no-store）。
      const key = raw.startsWith('!') ? raw : raw;
      if (key && /^!?(?:[1-5]\d{2}|[1-5]xx|[1-5]\dx)$/.test(key)) ttls[key] = 0;
    }
    if (Object.keys(ttls).length) fill(stage('cache'), 'statusTtl', ttls);
  }
  if (s.disguise && typeof s.disguise === 'object') {
    const c = stage('cache');
    if (c.disguise === undefined) {
      const dg = {};
      if (s.disguise.disguiseCdnMaxAge !== undefined) dg.cdnMaxAge = s.disguise.disguiseCdnMaxAge;
      if (s.disguise.disguiseIsolateTtlMs !== undefined) dg.isolateTtlMs = s.disguise.disguiseIsolateTtlMs;
      if (Object.keys(dg).length) c.disguise = dg;
    }
  }

  // 全站层不承载 failover（回退重试仅源站池所有，见 contracts Failover）。
  // settings.origin.* 旧字段不再迁移进 stages，避免制造第二份真相源。

  // settings.security.* → stages.security（signedUrlParam / signedUrlTtl 已废弃，不迁移）
  if (s.security && typeof s.security === 'object') {
    const sec = stage('security');
    for (const k of ['rateLimitRpm', 'rlTtlSec', 'remoteSyncIntervalMs', 'memMaxEntries']) {
      fill(sec, k, s.security[k]);
    }
  }

  // settings.error.* → stages.error
  if (s.error && typeof s.error === 'object') {
    const e = stage('error');
    fill(e, 'blockBody', s.error.blockBody);
    fill(e, 'blockCacheControl', s.error.blockCacheControl);
    if (s.error.messages && typeof s.error.messages === 'object') {
      const m = (e.messages && typeof e.messages === 'object') ? e.messages : (e.messages = {});
      for (const k of ['internal', 'noOrigin', 'configError']) fill(m, k, s.error.messages[k]);
    }
  }

  return out;
}

/**
 * 全站规则的全部阶段 key（规则型 7 阶段 + 全站独有 3 阶段）。
 * 单轨化后，原 settings 段的字段都落在 GLOBAL_ONLY_STAGE_ORDER 这三个阶段里，
 * 因此补全缺失阶段时必须把它们一并算进来，否则升级后新阶段永远为空。
 */
const ALL_GLOBAL_STAGE_KEYS = [...STAGE_ORDER, ...GLOBAL_ONLY_STAGE_ORDER, 'fixContentType'];

export async function getGlobalRules(ctx) {
  // 烘焙模式：直接返回烤制的 globalRules（合并内置默认补齐缺失阶段）。
  if (isBakedMode(ctx)) {
    const raw = await bakedGet('globalRules');
    const merged = cloneGlobalRules();
    if (raw && raw.stages) {
      // 复用校验器做规范化（缺失阶段由 base 补全），与运行时读 KV 等价。
      const res = validateGlobalRulesStages({ stages: raw.stages }, merged);
      if (res.ok) return res.value.stages;
      // 校验失败则回退到内置默认，保证函数永不崩。
      return merged;
    }
    return merged;
  }

  // 快照就绪后数据面直接读持久内存快照，零 KV 读（KV 仅是启动时初始数据源）。
  if (_snapshotLoaded && !ctx?.mgmt && _snapshotState.globalRules) {
    return { stages: deepClone(_snapshotState.globalRules.stages) };
  }

  const data = await readJson(ctx, K_GLOBAL_RULES);

  // 关键修正：getGlobalRules 处于每个数据面请求的热路径，绝不能在这里写 KV。
  // 旧的「读时迁移/补默认」逻辑会在 KV 为空/旧格式时让每个请求都触发 put，
  // 几分钟就能打爆 Cloudflare KV 免费版 1000 次/天的写入上限。
  // 以下只做纯内存规范化并返回；播种与迁移统一交给 ensureGlobalRulesSeeded
  //（isolate 冷启动一次性）和管理面写入入口处理。
  const stages = _normalizeGlobalRulesInMemory(data);
  return { stages: deepClone(stages) };
}

/**
 * 把 KV 中读到的任意历史形态全站规则，在内存里规范化成标准 stages 映射。
 * 纯函数，不读写 KV，可被 getGlobalRules 热路径安全调用。
 * @param {any} data readJson(K_GLOBAL_RULES) 返回值
 * @returns {Record<string, any>} 规范化后的 stages
 */
function _normalizeGlobalRulesInMemory(data) {
  // 旧结构 A：{ rules: [...] } —— 数组时代的规则，迁移为 stages 映射
  if (data && Array.isArray(data.rules)) {
    return foldLegacySettingsIntoStages(migrateGlobalRulesFromArray(data), data.settings);
  }

  // 新结构：{ stages: {...} }（旧数据可能还带一个已废弃的 settings 段）
  if (data && data.stages && typeof data.stages === 'object') {
    // 实质为空时回退到内置默认
    if (Object.keys(data.stages).length === 0) {
      return cloneGlobalRules();
    }

    // 单轨化迁移：先把老 settings 折进 stages（幂等；无 settings 时为恒等变换）
    const folded = foldLegacySettingsIntoStages(data.stages, data.settings);

    // 逐阶段合并补全：内置默认铺底、用户已有值覆盖
    const base = cloneGlobalRules();
    const merged = {};
    for (const stage of ALL_GLOBAL_STAGE_KEYS) {
      merged[stage] = folded[stage] !== undefined ? deepClone(folded[stage]) : deepClone(base[stage]);
    }

    // 兼容旧数据残留的 noCacheStatus（已并入 statusTtl：TTL=0 = no-store）
    const cacheStage = merged.cache;
    if (cacheStage && Array.isArray(cacheStage.noCacheStatus) && cacheStage.noCacheStatus.length) {
      const ttls = {};
      for (const item of cacheStage.noCacheStatus) {
        const p = String(item).toLowerCase();
        if (/^!?(?:[1-5]\d{2}|[1-5]xx|[1-5]\dx)$/.test(p)) ttls[p] = 0;
      }
      cacheStage.statusTtl = Object.assign({}, ttls, cacheStage.statusTtl || {});
    }
    return merged;
  }

  // 空值/异常：返回内置默认
  return cloneGlobalRules();
}

/**
 * 覆盖写入全站通用（兜底）规则：阶段→默认动作映射。
 *
 * 单轨化后只接收 stages 一个参数——原先并列的 settings 段已取消，
 * 其字段全部作为对应阶段（含 match/security/error 三个全站独有阶段）的默认动作。
 * @param {import('../contracts.js').Ctx} ctx
 * @param {Record<string, any>} stages 键为 STAGE_ORDER + GLOBAL_ONLY_STAGE_ORDER，值为各阶段默认 action
 */
export async function putGlobalRules(ctx, stages) {
  if (isBakedMode(ctx)) throwBakedReadOnly(ctx);
  // 经统一校验入口规范化：缺失阶段由内置 base 补全。
  // 与人工在管理面经 PUT /rules/global 完全等价，禁止裸写 KV。
  const res = validateGlobalRulesStages(
    { stages: stages && typeof stages === 'object' ? stages : {} },
    cloneGlobalRules(),
  );
  if (!res.ok) return { ok: false, errors: res.errors };
  const { stages: normStages } = res.value;
  await writeJson(ctx, K_GLOBAL_RULES, { stages: normStages });
  invalidateMemCache();
  // 同步持久内存快照，使本 isolate 写后立即生效（数据面读 _snapshotState.globalRules）
  if (_snapshotLoaded) _snapshotState.globalRules = { stages: normStages };
  await bumpVersion(ctx);
  return { ok: true, value: { stages: normStages } };
}

// ----------------------------------------------------------------------------
// 配置同步「接收开关」（sync:token）
// ----------------------------------------------------------------------------
//
// 设计要点：
//  1. 开关即数据：接收接口是否开放，只取决于 KV 中 sync:token 是否存在且未过期。
//     无需改源码、无需改环境变量、无需重新部署，因此「临时开放 → 用完即关」是
//     纯运行时行为，接口不会长期暴露在公网被扫描/盗刷。
//  2. 绝不走 L1 内存缓存：校验码是一次性的强一致语义（生成后立刻要能校验、
//     删除后必须立刻拒绝），任何缓存都会造成「已删除仍可用」的安全窗口，
//     因此这里直连 KV，不使用 memGet/memSet。
//  3. 双保险过期：既写 KV 的 expirationTtl（后端侧自动回收），也在值里存
//     expiresAt 时间戳（读取时自行判断）。因为 Redis 降级后端/不同厂商 KV 对
//     TTL 的精度与实现不一致，值内时间戳保证过期判定始终准确。

/**
 * @typedef {Object} SyncToken
 * @property {string} code       校验码明文（高熵随机十六进制）
 * @property {number} createdAt  生成时间戳（ms）
 * @property {number} expiresAt  过期时间戳（ms），到点即视为失效
 */

/**
 * 读取当前的配置同步校验码。
 *
 * 直连 KV（不经内存缓存），并主动判定值内 expiresAt：
 * 已过期时返回 null 且顺手清理残留键（best-effort，清理失败不影响判定结果）。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<SyncToken|null>} 有效的校验码记录；不存在或已过期返回 null
 */
export async function getSyncToken(ctx) {
  // 烘焙模式：节点只读、无管理权限，等同于「未开放同步端口」，直接返回 null。
  if (isBakedMode(ctx)) return null;
  const rec = await readJson(ctx, K_SYNC_TOKEN);
  if (!rec || typeof rec !== 'object' || typeof rec.code !== 'string' || rec.code === '') {
    return null;
  }
  // 值内时间戳兜底判定：不依赖后端 TTL 精度
  if (typeof rec.expiresAt === 'number' && rec.expiresAt <= Date.now()) {
    // 已过期的残留键顺手清理，避免 list/巡检看到僵尸数据
    try {
      await delSyncToken(ctx);
    } catch {
      /* 清理失败不影响「已过期」这一结论 */
    }
    return null;
  }
  return /** @type {SyncToken} */ (rec);
}

/**
 * 写入配置同步校验码，开放接收接口。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} code   校验码明文（由调用方用 CSPRNG 生成）
 * @param {number} [ttlSec=SYNC_TOKEN_TTL_SEC] 有效期（秒），下限 60（受 CF KV 限制）
 * @returns {Promise<SyncToken>} 落盘的记录（含 expiresAt，便于前端显示倒计时）
 * @throws {Error} KV 不可用或写入失败时抛出，调用方必须感知（不能静默"假开放"）
 */
export async function setSyncToken(ctx, code, ttlSec = SYNC_TOKEN_TTL_SEC) {
  if (typeof code !== 'string' || code === '') {
    throw new Error('校验码不能为空');
  }
  // 下限 60s 与 platform/kv.js 的 put 保持一致（CF KV expirationTtl 最小 60）
  const ttl = Math.max(60, Math.floor(Number(ttlSec) || SYNC_TOKEN_TTL_SEC));
  const now = Date.now();
  /** @type {SyncToken} */
  const rec = { code, createdAt: now, expiresAt: now + ttl * 1000 };
  const kv = requireKV(ctx);
  // 带 expirationTtl：即便调用方忘记关闭，后端也会自动回收，接口自动收口
  await kv.put(K_SYNC_TOKEN, JSON.stringify(rec), { expirationTtl: ttl });
  return rec;
}

/**
 * 删除配置同步校验码，立即关闭接收接口。
 *
 * 用于三个场景：手动点击关闭、一次同步成功后的自动收口、过期残留清理。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<void>}
 * @throws {Error} 删除失败时抛出——关闭失败必须让调用方感知，否则接口会意外持续开放
 */
export async function delSyncToken(ctx) {
  if (isBakedMode(ctx)) throwBakedReadOnly(ctx);
  const kv = getKV(ctx.env);
  // 无 KV 时本就无从开放，视为已关闭
  if (!kv) return;
  await kv.delete(K_SYNC_TOKEN);
}
