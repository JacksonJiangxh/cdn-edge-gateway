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
  // 匹配条件统一用 conditions 二维数组（外 OR / 内 AND），与前端同源；
  // 旧版快捷字段（originIds / pathRegex / pathPrefix）已废弃，normRule 不再识别。
  const match = originId
    ? { conditions: [[{ target: 'origin', op: 'equal', values: [originId] }]] }
    : { conditions: [[{ target: 'path', op: 'regex', values: ['^/.*'] }]] };

  const rules = [];

  // cnb / github 的 raw URL 路径格式不同，按平台走不同的重写规则：
  //   · cnb：    /{user}/{repo}/-/git/raw/{branch}/{rest}
  //   · github： /{user}/{repo}/{branch}/{rest}（raw.githubusercontent.com 无 /raw/ 段）
  const rewriteReplacement =
    engine === 'cnb'
      ? `/${repoUser}/${repoName}/-/git/raw/${repoBranch}/$1`
      : `/${repoUser}/${repoName}/${repoBranch}/$1`;

  // ① 固定回源 Host（指向仓库 raw API 上游）。单独成 origin 阶段规则：
  //    origin 阶段的 allowedOps 含 hostHeader，normRule 按阶段裁剪会保留该字段，
  //    落库后由运行时 pipeline 的 origin 阶段注入回源 Host。
  //    注意：不能用 stage:'hostHeader'（系统无此阶段，normalizeStage 返回 null
  //    会导致落库成死规则、回源 Host 永不生效）。
  rules.push({
    id: `repo-${engine}-${repoName}-host`,
    name: `仓库固定回源 Host（${upHost}）`,
    enabled: true,
    stage: 'origin',
    priority: 10,
    match,
    action: {
      hostHeader: { mode: 'custom', custom: upHost },
    },
  });

  // ② 路径映射（rewrite 阶段）。与回源 Host 拆开：rewrite 阶段只保留 rewrite
  //    字段，若混放会丢失 hostHeader。
  rules.push({
    id: `repo-${engine}-${repoName}-rewrite`,
    name: `仓库 raw 映射（${repoBranch}）`,
    enabled: true,
    stage: 'rewrite',
    priority: 10,
    match,
    action: {
      rewrite: {
        type: 'regex',
        pattern: '^/(.*)$',
        replacement: rewriteReplacement,
      },
    },
  });

  // ③ 鉴权请求头（仅私有仓库）：__cnb_token__ / __github_token__ 占位符
  if (repoPrivate) {
    const tokenVar = engine === 'cnb' ? '__cnb_token__' : '__github_token__';
    rules.push({
      id: `repo-${engine}-${repoName}-auth`,
      name: '私有仓库鉴权',
      enabled: true,
      stage: 'reqHeaders',
      priority: 10,
      match,
      action: {
        reqHeaders: { set: { Authorization: tokenVar } },
      },
    });
  }

  // ④ 响应头剥离（仓库 raw 特有头，避免泄露源站实现）
  // 仅剥离「仓库接口特有」的头，全站通用（CORS/CSP/Set-Cookie/不缓存信号/S3 兼容调试头等）
  // 已由全站默认规则 stages.respHeaders.strip 兜底，这里不重复（normalizeStripRules
  // 兼容纯字符串 exact 与 {type,value} 两种语法，前缀用 prefix）。
  rules.push({
    id: `repo-${engine}-${repoName}-resp`,
    name: '仓库特有响应头剥离',
    enabled: true,
    stage: 'respHeaders',
    priority: 10,
    match,
    action: {
      respHeaders: {
        strip: [
          // —— CNB 与 GitHub 共有 / 引擎自报标识 ——
          'x-cnb', 'x-github', 'x-runtime', 'x-served-by',
          'x-amz-id-2', 'server',
          // vary 由全站默认已剥离；此处不再重复
          // —— CNB 特有（实测 o_img_cnb）——
          'access-control-allow-credentials',
          'access-control-expose-headers',
          'referrer-policy',
          'traceparent',
          'x-repo-commit',
          // x-ratelimit-* 限流头（CNB 返回 x-ratelimit-limit/remaining/reset）
          { type: 'prefix', value: 'x-ratelimit-' },
          // —— GitHub 特有（实测 o_img_gh / Fastly 后端）——
          'x-xss-protection',
          'strict-transport-security',
          'x-github-request-id',
          'x-github-edge-region',
          { type: 'prefix', value: 'x-github-' },
          'x-fastly-request-id',
          'x-timer',
          'source-age',
          'x-cache-hits',
        ],
      },
    },
  });

  return rules;
}
