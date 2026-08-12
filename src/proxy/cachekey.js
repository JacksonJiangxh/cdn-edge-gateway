/**
 * 缓存键构造
 * ----------------------------------------------------------------------------
 * 旧版原型的致命 bug：
 *
 *   const cacheKey = new Request(cacheKeyUrl.toString(), request);
 *
 * 第二个参数传入原始 request，会把它的 method、headers、body 一并继承过来：
 *  1. 缓存串号：Authorization / Cookie 进入缓存键的 Vary 计算，
 *     不同用户可能互相读到对方的缓存，或者缓存命中率被打到接近 0
 *  2. POST 直接报错：Cache API 只接受 GET 作为缓存键，
 *     带 body 的请求会抛 "Cannot cache non-GET request"
 *
 * 正确做法：缓存键必须是一个「干净的、只有 URL 的 GET 请求」。
 */

/**
 * 解析 Cookie 头为键值对。
 *
 * @param {string} raw Cookie 头原始值
 * @returns {Record<string,string>}
 */
function parseCookies(raw) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const part of String(raw).split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k) out[k] = part.slice(eq + 1).trim();
  }
  return out;
}

/**
 * 构造缓存键。
 *
 * 缓存键以「回源 URL」为基准而非客户端 URL，这样多个加速域名指向同一源站时
 * 可以共享同一份边缘缓存。
 *
 * 查询串处理：
 *  - ignoreQuery = true  → 丢弃全部查询串
 *  - ignoreQuery = false + queryWhitelist 非空 → 只保留白名单参数，并按字典序排序
 *  - ignoreQuery = false + queryWhitelist 为空 → 全部保留，同样排序
 *
 * 排序的目的是让 ?a=1&b=2 与 ?b=2&a=1 命中同一份缓存。
 *
 * 缓存键的构成维度（三个）：
 *   1. 回源 URL（路径 + 经策略过滤后的查询串）
 *   2. 客户端 host —— 见下方 __h 参数的说明
 *   3. 缓存代次 cacheGen —— 见下方 __gen 参数的说明
 *
 * 关于 Accept-Encoding：
 *   【刻意不纳入缓存键】。Cloudflare 的边缘缓存会自行处理 gzip/br 的存储与协商，
 *   若手动把 Accept-Encoding 掺进键里，会因为各浏览器的取值差异
 *   （"gzip, deflate, br" / "gzip, deflate, br, zstd" / "gzip"…）
 *   产生大量近乎重复的缓存副本，命中率显著下降。
 *   压缩变体的正确性由源站的 Vary: Accept-Encoding 响应头保证。
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} [policy] 缓存策略 CachePolicy
 * @param {URL|string} originUrl 回源 URL
 * @param {{cacheGen?: number}} [opts] 附加选项
 * @param {number} [opts.cacheGen] 站点缓存代次，管理面「整站清除」时递增
 * @returns {Request} 可安全用于 Cache API 的缓存键
 */
export function buildCacheKey(ctx, policy, originUrl, opts) {
  const keyUrl = new URL(String(originUrl));

  if (policy?.ignoreQuery) {
    // 完全忽略查询串
    keyUrl.search = '';
  } else {
    const whitelist = Array.isArray(policy?.queryWhitelist) ? policy.queryWhitelist : [];

    // 无 query 且白名单为空（或全白名单场景下本无参数可保留）时，直接得到「无 query 键」。
    // 这样 ignoreQuery=true 与「ignoreQuery=false + 请求本就无 query」最终收敛到同一个键，
    // 保证同一资源的两种请求形态共享同一份边缘缓存，避免重复回源。
    if (whitelist.length === 0 && keyUrl.search === '') {
      keyUrl.search = '';
    } else {
      const src = keyUrl.searchParams;
      const picked = [];

      for (const [k, v] of src) {
        // 白名单为空表示全保留
        if (whitelist.length === 0 || whitelist.includes(k)) {
          picked.push([k, v]);
        }
      }

      // 按 key 再按 value 排序，消除参数顺序带来的缓存碎片
      picked.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));

      const next = new URLSearchParams();
      for (const [k, v] of picked) next.append(k, v);
      keyUrl.search = next.toString();
    }
  }

  // ---- 客户端 host 维度 ----
  // 缓存键基于「回源 URL」，但多个加速站点可能回源到同一个源站地址。
  // 若不区分客户端 host，a.com 和 b.com 会共用同一份缓存 —— 二者的规则
  // （响应头改写、缓存 TTL、安全策略）不同，串号会导致行为错乱。
  // 因此把客户端 host 作为独立维度掺入。
  keyUrl.searchParams.set('__h', ctx.url.hostname.toLowerCase());

  // ---- 自定义 Cache Key 维度（对齐 EO）----
  const ck = policy?.key;
  if (ck) {
    // scheme：区分 http/https 时，同一 URL 的两种协议各存一份
    if (ck.includeScheme) {
      keyUrl.searchParams.set('__s', ctx.url.protocol.replace(':', ''));
    }

    // 指定请求头纳入缓存键（如 Accept-Language 做多语言分版本）
    if (Array.isArray(ck.headers) && ck.headers.length) {
      const parts = [];
      for (const name of [...ck.headers].sort()) {
        const v = ctx.request.headers.get(name);
        if (v !== null) parts.push(`${name}=${v}`);
      }
      if (parts.length) keyUrl.searchParams.set('__hd', parts.join('&'));
    }

    // 指定 Cookie 纳入缓存键（如按会员等级分版本）
    if (Array.isArray(ck.cookies) && ck.cookies.length) {
      const jar = parseCookies(ctx.request.headers.get('cookie') || '');
      const parts = [];
      for (const name of [...ck.cookies].sort()) {
        if (name in jar) parts.push(`${name}=${jar[name]}`);
      }
      if (parts.length) keyUrl.searchParams.set('__ck', parts.join('&'));
    }

    // 忽略大小写：统一小写化路径与已拼装的查询串。
    // 放在所有维度追加之后，保证 __h/__hd/__ck 也一并归一。
    if (ck.ignoreCase) {
      keyUrl.pathname = keyUrl.pathname.toLowerCase();
      keyUrl.search = keyUrl.search.toLowerCase();
    }
  }

  // ---- 缓存代次维度 ----
  // Cloudflare 的 caches.default 只能按精确 URL 删除，没有按前缀批量清除的能力。
  // 这里用「代次」绕开该限制：管理面执行整站清除时把 site.cacheGen +1，
  // 所有旧缓存键因为 __gen 变化而自然失效，等效于批量清除。
  // 旧的缓存条目会由边缘按 TTL 自行淘汰，无需显式删除。
  const gen = Number(opts?.cacheGen) || 0;
  if (gen > 0) {
    keyUrl.searchParams.set('__gen', String(gen));
  }

  // 关键修复：只用 URL 构造，method 固定为 GET，不继承任何客户端请求头与 body。
  // 这样缓存键完全由 URL 决定，既不会因 Authorization/Cookie 串号，
  // 也不会因 POST/HEAD 而抛 "Cannot cache non-GET request"。
  return new Request(keyUrl.toString(), { method: 'GET' });
}

/**
 * 判断本次请求是否应绕过缓存（BYPASS）。
 *
 * 绕过场景：
 *  - 策略未开启
 *  - 非 GET/HEAD 请求（写操作不该被缓存）
 *  - 带 Range 头：源站会返回 206 Partial Content，
 *    若把这段「半截数据」当作完整响应写入缓存，后续请求会拿到残缺内容。
 *    这是旧版原型的第 3 个 bug。
 *  - 带 Authorization：属于个性化内容，不进共享缓存
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} [policy] 缓存策略
 * @returns {boolean} true 表示应绕过缓存
 */
export function shouldBypassCache(ctx, policy) {
  if (!policy?.enabled) return true;
  // EO 缓存模式：noCache 显式不缓存
  if (policy.mode === 'noCache') return true;

  const method = (ctx.request.method || 'GET').toUpperCase();
  // 仅 GET 进缓存：HEAD 响应体为空，若以 GET 的键写入会被后续 GET 命中空响应（缓存投毒）。
  if (method !== 'GET') return true;

  // Range 请求一律绕过，避免 206 污染缓存
  if (ctx.request.headers.has('range')) return true;

  // 携带凭证的请求视为个性化内容
  if (ctx.request.headers.has('authorization')) return true;

  return false;
}
