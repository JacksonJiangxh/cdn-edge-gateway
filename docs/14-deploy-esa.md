# 部署到阿里云 ESA Functions / Pages

本文说明如何把 cdn-edge-gateway 部署到阿里云 **边缘安全加速 ESA** 的 Functions / Pages 平台。

> 官方文档入口：`help.aliyun.com/zh/edge-security-acceleration/esa/`
> 关键参考页：《PAGES构建和路由指南》《函数和Pages的触发》《函数和Pages指标》《即时日志》《使用边缘函数查看KV中的KEY值》《函数和Pages CLI工具》

---

## 0. 前置结论：能复用吗？

**能，且改动极小。** ESA 函数运行在 **V8 Isolate**，仅支持 JavaScript ES6，与 Cloudflare Workers / EdgeOne 同构。本项目的：

- 业务逻辑（`src/`）**零改动**；
- 入口已双导出（`src/entry.js` 同时 `export default { fetch }` 与 `export function onRequest`），ESA 入口薄壳 `esa/index.js` 直接转发；
- KV 持久化：阿里云 ESA 的 **EdgeKV 按量收费且无免费额度**，本项目在 ESA 上**统一禁用厂商 KV**，
  持久化强制走外置 **REDIS_URL Webdis**（`src/platform/redis-kv.js` 已内置适配器），
  `getKV` 在 ESA 平台直接跳过 EdgeKV 分支。
- 边缘缓存已含 **响应头委托分支**（`src/platform/cache.js` 的 EO 同构逻辑），ESA 无 `caches.default` 时复用。

只需新增：`esa/index.js`（入口薄壳）、`esa.jsonc`（IaC 配置）、平台探测分支（`src/platform/caps.js`）。

---

## 1. ESA 平台约束（来自官方文档，必须正视）

| 约束 | 数值 | 对本项目的影响与应对 |
|------|------|----------------------|
| 函数代码包大小 | ≤ 4 MB | 本项目打包后 `_worker.js` 仅几百 KB，安全 |
| **每请求子请求（fetch）上限** | **32 个** | ⚠️ 且 Cache 操作与 fetch **共享**同一预算（详见 §4 与 §5） |
| **内存规格** | **128 MB** | 与 CF Workers 同级；本项目峰值占用远低于此 |
| 响应时间 | 120 s | 充裕（CF 免费版仅 10s，ESA 更宽松） |
| 网关等待超时 | 10 s（超则返回 504） | 回源超时已默认 10s 内 |
| 静态单文件 | ≤ 25 MB | `dist/public/assets/*` 远小于此 |
| 静态文件总数 | ≤ 2000 | 本项目仅数个，安全 |
| 原生 KV | **有（EdgeKV）** | `new EdgeKV({namespace})` 全局类；免费额度可能不含/单独计费，不含时降级 REDIS_URL，见 §3 |
| `caches.default` | **无（但提供全局 `cache` 单实例）** | ESA 原生支持 Cache API（`cacheSingleInstance=true`），`cache.js` 已适配全局 `cache`；`put` key 须 http URL（`cacheKeyHttpOnly=true`） |
| TCP socket（`engine='socket'`） | **无** | 自动降级 fetch 引擎（`caps.hasSocket=false`） |
| R2 回源（`engine='r2'`） | **无** | 自动禁用（前端已按 `caps.hasR2` 灰掉） |

---

## 2. 目录与文件

```
esa/
  index.js        # ESA 函数入口薄壳（转发到 _worker.js）
esa.jsonc         # ESA Pages IaC 配置（entry / assets / build）
_worker.js        # 构建产物（esbuild 打包，无需改动）
dist/public/      # 构建产物：管理面静态资源（被 ESA 静态托管）
```

`esa.jsonc` 要点：
- `entry: "./esa/index.js"` —— 指向薄壳；
- `assets.directory: "./dist/public"` —— 复用构建产物静态目录；
- `buildCommand: "npm run build"` —— 先构建出 `_worker.js` 与 `dist/public`，再被 ESA 加载；
- **不配置 `notFoundStrategy`**：ESA 文档明确「同时配置函数与 notFoundStrategy 时，导航请求不会触发函数」。管理面 `/__panel` 是导航请求，若配 `singlePageApplication` 会被 index.html 兜底吞掉、进不了函数。故留空，让所有未命中静态资源的请求都落到函数。
- **环境变量不在 `esa.jsonc` 里**：官方 `esa.jsonc` 仅支持 `name` / `entry` / `installCommand` / `buildCommand` / `assets`，**没有顶层 `env` 字段**。平台相关变量（`CLOUD_PLATFORM` / `ESA_KV_NAMESPACE` / `REDIS_URL` 等）需在 **ESA 控制台**设置（控制台「构建信息-修改」或函数「环境变量」）。

  > 备选：若实测 ESA 默认把导航请求兜底 index.html，则改 `esa.jsonc` 为
  > `"notFoundStrategy": "404Page"` 且仓库**不提供** `404.html`，使其落到函数执行。

---

## 3. 持久化（强制外置 REDIS_URL —— ESA 禁用厂商 KV）

⚠️ **关键成本约束**：阿里云 ESA 的原生边缘存储 **EdgeKV 按量收费、且无免费额度**。
因此本项目在 ESA 上**统一禁用任何厂商 KV**（不创建 EdgeKV 适配器、不依赖其免费额度），
持久化**一律走外置 `REDIS_URL`**（你自建的 Webdis/Redis）。

代码层面已落实该策略（`src/platform/kv.js` 的 `getKV`）：
`getKV` 在 `CLOUD_PLATFORM=esa` 时**直接跳过 EdgeKV 分支**，只剩
**CDN_KV/KV（CF/EO）→ REDIS_URL → 无持久化** 的链路。ESA 运行时只要没设 REDIS_URL，
`store.js` 的 `requireKV` 会明确报错提示「请用 REDIS_URL」而非悄悄去用收费的 EdgeKV。

### 唯一方式：REDIS_URL（自建 Webdis/Redis）

走 `src/platform/redis-kv.js` 已内置的 Webdis 路径：

1. 自建 Webdis 实例（https://github.com/nicolasff/webdis），前置带鉴权的反代 + TLS；
2. ESA 控制台「函数和 Pages → 目标 → 环境变量」设置：
   - `CLOUD_PLATFORM=esa`（可选，薄壳 `esa/index.js` 会强制补，可不设）
   - `REDIS_URL=https://your-webdis.example.com`（**必填**，否则配置无法保存）
   - `REDIS_TOKEN=Bearer xxxx`（可选，作为 Authorization 头直传）
   - `REDIS_PREFIX=cg1:`（可选，多应用共享 Redis 时隔离）
3. `getKV` 检测到 ESA 平台 → 跳过 EdgeKV → 命中 `REDIS_URL` → 用 Webdis 适配器。

> 注意：REDIS_URL 每次 KV 读 = 1 个 fetch，受 §4 的 32 子请求共享预算约束（Cache 操作与 fetch 共享）。
> 安全红线：Webdis 默认无鉴权且明文暴露，自建务必①仅内网/套 TLS ②前置带密钥反代
> ③绝不公网裸露。详见 `docs/13-redis-kv.md`。

无论何种部署，配置、站点、源站池、统计、熔断锁全部透明持久化，store.js / stats / security 零改动。

---

## 4. ⚠️ 32 个子请求上限专项（Cache 与 fetch 共享）

ESA 限制**每个请求最多发 32 个子请求**，且 **Cache 操作与 `fetch` 共享同一预算**（`cacheSubreqLimit=32`）。本项目在 ESA 上持久化走 **REDIS_URL**
（每次 KV 读 = 1 个 fetch），子请求压力分析如下：

### 数据面（占比 99% 的请求）—— 安全
- 稳态：`store.js` 的 L1 内存缓存命中后 KV 读为 0，仅 1 个回源 fetch。
- 冷启动：首次读 `cfg:global`（1 Webdis fetch）+ 回源（1 fetch）= 2 个。
- **结论：全程 ≤2 fetch，低于 4 上限，无压力。**

### 管理面（`/__panel`）—— 站点较多时需警惕
- 管理面 `ctx.mgmt` 跳过 L1 直读 KV。`listSites` 对 N 站点并发发 N 次 Webdis fetch——
  **若站点数 > 3，单次管理面请求会突破 4 个 fetch 上限而 500**。
- 规避：控制 ESA 上的站点规模；或把管理面操作放其它平台、ESA 仅跑数据面代理。

### 增强路线（待实现，社区向）
1. **Webdis MGET 批量**：`redis-kv.js` 扩展 `mget`，把 `listSites` 的 N 次读合并成 1 个 fetch。
2. **`caps.maxSubRequests` 已暴露**（ESA=32，且 Cache 与 fetch 共享）：`store.js` 的 `listSites` 据其切到 MGET。
3. 管理面改「先读索引（1 fetch）→ MGET 取全部站点（1 fetch）」两阶段，恒定 ≤2 fetch。

---

## 5. 缓存（全局 `cache` 单实例 → 已适配）

`src/platform/cache.js` 已包含 ESA 适配分支（`caps.cacheSingleInstance=true`）：
- ESA 原生支持 Cache API，但形态是**全局 `cache` 单实例**（无 `caches.default` / `open` 命名空间），`hasCacheApi=true`；
- 写缓存调用 `cache.put` / 读调用 `cache.match`；`put` 的 key 必须为 **http URL**（`cacheKeyHttpOnly=true`，`cache.js` 写入时自动将 https 降为 http）；
- Cache 操作与 `fetch` **共享 32 子请求硬上限**（`cacheSubreqLimit=32`），注意预留回源 fetch 预算；
- 单键 purge 调用 `cache.delete`（仅作用于当前节点），存入条目仍须 TTL 到期才真正失效；大规模清除建议结合「缓存代次」使旧键整体失效（与 CF / EO 机制一致）。

---

## 6. 部署步骤

> **先分清两类操作：**
> - **流水线部署（CI/CD 按钮 / Actions）= 零交互**。本仓库的 CNB / GitHub「部署 ESA Pages」
>   按钮通过环境变量 `ESA_ACCESS_KEY_ID` / `ESA_ACCESS_KEY_SECRET` **跳过交互式 login**
>   （与官方「云效 Flow + ESA CLI」教程一致），直接 `check → build → esa-cli commit → deploy`。
> - **手动部署 = 可交互**。你在本机终端跑 `esa-cli login`（交互输入 AK/SK）后 `commit + deploy`，
>   属个人本地操作，命令见方式 B/D。
> 关键点：流水线发布命令**必须带 `--assets .`（仓库根，含 esa.jsonc）**，不能只传 `./dist`。

### 方式 A：ESA 控制台连接 Git 仓库自动部署（可选，最省心，无需 CLI）
1. fork/推本仓库到 GitHub 或 CNB；
2. ESA 控制台 → 边缘计算和 AI → 函数和 Pages → 新建 Pages → **连接 GitHub/CNB 仓库（根目录）**；
3. ESA 自动读取 `esa.jsonc`（`entry` / `assets` / `buildCommand`）并构建；
4. **控制台「环境变量」必须设置 `REDIS_URL`**（§3：ESA 禁用厂商 KV，持久化唯一来源）；
5. 部署后绑定域名或走 ESA 提供的测试域名。
> 此后每次 push 主分支 ESA 会自动重新构建部署，无需手动操作。与方式 C 的流水线按钮二选一，不要同时开自动部署以免冲突。

### 方式 B：esa-cli 命令行部署（**手动 / 可交互**）
```bash
npm install esa-cli -g        # 全局安装
esa-cli login                 # AK/SK 登录（RAM 控制台获取，交互式，仅本机手动执行）
npm run build                 # 先构建出 _worker.js 与 dist/public（仓库已带 esa.jsonc）
esa-cli commit                # 提交为云上版本
esa-cli deploy --name project_name --assets .   # 注意：目录是仓库根 .，不是 ./dist
esa-cli domain add <domain>   # 绑定域名（须 ESA 子域且已备案）
```
本地调试：`esa-cli dev`（边缘存储 API 不读线上数据，需 `kv.json` 模拟）。
仓库已加脚本：`npm run deploy:esa`（先 build，再打印上述步骤）。
> ⚠️ 注意 `esa-cli login` 是**交互命令**，只能在本机手动用，**不能放进流水线**；流水线用方式 C 的环境变量绕过。

### 方式 C：GitHub Actions / CNB 流水线「部署 ESA Pages」按钮（**非交互**，本仓库已内置）
仓库已提供 `.github/workflows/deploy-esa-pages.yml`（仅 `workflow_dispatch` 手动触发）与
CNB「部署 ESA Pages」按钮（`.cnb.yml` 的 `web_trigger_deploy_esa_pages`）。两者**都用环境变量
`ESA_ACCESS_KEY_ID` / `ESA_ACCESS_KEY_SECRET` 非交互登录后直接发布**：

1. GitHub：Settings → Secrets → Actions 加 `ESA_AK_ID`、`ESA_AK_SECRET`（阿里云 RAM 用户 AccessKey，
   建议 `AliyunESAFullAccess` 或最小 ESA 权限）；CNB：密钥仓库加同名字段。可选 Variables 加
   `ESA_PROJECT`（项目名，默认 `cdn-edge-gateway`）；
2. GitHub：在 **Actions → 部署阿里云 ESA Pages（手动）** 点 Run workflow，选环境（production/preview）；
   CNB：点「🚀 部署 ESA Pages」按钮，填 `esa_env`（默认 production）、`esa_pages_project`（可选）；
3. 流水线执行 `npm ci → npm run check → npm run build`；
4. 注入 `ESA_ACCESS_KEY_ID`/`ESA_ACCESS_KEY_SECRET` 后 `esa-cli login`（非交互）→
   `esa-cli commit` → `esa-cli deploy --name <项目> --assets .`；
5. **部署前请先在 ESA 控制台「环境变量」设好 `REDIS_URL`**（CI 无法替你设运行期变量）。
> 若 `esa-cli` 某版本不支持纯环境变量登录，可在本机用方式 B 的 `esa-cli login` 手动发布，
> 或改用方式 A 的控制台连接仓库自动部署。

### 方式 D：基于官方 skill 的脚本化部署（esa-cli 驱动，**手动 / 可交互**）
本仓库已接入阿里云官方 Agent Skills 仓库 `aliyun/alibabacloud-aiops-skills` 中的
**`alibabacloud-esa-pages-deploy`** skill（项目级软链接：`/workspace/.codebuddy/skills/alibabacloud-esa-pages-deploy`）。

该 skill 描述的是把代码部署到 ESA Functions & Pages。但需注意：**阿里云官方的编程式上传通道
（`mcp-server-esa` 的 `html_deploy`/`folder_deploy`、以及 SDK 的 `CreateRoutineWithAssetsCodeVersion`）
底层都会走 OSS 中转上传**。本仓库**刻意不采用 OSS 通道**，而是复用 skill 给出的 `esa-cli` 路径：
由官方 `esa-cli` 读取 `esa.jsonc`（`entry` + `assets.directory`）完成打包，上传与构建由阿里云后台处理
（与控制台/GitHub 连接部署是同一通道，**完全不经过 OSS**）。

仓库已在 `scripts/deploy-esa-cli.mjs` 做了项目级接入，并封装为 npm 脚本 `deploy:esa:cli`：

```bash
# 前置：esa-cli login（AK/SK，需 AliyunESAFullAccess），并开 ER 服务
npm run deploy:esa:cli                 # 默认 env=production
npm run deploy:esa:cli staging "hotfix" # 可指定环境/说明
# 等价手动：npm run build && esa-cli commit --description "..." && esa-cli deploy --environment production
```

> 与方式 A/B/C 的区别：方式 D 走 `esa-cli`（需 `esa-cli login` 交互），更适合脚本化 / 多环境
> （preview/staging/production）切换与**本地手动**调用，但仍**不碰 OSS**（由阿里云后台上传）。
> 部署后仍需在 ESA 控制台**绑定域名/路由并设 `REDIS_URL`**。

无论 A/B/C/D，部署目录都是**仓库根目录**（含 `esa.jsonc` + `dist/public`），不是只传 `dist/public`。

### 方式 D：基于官方 skill 的脚本化部署（esa-cli 驱动，**不依赖 OSS**）
本仓库已接入阿里云官方 Agent Skills 仓库 `aliyun/alibabacloud-aiops-skills` 中的
**`alibabacloud-esa-pages-deploy`** skill（项目级软链接：`/workspace/.codebuddy/skills/alibabacloud-esa-pages-deploy`）。

该 skill 描述的是把代码部署到 ESA Functions & Pages。但需注意：**阿里云官方的编程式上传通道
（`mcp-server-esa` 的 `html_deploy`/`folder_deploy`、以及 SDK 的 `CreateRoutineWithAssetsCodeVersion`）
底层都会走 OSS 中转上传**。本仓库**刻意不采用 OSS 通道**，而是复用 skill 给出的 `esa-cli` 路径：
由官方 `esa-cli` 读取 `esa.jsonc`（`entry` + `assets.directory`）完成打包，上传与构建由阿里云后台处理
（与控制台/GitHub 连接部署是同一通道，**完全不经过 OSS**）。

仓库已在 `scripts/deploy-esa-cli.mjs` 做了项目级接入，并封装为 npm 脚本 `deploy:esa:cli`：

```bash
# 前置：esa-cli login（AK/SK，需 AliyunESAFullAccess），并开 ER 服务
npm run deploy:esa:cli                 # 默认 env=production
npm run deploy:esa:cli staging "hotfix" # 可指定环境/说明
# 等价手动：npm run build && esa-cli commit --description "..." && esa-cli deploy --environment production
```

> 与方式 A/B/C 的区别：方式 D 走 `esa-cli` 而非控制台/GitHub 连接，更适合脚本化 / 多环境
> （preview/staging/production）切换与 CI 调用，但仍**不碰 OSS**（由阿里云后台上传）。
> 部署后仍需在 ESA 控制台**绑定域名/路由并设 `REDIS_URL`**。

---

## 6.1 官方 skill 接入与软链接（跨 CLI 通用）

本项目以 **CodeBuddy** 为主，skill 实体统一放在 `.codebuddy/skills/`；同时为兼容其它标准
CLI（Claude Code / Codex 等约定 `~/.agents/skills` 或 `.agents/skills`），把 skill **软链接**
到 `.agents/skills/`，实体只保留一份（避免两份漂移）。

```text
.codebuddy/skills/alibabacloud-esa-pages-deploy   ← skill 实体（唯一真源）
.agents/skills/alibabacloud-esa-pages-deploy     → ../../.codebuddy/skills/alibabacloud-esa-pages-deploy  (软链接)
.agents/skills/cloudflare                        → ../../.codebuddy/skills/cloudflare                      (软链接，同上)
.agents/skills/edgeone-makers-tools              → ../../.codebuddy/skills/edgeone-makers-tools           (软链接，同上)
```

> 如需让其它 CLI 工具发现，可把 `.agents/skills` 软链到其约定的全局目录
> （如 `ln -s /workspace/.agents/skills ~/.agents/skills` 或 `~/.claude/skills`）。

---

## 7. 验证

部署后访问：
- `https://<your-domain>/__health` → 返回 JSON，其中 `platform` 应为 `"esa"`、`caps.maxSubRequests` 为 `32`、`caps.cacheSubreqLimit` 为 `32`、`caps.kvBackend` 为 `"native"`（用 EdgeKV）或 `"redis"`（用 REDIS_URL）。
- `https://<your-domain>/<adminPath>/` → 管理面。
- 数据面代理请求 → 正常回源。

---

## 8. 触发与路由（函数如何被访问）

ESA 函数和 Pages 必须绑定到一个**可用站点**（已购套餐且 NS/CNAME 接入）后才能对外服务。两种触发方式（来自《函数和 Pages 的触发》文档）：

### 8.1 域名绑定（全量触发，推荐本项目）
- 路径：函数和 Pages → 目标 → **域名页签** → 添加域名（如 `gateway.example.com`）。
- 效果：该域名下**全部请求**都交给函数处理（包括 `/__panel` 管理面与数据面代理）。
- 本项目 `entry` + `assets.directory` 组合正是此形态：静态资源由 ESA 直接托管，其余请求进函数薄壳。

### 8.2 路由（路径精细化触发）
- 路径：域名页签 → **路由栏** → 添加路由。
- 支持简单模式（`host/path/*`）与自定义模式（组合请求头 / Cookie / 方法等条件）。
- 匹配规则硬约束：
  - 必须同时含**主机名 + 路径 URI**（只写 `/path` 不可配）；
  - 支持前后通配符 `*`（如 `example.com/*`），**不支持中间通配符**（如 `example.com/*/path`）；
  - **区分大小写**（`/a` 与 `/A` 不同）；不支持 `?param=1` 这类查询参数匹配；
  - 多规则冲突时**优先匹配更早配置的规则**。
- 适用：把 `/api/*` 鉴权 / `/__panel/*` 管理面交给函数，其余走原站加速。

### 8.3 旁路模式（特殊）
- 开启后命中路由的请求以**子请求旁路**访问函数（**请求体不转发**）。
- 函数入口由 `fetch()` 改为 `bypass()`，返回 `new ResponseBypass(true/false, {status})`：
  - `true`/200 → 继续原流程（缓存或回源），响应不再经函数；
  - `false`/非 200 → ESA 中止并返回 403。
- 适用：日志打点、大文件下载鉴权（避免 CPU 超限）。本项目**不启用**旁路模式（需全量请求进函数处理）。

> 接入方式：NS 接入约 1 分钟 DNS 生效；CNAME 接入需去 DNS 服务商手动加 CNAME，状态「已配置」后方可访问。绑定域名继承站点证书，无证书则无法 HTTPS。

---

## 9. 调试与可观测

### 9.1 实时日志（console.alert，非 console.log）
ESA「即时日志」**只采集 `console.alert(...)` 输出**（映射到日志字段 `ConsoleLog`），`console.log` 不会进即时日志。
- 查看路径：控制台 → 函数和 Pages → 目标 → **日志 > 即时日志 > 开始监测**（窗口最长 60 分钟，单次最多存 40 条，切换页面会清空）。
- 本项目调试时，若要在 ESA 即时日志看到输出，请用 `console.alert` 而非 `console.log`。
- 指标（控制台 → 指标）：请求数 / 子请求（按 2xx~5xx）/ CPU 时间(P50/P90/P99) / 请求持续时间 / 错误数（错误码 1~6：脚本异常、CPU 超限、内存超限、执行超时、客户端断连、内部错误）。

### 9.2 本地调试（esa-cli dev）
`esa-cli dev` 启动本地服务模拟线上，边缘存储 API 用项目根目录 `kv.json` 模拟 EdgeKV 数据（结构 `{ "<namespace>": { "<key>": "<value>" } }`）。
快捷键：`b` 浏览器打开、`d` 调试引导、`c` 清面板、`x` 退出。注意本地 `dev` **不需要 `esa-cli login`**。

---

## 10. 已知待实测点（需你从 ESA 控制台确认）

1. **env 注入方式**：ESA 文档示例 `fetch(request)` 只显式写 request 一个参数，但未说明是否支持 CF Workers 范式的 `fetch(request, env, ctx)` 第二/第三参数。本薄壳已做双重兜底（优先 fetch 第二参数、回退 process.env、强制 CLOUD_PLATFORM）。若实测 ESA 确实只传 request 且运行时变量在 `process.env`，当前方案已覆盖；若 ESA 走其它注入（如 `request` 上挂 bindings），需在 `esa/index.js` 的 `resolveEnv` 补对应提取。
2. **导航请求兜底**：§2 所述 `notFoundStrategy` 取舍，需实测 ESA 默认行为后定稿（当前选择不配置 notFoundStrategy，让 `/__panel` 导航请求落到函数）。
3. **平台识别**：`caps.js` 已改为「`CLOUD_PLATFORM` 显式声明 + 别名归一」（`readPlatform` 会把 `aliyun-esa`/`alibaba-esa` 等旧别名归一为 `esa`，非法值才抛错），薄壳 `esa/index.js` 会强制补 `CLOUD_PLATFORM=esa`，因此不需要运行时指纹探测。若想免设环境变量，需在 ESA 控制台（用 `esa-cli dev` 或临时函数）跑
   `console.alert(navigator.userAgent, Object.keys(globalThis).filter(k=>/esa/i.test(k)))`
   把指纹补进 `caps.js`（注意用 `console.alert` 才能进即时日志，见 §9.1）。
4. **REDIS_URL 子请求预算**：ESA 每请求子请求上限 = 4，而 REDIS_URL 每次 KV 读占 1 个 fetch（§4）。
   已确认数据面 ≤2 fetch 安全；管理面 `listSites` 在站点数 >3 时可能突破上限，建议控制
   站点规模或将管理面放其它平台。若后续 Webdis 支持 MGET 批量，可在 `redis-kv.js` 扩展 `mget`
   并让 `store.js` 据 `caps.maxSubRequests` 切批读。
