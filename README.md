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

| 文档 | 看这个能学到 |
|---|---|
| [快速开始](./docs/getting-started.md) | 5 分钟本地跑起来 / 一键部署到生产 |
| [架构与设计](./docs/architecture.md) | 代码怎么组织、一个请求进来后发生了什么、平台能力降级 |
| [配置详解](./docs/configuration.md) | 管理面每个字段什么意思、怎么填、填错会怎样（**最常用**） |
| [管理面使用教程](./docs/user-guide.md) | 小白向：一步一步在网页上建池、建站点、配规则、看流量序列 |
| [本地开发 / 自测](./docs/local-development.md) | 不依赖任何云平台，本机验证代码与配置 |
| [管理面 API 参考](./docs/api-reference.md) | 用 curl / 脚本批量管理（自动化、CI） |
| [部署指南](./docs/deployment.md) | Cloudflare Workers / Pages / EdgeOne Pages 三种方式 |
| [常见问题 FAQ](./docs/faq.md) | 排坑合集 |

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

```bash
# 方式 A：本地马上跑（零账号）
npm install
npm run dev                 # 打开 http://127.0.0.1:8799/__panel，密码 local-dev-pass

# 方式 B：部署到生产
npm install
npm run build               # 生成 _worker.js + dist/public/ 静态资源
# Cloudflare Workers：粘贴 _worker.js（走内联兜底），或 npx wrangler deploy（带 ASSETS 静态层，零额度）
# Cloudflare Pages：连仓库构建，输出目录填 `.`（仓库根），或 npx wrangler pages deploy .
# EdgeOne Pages（Makers）：连仓库构建，输出目录填 `.`，edge-functions/ + dist/public/ 自动识别
```

> **输出目录务必填 `.`（仓库根），不要填 `dist/public`**：Pages 需要根目录的 `_worker.js`
> 承载数据面代理与 `/__panel/api/*`。只部署 `dist/public` 会得到一个「管理面能打开、
> 但代理和接口全部 404」的站点。静态资源省额度靠的是长缓存响应头 + Pages 的
> Fetch handler 缓存开关，与输出目录无关，详见 [FAQ](./docs/faq.md)。

**本质说明**：本项目是运行在边缘平台（CF Workers/Pages、EO Pages）上的一段处理代码，自身**无持久硬盘、内存极小**，不具备真实的本地缓存/存储。它的缓存、配置、统计全部依托底层平台能力：
- 配置/统计 → 绑定平台的 **KV**（CF）/ **EdgeOne KV** 托管存储；
- 缓存 → Cloudflare 用 `caches.default` API，EdgeOne 没有该 API，改由响应头 `CDN-Cache-Control` 让 EO 边缘按头缓存；
- **单运行时收口** → EdgeOne（新版 Makers）全部请求走 Edge Function（`edge-functions/[[default]].js` → `_worker.js`），不拆 Cloud Function（因 EO KV 仅在 Edge Functions 可用）；管理面 UI 静态资源由 Pages 静态托管，命中缓存后零函数执行次数。

**配置要点**：站点的「回源来源」二选一——**选已有源站组**（多站点复用）或**直接填写源站**（无需先建池），不再强制先建源站池。规则按 `priority` 从高到低匹配、命中即停。

详细步骤见 [快速开始](./docs/getting-started.md)。
