# 全链路缓存策略矩阵（四厂商 + 本项目）

本项目的完整请求链路：

```
浏览器
  └─→ 最前端 CDN（四选一）：
        ├─ Cloudflare (CF)      ──→ 本项目(_worker.js) ──→ 源站
        ├─ EdgeOne (EO)         ──→ 本项目(Makers)    ──→ 源站
        ├─ AWS CloudFront       ──→ 源站（直接，不经过本项目）
        └─ 阿里云 ESA           ──→ 源站（直接，不经过本项目）
```

**关键分叉**：CF / EO 会先经过本项目（函数层可改写头），CloudFront / ESA **直接到源站**，只能看到源站原生响应头。因此：

- **CF / EO 的缓存权威 = 控制台规则 + 本项目下发头（双重）**
- **CloudFront / ESA 的缓存权威 = 控制台缓存策略/规则**（本项目够不到，必须靠源站原生头 + 控制台改写）

---

## 一、跨厂商缓存头语义差异（必读，否则会写错规则）

| 厂商 | 读 `CDN-Cache-Control`? | 读 `Cache-Control` 内 `s-maxage`? | 读 `max-age`? | 本项目是否介于中间 |
|---|---|---|---|---|
| **Cloudflare** | ✅ 读（且受 Cache Response Rules / `cloudflare_only` 开关影响） | ✅ | ✅（浏览器+边缘都看） | ✅ 走本项目 |
| **EdgeOne** | ✅ 读（按 `CDN-Cache-Control` 委托边缘缓存） | ✅ | ✅ | ✅ 走本项目 |
| **AWS CloudFront** | ❌ **不读**（官方文档仅认 `Cache-Control` / `Expires`） | ✅ | ✅ | ❌ 直接源站 |
| **阿里云 ESA** | ⚠️ 保守按 `Cache-Control` 处理（控制台可改写出站头） | ✅ | ✅ | ❌ 直接源站 |

**结论与坑**：
- `CDN-Cache-Control` 是 **RFC 标准头**，CF/EO 都读；但 **CloudFront 明确不读**，只认 `Cache-Control`。
- 所以**可缓存内容必须同时在 `Cache-Control` 里带 `s-maxage`**（CloudFront/ESA 读得着），并在 `CDN-Cache-Control` 里带 `max-age`（CF/EO 边缘读得着）。本项目已同时下发两者。
- `immutable` 只给浏览器（`Cache-Control`），不要写进 `CDN-Cache-Control`。
- `s-maxage` 浏览器忽略、只给共享缓存（CDN/边缘）看；`max-age` 浏览器和 CDN 都看。

---

## 二、本项目（函数层）内置的站点模板默认值

`src/proxy/headers.js` 的 `buildClientHeaders` 在可缓存响应时**自动遵循分层铁律**，模板开箱即用：

- 浏览器：`Cache-Control: public, max-age=1800, immutable, s-maxage=15552000`
- 边缘：`CDN-Cache-Control: public, max-age=15552000`
- **兜底剥离**源站带回的 `set-cookie` / `pragma` / `no-store` / `private` / `expires=0`
- TTL 回落默认（开启 `cache.enabled` 未给 TTL 时）：`edgeTtl=15552000s(半年)` / `browserTtl=1800s(30分钟)`（常量 `TIER_CDN_DEFAULT_EDGE_TTL` / `TIER_CDN_DEFAULT_BROWSER_TTL`）

> 本项目下发的头对 **CF/EO 生效**（它们走本项目）；对 **CloudFront/ESA 不生效**（它们直接源站，只看源站头 + 控制台规则）。

---

## 三、逐厂商规则设置清单

### A. Cloudflare（走本项目）

**DNS**：`cdn.example.com` CNAME 橙云（Proxied）。
**Worker**：部署 `_worker.js` → Custom Domain 绑 `cdn.example.com`；Settings → Cache → "Cache responses from fetch handlers" = Enabled。

**① Cache Rules（请求/命中侧）**：
- 可缓存（`/img/*`、`/static/*`）：`Cache eligibility = Eligible`、`Edge TTL = Override, 15552000s(半年)`、`Browser TTL = Override, 1800s(30分钟)`、`Origin Cache-Control = Ignore if present`（否决源站 `no-store`/`private`）。
- 必进函数（`/api/*`、`/__panel/*`）：`Cache eligibility = Bypass`。

**② Cache Response Rules（响应侧）**：
- **`cloudflare_only`（仅 Cloudflare 边缘生效）开关 = 关闭**：开启后改写头只作用边缘、不下发浏览器，违背"最前端 CDN 为最终依据"。
- 可缓存路径：设 `Cache-Control: public, max-age=1800, immutable`、`CDN-Cache-Control: public, max-age=15552000`、加 `Cache-Tag: assets`、**移除 `Set-Cookie`/`Pragma`/`no-store`/`private`**。
- 不可缓存路径：`Cache-Control: no-store`。

**③ 本项目层**：自动下发（见第二节），CF 上作兜底。

---

### B. EdgeOne（走本项目，三层域名）

**三层**：`cdn.example.com`(CDN层，不挂函数) → `edge.example.com`(函数层，挂 Makers，作①的源站) → `origin-1/2.net`(源站)。

**① `cdn.example.com` 站点规则（最前端）**：
- 可缓存：节点缓存 TTL = 15552000s(半年)，浏览器 TTL = 1800s(30分钟)；响应头改写下发 `Cache-Control: public, max-age=1800, immutable`、`CDN-Cache-Control: public, max-age=15552000`，**剥离 `Set-Cookie`/`Pragma`/`no-store`/`private`**。
- 不可缓存（`/api/*`）：节点缓存 = 不缓存 / `no-store`。

**② `edge.example.com` Makers 规则**：
- 触发路由 `/*` 绑本项目 `_worker.js`；函数内 `requestWithFailover` 选源站，返回头由 `src/proxy/cache.js` 下发（路径 B 响应头委托，见第二节）。
- 源站组 + 回源 Host 重写需预配（见 `docs/eo-origin-host.md`）。

---

### C. AWS CloudFront（直接源站，不经本项目）

CloudFront **不读 `CDN-Cache-Control`、只认 `Cache-Control`**，且直接源站看不到本项目头，所以**缓存完全靠 CloudFront 缓存策略 + 源站原生 `Cache-Control`**。

**① CloudFront 分配 / Cache Policy（主路径：忽略源站、强制设定）**：
- 创建 **Cache Policy**，设 `Min TTL = 15552000`、`Default TTL = 15552000`、`Max TTL = 15552000`（三者锁死半年）。
- **Object Caching = 自定义（Customize），不按源站头**：在 Cache Policy 的 `Object Caching` 选 `Customize`，`Max-Age TTL` / `Default TTL` / `Min TTL` 全部填 `15552000`。这样**无论源站返回什么（甚至 `no-store`/`no-cache`/无头），边缘都按半年缓存**，权威从源站夺回，与"最前端 CDN 为最终依据"对齐。
- 若想"源站有头就听源站、没头才兜底"，可改 `Object Caching = Use origin headers` 并把 Max TTL=15552000（源站 `s-maxage` 被夹到半年）；但**源站不可信时务必用 Customize 锁死**。

**② 响应头策略（Response Headers Policy，强制改写下发浏览器）**：
- **覆盖 `Cache-Control`** 为 `public, max-age=1800, immutable`（即使源站回了别的也强制覆盖；`immutable` 只给浏览器）。
- 同时下发 `CDN-Cache-Control: public, max-age=15552000`（向前兼容 CF/EO 风格，虽 CloudFront 不读，但统一头格式无害）。
- **移除 `Set-Cookie`/`Pragma`/`no-store`/`private`**（边缘侧剥离，杜绝不缓存信号泄漏到浏览器/边缘）。

**③ 源站侧（兜底，不依赖）**：理想情况源站返回 `Cache-Control: public, s-maxage=15552000, max-age=1800`；但因 ①② 已忽略/覆盖源站头，**源站即便不自带正确头也不影响缓存质量**——这正是直接走源站架构必须的防御。

> 注意：CloudFront 走 Customize 锁死 TTL 后，`s-maxage` 来自源站也不再被读取，完全由 Cache Policy 决定（半年）。

---

### D. 阿里云 ESA（直接源站，不经本项目）

ESA 控制台可"配置缓存节点 HTTP 响应头"改写出站头，遵循 `Cache-Control`/`s-maxage`（保守按 `Cache-Control` 处理，不依赖 `CDN-Cache-Control`）。

**① ESA 站点配置 / 缓存规则（主路径：忽略源站、强制设定）**：
- 节点缓存 TTL = 15552000s(半年)，浏览器缓存 TTL = 1800s(30分钟)，并**设为"忽略源站响应头、以控制台为准"**（ESA 缓存规则中关闭"遵循源站 Cache-Control"），确保源站即便返回 `no-store`/无头也不影响边缘缓存。
- 缓存键与条件：可缓存路径开启节点缓存；`/api/*` 等设为不缓存。

**② ESA 响应头改写（出站，强制覆盖）**：
- 可缓存路径**覆盖** `Cache-Control` 为 `public, max-age=1800, immutable, s-maxage=15552000`，并下发 `CDN-Cache-Control: public, max-age=15552000`（向前兼容 CF/EO 风格）。
- **剥离 `Set-Cookie`/`Pragma`/`no-store`/`private`**，杜绝不缓存信号。

**③ 源站侧（兜底，不依赖）**：理想源站返回 `Cache-Control: public, s-maxage=15552000, max-age=1800`；但因 ①② 已忽略/覆盖源站头，**源站不自带正确头也不影响缓存质量**。

---

## 四、四层 + 本项目 联动总表（以最前端 CDN 为最终依据）

| 平台 | ① 最前端 CDN 层（最终下发） | ② 本项目（仅 CF/EO） | ③ 源站（CloudFront/ESA 的关键输入） |
|---|---|---|---|
| **CF** | Cache Response Rules（改头+剥 `no-store`，`cloudflare_only`=关）+ Cache Rules（Edge/Browser TTL） | `buildClientHeaders` 兜底 | 头被 `Origin Cache-Control=Ignore` 否决 |
| **EO** | 站点规则（节点 TTL + 响应头改写剥离） | Makers 函数返回头（路径 B） | 头被站点规则改写/剥离 |
| **CloudFront** | Cache Policy(自定义锁死 TTL, 忽略源站) + Response Headers Policy(覆盖下发头) | 无（直接源站） | 被忽略/覆盖，**不依赖源站头** |
| **ESA** | 站点缓存规则(忽略源站) + 响应头改写 | 无（直接源站） | 被忽略/覆盖，**不依赖源站头** |

---

## 五、指令语义速查（避免厂商间互相打架）

- `public`：给**边缘**看，允许共享缓存。必须出现在边缘侧头（`CDN-Cache-Control` 或 CloudFront 读的 `Cache-Control` 内）。
- `no-store`：**最强否决**，任一层出现即整条不缓存。可缓存内容必须在最前端规则层显式剥掉源站带回的 `no-store`。
- `s-maxage`：只给共享缓存（CDN/边缘）看，浏览器忽略。CloudFront/ESA **只通过它（在 `Cache-Control` 内）** 拿边缘 TTL，故必须带。
- `max-age`：浏览器 + 边缘都看；浏览器用其值（30 分钟），边缘用 `s-maxage`/`CDN-Cache-Control` 的值（半年）。
- `immutable`：仅 `Cache-Control`（浏览器），告知内容不变别发条件请求；**不要**写进 `CDN-Cache-Control`。
- `Cache-Tag`：仅 CF 用，供按标签 purge。

---

## 六、操作口诀

1. **CF/EO**：控制台规则钉死最前端权威（Edge 半年/Browser 30min/剥离 `no-store`），本项目头兜底。
2. **CloudFront/ESA**：因直接走源站、本项目够不到，**必须忽略源站头、由控制台强制覆盖**——CloudFront 用 Cache Policy 自定义锁死 TTL + Response Headers Policy 覆盖 `Cache-Control`；ESA 用缓存规则"忽略源站" + 响应头改写。源站不自带正确头也不影响缓存质量（防御源站不可信）。
3. `cloudflare_only`（仅 CF 有）保持**关闭**，让最前端改写头真正到达浏览器。
4. 本项目模板已自动遵循，无需手写头；CloudFront/ESA 因不经本项目，缓存质量取决于**源站头 + 控制台规则**。
