/**
 * 仓库型回源预设（cnb / github）
 * ----------------------------------------------------------------------------
 * cnb / github 不再是独立「引擎」，而是「fetch 引擎 + 站点规则预设」的组合：
 *   回源域名/Host   → 规则 hostHeader.custom（固定回源 Host）
 *   路径映射        → 规则 rewrite（把 /:path 重写为仓库 raw 路径）
 *   鉴权请求头      → 规则 reqHeaders.set.Authorization = __cnb_token__ / __github_token__
 *   响应头剥离      → 规则 respHeaders.strip
 * 运行时回源统一走 fetchEngine，token 由系统占位符解析层（vars.js 的
 * __cnb_token__ / __github_token__）从站点级加密落盘的密文解密注入，
 * 不进入规则明文，也不再由任何「仓库引擎」运行时补实。
 *
 * 本文件是「仓库预设 → 站点规则」的唯一真相源。前端 buildRepoPresetRules
 * 仅作为同源调用的薄封装（见 web/app/lib/repoPreset.js），后端不再持有
 * 第二份规则生成逻辑。
 *
 * 扩展新仓库平台：只需在下表加一条，无需编写引擎代码。
 */

/** 各仓库平台的回源域名（公开 / 私有两个回源点，由 repoPrivate 决定）。 */
export const REPO_ENGINE_HOST_MAP = {
  cnb: {
    public: 'cnb.cool',
    private: 'api.cnb.cool',
  },
  github: {
    public: 'raw.githubusercontent.com',
    private: 'raw.githubusercontent.com',
  },
};

/**
 * 路径映射正则：把「/foo/bar」映射到仓库 raw 路径（cnb 与 github 格式不同，见下方
 * buildRepoPresetRules 中按 engine 选择的 replacement）。此常量保留用于调试/文档参考。
 */
export const REPO_PATH_RE = /\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.*)/;

/**
 * 取某仓库平台的回源域名。
 * @param {'cnb'|'github'} engine
 * @param {boolean} isPrivate 是否私有仓库
 * @returns {string} 回源域名
 */
export function repoUpstreamHost(engine, isPrivate) {
  const m = REPO_ENGINE_HOST_MAP[engine];
  if (!m) return '';
  return isPrivate ? m.private : m.public;
}

/**
 * 生成仓库型源站关联的站点规则（rewrite + hostHeader + 鉴权头 + 响应头剥离）。
 * 产物为规则数组（每条规则含 match / action 标准结构），与前端
 * web/app/lib/repoPreset.js 的 buildRepoPresetRules 同源。
 *
 * 注意：鉴权头使用 __cnb_token__ / __github_token__ 系统占位符，运行时由
 * vars.js 的 resolveSysVar 从站点级密文解密注入（见 vars.js / secretStore）。
 * 占位符不进入规则明文存储。
 *
 * @param {'cnb'|'github'} engine
 * @param {Object} p
 * @param {string} p.repoUser    仓库归属
 * @param {string} p.repoName    仓库名
 * @param {string} [p.repoBranch=main] 分支
 * @param {boolean} [p.repoPrivate] 是否私有仓库（私有才注入鉴权头）
 * @param {string} [p.originId] 绑定源站 id（规则匹配维度，仅绑定到该源站）
 * @returns {Array<Object>} 规则数组
 */
export function buildRepoPresetRules(engine, p = {}) {
  const repoUser = p.repoUser || '';
  const repoName = p.repoName || '';
  const repoBranch = p.repoBranch || 'main';
  const repoPrivate = !!p.repoPrivate;
  const originId = p.originId || undefined;
  const upHost = repoUpstreamHost(engine, repoPrivate);

  // 命中条件：仅当请求落到该仓库源站时（originId 维度）才套用，
  // 避免同站点其它源站被错误套用 raw 路径格式而 404。
  const match = originId
    ? { originIds: originId, pathRegex: '^/.*' }
    : { conditions: [[{ target: 'path', op: 'regex', values: ['^/.*'] }]] };

  const rules = [];

  // cnb / github 的 raw URL 路径格式不同，按平台走不同的重写规则（回源域名不同也同理）：
  //   · cnb：    /{user}/{repo}/-/git/raw/{branch}/{rest}
  //   · github： /{user}/{repo}/{branch}/{rest}（raw.githubusercontent.com 无 /raw/ 段）
  // 旧版按「回源匹配 → 执行不同 URL 重写」正是此逻辑，这里按 engine 选不同 replacement。
  const rewriteReplacement =
    engine === 'cnb'
      ? `/${repoUser}/${repoName}/-/git/raw/${repoBranch}/$1`
      : `/${repoUser}/${repoName}/${repoBranch}/$1`;

  // ① 回源 Host + 路径映射（同一条规则同时承载，避免两条规则各跑一次匹配）
  rules.push({
    match,
    action: {
      // 固定回源 Host（替代旧引擎常量 repoUpstreamHost）
      hostHeader: { mode: 'custom', custom: upHost },
      // URL 重写：按平台格式映射（见上方 rewriteReplacement）
      rewrite: {
        type: 'regex',
        pattern: '^/(.*)$',
        replacement: rewriteReplacement,
      },
    },
  });

  // ② 鉴权请求头（仅私有仓库）：__cnb_token__ / __github_token__ 占位符
  if (repoPrivate) {
    const tokenVar = engine === 'cnb' ? '__cnb_token__' : '__github_token__';
    rules.push({
      match,
      action: {
        reqHeaders: { set: { Authorization: tokenVar } },
      },
    });
  }

  // ③ 响应头剥离（仓库 raw 特有头，避免泄露源站实现）
  rules.push({
    match,
    action: {
      respHeaders: {
        strip: [
          'x-cnb', 'x-github', 'x-runtime', 'x-served-by',
          'vary', 'access-control-allow-origin', 'x-amz-id-2', 'server',
        ],
      },
    },
  });

  return rules;
}
