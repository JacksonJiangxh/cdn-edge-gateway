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
 * @property {boolean} hasRawIpFetch      是否支持「fetch 直连裸 IP / 自定义端口」（CF / EO 支持：EO 官方 Fetch 文档未禁止裸 IP；ESA 官方明确不支持，须走平台源站组兜底）
 * @property {boolean} hasSocket          是否支持 cloudflare:sockets（仅 CF，用于裸 IP+HTTPS+自定义 SNI 的内部自动兜底）
 * @property {boolean} hasD1              是否绑定了 D1
 * @property {boolean} hasKV              是否有可用的 KV 持久化（平台 KV 或自部署 Webdis 任一）
 * @property {'native'|'redis'|'none'} kvBackend  实际生效的 KV 后端；两者并存时默认 'redis'（自部署 Webdis 优先）
 * @property {boolean} kvNative           是否探测到平台级 KV 绑定（CF env / EO 全局变量）
 * @property {boolean} kvRedis            是否配置了自部署 Webdis/Redis（REDIS_URL）
 * @property {'auto'|'native'|'redis'} kvBackendPreference  env.KV_BACKEND 归一值（auto=默认 Webdis 优先）
 * @property {boolean} kvBackendOverridden 是否因显式 KV_BACKEND 覆盖了默认决策
 * @property {boolean} hasR2              是否绑定了 R2（仅 CF；用于 engine='r2' 回源到 R2 桶）
 * @property {number}  maxExecutionMs     平台单次请求总执行上限（墙钟）：cf=30000（Workers 默认）、eo=120000、esa=120000（函数单次执行响应时间上限）；EXECUTION_LIMIT_MS 可覆盖
 * @property {number}  [firstByteMs]      网关等待函数返回首个数据的时间上限：esa=10000（超时网关主动断连返回 504），cf/eo 无此约束；FIRST_BYTE_LIMIT_MS 可覆盖
 *
 * maxExecutionMs 用于推导「回源总时间预算」硬顶（failover.budget）：最差总耗时收敛到
 * min(配置, maxExecutionMs - safetyReserve)，避免 (maxRetries+1)×timeoutMs 无预算叠加撞平台上限。
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
 *   cfg:version               配置版本号（分钟级 UTC 时间戳，跨 isolate 广播位）
 *   cfg:global                全局配置 GlobalConfig
 *   cfg:global_rules          全站通用（兜底）规则 { stages: {阶段→默认动作} }
 *   cfg:sites                 站点族合并键 { hosts:[], wildcards:[{pattern,host}], byHost:{host:site} }
 *                             （原 site:{host}×N + site:_index 合并为单键）
 *   cfg:pools                 源站池族合并键 { ids:[], byId:{id:pool} }
 *                             （原 pool:{id}×M + pool:_index 合并为单键）
 *   hc:{poolId}:{originId}    熔断标记（值为失败次数，TTL 60s）
 *   lock:{ip}                 登录失败锁定（TTL 900s）
 *   sync:token                配置同步接收开关：{ code, createdAt, expiresAt }
 *                             （TTL 默认 600s，存在且未过期 = 接收接口开放；
 *                              发送方一次推送成功后立即删除，实现一次性+自动收口）
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
 * @property {'d1'|'none'} statsDriver
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
 * @property {{enabled?:boolean}} [fixContentType] 全站内容类型纠正：上游 Content-Type 缺失/通用/疑似错误时，
 *                                                  按请求 URL 后缀名自动纠正为正确 MIME（零 body 成本）。默认开启，
 *                                                  可在全站规则 stages.fixContentType 置 enabled:false 关闭。
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
 *   |'method'|'header'|'cookie'|'clientIp'|'clientCountry'
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
 * @property {string}  name              头部名，默认由全站缺省 DEFAULT_CLIENT_IP_HEADER.name 声明（'X-EdgeGateway-Client-IP'）
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
 * @property {Array<{type:'prefix'|'exact'|'regex', value:string}>} strip 删除（前缀/精确/正则）
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
 * @property {'chain'|'weighted'|'iphash'} strategy  调度策略：
 *                                                     · chain=严格串行，按 order 升序(1 第一优先)取源，无权重，配合 failover 实现 1→2→3→4 回退
 *                                                     · weighted=平滑加权轮询(SWRR)，按 weight 选，未填 weight 时按 order 派生
 *                                                     · iphash=一致性哈希环，按客户端 IP 绑定源站
 *                                                     注：故障转移(failover)为横切层，对所有策略生效，与 strategy 无关。
 *                                                     kind='single' 时恒为 chain
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
 * @property {number}  order              chain 策略串行顺序(从 1 起，升序)，无权重
 * @property {number}  weight             weighted 策略权重
 * @property {string}  [name]             源站展示名称（纯展示标签，给人区分用；r2/cnb 等 addr 为空时必须填，否则列表显示「未命名源站」）
 * @property {'fetch'|'r2'|'cnb'|'github'} engine  fetch=灵活自定义公网回源（CF/EO/ESA 均支持，可自定义 Host 头）；r2 仅 CF 可用，回源到 R2 桶绑定（不走公网）；cnb=CNB 仓库 raw 预设源站（填仓库参数即自动生成关联规则，底层走 fetch 引擎 + 预设规则）；github=GitHub 仓库 raw 预设源站（同 cnb）。cnb/github 与 fetch 的区别在于「引擎预设」而非「独立回源实现」——回源 host/路径/鉴权均由预设规则承载，运行时走 fetchEngine。socket 不再是可选值。
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
 * —— engine='cnb' / engine='github' 专用字段（仓库型预设源站）——
 * 仓库型源站：回源 host 由预设规则 action.hostHeader.custom 承载，路径映射由预设 rewrite
 * 规则承载，鉴权 token 由平台主密钥（复用 env.JWT_SECRET 派生，AES-256-GCM）加密后落盘
 * （站点级独立、灵活可配），运行时经 __cnb_token__ / __github_token__ 占位符（按源站 id 取
 * 对应解密 token）注入 Authorization 头（见 src/config/repoPresets.js / vars.js / pipeline.js）。
 * @property {string}  [repoUser]    仓库归属（cnb=组织/用户；github=owner）
 * @property {string}  [repoName]    仓库名（不含 .git 后缀；不含组织前缀）
 * @property {string}  [repoBranch]  分支名（默认 'main'）；映射到 raw URL 的 ref 段
 * @property {boolean} [repoPrivate] 是否私有仓库。私有走鉴权分支（注入 Authorization）；
 *                                    公开走匿名分支（可不填 token，直接回源）
 * @property {string}  [cnbTokenEnc]     CNB 访问令牌（加密落盘；明文时降级为 plain: 前缀）
 * @property {string}  [githubTokenEnc]  GitHub 访问令牌（加密落盘；明文时降级为 plain: 前缀）
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
 * @property {ClientIpHeader} [clientIpHeader] 已废弃：源站不再承载流量序列字段，客户端 IP 回源头仅由规则层 clientIpHeader 提供（见 ClientIpHeader 说明）
 */

/**
 * @typedef {Object} Failover
 * @property {boolean}  enabled
 * @property {number[]} retryOn            触发换源的状态码，默认 [500,502,503,504,522,524]
 * @property {number}   maxRetries         最多换源次数；缺省按「源站数 - 1」自动推导（试遍所有 enabled 源站），不写死默认次数
 * @property {number}   timeoutMs          单次回源超时，默认 10000
 * @property {number}   [penaltySeconds]   失败即冷却窗口秒数，默认 15；0=关闭（纯内存，零 KV 读写）
 * @property {number}   [totalTimeoutMs]   整请求总时间预算，默认 0=按平台执行上限自动推导
 * @property {number}   [speculativeMs]    竞速阈值，默认 500；0=关闭竞速（仅 GET/HEAD 及已物化 body 请求启用）
 * @property {number}   [maxRetryBodyBytes] 重试时物化请求体的上限字节，默认 5242880
 *
 * 失败即冷却（penaltySeconds）：一次失败立即把源站放入本 isolate 内存冷却名单 ~15s，
 * 与「60s 内累计 3 次才熔断」并存互补。纯内存、不写 KV——短窗口启发式，KV 最终
 * 一致传播（1-5s）会吃掉大部分收益，且新 isolate 多打一次坏源站由 failover + 竞速兜速度、
 * fail-open 兜可用性，代价可接受。
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
 *   export function recordFailure(ctx, poolId, originId): void
 *   export function recordSuccess(ctx, poolId, originId): void
 *   export function noteSuccess(poolId, originId): void
 *   export function penalize(poolId, originId, seconds): void
 *   export function isPenalized(ctx, poolId, originId): boolean
 *   export function penaltyRemaining(poolId, originId): number
 *   export function lastOkTs(poolId, originId): number
 *   export function softRecoverCoeff(poolId, originId): number
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

/**
 * 源站池「换源错误码范围」特标：表示所有错误响应都换源（status>=400 即 4xx/5xx，
 * 含 522/524 等源站/网关类错误）。200/3xx 正常响应（成功或重定向跟随）不算失败、不换源。
 *
 * 这是全站默认、单源站兜底、源站池缺省三处统一引用的唯一常量，避免散写字面量造成不一致。
 * 运行时（balancer/failover.js）识别该特标后按 isErrorStatus(code) 判定。
 */
export const ERROR_STATUS_RANGE = '4xx5xx';

/** 判定某 HTTP 状态码是否为「错误响应」（应参与换源 / 不应缓存等错误码语义）。4xx/5xx 为错误，2xx/3xx 为正常。 */
export function isErrorStatus(code) {
  const n = Number(code);
  return Number.isFinite(n) && n >= 400 && n < 600;
}

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
  // 向后兼容：patterns 也可直接传 Set<number>（无需经模式解析）
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

/** 静态资源扩展名 */
export const STATIC_EXTS = Object.freeze(new Set([
  '7z','avi','avif','apk','bin','bmp','bz2','class','css','csv','doc','docx','dmg',
  'ejs','eot','eps','exe','flac','gif','gz','ico','iso','jar','jpg','jpeg','js',
  'json','m3u8','mid','midi','mkv','mp3','mp4','ogg','otf','pdf','pict','pls','png',
  'ppt','pptx','ps','rar','svg','svgz','swf','tar','tif','tiff','ts','ttf','txt',
  'webm','webp','woff','woff2','xls','xlsx','xml','zip','zst',
]));

export const CONFIG_VERSION = '1.0.0';
