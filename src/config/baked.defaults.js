/**
 * ============================================================================
 * config/baked.defaults.js —— 烘焙配置「默认空占位」（始终入库，保证 import）
 * ----------------------------------------------------------------------------
 * 本文件【提交进 git 仓库】（与 baked.generated.js 不同，后者被 .gitignore 排除）。
 *
 * 为什么需要它？
 *   方案 A（静态部署 / 不依赖 KV）的真实配置来自 build.mjs --bake 生成的
 *   baked.generated.js，该文件含部署专属配置、不应入库（已在 .gitignore 排除）。
 *   但 CI 从 git 干净检出时 baked.generated.js 不存在，若 store.js 静态 import 它
 *   会导致构建期 ERR_MODULE_NOT_FOUND。
 *
 *   因此 store.js 改为：静态 import 本文件（永远存在、无机密）作为基础，
 *   运行时若检测到 baked.generated.js 存在则加载其覆盖。
 *   → 干净检出、未 --bake 时也能正常构建与运行（ESA 端回退到内置默认值）。
 *
 * 本占位字段全为 null / 空数组，等同于「无烘焙配置」状态，store.js 会据此
 * 回退到内置默认值（defaults.js）。请勿写入任何真实配置。
 * ============================================================================
 */

/** 空烘焙配置占位（结构与 buildConfigMirror payload 一致）。 */
export const BAKE_DEFAULTS = {
  version: 1,
  exportedAt: null,
  global: null,
  globalRules: null,
  sites: [],
  pools: [],
};
