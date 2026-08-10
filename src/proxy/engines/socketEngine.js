/**
 * socket 回源引擎（基于 cloudflare:sockets）
 * ----------------------------------------------------------------------------
 * 用途：回源到「裸 IP + 非标端口 + 自定义 Host 头」的场景。
 *
 * 为什么需要它？
 *   标准 fetch() 会强制把 Host 头设成 URL 的 hostname，无法覆盖。
 *   当源站是一台裸 IP 的机器，且需要靠 Host 头做虚拟主机路由时，
 *   fetch 就无能为力了，只能自己开 TCP 手写 HTTP/1.1。
 *
 * 平台兼容性：
 *   cloudflare:sockets 只在 CF Workers 上存在。EdgeOne / Node 打包时，
 *   静态的 import 语句会让构建器解析失败。因此这里用
 *       await import(`cloudflare${':'}sockets`)
 *   模板字符串拼接可以骗过打包器的静态分析，让它无法在构建期解析这个模块名，
 *   从而把解析推迟到运行时。非 CF 平台上这行会抛错，由上层降级到 fetchEngine。
 */

/** 读取响应头阶段的最大字节数，防止畸形响应把内存吃满 */
const MAX_HEADER_BYTES = 64 * 1024;

/**
 * 通过原始 TCP 套接字向源站发起 HTTP/1.1 请求。
 *
 * @param {import('../../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} origin 源站配置
 * @param {URL|string} originUrl 回源 URL
 * @param {Headers} headers 回源请求头
 * @param {number} [timeoutMs] 超时毫秒数，默认 10000
 * @returns {Promise<Response>} 源站响应
 * @throws {Error} 平台不支持或连接失败时抛出，由上层降级
 */
export async function socketFetch(ctx, origin, originUrl, headers, timeoutMs) {
  if (!ctx.caps?.hasSocket) {
    throw new Error('socket engine not supported on this platform');
  }

  const connect = await loadConnect();
  const url = new URL(String(originUrl));
  const timeout = Number(timeoutMs) > 0 ? Number(timeoutMs) : 10000;

  const port = Number(origin.port) || (url.protocol === 'https:' ? 443 : 80);
  const hostname = origin.addr || url.hostname;

  // TLS：https 需要 secureTransport:'on'，SNI 可单独指定
  // （裸 IP 回源时 SNI 往往要设成真实域名，否则源站证书校验失败）
  const secure = (origin.scheme || url.protocol.replace(':', '')) === 'https';
  const options = secure
    ? { secureTransport: 'on', allowHalfOpen: false }
    : { allowHalfOpen: false };
  if (secure && origin.sni) {
    options.servername = origin.sni;
  }

  const socket = connect({ hostname, port }, options);
  if (socket.opened) await socket.opened;

  const writer = socket.writable.getWriter();
  try {
    const requestBytes = buildRequestBytes(ctx, origin, url, headers);
    await writer.write(requestBytes);

    // 带 body 的方法：把客户端 body 透传过去
    const method = (ctx.request.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && ctx.request.body) {
      await pipeBody(ctx.request.body, writer);
    }
    writer.releaseLock();

    return await readResponse(socket, timeout, method);
  } catch (err) {
    try {
      writer.releaseLock();
    } catch {
      /* 已释放 */
    }
    try {
      await socket.close();
    } catch {
      /* 忽略关闭异常 */
    }
    throw err;
  }
}

/**
 * 运行时加载 cloudflare:sockets 的 connect。
 *
 * 模板字符串拼接是【刻意】的，用来破坏打包器的静态分析，
 * 使非 CF 平台的构建不会因为找不到该模块而失败。请勿「优化」成静态字符串。
 *
 * @returns {Promise<Function>} connect 函数
 * @throws {Error} 模块不可用时抛出
 */
async function loadConnect() {
  try {
    const mod = await import(/* @vite-ignore */ `cloudflare${':'}sockets`);
    if (typeof mod?.connect !== 'function') {
      throw new Error('connect() not found in cloudflare:sockets');
    }
    return mod.connect;
  } catch (err) {
    throw new Error(`cloudflare:sockets unavailable: ${err?.message || err}`);
  }
}

/**
 * 构造 HTTP/1.1 请求报文字节。
 *
 * 这里是 socket 引擎相对 fetch 的核心价值所在：Host 头完全由我们决定。
 *
 * hostHeader.mode 语义：
 *   inherit / origin → 用源站地址
 *   client           → 用客户端访问的域名
 *   custom           → 用 hostHeader.custom 指定的值
 *
 * @param {import('../../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} origin 源站配置
 * @param {URL} url 回源 URL
 * @param {Headers} headers 回源请求头
 * @returns {Uint8Array} 请求报文
 */
function buildRequestBytes(ctx, origin, url, headers) {
  const method = (ctx.request.method || 'GET').toUpperCase();
  // 请求行里用 origin-form：路径 + 查询串
  const target = `${url.pathname}${url.search}`;

  const hostValue = resolveHostHeader(ctx, origin, url);

  const lines = [`${method} ${target} HTTP/1.1`, `Host: ${hostValue}`];

  for (const [k, v] of headers) {
    const lower = k.toLowerCase();
    // Host 已单独处理；连接管理类头由我们自己控制
    if (lower === 'host' || lower === 'connection' || lower === 'transfer-encoding') continue;
    lines.push(`${k}: ${v}`);
  }

  // 不做连接复用，一次请求一个连接，读到 EOF 即结束，解析逻辑最简单
  lines.push('Connection: close');
  lines.push('', '');

  return new TextEncoder().encode(lines.join('\r\n'));
}

/**
 * 解析 hostHeader 配置，得出实际要发送的 Host 头。
 *
 * @param {import('../../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} origin 源站配置
 * @param {URL} url 回源 URL
 * @returns {string} Host 头的值
 */
function resolveHostHeader(ctx, origin, url) {
  const mode = origin?.hostHeader?.mode || 'origin';
  switch (mode) {
    case 'client':
      return ctx.url.host;
    case 'custom':
      return origin.hostHeader.custom || url.host;
    case 'inherit':
    case 'origin':
    default:
      return url.host;
  }
}

/**
 * 把客户端请求 body 泵入 socket。
 *
 * @param {ReadableStream} body 客户端 body
 * @param {WritableStreamDefaultWriter} writer socket writer
 * @returns {Promise<void>}
 */
async function pipeBody(body, writer) {
  const reader = body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) await writer.write(value);
  }
}

/**
 * 读取并解析源站的 HTTP/1.1 响应。
 *
 * 流程：先累积字节直到读到 "\r\n\r\n"（头部结束），解析状态行与响应头，
 * 剩余字节作为 body 的开头，再按 chunked / Content-Length / 读到 EOF 三种方式
 * 把 body 以流的形式交给上层，做到大文件零缓冲。
 *
 * @param {Object} socket TCP socket
 * @param {number} timeoutMs 超时
 * @param {string} method 请求方法
 * @returns {Promise<Response>} 解析出的响应
 */
async function readResponse(socket, timeoutMs, method) {
  const reader = socket.readable.getReader();

  // 超时控制：到点直接关闭 socket，让 read() 以异常结束
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    socket.close().catch(() => {});
  }, timeoutMs);

  try {
    // ---- 阶段一：读到头部结束标记 ----
    let buffer = new Uint8Array(0);
    let headerEnd = -1;

    while (headerEnd < 0) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        buffer = concat(buffer, value);
        headerEnd = indexOfCRLFCRLF(buffer);
        if (buffer.length > MAX_HEADER_BYTES && headerEnd < 0) {
          throw new Error('response header too large');
        }
      }
    }

    if (timedOut) throw new Error(`socket timeout after ${timeoutMs}ms`);
    if (headerEnd < 0) throw new Error('malformed response: header terminator not found');

    // ---- 阶段二：解析状态行与响应头 ----
    const headText = new TextDecoder().decode(buffer.slice(0, headerEnd));
    const rest = buffer.slice(headerEnd + 4);

    const headLines = headText.split('\r\n');
    const statusLine = headLines.shift() || '';
    const m = /^HTTP\/1\.[01]\s+(\d{3})\s*(.*)$/.exec(statusLine);
    if (!m) throw new Error(`malformed status line: ${statusLine.slice(0, 100)}`);

    const status = parseInt(m[1], 10);
    const statusText = m[2] || '';

    const respHeaders = new Headers();
    for (const line of headLines) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const name = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      try {
        respHeaders.append(name, value);
      } catch {
        // 非法头名直接跳过，不影响整体响应
      }
    }

    const isChunked = /chunked/i.test(respHeaders.get('transfer-encoding') || '');
    const contentLength = respHeaders.has('content-length')
      ? parseInt(respHeaders.get('content-length'), 10)
      : null;

    // 这些头描述的是「本次 TCP 连接的传输方式」，不应原样传给客户端，
    // 因为我们会把 body 重新组装成一个新的流
    respHeaders.delete('transfer-encoding');
    respHeaders.delete('connection');
    respHeaders.delete('content-encoding-hint');

    // HEAD 响应与 204/304 天然无 body
    const noBody = method === 'HEAD' || status === 204 || status === 304;
    if (noBody) {
      clearTimeout(timer);
      reader.releaseLock();
      socket.close().catch(() => {});
      return new Response(null, { status, statusText, headers: respHeaders });
    }

    // ---- 阶段三：以流的方式产出 body ----
    const stream = isChunked
      ? createChunkedStream(reader, rest, socket, timer)
      : createIdentityStream(reader, rest, socket, timer, contentLength);

    return new Response(stream, { status, statusText, headers: respHeaders });
  } catch (err) {
    clearTimeout(timer);
    try {
      reader.releaseLock();
    } catch {
      /* 已释放 */
    }
    socket.close().catch(() => {});
    throw err;
  }
}

/**
 * 构造「定长 / 读到 EOF」的 body 流。
 *
 * @param {ReadableStreamDefaultReader} reader socket reader
 * @param {Uint8Array} initial 头部之后已经读到的字节
 * @param {Object} socket TCP socket
 * @param {number} timer 超时定时器 id
 * @param {number|null} contentLength Content-Length，null 表示读到 EOF
 * @returns {ReadableStream} body 流
 */
function createIdentityStream(reader, initial, socket, timer, contentLength) {
  let delivered = 0;

  return new ReadableStream({
    start(controller) {
      if (initial.length > 0) {
        controller.enqueue(initial);
        delivered += initial.length;
      }
      if (contentLength !== null && delivered >= contentLength) {
        finish(controller, reader, socket, timer);
      }
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          finish(controller, reader, socket, timer);
          return;
        }
        if (value) {
          controller.enqueue(value);
          delivered += value.length;
          if (contentLength !== null && delivered >= contentLength) {
            finish(controller, reader, socket, timer);
          }
        }
      } catch (err) {
        clearTimeout(timer);
        controller.error(err);
        socket.close().catch(() => {});
      }
    },
    cancel() {
      clearTimeout(timer);
      socket.close().catch(() => {});
    },
  });
}

/**
 * 构造 chunked 传输编码的 body 流，边读边解码。
 *
 * chunked 格式：每个分块为「十六进制长度\r\n数据\r\n」，以长度 0 的分块结束。
 *
 * @param {ReadableStreamDefaultReader} reader socket reader
 * @param {Uint8Array} initial 头部之后已经读到的字节
 * @param {Object} socket TCP socket
 * @param {number} timer 超时定时器 id
 * @returns {ReadableStream} 解码后的 body 流
 */
function createChunkedStream(reader, initial, socket, timer) {
  let buf = initial;
  let done = false;

  /**
   * 尝试从缓冲区中解出尽可能多的完整分块。
   *
   * @param {ReadableStreamDefaultController} controller 流控制器
   * @returns {boolean} 是否已读到结束分块
   */
  function drain(controller) {
    while (true) {
      const lineEnd = indexOfCRLF(buf);
      if (lineEnd < 0) return false; // 长度行还没收全

      const sizeLine = new TextDecoder().decode(buf.slice(0, lineEnd));
      // 分块扩展用 ";" 分隔，取前半段即可
      const size = parseInt(sizeLine.split(';')[0].trim(), 16);

      if (!Number.isFinite(size)) {
        controller.error(new Error(`malformed chunk size: ${sizeLine.slice(0, 50)}`));
        return true;
      }

      // 结束分块
      if (size === 0) return true;

      // 数据体 + 尾部 CRLF 是否已完整到达
      const dataStart = lineEnd + 2;
      const dataEnd = dataStart + size;
      if (buf.length < dataEnd + 2) return false;

      controller.enqueue(buf.slice(dataStart, dataEnd));
      buf = buf.slice(dataEnd + 2);
    }
  }

  return new ReadableStream({
    async pull(controller) {
      if (done) return;
      try {
        // 先尽量消费已有缓冲
        if (drain(controller)) {
          done = true;
          finish(controller, reader, socket, timer);
          return;
        }

        const { done: eof, value } = await reader.read();
        if (eof) {
          done = true;
          finish(controller, reader, socket, timer);
          return;
        }
        if (value) {
          buf = concat(buf, value);
          if (drain(controller)) {
            done = true;
            finish(controller, reader, socket, timer);
          }
        }
      } catch (err) {
        clearTimeout(timer);
        controller.error(err);
        socket.close().catch(() => {});
      }
    },
    cancel() {
      clearTimeout(timer);
      socket.close().catch(() => {});
    },
  });
}

/**
 * 收尾：关闭流、释放 reader、关闭 socket、清理定时器。
 *
 * @param {ReadableStreamDefaultController} controller 流控制器
 * @param {ReadableStreamDefaultReader} reader socket reader
 * @param {Object} socket TCP socket
 * @param {number} timer 定时器 id
 * @returns {void}
 */
function finish(controller, reader, socket, timer) {
  clearTimeout(timer);
  try {
    controller.close();
  } catch {
    /* 已关闭 */
  }
  try {
    reader.releaseLock();
  } catch {
    /* 已释放 */
  }
  socket.close().catch(() => {});
}

/**
 * 拼接两个 Uint8Array。
 *
 * @param {Uint8Array} a 前段
 * @param {Uint8Array} b 后段
 * @returns {Uint8Array} 拼接结果
 */
function concat(a, b) {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * 查找 "\r\n" 的位置。
 *
 * @param {Uint8Array} buf 字节缓冲
 * @returns {number} 下标，未找到返回 -1
 */
function indexOfCRLF(buf) {
  for (let i = 0; i + 1 < buf.length; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) return i;
  }
  return -1;
}

/**
 * 查找 "\r\n\r\n"（头部结束标记）的位置。
 *
 * @param {Uint8Array} buf 字节缓冲
 * @returns {number} 下标，未找到返回 -1
 */
function indexOfCRLFCRLF(buf) {
  for (let i = 0; i + 3 < buf.length; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) return i;
  }
  return -1;
}
