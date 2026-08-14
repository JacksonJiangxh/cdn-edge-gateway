/**
 * ============================================================================
 * config/defaults.js —— 全部配置对象默认值的「聚合 re-export 层」
 * ----------------------------------------------------------------------------
 * 本文件不再存放任何默认值本体。按配置层级拆分后，真身位于：
 *   - factory.js        ：深拷贝工具（deepUnfreeze / deepClone），依赖图最底层
 *   - global.js         ：系统 / 管理面级（PRODUCT_NAME / DEFAULT_GLOBAL / 伪装页 / 引擎常量）
 *   - stages-defaults.js：全站流量序列「阶段 → 默认动作」级
 *                         （DEFAULT_GLOBAL_RULES 及其引用的所有模板）
 *   - site.js           ：站点 / 规则 / 源站 / 源站池级
 *
 * 这里只做「导入后原样再导出」，使下游 14 处 src/ + 7 处 scripts/ 的
 * `import ... from './defaults.js'` / `'../config/defaults.js'` 路径完全不变，
 * 实现零行为回归的纯结构梳理。
 *
 * 字段仍严格对齐 contracts.js 第三节的数据模型定义。
 * 使用约定：
 *  - 所有默认对象都是 Object.freeze 的「模板」，禁止直接修改。
 *  - 需要一个可写副本时，请用各文件提供的 clone* 工厂函数（做了深拷贝）。
 *  - schema.js 的规范化逻辑以这里导出的符号为唯一补全来源。
 * ============================================================================
 */

import { setProductName } from './vars.js';
import { PRODUCT_NAME } from './global.js';

// 让 ${product_name} 变量与本项目身份标识保持同步（无需硬编码在 vars.js 中）。
// 必须在 PRODUCT_NAME 声明之后调用，避免 ESM 顶层 const 的 TDZ。
setProductName(PRODUCT_NAME);

// —— 系统 / 管理面级 ——
export {
  PRODUCT_NAME,
  DEBUG_HEADER_NAMES,
  DEFAULT_HOST_HEADER,
  DEFAULT_SITE_HOST_HEADER,
  DEFAULT_GLOBAL,
  DEFAULT_DISGUISE,
  NO_CACHE_STATUS_LIST,
  FORWARD_HEADER_WHITELIST_LIST,
  cloneGlobal,
} from './global.js';

// —— 全站流量序列「阶段 → 默认动作」级 ——
export {
  DEFAULT_CACHE_KEY,
  DEFAULT_CACHE_POLICY,
  DEFAULT_HEADER_OPS,
  DEFAULT_REWRITE,
  DEFAULT_RULE_MATCH,
  DEFAULT_CONDITION,
  MATCH_TARGETS,
  MATCH_OPERATORS,
  TARGETS_NEED_KEY,
  DEFAULT_REDIRECT,
  DEFAULT_DIRECT_RESPONSE,
  DEFAULT_CLIENT_IP_HEADER,
  DEFAULT_TERMINATE,
  DEFAULT_GLOBAL_RULES,
  cloneGlobalRules,
  cloneCachePolicy,
  deepClone,
} from './stages-defaults.js';

// —— 站点 / 规则 / 源站 / 源站池级 ——
export {
  DEFAULT_RATE_LIMIT,
  DEFAULT_BOT_MANAGEMENT,
  DEFAULT_SECURITY,
  DEFAULT_FAILOVER,
  DEFAULT_SITE,
  DEFAULT_ORIGIN,
  ORIGIN_ENGINES,
  DEFAULT_POOL,
  POOL_KINDS,
  DEFAULT_SITE_INDEX,
  DEFAULT_POOL_INDEX,
  DEFAULT_RULE_ACTION,
  DEFAULT_RULE,
  cloneSite,
  clonePool,
  cloneRule,
  cloneOrigin,
  cloneSecurity,
} from './site.js';
