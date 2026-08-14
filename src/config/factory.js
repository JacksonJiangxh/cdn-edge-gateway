/**
 * ============================================================================
 * config/factory.js —— 深拷贝工具（默认值工厂的底层依赖）
 * ----------------------------------------------------------------------------
 * 本文件只放「深拷贝 / 解冻」这一类纯函数，被 global.js / stages-defaults.js
 * / site.js / defaults.js 共用。它是依赖图的最底层（仅依赖语言内建），
 * 任何上层文件都可安全地 import 它，不会引入循环依赖或 TDZ。
 *
 * 设计说明：
 *  - 不用 structuredClone —— EdgeOne 运行时不保证提供。
 *  - 只处理 JSON 可表达的结构（对象 / 数组 / 原始值），足够覆盖本项目所有配置。
 *  - 「克隆即解冻」：默认模板是 Object.freeze 的，克隆出来的副本需要可写，
 *    因此 deepUnfreeze 同时做深拷贝与解冻。
 * ============================================================================
 */

/**
 * 递归深拷贝并解冻。
 * @param {any} v 源值
 * @returns {any} 可写深拷贝
 */
export function deepUnfreeze(v) {
  if (Array.isArray(v)) return v.map(deepUnfreeze);
  if (v && typeof v === 'object') {
    /** @type {Record<string, any>} */
    const out = {};
    for (const k of Object.keys(v)) out[k] = deepUnfreeze(v[k]);
    return out;
  }
  return v;
}

/**
 * 通用深拷贝，供 store / schema 复用。语义等同 deepUnfreeze。
 * @param {any} v 源值
 * @returns {any} 深拷贝
 */
export function deepClone(v) {
  return deepUnfreeze(v);
}
