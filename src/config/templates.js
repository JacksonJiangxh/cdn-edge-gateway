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
// 阶段字典权威源：action→stage 唯一映射，与前端 web/app.js 的 STAGE_OPS 同构
// （前端因浏览器端无打包无法 import，由 build.mjs 做一致性断言）。模板侧直接复用，
// 杜绝「改一处漏一处」的越界复发。

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
    hint: '内容在边缘节点上保留多久。越长回源越少、越省钱，但源站更新后生效越慢。这是相对全站默认基线（cache.enabled=true、edgeTtl=86400）的「覆盖值」——模板只针对匹配到的资源改这个值，其余请求仍走全站默认。改完内容记得清缓存。',
    unit: 's',
    min: 0,
    max: 31536000,
  }),
  browserTtl: Object.freeze({
    label: '浏览器缓存时间',
    hint: '下发给访客浏览器的 max-age。浏览器缓存无法主动清除，除非文件名带版本号（如 app.a1b2c3.js），否则别设太长。填 -1 表示不改写、完全跟随源站。同样相对全站默认基线（browserTtl=3600）做覆盖。',
    unit: 's',
    min: -1,
    max: 31536000,
  }),
  staleWhileRevalidate: Object.freeze({
    label: '过期后宽限时间',
    hint: '边缘缓存过期后的这段时间内，先拿旧内容响应访客、同时后台悄悄回源刷新。能显著削平源站流量尖峰，设 0 关闭。相对全站默认基线（staleWhileRevalidate=3600）做覆盖。',
    unit: 's',
    min: 0,
    max: 604800,
  }),
  errorTtl: Object.freeze({
    label: '错误页缓存时间',
    hint: '给 4xx/5xx 错误页也加短暂边缘缓存，挡住对不存在资源或故障源站的反复穿透。底层直接生成 statusTtl 的「4xx/5xx 段通配 → 该秒数」（项目字段已原生支持段通配与 ! 例外，无需逐码枚举）。几秒就够了，设 0 不缓存（回落到全站默认的 4xx/5xx/52x 不缓存基线）。',
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

/**
 * 常见静态资源扩展名——各模板按需取子集，避免每个模板重复一长串。
 * 清单对齐 EO「网站加速」模板的静态后缀全集（约 65 种），比旧版 11 种覆盖更全，
 * 让「静态资源长缓存」规则能兜住文档/音视频/字体/压缩包等更多类型。
 */
const EXT_ASSET = Object.freeze([
  '7z', 'avi', 'avif', 'apk', 'bin', 'bmp', 'bz2', 'class', 'css', 'csv',
  'doc', 'docx', 'dmg', 'ejs', 'eot', 'eps', 'exe', 'flac', 'gif', 'gz',
  'ico', 'iso', 'jar', 'jpg', 'jpeg', 'js', 'mid', 'midi', 'mkv', 'mp3',
  'mp4', 'ogg', 'otf', 'pdf', 'pict', 'pls', 'png', 'ppt', 'pptx', 'ps',
  'rar', 'svg', 'svgz', 'swf', 'tar', 'tif', 'tiff', 'ttf', 'webm', 'webp',
  'woff', 'woff2', 'xls', 'xlsx', 'zip', 'zst',
]);
/** 动态语言/脚本扩展名——永远不该被缓存（EO「网站加速 / WordPress」均显式 NoCache）。 */
const EXT_DYNAMIC = Object.freeze(['php', 'jsp', 'asp', 'aspx', 'do', 'dwr', 'cgi', 'fcgi', 'action', 'ashx', 'axd']);

/**
 * 用户给出的「全部常见静态后缀」全集——前端规则编辑器的「文件后缀 / 后缀为」
 * 候选值、以及所有场景模板「静态资源长缓存」规则的默认值都来自这里。
 *
 * 设计意图（回应用户诉求）：模板默认就铺「所有常见静态后缀」，而不是只取某个
 * 子类（如仅媒体、仅下载）。媒体清单（m3u8/mpd 等）与下载清单是其中的子集，
 * 模板需要「短缓存特例」时（如 m3u8/mpd）再做排除，而不是反过来把全集裁剪掉。
 *
 * 此全集即 EXT_ASSET，集中在此导出，避免前端与后端各持一份、改一处漏一处。
 */
export const EXTENSION_PRESETS = EXT_ASSET;

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
      // 30 天：带指纹的静态资源可以放心长存
      edgeTtl: 2592000,
      // 1 天：浏览器缓存清不掉，保守些
      browserTtl: 86400,
      staleWhileRevalidate: 60,
      errorTtl: 10,
    },
    tuning: ['edgeTtl', 'browserTtl', 'staleWhileRevalidate', 'errorTtl'],
    build: (p) => [
      {
        name: '静态资源长缓存',
        note: '带版本号/哈希的 css、js、图片、字体等。内容一变文件名就变，可放心长缓存。',
        match: { conditions: [[extCond(EXT_ASSET)]] },
        cache: {
          enabled: true,
          mode: 'ttl',
          edgeTtl: p.edgeTtl,
          browserTtl: p.browserTtl,
          staleWhileRevalidate: p.staleWhileRevalidate,
          // 借鉴 EO「网站加速」CacheKey：忽略查询串，避免 ?t=1 / ?v=2 之类产生无意义的缓存碎片。
          // 带指纹的资源文件名本身已区分版本，忽略查询串不会命中错误内容。
          ignoreQuery: true,
          // 以下均为显式写出，不依赖全站默认值——用户可直接在这里改，无需查文档：
          statusTtl: statusTtlOf(p),
          preRefresh: true,
          preRefreshPercent: 80,
          offlineCache: true,
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
      {
        // 借鉴 EO「网站加速」子规则：php/jsp/asp/aspx 等动态脚本一律不缓存，
        // 避免把带登录态的渲染结果误当成静态资源缓存住。
        name: '动态脚本不缓存',
        note: 'php/jsp/asp/aspx 等后端脚本输出的是实时渲染结果（常含用户态），缓存会串号或暴露他人数据。',
        match: { conditions: [[extCond(EXT_DYNAMIC)]] },
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
    // EO 同款模板还开了 SmartRouting（智能路由/Argo），就近选最优回源链路降低延迟。
    // 本项目 RuleAction 契约目前无该字段，待扩契约后可在规则动作里加 smartRouting 开关。
  },

  {
    id: 'media',
    name: '音视频流媒体',
    desc: '点播 / HLS / DASH。分片长缓存，索引清单短缓存，保证能及时切换码率与更新节目。',
    params: {
      // 分片内容不可变，1 天
      edgeTtl: 86400,
      browserTtl: 3600,
      staleWhileRevalidate: 30,
      errorTtl: 5,
    },
    tuning: ['edgeTtl', 'browserTtl', 'staleWhileRevalidate', 'errorTtl'],
    build: (p) => [
      {
        name: '媒体分片长缓存',
        note: 'ts / m4s / mp4 等分片一旦生成就不再变化，适合长缓存，这是流媒体省带宽的关键。',
        match: { conditions: [[extCond(EXTENSION_PRESETS.filter((e) => e !== 'm3u8' && e !== 'mpd'))]] },
        cache: {
          enabled: true,
          mode: 'ttl',
          edgeTtl: p.edgeTtl,
          browserTtl: p.browserTtl,
          staleWhileRevalidate: p.staleWhileRevalidate,
          // 流媒体分片常带 ?key= / ?token= 鉴权，必须按完整 URL 区分缓存（覆盖全站默认 ignoreQuery=true）
          ignoreQuery: false,
          statusTtl: statusTtlOf(p),
          // 大文件分片不做预刷新（避免无谓回源浪费带宽）、不做断网兜底（过期媒体不可用体验更差）
          preRefresh: false,
          preRefreshPercent: 80,
          offlineCache: false,
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
          // 清单即时性强，错误页不缓存（回落全站 4xx/5xx/52x:0 基线，此处不写 statusTtl）
          statusTtl: {},
          preRefresh: false,
          preRefreshPercent: 80,
          offlineCache: false,
        },
      },
      {
        // 借鉴 EO「音视频直播」的兜底分支：除上述分片/清单外的其它请求，
        // 统一「跟随源站」缓存策略，避免在模板里漏掉不该缓存的动态请求。
        name: '其余请求跟随源站',
        note: '未匹配到具体媒体扩展名的请求，按源站返回的 Cache-Control 决定缓存，不强行套用模板时间。',
        match: {},
        cache: { enabled: true, mode: 'origin' },
      },
    ],
  },

  {
    id: 'download',
    name: '大文件下载',
    desc: '安装包 / 镜像 / 静态归档。内容基本不可变，用最长缓存把回源压到最低。',
    params: {
      // 180 天
      edgeTtl: 15552000,
      browserTtl: 86400,
      staleWhileRevalidate: 300,
      errorTtl: 10,
    },
    tuning: ['edgeTtl', 'browserTtl', 'staleWhileRevalidate', 'errorTtl'],
    build: (p) => [
      {
        name: '下载文件长缓存',
        note: '安装包这类文件发布后通常不再修改（改了一般也是换新版本号），适合最长缓存。',
        match: { conditions: [[extCond(EXTENSION_PRESETS)]] },
        cache: {
          enabled: true,
          mode: 'ttl',
          edgeTtl: p.edgeTtl,
          browserTtl: p.browserTtl,
          staleWhileRevalidate: p.staleWhileRevalidate,
          // 下载链接常带签名 / 鉴权查询串（?token=xxx&expires=123），必须按完整 URL
          // 区分缓存——忽略查询串会把不同签名的私密文件当成同一份缓存，导致签名失效或越权。
          // 全站默认 ignoreQuery=true 在此显式翻转为 false。
          ignoreQuery: false,
          statusTtl: statusTtlOf(p),
          preRefresh: true,
          preRefreshPercent: 80,
          offlineCache: true,
        },
      },
      {
        // 借鉴 EO「大文件下载」把 php/jsp/asp/aspx 显式 NoCache：即便套用了下载模板，
        // 动态脚本也绝不能被当成可缓存的静态文件。
        name: '动态脚本不缓存',
        note: 'php/jsp/asp/aspx 等后端脚本实时渲染，缓存会串号。',
        match: { conditions: [[extCond(EXT_DYNAMIC)]] },
        cache: { enabled: false, mode: 'noCache' },
      },
    ],
    // EO 同款模板还有 RangeOriginPull（分片回源），用于大文件断点续传时只回源缺失分片、
    // 而非整文件拉取。本项目的 CachePolicy 契约目前无该字段，运行时已天然支持 Range 透传
    // （见 FORWARD_HEADER_WHITELIST 含 range），但「仅回源缺失分片」的优化待扩契约后落地。
  },

  {
    // 对齐 EO「WordPress 建站」模板：
    //   - 静态类扩展名长缓存（图片/样式/脚本/字体/压缩包等）
    //   - 首页 /wp-admin/ 动态后缀一律不缓存（后台与登录态不能缓存）
    id: 'wordpress',
    name: 'WordPress 建站',
    desc: 'WP 站点。静态资源长缓存省带宽，后台、首页与动态脚本不缓存，避免登录态串号与发版看不到更新。',
    params: {
      // 60 天：WP 静态资源多带 ?ver= 查询，较长也安全
      edgeTtl: 5184000,
      // 7 天
      browserTtl: 604800,
      staleWhileRevalidate: 300,
      errorTtl: 10,
    },
    tuning: ['edgeTtl', 'browserTtl', 'staleWhileRevalidate', 'errorTtl'],
    build: (p) => [
      {
        name: '静态资源长缓存',
        note: 'WP 上传的图片、主题样式/脚本、字体、压缩包等。内容发布后基本不变，适合长缓存。',
        // 复用全局静态后缀全集（与 website 模板一致，覆盖文档/音视频/字体等更多类型）
        match: { conditions: [[extCond(EXT_ASSET)]] },
        cache: {
          enabled: true,
          mode: 'ttl',
          edgeTtl: p.edgeTtl,
          browserTtl: p.browserTtl,
          staleWhileRevalidate: p.staleWhileRevalidate,
          // 同 website：WP 资源多带 ?ver= 版本号，忽略查询串安全
          ignoreQuery: true,
          statusTtl: statusTtlOf(p),
          preRefresh: true,
          preRefreshPercent: 80,
          offlineCache: true,
        },
      },
      {
        name: '首页不缓存',
        note: 'WP 首页是聚合动态内容，发新文章后需要尽快更新，缓存会延迟展示。',
        match: { conditions: [[{ target: 'path', op: 'equal', ignoreCase: true, values: ['/'] }]] },
        cache: { enabled: false, mode: 'noCache' },
      },
      {
        name: '后台不缓存',
        note: '/wp-admin/ 是管理后台，含登录态与实时操作，缓存会串号或卡在旧页面。',
        match: { conditions: [[prefixCond('/wp-admin/')]] },
        cache: { enabled: false, mode: 'noCache' },
      },
      {
        name: '动态脚本不缓存',
        note: 'php/asp/jsp 等后端脚本实时渲染，缓存会串号或暴露他人数据。',
        match: { conditions: [[extCond(EXT_DYNAMIC)]] },
        cache: { enabled: false, mode: 'noCache' },
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
 * 由「错误页缓存时间」参数生成 statusTtl 映射。
 *
 * 直接利用项目 statusTtl 字段原生支持的「段通配」能力（4xx/5xx/52x，
 * 见 contracts.js 的 STATUS_PATTERN_RE），一次性覆盖整段错误码，而非逐个
 * 枚举 400/401/403/404… 这类易遗漏、难维护的清单。新增状态码天然命中段，
 * 无需回头补枚举。
 *
 * 语义对齐全站默认：全站 cache 阶段默认 `{'4xx':0,'5xx':0,'52x':0}`（错误码一律
 * 不缓存）。此处用 `{'4xx':ttl,'5xx':ttl}` 给错误页**开**短暂缓存（挡穿透），
 * 属于对全站基线的「精细正向覆盖」，52x 仍保持不缓存（边缘网关扩展错误码，缓存意义低）。
 *
 * 值为 0 时返回 {} —— 不写任何项，回落到全站默认的「错误码不缓存」基线，
 * 让最终配置更干净，也避免与全站默认值产生重复声明。
 * @param {Object} p 最终参数
 * @returns {Record<string, number>}
 */
function statusTtlOf(p) {
  const ttl = Number(p?.errorTtl) || 0;
  if (ttl <= 0) return {};
  return Object.freeze({ '4xx': ttl, '5xx': ttl });
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
  return specs.map((spec, i) => {
    const action = {
      cache: { ...DEFAULT_CACHE_POLICY, ...(spec.cache || {}) },
    };
    // 阶段索引字段：模板规则只含 cache 动作，硬归属 cache 阶段（写死，不反推）。
    // 落库即带 stage，后续流量序列渲染 / 抽屉归属 / 合并落库 全链路以它为准。
    const stage = 'cache';
    return {
      // priority 从 10 起步、步长 10（顺序 1 最先、数字越大越靠后）：
      // 给用户留出往中间插自己规则的空间，不至于一加规则就得把整串重排。
      id: `tpl-${id}-${i + 1}`,
      priority: (i + 1) * 10,
      enabled: true,
      name: spec.name || '',
      note: spec.note || '',
      match: spec.match || {},
      stage,
      action,
    };
  });
}

/**
 * 供前端渲染选择器用的精简清单（不含 build 函数，可安全 JSON 序列化）。
 * @returns {Array<{id:string,name:string,desc:string,params:Object,tuning:string[]}>}
 */
export function listTemplates() {
  return SITE_TEMPLATES.map((t) => {
    const params = templateParams(t.id);
    // 用建议参数跑一遍 build，产出该模板「开箱即用」的标准规则（Rule[]），
    // 结构与用户在「流量序列 → 规则」里手动添加的完全一致。前端拿到后可直接
    // 通过流量序列的规则接口（saveRules）提交，无需任何模板专属落库逻辑。
    const rules = applyTemplate(t.id, params);
    return {
      id: t.id,
      name: t.name,
      desc: t.desc,
      tuning: [...(t.tuning || [])],
      params,
      // 前端据此提示「将生成 N 条规则」，让用户选之前就心里有数。
      ruleCount: rules.length,
      // 现成的标准规则：用户不改参数时直接走 saveRules；改了参数则调
      // generateTemplateRules 重新生成后再提交。二者落库都走流量序列规则接口。
      rules,
    };
  });
}
