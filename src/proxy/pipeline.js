/**
 * 代理管线编排
 * ----------------------------------------------------------------------------
 * 把匹配、安全、缓存、负载均衡、回源、响应改写串成一条完整链路。
 *
 * 完整流程：
 *   1.  匹配站点
 *   2.  安全校验（防盗链 / IP / UA / 签名 / 限速）
 *   3.  匹配规则
 *   4.  确定源站池
 *   5.  构造缓存键 & 判断是否绕过缓存
 *   6.  查边缘缓存，命中则直接返回
 *   7.  带故障转移地回源
 *   8.  先 clone 原始响应（必须在构造新响应之前）
 *   9.  改写响应头
 *   10. 异步写缓存
 *   11. 记录统计并返回
 *
 * 设计原则：任何一步抛异常都必须被兜住，返回 502/500 而不是让 Worker 崩溃。
 */

import { matchSite, matchRule } from './matcher.js';
import { buildClientHeaders } from './headers.js';
import { buildCacheKey, shouldBypassCache } from './cachekey.js';
import { buildOriginUrl, resolveHostHeader, mergeRewrite, mergeHeaderOps } from './rewrite.js';
import { getPool, getGlobal, getGlobalRules } from '../config/store.js';
import { renderDisguise } from './disguise.js';
import { PRODUCT_NAME, DEFAULT_FAILOVER } from '../config/defaults.js';
import { cacheMatch, cachePut, isCacheable } from '../platform/cache.js';
import { checkSecurity } from '../security/guard.js';
import { checkGlobalRateLimit } from '../security/ratelimit.js';
import { requestWithFailover } from '../balancer/failover.js';
import { eoEdgeFetch } from './engines/eoEdgeEngine.js';
import { record } from '../stats/collector.js';
import { selectOrigin } from '../balancer/strategy.js';

/**
 * 默认缓存策略：规则未配置 cache 时使用（保守起见默认不缓存）。
 */
const DEFAULT_POLICY = Object.freeze({
  enabled: false,
  edgeTtl: 0,
  browserTtl: 0,
  ignoreQuery: false,
  queryWhitelist: [],
});

/**
 * 取站点默认上游（「源站」实体，kind=single 的单一源站或 kind=pool 的源站池）。
 * 站点侧内联源站已废弃：站点统一只持 poolId，两种 kind 的解析路径完全一致。
 * 规则 action 后续可覆盖（见 runPipeline ⑤）。
 *
 * @param {Object} ctx 请求上下文
 * @param {Object} site 站点配置
 * @returns {Promise<Object|null>} 源站对象或 null（站点未绑定或目标已被删除）
 */
async function buildSitePool(ctx, site) {
  if (site.poolId) {
    const p = await getPool(ctx, site.poolId);
    if (p && Array.isArray(p.origins) && p.origins.length > 0) return p;
    return null;
  }
  // 向后兼容：升级前写入 KV 的旧站点仍带内联 origins，且尚未被重新保存过。
  // 数据面不能因为模型演进而 502，这里按旧语义临时组装一个匿名上游；
  // 用户下次在管理面保存该站点时会自动迁移成一条 kind='single' 源站。
  if (Array.isArray(site.origins) && site.origins.length > 0) {
    return {
      id: `__legacy_${site.host}`,
      kind: site.origins.length === 1 ? 'single' : 'pool',
      strategy: site.originStrategy || 'chain',
      origins: site.origins,
      failover: site.originFailover || DEFAULT_FAILOVER,
    };
  }
  return null;
}

/**
 * 处理一次代理请求。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Promise<Response>} 返回给客户端的响应
 */
export async function handleProxy(ctx) {
  try {
    // 全局入口限流：在所有站点匹配之前做一次轻量拦截，
    // 防止随机 Host 头扫描耗尽 Worker 资源。
    const globalCfg = await getGlobal(ctx);
    if (globalCfg && globalCfg.globalRateLimit > 0) {
      const r = checkGlobalRateLimit(globalCfg.globalRateLimit);
      if (r.limited) {
        return new Response('Too Many Requests', {
          status: 429,
          headers: {
            'Retry-After': String(r.retryAfter),
            'Content-Type': 'text/plain',
          },
        });
      }
    }
    return await runPipeline(ctx);
  } catch (err) {
    // 兜底：任何未预期的异常都转成 500，绝不让 Worker 抛到运行时
    return errorResponse(
      500,
      'Internal Error',
      `Pipeline failure: ${err?.message || String(err)}`,
      ctx
    );
  }
}

/**
 * 管线主体。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Promise<Response>} 响应
 */
async function runPipeline(ctx) {
  // ---- 1. 匹配站点 ----
  const site = await matchSite(ctx);
  if (!site) {
    // 未匹配到站点：返回伪装页，不泄露 host、也不暴露本网关的存在
    let disguise;
    try {
      disguise = (await getGlobal(ctx))?.disguise;
    } catch {
      disguise = undefined; // 读配置失败则用默认静态伪装
    }
    const res = await renderDisguise(ctx, disguise);
    recordSafely(ctx, { status: res.status, cacheHit: 'BYPASS' });
    return res;
  }

  // ---- 2. 安全校验 ----
  // checkSecurity 返回 null 表示放行，否则直接返回它给出的拒绝响应
  const blocked = await checkSecurity(ctx, site);
  if (blocked) {
    recordSafely(ctx, { status: blocked.status, cacheHit: 'BYPASS', blocked: true });
    return blocked;
  }

  // ---- 3. 首要分流：先选定本次回源对象（选源站）----
  // 这是整条管线的「首要规则条件」：在安全校验通过后、规则引擎匹配之前，先按站点级
  // 默认上游（site.poolId 指向的源站实体）选出本次要回源的 origin 对象。
  //   - 单一源站（kind=single，恰好 1 个 origin） → 直接返回该源站
  //   - 源站池（kind=pool，多源站） → 按负载均衡策略（chain/rr/random/weighted/iphash）选出一个
  // 选出的对象写入 ctx.origin，作为后续规则引擎的「origin 维度」：
  //   ori1 AND 规则引擎 / ori2 AND 规则引擎 … 的分支即由此产生（一次请求只落在一个 origin 上）。
  // 规则引擎若想「按源站分流」可直接用 origin 条件匹配；
  // 规则 action 仍可用 poolId/inlineOrigins 覆盖本次选中的源站（见 ④）。
  const defaultPool = await buildSitePool(ctx, site);
  if (!defaultPool) {
    return errorResponse(500, 'Config Error', `Site "${site.host}" has no usable origin (poolId="${site.poolId || ''}")`, ctx);
  }
  let primaryOriginActual = selectOrigin(defaultPool, ctx, []);
  if (!primaryOriginActual) {
    return errorResponse(502, 'No Origin', `No enabled origin in site "${site.host}"`, ctx);
  }
  ctx.origin = primaryOriginActual; // 注入规则引擎匹配维度

  // ---- 4. 匹配规则（此时 ctx.origin 已就绪，规则可匹配 origin / originAddr）----
  let rule = matchRule(site, ctx);

  // ---- 4.1 全站通用规则（兜底）----
  // 站点自身规则未命中时，回退到「全站通用规则」：对所有站点生效、优先级最低，
  // 相当于 EO 的全局默认规则。命中即采用，并标记为兜底来源（stats 可区分）。
  let ruleSource = 'site';
  if (!rule) {
    try {
      const globalRules = await getGlobalRules(ctx);
      if (Array.isArray(globalRules) && globalRules.length > 0) {
        rule = matchRule({ rules: globalRules }, ctx);
        if (rule) ruleSource = 'global';
      }
    } catch {
      // 读取兜底规则失败时不影响站点自身逻辑
    }
  }

  // ---- 4.5 终止型动作 ----
  // 这三类动作不回源，命中即返回。顺序有讲究：
  //   forceHttps 最先（协议纠正应在任何业务逻辑之前）
  //   directResponse 优先于 redirect（显式指定响应体的意图更强）
  const terminal = applyTerminalActions(ctx, rule);
  if (terminal) {
    recordSafely(ctx, { status: terminal.status, cacheHit: 'BYPASS' });
    return terminal;
  }

  // 解析回源 Host（规则级 hostHeader 优先，inherit 时回退站点 defaultHostHeader）
  const effectiveHostHeader = resolveHostHeader(rule?.action?.hostHeader, site.defaultHostHeader);

  // ---- 5. 确定实际源站池（规则可覆盖首要分流的选源）----
  // 优先级：规则级内联源站 > 规则级 poolId（引用任意源站实体）> 站点级默认（已在③选好）。
  // 多数情况下规则不指定 pool，则沿用③选出的 primaryOrigin；规则指定则重新构建并再选一次。
  const ra = rule?.action || {};
  let pool = defaultPool;
  let poolSource = 'site-default';

  if (Array.isArray(ra.inlineOrigins) && ra.inlineOrigins.length > 0) {
    // 规则级内联源站（规则里直接填写回源域名，写到 action.inlineOrigins）
    pool = {
      id: `__rule_inline_${site.host}`,
      strategy: 'chain',
      origins: ra.inlineOrigins,
      failover: defaultPool.failover || DEFAULT_FAILOVER,
    };
    poolSource = 'rule-inline';
  } else {
    const poolId = ra.poolId;
    if (poolId) {
      pool = await getPool(ctx, poolId);
      poolSource = `pool:${poolId}`;
      if (!pool || !Array.isArray(pool.origins) || pool.origins.length === 0) {
        return errorResponse(502, 'Config Error', `Origin "${poolId}" is empty or missing`, ctx);
      }
    }
    // 规则未指定 poolId/inlineOrigins → 沿用③的 defaultPool + primaryOrigin
  }

  // 若规则重新指定了源站池，需要再选一次（此时 ctx.origin 同步更新，
  // 供后续回源/缓存按「实际选中的源站」生效）
  if (poolSource !== 'site-default') {
    const reSelected = selectOrigin(pool, ctx, []);
    if (!reSelected) {
      return errorResponse(502, 'No Origin', `No enabled origin in ${poolSource}`, ctx);
    }
    ctx.origin = reSelected;
    primaryOriginActual = reSelected;
  }
  const originCache = primaryOriginActual?.cache || {};
  const ruleCache = rule?.action?.cache || {};
  const policy = { ...DEFAULT_POLICY, ...originCache, ...ruleCache };
  const bypass = shouldBypassCache(ctx, policy);

  let cacheKey = null;
  if (!bypass && ctx.caps?.hasEdgeCache) {
    // 合并源站级 rewrite + 规则级 rewrite 用于构造缓存键
    const mergedRewrite = mergeRewrite(primaryOriginActual.rewrite, rule?.action?.rewrite);
    const keyUrl = buildOriginUrl(ctx, primaryOriginActual, { action: { rewrite: mergedRewrite } }, effectiveHostHeader);
    // cacheGen 是站点级的「缓存代次」，管理面执行整站清除缓存时会 +1，
    // 从而让所有旧缓存键失效（Cache API 没有按前缀批量删除的能力）
    cacheKey = buildCacheKey(ctx, policy, keyUrl, { cacheGen: site.cacheGen || 0 });
  }

  // ---- 6. 查缓存 ----
  if (cacheKey) {
    const hit = await cacheMatch(ctx, cacheKey);
    if (hit) {
      ctx.debug.cache = 'HIT';
      // 响应头改写合并：源站级打底，规则级覆盖（用实际选中的源站，而非首选）
      const hitOrigin = pool?.origins?.find(o => o.id === ctx.debug.originId) || primaryOriginActual;
      const mergedRespHeaders = mergeHeaderOps(hitOrigin.respHeaders, rule?.action?.respHeaders);
      const headers = buildClientHeaders(ctx, hit, policy, mergedRespHeaders);
      recordSafely(ctx, { status: hit.status, cacheHit: 'HIT' });
      return new Response(hit.body, {
        status: hit.status,
        statusText: hit.statusText,
        headers,
      });
    }
    ctx.debug.cache = 'MISS';
  } else {
    // 区分「策略关了/请求不可缓存」与「平台不支持边缘缓存」
    // 区分三种情况：
    //  - 平台支持 caches.default（CF）：缓存由 caches API 托管
    //  - 平台不支持 caches.default（EO 等）：响应头仍下发 CDN-Cache-Control，
    //    由底层边缘按响应头缓存 —— 用 EDGE_HEADER 标明「靠响应头委托边缘缓存」
    //  - 策略关闭或请求不可缓存：BYPASS
    ctx.debug.cache = policy.enabled && !ctx.caps?.hasEdgeCache ? 'EDGE_HEADER' : 'BYPASS';
  }

  // ---- 7. 回源（带故障转移 / 或委托 EO 边缘节点缓存）----

  // 路径 A（仅 EO）：当「无自定义回源 Host + 可缓存」时，用同站 fetch 委托 EO 节点缓存。
  // 官方机制：边缘函数内 fetch(同站加速域名) 且 HOST/host 头一致 → 走 EO 节点缓存，
  // 命中零函数调用、未命中则由 EO 按平台源站组回源。这样 EO 真正承担 CDN 角色，
  // 项目只做高级定制（鉴权/改写/多源站逻辑仍在函数内，仅可缓存纯静态走边缘）。
  // 有自定义回源 Host 的请求必须走 failover（同站 fetch 无法表达自定义 Host），
  // 此时由项目多源站逻辑回源 + 响应头委托 EO 边缘缓存（路径 B），灵活度优先。
  const delegateEoEdge =
    ctx.caps?.eoEdgeCache &&
    !effectiveHostHeader &&
    cacheKey &&
    safeIsCacheable(ctx, cacheKey, new Response(null, { status: 200 }), policy);

  let originResp;
  if (delegateEoEdge) {
    ctx.debug.cachePath = 'A_EO_EDGE';
    originResp = await eoEdgeFetch(ctx, ctx.request, policy);
  } else {
    originResp = await requestWithFailover(ctx, pool, rule, effectiveHostHeader);
  }

  // ---- 8. 先 clone 原始响应 ----
  // 关键修复：必须在「基于 originResp.body 构造新响应」之前 clone。
  // 旧版是先构造出最终响应再 clone 它，此时 body 已经开始被客户端消费，
  // clone 出来的分支会被迫在内存里缓冲全部数据，大文件下直接触发内存背压甚至 OOM。
  // 在源头 clone，两个分支可以同步流式推进，内存占用恒定。
  let toCache = null;
  const willCache =
    cacheKey && safeIsCacheable(ctx, cacheKey, originResp, policy);
  if (willCache) {
    toCache = originResp.clone();
  }

  // ---- 9. 改写响应头 ----
  // 响应头改写合并：使用 ctx 中记录的当前选中源站（在 failover 中更新），取其源站级配置
  const currentOrigin = pool?.origins?.find(o => o.id === ctx.debug.originId) || primaryOriginActual;
  // 缓存 TTL 按「实际选中的源站」生效：规则级 cache 优先，未配置时退回该源站级 cache。
  // （缓存键仍用 primaryOrigin，避免改动回源前时序；同池源站 cache 通常一致，差异时以实际源站为准下发响应头）
  const selOriginCache = currentOrigin?.cache || {};
  if (ruleCache.enabled === undefined && selOriginCache.enabled !== undefined) policy.enabled = selOriginCache.enabled;
  if (!ruleCache.edgeTtl && selOriginCache.edgeTtl) policy.edgeTtl = selOriginCache.edgeTtl;
  if (!ruleCache.browserTtl && selOriginCache.browserTtl) policy.browserTtl = selOriginCache.browserTtl;
  const mergedRespHeaders = mergeHeaderOps(currentOrigin.respHeaders, rule?.action?.respHeaders);
  const headers = buildClientHeaders(ctx, originResp, policy, mergedRespHeaders);
  const clientResp = new Response(originResp.body, {
    status: originResp.status,
    statusText: originResp.statusText,
    headers,
  });

  // ---- 10. 异步写缓存 ----
  if (willCache && toCache) {
    // 写入缓存的是「带最终响应头的版本」，这样下次命中时 Cache-Control 等头是一致的
    const cacheResp = new Response(toCache.body, {
      status: toCache.status,
      statusText: toCache.statusText,
      headers: new Headers(headers),
    });
    ctx.waitUntil(
      cachePut(ctx, cacheKey, cacheResp).catch(() => {
        // 写缓存失败不影响本次响应
      })
    );
  }

  // ---- 11. 统计 ----
  recordSafely(ctx, {
    status: originResp.status,
    cacheHit: ctx.debug.cache === 'HIT' ? 'HIT' : ctx.debug.cache === 'MISS' ? 'MISS' : undefined,
    originId: ctx.debug.originId,
  });

  return clientResp;
}

/**
 * 执行终止型动作（强制 HTTPS / 直接响应 / URL 重定向）。
 *
 * 返回非 null 表示本次请求就此结束，不再回源。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object|null} rule 命中的规则
 * @returns {Response|null} 终止响应，或 null 表示继续管线
 */
function applyTerminalActions(ctx, rule) {
  const a = rule?.action;
  if (!a) return null;

  // ---- 强制 HTTPS ----
  // 只在确实是 http 时跳转，避免已经是 https 还 301 造成无限循环
  if (a.forceHttps && ctx.url.protocol === 'http:') {
    const target = new URL(ctx.url.href);
    target.protocol = 'https:';
    return new Response(null, {
      status: a.forceHttpsStatus || 301,
      headers: {
        Location: target.toString(),
        'Cache-Control': 'no-store',
        Server: PRODUCT_NAME,
        Via: `1.1 ${PRODUCT_NAME}`,
      },
    });
  }

  // ---- 自定义直接响应 ----
  if (a.directResponse?.enabled) {
    const dr = a.directResponse;
    return new Response(dr.body || '', {
      status: dr.status || 200,
      headers: {
        'Content-Type': dr.contentType || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        Server: PRODUCT_NAME,
        Via: `1.1 ${PRODUCT_NAME}`,
      },
    });
  }

  // ---- 访问 URL 重定向 ----
  if (a.redirect?.enabled && a.redirect.target) {
    const loc = buildRedirectTarget(ctx, rule, a.redirect);
    if (loc) {
      return new Response(null, {
        status: a.redirect.status || 302,
        headers: { Location: loc, 'Cache-Control': 'no-store', Server: PRODUCT_NAME, Via: `1.1 ${PRODUCT_NAME}` },
      });
    }
  }

  return null;
}

/**
 * 构造重定向目标 URL。
 *
 * 支持 $1..$9 引用 match.pathRegex 的捕获组，便于做路径搬迁类跳转。
 * 相对路径会基于当前请求 URL 解析为绝对地址（Location 头要求绝对 URL 更稳妥）。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} rule 命中的规则
 * @param {Object} redirect 重定向配置
 * @returns {string} 目标 URL，构造失败返回空串
 */
function buildRedirectTarget(ctx, rule, redirect) {
  let target = String(redirect.target || '');

  // 用 pathRegex 的捕获组替换 $1..$9
  const re = rule?.match?.pathRegex;
  if (re && /\$[1-9]/.test(target)) {
    try {
      const m = new RegExp(re).exec(ctx.url.pathname);
      if (m) {
        target = target.replace(/\$([1-9])/g, (_, d) => m[Number(d)] ?? '');
      }
    } catch {
      /* 正则异常时保持原样 */
    }
  }

  let url;
  try {
    url = new URL(target, ctx.url.href);
  } catch {
    return '';
  }

  // 保留原查询串：已有同名参数以目标 URL 为准，不覆盖
  if (redirect.keepQuery) {
    for (const [k, v] of ctx.url.searchParams) {
      if (!url.searchParams.has(k)) url.searchParams.append(k, v);
    }
  }

  return url.toString();
}

/**
 * 安全地调用 isCacheable，任何异常都视为不可缓存。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Request} cacheKey 缓存键
 * @param {Response} resp 源站响应
 * @param {Object} policy 缓存策略
 * @returns {boolean} 是否可缓存
 */
function safeIsCacheable(ctx, cacheKey, resp, policy) {
  try {
    return isCacheable(cacheKey, resp, policy) === true;
  } catch {
    return false;
  }
}

/**
 * 安全地记录统计，绝不因统计失败影响主流程。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} entry 统计条目
 * @returns {void}
 */
function recordSafely(ctx, entry) {
  try {
    record(ctx, {
      host: ctx.url.hostname,
      path: ctx.url.pathname,
      method: ctx.request.method,
      duration: Date.now() - ctx.startTime,
      ...entry,
    });
  } catch {
    /* 统计失败静默忽略 */
  }
}

/**
 * 构造统一的错误响应（纯文本，带调试头）。
 *
 * @param {number} status HTTP 状态码
 * @param {string} title 错误标题
 * @param {string} detail 错误详情
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @returns {Response} 错误响应
 */
function errorResponse(status, title, detail, ctx) {
  const headers = new Headers({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });

  if (ctx?.debug) {
    if (ctx.debug.siteId) headers.set('X-Site-Id', ctx.debug.siteId);
    if (ctx.debug.ruleId) headers.set('X-Rule-Id', ctx.debug.ruleId);
    if (Array.isArray(ctx.debug.tried) && ctx.debug.tried.length) {
      headers.set('X-Tried-Origins', ctx.debug.tried.join(','));
    }
  }
  if (ctx?.startTime) {
    headers.set('X-Edge-Time', `${Date.now() - ctx.startTime}ms`);
  }
  // 错误响应同样注入品牌头，避免泄漏上游平台身份
  headers.set('Server', PRODUCT_NAME);
  headers.set('Via', `1.1 ${PRODUCT_NAME}`);

  return new Response(`${title}\n\n${detail}\n`, { status, headers });
}

/**
 * 合并路径重写与 HeaderOps 的实现见 ./rewrite.js（与回源路径共用同一份逻辑，避免重复）。
 */
