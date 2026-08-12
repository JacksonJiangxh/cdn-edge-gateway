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

  kv: {
    ping: () => get('/kv/ping'),
    list: (prefix) => get('/kv' + (prefix ? '?prefix=' + encodeURIComponent(prefix) : '')),
    get: (key) => get('/kv/' + encodeURIComponent(key)),
    put: (key, value, ttl) =>
      request('/kv/' + encodeURIComponent(key) + (ttl ? '?ttl=' + encodeURIComponent(ttl) : ''), {
        method: 'PUT',
        headers: { 'content-type': 'text/plain' },
        body: value,
      }),
    del: (key) => request('/kv/' + encodeURIComponent(key), { method: 'DELETE' }),
  },

  rules: {
    /** 全站通用规则（兜底），对所有站点生效、优先级最低 */
    global: () => get('/rules/global'),
    saveGlobal: (rules) => put('/rules/global', rules),
  },
};

if (typeof window !== 'undefined') window.API = API;
