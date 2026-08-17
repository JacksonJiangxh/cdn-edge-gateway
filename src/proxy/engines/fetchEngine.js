/**
 * fetch 回源引擎（默认引擎）
 * ----------------------------------------------------------------------------
 * 标准回源方式，适用于「源站是域名」或「源站是裸 IP（HTTP / CF 上 HTTPS）」的场景。
 *
 * 认知基线（2026-08 澄清，见 docs/07-eo-origin-host.md §五）：
 *   - fetch 可自定义 Host 头：CF / EO / ESA 三平台均支持。
 *     通过在 init.headers 中设置 Host 头即可让源站看到指定域名，例如：
 *       fetch(originUrl, { headers: { Host: 'bbb.example.com' } })
 *     EO / ESA 仅改 HTTP 头、连接仍按 URL 域名 DNS；CF 在 HTTP 下连裸 IP 直接可用。
 *   - 不再需要 SOCKS 才能自定义 Host：socket 不再是可选 engine，仅作为 CF 上
 *     「裸 IP + HTTPS + 自定义 SNI」的内部自动兜底（见下方 SNI 分支与 socketEngine.js）。
 *
 * 关于 HTTPS + 裸 IP 的 SNI 限制（仅 CF 相关）：
 *   CF 的 fetch() 会用 URL 中的主机名做 SNI 与 TLS 证书校验，而不是你设置的 Host 头。
 *   因此当 originUrl 是 https://<裸IP> 且需把 Host 头设成真实域名时，SNI 会是裸 IP、
 *   源站证书通常只签给域名 → TLS 握手失败。此时在 CF 上自动改走 cloudflare:sockets
 *   自建 TCP 并自行发送带正确 SNI/Host 的 HTTP 请求（socketEngine.rawTcpFetch）。
 */

import { UpstreamError } from '../../utils/errors.js';

/**
 * 判断给定 URL 是否为裸 IP（而非域名）。用于决定是否需要 SNI 兜底。
 * @param {URL|string} url
 * @returns {boolean}
 */
function isBareIp(url) {
  const host = (typeof url === 'string' ? new URL(url).hostname : url.hostname) || '';
  // IPv6 包裹在 [] 中，去掉括号再判
  const bare = host.startsWith('[') ? host.slice(1, -1) : host;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(bare) || bare.includes(':');
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

  // AbortController 实现超时：超时后 fetch 会以 AbortError 拒绝，
  // 上层 failover 捕获异常后换下一个源站
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  // 外部 cancel（竞速请求的慢路取消）：把「内部超时信号」与「外部取消信号」合并。
  // 优先用 AbortSignal.any（CF/EO/ESA 现代运行时均支持）；不支持时降级为事件桥接，
  // 任一信号 abort 即让内部 controller 取消，确保 fetch 一定能被取消、连接被释放。
  // 注意：AbortSignal.any() 返回的是只读 AbortSignal，本身没有 abort() 方法（只有
  // AbortController 才有）；但 controller.signal 是合并信号的成员，controller.abort()
  // 会自动传播到 combined，fetch 同样被取消。因此超时仍由顶部 timer 触发内部
  // controller.abort()；若合并信号已 abort（内部超时或外部取消任一触发），清理 timer
  // 避免 Worker 实例被无谓保活。这与降级分支（事件桥接 ext.addEventListener）语义一致。
  let effectiveSignal = controller.signal;
  if (opts?.controller && opts.controller !== controller) {
    const ext = opts.controller.signal;
    if (typeof AbortSignal.any === 'function') {
      const combined = AbortSignal.any([controller.signal, ext]);
      effectiveSignal = combined;
      // 合并信号已 abort（内部超时或外部取消任一触发）后清理定时器，避免 Worker 实例被无谓保活
      combined.addEventListener('abort', () => clearTimeout(timer), { once: true });
    } else {
      const onExternalAbort = () => controller.abort();
      if (ext.aborted) controller.abort();
      else ext.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  // CF + HTTPS + 裸 IP：fetch 的 SNI 会取 URL 里的 IP 导致证书校验失败，
  // 自动改走 cloudflare:sockets 自建 TCP（自行发送正确的 SNI/Host）。
  if (
    ctx.caps &&
    ctx.caps.platform === 'cf' &&
    ctx.caps.hasSocket &&
    String(originUrl).startsWith('https://') &&
    isBareIp(originUrl)
  ) {
    clearTimeout(timer);
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
    clearTimeout(timer);
  }
}
