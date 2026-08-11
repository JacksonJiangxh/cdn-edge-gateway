# 06 · 可视化部署（不用命令行）

> 上一篇：[04 配置详解](./04-configuration.md) ｜ 想用命令行？改走 [05 命令行部署](./05-deploy-cli.md)

本篇**全程在网页控制台点击完成**，不需要安装 wrangler、不需要敲部署命令。
预计耗时 25 分钟。

> **05 和 06 二选一，不要同时做。**

---

## 先选一条路

| 路线 | 适合 | 跳转 |
|---|---|---|
| **A. Cloudflare Pages** | 想用 Git 推送自动构建，最省心 | [→ 路线 A](#路线-acloudflare-pages推荐) |
| **B. Cloudflare Workers（粘贴代码）** | 不想连 Git，手动贴一次代码 | [→ 路线 B](#路线-bcloudflare-workers粘贴代码) |
| **C. EdgeOne Pages** | 业务在国内，需要国内节点 | [→ 路线 C](#路线-cedgeone-pages国内节点) |

**选不出来就用路线 A。**

---

## 路线 A：Cloudflare Pages（推荐）

### A1. 推送代码到 Git 仓库

先在本地构建一次并提交产物（避免远端构建环境差异）：

```bash
npm run build
git add -A && git commit -m "build" && git push
```

> 只有这一步碰命令行，因为要提交代码。如果你的仓库已经是最新的，跳过。

### A2. 创建 Pages 项目

Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**：

1. 选择你的仓库
2. 构建命令：`npm run build`
3. **输出目录：`.`**（一个英文句点）

> ⚠️ **输出目录必须是 `.`（仓库根目录），不是 `dist/public`。**
> 填 `dist/public` 会得到「静态页面能打开、但所有 API 全部 404」的坏站点，
> 因为动态请求要靠根目录的 `_worker.js` 和 `edge-functions/` 承载。

点 **Save and Deploy**。

**预期结果**：构建日志跑完，出现 `Success`，并给出一个 `*.pages.dev` 地址。

### A3. 绑定 KV（必做）

项目页 → **Settings → Functions** → **KV namespace bindings** → **Add binding**：

- Variable name：**必须填 `CDN_KV`**
- KV namespace：点 **Create** 新建一个

**预期结果**：列表出现 `CDN_KV`。

### A4. 设置环境变量

项目页 → **Settings → Environment variables** → **Add variables**：

| 变量名 | 类型 | 值 |
|---|---|---|
| `ADMIN_PASSWORD` | **Secret**（加密） | 你的强密码 |
| `JWT_SECRET` | **Secret**（加密） | 一段 64 位随机十六进制串 |
| `ADMIN_PATH` | Variable（明文） | 随机串，如 `p-8f3k9x2q`（**第一层防护，必须改，不能留默认 `__panel`**） |
| `CLOUD_PLATFORM` | Variable（明文） | `pages` |

> **`ADMIN_PATH` 是纯运行时变量，构建期不读它**（见 [04 §6](./04-configuration.md)）。
> 这里设好后平台自动 build 即可，管理面资源走固定的 `/assets/` 路径，与 adminPath 解耦，无需在仓库变量里额外设构建期值。重新部署生效。

> **`JWT_SECRET` 怎么生成**（不想用命令行的话）：
> 在浏览器按 `F12` 打开控制台，粘贴执行：
> ```js
> crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,'')
> ```
> 把输出的长字符串复制过来即可。

> 密码类**一定要选 Secret 类型**（加密存储），不要选 Variable。

### A5. 开启缓存开关（重要，省额度）

项目页 → **Settings → Functions** → 找到 **Cache** → 设为 **Enabled**。

> Pages Functions 默认不缓存响应。不开这个开关，每个请求都进函数、消耗额度。

### A6. 重新部署使配置生效

**Deployments** → 最新一条右侧 **⋯** → **Retry deployment**。

> 环境变量和绑定**只对新部署生效**，必须重跑一次。

**预期结果**：新部署 Success。

### A7. 验证

浏览器访问：

```
https://<你的项目>.pages.dev/__health
```

**预期结果**：页面显示 JSON，`"ok":true` 且 `"hasKV":true`。

再访问 `https://<你的项目>.pages.dev/<你设的 ADMIN_PATH>`，
**预期结果**：出现登录页，用 `ADMIN_PASSWORD` 登录成功。

### A8. 绑定自定义域名

项目页 → **Custom domains** → **Set up a domain** → 输入你的加速域名 → 按提示确认。

**预期结果**：状态变为 Active（约 1 分钟）。

→ 跳到 [部署完成检查清单](#部署完成检查清单)

---

## 路线 B：Cloudflare Workers（粘贴代码）

适合不想连 Git 的场景：把构建好的 `_worker.js` 全文粘贴到网页编辑器。

### B1. 拿到 `_worker.js` 内容

用文本编辑器打开项目根目录的 `_worker.js`，全选复制。

> 如果文件不存在或你改过源码，先跑一次 `npm run build` 生成。

### B2. 创建 Worker 并粘贴

Dashboard → **Workers & Pages** → **Create** → **Create Worker** → 起名 → **Deploy**。
然后点 **Edit code**，把编辑器里的默认内容**全部删掉**，粘贴 `_worker.js` 全文 → **Deploy**。

**预期结果**：右侧预览返回响应，不报语法错误。

> 粘贴方式不会上传 `dist/public/` 静态资源，管理面会自动回退到内置的内联资源，
> 功能完全一致，只是每次访问管理面多走一次函数调用（管理面访问频率低，几乎无感）。

### B3. 粘贴后必做配置（逐项确认）

Worker → **Settings → Variables**：

| # | 设置项 | 值 | 类型 |
|---|---|---|---|
| 1 | KV namespace bindings | 变量名 `CDN_KV`，新建命名空间 | 绑定 |
| 2 | `ADMIN_PASSWORD` | 你的强密码 | **Secret** |
| 3 | `JWT_SECRET` | 64 位随机串（生成方法见 A4） | **Secret** |
| 4 | `ADMIN_PATH` | 随机串（**第一层防护，必须改，不能留默认 `__panel`**） | Variable |
| 5 | `CLOUD_PLATFORM` | `cloudflare` | Variable |

> **第一层防护不能丢**：`ADMIN_PATH` 是纯运行时变量（构建期不读它）。粘贴方式的管理面走内置内联资源兜底（不依赖 `dist/public`），所以这里设 `ADMIN_PATH` 只影响运行时路由匹配，设完重新部署即生效。
> 运行时优先级：**此处环境变量 > `wrangler.toml [vars] ADMIN_PATH` 默认值 > 代码内置 `__panel`**。两者填同一个随机串当然最稳妥，但不再要求「构建期与运行时必须一致」——改入口前缀无需重新构建。`CLOUD_PLATFORM` 显式设 `cloudflare` 避免被误判为其他平台导致降级逻辑偏差。

再到 **Settings → Cache** → **"Cache responses from fetch handlers"** → **Enabled**。

最后 **Settings → Domains & Routes** → **Add Custom Domain** 绑定加速域名。

### B4. 验证

访问 `https://<你的worker>.workers.dev/__health`。

**预期结果**：`"ok":true`、`"hasKV":true`。

→ 跳到 [部署完成检查清单](#部署完成检查清单)

---

## 路线 C：EdgeOne Pages（国内节点）

### C1. 推送代码

同 A1，先本地 `npm run build` 并提交推送。

### C2. 创建项目

EdgeOne Pages 控制台 → **新建项目** → **导入 Git 仓库**：

- 构建命令：`npm run build`
- **输出目录：`.`**（同样是一个句点，理由见 A2 的警告）

### C3. 设置环境变量

项目设置 → **环境变量**：

| 变量名 | 类型 | 值 |
|---|---|---|
| `ADMIN_PASSWORD` | 密钥 | 你的强密码 |
| `JWT_SECRET` | 密钥 | 64 位随机串 |
| `ADMIN_PATH` | 变量 | 随机串 |
| `CLOUD_PLATFORM` | 变量 | **`edgeone`**（必填，驱动平台降级逻辑） |

### C4. 创建并绑定 KV

EdgeOne 控制台 → **存储** → **KV 存储** → 创建命名空间（名称任意）。

> 部分账号需要审核，等通过后再继续。

项目设置 → **存储绑定** → 添加 KV 绑定：

- **变量名必须填 `CDN_KV`**
- 选择刚创建的命名空间

> EdgeOne 的 KV **只在 Edge Functions 里可用**，本项目已全部收口在 Edge Function，
> 所以**只需绑定这一次**。

### C5. 部署并验证

推送代码或在控制台手动触发部署。

**预期结果**：构建成功，站点可访问。

访问 `https://<你的域名>/__health`。
**预期结果**：`"ok":true`、`"hasKV":true`。

登录管理面 → **系统信息** 页，
**预期结果**：持久化后端显示 `kv`。若显示降级，说明绑定变量名或 `CLOUD_PLATFORM` 填错了。

> **EdgeOne 已知差异（不是 bug）**：
> - 配置变更后全球生效约需 **1–2 分钟**（KV 最终一致 + 内存缓存），属预期行为
> - 无 D1，统计自动回落到 KV 驱动
> - 无 TCP socket，不支持裸 IP 回源，请使用域名源站
> - 若需要「节点缓存」路径生效，还需在 EO 控制台配好源站组和回源 Host，
>   见 [13 EdgeOne 回源 Host 配置](./13-eo-origin-host.md)

---

## 部署完成检查清单

- [ ] `/__health` 返回 `ok: true` 且 `hasKV: true`
- [ ] 管理面能登录
- [ ] `ADMIN_PATH` 已改为随机串（不是默认 `__panel`）
- [ ] 密码类变量用的是 **Secret / 密钥**类型，不是明文 Variable
- [ ] 缓存开关已开启（CF Pages / Workers）
- [ ] EdgeOne 额外确认 `CLOUD_PLATFORM=edgeone`
- [ ] 自定义域名可访问

---

## 下一步

- 学会在管理面配站点和规则 → **[07 管理面使用教程](./07-user-guide.md)**
- 想让缓存更省额度 → **[08 缓存策略](./08-cache-strategy.md)**
- 遇到问题 → **[09 FAQ](./09-faq.md)**
