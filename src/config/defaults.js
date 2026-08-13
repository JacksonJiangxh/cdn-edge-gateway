/**
 * ============================================================================
 * config/defaults.js —— 全部配置对象的默认值
 * ----------------------------------------------------------------------------
 * 字段严格对齐 contracts.js 第三节的数据模型定义。
 *
 * 使用约定：
 *  - 所有导出的默认对象都是 Object.freeze 的「模板」，禁止直接修改。
 *  - 需要一个可写副本时，请用本文件提供的 clone* 工厂函数（做了深拷贝）。
 *  - schema.js 的规范化逻辑以这里为唯一补全来源。
 * ============================================================================
 */

import {
  DEFAULT_RETRY_ON, CONFIG_VERSION, NO_CACHE_STATUS, FORWARD_HEADER_WHITELIST,
} from '../contracts.js';
import { setProductName } from './vars.js';

// ----------------------------------------------------------------------------
// 共享默认值（需置于引用它的 DEFAULT_RULE / DEFAULT_RULE_ACTION / DEFAULT_ORIGIN 之前，避免 TDZ）
// ----------------------------------------------------------------------------

/**
 * 本项目作为独立 CDN 网关的产品品牌名。
 * 用于注入到响应头（Server / Via），明确请求由本网关处理、而非上游平台或源站。
 */
export const PRODUCT_NAME = 'EdgeGateway';

// 让 ${product_name} 变量与本项目身份标识保持同步（无需硬编码在 vars.js 中）。
// 必须在 PRODUCT_NAME 声明之后调用，避免 ESM 顶层 const 的 TDZ。
setProductName(PRODUCT_NAME);

/**
 * 默认 Host 头处理方式：inherit = 沿用 fetch 的默认行为（Host 取源站域名）。
 * @type {Readonly<{mode:'inherit'|'origin'|'client'|'custom', custom?:string}>}
 */
export const DEFAULT_HOST_HEADER = Object.freeze({
  mode: 'inherit',
  custom: '',
});

/**
 * 站点级默认回源 Host：accel = 使用加速域名（默认）。
 * @type {Readonly<{mode:'accel'|'origin'|'custom', custom?:string}>}
 */
export const DEFAULT_SITE_HOST_HEADER = Object.freeze({
  mode: 'accel',
  custom: '',
});

// ----------------------------------------------------------------------------
// 全局配置
// ----------------------------------------------------------------------------

/**
 * 默认全局配置。
 * passwordHash / passwordSalt 留空表示「尚未初始化」，
 * 首次进入管理面时应引导用户设置密码。
 * @type {Readonly<import('../contracts.js').GlobalConfig>}
 */
export const DEFAULT_GLOBAL = Object.freeze({
  adminPath: '__panel',
  /** 自定义面板域名（留空=任意绑定域名均可进管理面板） */
  adminDomain: '',
  passwordHash: '',
  passwordSalt: '',
  tokenTtl: 7200,
  statsEnabled: true,
  statsDriver: 'kv',
  configCacheTtl: 60,
  /** 全局请求频率限制（req/s），0 表示不限制 */
  globalRateLimit: 0,
  disguise: Object.freeze({
    mode: 'static',
    target: '',
    status: 200,
  }),
  version: CONFIG_VERSION,
});

/**
 * 默认伪装页策略。
 * 单独导出，供 schema.js 规范化与 proxy/disguise.js 兜底使用。
 * @type {Readonly<import('../contracts.js').Disguise>}
 */
export const DEFAULT_DISGUISE = DEFAULT_GLOBAL.disguise;

// ----------------------------------------------------------------------------
// 缓存策略
// ----------------------------------------------------------------------------

/**
 * 默认缓存键构成。
 * @type {Readonly<import('../contracts.js').CacheKey>}
 */
export const DEFAULT_CACHE_KEY = Object.freeze({
  ignoreCase: false,
  includeScheme: false,
  headers: Object.freeze([]),
  cookies: Object.freeze([]),
});

/**
 * 默认缓存策略 —— 「安全优先」而非「性能优先」。
 *
 * 历史包袱说明（重要，别再改回去）：
 * 初版 index.js 里写死了「静态资源缓存 180 天、忽略查询串」这套激进策略。
 * 那时没有可视化配置，硬编码是唯一选择；现在规则完全可配，再把激进值当
 * **全局默认**就很危险了——它会悄悄套用到用户没有显式配置的每一条规则上：
 *   - enabled:true + 180 天：动态页面、带登录态的响应会被误缓存，
 *     轻则用户看到旧内容，重则跨用户串号（把 A 的页面发给 B）。
 *   - ignoreQuery:true：`?id=1` 与 `?id=2` 会被当成同一个缓存对象，
 *     直接返回错误的内容。
 *
 * 因此默认改为**不缓存、不忽略查询串**。想要长缓存请显式开启：
 * 新建站点时选场景模板（见 config/templates.js），或在规则里手动配置。
 * 那些激进但有用的值没有丢，它们被搬进了模板，并作为**用户可改的参数**
 * 呈现在界面上，而不是藏在代码里当不可见的魔法数字。
 *
 * @type {Readonly<import('../contracts.js').CachePolicy>}
 */
export const DEFAULT_CACHE_POLICY = Object.freeze({
  enabled: false, // 未显式开启就不缓存，避免误缓存动态内容 / 登录态响应
  mode: 'ttl', // ttl=自定义时间 / origin=遵循源站 / noCache=不缓存
  edgeTtl: 0,
  staleWhileRevalidate: 0,
  browserTtl: 0,
  ignoreQuery: false, // 保留查询串参与缓存键，否则 ?id=1 与 ?id=2 会命中同一份缓存
  queryWhitelist: Object.freeze([]),
  key: DEFAULT_CACHE_KEY,
  statusTtl: Object.freeze({}),
  preRefresh: false,
  preRefreshPercent: 80,
  offlineCache: false,
});

// ----------------------------------------------------------------------------
// 头部操作
// ----------------------------------------------------------------------------

/**
 * 默认头部操作（空操作）。
 * @type {Readonly<import('../contracts.js').HeaderOps>}
 */
export const DEFAULT_HEADER_OPS = Object.freeze({
  set: Object.freeze({}),
  remove: Object.freeze([]),
});

// ----------------------------------------------------------------------------
// 路径重写
// ----------------------------------------------------------------------------

/**
 * 默认重写规则（不重写）。
 * @type {Readonly<import('../contracts.js').Rewrite>}
 */
export const DEFAULT_REWRITE = Object.freeze({
  type: 'none',
  value: '',
  regexFrom: '',
  regexTo: '',
});

// ----------------------------------------------------------------------------
// 规则
// ----------------------------------------------------------------------------

/**
 * 默认规则匹配条件（全空 = 匹配一切）。
 * @type {Readonly<import('../contracts.js').RuleMatch>}
 */
export const DEFAULT_RULE_MATCH = Object.freeze({
  conditions: Object.freeze([]), // 二维：外层 OR，内层 AND，匹配条件以此为准
});

/** 默认单个匹配条件。 */
export const DEFAULT_CONDITION = Object.freeze({
  target: 'path',
  op: 'prefix',
  values: Object.freeze([]),
  key: '',
  ignoreCase: true,
});

/**
 * 支持的匹配对象清单（对齐 EO 匹配类型）。
 *
 * 新增 `origin`：首要分流（选源站）之后，本次回源的源站对象即成为
 * 规则引擎的一个匹配维度。一次请求只会落在一个 origin 上，因此规则里
 * 写 `origin` 条件等价于「仅当本次回源到该源站时才生效」，对应
 * 「ori1 AND 规则引擎 / ori2 AND 规则引擎 …」的分支语义。
 */
export const MATCH_TARGETS = Object.freeze([
  'host', 'path', 'fullUrl', 'query', 'extension', 'filename', 'directory',
  'method', 'protocol', 'header', 'cookie', 'clientIp', 'clientCountry',
  'userAgent', 'referer', 'origin',
]);

/** 支持的操作符清单。 */
export const MATCH_OPERATORS = Object.freeze([
  'equal', 'notEqual', 'contain', 'notContain', 'prefix', 'notPrefix',
  'suffix', 'notSuffix', 'regex', 'notRegex', 'exists', 'notExists',
]);

/** 需要 key（头名/Cookie名/参数名）的匹配对象。 */
export const TARGETS_NEED_KEY = Object.freeze(['header', 'cookie', 'query']);

/** 默认访问 URL 重定向（关闭）。 */
export const DEFAULT_REDIRECT = Object.freeze({
  enabled: false,
  status: 302,
  target: '',
  keepQuery: true,
});

/** 默认自定义直接响应（关闭）。 */
export const DEFAULT_DIRECT_RESPONSE = Object.freeze({
  enabled: false,
  status: 200,
  contentType: 'text/html; charset=utf-8',
  body: '',
});

/** 默认客户端 IP 回源头（关闭）。启用后使用本项目自有品牌头 X-EdgeGateway-Client-IP 透传真实客户端 IP。 */
export const DEFAULT_CLIENT_IP_HEADER = Object.freeze({
  enabled: false,
  name: 'X-EdgeGateway-Client-IP',
});

/**
 * 默认规则动作。
 * @type {Readonly<import('../contracts.js').RuleAction>}
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
  originTimeoutMs: 0, // 0 = 沿用源站池 failover.timeoutMs
  // 回源连接参数（⑨ Origin Rules）：空/0 表示回退源站物理属性，由 failover 合并决定
  engine: '',   // '' = 沿用源站 engine；可填 fetch/socket/r2
  scheme: '',   // '' = 沿用源站 scheme；可填 http/https
  port: 0,      // 0 = 沿用源站 port（按 scheme 取 443/80）
});

/**
 * 默认规则。
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
// 全站兜底规则（阶段 → 默认动作 映射）
// ----------------------------------------------------------------------------

/**
 * 全站级兜底规则：每个阶段恰好 1 条、无条件、无 priority，就是该阶段的「默认动作」。
 *
 * 它不再是一份带条件匹配的 Rule[]（那样每阶段可多条、需跑 matchRule），而是「阶段→action」
 * 直接映射：运行时站点某阶段无命中，直接取这里对应 stage 的 action 即可，零匹配开销。
 *
 * 设计原则（安全优先、保守默认）：
 *   - rewrite / redirect：默认不重写、不重定向（空操作）。
 *   - terminate：默认强制 HTTPS（301）——这是 CDN 网关的推荐安全基线，不改用户内容。
 *   - reqHeaders / respHeaders：默认不增删任何头部（空操作）。
 *   - origin：默认不改动回源 Host（inherit）、透传真实客户端 IP 关闭、沿用源站超时与重定向策略。
 *   - cache：默认不缓存（见 DEFAULT_CACHE_POLICY 说明，避免误缓存动态内容 / 登录态）。
 *
 * KV 中没有全站规则时，store.getGlobalRules 会把这套默认值**写入落盘**，之后用户可在
 * 管理面自由修改，并非定死在代码里。
 *
 * @type {Readonly<Record<string, any>>}
 */
export const DEFAULT_GLOBAL_RULES = Object.freeze({
  rewrite: deepUnfreeze(DEFAULT_RULE_ACTION.rewrite),
  redirect: deepUnfreeze(DEFAULT_REDIRECT),
  terminate: Object.freeze({
    forceHttps: true,
    forceHttpsStatus: 301,
    directResponse: deepUnfreeze(DEFAULT_DIRECT_RESPONSE),
  }),
  reqHeaders: Object.freeze({
    // 全站兜底「默认回源请求头」。被站点规则级 reqHeaders 覆盖（站点级缺失则继承此处）。
    // 语义：回源时默认携带的伪装浏览器头 + 默认 Accept-Encoding，
    // 使回源请求表现得像一个全新的浏览器请求（与 buildClientHeaders 的旧写死逻辑一致）。
    set: Object.freeze({
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
    }),
    remove: Object.freeze([]),
  }),
  origin: Object.freeze({
    hostHeader: deepUnfreeze(DEFAULT_HOST_HEADER),
    clientIpHeader: deepUnfreeze(DEFAULT_CLIENT_IP_HEADER),
    followRedirect: false,
    originTimeoutMs: 0,
    // 故障转移策略：全站兜底默认值。站点/源站级可覆盖（见 DEFAULT_FAILOVER）。
    // maxRetryBodyBytes：判定源站「可重试错误响应」的最大响应体字节（failover.js 写死 5MB）。
    failover: Object.freeze({
      enabled: true,
      retryOn: DEFAULT_RETRY_ON,
      maxRetries: 2,
      timeoutMs: 10000,
      maxRetryBodyBytes: 5242880,
    }),
  }),
  cache: Object.freeze({
    // 未显式开启就不缓存，避免误缓存动态内容 / 登录态响应。
    // edgeTtl / browserTtl / staleWhileRevalidate 为「开启缓存后的默认回落值」，
    // 与旧 headers.js 写死的 TIER_CDN_DEFAULT_EDGE_TTL=15552000 / BROWSER_TTL=1800 /
    // stale-while-revalidate=86400 一致。noCacheStatus（不应缓存状态码黑名单）为全局判定，
    // 始终生效，故单独收进 settings.cache（见 DEFAULT_GLOBAL_SETTINGS）。
    enabled: false,
    mode: 'ttl',
    edgeTtl: 15552000,
    staleWhileRevalidate: 86400,
    browserTtl: 1800,
    ignoreQuery: false,
    queryWhitelist: Object.freeze([]),
    key: deepUnfreeze(DEFAULT_CACHE_KEY),
    statusTtl: Object.freeze({}),
    preRefresh: false,
    preRefreshPercent: 80,
    offlineCache: false,
  }),
  respHeaders: Object.freeze({
    // 全站兜底「默认响应头」。所有响应默认注入本项目品牌头 Server / Via，
    // 并剥离上游敏感响应头（与旧 headers.js 写死的 PRODUCT_NAME / DEFAULT_STRIP_RESP_HEADERS 一致）。
    set: Object.freeze({
      server: PRODUCT_NAME,
      via: `1.1 ${PRODUCT_NAME}`,
    }),
    remove: Object.freeze([
      'cross-origin-resource-policy',
      'cross-origin-embedder-policy',
      'content-security-policy',
      'content-security-policy-report-only',
      'x-frame-options',
      'set-cookie',
    ]),
  }),
});

/**
 * 生成一份可写全站兜底规则默认值（阶段映射深拷贝）。
 * @returns {Record<string, any>} 新对象，键为 STAGE_ORDER，值为各阶段默认 action
 */
export function cloneGlobalRules() {
  return deepUnfreeze(DEFAULT_GLOBAL_RULES);
}

// ----------------------------------------------------------------------------
// 全站兜底「全局默认参数」（settings 段）
// ----------------------------------------------------------------------------
// 与 stages 段并列，存放「不属于任何规则 stage action、但贯穿整条流量序列」的全局默认。
// 例如：请求接收层（clientIp 提取）、回源请求构造策略（透传白名单 / 前缀剥离）、
// 限速 / 签名 URL / 拦截响应 / 错误文案 / 伪装页 TTL 等。
// 这些项无法用某一 stage 的 HeaderOps / CachePolicy 等 action 字段表达（前缀/白名单/跨请求语义），
// 故独立成 settings，与 stages 一起落盘、一起版本号广播。

/**
 * 不应缓存的状态码全集（源自 contracts.js 的 NO_CACHE_STATUS）。
 * 用于 isCacheable 判定：命中即视为不可缓存。
 * @type {readonly number[]}
 */
export const NO_CACHE_STATUS_LIST = Object.freeze([...NO_CACHE_STATUS]);

/**
 * 回源请求头透传白名单（源自 contracts.js 的 FORWARD_HEADER_WHITELIST）。
 * 只有这些客户端请求头会被透传到源站，其余一律丢弃。
 * @type {readonly string[]}
 */
export const FORWARD_HEADER_WHITELIST_LIST = Object.freeze([...FORWARD_HEADER_WHITELIST]);

/**
 * 回源请求头默认剥离前缀 / 精确名（旧 headers.js 的 FORBIDDEN_PREFIXES / FORBIDDEN_EXACT）。
 * 凡以此类前缀开头、或精确命中的客户端请求头，构造回源请求时一律剔除。
 * @type {{prefixes: readonly string[], exact: readonly string[]}}
 */
export const STRIP_REQ_HEADERS = Object.freeze({
  prefixes: Object.freeze(['cf-', 'x-forwarded-', 'x-real-ip']),
  exact: Object.freeze(['forwarded', 'true-client-ip']),
});

/** 全站兜底全局默认参数。 */
export const DEFAULT_GLOBAL_SETTINGS = Object.freeze({
  // 请求接收层
  request: Object.freeze({
    // 提取真实客户端 IP 的回源/请求头优先级（matcher.js 旧写死 cf-connecting-ip || x-real-ip）
    clientIpHeaders: Object.freeze(['cf-connecting-ip', 'x-real-ip']),
    // 默认协议（matcher.js 默认 https）
    defaultProtocol: 'https',
  }),
  // 回源策略兜底（池级 failover 未配置时的回落值；与 stages.origin.failover 层级不同：
  // 此处作用于「池」，stages.origin.failover 作用于「源站/规则」）
  origin: Object.freeze({
    retryOn: DEFAULT_RETRY_ON,
    maxRetries: 2,
    timeoutMs: 10000,
    maxRetryBodyBytes: 5242880,
  }),
  // 回源请求构造全局策略（无法用 reqHeaders.set 表达前缀/白名单语义）
  reqHeaders: Object.freeze({
    forwardWhitelist: FORWARD_HEADER_WHITELIST_LIST,
    stripPrefixes: STRIP_REQ_HEADERS.prefixes,
    stripExact: STRIP_REQ_HEADERS.exact,
    // 反代模式（disguise=proxy）使用的伪装 UA（旧 disguise.js 写死 Chrome/120.0）
    proxyUserAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  }),
  // 响应头设置（品牌头 + 默认剥离，无法用单一规则 action 表达跨请求全局语义）
  respHeaders: Object.freeze({
    // 本项目作为独立 CDN 网关的身份标识（旧 headers.js 写死 PRODUCT_NAME）
    serverName: PRODUCT_NAME,
    // RFC 7230 要求的代理链标识，格式为「协议/版本 别名」
    viaName: `1.1 ${PRODUCT_NAME}`,
    // 默认删除的源站响应头（旧 contracts.js 的 DEFAULT_STRIP_RESP_HEADERS）
    stripDefaults: Object.freeze([
      'cross-origin-resource-policy',
      'cross-origin-embedder-policy',
      'content-security-policy',
      'content-security-policy-report-only',
      'x-frame-options',
      'set-cookie',
    ]),
  }),
  // 缓存可写性判定（全局生效，与某条 cache 规则无关）
  cache: Object.freeze({
    noCacheStatus: NO_CACHE_STATUS_LIST,
  }),
  // 安全防护（独立于 7 阶段流量序列）
  security: Object.freeze({
    // 限流（旧 DEFAULT_RATE_LIMIT.rpm=600 / ratelimit.js 写死 RL_TTL_SEC=120 等）
    rateLimitRpm: 600,
    rlTtlSec: 120,
    remoteSyncIntervalMs: 30000,
    memMaxEntries: 5000,
    // 签名 URL（旧 guard.js 写死 param='sign' / ttl=3600）
    signedUrlParam: 'sign',
    signedUrlTtl: 3600,
  }),
  // 错误与拦截响应
  error: Object.freeze({
    // 拦截体（旧 guard.js 写死 'Forbidden'）
    blockBody: 'Forbidden',
    // 拦截响应缓存控制（旧 guard.js 写死 'no-store'）
    blockCacheControl: 'no-store',
    // 5xx 错误文案（旧 app.js errorResponse 写死）
    messages: Object.freeze({
      internal: 'Internal Server Error',
      noOrigin: 'No Origin',
      configError: 'Config Error',
    }),
  }),
  // 伪装页（disguise 独立生成路径，不进 7 阶段序列）
  disguise: Object.freeze({
    // 伪装页在 CDN 层的缓存时长（旧 disguise.js 写死 86400）
    disguiseCdnMaxAge: 86400,
    // 伪装页在本地的 isolate 内存缓存时长（旧 disguise.js 写死 600000=10min）
    disguiseIsolateTtlMs: 600000,
    // 静态伪装页 Server 头（旧 disguise.js 写死 'nginx'）
    staticServerName: 'nginx',
  }),
  // 调试响应头（原 headers.js 写死的 X-Origin-Id / X-Cache / X-Rule-Id / X-Retry-Count / X-Edge-Time
  // 头名与开关，现收编为可配置、可关闭、可改名，默认保持原行为不变）
  debug: Object.freeze({
    enabled: true,
    headers: Object.freeze({
      originId: 'X-Origin-Id',
      cache: 'X-Cache',
      ruleId: 'X-Rule-Id',
      retryCount: 'X-Retry-Count',
      edgeTime: 'X-Edge-Time',
    }),
  }),
});

/**
 * 生成一份可写全站兜底全局默认参数（深拷贝）。
 * @returns {Record<string, any>} 新对象
 */
export function cloneGlobalSettings() {
  return deepUnfreeze(DEFAULT_GLOBAL_SETTINGS);
}

// ----------------------------------------------------------------------------
// 安全策略
// ----------------------------------------------------------------------------

/**
 * 默认签名 URL 配置（关闭）。
 * @type {Readonly<{enabled:boolean,secret:string,ttl:number,param:string}>}
 */
export const DEFAULT_SIGNED_URL = Object.freeze({
  enabled: false,
  secret: '',
  ttl: 3600,
  param: 'sign',
});

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
  signedUrl: DEFAULT_SIGNED_URL,
  rateLimit: DEFAULT_RATE_LIMIT,
  botManagement: DEFAULT_BOT_MANAGEMENT,
});

// ----------------------------------------------------------------------------
// 站点
// ----------------------------------------------------------------------------

/**
 * 默认故障转移（内联源站复用）。提前定义以避免 DEFAULT_SITE 引用时的 TDZ。
 * @type {Readonly<import('../contracts.js').Failover>}
 */
export const DEFAULT_FAILOVER = Object.freeze({
  enabled: true,
  retryOn: DEFAULT_RETRY_ON,
  maxRetries: 2,
  timeoutMs: 10000,
});

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
export const ORIGIN_ENGINES = Object.freeze(['fetch', 'socket', 'r2']);

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
  failover: DEFAULT_FAILOVER,
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
 * 默认站点索引（对应 KV key `site:_index`）。
 * @type {Readonly<{hosts:string[], wildcards:{pattern:string,host:string}[]}>}
 */
export const DEFAULT_SITE_INDEX = Object.freeze({
  hosts: Object.freeze([]),
  wildcards: Object.freeze([]),
});

/**
 * 默认源站池索引（对应 KV key `pool:_index`）。
 * @type {Readonly<{ids:string[]}>}
 */
export const DEFAULT_POOL_INDEX = Object.freeze({
  ids: Object.freeze([]),
});

// ----------------------------------------------------------------------------
// 深拷贝工厂
// ----------------------------------------------------------------------------

/**
 * 递归深拷贝并解冻。只处理 JSON 可表达的结构，足够覆盖本项目所有配置。
 * 不用 structuredClone —— EdgeOne 运行时不保证提供。
 * @param {any} v 源值
 * @returns {any} 可写深拷贝
 */
function deepUnfreeze(v) {
  if (Array.isArray(v)) return v.map(deepUnfreeze);
  if (v && typeof v === 'object') {
    /** @type {Record<string, any>} */
    const out = {};
    for (const k of Object.keys(v)) out[k] = deepUnfreeze(v[k]);
    return out;
  }
  return v;
}

/**
 * 生成一份可写的全局配置默认值。
 * @returns {import('../contracts.js').GlobalConfig} 新对象
 */
export function cloneGlobal() {
  return deepUnfreeze(DEFAULT_GLOBAL);
}

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

/**
 * 生成一份可写的缓存策略默认值。
 * @returns {import('../contracts.js').CachePolicy} 新对象
 */
export function cloneCachePolicy() {
  return deepUnfreeze(DEFAULT_CACHE_POLICY);
}

/**
 * 通用深拷贝，供 store/schema 复用。
 * @param {any} v 源值
 * @returns {any} 深拷贝
 */
export function deepClone(v) {
  return deepUnfreeze(v);
}
