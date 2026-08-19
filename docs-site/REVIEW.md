# 代码审查差异清单（REVIEW.md）

> 本文件为**内部审查产物**，不进入 MkDocs 导航（nav）。
> 用途：记录现有 `docs/` 旧文档与 `src/` 代码真实行为、默认值、分支逻辑的偏差，
> 作为重构全部文档的保真依据。审查日期：2026-08-15。

---

## 一、结论速览（必须先看）

旧文档整体质量**已相当新**（含单轨化迁移、ESA 静态烘焙、CF Workers 平台探测修复等），
但仍存在 **5 类必须修正的偏差**：

| # | 偏差类型 | 影响文档 | 严重度 |
|---|---|---|---|
| 1 | 已删除功能仍写进功能列表 | `01-overview.md` | 高 |
| 2 | ESA 子请求上限 32 写成 4（多处自相矛盾） | `14-deploy-esa.md` | 高 |
| 3 | ESA「原生 KV 有 EdgeKV」与「统一禁用厂商 KV」表述矛盾 | `14-deploy-esa.md` | 中 |
| 4 | 概念术语需对齐代码权威命名（STAGE_ORDER 等） | 多文档 | 中 |
| 5 | 隐藏字段盘点已单轨化，需同步到配置文档 | `04-configuration.md` | 中 |

---

## 二、逐篇偏差明细

### 01-overview.md（项目概述）

| 行 | 旧文档说法 | 代码真实 | 处置 |
|---|---|---|---|
| 15 | 功能列表含「签名 URL⚠️（实验特性，内置签发工具待开发）」 | `src/config/隐藏配置字段盘点.md` 第 35 行明确：`security.signedUrlParam`/`security.signedUrlTtl` 已于单轨化时**整段删除**，`guard.js` 引用与注释一并移除 | **删除**该功能描述，不写「实验特性」，直接说「暂不支持」或干脆不提 |
| 18 | 「用 Cloudflare / EdgeOne 的免费边缘额度」 | 准确。ESA 也支持（但 EdgeKV 收费）。建议补 ESA | 补 ESA 形态 |
| 36-40 | 三种部署形态表 | 准确（CF Workers / CF Pages / EO Pages）。ESA 虽也有但文档把 ESA 单列成部署篇，概述不冲突 | 保持，可加一句「阿里云 ESA 见开发者篇」 |
| 56 | `hasSocket / hasD1 / hasKV` 在系统信息页实时查看 | 准确（`src/api/handlers/system.js` 的 `/system/info` 返回 caps） | 保持 |
| 89 | `ADMIN_PATH` 默认 `__panel` | 准确（`src/config/store.js` 默认兜底 `__panel`） | 保持 |

> 注：旧 overview 整体结构（是什么/不是什么/三形态/架构图/概念表/仓库结构）**保留可用**，
> 仅删签名 URL、补 ESA 引用即可。这正是「单站分栏」用户篇 01 的基础。

### 03-deploy.md（部署指南）

- 整体步骤（1-8 步）与代码/脚本**高度一致**，质量高，可直接作为用户篇 03 基础。
- 第 6 步分叉（A1 WR / A2 粘贴 / A3 CF Pages / A4 流水线）准确对应 `package.json`：
  - `deploy:cf` = build + gen-deploy-config + wrangler deploy（A1/A4a 对应）✅
  - `deploy:pages` = build + wrangler pages deploy .（A3/A4b）✅
  - `deploy:esa` = build + 打印 ESA 步骤（A4c 非交互走 cli）✅（见 §五 脚本核查）
- 第 5 步缓存：`wrangler.toml` 内置 `[cache] enabled = true` —— 需核对 wrangler.toml 真实内容（见 §六）。
- 第 4 步 `CLOUD_PLATFORM=eo` 必填 —— 准确（`caps.js` 需要显式平台声明）。

> 处置：用户篇 03 直接基于本篇重写（小白话 + 示例已齐备），剔除流水线的 CNB 细节（单站用户篇聚焦 GitHub + 手动两条主线即可，CNB 作为进阶提示）。

### 09-local-development.md（本地开发）

- `npm run dev` 行为（生成 `.dev.vars` / 构建 `_worker.js` / 端口 8799 / 默认 `CLOUD_PLATFORM=eo`）与 `scripts/dev.mjs` 一致 ✅
- 健康检查 `/__health` 字段（ok/platform/caps）与 `src/api/handlers/system.js` 一致 ✅
- 管理面默认密码 `local-dev-pass` 与 `dev.mjs` 一致 ✅
- 步骤 4「建站点 localhost + 池 test-pool」示例准确 ✅
- **可基本原样继承**，补：热重载细节、`--cf` 切换、`test:e2e` 护栏说明。

### 14-deploy-esa.md（部署 ESA）

**⚠️ 本篇偏差最多，必须重写。**

| 章节 | 旧文档说法 | 代码真实 | 处置 |
|---|---|---|---|
| §1 表格 | 「每请求子请求（fetch）上限：**32 个**」 | `src/platform/caps.js`： `maxSubRequests: platform==='esa' ? 32 : 1000`；`cacheSubreqLimit: platform==='esa' ? 32 : Infinity` | 数值对，但 §4/§10 自相矛盾（见下） |
| §3 | 「统一禁用厂商 KV……持久化一律走外置 REDIS_URL」 | `src/platform/kv.js` 的 `getKV` 在 `CLOUD_PLATFORM=esa` 时跳过 EdgeKV 分支 ✅ | 保持 |
| §1 表格 | 「原生 KV：**有（EdgeKV）**」 | 与 §3「统一禁用厂商 KV」**矛盾**。代码已禁用 EdgeKV 分支，可读性上应统一说「ESA 提供 EdgeKV 但按计费策略本项目统一禁用，改用 REDIS_URL/静态烘焙」 | 改写，消除矛盾 |
| §4 | 「ESA 限制**每个请求最多发 32 个子请求**……数据面全程 ≤2 fetch，**低于 4 上限**，无压力」 | **「低于 4 上限」是错的**。代码上限是 **32**，不是 4。正确结论应是「≤2 fetch，远低于 **32** 上限，安全」 | **修正**：4 → 32 |
| §4 | 管理面「若站点数 > 3，单次管理面请求会突破 4 个 fetch 上限而 500」 | 应为「> 30 左右（32 预算预留回源）」——需按 32 重算阈值 | 按 32 上限重算站点阈值（listSites 分页 `MAX_TOTAL_SITES_SCAN` 见 store.js） |
| §10 | 「REDIS_URL 子请求预算：ESA 每请求子请求上限 = 4」 | 同上，应为 **32** | **修正**：4 → 32 |
| §6 | 方式 C 流水线 引用 `.github/workflows/deploy-esa-pages.yml` | 该文件存在性待核实（见任务 §七）。若新建 docs 站点，ESA 部署篇应聚焦「控制台 + cli + 流水线按钮」三种 | 核对后补/删 |

> 关键：ESA 子请求上限 **32（Cache 与 fetch 共享）** 是代码硬事实，文档两处写 4 属严重笔误，重构时必须统一为 32。

### 04-configuration.md（配置详解）

- 字段需以 `src/config/schema.js` 为唯一真相源（审查时未逐字展开 schema，重构时须逐项对齐）。
- 「隐藏配置字段盘点.md」已单轨化（2026-08-14 完成）：`DEFAULT_GLOBAL_SETTINGS` 删除，31 字段并入 stages。
- 配置文档需把「全站通用规则」三独有阶段（match/security/error）讲清楚，而非当隐藏字段。

### 隐藏配置字段盘点.md

- 已是最新（生成日期 2026-08-14），可直接转为附录「隐藏字段」。
- 但其中「签名 URL 已删除」（第 35-36 行）正是 overview 需同步删除的依据。

---

## 三、代码权威事实（供重构时直接引用，无需再查）

### 3.1 阶段字典（STAGE_ORDER 权威值）

来源：`src/config/stages.js`

- **规则阶段 STAGE_ORDER**（顺序即执行顺序）：
  `rewrite（URL 重写）→ redirect（重定向）→ terminate（强制HTTPS/直接响应）→ reqHeaders（修改请求头）→ origin（Origin Rules 回源规则）→ cache（Cache Rules 缓存规则）→ respHeaders（改写响应头/Response Cache Rule）`
- **全站独有阶段 GLOBAL_ONLY_STAGE_ORDER**：`match（匹配站点默认）→ security（安全校验默认）→ error（错误处理默认）`
- 旧数据含带圈数字阶段（⑤⑥⑦⑧⑨⑪⑯）经 `normalizeStage()` 自动归一，向后兼容。

### 3.2 平台能力 caps（src/platform/caps.js 关键字段）

| 字段 | cf | eo | esa |
|---|---|---|---|
| hasSocket（TCP 回源） | ✅ | ❌ | ❌ |
| hasRawIpFetch（裸 IP fetch） | ✅ | ✅ | ❌ |
| hasD1 | ✅ | ❌ | ❌ |
| hasR2 | ✅ | ❌ | ❌ |
| hasKV | ✅（CDN_KV） | ✅（CDN_KV） | ❌（禁用 EdgeKV，走 REDIS_URL/烘焙） |
| cacheSingleInstance | ❌ | ❌ | ✅（全局 cache 单例） |
| cacheIsNodeLocal | ❌ | ✅ | ❌ |
| cacheKeyHttpOnly（put key 须 http） | ❌ | ❌ | ✅ |
| maxSubRequests | 1000 | 1000 | **32** |
| cacheSubreqLimit（Cache 与 fetch 共享） | ∞ | ∞ | **32** |
| memBudgetBytes（内存预算） | 128MB 假设 | 128MB 假设 | 128MB（esa.jsonc） |

### 3.3 API 端点清单（src/api/router.js 权威，全站 /{adminPath}/api 下）

**认证（auth）**
- `POST /auth/login`（公开）登录
- `POST /auth/logout`（需鉴权）登出
- `GET /auth/me`（公开）探活是否登录
- `POST /auth/password`（需鉴权）改密码

**站点（sites）**
- `GET /sites` 列表 ｜ `GET /sites/templates` 模板 ｜ `GET /sites/:host` 详情
- `PUT /sites/:host/basics` 基本 ｜ `PUT /sites/:host/rules` 规则 ｜ `PUT /sites/:host/security` 安全
- `PUT /sites/:host` 全量 ｜ `DELETE /sites/:host` 删除

**源站池（pools）**
- `GET /pools` ｜ `POST /pools` ｜ `GET /pools/:id/refs`（谁引用）
- `GET /pools/:id` ｜ `PUT /pools/:id` ｜ `DELETE /pools/:id`

**全站通用规则**
- `GET /rules/global` ｜ `PUT /rules/global`

**缓存**
- `POST /cache/purge` 清缓存（按 URL）

**统计**
- `GET /stats/overview` 概览 ｜ `GET /stats/host/:host` 单站点

**系统**
- `GET /system/info` 平台/能力信息 ｜ `GET /system/export` 导出 ｜ `POST /system/import` 导入
- `POST /system/sync/open|close` 开/关同步 ｜ `GET /system/sync/status` 同步状态
- `POST /system/sync/receive`（公开，校验码+密码双重校验）接收同步

**配置**
- `GET /config/global` ｜ `PUT /config/global`

**KV 直读（无原生 KV 平台兜底）**
- `GET /kv/ping` 连通性 ｜ `GET /kv` 列键 ｜ `GET|PUT|DELETE /kv/:key`

> 鉴权设计：路由表 `auth` 缺省即需鉴权（安全默认）；写入类方法（POST/PUT/DELETE）校验同源 Origin（CSRF）；`/system/sync/receive` 跨站豁免 CSRF，改走「校验码+密码」双重校验。

### 3.4 管理面静态资源服务

- 数据面：`/{adminPath}/assets/*` 走平台静态托管（零函数调用）。
- 管理面 HTML：`/{adminPath}` 优先读 `dist/public/index.html`，缺失时回退 `src/ui.gen.js` 的 `UI_HTML` 内联兜底（粘贴部署/ESA 无静态资源时）。
- 健康检查：`/{adminPath}/__health` 或根 `/__health`（视部署形态）。

---

## 四、缓存本质（src/platform/cache.js 权威）

- 三平台（CF/EO/ESA）**均原生支持 Cache API**，`hasCacheApi` 均为 true。
- CF Workers 的 `wrangler.toml [cache] enabled=true` 是**平台级** Workers Cache/Smart Cache（命中不进函数）；与代码层 `caches.default` 是两层。清缓存需同时顾及两层。
- EO 的 `caches.default` **仅节点本地化**（cacheIsNodeLocal=true），`delete` 只清当前节点。
- ESA 的 cache 是**全局单实例**（无 caches.default/open），`put` key 须 http URL（自动降级）；Cache 操作与 fetch **共享 32 子请求预算**。
- 大规模清除靠「缓存代次（cacheGen）」使旧键整体失效，单键 purge 仅清当前节点。

---

## 五、部署脚本核查（package.json 真实）

```jsonc
"build":        "node build.mjs",
"deploy:cf":    "npm run build && node scripts/gen-deploy-config.mjs && wrangler deploy -c wrangler.deploy.toml && rm -f wrangler.deploy.toml",
"deploy:pages": "npm run build && wrangler pages deploy .",
"deploy:esa":   "npm run build && echo '=== ESA 部署步骤 ===' && echo '1) ESA 控制台设置环境变量 REDIS_URL...' && ... && echo '详见 docs-site/docs/dev/14-deploy-esa.md'",
"deploy:esa:cli":"npm run build && node scripts/deploy-esa-cli.mjs",
"dev":          "node scripts/dev.mjs",
"check":        "node scripts/check.mjs",
"gen":          "node scripts/gen-entries.mjs",
"test:e2e":     "node scripts/e2e-test.mjs"
```

- `deploy:esa` 仅打印步骤提示，**实际提交/发布需手动 `esa-cli commit && deploy`**（与 `14-deploy-esa.md` 方式 B 一致）。
- 静态烘焙：`build.mjs --bake <config.json>` → 生成 `src/config/baked.generated.js`（ESA 默认 `STATIC_CONFIG=1` 走烘焙分支）。

---

## 六、配置文件核查（部署真实步骤依据）

### wrangler.toml（CF Workers）
- 顶层 `[cache] enabled = true`（平台级缓存，部署即生效）。
- `compatibility_date` 已升到 `2026-08-11`（支持 `[cache]` 字段）。
- `compatibility_flags = ["nodejs_compat"]`（无 `sockets` flag，sockets 运行时动态加载）。
- 不写死 KV/R2/D1 绑定（靠 `gen-deploy-config.mjs` 拉远程绑定保留），不写 `ADMIN_PATH`。

### edgeone.json（EO Pages）
- Makers 部署；构建命令 `npm run build`、输出目录 `.`。

### esa.jsonc（ESA Pages）
- `entry: ./esa/index.js`、`assets.directory: ./dist/public`、`buildCommand: npm run build`。
- **无顶层 env**（变量在 ESA 控制台设）。
- **不配 notFoundStrategy**（否则 /__panel 导航请求被 index.html 兜底吞掉，进不了函数）。

### edge-functions/[[default]].js（EO/CF Pages 薄壳）
- 转发到 `_worker.js`（构建产物）。

---

## 七、待核实（重构时若发现缺失则补）

1. `.github/workflows/deploy-esa-pages.yml` 是否真实存在（旧文档引用）。若存在，ESA 部署篇引用之；否则 ESA 篇聚焦「控制台 + cli + 新 docs CI」。
2. `src/config/schema.js` 字段逐字——重构 04 配置文档时必须逐项打开 schema.js 对齐，本审查未逐字段展开（避免信息过载），但已确认「隐藏字段盘点」为最新、单轨化完成。
3. 图片优化（image.js）：旧文档未提，代码也无证据存在 → 不写，避免编造。

---

## 八、重构总方针（给执行阶段的硬约束）

1. **用户篇/开发者篇单站分栏**：MkDocs `nav` 两级分组；每篇顶部用 Material Admonition 声明读者对象（`> [!NOTE] 本文面向：普通用户`）。
2. **小白话 + 示例**：每篇「是什么 → 为什么 → 怎么做（带示例）→ 常见坑」。命令行用真实 `npm run *`，配置用真实字段（schema 真相源），API 用真实 curl（router.js 端点）。
3. **修正清单（强制）**：
   - 删除 overview 的「签名 URL」功能项；
   - ESA 子请求上限统一为 **32**（Cache 与 fetch 共享），改掉所有写 4 的段落；
   - ESA 原生 KV 表述统一为「提供 EdgeKV 但本项目按计费策略禁用，走 REDIS_URL/静态烘焙」；
   - 阶段顺序严格按 §3.1；
   - 配置文档纳入「全站通用规则」三独有阶段，而非当隐藏字段。
4. **不改动 src/ 任何业务代码**（本审查仅读）。
5. **GitHub Pages**：新增 `.github/workflows/docs.yml`，构建 docs-site 推 gh-pages（官方 Pages Action，零密钥）。
