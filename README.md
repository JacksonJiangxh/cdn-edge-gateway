# cdn-edge-gateway · 边缘回源网关

> 一个跑在**边缘节点**上的 CDN 反向代理网关：你访问加速域名，它在边缘决定「回哪个源站、路径怎么改、响应头怎么改、要不要缓存」，把对象存储 / Git 静态资源 / 自建源站一键套上 CDN 加速。
>
> 支持多域名、多源站池、负载均衡、链式回退与被动熔断，可部署到 **Cloudflare Workers / Cloudflare Pages / EdgeOne Pages / 阿里云 ESA**。

---

## 它帮你解决什么

| 痛点 | 本项目的做法 |
|---|---|
| 源站只有单 IP，一挂全挂 | 一个「源站池」里放多个源站，按顺序/权重自动切换（链式回退 + 被动熔断） |
| 想给不同路径走不同源站 | 「规则引擎」按请求特征（路径/扩展名/方法/Header/Cookie/Query）分流 |
| 不想让人盗链 / 刷流量 | 「安全防护」内置防盗链、UA 过滤、IP 黑白名单、限流 |
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
              ├─ 2. 安全防护(防盗链/IP/UA/限流) 命中即拦截
              ├─ 3. 规则引擎 按优先级匹配(命中走对应源站池/动作)
              ├─ 4. 选源站(chain/roundrobin/weighted/iphash…)
              ├─ 5. 回源(路径重写/自定义Host/超时/跟随3xx)
              │       └─ 失败→自动切下一个源站 / 被动熔断
              ├─ 6. 响应头改写 + 边缘缓存
              └─ 7. 返回客户端
```

---

## 文档导航

> 完整教程已重构为 **MkDocs 文档站**，区分「用户篇 / 开发者篇」单站分栏，免费托管到 GitHub Pages。
> **在线文档**：`https://<你的组织>.github.io/cdn-edge-gateway/`（由仓库 `.github/workflows/docs.yml` 自动构建部署）。

**用户篇（部署 / 运维 / 使用）**
| # | 文档 | 读完你会 |
|---|---|---|
| 01 | [项目概述](./docs-site/docs/user/01-overview.md) | 明白它是什么、四种部署形态怎么选 |
| 02 | [环境准备](./docs-site/docs/user/02-prerequisites.md) | 装好 Node、依赖，构建通过 |
| 03 | [部署指南](./docs-site/docs/user/03-deploy.md) | CF / Pages / EdgeOne / ESA 部署分步 |
| 04 | [配置详解](./docs-site/docs/user/04-configuration.md) | 看懂每个字段怎么填（**最常用**） |
| 05 | [管理面使用教程](./docs-site/docs/user/05-user-guide.md) | 在网页里建池、建站点、配规则 |
| 06 | [缓存策略](./docs-site/docs/user/06-cache-strategy.md) | 想提高命中率、省额度 |
| 07 | [EO 回源 Host 配置](./docs-site/docs/user/07-eo-origin-host.md) | EdgeOne 平台侧「源站组 + 回源 Host」操作 |
| 08 | [常见问题 FAQ](./docs-site/docs/user/08-faq.md) | 排坑合集 |

**开发者篇（代码层 / 调试 / 扩展）**
| # | 文档 | 读完你会 |
|---|---|---|
| 09 | [本地开发与验证](./docs-site/docs/dev/09-local-development.md) | 本机跑代码、进管理面、调试 |
| 10 | [API 参考](./docs-site/docs/dev/10-api-reference.md) | 用 curl / 脚本批量管理配置 |
| 11 | [系统架构](./docs-site/docs/dev/11-architecture.md) | 代码分层、模块职责、平台能力降级、内存预算 |
| 12 | [请求处理流程](./docs-site/docs/dev/12-request-flow.md) | 一个请求从进到出的完整链路 |
| 13 | [Redis/Webdis KV 兜底](./docs-site/docs/dev/13-redis-kv.md) | 无原生 KV 平台（ESA）用 Webdis 持久化 |
| 14 | [部署到阿里云 ESA](./docs-site/docs/dev/14-deploy-esa.md) | ESA 控制台 / CLI / 流水线部署 |
| 15 | [ESA MCP Server](./docs-site/docs/dev/15-mcp-esa.md) | 在 AI IDE 里用自然语言管理 ESA |

**附录**：[状态码说明](./docs-site/docs/appendix/status-codes.md) · [隐藏配置字段](./docs-site/docs/appendix/hidden-fields.md) · [502 错误说明](./docs-site/docs/appendix/502.md)

> 文档站工程在 `docs-site/`（`mkdocs.yml` + `requirements.txt`），源码 Markdown 在 `docs-site/docs/`。
> 构建命令：`pip install -r docs-site/requirements.txt && mkdocs build -f docs-site/mkdocs.yml`。

---

## 目录结构（速览）

```
src/
├── entry.js              # 运行入口（组装 ctx：请求/平台能力/env/KV）
├── core/                 # 请求主流程：匹配站点 → 安全 → 规则 → 选源 → 回源 → 改写
├── proxy/                # 回源执行(engines/)、头改写、路径重写、缓存键
│   ├── engines/          # fetchEngine / socketEngine（socket 不支持时自动降级 fetch）
│   ├── cachekey.js       # 缓存键构造（回源 URL + host 维度 + 代次 + 自定义维度）
│   └── rewrite.js        # 路径重写 + 回源 Host 解析
├── balancer/             # 源站池调度策略(strategy) + 链式回退(failover) + 被动熔断(circuit)
├── config/               # 配置读写(KV: store) + schema 校验（唯一数据真相源）
├── security/             # 防盗链 / IP / UA / 限流(guard/ratelimit)
├── stats/                # 访问统计（collector 内存聚合 → KV / D1 双驱动）
├── api/                  # 管理面后端（/__panel/api/*）+ 静态页优先服务(adminPage)
│   ├── handlers/         # sites / pools / rules / stats / auth / config / cache / system
│   └── router.js         # 路由表
├── platform/             # 平台能力探测（caps: 缓存/D1/Socket/KV/EO Node 运行时）+ cache 封装 + Redis(Webdis) KV 兜底后端
├── ui.gen.js             # 自动生成的管理面 UI（构建期从 web/ 经 esbuild 安全转义的字符串导出，勿手改）
└── utils/                # 通用工具（reqid、ip、net、normalize…）
web/                      # 管理面前端（原生 JS 单页，构建时产出静态 + 内联兜底）
  ├── _app.entry.js        # 构建期自动生成：前端聚合入口（api.js + app.js，供 esbuild bundle）
  ├── _stage.entry.js      # 构建期自动生成：从 src/config/stages.js 导出阶段字典子集
  └─ _stage.gen.js         # 构建期生成（来自 src/config/stages.js 的单一来源，app.js import 用）
                          # （_stage.entry.js/_app.entry.js 由 scripts/gen-entries.mjs 生成，勿手改）
edge-functions/           # EO Makers Edge Function 目录
  └─ [[default]].js        # Catch-all 薄壳（加载 _worker.js，承载全部动态请求）
dist/public/              # 构建产出的管理面静态资源（HTML + assets），供 CF Workers(ASSETS)/Pages/EO 静态托管
scripts/gen-entries.mjs   # 构建期自动生成前端入口（web/_stage.entry.js + web/_app.entry.js，取代手写 gitignored 文件）
scripts/check.mjs         # 提交前/CI 静态一致性检查（平台口径 + 入口可解析），npm run check
scripts/dev.mjs           # 本地一键开发脚本
build.mjs                 # 健壮构建：自动生成入口 → 阶段字典单一来源 → 前端 bundle → 内联兜底 → 静态目录 → 打包 _worker.js → 专项语法校验 + 产物自检
```

> **构建健壮性设计**：`build.mjs` 已去除「base64 内联 HTML / 函数 replacement 防 `$` 展开 / 前端不压缩 / STAGE_OPS 文本切片一致性断言 / 正则猜 HTML 标签结构」等脆弱 hack。
>
> 改为：
>
> ⓪ 前端入口 `web/_stage.entry.js` / `web/_app.entry.js` 由 `scripts/gen-entries.mjs` 在构建期自动生成（从 `src/config/stages.js` 抽取阶段字典子集、聚合 `web/api.js+app.js`），**不再依赖手写 gitignored 入口文件**，`npm run build` 开箱即用、从根上消除「手写入口 → 非标准导出/误转义 → 语法错误」；
>
> ① 前端阶段字典由 `src/config/stages.js` 单一真相源经 esbuild 生成 `web/_stage.gen.js`，`web/app.js` 直接 import，消除「改一处漏一处」；
>
> ② CSS/JS 注入改用 `web/index.html` 的显式注释标记 `<!-- BUILD:STYLE -->` / `<!-- BUILD:SCRIPT -->` 做确定性替换（`build.mjs` 的 `injectInline` / `injectExternal`），**不再用正则去猜 `<link style.css>` / `<script src=api|app.js>` / `</body>` 位置**，并加「注入后产物断言」——HTML 结构调整导致缺资源时构建显式失败而非隐性回归；
>
> ③ 内联 UI 用 `JSON.stringify` 生成 `src/ui.gen.js` 的直接字符串 `UI_HTML` / `UI_CSS`（esbuild 打包时再次安全转义，无边界破裂风险），**已移除 base64 双份冗余**（不再导出 `UI_HTML_B64` / `UI_CSS_B64`，体积更小、消费方更简单）；
>
> ④ 前端 JS 走正常 esbuild bundle（可压缩），经副作用入口保活避免死代码消除；
>
> ⑤ 构建末尾用 esbuild `transform` 解析内联脚本 + 栈式校验 HTML 标签闭合与括号配对，失败即非零退出，持续拦截「构建成功但产物不可用」的回归；
>
> ⑥ `npm run check`（`scripts/check.mjs`）在提交前/CI 做静态一致性检查：`CLOUD_PLATFORM` 取值恒为规范值 `cf|eo|esa`（拦截回退到 `edgeone`/`cloudflare`/`aliyun-esa`/`pages` 等旧别名），并校验前端入口可解析、缺失自动重建；已接入全部 5 个 GitHub Actions workflow（`ci.yml` + 4 个 `deploy-*.yml`）的构建前步骤，前置拦截平台口径/入口损坏类回归。

---

## 快速上手（最短路径）

> 要求 **Node.js ≥ 22**（Wrangler v4 要求 Node ≥ 20.19，推荐 22）。完整分步教程见 [02 环境准备](./docs/02-prerequisites.md)。

```bash
# 方式 A：本地马上跑（零账号、不需要任何云平台）
npm install
npm run dev                 # 启动后打开 http://localhost:8799/__panel

# 方式 B：部署到生产（Cloudflare Workers）
npm install
npm run deploy:cf           # build + 生成临时 toml（保留远程绑定/变量）+ wrangler deploy
                           # 详见 docs/03-deploy.md（务必用 deploy:cf，裸 deploy 会清空远程绑定）
```

不想用命令行部署？CF 粘贴 / Pages、EdgeOne、以及流水线发版，全部操作步骤见
**[部署指南 docs/03-deploy.md](./docs/03-deploy.md)**。

> **输出目录务必填 `.`（仓库根），不要填 `dist/public`**：Pages 需要根目录的 `_worker.js`
> 承载数据面代理与 `/__panel/api/*`。只部署 `dist/public` 会得到一个「管理面能打开、
> 但代理和接口全部 404」的站点。静态资源省额度靠的是长缓存响应头 + Pages 的
> Fetch handler 缓存开关，与输出目录无关，详见 [FAQ](./docs/08-faq.md)。

**本质说明**：本项目是运行在边缘平台（CF Workers/Pages、EO Pages）上的一段处理代码，自身**无持久硬盘、内存极小**，不具备真实的本地缓存/存储。它的缓存、配置、统计全部依托底层平台能力：
- 配置/统计 → 绑定平台的 **KV**（CF）/ **EdgeOne KV** 托管存储；
- 缓存 → Cloudflare 用 `caches.default` API，EdgeOne 没有该 API，改由响应头 `CDN-Cache-Control` 让 EO 边缘按头缓存；
- **单运行时收口** → EdgeOne（新版 Makers）全部请求走 Edge Function（`edge-functions/[[default]].js` → `_worker.js`），不拆 Cloud Function（因 EO KV 仅在 Edge Functions 可用）；管理面 UI 静态资源由 Pages 静态托管，命中缓存后零函数执行次数。

**配置要点**：站点的「回源来源」二选一——**选已有源站组**（多站点复用）或**直接填写源站**（无需先建池），不再强制先建源站池。规则按 `priority` 从高到低匹配、命中即停。

详细步骤见上方「文档导航」，按 01 → 05 顺序阅读即可完成部署。
