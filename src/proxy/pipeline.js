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

import { matchSite } from './matcher.js';
import { buildRuleForOrigin } from './ruleEval.js';
import { buildClientHeaders, getBrandHeaders, applyHeaderOps } from './headers.js';
import { buildCacheKey, shouldBypassCache } from './cachekey.js';
import { buildOriginUrl, resolveHostHeader, mergeRewrite, mergeHeaderOps } from './rewrite.js';
import { getPool, getGlobal, getGlobalRules } from '../config/store.js';
import { renderDisguise } from './disguise.js';
import { DEFAULT_GLOBAL_RULES } from '../config/defaults.js';
import { cacheMatch, cachePut, isCacheable } from '../platform/cache.js';
import { checkSecurity } from '../security/guard.js';
import { checkGlobalRateLimit } from '../security/ratelimit.js';
import { requestWithFailover } from '../balancer/failover.js';
import { eoEdgeFetch } from './engines/eoEdgeEngine.js';
import { record } from '../stats/collector.js';
import { selectOrigin } from '../balancer/strategy.js';
import { expandVars } from '../config/vars.js';
import { decryptSecret } from '../utils/cipher.js';

/** 朴素的「是普通对象」判断（避免引入 schema 内部依赖）。 */
function isObj(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

/**
 * 仓库型源站（cnb / github）私有仓库鉴权 token 运行时注入。
 * 把当前源站的加密 token 解密后，按「源站 id」放入 ctx.__siteSecrets[id]，
 * 供规则 reqHeaders.set.Authorization = __cnb_token__ / __github_token__ 占位符解析。
 * 按源站 id 维度（而非平台全局唯一值）区分：同一源站池内可存在多个不同仓库源站，
 * 各自的秘钥不同，运行时按 ctx.origin.id 取对应 token，互不串号。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @param {Object} origin 当前选中的源站
 * @returns {Promise<void>}
 */
async function ensureSiteSecrets(ctx, origin) {
  if (!origin || !origin.id) return;
  if (origin.engine !== 'cnb' && origin.engine !== 'github') return;
  const encField = origin.engine === 'cnb' ? 'cnbTokenEnc' : 'githubTokenEnc';
  const stored = origin[encField];
  if (stored == null || stored === '') return;
  try {
    const plain = await decryptSecret(stored, ctx);
    if (!ctx.__siteSecrets) ctx.__siteSecrets = {};
    ctx.__siteSecrets[origin.id] = plain;
  } catch (e) {
    // 解密失败时该源站的占位符解析为空串（鉴权头缺失 → 私有仓库回源 401），
    // 记录调试信息但不阻断其余请求链路。
    if (!ctx.__siteSecrets) ctx.__siteSecrets = {};
    ctx.__siteSecrets[origin.id] = '';
    if (ctx.debug) ctx.debug.secretError = e.message;
  }
}

/**
 * 预填充整条源站池内所有仓库型源站的 token（key=源站 id）。
 * 一次请求只会落在一个 origin 上，但规则可按 originId 匹配到池中任一仓库源站，
 * 故在管线开头把整池仓库 token 都解密好，避免回源换源时再补解密造成串号或缺值。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @param {Object} pool 源站池（含 origins）
 * @returns {Promise<void>}
 */
async function ensureSiteSecretsForPool(ctx, pool) {
  if (!pool || !Array.isArray(pool.origins)) return;
  await Promise.all(pool.origins.map((o) => ensureSiteSecrets(ctx, o)));
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
      // 读配置失败则用默认静态伪装
      disguise = undefined;
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
  // 规则 action 仍可用 poolId 引用源站实体覆盖本次选中的源站（见 ④）。
  const defaultPool = await buildSitePool(ctx, site);
  if (!defaultPool) {
    return errorResponse(500, 'Config Error', `Site "${site.host}" has no usable origin (poolId="${site.poolId || ''}")`, ctx);
  }
  let primaryOriginActual = selectOrigin(defaultPool, ctx, []);
  if (!primaryOriginActual) {
    return errorResponse(502, 'No Origin', `No enabled origin in site "${site.host}"`, ctx);
  }
  // 注入规则引擎匹配维度
  ctx.origin = primaryOriginActual;
  // 仓库型源站（cnb/github）私有仓库鉴权：预解密整池所有仓库源站的站点级密文，
  // 按源站 id 放入 ctx.__siteSecrets，供规则 __cnb_token__ / __github_token__ 占位符按
  // ctx.origin.id 取对应 token（同池多仓库互不串号）。
  await ensureSiteSecretsForPool(ctx, defaultPool);

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
  // 该合并逻辑已抽到 ./ruleEval.js，因为「按源站求值」必须同时被本管线与
  // 故障转移（每次尝试 / 竞速每条通道）复用——站点规则可用 origin 作为匹配
  // 条件（如 CNB / GitHub 的 raw 路径格式不同），若求值依据的源站与实际拨号
  // 的源站不一致，就会把 A 源站的路径打到 B 源站域名上而 404。
  const rule = buildRuleForOrigin(ctx, site, primaryOriginActual);
  const effAction = rule.action;
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

  // 规则只能引用已存在的源站实体（poolId：single 或 pool 均可），不支持规则内联多源站。
  const poolId = ra.poolId;
  if (poolId) {
    pool = await getPool(ctx, poolId);
    poolSource = `pool:${poolId}`;
    if (!pool || !Array.isArray(pool.origins) || pool.origins.length === 0) {
      return errorResponse(502, 'Config Error', `Origin "${poolId}" is empty or missing`, ctx);
    }
    // 规则重选的源站池：补充解密该池内所有仓库源站的 token
    await ensureSiteSecretsForPool(ctx, pool);
  }
  // 规则未指定 poolId → 沿用③的 defaultPool + primaryOrigin

  // 若规则重新指定了源站池，需要再选一次（此时 ctx.origin 同步更新，
  // 供后续回源/缓存按「实际选中的源站」生效）
  if (poolSource !== 'site-default') {
    const reSelected = selectOrigin(pool, ctx, []);
    if (!reSelected) {
      return errorResponse(502, 'No Origin', `No enabled origin in ${poolSource}`, ctx);
    }
    ctx.origin = reSelected;
    primaryOriginActual = reSelected;
    // 规则重选源站：补充解密该源站 token（若尚未预填充）
    await ensureSiteSecrets(ctx, reSelected);
  }
  // 源站对象已不再承载 cache（全交给规则层）；仅用规则层 cache 叠加默认策略。
  const ruleCache = rule?.action?.cache || {};
  const policy = { ...DEFAULT_POLICY, ...ruleCache };
  const bypass = shouldBypassCache(ctx, policy);

  let cacheKey = null;
  if (!bypass && ctx.caps?.hasEdgeCache) {
    // 合并规则级 rewrite 用于构造缓存键（源站级 rewrite 已不再存在）
    const mergedRewrite = mergeRewrite(undefined, rule?.action?.rewrite);
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
      // 响应头改写合并：使用规则层（源站级 respHeaders 已不再存在）
      const mergedRespHeaders = mergeHeaderOps(undefined, rule?.action?.respHeaders);
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
    safeIsCacheable(ctx, cacheKey, new Response(null, { status: 200 }), policy) &&
    // 仓库引擎（cnb/github）/ r2 的回源 host 由规则/代码层决定（如 raw.githubusercontent.com），
    // 与「同站加速域名」完全不同，绝不能走「同站 fetch 委托」——否则会回源打回自己导致死循环/超时。
    // 这类引擎必须走 requestWithFailover 路径，由 buildOriginUrl 按规则 hostHeader.custom 解析真实上游。
    !['cnb', 'github', 'r2'].includes(primaryOriginActual?.engine);

  let originResp;
  if (delegateEoEdge) {
    ctx.debug.cachePath = 'A_EO_EDGE';
    originResp = await eoEdgeFetch(ctx, ctx.request, policy);
  } else {
    // 传入 site 与「已选中的首选源站」：failover 首次尝试直接复用 primaryOriginActual
    // （避免同一请求内重复推进 SWRR 权重、也保证缓存键与首次回源用同一源站），
    // 并在每次换源 / 竞速的每条通道上按该源站重新求值规则。
    originResp = await requestWithFailover(ctx, pool, rule, effectiveHostHeader, {
      site,
      preferredOrigin: primaryOriginActual,
    });
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
        // stale 分支用 policy 构造客户端头；调试头 / 品牌头 / 缓存头统一由全站规则
        // respHeaders 引擎下发（与正常/错误响应路径同源，保证 X-Cache=STALE 等可观测头一致）。
        // mergedRespHeaders 在下方步骤 9 才计算，此处不依赖站点规则覆盖，
        // 仅用全站默认规则 respHeaders，避免时序耦合。
        const staleRespHeaders =
          (ctx.__globalStages && ctx.__globalStages.respHeaders) ||
          DEFAULT_GLOBAL_RULES.respHeaders;
        const headers = await buildClientHeaders(ctx, stale, policy, staleRespHeaders);
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
  // 响应头改写合并：规则层 cache 已携带全部 TTL/开关（源站级 cache 已不再存在），
  // 直接用规则层 cache 决定的 policy 下发响应头。
  const mergedRespHeaders = mergeHeaderOps(undefined, rule?.action?.respHeaders);
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

  // 品牌响应头：统一从全站规则 stages.respHeaders.set 取得（支持站点规则 strip 覆盖）。
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
    // 错误码缓存（statusTtl）与不缓存状态码统一在 isCacheable 内处理：
    // statusTtl 命中且 TTL=0 即 no-store（不写缓存），与原 noCacheStatus 黑名单等价。
    // 旧数据残留的 noCacheStatus 已由 schema 兼容转换为 statusTtl=0，故此处无需单独取用。
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
  });

  // 调试头 / 品牌头（server / via）/ 缓存头，统一复用全站规则 respHeaders 引擎，
  // 与正常响应路径行为一致（头名与值均可在前端 ⑯「节点响应头」阶段配置，不再硬编码）。
  // 规则引擎为绝对权威：错误响应的 no-store / 短时缓存等缓存策略由用户在规则里声明式
  // 表达，代码不再有任何外置覆盖。用户此处改了缺省 = 用户自定义，代码绝不回加。
  const respHeaders =
    (ctx && ctx.__globalStages && ctx.__globalStages.respHeaders) ||
    DEFAULT_GLOBAL_RULES.respHeaders;
  applyHeaderOps(headers, respHeaders, ctx, null);

  // 错误标题优先使用「错误处理」阶段全站默认里的语义文案（用户可在管理面调整），
  // 未命中语义键时回退到调用方传入的字面量。
  const ge = ctx.__globalStages && ctx.__globalStages.error;
  const messages = (ge && ge.messages) || DEFAULT_GLOBAL_RULES.error.messages;
  // 语义键→文案键 的映射由规则缺省 error.messageMap 驱动（单一真源），
  // 命中后取 messages[key] 文案，未命中则回退到调用方传入的字面量 title。
  const messageMap = (ge && ge.messageMap) || DEFAULT_GLOBAL_RULES.error.messageMap;
  const key = messageMap[title];
  const outTitle = (key && messages[key]) || title;

  return new Response(`${outTitle}\n\n${detail}\n`, { status, headers });
}

/**
 * 合并路径重写与 HeaderOps 的实现见 ./rewrite.js（与回源路径共用同一份逻辑，避免重复）。
 */
