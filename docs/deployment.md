# 生产环境部署

> `wrangler.toml` 与 Dashboard 可视化**不是二选一**，而是按操作分工（详见各方式的「部署职责表」）：
> 能版本化、可一次性声明的绑定（静态资产、KV/R2/D1、非敏感变量）交给 toml；
> 受平台硬约束只能单独注入的（Secrets）或 UI 更顺手的（域名、缓存开关）交给 Dashboard。
> **同一个操作不要两边都做**，以免状态漂移。

**前提：先构建产物**

```bash
git clone <your-repo> && cd cdn-edge-gateway
npm install
npm run build                  # 生成根目录 _worker.js（默认即压缩，体积小冷启动快）
# 本地调试需要可读产物时：node build.mjs --no-minify
```

> `_worker.js` 由 `build.mjs` 自动打包并把 `web/` 前端内联，**请勿手动编辑**。每次改源码后重跑 `npm run build`。

构建完成后手头有一个 `_worker.js`，下面三套架构任选一套。

---

## 方式一：Cloudflare Workers

CF Workers 部署**不强制「全 toml」或「全可视化」二选一**——两者可以并存，但前提是：
**同一个操作只由一边负责，绝不两边都写「你要做这个」**，否则状态会漂移、难以排查。

下面这张「部署职责表」是唯一的权威划分。每张操作看「归属」列即可，别去别处重复做。

### 部署职责表（CF Workers）

原则：**哪个操作可视化更省事，就归可视化**——尤其是 KV/R2/D1 的创建与绑定，在 Dashboard 里选一下命名空间/桶就绑好了，**完全不需要知道 namespace id / database id**，比「命令行 create 拿 ID → 回填 toml」简单得多。

| 操作 | 归属 | 怎么落地 |
|---|---|---|
| 静态资产层（管理面 `assets/`） | **toml** | `wrangler.toml` 的 `assets` 绑定，`wrangler deploy` 自动上传 `dist/public/` |
| 非敏感变量 `ADMIN_PATH` | **toml** | `wrangler.toml` 的 `[vars]`（构建期与运行时需一致，跟代码走最稳） |
| KV 命名空间创建 + 绑定 `CDN_KV` | **Dashboard 可视化** | Settings → Variables → KV namespace bindings → 新建/选命名空间，变量名 `CDN_KV`（无需记 ID） |
| R2 桶创建 + 绑定 `CDN_R2`（engine=r2） | **Dashboard 可视化** | Settings → Variables → R2 bucket bindings → 新建/选桶 `cdn-assets`，变量名 `CDN_R2` |
| D1 库创建 + 绑定 `CDN_DB`（statsDriver=d1） | **Dashboard 可视化** | Settings → Variables → D1 database bindings → 新建/选库，变量名 `CDN_DB` |
| Secrets（`ADMIN_PASSWORD` / `JWT_SECRET` / `CNB_AUTH`） | **单独注入**（不进 toml） | CLI：`wrangler secret put <NAME>`；或 Dashboard → Settings → Variables → Secrets 类型（两者等价，做一次即可） |
| 自定义域名 / Worker Route | **Dashboard 可视化** | Settings → Domains & Routes 点绑（DNS+代理 UI 最直观） |
| 开启 Fetch handler 缓存 | **Dashboard 可视化** | Settings → Cache → 开启（平台开关，无 toml 字段） |

> 平台硬约束（无法绕过，已体现在上表）：
> 1. **Secrets 禁止进文件**——无论 CLI 还是可视化，密钥只能单独注入，toml 里永远没有 Secrets 字段。
> 2. **KV/R2/D1 的 ID 由平台分配**——但因为这部分归可视化，你在控制台创建时平台直接分配并绑定，**根本不用抄 ID、也不用回填 toml**。`wrangler.toml` 里这些段默认注释掉，仅作纯本地 dev 备用。

### 标准流程（本地 / 手动 `wrangler deploy`）

> 适合想用命令行部署、且接受在 Dashboard 做一次绑定的场景。存储绑定全部可视化，toml 只管代码+资产+变量。

**① 一次性：Dashboard 创建并绑定存储（可视化，不需 ID）**
Worker → **Settings → Variables**：
- **KV namespace bindings** → 新建/选命名空间，变量名 `CDN_KV`
- **R2 bucket bindings**（engine=r2 时）→ 新建/选桶 `cdn-assets`，变量名 `CDN_R2`
- **D1 database bindings**（statsDriver=d1 时）→ 新建/选库，变量名 `CDN_DB`

**② 一次性：注入 Secrets（单独做，不进 toml）**
```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put JWT_SECRET
# 可选：npx wrangler secret put CNB_AUTH         # 源站 extraHeaders 用 @secret:CNB_AUTH 引用
```

**③ 部署代码（toml 自动带上 assets + ADMIN_PATH 变量）**
```bash
npm run build                                    # 生成 _worker.js + dist/public/（管理面静态资源）
npx wrangler deploy                              # 上传 Worker + 静态资产层 + ADMIN_PATH；存储绑定已在 Dashboard 就绪
```
管理面静态资源（`/{ADMIN_PATH}/assets/*`）作为 CF 静态资产上传，命中边缘缓存后**零函数计费**，
与 CF Pages / EO Makers 静态托管等价，无需前后端分体。

**④ 一次性：绑域名 + 配缓存规则（Dashboard）**

本架构的缓存铁律（最前端 CDN 为主）：**边缘缓存长存（默认半年）、浏览器缓存 30 分钟、清除源站带回来的 `no-store`/`private`/`Set-Cookie`/`Pragma` 等不缓存头——最终以最前端 CDN 改写后的响应为准下发给用户。**

- 域名：Worker → **Settings → Domains & Routes → Add Custom Domain**（CF 自动处理 DNS + 代理，橙色云必须开）。
- 缓存开关：Worker → **Settings → Cache → "Cache responses from fetch handlers" 设为 Enabled**（CF Workers 默认不缓存 fetch handler 响应，不开启则每个请求都进 Worker 耗额度）。
- **缓存规则（必须成对，否则源站返回的头会反客为主）**：CF 把缓存拆成两条独立规则，缺一不可。
  1. **Cache Rules（请求/命中侧）**：`Rules → Cache Rules` 新建。负责"存不存、存多久"，**直接覆盖源站/Worker 返回的 `Cache-Control`**。
     - 可缓存内容（例 `/img/*`、`/static/*`）：`Cache eligibility = Eligible`、`Edge TTL = Override, 15552000s（半年）`、`Browser TTL = Override, 1800s（30 分钟）`、`Origin Cache-Control = Ignore if present`（用规则说了算，不被源站 `no-store`/`private` 干扰，否则源站禁缓存头会让边缘不存）。
     - 必进函数（例 `/api/*`、`/__panel/*`）：`Cache eligibility = Bypass`（永远回源进 Worker，不缓存）。
  2. **Cache Response Rules（响应侧，Modify cache response headers and tags）**：`Rules → Cache Rules → 切到 Cache Response Rules` 新建。负责"出去的头和标签对不对"，**在响应离开边缘前改写**。
     - **关键开关 `cloudflare_only`（仅 Cloudflare 边缘生效）必须保持「关闭 / 不勾选」**：开启后改写的 `Cache-Control`/`s-maxage` 只作用于 CF 边缘缓存决策、**不会下发给浏览器**，浏览器仍收到源站原头——这与本架构"以最前端 CDN 响应为主给用户"相悖。关闭后，规则改写的头才会真正到达客户端。
     - 可缓存内容（状态 200 且 `/img/*`、`/static/*`）：设置 `Cache-Control: public, max-age=1800`、`CDN-Cache-Control: max-age=15552000`；加 `Cache-Tag: img-assets`（供按标签清）；**移除源站可能带的 `Set-Cookie`/`Pragma`/`no-store`，确保不缓存头被清掉**。
  - 为什么两者都要：只设 Cache Rules → Edge TTL 管住"存多久"，但响应头仍是源站原样返回，`max-age`/标签可能不对；只设 Cache Response Rules → 头改漂亮了，但请求侧没说 Eligible/TTL，源站返回 `no-store` 时边缘根本不缓存。**Cache Rules 定"存不存/存多久"，Cache Response Rules 定"出去的头和标签"，两者拼成完整缓存策略。**
  - 本项目代码仍会下发 `Cache-Control`/`CDN-Cache-Control` 作为跨平台兜底（EO 也靠它），但 **CF 生产环境以这两条面板规则为权威**，代码头的角色降为兜底。

> 以后改代码：重跑 `npm run build && npx wrangler deploy`（只动代码+资产，不影响已绑的存储/域名）；改存储/域名/缓存：直接在 Dashboard 操作，互不干扰。

### Action 流水线部署（`npx wrangler deploy`，操作顺序怎么排）

流水线只负责**第③步「部署代码」**——它跑 `npm run build` 然后 `npx wrangler deploy`，把代码与静态资产推上线。
**存储绑定、Secrets、域名、缓存开关这些「一次性基础设施」全部提前在 Dashboard 点完**，流水线不碰它们，也不在 toml 里声明（避免占位符 ID 让部署失败）。

**正确的操作顺序（只第一次部署时需要排，之后每次发版只点流水线）：**

1. **Dashboard：创建 Worker**（`Create Worker`，随便起名，后面会被流水线覆盖代码）。
2. **Dashboard：绑定存储**（见上方①）—— KV `CDN_KV`、R2 `CDN_R2`、D1 `CDN_DB`，UI 里选/建即绑，**无需 ID**。
3. **Dashboard：注入 Secrets**（见上方②）—— `ADMIN_PASSWORD` / `JWT_SECRET` 设为 Secrets 类型。
4. **Dashboard：绑域名 + 开缓存**（见上方④）。
5. **GitHub：配仓库 Secret** `CLOUDFLARE_API_TOKEN`（含 Workers Scripts:Edit）、`CLOUDFLARE_ACCOUNT_ID`；可选 Variable `ADMIN_PATH`。
6. **点 Actions → 部署 Cloudflare Workers → Run workflow（填 `deploy`）** → 流水线 `wrangler deploy` 上线。

> 第 1–4 步是「基础设施预备」，做一次永久生效；第 5–6 步是「发版」，以后每次改代码只重复第 6 步。
> 流水线里的 `wrangler deploy` 因 toml 已不含占位符 KV 段，不会因缺失 ID 报错；存储绑定来自第 2 步的可视化，天然就位。

### 纯 Dashboard 可视化部署（完全不用命令行 / 不用 toml 的等价路径）

> 如果你连 `wrangler deploy` 都不想碰，可以**整条走可视化**：把上面 toml 负责的 `assets` 静态层也交给「粘贴兜底」（功能一致，仅每次管理面访问走一次 Worker）。
> 此时 `wrangler.toml` 完全不生效，粘贴后按下方 checklist 逐项补。

**① 创建 Worker 并粘贴代码**
Dashboard → **Workers & Pages → Create** → **Create Worker**，起名（如 `edge-cdn`），进入编辑器，
**把本地 `_worker.js` 全文复制粘贴**覆盖默认内容 → **Deploy**。

> 纯粘贴不会上传 `dist/public/` 静态资产（`ctx.env.ASSETS` 为空），管理面静态资源自动回退到
> `ui.gen.js` 内联兜底字节（`adminPage.js` 的 `tryServePanelStatic` 逻辑），仍可完整运行，
> 仅每次访问走一次 Worker 函数（管理面低频，几乎无感）。如需零额度静态层请走上面的命令行路径。

**② 粘贴后必做 checklist（逐项确认）**

| # | 操作位置 | 设置 | 类型 |
|---|---|---|---|
| 1 | **Settings → Variables → KV namespace bindings** | 变量名 `CDN_KV`，选新建的命名空间 | 绑定 |
| 2 | **Settings → Variables → R2 bucket bindings**（engine=r2 时） | 变量名 `CDN_R2`，选桶 `cdn-assets` | 绑定 |
| 3 | **Settings → Variables → D1 database bindings**（statsDriver=d1 时） | 变量名 `CDN_DB` | 绑定 |
| 4 | **Settings → Variables** | `ADMIN_PASSWORD`、`JWT_SECRET` 设为 **Secrets** 类型 | Secrets |
| 5 | **Settings → Variables** | `ADMIN_PATH` 设为 Variable（建议随机串） | Variable |
| 6 | **Settings → Domains & Routes** | Add Custom Domain 或 Add Route | 路由 |
| 7 | **Settings → Cache** | "Cache responses from fetch handlers" 设为 Enabled | 平台开关 |

> 两条独立概念别搞混：**桶名**（`cdn-assets`，R2 里真实桶）vs **绑定变量名**（`CDN_R2`，代码里 `env.CDN_R2` 引用）。源站配置填的是绑定变量名。桶无需开 Public Access。

> 注意：上面「命令行路径」与「纯可视化路径」是**两种可任选其一的整体方案**，不是让你在同一部署里混搭。选一种走完即可。

---

## 方式二：Cloudflare Pages

> 纯 Dashboard 可视化形态（Pages 无 `wrangler.toml` 形态，KV / 变量 / 域名 / 缓存全部在控制台点）。这与方式一的「可视化优先」主旨完全一致——Pages 的绑定机制本身就只在 UI 里完成，无需命令行、无需记 ID。

### 1. 构建产物（提交到仓库）
```bash
npm run build
```
Pages 自动识别根目录的 `_worker.js`（结合 `edge-functions/[[default]].js` 薄壳）。

### 2. Dashboard 创建 Pages 项目
Dashboard → **Workers & Pages → Pages → Create a project**：
- 连接 Git 仓库
- 构建命令：`npm run build`，输出目录：`.`

### 3. 绑定 KV / D1
项目页面 → **Settings → Functions**：
- **KV namespace bindings** → Add binding，Variable name：`CDN_KV`
- **D1 database bindings**（可选）→ Add binding，Variable name：`CDN_DB`

### 3.5 开启 Fetch handler 缓存（**重要，大幅度节省 Function 调用额度**）

Pages Functions 默认**不缓存**返回的 HTTP 响应，即使你的代码正确下发了
`Cache-Control: public, s-maxage=3600` 等缓存头。开启后 CF 边缘会按这些
响应头自动缓存，后续相同 URL 的请求由 CDN 边缘直接返回，**完全不再进 Function**。

**操作**：Dashboard → Workers & Pages → **Pages** → 选中你的项目 → **Settings** →
**Functions** → 找到 **"Cache"** 开关 → 设为 **Enabled**。

> 本项目 `buildClientHeaders` 已按规则/policy 正确下发 `Cache-Control` + `CDN-Cache-Control` 响应头，**只差这一个开关**。Worker（方式一）同理，见方式一「标准流程 ④」。

### 4. 环境变量与 Secrets
**Settings → Environment variables**：

| 变量 | 类型 |
|---|---|
| `ADMIN_PASSWORD` | Secret |
| `JWT_SECRET` | Secret |
| `ADMIN_PATH` | Variable |
| `CLOUD_PLATFORM`=pages | Variable（可选，推荐） |

### 5. 绑定自定义域名
**Custom domains** 标签页中配置加速域名。

> 后续增删路由：同样在这个页面操作，无需改文件。

---

## 方式三：EdgeOne Pages

> EdgeOne 完全在控制台操作，无 Wrangler，构建由 Git 推送触发。
> 持久化使用 **EdgeOne KV**（需开通并绑定为 `CDN_KV`）。

> **为什么不用 Blob 承载配置**：EdgeOne KV「仅支持在 Edge Functions 中使用」，
> 而 Blob SDK（`@edgeone/pages-blob`）「仅提供 Node.js 版本」。本项目入口
> `edge-functions/[[default]].js` 是 Edge Function（非 Node 运行时），无法加载 Blob SDK，
> 因此 Blob 不能作为 KV 的回退。若确需 Blob，须另建 `cloud-functions/` 下的 Cloud Function 入口承载（见该目录 README）。

---

### 前置准备

#### 步骤 1：准备仓库
确保所有文件（含 `_worker.js` 与 `functions/`）已提交推送到 Git 仓库。
> 建议本地先 `npm run build` 提交 `_worker.js`，避免远端构建环境差异。

#### 步骤 2：控制台创建项目
EdgeOne Pages 控制台 → 新建项目 → 导入 Git 仓库：
- 构建命令：`npm run build`
- 输出目录：`.`

#### 步骤 3：设置环境变量（控制台 → 项目设置 → 环境变量）

| 变量 | 类型 | 说明 |
|---|---|---|
| `ADMIN_PASSWORD` | 密钥 | 管理后台初始密码 |
| `JWT_SECRET` | 密钥 | 签名密钥（`openssl rand -hex 32`） |
| `ADMIN_PATH` | 变量 | 建议随机串 |
| `CLOUD_PLATFORM` | 变量 | **填 `edgeone`**（驱动平台探测与降级逻辑） |

---

### 步骤 4：创建并绑定 KV 命名空间

EdgeOne 控制台 → **存储** → **KV 存储** → 创建命名空间（名称任意，如 `cdn-edge-gateway-kv`）。
若账号需审核，等待通过后继续。

项目设置 → **绑定 / 存储绑定** → 添加 KV 绑定：
- **变量名必须填 `CDN_KV`**（网关按此名探测）。
- 选择上一步创建的命名空间。

> **EdgeOne 绑定 `CDN_KV` 仅需绑定一次**：本项目全部收口在 Edge Function（`edge-functions/[[default]].js`）。
> 原因不是「不该用 Cloud Function」，而是硬约束：EdgeOne KV 命名空间**仅在 Edge Functions 运行时可用**，Cloud Functions（云端 Node）拿不到 `CDN_KV`；
> 而数据面代理与管理 API 都必须读 KV 才能拿到站点和源站配置，所以「依赖配置的请求」只能在 Edge Function 跑通。
> 因此只需在 Edge Function 绑定处绑定 `CDN_KV` 一次即可。

> **Cloud Functions 的角色（预留，不是漏配）**：EO Makers 区分 Edge Functions（边缘、KV 可用、≤200ms CPU/≤1MB body）与 Cloud Functions（云端 Node、可跑 MySQL/Blob 等重 IO、长执行）。
> 本项目的重活（数据面代理）因依赖 KV 只能留在 Edge；但**不依赖 KV 的重活**（大文件转码、AI 推理、独立 MySQL/Blob 业务、后台批处理）应落在 `cloud-functions/`（详见该目录 README）。
> 跨平台存储统一原则：**CF 侧用 D1，EO 侧对应用 Blob（对象存储，经 cloud-functions SDK 访问）**，封装在同一抽象层后调用方无感知。当前版本为 KV-only，`cloud-functions/` 仅作架构预留。

### 步骤 5：部署
推送代码到仓库，EdgeOne 自动构建上线（或走流水线手动部署，见下文）。

EdgeOne Makers 会自动识别并部署：
- **`edge-functions/`** → Edge Function 目录，`[[default]].js`（Catch-all）薄壳转发给 `_worker.js`，承载数据面代理 + 管理面 HTML + `/{ADMIN_PATH}/api/*`（KV 在此运行时可用）
- **`dist/public/`** + 根目录静态文件 → Makers 静态托管（管理面 UI 资源，命中边缘缓存后零函数执行次数）

网关检测到 `env.CDN_KV` 后经 `wrap()` 适配，API 与 Workers KV 一致。

> **管理面路径是可配置的**：默认段为 `__panel`，可通过环境变量 `ADMIN_PATH`（或 KV 全局配置里的 `adminPath`）改成随机串，作为第一层防护。
> 取值优先级：**KV 显式配置 > `ADMIN_PATH` 环境变量 > 默认 `__panel`**。
> 下文架构图与管理示例中的 `/__panel` 均指代「默认段」，实际部署若设了 `ADMIN_PATH` 则替换为该值。

> **部署架构图示（EdgeOne Makers）**：
> ```
> 用户请求
>   ├─ /{ADMIN_PATH}/assets/*   → 静态托管（dist/public，零函数次，边缘缓存）
>   └─ 其余所有请求         → edge-functions/[[default]].js（Edge Function，_worker.js 内部再路由：
>                               ├─ /{ADMIN_PATH}/api/*  → 管理面 API（读 KV，Edge Function 可用）
>                               ├─ /{ADMIN_PATH}        → 返回 SSG+注入的 HTML
>                               └─ 其余（数据面代理）→ 最低延迟回源代理）
> ```
> 注：静态资源与函数路由冲突时，**Makers 优先静态资源**，故 `/{ADMIN_PATH}/assets/*` 不会落到函数。
> 不需要在 `edgeone.json` 里写 `routes` 做分流（旧版 Pages 的写法，新版已不支持该字段）。

> **部署架构图示（Cloudflare Workers，带 Static Assets）**：
> ```
> 用户请求
>   ├─ /{ADMIN_PATH}/assets/*   → env.ASSETS.fetch（CF 静态资产层，零函数次，边缘缓存）
>   │                             未命中/无绑定 → ui.gen.js 内联兜底字节
>   └─ 其余所有请求         → _worker.js（main 入口，内部再路由：
>                               ├─ /{ADMIN_PATH}/api/*  → 管理面 API（读 KV）
>                               ├─ /{ADMIN_PATH}        → 返回 SSG+注入的 HTML
>                               └─ 其余（数据面代理）→ 回源（sockets 支持自定义回源 Host/裸 IP））
> ```
> 注：CF Workers 没有 Pages 那样的独立静态层，`wrangler.toml` 的 `assets` 绑定是官方等价物；
> 纯 Dashboard 粘贴 `_worker.js` 时不会上传资产，`ASSETS` 绑定为空，管理面自动走内联兜底。

---

### 部署后验证
推送后访问管理面保存一条配置，再到「系统信息」页确认 `hasKV=true`、持久化后端为 `kv`；
显示降级则说明绑定名或平台变量有误。

> **EdgeOne 关键差异与本项目应对（非 bug）**：
> - **无 `caches.default`，但边缘缓存已启用**（`hasEdgeCache=true`）：走两条 EO 路径——路径 B 响应头委托（`CDN-Cache-Control` 让 EO 边缘按头缓存）+ 路径 A 同站 fetch 节点缓存（无自定义回源 Host 的可缓存请求，函数内 `fetch(同站域名)` 触发 EO 节点缓存，命中零函数调用）。路径 A 需要在 EO 控制台预先配好「源站组 + 回源 Host 重写」（见 `docs/eo-origin-host.md`），否则 EO 回源会失败。`cacheGen` 整站清除不可用（仅作用于 `caches.default`），EO 缓存只能等 TTL 过期或用 `Cache-Tag` + 平台 purge。
> - **KV 键名字符集受限**：EO KV 官方限定 key「仅支持数字、字母及下划线」，而本项目键含 `:`、host/IP 含 `.`。故 `platform/keyCodec.js` 在适配层统一做可逆十六进制转义（`cfg:global` → `cfg_3Aglobal`），上层代码无感。该编码在 CF 上同样合法，两平台同构。**Cloud Function（Node 运行时）与 Edge Function 共用同一编码约定**，故管理 API 在 Node 侧读写 KV 时键名完全兼容。
> - **KV 最终一致**：EO KV 写入后本节点立即生效，其他节点最长约 60 秒收敛；叠加 `configCacheTtl`（默认 60s，EdgeOne 平台自动抬到 ≥120s）内存缓存，配置变更全球生效约需 1–2 分钟，属预期行为。
> - **无 D1**：`statsDriver` 配置为 `d1` 时在 EO 自动回落 KV 驱动。KV 驱动采用「isolate 内存聚合 + 分片键落盘」，写入频次与流量解耦，因此在无原子自增的 KV 上依然安全（分片键互不覆盖）。
> - **单运行时收口（Edge Function）**：本项目不再拆 Cloud Function。`edgeone.json` 的 `routes` 字段在新版 Makers 已不支持；全部流量经 `edge-functions/[[default]].js` 进入 `_worker.js`，由其内部按 URL 路由。KV 仅在 Edge Function 可用，管理 API 因此也跑在 Edge Function，EO 专属逻辑（configCacheTtl 下限、KV 键编码）照常生效。
>
> **首次部署会自动迁移历史键**：若命名空间中存在启用编码前写入的旧键，冷启动后首个请求会通过 `waitUntil` 触发一次性搬迁（读旧 → 写新 → 删旧，幂等、不覆盖新数据），完成后写入哨兵键 `__keycodec_migrated__`，后续部署不再全量扫描以节省配额。

### EdgeOne 免费额度与用量控制

| 项 | 免费额度 | 本项目用量 |
|---|---|---|
| Edge Functions 执行次数 | 300 万/月 | 数据面每请求 1 次（**KV 读写不计入此项**） |
| Edge Functions CPU Time | 300 万 ms/月 | 平均每请求约 1 ms |
| KV 存储空间 / 单值 | 1 GB / 25 MB | 配置极小；统计分片按 3 天 TTL 滚动 |
| 构建次数 | 500 次/月 | 每次 Git 推送消耗 1 次 |

> **KV 请求不计函数执行额度**：腾讯云用量概览将「Edge Functions 请求数」「KV 存储」「构建次数」列为三项独立计量。KV 仅按**空间占用**计费（默认 1 GB），没有「KV 请求数」指标。因此一次用户请求内部无论打多少次 KV get/put，函数执行额度都只 +1。**真正的 KV 约束是 1 GB 空间上限与每次冷读的 10–100ms 延迟**，故优化方向是「压空间 + 压冷读延迟」，而非压 KV 调用次数。

节流要点：
- **数据面只读 KV**：配置读经 `configCacheTtl` 内存缓存（默认 60s；EdgeOne 平台自动抬到 ≥120s，既压低 KV 冷读次数又让缓存窗口覆盖 KV 同步延迟），绝大多数请求零 KV 访问。
- **统计不逐请求落盘**：内存聚合后按周期 flush，写入次数与流量解耦；统计键 TTL 已由 7 天收紧到 **3 天**，key 总量与空间占用降低约 57%，避免逼近 1 GB 上限。
- **构建按需触发**：建议仅在 tag/release 触发构建，避免每次 push 都消耗构建额度。
- **`edgeone.json` 有硬上限**：headers ≤ 30 条、redirects/rewrites 各 ≤ 100 条，故规则统一由 Function 处理，配置文件只放基础路由。

---

## 分层缓存架构部署方案（CF 两层 / EO 三层）

本架构核心思想：**让边缘函数只在「必须回源」时才被调用，可缓存内容由最前端的 CDN 边缘直接命中（函数零调用）；只有未命中回源、或不可缓存/需鉴权的请求，才落到边缘函数享受灵活 LB 与规则。** 缓存铁律（最前端 CDN 为主）：**边缘半年、浏览器 30 分钟、清除源站带回的不缓存头，最终以最前端 CDN 改写后的响应下发给用户。**

**固定路径（所有规则必须按此逐层定义）**：
```
浏览器 → 最前端 CDN（四选一）：
   ├─ Cloudflare (CF)    → 本项目(_worker.js) → 源站
   ├─ EdgeOne (EO)       → 本项目(Makers)    → 源站
   ├─ AWS CloudFront     → 源站（直接，不经本项目）
   └─ 阿里云 ESA         → 源站（直接，不经本项目）
```
> 完整四厂商 + 本项目的缓存头语义差异、逐厂商规则清单、联动总表见 **`docs/cache-strategy.md`**（本专章只展开 CF / EO；CloudFront / ESA 直接走源站，缓存靠源站头 + 控制台规则）。
**四层责任矩阵（每一层该设什么）**：

| 层 | 责任 | 关键规则 |
|---|---|---|
| ① 最前端 CDN（CF/EO） | 最终缓存决策 + 最终下发给浏览器的头 | CF：Cache Rules + Cache Response Rules；EO：站点规则（含响应头改写）。**强制剥离 `no-store`/`private`/`Set-Cookie`/`Pragma`**，下发 `public`+`immutable` |
| ② 本项目（Worker/Makers） | 函数层兜底头，自动遵循铁律 | `src/proxy/headers.js` 的 `buildClientHeaders`：可缓存响应自动下发 `Cache-Control: public, max-age=1800, immutable` + `CDN-Cache-Control: public, max-age=15552000`，并**主动剥离源站不缓存头**（见下） |
| ③ 源站 | 只产出内容，不负责缓存策略 | 源站头被①层（Ignore/改写）和②层（剥离）双重否决，不缓存信号不会泄漏到最前端 |

**本项目已自动遵循铁律（模板开箱即用）**：`src/proxy/headers.js` 中 `buildClientHeaders` 在可缓存响应时：
- 浏览器：`Cache-Control: public, max-age=<browserTtl>, immutable`（immutable 只给浏览器）
- 边缘：`CDN-Cache-Control: public, max-age=<edgeTtl>`（独立维度，不混入 Cache-Control）
- **兜底剥离**源站带回的 `set-cookie`/`pragma`/`no-store`/`private`/`expires=0`，确保最前端能缓存
- TTL 回落默认：开启 `cache.enabled` 但未给 TTL 时，自动用 `edgeTtl=15552000s（半年）`/`browserTtl=1800s（30 分钟）`（常量 `TIER_CDN_DEFAULT_EDGE_TTL`/`TIER_CDN_DEFAULT_BROWSER_TTL`）

> 因此「本项目层」无需用户手写头——模板已按路径铁律自动下发；CF/EO 面板规则是把最前端权威再钉死一层。

### A. Cloudflare（两层域名，无中间域名）

CF 的 Worker 可直接作为 `cdn.example.com` 的「源」，因此 CDN 层与函数层合并在同一域名，无需 EO 那样的中间域名。

**域名与 DNS**
| 域名 | 类型 | 说明 |
|---|---|---|
| `cdn.example.com` | CNAME（橙云 Proxied） | 对外唯一入口，CF 自动处理 DNS+代理 |
| `origin-1.net` / `origin-2.net` | 不归 CF 管 | 真实后端源站，任意域名，无需进 CF DNS |

**部署步骤**
1. `npm run build && npx wrangler deploy` 部署 `_worker.js`。
2. **Settings → Domains & Routes → Add Custom Domain** 绑 `cdn.example.com`（CF 自动加 DNS + 橙云）。
3. **Settings → Cache → "Cache responses from fetch handlers" = Enabled**。
4. **Cache Rules（请求/命中侧，决定"存不存/存多久"）**：`Rules → Cache Rules`：
   - 可缓存路径（`/img/*`、`/static/*`）：`Cache eligibility = Eligible`、`Edge TTL = Override, 15552000s（半年）`、`Browser TTL = Override, 1800s（30 分钟）`、`Origin Cache-Control = Ignore if present`（用规则说了算，否决源站 `no-store`/`private`，否则源站禁缓存头会让边缘不存）。
   - 必进函数（`/api/*`、`/__panel/*`）：`Cache eligibility = Bypass`（永远回源进 Worker，不缓存）。
5. **Cache Response Rules（响应侧，决定"下发给客户端的头长什么样"）**：`Rules → Cache Rules → Cache Response Rules`：
   - **`cloudflare_only`（仅 Cloudflare 边缘生效）开关必须「关闭」**——开启后改写的头只作用在边缘、不下发给浏览器，违背「以最前端 CDN 响应为主」原则。
   - 可缓存路径（状态 200 且 `/img/*`、`/static/*`）完整头设置：
     - `Cache-Control: public, max-age=1800, immutable`（下发给浏览器：允许缓存、30 分钟、内容不变勿发条件请求）
     - `CDN-Cache-Control: public, max-age=15552000`（给 CF 边缘看：半年）
     - `Cache-Tag: img-assets`（供按标签精确 purge）
     - **移除**源站可能带回的 `Set-Cookie` / `Pragma` / `no-store` / `private`（清掉一切不缓存信号，确保边缘真存）
   - 不可缓存路径（状态非 200 或 `/api/*`）：`Cache-Control: no-store`（确保不落边缘、必回源）
6. **本项目 Worker（兜底/跨平台头）**：`src/proxy/cache.js` 已对可缓存响应下发 `Cache-Control` + `CDN-Cache-Control`。CF 上这套头的角色降为**兜底**——若 Cache Response Rules 未命中（如新路径），由代码头接住；EO 上则**完全依赖**这套头（见下）。代码侧无需为 CF 改逻辑，但需保证：可缓存响应带 `public`、不带 `no-store`；不可缓存响应带 `no-store`。
7. 函数内 `requestWithFailover` 选 `origin-1/2.net` 回源即可（本项目已就绪）。

> CF 上「函数当源」是标准姿势：可缓存请求命中 CDN 边缘直接返回、零 Worker 调用；未命中才回源进函数做 LB。

### B. EdgeOne（三层域名，需中间函数域名）

EO 的 Makers 只能「挂在某个加速域名上」、不能当独立源，故需显式拆出「函数域名」作为 CDN 层的源站，形成三层。

**三层域名**
| 层 | 域名 | 角色 | 是否跑函数 |
|---|---|---|---|
| ① CDN 层 | `cdn.example.com` | EO 加速域名，**纯 CDN + 缓存**，**不挂 Makers** | 命中即零函数调用 |
| ② 函数/回源层 | `edge.example.com` | EO 加速域名，**挂 Makers 函数**，作为 ① 的「源站」 | 回源时才跑 |
| ③ 真实源站层 | `origin-1.net` / `origin-2.net` | 后端存储，任意域名 | 不跑 |

**部署步骤**
1. 部署 `_worker.js` / `edge-functions/[[default]].js` 到 Makers（流水线或控制台），**绑定到 `edge.example.com`**（Makers 触发路由 `/*`）。
2. **`edge.example.com` 控制台配源站组 + 回源 Host 重写**（见 `docs/eo-origin-host.md`），指向 `origin-1/2.net`——这是路径 A 生效前提，也是函数回源前提。
3. **`cdn.example.com` 控制台**：加速域名开启，**源站指向 `edge.example.com`**（即把函数域名当源站），开启 EO 节点缓存。
4. **`cdn.example.com` 站点规则（EO 控制台，最前端缓存决策）**：
   - 可缓存路径（`/img/*`、`/static/*`）：开启「节点缓存」，**边缘缓存 TTL = 15552000s（半年）**，浏览器缓存 TTL = 1800s（30 分钟）；并在「响应头改写」里下发 `Cache-Control: public, max-age=1800, immutable`、`CDN-Cache-Control: public, max-age=15552000`，**剥离源站 `Set-Cookie`/`Pragma`/`no-store`/`private`**（EO 站点规则的响应头改写即等价于 CF 的 Cache Response Rules）。
   - 不可缓存路径（`/api/*`、`/__panel/*`）：节点缓存设为「不缓存」或下发 `no-store`，确保必回源进函数。
5. **`edge.example.com` 的 Makers 规则（函数侧，回源与响应头）**：
   - Makers 触发路由 `/*`（或仅 `/img/*` 等）绑定到本项目 `_worker.js`。
   - 函数内 `requestWithFailover` 选 `origin-1/2.net` 回源；回响应时由 `src/proxy/cache.js` 下发 `Cache-Control` + `CDN-Cache-Control`（**路径 B 响应头委托**）——这是 ① 层 `cdn.example.com` 缓存的依据。**关键点**：Makers 函数下发的头必须带 `public`、不带 `no-store`，否则会被 ① 层站点规则的 `no-store` 之外逻辑覆盖；而 ① 层已配置「忽略/剥离源站不缓存头」，故函数返回的可缓存头能顺利被 ① 层缓存。
   - 若走**路径 A 同站 fetch**（`fetch(edge.example.com/...)` 同站、无自定义回源 Host），则由 EO 节点缓存直接命中、零函数调用，TTL 同样由 ① 层站点规则控制。

**链路验证**
```
浏览器 → cdn.example.com（层① EO 边缘）
   ├ 命中缓存 → 直接返回，函数零调用 ✓
   └ 未命中 → 回源到 edge.example.com（层②）→ 调起 Makers 函数
                                   → LB 选 origin-1/2.net（层③）→ 响应带回 CDN-Cache-Control
      层① 缓存住，下次命中
```

> EO 上「函数域名当源站」是复刻 CF 分层架构的关键招。若嫌两层 EO 域名麻烦，也可层①直接挂 Makers + 用路径 A 同站 fetch，但首次请求函数必跑一次，不如本方案彻底省额度。

### 四层规则联动总表（以最前端 CDN 为最终依据）

缓存由各层头/规则**叠加**决定，优先级从高到低，**高优先级一旦否决（如 `no-store`）低优先级无效**：

| 平台 | ① 最前端 CDN 层（最终下发） | ② 函数/回源层 | ③ 本项目 Worker（`src/proxy/cache.js`） | ④ 真实源站 |
|---|---|---|---|---|
| **CF** | **Cache Response Rules**（改 `Cache-Control`/`CDN-Cache-Control`/`Cache-Tag`，剥 `no-store`）+ **Cache Rules**（Edge/Browser TTL） | N/A（函数即源，无独立层） | 下发 `Cache-Control`+`CDN-Cache-Control` 作**兜底** | 原始头被 `Origin Cache-Control=Ignore` 否决 |
| **EO** | **站点规则**（节点缓存 TTL + 响应头改写，剥 `no-store`） | **Makers 触发路由 + 函数返回头**（路径 B 响应头委托） | 同左（函数内 `cache.js` 下发头，即 Makers 层） | 原始头被站点规则改写/剥离 |

**完整头指令语义（避免互相打架）**：
- `public`：给**边缘**看，"允许我缓存"。必须出现在边缘侧头（`CDN-Cache-Control` 或 EO 站点规则），缺它会因默认 `private` 假设而不缓存。
- `no-store`：**最强否决**。任一层出现即整条链路不缓存。故"可缓存内容"必须在最前端规则层（CF Cache Response Rules / EO 站点响应头改写）**显式移除**源站带回的 `no-store`/`private`/`Set-Cookie`/`Pragma`。
- `max-age` / `s-maxage`：浏览器用 `Cache-Control: max-age`（30 分钟）、边缘用 `CDN-Cache-Control: max-age`（半年）；两值独立，互不覆盖。
- `immutable`：只给**浏览器**（`Cache-Control` 里），告知内容永不变、别发条件请求；**不要**写进 `CDN-Cache-Control`（边缘不需要它）。
- `Cache-Tag`：仅 CF 用，配合 Cache Response Rules 设置，供「按标签 purge」精确清除（本项目 `cacheGen` 在 CF 上可用 `Cache-Tag` 增强）。

**最前端 CDN 为最终依据的操作口诀**：
1. 可缓存路径：最前端层**强制覆盖** Edge/Browser TTL + 下发完整 `public` 头 + **剥掉一切 `no-store`/`private`**；Worker/源站头仅作兜底。
2. 不可缓存路径：最前端层**显式 `no-store`**，确保必回源进函数。
3. `cloudflare_only`（CF）保持关闭，让最前端改写的头真正到达浏览器。

---

## 部署后检查清单

- [ ] `_worker.js` 已部署（Workers 粘贴 / Pages 构建产物）
- [ ] `CDN_KV` 已绑定（Cloudflare 与 EdgeOne 均必填）
- [ ] 需用 R2 回源（`engine:'r2'`）：`CDN_R2` 已绑定到对应 R2 桶，源站 `r2Binding` 与绑定变量名一致
- [ ] CF Workers：Settings → Cache → **"Cache responses from fetch handlers" 已开启**（不开启则 CDN 边缘不缓存 Worker 响应，每请求都进 Worker 耗额度）
- [ ] CF Pages：Settings → Functions → **"Cache" 已开启**（同上）
- [ ] `ADMIN_PASSWORD` / `JWT_SECRET` / `ADMIN_PATH` 已设
- [ ] EdgeOne 额外确认 `CLOUD_PLATFORM=edgeone`
- [ ] EdgeOne：KV 命名空间已创建、审核通过并以 `CDN_KV` 为变量名绑定（**只需绑 Edge Function 侧**——EO KV 仅在 Edge Functions 可用，Cloud Functions 拿不到，且当前无 Cloud Function 可加载函数）
- [ ] EdgeOne：管理面 UI 资源已随 `dist/public/` 自动托管（访问 `/{ADMIN_PATH}/` 应能看到控制台，且浏览器 Network 面板里 `app.js`/`app.css` 走静态托管而非函数）
- [ ] EdgeOne：管理 API 与数据面代理同在 Edge Function 执行（访问 `/{ADMIN_PATH}/api/*` 在 Edge 运行时跑，依赖 KV；Cloud Function 仅预留给不依赖 KV 的重活）
- [ ] 访问 `https://你的域名/<ADMIN_PATH>` 能登录
- [ ] 「系统信息」页能力探测符合预期（EO 持久化后端显示 `kv`）
- [ ] 用加速域名访问资源，响应头含 `X-Cache` / `X-Origin-Addr` / `Server: EdgeGateway`

---

## CI/CD 自动化

源码同时托管在两个平台，各有一套流水线：

- GitHub：<https://github.com/JacksonJiangxh/cdn-edge-gateway>
- CNB：<https://cnb.cool/xzydm/cdn-edge-gateway>

> **核心约束：全流程零自动触发。**
> 两个平台的配置里**不存在任何 `push` / `pull_request` 事件**——不只是「不自动部署」，
> 而是连构建校验也不会自动跑。所有流水线（含只读的校验）都必须由人手动点击发起，
> 从机制上杜绝生产错乱。

### 文件一览

| 平台 | 文件 | 作用 | 触发方式 |
|---|---|---|---|
| GitHub | `.github/workflows/ci.yml` | 构建 + 自检 + 配置校验（不部署） | **仅手动** |
| GitHub | `.github/workflows/deploy-cf-workers.yml` | 部署 CF Workers | **仅手动** |
| GitHub | `.github/workflows/deploy-cf-pages.yml` | 部署 CF Pages | **仅手动** |
| GitHub | `.github/workflows/deploy-eo-pages.yml` | 部署 EO Pages | **仅手动** |
| CNB | `.cnb.yml` | 全部流水线（只有 `$` 兜底块，无 `main` 块） | **仅按钮** |
| CNB | `.cnb/web_trigger.yml` | 手动按钮定义 | — |

### GitHub：手动部署

Actions → 左侧选中目标工作流 → **Run workflow**。四个工作流都只有 `workflow_dispatch` 触发器。

防误触设计：所有部署工作流必须在 `confirm` 输入框填 **`deploy`**，否则第一步直接失败退出。Workers 另有 `dry_run` 干跑选项，EO Pages 可选 `preview` / `production` 环境。

**所需 Secret**（Settings → Secrets and variables → Actions → Secrets）：

| 名称 | 用于 | 说明 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CF | 需含 `Workers Scripts:Edit`（Workers）或 `Cloudflare Pages:Edit`（Pages）权限 |
| `CLOUDFLARE_ACCOUNT_ID` | CF | Cloudflare 账户 ID |
| `EO_SECRET` | EO | EO Pages 控制台 → API Token 新建（字段名与 CNB 密钥仓库刻意保持一致） |

**可选 Variable**（同页 Variables 标签）：`CF_PAGES_PROJECT`、`EO_PAGES_PROJECT`，均默认 `cdn-edge-gateway`。

### CNB：手动部署

CNB 没有 GitHub 那样内置的 Run workflow 按钮，需要自己在 `.cnb/web_trigger.yml` 里声明；仓库页面会依此渲染出四个按钮。注意 CNB 限制：**自定义按钮只能触发 `web_trigger` 开头的事件**。

| 按钮 | 事件 | 作用 |
|---|---|---|
| 🔍 构建校验 | `web_trigger_verify` | 只构建自检，不碰线上 |
| 🚀 部署 CF Workers | `web_trigger_deploy_cf_workers` | 手动发布 Workers，带干跑选项 |
| 🚀 部署 CF Pages | `web_trigger_deploy_cf_pages` | 手动发布 Pages，可填项目名与目标分支 |
| 🚀 部署 EO Pages | `web_trigger_deploy_eo_pages` | 手动发布 EO Pages，可选 preview / production |

**凭据配置（与 GitHub 不同，务必注意）**：CNB 不支持在仓库里直填 Secret，凭据必须放在**独立的密钥仓库**，再由 `.cnb.yml` 的 `imports` 导入。参见 <https://docs.cnb.cool/zh/repo/secret.html>。

> **一份密钥文件，两边共用。** CNB 密钥仓库里的字段名与 GitHub 的 Secret 名刻意保持一致（见下表），因此同一份内容既能喂 CNB 的 `imports`，也能直接复制到 GitHub 的 Secrets 里，无需为两边维护两套命名。

**CNB / GitHub 字段对照表**（同一份值，两种注入方式）：

| 字段名 | 用途 | CNB 注入方式 | GitHub 注入方式 |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CF Workers / Pages | 密钥仓库 `imports` | Secrets 同名 |
| `CLOUDFLARE_ACCOUNT_ID` | CF 账户 ID | 密钥仓库 `imports` | Secrets 同名 |
| `EO_SECRET` | EO Pages API Token | 密钥仓库 `imports` | Secrets 同名 |
| `CF_PAGES_PROJECT` | 可选，CF Pages 项目名 | 密钥仓库 `imports` | Variables 同名 |
| `EO_PAGES_PROJECT` | 可选，EO Pages 项目名 | 密钥仓库 `imports` | Variables 同名 |

1. 新建仓库时**类型选「密钥仓库」**（密钥仓库禁止 clone 到本地，只能网页编辑，这正是它安全的原因）。本项目地址已设为 <https://cnb.cool/xzydm/xzsecret/-/blob/main/cdn-edge-gateway.yml>，其中放 `cdn-edge-gateway.yml`：

   ```yaml
   CLOUDFLARE_API_TOKEN: your_token_here
   CLOUDFLARE_ACCOUNT_ID: your_account_id
   CF_PAGES_PROJECT: cdn-edge-gateway
   EO_SECRET: your_edgeone_api_token
   EO_PAGES_PROJECT: cdn-edge-gateway
   ```

2. 在本仓库环境变量中设 `CNB_SECRET_ENVS`，指向该文件的完整地址（不填则用默认路径 `https://cnb.cool/xzydm/xzsecret/-/blob/main/cdn-edge-gateway.yml`）：

   ```
   https://cnb.cool/xzydm/xzsecret/-/blob/main/cdn-edge-gateway.yml
   ```

> 密钥仓库默认只有**仓库管理员/负责人**触发的流水线才能引用，可在密钥文件里用
> `allow_slugs` / `allow_events` / `allow_branches` 进一步收窄授权范围。

### EdgeOne Pages 的两条部署路径

EO Pages 有两种部署方式，本项目**推荐走流水线**：

1. **流水线部署（推荐，已配置）**：用 EO 官方 CLI `edgeone makers deploy` 直接推送产物。
   CNB 侧用腾讯云提供的 `tencentcom/deploy-eopages:latest` 镜像（内置 CLI，命令为 `edgeone makers deploy`）；
   GitHub 侧用 `npx edgeone makers deploy`。两边都只有手动触发，且支持 preview / production 分环境。
2. **控制台连 Git 自动构建**：EO 控制台绑定仓库后自行拉取构建，**不经过流水线**。
   这条路会绕开「禁止自动部署」的约束，若你已配置，请到 EO 控制台把项目的**自动构建关掉**。

**部署目录为仓库根目录（`.`），不是 `dist/public`**：EO Makers 依赖根目录的 `edge-functions/`（Catch-all 薄壳 → `_worker.js`）承载全部动态请求，并自动托管 `dist/public/` 静态资源。只传 `dist/public` 会得到「静态页能开、API 全 404」的站点。新版 Makers 用命令 `npx edgeone makers deploy . -n <项目> -t <token>`（旧版 `edgeone pages deploy` 已不适用）。
