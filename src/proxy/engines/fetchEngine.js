/**
 * fetch 回源引擎
 * ----------------------------------------------------------------------------
 * 标准回源方式，适用于「源站是域名」的绝大多数场景。
 *
 * 关键行为：fetch(originUrl) 发出的请求，Host 头由 originUrl.hostname 决定，
 * 且运行时会忽略手动设置的 Host。这正是我们要的效果 —— 源站只看到自己的域名，
 * 完全感知不到用户访问的加速域名。
 */

/**
 * 向源站发起一次请求，带超时控制。
 *
 * @param {import('../../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} origin 源站配置
 * @param {URL|string} originUrl 回源 URL
 * @param {Headers} headers 已构造好的回源请求头
 * @param {number} [timeoutMs] 超时毫秒数，默认 10000
 * @param {{followRedirect?:boolean}} [opts] 附加选项
 * @returns {Promise<Response>} 源站响应
 * @throws {Error} 网络错误或超时时抛出，由上层 failover 处理换源
 */
export async function fetchOrigin(ctx, origin, originUrl, headers, timeoutMs, opts) {
  const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 10000;

  // AbortController 实现超时：超时后 fetch 会以 AbortError 拒绝，
  // 上层 failover 捕获异常后换下一个源站
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const method = (ctx.request.method || 'GET').toUpperCase();

  /** @type {RequestInit} */
  const init = {
    method,
    headers,
    signal: controller.signal,
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
  } finally {
    // 无论成功失败都要清掉定时器，避免 Worker 实例被无谓地保活
    clearTimeout(timer);
  }
}
