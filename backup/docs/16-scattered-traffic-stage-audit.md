# 流量序列阶段操作 — 散落逻辑全量盘点（二次复核版）

> 目的：把**写死在 `src/` 代码里、但本质属于流量序列某一阶段操作**的隐藏逻辑全部盘点出来，
> 供逐条审查与判断（哪些该下沉到「全站规则 stages」、哪些已下沉只是代码冗余、哪些应保留为引擎铁律）。
>
> 本文为**只读审计**（Plan 阶段产物），不修改任何源码、零回归风险。
>
> **版本说明**：初版（2026-08-16）只盘点了 `src/` 代码，**未去规则侧查证是否已下沉**，导致多条误判。
> 用户指出 R2（set-cookie 已在规则 strip，代码为冗余）后，已对全清单约 30 项做**双向交叉核查**
> （代码侧 + 规则侧：`stages-defaults.js` / `templates.js` / `repoEngine.js` / `defaults.js` / `site.js` /
> `schema.js` / `global.js` / `guard.js` 等）。本版为复核修正结果。

---

## 阅读约定（四分类，替代初版 A/B/C）

每条定性的**唯一判定顺序**：先 `grep` 规则侧确认是否已覆盖，再决定归类——这正是初版漏掉的步骤。

- **① 已下沉 + 代码冗余**：规则侧已显式覆盖，代码是重复执行/兜底常量/字面量注入器。**不是待迁移项，是待清理项**（删冗余代码，或保留 `??` 仅作极端兜底）。
- **② 已下沉 + 规则未覆盖全**：规则覆盖了主体，但代码独有残留部分（如个别头名、死常量）。待补缺/去重，非整段待迁移。
- **③ 代码独有、规则确实缺失**：才是真正的"待迁移 / 待下沉"项（或按设计本就不应入规则层，如 failover）。
- **④ 引擎铁律**：平台相关、安全相关、防注入/内存上限类，保留写死。

> **⚠️ 初版误判项（本版已改）**：R1、R4、Q1、E1、C4、E4 初版判为"待迁移(A/B)"，实际均为**① 已下沉+代码冗余**；Q3 初版判"双份并存"，实际 `DEFAULT_UA_HEADERS` 已是**死常量**。

字段说明：`现象 | 锚点 | 归属阶段 | 复核定性 | 初版判定`

---

## 1. `respHeaders`（修改响应头阶段）

| # | 现象 | 锚点 | 归属阶段 | 复核定性 | 初版 |
|---|------|------|----------|----------|------|
| R1 | 调试响应头 `X-Origin-Id / X-Cache / X-Rule-Id / X-Retry-Count / X-Edge-Time` 注入，头名来自 `DEBUG_HEADER_NAMES` 常量 | `src/proxy/headers.js:237-255` + `src/config/global.js:31-37` | respHeaders | **① 已下沉+代码冗余**：头名常量 `DEBUG_HEADER_NAMES`（global.js:31-37）已是规则真相源；`stages-defaults.js:344-346` 注释明示"默认下发、规则可关（在 strip 加头名即可）"。代码仅按常量注入，非待迁移。 | ❌ A 类（误判规则侧缺失） |
| R2 | 不缓存信号强制剥离：`set-cookie / pragma / no-store / private` + `expires:0` | `src/proxy/headers.js:181-184` | respHeaders | **② 已下沉+规则未覆盖全**：`set-cookie` 已在 `stages-defaults.js:365` `type:'exact'` 显式 strip（注释"删除统一走 strip，与 headers.js 行为一致"），代码 strip 冗余；`pragma / no-store / private / expires:0` 在响应头下发路径**规则侧无对应 strip**，属代码残留（其中 `expires:0` 与缓存正确性相关、宜保留引擎兜底）。 | ⚠️ B 类（部分正确，细分后应为②） |
| R3 | 边缘缓存头拼接：`CDN-Cache-Control / Cloudflare-CDN-Cache-Control / immutable` 结构 | `src/proxy/headers.js:186-232` | respHeaders（与 cache 强相关） | **③ 代码独有、规则缺失**：缓存头是分层铁律的动态拼接，规则侧只给参数（`cache.enabled/mode/edgeTtl/browserTtl/swr/statusTtl`，stages-defaults.js:300-329），拼接本身必须在代码。属"规则生成参数、引擎保留构造"。 | ✅ B 类（实质同③） |
| R4 | 错误响应调试头 `X-Site-Id / X-Tried-Origins / X-Edge-Time` 注入 | `src/proxy/pipeline.js:618-645` | respHeaders（错误分支） | **① 已下沉+代码冗余**：`X-Tried-Origins / X-Edge-Time` 同源 `DEBUG_HEADER_NAMES` 机制；`X-Site-Id` 为硬编码字面量，但整体调试头体系已下沉。注：`X-Request-Id` 无独立写入，仅作 `${request_id}` 变量。 | ❌ A 类（误判规则侧缺失） |

---

## 2. `reqHeaders`（修改请求头阶段）

| # | 现象 | 锚点 | 归属阶段 | 复核定性 | 初版 |
|---|------|------|----------|----------|------|
| Q1 | `Accept-Encoding` 兜底：`gzip, deflate, br` | `src/proxy/headers.js:88-90` | reqHeaders | **① 已下沉+代码冗余**：`stages-defaults.js:227` `reqHeaders.set['Accept-Encoding']:'gzip, deflate, br'` 已作为全站兜底回源请求头；headers.js:83-85 注释声明"已由合并块并入，不再从常量二次注入"。代码 `if (!out.has(...))` 仅作客户端极端缺失时的兜底。 | ❌ A 类（误判规则侧缺失；还错称"已含伪装 UA 双份"——伪装 UA 与 Accept-Encoding 是两回事） |
| Q2 | 透传白名单 `FORWARD_HEADER_WHITELIST` | `src/contracts.js:585-595` | reqHeaders | **④ 引擎铁律（白名单常量）+ 规则消费点已存在**：常量定义于 contracts，`stages-defaults.js:236` `reqHeaders.forwardWhitelist` 已默认填充，headers.js:70-71 消费。 | ✅ B 类（实质同④） |
| Q3 | 伪装 UA 头 `DEFAULT_UA_HEADERS` | `src/contracts.js:598-604` | reqHeaders | **② 已下沉 + 实为死常量**：`stages-defaults.js:222-223` `reqHeaders.set['User-Agent']` 已含同值；经核查 `DEFAULT_UA_HEADERS` **已无引用方**（headers.js 第 2 步兜底注入已被注释移除）。非"双份并存"，而是**废弃死代码**，应删除。 | ⚠️ 一致性风险"双份并存"（定性需改：实为死常量） |
| Q4 | `mergeClientIpHeader` 默认名 `'X-Forwarded-For'` | `src/balancer/failover.js:500-505` | reqHeaders（origin 侧） | **④ 引擎铁律（代码内兜底名）**：规则侧 `DEFAULT_CLIENT_IP_HEADER`（stages-defaults.js:173-177）`name:'X-EdgeGateway-Client-IP'` 才是真正默认；代码 `?? 'X-Forwarded-For'` 仅当规则/源站都缺失时兜底。 | ✅ B 类（实质同④） |

---

## 3. `error`（错误响应阶段）

| # | 现象 | 锚点 | 归属阶段 | 复核定性 | 初版 |
|---|------|------|----------|----------|------|
| E1 | 伪装 Server 指纹 `DISGUISE_SERVER_NAME='cloudflare'` | `src/proxy/disguise.js:31` | error / respHeaders | **① 已下沉+代码冗余/特例**：全站品牌头 `server/via='${product_name}'` 已沉 `stages-defaults.js:338-348`；`cloudflare` 指纹与 `DEFAULT_DISGUISE` 语义同源（global.js:75-79）。代码常量仅作该特例兜底。 | ❌ A 类（误判规则侧缺失） |
| E2 | 拦截响应 `isHtml` 自动判定 Content-Type | `src/security/guard.js:79`（block() 内） | error | **④ 引擎铁律（安全护栏算法）**：规则提供 `blockBody/blockCacheControl`（stages-defaults.js:285-289），按内容自动判 Content-Type 的算法属代码。 | ✅ C 类 |
| E3 | 全失败 502 响应体写死 | `src/balancer/failover.js:282-291` | error（origin 全失败） | **③ 代码独有、规则缺失（按设计）**：failover 刻意不进规则层（failover.js:44 注释"池级是唯一换源真相源"），兜底文案是最后防线。 | ✅ B 类（实质同③，非待迁移） |
| E4 | 错误文案映射 `MSG_MAP` | `src/proxy/pipeline.js:638-642` | error | **① 已下沉+代码冗余**：文案数据源已沉 `stages-defaults.js:291-295` `error.messages`；代码仅是"语义键→用户文案"查表。 | ⚠️ B 类（精确为①） |

---

## 4. `cache`（缓存阶段）

| # | 现象 | 锚点 | 归属阶段 | 复核定性 | 初版 |
|---|------|------|----------|----------|------|
| C1 | `NO_CACHE_STATUS` 错误码集 | `src/contracts.js:507-512` | cache | **④ 引擎铁律（兜底枚举）**：已并入 `statusTtl`（stages-defaults.js:316-317 `{4xx:0,5xx:0,52x:0}`），global.js:98 `NO_CACHE_STATUS_LIST` 兜底，cache.js 消费。规则 statusTtl 优先。 | ✅ C 类 |
| C2 | `ERROR_STATUS_RANGE='4xx5xx'` | `src/contracts.js:498` | cache / error | **④ 引擎铁律**：failover 引用（failover.js:118），failover 不入规则层。 | ✅ C 类 |
| C3 | `isCacheable` 硬规则 | `src/platform/cache.js:345-407` | cache | **④ 引擎铁律（平台/缓存安全护栏）**：由 statusTtl 驱动 + NO_CACHE_STATUS_LIST 兜底 + 写缓存拦截 set-cookie/no-store/private。 | ✅ C 类 |
| C4 | 伪装缓存时长兜底 `cdnMaxAge ?? 86400` / `isolateTtlMs ?? 600000` | `src/proxy/disguise.js:330-331,362,393` | cache（disguise） | **① 已下沉+代码冗余**：`stages-defaults.js:323-328` `cache.disguise {cdnMaxAge:86400, isolateTtlMs:600000}` 已填同值；disguise.js:289-294 已优先读 `ctx.__globalStages.cache.disguise`。`??` 仅作读不到时的兜底。 | ❌ B 类（误判"待核实"，实际已覆盖） |
| C5 | `STATIC_HTML` 兜底页模板 | `src/proxy/disguise.js:45` 起 | cache（静态兜底） | **③ 代码独有、规则缺失（按设计）**：页面内容不可配，仅 `DEFAULT_DISGUISE.mode='static'`（global.js:75-79）控制是否启用。 | ✅ B 类（实质同③） |

---

## 5. `origin`（回源/源站阶段）

| # | 现象 | 锚点 | 归属阶段 | 复核定性 | 初版 |
|---|------|------|----------|----------|------|
| O1 | `LOCAL_FALLBACK` / `SAFETY_RESERVE` | `src/balancer/failover.js:46-60` | origin（故障转移） | **④ 引擎铁律（容错兜底）**：failover 不入规则层。 | ✅ C 类 |
| O2 | `FALLBACK_MAX_RETRY_BODY=5MB` | `src/balancer/failover.js:42` | origin（重试） | **④ 引擎铁律（防内存爆炸）** | ✅ C 类 |
| O3 | `BATCH_SIZE=20` | `src/balancer/failover.js:471` | origin（探测） | **④ 引擎铁律（实现细节常量，无规则入口）** | ✅ C 类 |
| O4 | 全失败 502 兜底 | `src/balancer/failover.js:282-291` | origin | 见 E3（③ 代码独有按设计） | ✅ 见 E3 |
| O5 | dispatch 自定义 Host 注入 | `src/balancer/failover.js:445-451` | origin（请求构造） | **④ 引擎铁律（Host 注入机制）+ 规则消费点已存在**：`DEFAULT_HOST_HEADER.mode:'inherit'`（stages-defaults.js:43-46），由 action.hostHeader 驱动。 | ✅ B 类（实质同④） |
| O6 | `ctx.debug.notes` 兜底初始化 | `src/balancer/failover.js:166-167` | origin（调试） | **④ 引擎铁律（调试基础设施）** | ✅ C 类 |

---

## 6. `rewrite`（改写阶段）

| # | 现象 | 锚点 | 归属阶段 | 复核定性 | 初版 |
|---|------|------|----------|----------|------|
| W1 | `REGEX_REPLACE_MAX_LEN=8192` | `src/proxy/rewrite.js:16` | rewrite | **④ 引擎铁律（防 ReDoS/内存上限，规则无法安全暴露）** | ✅ C 类 |
| W2 | 默认端口省略 | `src/proxy/rewrite.js:198-202` | rewrite（URL 构造） | **④ 引擎铁律（URL 规范化实现细节）** | ✅ C 类 |

---

## 7. `security`（安全阶段）

| # | 现象 | 锚点 | 归属阶段 | 复核定性 | 初版 |
|---|------|------|----------|----------|------|
| S1 | `block()` 403 / 限流 429 | `src/security/guard.js:71-87` | security | **④ 引擎铁律（状态值可配，拦截机制代码）**：blockBody/blockCacheControl 来自 stages.error。 | ✅ C 类 |
| S2 | IP/CIDR/通配匹配 | `src/security/guard.js:98-149` | security | **④ 引擎铁律（匹配算法）+ 规则提供名单**：sec.ipBlacklist/ipWhitelist 来自 stages.security（stages-defaults.js:270-271）。 | ✅ C 类 |
| S3 | UA 黑名单 | `src/security/guard.js:180-191` | security | **④ 引擎铁律（算法）+ 规则提供名单**：sec.uaBlacklist 来自 stages.security.uaBlacklist（stages-defaults.js:269）。 | ✅ C 类 |
| S4 | Referer 域名通配 | `src/security/guard.js:223-244` | security | **④ 引擎铁律（算法）+ 规则提供配置**：sec.refererMode/refererList/allowEmptyReferer 来自 stages.security（stages-defaults.js:266-268）。 | ✅ C 类 |

---

## 8. 跨阶段内部量（变量引擎 / 调试）

| # | 现象 | 锚点 | 归属阶段 | 复核定性 | 初版 |
|---|------|------|----------|----------|------|
| V1 | `CLIENT_IP_HEADERS` 优先级 | `src/config/vars.js:102-140` | 跨阶段（变量引擎） | **④ 引擎铁律（引擎常量，非可配 settings）** | ✅ C 类 |
| V2 | `SCALAR_VARS / PREFIXED_VARS` 白名单 | `src/config/vars.js:32-84` | 跨阶段（变量引擎） | **④ 引擎铁律（`${var}` 注入面白名单，安全边界）** | ✅ C 类 |
| V3 | 调试笔记 key `ctx.debug.notes` | `src/balancer/failover.js:166-167` | 跨阶段（调试） | **④ 引擎铁律（内部可观测量）** | ✅ C 类 |

---

## 9. 非流量序列（统计阈值）

| # | 现象 | 锚点 | 归属 | 复核定性 | 初版 |
|---|------|------|------|----------|------|
| T1 | 统计冲洗阈值 `FLUSH_COUNT_THRESHOLD=500` / `FLUSH_INTERVAL_MS=300000` | `src/stats/collector.js:40,43` | 非序列（可观测） | **④ 引擎铁律（实现细节，无规则入口）** | ✅ B 类（实质同④） |
| T2 | `MAX_HOSTS=500` 等内存护栏 | `src/stats/collector.js:46,147,150` | 非序列（内存护栏） | **④ 引擎铁律（内存上限）** | ✅ C 类 |

---

## 10. 一致性风险专项（按复核结果重分类）

### 10a. 已下沉但代码冗余/死常量（**待清理，非待迁移**）—— 初版集中误判处

| 项 | 规则侧真相源 | 代码侧冗余 | 处理建议 |
|----|--------------|------------|----------|
| 调试头 X-Origin-Id 等（R1/R4） | `DEBUG_HEADER_NAMES`（global.js:31-37）；stages-defaults.js:344-346 声明"规则可关" | `headers.js:237-255` / `pipeline.js:618-645` 按常量注入 | 头名已沉，代码仅作注入器；如需彻底单一化，可考虑删 `headers.js` 字面量、统一走常量 |
| Accept-Encoding 兜底（Q1） | `stages-defaults.js:227` `reqHeaders.set['Accept-Encoding']` | `headers.js:88-90` `if (!out.has)` 兜底 | 规则已含，代码 `if (!has)` 可保留为极端兜底，但**非待迁移项** |
| 伪装 Server 指纹（E1） | `stages-defaults.js:338-348` 全站品牌头；`DEFAULT_DISGUISE` 语义（global.js:75-79） | `disguise.js:31` `DISGUISE_SERVER_NAME` | 代码常量仅特例兜底，可保留 `??` |
| 错误文案（E4） | `stages-defaults.js:291-295` `error.messages` | `pipeline.js:638-642` `MSG_MAP` 查表 | 文案已沉，代码查表冗余但无害，可保留 |
| 伪装缓存时长（C4） | `stages-defaults.js:323-328` `cache.disguise` | `disguise.js:330-331,362,393` `?? 86400/600000` | 规则已填同值，`??` 仅兜底，删冗余注释即可 |
| 伪装 UA（Q3） | `stages-defaults.js:222-223` `reqHeaders.set['User-Agent']` | `contracts.js:598-604` `DEFAULT_UA_HEADERS` **已无引用方** | **删除死常量** `DEFAULT_UA_HEADERS` |

### 10b. 已下沉但规则未覆盖全（**待补缺**）

| 项 | 已下沉部分 | 代码独有残留 | 处理建议 |
|----|------------|--------------|----------|
| 不缓存信号（R2） | `set-cookie` 已 strip（stages-defaults.js:365） | `pragma / no-store / private / expires:0` 响应头路径规则侧无 strip | 若要"全站默认即剥不缓存信号"，在 `stages.respHeaders.strip` 补这几项；否则保留 `headers.js:181-184` 代码兜底（现有 `isCacheable` 仅在写缓存阶段拦，下发响应头阶段无 strip） |

### 10c. 真正的"规则缺失 / 按设计不入规则"（**③ 类**）

| 项 | 说明 |
|----|------|
| 边缘缓存头拼接（R3） | 规则给参数、引擎拼装，本就如此 |
| 全失败 502 体（E3/O4） | failover 按设计不进规则层，最后防线 |
| STATIC_HTML 兜底页（C5） | 页面内容不可配，仅模式可配 |

---

## 汇总：定性分布与行动清单

### ① 已下沉 + 代码冗余（**待清理，非待迁移**）—— 初版误判重灾区，共 6 项
R1、R4、Q1、E1、C4、E4（外加 Q3 死常量、R2 的 set-cookie 部分也属此类）。
> **结论**：这 6 项当初列为"建议优先迁移 Top N"是**错误的**。它们早已下沉，用户"可视化调参"的诉求在规则侧已满足，代码只是兜底/注入器。行动是**清理冗余代码**（删 `DEFAULT_UA_HEADERS` 死常量、收敛 `??` 注释），而非新增 stages 字段。

### ② 已下沉 + 规则未覆盖全（**待补缺**）—— 2 项
R2（pragma/no-store/private/expires）、Q3（死常量已含于①）。
> 行动：在规则侧补 strip / 删死常量，使规则成为唯一真相源。

### ③ 代码独有、规则缺失（**真待迁移 / 按设计不入规则**）—— 3 项
R3（缓存头拼接，规则给参引擎拼装）、E3/O4（502 体，按设计不入规则）、C5（STATIC_HTML，内容不可配）。
> 其中仅 R3 属"规则生成参数、引擎保留构造"的正常分工；E3/C5 按设计本就不应入规则。

### ④ 引擎铁律（**保留，不动**）
Q2、Q4、E2、C1、C2、C3、O1、O2、O3、O5、O6、W1、W2、S1–S4、V1、V2、V3、T1、T2。
> 平台兼容、安全边界、防注入/内存爆炸上限，不应暴露给用户随意修改。

---

## 初版 vs 复核版：被推翻的"建议优先迁移 Top N"

初版汇总 A 列的 5 项，**经复核全部不成立**：

| 初版 Top N | 初版判定 | 复核结论 | 是否还需迁移 |
|------------|----------|----------|--------------|
| 调试响应头族（R1/R4） | A 类待迁移 | **① 已下沉** | ❌ 否，仅清理代码 |
| 伪装 Server 指纹（E1） | A 类待迁移 | **① 已下沉** | ❌ 否，仅清理代码 |
| Accept-Encoding 兜底（Q1） | A 类待迁移 | **① 已下沉** | ❌ 否，仅清理代码 |
| 伪装 UA 双份（Q3） | 一致性风险 | **② 死常量** | ❌ 否，删死常量 |
| 缓存/隔离时长（C4） | B 类待迁移 | **① 已下沉** | ❌ 否，仅清理代码 |

> **方法论教训**：初版只做"代码侧单向盘点"，未 `grep` 规则侧，把"已下沉的冗余代码"误读为"未下沉的待迁移策略"。正确做法永远是**先查规则侧真相源，再定性**。

---

_报告结束。下一步建议：对 ①/② 类开清理 plan（删 `DEFAULT_UA_HEADERS`、收敛冗余 `??`/字面量、规则补 R2 未覆盖项），而非当初设想的"新增 stages 字段迁移"。_
