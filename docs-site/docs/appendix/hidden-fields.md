# 隐藏配置字段盘点

> [!NOTE]
> **本文面向**：开发者 / 进阶用户。
> 这里收录「文档正文不常提、但代码 schema 支持」的配置字段，以及单轨化迁移后的变化。
> 字段真相源永远以 `src/config/schema.js` 为准。

---

## 一、单轨化迁移（重要背景）

项目在 2026-08-14 完成「配置单轨化」：

- 原先 `DEFAULT_GLOBAL_SETTINGS` 里那批「全局默认」字段被**并入 stages 体系**，不再单列。
- 目前全局配置只保留 **31 个字段**（见下表第二节）。
- 规则（含全站通用规则）独有 `match / security / error` 三个阶段，这些是**全站级默认行为**，不是隐藏字段，按规则阶段编写即可。

> [!WARNING]
> 当前代码不支持签名 URL，请勿在配置里写 `security.signedUrlParam` / `security.signedUrlTtl` 两个字段。

---

## 二、全局配置字段（31 个，含部分「隐藏/高级」项）

普通用户常用字段在 [配置详解](/user/04-configuration.md) 已讲；下面标注 `★ 隐藏/高级` 的是容易被忽略的项。

| 字段 | 类型 | 默认 | 说明 | 标注 |
|---|---|---|---|---|
| `adminPath` | string | `__panel` | 管理面路径前缀 | |
| `passwordHash` | string | — | 管理员密码 hash（PBKDF2） | |
| `passwordSalt` | string | — | 密码盐 | |
| `sessionSecret` | string | — | 登录 JWT 签名密钥 | ★ |
| `sessionTtlMinutes` | number | `60` | 登录有效期 | |
| `kvTtlSeconds` | number | `86400` | 配置 KV 缓存时间 | |
| `kvRefreshStaleSeconds` | number | `300` | 陈旧期 | |
| `ipLimit` | object | — | 单 IP 并发限制 | ★ |
| `userAgentLimit` | object | — | UA 并发限制 | ★ |
| `globalConcurrency` | number | `0`(不限制) | 全局并发上限 | ★ |
| `maxBodyBytes` | number | `1048576` | 请求体上限 1MB | ★ |
| `readTimeoutMs` | number | `30000` | 回源读取超时 30s | ★ |
| `connectTimeoutMs` | number | `10000` | 连接超时 10s | ★ |
| `maxRedirects` | number | `5` | 回源跟随重定向上限 | ★ |
| `compress` | boolean | `true` | 是否压缩 | |
| `cacheGen` | number | `0` | 缓存代次（清缓存用） | |
| `defaultUpstreamTimeoutMs` | number | `30000` | 默认回源超时 | ★ |
| `allowedHeaders` | array | — | 透传请求头白名单 | ★ |
| `stripHeaders` | array | — | 剥离的请求/响应头（strip：prefix/exact/regex） | ★ |
| `securityEnabled` | boolean | `true` | 安全总开关 | |
| `refererCheck` | object | — | 防盗链 | |
| `ipBlacklist` | array | — | IP 黑名单 | |
| `ipWhitelist` | array | — | IP 白名单 | |
| `uaBlocklist` | array | — | UA 黑名单 | |
| `uaAllowlist` | array | — | UA 白名单 | |
| `rateLimit` | object | — | 限流 | |
| `enableCircuitBreaker` | boolean | `false` | 被动熔断总开关 | ★ |
| `circuitBreakerThreshold` | number | `5` | 熔断触发失败次数 | ★ |
| `circuitBreakerResetMs` | number | `60000` | 熔断恢复探测时长 | ★ |
| `strategy` | string | `round_robin` | 负载均衡策略 | |
| `stageOrder` | array | — | 自定义阶段顺序（覆盖默认） | ★ |

> [!TIP]
> 带 ★ 的项多为性能/稳定性调优用，普通部署保持默认即可；只有当你明确遇到超时、并发爆量、误杀时才改。

---

## 三、平台相关隐藏项（环境变量）

这些不在配置 JSON 里，而是部署时设的环境变量（见 [部署 ESA](/dev/14-deploy-esa.md)）：

| 变量 | 平台 | 说明 |
|---|---|---|
| `CLOUD_PLATFORM` | 全部 | `cf` / `eo` / `esa`，必填（EO 必填） |
| `KV_BACKEND` | 全部 | KV 后端选型：`auto`（默认，**Webdis 优先**）/ `native`（平台 KV）/ `redis`（Webdis） |
| `REDIS_URL` | 全部 | 自部署 Webdis 根地址（不带尾斜杠）；配上即启用 Webdis 后端 |
| `REDIS_TOKEN` | 全部 | Webdis 鉴权头原样值，如 `Basic <base64>` |
| `REDIS_PREFIX` | 全部 | 键前缀，便于多项目共库识别 |
| `REDIS_DB` | 全部 | Redis 逻辑库号 `0`–`15`，非法值回退 `0` |
| `REDIS_TIMEOUT_MS` | 全部 | Webdis 单次请求超时，默认 `5000` |
| `STATIC_CONFIG` | 全部 | `1` 时走静态烘焙（只读，不依赖运行时 KV）；ESA 在未配 `REDIS_URL` 时默认为 `1` |
| `MEM_BUDGET_BYTES` | 全部 | 覆盖内存预算（默认按 128MB 估算） |
| `ADMIN_PATH` | 全部 | 覆盖管理面路径（也可写进 global） |

> [!IMPORTANT]
> **所有平台**都支持外置自部署 Webdis，且可与平台级 KV 并存。两者都可用时**默认优先 Webdis**；
> 设 `KV_BACKEND=native` 可切回平台 KV。该开关只能走环境变量（配置本身存在 KV 里，
> 写进配置会造成循环依赖），管理面只读展示。**切换后端不会自动迁移数据，切换前请先导出配置。**
> 详见 [Redis / Webdis 外置 KV](/dev/13-redis-kv.md)。

---

## 四、如何验证字段是否被代码支持

不要凭记忆。验证方法：

```bash
# 1) 直接看 schema 真相源
grep -n "field name" src/config/schema.js

# 2) CI 一致性检查会校验配置字段合法性
npm run check
```

> [!NOTE]
> 往配置里塞了代码不认识的字段，`npm run check` 会在 CI 报错，部署前必跑。
