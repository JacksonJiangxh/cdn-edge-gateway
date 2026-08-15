// 仓库型源站（cnb / github）的「关联预设规则」生成器。
//
// 与后端 src/proxy/repoEngine.js / src/config/schema.js(normRule) 的契约严格对齐：
//   匹配条件：conditions 二维数组（外 OR / 内 AND），元素 { target, op, values }；
//             target 取 'origin'（源站 id，池场景多源站区分用）或 'host'（单源站站点用）；
//             op 取 'equal'（与后端 MATCH_OPERATORS 一致）。
//   动作对象：action 为「阶段子对象」扁平结构——
//             rewrite:{ type:'regex', regexFrom, regexTo, preserveQuery }
//             hostHeader:{ mode:'custom', custom }（指向仓库 raw API 上游 host）
//             reqHeaders:{ set, remove } / respHeaders:{ set, remove }。
//
// 产物是「站点规则数组形态」的对象（rewrite / respHeaders / 可选 reqHeaders），
// 由调用方（sites.js 的新建保存流程）并入「站点模板规则」后统一写进流量序列。

/** 引擎展示名（UI 用）。 */
export const REPO_ENGINE_LABEL = Object.freeze({
  cnb: 'CNB（腾讯云代码仓库）',
  github: 'GitHub',
});

/**
 * 仓库型回源的上游 host（与后端 repoEngine.repoUpstreamHost 同构）。
 * @param {string} engine 'cnb' | 'github'
 * @param {boolean} isPrivate 是否私有仓库
 * @returns {string} 上游 host（小写、无协议、无路径）
 */
export function repoUpstreamHost(engine, isPrivate) {
  if (engine === 'cnb') return isPrivate ? 'api.cnb.cool' : 'cnb.cool';
  if (engine === 'github') return 'github.com';
  return '';
}

/**
 * 各引擎回源响应里「仓库特有、需在边缘剥离」的响应头清单。
 * @param {string} engine
 * @returns {string[]}
 */
function respRemoveHeaders(engine) {
  if (engine === 'cnb') return ['x-cnb-request-id', 'x-cnb-region', 'x-gitlab-*`', 'gitlab-lb'];
  if (engine === 'github') return ['x-github-request-id', 'x-github-cache', 'x-ratelimit-limit', 'x-ratelimit-remaining'];
  return [];
}

/**
 * 构建仓库型源站的「关联预设规则」。
 *
 * 调用方需提供匹配维度二选一：
 *   - originId：池场景（多源站共存），用源站 id 精确命中，cnb / github 互不冲突；
 *   - host：单源站站点场景，用站点加速域名命中（整站仅一个仓库源站，无冲突）。
 *
 * @param {string} engine 'cnb' | 'github'
 * @param {Object} opts
 * @param {string} [opts.repoUser]
 * @param {string} [opts.repoName]
 * @param {string} [opts.repoBranch]
 * @param {boolean} [opts.repoPrivate]
 * @param {string} [opts.originId] 池场景下源站的真实 id（匹配用）
 * @param {string} [opts.host] 单源站站点场景下站点加速域名（匹配用）
 * @returns {{ rewrite:Object, respHeaders:Object, reqHeaders?:Object }}
 */
export function buildRepoPresetRules(engine, opts = {}) {
  const repoUser = opts.repoUser || '';
  const repoName = opts.repoName || '';
  const branch = opts.repoBranch || 'main';
  const isPrivate = !!opts.repoPrivate;

  // 匹配条件：仅池场景（一个域名多个后端）需要 originId 区分各源站；
  // 单源站站点域名第一步已匹配，留空即「匹配所有」，避免冗余的 host 条件。
  let matchConditions = [];
  if (opts.originId) {
    matchConditions = [{ target: 'origin', op: 'equal', values: [opts.originId] }];
  }
  const match = { conditions: [matchConditions] };

  // 上游 host（回源 Host 指向仓库 raw API）。
  const upHost = repoUpstreamHost(engine, isPrivate);

  // 重写路径：把站点路径 /{path} 映射到仓库 raw 文件 URL 的 path 部分。
  // cnb 私有走 /-/git/raw/，公开走 /-/git/raw/ 之外；github 走 /raw/。
  const regexTo =
    engine === 'cnb'
      ? `/${repoUser}/${repoName}/-/git/raw/${branch}/$1`
      : `/${repoUser}/${repoName}/raw/${branch}/$1`;

  const rewrite = {
    id: `repo-${engine}-${repoName}-rewrite`,
    name: `${REPO_ENGINE_LABEL[engine]} 仓库 raw 映射（${branch}）`,
    enabled: true,
    stage: 'rewrite',
    priority: 10,
    match,
    action: {
      rewrite: {
        type: 'regex',
        regexFrom: '^(/.*)$',
        regexTo,
        preserveQuery: true,
      },
      hostHeader: { mode: 'custom', custom: upHost },
    },
  };

  const respRule = {
    id: `repo-${engine}-${repoName}-resp`,
    name: `${REPO_ENGINE_LABEL[engine]} 仓库特有响应头剥离`,
    enabled: true,
    stage: 'respHeaders',
    priority: 10,
    match,
    action: {
      respHeaders: { set: {}, remove: respRemoveHeaders(engine) },
    },
  };

  /** 私有仓库额外注入鉴权请求头（运行时由 repoEngine 用站点级 token 补实）。 */
  let reqHeadersRule = null;
  if (engine === 'cnb' && isPrivate) {
    reqHeadersRule = {
      id: `repo-${engine}-${repoName}-auth`,
      name: `${REPO_ENGINE_LABEL[engine]} 私有仓库鉴权`,
      enabled: true,
      stage: 'reqHeaders',
      priority: 10,
      match,
      action: {
        reqHeaders: { set: { Authorization: '__REPO_ENGINE_INJECT__' }, remove: [] },
      },
    };
  }

  return { rewrite, respHeaders: respRule, reqHeaders: reqHeadersRule };
}
