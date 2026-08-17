/**
 * ============================================================================
 * config/global.js —— 系统 / 管理面级默认值
 * ----------------------------------------------------------------------------
 * 这一层是「网关自身怎么运行」的配置，与单条站点 / 单条规则无关：
 *   - 产品品牌名（注入 Server / Via 响应头）
 *   - 管理面（密码、面板域名、统计、全局限速、配置缓存 TTL）
 *   - 伪装页策略（disguise）
 *   - 引擎级常量（调试头名、不应缓存状态码全集）
 *
 * 依赖方向：仅依赖上层 contracts.js 与底层 factory.js，可被 stages-defaults.js
 * / site.js 安全 import，不会形成循环依赖。
 * ============================================================================
 */

import {
  CONFIG_VERSION,
} from '../contracts.js';
import { deepUnfreeze } from './factory.js';

/**
 * 本项目作为独立 CDN 网关的产品品牌名。
 * 用于注入到响应头（Server / Via），明确请求由本网关处理、而非上游平台或源站。
 */
export const PRODUCT_NAME = 'EdgeGateway';

/**
 * 调试响应头头名（已下沉为全站规则 stages.respHeaders.set 模板，由 applyHeaderOps 下发）。
 * 保留此注释作为语义契约参考：默认调试头名如下，如需关闭某头，
 * 在站点规则 stages.respHeaders.strip 中加入对应头（type:'exact'）即可。
 *   X-Origin-Id  → 回源选中的上游源 id
 *   X-Cache      → 命中来源 HIT / MISS / BYPASS / STALE
 *   X-Rule-Id    → 命中的规则 id
 *   X-Retry-Count→ 回源重试次数
 *   X-Edge-Time  → 边缘处理耗时（ms）
 * 原 DEBUG_HEADER_NAMES 常量已移除导出，不再由引擎外代码写死。
 */

/**
 * 默认 Host 头处理方式：inherit = 沿用 fetch 的默认行为（Host 取源站域名）。
 * @type {Readonly<{mode:'inherit'|'origin'|'client'|'custom', custom?:string}>}
 */
export const DEFAULT_HOST_HEADER = Object.freeze({
  mode: 'inherit',
  custom: '',
});

/**
 * 站点级默认回源 Host：origin = 沿用源站自身 addr（回源域名）。
 * 仅作为 fetch / socket 引擎的兜底；仓库引擎（cnb/github）与 r2 站点下
 * 前端不渲染该下拉，回源 host 由引擎在代码层强制约定。
 * @type {Readonly<{mode:'accel'|'origin'|'custom', custom?:string}>}
 */
export const DEFAULT_SITE_HOST_HEADER = Object.freeze({
  mode: 'origin',
  custom: '',
});

/**
 * 默认全局配置（系统 / 管理面级）。
 * passwordHash / passwordSalt 留空表示「尚未初始化」，
 * 首次进入管理面时应引导用户设置密码。
 * @type {Readonly<import('../contracts.js').GlobalConfig>}
 */
export const DEFAULT_GLOBAL = Object.freeze({
  adminPath: '__panel',
  /** 自定义面板域名（留空=任意绑定域名均可进管理面板） */
  adminDomain: '',
  passwordHash: '',
  passwordSalt: '',
  tokenTtl: 7200,
  // 统计（D1）默认关闭：D1 存在每日写入额度限制，且仅在 Cloudflare 环境可用，
  // 故默认不启用。用户可在管理面显式开启（statsEnabled=true 并确保平台绑定 D1）。
  statsEnabled: false,
  statsDriver: 'd1',
  configCacheTtl: 60,
  /** 全局请求频率限制（req/s），0 表示不限制 */
  globalRateLimit: 0,
  disguise: Object.freeze({
    mode: 'static',
    target: '',
    status: 502,
  }),
  version: CONFIG_VERSION,
});

/**
 * 默认伪装页策略。
 * 单独导出，供 schema.js 规范化与 proxy/disguise.js 兜底使用。
 * @type {Readonly<import('../contracts.js').Disguise>}
 */
export const DEFAULT_DISGUISE = DEFAULT_GLOBAL.disguise;

/**
 * 生成一份可写的全局配置默认值。
 * @returns {import('../contracts.js').GlobalConfig} 新对象
 */
export function cloneGlobal() {
  return deepUnfreeze(DEFAULT_GLOBAL);
}
