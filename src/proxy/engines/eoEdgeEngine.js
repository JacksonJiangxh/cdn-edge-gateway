/**
 * ============================================================================
 * proxy/engines/eoEdgeEngine.js —— EO 同站 fetch 委托节点缓存
 * ----------------------------------------------------------------------------
 * 仅在 EdgeOne Makers 上由 proxy/pipeline.js 的路径 A 分支调用。
 *
 * 官方机制（https://cloud.tencent.com/document/product/1552/81897）：
 *   当客户端访问「已接入 EO 加速域名」触发边缘函数执行时，
 *   在该函数内执行 fetch(同站加速域名) 会走 EO 节点缓存/回源：
 *     - 命中 → 边缘直接返回，零函数调用（真正的省额度）
 *     - 未命中 → EO 按平台「源站组 + 回源 Host 重写」回源
 *
 * 触发三条件（必须全部满足）：
 *   1. 客户端请求触发了边缘函数执行            —— 调用方已满足
 *   2. fetch(request).url 的 HOST == 客户端 HOST —— 用原请求 URL，不改 host
 *   3. fetch(request).headers.host == 客户端 HOST —— 不注入自定义 Host
 *
 * 因此本引擎严格「原样转发」客户端请求（保留 URL 与 host 头），
 * 不附带任何自定义回源 Host——这正是当且仅当「无自定义回源 Host」时才走路径 A 的原因。
 *
 * 与项目多源站逻辑的边界：
 *   - 有自定义回源 Host / 需要多源站故障转移的请求 → 走 fetchEngine（failover 逻辑），
 *     由项目回源 + 响应头委托 EO 边缘缓存（路径 B）。
 *   - 无自定义 Host 的可缓存静态 → 走本引擎（路径 A），EO 全权承担 CDN。
 * ============================================================================
 */

/**
 * 用「同站 fetch」把回源委托给 EO 边缘节点缓存。
 *
 * @param {import('../../contracts.js').Ctx} ctx 请求上下文（仅用于 debug 标记）
 * @param {Request} clientRequest 原始客户端请求（其 URL 的 host 即加速域名）
 * @param {import('../../contracts.js').CachePolicy} [policy] 缓存策略（预留，当前仅用于标记）
 * @returns {Promise<Response>} EO 节点缓存命中的响应，或 EO 回源响应
 */
export async function eoEdgeFetch(ctx, clientRequest, policy) {
  // 关键：用客户端原始请求的 URL 与请求头构造转发请求，
  // 保证 fetch 目标的 HOST 与 host 头均与客户端一致，激活 EO 节点缓存/回源通道。
  const url = new URL(clientRequest.url);

  const init = {
    method: clientRequest.method,
    // 保留客户端原始请求头（含 host 头一致），不注入任何自定义 Host
    headers: clientRequest.headers,
    redirect: 'follow',
  };

  // GET/HEAD 无 body；其它方法（POST 等）原样携带（代理场景少见，但保持透明）
  const method = String(clientRequest.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      // 不直接消费原 body
      init.body = clientRequest.clone().body;
    } catch {
      /* 不可克隆时忽略 body，交给 EO 处理 */
    }
  }

  if (ctx && ctx.debug) {
    // 便于观测：实际走了同站 fetch 委托
    ctx.debug.eoEdgeFetch = url.host;
  }

  // 触发 EO 节点缓存/回源：url.host == 客户端 HOST，host 头一致 → 满足三条件
  return fetch(url.toString(), init);
}
