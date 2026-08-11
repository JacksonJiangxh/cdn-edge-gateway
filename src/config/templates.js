/**
 * ============================================================================
 * config/templates.js —— 新建站点的「场景化模板」
 * ----------------------------------------------------------------------------
 * 借鉴 EO 新建站点时的「加速类型」选择：选定场景后自动铺好该场景下
 * 一定通用的那几条规则，而不是把所有旋钮都摊开。
 *
 * 设计红线（务必遵守，别让它长成第二个配置中心）：
 *  1. **克制**：每个模板只给该场景「一定通用」的参数。凡是随业务而变的
 *     （具体路径、鉴权密钥、源站地址）一律不进模板，留给用户自己填。
 *  2. **只在新建时套用一次**：模板生成的是普通规则，落库后与手写规则完全
 *     等价。之后用户怎么改都行，系统不会再回头覆盖——即「模板不是绑定关系，
 *     只是初始脚手架」。
 *  3. **不硬编码**：模板给的是 `defaults`（建议值），前端会把它们渲染成
 *     可编辑输入框。用户改过的值优先，模板值只作为起点。
 *
 * 与 defaults.js 的分工：
 *   defaults.js  = 单个字段缺省时补什么（schema 规范化的唯一补全来源）
 *   templates.js = 新建站点时「一次性」生成哪几条规则（脚手架）
 * ============================================================================
 */

import { DEFAULT_CACHE_POLICY } from './defaults.js';

// ----------------------------------------------------------------------------
// 可调参数的元信息
// ----------------------------------------------------------------------------

/**
 * 模板暴露给用户的可调参数清单。
 *
 * 这里就是「问题2」的答案：初版硬编码在 index.js 里的那几个缓存时间，
 * 现在全部升格为**显式的、带说明的、用户可改**的参数。
 * 每项都有 default，但 UI 必须把它们渲染出来提醒用户按自己业务改，
 * 而不是藏在代码里当成不可见的魔法数字。
 *
 * unit: 's' = 秒；用于前端渲染单位与做「天/小时」换算提示。
 * @type {Readonly<Record<string, {label:string, hint:string, unit:string, min:number, max:number}>>}
 */
export const TEMPLATE_PARAM_META = Object.freeze({
  edgeTtl: Object.freeze({
    label: '边缘缓存时间',
    hint: '内容在边缘节点上保留多久。越长回源越少、越省钱，但源站更新后生效越慢。改完内容记得清缓存。',
    unit: 's',
    min: 0,
    max: 31536000,
  }),
  browserTtl: Object.freeze({
    label: '浏览器缓存时间',
    hint: '下发给访客浏览器的 max-age。浏览器缓存无法主动清除，除非文件名带版本号（如 app.a1b2c3.js），否则别设太长。填 -1 表示不改写、完全跟随源站。',
    unit: 's',
    min: -1,
    max: 31536000,
  }),
  staleWhileRevalidate: Object.freeze({
    label: '过期后宽限时间',
    hint: '边缘缓存过期后的这段时间内，先拿旧内容响应访客、同时后台悄悄回源刷新。能显著削平源站流量尖峰，设 0 关闭。',
    unit: 's',
    min: 0,
    max: 604800,
  }),
  errorTtl: Object.freeze({
    label: '错误页缓存时间',
    hint: '源站返回 4xx/5xx（400/401/403/404/405/500/502/503/504）时缓存这么久，挡住对不存在的资源或故障源站的反复穿透。几秒就够了，设 0 不缓存。',
    unit: 's',
    min: 0,
    max: 3600,
  }),
});

/** 模板参数的兜底值：模板自身没写某项时用它。 */
const BASE_PARAMS = Object.freeze({
  edgeTtl: DEFAULT_CACHE_POLICY.edgeTtl,
  browserTtl: DEFAULT_CACHE_POLICY.browserTtl,
  staleWhileRevalidate: DEFAULT_CACHE_POLICY.staleWhileRevalidate,
  errorTtl: 0,
});

// ----------------------------------------------------------------------------
// 场景模板定义
// ----------------------------------------------------------------------------

/** 常见静态资源扩展名——各模板按需取子集，避免每个模板重复一长串。 */
const EXT_ASSET = Object.freeze(['css', 'js', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'woff', 'woff2']);
const EXT_MEDIA = Object.freeze(['mp4', 'm4s', 'ts', 'm3u8', 'mpd', 'flv', 'mp3', 'aac', 'webm']);
const EXT_DOWNLOAD = Object.freeze(['zip', 'rar', '7z', 'gz', 'tar', 'apk', 'ipa', 'exe', 'dmg', 'pkg', 'iso', 'bin']);

/**
 * 站点场景模板。
 *
 * 每个模板：
 *   id/name/desc —— 展示用
 *   params       —— 该场景建议的可调参数（会渲染成输入框，用户可改）
 *   build(p)     —— 用最终参数 p 生成规则数组（p 已含用户改动）
 *
 * 注意 build 返回的规则**不带 id**，由调用方统一分配，避免此处与
 * 前端各生成一套 id 造成冲突。
 *
 * @type {ReadonlyArray<{id:string,name:string,desc:string,params:Object,tuning:string[],build:(p:Object)=>Array<Object>}>}
 */
export const SITE_TEMPLATES = Object.freeze([
  {
    id: 'blank',
    name: '空白（不预置任何规则）',
    desc: '什么都不生成，全部自己配。已经清楚要怎么配、或要从别处导入配置时选它。',
    params: {},
    tuning: [],
    build: () => [],
  },

  {
    id: 'website',
    name: '网站加速',
    desc: '通用网站 / 前后端分离站点。静态资源长缓存，HTML 与 API 不缓存，避免用户看到旧页面。',
    params: {
      edgeTtl: 2592000,      // 30 天：带指纹的静态资源可以放心长存
      browserTtl: 86400,     // 1 天：浏览器缓存清不掉，保守些
      staleWhileRevalidate: 60,
      errorTtl: 10,
    },
    tuning: ['edgeTtl', 'browserTtl', 'staleWhileRevalidate', 'errorTtl'],
    build: (p) => [
      {
        name: '静态资源长缓存',
        note: '带版本号/哈希的 css、js、图片、字体。这类文件内容一变文件名就变，所以可以放心长缓存。',
        match: { conditions: [[extCond(EXT_ASSET)]] },
        cache: {
          enabled: true,
          mode: 'ttl',
          edgeTtl: p.edgeTtl,
          browserTtl: p.browserTtl,
          staleWhileRevalidate: p.staleWhileRevalidate,
          ignoreQuery: false,
          statusTtl: statusTtlOf(p),
        },
      },
      {
        name: 'HTML 页面不缓存',
        note: 'HTML 是内容入口，一旦被缓存住，发版后用户会长时间停在旧页面。默认不缓存最安全。',
        match: { conditions: [[extCond(['html', 'htm'])]] },
        cache: { enabled: false, mode: 'noCache' },
      },
      {
        name: 'API 路径不缓存',
        note: '/api/ 下通常是动态数据、且常带登录态，缓存会导致串号等严重问题。路径前缀按你的实际情况改。',
        match: { conditions: [[prefixCond('/api/')]] },
        cache: { enabled: false, mode: 'noCache' },
      },
    ],
  },

  {
    id: 'api',
    name: 'API 加速',
    desc: '纯接口服务。默认全部不缓存，只做就近接入和链路优化；缓存交给你按具体接口逐个开。',
    params: {
      errorTtl: 0,
    },
    tuning: ['errorTtl'],
    build: (p) => [
      {
        name: '全站不缓存（API 默认）',
        note: 'API 响应大多与用户身份相关，默认一律不缓存。若某些接口（如公共配置、字典表）确实可缓存，请单独加一条更高优先级的规则放行。',
        match: {},
        cache: { enabled: false, mode: 'noCache', statusTtl: statusTtlOf(p) },
      },
    ],
  },

  {
    id: 'media',
    name: '音视频流媒体',
    desc: '点播 / HLS / DASH。分片长缓存，索引清单短缓存，保证能及时切换码率与更新节目。',
    params: {
      edgeTtl: 86400,        // 分片内容不可变，1 天
      browserTtl: 3600,
      staleWhileRevalidate: 30,
      errorTtl: 5,
    },
    tuning: ['edgeTtl', 'browserTtl', 'staleWhileRevalidate', 'errorTtl'],
    build: (p) => [
      {
        name: '媒体分片长缓存',
        note: 'ts / m4s / mp4 等分片一旦生成就不再变化，适合长缓存，这是流媒体省带宽的关键。',
        match: { conditions: [[extCond(EXT_MEDIA.filter((e) => e !== 'm3u8' && e !== 'mpd'))]] },
        cache: {
          enabled: true,
          mode: 'ttl',
          edgeTtl: p.edgeTtl,
          browserTtl: p.browserTtl,
          staleWhileRevalidate: p.staleWhileRevalidate,
          ignoreQuery: false,
          statusTtl: statusTtlOf(p),
        },
      },
      {
        name: '索引清单短缓存',
        note: 'm3u8 / mpd 是播放列表，直播或更新中的点播会不断变化。只缓存几秒，既挡住高并发又不影响更新。',
        match: { conditions: [[extCond(['m3u8', 'mpd'])]] },
        cache: {
          enabled: true,
          mode: 'ttl',
          edgeTtl: 3,
          browserTtl: 0,
          staleWhileRevalidate: 0,
          ignoreQuery: false,
        },
      },
    ],
  },

  {
    id: 'download',
    name: '大文件下载',
    desc: '安装包 / 镜像 / 静态归档。内容基本不可变，用最长缓存把回源压到最低。',
    params: {
      edgeTtl: 15552000,     // 180 天
      browserTtl: 86400,
      staleWhileRevalidate: 300,
      errorTtl: 10,
    },
    tuning: ['edgeTtl', 'browserTtl', 'staleWhileRevalidate', 'errorTtl'],
    build: (p) => [
      {
        name: '下载文件长缓存',
        note: '安装包这类文件发布后通常不再修改（改了一般也是换新版本号），适合最长缓存。',
        match: { conditions: [[extCond(EXT_DOWNLOAD)]] },
        cache: {
          enabled: true,
          mode: 'ttl',
          edgeTtl: p.edgeTtl,
          browserTtl: p.browserTtl,
          staleWhileRevalidate: p.staleWhileRevalidate,
          ignoreQuery: true,
          statusTtl: statusTtlOf(p),
        },
      },
    ],
  },
]);

// ----------------------------------------------------------------------------
// 工具
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// match 快捷条件 → 二维 conditions 的桥接
// ----------------------------------------------------------------------------
// 早期模板生成的是快捷条件（extIn / pathPrefix），但前端规则编辑器与流量序列
// 只认 `match.conditions` 二维数组，导致模板生成的规则在 UI 上「匹配条件 0 项 /
// 匹配全部请求」，名字和规则对不上。这里统一产出 conditions 格式，前后端一致。
/** 扩展名列表 → 一个 extension 等于条件（多值之间为「或」）。 */
function extCond(exts) {
  return { target: 'extension', op: 'equal', ignoreCase: true, values: exts.map((e) => String(e).toLowerCase().replace(/^\./, '')) };
}
/** 路径前缀 → 一个 path 前缀为条件。 */
function prefixCond(p) {
  return { target: 'path', op: 'prefix', ignoreCase: true, values: [p] };
}

/**
 * 由「错误页缓存时间」参数生成 statusTtl 映射，覆盖 400-599 常见状态码。
 * 值为 0 的项直接不写入——0 在 statusTtl 里语义含糊（缓存 0 秒 ≈ 不缓存），
 * 省略掉可让最终配置更干净，也更贴合「克制」原则。
 * @param {Object} p 最终参数
 * @returns {Record<string, number>}
 */
function statusTtlOf(p) {
  const ttl = Number(p?.errorTtl) || 0;
  if (ttl <= 0) return {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const c of [400, 401, 403, 404, 405, 500, 502, 503, 504]) out[String(c)] = ttl;
  return out;
}

/**
 * 按 id 取模板。
 * @param {string} id
 * @returns {Object|null}
 */
export function getTemplate(id) {
  return SITE_TEMPLATES.find((t) => t.id === id) || null;
}

/**
 * 取模板的建议参数（已用 BASE_PARAMS 补齐缺项）。
 * 前端拿它渲染可编辑输入框。
 * @param {string} id
 * @returns {Record<string, number>}
 */
export function templateParams(id) {
  const t = getTemplate(id);
  if (!t) return {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of t.tuning || []) {
    out[k] = t.params[k] !== undefined ? t.params[k] : BASE_PARAMS[k];
  }
  return out;
}

/**
 * 套用模板，生成规则数组。
 *
 * 只在新建站点时调用一次；生成的规则之后就是普通规则，用户改动不会被覆盖。
 *
 * @param {string} id 模板 id
 * @param {Record<string, number>} [overrides] 用户在 UI 上改过的参数（优先级最高）
 * @returns {Array<Object>} 规则数组（结构对齐 contracts.js 的 Rule，交由 schema 规范化）
 */
export function applyTemplate(id, overrides) {
  const t = getTemplate(id);
  if (!t || typeof t.build !== 'function') return [];

  // 参数优先级：用户改动 > 模板建议 > 全局兜底
  const params = { ...BASE_PARAMS, ...templateParams(id) };
  if (overrides && typeof overrides === 'object') {
    for (const [k, v] of Object.entries(overrides)) {
      const n = Number(v);
      if (Number.isFinite(n)) params[k] = n;
    }
  }

  const specs = t.build(params) || [];
  return specs.map((spec, i) => ({
    // priority 从 10 起步、步长 10：给用户留出往中间插自己规则的空间，
    // 不至于一加规则就得把整串重排。
    id: `tpl-${id}-${i + 1}`,
    priority: (i + 1) * 10,
    enabled: true,
    name: spec.name || '',
    note: spec.note || '',
    match: spec.match || {},
    action: {
      cache: { ...DEFAULT_CACHE_POLICY, ...(spec.cache || {}) },
    },
  }));
}

/**
 * 供前端渲染选择器用的精简清单（不含 build 函数，可安全 JSON 序列化）。
 * @returns {Array<{id:string,name:string,desc:string,params:Object,tuning:string[]}>}
 */
export function listTemplates() {
  return SITE_TEMPLATES.map((t) => {
    const params = templateParams(t.id);
    return {
      id: t.id,
      name: t.name,
      desc: t.desc,
      tuning: [...(t.tuning || [])],
      params,
      // 先用建议参数跑一遍 build，得到该模板会生成几条规则，
      // 前端据此提示「将生成 N 条规则」，让用户选之前就心里有数。
      ruleCount: (t.build(params) || []).length,
    };
  });
}
