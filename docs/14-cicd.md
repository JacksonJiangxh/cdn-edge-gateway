# 14 · CI/CD 自动化部署

> 进阶文档。仅在你需要用流水线发版时阅读；手动部署请看 [05](./05-deploy-cli.md) / [06](./06-deploy-dashboard.md)。


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
| `ADMIN_PASSWORD` | 管理面初始密码 | 密钥仓库 `imports` | Secrets 同名 |
| `JWT_SECRET` | 登录态签名（`openssl rand -hex 32`） | 密钥仓库 `imports` | Secrets 同名 |
| `ADMIN_PATH` | 运行时（第一层防护，构建期不读） | 密钥仓库 `imports` | Variables 同名（**可选**，缺省回退 `__panel`） |

1. 新建仓库时**类型选「密钥仓库」**（密钥仓库禁止 clone 到本地，只能网页编辑，这正是它安全的原因）。本项目地址已设为 <https://cnb.cool/xzydm/xzsecret/-/blob/main/cdn-edge-gateway.yml>，其中放 `cdn-edge-gateway.yml`：

   ```yaml
   CLOUDFLARE_API_TOKEN: your_token_here
   CLOUDFLARE_ACCOUNT_ID: your_account_id
   CF_PAGES_PROJECT: cdn-edge-gateway
   EO_SECRET: your_edgeone_api_token
   EO_PAGES_PROJECT: cdn-edge-gateway
   # ↓ 以下三项是生产必填，缺失会让无法登录或第一层防护退化为默认 __panel
   ADMIN_PASSWORD: your_strong_password
   JWT_SECRET: your_64_hex_secret
   ADMIN_PATH: p-8f3k9x2q   # 随机串，仅运行时生效，改它无需重新构建
   ```

> **为什么 CNB/GitHub 密钥必须补这三项？**
> `ADMIN_PASSWORD` / `JWT_SECRET` 缺失则部署后无法登录；`ADMIN_PATH` 缺失则后台入口退回默认 `__panel`（第一层防护形同虚设）。注意 `ADMIN_PATH` **构建期不读**（见 [04 §6](./04-configuration.md)），所以只需在运行时注入（密钥仓库 / Secrets / Dashboard 环境变量），流水线 build 步骤无需读取它。

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
