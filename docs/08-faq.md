# 08 · 常见问题 FAQ

> **常见问题 FAQ**
>
> 上一篇：[07 EdgeOne 回源 Host 配置](./07-eo-origin-host.md) ｜ 下一篇：[09 本地开发与验证](./09-local-development.md)
>
> 返回 [项目首页](../README.md)

> 遇到坑先查这里。本地开发专属问题见 [09 本地开发](./09-local-development.md)。

---

## 启动与构建报错（新手最常撞的几个）

**Q：`npm run build` 报「产物缺失」怎么办？**
先确认 Node 版本 ≥ 22（`node -v`）。本项目构建脚本依赖 Wrangler v4（要求 Node ≥ 20.19，推荐 22），低于此版本会出各种怪问题。
仍失败就清空重来：

```bash
rm -rf dist node_modules && npm install && npm run build
```

**Q：`npm run dev` 报 `No such compatibility flag: sockets`？**
`wrangler.toml` 里被加了 workerd 不存在的 flag。正确写法只保留 `nodejs_compat`：

```toml
compatibility_flags = ["nodejs_compat"]
```

`cloudflare:sockets` 是运行时动态 `import` 的，**不需要**声明 flag；
平台不支持时会自动降级到 fetch 引擎（此时 `/__health` 里 `hasSocket:false`，属正常）。

**Q：`npm run dev` 报 `Address already in use`？**
上次的进程没退干净。杀掉后重启，或直接换端口：

```bash
pkill -f workerd; pkill -f wrangler
# 或
npm run dev -- --port 8080
```

**Q：本地登录管理面返回 500 / `INTERNAL` 错误？**
先看 `/__health` 里的 `hasKV`：

- `hasKV: false` → 没有 KV 绑定，配置无处存取，登录必然 500。
  本地请用 `npm run dev`（它会通过 `wrangler.dev.toml` 自动挂上模拟的 `CDN_KV`），
  **不要**直接裸跑 `npx wrangler dev`。
- `hasKV: true` 仍失败 → 检查 `.dev.vars` 里的 `ADMIN_PASSWORD` 与你输入的是否一致。

**Q：本地管理面密码是多少？**
`local-dev-pass`。由 `npm run dev` 首次运行时自动写入 `.dev.vars`
（该文件已被 `.gitignore` 忽略，不会提交）。忘了可以直接打开这个文件看。

**Q：改了 `ADMIN_PATH`，旧路径还能访问到管理面？**
`ADMIN_PATH`（运行时生效值 = **KV 中管理面保存的值 > 内置默认 `__panel`**，见 [04 §6](./04-configuration.md)）是**纯运行时**参数（构建期不读它），
所以这和「构建产物残留」无关——`dist/public/` 下压根不会出现以 admin 路径命名的目录，
管理面静态资源固定走 `assets/` 物理路径。

旧路径是否还能访问，取决于**运行时此刻还在不在意那个旧段**：
- 你是在管理面改了入口前缀并存进 KV → KV 优先级最高，旧段立即失效，无需重新部署。
- 你确实在 Dashboard 主动设了环境变量 `ADMIN_PATH`（不推荐，`store.js` 仅作兜底）→
  需重新部署后运行时才认新段，旧路径（`/{旧}/`、`/{旧}/assets/*`）走数据面
  （`tryServePanelStatic` 严格只服务已确认的管理面段），不再命中管理面。
- 浏览器端只是旧的 `localStorage`/书签还指向旧路径 → 重新进新路径即可，刷新一次 BASE。

一句话：推荐用法是「管理面改 + 存 KV」即生效，无需重新部署；无需、也无法靠「清构建产物」解决。

---

## 部署相关

**Q：部署一定要用 `wrangler.toml` 吗？**
不一定，但推荐用它管「能声明的绑定」。toml 与 Dashboard 可视化**不互斥**，而是按操作分工：静态资产、KV/R2/D1 绑定、非敏感变量写在 `wrangler.toml` 里由 `wrangler deploy` 一次性带上去；Secrets（密码/密钥）因平台禁止进文件只能单独注入（CLI `secret put` 或 Dashboard Secrets 类型）；域名、缓存开关等平台侧项更适合在 Dashboard 点。完整划分见「部署职责表」。纯不想碰命令行时也可以整条走可视化，把 toml 那几行换成 UI 点选即可。

**Q：三种部署方式（CF Workers / CF Pages / EO Pages）有什么区别？该选哪个？**
- 想要最简单 + 自定义域名方便 → **Cloudflare Workers**。
- 已有 / 想用 Git 仓库自动构建 → **Cloudflare Pages** 或 **EdgeOne Pages**。
- 业务在国内、要国内边缘节点 → **EdgeOne Pages**。
核心代码三处完全一致，只是入口薄壳不同（Workers 直接 `_worker.js`，Pages/EO 走 `edge-functions/[[default]].js`）。

**Q：管理面访问会不会吃掉 Edge Function 300 万次额度？**
会占用，但有克制手段：
- **管理 UI 静态化（最省）**：构建产物 `dist/public/` 由 CF Pages / EO Pages 静态托管，管理面 HTML/JS/CSS 命中边缘缓存后**零函数执行次数**（CF 命中缓存不计 Functions 次；EO 走「安全加速请求数」，站点套餐免费）。无静态托管环境（如 CF Workers 直接粘贴）时，`_worker.js` 自动回退内联 HTML，功能一致但每次管理面访问占 1 次函数。
- **EO 当前全收口 Edge Function（KV 约束使然）**：新版 Makers 不拆 Cloud Function 承载「依赖配置的请求」，因 EO KV 仅在 Edge Functions 可用——数据面代理与管理 API 都要读 KV，故全部走 `edge-functions/[[default]].js` → `_worker.js`，计入「Edge Functions 300 万/月」；Edge Function 有 200ms CPU 上限，但管理 API 单次调用远低于此，实际无碍。**不依赖 KV 的重活**（转码、AI、独立 MySQL/Blob）预留给 `cloud-functions/`（云端 Node），详见该目录 README。
- **CF 上管理流量低频**：默认保持一体（不分体），因管理操作日均次数极少，对 300 万额度影响可忽略；如需隔离可手动拆分两个 Worker。

**Q：为什么 EdgeOne 上管理 API 有时在 Node 运行时、有时在 Edge 运行时？**
这是旧版 EdgeOne Pages（旧目录 `functions/`+`node-functions/`、`routes` 分流）的行为。本项目已迁移到新版 Makers：全部请求经 `edge-functions/[[default]].js` → `_worker.js` 单入口，`platform` 识别为 `edgeone`，KV 键编码与 `configCacheTtl` 下限等 EO 专属逻辑照常生效，无需 `routes` 分流配置。

**Q：我点的是「部署 CF Workers」按钮，系统设置却显示「运行平台 pages」、TCP Socket 不可用？**
这是**平台探测误判**，不是你部署错了路——你确实是 Workers 部署，socket 能力本应可用。
原因：CF Workers 的【Static Assets】配置（`wrangler.toml` 里的 `assets = { binding = "ASSETS" }`）会给运行时注入 `env.ASSETS` 绑定；旧版探测逻辑把「存在 `ASSETS` 绑定」当成了 Pages 的标志，于是把开了静态资产层的真·Workers 误判成 `pages`，进而 `detectSocket()` 返回 `false`，丢掉 TCP 回源。
修复：已改为「仅凭 `CF_PAGES` / `CF_PAGES_BRANCH` / `CONTEXT` 这类 Pages 专属构建变量区分 Workers 与 Pages，`ASSETS` 绑定不再作为判定依据」（见 `src/platform/caps.js`）。**重新部署一次最新代码**即可恢复正常：系统设置应显示「运行平台 workers」、TCP Socket 可用。
临时绕开（不想等重部署）：去管理面把源站 `engine` 从 `socket` 改成 `fetch` 也能用，但裸 IP / 非标端口 / 自定义 Host 回源场景会受限，建议直接升级代码。

**Q：CF Pages 部署时「输出目录」填什么？**
填 `.`（仓库根）。**不要填 `dist/public`**：该目录只有管理面的 HTML/JS/CSS，不含根目录的 `_worker.js`，填了会得到一个「管理面能打开、但数据面代理和 `/{ADMIN_PATH}/api/*` 全部 404」的站点（首次部署 KV 空时管理面路径用默认段 `__panel`）。

那静态资源还能省额度吗？能，且无需改输出目录。填 `.` 时 Pages 会把仓库根作为静态资源根一并上传（含 `dist/public/`），同时识别 `_worker.js` + `edge-functions/[[default]].js` 承载动态请求。管理面静态资源由 `_worker.js` 内的 `tryServePanelStatic` 以 `public, max-age=86400, immutable` 下发，**配合下方「开启 Fetch handler 缓存」开关后由边缘缓存直接返回，命中后不再进 Function**。省额度靠的是「长缓存响应头 + Pages Functions Cache 开关」，不是靠把输出目录改成 `dist/public`。

**Q：EdgeOne 上缓存是怎么工作的 / 统计没数据？**
EO 没有 `caches.default` API，但**边缘缓存能力真实存在且已启用**（`hasEdgeCache=true`）——只是走两条 EO 专属路径而非 CF 的 Cache API：
- **路径 B（响应头委托）**：网关在响应上下发 `CDN-Cache-Control`，**由 EO 边缘按响应头缓存**（TTL 由策略 `edgeTtl` 决定）。这是所有 EO 请求都享受的缓存。
- **路径 A（同站 fetch 委托节点缓存）**：对「无自定义回源 Host 的可缓存请求」，边缘函数内 `fetch(同站加速域名)`（HOST 与 host 头一致）会走 EO 节点缓存——**命中后零函数调用**，真正省额度；未命中则由 EO 按平台「源站组 + 回源 Host 重写」回源（详见 `docs/07-eo-origin-host.md`，需预先在 EO 控制台配好源站组）。有自定义回源 Host 的请求因无法用同站 fetch 表达，仍走项目多源站逻辑回源 + 路径 B 响应头缓存。

区别：EO 下无法像 CF 那样「主动按键清除」（`cacheGen` 整站清除只作用于 `caches.default`），EO 缓存只能等 TTL 自然过期或用 `Cache-Tag` + 平台 purge。统计方面：EO 无 D1，统计回退 KV。确认 `CLOUD_PLATFORM=edgeone` 已设，管理面「系统信息」页 `hasEdgeCache` 应为 true、`hasCacheApi`（caches API）应为 false、`eoEdgeCache` 应为 true、`hasD1` 应为 false。

**Q：响应头出现 `Server: EdgeGateway` / `Via: 1.1 EdgeGateway`，是我配错了吗？**
不是，这是本项目的**品牌响应头**。本项目是独立 CDN 厂商，不会冒充上游平台。若想隐藏网关特征，可在「系统 → 全局配置」开启 `disguise`（把 Server 伪装成 nginx）。回传给源站的客户端 IP 头默认是 `X-EdgeGateway-Client-IP`（可在规则动作里改名字或关闭）。

**Q：D1 表需要手动建吗？**
不需要。首次落盘时应用会自动执行幂等建表。若想显式初始化，参考 `src/stats/d1Driver.js` 的 `CREATE TABLE`，用 `npx wrangler d1 execute <DB> --remote -e "CREATE TABLE ..."` 执行（wrangler v4 起 `d1`/`kv`/`r2` 等命令默认操作**本地**模拟库，操作线上库须加 `--remote`）。

---

## 配置相关

**Q：保存站点报错「必须指定默认源站池 poolId」？**
新版本已不强制先建源站池。站点只需「源站组 poolId」与「内联源站 origins」二选一：
- 若选「选择已有源站组」，请确保 `poolId` 指向一个已存在的源站组 id；
- 若选「直接填写源站」，留空 `poolId` 并在 `origins` 里填至少一个源站即可。
两者都为空才会报该错。

**Q：源站地址填了完整 URL 报错？**
`origins[].addr` 只填 host（如 `oss.com`），路径用 `pathPrefix` 字段。填 `https://oss.com/path` 会报「源站地址不应包含路径」。

**Q：规则怎么写「匹配条件」？**
新版支持两种方式：① 快捷条件（路径前缀 / 正则 / 扩展名 / 方法）；② 可视化多条件 `match.conditions`（二维数组，外层 OR、内层 AND，可匹配 host/path/query/header/cookie/method/clientIp/clientCountry/referer/userAgent/protocol 等；旧名 `asn`/`country`/`scheme` 已废弃，对应的现行维度为 `clientCountry`/`clientIp`/`protocol`）。不填条件 = 匹配全部。详见 [配置详解 §2.2](./04-configuration.md#22-match匹配条件)。

**Q：多条规则谁先生效？**
按 `priority` **降序**匹配，命中即停。在数字大的规则优先；也可以在「流量序列」里直接**拖拽**规则节点排序，松手自动保存。

**Q：链式回退怎么配？**
源站池 `policy=chain`，`origins` 按顺序排（主源在前、备源在后）。源站返回 `retryOn` 状态码（如 502/503）或网络异常时自动切下一个。

**Q：签名 URL 怎么用？**
⚠️ 实验特性（待开发）：站点「安全防护」里开启 `signedUrl`，填 `secret` 与有效期 `ttl`，参数名默认 `sign`。访客须带合法签名才能访问。校验侧已生效，但**内置签发工具尚未提供**，需自行用 HMAC-SHA256 生成带签 URL（后续版本会内置签发器）。

**Q：配置能迁移到另一套环境吗？**
能。管理面「系统 → 配置备份」一键导出 JSON，到新环境导入即可。导出是下载到本地，不外传。

---

## 本地开发相关

**Q：本地 `npm run dev` 起不来 / 一直要 CF 账号？**
默认 `wrangler dev` 是本地模式，不连 Cloudflare、不需要 token。若报错要 `CLOUDFLARE_API_TOKEN`，通常是误带了 `-r/--remote`。清掉即可。详见 [09 本地开发](./09-local-development.md)。

**Q：本地忘了 `.dev.vars` 里的管理密码怎么办？**
默认是 `local-dev-pass`。若改过又忘了：编辑 `.dev.vars` 把 `ADMIN_PASSWORD` 改回已知值，再 `npm run dev:clean` 清空本地 KV 后重启，首次登录会用新密码重置。

**Q：本地测出来的结果能代表 EdgeOne 线上吗？**
基本能，前提是本地 `.dev.vars` 设了 `CLOUD_PLATFORM=edgeone`（默认已设）。唯一本地测不了的是 EO 真机全球边缘网络表现，那只能上线后看。

**Q：本地 KV 配置和线上混了吗？**
不会。本地 KV 是 Miniflare 在 `.wrangler/state` 的模拟存储，与线上 Dashboard 的 KV 完全隔离。删 `.wrangler` 即清空。

---

## 安全 / 隐私

**Q：项目会收集我的数据或上报日志吗？**
不会。所有日志仅 `console.*` 输出，只在 dev 终端可见；不接 Analytics Engine / logpush，不向任何外部 endpoint 回传。统计只落你自己的 KV/D1。

**Q：管理面要不要做防护？**
建议：① `ADMIN_PATH` 用随机串；② `ADMIN_PASSWORD` 强密码；③ 必要时加 IP 白名单 / 签名 URL。详见 [配置详解 §3](./04-configuration.md#3-安全security)。

---

## 性能

**Q：冷启动慢？**
`npm run build` 默认即压缩产物，体积小、冷启动更快。若仍偏大，检查是否误用了 `--no-minify` 构建。

**Q：为什么有的请求没走缓存？**
CF 上检查规则的 `cache.enabled` 是否为 true、`edgeTtl` 是否 > 0，以及响应是否带 `Cache-Control: private/no-store` 等不可缓存头。EO 上缓存始终启用（响应头委托 + 同站 fetch 节点缓存）：若仍 MISS，常见原因——① 规则 `cache.enabled` 未开或 `edgeTtl=0`；② 响应带 `private/no-store` 或 `Set-Cookie`；③ 自定义回源 Host 的请求走路径 B（函数内回源）而非路径 A（零函数节点缓存），仍可经响应头被边缘缓存，但每次进一次函数。
