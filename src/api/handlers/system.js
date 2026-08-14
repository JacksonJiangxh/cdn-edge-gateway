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
  putGlobal,
  getGlobalRules,
  putGlobalRules,
  invalidateMemCache,
} from '../../config/store.js';
import { validateSite, validatePool } from '../../config/schema.js';
import { getCacheStats } from '../../platform/cache.js';
import { isBakedMode } from '../../config/store.js';

/** GET /system/info */
export async function info(ctx, global) {
  const g = global || (await getGlobal(ctx));
  const baked = isBakedMode(ctx);
  return ok({
    version: CONFIG_VERSION,
    platform: ctx.caps.platform,
    caps: ctx.caps,
    kvBackend: baked ? 'baked' : ctx.caps.kvBackend || 'none',
    redisConfigured: !!(ctx.env && (ctx.env.REDIS_URL || ctx.env.REDIS_URL_KV)),
    bakedMode: baked,
    // 配置来源形态：baked=静态烘焙（只读，来自主节点导出）、kv=运行时 KV/Redis、defaults=无配置回退。
    configMode: baked ? 'baked' : ctx.caps.kvBackend === 'none' ? 'defaults' : 'kv',
    statsDriver: g?.statsDriver || 'none',
    statsEnabled: !!g?.statsEnabled,
    // 边缘缓存命中率。注意：仅统计当前 isolate，实例回收后归零，
    // 用于观察趋势而非精确计量。
    cache: getCacheStats(),
    // 提示用户哪些能力在当前平台不可用，前端据此灰显对应选项
    limitations: buildLimitations(ctx),
  });
}

/**
 * 构建完整配置镜像（纯数据，不含 HTTP 语义）。
 *
 * 这是「配置导出」与「配置同步推送」的**唯一真相源**：两条链路必须产出完全一致的
 * 镜像结构，否则同步过去的配置会与备份文件语义漂移。因此本函数被抽离为可复用核心，
 * 由 exportAll（下载文件）与 sync.js（跨平台推送）共同调用。
 *
 * 镜像内容 = global + globalRules + 全部站点 + 全部源站池。
 * 其中 globalRules（全站兜底规则）是旧版导出遗漏的部分——它同样属于「完整配置」，
 * 缺失会导致同步后目标端兜底行为与源端不一致，故在此一并纳入。
 *
 * 安全：始终剥离 passwordHash / passwordSalt。镜像会落地成文件、也会跨公网传输，
 * 密码哈希一旦外泄，在未配置 JWT_SECRET 的部署上可被用于伪造管理员 token
 * （见 buildLimitations 的 jwtSecret 告警）。
 *
 * @param {import('../../contracts.js').Ctx} ctx
 * @returns {Promise<{payload:Object, truncated:boolean}>}
 *   payload 为镜像本体；truncated 表示站点数超出单次扫描上限、镜像不完整
 */
export async function buildConfigMirror(ctx) {
  const [siteResult, pools, global, globalRules] = await Promise.all([
    listAllSites(ctx),
    listPools(ctx),
    getGlobal(ctx),
    getGlobalRules(ctx),
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
    globalRules,
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

  return { payload, truncated };
}

/** GET /system/export */
export async function exportAll(ctx) {
  const { payload } = await buildConfigMirror(ctx);

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="cdn-edge-gateway-config-${Date.now()}.json"`,
      'cache-control': 'no-store',
    },
  });
}

/**
 * 应用一份配置镜像（纯数据，不含 HTTP 语义）。
 *
 * 与 buildConfigMirror 对称，是「配置导入」与「配置同步接收」的唯一真相源。
 * 所有写入都必须经 validatePool / validateSite / putGlobal / putGlobalRules 这些
 * 既有的统一校验入口，**禁止裸写 KV**——否则会绕过 schema 规范化，写进无法被
 * 管理面正确读取的脏配置。
 *
 * 写入顺序：源站池 → 站点 → 全局 → 全站规则。先源站后站点是硬性要求，
 * 保证站点引用的 poolId 在落盘时已存在。
 *
 * 容错策略：单条配置校验/写入失败只累计到 errors 并继续处理其余条目（部分成功优于
 * 全盘失败——同步/恢复场景下用户更需要「尽可能多恢复 + 明确告知哪几条坏了」）。
 *
 * @param {import('../../contracts.js').Ctx} ctx
 * @param {Object} body 镜像数据（形如 buildConfigMirror 的 payload）
 * @param {{includeGlobal?:boolean}} [options]
 *        includeGlobal 是否一并导入 global / globalRules。
 *        默认 false：手工导入沿用旧行为（仅站点+源站），避免用户误把
 *        备份里的 adminPath 等全局项覆盖掉当前环境而把自己锁在管理面之外。
 *        配置同步要求「完整镜像」，故由 sync.js 显式传 true。
 * @returns {Promise<{imported:{sites:number,pools:number,global:boolean,globalRules:boolean}, errors:string[]}>}
 */
export async function applyConfigMirror(ctx, body, options = {}) {
  const includeGlobal = options.includeGlobal === true;

  const sites = Array.isArray(body.sites) ? body.sites : [];
  const pools = Array.isArray(body.pools) ? body.pools : [];

  const errors = [];
  const imported = { sites: 0, pools: 0, global: false, globalRules: false };

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

  if (includeGlobal && body.global && typeof body.global === 'object') {
    try {
      // 关键：镜像中不含密码哈希（导出时已剥离），必须保留**本机**的密码凭据，
      // 否则同步一次就会把接收方管理员密码清空、任何人都能登录（或谁都登不进去）。
      const current = await getGlobal(ctx);
      const merged = {
        ...body.global,
        passwordHash: current.passwordHash || '',
        passwordSalt: current.passwordSalt || '',
      };
      await putGlobal(ctx, merged);
      imported.global = true;
    } catch (e) {
      errors.push(`全局配置写入失败: ${e.message}`);
    }
  }

  if (includeGlobal && body.globalRules && typeof body.globalRules === 'object') {
    try {
      const r = await putGlobalRules(ctx, body.globalRules.stages);
      if (r.ok) {
        imported.globalRules = true;
      } else {
        errors.push(`全站规则: ${(r.errors || []).join('; ')}`);
      }
    } catch (e) {
      errors.push(`全站规则写入失败: ${e.message}`);
    }
  }

  invalidateMemCache();

  return { imported, errors };
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

  const { imported, errors } = await applyConfigMirror(ctx, body);

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
  } else if (caps.cacheIsNodeLocal) {
    list.push({
      key: 'edgeCache',
      message:
        'EdgeOne 的 caches.default 仅当前边缘节点本地有效、不跨节点复制。命中率随请求分散到不同节点而降低，必要时可用「同站 fetch 委托节点缓存」(路径 A) 提升命中。',
    });
  } else if (caps.cacheSingleInstance) {
    list.push({
      key: 'edgeCache',
      message:
        '阿里云 ESA 提供全局 cache 单实例（非 caches.default）。Cache 操作与 fetch 共享 32 子请求硬上限，且 cache.put 的 key 必须为 http URL。',
    });
  }
  if (!caps.hasRawIpFetch) {
    list.push({
      key: 'rawIpFetch',
      message:
        '当前平台不支持 fetch 直连裸 IP / 自定义端口 / 自定义 SNI（如 EdgeOne、ESA）。' +
        '回源到裸 IP 源站须走平台侧源站组兜底；自定义回源 Host 头仍可用。',
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
  // 后端为自部署 Redis（Webdis）时，给出明确的部署形态说明，避免用户误以为缺失。
  if (caps.kvBackend === 'redis') {
    list.push({
      key: 'kvRedis',
      message:
        '当前使用自部署 Redis（Webdis）作为 KV 后端：未依赖平台 KV 绑定，配置持久化在您自己的 Redis 实例中。请在「系统信息 → Redis 存储」中测试连通性。',
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
