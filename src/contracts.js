/**
 * ============================================================================
 * 全局契约定义 (Contracts)
 * ----------------------------------------------------------------------------
 * 本文件是所有模块之间的「接口协议」，是并行开发的唯一事实来源(Single Source of Truth)。
 *
 * !!! 重要 !!!
 * 任何成员都不得单方面修改本文件。如需变更，必须先通知团队负责人(main)。
 * 所有模块必须严格按照这里定义的数据结构与函数签名实现。
 * ============================================================================
 */

// ============================================================================
// 一、平台能力 (Capabilities)
// ============================================================================

/**
 * @typedef {Object} Caps                 平台能力描述
 * @property {'cf'|'eo'|'esa'} platform  部署厂商（由 CLOUD_PLATFORM 环境变量显式声明：cf / eo / esa；未声明时 caps.readPlatform 直接抛错，不会产出 unknown）
 * @property {boolean} hasEdgeCache       是否支持「边缘缓存」（三平台均真实生效：CF/EO=caches.default API；ESA=全局 cache 单实例；响应头委托为任意平台的兜底通道）
 * @property {boolean} hasCacheApi        是否支持 Cache API 读写（三平台均支持：cf=caches.default；eo=caches.default 节点本地化；esa=全局 cache 单实例）
 * @property {boolean} eoEdgeCache        是否支持 EO 同站 fetch 委托节点缓存（运行在 EO 边缘函数且站点已接入加速域名；命中后零函数调用）
 * @property {boolean} cacheIsNodeLocal    缓存仅当前边缘节点有效、不跨节点复制（eo=true；cf/esa=false）
 * @property {boolean} cacheSingleInstance 平台仅提供单实例全局 cache、无 caches.default/open 命名空间（esa=true；cf/eo=false）
 * @property {number}  cacheSubreqLimit    Cache 操作与 fetch 共享的子请求预算（esa=32 硬限；其余宽松）
 * @property {boolean} cacheKeyHttpOnly    Cache API 的 put key 必须为 http(s) 协议 URL（esa 引擎不支持 https key，写入时强制降为 http）
 * @property {number}  maxSubRequests     每请求子请求（fetch）预算上限（esa=32 硬限且与 Cache 共享；cf/eo=1000 宽松）
 * @property {boolean} hasRawIpFetch      是否支持「fetch 直连裸 IP / 自定义端口 / 自定义 SNI」（仅 CF 支持；EO/ESA 的 fetch 仅支持域名，裸 IP 须走平台源站组兜底）
 * @property {boolean} hasSocket          是否支持 cloudflare:sockets（仅 CF，用于裸 IP+HTTPS+自定义 SNI 的内部自动兜底）
 * @property {boolean} hasD1              是否绑定了 D1
 * @property {boolean} hasKV              是否绑定了 KV
 * @property {boolean} hasR2              是否绑定了 R2（仅 CF；用于 engine='r2' 回源到 R2 桶）
 */

// ============================================================================
// 二、请求上下文 (Ctx) —— 贯穿整条管线的唯一载体
// ============================================================================

/**
 * @typedef {Object} Ctx
 * @property {Request}  request           原始客户端请求
 * @property {URL}      url               已解析的 URL 对象
 * @property {Object}   env               平台环境变量与绑定
 * @property {Caps}     caps              平台能力
 * @property {(p:Promise<any>)=>void} waitUntil  异步后台任务
 * @property {number}   startTime         请求开始时间戳 Date.now()
 * @property {string}   [reqId]           请求追踪 ID，随 X-Request-Id 响应头下发
 * @property {Object}   [origin]           首要分流选出的本次回源对象（在匹配规则前写入）。
 *                                           作为规则引擎的 origin 匹配维度（oriX AND 规则引擎 分支）。
 * @property {string}   [origin.id]        源站 id
 * @property {string}   [origin.addr]      源站地址
 * @property {Object}   debug             调试信息收集器，最终输出为响应头
 * @property {string}   [debug.cache]     HIT | MISS | BYPASS | DISABLED
 * @property {string}   [debug.siteId]    命中的站点
 * @property {string}   [debug.ruleId]    命中的规则
 * @property {string}   [debug.originId]  最终使用的源站
 * @property {string}   [debug.originAddr] 最终源站地址
 * @property {number}   [debug.retries]   重试次数
 * @property {string[]} [debug.tried]     已尝试过的源站 id 列表
 */

// ============================================================================
// 三、配置数据模型 (KV Schema)
// ============================================================================

/**
 * KV Key 命名规范 —— 所有模块必须遵守
 *
 *   cfg:global                全局配置 GlobalConfig
 *   cfg:global_rules          全站通用（兜底）规则 { stages: {阶段→默认动作} }
 *   site:{host}               站点配置 Site（host 全小写）
 *   site:_index               站点索引 { hosts: string[], wildcards: {pattern,host}[] }
 *   pool:{poolId}             源站池 OriginPool
 *   pool:_index               源站池索引 { ids: string[] }
 *   hc:{poolId}:{originId}    熔断标记（值为失败次数，TTL 60s）
 *   lock:{ip}                 登录失败锁定（TTL 900s）
 *   stat:{host}:{yyyymmddhh}:{shard}   统计分片
 */

/**
 * @typedef {Object} GlobalConfig
 * @property {string}  adminPath          管理面路径段，如 "__panel"
 * @property {string}  adminDomain        自定义面板域名（留空=任意绑定域名均可进管理面板；填写后仅此域名+管理面路径可进入）
 * @property {string}  passwordHash       PBKDF2 哈希（base64）
 * @property {string}  passwordSalt       盐（base64）
 * @property {number}  tokenTtl           JWT 有效期（秒），默认 7200
 * @property {boolean} statsEnabled       是否开启统计
 * @property {'kv'|'d1'|'none'} statsDriver
 * @property {number}  configCacheTtl     配置内存缓存 TTL（秒），默认 30
 * @property {number}  globalRateLimit    全局请求频率限制（req/s），0 表示不限制
 * @property {Disguise} disguise          未匹配站点时的伪装页策略
 * @property {string}  version            配置结构版本
 */

/**
 * 伪装页策略。
 *
 * 当请求的 host 没有匹配到任何已配置站点时，返回一个看起来平平无奇的页面，
 * 而不是暴露「这里是一个可配置的反代网关」的 404 文案。
 *
 * mode:
 *   - 'static' 直接返回内置的静态 HTML（默认，零 subrequest 开销）
 *   - 'proxy'  反代 target 指向的真实站点（更逼真，每次请求消耗一次 subrequest）
 *   - 'none'   关闭伪装，返回朴素的 404（便于调试）
 *
 * @typedef {Object} Disguise
 * @property {'static'|'proxy'|'none'} mode 伪装模式，默认 'static'
 * @property {string} target  mode='proxy' 时的上游地址（http/https 绝对 URL）
 * @property {number} status  响应状态码，默认 200（static 模式生效）
 */

/**
 * @typedef {Object} Site
 * @property {string}  host               "img.a.com" 或 "*.a.com"
 * @property {boolean} enabled
 * @property {string}  [poolId]           默认上游，引用 OriginPool.id。既可指向 kind='single' 的单一源站，
 *                                        也可指向 kind='pool' 的源站池。站点不再持有内联源站：
 *                                        在新建站点里直接填源站地址时会自动联动创建一条 kind='single' 记录
 * @property {{mode:'accel'|'origin'|'custom', custom?:string}} [defaultHostHeader]  站点级默认回源 Host（accel=加速域名 / origin=源站域名 / custom=自定义）
 * @property {Rule[]}  rules              按 priority 降序匹配，命中即停
 * @property {Security} security
 * @property {boolean} [ipv6Support]      是否启用 IPv6 回源（默认 false）
 * @property {number}  [cacheGen]         缓存代次，整站清缓存时 +1 使旧缓存键失效
 * @property {number}  updatedAt
 * @property {string}  [version]          数据格式版本，由 schema.validate 自动填充（当前 CONFIG_VERSION）
 */

/**
 * @typedef {Object} Rule
 * @property {string}  id
 * @property {number}  priority           数值越大越优先
 * @property {boolean} enabled
 * @property {RuleMatch}  match
 * @property {RuleAction} action
 */

/**
 * 全站通用（兜底）规则：阶段 → 默认动作 映射。
 *
 * 与站点 Rule[] 不同，全站规则**无条件、无优先级、每阶段恰好 1 条**——它只是
 * 「每个阶段默认如何消费」的默认值。KV 为空时由程序写入一套保守默认（见
 * defaults.DEFAULT_GLOBAL_RULES）落盘，之后用户可在管理面自由修改。
 *
 * 运行时：站点某阶段无命中（规则字段缺失）时，直接取本映射对应 stage 的默认
 * action 补全，不再对全站规则跑条件匹配（避免 O(N) 扫描、保证最坏 O(7)）。
 *
 * keys 取自 stages.STAGE_ORDER，常见包括：
 *   rewrite / redirect / terminate / reqHeaders / origin / cache / respHeaders
 *
 * @typedef {Object} GlobalRulesStages
 * @property {Rewrite}            [rewrite]     默认重写（通常为空操作 {type:'none'}）
 * @property {Redirect}           [redirect]    默认重定向（通常为空操作 {type:'none'}）
 * @property {Terminate}          [terminate]   默认终止类动作（forceHttps 等）
 * @property {HeaderOps}          [reqHeaders]  默认请求头操作（通常为空操作）
 * @property {Origin}             [origin]      默认回源配置（hostHeader 等）
 * @property {CachePolicy}        [cache]       默认缓存策略（默认不缓存）
 * @property {HeaderOps}          [respHeaders] 默认响应头操作（通常为空操作）
 */

/**
 * 规则匹配条件（对齐 EdgeOne 规则引擎）。
 *
 * EO 模型：一条规则由若干 Condition 组成，同组内为 AND，组间为 OR。
 * 即 conditions = [[c1, c2], [c3]] 表示 (c1 && c2) || c3。
 *
 * @typedef {Object} RuleMatch
 * @property {Condition[][]} [conditions] 二维条件数组：外层 OR，内层 AND。空 = 匹配一切
 */

/**
 * 单个匹配条件。
 *
 * @typedef {Object} Condition
 * @property {MatchTarget} target         匹配对象
 * @property {MatchOperator} op           匹配操作符
 * @property {string[]} values            匹配值列表（多值为 OR）
 * @property {string} [key]               target 为 header/cookie/query 时的键名
 * @property {boolean} [ignoreCase]       是否忽略大小写，默认 true
 */

/**
 * 匹配对象。对齐 EO「匹配类型」。
 * @typedef {'host'|'path'|'fullUrl'|'query'|'extension'|'filename'|'directory'
 *   |'method'|'protocol'|'header'|'cookie'|'clientIp'|'clientCountry'
 *   |'userAgent'|'referer'} MatchTarget
 */

/**
 * 匹配操作符。对齐 EO「操作符」。
 * @typedef {'equal'|'notEqual'|'contain'|'notContain'|'prefix'|'notPrefix'
 *   |'suffix'|'notSuffix'|'regex'|'notRegex'|'exists'|'notExists'} MatchOperator
 */

/**
 * 规则动作（对齐 EO 规则引擎「操作」分类）。
 *
 * @typedef {Object} RuleAction
 * @property {string}   [poolId]          覆盖站点默认上游，引用 OriginPool.id（single 或 pool 均可）。空=沿用站点默认
 * @property {Origin[]} [inlineOrigins]   规则级内联源站（规则命中时直接回源，优先级高于 poolId）。
 *                                        仅规则级保留内联；站点级内联已废弃
 * @property {Rewrite}  rewrite           回源 URL 重写
 * @property {CachePolicy} cache          缓存配置
 * @property {HeaderOps} reqHeaders       回源请求头修改
 * @property {HeaderOps} respHeaders      节点响应头修改
 * @property {{mode:'inherit'|'origin'|'client'|'custom', custom?:string}} [hostHeader]  回源 Host 重写（规则级，优先级高于站点默认与源站配置；inherit=沿用站点默认）
 * @property {Redirect}  [redirect]       访问 URL 重定向（301/302 等）
 * @property {DirectResponse} [directResponse] 自定义直接响应（不回源）
 * @property {ClientIpHeader} [clientIpHeader] 存放客户端 IP 的回源头
 * @property {boolean}  [forceHttps]      强制 HTTPS 跳转
 * @property {number}   [forceHttpsStatus] 强制 HTTPS 跳转状态码，默认 301（301-308）
 * @property {boolean}  [followRedirect]  回源跟随 3xx 重定向
 * @property {number}   [originTimeoutMs] 覆盖回源超时
 * —— 以下三项为「回源连接参数」（对应 ⑨ Origin Rules）：规则级覆盖源站物理属性，未设则回退源站 ——
 * @property {'fetch'|'r2'|'api'} [engine]  回源引擎（规则级优先；与源站 engine 同取值，未设回退源站 engine）。
 *                                          socket 不再是可选 engine——CF 上「裸 IP + HTTPS + 自定义 SNI」
 *                                          由 fetch 引擎内部自动走 cloudflare:sockets 兜底，无需用户指定。
 *                                          未来可扩展 'api'（如 cnb / github api 请求引擎）。
 * @property {'http'|'https'}    [scheme]  回源协议（规则级优先；未设回退源站 scheme，默认 https）
 * @property {number}   [port]             回源端口（规则级优先；未设回退源站 port，默认按 scheme 取 443/80）
 *
 * 设计意图：旧版「源站级规则」（给每个源站单独配 port/protocol/engine/path/host）被统一收编到
 * 流量序列的 ⑨ Origin Rules —— 用 `回源目标(=源站 id)` 作为匹配条件 + 上述连接参数动作，即可在
 * 纯「全站级 + 站点级」两层规则架构下，表达「不同源站走不同端口/协议/引擎」的差异化回源。
 */

/**
 * 访问 URL 重定向。
 * @typedef {Object} Redirect
 * @property {boolean} enabled
 * @property {number}  status            301|302|303|307|308
 * @property {string}  target            目标 URL，支持 $1..$9 正则捕获引用
 * @property {boolean} [keepQuery]       是否保留原查询串
 */

/**
 * 自定义直接响应（EO：自定义错误页 / 直接响应）。
 * @typedef {Object} DirectResponse
 * @property {boolean} enabled
 * @property {number}  status
 * @property {string}  contentType
 * @property {string}  body
 */

/**
 * 客户端 IP 回源头（EO：存放客户端 IP 的头部）。
 * @typedef {Object} ClientIpHeader
 * @property {boolean} enabled
 * @property {string}  name              头部名，默认 X-Forwarded-For
 */

/**
 * @typedef {Object} Rewrite
 * @property {'none'|'prefix'|'strip'|'regex'} type
 * @property {string} [value]             prefix 时为前缀；strip 时为要剥离的前缀
 * @property {string} [regexFrom]
 * @property {string} [regexTo]
 */

/**
 * 缓存策略（对齐 EO「缓存配置」+「自定义 Cache Key」）。
 *
 * @typedef {Object} CachePolicy
 * @property {boolean}  enabled           false = 不缓存（EO: 不缓存）
 * @property {'ttl'|'origin'|'noCache'} [mode]  ttl=自定义时间 / origin=遵循源站 / noCache=不缓存
 * @property {number}   edgeTtl           边缘缓存秒数
 * @property {number}   [staleWhileRevalidate]  边缘 stale-while-revalidate 秒数（写入 CDN-Cache-Control，让边缘在过期后仍可先返回旧内容并后台刷新）
 * @property {number}   browserTtl        浏览器缓存秒数（-1 = 跟随源站，不改写）
 * @property {boolean}  ignoreQuery       缓存键是否忽略查询串
 * @property {string[]} queryWhitelist    ignoreQuery=false 时保留的参数（空=全保留）
 * @property {CacheKey} [key]             自定义缓存键组成
 * @property {Record<string,number>} [statusTtl]  状态码缓存 TTL，如 {"404":10}
 * @property {boolean}  [preRefresh]      缓存预刷新
 * @property {number}   [preRefreshPercent] 剩余 TTL 低于该百分比时后台刷新，默认 80
 * @property {boolean}  [offlineCache]    源站故障时使用过期缓存兜底
 */

/**
 * 自定义 Cache Key 组成（对齐 EO）。
 *
 * @typedef {Object} CacheKey
 * @property {boolean}  [ignoreCase]      缓存键忽略大小写
 * @property {boolean}  [includeScheme]   是否区分 http/https
 * @property {string[]} [headers]         纳入缓存键的请求头名
 * @property {string[]} [cookies]         纳入缓存键的 Cookie 名
 */

/**
 * @typedef {Object} HeaderOps
 * @property {Record<string,string>} set  设置/覆盖
 * @property {string[]}              remove 删除（小写名）
 */

/**
 * @typedef {Object} Security
 * @property {'off'|'whitelist'|'blacklist'} refererMode
 * @property {string[]} refererList
 * @property {boolean}  allowEmptyReferer
 * @property {string[]} uaBlacklist
 * @property {string[]} ipBlacklist
 * @property {string[]} ipWhitelist
 * @property {{enabled:boolean,rpm:number}} rateLimit
 */

/**
 * @typedef {Object} OriginPool
 * 源站实体（借鉴 nginx upstream）。单一源站与源站池是同一实体的两种 kind，
 * 同表存储、同一引用方式（poolId），在「源站」标签页统一纵览。
 *
 * @property {string}  id          机器主键（**系统自动生成**，格式 pl_xxxx，用户不可填）。KV key: pool:{id}，站点 poolId 引用此值
 * @property {string}  name        用户友好名称（给人区分用的展示标签，可重复，可选）
 * @property {'single'|'pool'} [kind]  'single'=单一源站（恰好 1 个 origin，可由站点联动自动创建）；
 *                                     'pool'=源站池（多 origin + 负载均衡，只能在源站页手动新建）
 * @property {'chain'|'roundrobin'|'random'|'weighted'|'iphash'} strategy  kind='single' 时恒为 chain
 * @property {Origin[]} origins
 * @property {Failover} failover
 * @property {string}  [createdBy] 由站点联动自动创建时记录来源站点 host，纯展示用
 * @property {number}  updatedAt
 * @property {string}  [version]   数据格式版本，由 schema.validate 自动填充（当前 CONFIG_VERSION）
 */

/**
 * @typedef {Object} Origin
 * @property {string}  id
 * @property {boolean} enabled
 * @property {number}  order              chain 策略排序，升序
 * @property {number}  weight             weighted 策略权重
 * @property {'fetch'|'r2'|'api'} engine  fetch=默认公网回源（CF/EO/ESA 均支持，可自定义 Host 头）；r2 仅 CF 可用，回源到 R2 桶绑定（不走公网）；api=未来扩展（如 cnb/github api 引擎）。socket 不再是可选值。
 * @property {'http'|'https'} scheme
 * @property {string}  addr               域名或 IP（engine='r2' 时可留空）
 * @property {number}  port
 * —— engine='r2' 专用字段 ——
 * @property {string}  [r2Binding]         R2 绑定名（env 上的属性名），如 "CDN_R2"。engine='r2' 时必填
 * @property {string}  [r2KeyPrefix]       R2 内 key 前缀，如 "img/"，最终 key = r2KeyPrefix + 处理后的 pathname
 * @property {'none'|'prefix'|'strip'|'regex'} [r2KeyMode]   pathname → R2 key 的转换方式，默认 'none'
 * @property {string}  [r2KeyPrefixRule]   r2KeyMode='prefix' 时加在前面的前缀；'strip' 时剥除的开头；'regex' 时的 regexFrom
 * @property {string}  [r2KeyRegexTo]      r2KeyMode='regex' 时的 regexTo（替换值）
 * @property {string}  [r2ContentType]     R2 对象缺失 content-type 时的兜底类型，默认 'application/octet-stream'
 * @property {string}  [pathPrefix]       回源路径前缀（向后兼容；建议改由规则 rewrite 托管）
 * @property {Record<string,string>} [extraHeaders]  值支持 "@secret:NAME" 引用（向后兼容；建议改由规则 reqHeaders 托管）
 * @property {{mode:'inherit'|'origin'|'client'|'custom', custom?:string}} [hostHeader]  回源 Host（向后兼容；规则 action.hostHeader 优先）
 * @property {string|null} [sni]
 * @property {Rewrite}  [rewrite]         源站级路径重写（规则级 rewrite 优先，此为基础值）
 * @property {HeaderOps} [reqHeaders]     源站级回源请求头修改（规则级 reqHeaders 优先覆盖）
 * @property {HeaderOps} [respHeaders]    源站级节点响应头修改（规则级 respHeaders 优先覆盖）
 * @property {CachePolicy} [cache]        源站级缓存策略（规则级 cache 优先覆盖）
 * @property {boolean}  [followRedirect]  源站级回源跟随 3xx（规则级 followRedirect 优先）
 * @property {number}   [originTimeoutMs] 源站级回源超时（规则级 originTimeoutMs 优先）
 * @property {ClientIpHeader} [clientIpHeader] 源站级客户端 IP 回源头（规则级 clientIpHeader 优先）
 */

/**
 * @typedef {Object} Failover
 * @property {boolean}  enabled
 * @property {number[]} retryOn           触发换源的状态码，默认 [500,502,503,504,522,524]
 * @property {number}   maxRetries        最多换源次数，默认 2
 * @property {number}   timeoutMs         单次回源超时，默认 10000
 */

// ============================================================================
// 四、模块接口签名 —— 各成员必须实现的函数
// ============================================================================

/**
 * platform/caps.js
 *   export function detectCaps(env): Caps
 *
 * platform/cache.js
 *   export async function cacheMatch(ctx, cacheKey): Promise<Response|null>
 *   export async function cachePut(ctx, cacheKey, response): Promise<void>
 *   export function isCacheable(request, response, policy): boolean
 *
 * platform/kv.js
 *   export function getKV(env): KVLike | null
 *   // KVLike: { get(key, type?), put(key, value, opts?), delete(key), list(opts?) }
 *
 * config/store.js
 *   export async function getGlobal(ctx): Promise<GlobalConfig>
 *   export async function getSite(ctx, host): Promise<Site|null>
 *   export async function getPool(ctx, poolId): Promise<OriginPool|null>
 *   export async function putSite(ctx, site): Promise<void>
 *   export async function deleteSite(ctx, host): Promise<void>
 *   export async function listSites(ctx, {offset,limit}?): Promise<{sites:Site[],total:number,offset:number,truncated:boolean}>
 *   export async function listAllSites(ctx): Promise<{sites:Site[],truncated:boolean}>
 *   export async function putPool(ctx, pool): Promise<void>
 *   export async function deletePool(ctx, poolId): Promise<void>
 *   export async function listPools(ctx): Promise<OriginPool[]>
 *   export function invalidateMemCache(): void
 *
 * proxy/matcher.js
 *   export async function matchSite(ctx): Promise<Site|null>
 *   export function matchRule(site, ctx): Rule|null
 *
 * proxy/headers.js
 *   export function buildOriginHeaders(ctx, origin, ops, env): Headers
 *   export function buildClientHeaders(ctx, originResp, policy, ops): Headers
 *
 * proxy/cachekey.js
 *   export function buildCacheKey(ctx, policy, originUrl): Request
 *
 * proxy/engines/fetchEngine.js
 *   export async function fetchOrigin(ctx, origin, originUrl, headers, timeoutMs): Promise<Response>
 *
 * balancer/strategy.js
 *   export function selectOrigin(pool, ctx, excludeIds): Origin|null
 *
 * balancer/failover.js
 *   export async function requestWithFailover(ctx, pool, rule): Promise<Response>
 *
 * balancer/circuit.js
 *   export async function isTripped(ctx, poolId, originId): Promise<boolean>
 *   export async function recordFailure(ctx, poolId, originId): Promise<void>
 *   export async function recordSuccess(ctx, poolId, originId): Promise<void>
 *
 * security/auth.js
 *   export async function hashPassword(pwd, salt?): Promise<{hash,salt}>
 *   export async function verifyPassword(pwd, hash, salt): Promise<boolean>
 *   export async function signToken(payload, secret, ttl): Promise<string>
 *   export async function verifyToken(token, secret): Promise<Object|null>
 *
 * security/guard.js
 *   export async function checkSecurity(ctx, site): Promise<Response|null>  // null=放行
 *
 * stats/collector.js
 *   export function record(ctx, entry): void
 *   export async function flush(ctx, force?): Promise<void>
 *
 * api/router.js
 *   export async function handleApi(ctx, subPath): Promise<Response>
 */

// ============================================================================
// 五、统一响应工具约定
// ============================================================================

/**
 * API 统一响应格式：
 *   成功  { ok: true,  data: any }
 *   失败  { ok: false, error: { code: string, message: string } }
 *
 * 错误码约定：
 *   UNAUTHORIZED / FORBIDDEN / NOT_FOUND / BAD_REQUEST
 *   CONFLICT / RATE_LIMITED / INTERNAL / STORAGE_UNAVAILABLE
 */

export const ERROR_CODES = Object.freeze({
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
});

/** 默认触发换源的状态码 */
export const DEFAULT_RETRY_ON = Object.freeze([500, 502, 503, 504, 522, 524]);

/** 不应缓存的状态码 */
export const NO_CACHE_STATUS = Object.freeze(new Set([
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414,
  415, 416, 417, 418, 421, 422, 423, 424, 425, 426, 428, 429, 431,
  500, 501, 502, 503, 504, 505, 506, 507, 508, 510, 511,
  520, 521, 522, 523, 524, 525, 526, 527,
]));

/**
 * 状态码「模式」的合法写法（用于校验用户输入与文档提示）。
 *
 * 支持三种写法（见 docs/状态码）：
 *  - 精确码：`404`、`502`
 *  - 百位段通配：`4xx`、`5xx`（即 400-499 / 500-599）
 *  - 十位段通配：`52x`（即 520-529，ESA / Cloudflare 的扩展状态码段）
 * 任一写法都可加 `!` 前缀表示**例外**（从已匹配集合中排除），
 * 例如 `['4xx', '!418']` = 除 418 外的所有 4xx。
 */
export const STATUS_PATTERN_RE = /^!?(?:[1-5]\d{2}|[1-5]xx|[1-5]\dx)$/i;

/**
 * 判断某个状态码是否命中「状态码模式列表」。
 *
 * 单轨化背景：不缓存状态码（原 settings.cache.noCacheStatus）过去只能写死一串精确码，
 * 用户既看不见也无法用「所有 5xx」这类自然表达。现在它是缓存阶段的可视配置，
 * 因此需要支持段通配与例外，同时保持 O(n) 且无正则回溯的低成本判定（每请求都会调用）。
 *
 * 匹配规则：
 *  1. 先看是否命中任一「肯定项」（无 `!` 前缀）；
 *  2. 若命中，再看是否被任一「例外项」（`!` 前缀）排除；
 *  3. 只有「命中肯定项且未被排除」才返回 true。
 *
 * @param {number} status HTTP 状态码
 * @param {ReadonlyArray<string|number>|Set<number>} patterns 模式列表（也兼容纯数字列表 / Set，向后兼容旧数据）
 * @returns {boolean} 是否命中
 */
export function matchStatusPattern(status, patterns) {
  const code = Number(status);
  if (!Number.isFinite(code)) return false;
  // 向后兼容：旧数据可能是 Set<number>（如 NO_CACHE_STATUS 常量）
  if (patterns instanceof Set) return patterns.has(code);
  if (!Array.isArray(patterns) || patterns.length === 0) return false;

  const s = String(code);
  let hit = false;
  let excluded = false;

  for (const raw of patterns) {
    if (raw === null || raw === undefined) continue;
    let p = String(raw).trim().toLowerCase();
    if (!p) continue;
    const negate = p.charCodeAt(0) === 33; /* '!' */
    if (negate) p = p.slice(1);
    if (!p) continue;

    // 逐字符比较：'x' 为通配位，其余位必须完全相同。
    // 定长 3 位比较，避免为每个模式构造正则（每请求热路径）。
    let ok = p.length === 3;
    if (ok) {
      for (let i = 0; i < 3; i++) {
        const pc = p.charCodeAt(i);
        if (pc !== 120 /* 'x' */ && pc !== s.charCodeAt(i)) { ok = false; break; }
      }
    } else {
      // 也容忍纯数字型（如数字 404 被 String() 成 '404'，已在上面处理）
      ok = p === s;
    }
    if (!ok) continue;
    if (negate) excluded = true;
    else hit = true;
  }
  return hit && !excluded;
}

/**
 * 回源请求头白名单 —— 只有这些客户端请求头会被透传到源站。
 * 其余（Cookie、Referer、Origin、CF- 前缀、X-Forwarded- 前缀等）一律丢弃，
 * 使回源请求表现得「像一个全新的浏览器请求」。
 */
export const FORWARD_HEADER_WHITELIST = Object.freeze(new Set([
  'range',
  'if-range',
  'if-none-match',
  'if-modified-since',
  'accept',
  'accept-encoding',
  'accept-language',
  'content-type',
  'content-length',
]));

/** 默认伪装请求头 */
export const DEFAULT_UA_HEADERS = Object.freeze({
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
});

/** 默认删除的响应头 */
export const DEFAULT_STRIP_RESP_HEADERS = Object.freeze([
  'cross-origin-resource-policy',
  'cross-origin-embedder-policy',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'set-cookie',
]);

/** 静态资源扩展名 */
export const STATIC_EXTS = Object.freeze(new Set([
  '7z','avi','avif','apk','bin','bmp','bz2','class','css','csv','doc','docx','dmg',
  'ejs','eot','eps','exe','flac','gif','gz','ico','iso','jar','jpg','jpeg','js',
  'json','m3u8','mid','midi','mkv','mp3','mp4','ogg','otf','pdf','pict','pls','png',
  'ppt','pptx','ps','rar','svg','svgz','swf','tar','tif','tiff','ts','ttf','txt',
  'webm','webp','woff','woff2','xls','xlsx','xml','zip','zst',
]));

export const CONFIG_VERSION = '1.0.0';
