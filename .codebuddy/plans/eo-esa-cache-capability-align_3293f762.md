---
name: eo-esa-cache-capability-align
overview: 修正项目"EO/ESA 无 caches.default / Cache API"错误认知：核查 EO 与 ESA 官方文档后，三平台(cf/eo/esa)均原生支持 Cache API，统一 hasCacheApi=true；并标注各平台差异（EO 节点本地化、ESA 全局 cache 单实例+HTTP-key+32 子请求硬限），修订 contracts/caps/cache/pipeline/system/cache-handler 与对应文档。
todos:
  - id: extend-caps-contracts
    content: 在 contracts.js 与 caps.js 中将 hasCacheApi 统一为三平台 true 并新增缓存差异标志与 ESA 子请求限制
    status: completed
  - id: adapt-cache-abstraction
    content: 改造 cache.js 的 getCache 适配 caches.default/全局 cache，cachePut 对 ESA 降 http key
    status: completed
    dependencies:
      - extend-caps-contracts
  - id: fix-pipeline-comments
    content: 修正 pipeline.js 缓存注释并保留 eoEdgeCache 路径 A 并存
    status: completed
    dependencies:
      - extend-caps-contracts
  - id: update-api-handlers
    content: 更新 system.js 与 cache.js handler 的三平台 purge 与 limitations 提示
    status: completed
    dependencies:
      - adapt-cache-abstraction
  - id: sync-docs
    content: 同步 docs/07/08/09/10/11/12/14 中 EO/ESA Cache 能力表述与差异说明
    status: completed
    dependencies:
      - fix-pipeline-comments
      - update-api-handlers
  - id: verify-build-lint
    content: 运行 build.mjs 与 lint 验证 0 错误，使用 [subagent:code-explorer] 复核引用点
    status: completed
    dependencies:
      - sync-docs
---

## 用户需求

修正项目中关于 EdgeOne（EO）与阿里云 ESA 边缘缓存能力的错误认知遗留：项目当前多处假设"EO/ESA 没有 caches.default / Cache API，只能走响应头委托"，但官方文档确认三大平台均原生支持 Cache API。

## 产品概述

对边缘网关项目的平台能力探测层（caps）、缓存抽象层（cache）、代理管线（pipeline）、系统/缓存 API handler 及相关文档做一次"三平台 Cache 能力对齐"重构，使代码与 EO/ESA 官方文档一致，并保留各平台的真实差异。

## 核心特性

- 将 `hasCacheApi` 统一为 cf/eo/esa 三平台均 `true`（原仅 CF 为 true）。
- 新增平台差异标志：`cacheIsNodeLocal`（EO 节点本地化、不跨节点复制）、`cacheSingleInstance`（ESA 为全局 `cache` 对象、非 `caches.default`）、`cacheSubreqLimit`（ESA Cache+fetch 共享 32 子请求硬上限）、`cacheKeyHttpOnly`（ESA 的 put key 须 HTTP URL）。
- `getCache()` 适配：CF/EO 用 `caches.default`，ESA 用全局 `cache`；put 时 ESA 将 key URL 协议降为 http。
- 保留 EO 的 `eoEdgeCache` 路径 A（同站 fetch 委托节点缓存）与 `caches.default` 路径 B 并存（用户决策 A）。
- ESA 的 `fetch` 仅域名、不支持裸 IP、自定义 Host 仅改 HTTP 头——项目已正确，不动。
- `hasR2` 仅 CF 不变（EO 无 R2、ESA 未提供）；`maxSubRequests` 对齐：cf=50、eo 宽松、esa=32（与 Cache 共享）。
- 同步修订 docs/07、08、09、10、11、12、14 中关于"EO/ESA 无 Cache API"的错误表述。

## 技术栈选择

- 沿用现有项目栈：Cloudflare Workers 风格 Runtime API（CF Workers / EO Makers Edge Functions / 阿里云 ESA ER 三运行时同构）。
- 代码层：原生 JavaScript（ESM），`src/platform/caps.js` 能力探测、`src/platform/cache.js` 缓存抽象、`src/proxy/pipeline.js` 管线编排、`src/api/handlers/*.js` 管理面 API。
- 构建：沿用 `build.mjs`（esbuild 打包 `src/` → `_worker.js`）。

## 实现方案

以"运行时能力声明（caps）驱动抽象层（cache）"的现有模式为基础，把 `hasCacheApi` 从单平台开关升级为多平台开关 + 差异标志，避免新增架构模式。核心是：

1. `caps.js` 中 `detectCacheApi()` 对 `cf/eo/esa` 均返回 `true`，并按 platform 填充差异标志；
2. `cache.js` 的 `getCache()` 做平台分支：CF/EO 取 `caches.default`，ESA 取全局 `cache`；`cachePut` 对 ESA 将缓存键 URL 协议规范为 http（因 ESA 引擎不支持 https key）；
3. `pipeline.js` 仅修正注释，保留 `eoEdgeCache` 路径 A 并存；
4. `system.js`/`cache.js` handler 去掉"EO/ESA 不支持边缘缓存"的限制提示，改为三平台均允许 purge（ESA 注释其 32 子请求与不支持主动刷新约束）；
5. 文档同步。

## 关键决策与权衡

- **为何不用 `caches.open` 抽象统一 ESA**：ESA 是单实例全局 `cache`，无命名空间 `open`，强行抽象会引入无效分支；直接用 `cacheSingleInstance` 标志 + `getCache()` 内部分流最清晰、最小改动。
- **ESA put key 协议降级**：仅在 `cacheKeyHttpOnly` 为真时、且 key 为 https 时降为 http，避免误伤其它平台。
- **`hasEdgeCache` 维持三平台 true 不变**：响应头委托仍是 EO/ESA 的兜底通道，与 `caches.default` 并存不冲突。
- **ESA 子请求预算**：`cacheSubreqLimit=32`（Cache+fetch 共享）。`maxSubRequests` 改为按平台：cf=50、eo 宽松(1000)、esa=32，并在 system limitations 提示 ESA 子请求与 Cache 共享。

## 性能与可靠性

- `getCache()` 仅在首次调用时取句柄并缓存到 ctx，避免每请求重复探测。
- ESA put key 降级为纯字符串操作（URL 解析+协议替换），零额外 I/O。
- 缓存命中/写入失败均被 try/catch 兜住，不影响主流程（沿用现有 `safeIsCacheable`、`waitUntil(...catch)` 模式）。

## 实现注意事项

- 保持 `src/contracts.js` 中 Caps 类型的 JSDoc 与 `caps.js` 实际导出一致，避免 lint/类型漂移。
- `cache.js` 现有 `markDebug(ctx,'EDGE_HEADER')` 逻辑对 EO/ESA 不再作为"唯一"路径，改为仅在不具备 `hasCacheApi` 时标记（当前三平台均具，故该分支实际不会触发，保留作安全兜底）。
- ESA purge 受"不支持主动刷新"限制：`cacheDelete` 调用 `cache.delete` 真实执行（文档称可 delete），但注释说明 ESA 通过 Cache API 存入的缓存 TTL 到期才失效，delete 仅删当前节点。
- 构建产物 `_worker.js` 需重新 `build.mjs`；lint 须 0 错误。

## 架构设计

能力探测层（caps）产出统一的 `Caps` 对象 → 缓存抽象层（cache）按 `caps` 选择底层句柄与键处理 → 管线（pipeline）调用统一 `cacheMatch/cachePut/cacheDelete` → 管理面 handler 读取 `caps` 生成 limitations 与 purge 响应。无新模块，仅在现有三文件内扩展字段与分支。

## 目录结构

```
src/
├── contracts.js              # [MODIFY] Caps 新增 cacheIsNodeLocal/cacheSingleInstance/cacheSubreqLimit/cacheKeyHttpOnly 字段；hasCacheApi 注释改为三平台支持
├── platform/
│   ├── caps.js               # [MODIFY] detectCacheApi 对 cf/eo/esa 均 true；按 platform 填差异标志；maxSubRequests 按平台（esa=32）
│   └── cache.js              # [MODIFY] getCache 适配 caches.default / 全局 cache；cachePut 对 ESA 降 http key；注释节点本地化/单实例差异
├── proxy/
│   └── pipeline.js           # [MODIFY] 修正"EO 不支持 caches.default"注释；eoEdgeCache 路径 A 保留并存
└── api/handlers/
    ├── system.js             # [MODIFY] 三平台不再提示"不支持边缘缓存"；新增 ESA 子请求共享预算提示
    └── cache.js              # [MODIFY] 三平台均允许 purge；ESA 注释 32 子请求与不支持主动刷新约束
docs/
├── 07-eo-origin-host.md      # [MODIFY] 删除"EO 无 cache default"错误表述
├── 08-faq.md                 # [MODIFY] 同步 EO/ESA Cache 能力问答
├── 09-local-development.md   # [MODIFY] 同步 CLOUD_PLATFORM=esa 下 Cache 能力说明
├── 10-api-reference.md       # [MODIFY] ESA 能力示例 JSON 加 cache 差异标志
├── 11-architecture.md        # [MODIFY] §4 降级表三平台 caches.default 对齐；§4.1 重写 EO/ESA 同样有 Cache API 并标注差异
├── 12-request-flow.md        # [MODIFY] 引擎/缓存分发描述同步
└── 14-deploy-esa.md          # [MODIFY] 补充 ESA Cache 子请求 32 硬限与 HTTP-key 注意事项
```

## 关键代码结构

```js
// src/contracts.js Caps 新增字段（节选）
/**
 * @property {boolean} hasCacheApi       三平台均支持（cf=caches.default；eo=caches.default 节点本地化；esa=全局 cache）
 * @property {boolean} cacheIsNodeLocal  缓存仅当前节点有效、不跨节点复制（eo=true；cf/esa=false）
 * @property {boolean} cacheSingleInstance 平台仅提供单实例全局 cache、无 caches.default/open（esa=true）
 * @property {number}  cacheSubreqLimit  Cache 操作与 fetch 共享的子请求预算（esa=32；其余宽松）
 * @property {boolean} cacheKeyHttpOnly  put key 必须为 http URL（esa=true，因引擎不支持 https key）
 */
```

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 在落地前二次确认 `caps.js`/`cache.js`/`pipeline.js`/`system.js`/`cache.js` handler 中涉及 caches.default、hasCacheApi、eoEdgeCache、maxSubRequests 的所有引用点，避免遗漏分支与注释。
- Expected outcome: 产出精确的待修改符号/行号清单，确保三平台 Cache 对齐改动无遗漏、无回归。