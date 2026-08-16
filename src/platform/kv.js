/**
 * ============================================================================
 * platform/kv.js —— KV 存储统一适配层
 * ----------------------------------------------------------------------------
 * 抹平 Cloudflare KV 与腾讯云 EdgeOne KV 的接口差异，对上层暴露统一的 KVLike：
 *
 *   { get(key, type?), put(key, value, opts?), delete(key), list(opts?) }
 *
 * 已知平台差异（截至实现时）：
 * ┌──────────────┬────────────────────────────┬──────────────────────────────┐
 * │              │ Cloudflare KV              │ EdgeOne KV                   │
 * ├──────────────┼────────────────────────────┼──────────────────────────────┤
 * │ get 返回类型 │ get(key, 'text'|'json'|    │ 仅 get(key) → string，部分版 │
 * │              │ 'arrayBuffer'|'stream')    │ 本支持 get(key,{type:'json'})│
 * │ put 选项     │ {expirationTtl, expiration,│ 仅支持 {expirationTtl}，     │
 * │              │  metadata}                 │ metadata 不支持              │
 * │ list 返回    │ {keys:[{name,expiration,   │ {keys:[{key}], list_complete,│
 * │              │  metadata}],list_complete, │ cursor} —— 字段名是 key 不是 │
 * │              │  cursor}                   │ name                         │
 * │ 不存在的 key │ 返回 null                  │ 返回 null（部分版本抛错）    │
 * └──────────────┴────────────────────────────┴──────────────────────────────┘
 *
 * 另：阿里云 ESA 提供原生边缘存储 EdgeKV（运行时全局类 `new EdgeKV({namespace})`，
 * 不经 env 注入），其 get/put 经独立的 createEdgeKVAdapter 包装、接口同构。
 * ⚠️ 但 ESA 的 EdgeKV **按量收费且无免费额度**，因此本项目在 ESA 上**统一禁用厂商
 * KV**（getKV 在 ESA 平台跳过 createEdgeKVAdapter），持久化一律走外置 REDIS_URL
 * （用户自建 Webdis/Redis，见 redis-kv.js）。createEdgeKVAdapter 仅作为非 ESA 平台
 * 误探测到 EdgeKV 时的兜底兼容。
 *
 * 因此本层的策略是：
 * 1. get 一律先按「原始文本」取回，再由本层自己做 JSON.parse，
 *    避免依赖底层对 type 参数的支持程度。
 * 2. put 只透传 expirationTtl，其余选项按平台能力过滤。
 * 3. list 统一把 EdgeOne 的 {key} 归一化成 CF 的 {name}。
 * 4. 所有底层调用都包 try/catch，读失败返回 null 而不是抛错，
 *    让上层能优雅降级到 defaults。
 * 5. **键名统一编码**：EdgeOne KV 官方限定 key「仅支持数字、字母及下划线」，
 *    而本项目键空间大量使用 `:` 分隔、host/IP 含 `.`。因此本层在所有
 *    get/put/delete/list 的边界上做编解码（见 keyCodec.js），上层调用点
 *    继续使用可读的 `cfg:global` 形式，无需感知。
 *
 * 【关于 EdgeOne Blob 回退】
 * 曾经在此实现「KV 未授权时回退 Blob」，现已移除。原因是二者运行时不交集：
 *   - EdgeOne KV  ：仅支持在 Edge Functions 中使用
 *   - EdgeOne Blob：SDK 仅提供 Node.js 版本（@edgeone/pages-blob）
 * 本项目入口 edge-functions/[[default]].js 是 Edge Function（非 Node 运行时），
 * 动态 import('@edgeone/pages-blob') 必然失败并静默降级为无持久化。
 * 若将来需要 Blob，必须在 cloud-functions/ 另建 Cloud Function 入口承载，而非在此回退。
 * ============================================================================
 */

import { encodeKey, decodeKey, encodePrefix } from './keyCodec.js';
import { hasRedisConfig, createRedisKV } from './redis-kv.js';
import { PLATFORM_ALIASES } from './caps.js';

/**
 * @typedef {Object} KVListKey
 * @property {string} name              键名（已归一化）
 * @property {number} [expiration]      过期时间戳（秒），可能不存在
 * @property {Object} [metadata]        元数据，EdgeOne 恒为 undefined
 */

/**
 * @typedef {Object} KVListResult
 * @property {KVListKey[]} keys         键列表
 * @property {boolean}     list_complete 是否已列完
 * @property {string}      [cursor]     下一页游标
 */

/**
 * @typedef {Object} KVLike
 * @property {(key:string, type?:'text'|'json', strong?:boolean)=>Promise<any>} get
 * @property {(key:string, value:string, opts?:{expirationTtl?:number})=>Promise<void>} put
 * @property {(key:string)=>Promise<void>} delete
 * @property {(opts?:{prefix?:string, limit?:number, cursor?:string})=>Promise<KVListResult>} list
 */

/** 绑定名候选，按优先级排列 */
const BINDING_NAMES = ['CDN_KV', 'KV'];

/** ESA（阿里云边缘安全加速）EdgeKV 命名空间：控制台创建、函数内 new EdgeKV 引用 */
const ESA_KV_NAMESPACE = (process && process.env && process.env.ESA_KV_NAMESPACE) || 'kv';

/** isolate 级适配器缓存，key 为原始绑定对象，避免每次请求重复包装 */
const _adapterCache = new WeakMap();

/**
 * 并发读取合并（in-flight coalescing）。
 *
 * 目的：进一步压低 KV / Redis 读触达。当同一 isolate 在极短窗口内对【同一物理键】
 * 发出多次并发 get（典型场景：冷启动后第一批并发请求、或一个请求内多模块并发读同一
 * 配置），若不加合并，每次都会穿透到后端存储。这里把「同一物理键 + 进行中」的读取
 * 合并为一次实际后端调用，其余等待同一 Promise。
 *
 * 安全性（绝不跨请求长串联）：
 *   - 每个 inflight 条目在 Promise settle（无论成功/失败）后立即删除，不存在长驻缓存。
 *   - 合并窗口本质上是「并发」，不是「跨时间缓存」：只有真正同时进行的 get 才会合并；
 *     一个已完成、稍后才来的 get 不会命中、会重新走后端（其后由 store.js 的 L1 内存
 *     缓存承接，TTL 30s/120s）。
 *   - 失败时也要删除条目并放行重试，避免「一次失败永久阻塞后续读」。
 */
const _inflight = new Map();

function coalesceGet(physKey, doRead) {
  const existing = _inflight.get(physKey);
  if (existing) return existing;
  const p = (async () => {
    try {
      return await doRead();
    } finally {
      _inflight.delete(physKey);
    }
  })();
  _inflight.set(physKey, p);
  return p;
}

/**
 * 鸭子类型判断：是否是一个可用的 KV 命名空间。
 * @param {any} b 待检测对象
 * @returns {boolean} 是否像 KV
 */
function looksLikeKV(b) {
  return !!(b && typeof b === 'object' && typeof b.get === 'function' && typeof b.put === 'function');
}

/**
 * 探测 ESA 原生边缘存储（EdgeKV）是否可用。
 * 官方文档示例：`new EdgeKV({ namespace: "kv" })`，EdgeKV 为运行时全局类。
 * @returns {boolean} 是否存在 EdgeKV 全局类
 */
function detectEdgeKV() {
  try {
    return typeof globalThis.EdgeKV === 'function';
  } catch {
    return false;
  }
}

/**
 * 从 env 上挑出原始 KV 绑定。
 * @param {Object} env 环境对象
 * @returns {any|null} 原始绑定或 null
 */
function pickRawBinding(env) {
  if (!env) return null;
  for (const name of BINDING_NAMES) {
    if (looksLikeKV(env[name])) return env[name];
  }
  return null;
}

/**
 * 从运行时【全局变量】上探测原始 KV 绑定。
 *
 * 为什么要这个：EdgeOne Makers 的 KV 与 Cloudflare 不同——它不是通过 context.env
 * 注入，而是【绑定时自定义名的运行时全局变量】（官方范式：`await my_kv.get('key')`）。
 * 因此 EO 上 `env.CDN_KV` 恒为 undefined，`pickRawBinding(env)` 永远拿不到。
 * 本项目在 EO 控制台绑定的 KV 变量名是 CDN_KV（见 wrangler.toml / edgeone.json 注释），
 * 绑定后该名字会作为【全局变量】注入 Edge Function 运行时，故这里从 globalThis
 * 按 BINDING_NAMES 逐名探测，把 EO KV 统一包装成 KVLike。与 CF 的 env 绑定、ESA 的
 * globalThis.EdgeKV 一起，三平台各自可用的访问方式都被覆盖。
 *
 * 安全性：仅探测「同名且有 get/put 方法」的对象，绝不会误用其它全局；探测不到就
 * 返回 null，由上层优雅降级（配了 REDIS_URL 则走 Redis，否则完全无持久化）。
 *
 * @returns {any|null} 原始全局 KV 绑定或 null
 */
function pickGlobalBinding() {
  let g;
  try {
    g = globalThis || (typeof global !== 'undefined' ? global : null);
  } catch {
    return null;
  }
  if (!g) return null;
  for (const name of BINDING_NAMES) {
    if (looksLikeKV(g[name])) return g[name];
  }
  return null;
}

/**
 * 归一化 list 返回的单个 key 条目。
 * CF 用 `name`，EdgeOne 用 `key`，这里统一成 `name`。
 * @param {any} item 原始条目（可能是字符串或对象）
 * @returns {KVListKey|null} 归一化后的条目
 */
function normalizeListKey(item) {
  if (item == null) return null;
  if (typeof item === 'string') return { name: item };
  const name = item.name ?? item.key ?? item.Key;
  if (typeof name !== 'string' || name === '') return null;
  const out = { name };
  if (typeof item.expiration === 'number') out.expiration = item.expiration;
  if (item.metadata != null) out.metadata = item.metadata;
  return out;
}

/**
 * 把原始 KV 绑定包装成统一的 KVLike 适配器。
 * @param {any} raw 原始 KV 绑定
 * @returns {KVLike} 统一适配器
 */
function wrap(raw) {
  const cached = _adapterCache.get(raw);
  if (cached) return cached;

  /** @type {KVLike} */
  const adapter = {
    /**
     * 读取一个键。
     * 统一先取文本，再按需自行解析 JSON——这样不依赖底层对 type 参数的支持。
     * @param {string} key 键名
     * @param {'text'|'json'} [type='text'] 期望的返回类型
     * @returns {Promise<any>} 值；不存在、解析失败或底层报错时均返回 null
     */
    async get(key, type = 'text') {
      if (typeof key !== 'string' || key === '') return null;
      let physKey;
      try {
        physKey = encodeKey(key);
      } catch {
        // 键本身非法（超长等）→ 当作无数据，由上层降级
        return null;
      }
      // 并发读取合并：同一物理键在极短窗口内的并发 get 共享一次后端调用，
      // 进一步压低 KV/Redis 读触达（冷启动并发、单请求多模块并发读同一配置）。
      // 仅合并「实际后端读」这一步；编码/解码/解析均在合并外层按各自调用独立进行，
      // 因此不同调用方拿到的类型/解析结果不会互相干扰。
      let rawVal;
      try {
        rawVal = await coalesceGet(physKey, async () => {
          try {
            // 先尝试标准 CF 签名 get(key, 'text')
            return await raw.get(physKey, 'text');
          } catch {
            try {
              // EdgeOne 部分版本只接受单参数
              return await raw.get(physKey);
            } catch {
              // 读失败（网络/权限/键不存在抛错）一律当作「无数据」，由上层降级
              return null;
            }
          }
        });
      } catch {
        return null;
      }
      if (rawVal == null) return null;

      // 某些实现会直接返回 ArrayBuffer / Uint8Array，这里兜底转成字符串
      let text;
      if (typeof rawVal === 'string') {
        text = rawVal;
      } else if (rawVal instanceof ArrayBuffer || ArrayBuffer.isView(rawVal)) {
        try {
          text = new TextDecoder().decode(
            rawVal instanceof ArrayBuffer ? rawVal : rawVal.buffer
          );
        } catch {
          return null;
        }
      } else if (typeof rawVal === 'object') {
        // 已经是对象（EdgeOne 某些版本会自动解析），直接返回
        return type === 'json' ? rawVal : JSON.stringify(rawVal);
      } else {
        text = String(rawVal);
      }

      if (type !== 'json') return text;
      try {
        return JSON.parse(text);
      } catch {
        // 脏数据不应导致整条请求失败
        return null;
      }
    },

    /**
     * 写入一个键。
     * 只透传 expirationTtl（两平台共有），metadata / expiration 在 EdgeOne 上不支持，
     * 为保证行为一致这里统一不使用。
     * @param {string} key 键名
     * @param {string} value 值（调用方负责序列化）
     * @param {{expirationTtl?:number}} [opts] 选项
     * @returns {Promise<void>}
     */
    async put(key, value, opts) {
      if (typeof key !== 'string' || key === '') return;
      // 键非法时抛错——写操作必须让调用方感知
      const physKey = encodeKey(key);
      const body = typeof value === 'string' ? value : JSON.stringify(value);
      /** @type {{expirationTtl?:number}|undefined} */
      let putOpts;
      if (opts && typeof opts.expirationTtl === 'number' && opts.expirationTtl > 0) {
        // CF 要求 expirationTtl 最小 60 秒，EdgeOne 无此限制，取最大值保证两边都合法
        putOpts = { expirationTtl: Math.max(60, Math.floor(opts.expirationTtl)) };
      }
      try {
        if (putOpts) {
          await raw.put(physKey, body, putOpts);
        } else {
          await raw.put(physKey, body);
        }
      } catch (err) {
        // 写失败向上抛，写操作的失败必须让调用方感知（区别于读）
        throw new Error(`KV put failed for "${key}": ${err && err.message ? err.message : err}`);
      }
    },

    /**
     * 删除一个键。删除不存在的键不算错误。
     * @param {string} key 键名
     * @returns {Promise<void>}
     */
    async delete(key) {
      if (typeof key !== 'string' || key === '') return;
      if (typeof raw.delete !== 'function') return;
      const physKey = encodeKey(key);
      try {
        await raw.delete(physKey);
      } catch (err) {
        throw new Error(`KV delete failed for "${key}": ${err && err.message ? err.message : err}`);
      }
    },

    /**
     * 列举键。返回结构已归一化为 CF 形态。
     * EdgeOne 若不支持 list，则返回空列表（上层依赖 _index 而非 list，故不致命）。
     * @param {{prefix?:string, limit?:number, cursor?:string}} [opts] 选项
     * @returns {Promise<KVListResult>} 归一化结果
     */
    async list(opts) {
      if (typeof raw.list !== 'function') {
        return { keys: [], list_complete: true };
      }

      // 前缀同样要编码。逐字符编码保证 encode(prefix) 一定是 encode(fullKey)
      // 的前缀，因此前缀列举语义在编码后依然成立（详见 keyCodec.js）。
      const physOpts = { ...(opts || {}) };
      if (typeof physOpts.prefix === 'string' && physOpts.prefix !== '') {
        try {
          physOpts.prefix = encodePrefix(physOpts.prefix);
        } catch {
          return { keys: [], list_complete: true };
        }
      }

      let res;
      try {
        res = await raw.list(physOpts);
      } catch {
        return { keys: [], list_complete: true };
      }
      if (!res) return { keys: [], list_complete: true };

      const srcKeys = Array.isArray(res.keys) ? res.keys : Array.isArray(res) ? res : [];
      const keys = [];
      for (const item of srcKeys) {
        const k = normalizeListKey(item);
        if (!k) continue;
        // 把物理键解回逻辑键，让上层（stats cleanup 等）拿到可读键名。
        // 解不出来说明是编码启用前的历史键，原样保留并打标，
        // 供迁移逻辑识别；上层按逻辑键做前缀匹配时不会误伤。
        const logical = decodeKey(k.name);
        if (logical === null) {
          k.legacy = true;
        } else {
          k.name = logical;
        }
        keys.push(k);
      }
      const complete =
        typeof res.list_complete === 'boolean'
          ? res.list_complete
          : typeof res.listComplete === 'boolean'
            ? res.listComplete
            : true;
      /** @type {KVListResult} */
      const out = { keys, list_complete: complete };
      const cursor = res.cursor ?? res.next_cursor;
      if (typeof cursor === 'string' && cursor !== '') out.cursor = cursor;
      return out;
    },
  };

  /**
   * 原始通道：绕过键编码，直接以物理键读写。
   *
   * 仅供迁移逻辑使用——迁移需要读取「编码方案启用前写入的历史键」
   * （如字面量 `cfg:global`），这些键无法由 encodeKey 产生，
   * 必须绕过编码层才能访问和删除。
   *
   * 业务代码**不应**使用本通道。
   */
  adapter.raw = {
    /**
     * 以物理键直接读取。
     * @param {string} physKey 物理键（不经编码）
     * @returns {Promise<string|null>} 原始文本，失败返回 null
     */
    async get(physKey) {
      try {
        const v = await raw.get(physKey, 'text');
        return v == null ? null : typeof v === 'string' ? v : String(v);
      } catch {
        try {
          const v = await raw.get(physKey);
          return v == null ? null : typeof v === 'string' ? v : String(v);
        } catch {
          return null;
        }
      }
    },
    /**
     * 以物理键直接删除。
     * @param {string} physKey 物理键（不经编码）
     * @returns {Promise<boolean>} 是否成功
     */
    async delete(physKey) {
      if (typeof raw.delete !== 'function') return false;
      try {
        await raw.delete(physKey);
        return true;
      } catch {
        return false;
      }
    },
    /**
     * 以物理前缀直接列举，返回未解码的物理键名。
     * @param {{prefix?:string, limit?:number, cursor?:string}} [o] 选项
     * @returns {Promise<KVListResult>} 物理键列表
     */
    async list(o) {
      if (typeof raw.list !== 'function') return { keys: [], list_complete: true };
      let res;
      try {
        res = await raw.list(o || {});
      } catch {
        return { keys: [], list_complete: true };
      }
      if (!res) return { keys: [], list_complete: true };
      const src = Array.isArray(res.keys) ? res.keys : Array.isArray(res) ? res : [];
      const keys = [];
      for (const item of src) {
        const k = normalizeListKey(item);
        if (k) keys.push(k);
      }
      const complete =
        typeof res.list_complete === 'boolean'
          ? res.list_complete
          : typeof res.listComplete === 'boolean'
            ? res.listComplete
            : true;
      const out = { keys, list_complete: complete };
      const cursor = res.cursor ?? res.next_cursor;
      if (typeof cursor === 'string' && cursor !== '') out.cursor = cursor;
      return out;
    },
  };

  _adapterCache.set(raw, adapter);
  return adapter;
}

/**
 * 把阿里云 ESA 原生 EdgeKV 包装成统一的 KVLike 适配器。
 *
 * ESA 文档示例：`const kv = new EdgeKV({ namespace: "kv" }); await kv.get(key, {type:'text'})`。
 * 与 CF/EO 的 env 绑定范式不同，EdgeKV 是运行时全局类，通过 namespace 名引用，
 * 不经由 env 注入。
 *
 * ⚠️ 重要：阿里云 ESA 的 EdgeKV **按量收费且无免费额度**。本项目为控制成本，
 * 在 ESA 上**统一不使用厂商 KV**（见 getKV 的 ESA 分支：ESA 平台直接跳过本函数，
 * 强制走 REDIS_URL）。因此本适配器实际只在「非 ESA 平台误探测到 EdgeKV 全局类」等
 * 极少数场景下被调用；ESA 部署请务必配置 REDIS_URL。
 *
 * @param {Object} env 环境对象（用于读取 ESA_KV_NAMESPACE 覆盖）
 * @returns {KVLike|null} 适配器；不可用返回 null
 */
function createEdgeKVAdapter(env) {
  if (!detectEdgeKV()) return null;
  let store;
  const ns = (env && env.ESA_KV_NAMESPACE) || ESA_KV_NAMESPACE;
  try {
    store = new globalThis.EdgeKV({ namespace: ns });
  } catch {
    return null;
  }
  if (!store || typeof store.get !== 'function') return null;

  /** @type {KVLike} */
  const adapter = {
    backend: 'esa-edgekv',

    async get(key, type = 'text') {
      if (typeof key !== 'string' || key === '') return null;
      let physKey;
      try {
        physKey = encodeKey(key);
      } catch {
        return null;
      }
      // 并发读取合并（与 wrap 一致），减少重复后端读。
      let rawVal;
      try {
        rawVal = await coalesceGet(physKey, async () => {
          try {
            // EdgeKV.get(physKey, { type }) 返回对应类型（text/json）。
            // 统一先取 text 再自行 JSON.parse，避免依赖底层 type 支持程度。
            return await store.get(physKey, { type: 'text' });
          } catch {
            // 读失败降级默认值
            return null;
          }
        });
      } catch {
        return null;
      }
      if (rawVal == null) return null;
      let text;
      if (typeof rawVal === 'string') {
        text = rawVal;
      } else if (typeof rawVal === 'object') {
        return type === 'json' ? rawVal : JSON.stringify(rawVal);
      } else {
        text = String(rawVal);
      }
      if (type !== 'json') return text;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    },

    async put(key, value, opts) {
      if (typeof key !== 'string' || key === '') return;
      const physKey = encodeKey(key);
      const body = typeof value === 'string' ? value : JSON.stringify(value);
      /** @type {any} */
      const putOpts = {};
      if (opts && typeof opts.expirationTtl === 'number' && opts.expirationTtl > 0) {
        putOpts.expirationTtl = Math.max(60, Math.floor(opts.expirationTtl));
      }
      if (typeof store.put !== 'function') {
        throw new Error(`EdgeKV 不支持 put（命名空间 ${ns}）`);
      }
      try {
        await store.put(physKey, body, putOpts);
      } catch (err) {
        throw new Error(`EdgeKV put failed for "${key}": ${err && err.message ? err.message : err}`);
      }
    },

    async delete(key) {
      if (typeof key !== 'string' || key === '') return;
      if (typeof store.delete !== 'function') return;
      const physKey = encodeKey(key);
      try {
        await store.delete(physKey);
      } catch (err) {
        throw new Error(`EdgeKV delete failed for "${key}": ${err && err.message ? err.message : err}`);
      }
    },

    // EdgeKV 的 list 能力文档未明示，保守返回空列表（上层依赖 _index 而非 list）。
    async list() {
      return { keys: [], list_complete: true };
    },
  };

  return adapter;
}

/**
 * 是否运行在阿里云 ESA（边缘安全加速）运行时。
 * 用于决定持久化后端选型：ESA 的 EdgeKV **收费且无免费额度**，
 * 故项目统一禁用厂商 KV、强制使用外置 REDIS_URL（见 getKV / createEdgeKVAdapter）。
 * @param {Object} env 平台环境变量
 * @returns {boolean} 是否 ESA 运行时
 */
function isEsaPlatform(env) {
  const p = (env && (env.CLOUD_PLATFORM || '')) || '';
  const lower = String(p).toLowerCase();
  // 复用 caps.js 的别名归一映射，与 detectCaps 的厂商口径保持单一真相源。
  // 只有归一后为 'esa' 才判定为 ESA（edgeone/cloudflare 等其它取值不再误判）。
  return PLATFORM_ALIASES[lower] === 'esa';
}

/**
 * 获取统一的 KV 适配器。
 *
 * 优先级链（按平台能力自动选择，上层无感）：
 *   1. env.CDN_KV / env.KV      —— Cloudflare / EdgeOne 原生 KV 绑定
 *   2. globalThis.EdgeKV        —— 阿里云 ESA 原生边缘存储（**仅 CF/EO 之外的平台**；
 *                                  ESA 因 EdgeKV 收费无免费额度，本项目统一禁用，见下方 ESA 分支）
 *   3. REDIS_URL                 —— 无原生 KV 时降级（自建 Webdis/Redis，见 redis-kv.js）
 *   4. null                      —— 完全无持久化，上层降级到 defaults
 *
 * ⚠️ ESA 特殊处理：阿里云 ESA 的 EdgeKV **按量收费、无免费额度**，因此本项目
 * 在 ESA 上**不使用任何厂商 KV**（既不读 EdgeKV 也不依赖其免费额度），持久化
 * 一律走外置 REDIS_URL（用户自建 Webdis/Redis）。故 ESA 分支直接跳过步骤 2。
 *
 * @param {Object} env 平台环境变量与绑定
 * @returns {KVLike|null} KV 适配器，无持久化时返回 null
 *
 * @example
 * const kv = getKV(ctx.env);
 * if (!kv) return DEFAULT_GLOBAL;         // 优雅降级
 * const cfg = await kv.get('cfg:global', 'json');
 */
export function getKV(env) {
  const raw = pickRawBinding(env);
  if (raw) return wrap(raw);

  // EdgeOne Makers：KV 是【全局变量】而非 env 绑定（官方范式 `await my_kv.get()`）。
  // EO 控制台把 namespace 绑成变量名 CDN_KV（本项目约定）后，该名字作为全局注入
  // Edge Function 运行时，故从 globalThis 探测并包装，与 CF 的 env 绑定统一成 KVLike。
  const globalRaw = pickGlobalBinding();
  if (globalRaw) return wrap(globalRaw);

  // 阿里云 ESA：EdgeKV 收费无免费额度，统一禁用，直接走 REDIS_URL（步骤 3）。
  // 不在此创建 EdgeKV 适配器，避免误用收费资源。
  const esa = isEsaPlatform(env) ? null : createEdgeKVAdapter(env);
  if (esa) return esa;

  // 平台未提供原生 KV 绑定时，降级到自部署的 Webdis/Redis 后端
  // （EO Pages / ESA 等不具备免费 KV 的平台，通过 REDIS_URL 指向自建 Redis）。
  // 该后端与 KVLike 完全同构，store.js 无需任何改动即可获得持久化能力。
  if (hasRedisConfig(env)) {
    return createRedisKV(env);
  }
  return null;
}

/**
 * 预热 KV 适配器（请求生命周期早期调用一次，可选）。
 *
 * 目前 KV 适配器是纯同步包装，无需异步初始化；本函数保留是为了
 * 兼容 app 层已有的 waitUntil(preloadKV(...)) 调用点，并预先填充
 * isolate 级适配器缓存，省去首个请求的包装开销。
 *
 * @param {Object} env 平台环境变量
 * @param {Caps} [_caps] 平台能力（保留签名兼容：CF / EO 的 KV 适配路径一致，
 *        当前无需按 caps 分支，但预留该参以便未来差异化预热）
 * @returns {Promise<KVLike|null>} 适配器或 null
 */
export async function preloadKV(env, _caps) {
  return getKV(env);
}
