# 部署变量与平台清单（一站式）

> [!IMPORTANT]
> **这是「要设哪些变量、各平台怎么部署」的唯一入口。**
> 所有环境变量、平台绑定、各平台串行部署步骤都集中在这里，不用再去翻 Redis / ESA / 配置详解等多篇文档。
> 进阶细节（Webdis 原理、ESA 烘焙决策、隐藏配置字段）仍可在文末链接里找到。

---

## 一、最小必填速查（先照这个设）

不管哪个平台，先把这 4 样搞定，网关就能跑起来：

| 必填项 | 是什么 | 怎么给 |
|---|---|---|
| **平台声明** | `CLOUD_PLATFORM` | EO / ESA 必须在控制台/变量里设 `eo` 或 `esa`；CF 用薄壳或构建烘焙可免设（见下） |
| **会话密钥** | `JWT_SECRET` | 一段 ≥8 字符的高熵随机串（如 `openssl rand -hex 32`）；不设会降级到不安全派生，**强烈建议设** |
| **管理员密码** | `ADMIN_PASSWORD` | 仅**首次初始化**需要：设一次后哈希固化进 KV，之后可删；用 `wrangler secret put` 或控制台 Secret 注入 |
| **存储后端** | 平台 KV 绑定 **或** `REDIS_URL` | 二选一：绑定平台 KV（`CDN_KV`/`KV`），或自部署 Webdis 填 `REDIS_URL`（全平台可用） |

> 其余变量全部有默认值，可先不碰，跑通后再按需调。

---

## 二、A 类：环境变量总表（字符串值）

> 通过环境变量 / Secret 读取的字符串。默认值、必填性、平台差异均经代码核对。

| 变量 | 默认值 | 必填/可选 | 平台差异与说明 |
|---|---|---|---|
| `CLOUD_PLATFORM` | 无（CF 可构建期烘焙） | EO/ESA 必填；CF 通常免设 | 规范值 `cf` / `eo` / `esa`；兼容别名 `cloudflare`/`workers`/`pages`→`cf`、`edgeone`→`eo`、`aliyun-esa`/`alibaba-esa`→`esa`（别名仅告警不报错）。EO/ESA 若用官方薄壳会自动补，但不用薄壳时必须显式设 |
| `JWT_SECRET` | 无 | **可选但强烈建议** | `typeof==='string' && length>=8` 才生效；未设或 <8 字符会降级从管理员密码哈希派生（不安全），登录签名可能失败 |
| `ADMIN_PASSWORD` | 无 | 仅首次初始化必填 | 首次部署 KV 里还没有密码哈希时必填；设过一次后固化进 KV，变量可移除。用 `wrangler secret put ADMIN_PASSWORD` 或控制台 Secret |
| `ADMIN_PATH` | `__panel` | 可选 | 管理面路径；生效优先级：KV 全局配置 > 环境变量 > 内置 `__panel`。官方不推荐在变量页设，建议用管理面改 |
| `KV_BACKEND` | `auto` | 可选 | `auto` / `native`(别名 `kv`/`platform`) / `redis`(别名 `webdis`)。`auto` = **Webdis 优先**：平台 KV 与 Webdis 并存时用 Webdis，不可用时降级到另一侧 |
| `REDIS_URL` / `REDIS_URL_KV` | 无 | 可选 | 任一非空即启用 Webdis 后端。ESA 未配时薄壳默认注入 `STATIC_CONFIG=1`（只读烘焙） |
| `REDIS_TOKEN` | 空串 | 可选 | **只需填 base64 凭证串，代码自动补 `Basic ` 前缀**；也可填完整 `Basic xxx`/`Bearer xxx`（已带前缀原样用）。代码不二次 base64。EdgeOne 等「变量值禁空格」平台**务必只填 base64 串、不要带 `Basic ` 前缀**（见 [Redis/Webdis 文档](../dev/13-redis-kv.md) 的生成命令） |
| `REDIS_PREFIX` | 按平台自适应 | 可选 | 仅当变量**完全未设置**时套 `cf:` / `eo:` / `esa:`（取 `CLOUD_PLATFORM`）；显式设为空串 `""` = 主动不要前缀；多项目共库时隔离键 |
| `REDIS_DB` | `0` | 可选 | Redis 逻辑库 0–15；非法/越界值忽略回退 0 |
| `REDIS_TIMEOUT_MS` | `5000` | 可选 | 单次 Webdis 请求超时（毫秒） |
| `STATIC_CONFIG` | 无（ESA 未配 REDIS_URL 时默认 `1`） | 可选 | `1` = 静态烘焙只读模式（不依赖运行时 KV）；`0` / `false` = 强制可写 |
| `MEM_BUDGET_BYTES` | `128MB` 估算 | 可选 | 覆盖内存预算上限；有限且 >0 时生效 |
| `EXECUTION_LIMIT_MS` | `cf`→`30000`；`eo`/`esa`→`120000` | 可选 | 单次请求执行上限（毫秒） |
| `FIRST_BYTE_LIMIT_MS` | `esa`→`10000`；`cf`/`eo`→无约束 | 可选 | ESA 首字节超时，超时网关断连 504 |
| `ESA_KV_NAMESPACE` | `kv` | 仅 ESA（当前几乎不生效） | ESA EdgeKV 命名空间名；本项目在 ESA 上统一禁用厂商 KV，此变量基本作兜底 |

---

## 三、B 类：平台绑定 / 工具（控制台创建，非字符串变量）

> 这些是你在平台控制台「创建并绑定」的资源，绑定名会出现在运行环境里。不需要写成字符串值，绑定即可。

| 资源 | 绑定名（候选） | 平台 | 说明 |
|---|---|---|---|
| **KV 存储** | `CDN_KV` / `KV`；EO 额外查运行时全局 `globalThis.CDN_KV` | 全部 | 平台级 KV，存配置。EO Makers 是运行时全局变量而非 env 注入 |
| **数据库（D1）** | `CDN_DB` → `DB` → `D1`（按优先级取） | **仅 CF** | 统计驱动优先用 D1，失败降级回 KV；EO/ESA 无 D1，自动走 KV |
| **对象存储（R2）** | 由源站配置字段 `r2Binding` 任意命名（探测候选 `CDN_R2` / `R2`） | **仅 CF** | 源站 `engine==='r2'` 时 `r2Binding` **必填**；不是固定 `CDN_R2` 二选一，而是你在源站配置里指定的绑定名 |
| **静态资产** | `ASSETS` | **仅 CF Workers** | CF Workers Static Assets 绑定；纯 Dashboard 粘贴 `_worker.js` 时无此绑定，管理面会内联兜底，功能仍完整 |

> EO 走 Makers 静态目录、ESA 无静态托管，二者都不用 `ASSETS` 绑定。

---

## 四、四平台串行单线路

每条线按 **①可视化操作 ②命令 ③创建的工具(绑定) ④要设的变量** 列清。

### 路线 A：Cloudflare Workers（推荐）

| 步骤 | 内容 |
|---|---|
| ① 可视化操作 | Cloudflare 控制台 → Workers & Pages → 创建 Worker；在 Worker 设置里绑定 KV 命名空间（变量名 `CDN_KV`），可选绑定 D1（变量名 `CDN_DB`）、R2（任意名）、Static Assets（`ASSETS`） |
| ② 命令 | `npm run build` → `npm run deploy:cf`；设 Secret：`wrangler secret put JWT_SECRET` / `wrangler secret put ADMIN_PASSWORD` |
| ③ 创建的工具 | KV 绑定 `CDN_KV`（必选其一）；可选 D1 `CDN_DB`、R2、Static Assets `ASSETS` |
| ④ 要设的变量 | `JWT_SECRET`（必）、`ADMIN_PASSWORD`（首次必）；`CLOUD_PLATFORM` 可免设（薄壳/烘焙）；可选 `KV_BACKEND`/`REDIS_*`/`STATIC_CONFIG`/`MEM_BUDGET_BYTES`/`EXECUTION_LIMIT_MS`/`ADMIN_PATH` |

### 路线 B：Cloudflare Pages

| 步骤 | 内容 |
|---|---|
| ① 可视化操作 | Cloudflare 控制台 → Workers & Pages → 创建 Pages（连接仓库或上传）；在 Functions 设置里绑定 KV（`CDN_KV`）、D1（`CDN_DB`） |
| ② 命令 | `npm run build` → 用 Pages 构建输出部署；设 Secret 同路线 A |
| ③ 创建的工具 | 同路线 A 的 KV/D1/R2/ASSETS 绑定（Pages Functions 同样支持） |
| ④ 要设的变量 | 同路线 A（CF 下 `CLOUD_PLATFORM` 可免设） |

### 路线 C：EdgeOne Makers

| 步骤 | 内容 |
|---|---|
| ① 可视化操作 | EdgeOne Makers 控制台创建项目；Makers KV 是运行时全局变量（自动可用，无需手动绑定名）；如需 R2 在源站配置里填 `r2Binding` |
| ② 命令 | `npm run build` → `edgeone makers deploy dist-eo`（或平台提供的部署命令） |
| ③ 创建的工具 | Makers KV（运行时 `globalThis.CDN_KV` 自动注入）；无 D1/R2 绑定（统计走 KV） |
| ④ 要设的变量 | **`CLOUD_PLATFORM=eo`（必）**、`JWT_SECRET`（必）、`ADMIN_PASSWORD`（首次必）；可选 `KV_BACKEND`/`REDIS_*`/`STATIC_CONFIG`/`MEM_BUDGET_BYTES`/`EXECUTION_LIMIT_MS`/`ADMIN_PATH` |

### 路线 D：阿里云 ESA

| 步骤 | 内容 |
|---|---|
| ① 可视化操作 | ESA 控制台创建函数 / 站点；ESA 本项目**统一禁用厂商 KV**，请用自部署 Webdis 或静态烘焙 |
| ② 命令 | `npm run build` → `npm run deploy:esa` |
| ③ 创建的工具 | 无必绑 KV（厂商 KV 已禁用）；Webdis 后端需你自备 Redis + 反代 |
| ④ 要设的变量 | **`CLOUD_PLATFORM=esa`（必）**、`JWT_SECRET`（必）、`ADMIN_PASSWORD`（首次必）；**推荐 `REDIS_URL` + `REDIS_TOKEN`**（配即启用 Webdis，否则自动 `STATIC_CONFIG=1` 只读）；可选 `KV_BACKEND`/`REDIS_PREFIX`/`REDIS_DB`/`REDIS_TIMEOUT_MS`/`STATIC_CONFIG`/`MEM_BUDGET_BYTES`/`EXECUTION_LIMIT_MS`/`FIRST_BYTE_LIMIT_MS`/`ADMIN_PATH` |

---

## 五、常见坑速查

- **`CLOUD_PLATFORM` 没设（EO/ESA 不用薄壳）** → 启动报错"必须设置环境变量 CLOUD_PLATFORM"。补 `eo` / `esa`。
- **`JWT_SECRET` 没设或 <8 字符** → 降级到密码哈希派生，重启/无哈希时登录签名失败（500）。用 `openssl rand -hex 32` 设一个。
- **`REDIS_TOKEN` 填成带 `Basic ` 前缀的文本或伪代码** → EdgeOne 等禁空格平台会直接报错无法保存；其它平台若填 `Basic <base64("...")>` 文本则服务端收到非法凭据、持续 401/403。**正确做法：只填 `base64` 算出的凭证串**（如 `ZXNhOe...`），代码自动补 `Basic ` 前缀（见 [Redis/Webdis 文档](/dev/13-redis-kv.md)）。
- **`REDIS_PREFIX` 没设但多项目共库** → 自动套 `cf:`/`eo:`/`esa:` 前缀；若旧数据无前缀会读不到，显式设回原前缀即可。
- **ESA 没配 `REDIS_URL`** → 自动进入静态烘焙只读（`STATIC_CONFIG=1`），管理面改配置不生效；想可写就配 `REDIS_URL` 或显式 `STATIC_CONFIG=0`。

---

## 延伸阅读（进阶，非必读）

- [Redis / Webdis 外置 KV 原理与生成 token](/dev/13-redis-kv.md)
- [部署 ESA 进阶决策](/dev/14-deploy-esa.md)
- [隐藏配置字段（KV 全局配置 JSON 字段）](/appendix/hidden-fields.md)
- [配置详解（源站/站点/规则）](/user/04-configuration.md)
