# 14 · 部署到阿里云 ESA

> [!NOTE]
> **本文面向**：开发者（把网关跑上阿里云 ESA）。
> 普通用户的通用部署见 [用户篇 · 部署指南](/user/03-deploy.md)。

---

## 先读：ESA 与 CF/EO 的三大不同

> [!WARNING]
> 下面三点是 ESA 部署最容易翻车的地方，**必须先在 `esa.jsonc` 配好或用 `deploy:esa` 走烘焙**。

| 维度 | ESA 真实情况（代码 `caps.js`） | 注意 |
|---|---|---|
| 原生 KV | **无**（EdgeKV 按计费策略统一禁用） | 配置走 `REDIS_URL` 或**静态烘焙**，不能依赖运行时 KV |
| 子请求上限 | **每请求 32 个**（Cache 与 fetch 共享） | 管理面站点数多时要分页（见 §4） |
| 内存预算 | 128MB（`esa.jsonc` 设） | 缓存 TTL 别太大 |

---

## §1 平台能力对照（权威）

来源 `src/platform/caps.js`，ESA 关键 caps：

| 能力 | ESA 值 | 说明 |
|---|---|---|
| `hasCacheApi` | `true` | 支持 Cache API（全局单例，`put` key 须 http） |
| `cacheIsNodeLocal` | `false` | 缓存是**全局**的（非节点本地） |
| `cacheSingleInstance` | `true` | Cache 全局单实例，无 `caches.default/open` |
| `cacheKeyHttpOnly` | `true` | `put` 缓存键必须是 http URL（自动降级） |
| `hasKV` | `false` | 无原生 KV（见 §3） |
| `hasSocket` / `hasRawIpFetch` | `false` | 源站必须填**可解析域名**（不能 IP 直连） |
| `maxSubRequests` | **32** | 每请求子请求上限（Cache 与 fetch 共享） |
| `cacheSubreqLimit` | **32** | Cache 操作与 fetch 共用这 32 预算 |

> [!IMPORTANT]
> 数据面全程 ≤2 个 fetch，远低于 **32** 上限，安全；管理面站点多时单请求才需关注 32 预算。

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

## §3 KV 两选一：REDIS_URL 或 静态烘焙

ESA 无原生 KV，二选一：

### 方式 A：REDIS_URL（Webdis 兜底，配置常变时用）

ESA 控制台设 `REDIS_URL=http://你的-webdis地址`，代码 `getKV()` 在 esa 平台自动走 Webdis。
验证：`/__panel/api/kv/ping` 返回 `backend:"redis-webdis"`。
详见 [Redis KV 兜底](/dev/13-redis-kv.md)。

### 方式 B：静态烘焙（配置基本不动时用，最稳）

```bash
npm run build -- --bake config.json    # 把配置烤进 src/config/baked.generated.js
```

ESA 默认 `STATIC_CONFIG=1` 走烘焙分支，运行时**完全不依赖 KV/Redis**。
适合配置稳定、追求零运行时依赖的生产场景。

---

## §4 部署方式

### 方式 A：ESA 控制台（最省事）

1. 控制台「函数」→ 新建，入口 `./esa/index.js`。
2. 上传构建产物（`_worker.js` + `dist/public/`）。
3. 设环境变量：`CLOUD_PLATFORM=esa`、`REDIS_URL`（或 `STATIC_CONFIG=1`）。
4. 发布，绑定自定义域。

### 方式 B：ESA CLI

```bash
npm run deploy:esa        # 打印步骤提示
npm run deploy:esa:cli    # 或直接走 cli 部署脚本 scripts/deploy-esa-cli.mjs
```

### 方式 C：流水线（团队）

仓库绑 CI（如 CNB/云效），构建后调用 ESA 发布接口。控制台「流水线」按钮一键发布。

> [!NOTE]
> 管理面站点数多（接近 32 子请求预算）时，列表接口会分页（`MAX_TOTAL_SITES_SCAN`），单请求不会突破 **32** 上限。

---

## §5 发布后验证

打开管理面 `https://你的网关域名/{adminPath}` 确认可登录即代表部署成功。平台能力（如 `kvBackend`、`cacheSubreqLimit`）可在管理面「平台能力」面板查看，无需独立公开健康检查接口。

确认 `platform:"esa"`、`hasKV:false`（说明走 Webdis/烘焙）。

---

## §6 避坑清单

| 现象 | 原因 | 解法 |
|---|---|---|
| 部署报错平台探测失败 | 没设 `CLOUD_PLATFORM=esa` | 控制台/构建设 `esa` |
| 配置读不到 | 既没 REDIS_URL 也没烘焙 | 二选一（§3） |
| 管理面 500 | 站点数多逼近 32 子请求 | 依赖分页；或改用烘焙 |
| 源站回源失败 | 填了 IP | ESA 必须填可解析域名 |
| 缓存没生效 | ESA 缓存全局单例 | 用 `cacheGen` 代次清，或确认 cache 阶段开 |

---

## 下一步

→ [ESA MCP](/dev/15-mcp-esa.md)：用 AI IDE 自然语言管理 ESA 网关。
