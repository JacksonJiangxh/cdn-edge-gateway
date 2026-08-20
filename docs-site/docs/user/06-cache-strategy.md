# 06 · 缓存策略

> [!NOTE]
> **本文面向**：普通用户（想加速、省源站带宽、降延迟）。
> 缓存代码本质（平台 Cache API 差异）见 [开发者篇 · 系统架构](/dev/11-architecture.md)。

---

## 缓存到底缓了什么

网关把「源站返回的响应」按一个**缓存键**存在边缘节点的 Cache API 里。
下次同样键的请求，直接命中缓存返回，**不再打扰源站**。

```
请求 → 查缓存键 → 命中? → 直接返回（快，省源站）
                       ↓ 未命中
                     回源 → 存一份 → 返回
```

---

## 三平台缓存本质（必须知道的差异）

| 平台 | 缓存范围 | 清缓存注意 |
|---|---|---|
| Cloudflare Workers | 平台级 Workers Cache + 代码层 `caches.default`（两层） | 两层都要顾及；`[cache] enabled=true` |
| EdgeOne Pages | **节点本地**缓存 | `delete` 只清当前节点；大规模用缓存代次 |
| 阿里云 ESA | **全局单实例**缓存 | `put` key 须 http URL；**Cache API 独立走平台默认 32** 子请求（不经 `MAX_SUBREQUESTS` 覆盖），与 fetch 软限制（默认 8）互不占用 |

> [!WARNING]
> 在 EdgeOne 上点「清单个 URL 缓存」可能只清了**当前节点**。要全量失效，改 `global.cacheGen`（缓存代次）让旧键整体失效。

---

## 怎么让缓存生效（配置层）

1. **全局开缓存**：`global` 里 `cacheGen` 正常，站点/规则不关缓存。
2. **规则里配 cache 阶段**：

```json
{
  "if": { "pathPrefix": "/static/" },
  "stages": {
    "cache": {
      "enabled": true,
      "ttl": 86400,
      "methods": ["GET"],
      "cacheKey": { "includeQuery": true }
    }
  }
}
```

| 字段 | 说明 |
|---|---|
| `enabled` | 是否缓存这条规则 |
| `ttl` | 缓存秒数（如 86400 = 1 天） |
| `methods` | 只对哪些方法缓存（通常只 GET） |
| `cacheKey.includeQuery` | 是否把查询串算进缓存键（防参数不同命中同一份） |

---

## 命中率提升五招

1. **静态资源单独规则**：`/static/` `/images/` `/assets/` 长 TTL（1 天~1 月）。
2. **缓存键别太碎**：关掉无意义的查询参数，否则同一内容被存成几百份。
3. **源站吐 `Cache-Control`**：网关尊重源站响应头里的缓存指令（可叠加）。
4. **别缓存带 Cookie 的私有页**：默认不缓存带 Set-Cookie 的响应更安全。
5. **用缓存代次刷新**：改版后 `cacheGen+1`，比逐个清 URL 可靠。

---

## 省额度的真相

缓存命中 = 请求**不进源站也不怎么耗边缘算力**（CF 命中 Workers Cache 甚至不进函数）。
所以：缓存配得越准，源站带宽和边缘请求数越低，免费额度越经用。

---

## 常见坑

| 现象 | 原因 | 解法 |
|---|---|---|
| 命中率 0% | 规则没开 cache / 动态页被缓存 | 检查 `stages.cache.enabled` |
| EO 清了还旧 | 只清当前节点 | 用 `cacheGen` 代次 |
| 同一图多份缓存 | 查询串不同 | `cacheKey.includeQuery=false` |
| 登录态串了 | 私有页被缓存 | 不缓存带 Cookie/Set-Cookie 的响应 |

---

## 下一步

→ [EO 回源 Host](/user/07-eo-origin-host.md)：EdgeOne 平台特有的回源域名配置。
