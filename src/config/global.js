/**
 * ============================================================================
 * config/global.js —— 系统 / 管理面级默认值
 * ----------------------------------------------------------------------------
 * 这一层是「网关自身怎么运行」的配置，与单条站点 / 单条规则无关：
 *   - 产品品牌名（注入 Server / Via 响应头）
 *   - 管理面（密码、面板域名、统计、全局限速、配置缓存 TTL）
 *   - 伪装页策略（disguise）
 *   - 引擎级常量（调试头名、不应缓存状态码全集、透传白名单全集）
 *
 * 依赖方向：仅依赖上层 contracts.js 与底层 factory.js，可被 stages-defaults.js
 * / site.js 安全 import，不会形成循环依赖。
 * ============================================================================
 */

import {
  CONFIG_VERSION, NO_CACHE_STATUS, FORWARD_HEADER_WHITELIST,
} from '../contracts.js';
import { deepUnfreeze } from './factory.js';

/**
 * 本项目作为独立 CDN 网关的产品品牌名。
 * 用于注入到响应头（Server / Via），明确请求由本网关处理、而非上游平台或源站。
 */
export const PRODUCT_NAME = 'EdgeGateway';

/**
 * 调试响应头默认头名（引擎常量，下沉自旧 settings.debug.headers）。
 * 默认始终下发；如需关闭，在站点规则 stages.respHeaders.strip 中加入对应头（type:'exact'）即可。
 */
export const DEBUG_HEADER_NAMES = Object.freeze({
  originId: 'X-Origin-Id',
  cache: 'X-Cache',
  ruleId: 'X-Rule-Id',
  retryCount: 'X-Retry-Count',
  edgeTime: 'X-Edge-Time',
});

/**
 * 默认 Host 头处理方式：inherit = 沿用 fetch 的默认行为（Host 取源站域名）。
 * @type {Readonly<{mode:'inherit'|'origin'|'client'|'custom', custom?:string}>}
 */
export const DEFAULT_HOST_HEADER = Object.freeze({
  mode: 'inherit',
  custom: '',
});

/**
 * 站点级默认回源 Host：accel = 使用加速域名（默认）。
 * @type {Readonly<{mode:'accel'|'origin'|'custom', custom?:string}>}
 */
export const DEFAULT_SITE_HOST_HEADER = Object.freeze({
  mode: 'accel',
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
  statsEnabled: true,
  statsDriver: 'kv',
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
 * 不应缓存的状态码枚举全集（源自 contracts.js 的 NO_CACHE_STATUS）。
 * 作为「引擎铁律」兜底：当用户未用 statusTtl 显式配置某状态码时（statusTtl 完全未命中），
 * isCacheable 回落到该枚举决定写缓存阶段是否拦截。已用 statusTtl 显式配置（含 TTL=0
 * 的 no-store 与 `!KEY` 例外）的码优先于此枚举。原 noCacheStatus 黑名单已并入 statusTtl
 * （TTL=0 = no-store），其向后兼容转换见 schema.normGlobalOnlySubFields。
 * @type {readonly number[]}
 */
export const NO_CACHE_STATUS_LIST = Object.freeze([...NO_CACHE_STATUS]);

/**
 * 回源请求头透传白名单（源自 contracts.js 的 FORWARD_HEADER_WHITELIST）。
 * 作为 stages.reqHeaders.forwardWhitelist 的默认填充值。
 * @type {readonly string[]}
 */
export const FORWARD_HEADER_WHITELIST_LIST = Object.freeze([...FORWARD_HEADER_WHITELIST]);

/**
 * 生成一份可写的全局配置默认值。
 * @returns {import('../contracts.js').GlobalConfig} 新对象
 */
export function cloneGlobal() {
  return deepUnfreeze(DEFAULT_GLOBAL);
}
