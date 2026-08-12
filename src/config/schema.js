/**
 * ============================================================================
 * config/schema.js —— 配置校验与规范化
 * ----------------------------------------------------------------------------
 * 设计原则：
 *   1. 宽进严出 —— 缺失字段自动补默认值，而非直接拒绝，降低用户配置成本
 *   2. 所有输入视为不可信 —— 类型钳制、范围钳制、长度限制
 *   3. 防 ReDoS —— 正则长度与嵌套量词检测
 *   4. 返回结构统一 { ok:true, value } | { ok:false, errors:[] }
 * ============================================================================
 */

import {
  DEFAULT_GLOBAL,
  DEFAULT_DISGUISE,
  DEFAULT_SITE,
  DEFAULT_POOL,
  POOL_KINDS,
  DEFAULT_RULE,
  DEFAULT_SECURITY,
  DEFAULT_CACHE_POLICY,
  DEFAULT_REWRITE,
  DEFAULT_HEADER_OPS,
  DEFAULT_ORIGIN,
  DEFAULT_FAILOVER,
  DEFAULT_HOST_HEADER,
  DEFAULT_SITE_HOST_HEADER,
  DEFAULT_SIGNED_URL,
  DEFAULT_RATE_LIMIT,
  DEFAULT_BOT_MANAGEMENT,
  DEFAULT_CACHE_KEY,
  DEFAULT_REDIRECT,
  DEFAULT_DIRECT_RESPONSE,
  DEFAULT_CLIENT_IP_HEADER,
  MATCH_TARGETS,
  MATCH_OPERATORS,
  deepClone,
} from './defaults.js';
import { DEFAULT_RETRY_ON, CONFIG_VERSION } from '../contracts.js';
// node:crypto 在 build.mjs 的 EXTERNAL_MODULES 中（CF/EO nodejs_compat 与 Node 均提供），
// 用于 webcrypto.getRandomValues 兜底；edge worker 中优先用 globalThis.crypto（WebCrypto）。
import { webcrypto as nodeWebcrypto } from 'node:crypto';

// ----------------------------------------------------------------------------
// 限制常量 —— 防止单个配置对象膨胀导致 KV 写入失败（CF KV 单值上限 25MB，
// 但过大的配置会拖慢每次请求的反序列化，这里设置更保守的业务上限）
// ----------------------------------------------------------------------------

const LIMITS = Object.freeze({
  HOST_MAX: 253,
  RULES_MAX: 50,
  ORIGINS_MAX: 20,
  LIST_MAX: 200, // 黑白名单条目上限
  REGEX_MAX: 200, // 正则字符串长度上限
  STR_MAX: 2048,
  HEADERS_MAX: 30,
  TTL_MAX: 31536000, // 1 年
});

// ----------------------------------------------------------------------------
// 基础工具
// ----------------------------------------------------------------------------

/** 收集器 */
function mk() {
  return { errors: [] };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 转字符串并裁剪长度 */
function str(v, dft = '', max = LIMITS.STR_MAX) {
  if (typeof v !== 'string') return dft;
  const s = v.trim();
  return s.length > max ? s.slice(0, max) : s;
}

/** 转布尔 */
function bool(v, dft = false) {
  return typeof v === 'boolean' ? v : dft;
}

/** 转整数并钳制范围 */
function int(v, dft, min, max) {
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  if (!Number.isFinite(n)) return dft;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** 转字符串数组，去重去空并限长 */
function strArr(v, max = LIMITS.LIST_MAX, itemMax = LIMITS.STR_MAX) {
  if (!Array.isArray(v)) return [];
  const out = [];
  const seen = new Set();
  for (const item of v) {
    if (out.length >= max) break;
    const s = str(item, '', itemMax);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** 枚举校验，非法值回落到默认 */
function enumOf(v, allowed, dft) {
  return allowed.includes(v) ? v : dft;
}

/**
 * 生成源站池的机器主键 id（系统自动生成，用户不可填）。
 * 格式 pl_<base36 时间戳>_<随机串>，保证唯一性与排序可读性。
 * 引用方（站点 poolId / 规则 action.poolId）使用此值，而非用户填的 name。
 * @returns {string}
 */
function generatePoolId() {
  const ts = Date.now().toString(36);
  let rnd = '';
  // 优先用 WebCrypto 随机（三平台均提供 globalThis.crypto），否则回退 node:crypto，
  // 再不行退化为 Math.random。不用 CJS `require('crypto')`（worker 运行时无全局 require）。
  try {
    const buf = new Uint8Array(6);
    const gcr = (globalThis && globalThis.crypto) || nodeWebcrypto;
    (gcr && typeof gcr.getRandomValues === 'function' ? gcr : nodeWebcrypto).getRandomValues(buf);
    rnd = Array.from(buf).map((b) => b.toString(36)).join('');
  } catch {
    rnd = Math.random().toString(36).slice(2, 10);
  }
  return `pl_${ts}_${rnd}`;
}

// ----------------------------------------------------------------------------
// 专项校验
// ----------------------------------------------------------------------------

/**
 * 校验 host。支持普通域名与 `*.example.com` 泛域名。
 * 拒绝：空、含协议、含路径、含端口、含空格、单独的 `*`、非法字符。
 * @param {string} host
 * @returns {{ok:boolean, value?:string, error?:string}}
 */
export function validateHost(host) {
  const h = str(host, '', LIMITS.HOST_MAX).toLowerCase();
  if (!h) return { ok: false, error: 'host 不能为空' };
  if (h.length > LIMITS.HOST_MAX) return { ok: false, error: 'host 过长' };
  if (/[\s]/.test(h)) return { ok: false, error: 'host 不能包含空格' };
  if (h.includes('://')) return { ok: false, error: 'host 不应包含协议前缀' };
  if (h.includes('/')) return { ok: false, error: 'host 不应包含路径' };
  if (h.includes(':')) return { ok: false, error: 'host 不应包含端口' };
  if (h === '*' || h === '*.') return { ok: false, error: '不允许匹配全部域名的通配符' };

  // 泛域名：*.example.com（只允许最左一级为 *）
  if (h.startsWith('*.')) {
    const base = h.slice(2);
    if (!base || !isPlainHost(base)) {
      return { ok: false, error: `泛域名格式不正确: ${host}` };
    }
    if (!base.includes('.')) {
      return { ok: false, error: '泛域名至少需要二级域名，如 *.example.com' };
    }
    return { ok: true, value: h };
  }

  if (!isPlainHost(h)) return { ok: false, error: `host 格式不正确: ${host}` };
  return { ok: true, value: h };
}

/** 普通域名或 IP 字面量格式检查 */
function isPlainHost(h) {
  if (h.length > LIMITS.HOST_MAX) return false;
  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    return h.split('.').every((p) => Number(p) <= 255);
  }
  // 域名：每段 1-63 字符，字母数字与连字符，不以连字符开头结尾
  return /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/.test(h);
}

/**
 * 校验源站地址：允许域名、IPv4、IPv6（方括号形式在 URL 中使用）
 * @param {string} addr
 * @returns {{ok:boolean, value?:string, error?:string}}
 */
function validateAddr(addr) {
  const a = str(addr, '', LIMITS.HOST_MAX).toLowerCase();
  if (!a) return { ok: false, error: '源站地址不能为空' };
  if (a.includes('://')) return { ok: false, error: '源站地址不应包含协议，请用 scheme 字段' };
  if (a.includes('/')) return { ok: false, error: '源站地址不应包含路径，请用 pathPrefix 字段' };
  // IPv6
  if (a.includes(':')) {
    const inner = a.startsWith('[') && a.endsWith(']') ? a.slice(1, -1) : a;
    if (/^[0-9a-f:]+$/.test(inner)) return { ok: true, value: `[${inner}]` };
    return { ok: false, error: '源站地址不应包含端口，请用 port 字段' };
  }
  if (!isPlainHost(a)) return { ok: false, error: `源站地址格式不正确: ${addr}` };
  return { ok: true, value: a };
}

/**
 * 校验正则字符串，防 ReDoS。
 * 检测嵌套量词（如 (a+)+、(a*)* ），这是灾难性回溯的主要来源。
 * @param {string} src
 * @returns {{ok:boolean, value?:string, error?:string}}
 */
function validateRegex(src) {
  const s = str(src, '', LIMITS.REGEX_MAX);
  if (!s) return { ok: true, value: '' };
  if (s.length > LIMITS.REGEX_MAX) {
    return { ok: false, error: `正则过长（上限 ${LIMITS.REGEX_MAX} 字符）` };
  }
  // 嵌套量词检测：形如 (...)+ / (...)* / (...){n,} 且括号内本身含量词
  if (/\([^)]*[+*}]\)\s*[+*]|\([^)]*[+*]\s*\)\s*\{/.test(s)) {
    return { ok: false, error: '正则包含嵌套量词，存在灾难性回溯风险，请简化' };
  }
  try {
    new RegExp(s);
  } catch (e) {
    return { ok: false, error: `正则语法错误: ${e.message}` };
  }
  return { ok: true, value: s };
}

/** HTTP 头名合法性：RFC 7230 token */
function isValidHeaderName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/.test(name);
}

/** 头值合法性：禁止 CR/LF，防响应拆分攻击 */
function isValidHeaderValue(v) {
  return typeof v === 'string' && !/[\r\n\0]/.test(v);
}

/**
 * 规范化头部键值对
 * @returns {{value:Record<string,string>, errors:string[]}}
 */
function normHeaderMap(input, label) {
  const out = {};
  const errors = [];
  if (!isObj(input)) return { value: out, errors };
  let n = 0;
  for (const [k, v] of Object.entries(input)) {
    if (n >= LIMITS.HEADERS_MAX) {
      errors.push(`${label} 数量超过上限 ${LIMITS.HEADERS_MAX}，多余项已忽略`);
      break;
    }
    if (!isValidHeaderName(k)) {
      errors.push(`${label} 中存在非法头名: ${k}`);
      continue;
    }
    const val = String(v ?? '');
    if (!isValidHeaderValue(val)) {
      errors.push(`${label} 中头 ${k} 的值包含非法字符（换行符）`);
      continue;
    }
    if (val.length > LIMITS.STR_MAX) {
      errors.push(`${label} 中头 ${k} 的值过长`);
      continue;
    }
    out[k] = val;
    n++;
  }
  return { value: out, errors };
}

/** 规范化 HeaderOps */
function normHeaderOps(input, label) {
  const errors = [];
  if (!isObj(input)) return { value: deepClone(DEFAULT_HEADER_OPS), errors };
  const setRes = normHeaderMap(input.set, `${label}.set`);
  errors.push(...setRes.errors);
  const remove = strArr(input.remove, LIMITS.HEADERS_MAX, 128)
    .map((s) => s.toLowerCase())
    .filter((s) => {
      if (!isValidHeaderName(s)) {
        errors.push(`${label}.remove 中存在非法头名: ${s}`);
        return false;
      }
      return true;
    });
  return { value: { set: setRes.value, remove }, errors };
}

// ----------------------------------------------------------------------------
// 规范化：缓存策略 / 重写 / 安全
// ----------------------------------------------------------------------------

function normCacheKey(input) {
  const d = DEFAULT_CACHE_KEY;
  if (!isObj(input)) return deepClone(d);
  return {
    ignoreCase: bool(input.ignoreCase, d.ignoreCase),
    includeScheme: bool(input.includeScheme, d.includeScheme),
    headers: strArr(input.headers, 10, 128)
      .map((s) => s.toLowerCase())
      .filter(isValidHeaderName),
    cookies: strArr(input.cookies, 10, 128),
  };
}

/**
 * 规范化状态码缓存 TTL，如 {"404": 10}。
 * @param {any} input
 * @returns {Record<string, number>}
 */
function normStatusTtl(input) {
  const out = {};
  if (!isObj(input)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(input)) {
    if (n >= 20) break;
    const code = int(k, 0, 100, 599);
    if (code < 100) continue;
    out[String(code)] = int(v, 0, 0, LIMITS.TTL_MAX);
    n++;
  }
  return out;
}

function normCachePolicy(input) {
  const d = DEFAULT_CACHE_POLICY;
  if (!isObj(input)) return deepClone(d);
  const mode = enumOf(input.mode, ['ttl', 'origin', 'noCache'], d.mode);
  return {
    enabled: bool(input.enabled, d.enabled) && mode !== 'noCache',
    mode,
    edgeTtl: int(input.edgeTtl, d.edgeTtl, 0, LIMITS.TTL_MAX),
    staleWhileRevalidate: int(input.staleWhileRevalidate, d.staleWhileRevalidate, 0, LIMITS.TTL_MAX),
    // browserTtl 允许 -1 表示「不改写，跟随源站」
    browserTtl: int(input.browserTtl, d.browserTtl, -1, LIMITS.TTL_MAX),
    ignoreQuery: bool(input.ignoreQuery, d.ignoreQuery),
    queryWhitelist: strArr(input.queryWhitelist, 50, 128),
    key: normCacheKey(input.key),
    statusTtl: normStatusTtl(input.statusTtl),
    preRefresh: bool(input.preRefresh, d.preRefresh),
    preRefreshPercent: int(input.preRefreshPercent, d.preRefreshPercent, 1, 99),
    offlineCache: bool(input.offlineCache, d.offlineCache),
  };
}

/**
 * 规范化匹配条件二维数组（外层 OR，内层 AND）。
 * @param {any} input
 * @param {string} label
 * @returns {{value:Array<Array<Object>>, errors:string[]}}
 */
function normConditions(input, label) {
  const errors = [];
  /** @type {Array<Array<Object>>} */
  const out = [];
  if (!Array.isArray(input)) return { value: out, errors };

  for (let gi = 0; gi < Math.min(input.length, 10); gi++) {
    const group = input[gi];
    if (!Array.isArray(group)) continue;
    const g = [];
    for (let ci = 0; ci < Math.min(group.length, 10); ci++) {
      const c = group[ci];
      if (!isObj(c)) continue;
      const tag = `${label} 条件[${gi}.${ci}]`;

      const target = enumOf(c.target, MATCH_TARGETS, '');
      if (!target) {
        errors.push(`${tag} 不支持的匹配对象: ${c.target}`);
        continue;
      }
      const op = enumOf(c.op, MATCH_OPERATORS, '');
      if (!op) {
        errors.push(`${tag} 不支持的操作符: ${c.op}`);
        continue;
      }

      const key = str(c.key, '', 128);
      // header/cookie 必须有 key；query 无 key 时退化为整串匹配，允许
      if ((target === 'header' || target === 'cookie') && !key) {
        errors.push(`${tag} 匹配 ${target} 时必须填写键名`);
        continue;
      }
      if (target === 'header' && !isValidHeaderName(key)) {
        errors.push(`${tag} 非法头名: ${key}`);
        continue;
      }

      const needValues = op !== 'exists' && op !== 'notExists';
      const values = strArr(c.values, 50, LIMITS.STR_MAX);
      if (needValues && values.length === 0) {
        errors.push(`${tag} 操作符 ${op} 需要至少一个匹配值`);
        continue;
      }

      // 正则类值逐条校验，防 ReDoS
      if (op === 'regex' || op === 'notRegex') {
        let bad = false;
        for (const v of values) {
          const r = validateRegex(v);
          if (!r.ok) {
            errors.push(`${tag} ${r.error}`);
            bad = true;
          }
        }
        if (bad) continue;
      }

      g.push({
        target,
        op,
        values: needValues ? values : [],
        key,
        ignoreCase: bool(c.ignoreCase, true),
      });
    }
    if (g.length) out.push(g);
  }
  return { value: out, errors };
}

/**
 * 规范化访问 URL 重定向。
 * @param {any} input
 * @param {string} label
 * @returns {{value:Object, errors:string[]}}
 */
function normRedirect(input, label) {
  const errors = [];
  const d = DEFAULT_REDIRECT;
  if (!isObj(input)) return { value: deepClone(d), errors };

  const enabled = bool(input.enabled, d.enabled);
  const target = str(input.target, '', 2048);

  // 仅允许 http/https 绝对 URL 或站内绝对路径，杜绝 javascript:/data: 注入
  if (enabled) {
    if (!target) {
      errors.push(`${label} 启用重定向时必须填写目标 URL`);
    } else if (!target.startsWith('/')) {
      try {
        const u = new URL(target);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          errors.push(`${label} 重定向目标仅支持 http/https 或以 / 开头的路径`);
        }
      } catch {
        errors.push(`${label} 重定向目标不是合法 URL`);
      }
    }
  }

  return {
    value: {
      enabled,
      status: enumOf(int(input.status, d.status, 300, 399), [301, 302, 303, 307, 308], d.status),
      target,
      keepQuery: bool(input.keepQuery, d.keepQuery),
    },
    errors,
  };
}

/**
 * 规范化自定义直接响应。
 * @param {any} input
 * @returns {Object}
 */
function normDirectResponse(input) {
  const d = DEFAULT_DIRECT_RESPONSE;
  if (!isObj(input)) return deepClone(d);
  return {
    enabled: bool(input.enabled, d.enabled),
    status: int(input.status, d.status, 100, 599),
    contentType: str(input.contentType, d.contentType, 128),
    body: str(input.body, '', 64 * 1024),
  };
}

/**
 * 规范化客户端 IP 回源头。
 * @param {any} input
 * @param {string} label
 * @returns {{value:Object, errors:string[]}}
 */
function normClientIpHeader(input, label) {
  const errors = [];
  const d = DEFAULT_CLIENT_IP_HEADER;
  if (!isObj(input)) return { value: deepClone(d), errors };
  const name = str(input.name, d.name, 128);
  if (name && !isValidHeaderName(name)) {
    errors.push(`${label} 客户端 IP 头名非法: ${name}`);
    return { value: deepClone(d), errors };
  }
  return {
    value: { enabled: bool(input.enabled, d.enabled), name: name || d.name },
    errors,
  };
}

function normRewrite(input) {
  const errors = [];
  const d = DEFAULT_REWRITE;
  if (!isObj(input)) return { value: deepClone(d), errors };

  const type = enumOf(input.type, ['none', 'prefix', 'strip', 'regex'], 'none');
  const out = { type, value: '', regexFrom: '', regexTo: '' };

  if (type === 'prefix' || type === 'strip') {
    let v = str(input.value, '');
    if (!v) {
      errors.push(`重写模式 ${type} 需要填写 value`);
    } else {
      if (!v.startsWith('/')) v = '/' + v;
      v = v.replace(/\/+$/, ''); // 去尾斜杠，拼接时统一处理
      out.value = v;
    }
  } else if (type === 'regex') {
    const r = validateRegex(input.regexFrom);
    if (!r.ok) {
      errors.push(`重写正则: ${r.error}`);
    } else if (!r.value) {
      errors.push('重写模式 regex 需要填写 regexFrom');
    } else {
      out.regexFrom = r.value;
    }
    out.regexTo = str(input.regexTo, '');
  }
  return { value: out, errors };
}

function normSecurity(input) {
  const errors = [];
  const d = DEFAULT_SECURITY;
  if (!isObj(input)) return { value: deepClone(d), errors };

  const su = isObj(input.signedUrl) ? input.signedUrl : {};
  const rl = isObj(input.rateLimit) ? input.rateLimit : {};
  const bm = isObj(input.botManagement) ? input.botManagement : {};

  const signedEnabled = bool(su.enabled, DEFAULT_SIGNED_URL.enabled);
  const signedSecret = str(su.secret, '', 512);
  if (signedEnabled && !signedSecret) {
    errors.push('启用签名 URL 时必须设置 secret');
  }

  return {
    value: {
      refererMode: enumOf(input.refererMode, ['off', 'whitelist', 'blacklist'], d.refererMode),
      refererList: strArr(input.refererList).map((s) => s.toLowerCase()),
      allowEmptyReferer: bool(input.allowEmptyReferer, d.allowEmptyReferer),
      uaBlacklist: strArr(input.uaBlacklist),
      ipBlacklist: strArr(input.ipBlacklist, LIMITS.LIST_MAX, 64),
      ipWhitelist: strArr(input.ipWhitelist, LIMITS.LIST_MAX, 64),
      signedUrl: {
        enabled: signedEnabled,
        secret: signedSecret,
        ttl: int(su.ttl, DEFAULT_SIGNED_URL.ttl, 30, 86400 * 7),
        param: str(su.param, DEFAULT_SIGNED_URL.param, 32) || 'sign',
      },
      rateLimit: {
        enabled: bool(rl.enabled, DEFAULT_RATE_LIMIT.enabled),
        rpm: int(rl.rpm, DEFAULT_RATE_LIMIT.rpm, 1, 1000000),
      },
      botManagement: {
        enabled: bool(bm.enabled, DEFAULT_BOT_MANAGEMENT.enabled),
        mode: enumOf(bm.mode, ['blacklist', 'allowlist'], DEFAULT_BOT_MANAGEMENT.mode),
        list: strArr(bm.list, LIMITS.LIST_MAX, 256),
      },
    },
    errors,
  };
}

// ----------------------------------------------------------------------------
// 规则
// ----------------------------------------------------------------------------

export function normRule(input, idx) {
  const errors = [];
  const label = `规则[${idx}]`;
  if (!isObj(input)) {
    return { value: null, errors: [`${label} 不是合法对象`] };
  }

  // 规则机器 id（系统生成，用户不应自填；导入已有配置时可保留其 id 以稳定引用）。
  const id = str(input.id, '', 64) || `r_${idx}_${Date.now().toString(36)}`;
  const m = isObj(input.match) ? input.match : {};
  const a = isObj(input.action) ? input.action : {};

  // ---- match ----
  // 匹配条件仅以 conditions 二维数组（外 OR 内 AND）为准；旧版快捷字段
  // （pathPrefix / pathRegex / extIn / methodIn）已废弃，开发阶段不保留兼容。
  const conds = normConditions(m.conditions, label);
  errors.push(...conds.errors);

  // ---- action ----
  const rw = normRewrite(a.rewrite);
  errors.push(...rw.errors.map((e) => `${label} ${e}`));
  const rq = normHeaderOps(a.reqHeaders, `${label} 请求头`);
  errors.push(...rq.errors);
  const rp = normHeaderOps(a.respHeaders, `${label} 响应头`);
  errors.push(...rp.errors);
  const rd = normRedirect(a.redirect, label);
  errors.push(...rd.errors);
  const cip = normClientIpHeader(a.clientIpHeader, label);
  errors.push(...cip.errors);

  // 规则级回源 Host（inherit/origin/client/custom）
  const ah = isObj(a.hostHeader) ? a.hostHeader : {};
  const ahMode = enumOf(ah.mode, ['inherit', 'origin', 'client', 'custom'], 'inherit');
  const ahCustom = str(ah.custom, '', LIMITS.HOST_MAX).toLowerCase();
  if (ahMode === 'custom' && !ahCustom) {
    errors.push(`${label} 回源 Host 为 custom 时必须填写 custom 值`);
  }

  // 规则级回源连接参数（⑨ Origin Rules）：覆盖源站物理属性，空串/0 表示回退源站
  const aEngine = enumOf(a.engine, ['', 'fetch', 'socket', 'r2'], '');
  const aScheme = enumOf(a.scheme, ['', 'http', 'https'], '');
  const aPort = int(a.port, 0, 0, 65535);

  return {
    value: {
      id,
      // name/note 纯展示用，不参与匹配。模板生成的规则靠它们自我说明，
      // 用户回头看时才知道每条规则是干什么的、为什么这么配。
      name: str(input.name, '', 128),
      note: str(input.note, '', 512),
      priority: int(input.priority, 0, -100000, 100000),
      enabled: bool(input.enabled, true),
      match: {
        conditions: conds.value,
      },
      action: {
        poolId: str(a.poolId, '', 64),
        inlineOrigins: normRuleInlineOrigins(a.inlineOrigins, label),
        rewrite: rw.value,
        cache: normCachePolicy(a.cache),
        reqHeaders: rq.value,
        respHeaders: rp.value,
        hostHeader: { mode: ahMode, custom: ahCustom },
        redirect: rd.value,
        directResponse: normDirectResponse(a.directResponse),
        clientIpHeader: cip.value,
        forceHttps: bool(a.forceHttps, false),
        forceHttpsStatus: int(a.forceHttpsStatus, 301, 301, 308),
        followRedirect: bool(a.followRedirect, false),
        originTimeoutMs: int(a.originTimeoutMs, 0, 0, 120000),
        engine: aEngine,
        scheme: aScheme,
        port: aPort,
      },
    },
    errors,
  };
}

/**
 * 校验单条规则（用于「全站通用规则（兜底）」独立存储）。
 * 入参可不含 id / priority，会自动补默认值；校验失败返回 errors。
 * @param {any} input
 * @returns {{ok:true, value:import('../contracts.js').Rule}|{ok:false, errors:string[]}}
 */
export function validateRule(input) {
  const r = normRule(input, 0);
  if (!r.value) return { ok: false, errors: r.errors };
  // 兜底规则默认优先级最低（0），确保站点自身规则优先
  if (r.value.priority === 0 && (input == null || input.priority == null)) {
    r.value.priority = 0;
  }
  return { ok: r.errors.length === 0, value: r.value, errors: r.errors };
}

/**
 * 规范化「规则级内联源站」列表（action.inlineOrigins）。
 *
 * 该能力在数据面 pipeline.js 中会被消费（规则命中时直接用内联源站覆盖选源），
 * 但此前 normRule 未对其做规范化，导致用户提交的 inlineOrigins 被静默剥离，
 * 形成「写时丢弃、读时消费」的死能力。此处复用 normOrigin 使其真正可落地。
 *
 * @param {any} input 内联源站数组
 * @param {string} label 错误前缀
 * @returns {import('../contracts.js').Origin[]} 规范化后的源站列表（非法项跳过）
 */
function normRuleInlineOrigins(input, label) {
  if (!Array.isArray(input) || input.length === 0) return [];
  const origins = [];
  for (let i = 0; i < Math.min(input.length, LIMITS.ORIGINS_MAX); i++) {
    const o = normOrigin(input[i], i);
    if (o.value) origins.push(o.value);
  }
  return origins;
}

// ----------------------------------------------------------------------------
// 对外：站点校验
// ----------------------------------------------------------------------------

/**
 * 校验并规范化站点配置
 * @param {any} input
 * @returns {{ok:true, value:import('../contracts.js').Site}|{ok:false, errors:string[]}}
 */
export function validateSite(input) {
  const c = mk();
  if (!isObj(input)) return { ok: false, errors: ['站点配置不是合法对象'] };

  const hostRes = validateHost(input.host);
  if (!hostRes.ok) return { ok: false, errors: [hostRes.error] };

  // 站点默认上游：统一引用「源站」实体（kind=single 的单一源站或 kind=pool 的源站池）。
  // 站点级内联源站已废弃 —— API 层会在保存前把「直接填写的源站地址」联动创建成一条
  // kind='single' 的源站记录，并把生成的 id 回填到 poolId。
  // poolId 允许为空：新建站点时可先创建壳，稍后通过 saveBasics 再配置源站。
  const poolId = str(input.poolId, '', 64);

  // 站点级默认回源 Host（accel/origin/custom）
  const sh = isObj(input.defaultHostHeader) ? input.defaultHostHeader : {};
  const shMode = enumOf(sh.mode, ['accel', 'origin', 'custom'], DEFAULT_SITE_HOST_HEADER.mode);
  const shCustom = str(sh.custom, '', LIMITS.HOST_MAX).toLowerCase();
  if (shMode === 'custom' && !shCustom) {
    c.errors.push('默认回源 Host 为 custom 时必须填写 custom 值');
  }

  const ipv6Support = bool(input.ipv6Support, false);

  // 规则
  const rulesIn = Array.isArray(input.rules) ? input.rules : [];
  if (rulesIn.length > LIMITS.RULES_MAX) {
    c.errors.push(`规则数量超过上限 ${LIMITS.RULES_MAX}`);
  }
  const rules = [];
  const seenRuleId = new Set();
  for (let i = 0; i < Math.min(rulesIn.length, LIMITS.RULES_MAX); i++) {
    const r = normRule(rulesIn[i], i);
    c.errors.push(...r.errors);
    if (!r.value) continue;
    if (seenRuleId.has(r.value.id)) {
      c.errors.push(`规则 id 重复: ${r.value.id}`);
      continue;
    }
    seenRuleId.add(r.value.id);
    rules.push(r.value);
  }
  // 按优先级降序固化，运行时无需再排序
  rules.sort((a, b) => b.priority - a.priority);

  const sec = normSecurity(input.security);
  c.errors.push(...sec.errors);

  if (c.errors.length) return { ok: false, errors: c.errors };

  return {
    ok: true,
    value: {
      host: hostRes.value,
      enabled: bool(input.enabled, DEFAULT_SITE.enabled),
      ipv6Support,
      poolId,
      defaultHostHeader: { mode: shMode, custom: shCustom },
      rules,
      security: sec.value,
      cacheGen: int(input.cacheGen, 0, 0, Number.MAX_SAFE_INTEGER),
      updatedAt: int(input.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
    },
  };
}

// ----------------------------------------------------------------------------
// 对外：源站池校验
// ----------------------------------------------------------------------------

/**
 * R2 回源源站校验（engine='r2'）。
 * R2 回源不走公网，因此不需要 addr/scheme/port/hostHeader，
 * 只校验绑定名 + pathname → R2 key 的转换配置。
 *
 * key 计算与规则级 rewrite 解耦：这里只负责「pathname → R2 key 的最后一步」，
 * 规则级 rewrite 已先行作用到 originUrl.pathname，故二者可叠加。
 *
 * @param {Object} input 原始源站配置
 * @param {number} idx 源站序号
 * @param {string} label 错误前缀
 * @param {string[]} errors 错误收集数组（就地 push）
 * @returns {{value: import('../contracts.js').Origin|null, errors: string[]}}
 */
function normR2Origin(input, idx, label, errors) {
  const binding = str(input.r2Binding, '', 64);
  if (!binding) {
    errors.push(`${label} engine='r2' 时必须填写 r2Binding（R2 绑定名，如 CDN_R2）`);
  } else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(binding)) {
    errors.push(`${label} r2Binding 必须是合法标识符（字母/数字/下划线，且以字母或下划线开头）`);
  }

  const keyMode = enumOf(input.r2KeyMode, ['none', 'prefix', 'strip', 'regex'], 'none');
  const keyPrefix = str(input.r2KeyPrefix, '');
  let keyPrefixRule = str(input.r2KeyPrefixRule, '');
  const keyRegexTo = str(input.r2KeyRegexTo, '');
  const contentType = str(input.r2ContentType, DEFAULT_ORIGIN.r2ContentType, 128) || DEFAULT_ORIGIN.r2ContentType;

  if (keyMode === 'prefix' || keyMode === 'strip') {
    if (!keyPrefixRule) {
      errors.push(`${label} r2KeyMode='${keyMode}' 时必须填写 r2KeyPrefixRule`);
    }
  } else if (keyMode === 'regex') {
    const r = validateRegex(input.r2KeyPrefixRule);
    if (!r.ok) errors.push(`${label} r2KeyPrefixRule 正则非法: ${r.error}`);
    else if (!r.value) errors.push(`${label} r2KeyMode='regex' 时必须填写 r2KeyPrefixRule`);
  }

  // 公共基础字段（与 normOrigin 对齐，便于下游统一处理）
  const rewrite = normRewrite(input.rewrite);
  errors.push(...rewrite.errors);
  const reqHeaders = normHeaderOps(input.reqHeaders, `${label} reqHeaders`);
  errors.push(...reqHeaders.errors);
  const respHeaders = normHeaderOps(input.respHeaders, `${label} respHeaders`);
  errors.push(...respHeaders.errors);
  const cache = normCachePolicy(input.cache);
  const followRedirect = bool(input.followRedirect, DEFAULT_ORIGIN.followRedirect);
  const originTimeoutMs = int(input.originTimeoutMs, DEFAULT_ORIGIN.originTimeoutMs, 0, 60000);
  const clientIpHeader = normClientIpHeader(input.clientIpHeader, `${label} clientIpHeader`);
  errors.push(...clientIpHeader.errors);

  // R2 下 hostHeader 固定为 inherit（无公网 Host 概念），scheme/addr/port 留占位
  return {
    value: {
      id: str(input.id, '', 64) || `o_${idx}_${Date.now().toString(36)}`,
      enabled: bool(input.enabled, true),
      order: int(input.order, idx, 0, 10000),
      weight: int(input.weight, DEFAULT_ORIGIN.weight, 0, 10000),
      engine: 'r2',
      scheme: 'https',
      addr: '',
      port: 443,
      pathPrefix: '',
      extraHeaders: Object.freeze({}),
      hostHeader: { mode: 'inherit', custom: '' },
      sni: null,
      rewrite: rewrite.value,
      reqHeaders: reqHeaders.value,
      respHeaders: respHeaders.value,
      cache,
      followRedirect,
      originTimeoutMs,
      clientIpHeader: clientIpHeader.value,
      r2Binding: binding,
      r2KeyPrefix: keyPrefix,
      r2KeyMode: keyMode,
      r2KeyPrefixRule: keyPrefixRule,
      r2KeyRegexTo: keyRegexTo,
      r2ContentType: contentType,
    },
    errors,
  };
}

function normOrigin(input, idx) {
  const errors = [];
  const label = `源站[${idx}]`;
  if (!isObj(input)) return { value: null, errors: [`${label} 不是合法对象`] };

  const engine = enumOf(input.engine, ['fetch', 'socket', 'r2'], DEFAULT_ORIGIN.engine);

  // R2 回源：不需要 addr/scheme/port/hostHeader，只校验绑定与 key 配置
  if (engine === 'r2') {
    return normR2Origin(input, idx, label, errors);
  }

  const addrRes = validateAddr(input.addr);
  if (!addrRes.ok) return { value: null, errors: [`${label} ${addrRes.error}`] };

  const scheme = enumOf(input.scheme, ['http', 'https'], DEFAULT_ORIGIN.scheme);
  const port = int(input.port, scheme === 'https' ? 443 : 80, 1, 65535);

  let pathPrefix = str(input.pathPrefix, '');
  if (pathPrefix) {
    if (!pathPrefix.startsWith('/')) pathPrefix = '/' + pathPrefix;
    pathPrefix = pathPrefix.replace(/\/+$/, '');
  }

  const eh = normHeaderMap(input.extraHeaders, `${label} extraHeaders`);
  errors.push(...eh.errors);

  // hostHeader
  const hhIn = isObj(input.hostHeader) ? input.hostHeader : {};
  const hhMode = enumOf(hhIn.mode, ['inherit', 'origin', 'client', 'custom'], 'inherit');
  const hhCustom = str(hhIn.custom, '', LIMITS.HOST_MAX).toLowerCase();
  if (hhMode === 'custom' && !hhCustom) {
    errors.push(`${label} hostHeader 为 custom 时必须填写 custom 值`);
  }

  // fetch 引擎无法自定义 Host 头（Cloudflare 会静默丢弃），提前警告而非静默失效
  if (engine === 'fetch' && (hhMode === 'client' || hhMode === 'custom')) {
    errors.push(
      `${label} fetch 引擎不支持自定义 Host 头（平台限制会静默丢弃），` +
        `请改用 socket 引擎（仅 Cloudflare Workers）或将 hostHeader 设为 inherit`
    );
  }

  // ---- 源站级扩展回源规则（规则级同名配置优先覆盖，源站级为基础值）----
  const rewrite = normRewrite(input.rewrite);
  errors.push(...rewrite.errors);
  const reqHeaders = normHeaderOps(input.reqHeaders, `${label} reqHeaders`);
  errors.push(...reqHeaders.errors);
  const respHeaders = normHeaderOps(input.respHeaders, `${label} respHeaders`);
  errors.push(...respHeaders.errors);
  const cache = normCachePolicy(input.cache);
  const followRedirect = bool(input.followRedirect, DEFAULT_ORIGIN.followRedirect);
  const originTimeoutMs = int(input.originTimeoutMs, DEFAULT_ORIGIN.originTimeoutMs, 0, 60000);
  const clientIpHeader = normClientIpHeader(input.clientIpHeader, `${label} clientIpHeader`);
  errors.push(...clientIpHeader.errors);

  return {
    value: {
      // 源站机器 id（系统生成，用户不应自填；导入已有配置时可保留其 id 以稳定引用）。
      id: str(input.id, '', 64) || `o_${idx}_${Date.now().toString(36)}`,
      enabled: bool(input.enabled, true),
      order: int(input.order, idx, 0, 10000),
      weight: int(input.weight, DEFAULT_ORIGIN.weight, 0, 10000),
      engine,
      scheme,
      addr: addrRes.value,
      port,
      pathPrefix,
      extraHeaders: eh.value,
      hostHeader: { mode: hhMode, custom: hhCustom },
      sni: input.sni ? str(input.sni, '', LIMITS.HOST_MAX).toLowerCase() : null,
      rewrite: rewrite.value,
      reqHeaders: reqHeaders.value,
      respHeaders: respHeaders.value,
      cache,
      followRedirect,
      originTimeoutMs,
      clientIpHeader: clientIpHeader.value,
      // R2 默认占位（非 R2 引擎不生效）
      r2Binding: '',
      r2KeyPrefix: '',
      r2KeyMode: 'none',
      r2KeyPrefixRule: '',
      r2KeyRegexTo: '',
      r2ContentType: DEFAULT_ORIGIN.r2ContentType,
    },
    errors,
  };
}

function normFailover(input) {
  const d = DEFAULT_FAILOVER;
  if (!isObj(input)) return deepClone(d);

  let retryOn = [];
  if (Array.isArray(input.retryOn)) {
    const seen = new Set();
    for (const v of input.retryOn) {
      const n = int(v, 0, 100, 599);
      if (n >= 100 && n <= 599 && !seen.has(n)) {
        seen.add(n);
        retryOn.push(n);
      }
    }
  }
  if (retryOn.length === 0) retryOn = [...DEFAULT_RETRY_ON];

  return {
    enabled: bool(input.enabled, d.enabled),
    retryOn,
    maxRetries: int(input.maxRetries, d.maxRetries, 0, 10),
    timeoutMs: int(input.timeoutMs, d.timeoutMs, 1000, 60000),
  };
}

/**
 * 校验并规范化源站池配置
 * @param {any} input
 * @returns {{ok:true, value:import('../contracts.js').OriginPool}|{ok:false, errors:string[]}}
 */
export function validatePool(input, caps) {
  const c = mk();
  if (!isObj(input)) return { ok: false, errors: ['源站池配置不是合法对象'] };

  // 机器主键 id：由系统自动生成（pl_ 前缀 + 时间 + 随机），用户绝不可填。
  // - 新建（body 无 id）：自动生成唯一 id；
  // - 更新 / 旧数据兼容（body 带合法 id，含旧数据如 "default"）：沿用。
  let id = str(input.id, '', 64);
  if (!id) id = generatePoolId();

  // 用户友好名称：纯展示标签，给人区分用，可重复、可选、宽松字符（允许中文/空格）。
  const name = str(input.name, '', 64).trim();

  // 上游类型：single=单一源站（恰好 1 个 origin），pool=源站池（可多 origin + 调度策略）。
  const kind = enumOf(input.kind, POOL_KINDS, DEFAULT_POOL.kind);

  const originsIn = Array.isArray(input.origins) ? input.origins : [];
  if (originsIn.length === 0) {
    return { ok: false, errors: [kind === 'single' ? '单一源站必须填写源站地址' : '源站池至少需要配置一个源站'] };
  }
  if (kind === 'single' && originsIn.length > 1) {
    return { ok: false, errors: ['单一源站只能包含 1 个源站；需要多个请改用「源站池」类型'] };
  }
  if (originsIn.length > LIMITS.ORIGINS_MAX) {
    c.errors.push(`源站数量超过上限 ${LIMITS.ORIGINS_MAX}`);
  }

  const origins = [];
  const seenId = new Set();
  for (let i = 0; i < Math.min(originsIn.length, LIMITS.ORIGINS_MAX); i++) {
    const o = normOrigin(originsIn[i], i);
    c.errors.push(...o.errors);
    if (!o.value) continue;
    if (seenId.has(o.value.id)) {
      c.errors.push(`源站 id 重复: ${o.value.id}`);
      continue;
    }
    seenId.add(o.value.id);
    origins.push(o.value);
  }

  if (origins.length === 0 && c.errors.length === 0) {
    c.errors.push('没有任何有效的源站');
  }

  // 单一源站无调度可言，策略恒为 chain
  const strategy = kind === 'single'
    ? 'chain'
    : enumOf(
      input.strategy,
      ['chain', 'roundrobin', 'random', 'weighted', 'iphash'],
      DEFAULT_POOL.strategy
    );

  // weighted 策略下所有权重为 0 会导致无法选源
  if (strategy === 'weighted' && origins.length > 0) {
    const total = origins.filter((o) => o.enabled).reduce((s, o) => s + o.weight, 0);
    if (total <= 0) {
      c.errors.push('权重策略下，启用的源站权重之和必须大于 0');
    }
  }

  if (origins.length > 0 && !origins.some((o) => o.enabled)) {
    c.errors.push('至少需要启用一个源站');
  }

  // 引擎合法性：socket 已弃用，任何平台都不应使用（自定义 Host 由 fetch 原生支持，
  // CF 上裸 IP+HTTPS+自定义 SNI 由 fetchEngine 内部自动走 socket 兜底）。
  // caps 缺失（如离线校验、配置导入迁移）时不依赖 caps，直接按枚举值校验。
  origins.forEach((o, i) => {
    if (o.engine === 'socket') {
      c.errors.push(
        `源站[${i}] 使用了已弃用的 socket 引擎：自定义回源 Host 已由 fetch 原生支持，` +
          `CF 上裸 IP+HTTPS+自定义 SNI 由 fetchEngine 自动走 cloudflare:sockets 兜底，` +
          `请移除 origin/rule 配置中的 engine:'socket'，改用默认 fetch。`
      );
    }
    if (o.engine === 'api') {
      c.errors.push(
        `源站[${i}] 使用了尚未实现的 api 引擎（cnb/github 等第三方 API 请求引擎待接入）。`
      );
    }
  });

  if (c.errors.length) return { ok: false, errors: c.errors };

  // chain 策略按 order 固化排序
  origins.sort((a, b) => a.order - b.order);

  return {
    ok: true,
    value: {
      id,
      name: name || id,
      kind,
      strategy,
      origins,
      failover: normFailover(input.failover),
      createdBy: str(input.createdBy, '', LIMITS.HOST_MAX).toLowerCase(),
      updatedAt: int(input.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER),
    },
  };
}

/**
 * 规范化伪装页策略。
 *
 * 安全约束：
 *  - target 仅接受 http/https 绝对 URL，杜绝 javascript:/data: 等协议注入。
 *  - mode='proxy' 但 target 不合法时，降级为 'static' 而不是报错，
 *    保证配置永远不会把数据面兜底路径打挂。
 *
 * @param {any} input
 * @returns {import('../contracts.js').Disguise}
 */
function normDisguise(input) {
  const d = DEFAULT_DISGUISE;
  if (!isObj(input)) return deepClone(d);

  let mode = enumOf(input.mode, ['static', 'proxy', 'none'], d.mode);
  const target = str(input.target, '', 512);

  let safeTarget = '';
  if (target) {
    try {
      const u = new URL(target);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        safeTarget = u.toString();
      }
    } catch {
      safeTarget = '';
    }
  }

  // proxy 模式必须有合法 target，否则降级为静态伪装
  if (mode === 'proxy' && !safeTarget) mode = 'static';

  return {
    mode,
    target: safeTarget,
    status: int(input.status, d.status, 200, 599),
  };
}

// ----------------------------------------------------------------------------
// 对外：全局配置校验
// ----------------------------------------------------------------------------

/**
 * 校验并规范化全局配置
 *
 * 留空策略：adminPath / tokenTtl / configCacheTtl 这类「可留空」的字段，
 * 若用户提交为空串或未提供，则优先沿用 `current`（已存储的旧值），
 * 再回落到内置默认值。这样「保存时留空」等价于「保留现有配置」，
 * 而不会出现「留空 → 回退成默认 __panel」的意外覆盖。
 *
 * @param {any} input 前端提交的原始对象
 * @param {import('../contracts.js').Caps} [caps] 平台能力（仅用于能力联动拦截）
 * @param {Partial<import('../contracts.js').GlobalConfig>} [current] 已存储的旧配置
 * @returns {{ok:true, value:import('../contracts.js').GlobalConfig}|{ok:false, errors:string[]}}
 */
export function validateGlobal(input, caps, current) {
  const d = DEFAULT_GLOBAL;
  const cur = isObj(current) ? current : {};
  if (!isObj(input)) return { ok: true, value: deepClone(d) };

  const rawAdminPath = input.adminPath;
  const adminPathIsBlank = rawAdminPath == null || String(rawAdminPath).trim() === '';
  let adminPath = adminPathIsBlank
    ? (cur.adminPath != null && cur.adminPath !== '' ? cur.adminPath : d.adminPath)
    : String(rawAdminPath).trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!adminPath || !/^[a-zA-Z0-9_-]+$/.test(adminPath)) {
    // 非法字符：沿用旧值（若旧值合法），否则回退默认
    adminPath = (cur.adminPath && /^[a-zA-Z0-9_-]+$/.test(cur.adminPath)) ? cur.adminPath : d.adminPath;
  }

  const rawTokenTtl = input.tokenTtl;
  const tokenTtlIsBlank = rawTokenTtl == null || String(rawTokenTtl).trim() === '';
  const tokenTtl = tokenTtlIsBlank
    ? (cur.tokenTtl != null ? cur.tokenTtl : d.tokenTtl)
    : int(rawTokenTtl, d.tokenTtl, 300, 86400 * 30);

  const rawConfigCacheTtl = input.configCacheTtl;
  const configCacheTtlIsBlank = rawConfigCacheTtl == null || String(rawConfigCacheTtl).trim() === '';
  const configCacheTtl = configCacheTtlIsBlank
    ? (cur.configCacheTtl != null ? cur.configCacheTtl : d.configCacheTtl)
    : int(rawConfigCacheTtl, d.configCacheTtl, 0, 600);

  // 全局限流：合法范围 0（不限制）或 >= 10 req/s
  let globalRateLimit = int(input.globalRateLimit, d.globalRateLimit, 0, 1000000);
  if (globalRateLimit > 0 && globalRateLimit < 10) globalRateLimit = 10;

  const value = {
    adminPath,
    passwordHash: str(input.passwordHash, '', 512),
    passwordSalt: str(input.passwordSalt, '', 512),
    tokenTtl,
    statsEnabled: bool(input.statsEnabled, d.statsEnabled),
    statsDriver: enumOf(input.statsDriver, ['kv', 'd1', 'none'], d.statsDriver),
    configCacheTtl,
    globalRateLimit,
    disguise: normDisguise(input.disguise),
    version: str(input.version, CONFIG_VERSION, 32),
  };

  // 平台能力联动：仅在 caps 明确不可用且用户显式选择了该能力时拦截
  const capErrors = checkGlobalCaps(value, caps);
  if (capErrors.length) return { ok: false, errors: capErrors };

  return { ok: true, value };
}

/**
 * 平台能力联动校验（独立于 validateGlobal 的宽松校验）。
 * 仅当 caps 明确指示某能力不可用时才拦截，caps 缺失则放行。
 * @param {import('../contracts.js').GlobalConfig} value validateGlobal 的产物
 * @param {import('../contracts.js').Caps} caps
 * @returns {string[]} 错误信息数组
 */
export function checkGlobalCaps(value, caps) {
  const errors = [];
  if (!caps) return errors;
  if (caps.hasD1 === false && value.statsDriver === 'd1') {
    errors.push(
      `统计驱动设为 d1，但当前平台（${caps.platform || 'unknown'}）不支持 D1；` +
        `请改用 'kv' 或 'none'`
    );
  }
  return errors;
}

export { LIMITS, isObj };
