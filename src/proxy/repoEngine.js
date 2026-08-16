/**
 * ============================================================================
 * proxy/repoEngine.js —— 仓库型回源引擎（cnb / github）
 * ----------------------------------------------------------------------------
 * 职责分工（贴合本项目「引擎负责鉴权，规则负责 URL 重写」）：
 *   - 本引擎【只负责两件事】：① 用平台主密钥解密站点级 token；② 注入 Authorization
 *     回源请求头；然后复用 fetchEngine 回源。回源目标 URL 的 host + 路径映射由
 *     【站点级 rewrite 规则】托管（模板在新建站点/源站时自动铺好），本引擎不耦合映射。
 *   - 这样用户在前端选 cnb/github + 填几个参数，后端自动生成【内置预设规则模板】
 *     （仅涉及 URL 重写 + 请求头修改 两条规则）注入到站点流量序列，同时用户仍可
 *     在站点里叠加「站点加速 / api」等其它规则模板，统一合并写入站点规则。
 *
 * 加密方案（详见 utils/cipher.js）：复用平台 env.JWT_SECRET（SHA-256 派生）为主密钥
 * （AES-256-GCM），站点级 token 加密落盘（每站独立、灵活可配），这里仅运行时解密注入。
 *
 * 内置预设规则模板（每个引擎每个阶段 2 套：公开 / 私密）：
 *   - URL 重写阶段（rewrite）：公开 / 私密 通用 —— 把 /{path} 映射到仓库 raw API（带分支）。
 *   - 请求头修改阶段（reqHeaders）：
 *       · 私密仓库：注入 Authorization（值引用 token，运行时由引擎解密）
 *       · 公开仓库：不注入任何头（匿名可访问，另一分支）
 *   - 响应头修改阶段（respHeaders）：剥离【仓库接口特有的头】（见 REPO_RESP_HEADER_STRIP，按引擎区分），
 *       这些头不属于「通用全站规则」范畴，随引擎关联下沉到站点规则，避免污染全站默认。
 *   即「公开 vs 私密」的差异仅在 reqHeaders 阶段；rewrite / respHeaders 阶段通用。
 *
 * 回源 host（对用户隐藏，由引擎 + 是否公开决定）：
 *   - CNB 公开：cnb.cool      （无需走 api，直接公网 raw）
 *   - CNB 私密：api.cnb.cool  （需带鉴权走 api）
 *   - GitHub 公开/私密：raw.githubusercontent.com（host 相同，仅鉴权差异；私有加 Bearer token）
 *
 * 路径映射约定（由自动生成的 rewrite 规则实现，ref 取 repoBranch，默认 main）：
 *   - CNB:    /{path}  ->  https://<host>/{org}/{repo}/-/git/raw/{branch}/{path}
 *   - GitHub: /{path}  ->  https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
 * ============================================================================
 */

import { fetchOrigin } from './engines/fetchEngine.js';
import { decryptSecret } from '../utils/cipher.js';
import { buildErrorPage } from '../errorPage.js';
import { REQUEST_ID_HEADER } from '../utils/reqid.js';

/**
 * 仓库型回源的配置类错误（缺 token / 解密失败 / 空 token）对外统一返回
 * 「仿 Cloudflare 502 伪装页」，真实原因仅进日志（隐藏源站架构细节，防盗刷 / 探测）。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @param {string} reason 仅用于日志的内部原因
 * @param {string} [reqId]
 * @returns {Response}
 */
function repoErrorPage(ctx, reason, reqId) {
  console.error(`[repoEngine] ${reason} reqId=${reqId || ''}`);
  const domain = ctx?.url?.hostname || '';
  return new Response(
    buildErrorPage({ status: 502, code: 'INTERNAL', reqId: reqId || '', domain }),
    {
      status: 502,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=60',
        'x-robots-tag': 'noindex, nofollow',
        ...(reqId ? { [REQUEST_ID_HEADER]: reqId } : {}),
      },
    }
  );
}

/**
 * 回源 host（对终端用户隐藏，由引擎 + 是否公开决定）。
 * @param {'cnb'|'github'} engine
 * @param {boolean} isPrivate
 * @returns {string}
 */
export function repoUpstreamHost(engine, isPrivate) {
  if (engine === 'cnb') return isPrivate ? 'api.cnb.cool' : 'cnb.cool';
  // 公私 host 相同，仅鉴权差异
  if (engine === 'github') return 'raw.githubusercontent.com';
  throw new Error('未知仓库引擎: ' + engine);
}

/** 引擎展示名 */
export const REPO_ENGINE_LABEL = Object.freeze({ cnb: 'CNB', github: 'GitHub' });

/**
 * 仓库接口特有的响应头（公开/私密源站都会带，但【不同引擎不同】）。
 * 不属于通用全站规则，随引擎关联下沉到站点规则（由引擎预设的 respHeaders 阶段规则剥离）。
 *
 * 实测分类（curl 抓取 5 个 URL 实测）：
 *  - CNB 特有：access-control-allow-credentials / access-control-expose-headers /
 *    referrer-policy / traceparent / x-trace-id / x-ratelimit-* / x-repo-commit
 *    （CNB 没有 x-github-*、x-fastly-*、via、x-served-by、x-timer、x-cache-hits、source-age、
 *      strict-transport-security、x-xss-protection）
 *  - GitHub 特有：strict-transport-security / x-xss-protection / x-github-request-id /
 *    x-github-edge-region / x-fastly-request-id / x-served-by / x-timer / x-cache / x-cache-hits /
 *    source-age / via
 *    （GitHub 没有 x-ratelimit-*、x-repo-commit、traceparent、x-trace-id，而是用 x-github-request-id）
 *
 * 两者共有（CSP / XFO / nosniff / CORP / access-control-allow-origin）已留在全站默认剥离，
 * 不在此重复。
 * @type {Readonly<Record<'cnb'|'github', ReadonlyArray<{type:'exact',value:string}>>>}
 */
export const REPO_RESP_HEADER_STRIP = Object.freeze({
  cnb: Object.freeze([
    { type: 'exact', value: 'access-control-allow-credentials' }, // CNB 写死 false，上游 CORS 配套，无意义透传
    { type: 'exact', value: 'access-control-expose-headers' }, // 上游 CORS 配套
    { type: 'exact', value: 'referrer-policy' }, // CNB 写死 no-referrer，覆盖网关统一默认值
    { type: 'exact', value: 'traceparent' }, // CNB 内部链路追踪（GitHub 无此头）
    { type: 'exact', value: 'x-trace-id' }, // CNB 内部链路 id
    { type: 'exact', value: 'x-ratelimit-limit' },
    { type: 'exact', value: 'x-ratelimit-remaining' },
    { type: 'exact', value: 'x-ratelimit-reset' },
    { type: 'exact', value: 'x-repo-commit' }, // 上游仓库内部信息，泄露源站结构
  ]),
  github: Object.freeze([
    { type: 'exact', value: 'strict-transport-security' }, // 上游源站 HSTS（max-age=31536000），对用户域名无意义
    { type: 'exact', value: 'x-xss-protection' }, // 已废弃安全头，与 CSP 冲突时反而有害
    { type: 'exact', value: 'x-github-request-id' },
    { type: 'exact', value: 'x-github-edge-region' },
    { type: 'exact', value: 'x-fastly-request-id' },
    { type: 'exact', value: 'x-served-by' },
    { type: 'exact', value: 'x-timer' },
    { type: 'exact', value: 'x-cache' },
    { type: 'exact', value: 'x-cache-hits' },
    { type: 'exact', value: 'source-age' },
    { type: 'exact', value: 'via' }, // 1.1 varnish
  ]),
});

/**
 * 构造仓库型回源的鉴权头值。
 * @param {'cnb'|'github'} engine
 * @param {string} token 解密后的明文 token
 * @returns {string} 应放入 Authorization 头的值
 */
function buildAuthHeader(engine, token) {
  if (engine === 'github') return `Bearer ${token}`;
  // CNB raw API：支持 Authorization: <token> 或 Basic base64('cnb:<token>')，这里用前者最简。
  return token;
}

/**
 * 生成仓库型源站的「内置预设规则模板」（URL 重写 + 请求头修改 + 响应头修改 三条规则）。
 * 这是引擎关联的核心：公开 / 私密 在 reqHeaders 阶段分流，rewrite / respHeaders 阶段通用。
 * 这三条规则与「站点场景模板」（网站加速 / api / 下载 等）的规则合并后，统一经流量序列
 * 接口写入站点规则。
 *
 * @param {'cnb'|'github'} engine
 * @param {object} opts
 * @param {string} opts.repoUser  组织/owner
 * @param {string} opts.repoName  仓库名
 * @param {string} [opts.repoBranch='main']  分支名
 * @param {boolean} [opts.repoPrivate=false] 是否私有仓库（决定 reqHeaders 是否注入鉴权）
 * @param {string} [opts.host]  加速域名（站点 host，用于规则 match 条件；可后续再填）
 * @returns {{rewrite: object, reqHeaders: object|null, respHeaders: object}}
 *   - rewrite：始终返回一条 rewrite 阶段规则
 *   - reqHeaders：私密返回一条注入 Authorization 的规则；公开返回 null（不注入头）
 *   - respHeaders：始终返回一条剥离仓库特有头的规则
 */
export function buildRepoPresetRules(engine, opts) {
  const repoUser = (opts.repoUser || '').trim();
  const repoName = (opts.repoName || '').trim();
  const branch = (opts.repoBranch || 'main').trim() || 'main';
  const isPrivate = !!opts.repoPrivate;
  const host = opts.host ? String(opts.host).trim() : '';
  const upHost = repoUpstreamHost(engine, isPrivate);

  // —— URL 重写阶段规则（公开/私密通用） ——
  const target =
    engine === 'cnb'
      ? `https://${upHost}/${repoUser}/${repoName}/-/git/raw/${branch}$1`
      : `https://${upHost}/${repoUser}/${repoName}/${branch}$1`;
  const matchConditions = host
    ? [{ type: 'host', op: 'eq', value: host }]
    : [];
  const rewriteRule = {
    id: `repo-${engine}-${repoName}-rewrite`,
    name: `${REPO_ENGINE_LABEL[engine]} 仓库 raw 映射（${branch}）`,
    enabled: true,
    stage: 'rewrite',
    priority: 1,
    match: matchConditions.length ? { type: 'all', conditions: matchConditions } : { type: 'all', conditions: [] },
    actions: [{ type: 'rewrite', target, preserveQuery: true }],
  };

  // —— 请求头修改阶段规则（私密注入鉴权；公开为 null 表示匿名分支） ——
  let reqHeadersRule = null;
  if (isPrivate) {
    reqHeadersRule = {
      id: `repo-${engine}-${repoName}-auth`,
      name: `${REPO_ENGINE_LABEL[engine]} 私有仓库鉴权`,
      enabled: true,
      stage: 'reqHeaders',
      priority: 1,
      match: { type: 'all', conditions: matchConditions },
      actions: [
        {
          type: 'setHeaders',
          set: {
            // 占位：真实 Authorization 值由回源引擎（fetchRepoOrigin）运行时解密注入，
            // 这里标记为需引擎注入，避免把 token 明文写进规则。
            Authorization: '__REPO_ENGINE_INJECT__',
          },
          strip: [],
        },
      ],
    };
  }

  // —— 响应头修改阶段规则（剥离【本引擎特有】的仓库接口头；公开/私密通用） ——
  // 注意：只剥该引擎实测特有的头（cnb/github 不同），共有的已留在全站默认剥离。
  const respStripList = REPO_RESP_HEADER_STRIP[engine] || [];
  const respHeadersRule = {
    id: `repo-${engine}-${repoName}-resp`,
    name: `${REPO_ENGINE_LABEL[engine]} 仓库特有响应头剥离`,
    enabled: true,
    stage: 'respHeaders',
    priority: 1,
    match: matchConditions.length ? { type: 'all', conditions: matchConditions } : { type: 'all', conditions: [] },
    actions: [{ type: 'setHeaders', set: {}, strip: [...respStripList] }],
  };

  return { rewrite: rewriteRule, reqHeaders: reqHeadersRule, respHeaders: respHeadersRule };
}

/**
 * 兼容旧调用：生成单条 rewrite 规则（分支参数化）。
 * @param {'cnb'|'github'} engine
 * @param {string} repoUser
 * @param {string} repoName
 * @param {string} [host]
 * @param {string} [branch='main']
 * @returns {object}
 */
export function buildRepoRewriteRule(engine, repoUser, repoName, host, branch = 'main') {
  return buildRepoPresetRules(engine, { repoUser, repoName, repoBranch: branch, repoPrivate: false, host }).rewrite;
}

/**
 * 回源到仓库（cnb / github）。
 * 入参 originUrl 应已是【经 rewrite 规则改写后的完整上游 URL】（host + 路径映射已完成），
 * 本函数仅补鉴权头后交给 fetchEngine。
 *
 * 公开仓库（repoPrivate=false 且无 token）走【匿名分支】：不注入 Authorization，直接回源。
 * 私密仓库（或带 token）走【鉴权分支】：解密 token 注入 Authorization。
 *
 * @param {import('../contracts.js').Ctx} ctx
 * @param {import('../contracts.js').Origin} origin
 * @param {URL} originUrl  已改写好的上游 URL
 * @param {Headers} headers 回源请求头（fetchEngine 会追加 Host 等）
 * @param {number} timeoutMs
 * @param {object} [opts]
 * @returns {Promise<Response>}
 */
export async function fetchRepoOrigin(ctx, origin, originUrl, headers, timeoutMs, opts) {
  // 'cnb' | 'github'
  const engine = origin.engine;
  const tokenField = engine === 'cnb' ? 'cnbTokenEnc' : 'githubTokenEnc';
  const stored = origin[tokenField];
  const isPrivate = !!origin.repoPrivate;

  // 公开仓库 + 无 token → 匿名分支：直接回源，不注入鉴权
  if (!isPrivate && !stored) {
    return fetchOrigin(ctx, origin, originUrl, headers, timeoutMs, opts);
  }

  if (!stored) {
    return repoErrorPage(ctx, `仓库型源站 ${engine} 缺失访问令牌（${tokenField}）`, ctx?.reqId);
  }
  let token;
  try {
    token = await decryptSecret(stored, ctx);
  } catch (e) {
    return repoErrorPage(ctx, `仓库型源站 ${engine} 令牌解密失败：${e?.message}`, ctx?.reqId);
  }
  if (!token) {
    return repoErrorPage(ctx, `仓库型源站 ${engine} 令牌为空`, ctx?.reqId);
  }
  headers.set('Authorization', buildAuthHeader(engine, token));
  // 回源到固定 host（originUrl 已是重写后的上游 host，此处无需再改）
  return fetchOrigin(ctx, origin, originUrl, headers, timeoutMs, opts);
}
