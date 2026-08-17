// 仓库型源站（cnb / github）的「关联预设规则」生成器。
//
// 与后端 src/config/repoPresets.js（buildRepoPresetRules）契约严格对齐：
//   cnb/github 已去独立引擎，底层统一走 fetch 引擎，本生成器只产出标准站点规则：
//     · hostHeader.custom → 固定回源 Host（仓库 raw API 上游）
//     · rewrite            → /{path} 映射到 /{user}/{repo}/raw/{branch}/{path}
//     · reqHeaders.set.Authorization → __cnb_token__ / __github_token__ 系统占位符
//       （运行时由后端 vars.js 解析层从站点级密文解密注入，不进规则明文）
//     · respHeaders.strip  → 仓库特有响应头剥离
//   匹配条件：conditions 二维数组（外 OR / 内 AND），元素 { target, op, values }；
//             target 取 'origin'（源站 id，池场景多源站区分用）或 'host'（单源站站点用）；
//             op 取 'equal'（与后端 MATCH_OPERATORS 一致）。
//   动作对象：action 为「阶段子对象」扁平结构——
//             rewrite:{ type:'regex', regexFrom, regexTo, preserveQuery }
//             hostHeader:{ mode:'custom', custom }
//             reqHeaders:{ set, strip } / respHeaders:{ set, strip }。
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
  if (engine === 'github') return 'raw.githubusercontent.com';
  return '';
}

/**
 * 各引擎回源响应里「仓库特有、需在边缘剥离」的响应头清单（统一 strip 语法）。
 * @param {string} engine
 * @returns {Array<{type:'exact',value:string}>}
 */
function respRemoveHeaders(engine) {
  // 与后端 repoPresets.js 对齐：移除仓库平台特有响应头，避免泄露源站实现。
  // 这里用「前缀通配」形式，便于覆盖子级头（x-cnb-*、x-github-* 等）。
  return [
    { type: 'prefix', value: 'x-cnb' },
    { type: 'prefix', value: 'x-github' },
    { type: 'exact', value: 'x-runtime' },
    { type: 'exact', value: 'x-served-by' },
    { type: 'exact', value: 'x-amz-id-2' },
  ];
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
  // cnb / github 的 raw URL 路径格式不同（按平台执行不同的 URL 重写）：
  //   · cnb：    /{user}/{repo}/-/git/raw/{branch}/{path}
  //   · github： /{user}/{repo}/{branch}/{path}（raw.githubusercontent.com 无 /raw/ 段）
  const regexTo = engine === 'cnb'
    ? `/${repoUser}/${repoName}/-/git/raw/${branch}/$1`
    : `/${repoUser}/${repoName}/${branch}/$1`;

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
      // 注意：回源 Host 不能与本规则混放在 action 里——normRule 按阶段裁剪
      // （rewrite 阶段只保留 rewrite 字段，会丢掉 hostHeader）。固定回源 Host
      // 必须单独成一条规则，且归属 origin 阶段（见 hostHeaderRule），因为系统
      // 合法阶段字典里没有 "hostHeader" 这个 stage（normalizeStage 会返回 null
      // 致落库成死规则），回源 Host 本就属于 Origin Rules（origin 阶段）。
    },
  };

  // 固定回源 Host（指向仓库 raw API 上游）。独立成 origin 阶段规则：
  // origin 阶段的 allowedOps 含 hostHeader，normRule 按阶段裁剪会保留该字段，
  // 落库后由运行时 pipeline 的 origin 阶段注入回源 Host。
  const hostHeaderRule = {
    id: `repo-${engine}-${repoName}-host`,
    name: `${REPO_ENGINE_LABEL[engine]} 固定回源 Host（${upHost}）`,
    enabled: true,
    stage: 'origin',
    priority: 10,
    match,
    action: {
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
      respHeaders: { set: {}, strip: respRemoveHeaders(engine) },
    },
  };

  /** 私有仓库额外注入鉴权请求头，值用系统占位符，运行时由后端解析层从站点级密文解密。 */
  let reqHeadersRule = null;
  if (isPrivate) {
    const tokenVar = engine === 'cnb' ? '__cnb_token__' : '__github_token__';
    reqHeadersRule = {
      id: `repo-${engine}-${repoName}-auth`,
      name: `${REPO_ENGINE_LABEL[engine]} 私有仓库鉴权`,
      enabled: true,
      stage: 'reqHeaders',
      priority: 10,
      match,
      action: {
        reqHeaders: { set: { Authorization: tokenVar }, strip: [] },
      },
    };
  }

  return { rewrite, hostHeader: hostHeaderRule, respHeaders: respRule, reqHeaders: reqHeadersRule };
}
