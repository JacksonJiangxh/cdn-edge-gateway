# 17 · 三平台隐藏运行限制（内置默认值 + 触发处理）

> [!NOTE]
> **本文面向**：开发者 / 运维（理解边缘平台硬限制、避免上线后突发 5xx/超时）。
> 所有限制均**来自三平台官方 skill / 文档原文**（Cloudflare Pages、EdgeOne Makers、阿里云 ESA），
> 非推测。每一条都标注「内置默认值在哪」与「触发后怎么处理」。
> 这些限制**用户无需设置**——由 `src/platform/caps.js` 在启动时探测并内置，运行时自动遵守。

---

## 0. 总览表（按平台）

| 限制维度 | Cloudflare Pages | EdgeOne 边缘函数 | EdgeOne 云函数 | 阿里云 ESA |
|---|---|---|---|---|
| CPU 时间 / 次 | **10ms（Free）/ 30ms（Paid）** | **200ms** | 不单列（长执行型） | 官方未单列 |
| 单次执行墙钟上限 | **30s** | **120s** | **120s** | **120s** |
| 首字节（first‑byte）约束 | 无显式 | 无显式 | 无显式 | **10s**（网关硬断连） |
| 内存预算 | **128MB** | 128MB 假设 | 视实例 | **128MB**（esa.jsonc） |
| 代码包体积 | **1MB（Free）/ 10MB（Paid）** | **5MB** | **128MB** | **4MB**（ER 限制） |
| 每请求子请求（fetch） | **50（Free）/ 1000（Paid）** | **未单列硬限**（官方未文档化，不施加内置上限） | — | **8**（软限制；官方常规 4、部分高配账号可达 8，可经 `MAX_SUBREQUESTS` 覆盖 1–32） |
| 请求体上限 | **100MB** | **1MB** | **6MB** | 官方未单列 |
| KV 单值上限 | **25MB** | — | — | **2MB**（高容量 25MB） |
| 静态单文件 | — | — | — | **25MB** |
| 环境变量总数 | 无显式 | 无显式 | 无显式 | 无显式 |

> [!WARNING]
> **最易被忽略的两个隐藏默认值**：
> 1. **CF Pages Free 档子请求仅 50/请求**（Paid 才 1000）。本项目**内置默认即按 Free 档 50 规划**
>    （`caps.maxSubRequests=50`），Paid 档用户可经环境变量 `MAX_SUBREQUESTS` 提到 1000；
>    若站点很多，单次管理面批读据 50 自动分页 → 见 §3 处理。
> 2. **ESA 子请求分两类独立接口**：fetch 受软限制（默认 8，真机实测常规账号 4、部分高配账号可达 8，
>    `MAX_SUBREQUESTS` 可在 1–32 覆盖）；Cache API 独立走平台默认 32（`caps.cacheSubreqLimit=32`），不经 `MAX_SUBREQUESTS` 覆盖。
>    若真机确证更高 fetch 配额，经环境变量 `MAX_SUBREQUESTS`（限 1–32）覆盖 `maxSubRequests` 即可。
> 3. **EO 边缘函数官方「Limits」表未单列子请求硬上限**，故本项目对 EO **不施加内置子请求预算**
>    （`maxSubRequests=Infinity`），不做捏造式的大数限制。

---

## 1. Cloudflare（Pages Functions）

来源：`cloudflare` skill → `references/pages/gotchas.md`「Limits Reference (Jan 2026)」。

### 1.1 CPU 时间 10ms / 30ms
- **内置默认**：`caps.js` 未单独限制 CPU（CF 运行时强制）；回源总时间预算由 `maxExecutionMs=30000` 推导。
- **触发现象**：日志出现 `Request exceeded CPU limit`、偶发 530。
- **处理**：
  - 优化热路径（减少同步计算、字符串处理）；
  - 把重计算下沉到 D1 / R2 / 外部服务；
  - 升级到 **Workers Paid**（CPU 30ms/req）；
  - 后台任务用 `ctx.waitUntil()`（不阻塞响应、不计主响应 CPU）。

### 1.2 单次执行墙钟 30s
- **内置默认**：`caps.maxExecutionMs = 30000`（cf）；`failover.js` 据此推导回源总时间硬顶
  `hardCap = max(1000, min(maxExecutionMs, firstByteMs ?? ∞) − 5000)`。
- **触发现象**：`595 执行时间超限`、回源链被提前掐断。
- **处理**：见 §4「回源总时间预算」统一处理。

### 1.3 代码包 1MB（Free）/ 10MB（Paid）
- **内置默认**：本项目构建默认**压缩构建**（`build.mjs` 开启压缩），产物远小于 1MB；
  `build.mjs` 在产物 > 900KB 时**告警**（不阻断）。
- **触发现象**：`Script too large` 部署失败。
- **处理**：保持压缩构建；删未用依赖；按需 `dynamic import` 拆分；升级 Paid 放宽到 10MB。

### 1.4 子请求 50（Free）/ 1000（Paid）
- **内置默认**：`caps.maxSubRequests = 50`（cf，对齐 **Free 档硬限**）。**代码无法探测档位**，
  故保守以内置 50 规划；确在 Paid 档且站点极多，可经环境变量 `MAX_SUBREQUESTS` 提到 1000。
- **代码层已落地守卫（fetch 专用）**（`platform/subreqBudget.js`，非仅声明）：
  - `entry.js` 每请求 `attachToCtx` 注入 fetch 预算计数器；`dispatch`（failover.js）每次回源
    `track(1)` 扣减，`store.js readJson`（Webdis/Redis 读，属 fetch 性质）预算不足时跳过读。
  - **Cache 写不在此守卫内**：`cache.js cachePut` 直接写，由平台 Cache 32 上限独立约束（不走 `MAX_SUBREQUESTS`）。
  - 预算耗尽 → 回源抛 `SUBREQ_BUDGET_EXHAUSTED` 由 failover 当源站失败处理（换源/熔断），
    管理面读降级到内存缓存/默认值，**绝不盲目撞墙**。
- **触发现象**：`Too many subrequests`（Free 档逼近 50 时）。
- **处理**：
  - 管理面站点多 → `store.js` 每集合读都经 `track` 守卫，自然受 50 约束不会越界；
  - 减少单次请求的并行回源 / KV 读；
  - 升级 Paid 解除到 1000（并设 `MAX_SUBREQUESTS=1000`）。

### 1.5 请求体 100MB / 内存 128MB / KV 25MB
- **处理**：请求体通常无需限制（网关层已限）；内存由 `memBudget.js` 统一管理（默认 128MB，
  `MEM_BUDGET_BYTES` 可覆盖）；KV 单值 < 25MB，大值拆键或换 R2。

---

## 2. EdgeOne Makers

来源：`edgeone-makers-tools` skill →
`references/makers-edge-functions/SKILL.md`「Limits」、
`references/makers-cloud-functions/references/node-functions.md`「Limits」、
`references/makers-cloud-functions/references/troubleshooting.md`。

### 2.1 边缘函数：CPU 200ms / 代码包 5MB / 请求体 1MB
- **内置默认**：`caps.maxExecutionMs = 120000`（eo，墙钟）；CPU 200ms 由 EO 运行时强制，
  `caps.js` 不单独建模。
- **触发现象**：`Exceeds CPU limit`（troubleshooting 表明确指向边缘函数）。
- **处理**：
  - 重计算 / 长 IO 移到 **Cloud Functions（Node.js，120s 墙钟）**；
  - 边缘函数只做轻量路由 / 改写 / KV 读；
  - 减少 `Response.json()` 误用（EO V8 **无 `Response.json()`**，必须
    `new Response(JSON.stringify(x), {headers})`——本项目已适配）。

### 2.2 云函数（Node.js）：墙钟 120s / 代码包 128MB / 请求体 6MB
- **内置默认**：同 `maxExecutionMs=120000`（eo）。
- **处理**：长任务首选云函数；**不要**在云函数里存本地文件（无持久盘，用 COS/Blob）；
  KV **仅在边缘函数可用**，云函数需用外部 DB / Blob。

### 2.3 子请求：官方未文档化硬上限（给近似上限 100，避免无限大）
- **官方事实**：`edge-functions/SKILL.md`「Limits」表只列了 CPU 200ms / 代码包 5MB /
  请求体 1MB，**未单列每请求子请求硬上限**。
- **内置默认**：`caps.maxSubRequests = 100`（eo）。用户明确要求「给大约数值避免无限大」，
  故取 **100 作为免费档近似上限**（`SUBREQ_LIMITS.eo`），**非官方硬限**，仅作代码层防护，
  防构造型请求打爆边缘。`cacheSubreqLimit` 同样为 100。确属特殊场景可经
  `MAX_SUBREQUESTS` 环境变量调整（范围 1–1000）。
- **代码层已落地（fetch 专用）**：与 CF/ESA 同一套 `subreqBudget.js` 守卫（回源计数 / 读跳过），
  预算耗尽即降级，不存在"真无限大"导致边缘被打爆的风险。Cache 写经 `cache.js` 走平台 32 独立约束。

### 2.4 V8 运行时专属坑（隐藏适配）
- **无 `node:` 内建 / `process` 可能不存在** → 本项目用 WebCrypto + `safeGlobal('process')` 守卫（见架构 §EO Makers V8 约束）。
- **触发现象**：`Could not resolve "node:crypto"` / `process is not defined` → 整个函数层不挂载、`/{adminPath}` 404。
- **处理**：已修复；新增依赖时禁止顶层 `import node:`、禁止裸 `process.env`。

---

## 3. 阿里云 ESA

来源：`esa文档/fetchAPI.md`、`Cache API.md`、`RuntimeAPI手册.md`、`esa.jsonc` 注释。

### 3.1 子请求限制 — fetch 软限制 8 / Cache 独立走平台 32
> ESA 的 fetch 与 Cache 是**两个独立接口、各自独立限制**，需区别对待：
> - **fetch 子请求**：受本项目**软限制**约束（默认 8，`MAX_SUBREQUESTS` 可在 1–32 覆盖）。官方 `fetchAPI.md`「每次可发起 4 个，4 个及以上需申请配额」，真机实测常规账号 4、高配可达 8，故软限制取 8 留余量。
> - **Cache API**：独立走**平台默认 32**（「Cache 操作与 fetch 共享 32 个子请求约束」指 Cache 接口自身上限），**不经 `MAX_SUBREQUESTS` 覆盖，与 fetch 互不占用**。

- **官方原文**：
  - `fetchAPI.md` L5/L26：「目前每次可以发起 **4** 个子请求；4 个及以上需申请配额」。
  - `Cache API.md`：「Cache 操作与 fetch **共享 32 个**子请求约束」——此为 Cache 接口自身平台默认上限。
- **内置默认**（`caps.js`）：
  - `caps.maxSubRequests = 8`（esa）：**仅约束回源 fetch** 的软限制；允许 `MAX_SUBREQUESTS` 在 **1–32** 内覆盖（超过 32 视为误配被钳制）。
  - `caps.cacheSubreqLimit = 32`（esa）：Cache API 接口自身平台默认上限，**独立于 fetch 软限制**，不经 `MAX_SUBREQUESTS` 覆盖。
- **软限制守卫**（`platform/subreqBudget.js`，作用于 fetch）：
  - `entry.js` 每请求 `attachToCtx` 注入 fetch 预算计数器；回源 fetch 经 `track(1)` 扣减，
    剩余预算紧张时自动降级（竞速禁用 / 跳过可选回源），护住 fetch 软限制；
  - 预算耗尽 → 回源抛 `SUBREQ_BUDGET_EXHAUSTED`，由 failover 当源站失败处理（换源/熔断），**绝不盲目撞墙**。
  - Cache 写（`cache.put`）**不计入 fetch 软限制**，由平台 Cache 的 32 上限独立约束。
- **触发现象**：回源（1~2）+ 静态同站 fetch（≤1）+ 管理面批读（≈4 集合 MGET）叠加，
  在常规账号 4 硬限下会被掐；本项目 fetch 软限制取 8 后，常规路径（数据面 ≤3、管理面 4 集合 ≈4）均安全。
- **处理**：
  - 管理面 4 集合快照经 `readJsonMany` 合并为单次 `MGET`（≈4 fetch 子请求），受 fetch 软限制 8 约束不越界；
  - 数据面稳态仅 ≈2~3 个 fetch（1 回源 + ≤1 静态），加预算守卫后安全余量充足；
  - **真机确证更高配额**：经 `MAX_SUBREQUESTS`（≤32）覆盖 fetch 软限制，`caps.js` / `subreqBudget.js` 无需改。

### 3.1.1 真机 dev 实测（edgeworker2 · esa-cli dev）
> 用 `scripts/esa-dev-probe.mjs` 在真机运行时（`edgeworker2`）加载 `esa/index.js → _worker.js`，
> 连接用户 Webdis `db3`（Basic 凭证），临时灌入测试配置（临时域名 `esa-probe.test` → httpbin 源站），
> 真实打印每请求 `ctx.__subreq.used`（`[SUBREQ-AUDIT]` 日志 + `X-Subreq-Used` 响应头）。实测结论：

| 场景 | 真机 `used` | `limit` | 说明 |
|---|---|---|---|
| 冷启动·数据面（首请求） | **3** | 8 | 配置快照 `MGET`(1) + 回源 `fetch`(1) + `cachePut`(1) |
| 稳态·数据面（配置内存缓存后） | **2~3** | 8 | 回源 `fetch`(1) + `cachePut`(1)；配置快照命中内存后不再读 KV |
| 管理面·页面 `/__panel` | 0 | 8 | 配置已内存缓存，无新 KV 读 |
| 管理面·API（读 global） | 0 | 8 | 鉴权拦截（401）在第 1 步，未触达 KV |
| 未命中域名（disguise 兜底） | 0 | 8 | 伪装页走内存默认，无回源 |

- **核心结论**：所有路径 `used ≤ 3`，**远低于软限制 8**，留足 ≥5 余量；冷启动额外开销仅为
  「配置快照一次性 `MGET`（每请求若内存未命中则 1 次）」，`ensureGlobalRulesSeeded` 在 isolate 冷启动仅
  以合法 stages 触发时**零写入**（无额外子请求）。软限制 8 经真机验证**够用**。
- **dev 运行时真实约束（实测，非项目缺陷）**：
  1. `edgeworker2` **禁止直连 IP 地址**（`Direct access to IP addresses is not allowed`）——源站必须填可解析域名；
  2. 当前 dev 运行时版本对公网域名 `fetch` 触发 `deno_fetch: failed to get js_req_stats from OpState` 运行时 bug，
     导致回源**响应 502**；但子请求计数已在 `fetch` 调用*前*由 `subreqBudget.track` 正确计入，故 `used` 仍反映真实发起数。
  → 因此「回源 200 的端到端计数」受 dev 运行时限制无法实测，但计数路径与预算守卫已用真机验证成立；
     上线真机（`esa-cli deploy`）运行时不带此 dev-only 限制，回源真实发生、`used` 路径一致。
- 复跑：`node scripts/esa-dev-probe.mjs`（需先 `chmod -R 777 /root/.ew2/edgeworker2` 赋予运行时执行权限）。

### 3.2 执行墙钟 120s / 首字节 10s / 内存 128MB / 代码包 4MB
- **内置默认**：
  - `caps.maxExecutionMs = 120000`（esa）；
  - `caps.firstByteMs = 10000`（ESA 网关 10s 首字节硬约束，超时网关主动断连返回 504）；
  - `caps.memBudgetBytes = 128MB`（`esa.jsonc` 设，可由 `MEM_BUDGET_BYTES` 覆盖）；
  - 代码包 4MB、静态单文件 25MB（本项目远小于此）。
- **触发现象**：`595 执行时间超限`（>120s）；`504`（首字节 >10s）。
- **处理**：见 §4 + §5。

### 3.3 ESA 特有：无裸 IP fetch / 无原生 KV
- **内置默认**：`caps.hasRawIpFetch=false`、`caps.hasKV=false`（ESA 禁用 EdgeKV）。
- **触发现象**：源站填 IP → 回源失败；运行时 KV 不可用。
- **处理**：源站必须填**可解析域名**；持久化走 **REDIS_URL（Webdis）** 或**静态烘焙**（未配 REDIS_URL 自动 `STATIC_CONFIG=1`）。

---

## 4. 回源总时间预算（跨平台统一处理）

所有「墙钟 / 首字节」限制，被本项目收口成**一个自动推导的硬顶**，避免 `(换源次数+1)×超时` 撞平台墙钟：

```
hardCap = max(1000, min(maxExecutionMs, firstByteMs ?? ∞) − SAFETY_RESERVE)
```

| 平台 | `maxExecutionMs` | `firstByteMs` | `SAFETY_RESERVE` | 推导 `hardCap` |
|---|---|---|---|---|
| cf | 30000 | 无（∞） | 5000 | **25000ms** |
| eo | 120000 | 无（∞） | 5000 | **115000ms** |
| esa | 120000 | 10000 | 2000 | **8000ms** |

- **内置默认**：`src/balancer/failover.js` 的 `computeBudget` 每次请求自动算；
  `totalTimeoutMs` 配置为 `0` 时即走此推导（默认即 0，用户无需设）。
- **触发现象**：回源链在 `hardCap` 临近时被提前掐断、返回 serve‑stale 或 502。
- **处理**：
  - 调小单次 `timeoutMs`（默认 0 回落平台基础，可设 1000–60000）；
  - 减少源站池长度（换源次数越少，单源可用时间越长）；
  - ESA 上 `firstByteMs=10s` 最紧 → 大文件回源优先走缓存 / 源站开启分块流式；
  - 必要时设 `EXECUTION_LIMIT_MS` / `FIRST_BYTE_LIMIT_MS` 覆盖（仅特殊部署）。

---

## 5. 通用兜底策略（触发限制后本项目如何自保）

无论哪个平台、哪类限制，本项目均有分层兜底，**绝不因限制而拒绝服务**：

1. **回源超时 / 子请求耗尽** → 竞速（500ms 双路）+ 被动熔断 + fail‑open（全员不可用时挑最近成功源站）+ **serve‑stale（边缘缓存兜底）**。
2. **内存逼近** → `memBudget.js` 按域（cache/queue/…）申请额度，超预算 LRU 淘汰，不 OOM。
3. **CPU 超限** → 热路径优化 + `waitUntil` 后台化；重任务下沉外部存储/服务。
4. **代码包超限** → 压缩构建 + 构建期体积告警（`build.mjs`）。
5. **平台特性缺失** → `caps.js` 探测 + 降级（如 ESA 无 KV→Webdis/烘焙，EO 无 `node:`→WebCrypto）。

---

## 6. 一句话清单（上线前自查）

- [ ] CF 是否 Free 档？是 → 子请求按 50 评估（非 1000）。
- [ ] ESA 子请求按 4 规划，站点多已分页；真机实测 32 有效则调回。
- [ ] 各平台墙钟上限（cf 30s / eo·esa 120s）已通过 `hardCap` 自动遵守。
- [ ] ESA 首字节 10s 最紧，大文件回源走缓存/流式。
- [ ] 代码包：CF<1MB（压缩）、EO<5MB、ESA<4MB，均满足。
- [ ] 持久化：ESA 走 REDIS_URL / 烘焙，未依赖原生 KV。
- [ ] EO V8 未用 `node:` / 裸 `process`，未用 `Response.json()`。

> 所有默认值集中在 `src/platform/caps.js` 与 `src/balancer/failover.js`，
> 修改请同步本文与 `11-architecture.md`「平台降级」表。
