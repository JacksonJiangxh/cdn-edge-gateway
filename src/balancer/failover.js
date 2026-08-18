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
 *   1. 响应状态码命中 failover.retryOn：
 *      · 普通数字数组 → 仅这些码换源；
 *      · ['4xx5xx'] / ['*'] / ['all']（池级缺省）→ 所有错误码（status>=400，含 4xx/5xx 及 522/524 等）换源；
 *        注意 200/3xx 为正常响应（成功或重定向跟随），【绝不】算失败，不触发换源；
 *      · 池级为空 → 回落全站默认（4xx/5xx 错误码）。
 *   2. fetch 抛异常（DNS 失败、连接被拒、TLS 错误、超时）
 *      —— 这一类【无论 retryOn 如何配置都必须换源】
 *
 * 池级「自成体系」：源站池 failover 缺省为 retryOn=['4xx5xx'] + maxRetries=源站数-1，
 * 即任何错误响应都换源、且试遍所有 enabled 源站，不被全站默认截断。
 *
 * 单一源站（enabled 源站数 ≤ 1）：无可回退地址，failover 强制关闭（只回源一次）。
 * 配置层 normFailover 对单源站直接返回 null，运行时亦对单源站强制 enabled=false，
 * 避免 fail-open 把同一个挂掉的源站连打多遍、徒增延迟。
 */

import { ERROR_STATUS_RANGE, isErrorStatus } from '../contracts.js';
import { selectOrigin, primeChainWeights } from './strategy.js';
import { isTripped, recordFailure, recordSuccess, penalize, isPenalized } from './circuit.js';
import { buildOriginUrl, resolveHostHeader, mergeRewrite, mergeHeaderOps } from '../proxy/rewrite.js';
import { evalStagesForOrigin } from '../proxy/ruleEval.js';
import { buildOriginHeaders } from '../proxy/headers.js';
import { DEFAULT_CLIENT_IP_HEADER } from '../config/stages-defaults.js';
import { fetchOrigin } from '../proxy/engines/fetchEngine.js';
import { fetchOrigin as r2FetchOrigin } from '../proxy/engines/r2Engine.js';

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
 * @param {Object} [rule] 管线按「首选源站」求值出的规则（作为 site 缺省时的回退）
 * @param {Object} [hostHeader] 已解析的回源 Host 配置 {mode, custom}
 * @param {Object} [opts] 附加项
 * @param {Object} [opts.site] 命中的站点配置。传入后，每次尝试都会按「本次实际使用的
 *   源站」重新求值阶段规则（rewrite / reqHeaders / hostHeader），保证回源路径与鉴权头
 *   永远与目标域名匹配。未传入时退化为沿用 rule（与历史行为一致）。
 * @param {Object} [opts.preferredOrigin] 管线已选中的首选源站：首次尝试直接复用，
 *   避免同一请求内重复推进 SWRR 权重，并保证缓存键与首次回源使用同一源站。
 * @returns {Promise<Response>} 源站响应；全部失败时返回 502（或触发 serve-stale 兜底）
 */
export async function requestWithFailover(ctx, pool, rule, hostHeader, opts = {}) {
  const { site = null, preferredOrigin = null } = opts;
  const failover = pool?.failover || {};
  // 单一源站（无第二个地址可回退）：重试 / 换源无意义，强制关闭 failover，只打一次。
  // 否则 fail-open 会把同一个挂掉的源站连打 maxRetries 遍，只有害处没有收益。
  const enabledOrigins = (pool?.origins || []).filter((o) => o && o.enabled !== false);
  const singleOrigin = enabledOrigins.length <= 1;
  const enabled = !singleOrigin && failover.enabled !== false;
  // 池级 failover 是唯一换源真相源（全站/站点不承载 failover）。
  const rawRetryOn = Array.isArray(failover.retryOn) && failover.retryOn.length > 0
    ? failover.retryOn
    : [ERROR_STATUS_RANGE];
  // 错误码范围特标（ERROR_STATUS_RANGE='4xx5xx'）或旧别名 '*'/'all' → 所有错误响应换源（status>=400，即 4xx/5xx，含 522/524 等）；
  // 注意 200/3xx 正常响应（成功或重定向跟随）绝不算失败，不触发换源。
  // 显式数字数组 → 仅这些码换源。
  const retryOnErrorRange =
    rawRetryOn.includes(ERROR_STATUS_RANGE) || rawRetryOn.includes('*') || rawRetryOn.includes('all');
  const retryOn = retryOnErrorRange ? null : new Set(rawRetryOn);
  // 统一换源判据：串行分支与竞速分支共用，避免语义分叉。
  // 仓库引擎场景下 404 意味着「本源站没有该文件」，应触发换源到下一个源站
  // （CNB 没有就去 GitHub 找）—— 这已由池级缺省 retryOn=['4xx5xx'] 覆盖。
  const isRetryableStatus = (status) =>
    enabled && ((retryOnErrorRange && isErrorStatus(status)) || (retryOn && retryOn.has(status)));
  // maxRetries：优先用源站池显式配置；缺失时按「源站数 - 1」自动推导（试遍所有 enabled 源站），
  // 与文件头声明的真实模型一致，不使用任何硬编码默认次数。
  const maxRetries = enabled
    ? (Number.isFinite(failover.maxRetries)
        ? failover.maxRetries
        : Math.max(enabledOrigins.length - 1, 0))
    : 0;
  // 换源阈值真相源唯一收敛到池级归一化结果（normFailover 的 POOL_BASE 中性基线已保证字段必存在）：
  // 全站/站点层不承载 failover（源站池是唯一换源真相源）。故此处直接读池级值，不再有任何代码侧二级兜底。
  const poolTimeout = Number(failover.timeoutMs) || 0;
  const penaltySeconds = Number(failover.penaltySeconds) || 0;
  const totalTimeoutMs = Number(failover.totalTimeoutMs) || 0;
  const speculativeMs = Number(failover.speculativeMs) || 0;
  const MAX_RETRY_BODY = Number(failover.maxRetryBodyBytes) || 0;

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
    // 首次尝试复用管线已选中的首选源站：管线为了「按 origin 匹配规则」和「构造缓存键」
    // 已经选过一次源（推进过 SWRR 权重）。这里若再选一次，不仅会二次推进权重使轮询分布
    // 失真，更会让「求值规则时的源站」与「实际拨号的源站」不一致 —— 那正是多源站
    // 场景下 CNB 路径被打到 GitHub 域名而 404 的根因。
    const selected = (attempt === 0 && preferredOrigin && !excludeIds.includes(preferredOrigin.id))
      ? preferredOrigin
      : selectOrigin(pool, ctx, excludeIds);
    if (!selected) break;

    // 按「本次实际要拨号的源站」重新求值规则：站点规则可用 origin 作为匹配条件，
    // 不同源站的 rewrite / 鉴权头可能完全不同（如 CNB 与 GitHub 的 raw 路径格式）。
    // 只有逐尝试重新求值，才能保证 path / header 永远与目标域名匹配。
    const ra = resolveActionForOrigin(ctx, site, rule, selected);
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

    // 源站对象已不再承载任何流量序列字段（rewrite/头/超时/跟随），全部由规则层
    // （rule.action）提供。这里只使用规则层值，origin 参数传 undefined 表示无源站级覆盖。
    const mergedRewrite = mergeRewrite(undefined, ra.rewrite);
    const mergedReqHeaders = mergeHeaderOps(undefined, ra.reqHeaders);
    const mergedClientIpHeader = mergeClientIpHeader(ruleOrigin.clientIpHeader);

    const ruleTimeout = Number(ruleOrigin.originTimeoutMs) || 0;
    // 单次尝试超时：受剩余预算约束（最后一次用尽剩余预算），至少 500ms
    const remaining = budget - (Date.now() - startTs);
    const baseTimeout = ruleTimeout > 0 ? ruleTimeout : poolTimeout;
    const timeoutMs = Math.min(baseTimeout, Math.max(500, remaining));

    const followRedirect = ruleOrigin.followRedirect === true;

    const effectiveRule = { action: { rewrite: mergedRewrite } };
    // hostHeader 亦取自「按本源站求值」的结果（ra），而非请求级冻结的 rule。
    const originHostHeader = resolveHostHeader(ra.hostHeader, origin.hostHeader, hostHeader);
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
        // 第二通道必须按「它自己的源站」重新求值规则并自建 URL / Headers，
        // 绝不能复用首路的 originUrl（否则 CNB 路径会打到 GitHub 域名 → 必然 404，
        // 且 CNB 的 Authorization 会泄漏给 GitHub）。
        site,
        rule,
        hostHeaderFallback: hostHeader,
        isRetryableStatus,
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
          // 第二路已实际拨号过且失败：并入排除列表，避免下一轮又选中它白跑一次。
          if (!excludeIds.includes(raceResult.secondary.id)) {
            excludeIds.push(raceResult.secondary.id);
          }
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

      // 换源判据：启用 且 (指定全错误码范围且为错误响应，或命中显式码清单)
      if (isRetryableStatus(resp.status)) {
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
 * 按「本次实际要拨号的源站」求值该源站生效的规则动作。
 *
 * 这是本模块修复多源站 404 的关键：站点规则可以用 `origin` 作为匹配条件，
 * 不同源站的 rewrite 目标路径与鉴权头可能完全不同（典型如仓库型源站池中
 * CNB 的 `/-/git/raw/<branch>/` 与 GitHub 的 `/<branch>/`）。若沿用「请求级
 * 只求值一次」的冻结规则，换源后就会把上一个源站的路径打到新源站的域名上。
 *
 * 传入 site 时按该源站重新求值；未传入（旧调用方 / 单元测试）时退化为沿用
 * 请求级 rule，保持向后兼容。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object|null} site 命中的站点配置（缺省则退化）
 * @param {Object} [rule] 请求级已求值的规则（退化路径使用）
 * @param {Object} origin 本次尝试使用的源站
 * @returns {Object} 该源站生效的 action（含 rewrite / reqHeaders / origin / hostHeader…）
 */
function resolveActionForOrigin(ctx, site, rule, origin) {
  if (!site) {
    // 退化路径：无站点上下文时沿用请求级规则，但仍同步 ctx.origin，
    // 保证下游调试头 / 统计反映真实使用的源站。
    ctx.origin = origin;
    return rule?.action || {};
  }
  try {
    return evalStagesForOrigin(ctx, site, origin) || {};
  } catch {
    // 规则求值失败不应中断回源：退回请求级规则（宁可用旧规则回源，也不要 500）。
    ctx.origin = origin;
    return rule?.action || {};
  }
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
    // 捕获首路错误并记录到 primaryErr 即可；不得 rethrow，否则在 Promise.race 已
    // 决出胜者、primaryTask 仍 pending 后被中止时，该 rejection 无人接管，会成为
    // unhandled rejection，冒泡至 worker 运行时并导致整个请求 500。
    (e) => { primaryDone = true; primaryErr = e; return null; }
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
    // 首路先于竞速定时器返回：仍须做换源判据 —— 错误响应（含 404）不能算成功，
    // 否则「本源站没有该文件」会被当成最终结果返回，绕过故障转移。
    const earlyRetryable = typeof opts.isRetryableStatus === 'function'
      ? opts.isRetryableStatus
      : () => false;
    if (primaryResp && earlyRetryable(primaryResp.status)) {
      const snap = snapshotResp(primaryResp);
      primaryResp.body?.cancel().catch(() => {});
      // 第二路尚未启动，不存在 secondary 失败，交由外层继续换源。
      return { ok: false, primaryFailed: true, lastResponse: snap };
    }
    // 首路成功：不能 abort 已返回响应的 fetch，否则会中断正在传输的响应
    // body 流（与 ctrl.signal 关联），导致下游读取 AbortError / 502/500。
    // 第二路尚未启动（primaryDone 时 raced 仍为 false），无需取消。
    return { ok: true, winner: primary, resp: primaryResp, primaryFailed: false };
  }

  raced = true;
  if (!Array.isArray(ctx.debug.notes)) ctx.debug.notes = [];
  ctx.debug.notes.push(`speculative:${primary.id}->${secondary.id}`);

  // ---- 第二路：必须按「它自己的源站」独立求值规则并自建 URL / Headers ----
  // 过去这里写的是 `const secUrl = originUrl`，注释称「同池同 rule，URL 一致」——
  // 该前提在「规则以 origin 为匹配条件」时是错误的：仓库型源站池里 CNB 与 GitHub
  // 的 raw 路径格式完全不同，复用首路 URL 会 100% 打错路径（必然 404），
  // 且首路的 Authorization（CNB token）会被泄漏到 GitHub 请求上。
  const secAction = resolveActionForOrigin(ctx, opts.site, opts.rule, secondary);
  const secRuleOrigin = secAction.origin || {};
  const secScheme = secRuleOrigin.scheme || secondary.scheme || 'https';
  const secPort = Number(secRuleOrigin.port) > 0 ? Number(secRuleOrigin.port)
    : Number(secondary.port) > 0 ? Number(secondary.port)
    : (secScheme === 'http' ? 80 : 443);
  const secEngine = secRuleOrigin.engine || secondary.engine || 'fetch';
  const secOrigin = { ...secondary, scheme: secScheme, port: secPort, engine: secEngine };

  const secHostHeader = resolveHostHeader(secAction.hostHeader, secOrigin.hostHeader, opts.hostHeaderFallback);
  const secUrl = buildOriginUrl(
    ctx, secOrigin, { action: { rewrite: mergeRewrite(undefined, secAction.rewrite) } }, secHostHeader
  );
  // 独立 Headers 实例（buildOriginHeaders 每次返回新的 Headers），
  // 确保两条通道的鉴权头互不串扰。
  const secHeaders = await buildOriginHeaders(
    ctx, secOrigin, mergeHeaderOps(undefined, secAction.reqHeaders), ctx.env,
    mergeClientIpHeader(secRuleOrigin.clientIpHeader)
  );

  const secondaryTask = dispatch(ctx, secOrigin, secUrl, secHeaders, opts.timeoutMs, {
    followRedirect: secRuleOrigin.followRedirect === true,
    bodyBuf: opts.bodyBuf,
    hostHeader: secHostHeader,
    // 第二路不接竞速 controller（竞速取消只取消首路，慢路 abort 由自身超时处理）
  }).then(
    (r) => ({ ok: true, resp: r }),
    (e) => ({ ok: false, err: e })
  );

  // 换源判据：错误响应（含 404）不得作为竞速胜者。
  // 否则「某源站没有该文件」会被当成最终成功回给客户端，彻底绕过故障转移 ——
  // 这正是多源站下偶发 404 的直接原因。判据与串行分支共用同一实现。
  const isRetryable = typeof opts.isRetryableStatus === 'function'
    ? opts.isRetryableStatus
    : () => false;
  /** 记录被判为失败的响应快照，供两路皆败时对外报告 */
  let primaryBadResp = null;
  let secondaryBadResp = null;

  const winner = await Promise.race([
    primaryTask.then((r) => {
      if (!r) return null;
      if (isRetryable(r.status)) {
        primaryBadResp = snapshotResp(r);
        r.body?.cancel().catch(() => {});
        return null;
      }
      return { lane: 'primary', resp: r };
    }).catch(() => null),
    secondaryTask.then((s) => {
      if (!s.ok || !s.resp) return null;
      if (isRetryable(s.resp.status)) {
        secondaryBadResp = snapshotResp(s.resp);
        s.resp.body?.cancel().catch(() => {});
        return null;
      }
      return { lane: 'secondary', resp: s.resp };
    }).catch(() => null),
  ]);

  if (winner && winner.resp) {
    // 胜者已定：取消慢路。
    // 仅当胜者为第二路时才 abort —— ctrl 只关联首路，若首路是胜者，
    // abort 会中断其正在传输的 body 流导致下游 502/500。
    if (winner.lane === 'secondary') ctrl.abort();
    const won = winner.lane === 'primary' ? primary : secOrigin;
    ctx.debug.originId = won.id;
    ctx.debug.originAddr = `${won.addr}:${won.port || (won.scheme === 'http' ? 80 : 443)}`;
    if (winner.lane === 'secondary' && !ctx.debug.tried.includes(secOrigin.id)) {
      ctx.debug.tried.push(secOrigin.id);
    }
    return { ok: true, winner: won, resp: winner.resp, primaryFailed: false };
  }

  // Promise.race 只反映「最先落地的那一路」。上面把错误响应映射成 null 后，
  // 胜者可能为 null 而另一路其实仍在途且可能成功 —— 必须等两路都落地再判定，
  // 否则会把「一路 404、另一路 200」误判为双失败。
  // 注意：此处【不能】先 abort，否则会掐断仍在途的首路。
  const [pSettled, sSettled] = await Promise.all([
    primaryTask.catch(() => null),
    secondaryTask.catch(() => ({ ok: false })),
  ]);
  // 复检：若某一路最终拿到了非错误响应，直接采用（避免误判为双失败）。
  // 首路优先（与非竞速语义一致：能用首路就不换源）。
  if (pSettled && !isRetryable(pSettled.status) && !primaryBadResp) {
    return { ok: true, winner: primary, resp: pSettled, primaryFailed: false };
  }
  if (sSettled && sSettled.ok && sSettled.resp && !secondaryBadResp
      && !isRetryable(sSettled.resp.status)) {
    ctx.debug.originId = secOrigin.id;
    ctx.debug.originAddr = `${secOrigin.addr}:${secOrigin.port || (secOrigin.scheme === 'http' ? 80 : 443)}`;
    if (!ctx.debug.tried.includes(secOrigin.id)) ctx.debug.tried.push(secOrigin.id);
    return { ok: true, winner: secOrigin, resp: sSettled.resp, primaryFailed: false };
  }

  // 两路都失败（含「两路都是 404 等错误响应」）：收集失败信息。
  // lastResponse 优先取被判为可换源的错误响应快照，让外层在耗尽源站后
  // 能把真实状态码（而非笼统 502）返回给客户端。
  let lastResponse = null;
  let lastError = null;
  if (primaryBadResp) lastResponse = primaryBadResp;
  else if (secondaryBadResp) lastResponse = secondaryBadResp;
  else if (primaryResp && primaryResp.body) lastResponse = snapshotResp(primaryResp);
  if (primaryErr && !lastResponse) lastError = primaryErr;
  // 第二路已实际拨号过：并入 tried，使外层换源不再重复选中它。
  if (!ctx.debug.tried.includes(secOrigin.id)) ctx.debug.tried.push(secOrigin.id);
  return {
    ok: false,
    primaryFailed: !!primaryErr || !!primaryBadResp || (primaryResp ? true : false),
    secondary: secOrigin,
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

  // cnb / github 仓库型回源：已去独立引擎，底层统一走 fetch 引擎。
  // 回源域名（custom Host）、路径重写、鉴权头均由「预设站点规则」承载，
  // 此处与 fetch 引擎走完全相同的拨号路径（originUrl 已由 buildOriginUrl 按规则构造）。
  if (origin.engine === 'cnb' || origin.engine === 'github') {
    return fetchOrigin(ctx, origin, originUrl, headers, timeoutMs, opts);
  }

  // socket 引擎已彻底弃用：自定义回源 Host 由 fetch 原生支持（CF/EO/ESA 三平台均生效），
  // CF 上裸 IP+HTTPS+自定义 SNI 由 fetchEngine 内部自动走 cloudflare:sockets 兜底。
  // 历史残留的 engine:'socket' 在 schema 层已归一为 'fetch'，此处直接按 fetch 拨号，
  // 不再抛错（fail-open，避免存量/迁移配置触发运行时崩溃）。
  if (origin.engine === 'socket') {
    origin = { ...origin, engine: 'fetch' };
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
 * 合并 ClientIpHeader：规则层是唯一可配置来源（全站缺省打底，站点规则覆盖）。
 * 源站级 clientIpHeader 已废弃（origin 不再承载流量序列字段），故此处仅接收规则级值。
 * @param {Object} [ruleCip] 规则级 clientIpHeader
 * @returns {Object} 合并后的 clientIpHeader
 */
function mergeClientIpHeader(ruleCip) {
  const defName = DEFAULT_CLIENT_IP_HEADER.name; // 全站缺省名：'X-EdgeGateway-Client-IP'
  if (ruleCip && typeof ruleCip.enabled === 'boolean') return { enabled: ruleCip.enabled, name: ruleCip.name || defName };
  return { enabled: false, name: defName };
}
