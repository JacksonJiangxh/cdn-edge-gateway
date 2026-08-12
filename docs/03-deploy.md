# 03 · 部署指南（小白线性流程）

> 上一篇：[02 环境准备](./02-prerequisites.md) ｜ 下一篇：[04 配置详解](./04-configuration.md)
>
> 本篇按**严格先后顺序**带你把服务跑起来。每一节是一个「步骤」，请从上往下做，不要跳。
> 当某一步出现「你该选哪条路」时，分支就在那一步里就地展开，照着对应分支做即可。

---

## 0. 你只需要先想清楚一件事：选哪个平台

本服务有两套**互相独立**的平台，二选一，**不要两边都部署**（会状态漂移、难排查）：

- **A. Cloudflare（CF）**：海外节点、生态成熟。分两种**形态**：
  - **Workers 形态**（有 TCP 回源）：用 WR 命令行（A1）/ 粘贴代码（A2）/ 流水线「部署 CF Workers」按钮（A4a）。
  - **Pages 形态**（无 TCP 回源、最省心）：用 CF Pages（A3）/ 流水线「部署 CF Pages」按钮（A4b）。
- **B. EdgeOne（EO）**：国内节点，适合业务在国内。只有 1 套 Makers 部署逻辑。

> 同一个服务只选**一种形态**部署。CF 的 Workers 形态与 Pages 形态是两套独立入口，不要混用（会状态漂移、难排查）。
> 下面的步骤 **第 1 步～第 4 步是通用的**（建项目、绑 KV、设变量、开缓存），**第 6 步才分叉**到「Workers 形态还是 Pages 形态、怎么把代码推上去」。第 6 步开头有一张对照表帮你决定。

---

## 第 1 步：新建项目 / 服务（必须最先做）

> **铁律：先有项目，才能绑 KV、设变量、绑域名。** 项目没建，后面所有设置都「无处安放」。所以这一步排在最前，CF 和 EO 都要先建。
> **第 1 步的「建什么容器」就决定了形态**：建 **Worker** = 走 Workers 形态（A1/A2/A4a）；建 **Pages 项目** = 走 Pages 形态（A3/A4b）。先想清楚要不要 TCP 回源（见第 6 步对照表），再决定建哪个。

### 分支 A：Cloudflare

你要先建好一个「承载容器」。按你后面打算走的形态，建法不同：

- **走 Workers 形态（要 TCP 回源 / R2 直连，用 A1/A2/A4a）** → 建 **Worker**：
  Dashboard → **Workers & Pages** → **Create** → **Create Worker** → 起名（如 `edge-cdn`）。
  记下这个名字，它就是你的服务名（流水线「部署 CF Workers」按钮也用它）。
- **走 Pages 形态（纯域名源站、图省心，用 A3/A4b）** → 建 **Pages 项目**：
  Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**，先建好 Pages 项目（构建命令 `npm run build`、输出目录 `.`），再往下走。

### 分支 B：EdgeOne

EO 控制台 → **Makers**（或边缘函数 / Pages 入口）→ **新建项目** → **导入 Git 仓库**（关联本仓库）。

填写并记下：

| 字段 | 填什么 | 说明 |
|---|---|---|
| 项目名称（Project Name） | 如 `edge-cdn` | 后面流水线和本地部署里 `EO_PAGES_PROJECT` / `project name` 的取值来源 |
| 构建命令 | `npm run build` | 固定 |
| **输出目录** | **`.`（句点）** | 产物在仓库根，**不要填 `dist`** |
| 关联 Git 仓库 | 选本仓库 | 便于后面流水线拉取 |

项目创建后控制台给出 **项目 ID / 环境域名**，一并记下备用。

> EO 的源站组配置（见 [07 回源 Host](./07-eo-origin-host.md)）也要求本步项目已存在。

---

## 第 2 步：构建一次，确认产物正常（可选但建议）

```bash
npm run build
```

`dist/public/` 下会产出 `index.html` + `assets/`（管理面静态资源走固定 `/assets` 路径，与 `ADMIN_PASSWORD` / `ADMIN_PATH` 解耦，构建期不读这些变量）。

> 这一步主要是让你本地确认能构建成功。真正部署时，CF Pages / EO / 流水线会自己构建；只有 **WR 部署**和**粘贴部署**需要你本地先构建出 `dist/` 或 `_worker.js`。

---

## 第 3 步：创建并绑定存储

网关的配置全存在 **KV**，所以 KV 是**必做**项；**R2、D1 按需**（不用的话不用建）。三类存储都是「**先创建 → 再绑定到项目**」两步，变量名（binding）必须严格按下表，拼错服务就读不到。

| 绑定类型 | 变量名 | 何时需要 | 说明 |
|---|---|---|---|
| KV namespace | `CDN_KV` | **必做** | 存全部配置（站点/源站池/规则/全局），不绑服务起不来 |
| R2 bucket | `CDN_R2` | 源站 `engine=r2` 时 | **仅 Cloudflare**；回源到 R2 桶，走骨干网不出公网、不计 egress |
| D1 database | `CDN_DB` | `statsDriver=d1` 时 | 统计库；**EO 无 D1**，EO 请保持 `statsDriver=kv`（默认） |

> **门槛判断**：绝大多数用户只建 KV 就够了。只有「想让某个源站回源到 R2 桶」才建 R2；只有「CF 上想把访问统计存进 D1 而不是 KV」才建 D1。下面三种都给完整步骤，按你需要的来。

### 3.1 KV（必做）

**① 创建命名空间**

- **CF**：Dashboard → **Workers & Pages** → 左侧 **KV** → **Create a namespace**，起名（如 `cdn-kv`）。记下 **Namespace ID**。
- **EO**：控制台 → **存储 → KV 存储** → **创建命名空间**，起名（如 `cdn-kv`）。

**② 绑定到项目**（Variable name 必须写 `CDN_KV`）

- **CF**：你的 Worker/Pages → **Settings → Variables / Bindings** → **Add** → 选 KV namespace → 填 `CDN_KV`，关联到刚创建的命名空间。
- **EO**：项目设置 → **存储绑定** → 添加 KV 绑定，变量名 `CDN_KV`，关联命名空间。

### 3.2 R2（仅 Cloudflare，按需）

用于源站 `engine:'r2'`：Worker 进程内直接读 R2 桶，**不出公网、不计 egress 带宽费**，比「fetch 你的 R2 自定义域名」省得多。

**① 创建桶**

- **CF**：Dashboard → **R2** → **Create bucket**，起名（如 `cdn-assets`）。桶**无需**开启 Public Access / 自定义域——Worker 鉴权读取即可，更安全。
- **EO**：不支持 R2 binding，`engine:'r2'` 在 EO 运行时返回 502，请改用 `fetch` + 私有签名回源或平台对象存储方案。

**② 绑定到项目**（Variable name 必须写 `CDN_R2`）

- **CF**：你的 Worker/Pages → **Settings → Variables / Bindings** → **Add** → 选 R2 bucket → 填 `CDN_R2`，关联到刚创建的桶。

**③ 在源站配置里指定**（管理面或 `config/global` 的 `origins[]`）

```json
{ "engine": "r2", "r2Binding": "CDN_R2", "r2KeyMode": "none" }
```

> 桶名（`cdn-assets`）≠ 绑定变量名（`CDN_R2`）。源站配置里 `r2Binding` 填的是**变量名** `CDN_R2`，不是桶名。更多 key 映射规则见 [04 配置详解](./04-configuration.md)。

### 3.3 D1（仅 Cloudflare，按需）

用于把访问统计从默认 KV 改存 D1（查询更顺手）。EO 无 D1，保持默认 `statsDriver=kv` 即可。

**① 创建数据库**

- **CF**：Dashboard → **Workers & Pages** → 左侧 **D1** → **Create database**，起名（如 `edge-cdn-stats`）。记下 **database_id**。

**② 绑定到项目**（Variable name 必须写 `CDN_DB`）

- **CF**：你的 Worker/Pages → **Settings → Variables / Bindings** → **Add** → 选 D1 database → 填 `CDN_DB`，关联到刚创建的库。

**③ 开启 D1 统计**（管理面或 `config/global`）

```json
{ "statsDriver": "d1" }
```

> 不写则默认 `kv`，统计落 KV，无需建 D1。

---

## 第 4 步：设置运行时变量与密钥

`ADMIN_PASSWORD` / `JWT_SECRET` 是**运行时密钥**，构建期不读，改了无需重新构建。

| 变量 | 类型 | 值怎么来 | 说明 |
|---|---|---|---|
| `ADMIN_PASSWORD` | **Secret / 密钥** | 你的强密码 | 管理面登录密码 |
| `JWT_SECRET` | **Secret / 密钥** | 终端跑 `openssl rand -hex 32` 的输出 | 登录态签名，勿用简单串 |

- **CF**：Worker/Pages → **Settings → Environment Variables**。两项均选 **Secret（加密）** 类型。
- **EO**：项目设置 → **环境变量**：`ADMIN_PASSWORD`(密钥) / `JWT_SECRET`(密钥) / 额外加 **`CLOUD_PLATFORM=eo`**（必填，驱动平台识别；CF 侧代码自动探测可省略）。

### 🔑 关于 `ADMIN_PATH`（管理面入口前缀）—— 不要在变量页面设置

`ADMIN_PATH` **不是**需要你在变量页面配置的变量，它由「管理面保存到 KV」管理，优先级最高：

```
KV 中管理面保存的值  >  内置默认 __panel
```

**推荐流程**：
1. 部署时用**内置默认 `__panel`** 兜底（部署脚本刻意不传该变量，变量页面不会出现 `ADMIN_PATH`，避免误以为入口一直是 `__panel`）。
2. 部署后首次登录管理面：访问 `https://你的域名/__panel`（默认前缀）。
3. 在管理面把「管理面路径」改成你自己的随机串（如 `p-8f3k9x2q`）并保存 → **存入 KV**，此后运行时永远读 KV 的值（最高优先级生效）。
4. 下次访问就用新前缀。

> ⚠️ 不要去变量页面设 `ADMIN_PATH`：那样变量页会出现它，小白容易误以为入口恒为那个值，而实际 KV 里已是别的——认知错乱。若你确实在 Dashboard 主动设了 `ADMIN_PATH`，运行时 env 层仍会作为兜底生效（`src/config/store.js`），但推荐用法是「管理面改 + 存 KV」。
> ⚠️ 部署脚本 `gen-deploy-config.mjs` 刻意**不处理** `ADMIN_PATH`，根 `wrangler.toml` 也不写死，始终保持干净。手动/CLI 部署用 `npm run deploy:cf` 即可。

> `CLOUD_PLATFORM` 是「平台识别」变量，**不是认证凭据**，也不进流水线。

### 无原生 KV 的平台（EO Pages / ESA 等）：用自部署 Redis 兜底

部分平台（如 EdgeOne Pages、ESA 等）**不提供 KV 绑定**，此时配置无法持久化。本项目支持通过 [Webdis](https://webd.is)（HTTP↔Redis 网关）读写你**自己部署的 Redis**，从而获得与平台 KV **完全同构**的持久化能力——配置、统计、缓存代次全部自动落到你的 Redis，上层代码无感。

在「环境变量」里加一组即可（无需 KV 绑定）：

| 变量 | 类型 | 说明 |
|---|---|---|
| `REDIS_URL` | 明文 | 你的 Webdis 基址，如 `https://redis.your-domain.com` 或 `http://127.0.0.1:7379` |
| `REDIS_TOKEN` | **Secret / 密钥**（可选） | Webdis 前置鉴权时的 Bearer Token；**强烈建议配置**，否则你的 Redis 会被公网任意读写 |
| `REDIS_PREFIX` | 明文（可选） | 键统一前缀，多应用共享一个 Redis 实例时用于隔离 |
| `REDIS_TIMEOUT_MS` | 明文（可选） | 单次请求超时，默认 5000ms |

> 生效逻辑：`getKV(env)` 优先用平台 `CDN_KV`/`KV` 绑定；**没有原生 KV 但检测到 `REDIS_URL` 时，自动切到 Webdis 后端**；两者都没有才降级为「无持久化（默认配置）」。系统信息页会显示当前 `kvBackend` 是 `native` / `redis` / `none`，并提供「测试连通性」按钮做读写回环验证。
>
> ⚠️ **安全红线**：Webdis 默认无鉴权且把 Redis 明文暴露到公网。自部署务必：① 仅监听内网或套 TLS；② 前置一层带密钥的反向代理（`REDIS_TOKEN` 即为此设）；③ 绝不把 `REDIS_URL` 指向裸露公网的 Webdis。详见 [13 · Redis/Webdis KV 兜底](./13-redis-kv.md)。

---

## 第 5 步：开启缓存开关（省额度）

各平台默认不缓存函数响应，不开则每请求都进函数、消耗额度。

- **CF Workers**：本项目 `wrangler.toml` 已内置顶层 `[cache] enabled = true`（Workers Cache / Smart Cache，为 fetch handler 响应设默认缓存行为），**无需在面板手动开**，部署即生效。该字段要求 `compatibility_date` ≥ 较新版本（本仓库已升到 `2026-08-11`），无需额外 compatibility_flag。
- **CF Pages**：Settings → Cache / Functions，把对应 Cache 开关设为 **Enabled**（Pages 不读 `wrangler.toml` 的 `[cache]`，需在面板开）。
- **EO**：控制台对应缓存开关设为 **Enabled**。配置生效约 1–2 分钟。

> ⚠️ CF Workers 的 `[cache]` 平台级缓存与代码层 `caches.default`（`src/platform/cache.js`）是两层机制：平台层命中时直接返回、不进函数；清除缓存需同时顾及两层（代码层按 URL 删，平台层用 Cache-Tag / API purge）。详见 [06 缓存策略](./06-cache-strategy.md)。

---

## 第 6 步：把代码推上去（这里是分叉点，选一条路）

前面 1–5 步已把「容器 + 配置」备好，现在只差「怎么把代码放进去」。

### 📌 CF 两种部署形态先分清（决定你有没有 TCP 回源能力）

Cloudflare 上有两条**互相独立**的部署形态，能力差异很大，**别混**：

| 维度 | **CF Workers 形态** | **CF Pages 形态** |
|---|---|---|
| 入口 | 单个 Worker（`_worker.js`），`wrangler deploy` 推上去 | Pages 项目（Git 构建），走 Pages Functions |
| **TCP Socket 回源** | ✅ 支持（`engine=socket`，裸 IP / 非标端口 / 自定义 Host + SNI） | ❌ 不支持，只能域名源站自动 Host，自动降级 fetch |
| R2 直连回源 | ✅ 支持（`engine=r2`） | ❌ 不支持 |
| KV/D1 绑定 | 在 Dashboard 绑，部署脚本自动保留（见 A1/A4a） | 在 Dashboard 绑，Pages 不读 toml，无覆盖风险 |
| 静态资产（管理面省额度） | 用 `wrangler.toml` 的 `[assets]` Static Assets | 由 Pages 静态托管 `dist/public/` |
| **适用** | 需要裸 IP / 自定义 Host / R2 回源 | 想 Git 自动构建、最省心、纯域名源站 |
| 对应本篇分支 | **A1（WR）/ A2（粘贴）/ A4a（流水线 Workers 按钮）** | **A3（CF Pages）/ A4b（流水线 Pages 按钮）** |

> 一句话：**要 TCP 回源（裸 IP / 自定义 Host / 非标端口）就选 Workers 形态（A1/A2/A4a）；只做域名源站、图省心就选 Pages 形态（A3/A4b）。**
> 部署后都可在管理面「系统设置」核对：`运行平台` 应为 `workers` 或 `pages`，`TCP Socket` 列与之对应（Workers=可用，Pages=不可用属正常）。
> ⚠️ 若选了 **Workers 形态却显示 `运行平台: pages` / `TCP Socket 不可用`**，是旧代码误判（见 [08 FAQ](./08-faq.md)），更新到最新代码重部署即可，不是你选错了路。

### 分支 A：Cloudflare —— 选 Workers 形态还是 Pages 形态

#### A1. WR 命令行部署 →【CF Workers 形态，首选】

> 适用：需要 TCP 回源 / R2 直连，或就想用命令行一把梭。**这是 Workers 形态**，部署后系统设置应显示 `运行平台: workers`、`TCP Socket: 可用`。

Worker 项目已在第 1 步建好。本机执行：

```bash
npx wrangler login   # 浏览器点 Allow，OAuth 授权
npx wrangler whoami  # 确认账号
npm run deploy:cf    # build + 生成临时 toml（保留远程绑定/变量）+ 部署
```

> `npm run deploy:cf` = `npm run build && node scripts/gen-deploy-config.mjs && wrangler deploy -c wrangler.deploy.toml && rm -f wrangler.deploy.toml`。
> 它会**按 binding 名拉取你在 Dashboard 已绑定的 KV/R2/D1 真实配置并保留**（资源名/id 是你自定义的，原样保留，不被清空）。`ADMIN_PATH` 刻意**不传**——部署后用内置默认 `__panel` 兜底，再于管理面改成随机串存 KV（最高优先级生效）。根 `wrangler.toml` 始终保持干净、不暴露资源 ID。
> 若你坚持用裸命令 `npx wrangler deploy`（不用临时 toml），务必注意：本地 toml 未声明 KV/R2/D1 时 wrangler 会**清空**远程已绑定的存储——《这就是 2026-08-11 部署事故的根因之一》，强烈建议用 `deploy:cf`。

**预期结果**：

```
✓ 构建完成
✓ 按 binding 名提取到远程绑定: CDN_KV → xxxx, CDN_R2 → 你的桶名, CDN_DB → 你的库id
✓ ADMIN_PATH 不注入（部署后用管理面修改并存 KV，优先级最高）
Uploaded edge-cdn (x.xx sec)
Published edge-cdn (x.xx sec)
  https://edge-cdn.<你的子域>.workers.dev
```

> 流水线 / CI 不用 `wrangler login`（服务器无人点浏览器），改用 `CLOUDFLARE_API_TOKEN`，见分支 A4a；流水线已内置同样的「生成临时 toml」步骤。
> 报错 `No such compatibility flag`：确认 `compatibility_flags` 只有 `["nodejs_compat"]`（不要加 `sockets`）。
> 报错 `unknown field cache`：说明 `compatibility_date` 过旧，本仓库已升到 `2026-08-11`，保持同步即可。
> 后续更新代码只需 `npm run deploy:cf`，不影响已绑定的存储、域名、Secrets。

#### A2. 粘贴代码 →【CF Workers 形态，无静态资产】

> 适用：不想装命令行。**仍是 Workers 形态**，支持 TCP 回源；只是不上传 `dist/public/`，管理面走内联兜底。

1. 本地 `npm run build` 生成 `_worker.js`，全选复制其内容。
2. Dashboard → **Workers & Pages** → 打开第 1 步建的 Worker → **Edit code**，删默认内容、粘贴 `_worker.js` → **Deploy**。
3. 第 3–5 步的 KV/变量/缓存已在本篇前面完成。

> 粘贴方式不上传 `dist/public/`，管理面自动回退内置内联资源，功能一致，仅每次访问管理面多一次函数调用（频率低，几乎无感）。**仍是 Workers，支持 TCP 回源**。

#### A3. CF Pages →【CF Pages 形态，不支持 TCP 回源】

> 适用：想 Git 推送自动构建、最省心，**纯域名源站**。⚠️ 这是 **Pages 形态**，先天**无 `cloudflare:sockets`**，管理面系统设置会显示 `运行平台: pages`、`TCP Socket: 不可用（降级 fetch）`——**属正常，不是故障**。裸 IP / 自定义 Host / 非标端口源站场景请勿选此形态，改用 A1/A2/A4a（Workers 形态）。

项目已在第 1 步建好（Connect to Git 那一步）。

1. Git 推送代码（含已构建产物）。
2. Dashboard → 打开第 1 步建的 Pages 项目 → **Settings → Build & deployments** 确认：
   - 构建命令：`npm run build`
   - **输出目录：`.`（句点，不是 `dist/public`）** —— 否则动态请求全 404。
3. 在 Pages 的 **Settings → Functions / Environment variables** 完成第 3–4 步的绑定与变量。
4. **Deployments → Retry deployment** 使配置生效。

> ⚠️ CF Pages **不支持 `cloudflare:sockets`**，即无 TCP 回源能力，裸 IP / 自定义 Host / 非标端口源站场景不适用；有静态托管但走 Pages Functions。

#### A4. 流水线（CI/CD，GitHub 或 CNB）→ 分 Workers / Pages 两个按钮

源码同时托管在 GitHub 与 CNB，各有一套**手动**流水线（零自动触发，必须人工点击发起，杜绝生产错乱）。流水线里 CF 相关有**两个独立按钮**，分别对应上面的 Workers 形态与 Pages 形态：

> **两个 CI 系统的校验口径一致**：GitHub（`.github/workflows/ci.yml` 与各 `deploy-*.yml`）与 CNB（`.cnb.yml`）的「构建校验」按钮都会在**构建前跑 `npm run check`**（静态一致性 + 前端入口可解析），并在**构建后跑 `npm run test:e2e`**（端到端 + 前端可执行性，验证 `window.API` 挂载）。这样无论用哪个平台触发，都能在部署前拦住「构建成功但登录进不去后台」这类运行时问题。若某个 CI 报了 check/e2e 失败，先看 [08 FAQ「build 成功但登录进不去后台」](./08-faq.md) 定位修复，再重新触发。


**先准备部署凭据**（运行时密钥 `ADMIN_PASSWORD`/`JWT_SECRET` **不进流水线**，它们已在第 4 步设好；`ADMIN_PATH` 不是变量、由管理面存 KV，无需在此准备）：

| 字段 | 用途 | 怎么来 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CF Workers / Pages 部署 | CF 控制台生成，需 `Workers Scripts:Edit` 或 `Cloudflare Pages:Edit` 权限 |
| `CLOUDFLARE_ACCOUNT_ID` | CF 账户 ID | 右侧账号信息里复制 |
| `EO_SECRET` | EO Pages 部署 | EO 控制台生成的密钥 |
| `CF_PAGES_PROJECT` | 可选，仅「部署 CF Pages」按钮用，CF Pages 项目名 | 默认 `cdn-edge-gateway` |
| `EO_PAGES_PROJECT` | 可选，EO Pages 项目名 | 默认 `cdn-edge-gateway` |

**GitHub 怎么设**（仓库 → **Settings → Secrets and variables → Actions**）：

- **Secrets** 里加：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`EO_SECRET`。
- **Variables** 里加：`CF_PAGES_PROJECT`、`EO_PAGES_PROJECT`（可选）。
- 触发：Actions → 选中目标工作流 → **Run workflow**（部署类需 `confirm` 填 `deploy` 才放行；Workers 另有 `dry_run`，EO 可选 `preview`/`production`）。

**CNB 怎么设**（CNB 不支持仓库内直填 Secret，凭据放**独立密钥仓库**）：

- 建一个密钥仓库（如 `cdn-edge-gateway.yml`），只放上面那 5 个**部署凭据**，由 `.cnb.yml` 的 `imports` 导入。
- 字段与 GitHub 完全一致（一份密钥文件两边共用）。
- 在 `.cnb/web_trigger.yml` 声明后，仓库页会渲染按钮：构建校验 / **部署 CF Workers** / **部署 CF Pages** / 部署 EO Pages，点击触发。

##### A4a. 部署 CF Workers（按钮）→【Workers 形态，有 TCP 回源】

> 点「🚀 部署 CF Workers」按钮 = 与 A1 等价的线上版：`node scripts/gen-deploy-config.mjs` 生成临时 toml → `wrangler deploy`。**有 TCP 回源能力**。

**📌 该按钮已内置「不覆盖远程绑定」保护**：在 `npx wrangler deploy` 之前会先跑 `scripts/gen-deploy-config.mjs`，按 binding 名拉取你在 Dashboard 已绑定的 KV/R2/D1 真实配置并写进一次性 `wrangler.deploy.toml`，部署完即删。所以**点此按钮前，请务必先在 Dashboard 把 KV/R2/D1 绑好（binding 名须为 `CDN_KV`/`CDN_R2`/`CDN_DB`）**，否则部署会清空这些绑定（脚本会打印 `⚠ 未探测到 ... 绑定` 提醒你）。

> ⚠️ **首次部署（全新 Worker）必须先在 Dashboard 手动建壳并绑好 CDN_KV/CDN_R2/CDN_DB，再点按钮**。探测脚本采用严格模式：若 Worker 从未部署过，`/settings` 接口返回 404 也视作探测失败，流水线会**直接中止**（`process.exit(1)`），不会用空绑定覆盖。这是刻意取舍——宁可卡住首次部署，也不冒清空线上绑定风险。故正确顺序：**先在 Dashboard 创建 Worker → 绑好三个绑定（binding 名固定）→ 再触发本按钮**，而非反过来依赖按钮自动建壳。

> ⚠️ 若系统设置显示「运行平台 pages」、TCP Socket 不可用：这是旧代码的平台探测误判（把 Workers 的 Static Assets 绑定 `ASSETS` 错当成 Pages），**不是你点错了按钮**。修复已合入最新代码，只需「把仓库更新到最新 → 重新点一次本按钮」即可恢复（`caps.js` 改用 `CF_PAGES` 等 Pages 专属变量区分，不再凭 `ASSETS` 绑定误判）。详见 [08 FAQ](./08-faq.md)。

##### A4b. 部署 CF Pages（按钮）→【Pages 形态，无 TCP 回源】

> 点「🚀 部署 CF Pages」按钮 = 等价于 A3 的线上版：`wrangler pages deploy .`。**无 TCP 回源能力**（Pages 形态固有，部署后系统设置显示 `运行平台: pages`、`TCP Socket 不可用` 属正常）。适合纯域名源站、图 Git 自动构建。

- 部署前需在第 1 步建好 **Pages 项目**并在第 3–4 步完成 KV/变量绑定（Pages 不读 `wrangler.toml` 的存储绑定段，绑定在 Dashboard 设）。
- 按钮输入框 `cf_pages_project` 留空则用密钥仓库的 `CF_PAGES_PROJECT`，再无则用 `cdn-edge-gateway`；`cf_pages_branch` 填 `main` 即 production，填其他值创建预览部署。

> **CF Pages / EO Pages 路线不受影响**：`wrangler pages deploy .` 与 `edgeone makers deploy .` 不读取 `wrangler.toml` 的存储绑定段，其 KV/R2/D1 绑定在各自 Dashboard 设，不会被 toml 覆盖；这两路的变量也在 Dashboard 设，不存在 `ADMIN_PATH` 被 toml 覆盖的问题。只有 **CF Workers 路线（A1/A2/A4a）** 需要临时 toml 机制。

##### 流水线通用说明

> EO 流水线路径：CNB 用 `tencentcom/deploy-eopages` 镜像，GitHub 用 `npx edgeone makers deploy`，部署目录为仓库根 `.`，均只手动触发、支持 preview/production。若已在 EO 控制台连 Git 自动构建，请关掉自动构建以守住「禁止自动部署」约束。
> 若想本地复现与流水线完全一致的行为：`npm run deploy:cf`（见分支 A1，对应 A4a 的 Workers 按钮）。
>
> **⚠️ 若系统设置显示「运行平台 pages」、TCP Socket 不可用**：这是旧代码的平台探测误判（把 Workers 的 Static Assets 绑定 `ASSETS` 错当成 Pages），**不是你点错了按钮**。修复已合入最新代码，只需「把仓库更新到最新 → 重新点一次『部署 CF Workers』按钮」即可恢复（`caps.js` 改用 `CF_PAGES` 等 Pages 专属变量区分，不再凭 `ASSETS` 绑定误判）。详见 [08 FAQ](./08-faq.md)。

### 分支 B：EdgeOne —— Makers 部署

项目已在第 1 步建好（Makers 新建并连 Git），第 3–5 步的 KV/变量/缓存也已设好，这里只做 EO 侧收尾：

1. 项目设置 → **环境变量**已含：`ADMIN_PASSWORD`(密钥) / `JWT_SECRET`(密钥) / `CLOUD_PLATFORM=eo`（见第 4 步；`ADMIN_PATH` 不是变量，由管理面存 KV，不在此设）。
2. **存储 → KV 存储** 创建命名空间 → **存储绑定**，变量名 `CDN_KV`（见第 3 步）。
3. 推代码：用 **EO 流水线**（见分支 A4 的 EO 部分）或 EO 控制台连 Git 手动触发构建部署。部署目录为仓库根 `.`。

> EO 已知差异：无 D1（统计回落 KV）；边缘 `fetch` **天然可访问外部公网 URL 并支持自定义 Host 头**（与 CF 一样），无需特殊配置；仅「裸 IP + 自定义 SNI」这类 CF `cloudflare:sockets` 可编程 TCP 能力 EO 不支持，此时回源 Host 自定义需下沉到平台层（见 [07 回源 Host](./07-eo-origin-host.md)）；配置生效约 1–2 分钟。

---

## 第 7 步：绑定自定义域名

在平台控制台把加速域名（如 `cdn.example.com`）绑到服务：

- **CF**：Workers/Pages → **Custom Domains** 添加，CF 自动加 DNS 并开代理。
- **EO**：控制台绑定加速域名。

---

## 第 8 步：验证部署成功

部署后访问：

```
https://<你的域名或 *.workers.dev>/__health
```

**预期结果**：`{"ok":true,"platform":"cloudflare|edgeone","hasKV":true,...}`。重点确认 `hasKV:true`（否则 KV 变量名没写成 `CDN_KV`）。

再访问管理面 `https://<域名>/__panel`（默认前缀，部署后可在管理面改成你自己的随机串并存 KV），用 `ADMIN_PASSWORD` 登录成功即完成。

**平台能力核对**：进管理面 → 系统设置，确认：
- CF Workers 部署应显示 `运行平台: workers`、`TCP Socket: 可用`。
- CF Pages / EO Pages 部署显示 `运行平台: pages / edgeone`、`TCP Socket: 不可用（降级 fetch）` 属正常（这两类平台本就无 `cloudflare:sockets`）。

> **⚠️ 排查：CF Workers 部署却显示 `运行平台: pages` / `TCP Socket 不可用`**
> 这是旧代码把 Workers 的 Static Assets 绑定 `ASSETS` 误判成 Pages 导致，不是部署方式错误。
> 修复已合入最新代码，按下面两步恢复：
> 1. **更新你仓库里的代码到最新**（含 `src/platform/caps.js` 修复）：
>    ```bash
>    git pull origin main   # 或去 GitHub/CNB 仓库点 Sync / 拉取最新提交
>    ```
>    （如果你是 fork 后改过，先 `git fetch` 再 merge / rebase 上游最新。）
> 2. **重新部署一次**：本地用 `npm run deploy:cf`；用流水线的直接再点一次「🚀 部署 CF Workers」按钮（CI 会自动拉最新代码构建）。
> 部署后系统设置应变为 `运行平台: workers`、`TCP Socket: 可用`。
> 详见 [08 FAQ · 为什么点 CF Workers 却显示 pages](./08-faq.md)。

---

## 部署完成检查清单

- [ ] 第 1 步：已在 CF（建 **Worker** = Workers 形态 / 建 **Pages 项目** = Pages 形态）或 EO 新建项目（二选一，没两边都做，且 CF 两种形态没混用）
- [ ] 第 3 步：KV 已绑定，变量名是 `CDN_KV`
- [ ] 第 4 步：`ADMIN_PASSWORD` / `JWT_SECRET` 用 Secret 类型；`ADMIN_PATH` 不用变量页面设，部署后用默认 `__panel` 登录管理面、改成随机串存 KV；CF Workers 形态用 `npm run deploy:cf` / 流水线「部署 CF Workers」按钮，CF Pages 形态用 A3/流水线「部署 CF Pages」按钮
- [ ] 第 5 步：缓存开关已开启（CF Workers 形态已在 `wrangler.toml` 内置 `[cache] enabled = true`，部署即生效；CF Pages / EO 需在面板开）
- [ ] 第 6 步：代码已按所选方式推上去
- [ ] 第 7 步：自定义域名已绑定
- [ ] 第 8 步：`/__health` 返回 `ok: true` 且 `hasKV: true`；管理面能登录
- [ ] 连续两次请求 `x-cache-status` 从 `MISS` 变 `HIT`
- [ ] EO 部署确认 `CLOUD_PLATFORM=eo`（CF 侧可省略）

---

## 下一步

- 学会在管理面配规则 → **[06 管理面使用教程](./06-user-guide.md)**
- 想让缓存更省额度 → **[07 缓存策略](./07-cache-strategy.md)**
- 遇到问题 → **[08 FAQ](./08-faq.md)**
