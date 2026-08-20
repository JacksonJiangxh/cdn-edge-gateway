# 14 · 部署到阿里云 ESA

> [!NOTE]
> **本文面向**：开发者（把网关跑上阿里云 ESA）。
> 普通用户的通用部署见 [用户篇 · 部署指南](/user/03-deploy.md)。

---

## 先读：ESA 与 CF/EO 的三大不同

> [!WARNING]
> 下面三点是 ESA 部署最容易翻车的地方，**必须先在 `esa.jsonc` 配好构建入口、并在 ESA 控制台「环境变量」里设好运行时变量**。

| 维度 | ESA 真实情况（代码 `caps.js`） | 注意 |
|---|---|---|
| 原生 KV | **无**（EdgeKV 按计费策略统一禁用） | 配置走 `REDIS_URL` 或**静态烘焙**，不能依赖运行时 KV |
| 子请求上限 | **fetch 软限制 8（只约束回源 fetch）**；**Cache API 独立走平台默认 32**，不归软限制管。fetch 与 Cache 是两个独立接口、各自独立限制：官方 fetchAPI「4 个」（高配可达 8）、Cache API「共享 32 个」。`MAX_SUBREQUESTS` 仅覆盖 fetch 软限制（1–32），不影响 Cache 的 32 | 已自动优化：配置多键读取改为**批量读**（Webdis 走单次 `MGET`，CF/EO 走并行 `GET`），`store.readJsonMany` 把「读 N 键 = N 子请求」压成「1 子请求」，彻底规避 fetch 软限制；管理面加载 4 个集合的快照 MGET≈4 子请求，仍在 8 内安全（见 §4） |
| 内存预算 | 128MB（`esa.jsonc` 设） | 缓存 TTL 别太大 |

---

## §1 平台能力对照（权威）

> [!NOTE]
> ⚠️ 历史版本本节写「来源 `caps.js`」——这是把代码层假设当事实，已纠正。本章节能力值
> **以阿里云官方文档为准**（`esa文档/` 下 RuntimeAPI/Cache/Pages 等手册），`caps.js` 仅是
> 这些官方事实的代码化表达，不再作为权威来源本身。

来源：阿里云官方文档（`esa文档/`），ESA 关键 caps：

| 能力 | ESA 值 | 说明 |
|---|---|---|
| `hasCacheApi` | `true` | 支持 Cache API（全局单例，`put` key 须 http） |
| `cacheIsNodeLocal` | `false` | 缓存是**全局**的（非节点本地） |
| `cacheSingleInstance` | `true` | Cache 全局单实例，无 `caches.default/open` |
| `cacheKeyHttpOnly` | `true` | `put` 缓存键必须是 http URL（自动降级） |
| `hasKV` | `false` | 无原生 KV（见 §3） |
| `hasStaticHosting` | `true` | ✅ 官方《PAGES构建和路由指南》证实：assets.directory 静态托管，文件按目录结构直接映射对外（`/dist/file.html`→`/file`）；默认模式未命中静态资源→执行 ER 函数。故管理面前端走 `/assets/*` 外部引用 |
| `hasSocket` / `hasRawIpFetch` | `false` | 源站必须填**可解析域名**（不能 IP 直连，见 fetchAPI.md） |
| `maxSubRequests` | **8** | 每请求 **fetch 专用**软限制（只约束回源 fetch 子请求）。官方 fetchAPI「4 个」（高配可达 8）；代码（`caps.js`）把软上限设为 8，并允许 `MAX_SUBREQUESTS` 在 1–32 内覆盖。**Cache API 不受此值约束** |
| `cacheSubreqLimit` | **32** | Cache API 接口自身的平台默认上限（「共享 32 个」），**独立于 fetch 软限制**，不经 `MAX_SUBREQUESTS` 覆盖；与 fetch 互不占用 |

> [!IMPORTANT]
> 数据面全程 ≤2 个 fetch（1 回源 + 至多 1 静态同站），远低于 **8** 软限制，安全；管理面 4 集合快照 MGET≈4 子请求，仍在 8 内安全。

---

## §2 部署前置

1. 阿里云账号 + ESA 服务开通。
2. 本地：`npm run build` 产出 `_worker.js` + `dist/public/`。
3. 环境变量：`CLOUD_PLATFORM=esa` 必须设（构建/运行都需）。

```jsonc
// esa.jsonc（节选）
{
  "entry": "./esa/index.js",
  "assets": { "directory": "./dist/public" },
  "buildCommand": "npm run build"
  // 无顶层 env（变量在 ESA 控制台设）；不配 notFoundStrategy（否则 /__panel 被 index 兜底吞掉）
}
```

> [!WARNING]
> **不要配 `notFoundStrategy`** 把未命中路由兜底到 `index.html`——会把 `/__panel` 这类管理面请求吞掉，进不了函数。

---

## §3 KV：REDIS_URL（可写）或 静态烘焙（只读）

ESA 无原生 KV。**按是否配置 `REDIS_URL` 自动选择**，无需手动切开关：

| 控制台设置 | 结果 |
|---|---|
| 配了 `REDIS_URL`，未设 `STATIC_CONFIG` | **可写模式**，走 Webdis（与 CF / EO 一致） |
| 未配 `REDIS_URL`，未设 `STATIC_CONFIG` | **静态烘焙只读**（兜底） |
| 显式 `STATIC_CONFIG=1` | 强制只读烘焙（即使配了 `REDIS_URL`） |
| 显式 `STATIC_CONFIG=0` | 强制可写（无 `REDIS_URL` 时配置无法保存） |

### 方式 A：REDIS_URL（可写，配置常变时用）

ESA 控制台设 `REDIS_URL=https://你的-webdis地址`（不带尾斜杠），`esa/index.js` 检测到它就
**自动退出烘焙**、进入可写模式，管理面可正常保存配置。Webdis 读取已自动改为 `MGET` 批量读——
快照加载（version/global/rules/sites/pools 共 5 键）与旧散乱键迁移合并为**单次子请求**，
彻底规避 ESA「每请求 8 子请求」上限（软限制，原逐键 GET 在 ESA 上会撞线降级为 null）。

验证：管理面「系统信息 → KV 存储后端 → 测试连通性（平台 KV + Webdis）」，
Webdis 一侧应为 ✅ 且标记「当前生效」；或直接调 `/__panel/api/kv/ping`，顶层 `backend` 为 `"redis"`。

详见 [Redis / Webdis 外置 KV](/dev/13-redis-kv.md)。

### 方式 B：静态烘焙（配置基本不动时用，最稳）

```bash
npm run build -- --bake config.json    # 把配置烤进 src/config/baked.generated.js
```

未配 `REDIS_URL` 时 ESA 自动按 `STATIC_CONFIG=1` 走烘焙分支，运行时**完全不依赖 KV/Redis**，
但管理面**只读**（配置变更 = 重新导出 + 重新构建部署）。
适合配置稳定、追求零运行时依赖的生产场景。

---

## §4 部署方式（唯一推荐：控制台连接仓库自动部署）

本项目**不提供**本地 `npm run deploy:esa` 脚本，也不在 CNB/GitHub 流水线里放「一键发布 ESA」按钮——
因为 ESA 部署依赖**仓库构建**：控制台连接 CNB/GitHub 仓库后，会**自动读取 `esa.jsonc` 完成构建与部署**，
本地/CI 的 `esa-cli commit/deploy` 发布入口已移除。生产部署只需这一种路径：

1. 阿里云 ESA 控制台 → 「边缘计算和 AI → 函数和 Pages」→ 新建 Pages → **「导入 GitHub 仓库 / 连接 CNB 仓库」**。
2. 选本仓库，构建信息按 [§5 可视化控制台构建设置](#5-可视化控制台构建设置) 填（或让 `esa.jsonc` 自动接管）。
3. 在控制台「环境变量」设运行时变量：`CLOUD_PLATFORM=esa`、`REDIS_URL`（不设则自动走静态烘焙只读兜底），详见 [§3](#3-kvredis_url可写或-静态烘焙只读)。
4. 点「开始部署」，ESA 自动读 `esa.jsonc` 构建并上线；绑定自定义域即完成。

> [!NOTE]
> 管理面站点数多（接近 8 子请求上限）时，列表接口会分页（`MAX_TOTAL_SITES_SCAN`），单请求不会突破 8 上限。

### 本地真机调试（可选，非发布）

仅本地验证用，不发布：用 ESA 官方 CLI 起本地调试（`npm i -g esa-cli` 后 `esa-cli dev`），
它只读本地代码、不连线上数据。注意本地 dev **不注入运行时环境变量**，需经 `ESA_BUILD_*` 前缀把变量烤进产物
（见 [§5 末尾的 ESA_BUILD_* 线上/本地区别](#esa_build_-线上与本地-dev-的区别)）。

---

## §5 可视化控制台构建设置

ESA 控制台「构建信息」面板（或 `esa.jsonc` 同名字段）需按下表填写。字段值严格取自 `esa.jsonc` 与 `package.json`，
`esa.jsonc` 优先级高于控制台界面。

| 控制台字段 | 填写值 | 取自 | 说明 |
|---|---|---|---|
| 安装命令 | `npm ci` | `esa.jsonc` `installCommand` | 按 `package-lock.json` 精确安装 |
| 构建命令 | `npm run build` | `esa.jsonc` `buildCommand` | 产出 `_worker.js` + `dist/public/` |
| 根目录 | `/` | 仓库根 | 非 monorepo，无需子路径 |
| 静态资源目录 | `dist/public` | `esa.jsonc` `assets.directory` | 管理面前端静态资源 |
| 函数文件路径 | `esa/index.js` | `esa.jsonc` `entry` | 薄壳，转发到构建产物 `_worker.js` |
| Node.js 版本 | `24` | 控制台选 24（本项目 `esa.jsonc` 未固定 `node-version`，构建用仓库缓存镜像 Node 24） | 修改后需重新触发构建 |
| 环境变量 | 见 [§3](#3-kvredis_url可写或-静态烘焙只读) / [09 变量清单](/user/09-env-vars.md) | 控制台「环境变量」面板 | 运行期注入，如 `CLOUD_PLATFORM=esa`、`REDIS_URL` 等 |

> [!WARNING]
> **不要**在控制台配 `notFoundStrategy`（如 `singlePageApplication`）：ESA 文档明确「同时配置函数脚本与
> `notFoundStrategy` 时，导航请求不会触发函数脚本」。本项目管理面 `/__panel` 是导航请求，配了会被 `index.html`
> 兜底吃掉、永远进不了函数。故 `esa.jsonc` 刻意不写 `notFoundStrategy`。

### ESA_BUILD_* 线上与本地 dev 的区别

这是 ESA 部署**最容易配错**的一点，务必分清：

- **线上运行时（控制台「环境变量」注入）**：薄壳 `resolveEnv` 直接读 `process.env.REDIS_URL` 等运行时变量，
  控制台「环境变量」设了什么，运行时就能拿到什么。**无需任何 `ESA_BUILD_*` 前缀**——前缀只在本地 dev 用。
- **本地 dev 真机调试（`esa-cli dev`）**：本地调试环境**不注入运行时 env**，故 `build.mjs` 在打包前扫描
  `ESA_BUILD_*` 前缀的环境变量、去前缀后把真实变量名（`JWT_SECRET`/`ADMIN_PASSWORD`/`REDIS_URL` 等）
  烤进产物常量 `globalThis.__BUILD_ENV__`；运行时 `resolveEnv` 在运行时 env 缺失时回退读 `__BUILD_ENV__`。
- **结论**：线上只需在控制台「环境变量」面板设**真实变量名**（如 `REDIS_URL`），**不要**加 `ESA_BUILD_` 前缀；
  前缀仅用于本地 dev 真机测试。误把线上变量也加 `ESA_BUILD_` 前缀会导致运行时读不到。

---

## §6 发布后验证

打开管理面 `https://你的网关域名/{adminPath}` 确认可登录即代表部署成功。平台能力（如 `kvBackend`、`cacheSubreqLimit`）可在管理面「平台能力」面板查看，无需独立公开健康检查接口。

确认 `platform:"esa"`、`hasKV:false`（说明走 Webdis/烘焙）。

---

## §7 避坑清单

| 现象 | 原因 | 解法 |
|---|---|---|
| 部署报错平台探测失败 | 没设 `CLOUD_PLATFORM=esa` | 控制台/构建设 `esa` |
| 配置读不到 | 既没 REDIS_URL 也没烘焙产物 | 配 REDIS_URL，或用 `--bake` 重新构建（§3） |
| 管理面无法保存配置 | 处于静态烘焙只读模式 | 设 REDIS_URL（自动退出烘焙）；若已设仍只读，检查是否显式设了 `STATIC_CONFIG=1` |
| 管理面 500 | 站点数多逼近 8 子请求上限 | 依赖分页；或改用烘焙 |
| 源站回源失败 | 填了 IP | ESA 必须填可解析域名 |
| 缓存没生效 | ESA 缓存全局单例 | 用 `cacheGen` 代次清，或确认 cache 阶段开 |

---

## 下一步

→ [ESA MCP](/dev/15-mcp-esa.md)：用 AI IDE 自然语言管理 ESA 网关。
