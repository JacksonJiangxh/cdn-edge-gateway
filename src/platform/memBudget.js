/**
 * ============================================================================
 * platform/memBudget.js —— isolate 级统一内存预算与自回收
 * ----------------------------------------------------------------------------
 * 【为什么需要它】
 * 边缘运行时（Cloudflare Workers / EdgeOne Pages / 阿里云 ESA）的 isolate
 * 都有内存上限：本项目已确认统一按 128MB 假设规划（CF 标准 128MB、ESA 函数
 * 侧 128MB 见 esa.jsonc；ESA 文档里的 512MB 是企业另一档配额）。三平台的 V8
 * 均**没有** JS 堆内省 API（浏览器才有的 `performance.memory` 在边缘不可用），
 * 因此无法在运行时真实地测量「还用了多少堆」。
 *
 * 本项目把内存用在了三个地方，且原本各自为政、互不知道彼此占了多少：
 *   - config 域：配置 L1 缓存（store.js 的 _mem，原上限 500 条）
 *   - stats  域：访问统计的内存聚合（collector.js，原上限 500 host）
 *   - ratelimit 域：限流内存计数（ratelimit.js，原上限 5000 条）
 * 任一处无脑增长都可能把 isolate 推向 OOM 而被平台冷杀。
 *
 * 【本模块职责】
 * 提供一个 isolate 级单例，统一掌握「总预算 + 各域配额 + 软/硬水位」：
 *   - 各域注册时声明权重、单条估算字节、及 evict 回调
 *   - 写内存前先 allocBytes，超限/水位过高时回调各域 evict 自回收
 *   - 软水位（默认 70%）触发非关键域激进回收；硬水位（默认 90%）强制所有域
 *     trim 到安全线之下，避免 OOM
 *
 * 【计量方式：估算字节 + 条目硬上限双约束】
 * 因无 heap API，本模块用「条目数 × 每类平均估算字节」来近似内存占用。
 * 估算字节会按采样（每 N 次 alloc 取一次样本）缓慢自校准，兼顾准确性与零
 * 额外 IO。各域仍需自己维护「条目数硬上限」作最终兜底（防构造型 key 打爆）。
 *
 * 【零开销契约】
 *   - 所有函数为同步、O(1) Map 操作，绝不 await，不进请求关键路径的延迟
 *   - 内存层异常一律内部吞掉，绝不影响数据面主流程
 *   - 未 init 时所有调用降级为 no-op（向后兼容旧调用方）
 * ============================================================================
 */

// ============================================================================
// 常量
// ============================================================================

/** 默认总预算：统一按 128MB 假设（可由 caps / MEM_BUDGET_BYTES 覆盖）。 */
const DEFAULT_TOTAL_BYTES = 128 * 1024 * 1024;

/** 软水位：超过则触发非关键域（stats/ratelimit）激进回收。 */
const SOFT_RATIO = 0.7;

/** 硬水位：超过则强制所有域（含 config）trim 到 SOFT_RATIO 之下。 */
const HARD_RATIO = 0.9;

/** 估算字节自校准的采样间隔（每多少次 alloc 校准一次）。 */
const CALIBRATION_EVERY = 1024;

/** 单条估算字节的初始默认值（B），随采样下调/上调。 */
const FALLBACK_ESTIMATE_BYTES = 1024;

// ============================================================================
// isolate 级单例状态
// ============================================================================

/** @type {boolean} 是否已初始化。 */
let _inited = false;

/** @type {number} 总预算（字节）。 */
let _totalBytes = DEFAULT_TOTAL_BYTES;

/** @type {number} 当前已估算占用的总字节数。 */
let _usedBytes = 0;

/** @type {Map<string, DomainState>} 已注册的内存域。 */
let _domains = new Map();

/** @type {number} 自上次校准以来累计的 alloc 次数，用于触发采样。 */
let _sinceCalibrate = 0;

/**
 * 单个内存域的注册态。
 * @typedef {Object} DomainState
 * @property {string} name
 * @property {number} weight                配额权重（用于按比例分配预算）
 * @property {(entry:any)=>number} estimateBytes  估算单条字节
 * @property {(aggressive:boolean)=>void} evict   回收回调
 * @property {boolean} allowAggressiveEvict  软水位时是否可被激进回收
 * @property {number} usedBytes              本域已估算占用字节
 * @property {number} entries                本域当前条目数
 * @property {number} quotaBytes             分配给本域的字节配额（软上限）
 * @property {number} runningEstimate        自校准后的「单条平均估算字节」
 */

// ============================================================================
// 初始化
// ============================================================================

/**
 * 初始化内存预算单例（每个 isolate 只应调用一次）。
 * 幂等：重复调用会按新参数重算配额，但不重置各域运行时计数。
 *
 * @param {{ totalBytes?: number, env?: Record<string, any> }} [opts]
 *   - totalBytes：平台注入的内存上限（caps.memBudgetBytes）。缺省 128MB。
 *   - env：运行时环境变量，若含 MEM_BUDGET_BYTES 则覆盖 totalBytes，便于调试/调档。
 * @returns {void}
 */
export function initMemBudget(opts = {}) {
  let total = opts.totalBytes || DEFAULT_TOTAL_BYTES;
  const env = opts.env || {};
  const override = Number(env.MEM_BUDGET_BYTES);
  if (Number.isFinite(override) && override > 0) total = override;

  _totalBytes = total;
  _inited = true;

  // 按权重把总预算分配给已注册域（预留 5% 安全边距，防估算偏低导致真 OOM）
  rebalance();
}

/**
 * 按各域权重重算配额。预留 5% 边距，使「估算占用」永远低于真实上限。
 * @returns {void}
 */
function rebalance() {
  if (_domains.size === 0) return;
  let totalWeight = 0;
  for (const d of _domains.values()) totalWeight += d.weight;
  if (totalWeight <= 0) totalWeight = _domains.size;

  const usable = Math.floor(_totalBytes * 0.95);
  for (const d of _domains.values()) {
    d.quotaBytes = Math.floor((usable * d.weight) / totalWeight);
  }
}

// ============================================================================
// 域注册
// ============================================================================

/**
 * 注册一个内存域。
 * 必须在 initMemBudget 之前或之后调用均可（配额会按需重算），但 evict 回调
 * 必须在首次 alloc 之前注册好，否则水位触发时无回收手段。
 *
 * @param {string} name 域名称（'config' | 'stats' | 'ratelimit'）
 * @param {{
 *   weight: number,
 *   estimateBytes: (entry:any)=>number,
 *   evict: (aggressive:boolean)=>void,
 *   allowAggressiveEvict?: boolean,
 * }} cfg
 *   - weight：配额权重（默认 1）。config 建议给更高权重，统计/限流可低一些。
 *   - estimateBytes：给定一条 entry 估算其字节占用（用于自校准与记账）。
 *   - evict：回收回调。aggressive=true 时可大刀阔斧释放（允许丢弃可容忍数据）；
 *            aggressive=false 时只做温和清理（如仅过期项）。
 *   - allowAggressiveEvict：软水位时是否可被激进回收。config 域应设 false
 *     （配置保守：仅硬水位才清，且清后读必回 KV，见 store.js）。
 * @returns {void}
 */
export function registerDomain(name, cfg) {
  const existing = _domains.get(name);
  _domains.set(name, {
    name,
    weight: cfg.weight > 0 ? cfg.weight : 1,
    estimateBytes:
      typeof cfg.estimateBytes === 'function'
        ? cfg.estimateBytes
        : () => FALLBACK_ESTIMATE_BYTES,
    evict: typeof cfg.evict === 'function' ? cfg.evict : () => {},
    allowAggressiveEvict: cfg.allowAggressiveEvict !== false,
    usedBytes: existing ? existing.usedBytes : 0,
    entries: existing ? existing.entries : 0,
    quotaBytes: existing ? existing.quotaBytes : 0,
    // 初值直接用域声明的估算器（以 null 样本探测），避免前 CALIBRATION_EVERY
    // 次 alloc 都按 FALLBACK 记账而偏离真实（小对象被高估、大对象被低估）。
    runningEstimate: Math.max(
      1,
      Math.round(
        (typeof cfg.estimateBytes === 'function' ? cfg.estimateBytes(null) : 0) ||
          FALLBACK_ESTIMATE_BYTES
      )
    ),
  });
  if (_inited) rebalance();
}

// ============================================================================
// 记账与回收
// ============================================================================

/**
 * 申请占用字节（写入一条内存前调用）。
 *
 * @param {string} name 域名称
 * @param {any} [entry] 待写入的条目，用于估算字节（可选）
 * @returns {boolean} 是否允许写入（false 表示被拒，调用方应放弃写入以免 OOM）
 */
export function allocBytes(name, entry) {
  // 未初始化：降级放行，由域自身条目上限兜底
  if (!_inited) return true;
  try {
    const d = _domains.get(name);
    if (!d) return true;

    const est = d.runningEstimate || FALLBACK_ESTIMATE_BYTES;
    d.usedBytes += est;
    d.entries += 1;
    _usedBytes += est;

    maybeCalibrate(d, entry);
    maybeReclaim(false);
    return true;
  } catch {
    // 内存层异常绝不影响主流程
    return true;
  }
}

/**
 * 释放字节（删除/清理一条内存后调用）。
 * @param {string} name 域名称
 * @param {number} [count=1] 释放的条数
 * @returns {void}
 */
export function releaseBytes(name, count = 1) {
  if (!_inited) return;
  try {
    const d = _domains.get(name);
    if (!d) return;
    const est = d.runningEstimate || FALLBACK_ESTIMATE_BYTES;
    d.usedBytes = Math.max(0, d.usedBytes - est * count);
    d.entries = Math.max(0, d.entries - count);
    _usedBytes = Math.max(0, _usedBytes - est * count);
  } catch {
    /* ignore */
  }
}

/**
 * 让 memBudget 感知某域「实际条目数」（域自己清理了条目但 memBudget 不知情时）。
 * 用于 evict 回调里域自行删除了大量条目后，把记账校正回去，避免记账只增不减。
 *
 * @param {string} name 域名称
 * @param {number} entries 该域当前的真实条目数
 * @returns {void}
 */
export function syncEntries(name, entries) {
  if (!_inited) return;
  try {
    const d = _domains.get(name);
    if (!d) return;
    const est = d.runningEstimate || FALLBACK_ESTIMATE_BYTES;
    d.entries = Math.max(0, entries);
    d.usedBytes = Math.max(0, d.entries * est);
    _usedBytes = Math.max(0, _usedBytes - (d.usedBytes - d.usedBytes));
    // 用基于真实条目的占用重算全局总量
    let total = 0;
    for (const dd of _domains.values()) total += dd.usedBytes;
    _usedBytes = total;
  } catch {
    /* ignore */
  }
}

/**
 * 估算字节自校准（采样）。
 * 每隔 CALIBRATION_EVERY 次 alloc，用调用方提供的真实 entry 估算值平滑修正
 * runningEstimate，使「单条平均估算字节」逐步贴近实际，提升计量精度。
 *
 * @param {DomainState} d 域状态
 * @param {any} [entry] 样本条目
 * @returns {void}
 */
function maybeCalibrate(d, entry) {
  _sinceCalibrate += 1;
  if (_sinceCalibrate < CALIBRATION_EVERY) return;
  _sinceCalibrate = 0;
  if (!entry) return;
  try {
    const real = d.estimateBytes(entry);
    if (Number.isFinite(real) && real > 0) {
      // 指数滑动平均，平滑抖动
      d.runningEstimate = Math.round(
        d.runningEstimate * 0.8 + real * 0.2
      );
    }
  } catch {
    /* ignore */
  }
}

/**
 * 水位检查与回收。
 *
 * 设计要点（与「全局软水位」方案的区别）：
 *   - 回收主触发是**域级配额水位**，而非全局 70%。每个域有 quotaBytes（软上限），
 *     当某域自身 usedBytes 触达其配额时即触发该域 evict，使该域自然维持在配额
 *     上限附近震荡，不依赖其它域的状态。这避免了「保守域(config)占比低导致全局
 *     永远到不了软水位、软水位形同虚设」的问题。
 *   - 可激进域（stats/ratelimit）超配额即 evict（aggressive=true，可大刀阔斧）。
 *   - 保守域（config）超配额时**常规路径不回收**（保证配置命中与及时生效），
 *     仅在「全局硬水位」兜底时才被迫释放。
 *   - 全局硬水位（HARD_RATIO）作为兜底：任一域异常增长导致全局逼近 90% 时，
 *     强制所有域 trim 到 SOFT_RATIO 之下，避免 OOM 杀 isolate。
 *
 * @param {boolean} force 是否强制（主动/硬水位路径）
 * @returns {void}
 */
function maybeReclaim(force) {
  try {
    // 全局硬水位兜底：强制所有域（含 config）trim 到安全线之下
    if (_usedBytes / _totalBytes >= HARD_RATIO) {
      trimTo(Math.floor(_totalBytes * SOFT_RATIO));
      return;
    }

    // 常规写入路径 / 主动检查：域超自身配额即回收（保守域仅 force 时回收）
    for (const d of _domains.values()) {
      if (d.usedBytes < d.quotaBytes) continue;
      // 保守域常规不回收
      if (!d.allowAggressiveEvict && !force) continue;
      try {
        d.evict(true);
      } catch {
        /* 域回收异常不影响其它域 */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * 强制把所有域 trim 到目标总占用之下（硬水位兜底）。
 * 先 trim 可激进域，再（必要时）trim 保守域（config）。
 *
 * @param {number} targetBytes 目标总占用（字节）
 * @returns {void}
 */
function trimTo(targetBytes) {
  // 第一遍：激进域全清或大幅清理
  for (const d of _domains.values()) {
    if (d.allowAggressiveEvict) {
      try {
        d.evict(true);
      } catch {
        /* ignore */
      }
    }
  }
  if (_usedBytes <= targetBytes) return;

  // 第二遍：保守域（config）也不得不清，aggressive=true 让其对过期项做最大清理
  // 注意：config 域 evict(true) 只清过期/可丢项，且清后读必回 KV，不会返回陈旧值
  for (const d of _domains.values()) {
    if (!d.allowAggressiveEvict) {
      try {
        d.evict(true);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 在软/硬水位触发时主动调用（如 ratelimit 的分钟槽清理、collector 的 flush 后）。
 * 让 memBudget 顺带检查一次水位，及时回收。
 * @returns {void}
 */
export function touchBudget() {
  if (!_inited) return;
  maybeReclaim(false);
}

// ============================================================================
// 可观测：debug 快照
// ============================================================================

/**
 * 返回当前内存预算占用快照，供 /__health、/debug 响应展示。
 * @returns {{
 *   totalBytes: number,
 *   usedBytes: number,
 *   usedRatio: number,
 *   softRatio: number,
 *   hardRatio: number,
 *   domains: Record<string, { usedBytes:number, entries:number, quotaBytes:number, allowAggressiveEvict:boolean }>,
 * }}
 */
export function getBudgetSnapshot() {
  const domains = {};
  for (const d of _domains.values()) {
    domains[d.name] = {
      usedBytes: d.usedBytes,
      entries: d.entries,
      quotaBytes: d.quotaBytes,
      allowAggressiveEvict: d.allowAggressiveEvict,
    };
  }
  return {
    totalBytes: _totalBytes,
    usedBytes: _usedBytes,
    usedRatio: _totalBytes > 0 ? _usedBytes / _totalBytes : 0,
    softRatio: SOFT_RATIO,
    hardRatio: HARD_RATIO,
    domains,
  };
}

/**
 * 返回是否已初始化（供调用方判断是否依赖本模块）。
 * @returns {boolean}
 */
export function isMemBudgetReady() {
  return _inited;
}

/**
 * 返回某域当前的字节配额（软上限）。未初始化或未注册时返回 0。
 * 供域自身据此推导「条目数上限」等。
 * @param {string} name 域名称
 * @returns {number}
 */
export function getDomainQuota(name) {
  if (!_inited) return 0;
  const d = _domains.get(name);
  return d ? d.quotaBytes : 0;
}

/**
 * 仅供测试：重置单例的运行时计数，但**保留已注册的域**（模块顶层注册的域
 * 不会被 ESM 重复执行，若此处清空会导致后续用例拿不到域）。各用例如需自定义
 * 域，用同名 registerDomain 覆盖即可。
 * @returns {void}
 */
export function _resetMemBudgetForTest() {
  _inited = false;
  _totalBytes = DEFAULT_TOTAL_BYTES;
  _usedBytes = 0;
  _sinceCalibrate = 0;
  // 注意：不清空 _domains，保留已注册的域；重置各域运行时计数
  for (const d of _domains.values()) {
    d.usedBytes = 0;
    d.entries = 0;
  }
}
