# 10 · 管理面 API 参考

> [!NOTE]
> **本文面向**：开发者（对接管理面后端、写脚本/自动化）。
> 路由声明见 `src/api/router.js`。快速上手见 [本地开发](/dev/09-local-development.md)。

---

## 基础约定

- 所有接口路径相对 `/{adminPath}/api`，默认即 `/__panel/api`。
- 响应统一格式：
  ```jsonc
  { "ok": true,  "data": { ... } }      // 成功
  { "ok": false, "error": "原因" }       // 业务错误（暴露真实原因）
  ```
- 调试响应头：`X-Cache`（HIT/MISS/PASS）、`X-Origin-Addr`、`Server: EdgeGateway`、`Via: 1.1 EdgeGateway`、`X-Egw-Req-Id`。

---

## 鉴权

> [!IMPORTANT]
> 路由表 `auth` 缺省即**需鉴权**（安全默认）。写入类（POST/PUT/DELETE）还校验同源 Origin（CSRF）。
> 只有 `POST /auth/login`、`GET /auth/me`、`POST /auth/logout` 不需登录。

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/auth/login` | 登录（公开），下发 `Set-Cookie: ecw_token`（HttpOnly） |
| `GET` | `/auth/me` | 当前登录态（公开），返回 `{"authed":true}` |
| `POST` | `/auth/logout` | 登出 |
| `POST` | `/auth/password` | 改密码（需鉴权） |

**登录**：

```bash
TOK=$(curl -s -i -X POST "http://127.0.0.1:8799/__panel/api/auth/login" \
  -H "content-type: application/json" -d '{"password":"local-dev-pass"}' \
  | grep -i 'set-cookie:' | sed 's/.*ecw_token=//; s/;.*//')
echo "拿到 token: $TOK"
```

之后所有请求带 `-H "cookie: ecw_token=$TOK"`。

---

## 源站池 Pools

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/pools` | 列出所有源站（含 `kind`/`refs[]`/`refCount`/`deletable`） |
| `POST` | `/pools` | 新建（**不传 `id`**，系统生成 `pl_xxx`） |
| `GET` | `/pools/:id` | 单条 |
| `GET` | `/pools/:id/refs` | 谁在引用（删不掉时定位） |
| `PUT` | `/pools/:id` | 覆盖更新 |
| `DELETE` | `/pools/:id` | 删除（仍被引用返回 409） |

**示例：建一个链式回退源站池**（不传 `id`）：

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
# → {"id":"pl_xxx", ...}  站点用 poolId 引用该 id
```

**示例：查引用**（删不掉时用它定位）：

```bash
curl "http://127.0.0.1:8799/__panel/api/pools/pl_xxx/refs" -H "cookie: ecw_token=$TOK"
# → {"id":"pl_xxx","refCount":2,"refs":[
#      {"type":"site","host":"img.example.com","detail":"站点默认源站"},
#      {"type":"rule","host":"www.example.com","detail":"规则覆盖回源"}]}
```

> `kind:"single"` 时 `origins` 只有 1 项、`strategy` 强制 `chain`（单源顺序回退自身）。

---

## 站点 Sites

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/sites` | 列出所有站点 |
| `GET` | `/sites/templates` | 可套用模板（预设标准规则，建站后由前端用 `/rules` 写入） |
| `GET` | `/sites/:host` | 单站点 |
| `PUT` | `/sites/:host` | 新建/覆盖（传 `poolId` 或单个 `origins`；后者自动建 `kind:single` 源站回填） |
| `PUT` | `/sites/:host/basics` | 只更基础信息（host/enabled/ipv6Support/cacheGen） |
| `PUT` | `/sites/:host/rules` | 全量更新规则列表（按 priority 降序固化） |
| `PUT` | `/sites/:host/security` | 全量更新安全（referer/UA/IP/限流） |
| `DELETE` | `/sites/:host` | 删除 |

**示例：建站点 + 一条规则**（新模型，阶段式 action）：

```bash
curl -X PUT "http://127.0.0.1:8799/__panel/api/sites/img.example.com" \
  -H "content-type: application/json" -H "cookie: ecw_token=$TOK" -d '{
    "host":"img.example.com",
    "poolId":"pl_xxx",
    "rules":[{
      "priority":50, "enabled":true,
      "match":{"conditions":[[ {"target":"path","op":"prefix","values":["/images"]} ]]},
      "action":{
        "rewrite":{"type":"strip","value":"/images"},
        "cache":{"enabled":true,"edgeTtl":3600},
        "forceHttps":true, "forceHttpsStatus":301,
        "clientIpHeader":{"enabled":true,"name":"X-EdgeGateway-Client-IP"}
      }
    }],
    "security":{
      "refererMode":"whitelist", "refererList":["example.com"],
      "allowEmptyReferer":true,
      "rateLimit":{"enabled":true,"rpm":60}
    }
  }'
```

> `match.conditions` 是二维数组：外层 OR、内层 AND。不填 = 匹配全部。
> `action` 可同时挂多个（rewrite + cache + forceHttps + 改头）。保存时按 `priority` 降序固化。

---

## 全站通用规则（兜底）

对所有站点生效、优先级最低。采用「**阶段 → 默认动作**」映射（每阶段 1 条、无条件）：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/rules/global` | 读全站规则，返回 `{stages:{...}}` |
| `PUT` | `/rules/global` | 全量更新，请求体 `{stages:{...}}`（仅合法阶段 key） |

阶段 key 见 [系统架构 · 请求流程](/dev/12-request-flow.md) 的 STAGE_ORDER：
`rewrite / redirect / terminate / reqHeaders / origin / cache / respHeaders`。

```json
{
  "stages": {
    "rewrite":    { "type": "none" },
    "redirect":   { "type": "none" },
    "terminate":  { "forceHttps": true, "forceHttpsStatus": 301, "directResponse": { "enabled": false } },
    "reqHeaders": { "set": {}, "strip": [] },
    "origin":     { "hostHeader": { "mode": "inherit" }, "clientIpHeader": { "enabled": false }, "followRedirect": false },
    "cache":      { "enabled": false, "edgeTtl": 0, "browserTtl": 0, "staleWhileRevalidate": 0 },
    "respHeaders":{ "set": {}, "strip": [] }
  }
}
```

> KV 空时后端自动写入上述保守默认落盘，用户可在管理面改（非定死）。

---

## 缓存 Cache

```http
POST /{adminPath}/api/cache/purge
{"url":"https://img.example.com/img/x.png"}   # 按 URL 清；不传则整站代次清除
```

---

## 统计 Stats

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/stats/overview` | 总览（请求量、命中率） |
| `GET` | `/stats/host/:host` | 单站点统计 |

---

## 系统 System

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/system/info` | 平台能力探测（platform/hasKV/hasSocket/caps…） |
| `GET` | `/system/export` | 导出完整配置 JSON |
| `POST` | `/system/import` | 导入配置 JSON（整体覆盖） |
| `POST` | `/system/sync/open` | 开跨站同步 |
| `POST` | `/system/sync/close` | 关跨站同步 |
| `GET` | `/system/sync/status` | 同步状态 |
| `POST` | `/system/sync/receive` | 接收同步（公开，校验码+密码双重校验，跨站豁免 CSRF） |

**示例：看平台能力**

```bash
curl "http://127.0.0.1:8799/__panel/api/system/info" -H "cookie: ecw_token=$TOK"
# → {"platform":"eo","hasCacheApi":true,"cacheIsNodeLocal":true,"hasRawIpFetch":true,"hasSocket":false,"hasKV":true}
```

---

## 全局配置 Global

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/config/global` | 读全局 |
| `PUT` | `/config/global` | 更新全局（security/ipWhitelist/strategy…） |

---

## KV 直读（无原生 KV 平台兜底）

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/kv/ping` | **同时**探测平台 KV 与自部署 Webdis（各自读写回环） |
| `GET` | `/kv?prefix=` | 列键 |
| `GET` | `/kv/:key` | 读键（纯文本） |
| `PUT` | `/kv/:key?ttl=` | 写键（body 为值） |
| `DELETE` | `/kv/:key` | 删键 |

```bash
curl "http://127.0.0.1:8799/__panel/api/kv/ping" -H "cookie: ecw_token=$TOK"
```

```json
{
  "backend": "redis",
  "preference": "auto",
  "ok": true,
  "latencyMs": 12,
  "native": { "ok": true, "latencyMs": 8,  "backend": "native",       "effective": false },
  "redis":  { "ok": true, "latencyMs": 12, "backend": "redis-webdis", "effective": true  }
}
```

- 顶层 `backend` 为**当前生效**后端（`native` / `redis` / `none`），`preference` 为 `KV_BACKEND` 归一值。
- `native` / `redis` 为两端**各自**的探测结果；未配置的一侧返回 `backend: "none"` 与说明性 `error`，不计为失败。
- 顶层 `ok` / `latencyMs` 反映生效后端的结果（兼容旧调用方）。
- 后端选型规则见 [Redis / Webdis 外置 KV](/dev/13-redis-kv.md)。

---

## 下一步

→ [系统架构](/dev/11-architecture.md)：模块划分、平台降级、内存预算。
