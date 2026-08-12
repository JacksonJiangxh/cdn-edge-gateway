/**
 * ============================================================================
 * config/stages.js —— 阶段字典（最底层 action → 阶段 的唯一映射，权威源）
 * ----------------------------------------------------------------------------
 * 这是「字典字段驱动全链路」模式的唯一真相源。
 *
 * 设计原则（对标 nginx 的 http/server/location 模块化分片段聚合）：
 *   1) 一个 action 必然只属于「某一个」阶段（一个规则集），不存在跨阶段。
 *   2) 本字典是全链路唯一真相源：流量序列渲染、抽屉归属/受限、规则集聚合、
 *      规则片段、合并落库全部以 `rule.stage` 字段为索引，不再各自从 action 反推。
 *      任何阶段/动作的增删减，只改这里一处。
 *   3) 单阶段是硬约束：可添加 action 的下拉列表由「当前阶段字段」决定，
 *      回源规则里绝不会出现缓存等其它阶段的 action，因此一条规则的所有
 *      action 必然只属于同一阶段字段，不存在跨阶段叠加。
 *      stageForAction 仅作落库/历史规则的反推兜底：因 action 已被字段约束
 *      在同一阶段内，反推结果必然等于该阶段，不是「从多个里挑一个」。
 *
 * 为什么独立成文件：
 *   后端（templates.js 等）以 ESM 直接 import 本字典；前端 web/app.js 是浏览器
 *   端无打包单文件，无法 import，故保留一份同构副本，由 build.mjs 在构建期做一致
 *   性断言——两处 STAGE_OPS 的 match 口径不一致则构建失败，从根上杜绝「改一处漏一处」。
 * ============================================================================
 */

/** 阶段号顺序即「优先级」：一条规则若带多个阶段的动作（历史脏数据），
 *  stageForAction 返回该顺序中第一个命中的阶段号。 */
export const STAGE_ORDER = ['⑤', '⑥', '⑦', '⑧', '⑨', '⑪', '⑯'];

/**
 * 阶段字典。
 * 每个阶段含：title（展示名）、owner（抽屉归属）、icon、allowedOps（该阶段允许
 * 添加的 action 列表——这是「下拉列表由阶段字段决定、不会出现跨阶段 action」的落点）、
 * hideTargetPool（受限抽屉是否隐藏目标源站选择）、match(a)（由 action 反推归属的判定）。
 *
 * match 口径即全链路真相：前端 STAGE_OPS 必须与此处逐字一致（由 build.mjs 校验）。
 */
export const STAGE_OPS = {
  '⑤': {
    title: 'URL 重写',
    owner: '路由规则抽屉 · URL 重写',
    icon: '✂️',
    allowedOps: ['rewrite'],
    hideTargetPool: true,
    // match: 由 action 反推阶段（兜底用）。inherit 是「不改动回源 Host」的默认值，
    // 不能算 Origin Rules —— 否则每条规则都会被误判进 ⑨ 越界。
    match: (a) => !!(a.rewrite && a.rewrite.type && a.rewrite.type !== 'none'),
  },
  '⑥': {
    title: '重定向规则',
    owner: '路由规则抽屉 · 重定向',
    icon: '↪️',
    allowedOps: ['redirect'],
    hideTargetPool: true,
    match: (a) => !!(a.redirect && a.redirect.enabled),
  },
  '⑦': {
    title: '强制 HTTPS / 直接响应（终止型）',
    owner: '路由规则抽屉 · 强制HTTPS / 直接响应',
    icon: '🔒',
    allowedOps: ['forceHttps', 'directResponse'],
    hideTargetPool: true,
    match: (a) => !!(a.forceHttps || (a.directResponse && a.directResponse.enabled)),
  },
  '⑧': {
    title: '修改请求头',
    owner: '路由规则抽屉 · 修改请求头',
    icon: '📤',
    allowedOps: ['reqHeaders'],
    hideTargetPool: true,
    match: (a) => { const h = a.reqHeaders || {}; return !!(h.set && Object.keys(h.set).length) || !!(h.remove && h.remove.length); },
  },
  '⑨': {
    title: 'Origin Rules',
    owner: '路由规则抽屉 · Origin Rules',
    icon: '🔀',
    allowedOps: ['hostHeader', 'originConn', 'targetPool'],
    hideTargetPool: false,
    // inherit 是「不改动回源 Host」的默认值，schema 给每条规则都补 inherit，
    // 绝不能算 Origin Rules —— 否则每条规则都会被误判进 ⑨ 越界。
    // accel 是「跟随加速（平台默认）」，也非 Origin Rules 显式改写。
    match: (a) => !!(a.poolId || (a.inlineOrigins || []).length
      || (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel' && a.hostHeader.mode !== 'inherit')
      || a.engine || a.scheme || Number(a.port) > 0),
  },
  '⑪': {
    title: 'Cache Rules（缓存请求设置）',
    owner: '路由规则抽屉 · Cache Rules（缓存策略）',
    icon: '📥',
    allowedOps: ['cache'],
    hideTargetPool: true,
    match: (a) => !!(a.cache && (a.cache.enabled || a.cache.mode === 'noCache')),
  },
  '⑯': {
    title: '改写响应头 / Response Cache Rule',
    owner: '路由规则抽屉 · 改写响应头 / Response Cache Rule',
    icon: '📝',
    allowedOps: ['respHeaders'],
    hideTargetPool: true,
    match: (a) => { const h = a.respHeaders || {}; return !!(h.set && Object.keys(h.set).length) || !!(h.remove && h.remove.length); },
  },
};

/** 由 action 反推所属阶段（兜底用）：返回 STAGE_ORDER 中第一个命中的阶段号，无则 null。 */
export function stageForAction(a) {
  a = a || {};
  for (const no of STAGE_ORDER) if (STAGE_OPS[no].match(a)) return no;
  return null;
}
