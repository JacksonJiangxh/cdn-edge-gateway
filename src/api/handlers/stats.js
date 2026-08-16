/**
 * 统计查询 API handlers
 */

import { ok } from '../../utils/response.js';
import { getGlobal, listAllSites } from '../../config/store.js';
import { queryOverview, queryByHost, getStatsHealth } from '../../stats/index.js';

/** GET /stats/overview */
export async function overview(ctx) {
  const g = await getGlobal(ctx);

  if (!g?.statsEnabled || g?.statsDriver === 'none') {
    return ok({
      enabled: false,
      message: '统计功能未开启，可在「系统设置」中启用',
      requests: 0,
      hitRate: 0,
      bytes: 0,
      statusDist: {},
      topHosts: [],
    });
  }

  const { sites } = await listAllSites(ctx);
  const data = await queryOverview(ctx, sites.map((s) => s.host), 24);

  return ok({ enabled: true, siteCount: sites.length, ...data });
}

/** GET /stats/host/:host?hours=24 */
export async function byHost(ctx, host) {
  const hours = clampInt(ctx.url.searchParams.get('hours'), 1, 168, 24);
  const data = await queryByHost(ctx, host.toLowerCase(), hours);
  return ok({ host, hours, ...data });
}

/** GET /stats/status —— 统计聚合器健康/观测状态（D1 写入失败计数等） */
export async function status(ctx) {
  const data = await getStatsHealth(ctx);
  return ok({
    driver: data.driver,
    d1Available: data.d1Available,
    // D1 模式下累计「重试后仍失败、已丢弃」的聚合次数；
    // 持续 > 0 说明 D1 绑定不稳定，需排查部署平台绑定配置。
    d1FallbackCount: data.d1FallbackCount,
    pending: data.pending,
    lastFlushAt: data.lastFlushAt,
    pendingHosts: data.hosts.length,
  });
}

function clampInt(v, min, max, dft) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dft;
  return Math.min(max, Math.max(min, n));
}
