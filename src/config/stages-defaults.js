/**
 * ============================================================================
 * config/stages-defaults.js —— 全站流量序列「阶段 → 默认动作」默认值
 * ----------------------------------------------------------------------------
 * 这一层是「一次请求经过的若干阶段，每个阶段的默认动作长什么样」。
 * 它是默认值里引用关系最密的一层：DEFAULT_GLOBAL_RULES（全站兜底规则）直接
 * 引用了本文件内的 DEFAULT_REWRITE / DEFAULT_REDIRECT / DEFAULT_DIRECT_RESPONSE /
 * DEFAULT_HOST_HEADER / DEFAULT_CLIENT_IP_HEADER / DEFAULT_CACHE_KEY /
 * DEFAULT_TERMINATE 等符号。因此把它们全部放在本文件内自洽，避免跨文件 TDZ
 * 与隐式耦合。
 *
 * 层级边界（重要）：
 *  - 本文件只放「全站流量阶段级」默认值，不含任何站点 / 规则 / 源站级实体。
 *  - 单条站点规则模板 DEFAULT_RULE / DEFAULT_RULE_ACTION 属于站点级，已迁至
 *    site.js。本文件仅在 DEFAULT_GLOBAL_RULES.rewrite 阶段复用其「动作子模板」
 *   的字段形状（DEFAULT_REWRITE），并不引用 DEFAULT_RULE_ACTION 整体。
 *
 * forceHttps 双份默认值说明（消歧义）：
 *   - DEFAULT_RULE_ACTION.forceHttps = false  → 单条站点规则动作的初始值（见 site.js）。
 *   - DEFAULT_TERMINATE.forceHttps   = true   → 全站「终止阶段」的安全基线（见下）。
 *   二者属于不同层级、语义独立，**切勿合并**为一处；两处均有交叉引用锚点注释。
 * ============================================================================
 */

import { DEFAULT_RETRY_ON } from '../contracts.js';
import { deepUnfreeze, deepClone } from './factory.js';
import { DEFAULT_HOST_HEADER, FORWARD_HEADER_WHITELIST_LIST } from './global.js';

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
  // 错误码缓存 TTL：命中状态码 → 缓存秒数；0 = no-store（不写缓存 + 下发 no-store 头）。
  // 默认 4xx / 5xx / 52x 不缓存（原 noCacheStatus 黑名单语义并入此处，TTL=0 即 no-store）。
  statusTtl: Object.freeze({ '4xx': 0, '5xx': 0, '52x': 0 }),
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
// 规则匹配
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
  'method', 'header', 'cookie', 'clientIp', 'clientCountry',
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
  enabled: true,
  name: 'X-EdgeGateway-Client-IP',
});

// ----------------------------------------------------------------------------
// 全站兜底规则（阶段 → 默认动作 映射）
// ----------------------------------------------------------------------------

/**
 * 默认「终止阶段」动作（全站兜底基线）。
 * 与 DEFAULT_REDIRECT 等同级模板统一风格，作为全站强制 HTTPS 的唯一真相源；
 * 单条站点规则动作的 forceHttps 初始值为 false（见 site.js 的 DEFAULT_RULE_ACTION），
 * 二者层级不同、**不合并**。
 */
export const DEFAULT_TERMINATE = Object.freeze({
  forceHttps: true,
  forceHttpsStatus: 301,
  directResponse: deepUnfreeze(DEFAULT_DIRECT_RESPONSE),
});

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
  rewrite: deepUnfreeze(DEFAULT_REWRITE),
  redirect: deepUnfreeze(DEFAULT_REDIRECT),
  terminate: deepUnfreeze(DEFAULT_TERMINATE),
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
    // 单轨化：以下三项原在 settings.reqHeaders（隐藏双轨），现并入本阶段默认 action，
    // 使「回源请求头如何构造」的全部配置都在「修改请求头」阶段一处可视、可改。
    //
    // forwardWhitelist：客户端请求头透传白名单。只有列出的头会被带到源站，
    // 其余（Cookie / Referer / Origin / CF- 前缀等）一律丢弃。
    forwardWhitelist: Object.freeze([...FORWARD_HEADER_WHITELIST_LIST]),
    // strip：白名单之外的「额外剥离规则」，统一语法 {type, value}：
    //   - prefix：按头名前缀剥离（如 cf- 剥离所有 cf-* 头）
    //   - exact ：按头名精确剥离
    //   - regex ：按正则匹配头名剥离（用户高级用法）
    // 原 settings.reqHeaders.stripPrefixes / stripExact 合并为此单一列表。
    strip: Object.freeze([
      Object.freeze({ type: 'prefix', value: 'cf-' }),
      Object.freeze({ type: 'prefix', value: 'x-forwarded-' }),
      Object.freeze({ type: 'prefix', value: 'x-real-ip' }),
      Object.freeze({ type: 'exact', value: 'forwarded' }),
      Object.freeze({ type: 'exact', value: 'true-client-ip' }),
    ]),
  }),
  origin: Object.freeze({
    hostHeader: deepUnfreeze(DEFAULT_HOST_HEADER),
    clientIpHeader: deepUnfreeze(DEFAULT_CLIENT_IP_HEADER),
    followRedirect: true,
    originTimeoutMs: 0,
    // 故障转移 / 回源重试策略：全站兜底默认值，同时也是「新建源站池」的默认参数。
    //
    // 单轨化：原先此处与 settings.origin 各写一份完全相同的默认值（双份真相源，
    // 前者作用于规则/源站、后者作用于池），现统一为本处唯一真相源：
    // 池级 failover 未配置时回落到这里，源站池 UI 提供「跟随全局默认」开关。
    // maxRetryBodyBytes：判定源站「可重试错误响应」的最大响应体字节。
    failover: Object.freeze({
      enabled: true,
      retryOn: DEFAULT_RETRY_ON,
      maxRetries: 2,
      timeoutMs: 10000,
      maxRetryBodyBytes: 5242880,
    }),
  }),
  // 单轨化新增阶段：安全校验（全站维度）。
  // 原 settings.security.*（隐藏双轨）。限速是跨请求的全站级判定，不属于某条规则的
  // action，但它确实是流量序列「② 安全包」阶段的配置，故以独立 stage 承载并可视化。
  // 注意：原 settings.security.signedUrlParam / signedUrlTtl 已随不完善的签名 URL
  // 逻辑一并从全项目删除，不再出现在任何默认值中。
  security: Object.freeze({
    // —— 全站安全校验阶段的可视化策略字段（与站点 security 同构）——
    // 单轨化后这些原本隐藏在 settings 的双轨字段统一回到「全站通用规则 · 安全校验」
    // 阶段。若此处缺失，ctx.__globalStages.security.uaBlacklist 等永远为 undefined，
    // 全站安全策略（UA / IP 黑名单、Referer 防盗链）将形同虚设。
    refererMode: 'off',
    refererList: Object.freeze([]),
    allowEmptyReferer: true,
    uaBlacklist: Object.freeze([]),
    ipBlacklist: Object.freeze([]),
    ipWhitelist: Object.freeze([]),
    botManagement: Object.freeze({ enabled: false, mode: 'blacklist', list: Object.freeze([]) }),
    // 全站默认限速（每分钟请求数）。站点自身的限速配置优先。
    rateLimitRpm: 600,
    // 限速计数槽在 KV / 内存中的存活秒数
    rlTtlSec: 120,
    // 多节点限速计数的远端同步间隔（毫秒）
    remoteSyncIntervalMs: 30000,
    // 限速内存表最大条目数（防止 isolate 内存无限增长）
    memMaxEntries: 5000,
  }),
  // 单轨化新增阶段：错误处理 / 拦截响应。
  // 原 settings.error.*（隐藏双轨）。拦截与错误页是流量序列的终止型输出，
  // 与 terminate.directResponse 同族，故以独立 stage 承载并可视化。
  error: Object.freeze({
    // 被安全规则拦截时返回的响应体
    blockBody: 'Forbidden',
    // 拦截响应的 Cache-Control（拦截结果不该被缓存）
    blockCacheControl: 'no-store',
    // 5xx 系列错误文案
    messages: Object.freeze({
      internal: 'Internal Server Error',
      noOrigin: 'No Origin',
      configError: 'Config Error',
    }),
  }),
  // ① 匹配站点：纯 host/path 等维度匹配，匹配阶段不再包含任何协议配置
  // （协议纠正由 terminate 阶段的 forceHttps 负责，见 pipeline.js）。
  match: Object.freeze({}),
  cache: Object.freeze({
    // 未显式开启就不缓存，避免误缓存动态内容 / 登录态响应。
    // edgeTtl / browserTtl / staleWhileRevalidate 为「开启缓存后的默认回落值」，
    // 与旧 headers.js 写死的 TIER_CDN_DEFAULT_EDGE_TTL=15552000 / BROWSER_TTL=1800 /
    // stale-while-revalidate=86400 一致。
    enabled: false,
    mode: 'ttl',
    edgeTtl: 86400,
    staleWhileRevalidate: 3600,
    browserTtl: 3600,
    ignoreQuery: true,
    queryWhitelist: Object.freeze([]),
    key: deepUnfreeze(DEFAULT_CACHE_KEY),
    // 错误码缓存 TTL：命中状态码 → 缓存秒数；0 = no-store（不写缓存 + 下发 no-store 头）。
    // 默认 4xx / 5xx / 52x 不缓存（原 noCacheStatus 黑名单语义并入此处：TTL=0 即 no-store）。
    statusTtl: Object.freeze({ '4xx': 0, '5xx': 0, '52x': 0 }),
    preRefresh: true,
    preRefreshPercent: 80,
    offlineCache: true,
    // 单轨化：原 settings.disguise.*（隐藏双轨），现并入缓存阶段。
    // 伪装页有独立生成路径（不进 7 阶段序列），但其「缓存多久」本质是缓存配置。
    disguise: Object.freeze({
      // 伪装页在 CDN 层的缓存时长（秒）
      cdnMaxAge: 86400,
      // 伪装页在本地 isolate 内存里的缓存时长（毫秒）
      isolateTtlMs: 600000,
    }),
  }),
  respHeaders: Object.freeze({
    // 全站兜底「默认响应头」。所有响应默认注入本项目品牌头 Server / Via，
    // 并剥离上游敏感响应头（与旧 headers.js 写死的 PRODUCT_NAME / DEFAULT_STRIP_RESP_HEADERS 一致）。
    //
    // 品牌名统一引用「单一真相源」：代码常量 PRODUCT_NAME（经 vars.js 的 ${product_name} 变量）。
    // 注意：Server / Via 不再经由 settings.respHeaders.serverName/viaName 中转，
    // 而是直接在此 stages 里以 ${product_name} 表达（用户认可的「全局规则里直接写」方式）。
    // 调试响应头（X-Cache / X-Origin-Id / X-Rule-Id / X-Retry-Count / X-Edge-Time）不在 stages
    // 显式列出，而由 headers.js 按引擎常量 DEBUG_HEADER_NAMES 默认下发；如需关闭，
    // 在站点规则 stages.respHeaders.remove 中加入对应头名即可。
    set: Object.freeze({
      server: '${product_name}',
      via: '1.1 ${product_name}',
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

/**
 * 生成一份可写的缓存策略默认值。
 * @returns {import('../contracts.js').CachePolicy} 新对象
 */
export function cloneCachePolicy() {
  return deepUnfreeze(DEFAULT_CACHE_POLICY);
}

// 供本层内需要深拷贝语义的其它用途（如 schema 复用）。重新导出保持与原 defaults.js 一致。
export { deepClone };
