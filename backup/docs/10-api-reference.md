# 10 · 管理面 API 参考

> **管理面 API 参考**
>
> 上一篇：[09 本地开发与验证](./09-local-development.md) ｜ 下一篇：[11 系统架构](./11-architecture.md)
>
> 返回 [项目首页](../README.md)

> 管理面后端所有接口。路径均相对于 `/{ADMIN_PATH}/api`，例如默认 `http://127.0.0.1:8799/__panel/api`。
> 路由声明见 `src/api/router.js`。想快速上手看 [09 本地开发](./09-local-development.md) 的 curl 流程。

---

## 鉴权

- 除 `POST /auth/login`、`POST /auth/logout` 和 `GET /auth/me`（返回当前登录态，免登录）外，**所有接口都需要登录**。
- 登录通过后下发 `Set-Cookie: ecw_token=...`（HttpOnly）。后续请求带该 cookie 即可。
- 未匹配路径直接 404，不会泄露「接口是否存在」。

### 登录

```http
POST /{ADMIN_PATH}/api/auth/login
Content-Type: application/json

{"password":"你的密码"}
```
→ `200` + `Set-Cookie: ecw_token=eyJ...`

### 改密码 / 当前态

```http
POST /{ADMIN_PATH}/api/auth/password     # 改管理密码（需登录）
GET  /{ADMIN_PATH}/api/auth/me           # 返回 {"authed":true}
POST /{ADMIN_PATH}/api/auth/logout       # 登出
```

---

## 源站 Origins（Pools）

单一源站（`kind:"single"`）与源站池（`kind:"pool"`）共用同一套接口与同一份存储。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/pools` | 列出所有源站，每项附带 `kind`、`refs[]`、`refCount`、`deletable` |
| `POST` | `/pools` | **新建**源站（body 不传 `id`，系统自动生成机器主键） |
| `GET` | `/pools/{id}` | 获取单条源站 |
| `GET` | `/pools/{id}/refs` | 查询该源站的引用明细（谁在用、用在哪） |
| `PUT` | `/pools/{id}` | 覆盖更新（url 中的 `id` 为系统生成的主键） |
| `DELETE` | `/pools/{id}` | 删除。**仍被引用时返回 409**，需先改指其它源站 |

> `id` 是**系统自动生成**的内部主键（格式 `pl_xxxx`），用户**不可手动填写**；给人区分用的是 `name` 字段。站点 `poolId` 引用的是系统 `id`。
> `kind:"single"` 时 `origins` 只能有 1 项、`strategy` 强制为 `chain`。

**示例**：创建源站池（策略 chain，主源 + 备源）。注意**不传 `id`**，由系统自动生成。
```bash
curl -X POST "http://127.0.0.1:8799/__panel/api/pools" \
  -H "content-type: application/json" -H "cookie: ecw_token=$TOK" -d '{
    "name":"主站源站",
    "kind":"pool",
    "strategy":"chain",
    "origins":[
      {"addr":"origin-a.example.com","scheme":"https","weight":1},
      {"addr":"origin-b.example.com","scheme":"https","weight":1}
    ]
  }'
# → 响应含系统生成的 id，如 { "id":"pl_xxx", "name":"主站源站", ... }
# 站点用 poolId 引用该 id： "poolId":"pl_xxx"
```

**示例**：查询引用（删不掉时用它定位是谁在用）
```bash
curl "http://127.0.0.1:8799/__panel/api/pools/pl_xxx/refs" -H "cookie: ecw_token=$TOK"
# → { "id":"pl_xxx", "refCount":2, "refs":[
#      {"type":"site","host":"img.example.com","label":"img.example.com","detail":"站点默认源站"},
#      {"type":"rule","host":"www.example.com","label":"www.example.com","detail":"规则「静态资源」覆盖回源"}
#    ] }
```

---

## 站点 Sites

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/sites` | 列出所有站点 |
| `GET` | `/sites/templates` | 获取可套用的站点模板（新建站点时的快捷预设）。模板参数为**固定预设、不可在新建时修改**；每个模板直接带 `rules`——即用预设参数生成的**标准规则（Rule[]）**，结构与「流量序列 → 规则」里手动添加完全一致。建站后由前端用 `PUT /sites/{host}/rules`（流量序列规则接口）写入 |
| `GET` | `/sites/{host}` | 获取单个站点 |
| `PUT` | `/sites/{host}` | 新建 / 覆盖保存站点。要么传 `poolId` 引用已有源站；要么传单个地址的 `origins`，后端会**自动创建一条 `kind:"single"` 源站**并回填 `poolId`（响应中的 `createdOrigin` 即为新建的源站；地址相同则复用已有条目） |
| `PUT` | `/sites/{host}/basics` | 仅更新站点基础信息（host / enabled / ipv6Support / cacheGen 等），不动规则与安全 |
| `PUT` | `/sites/{host}/rules` | 全量更新该站点的规则列表（按 `priority` 降序固化） |
| `PUT` | `/sites/{host}/security` | 全量更新该站点的安全防护（referer / UA / IP / 签名 URL / 限速 / Bot 等） |
| `DELETE` | `/sites/{host}` | 删除站点 |

> 分段端点（`/basics`、`/rules`、`/security`）是「整站 PUT」的细粒度拆分，便于前端按模块保存、减少覆盖面；效果与 `PUT /sites/{host}` 整体保存一致。

**示例**：创建站点 + 一条规则（新模型）
```bash
curl -X PUT "http://127.0.0.1:8799/__panel/api/sites/img.example.com" \
  -H "content-type: application/json" -H "cookie: ecw_token=$TOK" -d '{
    "host":"img.example.com",
    "poolId":"pl_xxx",   # 上一步创建源站返回的系统 id
    # 也可不填 poolId，改为 "origins":[{"addr":"example.com","scheme":"https","weight":1}]
    # 直接填一个地址；后端会自动建一条「单一源站」并回填 poolId，它同样会出现在「源站」页里
    "rules":[{
      "priority":50,
      "enabled":true,
      "match":{
        "conditions":[[ {"target":"path","op":"prefix","values":["/images"]} ]]
      },
      "action":{
        "rewrite":{"type":"strip","value":"/images"},
        "cache":{"enabled":true,"edgeTtl":3600},
        "forceHttps":true,
        "forceHttpsStatus":301,
        "clientIpHeader":{"enabled":true,"name":"X-EdgeGateway-Client-IP"}
      }
    }],
    "security":{
      "refererMode":"whitelist",
      "refererList":["example.com"],
      "allowEmptyReferer":true,
      "rateLimit":{"enabled":true,"rpm":60},
      "signedUrl":{"enabled":false,"secret":"","ttl":3600,"param":"sign"}
    }
  }'
```

> `match.conditions` 是二维数组：外层 OR、内层 AND。不填 = 匹配全部。
> `action` 可同时挂多个动作（rewrite + cache + forceHttps + 改头…）。
> 保存时规则会按 `priority` 降序固化，运行时无需再排序。

---

## 全站通用规则（兜底）

对所有站点生效的兜底规则，独立于各站点规则、优先级最低。

全站规则采用「**阶段 → 默认动作**」映射结构（每阶段恰好 1 条、无条件、无 priority），而非带条件匹配的数组：

```json
{
  "stages": {
    "rewrite":    { "type": "none" },
    "redirect":   { "type": "none" },
    "terminate":  { "forceHttps": true, "forceHttpsStatus": 301, "directResponse": { "enabled": false } },
    "reqHeaders": { "add": [], "remove": [], "set": [] },
    "origin":     { "hostHeader": { "mode": "inherit" }, "clientIpHeader": { "enabled": false }, "followRedirect": false, "originTimeoutMs": 0 },
    "cache":      { "enabled": false, "edgeTtl": 0, "browserTtl": 0, "staleWhileRevalidate": 0 },
    "respHeaders":{ "add": [], "remove": [], "set": [] }
  }
}
```

> KV 中 `cfg:global_rules` 为空时，后端自动写入上述内置保守默认落盘，之后用户可在管理面自由修改（非定死）。
> 旧版 `{ rules: [...] }` 数组结构会在首次读取时一次性迁移为 `stages` 映射并写回。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/rules/global` | 读取全站通用（兜底）规则，返回 `{ stages: {...} }` |
| `PUT` | `/rules/global` | 全量更新全站通用规则，请求体为 `{ stages: {...} }`（仅接受合法阶段 key，每阶段 1 条默认动作） |

> 管理面入口：「站点选择」里选「全站通用规则（兜底默认）」，同样按 18 阶段展示并编辑每个阶段的默认动作。

---

## 缓存 Cache

```http
POST /{ADMIN_PATH}/api/cache/purge
Content-Type: application/json

{"url":"https://img.example.com/img/x.png"}   # 按 URL 清；不传则整站代次清除
```

---

## 统计 Stats

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/stats/overview` | 总览（请求量、命中率等） |
| `GET` | `/stats/host/{host}` | 单站点统计 |

---

## 系统 System

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/system/info` | 平台能力探测（platform / hasKV / hasD1 / hasEdgeCache / hasSocket） |
| `GET` | `/system/export` | 导出完整配置 JSON（下载到本地） |
| `POST` | `/system/import` | 导入配置 JSON（整体覆盖） |

**示例**：查看能力
```bash
curl "http://127.0.0.1:8799/__panel/api/system/info" -H "cookie: ecw_token=$TOK"
# → {"platform":"eo","hasEdgeCache":true,"hasCacheApi":true,"cacheIsNodeLocal":true,"eoEdgeCache":true,"hasRawIpFetch":false,"hasSocket":false,"hasD1":false,"hasKV":true}
```
> 注意：EdgeOne 上 `hasEdgeCache:true`（边缘缓存已启用）、`hasCacheApi:true`（原生支持 `caches.default`，但 `cacheIsNodeLocal:true` 仅节点本地化、不跨节点复制）、`eoEdgeCache:true`（支持同站 fetch 委托）、`hasRawIpFetch:false`（fetch 不支持裸 IP）、`hasSocket:false`（无 cloudflare:sockets）。
>
> 阿里云 ESA 示例：`{"platform":"esa","hasEdgeCache":true,"hasCacheApi":true,"cacheSingleInstance":true,"cacheKeyHttpOnly":true,"cacheSubreqLimit":32,"hasRawIpFetch":false,"hasSocket":false,"hasD1":false,"hasKV":true}` —— `cacheSingleInstance:true`（全局 `cache` 单实例、非 `caches.default`）、`cacheKeyHttpOnly:true`（`put` key 须 http URL）、`cacheSubreqLimit:32`（Cache 与 fetch 共享）。

---

## 全局配置 Global

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/config/global` | 读取全局配置 |
| `PUT` | `/config/global` | 更新全局配置（如 `statsDriver` / `imageOptimization` / `disguise` / `security` / `ipWhitelist`） |

**示例**：
```bash
curl -X PUT "http://127.0.0.1:8799/__panel/api/config/global" \
  -H "content-type: application/json" -H "cookie: ecw_token=$TOK" -d '{
    "statsDriver":"kv",
    "imageOptimization":false,
    "disguise":false,
    "ipWhitelist":[]
  }'
```

---

## 通用响应格式

```jsonc
{ "ok": true,  "data": { ... } }      // 成功
{ "ok": false, "error": "原因" }       // 业务错误（暴露真实原因）
// 系统错误对外只给「服务器内部错误」+ reqId，细节写日志
```

> 调试响应头：`X-Cache`（HIT/MISS/PASS）、`X-Origin-Addr`（实际回源地址）、`Server: EdgeGateway`、`Via: 1.1 EdgeGateway`、`X-Egw-Req-Id`（请求追踪），便于排查回源链路。
