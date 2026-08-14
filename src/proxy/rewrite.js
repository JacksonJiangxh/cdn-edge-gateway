/**
 * 路径重写
 * ----------------------------------------------------------------------------
 * 把「客户端请求路径」变换为「源站路径」，并拼上 origin.pathPrefix，
 * 最终产出完整的回源 URL。
 *
 * 典型场景：
 *   客户端  https://img.example.com/img/x.png
 *   rewrite none + origin.pathPrefix=/repo/-/git/raw/main
 *   回源    https://storage.example.net/repo/-/git/raw/main/img/x.png
 */

import { expandVars } from '../config/vars.js';

/** 正则替换结果长度上限，超出回退原路径（防超长路径注入）。 */
const REGEX_REPLACE_MAX_LEN = 8192;

/**
 * 应用规则里的 rewrite 配置，得到「重写后的路径」（尚未拼 origin.pathPrefix）。
 *
 * 支持四种模式：
 *  - none   原样保留
 *  - prefix 在原路径前加上 value
 *  - strip  剥离开头的 value 前缀（仅当确实以该前缀开头时）
 *  - regex  用 regexFrom / regexTo 做正则替换
 *
 * @param {string} pathname 客户端原始路径，形如 "/img/x.png"
 * @param {Object} [rewrite] 规则中的 rewrite 配置
 * @returns {string} 重写后的路径，保证以 "/" 开头
 */

/**
 * 合并路径重写：源站级打底，规则级覆盖。
 * 规则级 type 不为 'none' 时使用规则级，否则回退源站级。
 *
 * 抽出到公共模块，供「缓存命中路径」（pipeline.js）与「回源重试路径」（failover.js）
 * 复用，避免两份逻辑各自演进导致 header 合并语义不一致。
 *
 * @param {Object} [originRewrite] 源站级 rewrite 配置
 * @param {Object} [ruleRewrite] 规则级 rewrite 配置
 * @returns {Object} 合并后的 rewrite 配置
 */
export function mergeRewrite(originRewrite, ruleRewrite) {
  const or = originRewrite && originRewrite.type && originRewrite.type !== 'none' ? originRewrite : null;
  const rr = ruleRewrite && ruleRewrite.type && ruleRewrite.type !== 'none' ? ruleRewrite : null;
  if (rr) return rr;
  if (or) return or;
  return { type: 'none', value: '', regexFrom: '', regexTo: '' };
}

/**
 * 合并 HeaderOps：源站级打底，规则级覆盖。
 * set 字段做浅合并（规则级覆盖同名字段），remove 数组做合并去重。
 *
 * @param {Object} [originOps] 源站级 HeaderOps
 * @param {Object} [ruleOps] 规则级 HeaderOps
 * @returns {Object} 合并后的 HeaderOps
 */
export function mergeHeaderOps(originOps, ruleOps) {
  const set = { ...(originOps?.set || {}), ...(ruleOps?.set || {}) };
  const removeSet = new Set([
    ...(Array.isArray(originOps?.remove) ? originOps.remove : []),
    ...(Array.isArray(ruleOps?.remove) ? ruleOps.remove : []),
  ]);
  return { set, remove: Array.from(removeSet) };
}

/**
 * 合并「全站兜底 → 站点命中规则」的 HeaderOps（逐阶段先全站后站点模型专用）。
 *
 * 与 mergeHeaderOps（源站 ops + 规则 ops，规则 remove 只透传）不同：本函数里
 * 站点 remove 必须在「合并阶段」就从并集后的 set 中剔除全站被点名删除的 key。
 * 原因：下游 buildClientHeaders 的 applyHeaderOps 是「先 remove 后 set」一次性注入，
 * 全站 set 里的 key 正是通过这次 set 才进入响应头，remove 在 set 之前执行删不到它。
 * 因此「站点 remove 删全站 set 的 key」只能在合并阶段执行，下游 remove 只负责删
 * 源站/上游自带的同名头。
 *
 * set：浅合并（全站打底，站点覆盖同名 key，全站其余 key 保留，不整段替换）。
 * set 删除：遍历站点 remove 列表，从并集后的 set 中 delete 对应 key。
 * remove：全站.remove ∪ 站点.remove（保留删源站/上游自带头的能力）。
 *
 * @param {Object} [globalOps] 全站兜底 HeaderOps
 * @param {Object} [siteOps] 站点命中规则该阶段的 HeaderOps
 * @returns {Object} 合并后的 HeaderOps
 */
export function mergeStageHeaderOps(globalOps, siteOps) {
  const set = { ...(globalOps?.set || {}), ...(siteOps?.set || {}) };
  // 站点 remove 必须在合并期即从 set 中删除全站被点名 key
  const siteRemove = Array.isArray(siteOps?.remove) ? siteOps.remove : [];
  for (const name of siteRemove) {
    if (Object.prototype.hasOwnProperty.call(set, name)) delete set[name];
  }
  const removeSet = new Set([
    ...(Array.isArray(globalOps?.remove) ? globalOps.remove : []),
    ...siteRemove,
  ]);
  return { set, remove: Array.from(removeSet) };
}
export function applyRewrite(pathname, rewrite, ctx) {
  const type = rewrite?.type || 'none';
  let out = pathname || '/';

  switch (type) {
    case 'prefix': {
      const value = rewrite.value || '';
      out = joinPath(value, out);
      break;
    }
    case 'strip': {
      const value = rewrite.value || '';
      if (value && out.startsWith(value)) {
        out = out.slice(value.length);
      }
      break;
    }
    case 'regex': {
      // 用户可配置的正则，必须容错：非法正则时保持原路径不变
      try {
        const re = new RegExp(rewrite.regexFrom || '', 'g');
        // regexTo 支持两类动态写法（对齐 CF/EO/ESA）：
        //   1) $1..$9 捕获组引用（路径搬迁改写）
        //   2) ${var} 内置变量引用（如 ${path} / ${client_ip}）
        // 先对 regexTo 做变量展开（静态值无 ${ 前缀时零开销），再用其作为
        // replace 第二参让捕获组真正生效。
        const to = expandVars(rewrite.regexTo ?? '', ctx, { label: 'rewrite.regexTo', maxLen: REGEX_REPLACE_MAX_LEN });
        const replaced = out.replace(re, to);
        out = replaced.length > REGEX_REPLACE_MAX_LEN ? out : replaced;
      } catch {
        out = pathname;
      }
      break;
    }
    case 'none':
    default:
      break;
  }

  return normalizePath(out);
}

/**
 * 构造最终的回源 URL。
 *
 * 步骤：规则 rewrite → 拼接 origin.pathPrefix → 组装 scheme/addr/port → 保留 query。
 *
 * 回源 Host 处理（hostHeader 优先级：规则 action.hostHeader > 源站 origin.hostHeader）：
 *   - custom   用 custom 值作为回源 authority（fetch 下即 URL hostname，socket 下即 Host 头）
 *   - origin   用源站 addr
 *   - client   用客户端请求的 Host（ctx.url.hostname）
 *   - inherit  传 null，由调用方以站点 defaultHostHeader 兜底（规则级默认）
 *   - 其余（undefined / 不传）保留源站 addr（默认行为，源站感知不到加速域名）
 *
 * @param {import('../contracts.js').Ctx} ctx 请求上下文
 * @param {Object} origin 选中的源站
 * @param {Object} [rule] 命中的规则（可为 null，表示不做重写）
 * @param {Object} [hostHeader] 已解析的回源 Host 配置 {mode, custom}
 * @returns {URL} 完整的回源 URL 对象
 */
export function buildOriginUrl(ctx, origin, rule, hostHeader) {
  const rewritten = applyRewrite(ctx.url.pathname, rule?.action?.rewrite, ctx);

  // 源站前缀 + 重写后路径，joinPath 内部保证不出现 "//"
  const fullPath = origin.pathPrefix
    ? joinPath(origin.pathPrefix, rewritten)
    : rewritten;

  const scheme = origin.scheme || 'https';
  const addr = origin.addr;
  // 省略默认端口，避免出现 https://a.com:443 这种冗余写法影响缓存键一致性
  const isDefaultPort =
    !origin.port ||
    (scheme === 'https' && Number(origin.port) === 443) ||
    (scheme === 'http' && Number(origin.port) === 80);

  // 回源 Host（authority）解析
  let authorityAddr = addr;
  let authorityPort = origin.port;
  // R2 等「无公网地址」引擎（addr 为空）不表示没有 authority：
  // 缓存键 / 回源 URL 的 host 应回退到「客户端访问的站点域名」(ctx.url.hostname)，
  // 与 fetch 源站构造出的缓存键完全一致。否则 addr='' 会拼出新 URL('https://')
  // （无 host）而抛 TypeError → 缓存键构造阶段 500。
  if (!authorityAddr) authorityAddr = ctx.url.hostname;
  if (hostHeader && hostHeader.mode === 'custom' && hostHeader.custom) {
    // 支持 "host" 或 "host:port"，custom 值支持 ${var} 动态引用（如 ${host} 按请求域名回源）
    const customRaw = expandVars(String(hostHeader.custom), ctx, { label: 'hostHeader.custom', maxLen: 253 });
    const [h, p] = customRaw.split(':');
    authorityAddr = h;
    if (p) authorityPort = Number(p);
  } else if (hostHeader && (hostHeader.mode === 'client' || hostHeader.mode === 'accel')) {
    // client：用客户端访问域名；accel：用加速域名（单加速域名场景下二者等价，
    // 均为 ctx.url.hostname）。CF 上 fetch 会忽略 Host 头故 accel 退化但无害；
    // EO 上 dispatch 会据此显式设置 Host 头，使「加速域名」成为回源 Host。
    authorityAddr = ctx.url.hostname;
  }
  // inherit / origin / 未配置 → 沿用源站 addr（origin 模式语义上等同 addr）

  // IPv6 字面量地址在 URL 中必须带方括号
  const hostPart = authorityAddr.includes(':') && !/^\[.*\]$/.test(authorityAddr) ? `[${authorityAddr}]` : authorityAddr;
  const authority = isDefaultPort ? hostPart : `${hostPart}:${authorityPort}`;

  const originUrl = new URL(`${scheme}://${authority}`);
  originUrl.pathname = fullPath;
  // 保留原始查询串（注意是 search 而不是 searchParams，避免参数被重新编码）
  originUrl.search = ctx.url.search;

  return originUrl;
}

/**
 * 安全拼接两段路径，避免出现重复的 "/"。
 *
 * @param {string} a 前段
 * @param {string} b 后段
 * @returns {string} 拼接结果
 */
export function joinPath(a, b) {
  const left = (a || '').replace(/\/+$/, '');
  const right = (b || '').replace(/^\/+/, '');
  if (!left) return `/${right}`;
  if (!right) return left || '/';
  return `${left}/${right}`;
}

/**
 * 规整路径：保证以 "/" 开头，且不含连续的 "/"。
 *
 * @param {string} p 路径
 * @returns {string} 规整后的路径
 */
function normalizePath(p) {
  let out = p || '/';
  if (!out.startsWith('/')) out = `/${out}`;
  // 折叠连续斜杠，"//a///b" -> "/a/b"
  out = out.replace(/\/{2,}/g, '/');
  return out;
}

/**
 * 解析最终生效的回源 Host 配置。
 *
 * 优先级（高到低）：规则级 action.hostHeader > 源站级 origin.hostHeader > 站点级 defaultHostHeader。
 * 规则级为 "inherit"（或缺失）时回退到源站级；源站级也为 inherit/缺失时回退站点级；
 * 二者皆无则回退 "accel"（加速域名）。
 *
 * @param {Object} [ruleHostHeader] 规则级回源 Host {mode, custom}
 * @param {Object} [originHostHeader] 源站级回源 Host {mode, custom}
 * @param {Object} [siteHostHeader] 站点级默认回源 Host {mode, custom}
 * @returns {{mode:'custom'|'client'|'origin'|'accel', custom?:string}}
 */
export function resolveHostHeader(ruleHostHeader, originHostHeader, siteHostHeader) {
  const rh = ruleHostHeader || {};
  if (rh.mode && rh.mode !== 'inherit') {
    return { mode: rh.mode, custom: rh.custom || '' };
  }
  const oh = originHostHeader || {};
  if (oh.mode && oh.mode !== 'inherit') {
    return { mode: oh.mode, custom: oh.custom || '' };
  }
  const sh = siteHostHeader || {};
  return { mode: sh.mode || 'accel', custom: sh.custom || '' };
}
