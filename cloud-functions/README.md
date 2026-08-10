# cloud-functions/ — EdgeOne Makers Cloud Functions（预留重活区）

本目录对应 EO Makers 的 **Cloud Functions（云端 Node.js 运行时）**，与 `edge-functions/`（Edge Functions）分工如下：

| 维度 | Edge Functions（`edge-functions/`） | Cloud Functions（本目录） |
|---|---|---|
| 运行位置 | 全球边缘节点 | 云端服务器 |
| 延迟 / 冷启动 | 极低 / 毫秒级 | 较低 / 百毫秒级 |
| 存储能力 | **KV 原生可用**（配置存储） | 无原生 KV；可用 npm 生态（MySQL、Blob SDK、对象存储等） |
| 适用场景 | 高并发、延迟敏感、短执行（≤200ms CPU、≤1MB body） | 复杂数据处理、长执行、重 IO |
| 本项目承载 | 数据面代理 + 管理面（均依赖 KV） | 未来：不依赖 KV 的重活 |

## 为什么目前不在这里放任何可加载函数

本项目的全部配置（站点、源站池、规则）存在 **KV**，而 EO 官方明确：**KV 仅支持在 Edge Functions 中使用**。
数据面代理 `handleProxy` 必须读 KV 才能拿到站点与源站配置，因此 Cloud Functions 无法承载任何需要配置的请求
（会读不到 `CDN_KV` 而失败）。在「KV-only」现状下，动态请求全部由 `edge-functions/[[default]].js` 收口是唯一能跑通的方案。

> 这正对应参考项目（CloudPaste-EdgeOne）在 EO 用 MySQL 的做法：它的重 IO 走 Node 运行时 Cloud Function，
> 但那是 MySQL（npm 生态，不依赖 KV）；本项目是 KV 存储模型，故重活暂无处可卸。

## 何时该往这里加代码

出现以下任一类「不依赖本项目 KV 的重活」时，在本目录新增路由（如 `cloud-functions/api/heavy/[[default]].js`）：

- 大文件转码 / 压缩 / 水印等 CPU 密集任务
- AI 推理、长链路编排
- 独立业务库查询（MySQL / PostgreSQL，经 npm 客户端）
- 大体量对象存储读写（**用 Blob 而非 D1**，见下）

## 跨平台存储统一原则：Blob 代替 D1

EO 没有 D1（Cloudflare 的 SQLite 绑定）概念。为保持跨平台一致性：

- **CF 侧**：未来若需结构化/大容量存储，使用 D1（`@cloudflare/d1`）
- **EO 侧**：对应使用 **Blob（对象存储）**，在本目录经对象存储 SDK 访问（Edge Functions 不提供 Blob 原生 API）
- 两者封装在统一的 **存储抽象层** 之后，业务代码只调抽象接口，不感知底层是 D1 还是 Blob

当前版本未引入该抽象（仍为 KV-only），此目录仅作架构预留。新增重活时再落实抽象层，避免提前引入破坏 CF 兼容性的运行时依赖。

## 路由约定（EO Makers）

- 函数文件相对 `cloud-functions/` 的路径即 URL 路径；`api/[[default]].js` 匹配 `/api/*` 全部子路径
- 入口导出：`export default function onRequest(context)` 或细粒度 `onRequestPost` 等
- 与静态资源冲突时静态优先
- 本目录根级保持空（仅此 README），不创建可被 EO 误加载的占位函数，避免无 KV 的代理请求落入此运行时
