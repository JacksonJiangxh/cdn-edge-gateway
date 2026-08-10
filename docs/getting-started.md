# 快速开始（Getting Started）

> 目标：5 分钟内把 **cdn-edge-gateway** 跑起来 —— 本地进管理面，或一键部署到边缘平台。
> 本文是「最短路径」；网页上怎么点见 [管理面使用教程](./user-guide.md)；细节见 [部署指南](./deployment.md) / [本地开发](./local-development.md) / [配置详解](./configuration.md)。

---

## 它是什么（一句话）

cdn-edge-gateway 是一个**跑在边缘节点上的 CDN 回源网关**：你访问加速域名，它在边缘决定「回哪个源站、怎么回」，把对象存储 / Git 静态资源 / 自建源站套上 CDN 加速。支持多域名、多源站池、负载均衡、链式回退，可部署到 Cloudflare Workers / Cloudflare Pages / EdgeOne Pages。

---

## 方式 A：本地马上跑（推荐先试，零账号）

不需要任何云平台账号，纯本地验证代码和管理面：

```bash
git clone <your-repo> && cd cdn-edge-gateway
npm install
npm run dev
```

启动后打开 **http://127.0.0.1:8799/__panel**，密码 `local-dev-pass`。

想清空本地配置重来：`npm run dev:clean`。
想切到 Cloudflare 能力集对照测试：`npm run dev:cf`。

> 进管理面后怎么配站点、怎么验证回源？看 [本地开发自测](./local-development.md)。

---

## 方式 B：部署到生产（3 选 1）

构建出 `_worker.js` + `dist/public/` 静态资源，再在平台控制台粘贴 / 连仓库即可：

```bash
npm install
npm run build                # 默认即压缩构建，体积小、冷启动快
# 本地调试需要可读产物时：node build.mjs --no-minify
```

构建产物说明：

| 产物 | 用途 | 部署位置 |
|---|---|---|
| `_worker.js` | 边缘函数主包（数据面代理 + 管理面 API + HTML 兜底） | CF Workers / EO `functions/` |
| `dist/public/` | 管理面静态资源（HTML + 压缩后的 JS/CSS） | EO Pages / CF Pages 静态托管目录 |
| `edge-functions/` | EO Makers Edge Function 目录（`[[default]].js` 薄壳引用 `_worker.js`） | EO 自动识别为 Edge 运行时 |

| 平台 | 怎么做 | 详细 |
|---|---|---|
| **EdgeOne Pages（Makers）** | 控制台导入 Git 仓库，构建命令 `npm run build`，输出 `.`；EO 自动识别 `edge-functions/`（Edge）、`dist/public/`（静态），绑 KV 变量名 `CDN_KV`，环境变量 `CLOUD_PLATFORM=edgeone` | [部署：EdgeOne](./deployment.md#方式三edgeone-pages) |
| **Cloudflare Workers** | 建 KV → 建 Worker 粘贴 `_worker.js` → 绑 `CDN_KV` → 绑域名 | [部署：CF Workers](./deployment.md#方式一cloudflare-workers) |
| **Cloudflare Pages** | 控制台连仓库，构建 `npm run build`，**输出目录填 `.`**（仓库根），绑 KV | [部署：CF Pages](./deployment.md#方式二cloudflare-pages) |

> 生产绑定（KV / D1 / 变量 / 域名）**全部在平台 Dashboard 可视化操作**，不需要 `wrangler.toml`、不需要命令行部署。
>
> **输出目录一律填 `.`（仓库根），不要填 `dist/public`**：Pages 需要根目录的 `_worker.js` 承载数据面代理与 `/{ADMIN_PATH}/api/*`（首次部署 KV 空时管理面路径用默认段 `__panel`），只部署 `dist/public` 会得到「管理面能打开、代理和接口全 404」的站点。
>
> **管理面静态化的省额度收益**：管理面 HTML/JS/CSS 以 `public, max-age=86400, immutable` 下发，CF Pages 需额外打开 **Settings → Functions → Cache** 开关，命中边缘缓存后**零 Function 执行次数**；EO Pages 自动托管 `dist/public`，管理面访问不占 Edge Function 300 万额度。省额度靠的是「长缓存响应头 + 缓存开关」，与输出目录无关。无静态托管环境（如 CF Workers 直接粘贴）时，`_worker.js` 内部自动回退为内联 HTML，功能完全一致。

---

## 第一次登录后要做什么

不管是本地还是线上，建站点的「默认回源来源」有两种填法，二选一：

- **直接填源站**（最省事）：建站点时选「直接填写源站」，当场填 `example.com`、协议 `https`，无需先建源站池。
- **选已有源站组**（多站点复用）：先进「源站池」建池（只需填「名称」，系统自动生成 `id`），再建站点选择它。

1. 进「站点」→ 新建，填加速域名（如 `img.example.com`），源站方式选「直接填写源站」并填 `example.com`；或多站点共用时先建池再引用。
2. 用加速域名访问，看是否回源成功（响应头带 `X-Cache` / `X-Origin-Addr` / `Server: EdgeGateway` 等调试头）。

> 网页上一步步怎么点？看 [管理面使用教程](./user-guide.md)。
> 字段怎么填、每种策略什么意思？看 [配置详解](./configuration.md)。
> 想用命令行批量验证？看 [本地开发自测](./local-development.md) 的 curl 流程。

---

## 下一步

- 想理解回源决策是怎么发生的？→ [架构与设计](./architecture.md)
- 想用 API 自动化管理？→ [管理面 API 参考](./api-reference.md)
- 遇到问题？→ [常见问题 FAQ](./faq.md)
