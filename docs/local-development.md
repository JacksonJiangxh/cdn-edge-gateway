# 本地开发 / 自测手册（不依赖任何厂商平台）

> 本手册专门讲**如何在本机脱离 Cloudflare / EdgeOne 控制台**验证代码可用性、抓 bug、进管理面配站点。
> 生产部署请看 [部署指南](./deployment.md)。两处配置逻辑完全一致（站点可「直接填源站」或「选已有源站组」，二选一）。

---

## 0. 一句话结论

**完全可以零厂商账号自测。** 本地用 `wrangler` 的 Miniflare 模拟运行时 + 模拟 KV，跑的是同一份 `src/` 代码，只是「平台能力」降级成 EdgeOne 模式。

---

## 1. 前置条件

- **Node 20+**（已验证 Node 22 / Node 24 OK；wrangler v4 与 esbuild 0.28 最低要求 Node 20）
- 仓库已含：`wrangler.toml`(本地 KV 模拟绑定)、`.dev.vars`(本地 secrets)、`.gitignore`(已忽略 secrets 与 `node_modules/`)
- `node_modules/` **已移出版本库**（不再随仓库提交），首次克隆后需先 `npm install` 或 `npm ci` 安装依赖
- 一条命令装依赖：`npm install`

---

## 2. 一键启动

```bash
npm install
npm run dev          # = build + 本地 dev（模拟 EdgeOne 能力集）
```

启动成功后终端应出现：
```
🚀  启动本地 dev（端口 8799，平台能力集=edgeone）
    管理面: http://127.0.0.1:8799/__panel
...
- KV Namespaces:
  - CDN_KV: local-dev-placeholder-not-real [simulated locally]
```

然后浏览器打开 **http://127.0.0.1:8799/__panel**，密码 `local-dev-pass`。

### 脚本支持的参数（`scripts/dev.mjs`）

| 命令 | 作用 |
|---|---|
| `npm run dev` | build + 启动（默认 edgeone） |
| `npm run dev:clean` | 先清空本地 KV 再启动（忘记密码/配置脏了时用） |
| `npm run dev:cf` | 以 Cloudflare 能力集启动（有缓存/D1 模拟，对照测试用） |
| `npm run dev:nobuild` | 跳过 build，直接起（已 build 过想快点重启） |
| `node scripts/dev.mjs --port 8788` | 自定义端口 |
| 组合：`node scripts/dev.mjs --clean --port 8788 --cf` | 任意组合 |

> `npm run dev` 等价于旧版 `npm run build && wrangler dev`，多了清缓存 / 换端口 / 切平台能力。

---

## 3. 文件准备清单（已为你备好，一般不用动）

| 文件 | 现状 | 说明 |
|---|---|---|
| `node_modules/` | 需 `npm install` / `npm ci` | wrangler / esbuild（已从版本库移除，不随 clone 下来） |
| `_worker.js` | 需 `npm run build` | dev 加载的产物，**改源码后必重 build** |
| `wrangler.toml` | ✅ 已配本地 KV 模拟 | 不连 CF、不需要 token |
| `.dev.vars` | ✅ 已填本地 secrets | `ADMIN_PASSWORD=local-dev-pass` + `CLOUD_PLATFORM=edgeone` |
| `.gitignore` | ✅ 已忽略 `.dev.vars`/`.wrangler`/`node_modules`/`refs` | secrets 与第三方参考资料不泄露 |

---

## 4. 两套测试层次

### A. 单元测试（零依赖，只跑 Node）
```bash
npm test              # = node --test test/*.test.js
```
验证纯逻辑（能力降级、配置校验、负载均衡策略、路径重写、规则匹配），不连网、不碰平台。改了 `src/config`、`src/balancer`、`src/proxy` 后先跑这个。

### B. 端到端（模拟运行时）
见上面第 2 节 `npm run dev`。覆盖回源、头改写、管理面存配置、降级分支。

---

## 5. 进管理面 + 保存配置（核心流程，curl 版）

登录走 HttpOnly Cookie 鉴权（`ecw_token`），api 挂在 `/__panel/api` 下。下面等价于你在页面上点的动作，**全程落本地 KV，无需厂商账号**：

```bash
BASE=http://127.0.0.1:8799/__panel

# 1) 登录拿 token（首次用 ADMIN_PASSWORD 把哈希固化进本地 KV）
TOK=$(curl -s -i -X POST "$BASE/api/auth/login" -H "content-type: application/json" \
  -d '{"password":"local-dev-pass"}' | grep -i set-cookie | sed -E 's/.*ecw_token=([^;]+).*/\1/')

# 2) 方式 A：先建源站池（id 由系统自动生成，用户只传 name + origins[]），适合多站点复用
#    POST /pools 不传 id；响应里的 .id 是系统生成的机器主键
PID=$(curl -s -X POST "$BASE/api/pools" -H "content-type: application/json" \
  -H "cookie: ecw_token=$TOK" \
  -d '{"name":"主站源站","origins":[{"addr":"example.com","scheme":"https","weight":1}]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "新建源站组，系统 id = $PID"

# 3a) 站点引用该池（字段：host + poolId，poolId 即系统生成的 id）
curl -s -X PUT "$BASE/api/sites/img.example.com" -H "content-type: application/json" \
  -H "cookie: ecw_token=$TOK" -d "{\"host\":\"img.example.com\",\"poolId\":\"$PID\"}"

# 3b) 或：站点直接填内联源站，无需先建池（字段：host + origins[]）
curl -s -X PUT "$BASE/api/sites/img.example.com" -H "content-type: application/json" \
  -H "cookie: ecw_token=$TOK" -d '{"host":"img.example.com","origins":[{"addr":"example.com","scheme":"https","weight":1}]}'

# 4) 确认已落本地 KV
curl -s "$BASE/api/sites" -H "cookie: ecw_token=$TOK"

# 5) 看系统信息：确认 edgeone 降级生效
curl -s "$BASE/api/system/info" -H "cookie: ecw_token=$TOK"
# → {"platform":"edgeone","hasEdgeCache":true,"hasSocket":false,"hasD1":false,"hasKV":true}

# 6) 建一条规则（新模型：match.conditions 多条件 + action + priority）
curl -s -X PUT "$BASE/api/sites/img.example.com" -H "content-type: application/json" -H "cookie: ecw_token=$TOK" -d '{
  "host":"img.example.com","poolId":"$PID",
  "rules":[{
    "id":"r_demo","priority":50,"enabled":true,
    "match":{"conditions":[[{"target":"path","op":"prefix","values":["/images"]}]]},
    "action":{"rewrite":{"type":"strip","value":"/images"},"cache":{"enabled":true,"edgeTtl":3600},
      "forceHttps":true,"clientIpHeader":{"enabled":true,"name":"X-EdgeGateway-Client-IP"}}
  }]
}'

# 7) 看站点（确认规则已固化、按 priority 降序）
curl -s "$BASE/api/sites/img.example.com" -H "cookie: ecw_token=$TOK"
```

> 浏览器直接开 `$BASE` 用 `local-dev-pass` 登录即可可视化操作，更直观。左侧「流量序列」可把规则画成流程图、拖拽调优先级。

---

## 6. 数据面回源验证（本地 mock 源站，最稳）

配 `example.com` 在内网可能连不通。起个本地 mock 源站当回源目标，离线验证全链路：

```bash
# 终端 A：mock 源站（端口 8099）
node -e 'require("http").createServer((q,r)=>{r.setHeader("content-type","text/plain");r.end("hello from mock origin, path="+q.url)}).listen(8099,()=>console.log("mock origin :8099"))'

# 终端 B：用源站池指向本地 mock（POST 建池，id 系统生成；站点引用该 id）
TOK=$(curl -s -i -X POST "http://127.0.0.1:8799/__panel/api/auth/login" -H "content-type: application/json" -d '{"password":"local-dev-pass"}' | grep -i set-cookie | sed -E 's/.*ecw_token=([^;]+).*/\1/')
PID=$(curl -s -X POST "http://127.0.0.1:8799/__panel/api/pools" -H "content-type: application/json" -H "cookie: ecw_token=$TOK" -d '{"name":"mock","origins":[{"addr":"127.0.0.1:8099","scheme":"http","weight":1}]}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')
curl -s -X PUT "http://127.0.0.1:8799/__panel/api/sites/img.example.com" -H "content-type: application/json" -H "cookie: ecw_token=$TOK" -d "{\"host\":\"img.example.com\",\"poolId\":\"$PID\"}"

# 用 CDN 域名访问，看是否回源到 mock
curl -I "http://127.0.0.1:8799/img/x.png"
# 响应头含 X-Cache / X-Origin-Addr: 127.0.0.1:8099 / Server: EdgeGateway 等调试头
```

---

## 7. 为什么必须设 `CLOUD_PLATFORM=edgeone`

`wrangler dev` 默认模拟 **Cloudflare 能力集**（有 `caches.default`、有 D1 模拟）。如果**不设 edgeone**，你本地测的是「CF 超集」，而线上 EdgeOne 跑的是「降级集」，两边行为不一致。

设了之后：`caches.default` API 不可用（缓存改走 `CDN-Cache-Control` 响应头委托边缘）、统计回退 KV，本地 = 线上。管理面「系统信息」页可实时核对。

| 能力 | `wrangler dev`（CF，未设） | 设 `edgeone` 后本地 | EO 线上 |
|---|---|---|---|
| fetch 回源 | ✅ | ✅ | ✅ |
| 边缘缓存（`caches.default` API） | ✅ | ❌（降级） | ❌ |
| 边缘缓存（响应头 `CDN-Cache-Control` 委托边缘） | ✅ | ✅ | ✅ |
| KV | ✅ | ✅ | ✅ |
| D1 统计 | ✅ | ❌（降级走 KV） | ❌ |
| TCP Socket 裸 IP | ✅ | ❌ | ❌ |

> 用 `npm run dev:cf` 可切回 CF 能力集做对照测试。

---

## 8. 常见报错排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 要 `CLOUDFLARE_API_TOKEN` | 误带 `-r/--remote` 连了 CF | 不要加 remote，默认本地模式不需要 token |
| `kv_namespaces[0].id: required` | KV 段缺 `id` | 已配占位 `id`；若改过补回 `id = "local-dev-placeholder-not-real"` |
| `EADDRINUSE` | 端口被占 | `npm run dev -- --port 8788` 或 `pkill -f "wrangler dev"` |
| 登录密码错误 | KV 旧哈希与 `.dev.vars` 不一致 | `npm run dev:clean` 清空本地 KV 后重启 |
| 改源码没生效 | 没重 build | `npm run dev`（自带 build）或改完重跑 `npm run build` |
| 管理面 404 / 静态资源不出 | 没 build 或 web 未内联 | 重 `npm run build`，确认 `_worker.js` > 100KB |

---

## 9. 关于追踪 / 隐私

**本项目不接入任何外部追踪、遥测或日志上报。**
- 所有日志仅 `console.*` 输出，只在本机 dev 终端可见，不发还第三方。
- 不接 Cloudflare Analytics Engine / logpush，不向外部 endpoint 回传。
- 统计只落你自己的本地 KV；唯一「导出」是你主动在管理面点「配置备份」，下载到本地文件，不外传。

---

## 10. 本地 KV 与线上隔离

本地 KV 是 Miniflare 在 `.wrangler/state` 的模拟存储，与线上 Dashboard 的 KV **完全隔离**。本地写的东西只在你这台机器，`npm run dev:clean`（或 `rm -rf .wrangler`）即清空，绝不会污染生产。
