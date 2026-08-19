/**
 * 缓存管理 API handlers
 *
 * 三平台（CF / EO / ESA）的 Cache API 均只提供按精确 URL 删除的能力，
 * 没有「按前缀批量清除」的原生 API。因此：
 *   - 按 URL 清除：真实生效
 *   - 按前缀/整站清除：通过「缓存代次(generation)」间接实现 —— 递增站点的
 *     cacheGen 值，使新请求生成的缓存键全部变化，旧缓存自然失效并最终被 LRU 淘汰。
 *
 * 平台差异（详见 docs/11-architecture.md §4.1）：
 *   - EO 的 caches.default 仅节点本地化、不跨节点复制，delete 仅删当前节点实例；
 *   - ESA 的 cache.delete 同样仅作用当前节点，且存入条目仍须 TTL 到期才真正失效；
 *     此外 ESA 的 Cache 操作与 fetch 共享子请求预算（保守取 4，官方两处文档冲突待实测）。
 */

import { ok, fail } from '../../utils/response.js';
import { ERROR_CODES } from '../../contracts.js';
import { getSite, putSite } from '../../config/store.js';
import { cacheDelete } from '../../platform/cache.js';

/** POST /cache/purge  body: { host?, prefix?, urls?[] } */
export async function purge(ctx) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400);
  }

  if (!ctx.caps.hasEdgeCache) {
    return ok({
      purged: 0,
      message:
        '当前平台不支持边缘缓存 API，无需清除。缓存由平台 CDN 依据 Cache-Control 管理。',
    });
  }
  // 三平台（CF/EO/ESA）均已原生支持 Cache API，purge 真实生效；
  // ESA 受「32 子请求共享预算 + 节点本地化」约束，delete 仅清当前节点。
  if (ctx.caps.cacheSingleInstance) {
    // ESA：单实例 cache.delete 仅作用于当前节点，无法跨节点主动刷新。
    // 大规模清除请结合「缓存代次」使旧键整体失效。
  }

  const results = { byUrl: 0, byGeneration: null, failed: [] };

  // ---- 1. 按精确 URL 清除 ----
  if (Array.isArray(body.urls) && body.urls.length > 0) {
    if (body.urls.length > 100) {
      return fail(ERROR_CODES.BAD_REQUEST, '单次最多清除 100 个 URL', 400);
    }
    for (const u of body.urls) {
      try {
        const okDel = await cacheDelete(ctx, String(u));
        if (okDel) results.byUrl++;
      } catch (e) {
        results.failed.push({ url: u, reason: e.message });
      }
    }
  }

  // ---- 2. 按站点/前缀清除：递增缓存代次 ----
  if (body.host) {
    const host = String(body.host).toLowerCase();
    const site = await getSite(ctx, host, { exact: true });
    if (!site) {
      return fail(ERROR_CODES.NOT_FOUND, `站点不存在: ${host}`, 404);
    }
    site.cacheGen = (Number(site.cacheGen) || 0) + 1;
    site.updatedAt = Date.now();
    await putSite(ctx, site);
    results.byGeneration = {
      host,
      generation: site.cacheGen,
      note: '已递增缓存代次，新请求将全部回源；旧缓存条目会被边缘自动淘汰',
    };
  }

  if (results.byUrl === 0 && !results.byGeneration) {
    return fail(
      ERROR_CODES.BAD_REQUEST,
      '请至少指定 urls 或 host 之一',
      400
    );
  }

  return ok(results);
}
