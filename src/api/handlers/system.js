/**
 * 系统管理 API handlers —— 平台信息、配置导出/导入
 *
 * 配置导出是本项目唯一的配置备份手段（KV 无版本管理），务必保留。
 */

import { ok, fail } from '../../utils/response.js';
import { ERROR_CODES, CONFIG_VERSION } from '../../contracts.js';
import {
  listAllSites,
  listPools,
  putSite,
  putPool,
  getGlobal,
  invalidateMemCache,
} from '../../config/store.js';
import { validateSite, validatePool } from '../../config/schema.js';
import { getCacheStats } from '../../platform/cache.js';

/** GET /system/info */
export async function info(ctx, global) {
  const g = global || (await getGlobal(ctx));
  return ok({
    version: CONFIG_VERSION,
    platform: ctx.caps.platform,
    caps: ctx.caps,
    statsDriver: g?.statsDriver || 'none',
    statsEnabled: !!g?.statsEnabled,
    // 边缘缓存命中率。注意：仅统计当前 isolate，实例回收后归零，
    // 用于观察趋势而非精确计量。
    cache: getCacheStats(),
    // 提示用户哪些能力在当前平台不可用，前端据此灰显对应选项
    limitations: buildLimitations(ctx),
  });
}

/** GET /system/export */
export async function exportAll(ctx) {
  const [siteResult, pools, global] = await Promise.all([
    listAllSites(ctx),
    listPools(ctx),
    getGlobal(ctx),
  ]);
  const { sites, truncated } = siteResult;

  // 导出时剥离敏感字段，避免密码哈希随配置文件外泄
  const safeGlobal = { ...global };
  delete safeGlobal.passwordHash;
  delete safeGlobal.passwordSalt;

  const payload = {
    version: CONFIG_VERSION,
    exportedAt: new Date().toISOString(),
    global: safeGlobal,
    sites,
    pools,
    // 站点数超过扫描上限时导出内容不完整。必须显式标注：
    // 备份是唯一的配置恢复手段，一份「看起来正常实则残缺」的备份比报错更危险。
    ...(truncated
      ? {
          incomplete: true,
          warning:
            '站点数量超过单次导出上限，本文件仅包含部分站点，请勿用于完整恢复',
        }
      : {}),
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="cdn-edge-gateway-config-${Date.now()}.json"`,
      'cache-control': 'no-store',
    },
  });
}

/** POST /system/import */
export async function importAll(ctx) {
  let body;
  try {
    body = await ctx.request.json();
  } catch {
    return fail(ERROR_CODES.BAD_REQUEST, '请求体不是合法的 JSON', 400);
  }

  if (!body || typeof body !== 'object') {
    return fail(ERROR_CODES.BAD_REQUEST, '配置格式不正确', 400);
  }

  const sites = Array.isArray(body.sites) ? body.sites : [];
  const pools = Array.isArray(body.pools) ? body.pools : [];

  if (sites.length === 0 && pools.length === 0) {
    return fail(ERROR_CODES.BAD_REQUEST, '配置中没有可导入的站点或源站', 400);
  }

  const errors = [];
  const imported = { sites: 0, pools: 0 };

  // 先导入源站，再导入站点，保证站点引用的源站已存在
  for (const p of pools) {
    // 需带 caps：r2 等平台相关引擎的可用性校验依赖它，缺失会误判为非法配置
    const r = validatePool(p, ctx.caps);
    if (!r.ok) {
      errors.push(`源站 ${p?.id || '(未命名)'}: ${r.errors.join('; ')}`);
      continue;
    }
    try {
      r.value.updatedAt = Date.now();
      await putPool(ctx, r.value);
      imported.pools++;
    } catch (e) {
      errors.push(`源站 ${r.value.id} 写入失败: ${e.message}`);
    }
  }

  for (const s of sites) {
    const r = validateSite(s);
    if (!r.ok) {
      errors.push(`站点 ${s?.host || '(未命名)'}: ${r.errors.join('; ')}`);
      continue;
    }
    try {
      r.value.updatedAt = Date.now();
      await putSite(ctx, r.value);
      imported.sites++;
    } catch (e) {
      errors.push(`站点 ${r.value.host} 写入失败: ${e.message}`);
    }
  }

  invalidateMemCache();

  return ok({
    imported,
    errors,
    message:
      errors.length > 0
        ? `部分导入成功，${errors.length} 项失败`
        : '全部导入成功',
  });
}

/**
 * 根据平台能力生成限制说明，供前端展示
 */
function buildLimitations(ctx) {
  const caps = ctx.caps;
  const list = [];
  if (!caps.hasEdgeCache) {
    list.push({
      key: 'edgeCache',
      message:
        '当前平台不支持边缘缓存 API，缓存将完全依赖平台自身 CDN 与 Cache-Control 响应头',
    });
  }
  if (!caps.hasSocket) {
    list.push({
      key: 'socket',
      message:
        '当前平台不支持 TCP Socket，源站引擎 socket 不可用（回源到裸 IP/非标端口/自定义 Host 需要它），将自动降级为 fetch',
    });
  }
  if (!caps.hasD1) {
    list.push({
      key: 'd1',
      message: '当前平台未绑定 D1，统计只能使用 KV 驱动',
    });
  }
  if (!caps.hasKV) {
    list.push({
      key: 'kv',
      message:
        '未检测到 KV 绑定，配置将无法持久化，当前运行在默认配置下。请先创建并绑定 KV Namespace',
    });
  }
  // JWT 密钥降级告警：未配置独立 JWT_SECRET 时，鉴权签名密钥将从 passwordHash 派生，
  // 一旦 passwordHash 因任何原因泄露（如配置导出越权），攻击者可伪造管理员 token。
  const env = (ctx && ctx.env) || {};
  if (!(typeof env.JWT_SECRET === 'string' && env.JWT_SECRET.length >= 8)) {
    list.push({
      key: 'jwtSecret',
      message:
        '未配置独立的 JWT_SECRET 环境变量，鉴权签名密钥由 passwordHash 派生（降级方案，安全性较弱）。强烈建议配置 JWT_SECRET。',
    });
  }
  return list;
}
