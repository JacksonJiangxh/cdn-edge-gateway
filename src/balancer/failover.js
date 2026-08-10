/**
 * 故障转移（换源）
 * ----------------------------------------------------------------------------
 * 这是整个负载均衡的核心：一次客户端请求，可以在多个源站之间自动重试，
 * 直到拿到一个「像样的」响应，或者耗尽所有源站。
 *
 * 换源触发条件（两类）：
 *   1. 响应状态码命中 failover.retryOn（默认 5xx / 522 / 524）
 *   2. fetch 抛异常（DNS 失败、连接被拒、TLS 错误、超时）
 *      —— 这一类【无论 retryOn 如何配置都必须换源】，
 *      因为「连接都没建立起来」显然比任何状态码都严重。
 */

import { selectOrigin } from './strategy.js';
import { isTripped, recordFailure, recordSuccess } from './circuit.js';
import { buildOriginUrl, resolveHostHeader, applyRewrite, joinPath, mergeRewrite, mergeHeaderOps } from '../proxy/rewrite.js';
import { buildOriginHeaders } from '../proxy/headers.js';
import { fetchOrigin } from '../proxy/engines/fetchEngine.js';
import { fetchOrigin as r2FetchOrigin } from '../proxy/engines/r2Engine.js';
import { DEFAULT_RETRY_ON } from '../contracts.js';

// 重试时为了避免把整请求体物化进内存，超过该上限的 body 直接关闭重试（流式透传）。
const MAX_RETRY_BODY = 5 * 1024 * 1024;

/**
 * 带故障转移的回源请求。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} pool 源站池
 * @param {Object} [rule] 命中的规则
 * @param {Object} [hostHeader] 已解析的回源 Host 配置 {mode, custom}
 * @returns {Promise<Response>} 源站响应；全部失败时返回 502
 */
export async function requestWithFailover(ctx, pool, rule, hostHeader) {
  const failover = pool?.failover || {};
  const enabled = failover.enabled !== false;
  const retryOn = new Set(
    Array.isArray(failover.retryOn) && failover.retryOn.length > 0
      ? failover.retryOn
      : DEFAULT_RETRY_ON
  );
  const maxRetries = enabled ? (Number.isFinite(failover.maxRetries) ? failover.maxRetries : 2) : 0;
  // 超时优先级：规则级 > 源站级 > 池级 > 默认 10000
  const poolTimeout = Number(failover.timeoutMs) > 0 ? Number(failover.timeoutMs) : 10000;

  // 预先把「已熔断」的源站并入排除列表。
  // 熔断查询是异步 KV 操作，而 selectOrigin 是同步的，所以在这里一次性算好。
  const excludeIds = await collectTrippedIds(ctx, pool);

  ctx.debug.tried = ctx.debug.tried || [];

  /** @type {Response|null} 最后一次拿到的（失败的）响应，用于全部源站都失败时兜底返回 */
  let lastResponse = null;
  /** @type {Error|null} 最后一次的异常 */
  let lastError = null;

  const totalAttempts = maxRetries + 1;

  // 物化请求体到内存，以便重试时复用。ReadableStream 只能消费一次，若不在此物化，
  // 第一次尝试消费后流即被锁定，第二次 dispatch 会抛 TypeError，而该本地错误会被
  // 当成「源站故障」记录，导致整个源站池被错误熔断（可被外部单请求触发）。
  // 超大 body 不物化：保持流式透传并关闭重试，避免内存被打爆。
  const method = (ctx.request.method || 'GET').toUpperCase();
  let bodyBuf = null;
  if (method !== 'GET' && method !== 'HEAD' && ctx.request.body) {
    const len = Number(ctx.request.headers.get('content-length')) || 0;
    // 超大 body 不物化（避免内存被打爆）：保持流式透传，failover 重试时由 fetchEngine
    // 回退到 ctx.request.body（duplex）流式发送。此时重试首源会失败于 body 已消费，
    // 但仅影响首源一次，不会无限循环。
    if (len <= MAX_RETRY_BODY) {
      try {
        bodyBuf = await ctx.request.arrayBuffer();
      } catch {
        bodyBuf = null;
      }
    }
  }

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const origin = selectOrigin(pool, ctx, excludeIds);
    if (!origin) break; // 没有可用源站了

    excludeIds.push(origin.id);
    ctx.debug.tried.push(origin.id);
    ctx.debug.retries = attempt;
    ctx.debug.originId = origin.id;
    ctx.debug.originAddr = `${origin.addr}:${origin.port || (origin.scheme === 'http' ? 80 : 443)}`;

    // ---- 合并源站级与规则级配置 ----
    // 源站级打底，规则级覆盖
    const mergedRewrite = mergeRewrite(origin.rewrite, rule?.action?.rewrite);
    const mergedReqHeaders = mergeHeaderOps(origin.reqHeaders, rule?.action?.reqHeaders);
    const mergedClientIpHeader = mergeClientIpHeader(origin.clientIpHeader, rule?.action?.clientIpHeader);

    // 超时：规则级 > 源站级 > 池级
    const originTimeout = Number(origin.originTimeoutMs) || 0;
    const ruleTimeout = Number(rule?.action?.originTimeoutMs) || 0;
    const timeoutMs = ruleTimeout > 0 ? ruleTimeout : originTimeout > 0 ? originTimeout : poolTimeout;

    // 跟随重定向：规则级优先，否则源站级
    const followRedirect = rule?.action?.followRedirect !== undefined
      ? rule.action.followRedirect === true
      : origin.followRedirect === true;

    // 构造临时规则对象以复用 buildOriginUrl
    const effectiveRule = { action: { rewrite: mergedRewrite } };

    let originUrl;
    if (origin.engine === 'r2') {
      // R2 回源只需 pathname（key 由 r2Engine 解析），没有公网 Host 概念，
      // 用占位 authority 构造一个合法 URL 以避免 new URL 抛错。
      const rewritten = applyRewrite(ctx.url.pathname, effectiveRule.action.rewrite);
      const fullPath = origin.pathPrefix
        ? joinPath(origin.pathPrefix, rewritten)
        : rewritten;
      originUrl = new URL('https://r2.invalid');
      originUrl.pathname = fullPath;
      originUrl.search = ctx.url.search;
    } else {
      // 回源 Host 按「源站级 → 规则级 → 站点级」解析：每个 origin 独立算自己的 Host，
      // 解决「同一源站组多源站各自 Host 不同」的场景（规则级 custom 可覆盖单个源站）。
      const originHostHeader = resolveHostHeader(rule?.action?.hostHeader, origin.hostHeader, hostHeader);
      originUrl = buildOriginUrl(ctx, origin, effectiveRule, originHostHeader);
    }
    const headers = buildOriginHeaders(
      ctx,
      origin,
      mergedReqHeaders,
      ctx.env,
      mergedClientIpHeader
    );

    try {
      const resp = await dispatch(ctx, origin, originUrl, headers, timeoutMs, {
        followRedirect,
        bodyBuf,
        hostHeader: originHostHeader,
      });

      // 状态码命中 retryOn → 视为该源站不健康，换下一个
      if (enabled && retryOn.has(resp.status)) {
        await recordFailure(ctx, pool.id, origin.id);

        // 关键：换源前必须消费掉这个响应的 body，否则连接不会被释放，
        // 高并发下会累积成资源泄漏
        await resp.body?.cancel().catch(() => {});

        // 仅保留状态/响应头快照：body 已丢弃，原样返回会被客户端收到空响应。
        // 全部失败时据此重建一个只有响应头的 Response，避免返回空 body 误导客户端。
        lastResponse = {
          status: resp.status,
          statusText: resp.statusText,
          headers: new Headers(resp.headers),
        };
        lastError = null;
        continue;
      }

      // 成功：清除该源站的失败计数
      await recordSuccess(ctx, pool.id, origin.id);
      return resp;
    } catch (err) {
      // fetch 抛异常：网络错误 / 超时 / TLS 失败。
      // 无论 retryOn 怎么配都要换源 —— 连接都没建立，谈不上状态码。
      lastError = err;
      lastResponse = null;
      await recordFailure(ctx, pool.id, origin.id);

      // failover 被关闭时不再重试，直接跳出
      if (!enabled) break;
    }
  }

  // ---- 所有源站都失败了 ----

  // 情况一：最后一次拿到了真实响应（只是状态码不理想）。body 已丢弃，
  // 据此重建一个仅有状态码与响应头的空响应返回客户端，比自造 502 更有信息量。
  if (lastResponse) {
    return new Response(null, {
      status: lastResponse.status,
      statusText: lastResponse.statusText,
      headers: lastResponse.headers,
    });
  }

  // 情况二：全是异常，说明一个源站都没连上
  const detail = lastError ? lastError.message || String(lastError) : 'no available origin';
  const tried = ctx.debug.tried.length ? ctx.debug.tried.join(', ') : '(none)';

  return new Response(
    `Bad Gateway: all origins failed.\nTried: ${tried}\nLast error: ${detail}`,
    {
      status: 502,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  );
}

/**
 * 根据 origin.engine 分发到对应的回源引擎。
 *
 * socket 引擎在不支持的平台会抛错，这里捕获后降级到 fetch，
 * 保证配置了 socket 的源站在 Pages / EdgeOne 上依然能工作。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} origin 源站
 * @param {URL} originUrl 回源 URL
 * @param {Headers} headers 回源请求头
 * @param {number} timeoutMs 超时
 * @param {{followRedirect?:boolean}} [opts] 附加选项
 * @returns {Promise<Response>} 源站响应
 */
async function dispatch(ctx, origin, originUrl, headers, timeoutMs, opts) {
  if (origin.engine === 'r2') {
    // R2 直读回源：仅 Cloudflare 平台的 R2 绑定可用，不走公网。
    // 非 CF 运行时或绑定缺失时，r2Engine 内部返回 502，由 failover 正常处理。
    return r2FetchOrigin(ctx, origin, originUrl, headers, timeoutMs, opts);
  }

  if (origin.engine === 'socket' && ctx.caps?.hasSocket) {
    try {
      const { socketFetch } = await import('../proxy/engines/socketEngine.js');
      return await socketFetch(ctx, origin, originUrl, headers, timeoutMs, opts);
    } catch (err) {
      // socket 不可用时降级为 fetch，并记录原因便于排查
      if (!Array.isArray(ctx.debug.notes)) ctx.debug.notes = [];
      ctx.debug.notes.push(`socket-fallback:${err?.message || err}`);
    }
  }

  // fetch 路径：注入自定义回源 Host（跨平台统一）。
  // 平台允许手动 Host 时（如 EdgeOne 边缘函数 fetch 向外部源站）生效，实现
  // 「域名源站 + 自定义 Host」语义；强制跟随 URL hostname 的平台（CF Workers fetch /
  // CF Pages）自动无效但无害。裸 IP + 自定义 Host 的 SNI 部分依赖平台级回源 Host 兜底。
  const custom = opts?.hostHeader?.custom;
  if (custom && String(custom).trim() && String(custom).trim() !== String(originUrl.hostname)) {
    headers.set('Host', String(custom).trim());
  }

  return fetchOrigin(ctx, origin, originUrl, headers, timeoutMs, opts);
}

/**
 * 收集当前池中处于熔断状态的源站 id。
 *
 * 并发查询所有源站的熔断状态。若「全部源站都被熔断」，则视为熔断信息失真
 * （例如源站集体抖动过一次），此时返回空列表，让流量照常尝试 ——
 * 宁可打到可能有问题的源站，也不能直接拒绝服务。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} pool 源站池
 * @returns {Promise<string[]>} 熔断的源站 id 列表
 */
async function collectTrippedIds(ctx, pool) {
  const origins = (pool?.origins || []).filter((o) => o && o.enabled !== false);
  if (origins.length === 0) return [];

  // 分批查询熔断状态，避免单次 Promise.all 打爆 subrequest 上限（CF Workers Free ≤ 50）。
  // 大批量源站时，分批使每批并发不超过 20，并给其他操作留出 subrequest 余额。
  const BATCH_SIZE = 20;
  const tripped = [];

  for (let i = 0; i < origins.length; i += BATCH_SIZE) {
    const batch = origins.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (o) => ((await isTripped(ctx, pool.id, o.id)) ? o.id : null))
    );
    for (const r of results) if (r !== null) tripped.push(r);
  }

  // 全员熔断 → 放弃熔断过滤，避免完全不可用
  if (tripped.length >= origins.length) {
    if (!Array.isArray(ctx.debug.notes)) ctx.debug.notes = [];
    ctx.debug.notes.push('all-origins-tripped:ignoring');
    return [];
  }

  return tripped;
}

/**
 * 合并路径重写与 HeaderOps 的实现见 ../proxy/rewrite.js（与缓存命中路径共用同一份逻辑）。
 */

/**
 * 合并 ClientIpHeader：源站级打底，规则级优先覆盖。
 * 规则级 enabled 为 true/false 时以规则级为准；规则级未定义时回退源站级。
 *
 * @param {Object} [originCip] 源站级 clientIpHeader
 * @param {Object} [ruleCip] 规则级 clientIpHeader
 * @returns {Object} 合并后的 clientIpHeader
 */
function mergeClientIpHeader(originCip, ruleCip) {
  // 规则级有显式 enabled 值时用规则级，否则用源站级，都没有时用关闭默认值
  const hasRule = ruleCip && typeof ruleCip.enabled === 'boolean';
  if (hasRule) return { enabled: ruleCip.enabled, name: ruleCip.name || 'X-Forwarded-For' };
  if (originCip && typeof originCip.enabled === 'boolean') return { enabled: originCip.enabled, name: originCip.name || 'X-Forwarded-For' };
  return { enabled: false, name: 'X-Forwarded-For' };
}
