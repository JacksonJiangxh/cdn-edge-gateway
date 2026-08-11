# 04 · 配置详解

> **配置详解**
>
> 上一篇：[03 部署指南](./03-deploy.md) ｜ 下一篇：[05 管理面使用教程](./05-user-guide.md)
>
> 返回 [项目首页](../README.md)

> 管理面里每个字段什么意思、怎么填、填错会怎样。按「先池后站」的顺序读。
> 想用 API 批量配见 [API 参考](./10-api-reference.md)；字段校验源码在 `src/config/schema.js`（**唯一数据真相源**）。
> 网页上怎么点见 [管理面使用教程](./05-user-guide.md)。

---

## 0. 配置顺序

上游模型借鉴 nginx 的 `upstream`：**所有上游都是「源站」实体，统一存放在「源站」标签页**，站点只通过 `poolId` 引用它。
源站有两种 `kind`，两者是同一实体的不同形态，引用方式完全一致：

- **单一源站（`kind: "single"`）** —— 恰好 1 个 origin。可以在「源站」页手动建，也可以在**新建/编辑站点时直接填源站地址，由系统自动联动创建**；若已存在地址完全相同的单一源站则直接复用，不会重复创建。
- **源站池（`kind: "pool"`）** —— 多个 origin + 负载均衡策略（链式/轮询/随机/加权/哈希）。**只能在「源站」页点「+ 新建源站池」创建**，可被多个站点与规则共享。

> 因此不再有「内联源站」的说法：站点里填的地址一样会成为「源站」页里的一条记录。
> 每条源站都带**引用字段**，显示被多少对象引用、分别是谁（站点默认源站 / 站点规则 / 全站通用规则）；存在引用时禁止删除，避免误删导致 502。

还有一条铁律：**规则按 `priority` 从高到低匹配，命中即停。** 想让某条规则先生效，把它的优先级调高（数字大）。

---

## 1. 源站（Origin / Pool）

一条「源站」= 一个可被站点与规则引用的上游。`kind` 决定它是单一源站还是源站池；
两者同表存储（KV key 均为 `pool:{id}`）、同一引用方式，只是能力范围不同。

| 字段 | 说明 | 默认值 |
|---|---|---|
| `id` | 机器主键，**系统自动生成**（格式 `pl_xxxx`），用户不可填；站点用 `poolId` 引用此值 | 新建时系统生成 |
| `name` | 用户友好名称（给人区分用的展示标签，可重复、可选）。即界面上的「名称」输入框 | 空（回退显示 id） |
| `kind` | `single`=单一源站（恰好 1 个 origin，可由站点联动创建）；`pool`=源站池（多 origin + 调度） | `single` |
| `strategy` | 调度策略：`chain` / `roundrobin` / `weighted` / `random` / `iphash`。`kind:"single"` 时恒为 `chain` 且界面隐藏 | `chain` |
| `origins[]` | 源站列表（见下表）。`kind:"single"` 时**只能有 1 项**，多于 1 项会被拒绝 | 必填，至少 1 个 |
| `createdBy` | 由站点联动自动创建时记录来源站点 host，纯展示用 | 空 |
| `failover` | 故障转移：`enabled` / `maxRetries`（重试次数） / `timeoutMs`（单源超时） / `retryOn`（遇这些状态码则换源，如 `[500,502,503,504,522,524]`） | 见默认 |
| `pathPrefix` | 整池回源时统一加的路径前缀（如 `/repo`，不能含域名） | 空 |
| `stickyTtl` | ⚠️ **规划中（当前未实现）**：设计上仅 `iphash` 策略生效，表示会话保持时长（秒）；当前 `src/config/schema.js` 的 `OriginPool` 校验不含此字段，配置无效，请勿填写 | — |

> **ID 与名称的分工**：`id` 是给机器/接口引用用的内部主键，由系统保证唯一，用户**绝不手动填写**（新建时后端自动生成，编辑时不可改）。给人看的「区分字段」是 `name`，可重复、可中文、可留空。站点 `poolId` 引用的是系统 `id`，不是 `name`。
>
> **引用与删除**：`GET /pools` 会为每条源站附带 `refs[]`（谁在引用）、`refCount`、`deletable`；`GET /pools/:id/refs` 可单独查询引用明细。只要 `refCount > 0` 就无法删除，需先把引用改指到其它源站。站点数量过多导致引用无法扫全时，删除同样会被保守拒绝。

### origins[] 单项

| 字段 | 说明 | 示例 |
|---|---|---|
| `addr` | 源站地址（**只写 host，不要带路径/协议**，路径用 `pathPrefix`） | `storage.example.net` |
| `scheme` | 协议：`http` / `https` | `https` |
| `port` | 端口（一般留空，按 scheme 自动 80/443） | `443` |
| `weight` | 权重（`policy=weighted` 时生效） | `1` |
| `order` | 顺序（`policy=chain` 时，数字小先尝试） | 自动 |
| `enabled` | 是否参与调度 | `true` |
| `engine` | 回源引擎：`fetch`（通用）/ `socket`（TCP 裸 IP，**仅 Cloudflare Workers**）/ `r2`（**回源到 R2 桶，仅 Cloudflare**，不走公网） | `fetch` |
| `extraHeaders` | 回源额外带上的请求头（键值对） | — |
| `hostHeader` | 回源 Host：`inherit`(用 addr) / `origin`(用源站) / `client`(用访问域名) / `custom` | `inherit` |
| `sni` | TLS SNI（高级，一般留空，仅 socket 引擎生效） | 空 |

> 常见坑：把 `https://oss.com/path` 整段塞进 `addr` → 校验报错「源站地址不应包含路径，请用 pathPrefix 字段」。正确做法：`addr=oss.com` + `pathPrefix=/path`。

> **自定义回源 Host 的跨平台能力矩阵**（核心）：
> | 场景 | CF Workers (`engine=socket`) | CF Pages | EdgeOne Makers |
> |---|---|---|---|
> | 域名源站 + 自定义 Host | ✅ socket 全功能 | ⚠️ fetch 自动按域名设 Host | ✅ fetch 注入 Host 生效 |
> | 裸 IP + 自定义 Host + SNI | ✅ socket 全功能 | ❌ 无 socket | ⚠️ 代码层无 SNI；用 **EO 平台级「源站组回源 Host 重写」** 兜底 |
>
> - **CF 端**：自定义回源 Host（含裸 IP）必须用 **Workers 形态部署**（`wrangler deploy`）。`cloudflare:sockets` 由 `src/proxy/engines/socketEngine.js` **运行时动态 `import`**，**无需在 `wrangler.toml` 声明 `sockets` 兼容标志**（`compatibility_flags` 仅有 `nodejs_compat`；加 `sockets` 反而会因 workerd 无此 flag 导致启动失败，见 `wrangler.toml` 注释）。CF Pages 形态无 socket，只能域名源站自动 Host。
> - **EO 端**：边缘函数 `fetch` 允许向外部自定义 Host 设置 Host 头，故「域名源站 + 自定义 Host」代码层即可实现；「裸 IP + 自定义 Host + SNI」则配 **EO 源站组 + 回源 Host 重写**（控制台/规则引擎），Makers 函数只 `fetch` 到该源站组，Host 由 EO 平台注入。平台侧完整操作步骤见 [eo-origin-host.md](./07-eo-origin-host.md)。
> - `engine=fetch` 时在 Cloudflare 上设 `hostHeader=client/custom` 会被静默丢弃（警告），但路由逻辑仍会注入；在 EdgeOne 上注入生效，无需改 `engine`。

### origins[] 的 `engine: 'r2'`（回源到 R2 桶，仅 Cloudflare）

这是最省、最绕不开公网的回源方式：不走 `fetch` 你的 R2 自定义域名（那等于「边缘 → 公网 → 绕回边缘 R2 公共端点」），而是 **Worker 进程内直接调用 R2 绑定**，全程走 Cloudflare 骨干网，不出公网、不计 egress 带宽费。

**前置条件（wrangler.toml 绑定）：**

```toml
[[r2_buckets]]
binding = "CDN_R2"        # 必须与源站 r2Binding 完全一致
bucket_name = "cdn-assets"
```

> 绑定名（`binding`）和桶名是两个独立选择项：先在 R2 控制台/命令行创建桶（如 `cdn-assets`），
> 再把它的**绑定变量名**填到 `[[r2_buckets]].binding`（本例 `CDN_R2`），源站配置里的 `r2Binding` 填同一个变量名。
> 桶**无需**开启 Public Access / 自定义域——Worker 鉴权读取即可，更安全。

**`engine:'r2'` 专有的源站字段：**

| 字段 | 说明 | 示例 |
|---|---|---|
| `r2Binding` | R2 绑定名（必须等于 wrangler.toml 的 `binding`） | `CDN_R2` |
| `r2KeyPrefix` | 拼到 key 前面的固定前缀（桶内「目录」隔离，多站点可共用一桶） | `img/` |
| `r2KeyMode` | pathname → R2 key 的转换方式 | `none`（默认）/ `prefix` / `strip` / `regex` |
| `r2KeyPrefixRule` | `prefix` 时加在前面的串；`strip` 时要剥除的开头；`regex` 时的正则 | `/cdn` |
| `r2KeyRegexTo` | `regex` 模式下的替换值 | `` |
| `r2ContentType` | R2 对象缺 content-type 时的兜底类型 | `application/octet-stream` |

> key 的计算顺序：**规则级 rewrite（pathPrefix/正则等）先作用到 pathname**，再由本表的 4 个字段做「最后一步」处理。
> 最终 key = `r2KeyPrefix` + pathnameToKey(pathname)。R2 key 不区分目录，只是普通字符串。

**示例 1：原样映射（pathname 即 key，最常用）**

```json
{
  "addr": "", "engine": "r2", "r2Binding": "CDN_R2", "r2KeyMode": "none"
}
```
访问 `/poster/ab.jpg` → 读 R2 key `poster/ab.jpg`。

**示例 2：桶内统一加前缀（共享一桶多站点）**

```json
{ "engine": "r2", "r2Binding": "CDN_R2", "r2KeyPrefix": "site-a/", "r2KeyMode": "none" }
```
访问 `/a.png` → 读 R2 key `site-a/a.png`。

**示例 3：剥除访问前缀（对外暴露 `/cdn/...`，桶内不要 `/cdn`）**

```json
{ "engine": "r2", "r2Binding": "CDN_R2", "r2KeyMode": "strip", "r2KeyPrefixRule": "/cdn" }
```
访问 `/cdn/x/y.png` → 读 R2 key `x/y.png`。

**示例 4：正则改写 key**

```json
{ "engine": "r2", "r2Binding": "CDN_R2",
  "r2KeyMode": "regex", "r2KeyPrefixRule": "^/v1/", "r2KeyRegexTo": "/v2/" }
```
访问 `/v1/foo.png` → 读 R2 key `/v2/foo.png`。

> 注意：非 Cloudflare 平台（如 EdgeOne）没有 R2 binding，`engine:'r2'` 会在运行时返回 502，请改用 `fetch` + 私有签名回源或平台对象存储方案。

---

## 2. 站点（Site）

一个站点 = 一个加速域名（支持 `*.example.com` 泛域名）。

| 字段 | 说明 | 默认 |
|---|---|---|
| `host` | 加速域名（站点 key） | 必填 |
| `enabled` | 是否启用（关闭后该域名不走加速） | `true` |
| `poolId` | **必填**。站点默认上游，引用一条源站的 id（`kind` 为 `single` 或 `pool` 均可）。写入时若改为直接提交 `origins`（单个地址），后端会自动创建一条 `kind:"single"` 源站并把 id 回填到此字段 | 必填 |
| `defaultHostHeader` | 站点级默认回源 Host：`accel` / `origin` / `custom` | `accel` |
| `ipv6Support` | 是否允许 IPv6 回源 | `false` |
| `rules[]` | 规则引擎（见下） | 空 |
| `security` | 安全策略（见 §4） | 关 |
| `cacheGen` | 缓存代次（改它可一键让旧缓存失效） | `0` |

### 2.1 规则引擎 rules[]

每条规则 = 「**什么时候生效（match）**」 + 「**做什么（action）**」。规则按 `priority` **降序**匹配，命中即停。

```jsonc
{
  "id": "r_abc",          // 自动生成，勿手改
  "priority": 50,         // 越大越先匹配
  "enabled": true,        // 关闭则该规则跳过
  "match": { ... },       // 见 2.2
  "action": { ... }       // 见 2.3
}
```

#### 2.2 match（匹配条件）

**方式一：简易快捷条件**（仍可用，适合单条件）
| 字段 | 说明 | 示例 |
|---|---|---|
| `pathPrefix` | 路径前缀（自动补 `/`） | `/images` |
| `pathRegex` | 路径正则（上限 200 字符，做 ReDoS 防护） | `^/api/.*\.json$` |
| `extIn` | 扩展名列表（自动转小写、去点） | `["jpg","png"]` |
| `methodIn` | HTTP 方法列表 | `["GET","HEAD"]` |

**方式二：可视化多条件（推荐，更灵活）** —— `match.conditions` 是**二维数组**：

```
conditions: [
  [ 条件A, 条件B ],   // 这一组里 A 且 B 同时成立
  [ 条件C ]           // 或者 仅 C 成立
]
外层 = OR（满足任意一组即可），内层 = AND（组内全部满足）
```

每个条件对象的字段：

| 字段 | 说明 |
|---|---|
| `target` | 匹配对象（完整枚举）：`host` / `path` / `fullUrl` / `query` / `extension` / `filename` / `directory` / `method` / `protocol` / `header` / `cookie` / `clientIp` / `clientCountry` / `userAgent` / `referer` / `origin` |
| `op` | 操作符：见下方表格 |
| `key` | 当 `target=header/cookie` 时必填（头的名字，如 `x-token`） |
| `values[]` | 匹配值列表（多值之间 OR）；`op=exists/notExists` 时不需要 |
| `ignoreCase` | 是否忽略大小写（默认 true） |

> ⚠️ 旧版命名已废弃：`asn`/`country`/`scheme` 不再是 `target` 枚举（改为 `clientCountry`/`clientIp` 等）；`eq`/`neq`/`in`/`notIn`/`contains` 已更名为下方标准操作符，旧名会被 schema 校验**拒绝**（视为无效条件跳过）。请使用下表名称。

常用操作符 `op`：

| op | 含义 | 示例 |
|---|---|---|
| `equal` | 等于（任一值） | `path` `equal` `/robots.txt` |
| `notEqual` | 不等于 | `method` `notEqual` `POST` |
| `contain` | 包含 | `userAgent` `contain` `bot` |
| `notContain` | 不包含 | |
| `prefix` | 前缀为 | `path` `prefix` `/api` |
| `notPrefix` | 前缀不为 | |
| `suffix` | 后缀为 | `path` `suffix` `.webp` |
| `notSuffix` | 后缀不为 | |
| `regex` / `notRegex` | 正则匹配 / 不匹配 | `path` `regex` `^/v\d+/` |
| `exists` / `notExists` | 头/参数存在 / 不存在 | `header` `key=x-token` `exists` |

> 方式一里的 `pathPrefix` / `pathRegex` / `extIn` / `methodIn` 是等价的快捷写法，会映射到上述 `target`+`op`（`extIn` ≈ `extension` `contain`、 `pathPrefix` ≈ `path` `prefix`）。
> 没有条件 = 匹配所有请求（常用于「整站默认动作」兜底规则）。

#### 2.3 action（动作）

一条规则可以挂多个动作，**同时生效**：

| 字段 | 说明 | 默认 |
|---|---|---|
| `poolId` | 命中后改用哪条源站（`single` / `pool` 均可；不填则用站点默认源站） | 站点默认 |
| `rewrite` | 路径重写（见下） | `none` |
| `hostHeader` | 回源 Host：`inherit` / `origin` / `client` / `custom` | `inherit` |
| `clientIpHeader` | 回传给源站的客户端 IP 头 | `{enabled:false, name:'X-EdgeGateway-Client-IP'}` |
| `forceHttps` | 是否强制跳转 HTTPS | `false` |
| `forceHttpsStatus` | 跳转码：`301` / `302` / `307` / `308` | `301` |
| `redirect` | 访问 URL 重定向 `{enabled,status,target,keepQuery}` | 关 |
| `directResponse` | 直接返回固定响应（不走源站）`{enabled,status,contentType,body}` | 关 |
| `reqHeaders` | 改**请求**头（回源前）`{set:{},remove:[]}` | 空 |
| `respHeaders` | 改**响应**头（返回前）`{set:{},remove:[]}` | 空 |
| `followRedirect` | 回源跟随 3xx（最多 3 次） | `false` |
| `originTimeoutMs` | 回源超时（0=用引擎默认，上限 120000ms） | `0` |
| `engine` | 回源引擎（⑨ Origin Rules 连接参数）：`''`=沿用源站 / `fetch` / `socket` / `r2` | `''`（沿用源站） |
| `scheme` | 回源协议（⑨ Origin Rules 连接参数）：`''`=沿用源站 / `http` / `https` | `''`（沿用源站） |
| `port` | 回源端口（⑨ Origin Rules 连接参数）：`0`=沿用源站（按 scheme 取 443/80） | `0`（沿用源站） |
| `cache` | 规则级缓存（见下） | 关 |

> **回源连接参数与旧版「源站级规则」的关系**：早期版本把 `engine` / `scheme` / `port`
> 直接写在每个源站对象上作为「源站级规则」。新版流量序列统一为**纯两层架构**（全站级 + 站点级），
> 这些物理属性改由 **⑨ Origin Rules** 的 `action.engine` / `action.scheme` / `action.port` 表达：
> 用匹配条件 `回源目标 = 某源站id` + 上述连接参数动作，即可在一条流量线上表达
> 「不同源站走不同端口 / 协议 / 引擎」。规则未设（空串/0）时回退源站自身属性，向后兼容。

**rewrite（路径重写）**
| `type` | 行为 | 配置 |
|---|---|---|
| `none` | 不改 | — |
| `prefix` | 加前缀 | `value`（如 `/raw`） |
| `strip` | 去前缀 | `value`（如 `/public`） |
| `regex` | 正则替换 | `regexFrom` + `regexTo` |

> 例：访问 `/public/a.png` → 重写 `strip /public` → 实际回源 `/a.png`。

**cache（规则级缓存）**
| 字段 | 说明 |
|---|---|
| `enabled` | 是否启用本规则缓存 |
| `edgeTtl` | 边缘缓存 TTL（秒，0=不缓存） |
| `browserTtl` | 浏览器缓存 TTL（-1=跟随源站） |
| `ignoreQuery` | 忽略全部查询参数做缓存键 |
| `queryWhitelist` | 仅这些查询参数计入缓存键 |
| `key` | 缓存键维度：是否带 Cookie/Authorization 等 |
| `statusTtl` | 不同状态码的 TTL（如 404 缓存短一点） |
| `preRefresh` | 缓存即将过期时后台刷新（防穿透） |
| `offlineCache` | 源站挂了也用过期缓存兜底（stale-while-error） |
| `staleWhileRevalidate` | 边缘过期后仍可先返回旧内容并后台刷新（秒） |
| `cacheGen` | 缓存代次（站点级，改它可让旧缓存键失效） |

> **缓存的本质（重要）**：本程序只是运行在 CF Workers/Pages、EO Pages 上的边缘处理代码，**自身无持久存储，不具备真实硬盘缓存**。缓存完全依赖底层边缘：
> - **Cloudflare**：用 `caches.default` API 直接存一份，同时下发 `Cache-Control` / `CDN-Cache-Control` 让 CF 边缘也按头缓存。但 **CF 生产环境真正的缓存权威是面板两条规则**，必须成对设置，否则源站返回的头（如 `no-store`/`private`）会反客为主：
>   - **Cache Rules（请求/命中侧）**：决定"存不存、存多久"（`Cache eligibility`、`Edge TTL`、`Browser TTL`、`Origin Cache-Control = Ignore if present` 覆盖源站头）。
>   - **Cache Response Rules（响应侧，Modify cache response headers and tags）**：在响应离开边缘前改写 `Cache-Control`/`CDN-Cache-Control`、加 `Cache-Tag`、清掉 `Set-Cookie` 等。本项目代码下发的头只是跨平台兜底，CF 上以这两条面板规则为准。
> - **EdgeOne（1+1 架构）**：没有 `caches.default` API，但边缘缓存能力真实存在，走两条路径：
>   - **路径 B 响应头委托**：网关下发 `CDN-Cache-Control`，由 EO 边缘按头缓存（`edgeTtl` 决定 TTL）——所有 EO 请求都享受。
>   - **路径 A 同站 fetch 委托节点缓存**：对「无自定义回源 Host 的可缓存请求」，边缘函数内 `fetch(同站加速域名)`（HOST 与 host 头一致）走 EO 节点缓存，**命中零函数调用、未命中由 EO 按平台源站组回源**。需预先在 EO 控制台配好源站组 + 回源 Host 重写（见 `docs/07-eo-origin-host.md`）。
>
> **本项目已自动遵循「最前端 CDN 为最终依据」的分层铁律**（`src/proxy/headers.js` 的 `buildClientHeaders`）：可缓存响应自动下发 `Cache-Control: public, max-age=1800, immutable`（浏览器 30 分钟）+ `CDN-Cache-Control: public, max-age=15552000`（边缘半年），并**主动剥离源站带回的 `set-cookie`/`pragma`/`no-store`/`private`/`expires=0`**；开启 `cache.enabled` 但未给 TTL 时回落到半年/30 分钟默认（常量 `TIER_CDN_DEFAULT_EDGE_TTL`/`TIER_CDN_DEFAULT_BROWSER_TTL`）。即模板开箱即符合铁律，CF/EO 面板规则是把最前端权威再钉死一层。详见部署文档「分层缓存架构部署方案」。
>
> 因此「缓存」是**可控的头设置 / 同站 fetch 委托让边缘去缓存**，不是本程序自己存。这也带来一个 EO 下的限制：`cacheGen` 整站清除只作用于 `caches.default`（CF），**EO 下无法主动按键清除**，只能等 TTL 自然过期或用 `Cache-Tag` + 平台 purge。

---

## 3. 安全（Security）

挂在**站点** `security` 下，也可在**全局** `global.security` 兜底（逐层生效，白名单优先）。

| 能力 | 字段 | 说明 |
|---|---|---|
| 防盗链 | `refererMode` | `off` / `whitelist`(白名单) / `blacklist`(黑名单) |
| | `refererList` | 允许的 Referer 域名列表（自动转小写） |
| | `allowEmptyReferer` | 是否放行空 Referer（直接访问） |
| UA 过滤 | `uaBlacklist` | 命中即拦截的 UA 列表 |
| IP 控制 | `ipBlacklist` | 拦截的 IP/CIDR 列表（**单条最多 64 字符**，总条数上限 200） |
| | `ipWhitelist` | 放行名单（优先于黑名单；全局级也可设 `global.ipWhitelist`）（**单条最多 64 字符**，总条数上限 200） |
| 签名 URL | `signedUrl` | `{enabled, secret, ttl, param}`：开启后需带有效签名才能访问，`ttl` 过期失效，`param` 默认 `sign`。⚠️ **实验特性（待开发）**：校验侧已生效，但内置签名链接**签发工具尚未提供**，需自行用 HMAC-SHA256 生成带签 URL |
| 限流 | `rateLimit` | `{enabled, rpm}`：单 IP 每分钟请求数上限，超限返回 429 |

> 全局 `global.security` 与 `global.ipWhitelist` 对所有站点兜底；站点级可覆盖细化。

---

## 4. 统计（Stats）

| 项 | 说明 |
|---|---|
| `statsDriver` | `kv`（默认）或 `d1`。EO 无 D1，用 `kv` 即可 |
| 落盘 | 内存聚合 + 批量写；D1 首次自动建表 |
| 查看 | 管理面「统计」页（总览 / 单站点） |

---

## 5. 全局配置（Global）

读取/更新：`GET/PUT /{ADMIN_PATH}/api/config/global`（默认段 `__panel`，即 `GET/PUT /__panel/api/config/global`）。常用字段：

| 字段 | 说明 | 默认 |
|---|---|---|
| `statsDriver` | `kv` / `d1` | `kv` |
| `imageOptimization` | 图片优化（webp/avif 协商，仅 CF） | 关 |
| `disguise` | 把 `Server` 伪装成 nginx（隐藏网关） | 关 |
| `logLevel` | 日志级别 | `info` |
| `security` | 全局安全兜底 | 见上 |
| `ipWhitelist` | 全局 IP 白名单（对管理面也生效） | 空 |
| `globalRateLimit` | 全局入口请求频率上限（req/s），0 表示不限制，最少 10 ⚠️ **实验特性（待开发）**：当前为实验阶段，不建议生产依赖 | 0 |

---

## 6. 全局变量（部署时设，非配置字段）

下面这 **6 个变量是生产环境必填全集**。它们分三类，注入位置各不相同，但**少一个生产就跑不通或第一层防护失效**：

| 变量 | 类型 | 何时生效 | 说明 | 必填 |
|---|---|---|---|---|
| `ADMIN_PASSWORD` | **Secret**（加密） | 运行时 | 管理面初始登录密码 | 是 |
| `JWT_SECRET` | **Secret**（加密） | 运行时 | 登录态签名，`openssl rand -hex 32` 生成 | 是 |
| `ADMIN_PATH` | **不进变量页** | 运行时（KV） | 管理面入口前缀（浏览器访问用），建议随机串（**第一层防护**）；由管理面保存到 KV，优先级最高，部署时用默认 `__panel` 兜底 | 否（部署后管理面改） |
| `CLOUD_PLATFORM` | Variable（明文） | 运行时 | `edgeone`(EO) / `pages`(CF Pages) / 不填(CF Workers) | EO/Pages 必填 |
| `CLOUDFLARE_API_TOKEN` | Secret（CI 用） | CI 运行时 | CF 部署令牌（Workers:Edit 或 Pages:Edit） | 仅 CI |
| `EO_SECRET` | Secret（CI 用） | CI 运行时 | EO Pages API Token | 仅 CI |

> **为什么这些运行时变量必须一起配齐？**
> - `ADMIN_PASSWORD` + `JWT_SECRET` 是管理面能不能登录的门槛，明文 Variable 等于把后台密码公开。
> - `ADMIN_PATH` 是**隐藏后台入口前缀**（浏览器访问用），第一层防护（见下方说明）。
> - `CLOUD_PLATFORM` 决定运行时降级逻辑，**填错或漏填会让 EO/Pages 功能残缺**（如 EO 无 `nodejs_compat` 行为差异、caches 不可用被静默降级）。
> - 平台令牌只用于 CI 自动部署，手动部署（05 各方式）不需要。

### `ADMIN_PATH` 只是「运行时入口前缀」，构建期完全不读它

本项目的架构把 **「对外入口前缀」** 与 **「内部实现路径」** 彻底解耦：

- **对外（浏览器访问）**：`https://你的域名/{ADMIN_PATH}` 与 `https://你的域名/{ADMIN_PATH}/assets/*`。`ADMIN_PATH` 就是这层"隐藏入口"，任意随机串都行。
- **对内（代码寻址）**：管理面路由、静态资源一律用**固定内部路径**（`/{adminPath}` 匹配后映射到固定的 `/assets/*` 物理资源）。`build.mjs` **不读取** `ADMIN_PATH`，静态资源固定输出到 `dist/public/assets/`。

因此：

- **`ADMIN_PATH` 是纯运行时值**：运行时优先级 **KV 显式配置（管理面保存） > 内置默认 `__panel`**。env 层（若用户在 Dashboard 主动设了 `ADMIN_PATH`）也作为兜底生效，但**推荐用法不是变量**。
- **改 `ADMIN_PATH` 不需要重新构建**：在管理面改完存 KV 即生效，彻底消除了「构建期与运行时取值不一致导致管理面 404」的坑。
- **不要在变量页面设 `ADMIN_PATH`**：部署脚本刻意不传该变量，根 `wrangler.toml` 也不写死，使变量页面不出现它——避免小白误以为入口一直是 `__panel`、而实际 KV 里已是别的值。正确做法：
  1. 部署后用默认前缀 `__panel` 访问管理面（`https://域名/__panel`）；
  2. 在管理面把「管理面路径」改成你的随机串并保存 → 存入 KV；
  3. 之后运行时读 KV 的值（最高优先级生效），用新前缀访问。
  （若你确实在 Dashboard 主动设了 `ADMIN_PATH` 变量，运行时 env 层仍会兜底生效，见 `src/config/store.js`，但这不是推荐路径。）

> **Workers 形态（05 方式 ①② / CNB deploy_cf_workers / GitHub deploy-cf-workers）曾经的大坑已消除**：
> 旧设计 build 期读 `ADMIN_PATH` 决定产物路径，若 toml 改了而 build 前没 `export` 同名变量，上线后管理面 404。新架构 build **完全忽略** `ADMIN_PATH`，此坑不再存在。
> 另，**`ADMIN_PATH` 写进 `wrangler.toml [vars]` 会被 `wrangler deploy` 覆盖掉 Dashboard 已设的 Secret**，且会让变量页面出现该值误导小白（2026-08-11 部署事故根因之一）。现已改为：**根 `wrangler.toml` 不再写死 `ADMIN_PATH`，部署脚本 `gen-deploy-config.mjs` 刻意不传该变量**——运行时用内置默认 `__panel` 兜底，部署后由用户在管理面改成随机串存进 KV（最高优先级生效）。手动部署请统一用 `npm run deploy:cf`。

### ⚠️ `ADMIN_PATH` 的暴露面（已修复）

`ADMIN_PATH` 是"隐藏后台"的第一层防护。早期构建会在站点根 `dist/public/index.html` 内联 `window.__BASE__='/{ADMIN_PATH}'`，部署根目录 `.` 时任何人访问 `/` 即可在源码看到后台路径；且静态资源按 `/{adminPath}/assets/` 输出，路径本身也暴露。

**本项目已修复**：
- `build.mjs` 不再把路径写进公开的根 `index.html`，资源固定输出到 `dist/public/assets/`（不含 adminPath）。
- 前端 `api.js` 在运行时从 `location.pathname` 第一段自动推导 BASE；管理面经 Worker 端 `renderAdminPage` 时再注入真实 BASE（`no-store`，仅 `/{ADMIN_PATH}` 路由响应）。
- 公开页不再泄露后台路径，管理面功能不受影响。

仍需注意的纵深防护原则：

1. **不依赖路径隐藏，靠强密码 + JWT**：`ADMIN_PATH` 只"减少被扫到的概率"，真正的鉴权是 `ADMIN_PASSWORD` + `JWT_SECRET`。路径即使被猜到，无密码也无法登录。
2. **定期更换 `ADMIN_PATH` 无需重建**：改完运行时变量重新部署即可，比旧设计更安全省事。

> 本地 `.dev.vars` / 密钥仓库已含上述值，生产**密钥类一律在平台 Dashboard / CI Secret 设，绝不写进会被提交的仓库文件**。

---

## 7. 配置备份

管理面「系统 → 配置备份」一键**导出 / 导入**完整 JSON。导出是下载到本地，不外传任何服务器。迁移环境时直接导入即可。
