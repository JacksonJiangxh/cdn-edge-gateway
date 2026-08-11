# 03 · 部署指南（小白线性流程）

> 上一篇：[02 环境准备](./02-prerequisites.md) ｜ 下一篇：[04 配置详解](./04-configuration.md)
>
> 本篇按**严格先后顺序**带你把服务跑起来。每一节是一个「步骤」，请从上往下做，不要跳。
> 当某一步出现「你该选哪条路」时，分支就在那一步里就地展开，照着对应分支做即可。

---

## 0. 你只需要先想清楚一件事：选哪个平台

本服务有两套**互相独立**的平台，二选一，**不要两边都部署**（会状态漂移、难排查）：

- **A. Cloudflare（CF）**：海外节点、生态成熟。下面有 4 种推代码方式（WR / 粘贴 / Pages / 流水线）。
- **B. EdgeOne（EO）**：国内节点，适合业务在国内。只有 1 套 Makers 部署逻辑。

> 同一个服务只选一种方式部署。下面的步骤 **第 1 步～第 4 步是通用的**（建项目、绑 KV、设变量、开缓存），**第 5 步开始才分叉**到「怎么把代码推上去」。

---

## 第 1 步：新建项目 / 服务（必须最先做）

> **铁律：先有项目，才能绑 KV、设变量、绑域名。** 项目没建，后面所有设置都「无处安放」。所以这一步排在最前，CF 和 EO 都要先建。

### 分支 A：Cloudflare

你要先建好一个「承载容器」。按你后面打算怎么推代码，建法略有不同：

- **打算用 WR（命令行）或粘贴代码** → 建 **Worker**：
  Dashboard → **Workers & Pages** → **Create** → **Create Worker** → 起名（如 `edge-cdn`）。
  记下这个名字，它就是你的服务名。
- **打算用 CF Pages** → 建 **Pages 项目**：
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

## 第 3 步：创建并绑定存储（KV 必做）

配置全存在 KV，**不绑服务起不来**。流程是「**先创建命名空间 → 再绑定到项目**」，两步都要做。变量名**必须**为下表（拼错服务就读不到配置）：

| 绑定类型 | 变量名 | 何时需要 |
|---|---|---|
| KV namespace | `CDN_KV` | **必做** |
| R2 bucket | `CDN_R2` | 源站 `engine=r2` 时 |
| D1 database | `CDN_DB` | `statsDriver=d1` 时（EO 无 D1，统计回落 KV） |

**① 先创建命名空间（KV 必做）**

- **CF**：Dashboard → **Workers & Pages** → 左侧 **KV** → **Create a namespace**，起名（如 `cdn-kv`）。创建后记住它的 **Namespace ID**（后面绑定要用）。
- **EO**：控制台 → **存储 → KV 存储** → **创建命名空间**，起名（如 `cdn-kv`）。

> 这只是"建一个空仓库"，还没挂到你的服务上。R2 / D1 同理先创建（按需）。

**② 再绑定到你的项目**（变量名必须写 `CDN_KV`）

- **CF**：Dashboard → 你的 Worker/Pages → **Settings → Variables / Bindings** → **Add** → 选 KV namespace，Variable name 填 `CDN_KV`，绑定到刚才创建的命名空间。
- **EO**：项目设置 → **存储绑定** → 添加 KV 绑定，变量名 `CDN_KV`，关联到刚才创建的命名空间。

> 桶名（如 `cdn-assets`）≠ 绑定变量名（`CDN_R2`）。源站配置里填的是**变量名**。

---

## 第 4 步：设置运行时变量与密钥

`ADMIN_PASSWORD` / `JWT_SECRET` / `ADMIN_PATH` 是**运行时变量**，构建期不读，改了无需重新构建。

| 变量 | 类型 | 值怎么来 | 说明 |
|---|---|---|---|
| `ADMIN_PASSWORD` | **Secret / 密钥** | 你的强密码 | 管理面登录密码 |
| `JWT_SECRET` | **Secret / 密钥** | 终端跑 `openssl rand -hex 32` 的输出 | 登录态签名，勿用简单串 |
| `ADMIN_PATH` | Secret / 变量 | 随机串，如 `p-8f3k9x2q` | **第一层防护，必须改，不能留默认 `__panel`** |

- **CF**：Worker/Pages → **Settings → Environment Variables**。密码类两项选 **Secret（加密）** 类型；`ADMIN_PATH` 可 Secret 或普通变量。
- **EO**：项目设置 → **环境变量**：`ADMIN_PASSWORD`(密钥) / `JWT_SECRET`(密钥) / `ADMIN_PATH`(变量) / 额外加 **`CLOUD_PLATFORM=edgeone`**（必填，驱动平台识别；CF 侧代码自动探测可省略）。

> ⚠️ **`ADMIN_PATH` 不要写进仓库的 `wrangler.toml`**（会暴露入口）。`wrangler.toml` 只留公开兜底默认值 `__panel`，上线用 `npx wrangler secret put ADMIN_PATH` 或控制台设。运行优先级：**Secret > Dashboard 环境变量 > `wrangler.toml` 兜底默认值**。
>
> `CLOUD_PLATFORM` 是「平台识别」变量，**不是认证凭据**，也不进流水线。

---

## 第 5 步：开启缓存开关（省额度）

各平台默认不缓存函数响应，不开则每请求都进函数、消耗额度。

- **CF Workers/Pages**：Settings → Cache / Functions，把对应 Cache 开关设为 **Enabled**。
- **EO**：控制台对应缓存开关设为 **Enabled**。配置生效约 1–2 分钟。

---

## 第 6 步：把代码推上去（这里是分叉点，选一条路）

前面 1–5 步已把「容器 + 配置」备好，现在只差「怎么把代码放进去」。按你的平台选：

### 分支 A：Cloudflare —— 再选 4 种推法之一

#### A1. WR（命令行部署，首选）

Worker 项目已在第 1 步建好。本机执行：

```bash
npx wrangler login   # 浏览器点 Allow，OAuth 授权
npx wrangler whoami  # 确认账号
npm run build && npx wrangler deploy
```

**预期结果**：

```
✓ 构建完成
Uploaded edge-cdn (x.xx sec)
Published edge-cdn (x.xx sec)
  https://edge-cdn.<你的子域>.workers.dev
```

> 流水线 / CI 不用 `wrangler login`（服务器无人点浏览器），改用 `CLOUDFLARE_API_TOKEN`，见分支 A4。
> 报错 `No such compatibility flag`：确认 `compatibility_flags` 只有 `["nodejs_compat"]`。
> 后续更新代码只需 `npm run build && npx wrangler deploy`，不影响已绑定的存储、域名、Secrets。

#### A2. 粘贴代码（不想装命令行，无静态资产）

1. 本地 `npm run build` 生成 `_worker.js`，全选复制其内容。
2. Dashboard → **Workers & Pages** → 打开第 1 步建的 Worker → **Edit code**，删默认内容、粘贴 `_worker.js` → **Deploy**。
3. 第 3–5 步的 KV/变量/缓存已在本篇前面完成。

> 粘贴方式不上传 `dist/public/`，管理面自动回退内置内联资源，功能一致，仅每次访问管理面多一次函数调用（频率低，几乎无感）。**仍是 Workers，支持 TCP 回源**。

#### A3. CF Pages（回退，不支持 TCP 回源）

项目已在第 1 步建好（Connect to Git 那一步）。

1. Git 推送代码（含已构建产物）。
2. Dashboard → 打开第 1 步建的 Pages 项目 → **Settings → Build & deployments** 确认：
   - 构建命令：`npm run build`
   - **输出目录：`.`（句点，不是 `dist/public`）** —— 否则动态请求全 404。
3. 在 Pages 的 **Settings → Functions / Environment variables** 完成第 3–4 步的绑定与变量。
4. **Deployments → Retry deployment** 使配置生效。

> ⚠️ CF Pages **不支持 `cloudflare:sockets`**，即无 TCP 回源能力，裸 IP / 自定义 Host / 非标端口源站场景不适用；有静态托管但走 Pages Functions。

#### A4. 流水线（CI/CD，GitHub 或 CNB）

源码同时托管在 GitHub 与 CNB，各有一套**手动**流水线（零自动触发，必须人工点击发起，杜绝生产错乱）。

**先准备 5 个部署凭据**（运行时变量 `ADMIN_PASSWORD`/`JWT_SECRET`/`ADMIN_PATH` **不进流水线**，它们已在第 4 步设好）：

| 字段 | 用途 | 怎么来 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | CF Workers / Pages 部署 | CF 控制台生成，需 `Workers Scripts:Edit` 或 `Cloudflare Pages:Edit` 权限 |
| `CLOUDFLARE_ACCOUNT_ID` | CF 账户 ID | 右侧账号信息里复制 |
| `EO_SECRET` | EO Pages 部署 | EO 控制台生成的密钥 |
| `CF_PAGES_PROJECT` | 可选，CF Pages 项目名 | 默认 `cdn-edge-gateway` |
| `EO_PAGES_PROJECT` | 可选，EO Pages 项目名 | 默认 `cdn-edge-gateway` |

**GitHub 怎么设**（仓库 → **Settings → Secrets and variables → Actions**）：

- **Secrets** 里加：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`EO_SECRET`。
- **Variables** 里加：`CF_PAGES_PROJECT`、`EO_PAGES_PROJECT`（可选）。
- 触发：Actions → 选中目标工作流 → **Run workflow**（部署类需 `confirm` 填 `deploy` 才放行；Workers 另有 `dry_run`，EO 可选 `preview`/`production`）。

**CNB 怎么设**（CNB 不支持仓库内直填 Secret，凭据放**独立密钥仓库**）：

- 建一个密钥仓库（如 `cdn-edge-gateway.yml`），只放上面那 5 个**部署凭据**，由 `.cnb.yml` 的 `imports` 导入。
- 字段与 GitHub 完全一致（一份密钥文件两边共用）。
- 在 `.cnb/web_trigger.yml` 声明后，仓库页会渲染按钮：构建校验 / 部署 CF Workers / 部署 CF Pages / 部署 EO Pages，点击触发。

> EO 流水线路径：CNB 用 `tencentcom/deploy-eopages` 镜像，GitHub 用 `npx edgeone makers deploy`，部署目录为仓库根 `.`，均只手动触发、支持 preview/production。若已在 EO 控制台连 Git 自动构建，请关掉自动构建以守住「禁止自动部署」约束。

### 分支 B：EdgeOne —— Makers 部署

项目已在第 1 步建好（Makers 新建并连 Git），第 3–5 步的 KV/变量/缓存也已设好，这里只做 EO 侧收尾：

1. 项目设置 → **环境变量**已含：`ADMIN_PASSWORD`(密钥) / `JWT_SECRET`(密钥) / `ADMIN_PATH`(变量) / `CLOUD_PLATFORM=edgeone`（见第 4 步）。
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

再访问管理面 `https://<域名>/<你设的 ADMIN_PATH>`，用 `ADMIN_PASSWORD` 登录成功即完成。

---

## 部署完成检查清单

- [ ] 第 1 步：已在 CF 或 EO 新建项目（二选一，没两边都做）
- [ ] 第 3 步：KV 已绑定，变量名是 `CDN_KV`
- [ ] 第 4 步：`ADMIN_PASSWORD` / `JWT_SECRET` 用 Secret 类型；`ADMIN_PATH` 已改随机串（非默认 `__panel`）且未提交进仓库 toml
- [ ] 第 5 步：缓存开关已开启
- [ ] 第 6 步：代码已按所选方式推上去
- [ ] 第 7 步：自定义域名已绑定
- [ ] 第 8 步：`/__health` 返回 `ok: true` 且 `hasKV: true`；管理面能登录
- [ ] 连续两次请求 `x-cache-status` 从 `MISS` 变 `HIT`
- [ ] EO 部署确认 `CLOUD_PLATFORM=edgeone`（CF 侧可省略）

---

## 下一步

- 学会在管理面配规则 → **[06 管理面使用教程](./06-user-guide.md)**
- 想让缓存更省额度 → **[07 缓存策略](./07-cache-strategy.md)**
- 遇到问题 → **[08 FAQ](./08-faq.md)**
