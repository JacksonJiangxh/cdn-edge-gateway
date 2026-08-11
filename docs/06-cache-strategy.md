# 06 · 缓存策略

> **全链路缓存策略矩阵（四厂商 + 本项目）**
>
> 上一篇：[05 管理面使用教程](./05-user-guide.md) ｜ 下一篇：[07 EdgeOne 回源 Host 配置](./07-eo-origin-host.md)
>
> 返回 [项目首页](../README.md)

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
- 源站组 + 回源 Host 重写需预配（见 `docs/07-eo-origin-host.md`）。

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


---

## 分层缓存架构部署方案（CF 两层 / EO 三层）

本架构核心思想：**让边缘函数只在「必须回源」时才被调用，可缓存内容由最前端的 CDN 边缘直接命中（函数零调用）；只有未命中回源、或不可缓存/需鉴权的请求，才落到边缘函数享受灵活 LB 与规则。** 缓存铁律（最前端 CDN 为主）：**边缘半年、浏览器 30 分钟、清除源站带回的不缓存头，最终以最前端 CDN 改写后的响应下发给用户。**

**固定路径（所有规则必须按此逐层定义）**：
```
浏览器 → 最前端 CDN（四选一）：
   ├─ Cloudflare (CF)    → 本项目(_worker.js) → 源站
   ├─ EdgeOne (EO)       → 本项目(Makers)    → 源站
   ├─ AWS CloudFront     → 源站（直接，不经本项目）
   └─ 阿里云 ESA         → 源站（直接，不经本项目）
```
> 完整四厂商 + 本项目的缓存头语义差异、逐厂商规则清单、联动总表见 **`docs/06-cache-strategy.md`**（本专章只展开 CF / EO；CloudFront / ESA 直接走源站，缓存靠源站头 + 控制台规则）。
**四层责任矩阵（每一层该设什么）**：

| 层 | 责任 | 关键规则 |
|---|---|---|
| ① 最前端 CDN（CF/EO） | 最终缓存决策 + 最终下发给浏览器的头 | CF：Cache Rules + Cache Response Rules；EO：站点规则（含响应头改写）。**强制剥离 `no-store`/`private`/`Set-Cookie`/`Pragma`**，下发 `public`+`immutable` |
| ② 本项目（Worker/Makers） | 函数层兜底头，自动遵循铁律 | `src/proxy/headers.js` 的 `buildClientHeaders`：可缓存响应自动下发 `Cache-Control: public, max-age=1800, immutable` + `CDN-Cache-Control: public, max-age=15552000`，并**主动剥离源站不缓存头**（见下） |
| ③ 源站 | 只产出内容，不负责缓存策略 | 源站头被①层（Ignore/改写）和②层（剥离）双重否决，不缓存信号不会泄漏到最前端 |

**本项目已自动遵循铁律（模板开箱即用）**：`src/proxy/headers.js` 中 `buildClientHeaders` 在可缓存响应时：
- 浏览器：`Cache-Control: public, max-age=<browserTtl>, immutable`（immutable 只给浏览器）
- 边缘：`CDN-Cache-Control: public, max-age=<edgeTtl>`（独立维度，不混入 Cache-Control）
- **兜底剥离**源站带回的 `set-cookie`/`pragma`/`no-store`/`private`/`expires=0`，确保最前端能缓存
- TTL 回落默认：开启 `cache.enabled` 但未给 TTL 时，自动用 `edgeTtl=15552000s（半年）`/`browserTtl=1800s（30 分钟）`（常量 `TIER_CDN_DEFAULT_EDGE_TTL`/`TIER_CDN_DEFAULT_BROWSER_TTL`）

> 因此「本项目层」无需用户手写头——模板已按路径铁律自动下发；CF/EO 面板规则是把最前端权威再钉死一层。

### A. Cloudflare（两层域名，无中间域名）

CF 的 Worker 可直接作为 `cdn.example.com` 的「源」，因此 CDN 层与函数层合并在同一域名，无需 EO 那样的中间域名。

**域名与 DNS**
| 域名 | 类型 | 说明 |
|---|---|---|
| `cdn.example.com` | CNAME（橙云 Proxied） | 对外唯一入口，CF 自动处理 DNS+代理 |
| `origin-1.net` / `origin-2.net` | 不归 CF 管 | 真实后端源站，任意域名，无需进 CF DNS |

**部署步骤**
1. `npm run build && npx wrangler deploy` 部署 `_worker.js`。
2. **Settings → Domains & Routes → Add Custom Domain** 绑 `cdn.example.com`（CF 自动加 DNS + 橙云）。
3. **Settings → Cache → "Cache responses from fetch handlers" = Enabled**。
4. **Cache Rules（请求/命中侧，决定"存不存/存多久"）**：`Rules → Cache Rules`：
   - 可缓存路径（`/img/*`、`/static/*`）：`Cache eligibility = Eligible`、`Edge TTL = Override, 15552000s（半年）`、`Browser TTL = Override, 1800s（30 分钟）`、`Origin Cache-Control = Ignore if present`（用规则说了算，否决源站 `no-store`/`private`，否则源站禁缓存头会让边缘不存）。
   - 必进函数（`/api/*`、`/__panel/*`）：`Cache eligibility = Bypass`（永远回源进 Worker，不缓存）。
5. **Cache Response Rules（响应侧，决定"下发给客户端的头长什么样"）**：`Rules → Cache Rules → Cache Response Rules`：
   - **`cloudflare_only`（仅 Cloudflare 边缘生效）开关必须「关闭」**——开启后改写的头只作用在边缘、不下发给浏览器，违背「以最前端 CDN 响应为主」原则。
   - 可缓存路径（状态 200 且 `/img/*`、`/static/*`）完整头设置：
     - `Cache-Control: public, max-age=1800, immutable`（下发给浏览器：允许缓存、30 分钟、内容不变勿发条件请求）
     - `CDN-Cache-Control: public, max-age=15552000`（给 CF 边缘看：半年）
     - `Cache-Tag: img-assets`（供按标签精确 purge）
     - **移除**源站可能带回的 `Set-Cookie` / `Pragma` / `no-store` / `private`（清掉一切不缓存信号，确保边缘真存）
   - 不可缓存路径（状态非 200 或 `/api/*`）：`Cache-Control: no-store`（确保不落边缘、必回源）
6. **本项目 Worker（兜底/跨平台头）**：`src/proxy/cache.js` 已对可缓存响应下发 `Cache-Control` + `CDN-Cache-Control`。CF 上这套头的角色降为**兜底**——若 Cache Response Rules 未命中（如新路径），由代码头接住；EO 上则**完全依赖**这套头（见下）。代码侧无需为 CF 改逻辑，但需保证：可缓存响应带 `public`、不带 `no-store`；不可缓存响应带 `no-store`。
7. 函数内 `requestWithFailover` 选 `origin-1/2.net` 回源即可（本项目已就绪）。

> CF 上「函数当源」是标准姿势：可缓存请求命中 CDN 边缘直接返回、零 Worker 调用；未命中才回源进函数做 LB。

### B. EdgeOne（三层域名，需中间函数域名）

EO 的 Makers 只能「挂在某个加速域名上」、不能当独立源，故需显式拆出「函数域名」作为 CDN 层的源站，形成三层。

**三层域名**
| 层 | 域名 | 角色 | 是否跑函数 |
|---|---|---|---|
| ① CDN 层 | `cdn.example.com` | EO 加速域名，**纯 CDN + 缓存**，**不挂 Makers** | 命中即零函数调用 |
| ② 函数/回源层 | `edge.example.com` | EO 加速域名，**挂 Makers 函数**，作为 ① 的「源站」 | 回源时才跑 |
| ③ 真实源站层 | `origin-1.net` / `origin-2.net` | 后端存储，任意域名 | 不跑 |

**部署步骤**
1. 部署 `_worker.js` / `edge-functions/[[default]].js` 到 Makers（流水线或控制台），**绑定到 `edge.example.com`**（Makers 触发路由 `/*`）。
2. **`edge.example.com` 控制台配源站组 + 回源 Host 重写**（见 `docs/07-eo-origin-host.md`），指向 `origin-1/2.net`——这是路径 A 生效前提，也是函数回源前提。
3. **`cdn.example.com` 控制台**：加速域名开启，**源站指向 `edge.example.com`**（即把函数域名当源站），开启 EO 节点缓存。
4. **`cdn.example.com` 站点规则（EO 控制台，最前端缓存决策）**：
   - 可缓存路径（`/img/*`、`/static/*`）：开启「节点缓存」，**边缘缓存 TTL = 15552000s（半年）**，浏览器缓存 TTL = 1800s（30 分钟）；并在「响应头改写」里下发 `Cache-Control: public, max-age=1800, immutable`、`CDN-Cache-Control: public, max-age=15552000`，**剥离源站 `Set-Cookie`/`Pragma`/`no-store`/`private`**（EO 站点规则的响应头改写即等价于 CF 的 Cache Response Rules）。
   - 不可缓存路径（`/api/*`、`/__panel/*`）：节点缓存设为「不缓存」或下发 `no-store`，确保必回源进函数。
5. **`edge.example.com` 的 Makers 规则（函数侧，回源与响应头）**：
   - Makers 触发路由 `/*`（或仅 `/img/*` 等）绑定到本项目 `_worker.js`。
   - 函数内 `requestWithFailover` 选 `origin-1/2.net` 回源；回响应时由 `src/proxy/cache.js` 下发 `Cache-Control` + `CDN-Cache-Control`（**路径 B 响应头委托**）——这是 ① 层 `cdn.example.com` 缓存的依据。**关键点**：Makers 函数下发的头必须带 `public`、不带 `no-store`，否则会被 ① 层站点规则的 `no-store` 之外逻辑覆盖；而 ① 层已配置「忽略/剥离源站不缓存头」，故函数返回的可缓存头能顺利被 ① 层缓存。
   - 若走**路径 A 同站 fetch**（`fetch(edge.example.com/...)` 同站、无自定义回源 Host），则由 EO 节点缓存直接命中、零函数调用，TTL 同样由 ① 层站点规则控制。

**链路验证**
```
浏览器 → cdn.example.com（层① EO 边缘）
   ├ 命中缓存 → 直接返回，函数零调用 ✓
   └ 未命中 → 回源到 edge.example.com（层②）→ 调起 Makers 函数
                                   → LB 选 origin-1/2.net（层③）→ 响应带回 CDN-Cache-Control
      层① 缓存住，下次命中
```

> EO 上「函数域名当源站」是复刻 CF 分层架构的关键招。若嫌两层 EO 域名麻烦，也可层①直接挂 Makers + 用路径 A 同站 fetch，但首次请求函数必跑一次，不如本方案彻底省额度。

### 四层规则联动总表（以最前端 CDN 为最终依据）

缓存由各层头/规则**叠加**决定，优先级从高到低，**高优先级一旦否决（如 `no-store`）低优先级无效**：

| 平台 | ① 最前端 CDN 层（最终下发） | ② 函数/回源层 | ③ 本项目 Worker（`src/proxy/cache.js`） | ④ 真实源站 |
|---|---|---|---|---|
| **CF** | **Cache Response Rules**（改 `Cache-Control`/`CDN-Cache-Control`/`Cache-Tag`，剥 `no-store`）+ **Cache Rules**（Edge/Browser TTL） | N/A（函数即源，无独立层） | 下发 `Cache-Control`+`CDN-Cache-Control` 作**兜底** | 原始头被 `Origin Cache-Control=Ignore` 否决 |
| **EO** | **站点规则**（节点缓存 TTL + 响应头改写，剥 `no-store`） | **Makers 触发路由 + 函数返回头**（路径 B 响应头委托） | 同左（函数内 `cache.js` 下发头，即 Makers 层） | 原始头被站点规则改写/剥离 |

**完整头指令语义（避免互相打架）**：
- `public`：给**边缘**看，"允许我缓存"。必须出现在边缘侧头（`CDN-Cache-Control` 或 EO 站点规则），缺它会因默认 `private` 假设而不缓存。
- `no-store`：**最强否决**。任一层出现即整条链路不缓存。故"可缓存内容"必须在最前端规则层（CF Cache Response Rules / EO 站点响应头改写）**显式移除**源站带回的 `no-store`/`private`/`Set-Cookie`/`Pragma`。
- `max-age` / `s-maxage`：浏览器用 `Cache-Control: max-age`（30 分钟）、边缘用 `CDN-Cache-Control: max-age`（半年）；两值独立，互不覆盖。
- `immutable`：只给**浏览器**（`Cache-Control` 里），告知内容永不变、别发条件请求；**不要**写进 `CDN-Cache-Control`（边缘不需要它）。
- `Cache-Tag`：仅 CF 用，配合 Cache Response Rules 设置，供「按标签 purge」精确清除（本项目 `cacheGen` 在 CF 上可用 `Cache-Tag` 增强）。

**最前端 CDN 为最终依据的操作口诀**：
1. 可缓存路径：最前端层**强制覆盖** Edge/Browser TTL + 下发完整 `public` 头 + **剥掉一切 `no-store`/`private`**；Worker/源站头仅作兜底。
2. 不可缓存路径：最前端层**显式 `no-store`**，确保必回源进函数。
3. `cloudflare_only`（CF）保持关闭，让最前端改写的头真正到达浏览器。

---

