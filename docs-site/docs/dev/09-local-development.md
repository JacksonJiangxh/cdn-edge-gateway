# 09 · 本地开发

> [!NOTE]
> **本文面向**：开发者（在本地把网关跑起来、调试、改代码）。
> 普通用户部署见 [用户篇 · 部署指南](/user/03-deploy.md)。

---

## 一句话

`npm run dev` 起一个**本地边缘模拟**（基于 Miniflare/Wrangler），加载 `_worker.js`，
开一个管理面网页，你在浏览器里就能配站点、看请求，像线上一样调试，但**不花一分钱**。

---

## 步骤 1：装依赖 + 构建

```bash
npm install
npm run build        # 必须先 build，dev 跑的是 _worker.js 产物
```

> [!WARNING]
> 改了 `src/` 任何代码后**必须重跑 `npm run build`**，否则本地跑的还是旧产物。这是本地调试头号坑。

---

## 步骤 2：启动本地开发

```bash
npm run dev
```

`scripts/dev.mjs` 会：

1. 若没有 `.dev.vars`，自动生成（含 `CLOUD_PLATFORM=eo`、管理面密码等）；
2. 构建 `_worker.js`；
3. 用 Wrangler 起本地服务，默认端口 **8799**；
4. 默认 `CLOUD_PLATFORM=eo`（按 EdgeOne 能力降级，确保「本地 = 线上」）。

启动后访问：

- 管理面：`http://localhost:8799/__panel`
- 健康检查：`http://localhost:8799/__health`

默认管理员密码：**`local-dev-pass`**（首次登录后请在管理面改掉）。

> [!TIP]
> 想模拟 Cloudflare 能力集？`CLOUD_PLATFORM=cf npm run dev`。想上云用真实 CF，`--cf` 切换 wrangler 云端。

---

## 步骤 3：看平台能力探测

```bash
curl http://localhost:8799/__health
# → {"ok":true,"platform":"eo","caps":{"hasCacheApi":true,"hasKV":true,...}}
```

`caps` 就是你这段代码在当前平台能用的能力清单，排障时对照 [系统架构 · 平台降级](/dev/11-architecture.md)。

---

## 步骤 4：建第一个站点验证

在管理面「站点」里新建：

- 加速域名：`localhost`
- 源站池：新建一个，源站地址填 `http://127.0.0.1:8080`（你本地随便起个静态服务）
- 存 + 发布

然后用网关访问：

```bash
curl -x http://localhost:8799 http://localhost/
# 或浏览器设置本地代理到 8799，访问你的域名
```

能看到源站内容就说明链路通了。

---

## 调试技巧

| 想看 | 怎么做 |
|---|---|
| 请求追踪 | 响应头 `X-Egw-Req-Id`（每请求唯一） |
| 回源地址 | 响应头 `X-Origin-Addr` |
| 缓存命中 | 响应头 `X-Cache`（HIT/MISS/PASS） |
| 改代码后 | 重跑 `npm run build`（dev 自动重载 worker） |
| 一致性检查 | `npm run check`（CI 也会跑，查 CLOUD_PLATFORM 口径 + 前端入口） |
| 端到端测试 | `npm run test:e2e`（内存 KV mock 跑 health→panel→login→sites） |

---

## 常见坑

| 现象 | 原因 | 解法 |
|---|---|---|
| 管理面进不去 | 密码不是 `local-dev-pass` 或没 build | 确认 build 过、密码对 |
| 改代码没效果 | 没重跑 build | `npm run build` |
| 本地回源连不上 | 源站地址填错 | 确认源站本地可访问 |
| `CLOUD_PLATFORM` 报错 | dev 默认 eo，上云没设 | 上云设 `cf`/`eo`/`esa` |

---

## 下一步

→ [API 参考](/dev/10-api-reference.md)：管理面背后的所有接口与 curl 示例。
