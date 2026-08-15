// 共享运行时状态（单一真相源）。
// 原 IIFE 闭包内可变/引用型状态外置到本模块，供各 ESM 子模块 import 复用。
// 用对象引用传递，避免 ESM const/let 跨模块 TDZ 未初始化问题。

// 运行时数据：站点/源站/统计/平台信息。render / loadAll / refreshData 读写。
import { loadAll } from './views/overview.js';
export const APP_DATA = { global: null, sites: [], pools: [], stats: null, info: null };

// 全站通用（兜底）规则编辑器的阶段缓存（stages[stage] => action 片段）。
// 用普通对象引用，调用方直接 globalStages[stage] = ... 赋值即可（同引用，等价原 let GLOBAL_STAGES = {}）。
export const globalStages = {};

// 全局引用，等价于原 const API = window.API / const PLATFORM = window.__PLATFORM__。
export const API = window.API;
export const PLATFORM = window.__PLATFORM__ || 'unknown';

/**
 * 重新拉取站点/源站列表并刷新 APP_DATA（单一真相源）。
 * 各视图在增删改后调用，使列表视图拿到最新数据。
 * 注意：不刷新平台 info（避免每次操作都打 info 接口），如需一并刷新请用 loadAll。
 * @returns {Promise<void>}
 */
export async function refreshData() {
  const [sites, pools] = await Promise.all([
    API.sites.list().catch(() => ({ sites: [] })),
    API.pools.list().catch(() => ({ pools: [] })),
  ]);
  APP_DATA.sites = sites.sites || [];
  APP_DATA.pools = pools.pools || [];
}
