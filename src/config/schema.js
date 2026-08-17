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
  DEFAULT_HOST_HEADER,
  DEFAULT_SITE_HOST_HEADER,
  DEFAULT_RATE_LIMIT,
  DEFAULT_BOT_MANAGEMENT,
  DEFAULT_CACHE_KEY,
  DEFAULT_REDIRECT,
  DEFAULT_DIRECT_RESPONSE,
  DEFAULT_CLIENT_IP_HEADER,
  MATCH_TARGETS,
  MATCH_OPERATORS,
  DEFAULT_GLOBAL_RULES,
  deepClone,
} from './defaults.js';
// 阶段字典：落库「按阶段裁剪 action 字段」的唯一真相源（与前端 web/app.js 同构副本一致）。
// GLOBAL_ONLY_STAGE_ORDER：全站独有阶段（match/security/error），承载原 settings 双轨字段。
import { STAGE_OPS, normalizeStage, STAGE_ORDER, GLOBAL_ONLY_STAGE_ORDER } from './stages.js';
// 动态变量校验：规则动作值支持 ${var} 引用，校验变量名白名单
import { validateVarNames, hasVars } from './vars.js';

/**
 * op（STAGE_OPS.allowedOps 里的项）→ 落库 action 对象里的字段名。
 * 用于「按阶段裁剪」：某阶段 allowedOps 不含的 op，其对应字段不写进落库 action，
 * 消除「全字段空壳」冗余（例如 respHeaders 阶段的规则不再带 cache/rewrite 空壳）。
 *
 * 注意：所有下表列出的字段都是「阶段专属 op 字段」——仅当对应阶段的 allowedOps 包含该 op
 * 时才落库（见 buildActionByStage）。不存在「全局始终落库」的 action 字段：
 *   - clientIpHeader / followRedirect / originTimeoutMs 看似跨阶段，实则只在 origin 阶段
 *     （failover.js 构造回源请求头 / 回源跟随重定向 / 回源超时）被消费，故只归入 origin.allowedOps，
 *     非 origin 阶段的规则不会落库这三个字段（与「全局字段」的旧认知不同）。
 */
export const STAGE_OP_FIELDS = {
  rewrite: 'rewrite',
  redirect: 'redirect',
  // terminate 阶段：强制 HTTPS + 状态码
  forceHttps: ['forceHttps', 'forceHttpsStatus'],
  directResponse: 'directResponse',
  reqHeaders: 'reqHeaders',
  respHeaders: 'respHeaders',
  cache: 'cache',
  hostHeader: 'hostHeader',
  originConn: ['engine', 'scheme', 'port'],
  targetPool: ['poolId'],
  // 回源级配置：同属 Origin 阶段（与 hostHeader/originConn/targetPool 一样由 allowedOps 约束），
  // 不是「全局字段」——它们只在回源阶段（构造回源请求头 / 回源跟随重定向 / 回源超时）消费。
  clientIp: 'clientIpHeader',
  followRedirect: 'followRedirect',
  originTimeout: 'originTimeoutMs',
};

/** 返回某阶段「允许落库的 action 字段名」集合（仅含阶段专属 op 字段，不含全局字段）。 */
export function ownedFieldsForStage(stage) {
  const ops = (STAGE_OPS[stage] && STAGE_OPS[stage].allowedOps) || [];
  const set = new Set();
  for (const op of ops) {
    const f = STAGE_OP_FIELDS[op];
    if (Array.isArray(f)) f.forEach((x) => set.add(x));
    else if (f) set.add(f);
  }
  return set;
}

/** 所有「阶段专属 op」对应的 action 字段名全集（用于区分「阶段专属」vs「全局」字段）。 */
const STAGE_OWNED_FIELDS = (() => {
  const s = new Set();
  for (const f of Object.values(STAGE_OP_FIELDS)) {
    if (Array.isArray(f)) f.forEach((x) => s.add(x));
    else s.add(f);
  }
  return s;
})();

/**
 * 按 rule.stage 的 allowedOps 裁剪落库 action：
 *  - 阶段专属字段（STAGE_OWNED_FIELDS 全部项，含 clientIpHeader / followRedirect /
 *    originTimeoutMs）：仅当本阶段 allowedOps 包含该 op 才写入，否则跳过（消除全字段空壳冗余）。
 *  - 不存在「全局始终落库」的 action 字段：clientIpHeader 等只在 origin 阶段落库，其它阶段跳过。
 * 读取方（前端 headerEditor 等、后端 applyXxx 的 `if (!ops) return` 兜底）均已兼容「字段缺失」。
 * @param {object} a 原始 action（未用，预留扩展）
 * @param {object} normed 已规范化后的各字段值
 * @param {string} stage 规则所属阶段（rule.stage）
 * @returns {object} 裁剪后的 action
 */
function buildActionByStage(a, normed, stage) {
  // 无旧数据，全部以最新为准：不兼容「缺省 stage 反推兜底」。缺省/非法 stage 直接回退到
  // 'cache' 并按阶段裁剪（绝不写全字段），保持落库结构纯净。
  const ns = normalizeStage(stage) || 'cache';
  const owned = ownedFieldsForStage(ns);
  const out = {};
  for (const [k, v] of Object.entries(normed)) {
    // 本阶段不含该 op → 不落库
    if (STAGE_OWNED_FIELDS.has(k) && !owned.has(k)) continue;
    out[k] = v;
  }
  return out;
}
import { CONFIG_VERSION, STATUS_PATTERN_RE, ERROR_STATUS_RANGE } from '../contracts.js';
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
  // 黑白名单条目上限
  LIST_MAX: 200,
  // 正则字符串长度上限
  REGEX_MAX: 200,
  STR_MAX: 2048,
  HEADERS_MAX: 30,
  // 1 年
  TTL_MAX: 31536000,
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
 * 通配符编译：把面向小白的「*」简写转换为等价标准正则。
 *
 * 设计目标：用户无需懂正则，也能写出 /img/* 、cf-x-* 这类直观匹配。
 * 后端在归一化阶段统一编译成标准正则存储，前端仍显示用户写的通配符原文。
 *
 * 编译规则：
 *  - 非字母数字的特殊字符先按正则语义转义（避免用户输入被当成正则元字符）。
 *  - 「*」按 kind 自适应：
 *      'path'   ->  ([^/]*)  不匹配斜杠（路径段直觉，/img/* 不会跨目录）。
 *      'header' ->  (.*)     匹配任意字符（头名/头值里的 * 即任意串）。
 *      'raw'    ->  (.*)     回落默认。
 *  - 锚点 ^ $ 照原样保留（用户示例 ^/old/(.*) 即含锚点）。
 *  - 每个 * 对应一个捕获组，从 $1 起编号（与 JS 正则 $1..$9 习惯一致）。
 *
 * 返回值附 glob 标志：供 normRewrite 把「通配符来源」透传给执行层，
 * 使执行层能把用户写的 $0（* 匹配段）别名映射为首个捕获组 $1。
 * 若输入不含任何通配符，则不编译、glob=false（纯正则路径零改动）。
 * 编译失败（极端畸形）时回退为原串、glob=false，交下方既有 try/catch 兜底。
 *
 * @param {string} src
 * @param {'path'|'header'|'raw'} kind
 * @returns {{value:string, glob:boolean}}
 */
export function compileWildcard(src, kind) {
  if (!src.includes('*')) return { value: src, glob: false };
  // 仅在「明显是通配符写法」时启用编译：用户输入不含分组括号 ( ，即没有在写标准正则。
  // 这样 /img/*、cf-x-* 会被编译，而 ^/old/(.*)、(a)* 等纯正则原样保留，互不干扰。
  if (src.includes('(')) return { value: src, glob: false };
  const star = kind === 'path' ? '([^/]*)' : '(.*)';
  // 先转义反斜杠（避免被后续替换再次转义），再转义其余正则特殊字符；
  // * 在此阶段保留为占位，最后统一替换为捕获组。^ $ 照原样保留（锚点语义）。
  let escaped = src.replace(/\\/g, '\\\\');
  escaped = escaped.replace(/[.+?(){}|[\]^$]/g, '\\$&');
  // 把 * 替换为对应捕获组
  const compiled = escaped.split('*').join(star);
  // 编译后做语法试探，失败则回落原串
  try {
    new RegExp(compiled);
    return { value: compiled, glob: true };
  } catch {
    return { value: src, glob: false };
  }
}

/**
 * 校验正则字符串，防 ReDoS。
 * 检测嵌套量词（如 (a+)+、(a*)* ），这是灾难性回溯的主要来源。
 * 同时支持「通配符」简写（*）：当 src 含 * 时按 kind 自适应编译为标准正则。
 * @param {string} src
 * @param {'path'|'header'|'raw'} [kind='raw'] 字段语义，决定 * 的匹配范围
 * @returns {{ok:boolean, value?:string, glob?:boolean, error?:string}}
 */
export function validateRegex(src, kind = 'raw') {
  const s = str(src, '', LIMITS.REGEX_MAX);
  if (!s) return { ok: true, value: '' };
  if (s.length > LIMITS.REGEX_MAX) {
    return { ok: false, error: `正则过长（上限 ${LIMITS.REGEX_MAX} 字符）` };
  }
  // 通配符编译（含 * 时）：先编译再走下面的 ReDoS/语法校验，安全性不退化。
  const cw = s.includes('*') ? compileWildcard(s, kind) : { value: s, glob: false };
  // 嵌套量词检测：形如 (...)+ / (...)* / (...){n,} 且括号内本身含量词
  if (/\([^)]*[+*}]\)\s*[+*]|\([^)]*[+*]\s*\)\s*\{/.test(cw.value)) {
    return { ok: false, error: '正则包含嵌套量词，存在灾难性回溯风险，请简化' };
  }
  try {
    new RegExp(cw.value);
  } catch (e) {
    return { ok: false, error: `正则语法错误: ${e.message}` };
  }
  return { ok: true, value: cw.value, glob: cw.glob };
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
    // 动态变量引用校验：${var} 变量名必须在白名单内，否则拒绝，避免未知变量静默失效
    if (hasVars(val)) {
      const chk = validateVarNames(val);
      if (!chk.ok) {
        errors.push(`${label} 中头 ${k} 的值含未知变量: ${chk.unknown.join(', ')}`);
        continue;
      }
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

/** 规范化 HeaderOps —— 删除统一走 strip({type,value}) 语法，不再有 remove 字段 */
function normHeaderOps(input, label) {
  const errors = [];
  if (!isObj(input)) return { value: deepClone(DEFAULT_HEADER_OPS), errors };
  const setRes = normHeaderMap(input.set, `${label}.set`);
  errors.push(...setRes.errors);
  const strip = normStripList(input.strip, `${label}.strip`, errors);
  return { value: { set: setRes.value, strip }, errors };
}

/**
 * 规范化「删除请求头 / 响应头」规则列表为统一的 {type, value} 语法。
 * type ∈ prefix | exact | regex；纯字符串写法视为 exact。
 * 与全站规则 stages 的 strip 共用同一套语法与校验口径。
 * @param {any} input
 * @param {string} label
 * @param {string[]} errors
 * @returns {Array<{type:string,value:string}>}
 */
function normStripList(input, label, errors, fallbackDef) {
  const def = Array.isArray(fallbackDef) ? fallbackDef : (DEFAULT_HEADER_OPS.strip || []);
  const src = Array.isArray(input) ? input : (input === undefined ? def : []);
  const out = [];
  for (const item of src) {
    if (out.length >= LIMITS.HEADERS_MAX) break;
    // 兼容纯字符串写法：视为 exact
    const obj = isObj(item) ? item : { type: 'exact', value: item };
    const type = enumOf(obj.type, ['prefix', 'exact', 'regex'], 'exact');
    let value = str(obj.value, '', 256).toLowerCase();
    if (!value) continue;
    if (type === 'regex') {
      const r = validateRegex(value, 'header');
      if (!r.ok) {
        errors.push(`${label} 中存在非法正则: ${value}`);
        continue;
      }
      value = r.value;
    } else if (type === 'exact' && !isValidHeaderName(value)) {
      errors.push(`${label}(exact) 中存在非法头名: ${value}`);
      continue;
    }
    out.push({ type, value });
  }
  return out;
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
    const raw = String(k).toLowerCase();
    if (!raw) continue;
    // 键支持精确码（404）、段通配（4xx / 5xx / 52x），以及 `!` 前缀的「例外」键
    // （如 `!418` = 418 不受任何段通配 no-store 约束，走常规缓存）。精确码优先于段通配，
    // `!` 例外键优先级最高（排除段通配的 no-store，但不覆盖用户显式精确码）。
    if (!STATUS_PATTERN_RE.test(raw)) continue;
    out[raw] = int(v, 0, 0, LIMITS.TTL_MAX);
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
      let values = strArr(c.values, 50, LIMITS.STR_MAX);
      if (needValues && values.length === 0) {
        errors.push(`${tag} 操作符 ${op} 需要至少一个匹配值`);
        continue;
      }

      // 正则类值逐条校验，防 ReDoS，并把通配符（*）编译为标准正则写回
      if (op === 'regex' || op === 'notRegex') {
        // 按匹配对象自适应通配符语义：路径类 * 不匹配斜杠，头/Cookie/查询类等 * 匹配任意字符
        const kind = target === 'path' || target === 'fullUrl' || target === 'directory' || target === 'filename' || target === 'extension' ? 'path' : 'header';
        let bad = false;
        const compiled = [];
        for (const v of values) {
          const r = validateRegex(v, kind);
          if (!r.ok) {
            errors.push(`${tag} ${r.error}`);
            bad = true;
            continue;
          }
          compiled.push(r.value);
        }
        if (bad) continue;
        values = compiled;
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

  // 动态变量引用校验：${var} 变量名必须在白名单内
  if (hasVars(target)) {
    const chk = validateVarNames(target);
    if (!chk.ok) {
      errors.push(`${label} 重定向目标含未知变量: ${chk.unknown.join(', ')}`);
    }
  }

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
  const errors = [];
  const d = DEFAULT_DIRECT_RESPONSE;
  if (!isObj(input)) return { value: deepClone(d), errors };
  const body = str(input.body, '', 64 * 1024);
  // 直接响应体支持 ${var} 模板，校验变量名白名单
  if (hasVars(body)) {
    const chk = validateVarNames(body);
    if (!chk.ok) {
      errors.push(`直接响应体含未知变量: ${chk.unknown.join(', ')}`);
    }
  }
  return {
    value: {
      enabled: bool(input.enabled, d.enabled),
      status: int(input.status, d.status, 100, 599),
      contentType: str(input.contentType, d.contentType, 128),
      body,
    },
    errors,
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

export function normRewrite(input) {
  const errors = [];
  const d = DEFAULT_REWRITE;
  if (!isObj(input)) return { value: deepClone(d), errors };

  const type = enumOf(input.type, ['none', 'prefix', 'strip', 'regex'], 'none');
  const out = { type, value: '', regexFrom: '', regexTo: '', glob: false };

  if (type === 'prefix' || type === 'strip') {
    let v = str(input.value, '');
    if (!v) {
      errors.push(`重写模式 ${type} 需要填写 value`);
    } else {
      if (!v.startsWith('/')) v = '/' + v;
      // 去尾斜杠，拼接时统一处理
      v = v.replace(/\/+$/, '');
      out.value = v;
    }
  } else if (type === 'regex') {
    const r = validateRegex(input.regexFrom, 'path');
    if (!r.ok) {
      errors.push(`重写正则: ${r.error}`);
    } else if (!r.value) {
      errors.push('重写模式 regex 需要填写 regexFrom');
    } else {
      out.regexFrom = r.value;
      out.glob = !!r.glob;
    }
    out.regexTo = str(input.regexTo, '');
    // regexTo 支持 $1..$9 与 ${var}；校验 ${var} 变量名白名单
    if (hasVars(out.regexTo)) {
      const chk = validateVarNames(out.regexTo);
      if (!chk.ok) {
        errors.push(`重写 regexTo 含未知变量: ${chk.unknown.join(', ')}`);
      }
    }
  }
  return { value: out, errors };
}

function normSecurity(input) {
  const errors = [];
  const d = DEFAULT_SECURITY;
  if (!isObj(input)) return { value: deepClone(d), errors };

  // 注意：input.signedUrl 会被静默丢弃——签名 URL 功能已全项目移除，
  // 老配置里残留该字段不报错，只是不再落盘（宽进严出）。
  const rl = isObj(input.rateLimit) ? input.rateLimit : {};
  const bm = isObj(input.botManagement) ? input.botManagement : {};

  return {
    value: {
      refererMode: enumOf(input.refererMode, ['off', 'whitelist', 'blacklist'], d.refererMode),
      refererList: strArr(input.refererList).map((s) => s.toLowerCase()),
      allowEmptyReferer: bool(input.allowEmptyReferer, d.allowEmptyReferer),
      uaBlacklist: strArr(input.uaBlacklist),
      ipBlacklist: strArr(input.ipBlacklist, LIMITS.LIST_MAX, 64),
      ipWhitelist: strArr(input.ipWhitelist, LIMITS.LIST_MAX, 64),
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
      // stage 必须落库：matchRuleByStage 按 rule.stage 分桶匹配，缺失则该规则
      // 永远不会被任何阶段命中（表现为「站点重建后规则全部失效、回源 404」）。
      // 口径与 buildActionByStage 保持一致：非法/缺省一律归一到 'cache'。
      stage: normalizeStage(input.stage) || 'cache',
      match: {
        conditions: conds.value,
      },
      action: buildActionByStage(a, {
        rewrite: rw.value, cache: normCachePolicy(a.cache), reqHeaders: rq.value,
        respHeaders: rp.value, hostHeader: { mode: ahMode, custom: ahCustom },
        redirect: rd.value, directResponse: normDirectResponse(a.directResponse).value,
        clientIpHeader: cip.value,
        forceHttps: bool(a.forceHttps, false), forceHttpsStatus: int(a.forceHttpsStatus, 301, 301, 308),
        followRedirect: bool(a.followRedirect, false),
        originTimeoutMs: int(a.originTimeoutMs, 0, 0, 120000),
        engine: aEngine, scheme: aScheme, port: aPort,
        poolId: str(a.poolId, '', 64),
      }, input.stage),
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
 * 规范化「全站专属子字段」——只在全站阶段默认值里才有意义的那些字段。
 *
 * 为什么需要单独一支：normRule 是按「一条路由规则的动作」裁剪字段的，
 * 而下面这些字段描述的是「整站的回源/缓存行为基线」，不能按 URL 条件差异化，
 * 因此不属于规则动作，会被 normRule 裁掉。它们单轨化前藏在 settings 段里
 * （前端完全不可见），现在作为对应阶段的全站专属子字段呈现与落盘。
 *
 * @param {string} stage 阶段名
 * @param {any} raw 用户提交的该阶段原始值
 * @param {any} base 该阶段的内置默认（用于缺失回落）
 * @returns {{value: Record<string, any>, errors: string[]}}
 */
function normGlobalOnlySubFields(stage, raw, base) {
  const errors = [];
  /** @type {Record<string, any>} */
  const out = {};
  const src = isObj(raw) ? raw : {};
  const def = isObj(base) ? base : {};

  if (stage === 'reqHeaders') {
    // 透传白名单：客户端请求头只有列在这里的才会带到源站。
    // 允许用户清空（= 一个头都不透传，最严格的伪装），故不用「空则回落默认」。
    out.forwardWhitelist = Array.isArray(src.forwardWhitelist)
      ? strArr(src.forwardWhitelist, LIMITS.HEADERS_MAX, 128)
        .map((s) => s.toLowerCase())
        .filter((s) => {
          if (!isValidHeaderName(s)) {
            errors.push(`forwardWhitelist 中存在非法头名: ${s}`);
            return false;
          }
          return true;
        })
      : deepClone(def.forwardWhitelist || []);

    // 额外剥离规则：统一 {type,value} 语法，type ∈ prefix|exact|regex。
    // 复用 normStripList（与规则级 reqHeaders/respHeaders 同一套校验与回落口径），
    // src.strip 未提供时回落到全站默认值 def.strip。
    out.strip = normStripList(src.strip, 'strip', errors, def.strip);
    return { value: out, errors };
  }

  if (stage === 'cache') {
    // 错误码缓存 TTL：命中状态码 → 缓存秒数；0 = no-store（不写缓存 + 下发 no-store 头）。
    // 键支持精确码（404）与段通配（4xx / 5xx / 52x），精确码优先于段通配。
    // 允许清空（= 全部按边缘缓存默认 TTL），故 Array/Object 判断而非「空则回落默认」。
    const statusTtl = {};
    // 向后兼容：旧数据里的 noCacheStatus（黑名单数组）合并进 statusTtl，
    // 每个模式（去 `!` 前缀）等价于 TTL=0（no-store）。statusTtl 的显式值优先于此处。
    const legacy = Array.isArray(src.noCacheStatus)
      ? src.noCacheStatus
      : (Array.isArray(def.noCacheStatus) ? def.noCacheStatus : []);
    for (const item of legacy) {
      const p = str(item, '', 8).toLowerCase();
      if (!p || !STATUS_PATTERN_RE.test(p)) continue;
      // 保留 `!` 例外键（如 `!418` = 418 不受段通配 no-store 约束，走常规缓存）；
      // 非例外项等价于 TTL=0（no-store）。statusTtl 显式值优先于此处。
      const key = p.startsWith('!') ? p : (p in statusTtl ? null : p);
      if (key && !(key in statusTtl)) statusTtl[key] = 0;
    }
    Object.assign(statusTtl, normStatusTtl(src.statusTtl || {}));
    out.statusTtl = statusTtl;

    // 伪装页缓存时长（伪装页有独立生成路径，但「缓存多久」本质是缓存配置）
    const dgSrc = isObj(src.disguise) ? src.disguise : {};
    const dgDef = isObj(def.disguise) ? def.disguise : {};
    out.disguise = {
      cdnMaxAge: int(dgSrc.cdnMaxAge, dgDef.cdnMaxAge ?? 86400, 0, 31536000),
      isolateTtlMs: int(dgSrc.isolateTtlMs, dgDef.isolateTtlMs ?? 600000, 0, 3600000),
    };
    return { value: out, errors };
  }

  // 其余阶段（rewrite/redirect/terminate/origin/respHeaders）没有全站专属子字段：
  // origin.failover 已由 normRule 校验，respHeaders.strip 就是普通规则字段。
  return { value: out, errors };
}

/**
 * 全扁平落盘形态下的「单一方向转换」契约。
 *
 * 落盘约定：所有阶段的 stages[stage] 一律平铺该阶段「在 normRule 动作空间里
 * 对应的字段」——对 terminate/origin 就是 forceHttps/.../hostHeader/... 直接平铺；
 * 对 rewrite/cache/reqHeaders/... 则是该阶段唯一的动作子对象（action[stage]，其
 * 自身已是 {type,value} 之类的平铺结构）整体作为 stages[stage]，不包第二层
 * {[stage]:{...}}。换言之落盘形态无「嵌套片段」，与用户选择「全部平铺」一致。
 *
 * 注意 normRule 内部读取约定是「混合」的：嵌套型阶段读 action[stage]，扁平型阶段
 * 读 action 顶层字段。故转换函数需按阶段类型映射，而非盲目展开：
 *   - 嵌套型（rewrite/cache/reqHeaders/...）：stages[stage] 值 ⇄ action[stage]
 *   - 扁平型（terminate/origin）：stages[stage] 平铺字段 ⇄ action 顶层字段集合
 * 本对函数即封装这两种映射，前后端同构复用。
 */

// 判断某阶段是否为「嵌套型」：ownedFields 仅含唯一元素且该元素名 == stage 本身
// （即 normRule 内部把整段动作挂在 action[stage] 子对象上，如 rewrite→action.rewrite）。
function isNestedStage(stage) {
  const f = ownedFieldsForStage(stage);
  return f.size === 1 && f.has(stage);
}

/** 读：stages[stage] 的扁平落盘值 → normRule 期望的 action。 */
export function stageValueToAction(stage, value) {
  if (!isObj(value)) return {};
  if (isNestedStage(stage)) return { [stage]: value };
  return { ...value };
}

/** 写：normRule 产出的 action → stages[stage] 扁平落盘值（仅保留该阶段 owned 字段）。 */
export function actionToStageValue(stage, action) {
  const a = isObj(action) ? action : {};
  // 嵌套型阶段：整段动作就挂在 action[stage] 子对象上，直接取该子对象作为落盘值
  // （其子对象自身已是 {type,value} 之类的平铺结构，故 stages[stage] 仍为扁平）。
  if (isNestedStage(stage)) return isObj(a[stage]) ? { ...a[stage] } : {};
  // 扁平型阶段：该阶段字段分散在 action 顶层，逐一收集。
  const fields = ownedFieldsForStage(stage);
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of fields) {
    if (k in a) out[k] = a[k];
  }
  return out;
}

/**
 * 校验「全站通用（兜底）规则」的 stages 映射结构。
 *
 * 全站兜底规则是「阶段→默认动作」映射（见 store.getGlobalRules）：每个阶段恰好 1 条、
 * 无条件、无 priority。本函数对每阶段的值做规范化校验，复用 normRule 的字段级校验
 * 与 buildActionByStage 的阶段裁剪，保证落库结构与站点规则同构、无非法字段。
 *
 * @param {any} input 期望 { stages?: Record<string, any> }；也兼容直接传 stages 对象。
 *   - 未知 stage key 会被忽略（不参与落库）。
 *   - 某阶段缺失则保留内置默认（调用方应以 DEFAULT_GLOBAL_RULES 兜底补全）。
 * @param {import('./defaults.js').DEFAULT_GLOBAL_RULES} [base] 补全基线（缺失阶段用它的同阶段值）
 * @returns {{ ok: boolean, value: {stages: Record<string, any>}, errors: string[] }}
 */
export function validateGlobalRulesStages(input, base) {
  const errors = [];
  // 顶层结构必须是对象（{stages} 或直接 stages 映射），数组/字符串/null 一律拒绝。
  if (!isObj(input) || Array.isArray(input)) {
    return { ok: false, value: { stages: {} }, errors: ['全站规则结构应为对象 { stages: { 阶段: 默认动作 } }，而非数组/字符串'] };
  }
  const rawStages = isObj(input.stages) ? input.stages : input;
  /** @type {Record<string, any>} */
  const out = {};
  for (const stage of STAGE_ORDER) {
    const v = rawStages[stage];
    if (v === undefined || v === null) {
      // 缺失阶段：用基线补足（若有）
      if (base && isObj(base[stage])) out[stage] = deepClone(base[stage]);
      continue;
    }
    if (!isObj(v)) {
      errors.push(`全站规则阶段 ${stage} 必须是对象`);
      if (base && isObj(base[stage])) out[stage] = deepClone(base[stage]);
      continue;
    }
    // 复用 normRule：把单阶段扁平值展开为伪规则的扁平 action，规范化后裁剪回该阶段字段，
    // 使全站兜底与站点规则共享同一套字段校验/裁剪逻辑，避免重复实现。
    // 关键修复：扁平阶段（terminate/origin）的值本已是 action 顶层字段，必须直接展开
    // （stageValueToAction = {...v}），绝不能反向包成 {[stage]:v}（否则 a.forceHttps 读不到、
    // 回落默认值，抹掉用户真实勾选值 → 勾选不落盘）。
    const r = normRule({ stage, action: stageValueToAction(stage, v) }, 0);
    if (r.errors.length) {
      errors.push(...r.errors.map((e) => `全站规则[${stage}] ${e}`));
    }
    if (r.value) {
      // 现在 action 恒为顶层扁平字段（无嵌套片段），直接剥规则专属键整体作为 stages[stage]。
      const clipped = actionToStageValue(stage, r.value.action);
      if (Object.keys(clipped).length) out[stage] = clipped;
      else if (base && isObj(base[stage])) out[stage] = deepClone(base[stage]);
    } else if (base && isObj(base[stage])) {
      out[stage] = deepClone(base[stage]);
    }
    // 全站专属子字段回补：normRule 按「规则语义」裁剪字段，会丢掉那些
    // 只在全站层面才有意义的子字段（如回源请求头透传白名单、不缓存状态码）。
    // 这些字段单轨化前藏在 settings 段，现作为对应阶段的全站专属子字段存在，
    // 故在规则级裁剪之后单独校验并挂回。
    if (isObj(out[stage])) {
      const globalOnly = normGlobalOnlySubFields(stage, v, base && base[stage]);
      if (globalOnly.errors.length) {
        errors.push(...globalOnly.errors.map((e) => `全站规则[${stage}] ${e}`));
      }
      Object.assign(out[stage], globalOnly.value);
    }
  }
  // 全站独有阶段（match / security / error）：这些阶段不是规则动作（不能按 URL 匹配），
  // 而是「一组全站默认参数」，故不走 normRule，改用专用的逐字段钳制校验。
  // 单轨化前它们藏在与 stages 并列的 settings 段里（前端不可见）；现已并入同一条 stages 轨道。
  for (const stage of GLOBAL_ONLY_STAGE_ORDER) {
    const baseVal = base && isObj(base[stage]) ? base[stage] : undefined;
    const r = validateGlobalOnlyStage(stage, rawStages[stage], baseVal);
    if (r.errors.length) errors.push(...r.errors.map((e) => `全站规则[${stage}] ${e}`));
    out[stage] = r.value;
  }
  // 全站独有阶段 fixContentType：内容类型纠正（网关作为中间人的责任）。
  // 不在 STAGE_ORDER / GLOBAL_ONLY_STAGE_ORDER 中（无需前端编辑表单，只有 enabled 一个开关），
  // 此处单独透传 + 补默认，保证用户可在管理面关闭、且落盘后能被读回与合并补全。
  // 仅当上游 Content-Type 缺失/通用/疑似错误时，按请求 URL 后缀名自动纠正为正确 MIME（零 body 成本）。
  {
    const rawFix = rawStages && isObj(rawStages.fixContentType) ? rawStages.fixContentType : undefined;
    const defFix = isObj(DEFAULT_GLOBAL_RULES.fixContentType) ? DEFAULT_GLOBAL_RULES.fixContentType : { enabled: true };
    out.fixContentType = {
      enabled: bool(rawFix && rawFix.enabled, defFix.enabled !== false),
    };
  }
  return { ok: errors.length === 0, value: { stages: out }, errors };
}

/**
 * 校验并规范化「全站独有阶段」（match / security / error）的默认参数。
 *
 * 采用「宽进严出」：以内置默认为基线，对用户输入的已知字段做类型/范围钳制，
 * 未知字段忽略、缺失字段补全内置默认，保证落盘结构稳定、可读、安全。
 *
 * @param {'match'|'security'|'error'} stage 阶段名
 * @param {any} input 用户提交的该阶段值（可能为空 / 部分字段）
 * @param {Record<string, any>=} base 补全基线（默认取 DEFAULT_GLOBAL_RULES 同阶段值）
 * @returns {{ok:boolean, value: Record<string, any>, errors: string[]}}
 */
export function validateGlobalOnlyStage(stage, input, base) {
  const errors = [];
  const def = isObj(base) ? base : (DEFAULT_GLOBAL_RULES[stage] || {});
  const src = isObj(input) ? input : {};

  if (input !== undefined && input !== null && !isObj(input)) {
    errors.push('必须是对象');
  }

  switch (stage) {
    // ① 匹配站点：纯 host/path 维度匹配，无协议配置（协议纠正由 terminate 阶段 forceHttps 负责）
    case 'match':
      return {
        ok: errors.length === 0,
        errors,
        value: {},
      };

    // ② 安全校验：全站限速参数（跨请求维度，非单条规则动作）
    case 'security':
      return {
        ok: errors.length === 0,
        errors,
        value: {
          rateLimitRpm: int(src.rateLimitRpm, def.rateLimitRpm, 0, 1000000),
          rlTtlSec: int(src.rlTtlSec, def.rlTtlSec, 1, 86400),
          remoteSyncIntervalMs: int(src.remoteSyncIntervalMs, def.remoteSyncIntervalMs, 1000, 3600000),
          memMaxEntries: int(src.memMaxEntries, def.memMaxEntries, 100, 1000000),
        },
      };

    // ③ 错误处理：拦截响应与 5xx 文案。
    // blockBody 放宽到 64KB，以便用户直接粘贴完整的自定义错误页 HTML。
    case 'error': {
      const msgs = isObj(src.messages) ? src.messages : {};
      const defMsgs = isObj(def.messages) ? def.messages : {};
      return {
        ok: errors.length === 0,
        errors,
        value: {
          blockBody: str(src.blockBody, def.blockBody, 65536),
          blockCacheControl: str(src.blockCacheControl, def.blockCacheControl, 128),
          messages: {
            internal: str(msgs.internal, defMsgs.internal, 256),
            noOrigin: str(msgs.noOrigin, defMsgs.noOrigin, 256),
            configError: str(msgs.configError, defMsgs.configError, 256),
          },
        },
      };
    }

    default:
      return { ok: false, value: {}, errors: [`未知的全站独有阶段 ${stage}`] };
  }
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
    const r = validateRegex(input.r2KeyPrefixRule, 'path');
    if (!r.ok) errors.push(`${label} r2KeyPrefixRule 正则非法: ${r.error}`);
    else if (!r.value) errors.push(`${label} r2KeyMode='regex' 时必须填写 r2KeyPrefixRule`);
  }

  // R2 不接受源站级流量序列字段（rewrite/头/cache/超时/跟随），全部由规则层承载；
  // 源站对象只描述回源目标与 R2 引擎参数。
  // R2 下 hostHeader 固定为 inherit（无公网 Host 概念），scheme/addr/port 留占位
  return {
    value: {
      id: str(input.id, '', 64) || `o_${idx}_${Date.now().toString(36)}`,
      enabled: bool(input.enabled, true),
      order: int(input.order, idx, 0, 10000),
      weight: int(input.weight, DEFAULT_ORIGIN.weight, 0, 10000),
      name: str(input.name, '', 64),
      engine: 'r2',
      scheme: 'https',
      addr: '',
      port: 443,
      pathPrefix: '',
      extraHeaders: Object.freeze({}),
      hostHeader: { mode: 'inherit', custom: '' },
      sni: null,
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

/**
 * 规范化仓库型源站（cnb / github）。
 * 后端实际是仓库 raw API：回源 host 由引擎常量固定（对用户隐藏），鉴权 token 站点级
 * 加密落盘（存储层异步加密；详见 src/utils/cipher.js 与 src/proxy/repoEngine.js）。
 * 此处仅做字段级校验与基础值组装，不在此处加密（保持 norm 同步、加密上移到存储层）。
 *
 * @param {any} input
 * @param {number} idx
 * @param {string} label
 * @param {string[]} errors
 * @param {'cnb'|'github'} engine
 * @returns {{value: import('../contracts.js').Origin|null, errors: string[]}}
 */
function normRepoOrigin(input, idx, label, errors, engine) {
  const repoUser = str(input.repoUser, '', 128).trim();
  const repoName = str(input.repoName, '', 128).trim();
  const repoPrivate = bool(input.repoPrivate, false);
  const repoBranch = str(input.repoBranch, 'main', 128).trim() || 'main';
  // token：明文或已加密串（编辑时未改动则原样保留密文）。
  // 公开仓库（repoPrivate=false）走匿名分支，可不填 token；私密仓库必须填。
  const rawToken = input.cnbTokenEnc != null ? input.cnbTokenEnc : input.githubTokenEnc;
  const tokenField = engine === 'cnb' ? 'cnbTokenEnc' : 'githubTokenEnc';
  const tokenVal = str(rawToken, '', 4096).trim();
  if (!tokenVal && repoPrivate) {
    errors.push(`${label} engine='${engine}' 私有仓库必须填写访问令牌（token）`);
  }
  if (!repoUser) errors.push(`${label} engine='${engine}' 时必须填写仓库归属（repoUser）`);
  if (!repoName) errors.push(`${label} engine='${engine}' 时必须填写仓库名（repoName）`);

  // 仓库型源站「不承载」任何流量序列字段（rewrite/头/cache/超时/跟随），这些全部由
  // 站点规则层（新建站点时按源站 id 生成的 repo-* 规则）承载，源站对象只保存回源元数据。
  // 回源 host/scheme/port 由引擎常量决定（repoEngine），此处填占位。
  return {
    value: {
      id: str(input.id, '', 64) || `o_${idx}_${Date.now().toString(36)}`,
      enabled: bool(input.enabled, true),
      order: int(input.order, idx, 0, 10000),
      weight: int(input.weight, DEFAULT_ORIGIN.weight, 0, 10000),
      name: str(input.name, '', 64),
      engine,
      scheme: 'https',
      addr: '',
      port: 443,
      pathPrefix: '',
      extraHeaders: Object.freeze({}),
      hostHeader: { mode: 'inherit', custom: '' },
      sni: null,
      r2Binding: '',
      r2KeyPrefix: '',
      r2KeyMode: 'none',
      r2KeyPrefixRule: '',
      r2KeyRegexTo: '',
      r2ContentType: DEFAULT_ORIGIN.r2ContentType,
      // 仓库型字段
      repoUser,
      repoName,
      repoBranch,
      repoPrivate,
      [tokenField]: tokenVal,
    },
    errors,
  };
}

/**
 * 规范化单个源站（fetch / socket 引擎通用；r2 / cnb / github 分流到专门函数）。
 * @param {any} input
 * @param {number} idx
 * @returns {{value: any, errors: string[]}}
 */
function normOrigin(input, idx) {
  const errors = [];
  const label = `源站[${idx}]`;
  if (!isObj(input)) return { value: null, errors: [`${label} 不是合法对象`] };

  const engine = enumOf(input.engine, ['fetch', 'socket', 'r2', 'cnb', 'github'], DEFAULT_ORIGIN.engine);

  // R2 回源：不需要 addr/scheme/port/hostHeader，只校验绑定与 key 配置
  if (engine === 'r2') {
    return normR2Origin(input, idx, label, errors);
  }

  // 仓库型回源（cnb / github）：后端实际是仓库 raw API，回源 host 由引擎常量固定（对用户隐藏），
  // 鉴权 token 站点级加密落盘（详见 repoEngine）。只校验仓库元数据与 token 是否存在，
  // token 的加密落盘在存储层（store.putPool / ensureSingleOrigin）异步完成；回源时由
  // failover + repoEngine 解密注入 Authorization。
  if (engine === 'cnb' || engine === 'github') {
    return normRepoOrigin(input, idx, label, errors, engine);
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
  // 仓库型引擎（cnb/github）回源 host 由引擎常量（resolveRepoDomain）固定，
  // 源站级 hostHeader 保持 inherit 让其走引擎常量；其余引擎（fetch/socket 等）
  // 默认 origin（回源域名 = 源站自身 addr），避免被站点级 defaultHostHeader（accel）兜底吃掉。
  const hhDefaultMode = (engine === 'cnb' || engine === 'github') ? 'inherit' : 'origin';
  const hhMode = enumOf(hhIn.mode, ['inherit', 'origin', 'client', 'custom'], hhDefaultMode);
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

  // ---- 源站级回源元数据已收集完毕；流量序列字段（rewrite/头/cache/超时/跟随）
  // 全部由全站规则 + 站点规则两层承载，源站对象不再落这些字段。
  return {
    value: {
      // 源站机器 id（系统生成，用户不应自填；导入已有配置时可保留其 id 以稳定引用）。
      id: str(input.id, '', 64) || `o_${idx}_${Date.now().toString(36)}`,
      enabled: bool(input.enabled, true),
      order: int(input.order, idx, 0, 10000),
      weight: int(input.weight, DEFAULT_ORIGIN.weight, 0, 10000),
      name: str(input.name, '', 64),
      engine,
      scheme,
      addr: addrRes.value,
      port,
      pathPrefix,
      extraHeaders: eh.value,
      hostHeader: { mode: hhMode, custom: hhCustom },
      sni: input.sni ? str(input.sni, '', LIMITS.HOST_MAX).toLowerCase() : null,
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

/**
 * 源站池回源重试（failover）的「错误码换源」特标。
 * '4xx5xx'（或别名 '*' / 'all'）= 所有错误响应都换源：运行时判 status >= 400 && status < 600。
 * 注意：200/3xx 属于正常响应（成功或重定向跟随），绝不算失败，不会触发换源。
 */

/**
 * 规范化源站池的回源重试（failover）配置。
 *
 * 失败即冷却 / 回退重试仅源站池承载：源站池自带完整的超时 / 回退 / 冷却策略，
 * 全站层与站点层均不持有 failover 字段，避免「全站默认偷偷塞一份 maxRetries=2 截断回退链」。
 *
 *   - 入参为空：返回池级中性基线（非全站副本）。
 *       · maxRetries 跟随源站数（origins.length - 1，封顶 9）→ 链式回退能试遍所有 enabled 源站，不截断。
 *       · retryOn = ['4xx5xx'] 特标「全部错误码」→ 运行时凡 status>=400（即 4xx/5xx，含 522/524 等）
 *         都判失败换源；200/3xx 正常响应不换源。连接异常本就必换源，与 retryOn 无关。
 *   - 入参带了部分字段：仅用这些字段；缺失字段用中性值补（maxRetries 仍跟随源站数）。
 *
 * @param {any} input 池原始 failover（可能为空）
 * @param {number} originsLen 本池 enabled 源站数，用于推导 maxRetries 跟随
 */
export function normFailover(input, originsLen = 0) {
  // 单一源站：无第二个地址可回退，重试 / 换源无意义，不承载 failover 配置。
  if (originsLen <= 1) return null;

  // 池级中性基线：maxRetries/retryOn 由源站数推导，不继承任何外部默认。
  const poolMaxRetries = Math.min(Math.max(originsLen - 1, 0), 9);
  const POOL_BASE = {
    enabled: true,
    retryOn: [ERROR_STATUS_RANGE], // 特标：所有错误码（4xx/5xx）都判失败换源；200/3xx 不换
    maxRetries: poolMaxRetries,
    timeoutMs: 0, // 0 → 回落全站/平台基础超时
    maxRetryBodyBytes: 5242880,
    penaltySeconds: 15, // 前端留空回落的中性值
    totalTimeoutMs: 0, // 0 → 按平台执行上限自动推导
    speculativeMs: 500,
  };
  if (!isObj(input)) return { ...POOL_BASE };

  // retryOn 解析：
  //   · 含 '4xx5xx' / '*' / 'all' → 全部错误码（status>=400）换源
  //   · 显式数字数组 → 仅这些码换源
  //   · 空数组 → 也视为全部错误码（池显式不给码即不限制码，连接异常仍必换源）
  let retryOn = [ERROR_STATUS_RANGE];
  if (Array.isArray(input.retryOn)) {
    if (input.retryOn.includes(ERROR_STATUS_RANGE) || input.retryOn.includes('*') || input.retryOn.includes('all')) {
      retryOn = [ERROR_STATUS_RANGE];
    } else {
      const seen = new Set();
      const nums = [];
      for (const v of input.retryOn) {
        const n = int(v, 0, 100, 599);
        if (n >= 100 && n <= 599 && !seen.has(n)) {
          seen.add(n);
          nums.push(n);
        }
      }
      retryOn = nums.length > 0 ? nums : [ERROR_STATUS_RANGE];
    }
  }

  return {
    enabled: bool(input.enabled, POOL_BASE.enabled),
    retryOn,
    maxRetries: int(input.maxRetries, POOL_BASE.maxRetries, 0, 10),
    timeoutMs: int(input.timeoutMs, POOL_BASE.timeoutMs, 1000, 60000),
    // maxRetryBodyBytes：重试时物化请求体的上限。原先只存在于全站默认里、池级无法调整，
    // 现随 failover 一起落盘，使池级也能覆盖（缺省仍跟随全站默认）。
    maxRetryBodyBytes: int(input.maxRetryBodyBytes, POOL_BASE.maxRetryBodyBytes, 0, 32 * 1024 * 1024),
    // 失败即冷却窗口秒数：0=关闭；>0 时一次失败即把源站放入本 isolate 内存冷却名单。
    penaltySeconds: int(input.penaltySeconds, POOL_BASE.penaltySeconds, 0, 600),
    // 整请求总时间预算毫秒：0=按平台执行上限自动推导。
    totalTimeoutMs: int(input.totalTimeoutMs, POOL_BASE.totalTimeoutMs, 0, 120000),
    // 竞速阈值毫秒：0=关闭；>0 时首请求超时无首字节即并行打第二候选源站。
    speculativeMs: int(input.speculativeMs, POOL_BASE.speculativeMs, 0, 60000),
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
        `源站[${i}] 使用了已移除的 api 引擎：请改用 cnb 或 github 仓库型引擎（回源到对应仓库 raw API）。`
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
      failover: normFailover(input.failover, (input.origins || []).length),
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

  // 自定义面板域名：留空=不限制域名（兼容旧逻辑）；非空=trim、小写、去端口、校验为基本合法 hostname
  const rawAdminDomain = input.adminDomain;
  const adminDomainIsBlank = rawAdminDomain == null || String(rawAdminDomain).trim() === '';
  let adminDomain = adminDomainIsBlank
    ? (cur.adminDomain != null && cur.adminDomain !== '' ? cur.adminDomain : d.adminDomain)
    : String(rawAdminDomain).trim().toLowerCase().replace(/:\d+$/, '');
  // 合法 hostname：字母数字、点、连字符（不含协议前缀），且不以点开头/结尾
  const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
  if (!adminDomain || !HOST_RE.test(adminDomain)) {
    // 非法：沿用旧值（若旧值合法），否则回退默认
    adminDomain = (cur.adminDomain && HOST_RE.test(cur.adminDomain)) ? cur.adminDomain : d.adminDomain;
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

  // 统计驱动自适应：统计落盘只支持 D1。平台无 D1 绑定时，用户即便选了 'd1' 也
  // 无法落盘——按产品语义「没有就不可用」自动归一到 'none'（统计功能关闭），
  // 而非报错阻断保存。这样 EdgeOne / ESA 等无 D1 平台也能正常保存全局配置。
  let statsDriver = enumOf(input.statsDriver, ['d1', 'none'], d.statsDriver);
  if (caps && caps.hasD1 === false && statsDriver === 'd1') {
    statsDriver = 'none';
    console.warn(
      `[config] 平台（${caps.platform || 'unknown'}）未绑定 D1，统计驱动自动归一到 'none'（统计功能不可用，绝不写 KV）`
    );
  }

  const value = {
    adminPath,
    adminDomain,
    passwordHash: str(input.passwordHash, '', 512),
    passwordSalt: str(input.passwordSalt, '', 512),
    tokenTtl,
    statsEnabled: bool(input.statsEnabled, d.statsEnabled),
    statsDriver,
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
        `统计落盘只支持 D1，无 D1 时请改为 'none'（统计功能不可用）`
    );
  }
  return errors;
}

export { LIMITS, isObj };
