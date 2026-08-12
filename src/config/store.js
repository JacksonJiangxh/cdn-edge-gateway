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
  cloneGlobal,
  deepClone,
} from './defaults.js';
import { validateGlobal } from './schema.js';
import { registerDomain, allocBytes, releaseBytes, syncEntries } from '../platform/memBudget.js';

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
  const cached = memGet(ctx, K_GLOBAL);
  if (cached) return cached;

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

  memSet(K_GLOBAL, cfg);
  return cfg;
}

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
  await writeJson(ctx, K_GLOBAL, value);
  memDel(K_GLOBAL);
  memSet(K_GLOBAL, value);
  _ttlMs = Math.max(0, (value.configCacheTtl ?? 30) * 1000);
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

/**
 * 读取全站通用规则（兜底规则，对任何站点生效，优先级最低）。
 * @param {import('../contracts.js').Ctx} ctx
 * @returns {Promise<import('../contracts.js').Rule[]>}
 */
export async function getGlobalRules(ctx) {
  const data = await readJson(ctx, K_GLOBAL_RULES);
  if (!data || !Array.isArray(data.rules)) return [];
  return data.rules;
}

/**
 * 覆盖写入全站通用规则。
 * @param {import('../contracts.js').Ctx} ctx
 * @param {import('../contracts.js').Rule[]} rules
 */
export async function putGlobalRules(ctx, rules) {
  await writeJson(ctx, K_GLOBAL_RULES, { rules: Array.isArray(rules) ? rules : [] });
  invalidateMemCache();
}
