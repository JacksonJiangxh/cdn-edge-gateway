/**
 * fetch 回源引擎（默认引擎）
 * ----------------------------------------------------------------------------
 * 标准回源方式，适用于「源站是域名」或「源站是裸 IP（CF / EO 的 fetch 均支持直连）」的场景。
 *
 * 认知基线（2026-08 澄清，见 docs/07-eo-origin-host.md §五，并据 EdgeOne 官方
 * Fetch 文档 cloud.tencent.com/document/product/1552/81897 校正）：
 *   - fetch 可自定义 Host 头：CF / EO / ESA 三平台均支持。
 *     通过在 init.headers 中设置 Host 头即可让源站看到指定域名，例如：
 *       fetch(originUrl, { headers: { Host: 'bbb.example.com' } })
 *     CF / EO 的 fetch 均允许直接 fetch 裸 IP（EO 官方文档未禁止裸 IP，标准 fetch 行为）。
 *   - 不再需要 SOCKS 才能自定义 Host：socket 不再是可选 engine，仅作为 CF 上
 *     「回源 Host ≠ URL 主机名（即需要自定义 SNI）」的内部自动兜底（见下方分支与 socketEngine.js）。
 *
 * 关于 SNI 的核心规则（全局内置，三平台语义一致）：
 *   「实际回源 Host 是什么，SNI 就是什么」。
 *     - 加速域名 A 回源、DNS 目标 B、Host=A  → SNI=A
 *     - 回源域名回源、DNS 目标 B、Host=B     → SNI=B
 *     - 自定义 Host C 回源、DNS 目标 B、Host=C → SNI=C
 *   标准 fetch() 的 SNI 取的是【URL 里的主机名】，而非你设置的 Host 头。
 *   因此只要「Host 头 ≠ URL hostname」（无论目标是裸 IP 还是域名），标准 fetch 的 SNI 就会
 *   取成 URL hostname 而非 Host，导致源站证书（签给 Host）校验失败。
 *   此场景下（且仅 CF 具备 cloudflare:sockets）自动改走 socketEngine 自建 TCP，
 *   用 Host 头作为 SNI 发送正确的 HTTP 请求。EO 上若该场景无法用 sockets 覆盖
 *   （无可编程 TCP），应把「自定义 Host + SNI」下沉到 EO 平台源站组兜底。
 */

import { UpstreamError } from '../../utils/errors.js';

/**
 * 判断「回源 Host 头是否与 URL 主机名不同」——即是否需要自定义 SNI。
 *
 * 规则（SNI 跟随 Host）：实际回源 Host 是什么，SNI 就是什么。标准 fetch 的 SNI
 * 取的是 URL 里的主机名而非 Host 头，所以只要 Host 头 ≠ URL hostname，标准 fetch
 * 的 SNI 就会取错（取成 URL hostname），导致源站证书（签给 Host）校验失败。
 * 此场景在 CF 上需改走 cloudflare:sockets 自建 TCP 用 Host 头作 SNI。
 *
 * 注意：与是否裸 IP 无关。裸 IP 只是其中一种「Host ≠ URL hostname」的情形；
 * 加速域名 A 回源但 DNS 目标 B（Host=A、URL=B）同样命中本判断。
 *
 * @param {URL|string} url 回源 URL（其 hostname 为连接/TLS 目标）
 * @param {Headers} headers 已构造好的回源请求头（含 Host 头）
 * @returns {boolean} Host 头与 URL hostname 不同则为 true（需要自定义 SNI）
 */
export function needCustomSni(url, headers) {
  const urlHost = (typeof url === 'string' ? new URL(url).hostname : url.hostname) || '';
  const hostHeader = headers.get('Host');
  // 无 Host 头或 Host 头与 URL hostname 一致 → 标准 fetch 的 SNI 即正确，无需兜底
  if (!hostHeader) return false;
  // Host 头可能带端口（host:port），只比主机名部分
  const hostName = hostHeader.split(':')[0];
  return hostName !== urlHost;
}

/**
 * 向源站发起一次请求，带超时控制。
 *
 * @param {import('../../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} origin 源站配置
 * @param {URL|string} originUrl 回源 URL
 * @param {Headers} headers 已构造好的回源请求头
 * @param {number} [timeoutMs] 超时毫秒数，默认 10000
 * @param {{followRedirect?:boolean, bodyBuf?:ArrayBuffer|null, controller?:AbortController}} [opts] 附加选项
 *   - controller：外部传入的 AbortController（竞速请求用，由上层统一 abort 取消慢路）。
 *     若提供，引擎内部超时定时器仍独立工作，二者任一 abort 即取消；默认路径不传，零影响。
 * @returns {Promise<Response>} 源站响应
 * @throws {Error} 网络错误或超时时抛出，由上层 failover 处理换源
 */
export async function fetchOrigin(ctx, origin, originUrl, headers, timeoutMs, opts) {
  const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 10000;

  // AbortController 特性探测：阿里云 ESA 的 RuntimeAPI 手册未列 AbortController，
  // 若平台不支持，直接 `new AbortController()` 会抛错导致所有回源失败。故仅在全局
  // 确实存在该构造器时才启用超时控制；不支持则降级为「不设 signal 的 fetch」，
  // 回源仍可用（仅无超时取消，但上层 failover 仍有自己的超时语义兜底）。
  const hasAbort = typeof AbortController === 'function';
  const controller = hasAbort ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;

  // 外部 cancel（竞速请求的慢路取消）：把「内部超时信号」与「外部取消信号」合并。
  // 优先用 AbortSignal.any（CF/EO/ESA 现代运行时均支持）；不支持时降级为事件桥接，
  // 任一信号 abort 即让内部 controller 取消，确保 fetch 一定能被取消、连接被释放。
  // 注意：AbortSignal.any() 返回的是只读 AbortSignal，本身没有 abort() 方法（只有
  // AbortController 才有）；但 controller.signal 是合并信号的成员，controller.abort()
  // 会自动传播到 combined，fetch 同样被取消。因此超时仍由顶部 timer 触发内部
  // controller.abort()；若合并信号已 abort（内部超时或外部取消任一触发），清理 timer
  // 避免 Worker 实例被无谓保活。这与降级分支（事件桥接 ext.addEventListener）语义一致。
  let effectiveSignal = controller ? controller.signal : undefined;
  if (opts?.controller && opts.controller !== controller) {
    const ext = opts.controller.signal;
    if (controller && typeof AbortSignal.any === 'function') {
      const combined = AbortSignal.any([controller.signal, ext]);
      effectiveSignal = combined;
      // 合并信号已 abort（内部超时或外部取消任一触发）后清理定时器，避免 Worker 实例被无谓保活
      combined.addEventListener('abort', () => { if (timer) clearTimeout(timer); }, { once: true });
    } else {
      const onExternalAbort = () => controller && controller.abort();
      if (ext.aborted) controller && controller.abort();
      else ext.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  // CF + HTTPS + 需要自定义 SNI（Host 头 ≠ URL hostname）：标准 fetch 的 SNI 取 URL
  // hostname 而非 Host 头，证书校验失败，自动改走 cloudflare:sockets 自建 TCP
  // （用 Host 头作 SNI 发送正确的 HTTP 请求）。场景包括：裸 IP 回源、加速域名 A 回源
  // 但 DNS 目标 B（Host=A）、以及任意自定义 Host 回源——SNI 跟随 Host 即可正确握手。
  if (
    ctx.caps &&
    ctx.caps.platform === 'cf' &&
    ctx.caps.hasSocket &&
    String(originUrl).startsWith('https://') &&
    needCustomSni(originUrl, headers)
  ) {
    if (timer) clearTimeout(timer);
    const { rawTcpFetch } = await import('./socketEngine.js');
    return rawTcpFetch(originUrl, headers, timeout, opts, ctx);
  }

  const method = (ctx.request.method || 'GET').toUpperCase();

  /** @type {RequestInit} */
  const init = {
    method,
    headers,
    signal: effectiveSignal,
    // 默认：源站的 3xx 交给客户端自己处理，CDN 不代为跟随，
    // 否则 Location 指向的地址可能绕开我们的加速链路。
    // 规则显式开启 followRedirect 时（EO：回源跟随重定向），由边缘代为跟随，
    // 适用于源站做了内部跳转、希望对客户端透明的场景。
    redirect: opts?.followRedirect ? 'follow' : 'manual',
  };

  // 只有可能带 body 的方法才传 body；GET/HEAD 带 body 会直接抛 TypeError。
  // 优先使用 failover 预先物化的 bodyBuf（重试时可复用，避免流式 body 被重复消费）；
  // 无 bodyBuf 时回退到流式 ctx.request.body（如超大 body 关闭了重试的情况）。
  if (method !== 'GET' && method !== 'HEAD') {
    if (opts?.bodyBuf != null) {
      init.body = opts.bodyBuf;
    } else {
      init.body = ctx.request.body;
      // 流式 body 必须声明 duplex，否则运行时报错
      init.duplex = 'half';
    }
  }

  try {
    // ESA 适配（官方 fetchAPI.md §Request 特有）：ESA 推荐对「不打算再读取 body 的
    // 客户端请求」调用 request.ignore() 以复用连接池、提升性能。CF/EO 无此 API。
    // 仅在 ESA 且客户端请求对象确有 ignore 方法时调用；且**仅当回源没用流式客户端
    // body**（即已用 bodyBuf 物化、或 GET/HEAD 无 body）时才 ignore——否则流式 body
    // 被忽略会导致上游收不到请求体。用特性探测，其它平台恒不触发。
    if (
      ctx.caps &&
      ctx.caps.platform === 'esa' &&
      ctx.request &&
      typeof ctx.request.ignore === 'function'
    ) {
      const streamingClientBody = method !== 'GET' && method !== 'HEAD' && opts?.bodyBuf == null;
      if (!streamingClientBody) {
        try { ctx.request.ignore(); } catch { /* ignore 失败不影响主流程 */ }
      }
    }
    return await fetch(String(originUrl), init);
  } catch (err) {
    // 回源网络错误 / 超时（AbortError）等：统一包成 UpstreamError(502)。
    // 真实上游地址、证书、DNS 细节不外泄（expose=false）；
    // 上层 failover 仍会捕获该 Error 换下一个源站，语义不变。
    throw new UpstreamError(`回源失败 (${String(originUrl)})`, {
      cause: err,
      details: { origin: String(originUrl), timeoutMs: timeout },
    });
  } finally {
    // 无论成功失败都要清掉定时器，避免 Worker 实例被无谓地保活
    if (timer) clearTimeout(timer);
  }
}
