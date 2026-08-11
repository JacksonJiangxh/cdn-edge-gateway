# 03 · 本地开发与验证

> 上一篇：[02 环境准备](./02-prerequisites.md) ｜ 下一篇：[04 配置详解](./04-configuration.md)

本篇结束后，你会在本机跑起完整服务，并**亲手验证回源成功**。
预计耗时 20 分钟。

---

## 步骤 1：启动本地开发服务

```bash
npm run dev
```

这条命令会自动做三件事：
1. 生成本地密钥文件 `.dev.vars`（已被 `.gitignore` 忽略，不会提交）
2. 构建 `_worker.js`（本地不压缩，便于调试）
3. 用 `wrangler.dev.toml` 启动本地边缘运行时，**端口 8799**

> `wrangler.dev.toml` 是**本地开发专用**配置，比线上多一个 `CDN_KV` 绑定，
> wrangler 会在 `.wrangler/` 下用内存模拟这个 KV，**不需要云账号**。
> 配置（站点、源站池）都存在 KV 里，没有它登录会直接报 500。
> 线上部署不读这个文件，走根目录的 `wrangler.toml`。

**预期结果**：

```
ℹ️  已生成默认 .dev.vars（本地口令 local-dev-pass）
🔨  构建 _worker.js ...
  ✓ 构建完成
⎔ Starting local server...
[wrangler:inf] Ready on http://0.0.0.0:8799
```

> 本地默认以 `CLOUD_PLATFORM=edgeone` 运行，模拟 EdgeOne 的能力降级，
> 保证「本地行为 = 线上行为」。加 `--cf` 可切换为 Cloudflare 模式。

常用参数：

| 参数 | 作用 |
|---|---|
| `npm run dev -- --port 8080` | 换端口 |
| `npm run dev -- --clean` | 清空本地 KV 数据重新开始 |
| `npm run dev -- --local` | 仅监听 `127.0.0.1` |
| `npm run dev -- --cf` | 模拟 Cloudflare 能力集 |

> **首次启动会慢一些**（要下载 workerd 运行时），等 20~30 秒属正常。
> 保持这个终端窗口开着，下面的验证都需要它在运行。

<details>
<summary>❌ 报错 <code>No such compatibility flag</code>，点这里</summary>

说明 `wrangler.toml` 里被加了平台不支持的 flag。确认 `compatibility_flags` 只有 `nodejs_compat`：

```toml
compatibility_flags = ["nodejs_compat"]
```

`cloudflare:sockets` 是运行时动态加载的，**不需要**额外 flag。
</details>

<details>
<summary>❌ 报错端口被占用，点这里</summary>

换个端口启动：

```bash
npm run dev -- --port 8080
```

后续验证把 `8799` 换成 `8080` 即可。
</details>

---

## 步骤 2：验证服务活着（健康检查）

**另开一个终端**（保持步骤 1 的终端不要关），执行：

```bash
curl http://localhost:8799/__health
```

**预期结果**：返回一段 JSON，`ok` 为 `true`，`hasKV` 也为 `true`：

```json
{"ok":true,"platform":"edgeone","caps":{"platform":"edgeone","hasEdgeCache":true,
"hasCacheApi":true,"eoEdgeCache":true,"hasSocket":false,"hasD1":false,
"hasKV":true,"hasR2":false},"time":"..."}
```

**怎么读这段输出：**

| 字段 | 本地预期值 | 含义 |
|---|---|---|
| `ok` | `true` | 服务正常 |
| `hasKV` | **`true`** | 配置存储可用。**若为 `false`，登录会 500** |
| `platform` | `edgeone` | 本地默认模拟 EdgeOne 能力集 |
| `hasSocket` | `false` | 本地无 TCP socket，**属正常**，自动降级用 fetch 回源 |
| `hasD1` / `hasR2` | `false` | 本地未绑定，不影响主流程 |

> 只需确认 `ok` 和 `hasKV` 都是 `true`。其余 `false` 都是本地环境的预期降级。

---

## 步骤 3：打开管理面

浏览器访问：

```
http://localhost:8799/__panel
```

**预期结果**：看到登录页，要求输入管理员密码。

> `__panel` 是默认管理路径。本地开发保持默认即可，
> **线上部署时务必改成随机串**（见 [04 配置详解](./04-configuration.md)）。

**首次登录**：密码是 `npm run dev` 自动写入 `.dev.vars` 的 **`local-dev-pass`**。

```
密码：local-dev-pass
```

**预期结果**：登录成功，进入管理面主界面。

> 这个密码只存在于本地的 `.dev.vars` 文件（已被 `.gitignore` 忽略，不会提交）。
> 线上部署时会用你自己设置的 `ADMIN_PASSWORD`，与此无关。

<details>
<summary>❌ 页面打开一片空白 / 样式全乱，点这里</summary>

多半是静态资源没构建出来。停掉服务重新构建：

```bash
rm -rf dist
npm run build
npm run dev
```

然后**强制刷新**浏览器（`Ctrl+Shift+R` / `Cmd+Shift+R`）清掉旧缓存。
</details>

---

## 步骤 4：配一个真实站点，跑通回源

这是最关键的一步——验证**代理转发**是否真的工作。

在管理面里依次操作：

1. 进入 **源站池** → 新建池
   - 名称：`test-pool`
   - 添加源站地址：`https://example.com`
   - 策略：保持默认（链式回退）
2. 进入 **站点** → 新建站点
   - 域名：`localhost`
   - 源站池：选刚建的 `test-pool`
3. 点击 **保存 / 发布**

**预期结果**：列表里出现该站点，状态为启用。

---

## 步骤 5：验证代理确实生效

回到终端执行：

```bash
curl -I http://localhost:8799/
```

**预期结果**：返回 `200`，并且能看到网关注入的响应头：

```
HTTP/1.1 200 OK
content-type: text/html; charset=UTF-8
x-cache-status: MISS
```

再执行**第二次**同样的命令：

```bash
curl -I http://localhost:8799/
```

**预期结果**：`x-cache-status` 变为 `HIT`，说明边缘缓存生效了。

| `x-cache-status` | 含义 |
|---|---|
| `MISS` | 没命中缓存，本次真的回源了 |
| `HIT` | 命中边缘缓存，没有回源 |
| `BYPASS` | 规则判定该请求不缓存 |

> 看到 `MISS` → `HIT` 的变化，说明**代理 + 缓存全链路都通了**。

---

## 步骤 6：修改代码后如何生效

`npm run dev` 支持热重载：改完 `src/` 或 `web/` 下的文件保存，wrangler 会自动重建并重启。

**注意**：不要手动编辑 `_worker.js`。它是 `build.mjs` 从 `src/` 生成的产物，
下次构建会被整个覆盖。**改逻辑一律改 `src/`。**

---

## 步骤 7：停止服务

在步骤 1 的终端按 `Ctrl + C`。

可选清理本地状态（会清空本地模拟的 KV 数据）：

```bash
rm -rf .wrangler
```

---

## 检查清单

- [ ] `npm run dev` 成功启动
- [ ] `/__health` 返回 `ok: true`
- [ ] 管理面能打开并登录
- [ ] `curl -I` 两次，`x-cache-status` 从 `MISS` 变 `HIT`

四项全过，说明本地环境完全正常，可以准备上线了。

---

## 下一步

- 想先搞懂每个配置字段 → **[04 配置详解](./04-configuration.md)**
- 想直接上线 → **[05 命令行部署](./05-deploy-cli.md)** 或 **[06 可视化部署](./06-deploy-dashboard.md)**
