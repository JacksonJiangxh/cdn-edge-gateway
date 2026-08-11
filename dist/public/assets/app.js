/**
 * ============================================================================
 * API 客户端封装
 * ----------------------------------------------------------------------------
 * 所有接口前缀 /{adminPath}/api，adminPath 由 Worker 运行时注入到 window.__BASE__。
 * 统一响应格式：成功 { ok:true, data }  失败 { ok:false, error:{code,message} }
 * ============================================================================
 */

/** 业务错误：携带后端错误码与 HTTP 状态码 */
class ApiError extends Error {
  constructor(code, message, status, data) {
    super(message || code || '请求失败');
    this.name = 'ApiError';
    this.code = code || 'INTERNAL';
    this.status = status || 0;
    this.data = data || null;
  }
}

/** 取 API 根路径。__BASE__ 形如 "/__panel"，兜底取当前路径第一段 */
function apiBase() {
  let base = (typeof window !== 'undefined' && window.__BASE__) || '';
  if (!base) {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    base = seg ? '/' + seg : '';
  }
  if (base && !base.startsWith('/')) base = '/' + base;
  return base.replace(/\/$/, '') + '/api';
}

/**
 * 底层请求。自动处理 JSON 编解码、鉴权失效、限流锁定。
 * @param {string} path   形如 "/sites"
 * @param {Object} [opts] { method, body, query, raw }
 */
async function request(path, opts = {}) {
  const { method = 'GET', body, query, raw = false } = opts;

  let url = apiBase() + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += '?' + s;
  }

  const init = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let resp;
  try {
    resp = await fetch(url, init);
  } catch (e) {
    throw new ApiError('NETWORK', '网络连接失败，请检查网络后重试', 0);
  }

  // 需要原始响应（导出配置下载等）
  if (raw) {
    if (!resp.ok) throw await toApiError(resp);
    return resp;
  }

  let payload = null;
  const text = await resp.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!resp.ok || !payload || payload.ok !== true) {
    const err = payload && payload.error ? payload.error : {};
    const e = new ApiError(
      err.code || httpFallbackCode(resp.status),
      err.message || httpFallbackMessage(resp.status),
      resp.status,
      payload && payload.data ? payload.data : null
    );
    // 429 锁定：尽力解析剩余秒数，供登录页倒计时使用
    if (resp.status === 429) {
      const ra = resp.headers.get('Retry-After');
      e.retryAfter = Number(ra) || (e.data && e.data.retryAfter) || 0;
    }
    throw e;
  }

  return payload.data;
}

async function toApiError(resp) {
  let payload = null;
  try {
    payload = await resp.json();
  } catch {}
  const err = (payload && payload.error) || {};
  return new ApiError(
    err.code || httpFallbackCode(resp.status),
    err.message || httpFallbackMessage(resp.status),
    resp.status
  );
}

function httpFallbackCode(status) {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 400) return 'BAD_REQUEST';
  if (status === 409) return 'CONFLICT';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL';
}

function httpFallbackMessage(status) {
  const map = {
    400: '请求参数有误',
    401: '登录已失效，请重新登录',
    403: '没有权限执行该操作',
    404: '请求的资源不存在',
    409: '资源冲突，可能已存在同名项',
    429: '操作过于频繁，请稍后再试',
    500: '服务器内部错误',
    503: '存储服务不可用，请检查 KV 绑定',
  };
  return map[status] || '请求失败（HTTP ' + status + '）';
}

const get = (p, query) => request(p, { method: 'GET', query });
const put = (p, body) => request(p, { method: 'PUT', body });
const post = (p, body) => request(p, { method: 'POST', body });
const del = (p) => request(p, { method: 'DELETE' });

/** 对外 API 门面 */
const API = {
  ApiError,
  base: apiBase,

  auth: {
    login: (password) => post('/auth/login', { password }),
    logout: () => post('/auth/logout', {}),
    me: () => get('/auth/me'),
    changePassword: (oldPassword, newPassword) =>
      post('/auth/password', { oldPassword, newPassword }),
  },

  sites: {
    list: () => get('/sites'),
    /** 新建站点可选的场景模板 + 参数元信息（名称/说明/范围） */
    templates: () => get('/sites/templates'),
    get: (host) => get('/sites/' + encodeURIComponent(host)),
    save: (host, site) => put('/sites/' + encodeURIComponent(host), site),
    remove: (host) => del('/sites/' + encodeURIComponent(host)),
    // 片段 API：各段只保存自己的字段，互不影响（绝不越界）
    saveBasics: (host, payload) => put('/sites/' + encodeURIComponent(host) + '/basics', payload),
    saveRules: (host, rules) => put('/sites/' + encodeURIComponent(host) + '/rules', { rules }),
    saveSecurity: (host, security) => put('/sites/' + encodeURIComponent(host) + '/security', { security }),
  },

  pools: {
    list: () => get('/pools'),
    get: (id) => get('/pools/' + encodeURIComponent(id)),
    /** 保存：有 id 走 PUT（更新），无 id 走 POST（新建，机器 id 由后端生成） */
    save: (id, pool) => (id ? put('/pools/' + encodeURIComponent(id), pool) : post('/pools', pool)),
    create: (pool) => post('/pools', pool),
    remove: (id) => del('/pools/' + encodeURIComponent(id)),
  },

  cache: {
    /** @param {{host?:string,prefix?:string,urls?:string[]}} payload */
    purge: (payload) => post('/cache/purge', payload),
  },

  stats: {
    overview: () => get('/stats/overview'),
    host: (host, hours = 24) =>
      get('/stats/host/' + encodeURIComponent(host), { hours }),
  },

  system: {
    info: () => get('/system/info'),
    export: () => request('/system/export', { method: 'GET', raw: true }),
    import: (config) => post('/system/import', config),
  },

  config: {
    get: () => get('/config/global'),
    save: (payload) => put('/config/global', payload),
  },

  rules: {
    /** 全站通用规则（兜底），对所有站点生效、优先级最低 */
    global: () => get('/rules/global'),
    saveGlobal: (rules) => put('/rules/global', rules),
  },
};

if (typeof window !== 'undefined') window.API = API;

/**
 * ============================================================================
 * web/app.js —— 管理面前端逻辑（单页应用，哈希路由）
 * ----------------------------------------------------------------------------
 * 运行环境约定（由 api.js / 注入脚本提供）：
 *  - window.__BASE__   管理面基础路径（如 "/__panel"）
 *  - window.__PLATFORM__  运行平台标识
 *  - window.API        数据访问门面（见 api.js）
 *                      响应统一为 { ok, data }，API.*.list() 返回 data 字段
 *  - 鉴权基于 HttpOnly Cookie：登录后后端写入，fetch 同源自动携带
 *
 * 本文件只负责「交互 + 视图渲染」，一切数据走 window.API。
 * 约定：元素显隐统一使用 [hidden] 属性（标准 HTML 语义）。
 * ============================================================================
 */

(function () {
  'use strict';

  const API = window.API;
  const PLATFORM = window.__PLATFORM__ || 'unknown';

  // 小工具 ----------------------------------------------------------------
  // 单参: document.getElementById(id)
  // 双参: 在 root 内按 CSS 选择器查找（$('.o-addr', row)）
  const $ = (sel, root) => {
    if (root) return root.querySelector(sel);
    return typeof sel === 'string' ? document.getElementById(sel) : sel;
  };
  const APP_DATA = { global: null, sites: [], pools: [], stats: null, info: null };

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
    }
    return n;
  }
  const clear = (node) => { while (node && node.firstChild) node.removeChild(node.firstChild); };

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + ' MB';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + ' KB';
    return String(n) + ' B';
  }
  const fmtRate = (r) => (r == null || isNaN(r) ? '0%' : (r * 100).toFixed(1) + '%');
  const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString() : '-');

  // 把秒数换算成人话，追加在输入框说明后面。
  // 「15552000 秒」没人读得出是多久，写成「≈ 180 天」才能让用户立刻意识到
  // 自己填的值意味着什么——尤其是缓存时间这种设错代价很大的参数。
  function humanSecs(s) {
    if (!Number.isFinite(s)) return '';
    if (s < 0) return '　当前：跟随源站，不改写';
    if (s === 0) return '　当前：0（不缓存）';
    if (s < 60) return `　当前：${s} 秒`;
    if (s < 3600) return `　当前：≈ ${(s / 60).toFixed(s % 60 ? 1 : 0)} 分钟`;
    if (s < 86400) return `　当前：≈ ${(s / 3600).toFixed(s % 3600 ? 1 : 0)} 小时`;
    return `　当前：≈ ${(s / 86400).toFixed(s % 86400 ? 1 : 0)} 天`;
  }

  // 全局提示 --------------------------------------------------------------
  function toast(msg, type) {
    const host = $('toasts');
    if (!host) return;
    const t = el('div', { class: 'toast' + (type ? ' ' + type : '') }, msg);
    host.appendChild(t);
    setTimeout(() => {
      t.classList.add('hide');
      setTimeout(() => t.remove(), 200);
    }, 3000);
  }

  // 抽屉 ------------------------------------------------------------------
  function openDrawer(title, hint, bodyNode, onSave) {
    $('drawer-title').textContent = title;
    $('drawer-hint').textContent = hint || '';
    const body = $('drawer-body');
    clear(body);
    body.appendChild(bodyNode);
    $('drawer-mask').hidden = false;
    $('drawer').hidden = false;
    // onSave 为空 → 只读抽屉（如「引用详情」），隐藏保存按钮
    $('drawer-save').hidden = !onSave;
    if (!onSave) { $('drawer-save').onclick = null; return; }
    $('drawer-save').onclick = async () => {
      try {
        $('drawer-save').disabled = true;
        await onSave();
        closeDrawer();
        toast('已保存', 'ok');
        await route(location.hash); // 刷新当前视图
      } catch (e) {
        toast(e.message || '保存失败', 'err');
      } finally {
        $('drawer-save').disabled = false;
      }
    };
  }
  function closeDrawer() {
    $('drawer').hidden = true;
    $('drawer-mask').hidden = true;
  }

  // 流量序列跳转：抽屉打开后滚动到指定片段锚点并高亮
  function scrollToAnchor(anchor) {
    if (!anchor) return;
    requestAnimationFrame(() => {
      const tgt = document.getElementById(anchor);
      if (!tgt) return;
      tgt.scrollIntoView({ block: 'start', behavior: 'smooth' });
      tgt.classList.add('flash-anchor');
      setTimeout(() => tgt.classList.remove('flash-anchor'), 1600);
    });
  }

  // 确认弹窗 --------------------------------------------------------------
  function confirmDialog(title, text, options) {
    options = options || {};
    return new Promise((resolve) => {
      $('confirm-title').textContent = title;
      $('confirm-text').textContent = text || '';
      const extra = $('confirm-extra');
      const input = $('confirm-input');
      if (options.confirmText) {
        extra.hidden = false;
        $('confirm-extra-label').textContent = options.confirmLabel || '';
        input.value = '';
        input.placeholder = options.confirmPlaceholder || '';
      } else {
        extra.hidden = true;
      }
      const mask = $('confirm-mask');
      mask.hidden = false;
      const done = (ok) => {
        mask.hidden = true;
        if (ok && options.confirmText) {
          resolve(input.value.trim() === options.confirmText);
        } else {
          resolve(ok);
        }
      };
      $('confirm-ok').onclick = () => done(true);
      $('confirm-cancel').onclick = () => done(false);
    });
  }

  // 登录态 ----------------------------------------------------------------
  async function ensureAuth() {
    try {
      const me = await API.auth.me();
      return !!(me && me.authed);
    } catch {
      return false;
    }
  }

  async function doLogin(pwd) {
    const errEl = $('login-err');
    errEl.hidden = true;
    try {
      await API.auth.login(pwd);
      enterApp();
    } catch (e) {
      errEl.textContent = e.message || '登录失败';
      errEl.hidden = false;
    }
  }

  async function doLogout() {
    try { await API.auth.logout(); } catch {}
    showLogin();
  }

  // 视图切换 --------------------------------------------------------------
  function showLogin() {
    $('view-app').hidden = true;
    $('view-login').hidden = false;
  }
  function enterApp() {
    $('view-login').hidden = true;
    $('view-app').hidden = false;
    // 启动后拉取首屏数据
    loadAll().catch((e) => toast(e.message, 'err'));
    route(location.hash);
  }

  async function loadAll() {
    const [info, sites, pools] = await Promise.all([
      API.system.info().catch(() => null),
      API.sites.list().catch(() => ({ sites: [] })),
      API.pools.list().catch(() => ({ pools: [] })),
    ]);
    APP_DATA.info = info;
    APP_DATA.sites = sites.sites || [];
    APP_DATA.pools = pools.pools || [];
    APP_DATA.poolsLegacySites = pools.legacySites || [];
    renderPlatBadge();
  }

  function renderPlatBadge() {
    const badge = $('plat-badge');
    if (!badge) return;
    const caps = (APP_DATA.info && APP_DATA.info.caps) || {};
    const parts = ['平台: ' + (APP_DATA.info ? APP_DATA.info.platform : PLATFORM)];
    if (caps.hasEdgeCache) parts.push('边缘缓存 ✓');
    if (!caps.hasSocket) parts.push('socket ✗');
    if (!caps.hasD1) parts.push('D1 ✗');
    badge.textContent = parts.join(' · ');
    badge.title = (APP_DATA.info && APP_DATA.info.limitations || []).map((l) => l.message).join('\n');
  }

  // 路由 ------------------------------------------------------------------
  const ROUTES = {
    overview: renderOverview,
    sites: renderSites,
    sequence: renderTrafficSequence,
    pools: renderPools,
    cache: renderCache,
    system: renderSystem,
  };
  const TITLES = {
    overview: '概览', sites: '站点管理', sequence: '流量序列', pools: '源站',
    cache: '缓存管理', system: '系统设置',
  };

  async function route(hash) {
    const key = (hash || location.hash || '').replace(/^#\/?/, '') || 'overview';
    const fn = ROUTES[key] || renderOverview;
    $('page-title').textContent = TITLES[key] || '概览';
    // 高亮导航
    $$nav().forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#/' + key));
    const content = $('content');
    clear(content);
    content.appendChild(el('div', { class: 'loading' }, '加载中…'));
    try {
      const node = await fn();
      clear(content);
      if (node) content.appendChild(node);
    } catch (e) {
      clear(content);
      content.appendChild(el('div', { class: 'empty err' }, e.message || '加载失败'));
    }
  }
  function $$nav() {
    return Array.from(document.querySelectorAll('#nav a[href^="#/"]'));
  }

  // 通用组件 --------------------------------------------------------------
  function table(headers, rows) {
    const t = el('table', { class: 'table' });
    t.appendChild(el('thead', {}, el('tr', {}, headers.map((h) => el('th', {}, h)))));
    const tb = el('tbody');
    rows.forEach((r) => tb.appendChild(el('tr', {}, r.map((c) => (c && c.nodeType ? el('td', {}, c) : el('td', {}, String(c)))))));
    t.appendChild(tb);
    return t;
  }
  function actions(btns) {
    return el('div', { class: 'row-actions' }, btns.map((b) =>
      el('button', { class: 'btn btn-sm ' + (b.cls || 'btn-ghost'), text: b.label, onclick: b.onClick })
    ));
  }

  // ====== 概览 ======
  async function renderOverview() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('h3', {}, '概览'));

    let stats = null;
    try { stats = await API.stats.overview(); } catch {}
    const totalSites = APP_DATA.sites.length;
    const totalPools = APP_DATA.pools.length;
    const cards = el('div', { class: 'cards' }, [
      statCard('站点数', String(totalSites)),
      statCard('源站数', String(totalPools)),
      statCard('请求数(24h)', stats && stats.enabled ? fmtNum(stats.requests) : '未启用'),
      statCard('缓存命中率', stats && stats.enabled ? fmtRate(stats.hitRate) : '—'),
    ]);
    wrap.appendChild(cards);

    if (stats && stats.enabled && Array.isArray(stats.topHosts)) {
      wrap.appendChild(el('h4', {}, 'Top 站点'));
      const rows = stats.topHosts.slice(0, 8).map((h) => [
        h.host, fmtNum(h.requests), fmtNum(h.bytes), fmtRate(h.hitRate),
      ]);
      wrap.appendChild(table(['Host', '请求', '流量', '命中率'], rows));
    } else {
      wrap.appendChild(el('p', { class: 'empty' }, '统计未启用，可在「系统设置」中开启。'));
    }

    // 快速入口
    wrap.appendChild(el('div', { class: 'quick' }, [
      el('button', { class: 'btn btn-primary', text: '+ 新建站点', onclick: () => openSiteDrawer(null) }),
      el('button', { class: 'btn btn-primary', text: '+ 新建源站池', onclick: () => openPoolDrawer(null, 'pool') }),
    ]));
    return wrap;
  }
  function statCard(label, value) {
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-label' }, label),
      el('div', { class: 'card-value' }, value),
    ]);
  }

  // ====== 站点管理 ======
  async function renderSites() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('h3', {}, '站点管理'),
      el('button', { class: 'btn btn-primary', text: '+ 新建站点', onclick: () => openSiteDrawer(null) }),
    ]));
    if (!APP_DATA.sites.length) {
      wrap.appendChild(el('p', { class: 'empty' }, '暂无站点，点击右上角新建。'));
      return wrap;
    }
    const rows = APP_DATA.sites.map((s) => {
      const p = APP_DATA.pools.find((x) => x.id === s.poolId);
      return [
        s.host,
        s.enabled ? '启用' : '停用',
        p
          ? el('span', {}, [
            el('span', { class: 'badge ' + (poolKind(p) === 'single' ? 'badge-single' : 'badge-pool') },
              poolKind(p) === 'single' ? '单一' : '池'),
            el('span', { text: ' ' + (p.name || p.id) }),
          ])
          : (s.poolId || '—'),
        String((s.rules || []).length),
        String(s.cacheGen || 0),
        actions([
          { label: '编辑', onClick: () => openSiteDrawer(s.host) },
          { label: '缓存', onClick: () => openCacheDrawer(s.host) },
          { label: '删除', cls: 'btn-danger', onClick: () => removeSite(s.host) },
        ]),
      ];
    });
    wrap.appendChild(table(['Host', '状态', '源站', '规则数', '代次', '操作'], rows));
    return wrap;
  }

  // ====== 流量序列（借鉴 Cloudflare Traffic Sequence 的前端方案）======
  /** 根据池 id 取用户可见名称（找不到时回退 id 本体） */
  function poolName(id) {
    if (!id) return '未设置';
    const p = APP_DATA.pools.find((x) => x.id === id);
    return (p && (p.name || p.id)) || id;
  }

  // 把一个站点（或所有站点）的请求处理流程，按「请求入口 → 最终用户」的真实顺序，
  // 渲染成一条可点击的竖向流水线。点击任一阶段，跳转到对应环节的设置；单站点下规则可拖拽排序。
  async function renderTrafficSequence() {
    const wrap = el('div', { class: 'section seq-page' });

    if (!APP_DATA.sites.length) {
      wrap.appendChild(el('h3', {}, '流量序列'));
      wrap.appendChild(el('p', { class: 'empty' }, '暂无站点，请先在「站点管理」中创建站点。'));
      return wrap;
    }

    const ALL = '__all__';
    const initial = decodeURIComponent(location.hash.split('?host=')[1] || '');
    const initHost = (initial && (initial === ALL || initial === '__global__' || APP_DATA.sites.some((s) => s.host === initial)))
      ? initial : APP_DATA.sites[0].host;

    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('h3', {}, '流量序列'),
      el('div', { class: 'seq-pick' }, [
        el('label', { class: 'muted', text: '站点：' }),
        (() => {
          const sel = select('', [
            { value: ALL, label: '全部站点总览（跨域名）' },
            { value: '__global__', label: '全站通用规则（兜底默认）' },
            ...APP_DATA.sites.map((s) => ({ value: s.host, label: s.host })),
          ], initHost);
          sel.className = 'input';
          return sel;
        })(),
      ]),
    ]));
    wrap.appendChild(el('p', { class: 'hint' }, '本图是请求从进入网关到返回浏览器的完整处理顺序（顺序固定、不可更改），共 18 个阶段，采用 Cloudflare 流量序列风格：每个阶段卡片本身就是一个独立的规则引擎或配置入口，阶段之间相互独立（AND），阶段内部可有多个规则集（OR：从上到下匹配，命中即跳出本阶段进入下一阶段）。某阶段站点未做任何设置时，自动回落「全站通用规则」作为实际生效（看卡片上的「回落全站兜底」提示）。点击阶段卡片或其中规则即可编辑。'));

    const hostSel = $('select', wrap);
    const flow = el('div', { class: 'seq-flow' });
    wrap.appendChild(flow);

    // 预取全站通用规则（兜底），用于各阶段「站点未设置→回落全站兜底」的标注与跳转
    let GLOBAL_RULES = [];
    try {
      const gr = await API.rules.global().catch(() => null);
      GLOBAL_RULES = (gr && gr.rules) || [];
    } catch { GLOBAL_RULES = []; }
    GLOBAL_RULES = GLOBAL_RULES.slice().sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // 汇总一条规则的动作子阶段（用于序列展示）
    function ruleSubs(r) {
      const a = r.action || {};
      const subs = [];
      const rw = a.rewrite || {};
      if (rw.type && rw.type !== 'none') subs.push(`URL重写(${rw.type})`);
      if (a.forceHttps) subs.push('强制HTTPS');
      if (a.redirect && a.redirect.enabled) subs.push(`重定向(${a.redirect.status || 302})`);
      if (a.directResponse && a.directResponse.enabled) subs.push(`自定义响应(${a.directResponse.status || 200})`);
      if (a.poolId) subs.push(`源站→${poolName(a.poolId)}`);
      if (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') subs.push(`回源Host(${a.hostHeader.mode})`);
      if (a.clientIpHeader && a.clientIpHeader.enabled) subs.push(`客户端IP→${a.clientIpHeader.name || 'X-EdgeGateway-Client-IP'}`);
      if (a.followRedirect) subs.push('回源跟随3xx');
      if (a.originTimeoutMs) subs.push(`回源超时${a.originTimeoutMs}ms`);
      if (a.engine) subs.push(`引擎(${a.engine})`);
      if (a.scheme) subs.push(`协议(${a.scheme})`);
      if (Number(a.port) > 0) subs.push(`端口(${a.port})`);
      const cp = a.cache || {};
      if (cp && cp.mode === 'noCache') subs.push('不缓存');
      else if (cp && cp.enabled) subs.push('缓存');
      const rh = a.reqHeaders || {};
      if (rh.set && Object.keys(rh.set).length || (rh.remove || []).length) subs.push('改请求头');
      const rph = a.respHeaders || {};
      if (rph.set && Object.keys(rph.set).length || (rph.remove || []).length) subs.push('改响应头');
      return subs;
    }

    // 渲染单个站点的完整序列（draggable=true 时规则可拖拽）
    // 严格按「①→⑱」18 个阶段顺序；阶段间相互独立（AND），阶段内规则集是 OR（按 priority 降序从上到下匹配，命中即跳出本阶段）。
    // 某阶段站点无规则时，回落全站通用规则（GLOBAL_RULES）作为实际生效，卡片显示「回落全站兜底」。
    function renderSite(site, draggable) {
      const rules = (site.rules || [])
        .slice()
        .sort((a, b) => (b.priority || 0) - (a.priority || 0));
      const ruleNodes = [];

      const sec = site.security || {};

      // 统一渲染一个「规则引擎型」阶段：站点规则按本阶段 match 命中子集；为空则回落全站兜底
      function renderRuleStage(no, icon, title, stageSummary, matchFn, opts) {
        const matched = rules.filter((r) => { try { return matchFn(r.action || {}); } catch { return false; } });
        const globalMatched = GLOBAL_RULES.filter((r) => { try { return matchFn(r.action || {}); } catch { return false; } });
        const hasSite = matched.length > 0;
        const hasGlobal = !hasSite && globalMatched.length > 0;
        const badge = hasSite ? `${matched.length} 条` : (hasGlobal ? '回落全站兜底' : '未配置');
        const summary = hasSite
          ? `${matched.length} 条规则（按优先级从上到下匹配，命中即跳出本阶段）；${stageSummary}`
          : (hasGlobal
            ? `本站无设置 → 实际生效为「全站通用规则」${globalMatched.length} 条（点击前往编辑）`
            : `本站无设置，且无全站兜底；${stageSummary}`);
        const onClick = opts
          ? () => openRulesDrawer(site.host, opts)
          : (hasGlobal ? () => { location.hash = '#/sequence?host=__global__'; } : null);
        const owner = opts ? opts.owner : (hasGlobal ? '全站通用规则（兜底，点击前往）' : null);
        flow.appendChild(seqStage(icon, `${no} ${title}`, summary, badge, 'sec-rules', onClick, owner));
        if (hasSite && matched.length) {
          flow.appendChild(el('div', { class: 'seq-rule-list' }, matched.map((r) => {
            const condCount = (r.match && r.match.conditions || []).reduce((n, g) => n + g.length, 0)
              + Object.keys(legacyMatchFields(r.match || {})).length;
            const idx = rules.indexOf(r);
            const node = seqRuleInPack(r, ruleSubs(r), condCount, site.host, draggable);
            if (draggable && idx >= 0) ruleNodes.push({ node, index: idx });
            return node;
          })));
        }
      }

      // ── ① 匹配站点 ─────────────────────────────────────────────
      flow.appendChild(seqGroup('①', '匹配站点', '按 Host 命中站点配置，决定后续整条管线走哪套设置'));
      flow.appendChild(seqStage('🛰️', '① 匹配站点 matchSite',
        `${site.host} · ${site.enabled === false ? '已停用' : '启用'} · IPv6 ${site.ipv6Support ? '已开启' : '未开启'}`,
        site.enabled === false ? '已停用' : '启用', 'sec-basic',
        () => openSiteDrawer(site.host, 'sec-basic'), '站点基础抽屉'));

      // ── ② 安全校验：5 个最小任务包，各自独立成片段 ───────────────
      flow.appendChild(seqGroup('②', '安全校验 checkSecurity', 'fail-closed：自身异常也按 403 拦截，绝不放行。以下 5 包全部通过才继续 ③'));

      const ipCnt = (sec.ipBlacklist || []).length + (sec.ipWhitelist || []).length;
      flow.appendChild(seqStage('🚧', '②.1 IP 访问规则',
        ipCnt ? `黑名单 ${(sec.ipBlacklist || []).length} 条 · 白名单 ${(sec.ipWhitelist || []).length} 条` : '未配置 IP 访问控制',
        ipCnt ? '已配置' : '未配置', 'sec-ip',
        () => openSecurityDrawer(site.host, 'sec-ip'), '安全防护抽屉 · IP 访问控制'));

      const wafItems = [];
      if (sec.refererMode && sec.refererMode !== 'off') wafItems.push(`防盗链 ${sec.refererMode === 'whitelist' ? '白名单' : '黑名单'} ${(sec.refererList || []).length} 条`);
      if ((sec.uaBlacklist || []).length) wafItems.push(`UA 黑名单 ${(sec.uaBlacklist || []).length} 条`);
      flow.appendChild(seqStage('🛡️', '②.2 WAF · 自定义规则（UA / Referer）',
        wafItems.length ? wafItems.join(' · ') : '未配置 UA / Referer 校验',
        wafItems.length ? '已配置' : '未配置', 'sec-waf',
        () => openSecurityDrawer(site.host, 'sec-waf'), '安全防护抽屉 · UA黑名单 / 防盗链'));

      const bm = sec.botManagement || {};
      flow.appendChild(seqStage('🤖', '②.3 自动程序（Bot 管理）',
        bm.enabled
          ? `已启用 · ${bm.mode === 'allowlist' ? '白名单仅放行' : '黑名单拦截'} ${(bm.list || []).length} 条特征`
          : '未启用 Bot 管理（独立字段 botManagement）',
        bm.enabled ? '已启用' : '未配置', 'sec-bot',
        () => openSecurityDrawer(site.host, 'sec-bot'), '安全防护抽屉 · 自动程序（独立最小任务包）'));

      const su = sec.signedUrl || {};
      flow.appendChild(seqStage('🔑', '②.4 Access · 令牌鉴权（签名 URL）⚠️实验特性',
        su.enabled ? `已启用 · 参数 ${su.param || 'sign'}${su.ttl ? ' · 有效期 ' + su.ttl + 's' : ''}` : '未启用签名 URL',
        su.enabled ? '已启用' : '未配置', 'sec-token',
        () => openSecurityDrawer(site.host, 'sec-token'), '安全防护抽屉 · 签名 URL（内置签发工具待开发）'));

      const rl = sec.rateLimit || {};
      flow.appendChild(seqStage('⏱️', '②.5 速率限制',
        rl.enabled ? `已启用 · ${rl.rpm || 0} 次/分钟` : '未启用请求限速',
        rl.enabled ? '已启用' : '未配置', 'sec-ratelimit',
        () => openSecurityDrawer(site.host, 'sec-ratelimit'), '安全防护抽屉 · 请求限速'));

      // ── ③ 首要分流：由负载均衡实际选出一个具体临时回源对象 ───────
      flow.appendChild(seqGroup('③', '首要分流：选出「本次回源对象」（真实推导的具体临时对象）', '不是虚拟占位：单源站 = 该源站本身；源站池 = 按负载均衡策略（chain/roundrobin/随机/加权/IP哈希）实际选出的某一个 oX。这个具体对象即后续 ⑤~⑱ 规则的「回源目标」匹配维度（target=origin / originAddr），可在一条线上用它做多分支。'));
      const defPool = APP_DATA.pools.find((p) => p.id === site.poolId);
      const defKind = defPool ? poolKind(defPool) : '';
      const originId = defPool && defKind === 'single'
        ? (defPool.origins && defPool.origins[0] && defPool.origins[0].id)
        : (defPool ? '按策略选出的 oX' : '');
      flow.appendChild(seqStage('🎯', '③ 本次回源对象（推导·只读）',
        site.poolId
          ? (defPool
            ? (defKind === 'single'
              ? `单一源站：${defPool.name || defPool.id} · ${originSummary(defPool)}（回源目标 id=${defPool.origins && defPool.origins[0] && defPool.origins[0].id}）`
              : `源站池：${defPool.name || defPool.id} · 策略 ${defPool.strategy || 'roundrobin'} · ${(defPool.origins || []).length} 个源站（每次按策略选出一个 oX 作为回源目标）`)
            : `源站已被删除或不可用：${site.poolId}`)
          : '未设置默认源站',
        site.poolId ? '推导' : '未配置', 'sec-origin',
        // ③ 是由「单站点选定单源站 / 单源站池按负载均衡自动选定」推导出的抽象虚拟临时对象，
        // 本身不可直接干预；如需更改回源对象，应去「① 站点基础 / 源站池」或「⑨ Origin Rules」编辑。
        () => toast('③ 是推导出的临时虚拟回源对象，不可直接编辑。如需更改回源对象，请到「① 匹配站点」改默认源站、到「源站」页编辑源站池，或用「⑨ Origin Rules」规则覆盖。', 'info'),
        null));

      // ── ④ URL 规范化（我们当前未实现，作为只读占位，可跳过）────
      flow.appendChild(seqGroup('④', 'URL 规范化', '把请求 URL 统一成标准形态（大小写、尾部斜杠、查询排序等）。本网关暂未实现该阶段，流量直接跳过进入 ⑤'));
      flow.appendChild(seqStage('🔧', '④ URL 规范化 normalize',
        '本网关暂不支持 URL 规范化，请求原样进入 ⑤ URL 重写阶段。',
        '暂不支持', null, null, null));

      // ── ⑤~⑪ 规则驱动阶段：每个阶段卡片即一个独立规则引擎 ────────
      flow.appendChild(seqGroup('⑤-⑪', '规则驱动阶段（每个阶段 = 一个独立规则引擎）', '流量依次经过这些阶段，每个阶段内部按 priority 降序（从上到下）匹配，命中即跳出本阶段进入下游；站点无设置则回落全站通用规则。多分支用「回源目标」条件表达：在规则匹配里加 target=origin/originAddr（③ 选出的具体源站），如「路径=/img/ 且 回源目标=oX → 动作」，⑦~⑱ 全部共用一条线，⑩⑭ 是真实只读的实际生效结果。'));

      renderRuleStage('⑤', '✂️', 'URL 重写', '按规则改写客户端请求路径（不含源站 pathPrefix）',
        (a) => a.rewrite && a.rewrite.type && a.rewrite.type !== 'none',
        { title: 'URL 重写规则', owner: '路由规则抽屉 · URL 重写', allowedOps: ['rewrite'], hideTargetPool: true, match: (a) => a.rewrite && a.rewrite.type && a.rewrite.type !== 'none' });

      renderRuleStage('⑥', '↪️', '重定向规则', '把请求重定向到其它 URL（命中即终止回源）',
        (a) => a.redirect && a.redirect.enabled,
        { title: '重定向规则', owner: '路由规则抽屉 · 重定向', allowedOps: ['redirect'], hideTargetPool: true, match: (a) => a.redirect && a.redirect.enabled });

      renderRuleStage('⑦', '🔒', '强制 HTTPS / 直接响应（终止型）', '命中 http 返回 301/307 跳 https，或直接用自定义 body/status 响应，不再回源',
        (a) => a.forceHttps || (a.directResponse && a.directResponse.enabled),
        { title: '强制 HTTPS / 直接响应规则', owner: '路由规则抽屉 · 强制HTTPS / 直接响应', allowedOps: ['forceHttps', 'directResponse'], hideTargetPool: true, match: (a) => a.forceHttps || (a.directResponse && a.directResponse.enabled) });

      renderRuleStage('⑧', '📤', '修改请求头', '在回源请求发出去之前增 / 删 / 改 HTTP 头',
        (a) => { const h = a.reqHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; },
        { title: '修改请求头规则', owner: '路由规则抽屉 · 修改请求头', allowedOps: ['reqHeaders'], hideTargetPool: true, match: (a) => { const h = a.reqHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; } });

      renderRuleStage('⑨', '🔀', 'Origin Rules', '更改回源目标：回源 Host、回源连接参数（引擎/协议/端口）或候选源站',
        (a) => a.poolId || (a.inlineOrigins || []).length || (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') || a.engine || a.scheme || Number(a.port) > 0,
        { title: 'Origin Rules', owner: '路由规则抽屉 · Origin Rules', allowedOps: ['hostHeader', 'originConn', 'targetPool'], hideTargetPool: false, match: (a) => a.poolId || (a.inlineOrigins || []).length || (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') || a.engine || a.scheme || Number(a.port) > 0 });

      // ── ⑩ 确定实际源站（运行时推导，纯只读）──────────────────
      const ovrPool = rules.find((r) => r.action && r.action.poolId);
      const globalOv = !ovrPool && GLOBAL_RULES.find((r) => r.action && r.action.poolId);
      flow.appendChild(seqGroup('⑩', '确定实际源站', '沿用 ③ 首要分流结果，或被 ⑨「Origin Rules」阶段命中的规则覆盖（运行时推导，无独立配置项）'));
      flow.appendChild(seqStage('🧭', '⑩ 实际源站',
        ovrPool
          ? `存在站点规则覆盖 → ${poolName(ovrPool.action.poolId)}（命中该规则时生效）`
          : (globalOv
            ? `站点无覆盖 → 回落全站兜底 → ${poolName(globalOv.action.poolId)}`
            : `无规则覆盖 → 沿用 ③ 的 ${site.poolId ? poolName(site.poolId) : '未配置'}`),
        '推导', null, null, null));

      renderRuleStage('⑪', '📥', 'Cache Rules（缓存请求设置）', '缓存策略（edgeTtl / SWR / browserTtl / 绕过缓存）等请求级缓存设置',
        (a) => a.cache && (a.cache.enabled || a.cache.mode === 'noCache'),
        { title: 'Cache Rules', owner: '路由规则抽屉 · Cache Rules（缓存策略）', allowedOps: ['cache'], hideTargetPool: true, match: (a) => a.cache && (a.cache.enabled || a.cache.mode === 'noCache') });

      // ── ⑫ 缓存键（可干预：站点 cacheGen）──────────────────────
      flow.appendChild(seqGroup('⑫', '缓存键', '合并 policy = 默认 < 源站级 cache < ⑪ Cache Rules；本环节可干预项：站点 cacheGen（代次）。'));
      const cacheRules = rules.filter((r) => r.action && r.action.cache && (r.action.cache.enabled || r.action.cache.mode === 'noCache'));
      const hasCache = cacheRules.some((r) => r.action.cache.enabled);
      flow.appendChild(seqStage('🔖', '⑫ 合并缓存策略 & 构造缓存键',
        `⑪ 缓存动作 ${cacheRules.length} 条 · 站点 cacheGen=${site.cacheGen || 0}${hasCache ? '（已启用节点缓存）' : ''}`,
        '推导', null, () => openCacheGenDrawer(site.host, cacheRules.length, hasCache), '缓存键抽屉（仅调整 cacheGen 代次）'));

      // ── ⑬ 查边缘缓存（运行时，纯只读）──────────────────────────
      flow.appendChild(seqGroup('⑬', '查缓存', '命中则直接返回（X-Cache: HIT），未命中继续 ⑭ 真正回源。运行时行为。'));
      flow.appendChild(seqStage('⚡', '⑬ 查边缘缓存 cacheMatch',
        '命中则直接返回（响应头 X-Cache: HIT），未命中继续 ⑭ 真正回源。运行时行为，无配置项。',
        '运行时', null, null, null));

      // ── ⑭ 回源循环（此时才真正发出回源请求；可干预：源站/池）────
      const effPoolId = (ovrPool && ovrPool.action.poolId) || (globalOv && globalOv.action.poolId) || site.poolId;
      const pool = APP_DATA.pools.find((p) => p.id === effPoolId);
      const fo = (pool && pool.failover) || {};
      const connRule = rules.find((r) => { const a = r.action || {}; return (a.clientIpHeader && a.clientIpHeader.enabled) || a.originTimeoutMs || a.followRedirect; });
      const gConnRule = !connRule && GLOBAL_RULES.find((r) => { const a = r.action || {}; return (a.clientIpHeader && a.clientIpHeader.enabled) || a.originTimeoutMs || a.followRedirect; });
      flow.appendChild(seqGroup('⑭', '回源循环 requestWithFailover（真正发出回源请求）', '逐个源站尝试；⑤⑨⑧ 各阶段规则在此对每个源站落地；回源连接参数受规则 clientIp / 超时 / 跟随3xx 影响。可干预：源站地址、策略、故障转移。'));
      flow.appendChild(seqStage('🗄️', '⑭ 源站与故障转移',
        pool
          ? (poolKind(pool) === 'single'
            ? `单一源站 ${pool.name || pool.id} · ${originSummary(pool)} · 重试 ${fo.maxRetries != null ? fo.maxRetries : 2} 次${connRule || gConnRule ? '（受规则回源参数影响）' : ''}`
            : `源站池 ${pool.name || pool.id} · 策略 ${pool.strategy || 'roundrobin'} · ${(pool.origins || []).length} 个源站 · 重试 ${fo.maxRetries != null ? fo.maxRetries : 2} 次${connRule || gConnRule ? '（受规则回源参数影响）' : ''}`)
          : '未配置源站',
        pool ? '已配置' : '未配置', null,
        pool ? () => openPoolDrawer(pool.id) : () => openInitialOriginDrawer(site.host, 'sec-origin'),
        pool ? '源站抽屉' : '初始回源对象抽屉 · 源站方式'));

      const subSteps = [
        ['⑭.1 合并本源站配置', '源站级打底 + ⑤⑧⑨ 规则级覆盖，形成回源改写输入'],
        ['⑭.2 构造回源 URL', '落实 ⑤「URL 重写」与 ⑨「Origin Rules」的路径 / Host 改写'],
        ['⑭.3 构造回源请求头', '源站 extraHeaders + ⑧「修改请求头」规则的改写 + 客户端IP'],
        ['⑭.4 选择引擎并发起', 'fetch / socket 引擎按源站配置分派（真正发请求）'],
        ['⑭.5 处理响应 / 异常', '命中 retryOn 状态码或异常 → 换下一源站'],
      ];
      flow.appendChild(el('div', { class: 'seq-substeps' },
        subSteps.map(([t, d]) => el('div', { class: 'seq-substep' }, [
          el('span', { class: 'seq-substep-t', text: t }),
          el('span', { class: 'seq-substep-d', text: d }),
        ]))));

      // ── ⑮ clone ─────────────────────────────────────────────────
      flow.appendChild(seqGroup('⑮', 'clone 原始响应', 'cacheKey 已在 ⑫ 固定，不随 ⑭ 换源变化。运行时行为。'));
      flow.appendChild(seqStage('🧬', '⑮ clone 原始响应',
        'cacheKey 已在 ⑫ 固定，不随 ⑭ 换源变化。运行时行为。', '运行时', null, null, null));

      // ── ⑯ 改写响应头（含 response cache rule）──────────────────
      flow.appendChild(seqGroup('⑯', '改写响应头（含 response cache rule）', '回源响应返回用户前的所有响应头改写，以及 CF 风格 response cache rule（响应级缓存控制）。'));
      renderRuleStage('⑯', '📝', '改写响应头 / Response Cache Rule', '增 / 删 / 改响应头，以及响应级缓存控制（response cache rule）',
        (a) => { const h = a.respHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; },
        { title: '改写响应头规则', owner: '路由规则抽屉 · 改写响应头 / Response Cache Rule', allowedOps: ['respHeaders'], hideTargetPool: true, match: (a) => { const h = a.respHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; } });

      // ── ⑰ 写缓存 ───────────────────────────────────────────────
      flow.appendChild(seqGroup('⑰', '写边缘缓存', '按 ⑫ 的 cacheKey 写入 ⑪ 定义的缓存策略。'));
      flow.appendChild(seqStage('💾', '⑰ 写边缘缓存',
        hasCache ? '应用 ⑪「Cache Rules」的缓存策略，按 ⑫ 的 cacheKey 写入。' : '未启用缓存，跳过写入。',
        '运行时', null, null, null));

      // ── ⑱ 返回用户 ─────────────────────────────────────────────
      flow.appendChild(seqGroup('⑱', '返回最终用户', '统一注入品牌响应头并记录统计，固定行为。'));
      flow.appendChild(seqStage('👤', '⑱ 响应 & 最终用户',
        '统一注入品牌响应头 Server: EdgeGateway、Via: 1.1 EdgeGateway，并记录统计。固定行为。',
        '固定', null, null, null));

      return { ruleNodes, rules };
    }

    // 拖拽排序：松手后重算 priority（降序）并保存
    function wireRuleDrag(ruleNodes, rules, site) {
      let dragNode = null;
      const clearMarks = () => ruleNodes.forEach(({ node }) =>
        node.classList.remove('drop-before', 'drop-after', 'dragging'));

      ruleNodes.forEach(({ node, index }) => {
        node.addEventListener('dragstart', (e) => {
          dragNode = node;
          node.classList.add('dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(index));
        });
        node.addEventListener('dragend', clearMarks);
        node.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (node === dragNode) return;
          const rect = node.getBoundingClientRect();
          const after = e.clientY > rect.top + rect.height / 2;
          clearMarks();
          dragNode && dragNode.classList.add('dragging');
          node.classList.add(after ? 'drop-after' : 'drop-before');
        });
        node.addEventListener('drop', async (e) => {
          e.preventDefault();
          if (!dragNode || dragNode === node) return;
          const from = Number(e.dataTransfer.getData('text/plain'));
          const to = index;
          const moved = rules.splice(from, 1)[0];
          rules.splice(to, 0, moved);
          const updated = {
            ...site,
            rules: rules.map((r, i) => ({ ...r, priority: (rules.length - i) * 10 })),
          };
          // 同步内存，便于切换站点后保持一致
          const idx = APP_DATA.sites.findIndex((s) => s.host === site.host);
          if (idx >= 0) APP_DATA.sites[idx] = updated;
          try {
            await API.sites.save(site.host, updated);
            render(hostSel.value);
            toast('已保存规则优先级', 'ok');
          } catch (err) {
            toast('保存失败：' + (err && err.message ? err.message : '未知错误'), 'err');
            render(hostSel.value);
          }
        });
      });
    }

    // 全部站点总览：每个域名一个分组，列出其完整序列
    function renderAll() {
      APP_DATA.sites.forEach((site) => {
        const sec = site.security || {};
        const secOn = ['refererMode', 'uaBlacklist', 'ipBlacklist', 'ipWhitelist', 'signedUrl', 'rateLimit', 'botManagement']
          .some((k) => {
            if (k === 'refererMode') return sec.refererMode && sec.refererMode !== 'off';
            if (k === 'signedUrl' || k === 'rateLimit' || k === 'botManagement') return sec[k] && sec[k].enabled;
            return (sec[k] || []).length;
          });
        flow.appendChild(el('div', { class: 'seq-site-head' }, [
          el('div', { class: 'seq-site-name', text: site.host }),
          el('div', { class: 'seq-site-meta' }, [
            el('span', { class: 'seq-chip', text: `${(site.rules || []).length} 条规则` }),
            el('span', { class: 'seq-chip', text: secOn ? '安全已启用' : '安全未配置' }),
            site.poolId ? el('span', { class: 'seq-chip', text: '源站 ' + poolName(site.poolId) }) : null,
            el('span', { class: 'seq-go seq-site-go', text: '编辑站点 →' }),
          ]),
          el('div', { class: 'seq-site-click', onclick: () => openSiteDrawer(site.host) }),
        ]));
        renderSite(site, false);
      });
    }

    const render = (host) => {
      clear(flow);
      if (host === ALL) { renderAll(); return; }
      if (host === '__global__') { renderGlobal(); return; }
      const site = APP_DATA.sites.find((s) => s.host === host) || APP_DATA.sites[0];
      if (!site) return;
      const { ruleNodes, rules } = renderSite(site, true);
      wireRuleDrag(ruleNodes, rules, site);
    };

    // 全站通用规则（兜底）视图：对所有站点生效、优先级最低
    function renderGlobal() {
      const gRules = GLOBAL_RULES.slice();
      // 全站通用规则视图：同样按 18 阶段展示，每阶段列出属于该阶段的全局规则（OR：从上到下匹配）
      // 全站规则是兜底默认，无更上级兜底；点击阶段或规则进入全局规则编辑器。
      function gStage(no, icon, title, stageSummary, matchFn) {
        const matched = gRules.filter((r) => { try { return matchFn(r.action || {}); } catch { return false; } });
        const summary = matched.length
          ? `${matched.length} 条规则（按优先级从上到下匹配，命中即跳出本阶段）；${stageSummary}`
          : `未配置；${stageSummary}`;
        flow.appendChild(seqStage(icon, `${no} ${title}`, summary, matched.length ? `${matched.length} 条` : '未配置', 'sec-rules',
          () => openGlobalRulesDrawer(), '全站通用规则编辑器'));
        if (matched.length) {
          flow.appendChild(el('div', { class: 'seq-rule-list' }, matched.map((r) => {
            const condCount = (r.match && r.match.conditions || []).reduce((n, g) => n + g.length, 0)
              + Object.keys(legacyMatchFields(r.match || {})).length;
            const node = seqRuleInPack(r, ruleSubs(r), condCount, '__global__', false);
            return node;
          })));
        }
      }

      flow.appendChild(seqGroup('全站', '全站通用规则（兜底默认）', '以下规则对任何站点都生效，仅当站点自身规则未命中时才触发，相当于全局默认设置。按 18 阶段分布，每个阶段内部按优先级降序 OR 匹配。'));

      flow.appendChild(seqStage('🛰️', '① 匹配站点', '全站规则不参与匹配站点，仅作为兜底作用于已命中的站点。', '—', null, null, null));

      flow.appendChild(seqGroup('②-③', '安全 / 首要分流（全站维度）', '全站通用规则当前不承载安全包与源站选择，阶段显示空。'));
      flow.appendChild(seqStage('🚧', '②.1~②.5 安全包', '全站通用规则暂不含安全配置，安全在各站点自身配置。', '未配置', null, null, null));
      flow.appendChild(seqStage('🎯', '③ 初始回源对象', '全站通用规则不选择初始源站，源站由各站点自身决定。', '未配置', null, null, null));
      flow.appendChild(seqStage('🔧', '④ URL 规范化', '全站通用规则暂不支持 URL 规范化。', '暂不支持', null, null, null));

      flow.appendChild(seqGroup('⑤-⑪', '规则驱动阶段（全站兜底）', '各阶段全站兜底规则；站点序列某阶段无设置时，即实际生效这些规则。'));
      gStage('⑤', '✂️', 'URL 重写', '按规则改写客户端请求路径', (a) => a.rewrite && a.rewrite.type && a.rewrite.type !== 'none');
      gStage('⑥', '↪️', '重定向规则', '把请求重定向到其它 URL', (a) => a.redirect && a.redirect.enabled);
      gStage('⑦', '🔒', '强制 HTTPS / 直接响应', '命中 http 跳 https，或直接响应', (a) => a.forceHttps || (a.directResponse && a.directResponse.enabled));
      gStage('⑧', '📤', '修改请求头', '回源前增删改 HTTP 头', (a) => { const h = a.reqHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; });
      gStage('⑨', '🔀', 'Origin Rules', '改回源 Host / 回源连接参数 / 候选源站', (a) => a.poolId || (a.inlineOrigins || []).length || (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'accel') || a.engine || a.scheme || Number(a.port) > 0);
      gStage('⑪', '📥', 'Cache Rules（缓存请求设置）', '缓存策略等请求级缓存设置', (a) => a.cache && (a.cache.enabled || a.cache.mode === 'noCache'));
      gStage('⑯', '📝', '改写响应头 / Response Cache Rule', '响应头改写与响应级缓存控制', (a) => { const h = a.respHeaders || {}; return (h.set && Object.keys(h.set).length) || (h.remove || []).length; });

      flow.appendChild(seqGroup('⑫-⑱', '缓存 / 回源 / 响应（运行时）', '全站兜底规则在此被应用；以下为运行时推导行为。'));
      flow.appendChild(seqStage('🔖', '⑫ 缓存键', '合并 policy 时，全站规则的缓存动作作为最低优先级兜底。', '推导', null, null, null));
      flow.appendChild(seqStage('⚡', '⑬ 查缓存', '运行时行为。', '运行时', null, null, null));
      flow.appendChild(seqStage('🗄️', '⑭ 回源循环', '受全站规则的回源连接参数影响。', '运行时', null, null, null));
      flow.appendChild(seqStage('🧬', '⑮ clone', '运行时行为。', '运行时', null, null, null));
      flow.appendChild(seqStage('💾', '⑰ 写缓存', '按 ⑪ 全站缓存策略写入。', '运行时', null, null, null));
      flow.appendChild(seqStage('👤', '⑱ 返回用户', '固定行为。', '固定', null, null, null));

      const btn = el('button', { class: 'btn', text: '编辑全站通用规则' });
      btn.onclick = () => openGlobalRulesDrawer();
      flow.appendChild(el('div', { class: 'seq-tools' }, [btn]));
    }

    hostSel.addEventListener('change', () => render(hostSel.value));
    render(initHost);
    return wrap;
  }

  // 流量序列：阶段分组标题（对应 11-request-flow.md 的 ①②③… 大阶段）
  function seqGroup(no, title, desc) {
    return el('div', { class: 'seq-group' }, [
      el('span', { class: 'seq-group-no', text: no }),
      el('div', { class: 'seq-group-main' }, [
        el('div', { class: 'seq-group-title', text: title }),
        desc ? el('div', { class: 'seq-group-desc', text: desc }) : null,
      ]),
    ]);
  }

  // 流量序列：单个阶段卡片。owner = 该最小任务包归属的抽屉（片段边界，一包一抽屉）
  function seqStage(icon, title, summary, badge, anchor, onClick, owner) {
    const off = badge === '未配置' || badge === '未使用' || badge === '已停用';
    const node = el('div', { class: 'seq-stage' + (onClick ? ' clickable' : '') }, [
      el('div', { class: 'seq-icon', text: icon }),
      el('div', { class: 'seq-main' }, [
        el('div', { class: 'seq-title' }, [
          el('span', {}, title),
          badge != null ? el('span', { class: 'seq-badge ' + (off ? 'off' : 'on') }, badge) : null,
        ]),
        el('div', { class: 'seq-summary', text: summary }),
        owner ? el('div', { class: 'seq-owner', text: '归属：' + owner }) : null,
      ]),
      onClick ? el('div', { class: 'seq-go', text: '前往设置 →' }) : null,
    ]);
    if (onClick) node.onclick = onClick;
    return node;
  }

  // 流量序列：挂在 ④ 规则引擎环节下的具体规则节点。点击打开规则编辑器
  // （整条规则及其所有 action 都在此编辑，不按 action 类型拆子环节）。
  // draggable=true 时整体可拖拽（手柄 + draggable 属性），用于调整优先级。
  function seqRuleInPack(rule, subs, condCount, host, draggable) {
    const a = rule.action || {};
    const head = el('div', { class: 'seq-rule-head' }, [
      draggable ? el('span', { class: 'seq-grip', title: '拖拽调整优先级', text: '⠿' }) : null,
      el('span', { class: 'seq-rule-prio', text: 'P' + (rule.priority || 0) }),
      el('span', { class: 'seq-rule-name', text: (rule.name || (rule.id ? '#' + rule.id : '规则')) + (a.poolId ? ' → ' + poolName(a.poolId) : '') }),
      el('span', { class: 'seq-badge ' + (rule.enabled === false ? 'off' : 'on'), text: rule.enabled === false ? '停用' : '启用' }),
    ]);
    const sub = el('div', { class: 'seq-subs' },
      (subs.length ? subs : ['（无动作，仅作为匹配占位）']).map((s) => el('span', { class: 'seq-chip', text: s })));
    const node = el('div', { class: 'seq-stage seq-rule seq-rule-inpack' + (rule.enabled === false ? ' disabled' : '') + (draggable ? ' seq-rule-drag' : '') }, [
      el('div', { class: 'seq-icon', text: '↳' }),
      el('div', { class: 'seq-main' }, [
        head,
        rule.note ? el('div', { class: 'seq-note muted', text: rule.note }) : null,
        el('div', { class: 'seq-summary', text: `匹配条件：${condCount} 项${condCount ? '（命中即执行下列动作）' : '（匹配全部请求）'}` }),
        sub,
      ]),
      el('div', { class: 'seq-go', text: '编辑规则 →' }),
    ]);
    if (draggable) node.draggable = true;
    node.onclick = () => openRulesDrawer(host);
    return node;
  }

  // ---------------------------------------------------------------------------
  // 通用子组件
  // ---------------------------------------------------------------------------

  // 键值对头部编辑器（set）+ 删除列表（remove）
  // 返回 { root, read() }，read() 返回 { set:{}, remove:[] }
  function headerEditor(initial) {
    initial = initial || { set: {}, remove: [] };
    const setWrap = el('div', { class: 'kv-list' });
    const removeWrap = el('div', { class: 'kv-list' });
    const read = () => {
      const set = {};
      Array.from(setWrap.children).forEach((row) => {
        const k = $('.hk', row).value.trim();
        const v = $('.hv', row).value;
        if (k) set[k] = v;
      });
      const remove = [];
      Array.from(removeWrap.children).forEach((row) => {
        const k = $('.hk', row).value.trim();
        if (k) remove.push(k);
      });
      return { set, remove };
    };
    const addKv = (wrap, k0, v0, withVal) => {
      const row = el('div', { class: 'kv-row' }, [
        el('input', { class: 'input hk', value: k0 || '', placeholder: 'Header-Name' }),
        withVal ? el('input', { class: 'input hv', value: v0 || '', placeholder: 'value' }) : el('span', { class: 'muted', text: '(移除)' }),
        el('button', { class: 'btn btn-sm btn-danger', text: '×', onclick: () => row.remove() }),
      ]);
      wrap.appendChild(row);
    };
    Object.keys(initial.set || {}).forEach((k) => addKv(setWrap, k, initial.set[k], true));
    (initial.remove || []).forEach((k) => addKv(removeWrap, k, '', false));
    if (!setWrap.children.length) addKv(setWrap, '', '', true);
    if (!removeWrap.children.length) addKv(removeWrap, '', '', false);
    const root = el('div', { class: 'header-editor' }, [
      el('div', { class: 'kv-label' }, '新增 / 修改（把某个请求头设成指定值）：'),
      setWrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加', onclick: () => addKv(setWrap, '', '', true) }),
      el('div', { class: 'kv-label' }, '删除（回源 / 返回时去掉某个请求头）：'),
      removeWrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加', onclick: () => addKv(removeWrap, '', '', false) }),
      el('div', { class: 'field-hint muted', text: '请求头就像信封上的备注。回源请求头在请求发给源站前改；节点响应头在结果返回给用户前改。不知道填什么可留空。' }),
    ]);
    root.__read = read;
    return { root, read };
  }

  // 折叠分区（功能分组卡片样式）
  function section(title, desc, children) {
    const body = el('div', { class: 'section-body' }, children);
    const head = el('div', { class: 'section-toggle' }, [
      el('span', { class: 'tw', text: '▸' }),
      el('strong', {}, title),
      desc ? el('span', { class: 'muted', text: ' ' + desc }) : null,
    ]);
    const wrap = el('div', { class: 'subcard' }, [head, body]);
    head.onclick = () => wrap.classList.toggle('collapsed');
    return wrap;
  }

  // 规则操作子模块：默认折叠，仅在「已启用」时展开。
  // watch 为控制开启的控件（checkbox / select）；勾选或切换到非 off 时自动展开，
  // 避免把所有操作的参数一股脑全列出来让用户误以为都要填。
  function opSection(key, title, desc, opts, children) {
    const body = el('div', { class: 'section-body' }, children);
    const head = el('div', { class: 'section-toggle' }, [
      el('span', { class: 'tw', text: '▸' }),
      el('strong', {}, title),
      desc ? el('span', { class: 'muted', text: ' ' + desc }) : null,
    ]);
    const wrap = el('div', { class: 'subcard', id: 'op-' + key }, [head, body]);
    const isOn = () => opts.watch
      ? (opts.watch.type === 'checkbox' ? opts.watch.checked : !!opts.watch.value && opts.watch.value !== 'off')
      : !!opts.enabled;
    if (!isOn()) wrap.classList.add('collapsed');
    head.onclick = () => wrap.classList.toggle('collapsed');
    if (opts.watch) {
      opts.watch.addEventListener('change', () => { if (isOn()) wrap.classList.remove('collapsed'); });
    }
    return wrap;
  }

  // 匹配对象 / 操作符清单
  const MATCH_TARGET_OPTS = [
    { value: 'host', label: 'Host（客户端请求域名）' },
    { value: 'path', label: 'URL 路径' },
    { value: 'fullUrl', label: '完整 URL（含协议、域名、路径、参数）' },
    { value: 'query', label: '查询字符串（Query String）' },
    { value: 'extension', label: '文件后缀' },
    { value: 'filename', label: '文件名称' },
    { value: 'directory', label: '目录' },
    { value: 'method', label: '请求方法' },
    { value: 'protocol', label: '请求协议（HTTP/HTTPS）' },
    { value: 'header', label: '请求头' },
    { value: 'cookie', label: 'Cookie' },
    { value: 'clientIp', label: '客户端 IP' },
    { value: 'clientCountry', label: '客户端地理位置（国家/地区）' },
    { value: 'userAgent', label: 'User-Agent（客户端浏览器标识）' },
    { value: 'referer', label: 'Referer（来源页面）' },
    { value: 'origin', label: '回源目标（源站 ID，由 ③ 首要分流按负载均衡选出）' },
    { value: 'originAddr', label: '回源目标地址（源站 addr，由 ③ 首要分流选出）' },
  ];
  // 运算符对齐 EO 的「运算符」下拉：等于 / 不等于 / 包含 / 正则匹配 / 正则不匹配 / 存在 / 不存在 等
  const MATCH_OP_OPTS = [
    { value: 'equal', label: '等于' },
    { value: 'notEqual', label: '不等于' },
    { value: 'contain', label: '包含' },
    { value: 'notContain', label: '不包含' },
    { value: 'prefix', label: '前缀为' },
    { value: 'notPrefix', label: '前缀不为' },
    { value: 'suffix', label: '后缀为' },
    { value: 'notSuffix', label: '后缀不为' },
    { value: 'regex', label: '正则匹配' },
    { value: 'notRegex', label: '正则不匹配' },
    { value: 'exists', label: '存在' },
    { value: 'notExists', label: '不存在' },
  ];
  const TARGETS_WITH_KEY = ['header', 'cookie', 'query'];
  const OPS_NO_VALUE = ['exists', 'notExists'];

  // 单个条件行：[匹配对象] [键名] [操作符] [值] [忽略大小写] [删除]
  function conditionRow(cond, onRemove) {
    cond = cond || { target: 'path', op: 'prefix', values: [], key: '', ignoreCase: true };
    const tSel = select('', MATCH_TARGET_OPTS, cond.target || 'path');
    tSel.className = 'input';
    const keyInput = el('input', { class: 'input', value: cond.key || '', placeholder: '键名' });
    const opSel = select('', MATCH_OP_OPTS, cond.op || 'prefix');
    opSel.className = 'input';
    const valInput = el('input', {
      class: 'input',
      value: (cond.values || []).join(', '),
      placeholder: '多个值用逗号分隔（之间为“或”）',
    });
    const icCb = el('input', { type: 'checkbox', checked: cond.ignoreCase !== false });
    const valHint = el('span', { class: 'field-hint muted' });

    const keyWrap = el('div', { class: 'cond-cell' }, [keyInput]);
    const valWrap = el('div', { class: 'cond-cell' }, [valInput, valHint]);

    // 运算符对应的填写示例，帮小白看懂“值”该写什么
    const OP_EXAMPLES = {
      equal: '例如填 /index.html 表示路径恰好等于它',
      notEqual: '例如填 /admin 表示路径不是它',
      contain: '例如填 /api 表示路径里包含 /api',
      notContain: '例如填 /private 表示路径不含 /private',
      prefix: '例如填 /img 表示以 /img 开头',
      notPrefix: '例如填 /old 表示不以 /old 开头',
      suffix: '例如填 .php 表示以 .php 结尾',
      notSuffix: '例如填 .css 表示不以 .css 结尾',
      regex: '例如 ^/old/(.*) 表示匹配 /old/ 下的路径；^(.*)$ 表示匹配整条路径（可用 $1 引用）',
      notRegex: '例如 ^/admin 表示不匹配以 /admin 开头',
      exists: '无需填值，只要这个头/参数存在就命中',
      notExists: '无需填值，只要这个头/参数不存在就命中',
    };
    const KEY_HINTS = {
      header: '要匹配的请求头名称，如 User-Agent',
      cookie: '要匹配的 Cookie 名称，如 session',
      query: '要匹配的查询参数名，如 id',
    };
    const ORIGIN_HINT = '回源目标 = ③ 首要分流按负载均衡实际选出的源站。可选源站 ID（exact 匹配）或源站地址（支持包含/前缀/正则）。例如源站池里有 3 个源站，就分别用 3 个「回源目标」条件做分支，⑦~⑱ 共用一条线、⑩⑭ 为真实只读结果。';

    // key 仅对 header/cookie/query 有意义；exists/notExists 不需要值
    const sync = () => {
      const needKey = TARGETS_WITH_KEY.includes(tSel.value);
      keyWrap.style.display = needKey ? '' : 'none';
      keyInput.placeholder = needKey ? (KEY_HINTS[tSel.value] || '键名') : '键名';
      valWrap.style.display = OPS_NO_VALUE.includes(opSel.value) ? 'none' : '';
      valHint.textContent = OPS_NO_VALUE.includes(opSel.value)
        ? ''
        : (tSel.value === 'origin' || tSel.value === 'originAddr')
          ? ORIGIN_HINT
          : (OP_EXAMPLES[opSel.value] || '');
    };
    tSel.onchange = sync;
    opSel.onchange = sync;
    sync();

    const row = el('div', { class: 'cond-row' }, [
      tSel,
      keyWrap,
      opSel,
      valWrap,
      el('label', { class: 'check', title: '不区分大小写（如 Path 与 path 视为相同）' }, [icCb, el('span', { text: '不区分大小写' })]),
      el('button', { class: 'btn btn-sm btn-danger', text: '×', onclick: () => { row.remove(); onRemove && onRemove(); } }),
    ]);

    // 读取该行的当前值（供条件组编辑器汇总）。
    // 缺失此返回值会导致 conditionsEditor 解构得到 undefined，规则编辑器一打开即崩溃。
    const read = () => {
      const value = valInput.value;
      const values = value
        ? value.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      return {
        target: tSel.value,
        op: opSel.value,
        key: keyInput.value.trim(),
        values,
        ignoreCase: icCb.checked,
      };
    };
    return { row, read };
  }

  // 条件组编辑器：外层 OR，内层 AND
  function conditionsEditor(groups) {
    groups = Array.isArray(groups) && groups.length ? groups : [];
    const wrap = el('div', { class: 'cond-groups' });
    const readers = [];

    const addGroup = (conds) => {
      const rows = el('div', { class: 'cond-rows' });
      const groupReaders = [];
      const entry = { readers: groupReaders };

      const addCond = (c) => {
        const { row, read } = conditionRow(c, () => {
          const i = groupReaders.indexOf(read);
          if (i >= 0) groupReaders.splice(i, 1);
        });
        groupReaders.push(read);
        rows.appendChild(row);
      };

      (conds && conds.length ? conds : [null]).forEach(addCond);

      const box = el('div', { class: 'cond-group' }, [
        el('div', { class: 'cond-group-head' }, [
          el('span', { class: 'badge', text: '且（AND）' }),
          el('button', { class: 'btn btn-sm', text: '+ 条件', onclick: () => addCond(null) }),
          el('button', {
            class: 'btn btn-sm btn-danger',
            text: '删除条件组',
            onclick: () => {
              box.remove();
              const i = readers.indexOf(entry);
              if (i >= 0) readers.splice(i, 1);
            },
          }),
        ]),
        rows,
      ]);
      readers.push(entry);
      wrap.appendChild(box);
    };

    groups.forEach(addGroup);

    const root = el('div', {}, [
      el('div', { class: 'muted', text: '条件组之间为「或（OR）」关系，组内条件之间为「且（AND）」关系。不添加任何条件时匹配全部请求。' }),
      wrap,
      el('button', { class: 'btn btn-sm', text: '+ 添加条件组（或）', onclick: () => addGroup(null) }),
    ]);

    const read = () =>
      readers
        .map((g) => g.readers.map((r) => r()).filter((c) => c.op && c.target))
        .filter((g) => g.length > 0);

    return { root, read };
  }

  // 把秒数翻译成人话（约 X 天/小时），小白更容易理解
  function humanDuration(sec) {
    sec = Number(sec) || 0;
    if (sec <= 0) return '';
    if (sec >= 86400) return `（约 ${Math.round(sec / 86400)} 天）`;
    if (sec >= 3600) return `（约 ${Math.round(sec / 3600)} 小时）`;
    if (sec >= 60) return `（约 ${Math.round(sec / 60)} 分钟）`;
    return `（${sec} 秒）`;
  }

  // 缓存策略编辑器（对齐 EO 缓存配置 + 自定义 Cache Key）
  function cacheEditor(c) {
    c = c || {};
    const key = c.key || {};
    const mode = select('', [
      { value: 'ttl', label: '自定义缓存时间（推荐新手）' },
      { value: 'origin', label: '跟随源站 Cache-Control' },
      { value: 'noCache', label: '不缓存（每次回源）' },
    ], c.mode || 'ttl');
    mode.className = 'input';
    const edge = el('input', { class: 'input', type: 'number', value: c.edgeTtl != null ? c.edgeTtl : 15552000, placeholder: '秒' });
    const browser = el('input', { class: 'input', type: 'number', value: c.browserTtl != null ? c.browserTtl : 1800, placeholder: '秒，-1=跟随源站' });
    const edgeHint = el('span', { class: 'field-hint muted' });
    const browserHint = el('span', { class: 'field-hint muted' });
    const iq = el('input', { type: 'checkbox', checked: c.ignoreQuery !== false });
    const qw = el('input', { class: 'input', value: (c.queryWhitelist || []).join(', '), placeholder: '如 id, page（留空=全部保留）' });

    // 自定义 Cache Key
    const ckCase = el('input', { type: 'checkbox', checked: !!key.ignoreCase });
    const ckScheme = el('input', { type: 'checkbox', checked: !!key.includeScheme });
    const ckHeaders = el('input', { class: 'input', value: (key.headers || []).join(', '), placeholder: '如 accept-language' });
    const ckCookies = el('input', { class: 'input', value: (key.cookies || []).join(', '), placeholder: '如 tier' });

    // 高级
    const statusTtl = el('input', {
      class: 'input',
      value: Object.entries(c.statusTtl || {}).map(([k, v]) => k + ':' + v).join(', '),
      placeholder: '如 404:10, 500:5',
    });
    const preRefresh = el('input', { type: 'checkbox', checked: !!c.preRefresh });
    const preP = el('input', { class: 'input', type: 'number', value: c.preRefreshPercent || 80, placeholder: '%' });
    const offline = el('input', { type: 'checkbox', checked: !!c.offlineCache });

    const refreshHints = () => {
      edgeHint.textContent = '节点保存多久再回源' + humanDuration(edge.value);
      browserHint.textContent = '浏览器本地缓存多久（用户重复访问更快）' + humanDuration(browser.value);
    };
    edge.addEventListener('input', refreshHints);
    browser.addEventListener('input', refreshHints);
    refreshHints();

    const ttlBox = el('div', { class: 'grid2' }, [
      field('边缘缓存时长（秒）', edge, edgeHint.textContent),
      field('浏览器缓存时长（秒，-1=跟随源站）', browser, browserHint.textContent),
    ]);
    // 提前刷新百分比：只有开启「提前回源刷新」时才有意义
    const prePField = field('提前刷新触发时机（剩余百分比）', preP, '例如 80 表示缓存还剩 20% 有效期时就开始后台刷新。');
    const syncPre = () => { prePField.style.display = preRefresh.checked ? '' : 'none'; };
    preRefresh.addEventListener('change', syncPre);
    syncPre();
    // 仅当「不忽略查询串」时才需要填白名单
    // 关键：必须持有 field() 返回的容器节点引用，不能用 qw.parentElement —— 此刻
    // qw 尚未插入任何父节点，parentElement 为 null，直接取 .style 会抛
    // TypeError 并中断整个 cacheEditor / 抽屉渲染（表现为按钮点了没反应）
    const qwField = field('只保留这些查询参数（其余忽略）', qw, '关闭「忽略查询参数」后才需要填；例如 id,page，留空表示保留全部。');
    const syncIQ = () => { qwField.style.display = iq.checked ? 'none' : ''; };
    iq.addEventListener('change', syncIQ);
    syncIQ();

    // 「不缓存」模式下，以下全部与缓存相关的字段都无意义，整体隐藏
    const cacheDetail = el('div', {}, [
      ttlBox,
      el('div', { class: 'grid2' }, [
        el('label', { class: 'check' }, [iq, el('span', { text: '忽略 URL 里的查询参数 ?x=1（推荐开启，命中率更高）' })]),
        el('label', { class: 'check' }, [ckCase, el('span', { text: '缓存键不区分大小写' })]),
      ]),
      qwField,
      section('自定义缓存区分维度', '默认按 URL 缓存即可；此项仅在「同一网址但不同内容」时才用', [
        el('div', { class: 'grid2' }, [
          el('label', { class: 'check' }, [ckScheme, el('span', { text: '区分 http 与 https 为两份缓存' })]),
        ]),
        field('额外按请求头来区分（逗号分隔）', ckHeaders, '例如 accept-language，常用于多语言站点。一般不用填。'),
        field('额外按 Cookie 来区分（逗号分隔）', ckCookies, '例如 tier（会员等级）。一般不用填。'),
      ]),
      section('高级缓存', '状态码缓存 / 预刷新 / 离线兜底——一般用不到，保持默认即可', [
        field('给错误页也加缓存（格式 码:秒，逗号分隔）', statusTtl, '例如 404:10 表示 404 页面也缓存 10 秒，减轻源站压力。'),
        el('div', { class: 'grid2' }, [
          el('label', { class: 'check' }, [preRefresh, el('span', { text: '缓存即将过期时提前回源刷新' })]),
          el('label', { class: 'check' }, [offline, el('span', { text: '源站挂了就用旧缓存顶着' })]),
        ]),
        prePField,
      ]),
    ]);
    // 只有「自定义缓存时间」才需要填 TTL；「不缓存」则隐藏所有缓存细节
    const syncMode = () => {
      const noCache = mode.value === 'noCache';
      cacheDetail.style.display = noCache ? 'none' : '';
      ttlBox.style.display = mode.value === 'ttl' ? '' : 'none';
    };
    mode.onchange = syncMode;
    syncMode();

    const root = el('div', {}, [
      field('缓存模式', mode, '自定义缓存时间：固定存多久；跟随源站：由源站响应头决定；不缓存：每次都回源（适合动态内容）。'),
      cacheDetail,
    ]);

    const read = () => {
      const st = {};
      statusTtl.value.split(',').map((s) => s.trim()).filter(Boolean).forEach((pair) => {
        const [k, v] = pair.split(':').map((x) => (x || '').trim());
        if (k && v && !isNaN(Number(k)) && !isNaN(Number(v))) st[k] = Number(v);
      });
      return {
        enabled: mode.value !== 'noCache',
        mode: mode.value,
        edgeTtl: Number(edge.value) || 0,
        browserTtl: browser.value === '' ? 0 : Number(browser.value),
        ignoreQuery: iq.checked,
        queryWhitelist: qw.value.split(',').map((s) => s.trim()).filter(Boolean),
        key: {
          ignoreCase: ckCase.checked,
          includeScheme: ckScheme.checked,
          headers: ckHeaders.value.split(',').map((s) => s.trim()).filter(Boolean),
          cookies: ckCookies.value.split(',').map((s) => s.trim()).filter(Boolean),
        },
        statusTtl: st,
        preRefresh: preRefresh.checked,
        preRefreshPercent: Number(preP.value) || 80,
        offlineCache: offline.checked,
      };
    };
    return { root, read };
  }

  // 重写编辑器
  // 路径重写的纯前端预览（与 src/proxy/rewrite.js 的 applyRewrite 保持一致）
  function previewRewrite(pathname, rewrite) {
    const type = rewrite && rewrite.type || 'none';
    let out = pathname || '/';
    try {
      if (type === 'prefix') {
        const v = (rewrite.value || '').replace(/\/+$/, '');
        const right = (out || '').replace(/^\/+/, '');
        out = (v ? `${v}/${right || ''}` : `/${right}`);
      } else if (type === 'strip') {
        const v = rewrite.value || '';
        if (v && out.startsWith(v)) out = out.slice(v.length);
      } else if (type === 'regex') {
        const re = new RegExp(rewrite.regexFrom || '', 'g');
        out = out.replace(re, rewrite.regexTo ?? '');
      }
    } catch { out = pathname; }
    if (!out.startsWith('/')) out = `/${out}`;
    out = out.replace(/\/{2,}/g, '/');
    return out || '/';
  }

  function rewriteEditor(r) {
    r = r || { type: 'none', value: '', regexFrom: '', regexTo: '' };
    const TYPES = {
      none:   { label: '不重写（保持原路径）', desc: '客户端请求什么路径，就回源什么路径。绝大多数情况选这个即可。' },
      prefix: { label: '前缀替换（在路径前加一段）', desc: '把请求路径整体“搬”到一个新目录下，例如把 /img/x.png 变成 /api/img/x.png。' },
      strip:  { label: '去除前缀（去掉开头的某段）', desc: '剥掉路径开头的固定前缀，例如把 /img/x.png 变成 /x.png（常用于隐藏子目录）。' },
      regex:  { label: '正则重写（高级，按规则改写）', desc: '用正则表达式把路径的一部分替换为另一段，适合批量/复杂改写。不懂正则也没关系，下面给了几个最常⻏又好用的简单示例，点一下就能套用。' },
    };
    const typeSel = select('', [], r.type || 'none', Object.entries(TYPES).map(([v, t]) => ({ value: v, label: t.label })));
    typeSel.className = 'input';
    const desc = el('div', { class: 'rw-desc muted' });
    const valueInput = el('input', { class: 'input rw-val', value: r.value || '', placeholder: '例如 /api 或 /img' });
    const fromInput = el('input', { class: 'input rw-from', value: r.regexFrom || '', placeholder: '例如 ^/old/(.*)' });
    const toInput = el('input', { class: 'input rw-to', value: r.regexTo || '', placeholder: '例如 /new/$1' });
    const fieldsBox = el('div', { class: 'rw-fields' });
    // 示例请求路径：仅用于本地预览，不写入规则配置（避免被误当成真实字段填写）
    const sampleInput = el('input', { class: 'input', value: '/img/photo.png', placeholder: '示例路径，仅用于预览，不会保存' });
    // 预览结果：只读展示，用户不可修改（不是编辑框）
    const previewBox = el('code', { class: 'rw-preview' });

    function renderFields() {
      const t = typeSel.value;
      desc.textContent = TYPES[t].desc;
      fieldsBox.innerHTML = '';
      if (t === 'prefix' || t === 'strip') {
        fieldsBox.appendChild(field(t === 'prefix' ? '要添加 / 去除的路径前缀' : '要去除的开头前缀', valueInput));
        fieldsBox.appendChild(el('div', { class: 'rw-example muted', text: t === 'prefix'
          ? '示例：填 /api，则 /img/x.png → /api/img/x.png'
          : '示例：填 /img，则 /img/x.png → /x.png' }));
      } else if (t === 'regex') {
        fieldsBox.appendChild(field('匹配规则（源正则）', fromInput));
        fieldsBox.appendChild(field('替换为（目标，可用 $1 $2 引用分组）', toInput));
        // 小白友好的常用简单示例：点一下即可套用（源正则 + 目标）
        const EXAMPLES = [
          { from: '^(.*)$', to: '$1', note: '整体原样透传（保留完整路径，仅做占位/后续拼接用）' },
          { from: '^/old/(.*)', to: '/new/$1', note: '目录迁移：/old/a.png → /new/a.png' },
          { from: '^(.*)\\.html$', to: '$1', note: '去掉 .html 后缀：/page.html → /page' },
        ];
        const exampleBox = el('div', { class: 'rw-examples' }, [
          el('div', { class: 'muted', text: '常用简单示例（点击套用）：' }),
          ...EXAMPLES.map((ex) => {
            const btn = el('button', { class: 'rw-example-btn', type: 'button', text: `${ex.from}  →  ${ex.to}` });
            btn.addEventListener('click', () => {
              fromInput.value = ex.from;
              toInput.value = ex.to;
              renderPreview();
            });
            return el('div', { class: 'rw-example-item' }, [
              btn,
              el('span', { class: 'muted', text: ex.note }),
            ]);
          }),
        ]);
        fieldsBox.appendChild(exampleBox);
      }
    }
    function renderPreview() {
      const sample = sampleInput.value || '/';
      const result = previewRewrite(sample, { type: typeSel.value, value: valueInput.value, regexFrom: fromInput.value, regexTo: toInput.value });
      previewBox.textContent = `${sample}  →  ${result}`;
    }
    typeSel.addEventListener('change', () => { renderFields(); renderPreview(); });
    valueInput.addEventListener('input', renderPreview);
    fromInput.addEventListener('input', renderPreview);
    toInput.addEventListener('input', renderPreview);
    sampleInput.addEventListener('input', renderPreview);

    renderFields();
    renderPreview();

    const root = el('div', { class: 'rw-editor' }, [
      field('类型', typeSel),
      desc,
      fieldsBox,
      el('div', { class: 'rw-preview-row' }, [
        field('示例请求路径（仅预览用，不保存）', sampleInput),
        el('div', { class: 'rw-preview-wrap' }, [
          el('span', { class: 'ro-tag', text: '只读预览' }),
          el('span', { class: 'muted', text: '实际回源路径：' }),
          previewBox,
        ]),
      ]),
    ]);
    const read = () => ({
      type: typeSel.value,
      value: valueInput.value,
      regexFrom: fromInput.value,
      regexTo: toInput.value,
    });
    return { root, read };
  }

  // 旧版快捷条件字段：后端 matcher 仍支持，但编辑器/流量序列只认 conditions。
  const LEGACY_MATCH_KEYS = ['extIn', 'pathPrefix', 'pathRegex', 'methodIn'];

  // 把旧版快捷条件并入 conditions（用于编辑器展示）。已存在的 conditions 不动，
  // 旧字段转换为等价的 conditions 条目追加进第 0 个 AND 组。
  function normalizeMatchForEditor(match) {
    match = match || {};
    const groups = Array.isArray(match.conditions) ? match.conditions.map((g) => (Array.isArray(g) ? g.slice() : [])) : [];
    const first = groups.length ? groups[0] : [];
    const push = (c) => first.push(c);
    if (Array.isArray(match.extIn) && match.extIn.length) {
      push({ target: 'extension', op: 'equal', ignoreCase: true, values: match.extIn.map((e) => String(e).toLowerCase().replace(/^\./, '')) });
    }
    if (match.pathPrefix) {
      push({ target: 'path', op: 'prefix', ignoreCase: true, values: [match.pathPrefix] });
    }
    if (match.pathRegex) {
      push({ target: 'path', op: 'regex', values: [match.pathRegex] });
    }
    if (Array.isArray(match.methodIn) && match.methodIn.length) {
      push({ target: 'method', op: 'equal', values: match.methodIn.map((m) => String(m).toUpperCase()) });
    }
    if (first.length) {
      if (!groups.length) groups.push(first);
      else groups[0] = first;
    }
    return { ...match, conditions: groups };
  }

  // 提取并回写旧版快捷字段，与 conditions 并存，保证后端匹配语义不丢。
  function legacyMatchFields(match) {
    match = match || {};
    const out = {};
    for (const k of LEGACY_MATCH_KEYS) {
      if (match[k] !== undefined && match[k] !== '' && !(Array.isArray(match[k]) && !match[k].length)) out[k] = match[k];
    }
    return out;
  }

  // 构建单条规则卡片（可视化规则引擎）
  function buildRuleCard(rule, poolOptions, site, opts) {
    opts = opts || {};
    // allowedOps：受限模式下，只允许添加/编辑这些操作（一个最小任务包一个抽屉，禁止越界）。
    // 为 null 表示「完整规则编辑器」（④.1 / ④.2 通用抽屉），不做限制。
    const allowed = opts.allowedOps ? new Set(opts.allowedOps) : null;
    const hideTargetPool = !!opts.hideTargetPool;
    rule = rule || { id: '', priority: 0, enabled: true, match: { conditions: [] }, action: { poolId: '', rewrite: { type: 'none' }, cache: { enabled: true }, reqHeaders: { set: {}, remove: [] }, respHeaders: { set: {}, remove: [] } } };
    const en = el('input', { type: 'checkbox', checked: rule.enabled !== false });
    // 规则名与备注：纯展示用，不影响匹配。模板生成的规则预填了它们，
    // 手动加的规则也建议写上，否则几个月后没人记得这条规则是干嘛的。
    const rName = el('input', { class: 'input', value: rule.name || '', placeholder: '如：静态资源长缓存（选填）' });
    const rNote = el('input', { class: 'input', value: rule.note || '', placeholder: '这条规则为什么这么配（选填）' });
    const priority = el('input', { class: 'input', type: 'number', value: rule.priority || 0, placeholder: '数字，越小越靠上（先匹配）' });
    // 目标源站：下拉选择已有源站（单一源站或源站池），也可直接输入其 id；
    // 单一源站与源站池在同一个下拉里，引用方式完全一致（都是 poolId）。
    // （该字段仅属于 ④.7 候选源站，非 ④.7 的受限抽屉会隐藏它以避免越界。）
    const poolListId = 'poollist-' + (rule.id || 'new') + '-' + Math.random().toString(36).slice(2, 7);
    const poolSel = el('input', { class: 'input', list: poolListId, value: rule.action.poolId || '', placeholder: '留空=用站点默认源站；或选择本规则专用的源站' });
    const poolDatalist = el('datalist', { id: poolListId }, poolOptions.map((o) => el('option', { value: o.value, label: o.label })));
    // 旧版快捷条件（extIn / pathPrefix / pathRegex / methodIn）后端仍支持，
    // 但编辑器与流量序列只认 conditions。打开规则时把旧格式并入 conditions 用于展示，
    // 保存时原样回写这些旧字段（与 conditions 并存，后端两种都认），不丢匹配语义。
    const matchForEditor = normalizeMatchForEditor(rule.match || {});
    rule = { ...rule, match: matchForEditor };
    // 可视化条件编辑器
    const conds = conditionsEditor(rule.match.conditions);

    // —— 操作区：只渲染用户实际「添加」的操作卡片，未添加的操作根本不渲染 ——
    const ACTION_GROUPS = [
      { group: '缓存配置', items: [{ value: 'cache', label: '节点缓存 TTL / 缓存模式' }] },
      { group: 'HTTPS 优化', items: [
        { value: 'forceHttps', label: '强制 HTTPS 访问' },
        { value: 'redirect', label: '访问 URL 重定向' },
        { value: 'directResponse', label: '自定义响应（直接应答）' },
      ] },
      { group: '修改 HTTP 头', items: [
        { value: 'reqHeaders', label: '回源请求头' },
        { value: 'respHeaders', label: '节点响应头' },
        { value: 'hostHeader', label: '回源 Host' },
        { value: 'clientIp', label: '客户端 IP 透传' },
      ] },
      { group: '网络优化', items: [
        { value: 'rewrite', label: '路径重写（回源 URL 改写）' },
        { value: 'followRedirect', label: '回源跟随 3xx' },
        { value: 'originTimeout', label: '回源超时' },
        { value: 'originConn', label: '回源连接参数（引擎/协议/端口）' },
      ] },
    ];
    // 受限模式：只展示白名单内的操作分组，下拉里不会出现越界动作
    const shownGroups = allowed
      ? ACTION_GROUPS.map((g) => ({ group: g.group, items: g.items.filter((it) => allowed.has(it.value)) })).filter((g) => g.items.length)
      : ACTION_GROUPS;

    // 单个操作卡片：标题可折叠，右上角带「移除」按钮。
    function opNode(key, title, desc, bodyNodes, read) {
      const tw = el('span', { class: 'tw', text: '▸' });
      const body = el('div', { class: 'section-body' }, bodyNodes);
      const head = el('div', { class: 'section-toggle' }, [
        tw,
        el('strong', {}, title),
        desc ? el('span', { class: 'muted', text: ' ' + desc }) : null,
      ]);
      const wrap = el('div', { class: 'subcard op-node', id: 'op-' + key }, [head, body]);
      head.onclick = () => wrap.classList.toggle('collapsed');
      return { node: wrap, read };
    }

    // 每个操作的自包含构建器：返回 { node, read }，node 由 mountOp 负责加「移除」按钮。
    const OP_BUILDERS = {
      cache(a) {
        const ed = cacheEditor(a.cache);
        return opNode('cache', '缓存配置', 'EO：节点缓存 TTL、缓存模式、自定义 Cache Key', [ed.root], () => ed.read());
      },
      forceHttps(a) {
        const en = el('input', { type: 'checkbox', checked: !!a.forceHttps });
        const st = select('', [
          { value: '301', label: '301 永久重定向' },
          { value: '302', label: '302 临时重定向（默认）' },
        ], String(a.forceHttpsStatus || 301));
        st.className = 'input';
        // 未启用强制 HTTPS 时，跳转方式无意义，完全隐藏
        const stField = field('跳转方式', st);
        const syncEn = () => { stField.style.display = en.checked ? '' : 'none'; };
        en.addEventListener('change', syncEn);
        syncEn();
        const read = () => ({ forceHttps: en.checked, forceHttpsStatus: Number(st.value) || 301 });
        return opNode('forceHttps', '强制 HTTPS 访问', '开启后将 HTTP 请求跳转至 HTTPS', [
          el('div', { class: 'grid2' }, [
            el('label', { class: 'check' }, [en, el('span', { text: '启用强制 HTTPS' })]),
            stField,
          ]),
        ], read);
      },
      redirect(a) {
        const rd = a.redirect || {};
        const en = el('input', { type: 'checkbox', checked: !!rd.enabled });
        const status = select('', [
          { value: '301', label: '301 永久重定向' },
          { value: '302', label: '302 临时重定向' },
          { value: '307', label: '307 临时（保持方法）' },
          { value: '308', label: '308 永久（保持方法）' },
        ], String(rd.status || 302));
        status.className = 'input';
        const target = el('input', { class: 'input', value: rd.target || '', placeholder: '/new-path 或 https://b.com/$1' });
        const keep = el('input', { type: 'checkbox', checked: rd.keepQuery !== false });
        const read = () => ({ redirect: { enabled: en.checked, status: Number(status.value) || 302, target: target.value.trim(), keepQuery: keep.checked } });
        // 未启用重定向时，状态码 / 保留查询串 / 目标 URL 全部无意义，完全隐藏
        const grid = el('div', { class: 'grid2' }, [
          field('状态码', status),
          el('label', { class: 'check' }, [keep, el('span', { text: '保留原查询串' })]),
        ]);
        const targetField = field('目标 URL（支持 $1..$9 引用路径正则捕获组）', target);
        const syncEn = () => {
          grid.style.display = en.checked ? '' : 'none';
          targetField.style.display = en.checked ? '' : 'none';
        };
        en.addEventListener('change', syncEn);
        syncEn();
        return opNode('redirect', '访问 URL 重定向', '命中后直接 3xx 跳转，不回源', [
          el('label', { class: 'check' }, [en, el('span', { text: '启用重定向' })]),
          grid,
          targetField,
        ], read);
      },
      directResponse(a) {
        const dr = a.directResponse || {};
        const en = el('input', { type: 'checkbox', checked: !!dr.enabled });
        const status = el('input', { class: 'input', type: 'number', value: dr.status || 200 });
        const ct = el('input', { class: 'input', value: dr.contentType || 'text/html; charset=utf-8' });
        const body = el('textarea', { class: 'input', rows: 4, placeholder: '响应内容' });
        body.value = dr.body || '';
        const read = () => ({ directResponse: { enabled: en.checked, status: Number(status.value) || 200, contentType: ct.value.trim(), body: body.value } });
        // 未启用时，状态码 / Content-Type / 响应内容全部无意义，完全隐藏
        const grid = el('div', { class: 'grid2' }, [ field('状态码', status), field('Content-Type', ct) ]);
        const bodyField = field('响应内容', body);
        const syncEn = () => {
          grid.style.display = en.checked ? '' : 'none';
          bodyField.style.display = en.checked ? '' : 'none';
        };
        en.addEventListener('change', syncEn);
        syncEn();
        return opNode('directResponse', '自定义响应', '命中后直接返回内容，不回源', [
          el('label', { class: 'check' }, [en, el('span', { text: '启用自定义响应' })]),
          grid,
          bodyField,
        ], read);
      },
      reqHeaders(a) {
        const ed = headerEditor(a.reqHeaders);
        return opNode('reqHeaders', '回源请求头', '转发到源站前修改', [ed.root], () => ed.read());
      },
      respHeaders(a) {
        const ed = headerEditor(a.respHeaders);
        return opNode('respHeaders', '节点响应头', '返回给客户端前修改', [ed.root], () => ed.read());
      },
      hostHeader(a) {
        const hh = a.hostHeader || { mode: 'inherit', custom: '' };
        const sel = select('', [
          { value: 'inherit', label: '继承（用站点默认回源 Host）' },
          { value: 'origin', label: '源站域名' },
          { value: 'client', label: '客户端 Host' },
          { value: 'custom', label: '自定义' },
        ], hh.mode || 'inherit');
        sel.className = 'input';
        const custom = el('input', { class: 'input', value: hh.custom || '', placeholder: 'origin.example.com' });
        const customField = field('自定义值', custom);
        // 仅「自定义」模式需要填值，其余模式该框无效，完全隐藏避免误导
        const syncMode = () => { customField.style.display = sel.value === 'custom' ? '' : 'none'; };
        sel.addEventListener('change', syncMode);
        syncMode();
        const read = () => ({ hostHeader: { mode: sel.value, custom: sel.value === 'custom' ? custom.value.trim() : '' } });
        return opNode('hostHeader', '回源 Host', '重写回源 Host 头', [ field('模式', sel), customField ], read);
      },
      clientIp(a) {
        const cip = a.clientIpHeader || {};
        const en = el('input', { type: 'checkbox', checked: !!cip.enabled });
        const name = el('input', { class: 'input', value: cip.name || 'X-EdgeGateway-Client-IP', placeholder: 'X-EdgeGateway-Client-IP' });
        const read = () => ({ clientIpHeader: { enabled: en.checked, name: name.value.trim() || 'X-EdgeGateway-Client-IP' } });
        // 未开启透传时，头部名无意义，完全隐藏
        const nameField = field('存放客户端 IP 的头部名', name);
        const syncEn = () => { nameField.style.display = en.checked ? '' : 'none'; };
        en.addEventListener('change', syncEn);
        syncEn();
        return opNode('clientIp', '客户端 IP 透传', '将真实客户端 IP 写入指定回源头（默认 X-EdgeGateway-Client-IP），供源站识别访客', [
          el('label', { class: 'check' }, [en, el('span', { text: '向源站透传客户端 IP' })]),
          nameField,
        ], read);
      },
      rewrite(a) {
        const ed = rewriteEditor(a.rewrite);
        return opNode('rewrite', '路径重写', '改写回源 URL 路径', [ed.root], () => ed.read());
      },
      followRedirect(a) {
        const en = el('input', { type: 'checkbox', checked: !!a.followRedirect });
        const read = () => ({ followRedirect: en.checked });
        return opNode('followRedirect', '回源跟随 3xx 重定向', '', [
          el('div', { class: 'grid2' }, [
            el('label', { class: 'check' }, [en, el('span', { text: '回源跟随 3xx 重定向' })]),
          ]),
        ], read);
      },
      originTimeout(a) {
        const inp = el('input', { class: 'input', type: 'number', value: a.originTimeoutMs || 0, placeholder: '毫秒，0=沿用源站设置' });
        const read = () => ({ originTimeoutMs: Number(inp.value) || 0 });
        return opNode('originTimeout', '回源超时', '', [ field('回源超时（毫秒，0=沿用源站）', inp) ], read);
      },
      originConn(a) {
        // 回源连接参数（⑨ Origin Rules）：规则级覆盖源站物理属性。
        // 留空/0 = 沿用源站对应值，向后兼容旧版「源站级规则」语义。
        const engine = select('', [
          { value: '', label: '沿用源站引擎' },
          { value: 'fetch', label: 'fetch（HTTP 回源）' },
          { value: 'socket', label: 'socket（TCP 透传，仅 CF）' },
          { value: 'r2', label: 'r2（R2 直读，仅 CF）' },
        ], a.engine || '');
        engine.className = 'input';
        const scheme = select('', [
          { value: '', label: '沿用源站协议' },
          { value: 'https', label: 'https' },
          { value: 'http', label: 'http' },
        ], a.scheme || '');
        scheme.className = 'input';
        const port = el('input', { class: 'input', type: 'number', value: a.port || 0, placeholder: '0=沿用源站端口' });
        const read = () => ({
          engine: engine.value || '',
          scheme: scheme.value || '',
          port: Number(port.value) || 0,
        });
        return opNode('originConn', '回源连接参数', '覆盖本次回源的引擎 / 协议 / 端口（留空=沿用源站物理属性）', [
          el('div', { class: 'grid2' }, [
            field('回源引擎', engine),
            field('回源协议', scheme),
          ]),
          field('回源端口（0=沿用源站）', port),
        ], read);
      },
    };

    // 根据已有 rule.action 推断哪些操作是「已启用」的
    function activeOpKeys(a) {
      const s = new Set();
      if (a.cache) s.add('cache');
      if (a.forceHttps) s.add('forceHttps');
      if (a.redirect && a.redirect.enabled) s.add('redirect');
      if (a.directResponse && a.directResponse.enabled) s.add('directResponse');
      if (a.reqHeaders) s.add('reqHeaders');
      if (a.respHeaders) s.add('respHeaders');
      if (a.hostHeader && a.hostHeader.mode && a.hostHeader.mode !== 'inherit') s.add('hostHeader');
      if (a.clientIpHeader && a.clientIpHeader.enabled) s.add('clientIp');
      if (a.rewrite && a.rewrite.type && a.rewrite.type !== 'none') s.add('rewrite');
      if (a.followRedirect) s.add('followRedirect');
      if (Number(a.originTimeoutMs) > 0) s.add('originTimeout');
      if (a.engine || a.scheme || Number(a.port) > 0) s.add('originConn');
      return s;
    }

    const opsList = el('div', { class: 'ops-list' });
    const opReaders = [];
    const mounted = new Set();

    // 挂载一个操作卡片（已挂载则展开定位，不重复添加）
    function mountOp(key) {
      if (!OP_BUILDERS[key]) return;
      // 受限模式：不允许挂载白名单之外的操作，杜绝越界
      if (allowed && !allowed.has(key)) return;
      if (mounted.has(key)) {
        const n = document.getElementById('op-' + key);
        if (n) n.classList.remove('collapsed');
        return;
      }
      const built = OP_BUILDERS[key](rule.action);
      mounted.add(key);
      opReaders.push(built.read);
      const removeBtn = el('button', { class: 'btn btn-sm btn-danger op-remove', text: '移除' });
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        built.node.remove();
        const i = opReaders.indexOf(built.read);
        if (i >= 0) opReaders.splice(i, 1);
        mounted.delete(key);
      };
      built.node.querySelector('.section-toggle').appendChild(removeBtn);
      opsList.appendChild(built.node);
      built.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const actionAddSel = selectWithGroups(shownGroups, '');
    actionAddSel.className = 'input';
    actionAddSel.addEventListener('change', () => {
      const v = actionAddSel.value;
      if (!v) return;
      mountOp(v);
      actionAddSel.value = '';
    });

    // 初始只挂载该规则实际启用的操作卡片（受限模式下只挂白名单内的）
    activeOpKeys(rule.action).forEach((k) => { if (!allowed || allowed.has(k)) mountOp(k); });

    const card = el('div', { class: 'rule-card', id: 'rule-' + (rule.id || 'new') }, [
      el('div', { class: 'rule-head' }, [
        el('label', { class: 'check' }, [en, el('span', { text: '启用' })]),
        field('优先级', priority),
        el('button', { class: 'btn btn-sm btn-danger', text: '删除规则', onclick: () => card.remove() }),
      ]),
      field('规则名称', rName, '给这条规则起个一眼能看懂的名字，会显示在流量序列里。'),
      field('备注', rNote, '记下这么配的原因，方便日后自己或同事回看。'),
      section('匹配条件（决定哪些请求命中此规则）', '每个条件组内的多条条件为「与」关系，多个条件组之间为「或」关系', [
        conds.root,
      ]),
      // 目标源站 + 按需添加的「操作卡片」：未添加的操作不渲染
      section('操作（命中后执行的操作）', allowed
        ? '本抽屉仅允许配置「' + opts.title + '」所属的最小任务包，不可越界添加其它动作类型。'
        : '先选「目标源站」，再点「添加操作」加入需要的动作；每个动作是独立卡片，未添加的不显示', [
        // 目标源站属于 ④.7 候选源站，非 ④.7 的受限抽屉隐藏，避免越界
        ...(hideTargetPool ? [] : [field('目标源站（这条规则命中后回到哪台后端）', el('div', {}, [poolSel, poolDatalist]),
          '决定「命中条件的请求」回源到哪个源站：留空则回退到站点默认源站；也可从「源站」页已有的单一源站 / 源站池里选一个。简单站一般不用改，留空即可。')]),
        ...(shownGroups.length ? [el('div', { class: 'op-add' }, [
          el('span', { class: 'op-add-label', text: '添加操作：' }),
          actionAddSel,
        ])] : [el('div', { class: 'hint' }, '本任务包没有可添加的子操作（仅「目标源站」一项）。')]),
        opsList,
      ]),
    ]);

    const read = () => {
      // 受限模式：以原始 action 为基底，只覆盖本包允许编辑的字段，其余字段原样保留（不丢数据、不越界）
      const action = allowed ? JSON.parse(JSON.stringify(rule.action || {})) : {};
      if (!allowed || !hideTargetPool) action.poolId = poolSel.value;
      for (const r of opReaders) Object.assign(action, r());
      return {
        id: rule.id || ('r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
        // name/note 跟随规则一起回写。不带上就会在每次保存时被抹掉，
        // 模板生成的说明文字也会随之丢失。
        name: rName.value.trim(),
        note: rNote.value.trim(),
        enabled: en.checked,
        priority: Number(priority.value) || 0,
        match: {
          // 保留原始 match 里的旧版快捷字段（extIn / pathPrefix / pathRegex / methodIn），
          // 与 conditions 并存——后端两种都认，避免任何边界下匹配语义丢失。
          ...legacyMatchFields(rule.match || {}),
          conditions: conds.read(),
        },
        action,
      };
    };
    return { card, read };
  }

  // 全站通用规则（兜底）编辑器：规则对所有站点生效，仅当站点自身规则未命中时触发
  async function openGlobalRulesDrawer() {
    let rules = [];
    try {
      const data = await API.rules.global();
      rules = (data && data.rules) || [];
    } catch (e) {
      toast('读取全站通用规则失败：' + (e && e.message ? e.message : '未知错误'), 'err');
      return;
    }
    const poolOptions = buildPoolOptions();

    const rulesBox = el('div', { class: 'rules-box' });
    const ruleReaders = [];
    rules.forEach((r) => {
      const { card, read } = buildRuleCard(r, poolOptions);
      ruleReaders.push(read);
      rulesBox.appendChild(card);
    });

    const addRuleBtn = el('button', { class: 'btn btn-sm', text: '+ 添加规则' });
    addRuleBtn.onclick = () => {
      const { card, read } = buildRuleCard(null, poolOptions);
      ruleReaders.push(read);
      rulesBox.appendChild(card);
    };

    const body = el('div', { class: 'drawer-body' }, [
      el('p', { class: 'hint' }, '全站通用规则对任何站点都生效，仅当某站点的自身规则未命中时才触发，相当于全局默认设置（EO 的全局规则概念）。按优先级从上到下匹配，每条规则可独立配置匹配条件与动作。'),
      el('div', { class: 'subhead' }, [el('span', {}, '全站通用规则'), addRuleBtn]),
      rulesBox,
    ]);

    const onSave = async () => {
      const out = [];
      for (const read of ruleReaders) {
        const r = read();
        if (r) out.push(r);
      }
      await API.rules.saveGlobal(out);
    };

    openDrawer('全站通用规则（兜底）', '以下规则对所有站点生效，仅当站点自身规则未命中时触发（全局默认设置）', body, onSave);
  }

  // ⑫ 缓存键阶段的专属抽屉：只编辑「站点缓存代次 cacheGen」，不与 ① 站点基础抽屉重复联动。
  // ⑪ Cache Rules 的缓存策略由「路由规则」抽屉管理；这里的 cacheGen 才是 ⑫ 阶段唯一可干预项。
  async function openCacheGenDrawer(host, cacheRuleCount, hasCache) {
    if (!host) { toast('请先创建站点', 'err'); return; }
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    const fGen = el('input', { class: 'input', id: 'f-cachegen', type: 'number', min: '0', value: site.cacheGen || 0 });
    const body = el('div', {}, [
      el('div', { class: 'subhead' }, [el('span', {}, '⑫ 缓存键 · 缓存代次')]),
      el('div', { class: 'hint' },
        '本抽屉只管理「缓存代次（cacheGen）」这一项，用于一键批量让旧缓存失效（代次 +1 后旧 key 自然失配）。'
        + '其它缓存设置（edgeTtl / SWR / browserTtl / 绕过缓存）属于 ⑪「Cache Rules」阶段，请在对应阶段的规则抽屉里配置，避免与 ① 站点基础重复。'),
      field('缓存代次 cacheGen', fGen, '整数，默认 0。修改并保存后即视为「代次 +1」语义（旧缓存 key 失配，下次回源重新填充）。'),
      el('div', { class: 'hint' },
        `当前站点 ⑪ 缓存动作 ${cacheRuleCount} 条${hasCache ? '（已启用节点缓存）' : '（未启用节点缓存）'}；代次变更仅影响 cacheKey 维度，不影响缓存策略本身。`),
    ]);
    openDrawer('⑫ 缓存键: ' + host, '仅调整缓存代次，使旧缓存批量失效。', body, async () => {
      const gen = Math.max(0, Number(fGen.value) || 0);
      const patch = { cacheGen: gen };
      try {
        await API.sites.saveBasics(host, patch);
        toast('已保存缓存代次', 'ok');
        await refreshData();
      } catch (e) { toast(e.message, 'err'); }
    });
  }

  async function openSiteDrawer(host, anchor) {
    let site;
    if (host) {
      try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    } else {
      site = { host: '', enabled: true, poolId: '', rules: [], security: {}, cacheGen: 0 };
    }
    const editing = !!(site && site.host);

    // ① 匹配站点：仅承载「按 Host 命中站点」这一包，不含任何源站/规则/安全配置
    const fHost = el('input', { class: 'input', id: 'f-host', value: site.host || '', placeholder: 'example.com 或 *.example.com' });
    const fEnabled = el('input', { type: 'checkbox', id: 'f-enabled', checked: site.enabled !== false });
    const fIpv6 = el('input', { type: 'checkbox', id: 'f-ipv6', checked: !!(site.ipv6Support) });

    const body = el('div', {}, [
      el('div', { class: 'subhead', id: 'sec-basic' }, [el('span', {}, '① 匹配站点')]),
      el('div', { class: 'hint' }, '按 Host 命中站点配置，决定后续整条管线走哪套设置。源站 / 规则 / 安全分别在 ③ / ④ / ② 的独立抽屉配置，互不越界。'),
      field('加速域名（Host）', fHost, editing ? '编辑时不能修改，如需更改请在「站点总览」删除重建。' : '你接入加速的域名，例如 example.com。'),
      field('启用', fEnabled),
      field('支持 IPv6 访问', fIpv6),
    ]);

    // ── ② 默认源站（仅新建时出现）────────────────────────────────────
    // 新建站点时必须绑定一个源站；可选「填写域名/IP」（自动创建单一源站）或「选择已有源站」
    let fOriginMode, fPoolSel, fAddr, fPort, fScheme, fEngine, fHostMode, fHostCustom;
    if (!editing) {
      const poolOptions = buildPoolOptions();
      fOriginMode = select('f-origin-mode', [
        { value: 'inline', label: '填写域名/IP' },
        { value: 'pool', label: '选择已有源站' },
      ], 'inline');
      fOriginMode.className = 'input';

      // 「选择已有源站」模式
      fPoolSel = select('f-dup-pool', [{ value: '', label: poolOptions.length ? '（请选择）' : '（暂无可用源站）' }, ...poolOptions], '');
      fPoolSel.className = 'input';
      const fPoolRow = field('已有源站', fPoolSel, '从「源站」标签页已创建的单一源站或源站池中选择。');

      // 「填写域名/IP」模式：最简必填项
      fAddr = el('input', { class: 'input', id: 'f-addr', value: '', placeholder: 'storage.example.com 或 1.2.3.4' });
      fPort = el('input', { class: 'input', id: 'f-port', type: 'number', value: '443' });
      fScheme = select('f-scheme', [], 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }]);
      fScheme.className = 'input';
      fEngine = select('f-engine', [], 'fetch', [
        { value: 'fetch', label: 'fetch（标准回源）' },
        { value: 'socket', label: 'socket（裸 TCP，仅 Workers）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasSocket) },
        { value: 'r2', label: 'r2（回源到 R2 桶，仅 CF）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasR2) },
      ]);
      fEngine.className = 'input';
      fHostMode = select('f-host-mode', [], 'origin', [
        { value: 'accel', label: '加速域名（当前站点 Host）' },
        { value: 'origin', label: '回源域名（源站地址本身）' },
        { value: 'custom', label: '自定义域名' },
      ]);
      fHostMode.className = 'input';
      fHostCustom = el('input', { class: 'input', id: 'f-host-custom', value: '', placeholder: '如 backend.internal' });

      const addrField = field('源站地址（域名 / IP）', fAddr, '你的真实服务器地址。r2 引擎不需要此字段。');
      const portField = field('端口', fPort, 'https 默认 443，http 默认 80。');
      const schemeField = field('回源协议', fScheme, '选择 https 则回源时走加密通道。');
      const engineField = field('引擎', fEngine, 'fetch=标准回源（所有平台可用）；socket=裸 TCP（仅 Workers，可自定义 Host）；r2=回源 R2 桶（仅 CF）。');
      const hostModeField = field('回源 Host', fHostMode, '源站响应请求时看到的 Host 头。选「自定义域名」时需填下方输入框。');
      const hostCustomField = field('回源 Host 自定义值', fHostCustom, '仅用于回源请求的 Host 头，与站点配置的「加速域名」无关。');

      const inlineFields = el('div', { id: 'origin-inline-fields' }, [
        addrField, portField, schemeField, engineField, hostModeField, hostCustomField,
      ]);

      const syncEngine = () => {
        const eng = fEngine.value;
        const isR2 = eng === 'r2';
        addrField.style.display = isR2 ? 'none' : '';
        portField.style.display = isR2 ? 'none' : '';
        schemeField.style.display = isR2 ? 'none' : '';
      };
      const syncHostCustom = () => { hostCustomField.style.display = fHostMode.value === 'custom' ? '' : 'none'; };
      const syncOriginMode = () => {
        const mode = fOriginMode.value;
        fPoolRow.style.display = mode === 'pool' ? '' : 'none';
        inlineFields.style.display = mode === 'inline' ? '' : 'none';
        if (mode === 'inline') syncEngine();
      };

      fOriginMode.onchange = syncOriginMode;
      fHostMode.onchange = syncHostCustom;
      fEngine.onchange = syncEngine;
      syncOriginMode();
      syncHostCustom();

      body.appendChild(el('div', { class: 'subhead' }, [el('span', {}, '② 默认源站')]));
      body.appendChild(el('div', { class: 'hint' },
        '选「域名/IP」填地址保存时会自动创建单一源站并绑定；选「源站池」则引用已建好的。'));
      body.appendChild(field('源站方式', fOriginMode));
      body.appendChild(fPoolRow);
      body.appendChild(inlineFields);
    }

    // ── 场景模板（仅新建时出现）────────────────────────────────────
    // 选定场景后自动铺好该场景下「一定通用」的那几条规则，省去从零配起。
    // 生成的规则落库后与手写规则完全等价，之后随便改，系统不会再覆盖。
    const tplState = { id: 'blank', params: {}, meta: {}, list: [] };
    if (!editing) {
      const tplSel = select('f-template', [], 'blank', [{ value: 'blank', label: '加载中…' }]);
      const tplDesc = el('div', { class: 'field-hint muted' }, '');
      const tplParamBox = el('div', { class: 'tpl-params' });
      const tplPreview = el('div', { class: 'field-hint muted' }, '');

      // 把模板参数渲染成可编辑输入框：默认值只是起点，重点是让用户看见并按需改。
      const renderParams = () => {
        tplParamBox.innerHTML = '';
        const tpl = tplState.list.find((t) => t.id === tplSel.value);
        tplState.id = tplSel.value;
        tplState.params = {};
        tplDesc.textContent = tpl ? tpl.desc : '';
        const keys = (tpl && tpl.tuning) || [];
        if (!keys.length) {
          tplPreview.textContent = tplSel.value === 'blank'
            ? '不会生成任何规则，建站后请自行到「流量序列 → ④ 匹配规则」添加。'
            : '';
          return;
        }
        tplParamBox.appendChild(el('div', { class: 'hint' },
          '以下为该场景的建议值，仅是起点而非最优解。请按你的实际业务修改——尤其是缓存时间，设错会导致用户看到旧内容。'));
        for (const k of keys) {
          const m = tplState.meta[k] || {};
          const inp = el('input', {
            class: 'input', type: 'number',
            value: String(tpl.params[k] != null ? tpl.params[k] : 0),
          });
          if (m.min != null) inp.min = String(m.min);
          if (m.max != null) inp.max = String(m.max);
          tplState.params[k] = inp;
          tplParamBox.appendChild(field(
            (m.label || k) + '（秒）', inp,
            (m.hint || '') + humanSecs(Number(inp.value))
          ));
          inp.oninput = () => {
            const hintEl = inp.parentNode.querySelector('.field-hint');
            if (hintEl) hintEl.textContent = (m.hint || '') + humanSecs(Number(inp.value));
          };
        }
        tplPreview.textContent = '建站后将自动生成 ' + (tpl.ruleCount != null ? tpl.ruleCount : '若干') + ' 条规则，可随时在「流量序列 → ④ 匹配规则」增删改。';
      };
      tplSel.onchange = renderParams;

      body.appendChild(el('div', { class: 'subhead' }, [el('span', {}, '站点场景模板')]));
      body.appendChild(el('div', { class: 'hint' },
        '按站点类型一次铺好该场景下通用的基础规则，避免从零配起。只预置「这类站点几乎都要」的少量参数，其余留给你自己配。'));
      body.appendChild(field('加速类型', tplSel, ''));
      body.appendChild(tplDesc);
      body.appendChild(tplParamBox);
      body.appendChild(tplPreview);

      // 异步拉取模板清单，失败则静默降级为「空白」，不阻塞建站
      API.sites.templates().then((d) => {
        tplState.list = (d && d.templates) || [];
        tplState.meta = (d && d.paramMeta) || {};
        tplSel.innerHTML = '';
        for (const t of tplState.list) {
          const o = el('option', { value: t.id }, t.name);
          if (t.id === 'website') o.selected = true; // 最常见场景作默认
          tplSel.appendChild(o);
        }
        renderParams();
      }).catch(() => {
        tplSel.innerHTML = '';
        tplSel.appendChild(el('option', { value: 'blank' }, '空白（模板加载失败）'));
      });
    }

    openDrawer(host ? '编辑站点: ' + host : '新建站点', '', body, async () => {
      const h = fHost.value.trim();
      if (!h) throw new Error('请填写 Host');
      const basics = { host: h, enabled: fEnabled.checked, ipv6Support: fIpv6.checked };
      // 新建站点时整合源站信息：选「已有源站」则传 poolId；选「域名/IP」则传 origins + defaultHostHeader
      if (!editing && fOriginMode) {
        if (fOriginMode.value === 'pool') {
          if (!fPoolSel.value) throw new Error('请选择一个已有源站');
          basics.poolId = fPoolSel.value;
        } else {
          // 「填写域名/IP」：构建 origin 对象，后端 ensureSingleOrigin 自动查重/创建并回填 poolId
          const eng = fEngine.value;
          if (eng !== 'r2' && !fAddr.value.trim()) throw new Error('请填写源站地址');
          const o = {
            addr: eng === 'r2' ? '' : fAddr.value.trim(),
            port: eng === 'r2' ? null : (Number(fPort.value) || 443),
            scheme: eng === 'r2' ? 'https' : fScheme.value,
            engine: eng,
          };
          if (eng === 'r2') o.r2Binding = '';
          basics.origins = [o];
          basics.defaultHostHeader = {
            mode: fHostMode.value,
            custom: fHostMode.value === 'custom' ? fHostCustom.value.trim() : '',
          };
        }
      }
      if (editing) {
        await API.sites.saveBasics(site.host, basics);
        toast('站点基础片段已保存');
      } else {
        // 模板只在新建这一刻起作用，后端还会再次确认「站点确实不存在」才套用
        if (tplState.id && tplState.id !== 'blank') {
          basics.template = tplState.id;
          const p = {};
          for (const [k, inp] of Object.entries(tplState.params)) {
            const n = Number(inp.value);
            if (Number.isFinite(n)) p[k] = n;
          }
          basics.templateParams = p;
        }
        await API.sites.save(h, basics);
        toast(basics.template ? '站点已创建，并已按模板生成基础规则' : '站点已创建');
      }
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // ③ 初始回源对象（首要分流）：独立抽屉，只承载「选择回源目标」这一包。
  // 与 ① 匹配站点彻底分离（一个最小任务包一个抽屉），②/④/⑧ 各有独立抽屉。
  async function openInitialOriginDrawer(host, anchor) {
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    // 源站下拉：单一源站与源站池同列，用前缀标明类型（nginx upstream 式统一引用）
    const poolOptions = buildPoolOptions();

    // 站点级源站：① 选已有源站（single 或 pool）；② 直接填地址 → 自动联动创建单一源站
    const originMode = site.poolId ? 'pool' : (poolOptions.length ? 'pool' : 'inline');

    // 模式一：选择已有源站
    const fPool = select('f-pool', [{ value: '', label: '（未选择）' }, ...poolOptions], site.poolId || '');
    fPool.className = 'input';
    const fPoolField = field('默认源站（没被规则覆盖的请求就用它）', fPool, '所有规则都没命中时，请求回到这里设置的源站。列表同时包含「单一源站」与「源站池」，两者用法一致。');

    // 模式二：直接填写地址 → 保存时自动创建一条「单一源站」并绑定
    const inlineBox = el('div', { class: 'inline-origin-box' });
    const inlineOriginList = el('div', { id: 'inline-origin-list' });
    // 单一源站只有 1 个地址，无调度可言：策略字段与权重字段一律不展示
    const inlineStrategy = { value: 'chain' };
    const inlineWeightFields = [];
    const syncInlineWeight = () => {
      inlineWeightFields.forEach((f) => { f.style.display = 'none'; });
    };
    // 由下方 syncHH 定义后回填：源站引擎变化时重算站点级「回源 Host」可选项
    let onEngineChange = null;
    const addInlineOrigin = (o) => {
      o = o || { addr: '', port: 443, scheme: 'https', engine: 'fetch', weight: 1 };
      const engineSel = select('', [], o.engine || 'fetch', [
        { value: 'fetch', label: 'fetch' },
        { value: 'socket', label: 'socket（仅 Workers）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasSocket) },
        { value: 'r2', label: 'r2（回源到 R2 桶，仅 CF）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasR2) },
      ]);
      engineSel.className = 'input o-engine';
      // 源站级专用 Host：默认不启用（沿用站点级默认的回源 Host），
      // 仅当「覆盖」勾选时才出现输入框，避免无意义的冗余填写。
      const hostCustom = o.hostHeader?.mode === 'custom' ? (o.hostHeader.custom || '') : '';
      const hostEn = el('input', { type: 'checkbox', class: 'o-host-en', checked: !!hostCustom });
      const hostInput = el('input', { class: 'input o-host', value: hostCustom, placeholder: '如 api1.internal（留空=用规则/站点级 Host）' });
      const hostField = field('回源 Host 自定义值', hostInput, '仅这台源站回源时使用的 Host 头，会覆盖站点级「回源 Host」。留空等同不覆盖。');
      const syncHost = () => { hostField.style.display = engineSel.value === 'socket' && hostEn.checked ? '' : 'none'; };
      hostEn.onchange = syncHost;
      // ---- R2 引擎专用字段 ----
      const r2BindingIn = el('input', { class: 'input o-r2-binding', value: o.r2Binding || '', placeholder: 'CDN_R2（必须与 wrangler.toml 的 binding 一致）' });
      const r2KeyPrefixIn = el('input', { class: 'input o-r2-prefix', value: o.r2KeyPrefix || '', placeholder: '如 img/（桶内目录隔离，留空=无）' });
      const r2KeyModeSel = select('', [''], o.r2KeyMode || 'none', [
        { value: 'none', label: 'none（pathname 原样作 key）' },
        { value: 'prefix', label: 'prefix（在 key 前加前缀）' },
        { value: 'strip', label: 'strip（剥除开头串）' },
        { value: 'regex', label: 'regex（正则替换）' },
      ], 'o-r2-keymode');
      const r2RuleIn = el('input', { class: 'input o-r2-rule', value: o.r2KeyPrefixRule || '', placeholder: 'prefix/strip: 前缀串；regex: 正则' });
      const r2ToIn = el('input', { class: 'input o-r2-to', value: o.r2KeyRegexTo || '', placeholder: 'regex 模式下的替换值' });
      const r2RuleField = field('转换参数（r2KeyPrefixRule）', r2RuleIn, 'prefix/strip 时填前缀/要剥除的开头；regex 时填正则在 r2KeyPrefixRule。');
      const r2ToField = field('正则替换值（r2KeyRegexTo）', r2ToIn, '仅 regex 模式使用。');
      const r2Fields = el('div', { class: 'o-r2-fields' }, [
        field('R2 绑定名（r2Binding）', r2BindingIn, 'wrangler.toml 里 [[r2_buckets]].binding 的值，如 CDN_R2。引擎选 r2 时必填。'),
        field('R2 key 前缀（r2KeyPrefix）', r2KeyPrefixIn, '拼到最终 key 前面的固定串，用于多站点共用一个桶时隔离目录。'),
        field('pathname → key 转换方式（r2KeyMode）', r2KeyModeSel, 'none 原样；prefix 在前加串；strip 剥开头串；regex 用正则替换。规则级 rewrite 已先作用，这里做最后一步。'),
        r2RuleField,
        r2ToField,
      ]);
      // key 转换方式决定后续参数：none 无需参数，regex 才需要替换值
      const syncR2Key = () => {
        const m = r2KeyModeSel.value;
        r2RuleField.style.display = (m === 'prefix' || m === 'strip' || m === 'regex') ? '' : 'none';
        r2ToField.style.display = m === 'regex' ? '' : 'none';
      };
      r2KeyModeSel.onchange = syncR2Key;
      syncR2Key();
      const syncEngine = () => {
        const eng = engineSel.value;
        const isR2 = eng === 'r2';
        r2Fields.style.display = isR2 ? '' : 'none';
        // R2 不需要公网地址/端口/协议/Host，隐藏避免误填
        addrField.style.display = isR2 ? 'none' : '';
        portField.style.display = isR2 ? 'none' : '';
        schemeField.style.display = isR2 ? 'none' : '';
        // 源站级自定义 Host 只有 socket 引擎能真正手写；fetch 下 Host 恒等于回源地址
        const canHost = eng === 'socket';
        hostEnLabel.style.display = canHost ? '' : 'none';
        hostField.style.display = canHost && hostEn.checked ? '' : 'none';
        // 引擎变化会影响站点级「回源 Host」可选项（fetch 不支持加速域名），通知其重算
        if (typeof onEngineChange === 'function') onEngineChange();
      };
      const addrField = field('源站地址（域名 / IP）', el('input', { class: 'input o-addr', value: o.addr || '', placeholder: 'storage.example.net' }), '你的真实服务器地址。');
      const portField = field('端口', el('input', { class: 'input o-port', type: 'number', value: o.port || 443 }), 'https 默认 443，http 默认 80。');
      const schemeField = field('协议', select('', [''], o.scheme || 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }], 'o-scheme'));
      const hostEnLabel = el('label', { class: 'check' }, [hostEn, el('span', { text: '覆盖站点级回源 Host（源站专用）' })]);
      const weightField = field('权重', el('input', { class: 'input o-weight', type: 'number', value: o.weight || 1 }), '配合「加权」策略使用，默认 1 即可。');
      inlineWeightFields.push(weightField);
      const row = el('div', { class: 'origin-row' }, [
        addrField,
        portField,
        schemeField,
        field('路径前缀', el('input', { class: 'input o-pathprefix', value: o.pathPrefix || '', placeholder: '如 /api/v1（留空=用请求原路径）' }), '追加在请求路径前面的固定前缀，每个源站可不同。例如三台同服务源站分别填 /node1、/node2、/node3，请求 /img/x.png 会分别回源到 /node1/img/x.png 等。留空则不加。'),
        hostEnLabel,
        hostField,
        field('引擎', engineSel, '回源方式：① fetch=标准回源，Host 头由「回源域名/地址」决定（源站只看到自己的域名，最通用，所有平台可用）；② socket=仅 CF Workers 支持，基于裸 TCP 手写 HTTP，可自定义 Host / 回源裸 IP / 非标端口（用于源站要靠 Host 做虚拟主机路由、或只暴露 IP 的场景）；③ r2=回源到 R2 桶（仅 CF，需先在 wrangler.toml 绑定）。'),
        r2Fields,
        weightField,
        // 单一源站恒为 1 行，无「移除」按钮：清空地址即视为未填写
      ]);
      engineSel.onchange = syncEngine;
      syncHost();
      syncEngine();
      // 本抽屉只负责「③ 初始回源对象」这一包：地址/端口/协议/前缀/Host/引擎/权重。
      // 源站级的 rewrite/cache/reqHeaders/respHeaders/超时/跟随3xx 属于 ④.5 / ④.8 / ⑧.1，
      // 由「路由规则」「源站」抽屉各自管理；这里原样保留，保存时回写，绝不越界改写。
      row._carry = {};
      ['rewrite', 'cache', 'reqHeaders', 'respHeaders', 'originTimeoutMs', 'followRedirect', 'extraHeaders']
        .forEach((k) => { if (o[k] !== undefined) row._carry[k] = o[k]; });
      inlineOriginList.appendChild(row);
    };
    // 单一源站恰好一行地址，不再回显站点内联数组（该概念已废弃）
    addInlineOrigin();

    const modeSel = select('f-origin-mode', [
      { value: 'pool', label: '选择已有源站（单一源站 / 源站池）' },
      { value: 'inline', label: '新建单一源站（填地址，自动创建）' },
    ], originMode);
    modeSel.className = 'input';
    const syncInlineStrategy = () => {};
    const syncOriginMode = () => {
      const m = modeSel.value;
      fPoolField.style.display = m === 'pool' ? '' : 'none';
      inlineBox.style.display = m === 'inline' ? '' : 'none';
      syncInlineStrategy();
      syncHH();
    };
    modeSel.onchange = syncOriginMode;

    const defaultHH = site.defaultHostHeader || { mode: 'accel', custom: '' };
    const hhSel = select('f-hh', [
      { value: 'accel', label: '加速域名（即你访问的这个域名，默认）' },
      { value: 'origin', label: '源站域名（用源站自己的域名）' },
      { value: 'custom', label: '自定义（指定一个域名）' },
    ], defaultHH.mode || 'accel');
    hhSel.className = 'input';
    const hhCustom = el('input', { class: 'input', id: 'f-hh-custom', value: defaultHH.custom || '', placeholder: 'origin.example.com' });
    const hhField = field('回源 Host（回源时发给源站的 Host 头）', hhSel, '一般保持「加速域名」即可；仅当源站要求特定域名时才改。选择「自定义」后下方出现填写框。');
    const hhCustomField = field('回源 Host 自定义值', hhCustom);
    // fetch 引擎无法自定义 Host（平台强制 Host = 回源 URL 的 hostname），
    // 因此 accel / client 这类「Host 与回源地址不一致」的模式在 fetch 下不可实现。
    // 只有 socket 引擎能手写 Host 头。这里根据新建单一源站实际选用的引擎动态裁剪可选项。
    const hhNote = el('div', { class: 'hint' });
    const HH_ALL = [
      { value: 'accel', label: '加速域名（即你访问的这个域名，默认）', socketOnly: true },
      { value: 'origin', label: '源站域名（用源站自己的域名）', socketOnly: false },
      { value: 'custom', label: '自定义（指定一个域名）', socketOnly: false },
    ];
    // 收集正在填写的单一源站引擎；选择已有源站时由该源站自身定义，此处不判定。
    const inlineEngines = () => Array.from(inlineOriginList.querySelectorAll('.o-engine')).map((s) => s.value);
    const syncHH = () => {
      // 选择已有源站（pool）模式下：源站内每个 origin 已在各自配置里定义回源方式，
      // 站点级再做统一「回源 Host」会与源站级定义冲突，故整块完全隐藏。
      if (modeSel.value === 'pool') {
        hhField.style.display = 'none';
        hhNote.style.display = 'none';
        hhCustomField.style.display = 'none';
        return;
      }
      const engines = inlineEngines();
      // 全部源站都是 r2 → 回源 Host 完全无意义（不走 HTTP 回源），整块隐藏
      const allR2 = engines.length > 0 && engines.every((e) => e === 'r2');
      // 存在 socket 源站才允许 accel（Host ≠ 回源地址）
      const hasSocket = engines.some((e) => e === 'socket');

      hhField.style.display = allR2 ? 'none' : '';
      hhNote.style.display = allR2 ? 'none' : '';
      if (allR2) { hhCustomField.style.display = 'none'; return; }

      const allowed = HH_ALL.filter((o) => hasSocket || !o.socketOnly);
      const cur = hhSel.value;
      clear(hhSel);
      allowed.forEach((o) => {
        const node = el('option', { value: o.value }, o.label);
        if (o.value === cur) node.selected = true;
        hhSel.appendChild(node);
      });
      // 原选中项被裁掉（如 accel 在纯 fetch 下不可用）→ 回落到 origin
      if (!allowed.some((o) => o.value === cur)) hhSel.value = 'origin';

      hhNote.textContent = hasSocket
        ? ''
        : 'fetch / r2 引擎下平台强制 Host = 回源地址，无法伪装成加速域名，故「加速域名」选项不可用；需要该能力请将源站引擎改为 socket。';
      hhNote.style.display = hhNote.textContent ? '' : 'none';
      hhCustomField.style.display = hhSel.value === 'custom' ? '' : 'none';
    };
    hhSel.onchange = syncHH;
    onEngineChange = syncHH;

    // 片段边界：本抽屉 = ③ 初始回源对象（单一最小任务包）。
    const body = el('div', {}, [
      el('div', { class: 'subhead', id: 'sec-origin' }, [el('span', {}, '③ 初始回源对象（首要分流）')]),
      el('div', { class: 'hint' }, '选出「初始回源对象」，它既是规则引擎的 origin 匹配维度，也是所有规则都未命中时的兜底回源目标。'),
      field('源站方式', modeSel, '① 从「源站」页已有条目里选（单一源站和源站池都在同一个下拉里）；② 直接填地址，保存时自动创建一条「单一源站」并绑定，随后可在「源站」页统一管理。'),
      fPoolField,
      el('div', { class: 'hint', id: 'origin-mode-hint' }, '站点不再持有「内联源站」：任何直接填写的地址都会成为「源站」页里的一条单一源站，因此你能在一个地方看到全部上游及其被引用情况。需要多源站负载均衡时，请到「源站」页新建源站池，再回到这里选择它。'),
      inlineBox,
      hhField,
      hhNote,
      hhCustomField,

      el('div', { class: 'hint frag-note' }, '本抽屉只负责 ③ 这包。① 匹配站点、② 安全校验、④ 路由规则、⑧ 源站池细节均有各自独立抽屉，请在「流量序列」中点击对应阶段进入，此处不再重复承载。'),
    ]);

    // 新建单一源站编辑区（直接填地址 → 保存时联动创建）
    inlineBox.appendChild(el('div', { class: 'subhead' }, [
      el('span', {}, '新建单一源站'),
    ]));
    inlineBox.appendChild(el('div', { class: 'hint' }, '只填「这台源站是谁」——地址/端口/协议/路径前缀/引擎。保存后会在「源站」页自动出现一条同名的单一源站，并标记被本站点引用；若已存在完全相同的地址，则直接复用它而不会重复创建。需要多台源站做负载均衡，请改用「源站池」。'));
    inlineBox.appendChild(inlineOriginList);
    syncOriginMode();
    syncInlineStrategy();
    syncInlineWeight();
    syncHH();

    openDrawer('编辑回源对象: ' + host, '', body, async () => {
      const hhMode = hhSel.value;
      // 根据源站方式决定提交字段：选源站组时忽略内联源站，直接填写时清空 poolId
      const useInline = modeSel.value === 'inline';
      const inlineOrigins = [];
      Array.from(inlineOriginList.children).forEach((row, i) => {
        const engine = $('.o-engine', row).value;
        const addr = $('.o-addr', row).value.trim();
        // r2 引擎无公网地址，按 r2Binding 标识；其余引擎必须有 addr
        if (engine !== 'r2' && !addr) return;
        const r2KeyMode = $('.o-r2-keymode', row) ? $('.o-r2-keymode', row).value : 'none';
        inlineOrigins.push({
          id: 'o' + i + '_' + (engine === 'r2' ? ($('.o-r2-binding', row).value.trim() || 'r2') : addr),
          enabled: true,
          order: i,
          weight: Number($('.o-weight', row).value) || 1,
          engine,
          scheme: $('.o-scheme', row) ? $('.o-scheme', row).value : 'https',
          addr: engine === 'r2' ? '' : addr,
          port: Number($('.o-port', row).value) || 443,
          pathPrefix: ($('.o-pathprefix', row).value || '').trim(),
          hostHeader: (() => {
            const en = $('.o-host-en', row);
            const custom = ($('.o-host', row).value || '').trim();
            // 仅在勾选「覆盖」且填写了值时，才作为源站专用 Host；否则沿用站点级
            return en && en.checked && custom ? { mode: 'custom', custom } : { mode: 'inherit', custom: '' };
          })(),
          extraHeaders: {},
          ...(engine === 'r2'
            ? {
                r2Binding: $('.o-r2-binding', row).value.trim(),
                r2KeyPrefix: $('.o-r2-prefix', row).value.trim(),
                r2KeyMode,
                r2KeyPrefixRule: $('.o-r2-rule', row).value.trim(),
                r2KeyRegexTo: $('.o-r2-to', row).value.trim(),
              }
            : {}),
          ...(row._carry || {}),
        });
      });

      // 仅提交 ③ 相关字段，后端浅合并 basics；不影响 ①（基础）/②（安全）等其它包
      const basics = {};
      if (useInline) {
        if (!inlineOrigins.length) throw new Error('请填写源站地址');
        if (inlineOrigins.length > 1) throw new Error('单一源站只能有 1 个地址；需要多个请到「源站」页新建源站池');
        // 不传 poolId：后端 ensureSingleOrigin 会据此把地址落成 kind=single 源站并回填
        basics.origins = inlineOrigins;
        // 站点级「回源 Host」只在单一源站下有意义：源站池里每台源站各自定义，
        // 站点级统一值会与源站级定义冲突，故 pool 模式不提交。
        basics.defaultHostHeader = { mode: hhMode, custom: hhMode === 'custom' ? hhCustom.value.trim() : '' };
      } else {
        if (!fPool.value) throw new Error('请选择一个源站，或改用「新建单一源站」填写地址');
        basics.poolId = fPool.value;
      }
      const res = await API.sites.saveBasics(site.host, basics);
      if (res && res.createdOrigin) {
        toast(`已自动创建单一源站「${res.createdOrigin.name || res.createdOrigin.id}」并绑定到本站点`, 'ok');
      } else {
        toast('初始回源对象片段已保存');
      }
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // 安全防护：独立抽屉，只读写站点的 security 字段，不碰基础设置/规则/源站
  // 内部按 ②.1~②.5 五个最小任务包分节，anchor 可直达其中一节
  async function openSecurityDrawer(host, anchor) {
    if (!host) { toast('请先创建站点', 'err'); return; }
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    const sec = site.security || {};

    const refererMode = select('', [
      { value: 'off', label: '关闭' },
      { value: 'whitelist', label: '白名单（允许名单内 Referer 访问）' },
      { value: 'blacklist', label: '黑名单（拦截名单内 Referer）' },
    ], sec.refererMode || 'off');
    refererMode.className = 'input';
    const refererList = el('input', { class: 'input', value: (sec.refererList || []).join(', '), placeholder: '如 example.com, *.test.com' });
    const refererAllowEmpty = el('input', { type: 'checkbox', checked: !!sec.allowEmptyReferer });
    const uaList = el('input', { class: 'input', value: (sec.uaBlacklist || []).join(', '), placeholder: '如 BadBot, scraper' });
    const botEn = el('input', { type: 'checkbox', checked: !!(sec.botManagement && sec.botManagement.enabled) });
    const botMode = select('', [
      { value: 'blacklist', label: '黑名单（命中特征即拦截）' },
      { value: 'allowlist', label: '白名单（仅放行命中特征，其余视为 Bot）' },
    ], (sec.botManagement && sec.botManagement.mode) || 'blacklist');
    botMode.className = 'input';
    const botList = el('input', { class: 'input', value: ((sec.botManagement && sec.botManagement.list) || []).join(', '), placeholder: '如 scrapy, python-requests, HeadlessChrome' });
    const ipBlack = el('input', { class: 'input', value: (sec.ipBlacklist || []).join(', '), placeholder: '如 1.2.3.4, 10.0.0.0/8' });
    const ipWhite = el('input', { class: 'input', value: (sec.ipWhitelist || []).join(', '), placeholder: '如 192.168.1.0/24' });
    const signEn = el('input', { type: 'checkbox', checked: !!(sec.signedUrl && sec.signedUrl.enabled) });
    const signKey = el('input', { class: 'input', value: (sec.signedUrl && sec.signedUrl.secret) || '', placeholder: '签名密钥，建议 16 位以上随机串' });
    const signExpire = el('input', { class: 'input', type: 'number', value: (sec.signedUrl && sec.signedUrl.ttl) || 300 });
    const signParam = el('input', { class: 'input', value: (sec.signedUrl && sec.signedUrl.param) || 'sign', placeholder: 'URL 查询参数名' });
    const rateEn = el('input', { type: 'checkbox', checked: !!(sec.rateLimit && sec.rateLimit.enabled) });
    const rateRpm = el('input', { class: 'input', type: 'number', value: (sec.rateLimit && sec.rateLimit.rpm) || 600 });

    const commaSplit = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
    const readSecurity = () => ({
      refererMode: refererMode.value,
      refererList: commaSplit(refererList.value),
      allowEmptyReferer: refererAllowEmpty.checked,
      uaBlacklist: commaSplit(uaList.value),
      botManagement: {
        enabled: botEn.checked,
        mode: botMode.value,
        list: commaSplit(botList.value),
      },
      ipBlacklist: commaSplit(ipBlack.value),
      ipWhitelist: commaSplit(ipWhite.value),
      signedUrl: {
        enabled: signEn.checked,
        secret: signKey.value.trim(),
        ttl: Number(signExpire.value) || 300,
        param: signParam.value.trim() || 'sign',
      },
      rateLimit: {
        enabled: rateEn.checked,
        rpm: Number(rateRpm.value) || 600,
      },
    });

    // 按流程图 ②.1~②.5 分节，每节一个最小任务包，一节一个锚点
    const pack = (id, title, desc, children) => {
      const s = section(title, desc, children);
      s.id = id;
      return s;
    };
    // ---- 依赖联动：未启用/关闭的开关，其下属字段完全隐藏（不是折叠） ----
    const refererListField = field('Referer 名单（逗号分隔，可含 *.example.com 通配）', refererList);
    const refererEmptyLabel = el('label', { class: 'check' }, [refererAllowEmpty, el('span', { text: '允许 Referer 为空（直接访问）' })]);
    const syncReferer = () => {
      const on = refererMode.value !== 'off';
      refererListField.style.display = on ? '' : 'none';
      refererEmptyLabel.style.display = on ? '' : 'none';
    };
    refererMode.addEventListener('change', syncReferer);
    syncReferer();

    const botModeField = field('匹配模式', botMode);
    const botListField = field('Bot 特征关键字 / UA（逗号分隔，支持 /regex/ 正则）', botList);
    const botHint1 = el('div', { class: 'hint' }, '小白示例：直接填关键字如 scrapy、python-requests 即可拦截常见爬虫；想更灵活可写正则，如 /^HeadlessChrome/ 只拦无头浏览器，/bot/i 大小写不敏感地拦含 bot 的 UA。');
    const botHint2 = el('div', { class: 'hint' }, '黑名单：UA 命中任一特征即拦截；白名单：仅放行命中特征（如合法搜索引擎），其余视为 Bot 拦截。该字段独立于 ②.2 的 UA 黑名单，互不越界。');
    const syncBot = () => {
      const on = botEn.checked;
      [botModeField, botListField, botHint1, botHint2].forEach((n) => { n.style.display = on ? '' : 'none'; });
    };
    botEn.addEventListener('change', syncBot);
    syncBot();

    const signGrid = el('div', { class: 'grid2' }, [
      field('签名密钥', signKey),
      field('URL 参数名', signParam),
    ]);
    const signExpireField = field('签名有效期（秒）', signExpire);
    const syncSign = () => {
      const on = signEn.checked;
      signGrid.style.display = on ? '' : 'none';
      signExpireField.style.display = on ? '' : 'none';
    };
    signEn.addEventListener('change', syncSign);
    syncSign();

    const rateRpmField = field('每分钟最大请求数', rateRpm);
    const syncRate = () => { rateRpmField.style.display = rateEn.checked ? '' : 'none'; };
    rateEn.addEventListener('change', syncRate);
    syncRate();

    const body = el('div', {}, [
      el('div', { class: 'hint frag-note' }, 'fail-closed：任一包判定异常也按 403 拦截，绝不放行。以下 5 包全部通过才继续 ③ 首要分流。'),
      pack('sec-ip', '②.1 IP 访问规则', 'IP 黑名单优先于白名单拦截', [
        el('div', { class: 'grid2' }, [
          field('IP 黑名单（逗号分隔，支持 CIDR）', ipBlack),
          field('IP 白名单（逗号分隔，支持 CIDR）', ipWhite),
        ]),
      ]),
      pack('sec-waf', '②.2 WAF · 自定义规则（Referer / UA）', '防盗链校验请求 Referer；UA 关键字命中直接 403', [
        field('防盗链模式', refererMode),
        refererListField,
        refererEmptyLabel,
        field('User-Agent 黑名单关键字（逗号分隔）', uaList),
      ]),
      pack('sec-bot', '②.3 自动程序（Bot 管理）', '独立最小任务包：与 ②.2 的 UA 黑名单解耦。支持黑名单拦截 / 白名单仅放行两种模式', [
        el('label', { class: 'check' }, [botEn, el('span', { text: '启用 Bot 管理' })]),
        botModeField,
        botListField,
        botHint1,
        botHint2,
      ]),
      pack('sec-token', '②.4 Access · 令牌鉴权（签名 URL）⚠️实验特性', '仅允许携带合法签名的请求访问（常用于私有资源）。⚠️ 实验特性：校验侧已生效，但内置签名链接签发工具尚未提供，需自行用 HMAC 生成。', [
        el('label', { class: 'check' }, [signEn, el('span', { text: '启用签名 URL 校验' })]),
        signGrid,
        signExpireField,
        el('div', { class: 'hint warn' }, ['⚠️ 实验特性：内置「生成签名链接」工具待开发，开启后需自行用 HMAC-SHA256 签发带签名的 URL。']),
      ]),
      pack('sec-ratelimit', '②.5 速率限制', '单客户端（按 IP）每分钟最大请求数，超出返回 429', [
        el('label', { class: 'check' }, [rateEn, el('span', { text: '启用请求限速' })]),
        rateRpmField,
      ]),
    ]);

    openDrawer('安全防护: ' + host, '仅管理 ② 安全校验的 5 个最小任务包。不影响站点基础（①/③）、路由规则（④）与源站池（⑧）。', body, async () => {
      // 后端 saveSecurity 已是片段 API：仅合并 security 字段，互不越界
      await API.sites.saveSecurity(host, readSecurity());
      await refreshData();
    });
    scrollToAnchor(anchor);
  }

  // 路由规则：独立抽屉，只读写站点的 rules 字段，不碰基础/源站/安全（绝不越界）
  async function openRulesDrawer(host, opts) {
    if (!host) { toast('请先创建站点', 'err'); return; }
    let site;
    try { site = await API.sites.get(host); } catch (e) { toast(e.message, 'err'); return; }
    const poolOptions = buildPoolOptions();
    const confined = !!(opts && opts.allowedOps);

    const rulesBox = el('div', { class: 'rules-box' });
    const ruleReaders = [];
    const makeCard = (r) => {
      const { card, read } = buildRuleCard(r, poolOptions, site, opts || {});
      ruleReaders.push(read);
      rulesBox.appendChild(card);
    };
    const addRuleBtn = el('button', { class: 'btn btn-sm', text: '+ 添加规则' });
    addRuleBtn.onclick = () => makeCard(null);

    // 受限抽屉只展示属于本任务包的规则，避免把其它包的规则混进来导致误改
    const allRules = (site.rules && site.rules.length ? site.rules : []);
    const shownRules = confined && opts.match ? allRules.filter((r) => opts.match(r.action || {})) : allRules;
    shownRules.forEach(makeCard);

    const title = confined ? opts.title : '路由规则（规则引擎）: ' + host;
    const headText = confined ? opts.title : '路由规则（规则引擎）';
    const owner = confined ? opts.owner : '路由规则抽屉 · 规则卡片';
    // 始终把 rulesBox 放进 DOM：否则 shownRules 为空时「+ 添加规则」加进的是
    // 一个游离节点，界面毫无反应。空状态提示单独放一个节点，按列表是否为空切换。
    const emptyHint = el('p', { class: 'empty' }, '暂无属于本任务包的规则，点击「+ 添加规则」新建一条。');
    emptyHint.style.display = shownRules.length ? 'none' : '';
    const body = el('div', { id: 'sec-rules' }, [
      el('div', { class: 'hint' }, confined
        ? '本抽屉只管理「' + opts.title + '」这一最小任务包的规则，只能添加/编辑该包允许的动作类型，不会越界到其它包。保存时只合并 rules 字段。'
        : '按条件把请求路由到不同源站、改写路径、设置回源 Host、请求头、响应头、缓存等。修改不会影响站点基础设置、源站与安全防护。'),
      el('div', { class: 'subhead' }, [el('span', {}, headText), addRuleBtn]),
      emptyHint,
      rulesBox,
    ]);

    openDrawer(title, '仅管理本站点的路由规则。保存时只合并 rules 字段，互不越界。', body, async () => {
      const edited = ruleReaders.map((rd) => rd());
      if (confined && opts.match) {
        // 受限抽屉只动了属于本包的规则，其余规则原样保留，避免误删其它包的规则
        const editedIds = new Set(edited.map((r) => r.id));
        const kept = (site.rules || []).filter((r) => !editedIds.has(r.id) && !opts.match(r.action || {}));
        await API.sites.saveRules(host, kept.concat(edited));
      } else {
        await API.sites.saveRules(host, edited);
      }
      await refreshData();
    });
  }

  async function removeSite(host) {
    const ok = await confirmDialog('删除站点', '确定删除 ' + host + ' ？此操作不可恢复。');
    if (!ok) return;
    try {
      await API.sites.remove(host);
      toast('已删除', 'ok');
      await refreshData();
      await route(location.hash);
    } catch (e) { toast(e.message, 'err'); }
  }

  // ====== 源站（借鉴 nginx upstream：单一源站与源站池同为一等公民） ======

  /** 归一化 kind：兼容后端未回填 kind 的历史数据。 */
  function poolKind(p) {
    return p.kind || ((p.origins || []).length === 1 ? 'single' : 'pool');
  }

  /** 源站地址摘要，供列表「地址」列展示。 */
  function originSummary(p) {
    const list = p.origins || [];
    if (!list.length) return '—';
    const fmt = (o) => (o.engine === 'r2'
      ? `r2:${o.r2Binding || '?'}`
      : `${o.scheme || 'https'}://${o.addr || '?'}${o.port && o.port !== 443 && o.port !== 80 ? ':' + o.port : ''}`);
    return list.length === 1 ? fmt(list[0]) : `${fmt(list[0])} 等 ${list.length} 个`;
  }

  /** 统一的源站下拉选项：单一源站在前、源站池在后，标签带类型前缀与地址摘要。 */
  function buildPoolOptions() {
    return [...APP_DATA.pools]
      .sort((a, b) => (poolKind(a) === poolKind(b) ? 0 : (poolKind(a) === 'single' ? -1 : 1)))
      .map((p) => ({
        value: p.id,
        label: `${poolKind(p) === 'single' ? '［单一］' : '［池］'} ${p.name || p.id} — ${originSummary(p)}`,
      }));
  }

  /** 引用徽标：0 引用给出「可安全删除」提示，>0 时可点击查看是谁在用。 */
  function refsCell(p) {
    const refs = p.refs || [];
    if (!refs.length) {
      return el('span', { class: 'hint', text: '未被引用' });
    }
    const btn = el('button', {
      class: 'btn btn-sm',
      text: `${refs.length} 处引用`,
      onclick: () => openRefsDrawer(p),
    });
    return btn;
  }

  async function renderPools() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('h3', {}, '源站'),
      el('button', { class: 'btn btn-primary', text: '+ 新建源站池', onclick: () => openPoolDrawer(null, 'pool') }),
    ]));
    wrap.appendChild(el('div', { class: 'hint' },
      '这里纵览全部上游。「单一源站」= 一个地址，在新建/编辑站点时直接填写源站地址会自动创建并出现在这里；'
      + '「源站池」= 多个源站 + 负载均衡策略，只能用右上角按钮新建。两者引用方式一致，站点与规则都按同一个下拉选择。'));

    // 升级前遗留的「站点内联源站」尚未迁移：提示用户保存一次即可自动转成独立源站
    const legacy = APP_DATA.poolsLegacySites || [];
    if (legacy.length) {
      wrap.appendChild(el('div', { class: 'hint warn' },
        `检测到 ${legacy.length} 个站点仍使用旧版「内联源站」（${legacy.join('、')}），暂未出现在下表中。`
        + '打开对应站点的「初始回源对象」抽屉保存一次，即可自动迁移为独立源站并纳入统一管理。'));
    }

    if (!APP_DATA.pools.length) {
      wrap.appendChild(el('p', { class: 'empty' }, '暂无源站。新建站点并填写源站地址会自动生成单一源站；需要多源站负载均衡请点「+ 新建源站池」。'));
      return wrap;
    }

    const order = { single: 0, pool: 1 };
    const sorted = [...APP_DATA.pools].sort((a, b) => {
      const d = order[poolKind(a)] - order[poolKind(b)];
      return d !== 0 ? d : String(a.name || a.id).localeCompare(String(b.name || b.id));
    });

    const rows = sorted.map((p) => {
      const kind = poolKind(p);
      const isSingle = kind === 'single';
      return [
        el('span', { class: 'badge ' + (isSingle ? 'badge-single' : 'badge-pool') },
          isSingle ? '单一源站' : '源站池'),
        p.name || p.id,
        originSummary(p),
        isSingle ? '—' : (p.strategy || 'chain'),
        String((p.origins || []).length),
        refsCell(p),
        actions([
          { label: '编辑', onClick: () => openPoolDrawer(p.id) },
          {
            label: '删除',
            cls: 'btn-danger',
            onClick: () => removePool(p.id, p),
          },
        ]),
      ];
    });
    wrap.appendChild(table(['类型', '名称', '地址', '策略', '源站数', '引用', '操作'], rows));
    return wrap;
  }

  /** 引用明细抽屉：列出谁在引用这个源站，可直接跳到对应站点。 */
  function openRefsDrawer(p) {
    const refs = p.refs || [];
    const rows = refs.map((r) => [
      r.type === 'site' ? '站点' : (r.type === 'globalRule' ? '全局规则' : '站点规则'),
      r.label || '—',
      r.detail || '—',
      r.host
        ? actions([{ label: '前往站点', onClick: () => { closeDrawer(); location.hash = '#/sites'; openSiteDrawer(r.host); } }])
        : el('span', { class: 'hint', text: '—' }),
    ]);
    const body = el('div', {}, [
      el('div', { class: 'hint' },
        `「${p.name || p.id}」当前被 ${refs.length} 处引用。存在引用时无法删除；请先把这些引用改指到别的源站。`),
      rows.length
        ? table(['来源', '对象', '说明', '操作'], rows)
        : el('p', { class: 'empty' }, '暂无引用。'),
    ]);
    openDrawer('引用详情: ' + (p.name || p.id), '', body, null);
  }

  async function openPoolDrawer(id, forceKind) {
    let pool;
    if (id) {
      try { pool = await API.pools.get(id); } catch (e) { toast(e.message, 'err'); return; }
    } else {
      pool = { id: '', name: '', kind: forceKind || 'pool', strategy: 'chain', origins: [], failover: { enabled: true, maxRetries: 2, timeoutMs: 10000, retryOn: [500, 502, 503, 504, 522, 524] } };
    }
    // 类型一经创建不可随意切换：single→pool 允许（加源站即升级），pool→single 会丢数据故禁止
    const kind = forceKind || poolKind(pool);
    const isSingle = kind === 'single';
    const socketDisabled = !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasSocket);

    const originList = el('div', { id: 'origin-list' });
    // 调度策略下拉需在 addOrigin 之前创建：源站行里的「权重」字段要按策略显隐
    const strategySel = select('', [], pool.strategy || 'chain', [
      { value: 'chain', label: '链式回退（遇错换下一源站，最稳）' },
      { value: 'roundrobin', label: '轮询（轮流用每个源站）' },
      { value: 'random', label: '随机' },
      { value: 'weighted', label: '加权（按权重分配，权重越大越多）' },
      { value: 'iphash', label: 'IP 哈希（同 IP 总落到同一源站，利于会话）' },
    ]);
    strategySel.className = 'input';
    // 收集各源站的「权重」字段，调度策略变化时统一显隐（仅加权策略需要权重）
    const weightFields = [];
    const syncWeight = () => {
      const on = strategySel.value === 'weighted';
      weightFields.forEach((f) => { f.style.display = on ? '' : 'none'; });
    };
    strategySel.addEventListener('change', syncWeight);
    const addOrigin = (o) => {
      // 源站组只负责「地址 + 负载均衡」，回源 Host / 路径 / 请求头等一律在规则引擎里绑定
      o = o || { id: '', enabled: true, order: 0, weight: 1, engine: 'fetch', scheme: 'https', addr: '', port: 443 };
      const engineSel = select('', [], '', [
        { value: 'fetch', label: 'fetch' },
        { value: 'socket', label: 'socket（仅 Workers）', disabled: socketDisabled },
        { value: 'r2', label: 'r2（回源到 R2 桶，仅 CF）', disabled: !(APP_DATA.info && APP_DATA.info.caps && APP_DATA.info.caps.hasR2) },
      ]);
      engineSel.value = o.engine || 'fetch';
      engineSel.className = 'input o-engine';
      // ---- R2 引擎专用字段 ----
      const r2BindingIn = el('input', { class: 'input o-r2-binding', value: o.r2Binding || '', placeholder: 'CDN_R2（必须与 wrangler.toml 的 binding 一致）' });
      const r2KeyPrefixIn = el('input', { class: 'input o-r2-prefix', value: o.r2KeyPrefix || '', placeholder: '如 img/（桶内目录隔离，留空=无）' });
      const r2KeyModeSel = select('', [''], o.r2KeyMode || 'none', [
        { value: 'none', label: 'none（pathname 原样作 key）' },
        { value: 'prefix', label: 'prefix（在 key 前加前缀）' },
        { value: 'strip', label: 'strip（剥除开头串）' },
        { value: 'regex', label: 'regex（正则替换）' },
      ], 'o-r2-keymode');
      const r2RuleIn = el('input', { class: 'input o-r2-rule', value: o.r2KeyPrefixRule || '', placeholder: 'prefix/strip: 前缀串；regex: 正则' });
      const r2ToIn = el('input', { class: 'input o-r2-to', value: o.r2KeyRegexTo || '', placeholder: 'regex 模式下的替换值' });
      const r2RuleField = field('转换参数（r2KeyPrefixRule）', r2RuleIn, 'prefix/strip 时填前缀/要剥除的开头；regex 时填正则在 r2KeyPrefixRule。');
      const r2ToField = field('正则替换值（r2KeyRegexTo）', r2ToIn, '仅 regex 模式使用。');
      const r2Fields = el('div', { class: 'o-r2-fields' }, [
        field('R2 绑定名（r2Binding）', r2BindingIn, 'wrangler.toml 里 [[r2_buckets]].binding 的值，如 CDN_R2。引擎选 r2 时必填。'),
        field('R2 key 前缀（r2KeyPrefix）', r2KeyPrefixIn, '拼到最终 key 前面的固定串，用于多站点共用一个桶时隔离目录。'),
        field('pathname → key 转换方式（r2KeyMode）', r2KeyModeSel, 'none 原样；prefix 在前加串；strip 剥开头串；regex 用正则替换。规则级 rewrite 已先作用，这里做最后一步。'),
        r2RuleField,
        r2ToField,
      ]);
      // key 转换方式决定后续参数：none 无需参数，regex 才需要替换值
      const syncR2Key = () => {
        const m = r2KeyModeSel.value;
        r2RuleField.style.display = (m === 'prefix' || m === 'strip' || m === 'regex') ? '' : 'none';
        r2ToField.style.display = m === 'regex' ? '' : 'none';
      };
      r2KeyModeSel.onchange = syncR2Key;
      syncR2Key();
      const addrField = field('源站地址（域名 / IP）', el('input', { class: 'input o-addr', value: o.addr || '', placeholder: 'storage.example.net' }), '你的真实服务器地址。');
      const portField = field('端口', el('input', { class: 'input o-port', type: 'number', value: o.port || 443 }), 'https 默认 443，http 默认 80。');
      const schemeField = field('协议', select('', [''], o.scheme || 'https', [{ value: 'https', label: 'https' }, { value: 'http', label: 'http' }], 'o-scheme'));
      const hostField = field('回源 Host（该源站专用）', el('input', { class: 'input o-host', value: o.hostHeader?.custom || '', placeholder: '如 api1.internal（留空=用规则/站点级 Host）' }), '仅这台源站回源时使用的 Host 头。同组多源站各自 Host 不同时填这里；规则里再设 Host 会覆盖它。');
      // fetch 引擎无法手写 Host 头（平台强制 Host = 回源 URL hostname），
      // 该字段只有 socket 引擎能真正生效，故仅 socket 时显示。
      const hostNote = el('div', { class: 'hint', text: 'fetch 引擎下该 Host 由回源地址决定、无法自定义；如需自定义 Host 请把引擎改为 socket。' });
      // 权重仅在「加权」调度策略下生效，其余策略隐藏（syncWeight 在策略下拉建好后统一调用）
      const weightField = field('权重（加权策略生效）', el('input', { class: 'input o-weight', type: 'number', value: o.weight || 1 }), '默认 1 即可。');
      weightFields.push(weightField);
      const syncEngine = () => {
        const eng = engineSel.value;
        const isR2 = eng === 'r2';
        r2Fields.style.display = isR2 ? '' : 'none';
        addrField.style.display = isR2 ? 'none' : '';
        portField.style.display = isR2 ? 'none' : '';
        schemeField.style.display = isR2 ? 'none' : '';
        hostField.style.display = eng === 'socket' ? '' : 'none';
        hostNote.style.display = eng === 'fetch' ? '' : 'none';
      };
      engineSel.onchange = syncEngine;
      const row = el('div', { class: 'origin-row' }, [
        addrField,
        portField,
        schemeField,
        field('路径前缀', el('input', { class: 'input o-pathprefix', value: o.pathPrefix || '', placeholder: '如 /api/v1（留空=用请求原路径）' }), '追加在请求路径前面的固定前缀，每个源站可不同。例如三台同服务源站分别填 /node1、/node2、/node3，请求 /img/x.png 会分别回源到 /node1/img/x.png 等。留空则不加。'),
        hostField,
        hostNote,
        field('引擎', engineSel, '回源方式：① fetch=标准回源，Host 头由「回源域名/地址」决定（源站只看到自己的域名，最通用，所有平台可用）；② socket=仅 CF Workers 支持，基于裸 TCP 手写 HTTP，可自定义 Host / 回源裸 IP / 非标端口（用于源站要靠 Host 做虚拟主机路由、或只暴露 IP 的场景）；③ r2=回源到 R2 桶（仅 CF，需先在 wrangler.toml 绑定）。'),
        r2Fields,
        weightField,
        el('button', { class: 'btn btn-sm btn-danger', text: '移除源站', onclick: () => row.remove() }),
      ]);
      syncEngine(); // 回显时根据已有 engine 显隐 R2 字段
      originList.appendChild(row);
    };
    (pool.origins || []).forEach(addOrigin);
    if (!pool.origins || !pool.origins.length) addOrigin();
    syncWeight();

    const strategyField = field('调度策略', strategySel, '多个源站之间怎么分配请求。新手直接用「链式回退」最省心。');
    // 单一源站只有 1 个 origin，无调度可言；也不允许在这里加第 2 个源站。
    const addOriginBtn = el('button', { class: 'btn btn-sm', text: '+ 添加源站', onclick: () => { addOrigin(); syncWeight(); } });
    if (isSingle) {
      strategyField.style.display = 'none';
      addOriginBtn.style.display = 'none';
    }

    const refsInfo = (pool.refs && pool.refs.length)
      ? el('div', { class: 'hint' }, `当前被 ${pool.refs.length} 处引用：${pool.refs.map((r) => r.label).filter((v, i, a) => a.indexOf(v) === i).join('、')}。修改地址会立刻影响这些站点。`)
      : el('div', { class: 'hint' }, '当前未被任何站点或规则引用。');

    const body = el('div', {}, [
      // 机器主键 id 由系统自动生成，用户绝不可填；此处仅展示（编辑时可见）
      field(
        '源站 ID（系统自动生成）',
        el('input', { class: 'input', id: 'p-id', value: pool.id || '', placeholder: '保存后自动生成（如 pl_xxx）', disabled: true })
      ),
      field('类型', el('input', {
        class: 'input',
        value: isSingle ? '单一源站（1 个地址）' : '源站池（多源站 + 负载均衡）',
        disabled: true,
      }), isSingle
        ? '单一源站通常由「新建站点时直接填写源站地址」自动创建。若要升级为源站池，请新建一个源站池并把站点改指过去。'
        : '源站池只能在「源站」页手动新建，可被多个站点/规则共享引用。'),
      field('名称（可选，用于区分）', el('input', { class: 'input', id: 'p-name', value: pool.name || '', placeholder: '如：主站源站 / 北京备份' }), '给自己看的备注，方便在站点和规则里选对源站。'),
      strategyField,
      refsInfo,
      el('div', { class: 'hint' }, '源站只负责「地址 + 负载均衡」。回源 Host、路径重写、请求头、响应头、缓存等均由「站点 → 规则引擎」按条件绑定，不在此处设置。源站按列表顺序决定链式回退（越靠前越优先）。「源站 ID」是给机器引用用的内部主键，由系统自动生成、不可改；如需给人区分，请填上面的「名称」。'),
      el('div', { id: 'origin-head', class: 'subhead' }, [
        el('span', {}, isSingle ? '源站地址' : '源站列表'),
        addOriginBtn,
      ]),
      originList,
    ]);
    const kindLabel = isSingle ? '单一源站' : '源站池';
    openDrawer(id ? `编辑${kindLabel}: ` + (pool.name || id) : `新建${kindLabel}`, '', body, async () => {
      const pid = pool.id || ''; // 系统主键，编辑时才有；新建为空 → 后端自动生成
      const origins = [];
      Array.from(originList.children).forEach((row, i) => {
        const engine = $('.o-engine', row).value;
        const addr = $('.o-addr', row).value.trim();
        // r2 引擎无公网地址，按 r2Binding 标识；其余引擎必须有 addr
        if (engine !== 'r2' && !addr) return;
        // 保留既有源站的回源高级配置（hostHeader/extraHeaders/pathPrefix），
        // 这些由规则引擎托管，前端此处不编辑，但编辑源站池时不应清空
        const legacy = (pool.origins && pool.origins[i]) || {};
        const r2KeyMode = $('.o-r2-keymode', row) ? $('.o-r2-keymode', row).value : 'none';
        origins.push({
          id: 'o' + i + '_' + (engine === 'r2' ? ($('.o-r2-binding', row).value.trim() || 'r2') : addr),
          enabled: true, order: i, weight: Number($('.o-weight', row).value) || 1,
          engine,
          scheme: $('.o-scheme', row) ? $('.o-scheme', row).value : 'https',
          addr: engine === 'r2' ? '' : addr,
          port: Number($('.o-port', row).value) || 443,
          pathPrefix: ($('.o-pathprefix', row).value || '').trim() || legacy.pathPrefix || '',
          hostHeader: ($('.o-host', row).value || '').trim()
            ? { mode: 'custom', custom: ($('.o-host', row).value || '').trim() }
            : (legacy.hostHeader || { mode: 'inherit', custom: '' }),
          extraHeaders: legacy.extraHeaders || {},
          ...(engine === 'r2'
            ? {
                r2Binding: $('.o-r2-binding', row).value.trim(),
                r2KeyPrefix: $('.o-r2-prefix', row).value.trim(),
                r2KeyMode,
                r2KeyPrefixRule: $('.o-r2-rule', row).value.trim(),
                r2KeyRegexTo: $('.o-r2-to', row).value.trim(),
              }
            : {}),
          // 纯两层架构（站点级 + 源站级基础地址/引擎）：源站级不再承载专属回源规则
          // （路径重写/缓存/请求头/响应头/超时/跟随3xx 一律由「路由规则」按条件绑定，
          // 旧数据若残留这些字段将由后端 failover 原样保留、但不在此编辑）。
        });
      });
      if (!origins.length) throw new Error(isSingle ? '请填写源站地址' : '至少需要一个源站');
      if (isSingle && origins.length > 1) throw new Error('单一源站只能有 1 个地址；需要多个请新建「源站池」');
      const payload = {
        name: $('p-name').value.trim(),
        kind,
        strategy: isSingle ? 'chain' : strategySel.value,
        origins,
        failover: pool.failover || { enabled: true, maxRetries: 2, timeoutMs: 10000, retryOn: [500, 502, 503, 504, 522, 524] },
        ...(pool.createdBy ? { createdBy: pool.createdBy } : {}),
      };
      // 编辑（有 id）走 PUT；新建（无 id）走 POST，机器 id 由后端生成
      await API.pools.save(pid || null, payload);
      await refreshData();
    });
  }

  async function removePool(id, pool) {
    const p = pool || APP_DATA.pools.find((x) => x.id === id) || {};
    const kindName = poolKind(p) === 'single' ? '单一源站' : '源站池';
    const refs = p.refs || [];
    if (refs.length) {
      const who = [...new Set(refs.map((r) => r.label))].join('、');
      toast(`该${kindName}仍被 ${refs.length} 处引用（${who}），请先改指其它源站再删除`, 'err');
      return;
    }
    const ok = await confirmDialog(
      `删除${kindName}`,
      `确定删除「${p.name || id}」？此操作不可恢复。`
    );
    if (!ok) return;
    try {
      await API.pools.remove(id);
      toast('已删除', 'ok');
      await refreshData();
      await route(location.hash);
    } catch (e) { toast(e.message, 'err'); }
  }

  // ====== 缓存管理 ======
  async function renderCache() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('h3', {}, '缓存管理'));
    if (!APP_DATA.sites.length) {
      wrap.appendChild(el('p', { class: 'empty' }, '暂无站点。'));
      return wrap;
    }
    const rows = APP_DATA.sites.map((s) => [
      s.host, String(s.cacheGen || 0),
      actions([
        { label: '代次失效', onClick: () => purgeSite(s.host) },
      ]),
    ]);
    wrap.appendChild(table(['Host', '当前代次', '操作'], rows));
    return wrap;
  }

  async function purgeSite(host) {
    const ok = await confirmDialog(
      '清除缓存',
      '站点 ' + host + '\n操作：代次失效（递增缓存代次，新请求全部回源），是否继续？'
    );
    if (!ok) return;
    try {
      await API.cache.purge({ host });
      toast('已触发代次失效', 'ok');
      await refreshData();
      await route(location.hash);
    } catch (e) { toast(e.message, 'err'); }
  }

  // ====== 系统设置 ======
  async function renderSystem() {
    const wrap = el('div', { class: 'section' });
    wrap.appendChild(el('h3', {}, '系统设置'));

    let info = APP_DATA.info;
    if (!info) { try { info = await API.system.info(); APP_DATA.info = info; } catch (e) { toast(e.message, 'err'); } }

    const caps = (info && info.caps) || {};
    const rows = [
      ['运行平台', (info && info.platform) || PLATFORM],
      ['版本', (info && info.version) || '—'],
      ['边缘缓存', caps.hasEdgeCache ? '可用' : '不可用（降级）'],
      ['TCP Socket', caps.hasSocket ? '可用' : '不可用（socket 引擎降级 fetch）'],
      ['D1', caps.hasD1 ? '可用' : '不可用'],
      ['KV', caps.hasKV ? '可用' : '不可用（配置无法持久化！）'],
      ['统计驱动', (info && info.statsDriver) || 'none'],
    ];
    if (info && Array.isArray(info.limitations) && info.limitations.length) {
      wrap.appendChild(el('div', { class: 'banner warn' },
        info.limitations.map((l) => el('div', {}, '⚠ ' + l.message))));
    }
    wrap.appendChild(table(['项目', '状态'], rows));

    // 全局配置卡片（导航无独立 global 项，合并到系统页）
    //
    // 关键：这里必须持有各输入框的「节点引用」，不能靠 $('g-xxx') 按 id 全局查找。
    // renderSystem() 返回的 wrap 是在函数结束、由 route() 才 append 到 #content 的，
    // 函数体内 document 里根本不存在这些 id，$() 返回 null —— 回填时会抛
    // TypeError（表现为打开设置页永远是空值），保存时同样取不到值。
    const gAdminPath = el('input', { class: 'input', id: 'g-adminPath', placeholder: 'panel' });
    const gTokenTtl = el('input', { class: 'input', id: 'g-tokenTtl', type: 'number' });
    const gConfigCacheTtl = el('input', { class: 'input', id: 'g-configCacheTtl', type: 'number' });
    const gGlobalRateLimit = el('input', { class: 'input', id: 'g-globalRateLimit', type: 'number', placeholder: '0 表示不限制' });
    const gStatsEnabled = el('input', { type: 'checkbox', id: 'g-statsEnabled' });
    const gStatsDriver = select('g-statsDriver', [], '', [
      { value: 'kv', label: 'KV' },
      { value: 'd1', label: 'D1' + (caps.hasD1 ? '' : '（当前平台不可用）'), disabled: !caps.hasD1 },
      { value: 'none', label: '关闭' },
    ]);

    // 未启用统计时「统计驱动」无意义，完全隐藏
    const gStatsDriverField = field('统计驱动', gStatsDriver);
    const syncStats = () => { gStatsDriverField.style.display = gStatsEnabled.checked ? '' : 'none'; };
    gStatsEnabled.addEventListener('change', syncStats);
    syncStats();

    // 表单回填：统一入口，保存后与首次载入复用同一套逻辑
    const fillGlobalForm = (cfg) => {
      if (!cfg) return;
      gAdminPath.value = cfg.adminPath || '';
      gTokenTtl.value = cfg.tokenTtl != null ? cfg.tokenTtl : '';
      gConfigCacheTtl.value = cfg.configCacheTtl != null ? cfg.configCacheTtl : '';
      gStatsEnabled.checked = !!cfg.statsEnabled;
      gStatsDriver.value = cfg.statsDriver || 'none';
      gGlobalRateLimit.value = cfg.globalRateLimit != null ? cfg.globalRateLimit : '';
      syncStats();
    };

    const cfgCard = el('div', { class: 'card-block' }, [
      el('h4', {}, '全局配置'),
      el('div', { class: 'form-stack', id: 'global-form' }, [
        field('管理面路径', gAdminPath, '留空表示沿用当前已保存的值。'),
        field('Token 有效期（秒）', gTokenTtl, '留空表示沿用当前已保存的值。'),
        field('配置缓存 TTL（秒）', gConfigCacheTtl, '留空表示沿用当前已保存的值。'),
        field('全局限流（req/s）⚠️实验特性', gGlobalRateLimit, '⚠️ 实验特性（待开发）：全局请求频率上限，0 表示不限制；最少 10 req/s。当前为实验阶段，不建议生产依赖。'),
        field('启用统计', gStatsEnabled),
        gStatsDriverField,
      ]),
      el('div', { class: 'section-head' }, [
        el('button', {
          class: 'btn btn-primary', text: '保存全局配置',
          onclick: async () => {
            // 留空字段传空串，交由后端 validateGlobal(input, caps, current) 沿用旧值。
            // 注意不要用 Number(...)||0 —— 那会把「留空」变成显式 0，反而覆盖掉旧值。
            const payload = {
              adminPath: gAdminPath.value.trim(),
              tokenTtl: gTokenTtl.value.trim(),
              configCacheTtl: gConfigCacheTtl.value.trim(),
              globalRateLimit: gGlobalRateLimit.value.trim(),
              statsEnabled: gStatsEnabled.checked,
              statsDriver: gStatsDriver.value,
            };
            try {
              // 后端会静默钳制/回退非法值（如 adminPath 非法字符、tokenTtl 越界），
              // 因此以响应中的规范化结果回填表单，避免界面显示与实际存储不一致
              const saved = await API.config.save(payload);
              fillGlobalForm(saved);

              // 仅比较用户「确实填了」的字段，留空字段本就期望被后端替换成旧值，
              // 不应算作「被修正」而误报警告
              const adjusted = Object.keys(payload).filter((k) => {
                const v = payload[k];
                if (typeof v === 'string' && v === '') return false;
                return String(v) !== String(saved[k]);
              });
              if (adjusted.length) {
                toast('已保存，但部分值被后端修正：' + adjusted.join('、'), 'warn');
              } else {
                toast('已保存全局配置', 'ok');
              }
              await loadAll();
            } catch (e) { toast(e.message, 'err'); }
          },
        }),
      ]),
    ]);
    wrap.appendChild(cfgCard);

    // 载入现有全局配置填入表单（此时操作的是节点引用，无需已挂载到 document）
    try {
      fillGlobalForm(await API.config.get());
    } catch (e) { /* 配置尚未初始化时忽略 */ }

    wrap.appendChild(el('div', { class: 'section-head' }, [
      el('button', { class: 'btn', text: '导出配置', onclick: exportConfig }),
      el('button', { class: 'btn', text: '导入配置', onclick: importConfig }),
      el('button', { class: 'btn', text: '修改密码', onclick: openChangePassword }),
      el('button', { class: 'btn btn-danger', text: '退出登录', onclick: doLogout }),
    ]));
    return wrap;
  }

  // 导入配置：读本地 JSON 文件后调 /system/import 整体恢复（备份恢复手段）
  async function importConfig() {
    const ok = await confirmDialog(
      '导入配置',
      '导入将覆盖当前全部站点/源站池/全局规则/全局配置等，且不可恢复。确认继续？',
      { confirmText: 'IMPORT' }
    );
    if (!ok) return;
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      let cfg;
      try {
        cfg = JSON.parse(await file.text());
      } catch {
        toast('配置文件不是合法的 JSON', 'err');
        return;
      }
      try {
        const res = await API.system.import(cfg);
        const msg = res && res.message ? res.message : '配置已导入';
        const errs = res && Array.isArray(res.errors) && res.errors.length ? `，${res.errors.length} 项失败` : '';
        toast(msg + errs, res && res.errors && res.errors.length ? 'warn' : 'ok');
        await loadAll();
      } catch (e) { toast(e.message, 'err'); }
    };
    input.click();
  }

  // 修改密码：自建轻量 modal 表单收集旧/新密码，校验后调 /auth/password。
  // 项目本身没有通用 modal()，这里直接构建覆盖层并复用样式，避免引入不存在的函数。
  function openChangePassword() {
    const oldI = el('input', { class: 'input', type: 'password', placeholder: '当前密码' });
    const newI = el('input', { class: 'input', type: 'password', placeholder: '新密码（至少 8 位）' });
    const confI = el('input', { class: 'input', type: 'password', placeholder: '确认新密码' });

    const mask = el('div', { class: 'modal-mask', style: 'display:flex;' }, [
      el('div', { class: 'modal' }, [
        el('h3', { class: 'modal-title', text: '修改密码' }),
        el('div', { class: 'modal-text', text: '修改成功后需重新登录。' }),
        el('div', { class: 'modal-extra' }, [
          field('当前密码', oldI),
          field('新密码', newI),
          field('确认新密码', confI),
        ]),
        el('div', { class: 'modal-foot', style: 'margin-top:16px;display:flex;gap:8px;justify-content:flex-end;' }, [
          el('button', { class: 'btn', text: '取消', onclick: () => mask.remove() }),
          el('button', {
            class: 'btn btn-primary',
            text: '确认修改',
            onclick: async () => {
              if ((newI.value || '').length < 8) { toast('新密码至少 8 位', 'err'); return; }
              if (newI.value !== confI.value) { toast('两次输入的新密码不一致', 'err'); return; }
              try {
                const res = await API.auth.changePassword(oldI.value, newI.value);
                mask.remove();
                toast(res && res.reloginRequired ? '密码已修改，请重新登录' : '密码已修改', 'ok');
                if (res && res.reloginRequired) setTimeout(doLogout, 800);
              } catch (e) { toast(e.message, 'err'); }
            },
          }),
        ]),
      ]),
    ]);
    document.body.appendChild(mask);
  }

  async function exportConfig() {
    try {
      const resp = await API.system.export();
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'edgecdn-config.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast(e.message, 'err'); }
  }

  // 表单助手 --------------------------------------------------------------
  // 表单字段：label + 控件 + 可选的人话说明 hint（小白友好）
  function field(label, control, hint) {
    return el('div', { class: 'form-field' }, [
      el('label', { class: 'label' }, label),
      control,
      hint ? el('div', { class: 'field-hint muted' }, hint) : null,
    ]);
  }

  // 把分组结构渲染成带 <optgroup> 的 <select>：分类名只做分组标题，
  // 不再作为一个 value='' 的可选项出现在下拉里（以前会误导用户去选「网络优化」）。
  function selectWithGroups(groups, value) {
    const sel = el('select', { class: 'input' });
    sel.appendChild(el('option', { value: '' }, '请选择要添加的操作…'));
    for (const g of groups) {
      const og = el('optgroup', { label: g.group });
      for (const it of g.items) og.appendChild(el('option', { value: it.value }, it.label));
      sel.appendChild(og);
    }
    if (value != null) sel.value = value;
    return sel;
  }
  function select(id, options, value, preset, extraClass) {
    const opts = preset || options.map((o) => ({ value: o.value != null ? o.value : o, label: o.label != null ? o.label : o }));
    const cls = 'input' + (extraClass ? ' ' + extraClass : '');
    const sel = el('select', id ? { id, class: cls } : { class: cls },
      opts.map((o) => {
        const node = el('option', { value: o.value }, o.label);
        if (o.value === value) node.selected = true;
        if (o.disabled) node.disabled = true;
        return node;
      }));
    return sel;
  }

  async function refreshData() {
    const [sites, pools] = await Promise.all([
      API.sites.list().catch(() => ({ sites: [] })),
      API.pools.list().catch(() => ({ pools: [] })),
    ]);
    APP_DATA.sites = sites.sites || [];
    APP_DATA.pools = pools.pools || [];
    APP_DATA.poolsLegacySites = pools.legacySites || [];
  }

  // 主题切换（轻量） ------------------------------------------------------
  function bindTheme() {
    const btn = $('theme-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const root = document.documentElement;
      const dark = !root.classList.contains('light');
      root.classList.toggle('light', dark);
    });
  }

  // 启动 ------------------------------------------------------------------
  function bindStatic() {
    const doSubmit = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      // 提交期间禁用按钮，避免重复点击/原生表单提交导致的整页刷新
      const btn = $('login-btn');
      if (btn) btn.disabled = true;
      doLogin($('login-pwd').value).finally(() => {
        if (btn) btn.disabled = false;
      });
    };
    const form = $('login-form');
    if (form) form.addEventListener('submit', doSubmit);
    // 登录按钮改为显式点击触发（type=button），杜绝 form 原生 GET 提交把 URL
    // 变成 `.../__panel?` 并整页刷新回到登录页（CNB 公网代理环境下尤甚）
    const loginBtn = $('login-btn');
    if (loginBtn) {
      loginBtn.type = 'button';
      loginBtn.addEventListener('click', doSubmit);
    }
    const eye = $('login-eye');
    if (eye) eye.addEventListener('click', () => {
      const p = $('login-pwd');
      p.type = p.type === 'password' ? 'text' : 'password';
    });
    $('logout-btn') && $('logout-btn').addEventListener('click', doLogout);
    $('drawer-close') && ($('drawer-close').onclick = closeDrawer);
    $('drawer-cancel') && ($('drawer-cancel').onclick = closeDrawer);
    $('drawer-mask') && $('drawer-mask').addEventListener('click', closeDrawer);
    $('menu-btn') && $('menu-btn').addEventListener('click', () => { $('sidebar').classList.add('open'); $('sidebar-mask').hidden = false; });
    $('sidebar-close') && $('sidebar-close').addEventListener('click', () => { $('sidebar').classList.remove('open'); $('sidebar-mask').hidden = true; });
    $('sidebar-mask') && $('sidebar-mask').addEventListener('click', () => { $('sidebar').classList.remove('open'); $('sidebar-mask').hidden = true; });
    $$nav().forEach((a) => a.addEventListener('click', () => { $('sidebar').classList.remove('open'); $('sidebar-mask').hidden = true; }));
    bindTheme();
    window.addEventListener('hashchange', () => route(location.hash));
  }

  async function boot() {
    try {
      bindStatic();
      // 先看是否已有会话（HttpOnly Cookie）
      if (await ensureAuth()) {
        enterApp();
      } else {
        showLogin();
      }
    } catch (e) {
      // 最坏情况兜底：任何启动异常都回退到登录视图，绝不白屏
      console.error('[boot] fatal:', e && e.message || e);
      showLogin();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
