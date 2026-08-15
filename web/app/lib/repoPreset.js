/**
 * web/app/lib/repoPreset.js
 * 仓库型引擎（cnb / github）的「内置预设规则模板」前端副本。
 * 与后端 src/proxy/repoEngine.js 的 buildRepoPresetRules 保持一致：
 *   每个引擎每个阶段 2 套（公开 / 私密）：
 *     - URL 重写阶段（rewrite）：公开/私密通用 → 把 /{path} 映射到仓库 raw API（带分支）
 *     - 请求头修改阶段（reqHeaders）：私密注入 Authorization；公开为 null（匿名分支）
 *     - 响应头修改阶段（respHeaders）：剥离仓库接口特有头（下沉到站点规则，不污染全站默认）
 * 这三条规则与「站点场景模板」（网站加速 / api / 下载 等）的规则合并后，统一经流量序列
 * 接口写入站点规则。
 */

/** 回源 host（对终端用户隐藏，由引擎 + 是否公开决定）。 */
export function repoUpstreamHost(engine, isPrivate) {
  if (engine === 'cnb') return isPrivate ? 'api.cnb.cool' : 'cnb.cool';
  if (engine === 'github') return 'raw.githubusercontent.com';
  throw new Error('未知仓库引擎: ' + engine);
}

export const REPO_ENGINE_LABEL = Object.freeze({ cnb: 'CNB', github: 'GitHub' });

export const REPO_RESP_HEADER_REMOVE = Object.freeze({
  cnb: Object.freeze([
    'access-control-allow-credentials',
    'access-control-expose-headers',
    'referrer-policy',
    'traceparent',
    'x-trace-id',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'x-repo-commit',
  ]),
  github: Object.freeze([
    'strict-transport-security',
    'x-xss-protection',
    'x-github-request-id',
    'x-github-edge-region',
    'x-fastly-request-id',
    'x-served-by',
    'x-timer',
    'x-cache',
    'x-cache-hits',
    'source-age',
    'via',
  ]),
});

/**
 * @param {'cnb'|'github'} engine
 * @param {object} opts
 * @param {string} opts.repoUser
 * @param {string} opts.repoName
 * @param {string} [opts.repoBranch='main']
 * @param {boolean} [opts.repoPrivate=false]
 * @param {string} [opts.host]
 * @returns {{rewrite: object, reqHeaders: object|null, respHeaders: object}}
 */
export function buildRepoPresetRules(engine, opts) {
  const repoUser = (opts.repoUser || '').trim();
  const repoName = (opts.repoName || '').trim();
  const branch = (opts.repoBranch || 'main').trim() || 'main';
  const isPrivate = !!opts.repoPrivate;
  const host = opts.host ? String(opts.host).trim() : '';
  const upHost = repoUpstreamHost(engine, isPrivate);

  const target =
    engine === 'cnb'
      ? `https://${upHost}/${repoUser}/${repoName}/-/git/raw/${branch}$1`
      : `https://${upHost}/${repoUser}/${repoName}/${branch}$1`;
  const matchConditions = host ? [{ type: 'host', op: 'eq', value: host }] : [];
  const rewriteRule = {
    id: `repo-${engine}-${repoName}-rewrite`,
    name: `${REPO_ENGINE_LABEL[engine]} 仓库 raw 映射（${branch}）`,
    enabled: true,
    stage: 'rewrite',
    priority: 1,
    match: matchConditions.length ? { type: 'all', conditions: matchConditions } : { type: 'all', conditions: [] },
    actions: [{ type: 'rewrite', target, preserveQuery: true }],
  };

  let reqHeadersRule = null;
  if (isPrivate) {
    reqHeadersRule = {
      id: `repo-${engine}-${repoName}-auth`,
      name: `${REPO_ENGINE_LABEL[engine]} 私有仓库鉴权`,
      enabled: true,
      stage: 'reqHeaders',
      priority: 1,
      match: { type: 'all', conditions: matchConditions },
      actions: [{ type: 'setHeaders', set: { Authorization: '__REPO_ENGINE_INJECT__' }, remove: [] }],
    };
  }

  const respRemoveList = REPO_RESP_HEADER_REMOVE[engine] || [];
  const respHeadersRule = {
    id: `repo-${engine}-${repoName}-resp`,
    name: `${REPO_ENGINE_LABEL[engine]} 仓库特有响应头剥离`,
    enabled: true,
    stage: 'respHeaders',
    priority: 1,
    match: matchConditions.length ? { type: 'all', conditions: matchConditions } : { type: 'all', conditions: [] },
    actions: [{ type: 'setHeaders', set: {}, remove: [...respRemoveList] }],
  };

  return { rewrite: rewriteRule, reqHeaders: reqHeadersRule, respHeaders: respHeadersRule };
}
