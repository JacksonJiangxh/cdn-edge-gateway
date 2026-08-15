/**
 * 故障转移（换源）
 * ----------------------------------------------------------------------------
 * 这是整个负载均衡的核心：一次客户端请求，可以在多个源站之间自动重试，
 * 直到拿到一个「像样的」响应，或者耗尽所有源站。
 *
 * 横切能力（2026-08 增强）：
 *   1. 统一健康过滤：已试 + 熔断(KV) + 冷却(内存) 合并进 excludeIds
 *   2. 失败即冷却：一次失败把源站放入本 isolate 冷却名单（penaltySeconds）
 *   3. 总时间预算：按平台执行上限推导硬顶，每次尝试超时递减，最坏总耗时收敛到 budget
 *   4. 竞速请求：首个尝试超过 speculativeMs 无首字节即并行打第二候选，谁先成功用谁
 *   5. fail-open 智能放行：全员不可用时优先打「最近成功/冷却最短」的源站
 *   6. 冷却软恢复：冷却到期低权重试水，连续成功恢复满权重（见 circuit.js）
 *
 * 换源触发条件（两类）：
 *   1. 响应状态码命中 failover.retryOn（默认 5xx / 522 / 524）
 *   2. fetch 抛异常（DNS 失败、连接被拒、TLS 错误、超时）
 *      —— 这一类【无论 retryOn 如何配置都必须换源】
 */

import { selectOrigin, primeChainWeights } from './strategy.js';
import { isTripped, recordFailure, recordSuccess, penalize, isPenalized } from './circuit.js';
import { buildOriginUrl, resolveHostHeader, mergeRewrite, mergeHeaderOps } from '../proxy/rewrite.js';
import { buildOriginHeaders } from '../proxy/headers.js';
import { fetchOrigin } from '../proxy/engines/fetchEngine.js';
import { fetchOrigin as r2FetchOrigin } from '../proxy/engines/r2Engine.js';
import { fetchRepoOrigin } from '../proxy/repoEngine.js';
import { DEFAULT_GLOBAL_RULES } from '../config/defaults.js';

// 重试时为了避免把整请求体物化进内存，超过该上限的 body 直接关闭重试（流式透传）。
const FALLBACK_MAX_RETRY_BODY = 5 * 1024 * 1024;

/** 平台安全余量（毫秒）：留出响应序列化 / 缓存写入的空间，避免撞平台执行上限 */
const SAFETY_RESERVE = Object.freeze({
  esa: 2000,
  cf: 5000,
  eo: 5000,
});

/**
 * 推导回源总时间预算硬顶。
 *
 *   hardCap = max(1000, min(maxExecutionMs, firstByteMs ?? Infinity) - safetyReserve)
 *   budget  = totalTimeoutMs > 0 ? min(totalTimeoutMs, hardCap)
 *                              : min((maxRetries+1) × timeoutMs, hardCap)
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文（caps 平台能力）
 * @param {number} timeoutMs 单次回源超时
 * @param {number} maxRetries 最多换源次数
 * @param {number} totalTimeoutMs 用户配置的总预算（0=自动推导）
 * @returns {number} 预算毫秒
 */
function computeBudget(ctx, timeoutMs, maxRetries, totalTimeoutMs) {
  const caps = ctx?.caps || {};
  const maxExec = Number(caps.maxExecutionMs) > 0 ? caps.maxExecutionMs : 120000;
  const firstByte = Number(caps.firstByteMs) > 0 ? caps.firstByteMs : Infinity;
  const reserve = SAFETY_RESERVE[caps.platform] ?? 5000;
  const hardCap = Math.max(1000, Math.min(maxExec, firstByte) - reserve);
  if (totalTimeoutMs > 0) return Math.min(totalTimeoutMs, hardCap);
  return Math.min((maxRetries + 1) * timeoutMs, hardCap);
}

/**
 * 判断请求是否「幂等安全、可竞速」（GET/HEAD，或已物化 body 的非 GET 请求）。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {ArrayBuffer|null} bodyBuf 已物化的请求体
 * @returns {boolean}
 */
function isSpeculable(ctx, bodyBuf) {
  const method = (ctx.request.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return true;
  // 非 GET 仅当已物化 body（可复用到第二路，避免双写副作用）才允许竞速
  return bodyBuf != null;
}

/**
 * 带故障转移的回源请求。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} pool 源站池
 * @param {Object} [rule] 命中的规则
 * @param {Object} [hostHeader] 已解析的回源 Host 配置 {mode, custom}
 * @returns {Promise<Response>} 源站响应；全部失败时返回 502（或触发 serve-stale 兜底）
 */
export async function requestWithFailover(ctx, pool, rule, hostHeader) {
  const gOrigin = (ctx.__globalStages && ctx.__globalStages.origin) || DEFAULT_GLOBAL_RULES.origin;
  const fb = (gOrigin && gOrigin.failover) || DEFAULT_GLOBAL_RULES.origin.failover;
  const failover = pool?.failover || {};
  const enabled = failover.enabled !== false;
  const retryOn = new Set(
    Array.isArray(failover.retryOn) && failover.retryOn.length > 0
      ? failover.retryOn
      : (fb.retryOn || [])
  );
  const maxRetries = enabled ? (Number.isFinite(failover.maxRetries) ? failover.maxRetries : (fb.maxRetries ?? 2)) : 0;
  const poolTimeout = Number(failover.timeoutMs) > 0 ? Number(failover.timeoutMs) : (fb.timeoutMs || 10000);
  const penaltySeconds = Number(failover.penaltySeconds) > 0 ? Number(failover.penaltySeconds) : (fb.penaltySeconds ?? 15);
  const totalTimeoutMs = Number(failover.totalTimeoutMs) > 0 ? Number(failover.totalTimeoutMs) : (fb.totalTimeoutMs ?? 0);
  const speculativeMs = Number(failover.speculativeMs) > 0 ? Number(failover.speculativeMs) : (fb.speculativeMs ?? 500);
  const MAX_RETRY_BODY = Number(failover.maxRetryBodyBytes) > 0
    ? Number(failover.maxRetryBodyBytes)
    : (fb.maxRetryBodyBytes || FALLBACK_MAX_RETRY_BODY);

  // 预先把「已熔断」的源站并入排除列表（异步 KV，selectOrigin 同步依赖）。
  const excludeIds = await collectUnavailableIds(ctx, pool, penaltySeconds);

  // 链策略预计算最大 order（供 order 派生权重），仅本 isolate 复用
  primeChainWeights(pool);

  ctx.debug.tried = ctx.debug.tried || [];

  /** @type {Response|null} 最后一次拿到的（失败的）响应 */
  let lastResponse = null;
  /** @type {Error|null} 最后一次的异常 */
  let lastError = null;

  const totalAttempts = maxRetries + 1;

  // 物化请求体（见原实现说明：流式 body 只能消费一次，重试需复用）
  const method = (ctx.request.method || 'GET').toUpperCase();
  let bodyBuf = null;
  if (method !== 'GET' && method !== 'HEAD' && ctx.request.body) {
    const len = Number(ctx.request.headers.get('content-length')) || 0;
    if (len <= MAX_RETRY_BODY) {
      try {
        bodyBuf = await ctx.request.arrayBuffer();
      } catch {
        bodyBuf = null;
      }
    }
  }

  // 总时间预算：规避 (maxRetries+1)×timeoutMs 无预算叠加撞平台上限
  const budget = computeBudget(ctx, poolTimeout, maxRetries, totalTimeoutMs);
  const startTs = Date.now();
  if (!Array.isArray(ctx.debug.notes)) ctx.debug.notes = [];
  ctx.debug.notes.push(`budget-cap:${budget}`);

  const speculable = enabled && speculativeMs > 0 && isSpeculable(ctx, bodyBuf);

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const selected = selectOrigin(pool, ctx, excludeIds);
    if (!selected) break;

    const ra = rule?.action || {};
    const ruleOrigin = ra.origin || {};
    const effScheme = ruleOrigin.scheme || selected.scheme || 'https';
    const effPort = Number(ruleOrigin.port) > 0 ? Number(ruleOrigin.port)
      : Number(selected.port) > 0 ? Number(selected.port)
      : (effScheme === 'http' ? 80 : 443);
    const effEngine = ruleOrigin.engine || selected.engine || 'fetch';
    const origin = { ...selected, scheme: effScheme, port: effPort, engine: effEngine };

    excludeIds.push(origin.id);
    ctx.debug.tried.push(origin.id);
    ctx.debug.retries = attempt;
    ctx.debug.originId = origin.id;
    ctx.debug.originAddr = `${origin.addr}:${origin.port || (origin.scheme === 'http' ? 80 : 443)}`;

    const mergedRewrite = mergeRewrite(origin.rewrite, ra.rewrite);
    const mergedReqHeaders = mergeHeaderOps(origin.reqHeaders, ra.reqHeaders);
    const mergedClientIpHeader = mergeClientIpHeader(origin.clientIpHeader, ruleOrigin.clientIpHeader);

    const originTimeout = Number(origin.originTimeoutMs) || 0;
    const ruleTimeout = Number(ruleOrigin.originTimeoutMs) || 0;
    // 单次尝试超时：受剩余预算约束（最后一次用尽剩余预算），至少 500ms
    const remaining = budget - (Date.now() - startTs);
    const baseTimeout = ruleTimeout > 0 ? ruleTimeout : originTimeout > 0 ? originTimeout : poolTimeout;
    const timeoutMs = Math.min(baseTimeout, Math.max(500, remaining));

    const followRedirect = ruleOrigin.followRedirect !== undefined
      ? ruleOrigin.followRedirect === true
      : origin.followRedirect === true;

    const effectiveRule = { action: { rewrite: mergedRewrite } };
    const originHostHeader = resolveHostHeader(rule?.action?.hostHeader, origin.hostHeader, hostHeader);
    const originUrl = buildOriginUrl(ctx, origin, effectiveRule, originHostHeader);

    const headers = await buildOriginHeaders(
      ctx, origin, mergedReqHeaders, ctx.env, mergedClientIpHeader
    );

    // 竞速请求：仅首个尝试、请求幂等安全时启用。
    // 首路超 speculativeMs 无首字节 → 并行打第二候选，谁先成功用谁，慢路 abort（不记冷却）。
    if (speculable && attempt === 0 && remaining > speculativeMs) {
      const raceResult = await speculativeRace(ctx, pool, excludeIds, origin, originUrl, headers, {
        timeoutMs,
        followRedirect,
        bodyBuf,
        hostHeader: originHostHeader,
        speculativeMs,
        remaining,
      });
      if (raceResult) {
        if (raceResult.ok) {
          recordSuccess(ctx, pool.id, raceResult.winner.id);
          return raceResult.resp;
        }
        // 竞速两路都失败：记冷却 + 失败计数，进入下一轮重试
        noteOriginFailure(ctx, pool, origin, penaltySeconds);
        if (raceResult.secondary && raceResult.secondaryFailed) {
          noteOriginFailure(ctx, pool, raceResult.secondary, penaltySeconds);
        }
        lastResponse = raceResult.lastResponse;
        lastError = raceResult.lastError;
        if (!enabled) break;
        continue;
      }
    }

    try {
      const resp = await dispatch(ctx, origin, originUrl, headers, timeoutMs, {
        followRedirect,
        bodyBuf,
        hostHeader: originHostHeader,
      });

      if (enabled && retryOn.has(resp.status)) {
        noteOriginFailure(ctx, pool, origin, penaltySeconds, resp);
        await resp.body?.cancel().catch(() => {});
        lastResponse = {
          status: resp.status,
          statusText: resp.statusText,
          headers: new Headers(resp.headers),
        };
        lastError = null;
        continue;
      }

      recordSuccess(ctx, pool.id, origin.id);
      return resp;
    } catch (err) {
      lastError = err;
      lastResponse = null;
      noteOriginFailure(ctx, pool, origin, penaltySeconds);
      if (!enabled) break;
    }
  }

  // ---- 所有源站都失败了 ----
  if (lastResponse) {
    return new Response(null, {
      status: lastResponse.status,
      statusText: lastResponse.statusText,
      headers: lastResponse.headers,
    });
  }

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
 * 记录一次源站失败：熔断计数 + 冷却名单（连接异常或 retryOn 都冷却）。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} pool 源站池
 * @param {Object} origin 源站
 * @param {number} penaltySeconds 冷却窗口
 * @param {Response} [resp] 失败的响应（仅记录，不再消费 body）
 */
function noteOriginFailure(ctx, pool, origin, penaltySeconds, resp) {
  // 连接类异常 / 命中 retryOn → 立即冷却（与熔断并存）
  penalize(pool.id, origin.id, penaltySeconds);
  recordFailure(ctx, pool.id, origin.id);
  if (resp && resp.body) resp.body.cancel().catch(() => {});
}

/**
 * 竞速请求：首路 dispatch 后启动 speculativeMs 定时器，到期未拿到首字节即并行打
 * 第二候选（首源并入 excludeIds 选出）。两路 Promise.race，先成功者胜；慢路 abort
 * 取消（取消不算源站故障，不记冷却，仅记录 debug）。超预算时退回纯串行。
 *
 * @returns {Promise<{ok:boolean, winner?:Object, resp?:Response, primaryFailed:boolean, secondary?:Object, secondaryFailed?:boolean, lastResponse?:Object, lastError?:Error}|null>}
 *   null 表示竞速未触发（如只剩一个候选源站）。object 表示竞速已完成（成功或双失败）。
 */
async function speculativeRace(ctx, pool, excludeIds, primary, originUrl, headers, opts) {
  // 第二候选：首源并入 excludeIds 后重新选源
  const secondary = selectOrigin(pool, ctx, [...excludeIds, primary.id]);
  if (!secondary) return null; // 无第二候选，退回串行

  const ctrl = new AbortController();
  let primaryDone = false;
  let primaryResp = null;
  let primaryErr = null;

  const primaryTask = dispatch(ctx, primary, originUrl, headers, opts.timeoutMs, {
    followRedirect: opts.followRedirect,
    bodyBuf: opts.bodyBuf,
    hostHeader: opts.hostHeader,
    controller: ctrl,
  }).then(
    (r) => { primaryDone = true; primaryResp = r; return r; },
    (e) => { primaryDone = true; primaryErr = e; throw e; }
  );

  // 启动竞速定时器：speculativeMs 无首字节 → 触发第二路
  let raced = false;
  await new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (primaryDone || raced) return resolve();
      if (Date.now() - start >= opts.speculativeMs) return resolve();
      setTimeout(tick, 25);
    };
    setTimeout(tick, opts.speculativeMs);
  });

  // 首路已先返回：直接判定首路结果，取消（若有）第二路
  if (primaryDone) {
    if (primaryErr) {
      // 首路异常但已结束（理论上不会与竞速同时），按正常失败处理
      ctrl.abort();
      return {
        ok: false, winner: undefined, primaryFailed: true,
        lastError: primaryErr,
      };
    }
    ctrl.abort();
    return { ok: true, winner: primary, resp: primaryResp, primaryFailed: false };
  }

  raced = true;
  if (!Array.isArray(ctx.debug.notes)) ctx.debug.notes = [];
  ctx.debug.notes.push(`speculative:${primary.id}->${secondary.id}`);

  // 第二路：构造独立 URL/headers（复用一个请求对象需谨慎，headers.get 幂等，可复用）
  const secHostHeader = opts.hostHeader;
  const secUrl = originUrl; // primary/secondary 同池同 rule，URL 一致；仅 origin 不同在 dispatch 内解析
  const secondaryTask = dispatch(ctx, secondary, secUrl, headers, opts.timeoutMs, {
    followRedirect: opts.followRedirect,
    bodyBuf: opts.bodyBuf,
    hostHeader: secHostHeader,
    // 第二路不接竞速 controller（竞速取消只取消首路，慢路 abort 由自身超时处理）
  }).then(
    (r) => ({ ok: true, resp: r }),
    (e) => ({ ok: false, err: e })
  );

  const winner = await Promise.race([
    primaryTask.then((r) => ({ lane: 'primary', resp: r })),
    secondaryTask.then((s) => (s.ok ? { lane: 'secondary', resp: s.resp } : null)).catch(() => null),
  ]);

  // 胜者已定：取消慢路
  ctrl.abort();

  if (winner && winner.resp) {
    const won = winner.lane === 'primary' ? primary : secondary;
    return { ok: true, winner: won, resp: winner.resp, primaryFailed: false };
  }

  // 两路都失败：收集失败信息（慢路成功分支不会到达此处）
  let lastResponse = null;
  let lastError = null;
  if (primaryErr) lastError = primaryErr;
  else if (primaryResp && primaryResp.body) lastResponse = snapshotResp(primaryResp);
  return {
    ok: false,
    primaryFailed: !!primaryErr || (primaryResp ? true : false),
    secondary,
    secondaryFailed: true,
    lastResponse,
    lastError,
  };
}

/** 仅保留状态码/头快照，丢弃 body（用于重建空响应） */
function snapshotResp(resp) {
  return {
    status: resp.status,
    statusText: resp.statusText,
    headers: new Headers(resp.headers),
  };
}

/**
 * 根据 origin.engine 分发到对应的回源引擎。
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} origin 源站
 * @param {URL} originUrl 回源 URL
 * @param {Headers} headers 回源请求头
 * @param {number} timeoutMs 超时
 * @param {{followRedirect?:boolean, hostHeader?:Object, bodyBuf?:ArrayBuffer|null, controller?:AbortController}} [opts] 附加选项
 * @returns {Promise<Response>} 源站响应
 */
async function dispatch(ctx, origin, originUrl, headers, timeoutMs, opts) {
  if (origin.engine === 'r2') {
    return r2FetchOrigin(ctx, origin, originUrl, headers, timeoutMs, opts);
  }

  if (origin.engine === 'cnb' || origin.engine === 'github') {
    return fetchRepoOrigin(ctx, origin, originUrl, headers, timeoutMs, opts);
  }

  if (origin.engine === 'socket') {
    throw new Error(
      "engine 'socket' 已弃用：自定义回源 Host 已由 fetch 原生支持；" +
      "CF 上裸 IP + HTTPS + 自定义 SNI 由 fetchEngine 内部自动走 cloudflare:sockets 兜底，" +
      "请移除 origin/rule 配置中的 engine:'socket'。"
    );
  }

  const hh = opts?.hostHeader;
  const custom = hh?.custom;
  if (custom && String(custom).trim() && String(custom).trim() !== String(originUrl.hostname)) {
    headers.set('Host', String(custom).trim());
  } else if (hh?.mode === 'accel' && ctx.url.hostname && ctx.url.hostname !== String(originUrl.hostname)) {
    headers.set('Host', ctx.url.hostname);
  }

  return fetchOrigin(ctx, origin, originUrl, headers, timeoutMs, opts);
}

/**
 * 收集当前池中「不可用」的源站 id（熔断 KV + 冷却内存）。
 *
 * 熔断查询异步（KV + L1 采样读），冷却查询同步（内存）。若「全部不可用」则视为
 * 熔断信息失真，返回空列表，让 fail-open 智能放行接管（不拒绝服务）。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} pool 源站池
 * @param {number} penaltySeconds 冷却窗口（仅用于调试标注，过滤走 isPenalized）
 * @returns {Promise<string[]>} 不可用的源站 id 列表
 */
async function collectUnavailableIds(ctx, pool, penaltySeconds) {
  const origins = (pool?.origins || []).filter((o) => o && o.enabled !== false);
  if (origins.length === 0) return [];

  const BATCH_SIZE = 20;
  const unavailable = [];

  for (let i = 0; i < origins.length; i += BATCH_SIZE) {
    const batch = origins.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (o) => {
        if (isPenalized(ctx, pool.id, o.id)) return o.id; // 内存冷却，零 KV
        return (await isTripped(ctx, pool.id, o.id)) ? o.id : null;
      })
    );
    for (const r of results) if (r !== null) unavailable.push(r);
  }

  if (unavailable.length >= origins.length) {
    if (!Array.isArray(ctx.debug.notes)) ctx.debug.notes = [];
    ctx.debug.notes.push(`all-unavailable:ignoring(penalty=${penaltySeconds})`);
    return [];
  }

  return unavailable;
}

/**
 * 合并 ClientIpHeader：源站级打底，规则级优先覆盖。
 * @param {Object} [originCip] 源站级 clientIpHeader
 * @param {Object} [ruleCip] 规则级 clientIpHeader
 * @returns {Object} 合并后的 clientIpHeader
 */
function mergeClientIpHeader(originCip, ruleCip) {
  const hasRule = ruleCip && typeof ruleCip.enabled === 'boolean';
  if (hasRule) return { enabled: ruleCip.enabled, name: ruleCip.name || 'X-Forwarded-For' };
  if (originCip && typeof originCip.enabled === 'boolean') return { enabled: originCip.enabled, name: originCip.name || 'X-Forwarded-For' };
  return { enabled: false, name: 'X-Forwarded-For' };
}
