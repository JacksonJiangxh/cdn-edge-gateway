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
import {
  DEFAULT_GLOBAL,
  DEFAULT_SITE_INDEX,
  DEFAULT_POOL_INDEX,
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

/** 全局版本号 key（单一值，跨 isolate 真相源广播位）。 */
const K_VERSION = 'cfg:version';

/**
 * 版本号本地再缓存时长（毫秒）——采用「指数动态退避」三档，而非固定值。
 * 三档间隔 [2s, 60s, 180s]：检测到配置变更时进入激进档（2s）保持若干轮快速
 * 收敛，连续未变更则逐步退避到更高档。三个部署平台（CF Workers / EdgeOne /
 * 阿里云 ESA）统一以 KV 免费读 10 万/天为额度上限：
 *   - 稳态（180s 档）：每 isolate ≈ 86400/180 ≈ 480 次/天；
 *     即便 30 个常驻 isolate 也仅 ≈ 1.44 万/天，远低于 10 万上限。
 *   - 变更后：2~6s 内全站生效（比「必须重新部署」已是质的改善）。
 */
const VERSION_POLL_LEVELS_MS = [2_000, 60_000, 180_000];
/** 激进档（2s）连续保持的轮数：变更后以此高频轮询以便快速稳定，之后退避。 */
const VERSION_RAPID_ROUNDS = 3;

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
 * 版本号读取（指数动态退避三档）：先走本地退避缓存，未命中才读 KV。
 * 返回 Promise<number>（无版本号时返回 0，表示「首次/未初始化」）。
 * 读取失败降级为 -1，调用方据此选择「保守：不失效」（宁可多等，绝不丢配置）。
 *
 * 退避状态机（详见 VERSION_POLL_LEVELS_MS 注释）：
 *   - 本次读到的版本号与上次不同（检测到配置变更）→ 重置到激进档（2s），
 *     并保持 VERSION_RAPID_ROUNDS 轮高频，使全站快速收敛到新值。
 *   - 本次读到的版本号与上次相同（空闲）→ 若仍在激进轮数内保持 2s，
 *     否则向更高档（60s→180s）退避，最大程度省 KV 读额度。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<number>}
 */
let _verState = {
  value: 0, // 最近一次从 KV 读到的版本号
  level: 0, // 当前轮询档位下标（0=2s, 1=60s, 2=180s）
  rapidLeft: 0, // 激进档（2s）剩余保持轮数
  expireAt: 0, // 本地退避缓存过期时间（ms 时间戳）
};
async function readVersion(ctx) {
  const now = Date.now();
  if (_verState.expireAt > now) return _verState.value;

  const raw = await readJson(ctx, K_VERSION);
  const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;

  if (_verState.value !== v) {
    // 版本号变化：进入激进档，保持若干轮 2s 高频以便快速稳定全站
    _verState.level = 0;
    _verState.rapidLeft = VERSION_RAPID_ROUNDS;
  } else if (_verState.rapidLeft > 0) {
    // 仍在激进轮数内：维持 2s 高频
    _verState.rapidLeft -= 1;
    _verState.level = 0;
  } else {
    // 空闲且已过激进期：向更高档退避（60s → 180s → 封顶）
    _verState.level = Math.min(_verState.level + 1, VERSION_POLL_LEVELS_MS.length - 1);
  }

  _verState.value = v;
  _verState.expireAt = now + VERSION_POLL_LEVELS_MS[_verState.level];
  return v;
}

/**
 * 自增全局版本号（写入完成后调用）。
 * 失败不抛（版本号只是优化，写入本身已落库），仅吞掉并记录。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<void>}
 */
async function bumpVersion(ctx) {
  try {
    // 本地先 +1（即使 KV 读失败也能推进本地视图）
    let next;
    const cur = await readJson(ctx, K_VERSION);
    if (typeof cur === 'number' && Number.isFinite(cur)) next = cur + 1;
    else next = 1;
    await writeJson(ctx, K_VERSION, next);
    // 刷新本地版本号状态：立即看到自己刚写入的新版本，并进入激进档（2s），
    // 使本 isolate 后续请求快速稳定（其它 isolate 经 KV 版本号同步后各自收敛）。
    _verState.value = next;
    _verState.level = 0;
    _verState.rapidLeft = VERSION_RAPID_ROUNDS;
    _verState.expireAt = Date.now() + VERSION_POLL_LEVELS_MS[0];
  } catch (err) {
    console.error('[store] 自增配置版本号失败（已忽略，写入本身已落库）:', err?.message);
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
const K_SITE_INDEX = 'site:_index';
const K_POOL_INDEX = 'pool:_index';
const kSite = (host) => `site:${host}`;
const kPool = (id) => `pool:${id}`;

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
 * 获取 KV，不存在时抛出面向用户的明确错误（仅用于写路径）
 */
function requireKV(ctx) {
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
  try {
    return await kv.get(key, 'json');
  } catch (err) {
    console.error(`[store] 读取 ${key} 失败:`, err?.message);
    return null;
  }
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
  // —— ProxySQL 式版本号失效 ——
  // 命中 L1 前先比对版本号：本地缓存的版本号与 KV 当前版本号一致，才信任 L1；
  // 不一致（说明有 isolate 改过配置）则丢弃 L1、重拉 KV。版本号本地再缓存 2s，
  // 最坏 2s 全站同步，且是「主动发现并失效」而非「盲等 TTL 过期」。
  // 若 ctx.mgmt 要求直读（管理面写后立刻读），或版本号读取失败（保守：降级为不失效），
  // 仍走原有 memGet 命中逻辑，保证可用性。
  const cached = memGet(ctx, K_GLOBAL);
  if (!ctx?.mgmt && cached) {
    const ver = await readVersion(ctx); // 失败返回 -1
    if (ver < 0 || ver === _cachedGlobalVersion) {
      return cached; // 版本一致（或版本号读取失败保守放行）→ 直接用 L1
    }
    // 版本号不一致：丢弃 L1，下方重拉 KV
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

  // 记录本 isolate 当前生效的配置版本号快照（供下次进入时比对）
  const newVer = await readVersion(ctx);
  _cachedGlobalVersion = newVer >= 0 ? newVer : _cachedGlobalVersion;

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

async function getSiteIndex(ctx) {
  const cached = memGet(ctx, K_SITE_INDEX);
  if (cached) return cached;

  const raw = await readJson(ctx, K_SITE_INDEX);
  const idx =
    raw && Array.isArray(raw.hosts)
      ? {
          hosts: raw.hosts.filter((h) => typeof h === 'string'),
          wildcards: Array.isArray(raw.wildcards) ? raw.wildcards : [],
        }
      : deepClone(DEFAULT_SITE_INDEX);

  memSet(K_SITE_INDEX, idx);
  return idx;
}

async function putSiteIndex(ctx, idx) {
  await writeJson(ctx, K_SITE_INDEX, idx);
  memDel(K_SITE_INDEX);
  memSet(K_SITE_INDEX, idx);
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
  const memKey = `${kSite(h)}${options.exact ? '#e' : ''}`;

  const cached = memGet(ctx, memKey);
  if (cached !== undefined) return cached;

  // ---- 1. 精确匹配 ----
  let site = await readJson(ctx, kSite(h));

  // ---- 2. 泛域名回退 ----
  if (!site && !options.exact) {
    const idx = await getSiteIndex(ctx);
    // 按 pattern 长度降序，保证 *.a.b.com 优先于 *.b.com（更具体的优先）
    const sorted = [...(idx.wildcards || [])].sort(
      (x, y) => (y.pattern?.length || 0) - (x.pattern?.length || 0)
    );
    for (const w of sorted) {
      if (w?.pattern && wildcardMatch(w.pattern, h)) {
        site = await readJson(ctx, kSite(w.pattern));
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
  const host = String(site.host).toLowerCase();

  // 【写入顺序】先索引、后数据。
  // KV 无事务，两次写必有一次可能失败，只能选择「失败时留下哪种不一致」：
  //   - 先数据后索引（旧实现）：索引写失败 → 站点已生效但管理面看不见、删不掉，
  //     形成无法治理的「幽灵站点」，属于危险的不一致。
  //   - 先索引后数据（现实现）：数据写失败 → 索引里多一个悬空条目，
  //     listSites 读不到会跳过（见下方 filter），getSite 回落为未配置，
  //     重试 putSite 即可自愈，属于安全的不一致。
  const idx = await getSiteIndex(ctx);
  const isWildcard = host.startsWith('*.');
  let changed = false;

  if (!idx.hosts.includes(host)) {
    idx.hosts.push(host);
    changed = true;
  }
  if (isWildcard) {
    const exists = (idx.wildcards || []).some((w) => w.pattern === host);
    if (!exists) {
      idx.wildcards = [...(idx.wildcards || []), { pattern: host, host }];
      changed = true;
    }
  }
  if (changed) await putSiteIndex(ctx, idx);

  await writeJson(ctx, kSite(host), site);

  invalidateMemCache();
  await bumpVersion(ctx); // 广播版本号，使其它 isolate 在 2s 内重新拉取（ProxySQL 式生效）
}

/**
 * 删除站点配置
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} host
 */
export async function deleteSite(ctx, host) {
  const h = String(host).toLowerCase();
  const kv = requireKV(ctx);

  // 【删除顺序】先索引、后数据（与 putSite 相反，理由同样是「让失败态安全」）。
  //   - 先数据后索引（旧实现）：索引写失败 → 站点数据已删但索引仍留条目，
  //     且因为数据没了，用户在管理面「再删一次」也无法清掉悬空索引，永久泄漏。
  //   - 先索引后数据（现实现）：数据删失败 → 站点立刻从路由与列表中消失
  //     （符合用户预期），仅残留一份读不到的孤儿数据，重试删除即可清理。
  const idx = await getSiteIndex(ctx);
  idx.hosts = idx.hosts.filter((x) => x !== h);
  idx.wildcards = (idx.wildcards || []).filter((w) => w.pattern !== h);
  await putSiteIndex(ctx, idx);

  await kv.delete(kSite(h));

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
  const idx = await getSiteIndex(ctx);
  const allHosts = idx.hosts || [];
  if (allHosts.length === 0) {
    return { sites: [], total: 0, offset: 0, truncated: false };
  }

  // 【为什么必须分页】BATCH 只限制「并发度」，不限制「总读次数」。
  // 旧实现对 N 个站点会发出 N 次 KV 读：200 个站点 = 200 次 subrequest，
  // 必然撞上 Workers 单请求上限（免费版 50 / 付费版 1000）而整个管理面 500。
  // 因此这里对单次调用的读取量设硬上限，超出部分由调用方翻页获取。
  const offset = Math.max(0, Math.floor(Number(options?.offset) || 0));
  const rawLimit = Math.floor(Number(options?.limit) || MAX_SITES_PER_LIST);
  const limit = Math.min(Math.max(rawLimit, 1), MAX_SITES_PER_LIST);

  const hosts = allHosts.slice(offset, offset + limit);

  // 并发读取但限制批大小，避免瞬时打满连接
  const out = [];
  const BATCH = 10;
  for (let i = 0; i < hosts.length; i += BATCH) {
    const batch = hosts.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((h) => readJson(ctx, kSite(h))));
    for (const s of results) {
      if (!s) continue; // 悬空索引，静默跳过
      out.push(s);
    }
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

async function getPoolIndex(ctx) {
  const cached = memGet(ctx, K_POOL_INDEX);
  if (cached) return cached;
  const raw = await readJson(ctx, K_POOL_INDEX);
  const idx =
    raw && Array.isArray(raw.ids)
      ? { ids: raw.ids.filter((x) => typeof x === 'string') }
      : deepClone(DEFAULT_POOL_INDEX);
  memSet(K_POOL_INDEX, idx);
  return idx;
}

async function putPoolIndex(ctx, idx) {
  await writeJson(ctx, K_POOL_INDEX, idx);
  memDel(K_POOL_INDEX);
  memSet(K_POOL_INDEX, idx);
}

/**
 * 读取源站池
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} poolId
 * @returns {Promise<import('../contracts.js').OriginPool|null>}
 */
export async function getPool(ctx, poolId) {
  if (!poolId || typeof poolId !== 'string') return null;
  const key = kPool(poolId);

  const cached = memGet(ctx, key);
  if (cached !== undefined) return cached;

  let pool = (await readJson(ctx, key)) || null;
  memSet(key, pool);
  return pool;
}

/**
 * 写入源站池
 * @param {import('../contracts.js').Ctx} ctx
 * @param {import('../contracts.js').OriginPool} pool
 */
export async function putPool(ctx, pool) {
  const id = String(pool.id);
  await writeJson(ctx, kPool(id), pool);

  const idx = await getPoolIndex(ctx);
  if (!idx.ids.includes(id)) {
    idx.ids.push(id);
    await putPoolIndex(ctx, idx);
  }

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
  const kv = requireKV(ctx);
  await kv.delete(kPool(id));

  const idx = await getPoolIndex(ctx);
  idx.ids = idx.ids.filter((x) => x !== id);
  await putPoolIndex(ctx, idx);

  invalidateMemCache();
  await bumpVersion(ctx);
}

/**
 * 列出全部源站池
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<import('../contracts.js').OriginPool[]>}
 */
export async function listPools(ctx) {
  const idx = await getPoolIndex(ctx);
  const ids = idx.ids || [];
  if (ids.length === 0) return [];

  const out = [];
  const BATCH = 10;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const results = await Promise.all(batch.map((id) => readJson(ctx, kPool(id))));
    for (const p of results) {
      if (!p) continue;
      out.push(p);
    }
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
    // 缺失判定：完全空值，或 stages 为空对象（key 存在但被清空残留空结构）。
    const missing = !data
      || !(data.stages && typeof data.stages === 'object'
        && Object.keys(data.stages).length > 0);
    if (missing) {
      // 关键：经由统一写入入口 putGlobalRules 落盘，与人工在管理面编辑走同一
      // validateGlobalRulesStages 校验 + 落盘 + invalidateMemCache + bumpVersion 逻辑，
      // 禁止直接裸写 KV（满足「程序模拟人工编辑、与人工逐一设置完全等价」要求）。
      await putGlobalRules(ctx, cloneGlobalRules());
    }
  })().catch((err) => {
    console.error('[store] 全站规则冷启动播种失败（忽略，由读取路径兜底）:', err?.message);
  }).finally(() => {
    // 失败/成功都只试一次：失败也不清 _seedPromise，避免异常态下每个请求重试打 KV；
    // 真正的兜底由 getGlobalRules 的惰性三分支承担。
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

  // settings.respHeaders.stripDefaults → stages.respHeaders.remove（去重合并）
  if (s.respHeaders && typeof s.respHeaders === 'object') {
    mergeHeaderList(stage('respHeaders'), 'remove', s.respHeaders.stripDefaults);
  }

  // settings.reqHeaders.{forwardWhitelist,stripPrefixes,stripExact} → stages.reqHeaders
  if (s.reqHeaders && typeof s.reqHeaders === 'object') {
    const rh = stage('reqHeaders');
    fill(rh, 'forwardWhitelist', s.reqHeaders.forwardWhitelist);
    // 旧的 stripPrefixes / stripExact 两个列表合并成统一 {type,value} 语法
    if (rh.strip === undefined) {
      const strip = [];
      for (const p of s.reqHeaders.stripPrefixes || []) strip.push({ type: 'prefix', value: String(p) });
      for (const e of s.reqHeaders.stripExact || []) strip.push({ type: 'exact', value: String(e) });
      if (strip.length) rh.strip = strip;
    }
    // proxyUserAgent 已删除：反代统一复用 stages.reqHeaders.set['User-Agent']，不再单独配置。
  }

  // settings.cache.noCacheStatus → stages.cache.noCacheStatus
  // settings.disguise.*         → stages.cache.disguise
  if (s.cache && typeof s.cache === 'object') {
    fill(stage('cache'), 'noCacheStatus', s.cache.noCacheStatus);
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

  // settings.origin.* → stages.origin.failover（消除与池级 failover 的双份真相源）
  if (s.origin && typeof s.origin === 'object') {
    const o = stage('origin');
    const fo = (o.failover && typeof o.failover === 'object') ? o.failover : (o.failover = {});
    for (const k of ['retryOn', 'maxRetries', 'timeoutMs', 'maxRetryBodyBytes']) {
      fill(fo, k, s.origin[k]);
    }
  }

  // settings.request.defaultProtocol → stages.match.defaultProtocol
  if (s.request && typeof s.request === 'object') {
    fill(stage('match'), 'defaultProtocol', s.request.defaultProtocol);
  }

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
const ALL_GLOBAL_STAGE_KEYS = [...STAGE_ORDER, ...GLOBAL_ONLY_STAGE_ORDER];

export async function getGlobalRules(ctx) {
  const data = await readJson(ctx, K_GLOBAL_RULES);

  /** 落盘 + 失效内存缓存 + bump 版本（失败只告警，不影响返回值） */
  const persist = async (stages, why) => {
    try {
      await writeJson(ctx, K_GLOBAL_RULES, { stages });
      invalidateMemCache();
      await bumpVersion(ctx);
    } catch (err) {
      console.error(`[store] 全站规则${why}落盘失败（忽略，仍返回内存值）:`, err?.message);
    }
  };

  // 旧结构 A：{ rules: [...] } —— 数组时代的规则，迁移为 stages 映射后写回
  if (data && Array.isArray(data.rules)) {
    const stages = foldLegacySettingsIntoStages(migrateGlobalRulesFromArray(data), data.settings);
    await persist(stages, '旧数组结构迁移');
    return { stages: deepClone(stages) };
  }

  // 新结构：{ stages: {...} }（旧数据可能还带一个已废弃的 settings 段）
  if (data && data.stages && typeof data.stages === 'object') {
    // 实质为空（stages 是空对象 {}，常见于「KV 被清空后残留一个空结构」或
    // putGlobalRules 收到空 stages 写入）时，不返回空值、改为补落盘内置默认，
    // 避免「全站规则 key 存在但所有阶段值空」的永久态。
    if (Object.keys(data.stages).length === 0) {
      const stages = cloneGlobalRules();
      await persist(stages, '空结构补默认');
      return { stages: deepClone(stages) };
    }

    // 单轨化迁移：先把老 settings 折进 stages（幂等；无 settings 时为恒等变换）
    const folded = foldLegacySettingsIntoStages(data.stages, data.settings);

    // 逐阶段合并补全：内置默认铺底、用户已有值覆盖。
    // 仅当 stages 缺失个别阶段 key 时补全，并且只在「确有新增」时写回 + bumpVersion（幂等），
    // 避免每次读取都写 KV。这也是升级后自动补齐 match/security/error 三个新阶段的路径。
    const base = cloneGlobalRules();
    const merged = {};
    let added = false;
    for (const stage of ALL_GLOBAL_STAGE_KEYS) {
      if (folded[stage] !== undefined) {
        merged[stage] = deepClone(folded[stage]);
      } else {
        merged[stage] = deepClone(base[stage]);
        added = true;
      }
    }
    // 老数据带 settings 段时，即使阶段齐全也要写回一次以物理删除 settings（完成单轨化）
    const hadLegacySettings = !!(data.settings && typeof data.settings === 'object');
    if (added || hadLegacySettings) {
      await persist(merged, hadLegacySettings ? 'settings 单轨化迁移' : '缺失阶段补全');
    }
    return { stages: deepClone(merged) };
  }

  // 空值：落盘内置默认并返回（幂等由调用方并发容忍，失败不影响返回）
  const stages = cloneGlobalRules();
  await persist(stages, '默认');
  return { stages: deepClone(stages) };
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
  await bumpVersion(ctx);
  return { ok: true, value: { stages: normStages } };
}
