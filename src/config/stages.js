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
 *   4) 阶段索引只来自「抽屉入口」，绝不反推：下拉框选项受 allowedOps 约束，
 *      用户在「选择新建什么操作」那一刻阶段就唯一确定，落库必带 rule.stage。
 *      反推（按 STAGE_ORDER 顺序猜）不可控，已从全链路移除。
 *
 * 为什么独立成文件：
 *   后端（templates.js 等）以 ESM 直接 import 本字典；前端 web/app.js 是浏览器
 *   端无打包单文件，无法 import，故保留一份同构副本，由 build.mjs 在构建期做一致
 *   性断言——两处 STAGE_OPS 的 match 口径不一致则构建失败，从根上杜绝「改一处漏一处」。
 * ============================================================================
 */

/**
 * 阶段顺序：仅用于 STAGE_OPS 的遍历/展示排序，不再参与任何「由 action 反推阶段」的逻辑。
 * key 使用清晰可读的英文名（而非带圈数字），便于查看、记忆与调试。
 */
export const STAGE_ORDER = ['rewrite', 'redirect', 'terminate', 'reqHeaders', 'origin', 'cache', 'respHeaders'];

/**
 * 旧版「带圈数字」阶段标识 → 新版英文名 的兼容映射。
 * 老数据里 rule.stage 可能仍是 '⑤'/'⑪' 等，读取/落库时经 normalizeStage() 自动转成英文名，
 * 避免历史规则因 key 改名而「丢失阶段、不渲染」。新数据一律用英文名。
 */
export const STAGE_ALIASES = {
  '⑤': 'rewrite', '⑥': 'redirect', '⑦': 'terminate', '⑧': 'reqHeaders',
  '⑨': 'origin', '⑪': 'cache', '⑯': 'respHeaders',
};

/** 把任意阶段的标识符（含旧带圈数字）归一为当前英文名 key；非法值返回 null。 */
export function normalizeStage(s) {
  if (!s) return null;
  if (STAGE_OPS[s]) return s;
  if (STAGE_ALIASES[s]) return STAGE_ALIASES[s];
  return null;
}

/**
 * 阶段字典。
 * 每个阶段含：title（中文展示名）、en（英文标识/抽屉归属）、icon、order（序号）、
 * allowedOps（该阶段允许添加的 action 列表——「下拉列表由阶段字段决定、不会出现跨阶段
 * action」的落点）、hideTargetPool（受限抽屉是否隐藏目标源站选择）。
 *
 * match 口径即全链路真相：前端 STAGE_OPS 必须与此处逐字一致（由 build.mjs 校验）。
 */
export const STAGE_OPS = {
  rewrite: {
    title: 'URL 重写',
    en: 'rewrite',
    owner: '路由规则抽屉 · URL 重写',
    icon: '✂️',
    order: 1,
    allowedOps: ['rewrite'],
    hideTargetPool: true,
    // inherit 是「不改动回源 Host」的默认值，不能算 Origin Rules —— 否则每条规则都会被误判进 origin 越界。
  },
  redirect: {
    title: '重定向规则',
    en: 'redirect',
    owner: '路由规则抽屉 · 重定向',
    icon: '↪️',
    order: 2,
    allowedOps: ['redirect'],
    hideTargetPool: true,
  },
  terminate: {
    title: '强制 HTTPS / 直接响应（终止型）',
    en: 'terminate',
    owner: '路由规则抽屉 · 强制HTTPS / 直接响应',
    icon: '🔒',
    order: 3,
    allowedOps: ['forceHttps', 'directResponse'],
    hideTargetPool: true,
  },
  reqHeaders: {
    title: '修改请求头',
    en: 'reqHeaders',
    owner: '路由规则抽屉 · 修改请求头',
    icon: '📤',
    order: 4,
    allowedOps: ['reqHeaders'],
    hideTargetPool: true,
  },
  origin: {
    title: 'Origin Rules（回源规则）',
    en: 'origin',
    owner: '路由规则抽屉 · Origin Rules',
    icon: '🔀',
    order: 5,
    allowedOps: ['hostHeader', 'originConn', 'targetPool', 'clientIp', 'followRedirect', 'originTimeout'],
    hideTargetPool: false,
    // inherit 是「不改动回源 Host」的默认值，schema 给每条规则都补 inherit，
    // 绝不能算 Origin Rules —— 否则每条规则都会被误判进 origin 越界。
    // accel 是「跟随加速（平台默认）」，也非 Origin Rules 显式改写。
    // 注意：engine / scheme / port 不是独立 op，而是 originConn 这个 op 的「子字段」
    // （前端 originConn 卡片内渲染，前端 read() 一并返回；
    //  后端 STAGE_OP_FIELDS.originConn = ['engine','scheme','port'] 落库时一并写入）。
    // 因此 allowedOps 只列到 op 粒度（originConn），不要列 engine/scheme/port，
    // 否则会与前端 ACTION_GROUPS 的 value 错位，导致受限模式下拉为空。
  },
  cache: {
    title: 'Cache Rules（缓存规则）',
    en: 'cache',
    owner: '路由规则抽屉 · Cache Rules（缓存策略）',
    icon: '📥',
    order: 6,
    allowedOps: ['cache'],
    hideTargetPool: true,
  },
  respHeaders: {
    title: '改写响应头 / Response Cache Rule',
    en: 'respHeaders',
    owner: '路由规则抽屉 · 改写响应头 / Response Cache Rule',
    icon: '📝',
    order: 7,
    allowedOps: ['respHeaders'],
    hideTargetPool: true,
  },
};
