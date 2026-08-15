# 13 · Redis / Webdis KV 兜底存储

> 面向「边缘平台没有原生 KV」的场景（EdgeOne Pages、ESA、或任何只提供 Function 运行时但不提供 KV 绑定的平台）：用自部署的 [Webdis](https://webd.is)（HTTP↔Redis 网关）读写你自己的 Redis，让本项目在不依赖平台 KV 的前提下获得持久化能力。

---

## 1. 为什么需要它

本项目所有持久化（站点配置、源站池、全站规则、统计、缓存代次）都依赖一个统一的 `KVLike` 接口：

```js
{ get(key, type?), put(key, value, opts?), delete(key), list(opts?) }
```

- Cloudflare：绑定 `CDN_KV` / `KV` → 平台原生 KV。
- EdgeOne Makers：绑定 `CDN_KV` → EO KV（仅 Edge Function 可用）。
- **没有 KV 的平台**：`getKV(env)` 返回 `null` → 配置无法持久化，运行在默认配置下。

本特性在「无原生 KV」时插入一个**同构的 Redis 后端**：你自部署 Webdis，把 Redis 暴露成 HTTP，本项目通过 `fetch` 读写它。对 `store.js`、缓存层、降级策略**零改动**——它们只认 `KVLike`，不知道背后是平台 KV 还是你的 Redis。

---

## 2. 架构位置

```
本项目边缘函数
   │  getKV(env)  ── 有 CDN_KV/KV 绑定 ──► 平台 KV 适配器
   │             ── 无绑定但有 REDIS_URL ─► Webdis 适配器（fetch → 你的 Redis）
   │             ── 都没有 ───────────────► null（无持久化，默认配置）
   ▼
store.js（站点/源站/规则/统计，两级缓存 + 降级）
```

Webdis 后端实现：`src/platform/redis-kv.js`；接入点：`src/platform/kv.js` 的 `getKV()`；能力探测：`src/platform/caps.js` 的 `kvBackend` 字段（`native` / `redis` / `none`）。

---

## 3. 自部署 Webdis

### 3.1 起一个 Webdis

```bash
# 方式 A：Docker（最简）
docker run -d --name webdis -p 7379:7379 nicolasff/webdis

# 方式 B：源码编译
git clone https://github.com/nicolasff/webdis && cd webdis
make && ./webdis webdis.json
```

默认监听 `7379`。Webdis 的**关键约定**（本项目严格遵循）：

- URL 即命令：`GET /<CMD>/<arg1>/<arg2>...`，参数逐段 `encodeURIComponent`。
- **响应被「数组包裹」**：命令真实结果在 `response[CMD][0]`，缺失键为 `{ "CMD": [null] }`（HTTP 200，不是 404）。
- 写值（尤其是长 JSON / 含特殊字符）走 **POST + body**，避免 URL 编码黑洞与长度限制。

```
GET    /GET/foo              → {"GET":["bar"]}          # 真实值在 GET[0]
GET    /GET/missing          → {"GET":[null]}           # 缺失键（HTTP 200）
SET    /SET/foo   (body:bar) → {"SET":[true,"OK"]}      # 本项目用 POST+body 写
DEL    /DEL/foo              → {"DEL":1}
SETEX  /SETEX/foo/120 (body) → 带过期（秒），value 走 body
KEYS   /KEYS/foo*            → {"KEYS":["foo","foobar"]}
```

### 3.2 安全加固（**必做**）

裸 Webdis 会把 Redis 直接暴露公网、且**无鉴权**。自部署务必：

1. **不直连公网**：Webdis 只监听内网（如 `127.0.0.1:7379` 或 VPC 内网地址），边缘函数通过内网/专线访问。
2. **套 TLS + 前置鉴权**：在 Webdis 前放一层反向代理（Nginx / Caddy / API 网关），要求 `Authorization: Bearer <token>`，只放行可信来源。
3. **设置 `REDIS_TOKEN`**：本项目向 Webdis 发请求时携带该 Bearer Token，与前置鉴权对应。
4. **切勿**把 `REDIS_URL` 指向任何人可访问的裸露 Webdis。

> 最小可行示例（Caddy 前置鉴权）：
> ```Caddyfile
> redis.your-domain.com {
>   basicauth / { <hash> }
>   reverse_proxy 127.0.0.1:7379
> }
> ```
> 本项目 `REDIS_TOKEN` 即对应这里的凭据（Bearer 形式）。

---

## 4. 配置本项目

在部署平台的「环境变量」里加：

| 变量 | 必填 | 说明 |
|---|---|---|
| `REDIS_URL` | 是 | Webdis 基址，如 `https://redis.your-domain.com`，或 `http://127.0.0.1:7379`（尾部斜杠会被去除） |
| `REDIS_TOKEN` | 推荐 | Webdis 前置鉴权 Bearer Token；不配则请求不带鉴权头 |
| `REDIS_PREFIX` | 否 | 键统一前缀，多应用共享 Redis 时隔离（如 `cdn_gw:`） |
| `REDIS_TIMEOUT_MS` | 否 | 单次请求超时，默认 5000ms |

> 只要 `REDIS_URL` 非空，且**没有**平台 `CDN_KV`/`KV` 绑定，`getKV()` 就自动切到 Redis 后端。两者都配置时优先用平台 KV。

---

## 5. 前后端接口

新增了一套受鉴权的 KV 直读直写接口（管理面通用，不替代配置存储），挂载在 `/{adminPath}/api/kv`：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/kv/ping` | 探测后端连通性（读写回环）；返回 `{ok, latencyMs, backend, error?}` |
| `GET` | `/kv?prefix=` | 列举前缀下的键（默认全部） |
| `GET` | `/kv/:key` | 读一个键（纯文本返回） |
| `PUT` | `/kv/:key?ttl=` | 写一个键，body 为值；`ttl` 为可选过期秒数 |
| `DELETE` | `/kv/:key` | 删一个键 |

前端「系统设置 → KV 存储后端」区块展示当前 `kvBackend` 并提供「测试连通性」按钮。

```bash
# 手动验证（已登录，cookie 为 ecw_token=$TOK）
TOK=...
curl "https://你的域名/__panel/api/kv/ping" -H "cookie: ecw_token=$TOK"
# → {"ok":true,"backend":"redis-webdis","latencyMs":12}

curl -X PUT "https://你的域名/__panel/api/kv/hello?ttl=3600" \
  -H "cookie: ecw_token=$TOK" -H "content-type: text/plain" -d "world"
curl "https://你的域名/__panel/api/kv/hello" -H "cookie: ecw_token=$TOK"
# → world

curl -X DELETE "https://你的域名/__panel/api/kv/hello" -H "cookie: ecw_token=$TOK"
```

---

## 6. 实现要点 / 设计约束

1. **同构 `KVLike`**：`redis-kv.js` 的 `createRedisKV()` 返回的 `get/put/delete/list` 与平台 KV 适配器完全一致，键名同样走 `keyCodec.encodeKey`，保证与平台 KV 键空间对齐（迁移/混部时键一致）。
2. **命令注入防护 + 编码黑洞规避**：key 经 `encodeURIComponent` 拼进 Webdis path；value 一律走 **POST 请求体**（不进 path），彻底规避 URL 长度限制、`/`、`+`、`&` 等特殊字符破坏路径或被 Webdis 误解析的问题。
3. **降级语义一致**：读失败返回 `null`（上层降级默认值），写失败向上抛（管理面告知用户）——与 `kv.js` 的 CF/EO 适配器行为一致。
4. **过期**：`put` 的 `expirationTtl` 映射到 Redis `SETEX`，平台要求最小 60s，低于 60 取 60（与 `kv.js` 一致）。
5. **`list`**：用 Redis `KEYS prefix*` glob（前缀先编码再转 glob，列举语义不变）。注意 `KEYS` 在超大键空间有阻塞风险，运维场景谨慎使用；生产配置读写走 `store.js` 的索引，不依赖 `list`。
6. **校验探测 `probeRedis`**：用随机 key 做「写→读→删」回环，确认后端真实可读可写，而非仅网络通。

---

## 7. 与其他后端的关系

| 平台 | KV 来源 | `kvBackend` |
|---|---|---|
| Cloudflare Workers / Pages | `CDN_KV` / `KV` 绑定 | `native` |
| EdgeOne Makers | `CDN_KV` 绑定 | `native` |
| EO Pages / ESA（无 KV 绑定） | `REDIS_URL` 指向自建 Webdis | `redis` |
| 两者皆无 | 无 | `none`（默认配置，不可持久化） |
