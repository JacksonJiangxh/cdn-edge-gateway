# 12 · 管理面 API 参考

> **管理面 API 参考**
>
> 上一篇：[11 请求处理流程](./11-request-flow.md) ｜ 下一篇：[13 EdgeOne 回源 Host 配置](./13-eo-origin-host.md)
>
> 返回 [文档中心](./README.md)

> 管理面后端所有接口。路径均相对于 `/{ADMIN_PATH}/api`，例如默认 `http://127.0.0.1:8799/__panel/api`。
> 路由声明见 `src/api/router.js`。想快速上手看 [03 本地开发](./03-local-development.md) 的 curl 流程。

---

## 鉴权

- 除 `POST /auth/login` 和 `POST /auth/logout` 外，**所有接口都需要登录**。
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
| `GET` | `/pools` | 列出所有源站，每项附带 `kind`、`refs[]`、`refCount`、`deletable`；响应还含 `legacySites`（仍用旧版内联源站、待迁移的站点） |
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
| `GET` | `/sites/{host}` | 获取单个站点 |
| `PUT` | `/sites/{host}` | 新建 / 覆盖保存站点。要么传 `poolId` 引用已有源站；要么传单个地址的 `origins`，后端会**自动创建一条 `kind:"single"` 源站**并回填 `poolId`（响应中的 `createdOrigin` 即为新建的源站；地址相同则复用已有条目） |
| `DELETE` | `/sites/{host}` | 删除站点 |

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
# → {"platform":"edgeone","hasEdgeCache":true,"hasCacheApi":false,"eoEdgeCache":true,"hasSocket":false,"hasD1":false,"hasKV":true}
```
> 注意：EdgeOne 上 `hasEdgeCache:true`（边缘缓存已启用，走响应头委托 + 同站 fetch 节点缓存）、`hasCacheApi:false`（无 `caches.default` API）、`eoEdgeCache:true`（支持同站 fetch 委托）、`hasSocket:false`。

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
