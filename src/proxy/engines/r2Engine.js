/**
 * ============================================================================
 * proxy/engines/r2Engine.js —— R2 直读回源引擎
 * ----------------------------------------------------------------------------
 * 仅 Cloudflare 可用。把「回源」从「公网 fetch R2 自定义域名」改为
 * 「Worker 进程内直接调用 R2 binding（env.MY_BUCKET）」，全程走 Cloudflare
 * 骨干网，不出公网 DNS、不计 egress 带宽费，且读流为 Web ReadableStream，
 * 零拷贝塞进 Response，不占 Worker 内存。
 *
 * key 的计算：
 *   最终 key = r2KeyPrefix + pathnameToKey(pathname)
 *   pathnameToKey 取决于 origin.r2KeyMode：
 *     - none   原样（去掉开头多余斜杠，规范化为不带前导 '/'）
 *     - prefix 在 pathname 前加 r2KeyPrefixRule
 *     - strip  剥离开头的 r2KeyPrefixRule
 *     - regex  用 regexFrom=r2KeyPrefixRule / regexTo=r2KeyRegexTo 替换
 *   这一步在规则级 rewrite 之后作用（rewrite 已先改过 originUrl.pathname）。
 *
 * 调用方：balancer/failover.js 的 dispatch，按 origin.engine==='r2' 分流到此。
 * ============================================================================
 */

/**
 * 把 pathname 转换为 R2 key（不含 r2KeyPrefix 前缀，前缀在外部拼接）。
 * @param {string} pathname 形如 "/img/x.png"（已含规则级 rewrite）
 * @param {Object} origin 源站
 * @returns {string} 处理后的 key 片段（不以 '/' 开头）
 */
function pathnameToKey(pathname, origin) {
  let p = pathname || '/';
  const mode = origin.r2KeyMode || 'none';
  const rule = origin.r2KeyPrefixRule || '';

  switch (mode) {
    case 'prefix': {
      if (rule) p = (rule.replace(/\/+$/, '') + '/' + p.replace(/^\/+/, '')).replace(/^\/+/, '');
      break;
    }
    case 'strip': {
      if (rule && p.startsWith(rule)) p = p.slice(rule.length);
      break;
    }
    case 'regex': {
      try {
        const re = new RegExp(rule || '', 'g');
        p = p.replace(re, origin.r2KeyRegexTo ?? '');
      } catch {
        /* 非法正则容错，保持原样 */
      }
      break;
    }
    case 'none':
    default:
      break;
  }

  // 统一去掉前导斜杠，R2 key 通常不以 "/" 开头
  return p.replace(/^\/+/, '');
}

/**
 * 解析出最终的 R2 key。
 * @param {Object} origin 源站（engine==='r2'）
 * @param {URL} originUrl 已重写路径的回源 URL
 * @returns {string} 完整 R2 key
 */
export function resolveR2Key(origin, originUrl) {
  const prefix = (origin.r2KeyPrefix || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const body = pathnameToKey(originUrl.pathname, origin);
  return prefix ? `${prefix}/${body}` : body;
}

/**
 * R2 回源主入口。签名与 fetchEngine.fetchOrigin 对齐，便于 failover 统一超时/重试。
 *
 * 注意：R2 binding 调用本身不支持「fetch 那样的 AbortSignal 超时」，这里用
 * Promise.race 包一层超时（与 failover 的超时语义一致）。条件请求（If-None-Match）
 * 透传以实现 304 协商缓存。
 *
 * @param {import('../../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} origin 选中的源站（engine==='r2'）
 * @param {URL} originUrl 回源 URL（pathname 已含规则级 rewrite）
 * @param {Headers} headers 已构造的回源请求头
 * @param {number} timeoutMs 回源超时（毫秒）
 * @returns {Promise<Response>} 节点响应
 */
export async function fetchOrigin(ctx, origin, originUrl, headers, timeoutMs) {
  const binding = origin.r2Binding;
  const bucket = ctx.env?.[binding];
  if (!bucket || typeof bucket.get !== 'function') {
    return new Response(`R2 binding "${binding}" 未绑定或不可用（仅 Cloudflare 支持）`, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const key = resolveR2Key(origin, originUrl);
  if (!key) {
    return new Response('R2 key 为空（请检查源站 r2KeyPrefix / r2KeyMode 配置）', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const inm = ctx.request.headers.get('if-none-match');
  const options = inm ? { onlyIf: { etagDoesNotMatch: inm } } : undefined;

  const getObj = bucket.get(key, options);
  const obj = await withTimeout(getObj, timeoutMs, `R2 get "${key}"`);

  if (!obj) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  // 条件请求命中：etag 匹配时 R2 返回 304 且 body 为 null
  if (obj.body === null) {
    const h = new Headers();
    if (obj.httpEtag) h.set('etag', obj.httpEtag);
    if (obj.uploaded) h.set('last-modified', new Date(obj.uploaded).toUTCString());
    return new Response(null, { status: 304, headers: h });
  }

  const respHeaders = new Headers();
  const contentType =
    obj.httpMetadata?.contentType || origin.r2ContentType || 'application/octet-stream';
  respHeaders.set('content-type', contentType);
  if (obj.httpEtag) respHeaders.set('etag', obj.httpEtag);
  if (obj.uploaded) respHeaders.set('last-modified', new Date(obj.uploaded).toUTCString());
  if (obj.size != null) respHeaders.set('content-length', String(obj.size));
  // 透传自定义元数据（用于携带 CORS / 业务头）
  const meta = obj.customMetadata || {};
  for (const [k, v] of Object.entries(meta)) {
    if (k.toLowerCase().startsWith('x-') || k.toLowerCase().startsWith('access-control-')) {
      respHeaders.set(k, v);
    }
  }

  return new Response(obj.body, { status: 200, headers: respHeaders });
}

/**
 * 给一个 promise 套上超时。超时后 reject，由 failover 触发换源/重试。
 * @param {Promise<any>} p 目标 promise
 * @param {number} ms 超时毫秒（<=0 表示不限制）
 * @param {string} label 超时错误信息
 * @returns {Promise<any>}
 */
function withTimeout(p, ms, label) {
  if (!ms || ms <= 0) return p;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}
