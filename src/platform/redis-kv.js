/**
 * ============================================================================
 * platform/redis-kv.js —— 基于 Webdis 的 KV 后端（自部署 Redis 桥接）
 * ----------------------------------------------------------------------------
 * 解决「边缘平台没有原生 KV」时的持久化问题：
 *
 *   EdgeOne Pages / ESA / 其它仅提供 Function 运行时、不提供 KV 绑定的平台，
 *   无法使用 CDN_KV。本项目通过自部署的 Webdis（官方仓库
 *   https://github.com/nicolasff/webdis）读写自己的 Redis 实例，从而在不依赖
 *   平台 KV 的前提下获得持久化能力。
 *
 * ★ 以下约定经核对 Webdis 源码（src/cmd.c、src/formats/json.c、src/client.c）
 *   确认，是本实现唯一可信来源，不是猜测：
 *
 *   1) URL 即命令：GET /<CMD>/<arg1>/<arg2>...，path 段经 decode_uri 解码
 *      （注意：path 段里的 '+' 会被解码成空格，故 key 必须经 encodeURIComponent；
 *      本项目 key 走 encodeURIComponent，value 不走 path，规避此坑）。
 *   2) 请求体即最后一个参数：src/cmd.c:283 把 body 作为命令 argv 的最后一个
 *      参数，且不经过 decode_uri——即 body 原样透传。因此【写值一律走 POST +
 *      body】，杜绝 URL 编码黑洞与长度限制，也避免 '+'/'%' 被误解码。
 *   3) 响应结构（src/formats/json.c:380-446），按 Redis 返回类型分：
 *        - STRING（GET 命中）：{"GET":"value"}          值是【标量字符串】
 *        - NIL   （GET 缺失） ：{"GET":null}             【null，HTTP 200】
 *        - STATUS（SET）      ：{"SET":[true,"OK"]}      值是【数组】
 *        - INTEGER（DEL/EXISTS）：{"DEL":1} / {"EXISTS":0}
 *        - ARRAY （KEYS）      ：{"KEYS":["a","b"]}       值是【数组本身】
 *      => 解析时必须区分：GET 取 response.GET（标量）；KEYS 取 response.KEYS
 *         （数组）；SET/DEL/EXISTS 取各自字段。缺失键用 response.GET === null 判定。
 *   4) '?' 会截断命令参数（src/cmd.c:160 把 ? 之后当 query 丢弃），本实现 URL
 *      不含 '?'。format/type 等用 query 参数时由 Webdis 客户端解析（本项目不用）。
 *   5) 鉴权：Webdis 自带 HTTP Basic Auth（src/acl.c，Authorization: Basic）；
 *      更常见是自部署套反向代理做 Bearer。本项目 REDIS_TOKEN 直接作为
 *      Authorization 头的值（若填的是 base64 即为 Basic，若填 Bearer xxx 即 Bearer），
 *      由用户按自己前置鉴权方式填写。
 *
 * 设计要点（与 kv.js 的 CF/EO 适配器完全同构）：
 *   1. 暴露与 KVLike 一致的 { get, put, delete, list }；store.js 零改动。
 *   2. 复用 keyCodec 做键名编码（与平台 KV 键空间对齐）。
 *   3. 读失败返回 null（上层降级默认值）；写失败上抛（管理面告知用户）。
 *
 * 配置来源（env）：
 *   REDIS_URL        必填，如 https://redis.example.com 或 http://127.0.0.1:7379
 *   REDIS_TOKEN      可选，直接作为 Authorization 头值（Basic base64 / Bearer xxx）
 *   REDIS_PREFIX     可选，键统一前缀（多应用共享 Redis 时隔离）
 *   REDIS_TIMEOUT_MS 可选，单次请求超时，默认 5000ms
 *
 * ⚠️ 安全红线：Webdis 默认无鉴权、会把 Redis 明文暴露公网。自部署务必
 *   ① 仅监听内网 / 套 TLS；② 前置带密钥的反向代理（REDIS_TOKEN 即为此设）；
 *   ③ 绝不要把 REDIS_URL 指向公网裸露的 Webdis。详见 docs/13-redis-kv.md。
 * ============================================================================
 */

import { encodeKey, decodeKey, encodePrefix } from './keyCodec.js';

/**
 * 判断 env 是否配置了 Webdis Redis 后端。
 * @param {Object} env 平台环境变量
 * @returns {boolean} 是否配置了可用的 REDIS_URL
 */
export function hasRedisConfig(env) {
  const url = env && (env.REDIS_URL || env.REDIS_URL_KV);
  return typeof url === 'string' && url.trim() !== '';
}

/**
 * 把前缀（可能为空）与逻辑键拼接成物理 key。
 * @param {string} prefix 统一前缀
 * @param {string} logicalKey 逻辑键（已 encodeKey）
 * @returns {string} 物理键
 */
function physKey(prefix, logicalKey) {
  return prefix ? `${prefix}${logicalKey}` : logicalKey;
}

/**
 * 构造 Webdis 只读命令 URL：GET /<CMD>/<arg1>/<arg2>...（path 参数全部编码）。
 * @param {string} base Webdis 基址（已去尾斜杠）
 * @param {string} cmd 命令，如 GET/DEL/KEYS
 * @param {string[]} args 命令参数（逐条 URL 编码后拼进 path）
 * @returns {string} 完整 URL
 */
function readUrl(base, cmd, args) {
  const parts = [cmd, ...args.map((a) => encodeURIComponent(a))];
  return `${base}/${parts.join('/')}`;
}

/**
 * 统一的 fetch 封装：处理鉴权头、超时、文本/JSON 兼容。
 * Webdis 默认返回 JSON，但 raw/txt 格式或错误可能返回纯文本，这里尽量解析。
 * @param {string} url 完整 URL
 * @param {Object} opts fetch 选项
 * @param {string} token 可选 Authorization 头值
 * @param {number} timeoutMs 超时（毫秒）
 * @returns {Promise<any>} 解析后的 JSON 对象；无 body 返回 null
 */
async function webdisFetch(url, opts, token, timeoutMs) {
  const headers = { accept: 'application/json' };
  if (token) headers.authorization = token;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  if (ctrl && timeoutMs && timeoutMs > 0) {
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
  }
  try {
    const res = await fetch(url, { ...opts, headers, signal: ctrl ? ctrl.signal : undefined });
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      // 非 JSON（极少见，如前置代理返回的纯文本错误）
      return { __raw__: text, __status__: res.status };
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Webdis 请求超时（>${timeoutMs}ms）`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 从 Webdis 的 JSON 响应里取出命令结果（严格按 src/formats/json.c 的结构）：
 *   GET 命中 → {"GET":"value"}  → 返回 "value"（标量）
 *   GET 缺失 → {"GET":null}     → 返回 null
 *   KEYS     → {"KEYS":[...]}   → 返回数组本身
 *   SET      → {"SET":[...]}    → 返回数组
 *   DEL      → {"DEL":N}        → 返回整数
 * 这里对 GET 做“标量/缺失”判定，对 KEYS/SET/DEL 返回其字段原值。
 *
 * @param {any} json Webdis 响应（可能为 {__raw__} 包装）
 * @param {string} cmd 命令名（大写）
 * @returns {{ok:boolean, value:any}}
 */
function unwrap(json, cmd) {
  if (!json || typeof json !== 'object' || json.__raw__ !== undefined) {
    return { ok: false, value: null };
  }
  if (!(cmd in json)) return { ok: false, value: null };
  return { ok: true, value: json[cmd] };
}

/**
 * 创建一个 Webdis 后端 KV 适配器。
 *
 * 仅在 hasRedisConfig(env) 为真时调用。返回对象与 kv.js 的 KVLike 完全同构，
 * store.js 无需任何改动即可使用。
 *
 * @param {Object} env 平台环境变量
 * @returns {import('./kv.js').KVLike} 与平台 KV 同构的适配器
 */
export function createRedisKV(env) {
  const rawUrl = (env.REDIS_URL || env.REDIS_URL_KV || '').trim().replace(/\/+$/, '');
  const base = rawUrl || 'http://127.0.0.1:7379';
  const token = typeof env.REDIS_TOKEN === 'string' && env.REDIS_TOKEN ? env.REDIS_TOKEN : '';
  const prefix = typeof env.REDIS_PREFIX === 'string' && env.REDIS_PREFIX ? env.REDIS_PREFIX : '';
  const timeoutMs = (() => {
    const n = Number(env.REDIS_TIMEOUT_MS);
    return Number.isFinite(n) && n > 0 ? n : 5000;
  })();

  /** @type {import('./kv.js').KVLike} */
  const adapter = {
    /** 标记来源，便于排查与前端展示 */
    backend: 'redis-webdis',

    async get(key, type = 'text') {
      if (typeof key !== 'string' || key === '') return null;
      let logical;
      try {
        logical = encodeKey(key);
      } catch {
        return null;
      }
      const phys = physKey(prefix, logical);
      let json;
      try {
        json = await webdisFetch(readUrl(base, 'GET', [phys]), { method: 'GET' }, token, timeoutMs);
      } catch {
        // 读失败降级到默认值
        return null;
      }
      const { value } = unwrap(json, 'GET');
      // GET 缺失键 → Webdis 返回 {"GET":null}
      if (value == null) return null;

      // 理论上 GET 返回 string；保底处理 object（极少数被前置代理改写的情况）
      if (typeof value === 'object') {
        return type === 'json' ? value : JSON.stringify(value);
      }
      const text = String(value);
      if (type !== 'json') return text;
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    },

    async put(key, value, opts) {
      if (typeof key !== 'string' || key === '') return;
      const logical = encodeKey(key);
      const phys = physKey(prefix, logical);
      const body = typeof value === 'string' ? value : JSON.stringify(value);

      const ttl =
        opts && typeof opts.expirationTtl === 'number' && opts.expirationTtl > 0
          ? Math.max(1, Math.floor(opts.expirationTtl))
          : 0;

      // 写命令走 POST + body（Webdis 把 body 作为命令最后一个 argv，原样透传）。
      // SETEX 的 ttl 放 path，value 放 body。
      const cmd = ttl > 0 ? 'SETEX' : 'SET';
      const pathArgs = ttl > 0 ? [phys, String(ttl)] : [phys];
      const url = `${base}/${cmd}/${pathArgs.map((a) => encodeURIComponent(a)).join('/')}`;

      try {
        await webdisFetch(
          url,
          {
            method: 'POST',
            body,
            headers: { 'content-type': 'application/octet-stream' },
          },
          token,
          timeoutMs
        );
      } catch (err) {
        throw new Error(`Redis put failed for "${key}": ${err && err.message ? err.message : err}`);
      }
    },

    async delete(key) {
      if (typeof key !== 'string' || key === '') return;
      const logical = encodeKey(key);
      const phys = physKey(prefix, logical);
      try {
        await webdisFetch(readUrl(base, 'DEL', [phys]), { method: 'GET' }, token, timeoutMs);
      } catch (err) {
        throw new Error(`Redis delete failed for "${key}": ${err && err.message ? err.message : err}`);
      }
    },

    async list(opts) {
      // Redis KEYS 支持 glob：`*` 通配。前缀先编码再转 glob。
      const prefixLogical =
        typeof opts?.prefix === 'string' && opts.prefix !== ''
          ? (() => {
              try {
                return encodePrefix(opts.prefix);
              } catch {
                return '';
              }
            })()
          : '';
      const glob = `${physKey(prefix, prefixLogical)}*`;
      let json;
      try {
        json = await webdisFetch(readUrl(base, 'KEYS', [glob]), { method: 'GET' }, token, timeoutMs);
      } catch {
        return { keys: [], list_complete: true };
      }
      // KEYS 返回 {"KEYS":["a","b"]}，值是数组本身
      const { value } = unwrap(json, 'KEYS');
      if (!Array.isArray(value)) return { keys: [], list_complete: true };

      const keys = [];
      for (const rawKey of value) {
        if (typeof rawKey !== 'string') continue;
        const encodedLogical = prefix ? rawKey.slice(prefix.length) : rawKey;
        const logical = decodeKey(encodedLogical);
        if (logical === null) {
          keys.push({ name: rawKey, legacy: true });
        } else {
          keys.push({ name: logical });
        }
      }
      return { keys, list_complete: true };
    },
  };

  return adapter;
}

/**
 * 探测 Webdis 连通性（供前端「测试连接」按钮 / 健康检查）。
 * 用随机 key 写+读+删，验证后端真实可读可写，而不只是 ping 通。
 *
 * @param {Object} env 平台环境变量
 * @returns {Promise<{ok:boolean, latencyMs:number, backend:string, error?:string}>}
 */
export async function probeRedis(env) {
  if (!hasRedisConfig(env)) {
    return { ok: false, latencyMs: 0, backend: 'none', error: '未配置 REDIS_URL' };
  }
  const probeKey = `__probe__:${Math.random().toString(36).slice(2)}`;
  const probeVal = `ok-${Date.now()}`;
  const adapter = createRedisKV(env);
  const t0 = Date.now();
  try {
    await adapter.put(probeKey, probeVal, { expirationTtl: 120 });
    const got = await adapter.get(probeKey, 'text');
    await adapter.delete(probeKey);
    const latencyMs = Date.now() - t0;
    if (got !== probeVal) {
      return {
        ok: false,
        latencyMs,
        backend: 'redis-webdis',
        error: '读写回环不一致（写入后读回的值不匹配，请检查 Webdis 前置代理是否改写了响应结构）',
      };
    }
    return { ok: true, latencyMs, backend: 'redis-webdis' };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      backend: 'redis-webdis',
      error: err && err.message ? err.message : String(err),
    };
  }
}
