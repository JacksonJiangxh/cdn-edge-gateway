# 12 · 请求处理流程

> **流量序列（Traffic Sequence）：从请求进入 → 响应返回浏览器**
>
> 上一篇：[11 系统架构](./11-architecture.md)
>
> 返回 [项目首页](../README.md)

> 单一事实来源：本图把「单回源源站」与「多源站源站组」两种场景**合并为一条流水线**，
> 仅在「选源站 / 回源循环」两个环节用【单源站】【源站组】分支标注差异。
> 全图共 18 个阶段，阶段之间相互独立（AND）；每个规则型阶段内部是 OR（按 priority 降序从上到下匹配，命中即跳出本阶段进入下游）。
> 站点序列某阶段无任何设置时，自动回落「全站通用规则」作为实际生效。
>
> 代码依据：`src/proxy/pipeline.js` `src/api/router.js` `src/proxy/matcher.js`
> `src/security/guard.js` `src/balancer/failover.js` `src/balancer/strategy.js`
> `src/proxy/rewrite.js` `src/proxy/headers.js` `src/proxy/cachekey.js` `src/platform/cache.js`

```
[浏览器请求]  Host: img.example.com  Path: /xxx
   │
   ▼
① 匹配站点 matchSite(ctx)
   ├─ host 为空/异常/不存在/enabled===false ─► 伪装页(200伪) 返回浏览器
   └─ 命中 ─► ctx.debug.siteId=host，继续
   ▼
② 安全校验 checkSecurity(ctx, site)        【fail-closed：自身异常也按 403 拦截，绝不放行】
   │   按 Cloudflare 流量序列风格拆成 5 个独立最小任务包（基于 guard.js 真实实现）：
   │     IP规则 / WAF(自定义规则) / 自动程序 / Access(令牌鉴权) / 速率限制
   │   顺序即代码执行顺序；任一命中即拦截(统一 403，不透露命中哪条)，继续则进入下一包。
   │
   ├─ ②.1 IP 访问规则 (IP Rules)   〔对应 CF: IP Access Rules〕
   │     ├─ IP 白名单(sec.ipWhitelist) 非空 且 客户端IP∉白名单 → 403 (block:'ip-whitelist')
   │     │     支持 精确 / CIDR(/8~/24) / 前缀通配(*)
   │     └─ IP 黑名单(sec.ipBlacklist) 命中(精确/CIDR/通配) → 403 (block:'ip-blacklist')
   │
   ├─ ②.2 WAF · 自定义规则 (Web Application Firewall)   〔对应 CF: WAF / 自定义规则〕
   │     ├─ UA 黑名单(sec.uaBlacklist) 命中 → 403 (block:'ua-blacklist')
   │     │     支持 大小写不敏感子串 或 /regex/ 正则 匹配 User-Agent
   │     └─ Referer 防盗链(sec.refererMode whitelist/blacklist) 命中 → 403 (block:'referer')
   │           白名单模式: 列表非空且 Host 不在列 → 拦截
   │           黑名单模式: Host 命中列表 → 拦截
   │           空 Referer: allowEmptyReferer===false 才拦截(默认放行直连)
   │           ★ 域名匹配支持 精确 / *.子域通配 / 全通配* / 规则内写完整URL自动取host
   │
   ├─ ②.3 自动程序 (Bot Management)   〔对应 CF: Bots / Bot Fight Mode〕
   │     ★ 已独立成包：使用 security.botManagement 独立字段（enabeld/mode/list），
   │       与 ②.2 的 UA 黑名单完全解耦，互不越界。
   │     ★ mode='blacklist' 命中 list 即拦截；mode='allowlist' 仅放行命中特征，
   │       其余视为 Bot 拦截。后端 checkSecurity 在 ②.3 位置独立判定(block:'bot-management')。
   │     ★ 若需更细可按 CF 风格新增指纹/机器学习评分子维度，仍挂在本包内。
   │
   ├─ ②.4 Access · 令牌鉴权 (Token Authentication)   〔对应 CF: Access / Signed Exchanges〕
   │     签名 URL(sec.signedUrl.enabled) 校验失败 → 403 (block:'signed-url')  ⚠️ 实验特性（待开发：仅校验，内置签发工具未提供）
   │       - 缺参 / expire 非法 / 密钥空 → 拦截
   │       - now > expire(过期) → 拦截
   │       - 超过最大有效期 ttl → 拦截
   │       - HMAC-SHA256 签名不匹配(恒定时间比较) → 拦截
   │       ★ 签名原文绑定 host+path+expire，防跨站重放
   │
   └─ ②.5 速率限制 (Rate Limiting)   〔对应 CF: Rate Limiting〕
         限流(sec.rateLimit.enabled) 开启 且 超限(rpm) → 429 + Retry-After (block:'ratelimit')
         └─ 以上 5 包全部通过 ─► 继续 ③
   ▼
③ 首要分流：由负载均衡**实际选出**一个具体的「本次回源对象」（不是虚拟占位）
   │   ★ 单源站 → 就是该源站本身；源站池 → 按 chain/roundrobin/随机/加权/IP哈希 实际选出的某一个 oX。
   │   ★ 这个具体对象成为后续 ⑤~⑱ 规则的「回源目标」匹配维度（target=origin / originAddr），
   │     在一条线上即可用它做多分支：如「路径=/img/ 且 回源目标=o1 → action」「… 回源目标=o2 → action」，
   │     ⑦~⑱ 全部共用一条线，⑩ 确定实际源站 / ⑭ 回源循环 是真实只读的实际生效结果。
   │
   │   「本次回源对象」(initialOrigin) ≠ 「最终回源动作对象」(effectiveOrigin，在 ⑭ 才成形)：
   │     - initialOrigin：本步③按负载均衡实际选出，作为规则引擎的 origin 匹配维度（oriX AND 规则）。
   │     - effectiveOrigin：⑭ 回源循环里真正 fetch 的目标，会再经「回源改写」加工
   │       （规则 action 的 rewrite/hostHeader/inlineOrigins/poolId 改写 + 故障转移换源），
   │       可能与 initialOrigin 落到不同的真实服务上。
   │
   ├─ 取站点默认上游 buildSitePool(site)：
   │     ├─ site.poolId → getPool(poolId) 取源站实体
   │     │     （kind=single 的单一源站 与 kind=pool 的源站池 走同一条路径）
   │     都为空 → 500 返回浏览器
   │
   ├─ 按负载均衡/选择逻辑选出一个对象 selectOrigin(pool, ctx, [])：
   │     【单源站】候选仅1个 → 直接返回该源站(o1)
   │     【源站组】chain/roundrobin/random/weighted/iphash 选出本次要回源的 oX
   │     无可用源站 → 502 返回浏览器
   │
   └─ 写入 ctx.origin = 选中的「初始回源对象」(单源站=o1 / 源站组=oX之一)
         ★ 该对象仅作为后续规则引擎的 origin 匹配维度 —— 等于首要规则条件
           oriX AND 规则引擎 的分支即由此产生（一次请求只落在一个 initialOrigin 上；
           源站组下不同请求因负载均衡落到不同 oX，各自走各自的分支）
   ▼
④ 匹配规则 matchRule(site, ctx)   【此时 ctx.origin 已就绪，可匹配 origin / originAddr】
   │
   ├─ ④.1 站点自身规则匹配
   │     rules=site.rules 过滤 enabled!==false → priority 降序排序
   │     逐条 isRuleMatched(rule, subject):
   │        a. buildMatchSubject(ctx) 提取特征(含 origin=ctx.origin.id, originAddr=ctx.origin.addr)
   │        b. m.conditions 二维条件(外OR内AND)：groups空→命中；
   │           否则 groups.some(group.every(evalCondition))
   │             evalCondition: target 支持 origin/originAddr(header/cookie/query/path/host/ext...)
   │        命中即停 → ctx.debug.ruleId=rule.id, rule=该规则
   │
   ├─ ④.2 全站通用规则兜底（阶段→默认动作映射，无条件、每阶段 1 条）
   │     读取 getGlobalRules → 新阶段映射 { rewrite, redirect, terminate, reqHeaders, origin, cache, respHeaders }
   │     每个阶段的值即「该阶段默认动作」。合并规则：站点 action 优先，全站仅补全站点缺失的字段——
   │        effAction = deepClone(siteRule.action)
   │        for stage in STAGE_ORDER:
   │           for field in globalStages[stage]:
   │              if effAction[field] === undefined: effAction[field] = globalStages[stage][field]
   │     - 站点命中规则 → ruleSource='site'，但未被站点覆盖的阶段仍会被全站默认值补全
   │     - 站点未命中 → 全部阶段取全站默认（ruleSource='global'）
   │     注：全站兜底**不再跑 matchRule**（原模型对全站 Rule[] 再做一次条件匹配），改为 O(7) 阶段索引补全，
   │         零匹配开销；KV 空时写入内置保守默认值（见 defaults.DEFAULT_GLOBAL_RULES）落盘，用户可改。
   │
   │   ④.3 ~ ④.7 是「规则匹配结果」按 action 类别细分的最小任务包（对标 Cloudflare 流量序列）
   │       每个类别独立成节点，按代码真实生效顺序串接；未命中的 action 字段直接跳过。
   │       终止型动作（不回源）在 ④.3 集中判定，命中即返回；其余改写类在后续步骤就地生效。
   │
   ├─ ④.3 终止型动作（命中后、回源前）applyTerminalActions(ctx, rule)
   │     ├─ 强制 HTTPS (action.forceHttps) 且 当前 http: → 301/forceHttpsStatus 跳 https
   │     │     └─ 命中 → 返回跳 https 响应给浏览器（流程结束）  〔对应 CF: 配置规则/SSL〕
   │     ├─ 直接响应 (action.directResponse.enabled) → 用 body/status/contentType 构造响应
   │     │     └─ 命中 → 返回自定义响应给浏览器（结束）  〔对应 CF: 直接响应〕
   │     ├─ 访问 URL 重定向 (action.redirect.enabled) → buildRedirectTarget
   │     │     └─ 命中 → 返回 302/自定义 Location 给浏览器（结束）  〔对应 CF: 重定向规则/批量重定向〕
   │     └─ 以上皆无 → 继续回源流程
   │
   ├─ ④.4 修改请求头 (action.reqHeaders)   〔对应 CF: 修改请求头 / Transform Rules〕
   │     规则级请求头改写，在回源请求上增/删/改 HTTP 头
   │     （与源站级 extraHeaders 合并：源站打底、规则覆盖；逐个源站生效见 ⑧.1）
   │
   ├─ ④.5 回源改写 · 路径 (action.rewrite)   〔对应 CF: Origin Rules / 重写 URL〕
   │     支持 none/prefix/strip/regex 四种模式改写客户端路径（不含 origin.pathPrefix）
   │     → 仅记录配置，真实应用到 ⑧.2 buildOriginUrl（拼 pathPrefix 后）
   │
   ├─ ④.6 回源改写 · Host (action.hostHeader)   〔对应 CF: Origin Rules 改目标源服务器〕
   │     effectiveHostHeader = resolveHostHeader(规则级hostHeader, 站点defaultHostHeader)
   │       - custom → 用 custom（可 host:port）
   │       - client → 用客户端 Host
   │       - inherit/origin → 回退 站点 defaultHostHeader / 源站 addr
   │     → 仅记录，真实应用到 ⑧.2 回源 URL 的 authority
   │       ★【源站组】各源站自己的 Host 在 ⑧循环内按
   │         resolveHostHeader(规则级, oX.hostHeader, effectiveHostHeader) 独立再算
   │
   └─ ④.7 回源改写 · 候选源站 (action.poolId / action.inlineOrigins)   〔对应 CF: 改目标源服务器〕
         ★ 改的是「候选源站池」，不是最终动作对象本身；真实目标在 ⑧ 才成形。
         ra = rule?.action || {}
         ├─ ra.inlineOrigins 非空 → 重建临时池并重新 selectOrigin，更新 ctx.origin
         ├─ ra.poolId 存在        → 取对应源站(single/pool 皆可)重新选，更新 ctx.origin
         └─ 均未指定              → 沿用③选出的 ctx.origin（绝大多数场景）
         ├─ ra.poolId 存在       → 标记 规则指定源站
         └─ 均无                 → 标记 用站点级 poolId

   ④.8 响应与缓存类 action（命中后、回源后生效，先在此登记，供 ⑨/⑩/⑪ 使用）
   ├─ 修改响应头 (action.respHeaders)            〔对应 CF: 修改响应头 / Cache Response Rules〕
   │     规则级响应头改写，回源响应上增/删/改 HTTP 头（与源站级 respHeaders 合并）
   ├─ 缓存策略 (action.cache / edgeTtl)          〔对应 CF: Cache Rules〕
   │     policy = DEFAULT_POLICY < 源站.cache < 规则 action.cache（enabled/edgeTtl/SWR/browserTtl）
   │     → 供 ⑥ 缓存键开关 与 ⑪ 写缓存 使用
   └─ 其它源站级覆盖 (action.clientIpHeader / followRedirect / originTimeoutMs)
         作为回源连接参数，供 ⑧.1 合并使用
   ▼
⑤ 确定实际源站池（沿用③首要分流结果，或④.7规则覆盖结果）
   ├─ 规则 action 未指定 pool/inlineOrigins → 沿用③选出的 pool + ctx.origin
   ├─ 规则指定 → 已在④.7 重建池并重新 selectOrigin，pool + ctx.origin 已更新
   └─ 得到 pool，primaryOrigin = ctx.origin（仍是「初始对象」，非最终动作对象）
   ▼
⑥ 缓存键 & 缓存开关
   │
   ├─ ⑥.1 选择 primaryOrigin = selectOrigin(pool)
   │     【单源站】候选=1 → 直接短路返回(o1)
   │     【源站组】按策略选第1个(本次实际oX): chain:order最小 / roundrobin:取模 / random / weighted / iphash
   │
   ├─ ⑥.2 合并 policy = DEFAULT_POLICY < primaryOrigin.cache < 规则级action.cache
   │
   ├─ ⑥.3 绕过判断 shouldBypassCache(ctx, policy)
   │     policy未enabled/mode=noCache / 非GET&HEAD / 带Range / 带Authorization → BYPASS, cacheKey=null
   │
   └─ ⑥.4 构造缓存键 buildCacheKey(ctx, policy, originUrl, {cacheGen})
         (仅 !bypass 且 caps.hasEdgeCache; originUrl 用 primaryOrigin 经⑧.2逻辑算出)
         keyUrl 拷贝 → ignoreQuery/白名单排序 → __h(客户端host) → policy.key(__s/__hd/__ck/ignoreCase)
         → __gen(代次) → new Request(keyUrl,{method:'GET'})
   ▼
⑦ 查边缘缓存 cacheMatch(ctx, cacheKey)
   ├─ cacheKey空/平台无Cache API句柄 → DISABLED/MISS → 继续
   └─ hit = cache.match(cacheKey)
         ├─ HIT → actualOrigin=命中记录originId对应源站
         │     mergedResp = actualOrigin.respHeaders < 规则级respHeaders
         │     headers = buildClientHeaders(ctx, hit, policy, mergedResp)  ← 见⑨
         │     ─► 返回 HIT 响应给浏览器（结束，不回源）
         └─ MISS → ctx.debug.cache='MISS'，继续
   ▼
⑧ 回源 requestWithFailover(ctx, pool, rule, effectiveHostHeader)
   │
   │   ★★★ 本步才是「回源改写」发生的位置，产出最终回源动作对象(effectiveOrigin) ★★★
   │     规则 action 的 rewrite / hostHeader 在这里对每个源站生效；
   │     因此 effectiveOrigin.addr/port/host/path 可能与③的 initialOrigin 不同，
   │     【源站组】且故障转移会换到 oY（另一真实服务）。
   │
   ├─ 预计算 excludeIds = 已熔断器站
   │     【单源站】若o1熔断则排除,无下一个可换 → 放弃过滤(宁打可能坏的源站)
   │     【源站组】o1/o2/o3 中熔断者并入；3个全熔断 → 放弃过滤
   │
   ├─ totalAttempts = maxRetries + 1   (maxRetries: failover.enabled? 配置值(默认2) : 0)
   │
   └─ 循环 attempt = 0 .. totalAttempts-1：
         origin = selectOrigin(pool, excludeIds)   ← 排除已试过的
         ├─ 返回 null(无可用源站) → break
         └─ 选中 oX(【单源站】恒为o1)：
               excludeIds.push(oX.id)              ← 试过即排除, 【源站组】下轮换换源
               ctx.debug.tried.push(oX.id); ctx.debug.originId=oX.id
               │
              ├─ ⑧.1 合并本源站配置(源站级打底, 规则级覆盖) → 形成「回源改写」输入
              │     rewrite     = mergeRewrite(oX, rule)  ← 规则 rewrite 改写路径
              │     reqHeaders  = oX.extraHeaders < 规则reqHeaders
              │     clientIpHeader = 取自 源站/规则
              │     timeout     = 规则originTimeoutMs > oX.originTimeoutMs > 池timeoutMs > 10000
              │     followRedirect = 规则指定 ? : oX.followRedirect
              │     ★ 回源连接参数(⑨ Origin Rules)：engine/scheme/port 由规则 action 覆盖源站物理属性
              │         effEngine = ra.engine || oX.engine || 'fetch'
              │         effScheme = ra.scheme || oX.scheme || 'https'
              │         effPort   = ra.port>0 ? ra.port : oX.port || (effScheme==='http'?80:443)
              │         （用临时副本，绝不污染池内原始 oX，以免影响熔断统计/后续请求）
              │     oXHost      = resolveHostHeader(规则级, oX.hostHeader, effectiveHostHeader)  ← 回源改写·host
              │                    ★★【源站组】每个源站算自己的Host (同池3源站各自不同)
              │
              ├─ ⑧.2 构造回源 URL buildOriginUrl(ctx, oX, rule, oXHost)  ← 回源改写·path/addr/port/host
              │     rewritten = applyRewrite(pathname, rule.action.rewrite)  ← 规则 rewrite 改写路径
              │     fullPath  = oX.pathPrefix ? joinPath(oX.pathPrefix, rewritten) : rewritten
              │     scheme/addr/port = effScheme/oX.addr/effPort  ← 已并入⑧.1的⑨连接参数覆盖
              │     authority = oXHost.mode==='custom' ? custom(支持host:port)  ← 可能被规则改写为别的域名
              │               : 'client' ? ctx.url.hostname : oX.addr
               │     ★ originUrl 即为「最终回源动作对象」(effectiveOrigin) 的真实目标
               │     originUrl.pathname=fullPath, search=ctx.url.search
               │
               ├─ ⑧.3 构造回源请求头 buildOriginHeaders(ctx, oX, 规则reqHeaders, env, clientIpHeader)
               │     叠加: 1)白名单透传 2)DEFAULT_UA_HEADERS 3)oX.extraHeaders(@secret)
               │           4)规则reqHeaders 5)stripForbidden 6)clientIpHeader
               │
               ├─ ⑧.4 选择引擎并发起 dispatch(oX)
               │     ├─ r2 引擎 (engine=r2)：CF 上回源到 R2 桶绑定，不走公网。
               │     ├─ api 引擎 (engine=api)：未来扩展，第三方 API 请求（cnb/github 等），未实现。
               │     └─ fetch 引擎 (默认，三平台均支持)：
               │           当解析出的自定义 Host 与 originUrl.hostname 不一致时，
               │           在请求头显式注入 Host（CF/EO/ESA 的 fetch 均支持自定义 Host 头，
               │           实现「域名/裸IP 源站 + 自定义 Host」）。
               │           CF 上「裸 IP + HTTPS + 自定义 SNI」由 fetchEngine 内部自动走
               │           cloudflare:sockets 兜底（socket 不再是可选 engine）。
               │           裸 IP + 自定义 Host + SNI 在 EO/ESA 上由平台级「源站组回源 Host
               │           重写」兜底（见 07 文档）。
               │     recordStart(ctx, oX)
               │
               └─ ⑧.5 处理响应/异常
                     ├─ fetch 抛异常(网络/超时/TLS):
                     │     recordFailure(pool,oX)
                     │     ├─ failover关闭 → break
                     │     └─ failover开启 → lastError=err, continue
                     │           【单源站】无下一个 → 退出循环
                     │           【源站组】 → 换下一个 oY
                     └─ 拿到 resp:
                           ├─ status ∈ retryOn 且 failover开:
                           │     recordFailure(pool,oX) → resp.body.cancel() → continue
                           │           【单源站】无下一个 → 退出
                           │           【源站组】 → 换 oY
                           └─ 正常: recordSuccess(pool,oX) → return resp (命中即返回,不试其余)
   │
   循环结束: lastResponse(不理想状态码)? 原样返回 : 全异常? 502 "all origins failed" 返回浏览器
   ▼
⑨ 先 clone 原始响应
   ★ 注意：cacheKey 已在⑥用「初始回源对象」算出并固定，不随⑧回源改写/failover 换源变化；
     若规则 rewrite/hostHeader 把真实回源目标改到别的源站(oY)，缓存仍按⑥的键命中
     （命中后响应头在⑩按实际成功源站重算）。
   willCache = cacheKey 且 isCacheable(ctx.request, originResp, policy) ?
              → toCache=originResp.clone() : toCache=null
   ▼
⑩ 改写响应头 buildClientHeaders(ctx, originResp, policy, 规则respHeaders)
   currentOrigin = pool.origins.find(o => o.id === ctx.debug.originId)  ← 实际成功那个(单源站=o1 / 源站组=oX)
   缓存TTL按 currentOrigin: 规则级未配则回落 currentOrigin.cache(enabled/edgeTtl/browserTtl)
     [即 ⑥.2 的 policy 在这里用 currentOrigin 重算一遍等效值]
   mergedResp = currentOrigin.respHeaders < 规则级respHeaders
   顺序:
   1) 删除源站安全策略头 DEFAULT_STRIP_RESP_HEADERS
   2) 缓存控制头(同上: statusTtl / NO_CACHE_STATUS / enabled&mode!=='origin')
   3) 规则级 respHeaders.applyHeaderOps
   4) 调试头(含 X-Origin-Id=实际成功源站)
   5) 品牌头 Server/Via
   clientResp = new Response(originResp.body, {status, headers})
   ▼
⑪ 异步写缓存（不阻塞响应）
   willCache && toCache → ctx.waitUntil(cachePut(ctx, cacheKey, toCache))
   ▼
⑫ 记录统计(originId=实际成功源站) → 返回 clientResp 给浏览器
```

---

## 流量序列步骤 ↔ 前端抽屉（18 阶段映射）

> 顺序固定不可更改，共 18 阶段；阶段之间相互独立（AND），规则型阶段内部按 priority 降序 OR 匹配（命中即跳出本阶段）。
> 站点序列某阶段无设置时，回落「全站通用规则」(getGlobalRules) 同阶段兜底。
> 前端已实现 basics / security / rules 三个独立片段抽屉 + 规则内 action 操作卡片，
> 本表即「前端切片段」的权威依据。

| 阶段 | 前端卡片 | 可编辑抽屉 / 兜底 | 后端片段 API | 管理字段 |
|---|---|---|---|---|
| ① 匹配站点 | seqStage ① | 站点基础抽屉 | `PUT /sites/:host/basics` | host / enabled / ipv6Support |
| ②.1 IP 访问规则 | seqStage ②.1 | 安全防护抽屉 · IP 访问控制 | `PUT /sites/:host/security` | ipWhitelist / ipBlacklist |
| ②.2 WAF · UA/Referer | seqStage ②.2 | 安全防护抽屉 · UA/防盗链 | `PUT /sites/:host/security` | uaBlacklist / refererMode / refererList |
| ②.3 自动程序 | seqStage ②.3 | 安全防护抽屉 · 自动程序 | `PUT /sites/:host/security` | botManagement |
| ②.4 Access · 令牌鉴权 | seqStage ②.4 | 安全防护抽屉 · 签名 URL ⚠️实验特性（签发工具待开发） | `PUT /sites/:host/security` | signedUrl |
| ②.5 速率限制 | seqStage ②.5 | 安全防护抽屉 · 请求限速 | `PUT /sites/:host/security` | rateLimit |
| ③ 首要分流 | seqStage ③ | 初始回源对象抽屉 · 源站方式 | `PUT /sites/:host/basics` | poolId |
| ④ URL 规范化 | seqStage ④（只读占位） | 暂未实现，跳过 | — | — |
| ⑤ URL 重写 | seqStage ⑤ + 规则列表 | 受限规则抽屉 · URL 重写 | `PUT /sites/:host/rules` | action.rewrite |
| ⑥ 重定向规则 | seqStage ⑥ + 规则列表 | 受限规则抽屉 · 重定向 | `PUT /sites/:host/rules` | action.redirect |
| ⑦ 强制 HTTPS / 直接响应 | seqStage ⑦ + 规则列表 | 受限规则抽屉 · 终止型 | `PUT /sites/:host/rules` | action.forceHttps / directResponse |
| ⑧ 修改请求头 | seqStage ⑧ + 规则列表 | 受限规则抽屉 · 回源请求头 | `PUT /sites/:host/rules` | action.reqHeaders |
| ⑨ Origin Rules | seqStage ⑨ + 规则列表 | 受限规则抽屉 · Origin Rules | `PUT /sites/:host/rules`（+`PUT /pools/:id`） | action.hostHeader / action.engine / action.scheme / action.port / poolId / inlineOrigins |
| ⑩ 确定实际源站 | seqStage ⑩（推导只读） | — | — | — |
| ⑪ Cache Rules | seqStage ⑪ + 规则列表 | 受限规则抽屉 · Cache Rules | `PUT /sites/:host/rules` | action.cache |
| ⑫ 缓存键 | seqStage ⑫ | 站点基础抽屉（cacheGen） | `PUT /sites/:host/basics` | cacheGen |
| ⑬ 查缓存 | seqStage ⑬（运行时只读） | — | — | — |
| ⑭ 回源循环 | seqStage ⑭ + 子步骤 | 源站池抽屉（地址/策略/故障转移） | `PUT /pools/:id` | origins[] / strategy / failover |
| ⑮ clone | seqStage ⑮（运行时只读） | — | — | — |
| ⑯ 改写响应头 / Response Cache Rule | seqStage ⑯ + 规则列表 | 受限规则抽屉 · 改写响应头 | `PUT /sites/:host/rules` | action.respHeaders |
| ⑰ 写缓存 | seqStage ⑰（运行时只读） | — | — | — |
| ⑱ 返回用户 | seqStage ⑱（固定行为） | — | — | — |

> 全站通用规则（兜底）视图：在「站点选择」里选「全站通用规则（兜底默认）」，同样按 18 阶段展示全局规则，编辑入口为「全站通用规则编辑器」。
