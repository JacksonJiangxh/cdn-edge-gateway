# 05 · 命令行部署（Wrangler）

> 上一篇：[04 配置详解](./04-configuration.md) ｜ 不想用命令行？改走 [06 可视化部署](./06-deploy-dashboard.md)

本篇用 `wrangler` 命令把服务部署到 **Cloudflare Workers**。
预计耗时 20 分钟。

> **05 和 06 二选一，不要同时做。** 同一个操作两边都做会导致状态漂移、难以排查。

---

## 开始之前

确认 [02 环境准备](./02-prerequisites.md) 已完成：

```bash
node -v && npx wrangler --version
```

**预期结果**：分别输出 `v20+` 和 `⛅️ wrangler 3.x.x`。

---

## 分工原则（先看懂，能少走弯路）

本项目**不追求「纯命令行」**。有些东西命令行做反而麻烦，交给控制台点一下更省事：

| 做什么 | 谁来做 | 为什么 |
|---|---|---|
| 上传代码 + 静态资源 | **命令行** | 跟代码走，可版本化、可复现 |
| 设置管理面路径 `ADMIN_PATH`（纯运行时变量） | **命令行或控制台**（任选，做一次） | 只影响运行时路由匹配，构建期不读它，改了无需重新 build |
| 创建并绑定 KV / R2 / D1 | **控制台** | UI 里选一下就绑好，**不用记 namespace id** |
| 注入密码等 Secrets | **命令行或控制台**（任选，做一次） | 平台硬约束：密钥永远不能写进配置文件 |
| 绑定域名、开缓存开关 | **控制台** | 没有对应配置字段，只能在 UI 点 |

> 记住一句话：**同一个操作只做一次、只在一个地方做。**

---

## 步骤 1：登录 Cloudflare

```bash
npx wrangler login
```

**预期结果**：浏览器自动打开授权页，点 **Allow**，终端出现：

```
Successfully logged in.
```

验证登录身份：

```bash
npx wrangler whoami
```

**预期结果**：显示你的账号邮箱和 Account ID。

---

## 步骤 2：创建 Worker 并绑定 KV（控制台，一次性）

**KV 是必做项**，配置全存在这里，不绑服务起不来。

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages**
2. 点 **Create** → **Create Worker** → 起个名（如 `edge-cdn`）→ **Deploy**
   （先部署一个空壳，下一步会被你的代码覆盖）
3. 进入该 Worker → **Settings → Variables**
4. 找到 **KV namespace bindings** → **Add binding**
   - Variable name：**必须填 `CDN_KV`**（代码按这个名字找配置存储）
   - KV namespace：点 **Create new** 新建一个（名字随意）
5. **Save**

**预期结果**：绑定列表里出现一行 `CDN_KV`。

<details>
<summary>可选：需要 R2 直连回源 / D1 统计时</summary>

同一页面继续加：

| 绑定类型 | Variable name | 何时需要 |
|---|---|---|
| R2 bucket bindings | `CDN_R2` | 源站 `engine` 设为 `r2` 时 |
| D1 database bindings | `CDN_DB` | `statsDriver` 设为 `d1` 时 |

> 别搞混：**桶名**（如 `cdn-assets`，R2 里的真实桶）≠ **绑定变量名**（`CDN_R2`，代码里引用的名字）。
> 源站配置里填的是**绑定变量名**。桶无需开 Public Access。
</details>

---

## 步骤 3：注入 Secrets（密钥）

密钥**不能**写进 `wrangler.toml`（会被提交到 Git）。用专门的命令注入：

```bash
npx wrangler secret put ADMIN_PASSWORD
```

**预期结果**：提示你输入值（输入时不显示字符），回车后出现：

```
✨ Success! Uploaded secret ADMIN_PASSWORD
```

再注入 JWT 签名密钥。先生成一个随机值：

```bash
openssl rand -hex 32
```

复制输出，然后：

```bash
npx wrangler secret put JWT_SECRET
```

把刚才的随机串粘贴进去。

**必须注入的两个：**

| 名称 | 值 | 说明 |
|---|---|---|
| `ADMIN_PASSWORD` | 你自己设的强密码 | 管理面登录密码 |
| `JWT_SECRET` | `openssl rand -hex 32` 的输出 | 登录态签名，**不要用简单字符串** |

验证：

```bash
npx wrangler secret list
```

**预期结果**：列出上面两个名称（只显示名字，不显示值，正常）。

---

## 步骤 4：设置管理面路径

编辑 `wrangler.toml`，把 `ADMIN_PATH` 改成一个**随机串**（这是第一层防护，别用默认值上线）：

```toml
[vars]
ADMIN_PATH = "p-8f3k9x2q"
```

> `ADMIN_PATH` 是**纯运行时变量**，构建期不读它，改了直接 `wrangler deploy` 即生效，无需重新 `npm run build`（详见 [04 §6](./04-configuration.md)）。若你希望密码也走 Secret，改用 `npx wrangler secret put ADMIN_PATH` 亦可。

---

## 步骤 5：构建并部署

```bash
npm run build && npx wrangler deploy
```

**预期结果**：构建通过后出现上传信息和线上地址：

```
✓ 构建完成
Total Upload: xx KiB / gzip: xx KiB
Uploaded edge-cdn (x.xx sec)
Published edge-cdn (x.xx sec)
  https://edge-cdn.<你的子域>.workers.dev
```

把最后那个 URL 记下来，下一步要用。

<details>
<summary>❌ 报错 <code>No such compatibility flag</code></summary>

检查 `wrangler.toml`，`compatibility_flags` 只应有 `nodejs_compat`：

```toml
compatibility_flags = ["nodejs_compat"]
```
</details>

<details>
<summary>❌ 报错 KV namespace 缺少 id</summary>

说明 toml 里的 KV 段没注释掉。存储绑定已在步骤 2 由控制台完成，
toml 里对应段落应保持注释状态，避免占位符 ID 导致部署失败。
</details>

---

## 步骤 6：验证部署成功

```bash
curl https://edge-cdn.<你的子域>.workers.dev/__health
```

**预期结果**：

```json
{"ok":true,"platform":"cloudflare","hasKV":true,...}
```

**重点确认 `hasKV` 为 `true`**。若为 `false`，说明步骤 2 的绑定变量名写错了
（必须是 `CDN_KV`，区分大小写）。

再访问管理面：

```
https://edge-cdn.<你的子域>.workers.dev/<你设的 ADMIN_PATH>
```

**预期结果**：出现登录页，用步骤 3 设的 `ADMIN_PASSWORD` 登录成功。

---

## 步骤 7：开启缓存开关（重要，省额度）

**CF Workers 默认不缓存函数返回的响应**，不开这个开关，每个请求都会进函数、白白消耗额度。

控制台 → 你的 Worker → **Settings → Cache** →
**"Cache responses from fetch handlers"** 设为 **Enabled**。

**预期结果**：开关变绿。此后可缓存内容命中边缘后**零函数调用**。

---

## 步骤 8：绑定自定义域名

控制台 → Worker → **Settings → Domains & Routes** → **Add Custom Domain**，
填入你的加速域名（如 `cdn.example.com`）。

**预期结果**：CF 自动添加 DNS 记录并开启代理（橙色云），状态变为 Active（约 1 分钟）。

验证：

```bash
curl -I https://cdn.example.com/
```

**预期结果**：返回 `200`，响应头含 `server: EdgeGateway`。

---

## 步骤 9：配置站点，正式启用

登录管理面，按 [03 本地开发](./03-local-development.md) 步骤 4 的方式：
建源站池 → 建站点（域名填你的真实加速域名）→ 保存。

验证缓存是否生效，连续执行两次：

```bash
curl -I https://cdn.example.com/static/logo.png
```

**预期结果**：第一次 `x-cache-status: MISS`，第二次变为 `HIT`。

---

## 部署完成检查清单

- [ ] `/__health` 返回 `ok: true` 且 `hasKV: true`
- [ ] 管理面能用 `ADMIN_PASSWORD` 登录
- [ ] `ADMIN_PATH` 已改为随机串（不是默认 `__panel`）
- [ ] Settings → Cache 开关已 Enabled
- [ ] 自定义域名可访问
- [ ] 连续两次请求，`x-cache-status` 从 `MISS` 变 `HIT`

---

## 以后如何更新

改完代码只需重复一条命令：

```bash
npm run build && npx wrangler deploy
```

这**只更新代码和静态资源**，不影响已绑定的存储、域名、Secrets。

---

## 下一步

- 学会在管理面配规则 → **[07 管理面使用教程](./07-user-guide.md)**
- 想让缓存更省额度 → **[08 缓存策略](./08-cache-strategy.md)**
- 遇到问题 → **[09 FAQ](./09-faq.md)**
