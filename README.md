# cdn-edge-gateway · 边缘回源网关

> 一个跑在**边缘节点**上的 CDN 反向代理网关：你访问加速域名，它在边缘决定「回哪个源站、路径怎么改、响应头怎么改、要不要缓存」，把对象存储 / Git 静态资源 / 自建源站一键套上 CDN 加速。
>
> 支持多域名、多源站池、负载均衡、链式回退与被动熔断，可部署到 **Cloudflare Workers / Cloudflare Pages / EdgeOne Pages**。

---

## 它帮你解决什么

| 痛点 | 本项目的做法 |
|---|---|
| 源站只有单 IP，一挂全挂 | 一个「源站池」里放多个源站，按顺序/权重自动切换（链式回退 + 被动熔断） |
| 想给不同路径走不同源站 | 「规则引擎」按请求特征（路径/扩展名/方法/Header/Cookie/Query）分流 |
| 不想让人盗链 / 刷流量 | 「安全防护」内置防盗链、UA 过滤、IP 黑白名单、签名 URL、限流 |
| 小水管源站扛不住 | 边缘缓存（Cloudflare 用 `caches.default`；EdgeOne 靠 `CDN-Cache-Control` 响应头委托边缘缓存） |
| 想看清一整套规则是怎么跑的 | 「流量序列」把请求从进来到返回画成流程图，可点击跳转、可拖拽调优先级 |
| 部署不想碰命令行 | 可视化管理面，登录后在网页上点着配，配置落 KV |

**品牌**：本项目是独立 CDN 厂商，响应头 `Server: EdgeGateway`、`Via: 1.1 EdgeGateway`，回传给源站的客户端 IP 头为 `X-EdgeGateway-Client-IP`——不会冒充任何上游平台。

---

## 一分钟看懂整体流程

```
浏览器 ──► 边缘节点(cdn-edge-gateway)
              │
              ├─ 1. 按域名(Host)匹配到「站点」
              ├─ 2. 安全防护(防盗链/IP/UA/签名/限流) 命中即拦截
              ├─ 3. 规则引擎 按优先级匹配(命中走对应源站池/动作)
              ├─ 4. 选源站(chain/roundrobin/weighted/iphash…)
              ├─ 5. 回源(路径重写/自定义Host/超时/跟随3xx)
              │       └─ 失败→自动切下一个源站 / 被动熔断
              ├─ 6. 响应头改写 + 边缘缓存
              └─ 7. 返回客户端
```

---

## 文档导航

> **新用户请按编号顺序阅读 01 → 06，读完即可完成从零到部署的全过程。**
> 完整索引见 **[文档中心](./docs/README.md)**。

**新手主线（按序阅读）**

| # | 文档 | 读完你会 |
|---|---|---|
| 01 | [项目概述](./docs/01-overview.md) | 明白它是什么、三种部署形态怎么选 |
| 02 | [环境准备](./docs/02-prerequisites.md) | 装好 Node、依赖，构建通过 |
| 03 | [本地开发与验证](./docs/03-local-development.md) | 本机跑起来、进管理面、验证回源 |
| 04 | [配置详解](./docs/04-configuration.md) | 看懂每个字段怎么填（**最常用**） |
| 05 | [命令行部署](./docs/05-deploy-cli.md) | 用 wrangler 部署上线 |
| 06 | [可视化部署](./docs/06-deploy-dashboard.md) | 不碰命令行，控制台点完部署 |

> 05 与 06 是两条**并列**路线，任选其一，不要同时做。

**上线之后**

| # | 文档 | 何时看 |
|---|---|---|
| 07 | [管理面使用教程](./docs/07-user-guide.md) | 在网页里建池、建站点、配规则 |
| 08 | [缓存策略](./docs/08-cache-strategy.md) | 想提高命中率、省函数额度 |
| 09 | [常见问题 FAQ](./docs/09-faq.md) | 排坑合集 |

**进阶参考**

| # | 文档 | 内容 |
|---|---|---|
| 10 | [系统架构](./docs/10-architecture.md) | 代码分层与模块职责 |
| 11 | [请求处理流程](./docs/11-request-flow.md) | 一个请求的完整链路 |
| 12 | [API 参考](./docs/12-api-reference.md) | 用 curl / 脚本批量管理 |
| 13 | [EO 回源 Host 配置](./docs/13-eo-origin-host.md) | EdgeOne 平台侧操作步骤 |
| 14 | [CI/CD 自动化](./docs/14-cicd.md) | 流水线发版 |

---

## 目录结构（速览）

```
src/
├── entry.js              # 运行入口（组装 ctx：请求/平台能力/env/KV）
├── core/                 # 请求主流程：匹配站点 → 安全 → 规则 → 选源 → 回源 → 改写
├── proxy/                # 回源执行(engines/)、头改写、路径重写、缓存键、图片优化
│   ├── engines/          # fetchEngine / socketEngine（socket 不支持时自动降级 fetch）
│   ├── cachekey.js       # 缓存键构造（回源 URL + host 维度 + 代次 + 自定义维度）
│   └── rewrite.js        # 路径重写 + 回源 Host 解析
├── balancer/             # 源站池调度策略(strategy) + 链式回退(failover) + 被动熔断(circuit)
├── config/               # 配置读写(KV: store) + schema 校验（唯一数据真相源）
├── security/             # 防盗链 / IP / UA / 签名 / 限流(guard/sign/ratelimit)
├── stats/                # 访问统计（collector 内存聚合 → KV / D1 双驱动）
├── api/                  # 管理面后端（/__panel/api/*）+ 静态页优先服务(adminPage)
│   ├── handlers/         # sites / pools / rules / stats / auth / config / cache
│   └── router.js         # 路由表
├── platform/             # 平台能力探测（caps: 缓存/D1/Socket/KV/EO Node 运行时）+ cache 封装
├── ui.gen.js             # 自动生成的管理面 UI（内联兜底，勿手改）
└── utils/                # 通用工具（reqid、ip、net、normalize…）
web/                      # 管理面前端（原生 JS 单页，构建时产出静态 + 内联兜底）
edge-functions/           # EO Makers Edge Function 目录
  └─ [[default]].js        # Catch-all 薄壳（加载 _worker.js，承载全部动态请求）
dist/public/              # 构建产出的管理面静态资源（HTML + assets），供 CF Workers(ASSETS)/Pages/EO 静态托管
scripts/dev.mjs           # 本地一键开发脚本
build.mjs                 # 三步构建：内联兜底 + dist/public + 打包 _worker.js
```

---

## 快速上手（最短路径）

> 要求 **Node.js ≥ 20**。完整分步教程见 [02 环境准备](./docs/02-prerequisites.md)。

```bash
# 方式 A：本地马上跑（零账号、不需要任何云平台）
npm install
npm run dev                 # 启动后打开 http://localhost:8799/__panel

# 方式 B：部署到生产
npm install
npm run build               # 生成 _worker.js + dist/public/ 静态资源
npx wrangler deploy         # Cloudflare Workers（详见 docs/05-deploy-cli.md）
```

不想用命令行部署？三种平台的纯控制台操作步骤见
**[06 可视化部署](./docs/06-deploy-dashboard.md)**。

> **输出目录务必填 `.`（仓库根），不要填 `dist/public`**：Pages 需要根目录的 `_worker.js`
> 承载数据面代理与 `/__panel/api/*`。只部署 `dist/public` 会得到一个「管理面能打开、
> 但代理和接口全部 404」的站点。静态资源省额度靠的是长缓存响应头 + Pages 的
> Fetch handler 缓存开关，与输出目录无关，详见 [FAQ](./docs/09-faq.md)。

**本质说明**：本项目是运行在边缘平台（CF Workers/Pages、EO Pages）上的一段处理代码，自身**无持久硬盘、内存极小**，不具备真实的本地缓存/存储。它的缓存、配置、统计全部依托底层平台能力：
- 配置/统计 → 绑定平台的 **KV**（CF）/ **EdgeOne KV** 托管存储；
- 缓存 → Cloudflare 用 `caches.default` API，EdgeOne 没有该 API，改由响应头 `CDN-Cache-Control` 让 EO 边缘按头缓存；
- **单运行时收口** → EdgeOne（新版 Makers）全部请求走 Edge Function（`edge-functions/[[default]].js` → `_worker.js`），不拆 Cloud Function（因 EO KV 仅在 Edge Functions 可用）；管理面 UI 静态资源由 Pages 静态托管，命中缓存后零函数执行次数。

**配置要点**：站点的「回源来源」二选一——**选已有源站组**（多站点复用）或**直接填写源站**（无需先建池），不再强制先建源站池。规则按 `priority` 从高到低匹配、命中即停。

详细步骤见 [文档中心](./docs/README.md)，按 01 → 06 顺序阅读即可完成部署。
