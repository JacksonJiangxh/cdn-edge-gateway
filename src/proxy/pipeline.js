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

import { matchSite, matchRuleByStage } from './matcher.js';
import { buildClientHeaders, getBrandHeaders } from './headers.js';
import { buildCacheKey, shouldBypassCache } from './cachekey.js';
import { buildOriginUrl, resolveHostHeader, mergeRewrite, mergeHeaderOps, mergeStageHeaderOps } from './rewrite.js';
import { getPool, getGlobal, getGlobalRules } from '../config/store.js';
import { renderDisguise } from './disguise.js';
import { DEBUG_HEADER_NAMES, DEFAULT_FAILOVER, DEFAULT_GLOBAL_RULES, deepClone } from '../config/defaults.js';
import { STAGE_ORDER } from '../config/stages.js';
import { cacheMatch, cachePut, isCacheable } from '../platform/cache.js';
import { checkSecurity } from '../security/guard.js';
import { checkGlobalRateLimit } from '../security/ratelimit.js';
import { requestWithFailover } from '../balancer/failover.js';
import { eoEdgeFetch } from './engines/eoEdgeEngine.js';
import { record } from '../stats/collector.js';
import { selectOrigin } from '../balancer/strategy.js';
import { expandVars } from '../config/vars.js';

/** 朴素的「是普通对象」判断（避免引入 schema 内部依赖）。 */
function isObj(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

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
      'Internal Server Error',
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
  // ---- 0. 预取全站兜底规则（stages 单轨）----
  // 提前到最前面，使站点匹配 / 规则匹配（matcher 的 protocol 补全）即可读到运行时全站默认。
  // 读取失败不影响主链路（各消费点自行退化为内置默认）。
  //
  // 单轨化：过去这里还会额外取一份 settings 段（ctx.__globalSettings）——那是一批
  // 前端不可见、却在后端生效的隐藏配置（透传白名单 / 限速 / 拦截文案 / 伪装页 TTL…）。
  // 现在它们都是某个阶段的默认动作，统一挂在 ctx.__globalStages 上供各模块读取。
  let globalStages = {};
  try {
    const g = await getGlobalRules(ctx);
    globalStages = (g && g.stages) || {};
  } catch {
    // 读取兜底规则失败时不影响站点自身逻辑
  }
  // 供下游模块（headers/guard/matcher/disguise/ratelimit/cache）读取全站阶段默认值。
  // 只读，不要在管线里改写它——它就是本次请求的「全站默认快照」。
  ctx.__globalStages = globalStages;

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

  // 全站通用（兜底）规则 stages：已在函数开头预取并缓存到 globalStages / ctx.__globalStages。
  // 注意：只遍历 STAGE_ORDER（7 个规则型阶段）。全站独有阶段（match/security/error）
  // 不是规则动作、无法按 URL 差异化，故不参与此处的逐阶段合并，由各自模块直接读取。
  //
  // 合并模型（详见 docs/12-request-flow.md ④.2）：逐阶段独立、先全站后站点。
  // 按 STAGE_ORDER 遍历每个阶段：
  //   ① 先取全站兜底 globalStages[stage] 注入 eff（全站先出手）；
  //   ② 再 matchRuleByStage 在该阶段的站点规则集里按 priority 取命中的一条规则；
  //   ③ 站点命中则用其「同阶段字段」覆盖 eff 的对应字段（站点优先于全站），
  //      未命中则全站结果原样保留进入下一阶段。
  // 这样全站某阶段设置后，站点规则是对「设置后的结果」做具体修改/覆盖/删除，
  // 不会出现「整条站点规则命中即铺底、把全站兜底层整段冲掉」的本末倒置问题。
  //
  // 站内各阶段规则经 buildActionByStage 已按 rule.stage 裁剪（action 只含该阶段字段），
  // 因此每条命中规则的 action 可直接合并到 eff 而不污染其它阶段。
  const effAction = {};
  ctx.debug.ruleSource = ctx.debug.ruleSource || {};
  for (const stage of STAGE_ORDER) {
    const eff = deepClone(globalStages[stage] || {});
    const sr = matchRuleByStage(site, stage, ctx);
    if (sr && sr.action) {
      // sr.action 的 key 即阶段名（如 'reqHeaders' / 'terminate'），其值是「该阶段的扁平对象」。
      // 而 eff 已经是「全站同阶段扁平对象」（deepClone(globalStages[stage])）。
      // 因此每个阶段都是把 eff（全站）与站点同阶段对象合并——这才是「全站默认 + 站点覆盖」的语义。
      // 注意：绝不能写成 eff[k] = sr.action[k]——eff 本身已是该阶段对象，k 是它的「阶段名包装」，
      // 嵌套赋值会把站点值错误地塞进 eff.terminate，而 eff 顶层全站字段（如 forceHttps）反而没被覆盖。
      for (const k of Object.keys(sr.action)) {
        const siteStageObj = sr.action[k];
        if (!siteStageObj || typeof siteStageObj !== 'object') continue;
        if (stage === 'reqHeaders' || stage === 'respHeaders') {
          // HeaderOps 段：整段并集（set 站点覆盖全站同名 key、全站其余保留；站点 remove 在合并期即从 set 剔除全站被点名 key）
          const merged = mergeStageHeaderOps(eff, siteStageObj);
          eff.set = merged.set;
          eff.remove = merged.remove;
          if (siteStageObj.strip !== undefined) eff.strip = siteStageObj.strip;
          if (siteStageObj.forwardWhitelist !== undefined) eff.forwardWhitelist = siteStageObj.forwardWhitelist;
        } else {
          // 标量段（rewrite/redirect/terminate/origin/cache 等）：整段逐字段覆盖（含子对象整段覆盖），
          // 未设字段沿用全站 eff 中的值。
          for (const fk of Object.keys(siteStageObj)) {
            eff[fk] = deepClone(siteStageObj[fk]);
          }
        }
      }
      ctx.debug.ruleSource[stage] = 'site';
    } else {
      // 该阶段站点规则集未命中 → 全站结果保留进入下一阶段。
      ctx.debug.ruleSource[stage] = 'global';
    }
    // 每个阶段的结果都以「整段」形式挂到 effAction[stage]，与 STAGE_ORDER 一一对应：
    //   effAction.rewrite / redirect / terminate / reqHeaders / origin / cache / respHeaders
    // 这样下游（buildClientHeaders 读 effAction.cache、mergeRewrite 读 effAction.rewrite、
    // applyTerminalActions 读 effAction.terminate / effAction.redirect 等）按统一「阶段名 → 整段」路径取值，
    // 不会出现「标量段被展开到 effAction 顶层、而消费代码又整段读取」的错位。
    // 注：HeaderOps 段（reqHeaders/respHeaders）同样是整段 {set, remove} 存放，与此一致。
    effAction[stage] = eff;
  }
  const rule = { action: effAction, _source: ctx.debug.ruleId ? 'site' : 'global' };
  const ruleSource = rule._source;

  // ---- 4.5 终止型动作 ----
  // 这三类动作不回源，命中即返回。顺序有讲究：
  //   forceHttps 最先（协议纠正应在任何业务逻辑之前）
  //   directResponse 优先于 redirect（显式指定响应体的意图更强）
  const terminal = applyTerminalActions(ctx, rule);
  if (terminal) {
    recordSafely(ctx, { status: terminal.status, cacheHit: 'BYPASS' });
    return terminal;
  }

  // 解析回源 Host（优先级：规则级 action.hostHeader → 源站级 origin.hostHeader → 站点级 defaultHostHeader）。
  // 注意：此处尚未选中单个 origin，源站级 hostHeader 留空（undefined），
  // 由第三参正确承载「站点级 defaultHostHeader」作为最终回退兜底，避免 accel 等站点级模式被错误归到源站级。
  const effectiveHostHeader = resolveHostHeader(rule?.action?.hostHeader, undefined, site.defaultHostHeader);

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
      const headers = await buildClientHeaders(ctx, hit, policy, mergedRespHeaders);
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
    // 三平台均支持 Cache API（详见 docs/11-architecture.md §4.1）：
    //  - CF / EO：caches.default 托管
    //  - ESA：全局 cache 单实例托管
    //  当任意平台均不提供 Cache API 句柄时，响应头仍下发 CDN-Cache-Control，
    //  由底层边缘按响应头缓存 —— 用 EDGE_HEADER 标明「靠响应头委托边缘缓存」
    //  策略关闭或请求不可缓存：BYPASS
    ctx.debug.cache = (!ctx.caps?.hasEdgeCache && policy.enabled) ? 'EDGE_HEADER' : 'BYPASS';
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
    // 仅当「无自定义回源 Host」（站点 defaultHostHeader 为 accel 且未指定 custom）时，
    // 用同站 fetch 委托 EO 边缘节点缓存；任何自定义 Host 都必须走 failover 路径。
    effectiveHostHeader?.mode === 'accel' && !effectiveHostHeader?.custom &&
    cacheKey &&
    safeIsCacheable(ctx, cacheKey, new Response(null, { status: 200 }), policy);

  let originResp;
  if (delegateEoEdge) {
    ctx.debug.cachePath = 'A_EO_EDGE';
    originResp = await eoEdgeFetch(ctx, ctx.request, policy);
  } else {
    originResp = await requestWithFailover(ctx, pool, rule, effectiveHostHeader);
  }

  // ---- 7.5 serve-stale-on-error（SWR 行为兜底）----
  // 回源拿到 5xx/502（全源站失败）时，若边缘缓存里仍有【刚过期、但平台尚保留】的
  // 旧响应，则改返回该 stale 响应（带 X-Cache: STALE 与 stale-while-revalidate 头），
  // 而非把 502 直接暴露给用户。这把「源站抖动」对用户的影响降到最低，并减少对源站的
  // 无效重试触达（与 circuit.js 的熔断/自愈互补：熔断避免反复打挂源站，stale 避免用户
  // 看到错误）。
  // 注：Cache API 过期条目通常会被平台剔除，因此仅当平台仍保留过期条目（或 SWR 窗口内）
  // 时才生效；取不到则保持原 502，不影响任何既有行为。
  if (originResp && originResp.status >= 500 && cacheKey) {
    try {
      const stale = await cacheMatch(ctx, cacheKey);
      if (stale) {
        ctx.debug.cache = 'STALE';
        // stale 分支只用 policy 构造客户端头（mergedRespHeaders 在下方步骤 9 才计算，
        // 此处不依赖它，避免时序耦合；stale 响应本身已含源站级响应头）。
        // 注意：X-Cache 头名由引擎常量 DEBUG_HEADER_NAMES 决定（下沉自旧 settings.debug），
        // buildClientHeaders 已按该常量名写出 STALE，此处不再硬编码覆盖。
        const headers = await buildClientHeaders(ctx, stale, policy, undefined);
        recordSafely(ctx, { status: stale.status, cacheHit: 'STALE' });
        return new Response(stale.body, {
          status: stale.status,
          statusText: stale.statusText,
          headers,
        });
      }
    } catch {
      // 取 stale 失败则照常走 502，不影响主流程
    }
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
  const headers = await buildClientHeaders(ctx, originResp, policy, mergedRespHeaders);
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

  // 品牌响应头：统一从全站规则 stages.respHeaders.set 取得（支持站点规则 remove 覆盖）。
  const brand = getBrandHeaders(ctx, rule);

  // 终止型动作按阶段整段取值（单轨化后 effAction 以 stage 为键整段存放）。
  const term = a.terminate || {};
  const redirect = a.redirect || {};

  // ---- 强制 HTTPS ----
  // 只在确实是 http 时跳转，避免已经是 https 还 301 造成无限循环
  if (term.forceHttps && ctx.url.protocol === 'http:') {
    const target = new URL(ctx.url.href);
    target.protocol = 'https:';
    return new Response(null, {
      status: term.forceHttpsStatus || 301,
      headers: {
        Location: target.toString(),
        'Cache-Control': 'no-store',
        ...brand,
      },
    });
  }

  // ---- 自定义直接响应 ----
  if (term.directResponse?.enabled) {
    const dr = term.directResponse;
    // body 支持 ${var} 变量模板（对齐 EO/CF 响应体变量能力），
    // 如直接返回客户端 IP：body = "your ip: ${client_ip}"。
    const body = expandVars(dr.body || '', ctx, { label: 'directResponse.body', maxLen: 65536 });
    return new Response(body, {
      status: dr.status || 200,
      headers: {
        'Content-Type': dr.contentType || 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        ...brand,
      },
    });
  }

  // ---- 访问 URL 重定向 ----
  if (redirect?.enabled && redirect.target) {
    const loc = buildRedirectTarget(ctx, rule, redirect);
    if (loc) {
      return new Response(null, {
        status: redirect.status || 302,
        headers: { Location: loc, 'Cache-Control': 'no-store', ...brand },
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

  // ---- 捕获组 $1..$9：来自规则 match 中 path 正则条件的捕获 ----
  // 对齐 CF/EO 重定向「路径搬迁改写」。若规则含 target=path 且 op=regex 的条件，
  // 用其对当前路径做匹配，得到捕获组后替换 target 中的 $1..$9。
  const groups = matchPathCaptureGroups(ctx, rule);
  if (groups) {
    target = target.replace(/\$(\d)/g, (m, d) => {
      const idx = Number(d);
      return idx >= 1 && idx <= groups.length ? groups[idx] : m;
    });
  }

  // ---- 变量 ${var}：请求上下文动态值 ----
  target = expandVars(target, ctx, { label: 'redirect.target', maxLen: 8192 });

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
 * 取规则匹配条件中「path + regex」对当前路径产生的捕获组数组（[full, g1, ...]）。
 * 找不到或匹配失败时返回 null。
 * @param {import('../contracts.js').Ctx} ctx
 * @param {Object} rule
 * @returns {string[]|null}
 */
function matchPathCaptureGroups(ctx, rule) {
  const conds = rule?.match?.conditions;
  if (!Array.isArray(conds)) return null;
  for (const group of conds) {
    if (!Array.isArray(group)) continue;
    for (const c of group) {
      if (isObj(c) && c.target === 'path' && c.op === 'regex' && Array.isArray(c.values) && c.values[0]) {
        try {
          const m = ctx.url.pathname.match(new RegExp(c.values[0]));
          if (m) return m;
        } catch {
          /* 非法正则容错 */
        }
      }
    }
  }
  return null;
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
    // 不缓存状态码来自缓存阶段的全站默认（stages.cache.noCacheStatus），
    // 支持 4xx/5xx/52x 段通配与 !418 例外，用户可在「全站通用规则 · 缓存」里改。
    const gc = ctx.__globalStages && ctx.__globalStages.cache;
    const noCacheStatus = gc && gc.noCacheStatus;
    return isCacheable(cacheKey, resp, policy, noCacheStatus) === true;
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
    // 调试头头名取自引擎常量 DEBUG_HEADER_NAMES（下沉自旧 settings.debug，默认始终开启）。
    const names = DEBUG_HEADER_NAMES;
    if (ctx.debug.siteId) headers.set('X-Site-Id', ctx.debug.siteId);
    if (ctx.debug.ruleId) headers.set(names.ruleId, ctx.debug.ruleId);
    if (Array.isArray(ctx.debug.tried) && ctx.debug.tried.length) {
      headers.set('X-Tried-Origins', ctx.debug.tried.join(','));
    }
    if (ctx.startTime) headers.set(names.edgeTime, `${Date.now() - ctx.startTime}ms`);
  }
  // 错误响应同样注入品牌头，避免泄漏上游平台身份。
  // 品牌头统一来自全站规则 stages.respHeaders.set（缺规则时回退内置默认），不再引擎外写死。
  const brand = getBrandHeaders(ctx, undefined);
  if (brand.Server !== undefined) headers.set('Server', brand.Server);
  if (brand.Via !== undefined) headers.set('Via', brand.Via);

  // 错误标题优先使用「错误处理」阶段全站默认里的语义文案（用户可在管理面调整），
  // 未命中语义键时回退到调用方传入的字面量。
  const ge = ctx.__globalStages && ctx.__globalStages.error;
  const messages = (ge && ge.messages) || DEFAULT_GLOBAL_RULES.error.messages;
  const MSG_MAP = {
    'Internal Server Error': messages.internal,
    'No Origin': messages.noOrigin,
    'Config Error': messages.configError,
  };
  const outTitle = MSG_MAP[title] || title;

  return new Response(`${outTitle}\n\n${detail}\n`, { status, headers });
}

/**
 * 合并路径重写与 HeaderOps 的实现见 ./rewrite.js（与回源路径共用同一份逻辑，避免重复）。
 */
