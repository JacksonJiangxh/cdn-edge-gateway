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
  isBakedMode,
} from '../../config/store.js';
import { validateSite, validatePool } from '../../config/schema.js';
import { getCacheStats } from '../../platform/cache.js';

/** GET /system/info */
export async function info(ctx, global) {
  const g = global || (await getGlobal(ctx));
  const baked = isBakedMode(ctx);
  return ok({
    version: CONFIG_VERSION,
    platform: ctx.caps.platform,
    caps: ctx.caps,
    // 当前生效后端：baked（静态烘焙只读）/ native（平台 KV）/ redis（自部署 Webdis）/ none
    kvBackend: baked ? 'baked' : ctx.caps.kvBackend || 'none',
    // 双后端各自的存在性 —— 供管理面分别展示可用性标记（两者可同时为 true）
    kvNative: !!ctx.caps.kvNative,
    kvRedis: !!ctx.caps.kvRedis,
    // KV_BACKEND 偏好（auto=默认自部署 Webdis 优先）与是否覆盖了默认决策
    kvBackendPreference: ctx.caps.kvBackendPreference || 'auto',
    kvBackendOverridden: !!ctx.caps.kvBackendOverridden,
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
 * @param {{includeGlobal?:boolean|{global?:boolean,globalRules?:boolean}}} [options]
 *        includeGlobal 是否一并导入 global / globalRules。
 *        - 布尔 true：同时导入二者（配置同步使用，要求「完整镜像」）。
 *        - 布尔 false / 缺省：手工导入沿用旧行为（仅站点+源站），避免用户误把
 *          备份里的 adminPath 等全局项覆盖掉当前环境而把自己锁在管理面之外。
 *        - 对象 {global, globalRules}：分别控制（手工导入 UI 的两个开关），
 *          缺省每个子项均为 false（即默认不恢复全局与全站规则，兼顾安全）。
 * @returns {Promise<{imported:{sites:number,pools:number,global:boolean,globalRules:boolean}, errors:string[]}>}
 */
export async function applyConfigMirror(ctx, body, options = {}) {
  // includeGlobal 支持两种形态：
  //   布尔 true  → 同时导入 global + globalRules（配置同步的完整镜像）
  //   对象 {global, globalRules} → 分别控制（手工导入 UI 的两个开关）
  //   缺省/布尔 false → 仅站点+源站，避免误覆盖本机 adminPath 而锁死管理面
  const inc = options.includeGlobal;
  const isObj = typeof inc === 'object' && inc !== null;
  const includeGlobalFlag = inc === true || (isObj && !!inc.global);
  const includeGlobalRulesFlag = inc === true || (isObj && !!inc.globalRules);

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

  if (includeGlobalFlag && body.global && typeof body.global === 'object') {
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

  if (includeGlobalRulesFlag && body.globalRules && typeof body.globalRules === 'object') {
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

  // 版本兼容校验：导出文件结构版本与当前节点不一致时给出明确告警，
  // 不静默丢字段（旧格式可能缺字段，新字段被忽略）。
  let versionWarning = '';
  if (body.version && typeof body.version === 'string') {
    if (body.version !== CONFIG_VERSION) {
      versionWarning = `导出文件版本为 ${body.version}，当前节点为 ${CONFIG_VERSION}，结构可能不兼容，部分字段可能未被导入`;
    }
  } else {
    versionWarning = `导出文件缺少 version 字段，当前节点为 ${CONFIG_VERSION}，结构可能不兼容，建议从同版本节点导出`;
  }

  // 透传 includeGlobal：支持布尔（true=完整镜像）或对象（分别控制全局/全站规则）。
  // 缺省不恢复全局与全站规则，沿用旧行为以防误覆盖本机 adminPath 等把自己锁在管理面外。
  const includeGlobal = body.includeGlobal;

  const { imported, errors } = await applyConfigMirror(ctx, body, { includeGlobal });

  return ok({
    imported,
    errors,
    versionWarning,
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
        'EdgeOne 的 caches.default 仅当前边缘节点本地有效、不跨节点复制。命中率随请求分散到不同节点而降低，必要时可用「同站 fetch 委托节点缓存」（即 eoEdgeCache）提升命中。',
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
        '当前平台（ESA）不支持 fetch 直连裸 IP / 自定义端口。' +
        'Cloudflare 与 EdgeOne 的 fetch 均支持直连裸 IP（EO 官方文档未禁止裸 IP）；' +
        '仅 ESA 因官方限制须把裸 IP 源站走平台侧源站组兜底。自定义回源 Host 头三平台均可用。',
    });
  }
  if (!caps.hasD1) {
    list.push({
      key: 'd1',
      message:
        '当前平台未绑定 D1：统计落盘只支持 D1，无 D1 时统计功能不可用（不会回退 KV 写入）。如需统计请绑定 D1，或将 statsDriver 设为 none。',
    });
  }
  // 持久化可用性告警：区分「静态烘焙只读」「双后端并存」「仅其一」「都无」四种形态，
  // 避免在已有可用后端（尤其是自部署 Webdis）时误报「未检测到 KV」。
  const bakedRO = isBakedMode(ctx);
  if (bakedRO) {
    list.push({
      key: 'kvBaked',
      message:
        '当前运行在「静态烘焙配置」只读模式（STATIC_CONFIG=1）：配置来自构建时内置的镜像，' +
        '管理面无法保存修改。如需在本节点可写，请配置 REDIS_URL（自部署 Webdis）或显式设置 STATIC_CONFIG=0。',
    });
  } else if (!caps.hasKV) {
    list.push({
      key: 'kv',
      message:
        '未检测到任何 KV 后端（平台 KV 绑定 或 自部署 Webdis 的 REDIS_URL），配置将无法持久化，' +
        '当前运行在默认配置下。请创建并绑定 KV Namespace，或配置 REDIS_URL 指向自建 Webdis。',
    });
  } else if (caps.kvNative && caps.kvRedis) {
    // 双后端并存：明确告知谁在生效、如何切换，避免用户误判「平台 KV 失效」
    list.push({
      key: 'kvDual',
      message:
        `平台 KV 与自部署 Webdis 同时可用，当前生效后端为「${caps.kvBackend === 'redis' ? '自部署 Webdis' : '平台 KV'}」` +
        `${caps.kvBackendOverridden ? '（由环境变量 KV_BACKEND 显式指定）' : '（默认优先自部署 Webdis）'}。` +
        '如需切换，请将环境变量 KV_BACKEND 设为 native（平台 KV）或 redis（自部署 Webdis）后重新部署。' +
        '注意：两端数据不会自动迁移，切换后原后端中的配置不可见。',
    });
  } else if (caps.kvBackend === 'redis') {
    list.push({
      key: 'kvRedis',
      message:
        '当前使用自部署 Redis（Webdis）作为 KV 后端：未依赖平台 KV 绑定，配置持久化在您自己的 Redis 实例中。请在「系统信息 → KV 存储后端」中测试连通性。',
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
