/**
 * ============================================================================
 * config/site.js —— 站点 / 规则 / 源站 / 源站池级默认值
 * ----------------------------------------------------------------------------
 * 这一层是「用户可创建的实体」的默认形状：站点、站点安全策略、源站、源站池、
 * 以及它们的索引结构。它们引用了 stages-defaults.js（规则动作/重写/缓存模板）
 * 与 global.js（回源 Host 模板 / 品牌名），因此 import 顺序在本文件顶层之上。
 *
 * 依赖方向：factory.js ← global.js ← stages-defaults.js ← site.js（单向，无环）。
 * ============================================================================
 */

import { deepUnfreeze } from './factory.js';
import { DEFAULT_SITE_HOST_HEADER, DEFAULT_HOST_HEADER } from './global.js';
import {
  DEFAULT_REWRITE,
  DEFAULT_REDIRECT,
  DEFAULT_DIRECT_RESPONSE,
  DEFAULT_HEADER_OPS,
  DEFAULT_CACHE_POLICY,
  DEFAULT_CLIENT_IP_HEADER,
  DEFAULT_RULE_MATCH,
} from './stages-defaults.js';

// ----------------------------------------------------------------------------
// 安全策略
// ----------------------------------------------------------------------------

// 说明：此处原有 DEFAULT_SIGNED_URL（站点级签名 URL 配置）。
// 签名 URL 功能实现不完整（无签发入口、与 CDN 缓存键冲突），已全项目移除，
// 站点安全策略不再包含 signedUrl 字段。防盗链请使用 Referer 校验。

/**
 * 默认限流配置（关闭）。
 * @type {Readonly<{enabled:boolean,rpm:number}>}
 */
export const DEFAULT_RATE_LIMIT = Object.freeze({
  enabled: false,
  rpm: 600,
});

/**
 * 默认 Bot 管理配置（独立的最小任务包 ②.3）。
 * 与 ②.2 的 UA 黑名单完全解耦：这里单独控制「自动程序」维度。
 *   - mode: 'blacklist' = 命中 list 的 UA/特征视为恶意 Bot 拦截；
 *           'allowlist' = 仅放行命中 list 的良性 Bot（如搜索引擎），其余按策略。
 * @type {Readonly<{enabled:boolean,mode:'blacklist'|'allowlist',list:readonly string[]}>}
 */
export const DEFAULT_BOT_MANAGEMENT = Object.freeze({
  enabled: false,
  mode: 'blacklist',
  list: Object.freeze([]),
});

/**
 * 默认安全策略：全部关闭，最小惊讶原则。
 * @type {Readonly<import('../contracts.js').Security>}
 */
export const DEFAULT_SECURITY = Object.freeze({
  refererMode: 'off',
  refererList: Object.freeze([]),
  allowEmptyReferer: true,
  uaBlacklist: Object.freeze([]),
  ipBlacklist: Object.freeze([]),
  ipWhitelist: Object.freeze([]),
  rateLimit: DEFAULT_RATE_LIMIT,
  botManagement: DEFAULT_BOT_MANAGEMENT,
});

// ----------------------------------------------------------------------------
// 站点
// ----------------------------------------------------------------------------

/**
 * 默认站点。
 *
 * cacheGen：缓存代次。用于「整站清除缓存」——Cloudflare 没有按前缀批量清缓存的
 * API，因此改为把该值拼进缓存键，递增后所有旧键自然失效（旧条目由 TTL 自行淘汰）。
 * @type {Readonly<import('../contracts.js').Site>}
 */
export const DEFAULT_SITE = Object.freeze({
  host: '',
  enabled: true,
  // 站点默认上游，统一引用「源站」实体（kind=single 的单一源站，或 kind=pool 的源站池）。
  // 站点不再持有内联源站：在新建站点里直接填地址时，会自动联动创建一条 kind=single 的
  // 源站记录并把它的 id 写在这里，从而在「源站」标签页可纵览全部上游及其引用关系。
  poolId: '',
  defaultHostHeader: DEFAULT_SITE_HOST_HEADER,
  rules: Object.freeze([]),
  security: DEFAULT_SECURITY,
  ipv6Support: false,
  cacheGen: 0,
  updatedAt: 0,
});

// ----------------------------------------------------------------------------
// 源站与源站池
// ----------------------------------------------------------------------------

/**
 * 默认源站。
 * @type {Readonly<import('../contracts.js').Origin>}
 */
export const DEFAULT_ORIGIN = Object.freeze({
  id: '',
  enabled: true,
  order: 0,
  weight: 1,
  name: '',
  engine: 'fetch',
  scheme: 'https',
  addr: '',
  port: 443,
  pathPrefix: '',
  extraHeaders: Object.freeze({}),
  hostHeader: DEFAULT_HOST_HEADER,
  sni: null,
  rewrite: DEFAULT_REWRITE,
  reqHeaders: DEFAULT_HEADER_OPS,
  respHeaders: DEFAULT_HEADER_OPS,
  cache: DEFAULT_CACHE_POLICY,
  followRedirect: false,
  originTimeoutMs: 0,
  clientIpHeader: DEFAULT_CLIENT_IP_HEADER,
  // engine='r2' 专用
  r2Binding: '',
  r2KeyPrefix: '',
  r2KeyMode: 'none',
  r2KeyPrefixRule: '',
  r2KeyRegexTo: '',
  r2ContentType: 'application/octet-stream',
});

/** engine 可取的值。 */
export const ORIGIN_ENGINES = Object.freeze(['fetch', 'socket', 'r2', 'cnb', 'github']);

/**
 * 默认源站池。
 * @type {Readonly<import('../contracts.js').OriginPool>}
 */
export const DEFAULT_POOL = Object.freeze({
  id: '',
  name: '',
  // 上游类型（借鉴 nginx upstream）：
  //   'single' —— 单一源站，恰好 1 个 origin，无调度可言（strategy 恒为 chain）。
  //               可在「新建站点」填写源站地址时自动联动创建，也可在源站页手动新建。
  //   'pool'   —— 源站池，多 origin + 负载均衡策略，只能在源站页手动新建。
  // 两者同为一等公民、同表存储、同一引用方式（poolId），故站点侧不再有「内联源站」。
  kind: 'single',
  strategy: 'chain',
  origins: Object.freeze([]),
  // 单源站无第二个地址可回退，不承载 failover（运行时 requestWithFailover 强制关闭）。
  failover: null,
  // 由站点自动联动创建时记录来源 host，便于 UI 展示「随站点 xxx 自动创建」
  createdBy: '',
  updatedAt: 0,
});

/** 上游类型可取的值。 */
export const POOL_KINDS = Object.freeze(['single', 'pool']);

// ----------------------------------------------------------------------------
// 索引结构
// ----------------------------------------------------------------------------

/**
 * 默认站点索引（键合并后站点族落盘 cfg:sites，此结构仅作空索引兜底语义）。
 * @type {Readonly<{hosts:string[], wildcards:{pattern:string,host:string}[]}>}
 */
export const DEFAULT_SITE_INDEX = Object.freeze({
  hosts: Object.freeze([]),
  wildcards: Object.freeze([]),
});

/**
 * 默认源站池索引（键合并后源站池族落盘 cfg:pools，此结构仅作空索引兜底语义）。
 * @type {Readonly<{ids:string[]}>}
 */
export const DEFAULT_POOL_INDEX = Object.freeze({
  ids: Object.freeze([]),
});

// ----------------------------------------------------------------------------
// 站点规则（单条）模板
// ----------------------------------------------------------------------------

/**
 * 默认规则动作（单条站点规则动作的初始值）。
 * @type {Readonly<import('../contracts.js').RuleAction>}
 *
 * 注意 forceHttps：此处 = false，仅作「单条站点规则动作」的初始值。
 * 全站「终止阶段」默认亦为 false（DEFAULT_TERMINATE.forceHttps = false，
 * http→https 重定向由用户按需显式开启），二者层级不同、**不合并**。
 */
export const DEFAULT_RULE_ACTION = Object.freeze({
  poolId: '',
  rewrite: DEFAULT_REWRITE,
  cache: DEFAULT_CACHE_POLICY,
  reqHeaders: DEFAULT_HEADER_OPS,
  respHeaders: DEFAULT_HEADER_OPS,
  hostHeader: DEFAULT_HOST_HEADER,
  redirect: DEFAULT_REDIRECT,
  directResponse: DEFAULT_DIRECT_RESPONSE,
  clientIpHeader: DEFAULT_CLIENT_IP_HEADER,
  forceHttps: false,
  followRedirect: false,
  // 0 = 沿用源站池 failover.timeoutMs
  originTimeoutMs: 0,
  // 回源连接参数（⑨ Origin Rules）：空/0 表示回退源站物理属性，由 failover 合并决定
  // '' = 沿用源站 engine；可填 fetch/socket/r2
  engine: '',
  // '' = 沿用源站 scheme；可填 http/https
  scheme: '',
  // 0 = 沿用源站 port（按 scheme 取 443/80）
  port: 0,
});

/**
 * 默认规则（单条站点规则模板）。
 * @type {Readonly<import('../contracts.js').Rule>}
 */
export const DEFAULT_RULE = Object.freeze({
  id: '',
  priority: 0,
  enabled: true,
  match: DEFAULT_RULE_MATCH,
  action: DEFAULT_RULE_ACTION,
});

// ----------------------------------------------------------------------------
// 深拷贝工厂
// ----------------------------------------------------------------------------

/**
 * 生成一份可写的站点默认值。
 * @param {string} [host] 站点 host，会填入 host 字段
 * @returns {import('../contracts.js').Site} 新对象
 */
export function cloneSite(host) {
  const s = deepUnfreeze(DEFAULT_SITE);
  if (typeof host === 'string') s.host = host;
  return s;
}

/**
 * 生成一份可写的源站池默认值。
 * @param {string} [id] 池 id
 * @returns {import('../contracts.js').OriginPool} 新对象
 */
export function clonePool(id) {
  const p = deepUnfreeze(DEFAULT_POOL);
  if (typeof id === 'string') p.id = id;
  return p;
}

/**
 * 生成一份可写的规则默认值。
 * @param {string} [id] 规则 id
 * @returns {import('../contracts.js').Rule} 新对象
 */
export function cloneRule(id) {
  const r = deepUnfreeze(DEFAULT_RULE);
  if (typeof id === 'string') r.id = id;
  return r;
}

/**
 * 生成一份可写的源站默认值。
 * @param {string} [id] 源站 id
 * @returns {import('../contracts.js').Origin} 新对象
 */
export function cloneOrigin(id) {
  const o = deepUnfreeze(DEFAULT_ORIGIN);
  if (typeof id === 'string') o.id = id;
  return o;
}

/**
 * 生成一份可写的安全策略默认值。
 * @returns {import('../contracts.js').Security} 新对象
 */
export function cloneSecurity() {
  return deepUnfreeze(DEFAULT_SECURITY);
}
