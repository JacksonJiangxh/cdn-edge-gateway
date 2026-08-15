# 08 · 常见问题（FAQ）

> [!NOTE]
> **本文面向**：普通用户（排坑合集）。
> 想看状态码含义去 [附录 · 状态码](/appendix/status-codes.md)；想看 502 专项去 [附录 · 502](/appendix/502.md)。

---

## 部署类

**Q：必须买服务器吗？**
A：不用。它跑在 Cloudflare / EdgeOne / 阿里云 ESA 的边缘上，用它们的免费额度。

**Q：部署到 EdgeOne 一直报错？**
A：99% 是没设 `CLOUD_PLATFORM=eo`。设了再 `npm run build && edgeone pages deploy .`。

**Q：`npm run deploy:cf` 卡在登录？**
A：首次需浏览器登录 Cloudflare。登录后重跑即可。也可在控制台粘贴 `_worker.js`（路线 A.1，零工具）。

**Q：自定义域名怎么绑？**
A：CF Workers/Pages 在平台设置「绑定自定义域」加 DNS；EO/ESA 在各自控制台绑。

---

## 配置类

**Q：改完配置不生效？**
A：管理面改完要点「**保存并发布**」。只存草稿不生效（新手头号坑）。

**Q：站点创建后还是 502？**
A：站点必须引用源站池 `poolId` 或直接填 `origins`，否则网关不知道去哪取数据。

**Q：防盗链把自家图也拦了？**
A：`refererCheck.allow` 加上你的域名；或 `refererCheck` 设「空 Referer 放行」（自己站 `<img>` 常不带 Referer）。

**Q：想加签名 URL 防盗刷？**
A：**当前代码版本不支持签名 URL**（单轨化时已移除该功能），用防盗链 + 限流替代。

---

## 缓存类

**Q：命中率一直是 0？**
A：检查规则 `stages.cache.enabled=true`；确认没缓存带 Set-Cookie 的私有响应。

**Q：EdgeOne 清了缓存还是旧的？**
A：EO 节点本地缓存，`delete` 只清当前节点。改 `global.cacheGen` +1 让旧键整体失效。

**Q：缓存键太多份（命中低）？**
A：关掉无意义查询参数（`cacheKey.includeQuery=false`），别让同一内容按参数存成几百份。

---

## 性能 / 排障类

**Q：回源超时 504？**
A：源站响应 > 30s。调大 `defaultUpstreamTimeoutMs`，或优化源站。

**Q：源站偶尔抽风被拉黑？**
A：开了被动熔断（`enableCircuitBreaker`）。熔断是保护机制，源站稳定后会半开探测恢复。

**Q：管理面打不开？**
A：路径默认 `__panel`；确认 `adminPath`；检查 `caps` 里平台能力是否正常（`/__health`）。

**Q：怎么确认平台能力探测对不对？**
A：`curl https://你的网关域名/__health` 看 `caps` 字段（是否有 KV、能否 TCP 回源等）。

---

## 安全类

**Q：怎么挡爬虫刷量？**
A：安全里开 UA 黑名单（`curl`/`python-requests`）+ 限流（`rateLimit`）。

**Q：IP 被攻击怎么封？**
A：`ipBlacklist` 加 IP；`ipWhitelist` 可做白名单优先放行。

---

## 下一步

用户篇到此结束。想读代码 / 本地调试 / 部署 ESA，进 [开发者篇](/dev/09-local-development.md)。
