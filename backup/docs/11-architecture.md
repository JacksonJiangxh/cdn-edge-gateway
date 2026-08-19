# 11 · 系统架构

> **架构与设计**
>
> 上一篇：[10 API 参考](./10-api-reference.md) ｜ 下一篇：[12 请求处理流程](./12-request-flow.md)
>
> 返回 [项目首页](../README.md)

> 想理解「一个请求进来后发生了什么」？本文讲清楚模块划分、回源决策流、平台能力降级。
> 字段怎么填见 [配置详解](./04-configuration.md)；部署见 [部署指南](./03-deploy.md)；网页上怎么点见 [管理面使用教程](./05-user-guide.md)。

---

## 1. 整体定位

cdn-edge-gateway 是一个**边缘侧的反向代理网关**。它接管边缘节点收到的请求，按配置决定：

1. 这个域名属于哪个「站点」？
2. 该站点的「安全防护」是否放行？（防盗链 / IP / UA / 签名 URL⚠️实验特性 / 限流）
3. 哪条「规则」命中？（按优先级逐个匹配，命中则执行其「动作」）
4. 动作指向哪个「源站池」？池里按什么策略挑一个「源站」？
5. 请求路径要不要重写？回源 Host 改成什么？要不要强制 HTTPS / 跟随 3xx / 改头 / 缓存？
6. 源站挂了 / 返回指定状态码 → 自动切下一个（链式回退 + 被动熔断）。
7. 响应头怎么改写、要不要边缘缓存（视平台能力），最后以 **EdgeGateway** 品牌头返回客户端。

> 它是**独立 CDN 厂商**：响应头 `Server: EdgeGateway`、`Via: 1.1 EdgeGateway`；回传给源站的客户端 IP 头默认 `X-EdgeGateway-Client-IP`。不冒充任何上游平台。

---

## 2. 目录结构（含职责）

```
cdn-edge-gateway/
├── src/
│   ├── entry.js            # 运行入口：组装 ctx（request / 平台能力 / env / bindings）
│   ├── core/
│   │   ├── app.js          # 请求主流程：匹配站点→安全→规则→选源→回源→改写
│   │   ├── ctx.js          # 请求上下文对象（贯穿整条链路，承载 reqId/调试头）
│   │   ├── errors.js       # 统一错误（附带 reqId 便于排查）
│   │   └── reqid.js        # 请求追踪 ID（兼容读取上游 reqId，本项目统一用 X-Egw-Req-Id）
│   ├── proxy/
│   │   ├── pipeline.js     # 响应组装入口：错误响应/重定向/自定义响应/正常响应
│   │   ├── engines/        # 回源引擎：fetch(fetch) / socket(TCP 裸 IP，仅 CF)
│   │   ├── headers.js      # 出/入向头改写（注入品牌头、X-EdgeGateway-Client-IP）
│   │   ├── matcher.js      # 规则匹配（多条件 OR 组 AND，按优先级）
│   │   ├── rewrite.js      # 路径重写（prefix/strip/regex）
│   │   ├── cachekey.js     # 缓存键生成（回源 URL + host 维度 + 代次 + 自定义维度）
│   │   └── cache.js        # 边缘缓存读写（CF/EO 用 caches.default；ESA 用全局 cache 单实例；三平台均 hasCacheApi=true，差异见 cacheIsNodeLocal / cacheSingleInstance / cacheKeyHttpOnly / cacheSubreqLimit）
│   ├── balancer/
│   │   ├── pick.js         # 选源入口
│   │   ├── strategy.js     # 调度策略：chain/roundrobin/weighted/random/iphash
│   │   ├── failover.js     # 链式回退（按 order + retryOn 状态码）
│   │   └── circuit.js      # 被动熔断（连续失败隔离，无需 Cron）
│   ├── config/
│   │   ├── schema.js       # ★ 配置校验+规范化（唯一数据真相源，所有字段都在这）
│   │   ├── defaults.js     # 默认值 + 枚举（MATCH_TARGETS / MATCH_OPERATORS 等）
│   │   └── store.js        # KV 读写（前缀隔离：site:/pool:/global:/stats:）
│   ├── security/
│   │   ├── guard.js        # 防盗链/IP/UA 校验
│   │   ├── sign.js         # 签名 URL（HMAC）
│   │   ├── auth.js         # 限流（IP 级 RPM）
│   │   └── loginGuard.js   # 管理面登录鉴权（cookie + JWT）
│   ├── stats/
│   │   ├── collector.js    # 统计聚合（内存 + 批量落盘）
│   │   ├── kvDriver.js     # KV 驱动
│   │   └── d1Driver.js     # D1 驱动（首次自动建表）
│   ├── api/
│   │   ├── router.js       # /__panel/api/* 路由分发
│   │   ├── handlers/       # pools/sites/auth/stats/system/cache/global
│   │   └── adminPage.js    # 管理面 HTML 渲染 + 静态资源优先服务（兜底内联）
│   ├── platform/
│   │   ├── caps.js         # detectCaps 探测平台能力（缓存/D1/Socket/KV，含 EO Node 运行时）
│   │   ├── kv.js           # 运行时 KV 抽象（容错）
│   │   └── cache.js        # 运行时缓存抽象
│   └── utils/              # ip/net/normalize/reqid 等
├── web/                    # 管理面前端（原生 JS 单页/抽屉式界面，构建时产出静态 + 内联兜底）
│   ├── dom.js              # ★ 安全 DOM/模板工具层（单一真相源）：el()/clear()/$()/escapeHtml()；杜绝原始 innerHTML 拼接
│   ├── app.js              # 业务前台：登录 + 抽屉式管理（视图渲染全部经 dom.js 的 el/textContent，无 innerHTML 拼接）
│   ├── api.js              # 后端契约门面（window.API / window.__BASE__，零改动）
│   ├── index.html          # 预置根 DOM 骨架（#view-app/#content/#login-* 等），含 BUILD:STYLE/SCRIPT 注入标记
│   └── style.css
├── edge-functions/         # EO Makers Edge Function 目录
│   └── [[default]].js       # Catch-all 薄壳（加载 _worker.js，承载全部动态请求）
├── dist/public/            # 构建产出的管理面静态资源（HTML + assets），供 Pages 静态托管
├── scripts/dev.mjs         # 本地一键开发脚本
├── scripts/check.mjs       # 静态一致性检查（CLOUD_PLATFORM 口径 + 前端入口可解析）
├── scripts/e2e-test.mjs    # 构建后端到端测试：内存 KV mock + HTTP 全流程（health→panel→login→me→sites）+ Node 沙箱执行前端 JS 验证 window.API
├── build.mjs               # 用 esbuild 打包 src/ → _worker.js，并产出 dist/public/ + 内联兜底；末尾内置 e2e 测试
└── docs/                   # 本文档
```

---

## 3. 请求处理流程（详细）

```
请求进入 fetch(request, env, ctx)
   │
   ├─ entry.js：detectCaps() 探测平台能力；组装 ctx（reqId/X-Egw-Req-Id）
   │
   ├─ core/app.js handle():
   │     ├─ 匹配站点（host 精确匹配 / 泛域名 *.example.com / 兜底 404 或伪装页）
   │     ├─ security.guard()：防盗链 / IP / UA → 不合规直接拦截（4xx/伪装）
   │     ├─ security.sign()：签名 URL 校验（若开启）⚠️ 实验特性（仅校验，内置签发工具待开发）
   │     ├─ security.auth()：限流（IP 级 RPM）→ 超限 429
   │     ├─ proxy.matcher()：按 priority 降序逐条匹配规则
   │     │      命中 → 执行该 rule.action（源站池/重写/Host/头/强制HTTPS/重定向/自定义响应/缓存）
   │     ├─ balancer.pick()：在目标池内按策略选源（chain/roundrobin/weighted/random/iphash）
   │     │      ├─ proxy 回源（fetch 引擎，带 pathPrefix/重写/自定义Host/超时/跟随3xx；CF 上裸 IP+HTTPS+自定义 SNI 内部自动走 socket 兜底）
   │     │      ├─ 失败（网络错误 / retryOn 状态码）→ 链式回退下一源站
   │     │      └─ 连续失败 → 被动熔断隔离（默认 60s，无需 Cron）
   │     ├─ proxy.headers()：入向注入 X-EdgeGateway-Client-IP；出向改写请求/响应头
   │     ├─ proxy.cache()：边缘缓存（CF/EO 用 caches.default API；ESA 用全局 cache 单实例；三平台均原生支持 Cache API，详见缓存本质章节）
   │     ├─ 图片优化：依赖 CF 平台原生 fetch 协商 webp/avif（**无独立 JS 模块**，`src/proxy/` 下不存在 image.js）；EO 因无该能力自动降级为原图
   │     └─ proxy.pipeline()：组装最终响应，注入品牌头 Server: EdgeGateway / Via: 1.1 EdgeGateway
   │
   └─ stats.collector()：异步记录访问统计（KV/D1）
```

**关键点：优先级与短路**
- 规则按 `priority` **降序**逐个匹配，**命中第一条即停**（goto 语义）。
- 「匹配条件」是二维数组 `conditions: [ [AND组], [AND组] ]`：外层 OR、内层 AND——即「满足第 0 组全部 且/或 第 1 组全部」。
- 一条规则可以**只匹配、不动作**（当占位/分流用），也可以只动作、匹配全部。

---

## 4. 平台能力降级（核心设计）

代码不写死「依赖某个平台特性」，而是运行时 `detectCaps()` 探测，缺失就降级：

| 能力 | Cloudflare (Workers/Pages) | EdgeOne Pages | 降级行为 |
|---|---|---|---|
| `caches.default` 缓存 API | ✅ | ✅（节点本地化） | CF / EO 均原生支持 `caches.default`，差异仅「EO 缓存仅当前节点本地、不跨节点复制」。三平台均 `hasCacheApi=true`；EO 额外保留「路径 A 同站 fetch 节点缓存」并存（详见缓存章节与 eoEdgeEngine.js） |
| D1 统计 | ✅ | ❌ | EO 无 D1，`statsDriver=d1` 时自动回落 **KV 驱动**（内存聚合 + 分片键落盘，写入频次与请求量解耦）；CF 链照常 |
| KV 配置存储 | ✅ | ✅（Edge + Node 双运行时） | 两平台均通过 `CDN_KV` 绑定。EO KV 键名仅允许 `[0-9A-Za-z_]`，故适配层统一做可逆编码（见 `platform/keyCodec.js`），上层无感、两平台同构。**EO Edge Function 与 Cloud Function 共用同一 KV 命名空间与键编码**，管理 API 在 Node 侧读写完全兼容 |
| Node API（process/fs/Blob） | ❌（仅 Edge） | ⚠️（Edge Function 无，但本项目已收口到 Edge Function） | 本项目全部收口到 Edge Function（`edge-functions/[[default]].js`），不拆 Cloud Function——因 EO KV 仅在 Edge Functions 可用，拆出去管理面会失 KV。Node API 受限但本项目未依赖；CF 上管理面同体运行于 Edge，低频可接受 |

### KV 用量在两平台的差异与统一克制

KV 是 CF 与 EO **共用**的存储层，但计费口径不同，优化必须同时兼顾两边：

- **Cloudflare**：KV 操作**计次**（免费 10 万次/天），且 KV 读计入 Workers 单请求 50 subrequest 上限。故 CF 侧要克制**读次数**与**查询窗口**。
- **EdgeOne**：KV 仅按**空间占用**计费（默认 1GB），用量概览无「KV 请求数」指标，读写**不计**函数执行额度（300 万次/月只算函数触发次数）。故 EO 侧主要克制**空间**。

统一措施（对两边都正向、不退化）：

| 措施 | 对 CF | 对 EO |
|---|---|---|
| `configCacheTtl` 默认 30s→60s | 命中 L1 后零冷读，省读次数 ✓ | 同 ✓ |
| EO 平台下 `configCacheTtl` 生效值 clamp ≥120s | **不触发**（仅 `platform==='eo'` 分支） | 缓存窗口 ≥ KV 同步延迟，压冷读、避旧值 ✓ |
| 统计键 TTL 7天→3天 | 纯省空间，写次数不变 ✓ | 省空间防撑爆 1GB ✓ |
| 查询窗口 `MAX_QUERY_HOURS` 跟随 TTL 推导 | 避免无效 KV 读占用 subrequest 预算 ✓ | 同 ✓ |

> 配置内存缓存（`configCacheTtl`）是数据面压低 KV 访问的核心杠杆：绝大多数请求命中 isolate 内 L1 缓存后 KV 冷读次数归零。EO 上进一步抬高低限，是因为 EO KV 跨节点最终一致约 60s，缓存窗口过短既拉高延迟又读不到新值。
| 自定义回源 Host（fetch 设 Host 头） | ✅ | ✅ | ✅（仅改 HTTP 头，连接按 URL 域名 DNS） |
| TCP Socket 裸 IP + 自定义 SNI 回源 | ✅（CF 上由 fetchEngine 内部自动走 socket 兜底） | ⚠️（EO fetch 支持裸 IP 直连；仅无 socket，故「HTTPS+裸IP+自定义 SNI」走 EO 源站组兜底） | ❌（fetch 不支持 IP/自定义端口；裸 IP 走平台源站组兜底） |
| 图片优化(webp/avif) | ✅ | ❌ | EO 下降级为原图 |

> 部署厂商由环境变量 `CLOUD_PLATFORM` 显式声明，取值 `cf` / `eo` / `esa`，程序不再靠运行时指纹猜测。本地开发可用 `CLOUD_PLATFORM=eo` 强制按 EO 降级，确保「本地 = 线上」。详见 [09 本地开发](./09-local-development.md)。

---

## 4.1 缓存的本质（重要认知）

本项目是跑在边缘平台上的**一段处理代码**，自身：
- **无持久硬盘**：缓存/配置/统计都不存在本地磁盘；
- **内存极小**：只够做请求级临时状态（如本请求的熔断排除列表），不能跨请求长期保存。

因此「响应缓存」**不是本项目自己存的**，而是**完全依赖底层边缘**：
- **Cloudflare**：用 `caches.default` API 直接把响应存进 CF 边缘；同时下发 `Cache-Control` / `CDN-Cache-Control` 让 CF 边缘也按头缓存。但 **CF 生产环境的缓存权威是面板两条规则，必须成对设置**，否则源站返回的头（如 `no-store`/`private`）会反客为主：
  - **Cache Rules（请求/命中侧）**：决定"存不存、存多久"（`Cache eligibility`、`Edge TTL`、`Browser TTL`、并设 `Origin Cache-Control = Ignore if present` 覆盖源站头）。
  - **Cache Response Rules（响应侧，Modify cache response headers and tags）**：响应离开边缘前改写 `Cache-Control`/`CDN-Cache-Control`、加 `Cache-Tag`、清掉 `Set-Cookie` 等。本项目代码下发的头仅作跨平台兜底，CF 上以这两条面板规则为准（详见部署文档 CF 段）。
- **EdgeOne（1+1 架构）**：**原生支持 `caches.default` API**（基于 Web Cache API，接口与 CF 一致），`hasCacheApi=true`；差异仅「缓存仅当前边缘节点本地有效、不跨节点复制」（`cacheIsNodeLocal=true`）。同时边缘缓存能力还有两条路径并存：
  - **路径 B `caches.default` 写入/读取**：与 CF 同构，走标准 Cache API。
  - **路径 A 同站 fetch 节点缓存**（`proxy/engines/eoEdgeEngine.js`）：对「无自定义回源 Host 的可缓存请求」，边缘函数内 `fetch(同站加速域名)`（HOST 与 host 头一致）走 EO 节点缓存，命中零函数调用、未命中由 EO 按平台源站组回源（需预配 `docs/07-eo-origin-host.md`）。路径 A 与路径 B 互不冲突、并存。
  - 响应头委托（`CDN-Cache-Control: s-maxage=...`）仍对所有 EO 请求生效，作兜底。
- **阿里云 ESA**：**原生支持 Cache API**，但形态为全局 `cache` 单实例（无 `caches.default` / `open` 命名空间，`cacheSingleInstance=true`），`hasCacheApi=true`。关键差异：
  - `cache.put` 的 key 必须为 **http URL**（引擎不支持 https key，写入时由 `cache.js` 自动降为 http，`cacheKeyHttpOnly=true`）；
  - Cache 操作与 `fetch` **共享 32 子请求硬上限**（`cacheSubreqLimit=32`）；
  - 单实例 `cache.delete` 仅作用于当前节点，存入条目仍须 TTL 到期才真正失效（不支持主动跨节点刷新）。

```
本项目能「控制」的，只是：
  ① 是否下发缓存头、TTL 多少、是否带 stale-while-revalidate；
  ② （CF / EO 上）是否调用 caches.default 写入/读取；（ESA 上）是否调用全局 cache。
真正「存」数据的，是底层边缘。这不是缺陷，而是边缘计算的本来面目。
```

**因此带来的平台差异（非 bug）**：
- `cacheGen`「整站清除」：CF / EO 通过 `caches.default.delete` 真实删除（EO 仅清当前节点）；ESA 通过 `cache.delete` 真实删除（仅当前节点）。cacheGen 代次机制使旧键整体失效，三平台均适用。
- 想立即失效，可调用 purge 单 URL、或缩短 `edgeTtl`、或改 `CDN-Cache-Control` 让新响应覆盖旧缓存键维度。

**缓存键设计（提升命中率）**：`proxy/cachekey.js` 构造缓存键时——
- 基于**回源 URL** 而非客户端 URL，多加速域名指向同一源站可共享缓存；
- `ignoreQuery=true` 与「`ignoreQuery=false` 但请求本就无 query」收敛到**同一个无 query 键**（host/代次等内部维度照常叠加），同一资源的两种请求形态共享缓存、避免重复回源；
- **HEAD 请求被 `shouldBypassCache` 彻底挡在缓存读写之外**（`method!=='GET'` → `cacheKey=null`），读（`cacheMatch`）、写（`cachePut`）、EO 路径 A 三层全部短路，杜绝「HEAD 读到 GET 缓存并返回 body」的投毒风险；`isCacheable` 虽对 HEAD 返回 true（方法白名单），但最终拦截由管线 `cacheKey` 控制，语义安全。

### 4.2 EO 多域名源站负载均衡（跨域名 fetch = 路径 B）

**场景**：对外入口 `cdn.example.com` 挂了 Makers 函数（`/img/*` 触发路由），函数内做源站负载均衡，后端是另外两个也是 EO 加速域名的存储源 `cdn-1storage.example.com` / `cdn-2storage.example.com`。

```
用户 → cdn.example.com/img/xxx
   ↓ CNAME → EO 边缘（入口）
   ↓ 命中 Makers 触发路由 /img/* → 调起 _worker.js
       函数内：负载均衡选 cdn-1storage 或 cdn-2storage
       然后 fetch(cdn-1storage.example.com/...)
```

**关键认知：Makers 函数里的 `fetch` 走公网 DNS，不是同站短路。**

- 函数内 `fetch(cdn-1storage.example.com/...)` 是从**运行函数的 EO 节点出的公网**去解析该域名，再命中 `cdn-1storage` 自己的 EO 边缘。
- 这**不满足路径 A 的「同站 fetch」条件**（同站要求 fetch 的 host 与当前请求加速域名一致，即必须是 `cdn.example.com` 自己）。所以**跨域名 fetch 不会触发入口域名的同站节点缓存**。
- 它本质上就是 **路径 B（直接回源 / 直连）**——只不过「源站」恰好也是 EO 加速域名。完全合法，项目 `requestWithFailover` 干的就是这个。

**缓存落在哪一侧？**

| 层 | 是否缓存 | 说明 |
|---|---|---|
| `cdn.example.com` 函数这一侧 | 否（本次） | 函数已在跑，无「零函数命中」红利；跨域名也不触发同站节点缓存 |
| `cdn-1/2storage` 各自的 EO 边缘 | ✅ | 它们也是 EO 加速域名，按自身响应头（`CDN-Cache-Control`）委托缓存，与函数无关 |

即：**函数这层只负责「选哪个 storage + 鉴权 + failover」，缓存交给 storage 域名各自的 EO 边缘（响应头委托）。**

**推荐代码形态（路径 B 直连）**：

```js
// _worker.js 内
const pool = ['cdn-1storage.example.com', 'cdn-2storage.example.com'];
const pick = lbPick(pool);                 // 你的源站负载均衡策略
const originResp = await requestWithFailover(ctx, [pick], rule, effectiveHostHeader);
```

**不要混淆的点**：

- 多域名 LB fetch storage = **路径 B**，能跑、推荐；只是别指望它顺带触发 `cdn.example.com` 的同站节点缓存。
- 想要 `cdn.example.com/img/` 这一跳**也**被 EO 节点缓存且零函数开销（路径 A），必须让 storage 内容**回源到 `cdn.example.com` 同源站组**，再用同站 fetch——但这与「多域名独立源站 LB」冲突，二选一。

---

## 4.3 内存预算与自回收（isolate 级统一内存管理）

§4.1 说「本项目无持久硬盘」是对的——但 isolate **确实有可用内存**（CF / EO / ESA 的运行时都有上限）。本项目已确认统一按 **128MB 假设**规划：CF Workers 标准 128MB、ESA 函数侧 128MB（见 `esa.jsonc`；ESA 文档 512MB 为企业另一档配额，不在本假设内）。这段内存足够做**跨请求的内存缓存**，正是压低 KV/D1 读写的关键杠杆。

> 关键约束：三平台的 V8 边缘运行时**均无 JS 堆内省 API**（浏览器才有的 `performance.memory` 在边缘不可用），运行时无法真实测量堆占用。本项目因此用「**条目数 × 每类平均估算字节（运行采样自校准）+ 条目数硬上限**」双约束来近似计量，而非依赖 heap 探测。

### 4.3.1 为什么需要统一层（memBudget）

原有三处内存使用各自为政、互不知道彼此占了多少：

- `config`（配置 L1 缓存，`config/store.js`，原上限 500 条）
- `stats`（访问统计内存聚合，`stats/collector.js`，原上限 500 host）
- `ratelimit`（限流内存计数，`security/ratelimit.js`，原上限 5000 条）

任一处无脑增长都可能把 isolate 推向 OOM 而被平台冷杀。`src/platform/memBudget.js` 提供一个 **isolate 级单例**，统一掌握「总预算 + 各域配额 + 软/硬水位」：

- 各域注册时声明**权重、单条估算字节、evict 回调、是否允许激进回收**；
- 写内存前先 `allocBytes`，域超自身配额或全局逼近硬水位时回调各域 evict 自回收；
- 硬水位（90%）强制所有域 trim 到软水位（70%）之下，避免 OOM。

### 4.3.2 收敛后的三域策略

| 域 | 权重 | 回收策略 | 及时反馈保证 |
|---|---|---|---|
| `config` | 3（最高） | **保守**：仅全局硬水位(90%)才被迫释放；释放只清过期项 | 写操作后 `invalidateMemCache()` 立即失效当前 isolate 内存，下次读直连 KV → **新增/修改/删除配置即时生效、前端渲染永远正确**；TTL 不激进延长 |
| `stats` | 2 | **激进**：超自身配额即丢弃最旧一半 host | 统计可容忍近似丢失（现状已接受） |
| `ratelimit` | 1 | **激进**：超自身配额即清过期/全清 | 限流短暂失准但 fail-safe（本地计数兜底） |

- **配额分配**：按权重把总预算（预留 5% 边距）分给三域；各域内存表条目上限 = `min(原硬上限, 配额字节 / 估算每条约字节)`，预算缩小时上限自动收紧。
- **域级水位 + 全局硬水位兜底**：域超自身配额就 evict 自己（天然维持在配额上限附近震荡），不依赖其它域状态；全局逼近 90% 时强制所有域 trim 到 70% 安全线之下。
- **初始化**：`entry.js` 的 `dispatch` 中调用 `initMemBudget({ totalBytes: caps.memBudgetBytes, env })` 一次初始化（`caps.memBudgetBytes` 默认 128MB，可由 `MEM_BUDGET_BYTES` 覆盖）；三域在各自模块加载时自注册。
- **可观测**：`getBudgetSnapshot()` 暴露各域配额使用、估算内存占用、水位阈值，供 `/__health`、`/debug` 响应展示。

### 4.3.3 配置域的「及时生效」契约（重点）

前端「保存配置后应立即看到」的诉求，由以下不变量保证（与内存预算收敛不冲突）：

1. **当前 isolate 写后即生效**：`putSite/putPool/putGlobal/deleteSite/deletePool/putGlobalRules` 等写操作均调用 `invalidateMemCache()`，清空当前 isolate 的 L1，下次读直连 KV。
2. **管理面绕过 L1**：管理 API 直接读 KV/Redis（不经 `getCachedConfig` 的 `memGet`），写后立即可见，绝不为省额度而看旧值。
3. **内存预算不延长 TTL**：`configCacheTtl=0` 仍保留「防穿透短窗口」语义（`MIN_MEM_TTL_MS`）；仅 EO 下生效值 clamp 到 ≥120s 以避开 KV 跨节点约 60s 最终一致。配置域即使被硬水位回收，清后读必回 KV，绝不返回陈旧值。
4. **跨 isolate 最终一致**：其他 isolate 仍受 `configCacheTtl` 控制（保守短窗口），这是边缘多 isolate 架构的固有特性，非 bug。

---

## 5. 调度策略（balancer）

| 策略 | 行为 | 典型用途 |
|---|---|---|
| `chain`（默认） | 按 `order` 升序取第一个可用源站 | 主源 + 备源顺序切换 |
| `roundrobin` | 近似轮询 | 多源均摊 |
| `weighted` | 按 `weight` 权重随机 | 异构源站按能力分配流量 |
| `random` | 完全随机 | 简单打散 |
| `iphash` | 客户端 IP 哈希取模，稳定落源 | 需要会话粘性的场景（取不到 IP 退化为 chain） |

**链式回退 / 被动熔断**
- 源站返回 `retryOn` 状态码（如 502/503）或网络异常 → 自动切下一可用源站。
- 某源站连续失败 → 自动隔离一段时间（默认 60s），无需 Cron，Pages/EdgeOne 均可用。

---

## 6. 安全模块（security）

| 能力 | 字段 | 说明 |
|---|---|---|
| 防盗链 | `refererMode` | `off` / `whitelist`(白名单) / `blacklist`(黑名单) |
| | `refererList` | 允许的 Referer 域名列表（自动转小写） |
| | `allowEmptyReferer` | 是否放行空 Referer（直接访问） |
| UA 过滤 | `uaBlacklist` | 命中即拦截的 UA 列表 |
| IP 控制 | `ipBlacklist` / `ipWhitelist` | CIDR 或单 IP，上限各 64 条；**白名单优先** |
| 签名 URL | `signedUrl.{enabled,secret,ttl,param}` | HMAC 签名，过期失效 ⚠️ 实验特性（校验生效，内置签发工具待开发） |
| 限流 | `rateLimit.{enabled,rpm}` | 单 IP 每分钟请求数上限，超限 429 |

安全在**站点级**配置，也可在**全局**（`global.security` + `global.ipWhitelist`）兜底。

---

## 7. 配置存储与品牌

- 配置（站点 / 源站池 / 全局）统一存 KV（`CDN_KV`），key 前缀隔离（`site:` / `pool:` / `cfg:global`）。
- **键名编码**：EdgeOne KV 官方限定 key「仅支持数字、字母及下划线」，与本项目 `site:`/`pool:`/`cfg:` 前缀及 host、IP 中的 `.` 冲突。`platform/keyCodec.js` 在适配层做可逆十六进制转义（`cfg:global` → `cfg_3Aglobal`），逐字符编码保证 `encode(prefix)` 恒为 `encode(fullKey)` 的前缀，`list({prefix})` 语义不变。编码后的键在 CF 上同样合法，两平台共用一套逻辑。**Edge Function（Edge 运行时）与 Cloud Function（Node 运行时）共用同一编码约定**，故管理 API 在 Node 侧读写 KV 时键名完全兼容。
- **双运行时分工（EdgeOne Makers）**：EO 区分 Edge Functions 与 Cloud Functions。
  - **Edge Functions**（`edge-functions/[[default]].js`）：边缘低延迟、KV 原生可用、但有 ≤200ms CPU / ≤1MB body 限制。本项目数据面代理与管理面全部在此——因为它们都依赖 KV，而 KV 仅 Edge 可用。
  - **Cloud Functions**（`cloud-functions/`，预留）：云端 Node 运行时，无原生 KV，但可跑 MySQL/Blob 等重 IO、长执行。**承载「不依赖本项目 KV 的重活」**：大文件转码、AI 推理、独立业务库、后台批处理。当前 KV-only 版本暂无此类场景，故目录仅作架构预留（详见其 README）。
  - 这正对应参考项目（CloudPaste-EdgeOne）在 EO 用 MySQL 的做法：重 IO 走 Node 运行时 Cloud Function，而非 Edge。
- **Blob 回退路径（已移除，运行时隔离）**：`src/platform/kv.js` 曾实现「KV 未授权回退 Blob」，已移除。原因：**运行时不交集**——EO KV 仅在 Edge Functions 可用，而 Blob SDK（`@edgeone/pages-blob`）仅 Node.js 版本，在 Edge Function 中动态 import 必失败。若需 Blob，必须在 `cloud-functions/` 另建入口承载，而非在 Edge 回退。
- 读路径无持久化时降级为内置默认值（数据面不崩）；写路径必须有 KV。
- 统计：CF 链默认 KV 驱动（`statsDriver=kv`），可选 D1（`statsDriver=d1`）；EO 链无 D1，统一走 KV 驱动。
- 全部配置可一键「导出 / 导入」JSON 备份（管理面 → 系统 → 配置备份）。
- 品牌头：`Server: EdgeGateway`、`Via: 1.1 EdgeGateway`、`X-Egw-Req-Id`（请求追踪）、`X-EdgeGateway-Client-IP`（回传客户端 IP）。`disguise.js` 可把 Server 伪装成 nginx（隐藏网关，可选）。

---

## 8. 前端：流量序列（Traffic Sequence）

借鉴 Cloudflare 流量序列的可视化思路，把**一个站点（或全部站点）**的请求处理顺序画成竖向流程图：

- 顺序固定不可更改，严格按 18 个阶段：`① 匹配站点 / ②.1~②.5 安全 / ③ 首要分流 / ④ URL 规范化（暂未实现）/ ⑤ URL 重写 / ⑥ 重定向 / ⑦ 强制HTTPS·直接响应 / ⑧ 修改请求头 / ⑨ Origin Rules / ⑩ 确定实际源站 / ⑪ Cache Rules / ⑫ 缓存键 / ⑬ 查缓存 / ⑭ 回源循环 / ⑮ clone / ⑯ 改写响应头 / ⑰ 写缓存 / ⑱ 返回用户`。
- **每个阶段卡片本身就是一个独立的规则引擎或配置入口**（没有规则的环节为纯只读）；阶段之间相互独立（AND），阶段内部可有多个规则集，按 priority 降序从上到下匹配，命中即跳出本阶段进入下游（OR）。
- **③ 首要分流是真实推导出的具体临时对象**（单源站=该源站；源站池=按负载均衡策略选出的 oX），它成为后续规则的「回源目标」匹配维度（`target=origin` / `originAddr`，规则条件编辑器可选项）。靠这个维度即可在**一条线**上表达逻辑多分支（如 `路径=/img/ 且 回源目标=o1 → 动作`），⑦~⑱ 共用此线，⑩/⑭ 为真实只读的实际生效结果；可视化上不拆多条并行分支。
- 某阶段站点未做任何设置时，自动回落「全站通用规则」作为实际生效（卡片显示「回落全站兜底」），全站兜底与站点序列同级。
- 后端仍是统一 `site.rules` 数组；前端按 action 类型把规则分配到对应阶段展示/编辑。一条多 action 规则可能出现在多个阶段卡片下（数据不分裂）。
- 单站点：各阶段卡片下的规则节点可**拖拽**重排，松手即按新顺序重算 `priority` 并保存（后端按 priority 降序固化）；拖拽只改匹配顺序，不改流程。
- **架构为纯两层（全站级 + 站点级）**：旧版「源站级规则」（给每个源站单独配 `engine` / `scheme` / `port` / `pathPrefix` / `host` 等）已被统一收编进 ⑨ **Origin Rules**。用匹配条件 `回源目标 = 某源站id` + 连接参数动作（`action.engine` / `action.scheme` / `action.port`），即可在一条流量线上表达「不同源站走不同端口 / 协议 / 引擎」，无需第三层源站级规则。源站对象退化为纯物理地址 + 负载均衡权重；`port` / `scheme` / `engine` 在 ⑨ 未设时回退源站自身值（`failover.js` 以源站打底、规则覆盖，且不污染池内原始对象）。

详见 [管理面使用教程](./05-user-guide.md#7-流量序列)。

---

## 8.1 前端健壮化改造（根因治理：build 后登录进不去后台）

历史上最频发的故障：**build 成功部署后，登录界面输入正确密码却进不去管理后台，控制台报语法定位错误**。根因是前端用字符串拼接 + `innerHTML` 构造 DOM，内联/转义/`<>` 标签丢失类问题只在浏览器运行时才暴露，构建期语法校验查不出。本项目已彻底消除该脆弱链：

1. **`web/dom.js` 安全 DOM 工具层（单一真相源）**
   - 所有节点构造统一走 `el(tag, attrs, children)`：文本走 `textContent`（**永不解析 HTML，天然防 `<>` 标签丢失与注入**），事件走 `addEventListener`（不写内联 `onclick`），属性走 `setAttribute`。
   - **移除 `el` 的 `html` 原始 innerHTML 分支**：历史代码即使传 `html` 也按纯文本安全渲染，不再执行 `innerHTML`。
   - `clear(node)` 取代 `node.innerHTML = ''`；`$` 选择器封装；`escapeHtml` 供「只读展示 HTML 源码片段」使用。
   - 约定：任何业务文件**禁止写 `innerHTML =` 或手动拼接 HTML 字符串**，grep `innerHTML` 即可审计。
2. **`web/app.js` 重写**：从 `dom.js` 引入 `el`/`clear`/`$`，消除全部 `innerHTML` 残留，渲染路径统一规范。功能（登录、站点/源站池/缓存/规则/统计/系统/KV 调试等）100% 保留，`web/api.js` 契约与 `window.__BASE__`/`window.API` 注入机制零改动。

---

## 9. 构建与运行

- `build.mjs` 五步构建：
  1. 生成前端入口（`web/_stage.entry.js` + `web/_app.entry.js`）与 `web/_stage.gen.js`；
  2. 把 `web/` 打包进 `src/ui.gen.js`（内联兜底，供无静态托管环境）；
  3. 产出 `dist/public/`（HTML 引用外部 `app.css`/`app.js`，供 Pages 静态托管，最省函数额度）；
  4. 用 esbuild 把 `src/` 打包成单文件 `_worker.js`；
  5. 产物自检（文件完整性 + `_worker.js` 可加载 + 导出面）+ 专项语法校验 + **端到端测试**。
- **端到端测试（`scripts/e2e-test.mjs`）**：build 默认内置执行，用内存 KV mock 跑通「健康检查 → 打开管理面（内联/静态两形态）→ 登录 → `/auth/me` → `/sites`」完整链路，并在 Node 沙箱执行产物前端 JS 断言 `window.API` 挂载；`--skip-verify` 可一并跳过。也可单独 `npm run test:e2e` 或 `node scripts/e2e-test.mjs --all`（cf+eo 两能力集）。这拦截「构建成功但登录后进不去后台」这类运行时问题。
- **前端整链双轨测试（拦截「构建成功但产物不可用」）**：`build.mjs` 步骤 5 在端到端之后追加两道闸：① `scripts/test-frontend-dom.mjs`（**jsdom**，纯 JS 本地秒级）——用 esbuild 把 `web/app.js` 打包成 IIFE，在**真实 DOM** 中模拟「登录 → `enterApp()` → 渲染后台」，断言无 `pageerror`/`console.error`、关键节点（`#view-app`/`#content`）存在、后台可见；② `scripts/e2e-browser.mjs`（**Playwright 无头 Chromium**，CI 真实解析）——加载 build 内联产物 `src/ui.gen.js.UI_HTML`，由真实浏览器引擎执行内联 `<script>`，捕获 `pageerror`/`console.error`，真实点击登录 → 进后台（缺浏览器二进制时优雅跳过）。二者均加载真实 `web/index.html` 的 DOM 骨架（app.js 依赖其中预置根节点），确保测试形态与 build 产物一致；缺依赖不阻断 build。npm 脚本：`npm run test:frontend:dom`、`npm run test:frontend:browser`。
- **EdgeOne 单目录收口**：`edge-functions/`（Edge Function 目录，`[[default]].js` Catch-all 薄壳加载 `_worker.js`，承载数据面 + 管理面 HTML/静态 + `/__panel/api/*` 全部动态请求）、`dist/public/`（静态托管）。全部共用同一份 `_worker.js` 与 KV 命名空间。新版 Makers 下 `edgeone.json` 不写 `routes`，静态与函数冲突时静态优先。
- **Cloudflare 单 runtime**：`_worker.js` 一体运行（数据面 + 管理面），`dist/public` 由 CF Pages 静态托管时管理 UI 走边缘缓存零函数次；直接粘贴 Worker 时自动回退内联 HTML。
- **改任何源码后必须重跑 `npm run build`**，否则线上/本地跑的还是旧产物。
