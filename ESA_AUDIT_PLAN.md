# ESA 适配审查计划（修正版）

> 修正说明：初版审查犯了「照抄 EO 结构」的方法论错误（问题 1/2），且未查官方文档就
> 假设 ESA 行为（问题 2）。本版基于阿里云 ESA 官方文档原文（`esa文档/fetchAPI.md` /
> `RuntimeAPI手册.md` / `Cache API.md`）与项目既有 `caps.js` / `esa.jsonc` 事实重新审查，
> 并纠正了回源 Host 头的误判（问题 3）。

## 一、审查方法论（纠正后）

- ❌ 初版：EO 有 X 分支 → ESA 也该有 X 分支（这是「照搬结构」，不是适配）。
- ❌ 更严重：初版把**代码里 caps.js 写的 `hasStaticHosting=false`** 当成"ESA 官方没有
  静态托管"的事实——这是**循环论证**（代码层的旧假设被当成权威结论）。一切 ESA 逻辑/能力
  **必须以 skill / 阿里云官方文档 / 可获取的官方资料为准**，代码里以前写的假设只是假设。
- ✅ 修正：以 **ESA 官方文档原文** 为唯一事实来源；官方文档缺位时**不做断言**，走不依赖
  该假设的保守路径，并显式标注"待官方确证"。ESA 与 EO 行为不同就分别适配，不复制。
- 所有平台差异补丁仍收口在薄壳 `esa/index.js` 或适配器内，不污染 `src/` 共用逻辑。
- ⚠️ 现状：阿里云帮助中心（help.aliyun.com）对 ESA Pages / 边缘函数文档的抓取全部返回
  404/空页（反爬/动态加载），本地 `esa文档/` 仅有运行时 API 手册、无 Pages 静态托管说明。
  **当前缺官方文档原文，凡涉及 ESA 静态托管语义的结论均标记为"待官方确证"，不落地为断言**。

## 二、基于官方文档的关键事实（已查证）

1. **每请求子请求（fetch）预算——官方两处表述冲突，保守取 4**（待真机实测确证）：
   - 《fetchAPI》L5/L26：「目前**每次可以发起 4 个子请求**；需要 4 个及以上需申请配额」。
   - 《Cache API》：「Cache 的所有 API 操作也是子请求，所以它们和 fetch **共享 32 个子请求**的约束」。
   - 两篇官方文档给出的数字不同（4 vs 32），且官方从未说明二者关系，**不可擅自统一口径**。
     本项目采取保守策略：ESA 运行时预算取较小值 **4**（`caps.js`：
     `maxSubRequests: platform==='esa' ? 4 : …`、`cacheSubreqLimit: platform==='esa' ? 4 : Infinity`）。
     数据面稳态≈2 个 fetch（1 回源 + 至多 1 静态同站），在 4 内安全。
   - 若真机实测证实 32 为有效硬上限，仅需把 caps.js 两处 ESA `4` 改回 `32` 即可（单点收敛）。
   - **对照其它平台**（见 `docs-site/docs/dev/17-platform-limits.md`）：CF 内置默认按 **Free 档 50**（Paid
     1000 可经 `MAX_SUBREQUESTS` 覆盖）；EO 官方「Limits」表**未单列子请求硬上限**，故取
     **100 作为免费档近似上限**（`maxSubRequests = 100`，避免真无限大打爆边缘），同套
     `subreqBudget.js` 守卫已落地。
2. **Fetch 只支持域名、不支持 IP**（第 15 行）→ 与 `caps.hasRawIpFetch=false` 一致。
3. **`host` 头黑名单（第 184-204 行）**：原文「无法读写以下头，**如果您读取会造成
   exception**」。关键点是「读取」客户端 host 内部头会抛异常；**未禁止 fetch 发起时
   设置回源 Host**。回源 Host 是反代基本能力，三平台均支持（caps.js 已确认）。
4. **`AbortController`/`AbortSignal`：官方 fetch 超时章节（33-86 行）给的原生方案是
   `setTimeout`+`Promise.race`，全文未出现 AbortController**。仅说明文档未演示，不等于
   运行时没有该全局类——需真机实测，故保留特性探测降级（不崩，但不断言"ESA 不支持"）。
5. **`request.ignore()`（第 252 行）**：ESA **特有**推荐用法，CF/EO 无。对不打算再读的
   客户端请求调用以复用连接池。这是真正的「贴合 ESA 语法」适配点。
6. **静态托管（✅ 已由阿里云官方文档证实）**：`esa文档/pages.md`（《PAGES构建和路由指南》）
   原文证实 ESA Pages 通过 `assets.directory` 提供静态托管，静态文件按「目录结构直接映射」
   对外暴露（路由表：`/dist/file.html` → `/file`，`/dist/folder/index.html` → `/folder/`）。
   - 故 `dist/public/assets/app.js` 以物理路径 **`/assets/app.js`** 对外可访问（与 EO 同款路径）。
   - 默认模式（不配 notFoundStrategy）下：**未命中静态资源 → 执行 ER 函数**（文档原文）。
   - 管理面浏览器请求 `/{adminPath}/assets/app.js`（带前缀）→ 静态目录无此路径 → 落函数
     → `tryServePanelStatic` 重写为物理 `/assets/*` 后同站 fetch 命中 ESA 静态层。✅
   - 已据实把 `caps.hasStaticHosting` 改为 `platform==='eo'||'cf'||'esa'`（ESA=true）。
   - 初版"ESA 无静态托管"是代码层错误假设，已纠正。

## 三、已执行的修复（状态）

| # | 文件 | 改动 | 状态 |
|---|------|------|------|
| 1 | `src/api/adminPage.js` | 恢复 `tryServePanelStatic` 的 ESA 分支——基于官方《PAGES构建和路由指南》证实的「静态目录直接映射」：`/{adminPath}/assets/*` 落函数后重写为物理 `/assets/*` 同站 fetch 命中 ESA 静态层（理由改为官方目录映射，非抄 EO）；`renderAdminPage` 同时恢复 ESA 外部 `/assets/*` 引用（`hasStaticHosting` 官方证实为 true） | ✅ 修正 |
| 2 | `src/balancer/failover.js` | **纠正** Host 头注释：去掉"ESA 拒绝写入 Host 降级"的错误断言；改为「set 回源 Host 三平台均支持，仅读取 host 会 exception，仅对个别非法值做极薄兜底」 | ✅ 修正 |
| 3 | `src/proxy/engines/fetchEngine.js` | **新增** ESA 真实适配：`request.ignore()`（仅 `platform==='esa'` 且请求有该方法、且非流式客户端 body 时），复用连接池、贴合 ESA 语法（官方 fetchAPI.md 确认） | ✅ 新增 |
| 4 | `esa/index.js` | **修正** `installEsaRuntimePolyfills`：官方《RuntimeAPI手册》明确 ESA 同时支持 `console.log()` 与 `console.alert()`，**不再**把 log 强制重定向到 alert（仅当运行时 `console.log` 缺失时才兜底到 alert）；`Response.json` 兜底保留为防御性探测；`Headers` 兜底收敛（ESA 文档已列 Headers，正常存在） | ✅ 修正 |
| 5 | `src/platform/redis-kv.js` / `fetchEngine.js` | `AbortController` 特性探测降级保留（官方 RuntimeAPI 手册未列 AbortController，不崩，但不断言 ESA 不支持，待真机实测） | ✅ 保留 |

## 四、问题 3 专项结论：回源 Host 头

- **ESA 会拒绝自定义回源 Host 吗？** 不会。官方黑名单约束的是「**读取**客户端 host 头」
  会 exception，本项目只 `set` 不 `get`，ESA 上设置回源 Host 正常生效。
- **对你的影响**：
  - `mode='accel'`（加速域名≠源站域名）或配了 `hh.custom`：ESA 上 `set('Host')` 生效，
    回源 Host 正确，功能正常。
  - 唯一风险：个别非法 Host 值（含端口/非法字符）在严校验平台可能抛——已由极薄 try/catch
    兜底降级为用 URL hostname，不影响正常场景。
- **解法**：无需特殊处理，维持三平台统一的 `set('Host')` 逻辑；初版"ESA 拒绝则降级"的
  错误假设已撤销。

## 五、仍需真机实测确认的项（代码已做防御/适配，行为待验证）

1. **`AbortController` 在 ESA 是否真存在**：已特性探测降级，不存在也不崩；建议真机
   `console.alert(typeof AbortController)` 确认，存在则可去掉降级分支。
2. **`request.ignore()` 在 ESA 是否真存在**：已特性探测（仅 method 存在时调用），无则跳过。
3. **`console.log` / `console.alert` 日志是否真出**：官方《RuntimeAPI手册》确认 ESA 同时支持
   `console.log()` 与 `console.alert()`（log 用于调试环境 debug、alert 用于关键信息输出到日志）；
   代码不再做 log→alert 重定向（避免改变日志语义）。若某 ESA 运行时 `console.log` 缺失，
   仅在此情形下兜底到 alert，不影响正常日志。
4. **ESA 静态资源**：官方《PAGES构建和路由指南》证实 `assets.directory` 对外暴露 `/assets/*`，
   管理面已走外部 `/assets/*` 引用（经 `tryServePanelStatic` 同站 fetch 命中静态层，省额度）。
5. **`cache.delete` 无效**：ESA Cache API 不支持主动刷新（官方 Cache API 文档），管理面
   「刷新缓存」在 ESA 是 no-op（已有 try/catch 兜底），建议管理面提示靠 TTL 过期。

## 六、复现 CF 逻辑、贴合 ESA 语法的原则（收口）

- 薄壳层承载平台差异补丁，绝不污染 `src/` 共用代码。
- ESA 不支持/未证实的能力一律做**特性探测 + 降级**，不抛硬错、不复制 EO 结构。
- 真实适配点（ESA 特有）：`request.ignore()` 连接池复用（官方 fetchAPI.md 确认）。
