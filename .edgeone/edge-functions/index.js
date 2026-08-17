
      let global = globalThis;
      globalThis.global = globalThis;

      if (typeof global.navigator === 'undefined') {
        global.navigator = {
          userAgent: 'edge-runtime',
          language: 'en-US',
          languages: ['en-US'],
        };
      } else {
        if (typeof global.navigator.language === 'undefined') {
          global.navigator.language = 'en-US';
        }
        if (!global.navigator.languages || global.navigator.languages.length === 0) {
          global.navigator.languages = [global.navigator.language];
        }
        if (typeof global.navigator.userAgent === 'undefined') {
          global.navigator.userAgent = 'edge-runtime';
        }
      }

      class MessageChannel {
        constructor() {
          this.port1 = new MessagePort();
          this.port2 = new MessagePort();
        }
      }
      class MessagePort {
        constructor() {
          this.onmessage = null;
        }
        postMessage(data) {
          if (this.onmessage) {
            setTimeout(() => this.onmessage({ data }), 0);
          }
        }
      }
      global.MessageChannel = MessageChannel;

      '__MIDDLEWARE_BUNDLE_CODE__'

      function recreateRequest(request, overrides = {}) {
        const cloned = typeof request.clone === 'function' ? request.clone() : request;
        const headers = new Headers(cloned.headers);

        if (overrides.headerPatches) {
          Object.keys(overrides.headerPatches).forEach((key) => {
            const value = overrides.headerPatches[key];
            if (value === null || typeof value === 'undefined') {
              headers.delete(key);
            } else {
              headers.set(key, value);
            }
          });
        }

        if (overrides.headers) {
          const extraHeaders = new Headers(overrides.headers);
          extraHeaders.forEach((value, key) => headers.set(key, value));
        }

        const url = overrides.url || cloned.url;
        const method = overrides.method || cloned.method || 'GET';
        const canHaveBody = method && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD';
        const body = overrides.body !== undefined ? overrides.body : canHaveBody ? cloned.body : undefined;

        // 如果rewrite传入的是完整URL（第三方地址），需要更新host
        if (overrides.url) {
          try {
            const newUrl = new URL(overrides.url, cloned.url);
            // 只有当新URL是绝对路径（包含协议和host）时才更新host
            if (overrides.url.startsWith('http://') || overrides.url.startsWith('https://')) {
              headers.set('host', newUrl.host);
            }
            // 相对路径时保持原有host不变
          } catch (e) {
            // URL解析失败时保持原有host
          }
        }

        const init = {
          method,
          headers,
          redirect: cloned.redirect,
          credentials: cloned.credentials,
          cache: cloned.cache,
          mode: cloned.mode,
          referrer: cloned.referrer,
          referrerPolicy: cloned.referrerPolicy,
          integrity: cloned.integrity,
          keepalive: cloned.keepalive,
          signal: cloned.signal,
        };

        if (canHaveBody && body !== undefined) {
          init.body = body;
        }

        if ('duplex' in cloned) {
          init.duplex = cloned.duplex;
        }

        return new Request(url, init);

      }

      

      function usercode(ev, hookCtx) {
        hookCtx = hookCtx || { fetch: globalThis.fetch };
        const { fetch } = hookCtx;
        const globalthis = hookCtx;
        "use strict";
        // ↓ 用户原始代码
        return (async function handleRequest(context) {
          let routeParams = {};
          let pagesFunctionResponse = null;
          let request = context.request;
          const waitUntil = context.waitUntil;
          let urlInfo = new URL(request.url);
          const eo = request.eo || {};


          const normalizePathname = () => {
            if (urlInfo.pathname !== '/' && urlInfo.pathname.endsWith('/')) {
              urlInfo.pathname = urlInfo.pathname.slice(0, -1);
            }
          };

          function getSuffix(pathname = '') {
            // Use a regular expression to extract the file extension from the URL
            const suffix = pathname.match(/\.([^\.]+)$/);
            // If an extension is found, return it, otherwise return an empty string
            return suffix ? '.' + suffix[1] : null;
          }

          normalizePathname();

          let matchedFunc = false;

          
        const runEdgeFunctions = () => {
          
          if(!matchedFunc && /^\/(.+?)$/.test(urlInfo.pathname)) {
            routeParams = {"id":"default","mode":2,"left":"/"};
            matchedFunc = true;
            (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x2) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x2, {
    get: (a, b2) => (typeof require !== "undefined" ? require : a)[b2]
  }) : x2)(function(x2) {
    if (typeof require !== "undefined")
      return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x2 + '" is not supported');
  });
  var __copyProps = (to2, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to2, key) && key !== except)
          __defProp(to2, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to2;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // _worker.js
  var $i = Object.defineProperty;
  var R = (e, u, t) => () => {
    if (t)
      throw t[0];
    try {
      return e && (u = e(e = 0)), u;
    } catch (r) {
      throw t = [r], r;
    }
  };
  var dt = (e, u) => {
    for (var t in u)
      $i(e, t, { get: u[t], enumerable: true });
  };
  function vr(e) {
    try {
      return globalThis[e];
    } catch {
      return;
    }
  }
  function sa(e, u) {
    if (e && e[u] != null)
      return String(e[u]);
    try {
      let t = vr("process");
      if (t && t.env && t.env[u] != null)
        return String(t.env[u]);
    } catch {
    }
  }
  function Dr(e, u) {
    let t = sa(e, u);
    if (t == null)
      return;
    let r = Number(t);
    return Number.isFinite(r) && r > 0 ? r : void 0;
  }
  function Mi() {
    try {
      let e = vr("caches");
      if (typeof e < "u" && e !== null && typeof e.default < "u")
        return true;
    } catch {
    }
    try {
      let e = vr("cache");
      if (typeof e < "u" && e !== null && typeof e.put == "function")
        return true;
    } catch {
    }
    return false;
  }
  function aa(e) {
    return !!(e && typeof e == "object" && typeof e.get == "function" && typeof e.put == "function");
  }
  function oa(e) {
    let u = e && (e.REDIS_URL || e.REDIS_URL_KV);
    return typeof u == "string" && u.trim() !== "";
  }
  function yr(e) {
    return !!(e && typeof e == "object" && typeof e.prepare == "function");
  }
  function Cr(e) {
    return !!(e && typeof e == "object" && typeof e.get == "function" && typeof e.put == "function" && typeof e.head == "function");
  }
  function Ui(e) {
    let t = (sa(e, "CLOUD_PLATFORM") || "cf").toLowerCase().trim();
    if (!t)
      throw new Error("[caps] \u5FC5\u987B\u8BBE\u7F6E\u73AF\u5883\u53D8\u91CF CLOUD_PLATFORM \u4EE5\u58F0\u660E\u90E8\u7F72\u5382\u5546\uFF0C\u53D6\u503C\u4E3A cf / eo / esa \u4E4B\u4E00\uFF08\u5206\u522B\u5BF9\u5E94 Cloudflare / EdgeOne / \u963F\u91CC\u4E91 ESA\uFF09\u3002");
    let r = Br[t];
    if (!r)
      throw new Error(`[caps] CLOUD_PLATFORM \u53D6\u503C "${t}" \u975E\u6CD5\uFF0C\u5FC5\u987B\u4E3A cf / eo / esa \u4E4B\u4E00\uFF08\u4EA6\u517C\u5BB9\u65E7\u522B\u540D edgeone / cloudflare / aliyun-esa / pages\uFF09\u3002`);
    return r !== t && console.warn(`[caps] CLOUD_PLATFORM="${t}" \u5DF2\u5F52\u4E00\u4E3A "${r}"\uFF0C\u5EFA\u8BAE\u663E\u5F0F\u4F7F\u7528 cf / eo / esa\u3002`), r;
  }
  function Ge(e) {
    let u = e || {};
    if (Ar && na === u)
      return Ar;
    let t = Ui(u), r = Mi(), n = r || t === "eo" || t === "esa", a = t === "eo", o = t === "eo", s = t === "esa", i = t === "esa" ? 32 : 1 / 0, l = t === "esa", c = aa(u.CDN_KV) || aa(u.KV), d = Object.freeze({ platform: t, hasEdgeCache: n, hasCacheApi: r, eoEdgeCache: a, cacheIsNodeLocal: o, cacheSingleInstance: s, cacheSubreqLimit: i, cacheKeyHttpOnly: l, maxSubRequests: t === "esa" ? 32 : 1e3, memBudgetBytes: 134152192, hasRawIpFetch: t === "cf", hasSocket: t === "cf", hasD1: yr(u.CDN_DB) || yr(u.DB) || yr(u.D1), hasKV: c || oa(u), kvBackend: c ? "native" : oa(u) ? "redis" : "none", hasR2: t === "cf" && (Cr(u.CDN_R2) || Cr(u.R2) || Object.values(u).some((p) => Cr(p))), hasStaticHosting: t === "eo" || t === "cf", maxExecutionMs: Dr(u, "EXECUTION_LIMIT_MS") ?? (t === "cf" ? 3e4 : 12e4), firstByteMs: t === "esa" ? Dr(u, "FIRST_BYTE_LIMIT_MS") ?? 1e4 : Dr(u, "FIRST_BYTE_LIMIT_MS") ?? void 0 });
    return Ar = d, na = u, d;
  }
  var Br;
  var Ar;
  var na;
  var pt = R(() => {
    Br = Object.freeze({ cf: "cf", cloudflare: "cf", workers: "cf", pages: "cf", eo: "eo", edgeone: "eo", es: "esa", esa: "esa", "aliyun-esa": "esa", "alibaba-esa": "esa", aliyun: "esa", alibaba: "esa" }), Ar = null, na = null;
  });
  function ia(e) {
    return e >= "0" && e <= "9" || e >= "a" && e <= "z" || e >= "A" && e <= "Z";
  }
  function te(e) {
    if (typeof e != "string" || e === "")
      throw new TypeError(`encodeKey: \u952E\u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\uFF0C\u6536\u5230 ${JSON.stringify(e)}`);
    let u = ft.get(e);
    if (u !== void 0)
      return u;
    let t = "";
    for (let r of e) {
      if (ia(r)) {
        t += r;
        continue;
      }
      if (r === "_") {
        t += "__";
        continue;
      }
      let n = Pi.encode(r);
      for (let a = 0; a < n.length; a++)
        t += "_" + n[a].toString(16).toUpperCase().padStart(2, "0");
    }
    if (t.length > 512)
      throw new RangeError(`encodeKey: \u952E "${e}" \u7F16\u7801\u540E\u4E3A ${t.length} B\uFF0C\u8D85\u8FC7 512 B \u4E0A\u9650`);
    return ft.size >= zi && ft.clear(), ft.set(e, t), t;
  }
  function Ft(e) {
    if (typeof e != "string" || e === "")
      return null;
    let u = [];
    for (let t = 0; t < e.length; t++) {
      let r = e[t];
      if (ia(r)) {
        u.push(r.charCodeAt(0));
        continue;
      }
      if (r !== "_")
        return null;
      let n = e[t + 1];
      if (n === void 0)
        return null;
      if (n === "_") {
        u.push(95), t += 1;
        continue;
      }
      let a = e.slice(t + 1, t + 3);
      if (a.length !== 2 || !/^[0-9A-Fa-f]{2}$/.test(a))
        return null;
      u.push(parseInt(a, 16)), t += 2;
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(u));
    } catch {
      return null;
    }
  }
  function gt(e) {
    return typeof e != "string" || e === "" ? "" : te(e);
  }
  var Pi;
  var _0;
  var ft;
  var zi;
  var wr = R(() => {
    Pi = new TextEncoder(), _0 = new TextDecoder(), ft = /* @__PURE__ */ new Map(), zi = 2e3;
  });
  function Tr(e) {
    let u = e && (e.REDIS_URL || e.REDIS_URL_KV);
    return typeof u == "string" && u.trim() !== "";
  }
  function ht(e, u) {
    return e ? `${e}${u}` : u;
  }
  function kr(e, u, t) {
    let r = [u, ...t.map((n) => encodeURIComponent(n))];
    return `${e}/${r.join("/")}`;
  }
  async function mt(e, u, t, r) {
    let n = { accept: "application/json" };
    t && (n.authorization = t);
    let a = typeof AbortController == "function" ? new AbortController() : null, o;
    a && r && r > 0 && (o = setTimeout(() => a.abort(), r));
    try {
      let s = await fetch(e, { ...u, headers: n, signal: a ? a.signal : void 0 }), i = await s.text();
      if (!i)
        return null;
      try {
        return JSON.parse(i);
      } catch {
        return { __raw__: i, __status__: s.status };
      }
    } catch (s) {
      throw s && s.name === "AbortError" ? new Error(`Webdis \u8BF7\u6C42\u8D85\u65F6\uFF08>${r}ms\uFF09`) : s;
    } finally {
      o && clearTimeout(o);
    }
  }
  function la(e, u) {
    return !e || typeof e != "object" || e.__raw__ !== void 0 ? { ok: false, value: null } : u in e ? { ok: true, value: e[u] } : { ok: false, value: null };
  }
  function Sr(e) {
    let t = (e.REDIS_URL || e.REDIS_URL_KV || "").trim().replace(/\/+$/, "") || "http://127.0.0.1:7379", r = typeof e.REDIS_TOKEN == "string" && e.REDIS_TOKEN ? e.REDIS_TOKEN : "", n = typeof e.REDIS_PREFIX == "string" && e.REDIS_PREFIX ? e.REDIS_PREFIX : "", a = (() => {
      let s = Number(e.REDIS_TIMEOUT_MS);
      return Number.isFinite(s) && s > 0 ? s : 5e3;
    })();
    return { backend: "redis-webdis", async get(s, i = "text") {
      if (typeof s != "string" || s === "")
        return null;
      let l;
      try {
        l = te(s);
      } catch {
        return null;
      }
      let c = ht(n, l), d;
      try {
        d = await mt(kr(t, "GET", [c]), { method: "GET" }, r, a);
      } catch {
        return null;
      }
      let { value: p } = la(d, "GET");
      if (p == null)
        return null;
      if (typeof p == "object")
        return i === "json" ? p : JSON.stringify(p);
      let f = String(p);
      if (i !== "json")
        return f;
      try {
        return JSON.parse(f);
      } catch {
        return null;
      }
    }, async put(s, i, l) {
      if (typeof s != "string" || s === "")
        return;
      let c = te(s), d = ht(n, c), p = typeof i == "string" ? i : JSON.stringify(i), f = l && typeof l.expirationTtl == "number" && l.expirationTtl > 0 ? Math.max(1, Math.floor(l.expirationTtl)) : 0, g = f > 0 ? "SETEX" : "SET", m = f > 0 ? [d, String(f)] : [d], A = `${t}/${g}/${m.map((S) => encodeURIComponent(S)).join("/")}`;
      try {
        await mt(A, { method: "POST", body: p, headers: { "content-type": "application/octet-stream" } }, r, a);
      } catch (S) {
        throw new Error(`Redis put failed for "${s}": ${S && S.message ? S.message : S}`);
      }
    }, async delete(s) {
      if (typeof s != "string" || s === "")
        return;
      let i = te(s), l = ht(n, i);
      try {
        await mt(kr(t, "DEL", [l]), { method: "GET" }, r, a);
      } catch (c) {
        throw new Error(`Redis delete failed for "${s}": ${c && c.message ? c.message : c}`);
      }
    }, async list(s) {
      let i = typeof s?.prefix == "string" && s.prefix !== "" ? (() => {
        try {
          return gt(s.prefix);
        } catch {
          return "";
        }
      })() : "", l = `${ht(n, i)}*`, c;
      try {
        c = await mt(kr(t, "KEYS", [l]), { method: "GET" }, r, a);
      } catch {
        return { keys: [], list_complete: true };
      }
      let { value: d } = la(c, "KEYS");
      if (!Array.isArray(d))
        return { keys: [], list_complete: true };
      let p = [];
      for (let f of d) {
        if (typeof f != "string")
          continue;
        let g = n ? f.slice(n.length) : f, m = Ft(g);
        m === null ? p.push({ name: f, legacy: true }) : p.push({ name: m });
      }
      return { keys: p, list_complete: true };
    } };
  }
  async function ca(e) {
    if (!Tr(e))
      return { ok: false, latencyMs: 0, backend: "none", error: "\u672A\u914D\u7F6E REDIS_URL" };
    let u = `__probe__:${Math.random().toString(36).slice(2)}`, t = `ok-${Date.now()}`, r = Sr(e), n = Date.now();
    try {
      await r.put(u, t, { expirationTtl: 120 });
      let a = await r.get(u, "text");
      await r.delete(u);
      let o = Date.now() - n;
      return a !== t ? { ok: false, latencyMs: o, backend: "redis-webdis", error: "\u8BFB\u5199\u56DE\u73AF\u4E0D\u4E00\u81F4\uFF08\u5199\u5165\u540E\u8BFB\u56DE\u7684\u503C\u4E0D\u5339\u914D\uFF0C\u8BF7\u68C0\u67E5 Webdis \u524D\u7F6E\u4EE3\u7406\u662F\u5426\u6539\u5199\u4E86\u54CD\u5E94\u7ED3\u6784\uFF09" } : { ok: true, latencyMs: o, backend: "redis-webdis" };
    } catch (a) {
      return { ok: false, latencyMs: Date.now() - n, backend: "redis-webdis", error: a && a.message ? a.message : String(a) };
    }
  }
  var _r = R(() => {
    wr();
  });
  function ga(e, u) {
    let t = Rr.get(e);
    if (t)
      return t;
    let r = (async () => {
      try {
        return await u();
      } finally {
        Rr.delete(e);
      }
    })();
    return Rr.set(e, r), r;
  }
  function ha(e) {
    return !!(e && typeof e == "object" && typeof e.get == "function" && typeof e.put == "function");
  }
  function ji() {
    try {
      return typeof globalThis.EdgeKV == "function";
    } catch {
      return false;
    }
  }
  function Gi(e) {
    if (!e)
      return null;
    for (let u of Fa)
      if (ha(e[u]))
        return e[u];
    return null;
  }
  function Ki() {
    let e;
    try {
      e = globalThis || (typeof global < "u" ? global : null);
    } catch {
      return null;
    }
    if (!e)
      return null;
    for (let u of Fa)
      if (ha(e[u]))
        return e[u];
    return null;
  }
  function pa(e) {
    if (e == null)
      return null;
    if (typeof e == "string")
      return { name: e };
    let u = e.name ?? e.key ?? e.Key;
    if (typeof u != "string" || u === "")
      return null;
    let t = { name: u };
    return typeof e.expiration == "number" && (t.expiration = e.expiration), e.metadata != null && (t.metadata = e.metadata), t;
  }
  function fa(e) {
    let u = da.get(e);
    if (u)
      return u;
    let t = { async get(r, n = "text") {
      if (typeof r != "string" || r === "")
        return null;
      let a;
      try {
        a = te(r);
      } catch {
        return null;
      }
      let o;
      try {
        o = await ga(a, async () => {
          try {
            return await e.get(a, "text");
          } catch {
            try {
              return await e.get(a);
            } catch {
              return null;
            }
          }
        });
      } catch {
        return null;
      }
      if (o == null)
        return null;
      let s;
      if (typeof o == "string")
        s = o;
      else if (o instanceof ArrayBuffer || ArrayBuffer.isView(o))
        try {
          s = new TextDecoder().decode(o instanceof ArrayBuffer ? o : o.buffer);
        } catch {
          return null;
        }
      else {
        if (typeof o == "object")
          return n === "json" ? o : JSON.stringify(o);
        s = String(o);
      }
      if (n !== "json")
        return s;
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    }, async put(r, n, a) {
      if (typeof r != "string" || r === "")
        return;
      let o = te(r), s = typeof n == "string" ? n : JSON.stringify(n), i;
      a && typeof a.expirationTtl == "number" && a.expirationTtl > 0 && (i = { expirationTtl: Math.max(60, Math.floor(a.expirationTtl)) });
      try {
        i ? await e.put(o, s, i) : await e.put(o, s);
      } catch (l) {
        throw new Error(`KV put failed for "${r}": ${l && l.message ? l.message : l}`);
      }
    }, async delete(r) {
      if (typeof r != "string" || r === "" || typeof e.delete != "function")
        return;
      let n = te(r);
      try {
        await e.delete(n);
      } catch (a) {
        throw new Error(`KV delete failed for "${r}": ${a && a.message ? a.message : a}`);
      }
    }, async list(r) {
      if (typeof e.list != "function")
        return { keys: [], list_complete: true };
      let n = { ...r || {} };
      if (typeof n.prefix == "string" && n.prefix !== "")
        try {
          n.prefix = gt(n.prefix);
        } catch {
          return { keys: [], list_complete: true };
        }
      let a;
      try {
        a = await e.list(n);
      } catch {
        return { keys: [], list_complete: true };
      }
      if (!a)
        return { keys: [], list_complete: true };
      let o = Array.isArray(a.keys) ? a.keys : Array.isArray(a) ? a : [], s = [];
      for (let d of o) {
        let p = pa(d);
        if (!p)
          continue;
        let f = Ft(p.name);
        f === null ? p.legacy = true : p.name = f, s.push(p);
      }
      let i = typeof a.list_complete == "boolean" ? a.list_complete : typeof a.listComplete == "boolean" ? a.listComplete : true, l = { keys: s, list_complete: i }, c = a.cursor ?? a.next_cursor;
      return typeof c == "string" && c !== "" && (l.cursor = c), l;
    } };
    return t.raw = { async get(r) {
      try {
        let n = await e.get(r, "text");
        return n == null ? null : typeof n == "string" ? n : String(n);
      } catch {
        try {
          let n = await e.get(r);
          return n == null ? null : typeof n == "string" ? n : String(n);
        } catch {
          return null;
        }
      }
    }, async delete(r) {
      if (typeof e.delete != "function")
        return false;
      try {
        return await e.delete(r), true;
      } catch {
        return false;
      }
    }, async list(r) {
      if (typeof e.list != "function")
        return { keys: [], list_complete: true };
      let n;
      try {
        n = await e.list(r || {});
      } catch {
        return { keys: [], list_complete: true };
      }
      if (!n)
        return { keys: [], list_complete: true };
      let a = Array.isArray(n.keys) ? n.keys : Array.isArray(n) ? n : [], o = [];
      for (let c of a) {
        let d = pa(c);
        d && o.push(d);
      }
      let s = typeof n.list_complete == "boolean" ? n.list_complete : typeof n.listComplete == "boolean" ? n.listComplete : true, i = { keys: o, list_complete: s }, l = n.cursor ?? n.next_cursor;
      return typeof l == "string" && l !== "" && (i.cursor = l), i;
    } }, da.set(e, t), t;
  }
  function Wi(e) {
    if (!ji())
      return null;
    let u, t = e && e.ESA_KV_NAMESPACE || qi;
    try {
      u = new globalThis.EdgeKV({ namespace: t });
    } catch {
      return null;
    }
    return !u || typeof u.get != "function" ? null : { backend: "esa-edgekv", async get(n, a = "text") {
      if (typeof n != "string" || n === "")
        return null;
      let o;
      try {
        o = te(n);
      } catch {
        return null;
      }
      let s;
      try {
        s = await ga(o, async () => {
          try {
            return await u.get(o, { type: "text" });
          } catch {
            return null;
          }
        });
      } catch {
        return null;
      }
      if (s == null)
        return null;
      let i;
      if (typeof s == "string")
        i = s;
      else {
        if (typeof s == "object")
          return a === "json" ? s : JSON.stringify(s);
        i = String(s);
      }
      if (a !== "json")
        return i;
      try {
        return JSON.parse(i);
      } catch {
        return null;
      }
    }, async put(n, a, o) {
      if (typeof n != "string" || n === "")
        return;
      let s = te(n), i = typeof a == "string" ? a : JSON.stringify(a), l = {};
      if (o && typeof o.expirationTtl == "number" && o.expirationTtl > 0 && (l.expirationTtl = Math.max(60, Math.floor(o.expirationTtl))), typeof u.put != "function")
        throw new Error(`EdgeKV \u4E0D\u652F\u6301 put\uFF08\u547D\u540D\u7A7A\u95F4 ${t}\uFF09`);
      try {
        await u.put(s, i, l);
      } catch (c) {
        throw new Error(`EdgeKV put failed for "${n}": ${c && c.message ? c.message : c}`);
      }
    }, async delete(n) {
      if (typeof n != "string" || n === "" || typeof u.delete != "function")
        return;
      let a = te(n);
      try {
        await u.delete(a);
      } catch (o) {
        throw new Error(`EdgeKV delete failed for "${n}": ${o && o.message ? o.message : o}`);
      }
    }, async list() {
      return { keys: [], list_complete: true };
    } };
  }
  function Vi(e) {
    let u = e && (e.CLOUD_PLATFORM || "") || "", t = String(u).toLowerCase();
    return Br[t] === "esa";
  }
  function se(e) {
    let u = Gi(e);
    if (u)
      return fa(u);
    let t = Ki();
    if (t)
      return fa(t);
    let r = Vi(e) ? null : Wi(e);
    return r || (Tr(e) ? Sr(e) : null);
  }
  async function ma(e, u) {
    return se(e);
  }
  var Fa;
  var qi;
  var da;
  var Rr;
  var Et = R(() => {
    wr();
    _r();
    pt();
    Fa = ["CDN_KV", "KV"], qi = typeof process < "u" && process.env && process.env.ESA_KV_NAMESPACE || "kv", da = /* @__PURE__ */ new WeakMap(), Rr = /* @__PURE__ */ new Map();
  });
  function bt() {
    let e = typeof globalThis < "u" ? globalThis.crypto : void 0;
    if (!e || !e.subtle)
      throw new Error("\u5F53\u524D\u8FD0\u884C\u65F6\u4E0D\u652F\u6301 WebCrypto\uFF08crypto.subtle \u4E0D\u53EF\u7528\uFF09");
    return e;
  }
  function Su(e) {
    return Xi.encode(String(e ?? ""));
  }
  function xt(e) {
    let u = e instanceof Uint8Array ? e : new Uint8Array(e), t = "", r = 32768;
    for (let n = 0; n < u.length; n += r)
      t += String.fromCharCode.apply(null, u.subarray(n, n + r));
    return btoa(t);
  }
  function Ea(e) {
    let u = String(e).replace(/-/g, "+").replace(/_/g, "/"), t = u.length % 4;
    if (t === 2)
      u += "==";
    else if (t === 3)
      u += "=";
    else if (t === 1)
      throw new Error("\u975E\u6CD5\u7684 base64 \u5B57\u7B26\u4E32");
    let r = atob(u), n = new Uint8Array(r.length);
    for (let a = 0; a < r.length; a++)
      n[a] = r.charCodeAt(a);
    return n;
  }
  function Yi(e) {
    return String(e).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function ba(e) {
    let u = e instanceof Uint8Array ? e : new Uint8Array(e), t = "";
    for (let r = 0; r < u.length; r++)
      t += u[r].toString(16).padStart(2, "0");
    return t;
  }
  async function Lr(e, u, t = 1e5) {
    let r = bt(), n = Number.isFinite(t) && t > 0 ? Math.floor(t) : 1e5, a = await r.subtle.importKey("raw", Su(e), "PBKDF2", false, ["deriveBits"]), o = await r.subtle.deriveBits({ name: "PBKDF2", salt: Su(u), iterations: n, hash: "SHA-256" }, a, 256);
    return xt(o);
  }
  async function xa(e, u) {
    let t = bt(), r = await t.subtle.importKey("raw", Su(e), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), n = await t.subtle.sign("HMAC", r, Su(u));
    return Yi(xt(n));
  }
  async function Or(e) {
    let t = await bt().subtle.digest("SHA-256", Su(e));
    return new Uint8Array(t);
  }
  async function Aa(e) {
    let u = await Or(e);
    return ba(u);
  }
  function At(e = 16) {
    let u = Number.isFinite(e) && e > 0 ? Math.floor(e) : 16, t = new Uint8Array(u);
    return bt().getRandomValues(t), ba(t);
  }
  function _u(e, u) {
    let t = typeof e == "string" ? e : String(e ?? ""), r = typeof u == "string" ? u : String(u ?? ""), n = t.length ^ r.length, a = Math.max(t.length, r.length);
    for (let o = 0; o < a; o++) {
      let s = o < t.length ? t.charCodeAt(o) : 0, i = o < r.length ? r.charCodeAt(o) : 0;
      n |= s ^ i;
    }
    return n === 0;
  }
  var Xi;
  var M0;
  var Dt = R(() => {
    Xi = new TextEncoder(), M0 = new TextDecoder();
  });
  async function Ji(e) {
    let u = e && e.env, t = u && u.JWT_SECRET;
    return typeof t == "string" && t.length >= 8 ? await Or(t) : null;
  }
  async function ya(e) {
    let u = await Ji(e);
    return u ? crypto.subtle.importKey("raw", u, { name: Nr }, false, ["encrypt", "decrypt"]) : null;
  }
  function Qi(e) {
    let u = "";
    for (let t = 0; t < e.length; t++)
      u += String.fromCharCode(e[t]);
    return btoa(u);
  }
  function Zi(e) {
    let u = atob(e), t = new Uint8Array(u.length);
    for (let r = 0; r < u.length; r++)
      t[r] = u.charCodeAt(r);
    return t;
  }
  async function Ca(e, u) {
    if (e == null)
      return e;
    let t = await ya(u);
    if (!t)
      return Da || (Da = true, console.warn("[cipher] \u4E3B\u5BC6\u94A5\uFF08JWT_SECRET\uFF09\u672A\u914D\u7F6E\uFF0Ccnb/github token \u5C06\u4EE5\u660E\u6587\u843D\u76D8\uFF08\u4E0D\u5B89\u5168\uFF0C\u8BF7\u5C3D\u5FEB\u8BBE\u7F6E JWT_SECRET\uFF09")), yt + e;
    try {
      let r = crypto.getRandomValues(new Uint8Array(Ir)), n = await crypto.subtle.encrypt({ name: Nr, iv: r }, t, new TextEncoder().encode(e));
      return Hr + Qi(new Uint8Array([...r, ...new Uint8Array(n)]));
    } catch (r) {
      return console.warn("[cipher] \u52A0\u5BC6\u5931\u8D25\uFF0C\u964D\u7EA7\u660E\u6587\u843D\u76D8\uFF1A" + r.message), yt + e;
    }
  }
  async function va(e, u) {
    if (e == null || typeof e != "string")
      return e;
    if (e.startsWith(Hr)) {
      let t = await ya(u);
      if (!t)
        throw new Error("\u4E3B\u5BC6\u94A5\uFF08JWT_SECRET\uFF09\u672A\u914D\u7F6E\uFF0C\u65E0\u6CD5\u89E3\u5BC6 cnb/github token\uFF08\u8BF7\u8BBE\u7F6E JWT_SECRET\uFF09");
      try {
        let r = Zi(e.slice(Hr.length)), n = r.slice(0, Ir), a = r.slice(Ir), o = await crypto.subtle.decrypt({ name: Nr, iv: n }, t, a);
        return new TextDecoder().decode(o);
      } catch (r) {
        throw new Error("cnb/github token \u89E3\u5BC6\u5931\u8D25\uFF1A" + r.message);
      }
    }
    return e.startsWith(yt) ? e.slice(yt.length) : e;
  }
  var Nr;
  var Ir;
  var yt;
  var Hr;
  var Da;
  var $r = R(() => {
    Dt();
    Nr = "AES-GCM", Ir = 12, yt = "plain:", Hr = "enc:", Da = false;
  });
  var Mr;
  var Ba = R(() => {
    Mr = { version: 1, exportedAt: null, global: null, globalRules: null, sites: [], pools: [] };
  });
  function lu(e) {
    if (!e)
      return "";
    for (let u of wa) {
      let t = e.get(u);
      if (!t)
        continue;
      let r = t.trim();
      if (!r)
        continue;
      if (u === "forwarded") {
        let a = el(r);
        if (a)
          return a;
        continue;
      }
      if (u === "cloudfront-viewer-address") {
        let a = r.includes("]") ? r.slice(0, r.lastIndexOf("]") + 1) : r.split(":")[0];
        if (a)
          return a;
        continue;
      }
      let n = r.split(",")[0].trim();
      if (n)
        return n;
    }
    return "";
  }
  function el(e) {
    let t = /^for=("?)([^\s;,"]+)\1/i.exec(e), r = t ? t[2] : "";
    if (!r)
      return "";
    if (r.includes("."))
      r = r.split(":")[0];
    else if (r.startsWith("[")) {
      let n = r.indexOf("]");
      n > 0 && (r = r.slice(1, n));
    } else
      r.includes(":") && (r = r.split(":")[0]);
    return r;
  }
  var wa;
  var Ct = R(() => {
    wa = Object.freeze(["cf-connecting-ip", "true-client-ip", "fastly-client-ip", "fastly-ssl-client-ip", "eo-connecting-ip", "ali-cdn-real-ip", "akamai-client-ip", "cloudfront-viewer-address", "x-real-ip", "x-client-ip", "client-ip", "remote-addr", "x-original-forwarded-for", "x-envoy-external-address", "x-ucloud-remote-ip", "x-forwarded-for", "forwarded"]);
  });
  function tl(e) {
    return ul[String(e || "").toUpperCase()] || "";
  }
  function rl(e) {
    return e ? /Mobile|Android|iPhone|iPad|iPod|Windows Phone/i.test(e) ? "mobile" : /bot|crawl|spider|crawl|curl|wget|python-requests|go-http-client|java\//i.test(e) ? "bot" : "desktop" : "desktop";
  }
  async function ka(e) {
    let u = String(e.url.hostname || "").toLowerCase().replace(/:\d+$/, "");
    if (!u)
      return null;
    let t = null;
    try {
      t = await ie(e, u);
    } catch (r) {
      return e.debug.siteError = r?.message || String(r), null;
    }
    return !t || t.enabled === false ? null : (e.debug.siteId = t.host, t);
  }
  function Ur(e) {
    let u = e.url, t = u.pathname, r = t.split("/").pop() || "", n = r.lastIndexOf("."), a = n > 0 && n !== r.length - 1 ? r.slice(n + 1).toLowerCase() : "", o = e.request.headers, s = lu(o), i = (o.get("cf-ipcountry") || "").toUpperCase(), l = o.get("user-agent") || "", c = o.get("cf-asn") || o.get("asn") || "";
    return { host: String(u.hostname || "").toLowerCase(), path: t, fullUrl: u.href, query: u.search.replace(/^\?/, ""), extension: a, filename: r, directory: t.slice(0, t.lastIndexOf("/") + 1), method: (e.request.method || "GET").toUpperCase(), clientIp: s, clientCountry: i, clientAsn: c, clientContinent: tl(i), clientDevice: rl(l), userAgent: l, referer: o.get("referer") || "", origin: e.origin ? `${e.origin.id}` : "", originAddr: e.origin ? `${e.origin.addr}` : "", _headers: o, _url: u };
  }
  function nl(e, u) {
    let t = u.target;
    if (t === "header")
      return e._headers.get(u.key || "");
    if (t === "cookie") {
      let n = e._headers.get("cookie") || "", a = u.key || "";
      if (!a)
        return null;
      for (let o of n.split(";")) {
        let s = o.indexOf("=");
        if (!(s < 0) && o.slice(0, s).trim() === a)
          return o.slice(s + 1).trim();
      }
      return null;
    }
    if (t === "query")
      return u.key ? e._url.searchParams.get(u.key) : e.query;
    if (t === "origin" || t === "originAddr")
      return e[t] ?? null;
    let r = e[t];
    return r === void 0 ? null : r;
  }
  function al(e, u, t, r) {
    if (e === "exists")
      return u !== null;
    if (e === "notExists")
      return u === null;
    if (u === null)
      return false;
    let n = Array.isArray(t) ? t : [];
    if (n.length === 0)
      return false;
    let a = r ? u.toLowerCase() : u, o = (i) => r ? String(i).toLowerCase() : String(i);
    if (e === "regex" || e === "notRegex") {
      let i = n.some((l) => {
        try {
          return new RegExp(String(l), r ? "i" : "").test(u);
        } catch {
          return false;
        }
      });
      return e === "regex" ? i : !i;
    }
    let s = false;
    switch (e) {
      case "equal":
      case "notEqual":
        return s = n.some((i) => a === o(i)), e === "equal" ? s : !s;
      case "contain":
      case "notContain":
        return s = n.some((i) => a.includes(o(i))), e === "contain" ? s : !s;
      case "prefix":
      case "notPrefix":
        return s = n.some((i) => a.startsWith(o(i))), e === "prefix" ? s : !s;
      case "suffix":
      case "notSuffix":
        return s = n.some((i) => a.endsWith(o(i))), e === "suffix" ? s : !s;
      default:
        return false;
    }
  }
  function ol(e, u) {
    if (!e || !e.target || !e.op || Pr.includes(e.target) && !e.key && e.target !== "query")
      return false;
    let t = e.ignoreCase !== false, r = nl(u, e);
    return al(e.op, r, e.values, t);
  }
  function sl(e, u) {
    let t = e?.match || {}, r = Array.isArray(t.conditions) ? t.conditions.filter((n) => Array.isArray(n) && n.length) : [];
    return r.length === 0 ? true : r.some((n) => n.every((a) => ol(a, u)));
  }
  function Ta(e, u, t) {
    let r = Array.isArray(e?.rules) ? e.rules : [];
    if (r.length === 0)
      return null;
    let n = Ur(t), a = r.filter((o) => o && o.enabled !== false && o.stage === u).slice().sort((o, s) => (Number(s.priority) || 0) - (Number(o.priority) || 0));
    for (let o of a)
      if (sl(o, n))
        return t.debug.ruleSource || (t.debug.ruleSource = {}), t.debug.ruleIds || (t.debug.ruleIds = {}), t.debug.ruleSource[u] = "site", t.debug.ruleIds[u] = o.id, t.debug.ruleId || (t.debug.ruleId = o.id), o;
    return null;
  }
  var ul;
  var vt = R(() => {
    U();
    re();
    Ct();
    ul = Object.freeze({ US: "NA", CA: "NA", MX: "NA", BR: "SA", AR: "SA", CL: "SA", CO: "SA", PE: "SA", GB: "EU", DE: "EU", FR: "EU", NL: "EU", ES: "EU", IT: "EU", RU: "EU", CN: "AS", JP: "AS", KR: "AS", IN: "AS", SG: "AS", HK: "AS", TW: "AS", TH: "AS", AU: "OC", NZ: "OC", ZA: "AF", EG: "AF", NG: "AF", KE: "AF" });
  });
  function Ia(e) {
    typeof e == "string" && e && (Oa = e);
  }
  function ll(e, u) {
    if (!u || !La.test(u))
      return "";
    for (let o of qr)
      if (u.startsWith(o)) {
        let s = u.slice(o.length);
        return !s || s.length > il ? "" : cl(e, o, s);
      }
    switch (u) {
      case "product_name":
        return Oa;
      case "request_id":
        return pl(e);
      case "edge_country":
        return _a(e, "country") || Sa(e, "country");
      case "edge_colo":
        return _a(e, "colo");
      case "remote_addr":
        return Sa(e, "remote_addr");
      default:
        break;
    }
    let r = { client_ip: "clientIp", client_country: "clientCountry", client_continent: "clientContinent", client_asn: "clientAsn", client_device: "clientDevice", user_agent: "userAgent", referer: "referer" }[u] || u, a = dl(e)[r];
    return a == null ? "" : String(a);
  }
  function cl(e, u, t) {
    let r = e?.request?.headers;
    if (u === "http_") {
      if (!r)
        return "";
      let n = t.replace(/_/g, "-");
      return r.get(n) || "";
    }
    if (u === "cookie_") {
      let n = r && r.get("cookie") || "";
      if (!n)
        return "";
      for (let a of n.split(";")) {
        let o = a.indexOf("=");
        if (!(o < 0) && a.slice(0, o).trim() === t)
          return fl(a.slice(o + 1).trim());
      }
      return "";
    }
    if (u === "query_") {
      let n = e?.url;
      if (!n)
        return "";
      let a = n.searchParams ? n.searchParams.get(t) : "";
      return a == null ? "" : String(a);
    }
    return "";
  }
  function dl(e) {
    if (e && e.__matchSubject)
      return e.__matchSubject;
    let u = Ur(e);
    return e && (e.__matchSubject = u), u;
  }
  function Sa(e, u) {
    let t = e?.request?.headers;
    if (u === "country")
      return t && t.get("cf-ipcountry") || "";
    if (u === "remote_addr") {
      if (t) {
        let r = lu(t);
        if (r)
          return r;
      }
      return e?.remoteAddr || "";
    }
    return "";
  }
  function _a(e, u) {
    let t = e?.request?.headers;
    if (!t)
      return "";
    if (u === "country")
      return t.get("cf-country") || t.get("eo-country") || t.get("x-esi-country") || "";
    if (u === "colo") {
      let r = t.get("cf-ray");
      if (r)
        return r.split(" ")[0] || "";
    }
    return "";
  }
  function pl(e) {
    let u = e?.request?.headers, t = u && (u.get("cf-request-id") || u.get("x-request-id"));
    if (t)
      return t;
    if (e && e.__requestId)
      return e.__requestId;
    let r = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    return e && (e.__requestId = r), r;
  }
  function fl(e) {
    try {
      return decodeURIComponent(e);
    } catch {
      return e;
    }
  }
  function ye(e, u, t) {
    if (typeof e != "string" || e.indexOf("${") === -1)
      return e;
    let r = t && t.label || "var", n = t && t.maxLen ? t.maxLen : 0, a = e.replace(zr, (o, s) => {
      if (!La.test(s))
        return "";
      let i = ll(u, s);
      return i === "" && !Ra.includes(s) && !qr.some((l) => s.startsWith(l)) && u && u.debug && Array.isArray(u.debug.notes) && u.debug.notes.push(`unknown-var:${s}`), i;
    });
    return n && a.length > n ? a.slice(0, n) : a;
  }
  function Fl(e) {
    let u = /* @__PURE__ */ new Set();
    if (typeof e != "string" || e.indexOf("${") === -1)
      return u;
    let t;
    for (zr.lastIndex = 0; (t = zr.exec(e)) !== null; )
      u.add(t[1]);
    return u;
  }
  function Ru(e) {
    let u = Fl(e), t = [];
    for (let r of u)
      Ra.includes(r) || qr.some((n) => r.startsWith(n) && r.length > n.length) || t.push(r);
    return { ok: t.length === 0, unknown: t };
  }
  function Lu(e) {
    return typeof e == "string" && e.indexOf("${") !== -1;
  }
  function Ha(e, u) {
    return typeof e != "string" || e.indexOf("__") === -1 ? e : e.replace(gl, (t, r) => hl(u, r));
  }
  function hl(e, u) {
    let t = e && e.__globalStages, r = t && t.cache, n = e && e.effCacheTtl;
    switch (u) {
      case "edge_ttl":
        return n && n.edgeTtl ? String(n.edgeTtl) : r && r.edgeTtl != null ? String(r.edgeTtl) : "";
      case "browser_ttl":
        return n && n.browserTtl ? String(n.browserTtl) : r && r.browserTtl != null ? String(r.browserTtl) : "";
      case "swr":
        return n && n.staleWhileRevalidate ? String(n.staleWhileRevalidate) : r && r.staleWhileRevalidate != null ? String(r.staleWhileRevalidate) : "";
      case "status_ttl": {
        let a = n && n.statusTtl != null ? n.statusTtl : r && r.statusTtl != null ? r.statusTtl : null;
        return a == null ? "" : typeof a == "object" ? JSON.stringify(a) : String(a);
      }
      case "cache":
        return e && e.debug && e.debug.cache != null ? String(e.debug.cache) : "";
      case "site_id":
        return e && e.debug && e.debug.siteId != null ? String(e.debug.siteId) : "";
      case "rule_id":
        return e && e.debug && e.debug.ruleId != null ? String(e.debug.ruleId) : "";
      case "origin_id":
        return e && e.debug && e.debug.originId != null ? String(e.debug.originId) : "";
      case "retry_count":
        return e && e.debug && e.debug.retries != null ? String(e.debug.retries) : "";
      case "edge_time": {
        let a = e && e.startTime;
        return a != null ? `${Date.now() - a}ms` : "";
      }
      case "tried_origins":
        return e && e.debug && Array.isArray(e.debug.tried) ? e.debug.tried.join(",") : "";
      case "cnb_token": {
        let a = e && e.origin && e.origin.id;
        return e && e.__siteSecrets && a != null && e.__siteSecrets[a] != null ? String(e.__siteSecrets[a]) : "";
      }
      case "github_token": {
        let a = e && e.origin && e.origin.id;
        return e && e.__siteSecrets && a != null && e.__siteSecrets[a] != null ? String(e.__siteSecrets[a]) : "";
      }
      case "cf_cdn_cache_control":
        return e && e.caps && e.caps.platform === "cf" ? "public, max-age=__edge_ttl__, s-maxage=__edge_ttl__, stale-while-revalidate=__swr__" : "";
      default:
        return "";
    }
  }
  var Ra;
  var qr;
  var La;
  var zr;
  var il;
  var Oa;
  var gl;
  var cu = R(() => {
    vt();
    Ct();
    Ra = Object.freeze(["host", "client_ip", "client_country", "client_continent", "client_asn", "client_device", "method", "scheme", "protocol", "uri", "path", "query", "filename", "extension", "directory", "user_agent", "referer", "origin", "origin_addr", "edge_country", "edge_colo", "request_id", "product_name", "remote_addr"]), qr = Object.freeze(["http_", "cookie_", "query_"]), La = /^[a-z0-9_]+$/, zr = /\$\{([a-z0-9_]+)\}/g, il = 256, Oa = "EdgeGateway";
    gl = /__([a-z0-9_]+)__/g;
  });
  function Na(e) {
    let u = Number(e);
    return Number.isFinite(u) && u >= 400 && u < 600;
  }
  var F;
  var Ce;
  var jr;
  var Z0;
  var me;
  var X = R(() => {
    F = Object.freeze({ UNAUTHORIZED: "UNAUTHORIZED", FORBIDDEN: "FORBIDDEN", NOT_FOUND: "NOT_FOUND", BAD_REQUEST: "BAD_REQUEST", CONFLICT: "CONFLICT", RATE_LIMITED: "RATE_LIMITED", INTERNAL: "INTERNAL", STORAGE_UNAVAILABLE: "STORAGE_UNAVAILABLE" }), Ce = "4xx5xx";
    jr = /^!?(?:[1-5]\d{2}|[1-5]xx|[1-5]\dx)$/i, Z0 = Object.freeze(/* @__PURE__ */ new Set(["7z", "avi", "avif", "apk", "bin", "bmp", "bz2", "class", "css", "csv", "doc", "docx", "dmg", "ejs", "eot", "eps", "exe", "flac", "gif", "gz", "ico", "iso", "jar", "jpg", "jpeg", "js", "json", "m3u8", "mid", "midi", "mkv", "mp3", "mp4", "ogg", "otf", "pdf", "pict", "pls", "png", "ppt", "pptx", "ps", "rar", "svg", "svgz", "swf", "tar", "tif", "tiff", "ts", "ttf", "txt", "webm", "webp", "woff", "woff2", "xls", "xlsx", "xml", "zip", "zst"])), me = "1.0.0";
  });
  function Y(e) {
    if (Array.isArray(e))
      return e.map(Y);
    if (e && typeof e == "object") {
      let u = {};
      for (let t of Object.keys(e))
        u[t] = Y(e[t]);
      return u;
    }
    return e;
  }
  function k(e) {
    return Y(e);
  }
  var Bt = R(() => {
  });
  function Hu() {
    return Y(Iu);
  }
  var Gr;
  var du;
  var Ou;
  var Iu;
  var pu;
  var Nu = R(() => {
    X();
    Bt();
    Gr = "EdgeGateway", du = Object.freeze({ mode: "inherit", custom: "" }), Ou = Object.freeze({ mode: "origin", custom: "" }), Iu = Object.freeze({ adminPath: "__panel", adminDomain: "", passwordHash: "", passwordSalt: "", tokenTtl: 7200, statsEnabled: false, statsDriver: "d1", configCacheTtl: 60, globalRateLimit: 0, disguise: Object.freeze({ mode: "static", target: "", status: 502 }), version: me }), pu = Iu.disguise;
  });
  function Be() {
    return Y(w);
  }
  var $u;
  var le;
  var ve;
  var Ke;
  var Kr;
  var ml;
  var Wr;
  var Vr;
  var Pr;
  var fu;
  var Fu;
  var ce;
  var $a;
  var w;
  var Mu = R(() => {
    Bt();
    Nu();
    $u = Object.freeze({ ignoreCase: true, includeScheme: false, headers: Object.freeze([]), cookies: Object.freeze([]) }), le = Object.freeze({ enabled: false, mode: "ttl", edgeTtl: 0, staleWhileRevalidate: 0, browserTtl: 0, ignoreQuery: false, queryWhitelist: Object.freeze([]), key: $u, statusTtl: Object.freeze({ "4xx": 0, "5xx": 0, "52x": 0 }), preRefresh: false, preRefreshPercent: 80, offlineCache: false }), ve = Object.freeze({ set: Object.freeze({}), strip: Object.freeze([]) }), Ke = Object.freeze({ type: "none", value: "", regexFrom: "", regexTo: "" }), Kr = Object.freeze({ conditions: Object.freeze([]) }), ml = Object.freeze({ target: "path", op: "prefix", values: Object.freeze([]), key: "", ignoreCase: true }), Wr = Object.freeze(["host", "path", "fullUrl", "query", "extension", "filename", "directory", "method", "header", "cookie", "clientIp", "clientCountry", "userAgent", "referer", "origin"]), Vr = Object.freeze(["equal", "notEqual", "contain", "notContain", "prefix", "notPrefix", "suffix", "notSuffix", "regex", "notRegex", "exists", "notExists"]), Pr = Object.freeze(["header", "cookie", "query"]), fu = Object.freeze({ enabled: false, status: 302, target: "", keepQuery: true }), Fu = Object.freeze({ enabled: false, status: 200, contentType: "text/html; charset=utf-8", body: "" }), ce = Object.freeze({ enabled: true, name: "X-EdgeGateway-Client-IP" }), $a = Object.freeze({ forceHttps: false, forceHttpsStatus: 301, directResponse: Y(Fu) }), w = Object.freeze({ rewrite: Y(Ke), redirect: Y(fu), terminate: Y($a), reqHeaders: Object.freeze({ set: Object.freeze({ "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8", "Accept-Encoding": "gzip, deflate, br" }), forwardWhitelist: Object.freeze(["range", "if-range", "if-none-match", "if-modified-since", "accept", "accept-encoding", "accept-language", "content-type", "content-length"]), strip: Object.freeze([Object.freeze({ type: "prefix", value: "cf-" }), Object.freeze({ type: "prefix", value: "x-forwarded-" }), Object.freeze({ type: "prefix", value: "x-real-ip" }), Object.freeze({ type: "exact", value: "forwarded" }), Object.freeze({ type: "exact", value: "true-client-ip" })]) }), origin: Object.freeze({ hostHeader: Y(du), clientIpHeader: Y(ce), followRedirect: true, originTimeoutMs: 0 }), security: Object.freeze({ refererMode: "off", refererList: Object.freeze([]), allowEmptyReferer: true, uaBlacklist: Object.freeze([]), ipBlacklist: Object.freeze([]), ipWhitelist: Object.freeze([]), botManagement: Object.freeze({ enabled: false, mode: "blacklist", list: Object.freeze([]) }), rateLimitRpm: 600, rlTtlSec: 120, remoteSyncIntervalMs: 3e4, memMaxEntries: 5e3 }), error: Object.freeze({ blockBody: "Forbidden", blockCacheControl: "no-store", disguiseServer: "cloudflare", messages: Object.freeze({ internal: "Internal Server Error", noOrigin: "No Origin", configError: "Config Error" }), messageMap: Object.freeze({ "Internal Server Error": "internal", "No Origin": "noOrigin", "Config Error": "configError" }) }), match: Object.freeze({}), cache: Object.freeze({ enabled: false, mode: "ttl", edgeTtl: 86400, staleWhileRevalidate: 3600, browserTtl: 3600, ignoreQuery: true, queryWhitelist: Object.freeze([]), key: Y($u), statusTtl: Object.freeze({ "4xx": 0, "5xx": 0, "52x": 0 }), preRefresh: true, preRefreshPercent: 80, offlineCache: true, disguise: Object.freeze({ cdnMaxAge: 86400, isolateTtlMs: 6e5 }) }), fixContentType: Object.freeze({ enabled: true }), respHeaders: Object.freeze({ set: Object.freeze({ server: "${product_name}", via: "1.1 ${product_name}", "X-Cache": "__cache__", "X-Origin-Id": "__origin_id__", "X-Rule-Id": "__rule_id__", "X-Retry-Count": "__retry_count__", "X-Edge-Time": "__edge_time__", "X-Tried-Origins": "__tried_origins__", "Cache-Control": "public, max-age=__browser_ttl__, s-maxage=__edge_ttl__, stale-while-revalidate=__swr__, immutable", "CDN-Cache-Control": "public, max-age=__edge_ttl__, s-maxage=__edge_ttl__, stale-while-revalidate=__swr__", "Cloudflare-CDN-Cache-Control": "__cf_cdn_cache_control__" }), strip: Object.freeze([Object.freeze({ type: "exact", value: "cross-origin-resource-policy" }), Object.freeze({ type: "exact", value: "cross-origin-embedder-policy" }), Object.freeze({ type: "exact", value: "content-security-policy" }), Object.freeze({ type: "exact", value: "content-security-policy-report-only" }), Object.freeze({ type: "exact", value: "x-frame-options" }), Object.freeze({ type: "exact", value: "set-cookie" }), Object.freeze({ type: "exact", value: "pragma" }), Object.freeze({ type: "prefix", value: "no-store" }), Object.freeze({ type: "exact", value: "private" }), Object.freeze({ type: "exact", value: "expires" }), Object.freeze({ type: "exact", value: "x-content-type-options" }), Object.freeze({ type: "exact", value: "access-control-allow-origin" }), Object.freeze({ type: "exact", value: "opc-request-id" }), Object.freeze({ type: "exact", value: "x-amz-request-id" }), Object.freeze({ type: "exact", value: "x-amz-id-2" }), Object.freeze({ type: "exact", value: "x-amz-version-id" }), Object.freeze({ type: "exact", value: "x-amz-server-side-encryption" }), Object.freeze({ type: "exact", value: "x-api-id" }), Object.freeze({ type: "exact", value: "x-request-id" }), Object.freeze({ type: "exact", value: "x-cache-hits" }), Object.freeze({ type: "exact", value: "x-served-by" }), Object.freeze({ type: "exact", value: "x-timer" }), Object.freeze({ type: "exact", value: "source-age" }), Object.freeze({ type: "exact", value: "content-md5" }), Object.freeze({ type: "prefix", value: "x-fastly-" })]) }) });
  });
  var Uu;
  var Pu;
  var wt;
  var Xr;
  var de;
  var El;
  var kt;
  var Yr;
  var bl;
  var xl;
  var Ma;
  var Al;
  var Ua = R(() => {
    Bt();
    Nu();
    Mu();
    Uu = Object.freeze({ enabled: false, rpm: 600 }), Pu = Object.freeze({ enabled: false, mode: "blacklist", list: Object.freeze([]) }), wt = Object.freeze({ refererMode: "off", refererList: Object.freeze([]), allowEmptyReferer: true, uaBlacklist: Object.freeze([]), ipBlacklist: Object.freeze([]), ipWhitelist: Object.freeze([]), rateLimit: Uu, botManagement: Pu }), Xr = Object.freeze({ host: "", enabled: true, poolId: "", defaultHostHeader: Ou, rules: Object.freeze([]), security: wt, ipv6Support: false, cacheGen: 0, updatedAt: 0 }), de = Object.freeze({ id: "", enabled: true, order: 0, weight: 1, name: "", engine: "fetch", scheme: "https", addr: "", port: 443, pathPrefix: "", extraHeaders: Object.freeze({}), hostHeader: du, sni: null, rewrite: Ke, reqHeaders: ve, respHeaders: ve, cache: le, followRedirect: false, originTimeoutMs: 0, clientIpHeader: ce, r2Binding: "", r2KeyPrefix: "", r2KeyMode: "none", r2KeyPrefixRule: "", r2KeyRegexTo: "", r2ContentType: "application/octet-stream" }), El = Object.freeze(["fetch", "socket", "r2", "cnb", "github"]), kt = Object.freeze({ id: "", name: "", kind: "single", strategy: "chain", origins: Object.freeze([]), failover: null, createdBy: "", updatedAt: 0 }), Yr = Object.freeze(["single", "pool"]), bl = Object.freeze({ hosts: Object.freeze([]), wildcards: Object.freeze([]) }), xl = Object.freeze({ ids: Object.freeze([]) }), Ma = Object.freeze({ poolId: "", rewrite: Ke, cache: le, reqHeaders: ve, respHeaders: ve, hostHeader: du, redirect: fu, directResponse: Fu, clientIpHeader: ce, forceHttps: false, followRedirect: false, originTimeoutMs: 0, engine: "", scheme: "", port: 0 }), Al = Object.freeze({ id: "", priority: 0, enabled: true, match: Kr, action: Ma });
  });
  var re = R(() => {
    cu();
    Nu();
    Nu();
    Mu();
    Ua();
    Ia(Gr);
  });
  function zu(e) {
    return e ? Tt[e] ? e : Pa[e] ? Pa[e] : null : null;
  }
  var We;
  var Pa;
  var Tt;
  var qu;
  var ju = R(() => {
    We = ["rewrite", "redirect", "terminate", "reqHeaders", "origin", "cache", "respHeaders"], Pa = { "\u2464": "rewrite", "\u2465": "redirect", "\u2466": "terminate", "\u2467": "reqHeaders", "\u2468": "origin", "\u246A": "cache", "\u246F": "respHeaders" };
    Tt = { rewrite: { title: "URL \u91CD\u5199", en: "rewrite", owner: "\u8DEF\u7531\u89C4\u5219\u62BD\u5C49 \xB7 URL \u91CD\u5199", icon: "\u2702\uFE0F", order: 1, allowedOps: ["rewrite"], hideTargetPool: true }, redirect: { title: "\u91CD\u5B9A\u5411\u89C4\u5219", en: "redirect", owner: "\u8DEF\u7531\u89C4\u5219\u62BD\u5C49 \xB7 \u91CD\u5B9A\u5411", icon: "\u21AA\uFE0F", order: 2, allowedOps: ["redirect"], hideTargetPool: true }, terminate: { title: "\u5F3A\u5236 HTTPS / \u76F4\u63A5\u54CD\u5E94\uFF08\u7EC8\u6B62\u578B\uFF09", en: "terminate", owner: "\u8DEF\u7531\u89C4\u5219\u62BD\u5C49 \xB7 \u5F3A\u5236HTTPS / \u76F4\u63A5\u54CD\u5E94", icon: "\u{1F512}", order: 3, allowedOps: ["forceHttps", "directResponse"], hideTargetPool: true }, reqHeaders: { title: "\u4FEE\u6539\u8BF7\u6C42\u5934", en: "reqHeaders", owner: "\u8DEF\u7531\u89C4\u5219\u62BD\u5C49 \xB7 \u4FEE\u6539\u8BF7\u6C42\u5934", icon: "\u{1F4E4}", order: 4, allowedOps: ["reqHeaders"], hideTargetPool: true }, origin: { title: "Origin Rules\uFF08\u56DE\u6E90\u89C4\u5219\uFF09", en: "origin", owner: "\u8DEF\u7531\u89C4\u5219\u62BD\u5C49 \xB7 Origin Rules", icon: "\u{1F500}", order: 5, allowedOps: ["hostHeader", "originConn", "targetPool", "clientIp", "followRedirect", "originTimeout"], hideTargetPool: false }, cache: { title: "Cache Rules\uFF08\u7F13\u5B58\u89C4\u5219\uFF09", en: "cache", owner: "\u8DEF\u7531\u89C4\u5219\u62BD\u5C49 \xB7 Cache Rules\uFF08\u7F13\u5B58\u7B56\u7565\uFF09", icon: "\u{1F4E5}", order: 6, allowedOps: ["cache"], hideTargetPool: true }, respHeaders: { title: "\u6539\u5199\u54CD\u5E94\u5934 / Response Cache Rule", en: "respHeaders", owner: "\u8DEF\u7531\u89C4\u5219\u62BD\u5C49 \xB7 \u6539\u5199\u54CD\u5E94\u5934 / Response Cache Rule", icon: "\u{1F4DD}", order: 7, allowedOps: ["respHeaders"], hideTargetPool: true } }, qu = ["match", "security", "error"];
  });
  function St(e, u) {
    let t = Dl[e];
    return t ? u ? t.private : t.public : "";
  }
  var Dl;
  var Jr = R(() => {
    Dl = { cnb: { public: "cnb.cool", private: "api.cnb.cool" }, github: { public: "raw.githubusercontent.com", private: "raw.githubusercontent.com" } };
  });
  function Zr(e) {
    let u = Tt[e] && Tt[e].allowedOps || [], t = /* @__PURE__ */ new Set();
    for (let r of u) {
      let n = ja[r];
      Array.isArray(n) ? n.forEach((a) => t.add(a)) : n && t.add(n);
    }
    return t;
  }
  function Cl(e, u, t) {
    let r = zu(t) || "cache", n = Zr(r), a = {};
    for (let [o, s] of Object.entries(u))
      yl.has(o) && !n.has(o) || (a[o] = s);
    return a;
  }
  function Ga() {
    return { errors: [] };
  }
  function b(e, u = "", t = B.STR_MAX) {
    if (typeof e != "string")
      return u;
    let r = e.trim();
    return r.length > t ? r.slice(0, t) : r;
  }
  function T(e, u = false) {
    return typeof e == "boolean" ? e : u;
  }
  function C(e, u, t, r) {
    let n = typeof e == "number" ? e : parseInt(e, 10);
    return Number.isFinite(n) ? Math.min(r, Math.max(t, Math.floor(n))) : u;
  }
  function Ee(e, u = B.LIST_MAX, t = B.STR_MAX) {
    if (!Array.isArray(e))
      return [];
    let r = [], n = /* @__PURE__ */ new Set();
    for (let a of e) {
      if (r.length >= u)
        break;
      let o = b(a, "", t);
      !o || n.has(o) || (n.add(o), r.push(o));
    }
    return r;
  }
  function M(e, u, t) {
    return u.includes(e) ? e : t;
  }
  function vl() {
    let e = Date.now().toString(36), u = "";
    try {
      let t = new Uint8Array(6), r = globalThis && globalThis.crypto || za;
      (r && typeof r.getRandomValues == "function" ? r : za).getRandomValues(t), u = Array.from(t).map((n) => n.toString(36)).join("");
    } catch {
      u = Math.random().toString(36).slice(2, 10);
    }
    return `pl_${e}_${u}`;
  }
  function Bl(e) {
    let u = b(e, "", B.HOST_MAX).toLowerCase();
    if (!u)
      return { ok: false, error: "host \u4E0D\u80FD\u4E3A\u7A7A" };
    if (u.length > B.HOST_MAX)
      return { ok: false, error: "host \u8FC7\u957F" };
    if (/[\s]/.test(u))
      return { ok: false, error: "host \u4E0D\u80FD\u5305\u542B\u7A7A\u683C" };
    if (u.includes("://"))
      return { ok: false, error: "host \u4E0D\u5E94\u5305\u542B\u534F\u8BAE\u524D\u7F00" };
    if (u.includes("/"))
      return { ok: false, error: "host \u4E0D\u5E94\u5305\u542B\u8DEF\u5F84" };
    if (u.includes(":"))
      return { ok: false, error: "host \u4E0D\u5E94\u5305\u542B\u7AEF\u53E3" };
    if (u === "*" || u === "*.")
      return { ok: false, error: "\u4E0D\u5141\u8BB8\u5339\u914D\u5168\u90E8\u57DF\u540D\u7684\u901A\u914D\u7B26" };
    if (u.startsWith("*.")) {
      let t = u.slice(2);
      return !t || !Qr(t) ? { ok: false, error: `\u6CDB\u57DF\u540D\u683C\u5F0F\u4E0D\u6B63\u786E: ${e}` } : t.includes(".") ? { ok: true, value: u } : { ok: false, error: "\u6CDB\u57DF\u540D\u81F3\u5C11\u9700\u8981\u4E8C\u7EA7\u57DF\u540D\uFF0C\u5982 *.example.com" };
    }
    return Qr(u) ? { ok: true, value: u } : { ok: false, error: `host \u683C\u5F0F\u4E0D\u6B63\u786E: ${e}` };
  }
  function Qr(e) {
    return e.length > B.HOST_MAX ? false : /^\d{1,3}(\.\d{1,3}){3}$/.test(e) ? e.split(".").every((u) => Number(u) <= 255) : /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/.test(e);
  }
  function wl(e) {
    let u = b(e, "", B.HOST_MAX).toLowerCase();
    if (!u)
      return { ok: false, error: "\u6E90\u7AD9\u5730\u5740\u4E0D\u80FD\u4E3A\u7A7A" };
    if (u.includes("://"))
      return { ok: false, error: "\u6E90\u7AD9\u5730\u5740\u4E0D\u5E94\u5305\u542B\u534F\u8BAE\uFF0C\u8BF7\u7528 scheme \u5B57\u6BB5" };
    if (u.includes("/"))
      return { ok: false, error: "\u6E90\u7AD9\u5730\u5740\u4E0D\u5E94\u5305\u542B\u8DEF\u5F84\uFF0C\u8BF7\u7528 pathPrefix \u5B57\u6BB5" };
    if (u.includes(":")) {
      let t = u.startsWith("[") && u.endsWith("]") ? u.slice(1, -1) : u;
      return /^[0-9a-f:]+$/.test(t) ? { ok: true, value: `[${t}]` } : { ok: false, error: "\u6E90\u7AD9\u5730\u5740\u4E0D\u5E94\u5305\u542B\u7AEF\u53E3\uFF0C\u8BF7\u7528 port \u5B57\u6BB5" };
    }
    return Qr(u) ? { ok: true, value: u } : { ok: false, error: `\u6E90\u7AD9\u5730\u5740\u683C\u5F0F\u4E0D\u6B63\u786E: ${e}` };
  }
  function kl(e, u) {
    if (!e.includes("*"))
      return { value: e, glob: false };
    if (e.includes("("))
      return { value: e, glob: false };
    let t = u === "path" ? "([^/]*)" : "(.*)", r = e.replace(/\\/g, "\\\\");
    r = r.replace(/[.+?(){}|[\]^$]/g, "\\$&");
    let n = r.split("*").join(t);
    try {
      return new RegExp(n), { value: n, glob: true };
    } catch {
      return { value: e, glob: false };
    }
  }
  function _t(e, u = "raw") {
    let t = b(e, "", B.REGEX_MAX);
    if (!t)
      return { ok: true, value: "" };
    if (t.length > B.REGEX_MAX)
      return { ok: false, error: `\u6B63\u5219\u8FC7\u957F\uFF08\u4E0A\u9650 ${B.REGEX_MAX} \u5B57\u7B26\uFF09` };
    let r = t.includes("*") ? kl(t, u) : { value: t, glob: false };
    if (/\([^)]*[+*}]\)\s*[+*]|\([^)]*[+*]\s*\)\s*\{/.test(r.value))
      return { ok: false, error: "\u6B63\u5219\u5305\u542B\u5D4C\u5957\u91CF\u8BCD\uFF0C\u5B58\u5728\u707E\u96BE\u6027\u56DE\u6EAF\u98CE\u9669\uFF0C\u8BF7\u7B80\u5316" };
    try {
      new RegExp(r.value);
    } catch (n) {
      return { ok: false, error: `\u6B63\u5219\u8BED\u6CD5\u9519\u8BEF: ${n.message}` };
    }
    return { ok: true, value: r.value, glob: r.glob };
  }
  function gu(e) {
    return typeof e == "string" && /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/.test(e);
  }
  function Tl(e) {
    return typeof e == "string" && !/[\r\n\0]/.test(e);
  }
  function Ka(e, u) {
    let t = {}, r = [];
    if (!E(e))
      return { value: t, errors: r };
    let n = 0;
    for (let [a, o] of Object.entries(e)) {
      if (n >= B.HEADERS_MAX) {
        r.push(`${u} \u6570\u91CF\u8D85\u8FC7\u4E0A\u9650 ${B.HEADERS_MAX}\uFF0C\u591A\u4F59\u9879\u5DF2\u5FFD\u7565`);
        break;
      }
      if (!gu(a)) {
        r.push(`${u} \u4E2D\u5B58\u5728\u975E\u6CD5\u5934\u540D: ${a}`);
        continue;
      }
      let s = String(o ?? "");
      if (!Tl(s)) {
        r.push(`${u} \u4E2D\u5934 ${a} \u7684\u503C\u5305\u542B\u975E\u6CD5\u5B57\u7B26\uFF08\u6362\u884C\u7B26\uFF09`);
        continue;
      }
      if (Lu(s)) {
        let i = Ru(s);
        if (!i.ok) {
          r.push(`${u} \u4E2D\u5934 ${a} \u7684\u503C\u542B\u672A\u77E5\u53D8\u91CF: ${i.unknown.join(", ")}`);
          continue;
        }
      }
      if (s.length > B.STR_MAX) {
        r.push(`${u} \u4E2D\u5934 ${a} \u7684\u503C\u8FC7\u957F`);
        continue;
      }
      t[a] = s, n++;
    }
    return { value: t, errors: r };
  }
  function qa(e, u) {
    let t = [];
    if (!E(e))
      return { value: k(ve), errors: t };
    let r = Ka(e.set, `${u}.set`);
    t.push(...r.errors);
    let n = Wa(e.strip, `${u}.strip`, t);
    return { value: { set: r.value, strip: n }, errors: t };
  }
  function Wa(e, u, t, r) {
    let n = Array.isArray(r) ? r : ve.strip || [], a = Array.isArray(e) ? e : e === void 0 ? n : [], o = [];
    for (let s of a) {
      if (o.length >= B.HEADERS_MAX)
        break;
      let i = E(s) ? s : { type: "exact", value: s }, l = M(i.type, ["prefix", "exact", "regex"], "exact"), c = b(i.value, "", 256).toLowerCase();
      if (c) {
        if (l === "regex") {
          let d = _t(c, "header");
          if (!d.ok) {
            t.push(`${u} \u4E2D\u5B58\u5728\u975E\u6CD5\u6B63\u5219: ${c}`);
            continue;
          }
          c = d.value;
        } else if (l === "exact" && !gu(c)) {
          t.push(`${u}(exact) \u4E2D\u5B58\u5728\u975E\u6CD5\u5934\u540D: ${c}`);
          continue;
        }
        o.push({ type: l, value: c });
      }
    }
    return o;
  }
  function Sl(e) {
    let u = $u;
    return E(e) ? { ignoreCase: T(e.ignoreCase, u.ignoreCase), includeScheme: T(e.includeScheme, u.includeScheme), headers: Ee(e.headers, 10, 128).map((t) => t.toLowerCase()).filter(gu), cookies: Ee(e.cookies, 10, 128) } : k(u);
  }
  function Va(e) {
    let u = {};
    if (!E(e))
      return u;
    let t = 0;
    for (let [r, n] of Object.entries(e)) {
      if (t >= 20)
        break;
      let a = String(r).toLowerCase();
      a && jr.test(a) && (u[a] = C(n, 0, 0, B.TTL_MAX), t++);
    }
    return u;
  }
  function _l(e) {
    let u = le;
    if (!E(e))
      return k(u);
    let t = M(e.mode, ["ttl", "origin", "noCache"], u.mode);
    return { enabled: T(e.enabled, u.enabled) && t !== "noCache", mode: t, edgeTtl: C(e.edgeTtl, u.edgeTtl, 0, B.TTL_MAX), staleWhileRevalidate: C(e.staleWhileRevalidate, u.staleWhileRevalidate, 0, B.TTL_MAX), browserTtl: C(e.browserTtl, u.browserTtl, -1, B.TTL_MAX), ignoreQuery: T(e.ignoreQuery, u.ignoreQuery), queryWhitelist: Ee(e.queryWhitelist, 50, 128), key: Sl(e.key), statusTtl: Va(e.statusTtl), preRefresh: T(e.preRefresh, u.preRefresh), preRefreshPercent: C(e.preRefreshPercent, u.preRefreshPercent, 1, 99), offlineCache: T(e.offlineCache, u.offlineCache) };
  }
  function Rl(e, u) {
    let t = [], r = [];
    if (!Array.isArray(e))
      return { value: r, errors: t };
    for (let n = 0; n < Math.min(e.length, 10); n++) {
      let a = e[n];
      if (!Array.isArray(a))
        continue;
      let o = [];
      for (let s = 0; s < Math.min(a.length, 10); s++) {
        let i = a[s];
        if (!E(i))
          continue;
        let l = `${u} \u6761\u4EF6[${n}.${s}]`, c = M(i.target, Wr, "");
        if (!c) {
          t.push(`${l} \u4E0D\u652F\u6301\u7684\u5339\u914D\u5BF9\u8C61: ${i.target}`);
          continue;
        }
        let d = M(i.op, Vr, "");
        if (!d) {
          t.push(`${l} \u4E0D\u652F\u6301\u7684\u64CD\u4F5C\u7B26: ${i.op}`);
          continue;
        }
        let p = b(i.key, "", 128);
        if ((c === "header" || c === "cookie") && !p) {
          t.push(`${l} \u5339\u914D ${c} \u65F6\u5FC5\u987B\u586B\u5199\u952E\u540D`);
          continue;
        }
        if (c === "header" && !gu(p)) {
          t.push(`${l} \u975E\u6CD5\u5934\u540D: ${p}`);
          continue;
        }
        let f = d !== "exists" && d !== "notExists", g = Ee(i.values, 50, B.STR_MAX);
        if (f && g.length === 0) {
          t.push(`${l} \u64CD\u4F5C\u7B26 ${d} \u9700\u8981\u81F3\u5C11\u4E00\u4E2A\u5339\u914D\u503C`);
          continue;
        }
        if (d === "regex" || d === "notRegex") {
          let m = c === "path" || c === "fullUrl" || c === "directory" || c === "filename" || c === "extension" ? "path" : "header", A = false, S = [];
          for (let I of g) {
            let v = _t(I, m);
            if (!v.ok) {
              t.push(`${l} ${v.error}`), A = true;
              continue;
            }
            S.push(v.value);
          }
          if (A)
            continue;
          g = S;
        }
        o.push({ target: c, op: d, values: f ? g : [], key: p, ignoreCase: T(i.ignoreCase, true) });
      }
      o.length && r.push(o);
    }
    return { value: r, errors: t };
  }
  function Ll(e, u) {
    let t = [], r = fu;
    if (!E(e))
      return { value: k(r), errors: t };
    let n = T(e.enabled, r.enabled), a = b(e.target, "", 2048);
    if (Lu(a)) {
      let o = Ru(a);
      o.ok || t.push(`${u} \u91CD\u5B9A\u5411\u76EE\u6807\u542B\u672A\u77E5\u53D8\u91CF: ${o.unknown.join(", ")}`);
    }
    if (n) {
      if (!a)
        t.push(`${u} \u542F\u7528\u91CD\u5B9A\u5411\u65F6\u5FC5\u987B\u586B\u5199\u76EE\u6807 URL`);
      else if (!a.startsWith("/"))
        try {
          let o = new URL(a);
          o.protocol !== "http:" && o.protocol !== "https:" && t.push(`${u} \u91CD\u5B9A\u5411\u76EE\u6807\u4EC5\u652F\u6301 http/https \u6216\u4EE5 / \u5F00\u5934\u7684\u8DEF\u5F84`);
        } catch {
          t.push(`${u} \u91CD\u5B9A\u5411\u76EE\u6807\u4E0D\u662F\u5408\u6CD5 URL`);
        }
    }
    return { value: { enabled: n, status: M(C(e.status, r.status, 300, 399), [301, 302, 303, 307, 308], r.status), target: a, keepQuery: T(e.keepQuery, r.keepQuery) }, errors: t };
  }
  function Ol(e) {
    let u = [], t = Fu;
    if (!E(e))
      return { value: k(t), errors: u };
    let r = b(e.body, "", 64 * 1024);
    if (Lu(r)) {
      let n = Ru(r);
      n.ok || u.push(`\u76F4\u63A5\u54CD\u5E94\u4F53\u542B\u672A\u77E5\u53D8\u91CF: ${n.unknown.join(", ")}`);
    }
    return { value: { enabled: T(e.enabled, t.enabled), status: C(e.status, t.status, 100, 599), contentType: b(e.contentType, t.contentType, 128), body: r }, errors: u };
  }
  function Il(e, u) {
    let t = [], r = ce;
    if (!E(e))
      return { value: k(r), errors: t };
    let n = b(e.name, r.name, 128);
    return n && !gu(n) ? (t.push(`${u} \u5BA2\u6237\u7AEF IP \u5934\u540D\u975E\u6CD5: ${n}`), { value: k(r), errors: t }) : { value: { enabled: T(e.enabled, r.enabled), name: n || r.name }, errors: t };
  }
  function Hl(e) {
    let u = [], t = Ke;
    if (!E(e))
      return { value: k(t), errors: u };
    let r = M(e.type, ["none", "prefix", "strip", "regex"], "none"), n = { type: r, value: "", regexFrom: "", regexTo: "", glob: false };
    if (r === "prefix" || r === "strip") {
      let a = b(e.value, "");
      a ? (a.startsWith("/") || (a = "/" + a), a = a.replace(/\/+$/, ""), n.value = a) : u.push(`\u91CD\u5199\u6A21\u5F0F ${r} \u9700\u8981\u586B\u5199 value`);
    } else if (r === "regex") {
      let a = _t(e.regexFrom, "path");
      if (a.ok ? a.value ? (n.regexFrom = a.value, n.glob = !!a.glob) : u.push("\u91CD\u5199\u6A21\u5F0F regex \u9700\u8981\u586B\u5199 regexFrom") : u.push(`\u91CD\u5199\u6B63\u5219: ${a.error}`), n.regexTo = b(e.regexTo, ""), Lu(n.regexTo)) {
        let o = Ru(n.regexTo);
        o.ok || u.push(`\u91CD\u5199 regexTo \u542B\u672A\u77E5\u53D8\u91CF: ${o.unknown.join(", ")}`);
      }
    }
    return { value: n, errors: u };
  }
  function Nl(e) {
    let u = [], t = wt;
    if (!E(e))
      return { value: k(t), errors: u };
    let r = E(e.rateLimit) ? e.rateLimit : {}, n = E(e.botManagement) ? e.botManagement : {};
    return { value: { refererMode: M(e.refererMode, ["off", "whitelist", "blacklist"], t.refererMode), refererList: Ee(e.refererList).map((a) => a.toLowerCase()), allowEmptyReferer: T(e.allowEmptyReferer, t.allowEmptyReferer), uaBlacklist: Ee(e.uaBlacklist), ipBlacklist: Ee(e.ipBlacklist, B.LIST_MAX, 64), ipWhitelist: Ee(e.ipWhitelist, B.LIST_MAX, 64), rateLimit: { enabled: T(r.enabled, Uu.enabled), rpm: C(r.rpm, Uu.rpm, 1, 1e6) }, botManagement: { enabled: T(n.enabled, Pu.enabled), mode: M(n.mode, ["blacklist", "allowlist"], Pu.mode), list: Ee(n.list, B.LIST_MAX, 256) } }, errors: u };
  }
  function Rt(e, u) {
    let t = [], r = `\u89C4\u5219[${u}]`;
    if (!E(e))
      return { value: null, errors: [`${r} \u4E0D\u662F\u5408\u6CD5\u5BF9\u8C61`] };
    let n = b(e.id, "", 64) || `r_${u}_${Date.now().toString(36)}`, a = E(e.match) ? e.match : {}, o = E(e.action) ? e.action : {}, s = Rl(a.conditions, r);
    t.push(...s.errors);
    let i = Hl(o.rewrite);
    t.push(...i.errors.map((v) => `${r} ${v}`));
    let l = qa(o.reqHeaders, `${r} \u8BF7\u6C42\u5934`);
    t.push(...l.errors);
    let c = qa(o.respHeaders, `${r} \u54CD\u5E94\u5934`);
    t.push(...c.errors);
    let d = Ll(o.redirect, r);
    t.push(...d.errors);
    let p = Il(o.clientIpHeader, r);
    t.push(...p.errors);
    let f = E(o.hostHeader) ? o.hostHeader : {}, g = M(f.mode, ["inherit", "origin", "client", "custom"], "inherit"), m = b(f.custom, "", B.HOST_MAX).toLowerCase();
    g === "custom" && !m && t.push(`${r} \u56DE\u6E90 Host \u4E3A custom \u65F6\u5FC5\u987B\u586B\u5199 custom \u503C`);
    let A = M(o.engine, ["", "fetch", "socket", "r2"], ""), S = M(o.scheme, ["", "http", "https"], ""), I = C(o.port, 0, 0, 65535);
    return { value: { id: n, name: b(e.name, "", 128), note: b(e.note, "", 512), priority: C(e.priority, 0, -1e5, 1e5), enabled: T(e.enabled, true), stage: zu(e.stage) || "cache", match: { conditions: s.value }, action: Cl(o, { rewrite: i.value, cache: _l(o.cache), reqHeaders: l.value, respHeaders: c.value, hostHeader: { mode: g, custom: m }, redirect: d.value, directResponse: Ol(o.directResponse).value, clientIpHeader: p.value, forceHttps: T(o.forceHttps, false), forceHttpsStatus: C(o.forceHttpsStatus, 301, 301, 308), followRedirect: T(o.followRedirect, false), originTimeoutMs: C(o.originTimeoutMs, 0, 0, 12e4), engine: A, scheme: S, port: I, poolId: b(o.poolId, "", 64) }, e.stage) }, errors: t };
  }
  function $l(e, u, t) {
    let r = [], n = {}, a = E(u) ? u : {}, o = E(t) ? t : {};
    if (e === "reqHeaders")
      return n.forwardWhitelist = Array.isArray(a.forwardWhitelist) ? Ee(a.forwardWhitelist, B.HEADERS_MAX, 128).map((s) => s.toLowerCase()).filter((s) => gu(s) ? true : (r.push(`forwardWhitelist \u4E2D\u5B58\u5728\u975E\u6CD5\u5934\u540D: ${s}`), false)) : k(o.forwardWhitelist || []), n.strip = Wa(a.strip, "strip", r, o.strip), { value: n, errors: r };
    if (e === "cache") {
      let s = {}, i = Array.isArray(a.noCacheStatus) ? a.noCacheStatus : Array.isArray(o.noCacheStatus) ? o.noCacheStatus : [];
      for (let d of i) {
        let p = b(d, "", 8).toLowerCase();
        if (!p || !jr.test(p))
          continue;
        let f = p.startsWith("!") ? p : p in s ? null : p;
        f && !(f in s) && (s[f] = 0);
      }
      Object.assign(s, Va(a.statusTtl || {})), n.statusTtl = s;
      let l = E(a.disguise) ? a.disguise : {}, c = E(o.disguise) ? o.disguise : {};
      return n.disguise = { cdnMaxAge: C(l.cdnMaxAge, c.cdnMaxAge ?? 86400, 0, 31536e3), isolateTtlMs: C(l.isolateTtlMs, c.isolateTtlMs ?? 6e5, 0, 36e5) }, { value: n, errors: r };
    }
    return { value: n, errors: r };
  }
  function Xa(e) {
    let u = Zr(e);
    return u.size === 1 && u.has(e);
  }
  function Ml(e, u) {
    return E(u) ? Xa(e) ? { [e]: u } : { ...u } : {};
  }
  function Ul(e, u) {
    let t = E(u) ? u : {};
    if (Xa(e))
      return E(t[e]) ? { ...t[e] } : {};
    let r = Zr(e), n = {};
    for (let a of r)
      a in t && (n[a] = t[a]);
    return n;
  }
  function Gu(e, u) {
    let t = [];
    if (!E(e) || Array.isArray(e))
      return { ok: false, value: { stages: {} }, errors: ["\u5168\u7AD9\u89C4\u5219\u7ED3\u6784\u5E94\u4E3A\u5BF9\u8C61 { stages: { \u9636\u6BB5: \u9ED8\u8BA4\u52A8\u4F5C } }\uFF0C\u800C\u975E\u6570\u7EC4/\u5B57\u7B26\u4E32"] };
    let r = E(e.stages) ? e.stages : e, n = {};
    for (let a of We) {
      let o = r[a];
      if (o == null) {
        u && E(u[a]) && (n[a] = k(u[a]));
        continue;
      }
      if (!E(o)) {
        t.push(`\u5168\u7AD9\u89C4\u5219\u9636\u6BB5 ${a} \u5FC5\u987B\u662F\u5BF9\u8C61`), u && E(u[a]) && (n[a] = k(u[a]));
        continue;
      }
      let s = Rt({ stage: a, action: Ml(a, o) }, 0);
      if (s.errors.length && t.push(...s.errors.map((i) => `\u5168\u7AD9\u89C4\u5219[${a}] ${i}`)), s.value) {
        let i = Ul(a, s.value.action);
        Object.keys(i).length ? n[a] = i : u && E(u[a]) && (n[a] = k(u[a]));
      } else
        u && E(u[a]) && (n[a] = k(u[a]));
      if (E(n[a])) {
        let i = $l(a, o, u && u[a]);
        i.errors.length && t.push(...i.errors.map((l) => `\u5168\u7AD9\u89C4\u5219[${a}] ${l}`)), Object.assign(n[a], i.value);
      }
    }
    for (let a of qu) {
      let o = u && E(u[a]) ? u[a] : void 0, s = Pl(a, r[a], o);
      s.errors.length && t.push(...s.errors.map((i) => `\u5168\u7AD9\u89C4\u5219[${a}] ${i}`)), n[a] = s.value;
    }
    {
      let a = r && E(r.fixContentType) ? r.fixContentType : void 0, o = E(w.fixContentType) ? w.fixContentType : { enabled: true };
      n.fixContentType = { enabled: T(a && a.enabled, o.enabled !== false) };
    }
    return { ok: t.length === 0, value: { stages: n }, errors: t };
  }
  function Pl(e, u, t) {
    let r = [], n = E(t) ? t : w[e] || {}, a = E(u) ? u : {};
    switch (u != null && !E(u) && r.push("\u5FC5\u987B\u662F\u5BF9\u8C61"), e) {
      case "match":
        return { ok: r.length === 0, errors: r, value: {} };
      case "security":
        return { ok: r.length === 0, errors: r, value: { rateLimitRpm: C(a.rateLimitRpm, n.rateLimitRpm, 0, 1e6), rlTtlSec: C(a.rlTtlSec, n.rlTtlSec, 1, 86400), remoteSyncIntervalMs: C(a.remoteSyncIntervalMs, n.remoteSyncIntervalMs, 1e3, 36e5), memMaxEntries: C(a.memMaxEntries, n.memMaxEntries, 100, 1e6) } };
      case "error": {
        let o = E(a.messages) ? a.messages : {}, s = E(n.messages) ? n.messages : {};
        return { ok: r.length === 0, errors: r, value: { blockBody: b(a.blockBody, n.blockBody, 65536), blockCacheControl: b(a.blockCacheControl, n.blockCacheControl, 128), messages: { internal: b(o.internal, s.internal, 256), noOrigin: b(o.noOrigin, s.noOrigin, 256), configError: b(o.configError, s.configError, 256) } } };
      }
      default:
        return { ok: false, value: {}, errors: [`\u672A\u77E5\u7684\u5168\u7AD9\u72EC\u6709\u9636\u6BB5 ${e}`] };
    }
  }
  function Ku(e) {
    let u = Ga();
    if (!E(e))
      return { ok: false, errors: ["\u7AD9\u70B9\u914D\u7F6E\u4E0D\u662F\u5408\u6CD5\u5BF9\u8C61"] };
    let t = Bl(e.host);
    if (!t.ok)
      return { ok: false, errors: [t.error] };
    let r = b(e.poolId, "", 64), n = E(e.defaultHostHeader) ? e.defaultHostHeader : {}, a = M(n.mode, ["accel", "origin", "custom"], Ou.mode), o = b(n.custom, "", B.HOST_MAX).toLowerCase();
    a === "custom" && !o && u.errors.push("\u9ED8\u8BA4\u56DE\u6E90 Host \u4E3A custom \u65F6\u5FC5\u987B\u586B\u5199 custom \u503C");
    let s = T(e.ipv6Support, false), i = Array.isArray(e.rules) ? e.rules : [];
    i.length > B.RULES_MAX && u.errors.push(`\u89C4\u5219\u6570\u91CF\u8D85\u8FC7\u4E0A\u9650 ${B.RULES_MAX}`);
    let l = [], c = /* @__PURE__ */ new Set();
    for (let p = 0; p < Math.min(i.length, B.RULES_MAX); p++) {
      let f = Rt(i[p], p);
      if (u.errors.push(...f.errors), !!f.value) {
        if (c.has(f.value.id)) {
          u.errors.push(`\u89C4\u5219 id \u91CD\u590D: ${f.value.id}`);
          continue;
        }
        c.add(f.value.id), l.push(f.value);
      }
    }
    l.sort((p, f) => f.priority - p.priority);
    let d = Nl(e.security);
    return u.errors.push(...d.errors), u.errors.length ? { ok: false, errors: u.errors } : { ok: true, value: { host: t.value, enabled: T(e.enabled, Xr.enabled), ipv6Support: s, poolId: r, defaultHostHeader: { mode: a, custom: o }, rules: l, security: d.value, cacheGen: C(e.cacheGen, 0, 0, Number.MAX_SAFE_INTEGER), updatedAt: C(e.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER) } };
  }
  function zl(e, u, t, r) {
    let n = b(e.r2Binding, "", 64);
    n ? /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) || r.push(`${t} r2Binding \u5FC5\u987B\u662F\u5408\u6CD5\u6807\u8BC6\u7B26\uFF08\u5B57\u6BCD/\u6570\u5B57/\u4E0B\u5212\u7EBF\uFF0C\u4E14\u4EE5\u5B57\u6BCD\u6216\u4E0B\u5212\u7EBF\u5F00\u5934\uFF09`) : r.push(`${t} engine='r2' \u65F6\u5FC5\u987B\u586B\u5199 r2Binding\uFF08R2 \u7ED1\u5B9A\u540D\uFF0C\u5982 CDN_R2\uFF09`);
    let a = M(e.r2KeyMode, ["none", "prefix", "strip", "regex"], "none"), o = b(e.r2KeyPrefix, ""), s = b(e.r2KeyPrefixRule, ""), i = b(e.r2KeyRegexTo, ""), l = b(e.r2ContentType, de.r2ContentType, 128) || de.r2ContentType;
    if (a === "prefix" || a === "strip")
      s || r.push(`${t} r2KeyMode='${a}' \u65F6\u5FC5\u987B\u586B\u5199 r2KeyPrefixRule`);
    else if (a === "regex") {
      let c = _t(e.r2KeyPrefixRule, "path");
      c.ok ? c.value || r.push(`${t} r2KeyMode='regex' \u65F6\u5FC5\u987B\u586B\u5199 r2KeyPrefixRule`) : r.push(`${t} r2KeyPrefixRule \u6B63\u5219\u975E\u6CD5: ${c.error}`);
    }
    return { value: { id: b(e.id, "", 64) || `o_${u}_${Date.now().toString(36)}`, enabled: T(e.enabled, true), order: C(e.order, u, 0, 1e4), weight: C(e.weight, de.weight, 0, 1e4), name: b(e.name, "", 64), engine: "r2", scheme: "https", addr: "", port: 443, pathPrefix: "", extraHeaders: Object.freeze({}), hostHeader: { mode: "inherit", custom: "" }, sni: null, r2Binding: n, r2KeyPrefix: o, r2KeyMode: a, r2KeyPrefixRule: s, r2KeyRegexTo: i, r2ContentType: l }, errors: r };
  }
  function ql(e, u, t, r, n) {
    let a = b(e.repoUser, "", 128).trim(), o = b(e.repoName, "", 128).trim(), s = T(e.repoPrivate, false), i = b(e.repoBranch, "main", 128).trim() || "main", l = e.cnbTokenEnc != null ? e.cnbTokenEnc : e.githubTokenEnc, c = n === "cnb" ? "cnbTokenEnc" : "githubTokenEnc", d = b(l, "", 4096).trim();
    !d && s && r.push(`${t} engine='${n}' \u79C1\u6709\u4ED3\u5E93\u5FC5\u987B\u586B\u5199\u8BBF\u95EE\u4EE4\u724C\uFF08token\uFF09`), a || r.push(`${t} engine='${n}' \u65F6\u5FC5\u987B\u586B\u5199\u4ED3\u5E93\u5F52\u5C5E\uFF08repoUser\uFF09`), o || r.push(`${t} engine='${n}' \u65F6\u5FC5\u987B\u586B\u5199\u4ED3\u5E93\u540D\uFF08repoName\uFF09`);
    let f = b(e.addr, "", 253).trim() || St(n, s);
    return { value: { id: b(e.id, "", 64) || `o_${u}_${Date.now().toString(36)}`, enabled: T(e.enabled, true), order: C(e.order, u, 0, 1e4), weight: C(e.weight, de.weight, 0, 1e4), name: b(e.name, "", 64), engine: n, scheme: "https", addr: f, port: 443, pathPrefix: "", extraHeaders: Object.freeze({}), hostHeader: { mode: "inherit", custom: "" }, sni: null, r2Binding: "", r2KeyPrefix: "", r2KeyMode: "none", r2KeyPrefixRule: "", r2KeyRegexTo: "", r2ContentType: de.r2ContentType, repoUser: a, repoName: o, repoBranch: i, repoPrivate: s, [c]: d }, errors: r };
  }
  function jl(e, u) {
    let t = [], r = `\u6E90\u7AD9[${u}]`;
    if (!E(e))
      return { value: null, errors: [`${r} \u4E0D\u662F\u5408\u6CD5\u5BF9\u8C61`] };
    let n = M(e.engine, ["fetch", "socket", "r2", "cnb", "github"], de.engine);
    if (n === "r2")
      return zl(e, u, r, t);
    if (n === "cnb" || n === "github")
      return ql(e, u, r, t, n);
    let a = wl(e.addr);
    if (!a.ok)
      return { value: null, errors: [`${r} ${a.error}`] };
    let o = M(e.scheme, ["http", "https"], de.scheme), s = C(e.port, o === "https" ? 443 : 80, 1, 65535), i = b(e.pathPrefix, "");
    i && (i.startsWith("/") || (i = "/" + i), i = i.replace(/\/+$/, ""));
    let l = Ka(e.extraHeaders, `${r} extraHeaders`);
    t.push(...l.errors);
    let c = E(e.hostHeader) ? e.hostHeader : {}, d = n === "cnb" || n === "github" ? "inherit" : "origin", p = M(c.mode, ["inherit", "origin", "client", "custom"], d), f = b(c.custom, "", B.HOST_MAX).toLowerCase();
    return p === "custom" && !f && t.push(`${r} hostHeader \u4E3A custom \u65F6\u5FC5\u987B\u586B\u5199 custom \u503C`), n === "fetch" && (p === "client" || p === "custom") && t.push(`${r} fetch \u5F15\u64CE\u4E0D\u652F\u6301\u81EA\u5B9A\u4E49 Host \u5934\uFF08\u5E73\u53F0\u9650\u5236\u4F1A\u9759\u9ED8\u4E22\u5F03\uFF09\uFF0C\u8BF7\u6539\u7528 socket \u5F15\u64CE\uFF08\u4EC5 Cloudflare Workers\uFF09\u6216\u5C06 hostHeader \u8BBE\u4E3A inherit`), { value: { id: b(e.id, "", 64) || `o_${u}_${Date.now().toString(36)}`, enabled: T(e.enabled, true), order: C(e.order, u, 0, 1e4), weight: C(e.weight, de.weight, 0, 1e4), name: b(e.name, "", 64), engine: n, scheme: o, addr: a.value, port: s, pathPrefix: i, extraHeaders: l.value, hostHeader: { mode: p, custom: f }, sni: e.sni ? b(e.sni, "", B.HOST_MAX).toLowerCase() : null, r2Binding: "", r2KeyPrefix: "", r2KeyMode: "none", r2KeyPrefixRule: "", r2KeyRegexTo: "", r2ContentType: de.r2ContentType }, errors: t };
  }
  function Gl(e, u = 0) {
    if (u <= 1)
      return null;
    let t = Math.min(Math.max(u - 1, 0), 9), r = { enabled: true, retryOn: [Ce], maxRetries: t, timeoutMs: 0, maxRetryBodyBytes: 5242880, penaltySeconds: 15, totalTimeoutMs: 0, speculativeMs: 500 };
    if (!E(e))
      return { ...r };
    let n = [Ce];
    if (Array.isArray(e.retryOn))
      if (e.retryOn.includes(Ce) || e.retryOn.includes("*") || e.retryOn.includes("all"))
        n = [Ce];
      else {
        let a = /* @__PURE__ */ new Set(), o = [];
        for (let s of e.retryOn) {
          let i = C(s, 0, 100, 599);
          i >= 100 && i <= 599 && !a.has(i) && (a.add(i), o.push(i));
        }
        n = o.length > 0 ? o : [Ce];
      }
    return { enabled: T(e.enabled, r.enabled), retryOn: n, maxRetries: C(e.maxRetries, r.maxRetries, 0, 10), timeoutMs: C(e.timeoutMs, r.timeoutMs, 1e3, 6e4), maxRetryBodyBytes: C(e.maxRetryBodyBytes, r.maxRetryBodyBytes, 0, 32 * 1024 * 1024), penaltySeconds: C(e.penaltySeconds, r.penaltySeconds, 0, 600), totalTimeoutMs: C(e.totalTimeoutMs, r.totalTimeoutMs, 0, 12e4), speculativeMs: C(e.speculativeMs, r.speculativeMs, 0, 6e4) };
  }
  function hu(e, u) {
    let t = Ga();
    if (!E(e))
      return { ok: false, errors: ["\u6E90\u7AD9\u6C60\u914D\u7F6E\u4E0D\u662F\u5408\u6CD5\u5BF9\u8C61"] };
    let r = b(e.id, "", 64);
    r || (r = vl());
    let n = b(e.name, "", 64).trim(), a = M(e.kind, Yr, kt.kind), o = Array.isArray(e.origins) ? e.origins : [];
    if (o.length === 0)
      return { ok: false, errors: [a === "single" ? "\u5355\u4E00\u6E90\u7AD9\u5FC5\u987B\u586B\u5199\u6E90\u7AD9\u5730\u5740" : "\u6E90\u7AD9\u6C60\u81F3\u5C11\u9700\u8981\u914D\u7F6E\u4E00\u4E2A\u6E90\u7AD9"] };
    if (a === "single" && o.length > 1)
      return { ok: false, errors: ["\u5355\u4E00\u6E90\u7AD9\u53EA\u80FD\u5305\u542B 1 \u4E2A\u6E90\u7AD9\uFF1B\u9700\u8981\u591A\u4E2A\u8BF7\u6539\u7528\u300C\u6E90\u7AD9\u6C60\u300D\u7C7B\u578B"] };
    o.length > B.ORIGINS_MAX && t.errors.push(`\u6E90\u7AD9\u6570\u91CF\u8D85\u8FC7\u4E0A\u9650 ${B.ORIGINS_MAX}`);
    let s = [], i = /* @__PURE__ */ new Set();
    for (let c = 0; c < Math.min(o.length, B.ORIGINS_MAX); c++) {
      let d = jl(o[c], c);
      if (t.errors.push(...d.errors), !!d.value) {
        if (i.has(d.value.id)) {
          t.errors.push(`\u6E90\u7AD9 id \u91CD\u590D: ${d.value.id}`);
          continue;
        }
        i.add(d.value.id), s.push(d.value);
      }
    }
    s.length === 0 && t.errors.length === 0 && t.errors.push("\u6CA1\u6709\u4EFB\u4F55\u6709\u6548\u7684\u6E90\u7AD9");
    let l = a === "single" ? "chain" : M(e.strategy, ["chain", "roundrobin", "random", "weighted", "iphash"], kt.strategy);
    return l === "weighted" && s.length > 0 && s.filter((d) => d.enabled).reduce((d, p) => d + p.weight, 0) <= 0 && t.errors.push("\u6743\u91CD\u7B56\u7565\u4E0B\uFF0C\u542F\u7528\u7684\u6E90\u7AD9\u6743\u91CD\u4E4B\u548C\u5FC5\u987B\u5927\u4E8E 0"), s.length > 0 && !s.some((c) => c.enabled) && t.errors.push("\u81F3\u5C11\u9700\u8981\u542F\u7528\u4E00\u4E2A\u6E90\u7AD9"), s.forEach((c, d) => {
      c.engine === "socket" && t.errors.push(`\u6E90\u7AD9[${d}] \u4F7F\u7528\u4E86\u5DF2\u5F03\u7528\u7684 socket \u5F15\u64CE\uFF1A\u81EA\u5B9A\u4E49\u56DE\u6E90 Host \u5DF2\u7531 fetch \u539F\u751F\u652F\u6301\uFF0CCF \u4E0A\u88F8 IP+HTTPS+\u81EA\u5B9A\u4E49 SNI \u7531 fetchEngine \u81EA\u52A8\u8D70 cloudflare:sockets \u515C\u5E95\uFF0C\u8BF7\u79FB\u9664 origin/rule \u914D\u7F6E\u4E2D\u7684 engine:'socket'\uFF0C\u6539\u7528\u9ED8\u8BA4 fetch\u3002`), c.engine === "api" && t.errors.push(`\u6E90\u7AD9[${d}] \u4F7F\u7528\u4E86\u5DF2\u79FB\u9664\u7684 api \u5F15\u64CE\uFF1A\u8BF7\u6539\u7528 cnb \u6216 github \u4ED3\u5E93\u578B\u5F15\u64CE\uFF08\u56DE\u6E90\u5230\u5BF9\u5E94\u4ED3\u5E93 raw API\uFF09\u3002`);
    }), t.errors.length ? { ok: false, errors: t.errors } : (s.sort((c, d) => c.order - d.order), { ok: true, value: { id: r, name: n || r, kind: a, strategy: l, origins: s, failover: Gl(e.failover, (e.origins || []).length), createdBy: b(e.createdBy, "", B.HOST_MAX).toLowerCase(), updatedAt: C(e.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER) } });
  }
  function Kl(e) {
    let u = pu;
    if (!E(e))
      return k(u);
    let t = M(e.mode, ["static", "proxy", "none"], u.mode), r = b(e.target, "", 512), n = "";
    if (r)
      try {
        let a = new URL(r);
        (a.protocol === "http:" || a.protocol === "https:") && (n = a.toString());
      } catch {
        n = "";
      }
    return t === "proxy" && !n && (t = "static"), { mode: t, target: n, status: C(e.status, u.status, 200, 599) };
  }
  function Le(e, u, t) {
    let r = Iu, n = E(t) ? t : {};
    if (!E(e))
      return { ok: true, value: k(r) };
    let a = e.adminPath, s = a == null || String(a).trim() === "" ? n.adminPath != null && n.adminPath !== "" ? n.adminPath : r.adminPath : String(a).trim().replace(/^\/+/, "").replace(/\/+$/, "");
    (!s || !/^[a-zA-Z0-9_-]+$/.test(s)) && (s = n.adminPath && /^[a-zA-Z0-9_-]+$/.test(n.adminPath) ? n.adminPath : r.adminPath);
    let i = e.adminDomain, c = i == null || String(i).trim() === "" ? n.adminDomain != null && n.adminDomain !== "" ? n.adminDomain : r.adminDomain : String(i).trim().toLowerCase().replace(/:\d+$/, ""), d = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
    (!c || !d.test(c)) && (c = n.adminDomain && d.test(n.adminDomain) ? n.adminDomain : r.adminDomain);
    let p = e.tokenTtl, g = p == null || String(p).trim() === "" ? n.tokenTtl != null ? n.tokenTtl : r.tokenTtl : C(p, r.tokenTtl, 300, 86400 * 30), m = e.configCacheTtl, S = m == null || String(m).trim() === "" ? n.configCacheTtl != null ? n.configCacheTtl : r.configCacheTtl : C(m, r.configCacheTtl, 0, 600), I = C(e.globalRateLimit, r.globalRateLimit, 0, 1e6);
    I > 0 && I < 10 && (I = 10);
    let v = M(e.statsDriver, ["d1", "none"], r.statsDriver);
    u && u.hasD1 === false && v === "d1" && (v = "none", console.warn(`[config] \u5E73\u53F0\uFF08${u.platform || "unknown"}\uFF09\u672A\u7ED1\u5B9A D1\uFF0C\u7EDF\u8BA1\u9A71\u52A8\u81EA\u52A8\u5F52\u4E00\u5230 'none'\uFF08\u7EDF\u8BA1\u529F\u80FD\u4E0D\u53EF\u7528\uFF0C\u7EDD\u4E0D\u5199 KV\uFF09`));
    let _ = { adminPath: s, adminDomain: c, passwordHash: b(e.passwordHash, "", 512), passwordSalt: b(e.passwordSalt, "", 512), tokenTtl: g, statsEnabled: T(e.statsEnabled, r.statsEnabled), statsDriver: v, configCacheTtl: S, globalRateLimit: I, disguise: Kl(e.disguise), version: b(e.version, me, 32) }, H = Wl(_, u);
    return H.length ? { ok: false, errors: H } : { ok: true, value: _ };
  }
  function Wl(e, u) {
    let t = [];
    return u && u.hasD1 === false && e.statsDriver === "d1" && t.push(`\u7EDF\u8BA1\u9A71\u52A8\u8BBE\u4E3A d1\uFF0C\u4F46\u5F53\u524D\u5E73\u53F0\uFF08${u.platform || "unknown"}\uFF09\u4E0D\u652F\u6301 D1\uFF1B\u7EDF\u8BA1\u843D\u76D8\u53EA\u652F\u6301 D1\uFF0C\u65E0 D1 \u65F6\u8BF7\u6539\u4E3A 'none'\uFF08\u7EDF\u8BA1\u529F\u80FD\u4E0D\u53EF\u7528\uFF09`), t;
  }
  var ja;
  var yl;
  var za;
  var B;
  var E;
  var Oe = R(() => {
    re();
    ju();
    cu();
    Jr();
    X();
    ja = { rewrite: "rewrite", redirect: "redirect", forceHttps: ["forceHttps", "forceHttpsStatus"], directResponse: "directResponse", reqHeaders: "reqHeaders", respHeaders: "respHeaders", cache: "cache", hostHeader: "hostHeader", originConn: ["engine", "scheme", "port"], targetPool: ["poolId"], clientIp: "clientIpHeader", followRedirect: "followRedirect", originTimeout: "originTimeoutMs" };
    yl = (() => {
      let e = /* @__PURE__ */ new Set();
      for (let u of Object.values(ja))
        Array.isArray(u) ? u.forEach((t) => e.add(t)) : e.add(u);
      return e;
    })();
    za = typeof globalThis < "u" && globalThis.crypto ? globalThis.crypto : null, B = Object.freeze({ HOST_MAX: 253, RULES_MAX: 50, ORIGINS_MAX: 20, LIST_MAX: 200, REGEX_MAX: 200, STR_MAX: 2048, HEADERS_MAX: 30, TTL_MAX: 31536e3 });
    E = (e) => e !== null && typeof e == "object" && !Array.isArray(e);
  });
  function Ya(e = {}) {
    let u = e.totalBytes || 134217728, t = e.env || {}, r = Number(t.MEM_BUDGET_BYTES);
    Number.isFinite(r) && r > 0 && (u = r), Lt = u, Ve = true, Ja();
  }
  function Ja() {
    if (ee.size === 0)
      return;
    let e = 0;
    for (let t of ee.values())
      e += t.weight;
    e <= 0 && (e = ee.size);
    let u = Math.floor(Lt * 0.95);
    for (let t of ee.values())
      t.quotaBytes = Math.floor(u * t.weight / e);
  }
  function mu(e, u) {
    let t = ee.get(e);
    ee.set(e, { name: e, weight: u.weight > 0 ? u.weight : 1, estimateBytes: typeof u.estimateBytes == "function" ? u.estimateBytes : () => 1024, evict: typeof u.evict == "function" ? u.evict : () => {
    }, allowAggressiveEvict: u.allowAggressiveEvict !== false, usedBytes: t ? t.usedBytes : 0, entries: t ? t.entries : 0, quotaBytes: t ? t.quotaBytes : 0, runningEstimate: Math.max(1, Math.round((typeof u.estimateBytes == "function" ? u.estimateBytes(null) : 0) || 1024)) }), Ve && Ja();
  }
  function Xe(e, u) {
    if (!Ve)
      return true;
    try {
      let t = ee.get(e);
      if (!t)
        return true;
      let r = t.runningEstimate || 1024;
      return t.usedBytes += r, t.entries += 1, Ie += r, Vl(t, u), Qa(false), true;
    } catch {
      return true;
    }
  }
  function pe(e, u = 1) {
    if (Ve)
      try {
        let t = ee.get(e);
        if (!t)
          return;
        let r = t.runningEstimate || 1024;
        t.usedBytes = Math.max(0, t.usedBytes - r * u), t.entries = Math.max(0, t.entries - u), Ie = Math.max(0, Ie - r * u);
      } catch {
      }
  }
  function Eu(e, u) {
    if (Ve)
      try {
        let t = ee.get(e);
        if (!t)
          return;
        let r = t.runningEstimate || 1024;
        t.entries = Math.max(0, u), t.usedBytes = Math.max(0, t.entries * r), Ie = Math.max(0, Ie - (t.usedBytes - t.usedBytes));
        let n = 0;
        for (let a of ee.values())
          n += a.usedBytes;
        Ie = n;
      } catch {
      }
  }
  function Vl(e, u) {
    if (en += 1, !(en < 1024) && (en = 0, !!u))
      try {
        let t = e.estimateBytes(u);
        Number.isFinite(t) && t > 0 && (e.runningEstimate = Math.round(e.runningEstimate * 0.8 + t * 0.2));
      } catch {
      }
  }
  function Qa(e) {
    try {
      if (Ie / Lt >= 0.9) {
        Xl(Math.floor(Lt * 0.7));
        return;
      }
      for (let u of ee.values())
        if (!(u.usedBytes < u.quotaBytes) && !(!u.allowAggressiveEvict && !e))
          try {
            u.evict(true);
          } catch {
          }
    } catch {
    }
  }
  function Xl(e) {
    for (let u of ee.values())
      if (u.allowAggressiveEvict)
        try {
          u.evict(true);
        } catch {
        }
    if (!(Ie <= e)) {
      for (let u of ee.values())
        if (!u.allowAggressiveEvict)
          try {
            u.evict(true);
          } catch {
          }
    }
  }
  function Za() {
    Ve && Qa(false);
  }
  function Ot(e) {
    if (!Ve)
      return 0;
    let u = ee.get(e);
    return u ? u.quotaBytes : 0;
  }
  var Ve;
  var Lt;
  var Ie;
  var ee;
  var en;
  var Wu = R(() => {
    Ve = false, Lt = 134217728, Ie = 0, ee = /* @__PURE__ */ new Map(), en = 0;
  });
  var co = {};
  dt(co, { SYNC_TOKEN_TTL_SEC: () => Yu, delSyncToken: () => tu, deletePool: () => pn, deleteSite: () => dn, ensureGlobalRulesSeeded: () => fn, getGlobal: () => L, getGlobalRules: () => fe, getPool: () => Ne, getSite: () => ie, getSyncToken: () => jt, invalidateMemCache: () => Te, isBakedMode: () => J, isSnapshotLoaded: () => rc, listAllSites: () => Ze, listPools: () => uu, listSites: () => zt, loadConfigSnapshot: () => Je, onGlobalChange: () => sn, putGlobal: () => He, putGlobalRules: () => Au, putPool: () => eu, putSite: () => xe, reconcileVersion: () => cn, reloadConfigSnapshot: () => ao, setSyncToken: () => gn });
  function sn(e) {
    typeof e == "function" && !rn.includes(e) && rn.push(e);
  }
  async function to(e) {
    let u = Date.now();
    if (z.expireAt > u)
      return z.value;
    let t = await j(e, on), r = typeof t == "number" && Number.isFinite(t) ? t : 0;
    return z.value !== r ? (z.level = 0, z.holdLeft = Ht) : z.holdLeft > 1 ? z.holdLeft -= 1 : (z.level = Math.min(z.level + 1, tn.length - 1), z.holdLeft = Ht), z.value = r, z.expireAt = u + tn[z.level], r;
  }
  function Yl() {
    return Math.floor(Date.now() / 1e3 / 60);
  }
  async function bu(e) {
    try {
      let u = Yl();
      await Qe(e, on, u), z.value = u, z.level = 0, z.holdLeft = Ht, z.expireAt = Date.now() + tn[0];
    } catch (u) {
      console.error("[store] \u5237\u65B0\u914D\u7F6E\u7248\u672C\u53F7\u5931\u8D25\uFF08\u5DF2\u5FFD\u7565\uFF0C\u5199\u5165\u672C\u8EAB\u5DF2\u843D\u5E93\uFF09:", u?.message);
    }
  }
  function ro(e, u) {
    for (let t of rn)
      try {
        t(e, u);
      } catch (r) {
        console.error("[store] onGlobalChange \u76D1\u542C\u5668\u5F02\u5E38\uFF08\u5DF2\u5FFD\u7565\uFF09:", r?.message);
      }
  }
  function no(e) {
    if (!e || typeof e != "object")
      return 2048;
    try {
      return Math.max(64, JSON.stringify(e).length + 64);
    } catch {
      return 2048;
    }
  }
  function Ql(e) {
    let u = Date.now();
    for (let [t, r] of K)
      u > r.expireAt && K.delete(t);
    Eu("config", K.size);
  }
  function Zl() {
    try {
      let e = getDomainQuota("config");
      if (e > 0) {
        let u = Math.floor(e / no(null));
        return Math.max(1, Math.min(eo, u));
      }
    } catch {
    }
    return eo;
  }
  async function uc(e) {
    let u = await j(e, "site:_index");
    if (!u || !Array.isArray(u.hosts))
      return null;
    let t = u.hosts.filter((n) => typeof n == "string");
    if (t.length === 0)
      return null;
    let r = { hosts: [], wildcards: [], byHost: {} };
    for (let n of t) {
      let a = n.toLowerCase(), o = await j(e, `site:${a}`);
      o && typeof o == "object" && (r.byHost[a] = o, r.hosts.push(a), a.startsWith("*.") && r.wildcards.push({ pattern: a, host: a }));
    }
    return r.hosts.length > 0 ? (await Qe(e, we, r), r) : null;
  }
  async function tc(e) {
    let u = await j(e, "pool:_index");
    if (!u || !Array.isArray(u.ids))
      return null;
    let t = u.ids.filter((n) => typeof n == "string");
    if (t.length === 0)
      return null;
    let r = { ids: [], byId: {} };
    for (let n of t) {
      let a = await j(e, `pool:${n}`);
      a && typeof a == "object" && (r.byId[n] = a, r.ids.push(n));
    }
    return r.ids.length > 0 ? (await Qe(e, ke, r), r) : null;
  }
  async function Je(e) {
    if (!W)
      return Vu || (Vu = (async () => {
        if (J(e)) {
          W = true;
          return;
        }
        let u = await j(e, on), t = typeof u == "number" && Number.isFinite(u) ? u : 0;
        z.value = t, Ju = t, q.version = t;
        try {
          let r = await j(e, be), n = r ? Le(r).value : Hu();
          Ye = Math.max(0, (n.configCacheTtl ?? 60) * 1e3), (e?.caps?.platform === "edgeone" || e?.caps?.platform === "eo") && Ye < $t && (Ye = $t), q.global = n, ne(be, n);
        } catch (r) {
          console.error("[store] \u5FEB\u7167\u52A0\u8F7D\u5168\u5C40\u914D\u7F6E\u5931\u8D25\uFF08\u5DF2\u964D\u7EA7\u4E3A\u9ED8\u8BA4\u503C\uFF09:", r?.message);
        }
        try {
          let r = await j(e, Qu), n = Fn(r);
          q.globalRules = { stages: n }, ne(Qu, { stages: n });
        } catch (r) {
          console.error("[store] \u5FEB\u7167\u52A0\u8F7D\u5168\u7AD9\u89C4\u5219\u5931\u8D25\uFF08\u5DF2\u964D\u7EA7\u4E3A\u9ED8\u8BA4\u503C\uFF09:", r?.message);
        }
        try {
          let r = await j(e, we), n = r && typeof r == "object" ? nn(r) : null;
          if (!n || n.hosts.length === 0 && !r) {
            let a = await uc(e);
            n = n || nn(null), a && (n = a);
          }
          q.sites = n, ne(we, n);
        } catch (r) {
          console.error("[store] \u5FEB\u7167\u52A0\u8F7D\u7AD9\u70B9\u5931\u8D25\uFF08\u5DF2\u964D\u7EA7\u4E3A\u7A7A\uFF09:", r?.message);
        }
        try {
          let r = await j(e, ke), n = r && typeof r == "object" ? an(r) : null;
          if (!n || n.ids.length === 0 && !r) {
            let a = await tc(e);
            n = n || an(null), a && (n = a);
          }
          q.pools = n, ne(ke, n);
        } catch (r) {
          console.error("[store] \u5FEB\u7167\u52A0\u8F7D\u6E90\u7AD9\u6C60\u5931\u8D25\uFF08\u5DF2\u964D\u7EA7\u4E3A\u7A7A\uFF09:", r?.message);
        }
        W = true, console.log("[store] \u914D\u7F6E\u5FEB\u7167\u5DF2\u5168\u91CF\u52A0\u8F7D\uFF08cfg:version=" + t + "\uFF09");
      })().catch((u) => {
        console.error("[store] \u914D\u7F6E\u5FEB\u7167\u52A0\u8F7D\u5931\u8D25\uFF08\u5DF2\u964D\u7EA7\uFF0C\u8BFB\u53D6\u8DEF\u5F84\u5C06\u6309\u9700\u515C\u5E95\uFF09:", u?.message), W = true;
      }).finally(() => {
        Vu = null;
      }), Vu);
  }
  async function ao(e) {
    W = false, Te(), await Je(e);
  }
  function rc() {
    return W;
  }
  async function cn(e) {
    if (!un) {
      un = true;
      try {
        if (!W) {
          await Je(e);
          return;
        }
        let u = await to(e);
        if (u < 0)
          return;
        u !== Ju && (console.log(`[store] \u68C0\u6D4B\u5230\u914D\u7F6E\u7248\u672C\u53F7\u53D8\u5316\uFF08${Ju} \u2192 ${u}\uFF09\uFF0C\u5168\u91CF\u91CD\u62C9\u5FEB\u7167`), await ao(e));
      } catch (u) {
        console.error("[store] reconcileVersion \u5931\u8D25\uFF08\u5DF2\u5FFD\u7565\uFF09:", u?.message);
      } finally {
        un = false;
      }
    }
  }
  function Zu(e, u) {
    if (e && e.mgmt)
      return;
    let t = K.get(u);
    if (t) {
      if (Date.now() > t.expireAt) {
        K.delete(u);
        return;
      }
      return K.delete(u), K.set(u, t), t.value;
    }
  }
  function ne(e, u) {
    let t = Ye > 0 ? Ye : ec;
    K.has(e) && pe("config", 1);
    let r = Zl();
    for (; K.size >= r; ) {
      let n = K.keys().next().value;
      if (n === void 0)
        break;
      K.delete(n), pe("config", 1);
    }
    K.set(e, { value: u, expireAt: Date.now() + t }), Xe("config", u);
  }
  function Mt(e) {
    K.has(e) && (K.delete(e), pe("config", 1));
  }
  function Te() {
    let e = K.size;
    K.clear(), e > 0 && pe("config", e);
  }
  function J(e) {
    return !!(e?.env && e.env.STATIC_CONFIG === "1");
  }
  function xu(e) {
    let u = e?.caps?.platform, t = u === "aliyun-esa" || u === "esa" ? "\u963F\u91CC\u4E91 ESA" : "\u5F53\u524D\uFF08\u70D8\u7119\u914D\u7F6E\uFF09";
    throw new Error(`${t}\u8FD0\u884C\u5728\u9759\u6001\u70D8\u7119\u914D\u7F6E\u6A21\u5F0F\u4E0B\uFF0C\u914D\u7F6E\u53EA\u8BFB\uFF0C\u65E0\u6CD5\u5728\u6B64\u8282\u70B9\u4FEE\u6539\u3002\u8BF7\u5728\u4E3B\u8282\u70B9\uFF08\u5982 Cloudflare \u90E8\u7F72\uFF09\u4FEE\u6539\u914D\u7F6E\u540E\uFF0C\u91CD\u65B0\u5BFC\u51FA\u5E76\u5728\u8FD9\u91CC\u91CD\u65B0\u6784\u5EFA\u90E8\u7F72\u3002`);
  }
  async function nc() {
    if (Xu)
      return Xu;
    try {
      let e = await import("./baked.generated.js");
      Xu = e.BAKED_CONFIG && typeof e.BAKED_CONFIG == "object" ? e.BAKED_CONFIG : Mr;
    } catch {
      Xu = Mr;
    }
    return Xu;
  }
  async function Ut(e) {
    let t = (await nc())?.[e];
    return t === void 0 ? null : t;
  }
  function oo(e) {
    J(e) && xu(e);
    let u = se(e.env);
    if (!u) {
      let t = e?.caps?.platform, r;
      throw t === "edgeone" || t === "eo" ? r = "\u672A\u68C0\u6D4B\u5230 KV \u7ED1\u5B9A\uFF0C\u914D\u7F6E\u65E0\u6CD5\u4FDD\u5B58\u3002EdgeOne \u8BF7\u5728\u300C\u9879\u76EE\u8BBE\u7F6E \u2192 \u5B58\u50A8\u7ED1\u5B9A\u300D\u4E2D\u521B\u5EFA KV \u547D\u540D\u7A7A\u95F4\uFF0C\u5E76\u4EE5 CDN_KV \u4E3A\u53D8\u91CF\u540D\u7ED1\u5B9A\u5230\u672C\u9879\u76EE\uFF08KV \u4EC5\u5728 Edge Functions \u4E2D\u53EF\u7528\uFF09" : t === "aliyun-esa" || t === "esa" ? r = "\u672A\u68C0\u6D4B\u5230 KV \u7ED1\u5B9A\uFF0C\u914D\u7F6E\u65E0\u6CD5\u4FDD\u5B58\u3002\u963F\u91CC\u4E91 ESA \u7684 EdgeKV \u6309\u91CF\u6536\u8D39\u4E14\u65E0\u514D\u8D39\u989D\u5EA6\uFF0C\u672C\u9879\u76EE\u5728 ESA \u4E0A\u7EDF\u4E00\u7981\u7528\u5382\u5546 KV\uFF0C\u6301\u4E45\u5316\u5FC5\u987B\u4F7F\u7528\u5916\u7F6E Redis\uFF1A\u8BF7\u5728 ESA \u63A7\u5236\u53F0\u8BBE\u7F6E\u73AF\u5883\u53D8\u91CF REDIS_URL\uFF08\u6307\u5411\u81EA\u5EFA Webdis/Redis\uFF0C\u5F62\u5982 https://your-webdis.example.com\uFF09\uFF0C\u53EF\u9009 REDIS_TOKEN / REDIS_PREFIX\u3002\u8BE6\u89C1 docs/14-deploy-esa.md" : r = "\u672A\u68C0\u6D4B\u5230 KV \u7ED1\u5B9A\uFF0C\u914D\u7F6E\u65E0\u6CD5\u4FDD\u5B58\u3002\u8BF7\u5148\u521B\u5EFA KV Namespace \u5E76\u4EE5 CDN_KV \u4E3A\u53D8\u91CF\u540D\u7ED1\u5B9A\u5230\u672C\u9879\u76EE", new Error(r);
    }
    return u;
  }
  async function j(e, u) {
    let t = se(e.env);
    if (!t)
      return null;
    try {
      return await t.get(u, "json");
    } catch (r) {
      return console.error(`[store] \u8BFB\u53D6 ${u} \u5931\u8D25:`, r?.message), null;
    }
  }
  async function Qe(e, u, t) {
    await oo(e).put(u, JSON.stringify(t));
  }
  async function L(e) {
    if (J(e)) {
      let o = await Ut("global"), s = o ? Le(o).value : Hu(), i = e.env?.ADMIN_PATH;
      return typeof i == "string" && /^[a-zA-Z0-9_/-]+$/.test(i) && (s.adminPath === "__panel" || s.adminPath == null || s.adminPath === "") && (s.adminPath = i.replace(/^\/+/, "").replace(/\/+$/, "") || s.adminPath), s;
    }
    if (W && !e?.mgmt && q.global)
      return q.global;
    let u = Zu(e, be);
    if (W && u) {
      if (!e?.mgmt)
        return u;
      Mt(be);
    }
    let t = await j(e, be), r;
    t ? r = Le(t).value : r = Hu();
    let n = e.env?.ADMIN_PATH;
    typeof n == "string" && /^[a-zA-Z0-9_/-]+$/.test(n) && (r.adminPath === "__panel" || r.adminPath == null || r.adminPath === "") && (r.adminPath = n.replace(/^\/+/, "").replace(/\/+$/, "") || r.adminPath);
    let a = Math.max(0, (r.configCacheTtl ?? 60) * 1e3);
    if ((e?.caps?.platform === "edgeone" || e?.caps?.platform === "eo") && a < $t && (a = $t), Ye = a, !W) {
      let o = await to(e);
      Ju = o >= 0 ? o : Ju;
    }
    return u && u !== r && ro(r, u), ne(be, r), r;
  }
  async function He(e, u) {
    J(e) && xu(e);
    let r = { ...Le(u).value, passwordHash: u.passwordHash || "", passwordSalt: u.passwordSalt || "" }, n = await j(e, be), a = null;
    if (n)
      try {
        a = Le(n).value;
      } catch {
        a = null;
      }
    await Qe(e, be, r), Mt(be), ne(be, r), q.global = r, Ye = Math.max(0, (r.configCacheTtl ?? 30) * 1e3), ro(r, a), await bu(e);
  }
  function nn(e) {
    let u = { hosts: [], wildcards: [], byHost: {} };
    if (!e || typeof e != "object")
      return u;
    if (e.byHost && typeof e.byHost == "object")
      for (let [t, r] of Object.entries(e.byHost)) {
        if (!r || typeof r != "object")
          continue;
        let n = String(t).toLowerCase();
        r.host !== void 0 && String(r.host).toLowerCase() !== n && (r.host = n), u.byHost[n] = r, u.hosts.includes(n) || u.hosts.push(n), n.startsWith("*.") && u.wildcards.push({ pattern: n, host: n });
      }
    else if (Array.isArray(e.hosts)) {
      u.hosts = e.hosts.filter((t) => typeof t == "string").map((t) => t.toLowerCase()), u.wildcards = Array.isArray(e.wildcards) ? e.wildcards.filter((t) => t && typeof t.pattern == "string") : [];
      for (let t of u.hosts)
        u.byHost[t] = u.byHost[t] || null;
    }
    return u;
  }
  async function Pt(e) {
    if (W && !e?.mgmt && q.sites)
      return q.sites;
    let u = Zu(e, we);
    if (u)
      return u;
    let t;
    if (J(e)) {
      let r = await Ut("sites") || [];
      t = { hosts: [], wildcards: [], byHost: {} };
      for (let n of r) {
        if (!n || typeof n.host != "string")
          continue;
        let a = String(n.host).toLowerCase();
        t.byHost[a] = n, t.hosts.includes(a) || t.hosts.push(a), a.startsWith("*.") && t.wildcards.push({ pattern: a, host: a });
      }
    } else {
      let r = await j(e, we);
      t = nn(r);
    }
    return ne(we, t), t;
  }
  async function so(e, u) {
    await Qe(e, we, u), Mt(we), ne(we, u), W && (q.sites = u);
  }
  function ac(e, u) {
    if (!e.startsWith("*."))
      return false;
    let t = e.slice(2);
    return u.endsWith("." + t);
  }
  async function ie(e, u, t = {}) {
    if (!u || typeof u != "string")
      return null;
    let r = u.toLowerCase(), n = `${r}#s${t.exact ? "e" : ""}`, a = Zu(e, n);
    if (a !== void 0)
      return a;
    let o = await Pt(e), s = o.byHost[r] || null;
    if (!s && !t.exact) {
      let l = [...o.wildcards || []].sort((c, d) => (d.pattern?.length || 0) - (c.pattern?.length || 0));
      for (let c of l)
        if (c?.pattern && ac(c.pattern, r)) {
          s = o.byHost[c.pattern] || null;
          break;
        }
    }
    let i = s || null;
    return ne(n, i), i;
  }
  async function xe(e, u) {
    J(e) && xu(e);
    let t = String(u.host).toLowerCase(), r = await Pt(e), n = t.startsWith("*.");
    (!u.host || String(u.host).toLowerCase() !== t) && (u.host = t), r.hosts.includes(t) || r.hosts.push(t), n && !(r.wildcards || []).some((a) => a.pattern === t) && r.wildcards.push({ pattern: t, host: t }), r.byHost[t] = u, await so(e, r), Te(), await bu(e);
  }
  async function dn(e, u) {
    J(e) && xu(e);
    let t = String(u).toLowerCase(), r = await Pt(e);
    r.hosts = r.hosts.filter((n) => n !== t), r.wildcards = (r.wildcards || []).filter((n) => n.pattern !== t), delete r.byHost[t], await so(e, r), Te(), await bu(e);
  }
  async function zt(e, u) {
    let t = await Pt(e), r = t.hosts || [];
    if (r.length === 0)
      return { sites: [], total: 0, offset: 0, truncated: false };
    let n = Math.max(0, Math.floor(Number(u?.offset) || 0)), a = Math.floor(Number(u?.limit) || Nt), o = Math.min(Math.max(a, 1), Nt), s = r.slice(n, n + o), i = [];
    for (let l of s) {
      let c = t.byHost[l];
      c && typeof c == "object" && i.push(c);
    }
    return { sites: i, total: r.length, offset: n, truncated: n + s.length < r.length };
  }
  async function Ze(e) {
    let u = [], t = 0, r = false;
    for (; ; ) {
      let n = await zt(e, { offset: t, limit: Nt });
      if (u.push(...n.sites), !n.truncated)
        break;
      if (t += Nt, u.length >= Jl) {
        r = true;
        break;
      }
    }
    return { sites: u, truncated: r };
  }
  function an(e) {
    let u = { ids: [], byId: {} };
    if (!e || typeof e != "object")
      return u;
    if (e.byId && typeof e.byId == "object")
      for (let [t, r] of Object.entries(e.byId)) {
        if (!r || typeof r != "object")
          continue;
        let n = String(t);
        r.id !== void 0 && String(r.id) !== n && (r.id = n), u.byId[n] = r, u.ids.includes(n) || u.ids.push(n);
      }
    else if (Array.isArray(e.ids)) {
      u.ids = e.ids.filter((t) => typeof t == "string");
      for (let t of u.ids)
        u.byId[t] = u.byId[t] || null;
    }
    return u;
  }
  async function qt(e) {
    if (W && !e?.mgmt && q.pools)
      return q.pools;
    let u = Zu(e, ke);
    if (u)
      return u;
    let t;
    if (J(e)) {
      let r = await Ut("pools") || [];
      t = { ids: [], byId: {} };
      for (let n of r) {
        if (!n || typeof n.id != "string")
          continue;
        let a = String(n.id);
        t.byId[a] = n, t.ids.includes(a) || t.ids.push(a);
      }
    } else {
      let r = await j(e, ke);
      t = an(r);
    }
    return ne(ke, t), t;
  }
  async function io(e, u) {
    await Qe(e, ke, u), Mt(ke), ne(ke, u), W && (q.pools = u);
  }
  async function Ne(e, u) {
    if (!u || typeof u != "string")
      return null;
    let t = `#pool:${u}`, r = Zu(e, t);
    if (r !== void 0)
      return r;
    let a = (await qt(e)).byId[u] || null;
    return ne(t, a), a;
  }
  async function eu(e, u) {
    let t = String(u.id);
    if (Array.isArray(u.origins)) {
      for (let n of u.origins)
        if (n && (n.engine === "cnb" || n.engine === "github")) {
          let a = n.engine === "cnb" ? "cnbTokenEnc" : "githubTokenEnc", o = n[a];
          typeof o == "string" && o && !o.startsWith("enc:") && !o.startsWith("plain:") && (n[a] = await Ca(o, e));
        }
    }
    let r = await qt(e);
    r.ids.includes(t) || r.ids.push(t), r.byId[t] = u, await io(e, r), Te(), await bu(e);
  }
  async function pn(e, u) {
    let t = String(u), r = await qt(e);
    r.ids = r.ids.filter((n) => n !== t), delete r.byId[t], await io(e, r), Te(), await bu(e);
  }
  async function uu(e) {
    let u = await qt(e), t = u.ids || [];
    if (t.length === 0)
      return [];
    let r = [];
    for (let n of t) {
      let a = u.byId[n];
      a && typeof a == "object" && r.push(a);
    }
    return r;
  }
  function oc(e) {
    let u = {}, t = Array.isArray(e.rules) ? e.rules : [], r = Be();
    for (let n of We) {
      let a = t.find((o) => o && o.stage === n && o.action);
      u[n] = a ? k(a.action[n]) : r[n];
    }
    for (let n of qu)
      u[n] = r[n];
    return u;
  }
  async function fn(e) {
    return It || (It = (async () => {
      let u = await j(e, Qu), t = Fn(u), r = u && Array.isArray(u.rules), n = !!(u && u.settings && typeof u.settings == "object"), a = !u || !(u.stages && typeof u.stages == "object" && Object.keys(u.stages).length > 0), o = Be(), s = u && u.stages && typeof u.stages == "object" && lo.some((i) => u.stages[i] === void 0);
      (r || n || a || s) && await Au(e, t);
    })().catch((u) => {
      console.error("[store] \u5168\u7AD9\u89C4\u5219\u51B7\u542F\u52A8\u64AD\u79CD/\u8FC1\u79FB\u5931\u8D25\uFF08\u5FFD\u7565\uFF0C\u7531\u8BFB\u53D6\u8DEF\u5F84\u515C\u5E95\uFF09:", u?.message);
    }).finally(() => {
    }), It);
  }
  function uo(e, u) {
    let t = k(e), r = u && typeof u == "object" ? u : null;
    if (!r)
      return t;
    let n = (s) => t[s] && typeof t[s] == "object" ? t[s] : t[s] = {}, a = (s, i, l) => {
      l != null && s[i] === void 0 && (s[i] = k(l));
    }, o = (s, i, l) => {
      if (!Array.isArray(l) || !l.length)
        return;
      let c = Array.isArray(s[i]) ? s[i] = [...s[i]] : s[i] = [];
      for (let d of l)
        c.some((p) => String(p).toLowerCase() === String(d).toLowerCase()) || c.push(d);
    };
    if (r.reqHeaders && typeof r.reqHeaders == "object") {
      let s = n("reqHeaders");
      a(s, "forwardWhitelist", r.reqHeaders.forwardWhitelist);
    }
    if (r.cache && typeof r.cache == "object" && Array.isArray(r.cache.noCacheStatus)) {
      let s = {};
      for (let i of r.cache.noCacheStatus) {
        let l = String(i).toLowerCase(), c = (l.startsWith("!"), l);
        c && /^!?(?:[1-5]\d{2}|[1-5]xx|[1-5]\dx)$/.test(c) && (s[c] = 0);
      }
      Object.keys(s).length && a(n("cache"), "statusTtl", s);
    }
    if (r.disguise && typeof r.disguise == "object") {
      let s = n("cache");
      if (s.disguise === void 0) {
        let i = {};
        r.disguise.disguiseCdnMaxAge !== void 0 && (i.cdnMaxAge = r.disguise.disguiseCdnMaxAge), r.disguise.disguiseIsolateTtlMs !== void 0 && (i.isolateTtlMs = r.disguise.disguiseIsolateTtlMs), Object.keys(i).length && (s.disguise = i);
      }
    }
    if (r.security && typeof r.security == "object") {
      let s = n("security");
      for (let i of ["rateLimitRpm", "rlTtlSec", "remoteSyncIntervalMs", "memMaxEntries"])
        a(s, i, r.security[i]);
    }
    if (r.error && typeof r.error == "object") {
      let s = n("error");
      if (a(s, "blockBody", r.error.blockBody), a(s, "blockCacheControl", r.error.blockCacheControl), r.error.messages && typeof r.error.messages == "object") {
        let i = s.messages && typeof s.messages == "object" ? s.messages : s.messages = {};
        for (let l of ["internal", "noOrigin", "configError"])
          a(i, l, r.error.messages[l]);
      }
    }
    return t;
  }
  async function fe(e) {
    if (J(e)) {
      let r = await Ut("globalRules"), n = Be();
      if (r && r.stages) {
        let a = Gu({ stages: r.stages }, n);
        return a.ok ? a.value.stages : n;
      }
      return n;
    }
    if (W && !e?.mgmt && q.globalRules)
      return { stages: k(q.globalRules.stages) };
    let u = await j(e, Qu), t = Fn(u);
    return { stages: k(t) };
  }
  function Fn(e) {
    if (e && Array.isArray(e.rules))
      return uo(oc(e), e.settings);
    if (e && e.stages && typeof e.stages == "object") {
      if (Object.keys(e.stages).length === 0)
        return Be();
      let u = uo(e.stages, e.settings), t = Be(), r = {};
      for (let a of lo)
        r[a] = u[a] !== void 0 ? k(u[a]) : k(t[a]);
      let n = r.cache;
      if (n && Array.isArray(n.noCacheStatus) && n.noCacheStatus.length) {
        let a = {};
        for (let o of n.noCacheStatus) {
          let s = String(o).toLowerCase();
          /^!?(?:[1-5]\d{2}|[1-5]xx|[1-5]\dx)$/.test(s) && (a[s] = 0);
        }
        n.statusTtl = Object.assign({}, a, n.statusTtl || {});
      }
      return r;
    }
    return Be();
  }
  async function Au(e, u) {
    J(e) && xu(e);
    let t = Gu({ stages: u && typeof u == "object" ? u : {} }, Be());
    if (!t.ok)
      return { ok: false, errors: t.errors };
    let { stages: r } = t.value;
    return await Qe(e, Qu, { stages: r }), Te(), W && (q.globalRules = { stages: r }), await bu(e), { ok: true, value: { stages: r } };
  }
  async function jt(e) {
    if (J(e))
      return null;
    let u = await j(e, ln);
    if (!u || typeof u != "object" || typeof u.code != "string" || u.code === "")
      return null;
    if (typeof u.expiresAt == "number" && u.expiresAt <= Date.now()) {
      try {
        await tu(e);
      } catch {
      }
      return null;
    }
    return u;
  }
  async function gn(e, u, t = Yu) {
    if (typeof u != "string" || u === "")
      throw new Error("\u6821\u9A8C\u7801\u4E0D\u80FD\u4E3A\u7A7A");
    let r = Math.max(60, Math.floor(Number(t) || Yu)), n = Date.now(), a = { code: u, createdAt: n, expiresAt: n + r * 1e3 };
    return await oo(e).put(ln, JSON.stringify(a), { expirationTtl: r }), a;
  }
  async function tu(e) {
    J(e) && xu(e);
    let u = se(e.env);
    u && await u.delete(ln);
  }
  var on;
  var tn;
  var Ht;
  var rn;
  var z;
  var be;
  var we;
  var ke;
  var ln;
  var Yu;
  var Nt;
  var Jl;
  var K;
  var eo;
  var Ye;
  var ec;
  var $t;
  var W;
  var Vu;
  var q;
  var un;
  var Xu;
  var Ju;
  var Qu;
  var It;
  var lo;
  var U = R(() => {
    Et();
    $r();
    Ba();
    re();
    ju();
    Oe();
    Wu();
    on = "cfg:version", tn = [2e3, 2e4, 6e4, 12e4, 2e5, 3e5, 4e5, 5e5, 6e5, 6e5], Ht = 9, rn = [];
    z = { value: 0, level: 0, holdLeft: Ht, expireAt: 0 };
    be = "cfg:global", we = "cfg:sites", ke = "cfg:pools", ln = "sync:token", Yu = 600, Nt = 30, Jl = 300, K = /* @__PURE__ */ new Map(), eo = 500;
    mu("config", { weight: 3, estimateBytes: no, evict: Ql, allowAggressiveEvict: false });
    Ye = 3e4, ec = 1e3, $t = 12e4, W = false, Vu = null, q = { version: 0, global: null, globalRules: null, sites: null, pools: null };
    un = false;
    Xu = null;
    Ju = 0;
    Qu = "cfg:global_rules", It = null;
    lo = [...We, ...qu, "fixContentType"];
  });
  function Cu(e) {
    let u = new Date(Number.isFinite(e) ? e : Date.now()), t = u.getUTCFullYear(), r = String(u.getUTCMonth() + 1).padStart(2, "0"), n = String(u.getUTCDate()).padStart(2, "0"), a = String(u.getUTCHours()).padStart(2, "0");
    return `${t}${r}${n}${a}`;
  }
  var Bn = R(() => {
  });
  var rr = {};
  dt(rr, { clearStats: () => Oc, isAvailable: () => Tc, listStatHosts: () => Lc, pruneStats: () => Ic, queryStats: () => Rc, writeStats: () => Sc });
  function vu(e) {
    try {
      let u = e || {};
      for (let t of ["CDN_DB", "DB", "D1"]) {
        let r = u[t];
        if (r && typeof r.prepare == "function" && typeof r.batch == "function")
          return r;
      }
      for (let t of ["CDN_DB", "DB", "D1"]) {
        let r = u[t];
        if (r && typeof r.prepare == "function")
          return r;
      }
      return null;
    } catch {
      return null;
    }
  }
  function Tc(e) {
    return vu(e && e.env) !== null;
  }
  async function rt(e) {
    if (wn)
      return true;
    try {
      let u = [e.prepare(`CREATE TABLE IF NOT EXISTS ${Me} (
           host        TEXT    NOT NULL,
           hour        TEXT    NOT NULL,
           requests    INTEGER NOT NULL DEFAULT 0,
           status_2xx  INTEGER NOT NULL DEFAULT 0,
           status_3xx  INTEGER NOT NULL DEFAULT 0,
           status_4xx  INTEGER NOT NULL DEFAULT 0,
           status_5xx  INTEGER NOT NULL DEFAULT 0,
           status_other INTEGER NOT NULL DEFAULT 0,
           bytes       INTEGER NOT NULL DEFAULT 0,
           cache_hit   INTEGER NOT NULL DEFAULT 0,
           cache_miss  INTEGER NOT NULL DEFAULT 0,
           dur_sum     INTEGER NOT NULL DEFAULT 0,
           dur_p95     INTEGER NOT NULL DEFAULT 0,
           updated_at  INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (host, hour)
         )`), e.prepare(`CREATE INDEX IF NOT EXISTS idx_${Me}_hour ON ${Me} (hour)`), e.prepare(`CREATE TABLE IF NOT EXISTS stats_origin_hourly (
           host      TEXT    NOT NULL,
           hour      TEXT    NOT NULL,
           origin_id TEXT    NOT NULL,
           requests  INTEGER NOT NULL DEFAULT 0,
           PRIMARY KEY (host, hour, origin_id)
         )`)];
      if (typeof e.batch == "function")
        await e.batch(u);
      else
        for (let t of u)
          await t.run();
      return wn = true, true;
    } catch {
      return false;
    }
  }
  function kn(e) {
    return String(e || "unknown").toLowerCase().replace(/[^a-z0-9.\-_*]/g, "").slice(0, 128) || "unknown";
  }
  function O(e) {
    let u = Math.round(Number(e));
    return Number.isFinite(u) && u > 0 ? u : 0;
  }
  async function Sc(e, u) {
    let t = vu(e && e.env);
    if (!t)
      return false;
    if (!Array.isArray(u) || u.length === 0)
      return true;
    if (!await rt(t))
      return false;
    let n = Cu(), a = Date.now(), o = `INSERT INTO ${Me}
      (host, hour, requests, status_2xx, status_3xx, status_4xx, status_5xx,
       status_other, bytes, cache_hit, cache_miss, dur_sum, dur_p95, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
    ON CONFLICT (host, hour) DO UPDATE SET
      requests     = requests     + excluded.requests,
      status_2xx   = status_2xx   + excluded.status_2xx,
      status_3xx   = status_3xx   + excluded.status_3xx,
      status_4xx   = status_4xx   + excluded.status_4xx,
      status_5xx   = status_5xx   + excluded.status_5xx,
      status_other = status_other + excluded.status_other,
      bytes        = bytes        + excluded.bytes,
      cache_hit    = cache_hit    + excluded.cache_hit,
      cache_miss   = cache_miss   + excluded.cache_miss,
      dur_sum      = dur_sum      + excluded.dur_sum,
      dur_p95      = MAX(dur_p95, excluded.dur_p95),
      updated_at   = excluded.updated_at`, s = `INSERT INTO stats_origin_hourly (host, hour, origin_id, requests)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT (host, hour, origin_id) DO UPDATE SET
      requests = requests + excluded.requests`, i = [];
    for (let l of u) {
      let c = kn(l && l.host), d = O(l.requests), p = O(l.durSum) || O(l.durAvg) * d;
      if (i.push(t.prepare(o).bind(c, n, d, O(l.status2xx), O(l.status3xx), O(l.status4xx), O(l.status5xx), O(l.statusOther), O(l.bytes), O(l.cacheHit), O(l.cacheMiss), p, O(l.durP95), a)), l.origins && typeof l.origins == "object")
        for (let [f, g] of Object.entries(l.origins))
          i.push(t.prepare(s).bind(c, n, String(f).slice(0, 64), O(g)));
    }
    try {
      if (typeof t.batch == "function")
        await t.batch(i);
      else
        for (let l of i)
          await l.run();
      return true;
    } catch (l) {
      try {
        console.warn("[stats/d1] \u5199\u5165\u5931\u8D25\uFF1A", String(l && l.message || l));
      } catch {
      }
      return wn = false, false;
    }
  }
  function rs() {
    return { requests: 0, status2xx: 0, status3xx: 0, status4xx: 0, status5xx: 0, statusOther: 0, bytes: 0, cacheHit: 0, cacheMiss: 0, durSum: 0, durAvg: 0, cacheHitRate: 0 };
  }
  function _c(e) {
    let u = O(e.requests), t = O(e.cache_hit), r = O(e.cache_miss), n = O(e.dur_sum), a = t + r;
    return { hour: e.hour, requests: u, status2xx: O(e.status_2xx), status3xx: O(e.status_3xx), status4xx: O(e.status_4xx), status5xx: O(e.status_5xx), statusOther: O(e.status_other), bytes: O(e.bytes), cacheHit: t, cacheMiss: r, durSum: n, durP95: O(e.dur_p95), durAvg: u > 0 ? Math.round(n / u) : 0, cacheHitRate: a > 0 ? Math.round(t / a * 1e4) / 100 : 0 };
  }
  async function Rc(e, u, t = 24) {
    let r = Math.min(kc, Math.max(1, Math.floor(Number(t) || 24))), n = kn(u), a = { driver: "d1", host: n, hours: r, total: rs(), series: [], available: false }, o = vu(e && e.env);
    if (!o || !await rt(o))
      return a;
    a.available = true;
    let i = Cu(Date.now() - (r - 1) * 36e5);
    try {
      let l = await o.prepare(`SELECT * FROM ${Me} WHERE host = ?1 AND hour >= ?2 ORDER BY hour ASC LIMIT ?3`).bind(n, i, r).all(), c = l && l.results || [], d = rs();
      for (let f of c) {
        let g = _c(f);
        a.series.push(g), d.requests += g.requests, d.status2xx += g.status2xx, d.status3xx += g.status3xx, d.status4xx += g.status4xx, d.status5xx += g.status5xx, d.statusOther += g.statusOther, d.bytes += g.bytes, d.cacheHit += g.cacheHit, d.cacheMiss += g.cacheMiss, d.durSum += g.durSum;
      }
      d.durAvg = d.requests > 0 ? Math.round(d.durSum / d.requests) : 0;
      let p = d.cacheHit + d.cacheMiss;
      d.cacheHitRate = p > 0 ? Math.round(d.cacheHit / p * 1e4) / 100 : 0, a.total = d;
      try {
        let f = await o.prepare(`SELECT origin_id, SUM(requests) AS n FROM stats_origin_hourly
           WHERE host = ?1 AND hour >= ?2 GROUP BY origin_id ORDER BY n DESC LIMIT 32`).bind(n, i).all(), g = {};
        for (let m of f && f.results || [])
          g[m.origin_id] = O(m.n);
        a.total.origins = g;
      } catch {
        a.total.origins = {};
      }
    } catch (l) {
      try {
        console.warn("[stats/d1] \u67E5\u8BE2\u5931\u8D25\uFF1A", String(l && l.message || l));
      } catch {
      }
    }
    return a;
  }
  async function Lc(e) {
    let u = vu(e && e.env);
    if (!u)
      return [];
    if (!await rt(u))
      return [];
    try {
      let t = await u.prepare(`SELECT DISTINCT host FROM ${Me} LIMIT 500`).all();
      return (t && t.results || []).map((r) => r.host);
    } catch {
      return [];
    }
  }
  async function Oc(e, u) {
    let t = vu(e && e.env);
    if (!t || !await rt(t))
      return false;
    let r = kn(u);
    try {
      let n = [t.prepare(`DELETE FROM ${Me} WHERE host = ?1`).bind(r), t.prepare("DELETE FROM stats_origin_hourly WHERE host = ?1").bind(r)];
      if (typeof t.batch == "function")
        await t.batch(n);
      else
        for (let a of n)
          await a.run();
      return true;
    } catch {
      return false;
    }
  }
  async function Ic(e, u = 30) {
    let t = vu(e && e.env);
    if (!t || !await rt(t))
      return false;
    let r = Math.max(1, Math.floor(Number(u) || 30)), n = Cu(Date.now() - r * 24 * 36e5);
    try {
      let a = [t.prepare(`DELETE FROM ${Me} WHERE hour < ?1`).bind(n), t.prepare("DELETE FROM stats_origin_hourly WHERE hour < ?1").bind(n)];
      if (typeof t.batch == "function")
        await t.batch(a);
      else
        for (let o of a)
          await o.run();
      return true;
    } catch {
      return false;
    }
  }
  var Me;
  var wn;
  var kc;
  var nr = R(() => {
    Bn();
    Me = "stats_hourly", wn = false, kc = 2160;
  });
  var $n = {};
  dt($n, { UI_CSS: () => gd, UI_HTML: () => Fd });
  var Fd;
  var gd;
  var Mn = R(() => {
    Fd = '<!DOCTYPE html><html lang="zh-CN" data-theme="auto"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark light"><meta name="robots" content="noindex,nofollow"><title>EdgeCDN \u63A7\u5236\u53F0</title><link rel="icon" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAzMiAzMic+PHRleHQgeT0nMjYnIGZvbnQtc2l6ZT0nMjYnPuKaoTwvdGV4dD48L3N2Zz4="> <style>:root{--bg:#0e1116;--bg-soft:#151a21;--panel:#171d26;--panel-2:#1d2430;--border:#262e3b;--border-soft:#1f2733;--text:#e6edf3;--text-dim:#9aa7b6;--text-mute:#6b7888;--primary:#3b82f6;--primary-hover:#2f74e6;--primary-soft:rgba(59,130,246,.14);--success:#22c55e;--warn:#f59e0b;--danger:#ef4444;--danger-soft:rgba(239,68,68,.13);--info:#38bdf8;--shadow:0 8px 28px rgba(0,0,0,.45);--radius:10px;--radius-sm:7px;--sidebar-w:216px;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}@media (prefers-color-scheme:light){:root[data-theme="auto"]{--bg:#f4f6f9;--bg-soft:#eceff4;--panel:#ffffff;--panel-2:#f7f9fc;--border:#dde3ec;--border-soft:#e8edf4;--text:#16202c;--text-dim:#55637a;--text-mute:#8794a8;--primary-soft:rgba(59,130,246,.1);--danger-soft:rgba(239,68,68,.08);--shadow:0 8px 28px rgba(19,32,51,.12)}}:root[data-theme="light"]{--bg:#f4f6f9;--bg-soft:#eceff4;--panel:#ffffff;--panel-2:#f7f9fc;--border:#dde3ec;--border-soft:#e8edf4;--text:#16202c;--text-dim:#55637a;--text-mute:#8794a8;--primary-soft:rgba(59,130,246,.1);--danger-soft:rgba(239,68,68,.08);--shadow:0 8px 28px rgba(19,32,51,.12)}*{box-sizing:border-box}html,body{margin:0;padding:0;height:100%}body{background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}a{color:var(--primary);text-decoration:none}h1,h2,h3,h4{margin:0;font-weight:600}[hidden]{display:none !important}.grow{flex:1}.mono{font-family:var(--mono);font-size:12.5px}.nowrap{white-space:nowrap}::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:var(--border);border-radius:6px;border:2px solid transparent;background-clip:content-box}::-webkit-scrollbar-thumb:hover{background:var(--text-mute);background-clip:content-box}:focus-visible{outline:2px solid var(--primary);outline-offset:2px}.login-wrap{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(1000px 480px at 50% -8%,var(--primary-soft),transparent 62%),var(--bg)}.login-card{width:100%;max-width:380px;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:34px 28px 26px;box-shadow:var(--shadow)}.login-logo{font-size:40px;text-align:center;line-height:1}.login-title{text-align:center;font-size:20px;margin-top:12px}.login-sub{text-align:center;color:var(--text-dim);font-size:13px;margin:6px 0 22px}.login-foot{text-align:center;color:var(--text-mute);font-size:12px;margin:16px 0 0}.pwd-box{position:relative}.pwd-box .input{padding-right:40px}.pwd-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;font-size:15px;padding:6px 8px;border-radius:6px;opacity:.65}.pwd-eye:hover{opacity:1}.app{display:flex;min-height:100dvh}.sidebar{width:var(--sidebar-w);flex:0 0 var(--sidebar-w);background:var(--bg-soft);border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:0;height:100dvh}.brand{display:flex;align-items:center;gap:9px;padding:16px 16px 14px;border-bottom:1px solid var(--border-soft)}.brand-logo{font-size:20px}.brand-text{font-weight:700;font-size:16px;letter-spacing:.3px}.sidebar-close{display:none;margin-left:auto}.nav{padding:10px 8px;display:flex;flex-direction:column;gap:2px;overflow-y:auto}.nav-item{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:var(--radius-sm);color:var(--text-dim);font-size:13.5px;transition:background .15s,color .15s}.nav-item:hover{background:var(--panel-2);color:var(--text)}.nav-item.active{background:var(--primary-soft);color:var(--primary);font-weight:600}.nav-ico{font-size:15px;width:18px;text-align:center}.sidebar-foot{margin-top:auto;padding:12px;border-top:1px solid var(--border-soft)}.plat-badge{font-size:11.5px;color:var(--text-mute);background:var(--panel);border:1px solid var(--border-soft);border-radius:6px;padding:6px 8px;text-align:center;font-family:var(--mono)}.main{flex:1;min-width:0;display:flex;flex-direction:column}.topbar{height:56px;display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(8px);position:sticky;top:0;z-index:20}.page-title{font-size:16px}.topbar-actions{margin-left:auto;display:flex;align-items:center;gap:8px}.menu-btn{display:none}.content{padding:20px;max-width:1220px;width:100%}.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--panel-2);color:var(--text);font-size:13.5px;font-family:inherit;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,opacity .15s}.btn:hover:not(:disabled){border-color:var(--text-mute)}.btn:disabled{opacity:.5;cursor:not-allowed}.btn-primary{background:var(--primary);border-color:var(--primary);color:#fff}.btn-primary:hover:not(:disabled){background:var(--primary-hover);border-color:var(--primary-hover)}.btn-danger{background:var(--danger);border-color:var(--danger);color:#fff}.btn-danger:hover:not(:disabled){filter:brightness(1.08)}.btn-ghost{background:transparent}.btn-ghost:hover:not(:disabled){background:var(--panel-2)}.btn-sm{padding:5px 10px;font-size:12.5px}.btn-xs{padding:3px 8px;font-size:12px;border-radius:5px}.btn-block{width:100%;padding:10px;font-size:14.5px;margin-top:4px}.btn-link{background:none;border:0;color:var(--primary);cursor:pointer;padding:2px 4px;font-size:13px;font-family:inherit}.btn-danger-text{color:var(--danger)}.icon-btn{background:none;border:0;color:var(--text-dim);cursor:pointer;font-size:16px;padding:6px 8px;border-radius:6px;line-height:1}.icon-btn:hover{background:var(--panel-2);color:var(--text)}.field{margin-bottom:15px}.label{display:block;font-size:12.5px;color:var(--text-dim);margin-bottom:6px;font-weight:500}.label .req{color:var(--danger);margin-left:2px}.form-field{margin-bottom:12px}.field-hint{font-size:12px;line-height:1.5;margin-top:4px;color:var(--text-mute)}.var-hint{display:flex;align-items:baseline;gap:6px;padding:4px 8px;border-left:2px solid var(--accent,#3b82f6);background:var(--bg-soft,rgba(59,130,246,0.06));border-radius:0 4px 4px 0}.var-hint .var-hint-tag{flex:0 0 auto;font-size:11px;font-weight:600;color:var(--accent,#3b82f6);white-space:nowrap}.var-hint .var-hint-tag::before{content:\'\u2726 \'}.kv-val{display:flex;flex-direction:column;gap:2px;flex:1 1 auto}.input,.select,.textarea{width:100%;padding:8px 11px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font:inherit;font-size:13.5px;transition:border-color .15s,box-shadow .15s}.input:focus,.select:focus,.textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)}.input::placeholder,.textarea::placeholder{color:var(--text-mute)}.input:disabled,.select:disabled{opacity:.55;cursor:not-allowed}.input.invalid,.textarea.invalid{border-color:var(--danger)}.textarea{resize:vertical;min-height:74px;font-family:var(--mono);font-size:12.5px}.select{cursor:pointer;appearance:none;padding-right:30px;background-image:linear-gradient(45deg,transparent 50%,var(--text-mute) 50%),linear-gradient(135deg,var(--text-mute) 50%,transparent 50%);background-position:right 14px center,right 9px center;background-size:5px 5px,5px 5px;background-repeat:no-repeat}.hint{font-size:12px;color:var(--text-mute);margin-top:5px}.err{font-size:12px;color:var(--danger);margin-top:5px}.hint.warn{color:var(--warn,#d97706);background:color-mix(in srgb,var(--warn,#d97706) 10%,transparent);border-left:3px solid var(--warn,#d97706);padding:8px 10px;border-radius:var(--radius-sm,6px)}.tpl-params{margin:10px 0 4px;padding:12px 14px;background:var(--bg-soft,rgba(127,127,127,.06));border-left:3px solid var(--primary,#3b82f6);border-radius:var(--radius-sm,6px)}.tpl-params>.hint{margin:0 0 10px}.tpl-params .form-field:last-child{margin-bottom:0}.row{display:flex;gap:12px;flex-wrap:wrap}.row>.field{flex:1;min-width:150px}.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 12px}.switch{display:inline-flex;align-items:center;gap:9px;cursor:pointer;user-select:none}.switch input{position:absolute;opacity:0;width:0;height:0}.switch-track{width:38px;height:21px;border-radius:11px;background:var(--border);position:relative;transition:background .18s;flex:0 0 auto}.switch-track::after{content:"";position:absolute;width:17px;height:17px;border-radius:50%;background:#fff;top:2px;left:2px;transition:transform .18s;box-shadow:0 1px 3px rgba(0,0,0,.3)}.switch input:checked+.switch-track{background:var(--primary)}.switch input:checked+.switch-track::after{transform:translateX(17px)}.switch input:disabled+.switch-track{opacity:.5}.switch-label{font-size:13.5px}.radio-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.radio-card{display:flex;gap:9px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;background:var(--panel-2);transition:border-color .15s,background .15s}.radio-card:hover{border-color:var(--text-mute)}.radio-card.checked{border-color:var(--primary);background:var(--primary-soft)}.radio-card input{margin-top:3px;accent-color:var(--primary);flex:0 0 auto}.radio-card-body{min-width:0}.radio-card-title{font-size:13.5px;font-weight:600}.radio-card-desc{font-size:12px;color:var(--text-dim);margin-top:2px;line-height:1.45}.check-tags{display:flex;flex-wrap:wrap;gap:6px}.check-tag{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid var(--border);border-radius:14px;cursor:pointer;font-size:12.5px;background:var(--panel-2);user-select:none;transition:border-color .15s,background .15s,color .15s}.check-tag:hover{border-color:var(--text-mute)}.check-tag.checked{border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}.check-tag input{display:none}.quick-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.range-row{display:flex;align-items:center;gap:11px}.range-row input[type=range]{flex:1;accent-color:var(--primary);cursor:pointer}.range-val{min-width:40px;text-align:right;font-family:var(--mono);font-size:13px}.kv-list{display:flex;flex-direction:column;gap:6px}.kv-row{display:flex;gap:6px;align-items:flex-start}.kv-row>.btn{align-self:center}.kv-row .input{flex:1;min-width:0}.kv-row .input.kv-k{flex:0 0 34%}.card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:16px}.card+.card{margin-top:14px}.card-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}.card-title{font-size:14.5px}.card-sub{font-size:12.5px;color:var(--text-dim);margin-top:3px}.section{margin-bottom:22px}.section:last-child{margin-bottom:0}.section-title{font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;padding-bottom:7px;margin-bottom:12px;border-bottom:1px solid var(--border-soft)}.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;margin-bottom:16px}.stat-card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px}.stat-label{font-size:12.5px;color:var(--text-dim);display:flex;align-items:center;gap:5px}.stat-value{font-size:25px;font-weight:700;margin-top:7px;line-height:1.15;letter-spacing:-.4px}.stat-unit{font-size:13px;font-weight:500;color:var(--text-dim);margin-left:3px}.stat-foot{font-size:11.5px;color:var(--text-mute);margin-top:5px}.bars{display:flex;flex-direction:column;gap:9px}.bar-item{display:grid;grid-template-columns:62px 1fr 96px;align-items:center;gap:10px}.bar-label{font-family:var(--mono);font-size:12.5px;color:var(--text-dim)}.bar-track{height:9px;background:var(--bg-soft);border-radius:5px;overflow:hidden;border:1px solid var(--border-soft)}.bar-fill{height:100%;border-radius:5px;background:var(--primary);transition:width .45s cubic-bezier(.3,.9,.4,1);min-width:2px}.bar-fill.s2{background:var(--success)}.bar-fill.s3{background:var(--info)}.bar-fill.s4{background:var(--warn)}.bar-fill.s5{background:var(--danger)}.bar-value{font-size:12.5px;color:var(--text-dim);text-align:right;font-family:var(--mono)}.table-wrap{overflow-x:auto;margin:0 -16px -16px;padding:0 16px 16px}.table{width:100%;border-collapse:collapse;font-size:13.5px}.table th,.table td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border-soft)}.table th{font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}.table tbody tr:last-child td{border-bottom:0}.table tbody tr:hover{background:var(--panel-2)}.table .col-actions{text-align:right;white-space:nowrap}.table .cell-main{font-weight:600}.badge{display:inline-block;padding:2px 8px;border-radius:11px;font-size:11.5px;font-weight:500;background:var(--panel-2);border:1px solid var(--border);color:var(--text-dim)}.badge-on{color:var(--success);border-color:color-mix(in srgb,var(--success) 40%,transparent);background:color-mix(in srgb,var(--success) 12%,transparent)}.badge-off{color:var(--text-mute)}.badge-warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,transparent);background:color-mix(in srgb,var(--warn) 12%,transparent)}.badge-danger{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 40%,transparent);background:color-mix(in srgb,var(--danger) 12%,transparent)}.badge-info{color:var(--info);border-color:color-mix(in srgb,var(--info) 40%,transparent);background:color-mix(in srgb,var(--info) 12%,transparent)}.badge-single{color:var(--text-mute);border-color:color-mix(in srgb,var(--text-mute) 35%,transparent);background:color-mix(in srgb,var(--text-mute) 10%,transparent)}.badge-pool{color:var(--info);border-color:color-mix(in srgb,var(--info) 45%,transparent);background:color-mix(in srgb,var(--info) 14%,transparent)}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}.dot-up{background:var(--success);box-shadow:0 0 0 3px color-mix(in srgb,var(--success) 20%,transparent)}.dot-down{background:var(--danger);box-shadow:0 0 0 3px color-mix(in srgb,var(--danger) 20%,transparent)}.dot-unknown{background:var(--text-mute)}.sync-subpanel{margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--panel-2)}.sync-subpanel+.sync-subpanel{margin-top:16px}.section-head-inline{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.state{text-align:center;padding:46px 20px;color:var(--text-dim)}.state-ico{font-size:34px;opacity:.55}.state-title{font-size:14.5px;margin-top:10px;color:var(--text);font-weight:600}.state-text{font-size:13px;margin-top:5px}.state-act{margin-top:15px}.spinner{width:26px;height:26px;border:2.5px solid var(--border);border-top-color:var(--primary);border-radius:50%;margin:0 auto;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.skeleton{background:linear-gradient(90deg,var(--panel-2) 25%,var(--border-soft) 50%,var(--panel-2) 75%);background-size:200% 100%;animation:shimmer 1.3s infinite;border-radius:5px;height:13px}@keyframes shimmer{to{background-position:-200% 0}}.drawer-mask,.sidebar-mask,.modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;animation:fade .16s}@keyframes fade{from{opacity:0}}.drawer{position:fixed;top:0;right:0;bottom:0;width:min(860px,100%);background:var(--panel);border-left:1px solid var(--border);z-index:61;display:flex;flex-direction:column;box-shadow:var(--shadow);animation:slide-in .2s cubic-bezier(.3,.9,.4,1)}@keyframes slide-in{from{transform:translateX(22px);opacity:.4}}.drawer-head{display:flex;align-items:center;padding:15px 18px;border-bottom:1px solid var(--border);flex:0 0 auto}.drawer-head h3{font-size:15.5px;flex:1;min-width:0}.drawer-body{flex:1;overflow-y:auto;padding:22px}.drawer-foot{display:flex;align-items:center;gap:9px;padding:13px 18px;border-top:1px solid var(--border);background:var(--panel-2);flex:0 0 auto}.drawer-hint{font-size:12px;color:var(--text-mute)}.tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:18px;overflow-x:auto}.tab{padding:8px 15px;border:0;background:none;color:var(--text-dim);cursor:pointer;font-size:13.5px;font-family:inherit;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;transition:color .15s,border-color .15s}.tab:hover{color:var(--text)}.tab.active{color:var(--primary);border-bottom-color:var(--primary);font-weight:600}.item-list{display:flex;flex-direction:column;gap:9px}.item{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel-2);overflow:hidden}.item.disabled{opacity:.62}.item-head{display:flex;align-items:center;gap:8px;padding:9px 11px;cursor:pointer;user-select:none}.item-head:hover{background:var(--border-soft)}.item-caret{font-size:10px;color:var(--text-mute);transition:transform .15s;flex:0 0 auto}.item.open .item-caret{transform:rotate(90deg)}.item-title{font-size:13.5px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-meta{font-size:12px;color:var(--text-mute);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-tools{margin-left:auto;display:flex;align-items:center;gap:3px;flex:0 0 auto}.item-body{padding:13px;border-top:1px solid var(--border);background:var(--panel)}.empty-inline{text-align:center;padding:22px;color:var(--text-mute);font-size:13px;border:1px dashed var(--border);border-radius:var(--radius-sm)}.alert{display:flex;gap:9px;padding:10px 12px;border-radius:var(--radius-sm);font-size:12.5px;line-height:1.55;margin-bottom:12px;border:1px solid}.alert-warn{background:color-mix(in srgb,var(--warn) 11%,transparent);border-color:color-mix(in srgb,var(--warn) 32%,transparent);color:var(--text)}.alert-info{background:color-mix(in srgb,var(--info) 10%,transparent);border-color:color-mix(in srgb,var(--info) 30%,transparent);color:var(--text)}.alert-danger{background:var(--danger-soft);border-color:color-mix(in srgb,var(--danger) 34%,transparent);color:var(--text)}.alert-ico{flex:0 0 auto}.modal-mask{display:flex;align-items:center;justify-content:center;padding:20px;z-index:80}.modal{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px;width:100%;max-width:400px;box-shadow:var(--shadow);animation:pop .16s cubic-bezier(.3,.9,.4,1)}@keyframes pop{from{transform:scale(.96);opacity:0}}.modal-title{font-size:16px}.modal-text{color:var(--text-dim);font-size:13.5px;margin:10px 0 0;line-height:1.6}.modal-extra{margin-top:14px}.modal-foot{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.toasts{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:min(420px,calc(100% - 32px))}.toast{background:var(--panel);border:1px solid var(--border);border-left:3px solid var(--primary);border-radius:var(--radius-sm);padding:10px 14px;font-size:13.5px;box-shadow:var(--shadow);animation:toast-in .2s cubic-bezier(.3,.9,.4,1);max-width:100%;pointer-events:auto}.toast.ok{border-left-color:var(--success)}.toast.err{border-left-color:var(--danger)}.toast.warn{border-left-color:var(--warn)}.toast.hide{animation:toast-out .18s forwards}@keyframes toast-in{from{transform:translateY(-10px);opacity:0}}@keyframes toast-out{to{transform:translateY(-10px);opacity:0}}@media (max-width:860px){.sidebar{position:fixed;left:0;top:0;z-index:70;transform:translateX(-100%);transition:transform .22s cubic-bezier(.3,.9,.4,1)}.sidebar.open{transform:none}.sidebar-close{display:block}.menu-btn{display:block}.content{padding:14px}.topbar{padding:0 12px}.drawer{width:100%}.drawer-body{padding:14px}.stat-grid{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px}.stat-value{font-size:21px}.bar-item{grid-template-columns:50px 1fr 72px;gap:7px}.table th,.table td{padding:9px 8px}.kv-row{flex-wrap:wrap}.kv-row .input.kv-k{flex:1 1 100%}}@media (max-width:480px){.login-card{padding:26px 20px 20px}.radio-cards{grid-template-columns:1fr}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms !important;transition-duration:.01ms !important}}.subhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 10px;padding-bottom:7px;border-bottom:1px solid var(--border-soft);font-size:13.5px;font-weight:600;color:var(--text)}.rules-box{display:flex;flex-direction:column;gap:12px}.rule-card{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel-2);overflow:hidden}.rule-head{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--bg-soft);flex-wrap:wrap}.rule-head .field{margin-bottom:0;min-width:130px;flex:0 0 auto}.rule-card{cursor:default}.rule-grip{flex:0 0 auto;font-size:15px;line-height:1;color:var(--text-mute);cursor:grab;user-select:none;padding:0 2px;border-radius:5px}.rule-grip:hover{color:var(--primary);background:var(--panel-2)}.rule-tw{font-size:10px;color:var(--text-mute);transition:transform .15s;flex:0 0 auto}.rule-name-label{font-weight:600;font-size:14px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;min-width:0}.rule-prio-hint{font-size:11.5px;color:var(--text-mute)}.rule-card.collapsed .rule-tw{transform:rotate(0deg)}.rule-card:not(.collapsed) .rule-tw{transform:rotate(90deg)}.rule-card.collapsed .rule-detail{display:none}.rule-card:not(.collapsed) .rule-detail{display:block}.subcard{border:1px solid var(--border-soft);border-radius:var(--radius-sm);margin:10px 12px;overflow:hidden;background:var(--panel)}.subcard:last-child{margin-bottom:14px}.section-toggle{display:flex;align-items:center;gap:7px;padding:9px 12px;cursor:pointer;user-select:none;background:var(--panel-2)}.section-toggle:hover{background:var(--border-soft)}.section-toggle .tw{font-size:10px;color:var(--text-mute);transition:transform .15s}.subcard.collapsed .tw{transform:rotate(0deg)}.subcard:not(.collapsed) .tw{transform:rotate(90deg)}.section-toggle strong{font-size:13px}.section-toggle .muted{color:var(--text-mute);font-size:12px;font-weight:400}.section-toggle .op-remove{margin-left:auto;padding:2px 10px;font-size:12px;flex:none}.ops-list{display:flex;flex-direction:column;gap:12px}.rw-editor{display:flex;flex-direction:column;gap:10px}.rw-desc{font-size:12px;line-height:1.5;margin-top:-4px}.rw-fields{display:flex;flex-direction:column;gap:10px}.rw-example{font-size:12px;line-height:1.5}.rw-preview-row{display:flex;flex-direction:column;gap:10px}.rw-preview-wrap{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg-soft,#f6f7f9);border:1px dashed var(--border);border-radius:8px;padding:8px 10px}.rw-preview{font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:13px;color:var(--text);word-break:break-all}.ro-tag{flex:none;font-size:11px;line-height:1;padding:2px 6px;border-radius:4px;background:var(--bg-inset,#eceef1);color:var(--muted,#888);border:1px solid var(--border);user-select:none}.rw-examples{display:flex;flex-direction:column;gap:6px;margin-top:4px;padding:8px 10px;background:var(--bg-soft,#f6f7f9);border:1px solid var(--border);border-radius:8px}.rw-example-item{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rw-example-btn{font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;cursor:pointer;background:var(--bg);color:var(--text);border:1px solid var(--accent,#3b82f6);border-radius:6px;padding:3px 8px;line-height:1.4}.rw-example-btn:hover{background:var(--accent-soft,#eef4ff)}.section-body{padding:12px;border-top:1px solid var(--border-soft)}.subcard.collapsed .section-body{display:none}.origin-row .subcard{margin:10px 0}.origin-card{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel-2);overflow:hidden;margin:10px 0}.origin-head{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--bg-soft);flex-wrap:wrap;cursor:pointer;user-select:none}.origin-grip{flex:0 0 auto;font-size:15px;line-height:1;color:var(--text-mute);cursor:grab;user-select:none;padding:0 2px;border-radius:5px}.origin-grip:hover{color:var(--primary);background:var(--panel-2)}.origin-tw{font-size:10px;color:var(--text-mute);transition:transform .15s;flex:0 0 auto}.origin-name-label{font-weight:600;font-size:14px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;min-width:0}.origin-card.collapsed .origin-tw{transform:rotate(0deg)}.origin-card:not(.collapsed) .origin-tw{transform:rotate(90deg)}.origin-card.collapsed .origin-detail{display:none}.origin-card:not(.collapsed) .origin-detail{display:block}.origin-detail{padding:12px}.origin-detail>.field{margin-bottom:10px}.inline-origin-box{margin:6px 0 4px;padding:14px;border:1px dashed var(--border-soft);border-radius:8px;background:color-mix(in srgb,var(--bg-soft) 50%,transparent)}.inline-origin-box .origin-row{margin:8px 0}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px}.op-add{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 12px;margin-bottom:14px;background:var(--panel-2);border:1px dashed var(--border);border-radius:var(--radius-sm)}.op-add-label{font-size:13px;font-weight:600;color:var(--text)}.op-add .input{min-width:260px;flex:1;max-width:420px}.op-add .hint{margin-top:0}.seq-page .seq-pick{display:flex;align-items:center;gap:8px}.seq-pick .input{min-width:240px}.seq-flow{margin-top:16px;padding-left:8px;border-left:3px solid var(--border);display:flex;flex-direction:column;gap:0}.seq-stage{position:relative;display:flex;align-items:flex-start;gap:14px;padding:14px 16px 14px 22px;margin-left:14px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:-1px}.seq-stage::before{content:\'\';position:absolute;left:-15px;top:-16px;bottom:50%;width:2px;background:var(--border)}.seq-stage:first-child::before{display:none}.seq-icon{flex:0 0 auto;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--panel-2);border:1px solid var(--border);border-radius:50%}.seq-main{flex:1 1 auto;min-width:0}.seq-title{display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;color:var(--text);margin-bottom:4px}.seq-summary{font-size:13px;color:var(--muted);line-height:1.5;word-break:break-word}.seq-note{font-size:12px;line-height:1.5;margin-bottom:4px;color:var(--text-mute);word-break:break-word}.seq-owner{margin-top:6px;font-size:11px;color:var(--muted);opacity:.8;font-style:italic}.seq-group{position:relative;display:flex;align-items:flex-start;gap:10px;margin:18px 0 2px -15px;padding:6px 12px 6px 14px}.seq-group-no{flex:0 0 auto;font-size:13px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);border-radius:6px;padding:2px 8px;line-height:20px}.seq-group-main{min-width:0}.seq-group-title{font-size:14px;font-weight:700;color:var(--text)}.seq-group-desc{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.5}.seq-substeps{margin:2px 0 6px 52px;padding:10px 14px;border-left:2px dashed var(--border);display:flex;flex-direction:column;gap:6px}.seq-substep{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}.seq-substep-t{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap}.seq-substep-d{font-size:12px;color:var(--muted)}.frag-note{border-left:3px solid var(--accent);padding-left:10px;margin-bottom:12px}.seq-badge{font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;line-height:18px;white-space:nowrap}.seq-badge.on{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}.seq-badge.off{background:var(--panel-2);color:var(--muted);border:1px solid var(--border)}.seq-go{flex:0 0 auto;align-self:center;font-size:12px;font-weight:600;color:var(--accent);white-space:nowrap}.seq-stage.clickable{cursor:pointer;transition:border-color .15s,transform .05s}.seq-stage.clickable:hover{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,var(--panel))}.seq-stage.clickable:active{transform:scale(.997)}.seq-stage.disabled{opacity:.55}.seq-rule{border-left:3px solid var(--accent)}.seq-rule-list{margin:2px 0 6px 26px;display:flex;flex-direction:column;gap:8px}.seq-rule-inpack{border-left:3px solid var(--border);background:color-mix(in srgb,var(--panel-2) 40%,transparent)}.seq-rule-head{display:flex;align-items:center;gap:10px;margin-bottom:4px}.seq-rule-prio{font-size:11px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);padding:1px 7px;border-radius:5px}.seq-rule-name{font-weight:600;font-size:15px;color:var(--text)}.seq-subs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.seq-chip{font-size:12px;padding:2px 9px;background:var(--panel-2);color:var(--text-2);border:1px solid var(--border);border-radius:999px}.flash-anchor{animation:flashAnchor 1.6s ease-out;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 45%,transparent)}@keyframes flashAnchor{0%{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 55%,transparent)}100%{box-shadow:0 0 0 3px transparent}}.seq-rule-drag{cursor:grab}.seq-rule-drag .seq-grip{flex:0 0 auto;align-self:center;font-size:15px;line-height:1;color:var(--muted);cursor:grab;user-select:none;padding:0 2px;border-radius:5px}.seq-rule-drag .seq-grip:hover{color:var(--accent);background:var(--panel-2)}.seq-rule-drag.dragging{opacity:.4;cursor:grabbing}.seq-rule-drag.drop-before{box-shadow:inset 0 3px 0 0 var(--accent)}.seq-rule-drag.drop-after{box-shadow:inset 0 -3px 0 0 var(--accent)}.seq-rule-head .seq-grip+.seq-rule-prio{margin-left:0}.seq-site-head{position:relative;margin:18px 0 4px 14px;padding:10px 14px;background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:6px}.seq-site-head:first-of-type{margin-top:4px}.seq-site-name{font-weight:700;font-size:16px;color:var(--text);word-break:break-all}.seq-site-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.seq-site-go{margin-left:auto}.seq-site-click{position:absolute;inset:0;cursor:pointer}.seq-site-head:hover{border-color:var(--accent)}.section>.section-title{color:var(--accent)}.check-row{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}.check{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border:1px solid var(--border);border-radius:14px;cursor:pointer;font-size:12.5px;background:var(--panel-2);user-select:none;transition:border-color .15s,background .15s,color .15s}.check:hover{border-color:var(--text-mute)}.check input{accent-color:var(--primary);margin:0}.check:has(input:checked){border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}.kv-label{font-size:12px;color:var(--text-dim);margin:8px 0 5px}.header-editor{display:flex;flex-direction:column}.header-editor .btn{align-self:flex-start;margin-top:6px}.header-editor .kv-row .hk{flex:0 0 36%}.header-editor .kv-row .hv{flex:1;min-width:0}.muted{color:var(--text-mute);font-size:12px}.check .muted{margin-left:2px}.cond-groups{display:flex;flex-direction:column;gap:10px;margin:10px 0}.cond-group{border:1px dashed var(--border);border-radius:var(--radius-sm);padding:10px;background:var(--panel);position:relative}.cond-group+.cond-group{margin-top:14px}.cond-group+.cond-group::before{content:\'\u6216 (OR)\';position:absolute;top:-9px;left:12px;padding:0 6px;font-size:11px;color:var(--text-mute);background:var(--panel-2);border-radius:8px}.cond-group-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.cond-group-head .badge{font-size:11px;padding:2px 7px;border-radius:8px;background:var(--primary-soft);color:var(--primary)}.cond-rows{display:flex;flex-direction:column;gap:6px}.cond-row{display:grid;grid-template-columns:minmax(120px,1.1fr) minmax(0,0.9fr) minmax(110px,1fr) minmax(0,1.6fr) auto auto;gap:6px;align-items:flex-start}.cond-row>.btn,.cond-row>.check,.cond-row>label.check-wrap{align-self:center}.cond-row .input{min-width:0}.cond-cell{min-width:0}.cond-row .check{padding:4px 8px}.ext-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.ext-chip{font-size:11px;line-height:1;padding:3px 7px;border:1px solid var(--border,#d0d7de);border-radius:999px;background:var(--bg-soft,#f3f4f6);color:var(--text,#333);cursor:pointer;white-space:nowrap}.ext-chip:hover{border-color:var(--accent,#3b82f6);color:var(--accent,#3b82f6)}.ext-chip:active{transform:scale(.94)}.ms-trigger-wrap{margin-top:6px}.ms-trigger{display:flex;align-items:center;gap:6px;width:100%;padding:0 8px 0 0;font-size:13px;font-family:inherit;color:var(--text,#1f2937);background:var(--bg,#fff);border:1px solid var(--border,#d0d7de);border-radius:8px;cursor:text;transition:border-color .15s,box-shadow .15s,background .15s}.ms-trigger:hover{border-color:var(--accent,#3b82f6)}.ms-trigger.is-open{border-color:var(--accent,#3b82f6);box-shadow:0 0 0 3px rgba(59,130,246,.15)}.ms-combobox-input{flex:1 1 auto;min-width:0;border:none !important;background:transparent !important;box-shadow:none !important;padding:7px 10px;font-size:13px;font-family:inherit;color:var(--text,#1f2937);outline:none}.ms-combobox-input::placeholder{color:var(--text-muted,#6b7280)}.ms-caret{color:var(--text-muted,#6b7280);transition:transform .18s ease;flex:none;cursor:pointer;padding:7px 2px}.ms-trigger.is-open .ms-caret{transform:rotate(180deg)}.ms-panel{z-index:9999;max-height:320px;overflow-y:auto;padding:8px;background:var(--bg,#fff);border:1px solid var(--border,#d0d7de);border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.18);animation:ms-pop .14s ease}@keyframes ms-pop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}.ms-group{padding:4px 2px}.ms-group+.ms-group{margin-top:4px;border-top:1px solid var(--border,#eef0f3);padding-top:8px}.ms-group-label{font-size:11px;font-weight:600;color:var(--text-muted,#6b7280);letter-spacing:.03em;margin:2px 4px 6px}.ms-opts{display:flex;flex-wrap:wrap;gap:6px}.ms-opt{font-size:12px;font-family:inherit;padding:5px 10px;border:1px solid var(--border,#d0d7de);border-radius:8px;background:var(--bg-soft,#f3f4f6);color:var(--text,#1f2937);cursor:pointer;white-space:nowrap;transition:transform .12s,border-color .12s,background .12s,color .12s,box-shadow .12s}.ms-opt:hover{border-color:var(--accent,#3b82f6);color:var(--accent,#2563eb);transform:translateY(-1px)}.ms-opt:active{transform:scale(.95)}.ms-opt.is-selected{background:linear-gradient(135deg,var(--accent,#3b82f6),#2563eb);border-color:transparent;color:#fff;box-shadow:0 2px 8px rgba(37,99,235,.35)}.ms-opt.is-selected:hover{color:#fff}@media (max-width:720px){.cond-row{grid-template-columns:1fr 1fr}}.rules-box textarea.input{resize:vertical;font-family:inherit}</style>\n</head><body><div id="view-login" class="login-wrap"><form class="login-card" id="login-form" novalidate><div class="login-logo">\u26A1</div><h1 class="login-title">EdgeCDN \u63A7\u5236\u53F0</h1><p class="login-sub">\u8BF7\u8F93\u5165\u7BA1\u7406\u5BC6\u7801\u4EE5\u7EE7\u7EED</p><div class="field"><label class="label" for="login-pwd">\u7BA1\u7406\u5BC6\u7801</label><div class="pwd-box"><input class="input" id="login-pwd" type="password" autocomplete="current-password" placeholder="\u8BF7\u8F93\u5165\u5BC6\u7801" spellcheck="false"><button class="pwd-eye" type="button" id="login-eye" title="\u663E\u793A/\u9690\u85CF\u5BC6\u7801" aria-label="\u663E\u793A\u6216\u9690\u85CF\u5BC6\u7801">\u{1F441}</button></div><div class="err" id="login-err" hidden></div></div><button class="btn btn-primary btn-block" type="submit" id="login-btn">\u767B \u5F55</button><p class="login-foot">\u4F1A\u8BDD\u901A\u8FC7 HttpOnly Cookie \u4FDD\u6301\uFF0C\u8BF7\u52FF\u5728\u516C\u5171\u8BBE\u5907\u4E0A\u4FDD\u5B58\u5BC6\u7801</p></form></div><div id="view-app" class="app" hidden><aside class="sidebar" id="sidebar"><div class="brand"><span class="brand-logo">\u26A1</span><span class="brand-text">EdgeCDN</span><button class="icon-btn sidebar-close" id="sidebar-close" aria-label="\u5173\u95ED\u83DC\u5355">\u2715</button></div><nav class="nav" id="nav"><a class="nav-item" href="#/overview"><span class="nav-ico">\u{1F4CA}</span><span>\u6982\u89C8</span></a><a class="nav-item" href="#/sites"><span class="nav-ico">\u{1F310}</span><span>\u7AD9\u70B9\u7BA1\u7406</span></a><a class="nav-item" href="#/sequence"><span class="nav-ico">\u{1F6F0}\uFE0F</span><span>\u6D41\u91CF\u5E8F\u5217</span></a><a class="nav-item" href="#/pools"><span class="nav-ico">\u{1F5C4}\uFE0F</span><span>\u6E90\u7AD9</span></a><a class="nav-item" href="#/cache"><span class="nav-ico">\u{1F9F9}</span><span>\u7F13\u5B58\u7BA1\u7406</span></a><a class="nav-item" href="#/system"><span class="nav-ico">\u2699\uFE0F</span><span>\u7CFB\u7EDF\u8BBE\u7F6E</span></a></nav><div class="sidebar-foot"><div class="plat-badge" id="plat-badge">\u68C0\u6D4B\u4E2D\u2026</div></div></aside><div class="sidebar-mask" id="sidebar-mask" hidden></div><div class="main"><header class="topbar"><button class="icon-btn menu-btn" id="menu-btn" aria-label="\u6253\u5F00\u83DC\u5355">\u2630</button><h2 class="page-title" id="page-title">\u6982\u89C8</h2><div class="topbar-actions"><button class="icon-btn" id="theme-btn" title="\u5207\u6362\u4E3B\u9898" aria-label="\u5207\u6362\u4E3B\u9898">\u{1F313}</button><button class="btn btn-ghost btn-sm" id="logout-btn">\u9000\u51FA</button></div></header><main class="content" id="content"></main></div></div><div class="drawer-mask" id="drawer-mask" hidden></div><aside class="drawer" id="drawer" hidden aria-modal="true" role="dialog"><header class="drawer-head"><h3 id="drawer-title">\u7F16\u8F91</h3><button class="icon-btn" id="drawer-close" aria-label="\u5173\u95ED">\u2715</button></header><div class="drawer-body" id="drawer-body"></div><footer class="drawer-foot"><span class="drawer-hint" id="drawer-hint"></span><div class="grow"></div><button class="btn btn-ghost" id="drawer-cancel">\u53D6\u6D88</button><button class="btn btn-primary" id="drawer-save">\u4FDD\u5B58</button></footer></aside><div class="modal-mask" id="confirm-mask" hidden><div class="modal" role="alertdialog" aria-modal="true"><h3 class="modal-title" id="confirm-title">\u786E\u8BA4\u64CD\u4F5C</h3><p class="modal-text" id="confirm-text"></p><div class="modal-extra" id="confirm-extra" hidden><label class="label" id="confirm-extra-label">\u8BF7\u8F93\u5165\u540D\u79F0\u4EE5\u786E\u8BA4</label><input class="input" id="confirm-input" spellcheck="false" autocomplete="off"></div><div class="modal-foot"><button class="btn btn-ghost" id="confirm-cancel">\u53D6\u6D88</button><button class="btn btn-danger" id="confirm-ok">\u786E\u8BA4\u5220\u9664</button></div></div></div><div class="toasts" id="toasts" aria-live="polite"></div> <script>(()=>{var ke=class extends Error{constructor(n,s,o,a){super(s||n||"\\u8BF7\\u6C42\\u5931\\u8D25"),this.name="ApiError",this.code=n||"INTERNAL",this.status=o||0,this.data=a||null}};function kt(){let t=typeof window<"u"&&window.__BASE__||"";if(!t){let n=location.pathname.split("/").filter(Boolean)[0];t=n?"/"+n:""}return t&&!t.startsWith("/")&&(t="/"+t),t.replace(/\\/$/,"")+"/api"}async function Re(t,n={}){let{method:s="GET",body:o,query:a,raw:l=!1}=n,d=kt()+t;if(a){let f=new URLSearchParams;for(let[c,m]of Object.entries(a))m!=null&&m!==""&&f.set(c,String(m));let r=f.toString();r&&(d+="?"+r)}let i={method:s,credentials:"same-origin",headers:{Accept:"application/json"}};o!==void 0&&(i.headers["Content-Type"]="application/json",i.body=JSON.stringify(o));let h;try{h=await fetch(d,i)}catch{throw new ke("NETWORK","\\u7F51\\u7EDC\\u8FDE\\u63A5\\u5931\\u8D25\\uFF0C\\u8BF7\\u68C0\\u67E5\\u7F51\\u7EDC\\u540E\\u91CD\\u8BD5",0)}if(l){if(!h.ok)throw await en(h);return h}let p=null,g=await h.text();if(g)try{p=JSON.parse(g)}catch{p=null}if(!h.ok||!p||p.ok!==!0){let f=p&&p.error?p.error:{},r=new ke(f.code||ut(h.status),f.message||dt(h.status),h.status,p&&p.data?p.data:null);if(h.status===429){let c=h.headers.get("Retry-After");r.retryAfter=Number(c)||r.data&&r.data.retryAfter||0}throw r}return p.data}async function en(t){let n=null;try{n=await t.json()}catch{}let s=n&&n.error||{};return new ke(s.code||ut(t.status),s.message||dt(t.status),t.status)}function ut(t){return t===401?"UNAUTHORIZED":t===403?"FORBIDDEN":t===404?"NOT_FOUND":t===400?"BAD_REQUEST":t===409?"CONFLICT":t===429?"RATE_LIMITED":"INTERNAL"}function dt(t){return{400:"\\u8BF7\\u6C42\\u53C2\\u6570\\u6709\\u8BEF",401:"\\u767B\\u5F55\\u5DF2\\u5931\\u6548\\uFF0C\\u8BF7\\u91CD\\u65B0\\u767B\\u5F55",403:"\\u6CA1\\u6709\\u6743\\u9650\\u6267\\u884C\\u8BE5\\u64CD\\u4F5C",404:"\\u8BF7\\u6C42\\u7684\\u8D44\\u6E90\\u4E0D\\u5B58\\u5728",409:"\\u8D44\\u6E90\\u51B2\\u7A81\\uFF0C\\u53EF\\u80FD\\u5DF2\\u5B58\\u5728\\u540C\\u540D\\u9879",429:"\\u64CD\\u4F5C\\u8FC7\\u4E8E\\u9891\\u7E41\\uFF0C\\u8BF7\\u7A0D\\u540E\\u518D\\u8BD5",500:"\\u670D\\u52A1\\u5668\\u5185\\u90E8\\u9519\\u8BEF",503:"\\u5B58\\u50A8\\u670D\\u52A1\\u4E0D\\u53EF\\u7528\\uFF0C\\u8BF7\\u68C0\\u67E5 KV \\u7ED1\\u5B9A"}[t]||"\\u8BF7\\u6C42\\u5931\\u8D25\\uFF08HTTP "+t+"\\uFF09"}var ee=(t,n)=>Re(t,{method:"GET",query:n}),Ae=(t,n)=>Re(t,{method:"PUT",body:n}),xe=(t,n)=>Re(t,{method:"POST",body:n}),Ct=t=>Re(t,{method:"DELETE"}),tn={ApiError:ke,base:kt,auth:{login:t=>xe("/auth/login",{password:t}),logout:()=>xe("/auth/logout",{}),me:()=>ee("/auth/me"),changePassword:(t,n)=>xe("/auth/password",{oldPassword:t,newPassword:n})},sites:{list:()=>ee("/sites"),templates:()=>ee("/sites/templates"),get:t=>ee("/sites/"+encodeURIComponent(t)),save:(t,n)=>Ae("/sites/"+encodeURIComponent(t),n),remove:t=>Ct("/sites/"+encodeURIComponent(t)),saveBasics:(t,n)=>Ae("/sites/"+encodeURIComponent(t)+"/basics",n),saveRules:(t,n)=>Ae("/sites/"+encodeURIComponent(t)+"/rules",{rules:n}),saveSecurity:(t,n)=>Ae("/sites/"+encodeURIComponent(t)+"/security",{security:n})},pools:{list:()=>ee("/pools"),get:t=>ee("/pools/"+encodeURIComponent(t)),save:(t,n)=>t?Ae("/pools/"+encodeURIComponent(t),n):xe("/pools",n),create:t=>xe("/pools",t),remove:t=>Ct("/pools/"+encodeURIComponent(t))},cache:{purge:t=>xe("/cache/purge",t)},stats:{overview:()=>ee("/stats/overview"),host:(t,n=24)=>ee("/stats/host/"+encodeURIComponent(t),{hours:n})},system:{info:()=>ee("/system/info"),export:()=>Re("/system/export",{method:"GET",raw:!0}),import:t=>xe("/system/import",t)},sync:{open:t=>xe("/system/sync/open",t?{ttl:t}:{}),close:()=>xe("/system/sync/close",{}),status:()=>ee("/system/sync/status"),push:async(t,n,s,o,a)=>{let l=(n||"").replace(/^\\/+|\\/+$/g,""),d=l?"/"+l:"",i=`${t.replace(/\\/+$/,"")}${d}/api/system/sync/receive`,h={method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({code:s,password:o,payload:a})},p;try{p=await fetch(i,h)}catch{throw new ke("NETWORK","\\u65E0\\u6CD5\\u8FDE\\u63A5\\u63A5\\u6536\\u65B9\\uFF0C\\u8BF7\\u68C0\\u67E5 URL \\u4E0E\\u7F51\\u7EDC",0)}let g=null,f=await p.text();if(f)try{g=JSON.parse(f)}catch{g=null}if(!p.ok||!g||g.ok!==!0){let r=g&&g.error?g.error:{};throw new ke(r.code||ut(p.status),r.message||dt(p.status),p.status)}return g.data}},config:{get:()=>ee("/config/global"),save:t=>Ae("/config/global",t)},kv:{ping:()=>ee("/kv/ping"),list:t=>ee("/kv"+(t?"?prefix="+encodeURIComponent(t):"")),get:t=>ee("/kv/"+encodeURIComponent(t)),put:(t,n,s)=>Re("/kv/"+encodeURIComponent(t)+(s?"?ttl="+encodeURIComponent(s):""),{method:"PUT",headers:{"content-type":"text/plain"},body:n}),del:t=>Re("/kv/"+encodeURIComponent(t),{method:"DELETE"})},rules:{global:()=>ee("/rules/global"),saveGlobal:t=>Ae("/rules/global",t)}};typeof window<"u"&&(window.API=tn);function Hn(t){return String(t??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\'/g,"&#39;")}function e(t,n,s){let o=String(t||"div").toLowerCase(),a=document.createElement(o);if(n)for(let l in n){if(!Object.prototype.hasOwnProperty.call(n,l))continue;let d=n[l];d==null||d===!1||(l==="class"?a.className=d:l==="text"||l==="html"?a.textContent=d:l.startsWith("on")&&typeof d=="function"?a.addEventListener(l.slice(2),d):a.setAttribute(l,d===!0?"":String(d)))}return s!=null&&Et(a,s),a}function Et(t,n){(Array.isArray(n)?n:[n]).forEach(s=>{s!=null&&(typeof s=="string"||typeof s=="number"?t.appendChild(document.createTextNode(String(s))):s instanceof Node&&t.appendChild(s))})}function ae(t){for(;t&&t.firstChild;)t.removeChild(t.firstChild)}function In(t){let n=document.createDocumentFragment();return Et(n,t||[]),n}function S(t,n){return n?n.querySelector(t):typeof t=="string"?document.getElementById(t):t}function Ln(t,n){t.innerHTML=n}var nn=["rewrite","redirect","terminate","reqHeaders","origin","cache","respHeaders"],pt={"\\u2464":"rewrite","\\u2465":"redirect","\\u2466":"terminate","\\u2467":"reqHeaders","\\u2468":"origin","\\u246A":"cache","\\u246F":"respHeaders"};function ht(t){return t?V[t]?t:pt[t]?pt[t]:null:null}var V={rewrite:{title:"URL \\u91CD\\u5199",en:"rewrite",owner:"\\u8DEF\\u7531\\u89C4\\u5219\\u62BD\\u5C49 \\xB7 URL \\u91CD\\u5199",icon:"\\u2702\\uFE0F",order:1,allowedOps:["rewrite"],hideTargetPool:!0},redirect:{title:"\\u91CD\\u5B9A\\u5411\\u89C4\\u5219",en:"redirect",owner:"\\u8DEF\\u7531\\u89C4\\u5219\\u62BD\\u5C49 \\xB7 \\u91CD\\u5B9A\\u5411",icon:"\\u21AA\\uFE0F",order:2,allowedOps:["redirect"],hideTargetPool:!0},terminate:{title:"\\u5F3A\\u5236 HTTPS / \\u76F4\\u63A5\\u54CD\\u5E94\\uFF08\\u7EC8\\u6B62\\u578B\\uFF09",en:"terminate",owner:"\\u8DEF\\u7531\\u89C4\\u5219\\u62BD\\u5C49 \\xB7 \\u5F3A\\u5236HTTPS / \\u76F4\\u63A5\\u54CD\\u5E94",icon:"\\u{1F512}",order:3,allowedOps:["forceHttps","directResponse"],hideTargetPool:!0},reqHeaders:{title:"\\u4FEE\\u6539\\u8BF7\\u6C42\\u5934",en:"reqHeaders",owner:"\\u8DEF\\u7531\\u89C4\\u5219\\u62BD\\u5C49 \\xB7 \\u4FEE\\u6539\\u8BF7\\u6C42\\u5934",icon:"\\u{1F4E4}",order:4,allowedOps:["reqHeaders"],hideTargetPool:!0},origin:{title:"Origin Rules\\uFF08\\u56DE\\u6E90\\u89C4\\u5219\\uFF09",en:"origin",owner:"\\u8DEF\\u7531\\u89C4\\u5219\\u62BD\\u5C49 \\xB7 Origin Rules",icon:"\\u{1F500}",order:5,allowedOps:["hostHeader","originConn","targetPool","clientIp","followRedirect","originTimeout"],hideTargetPool:!1},cache:{title:"Cache Rules\\uFF08\\u7F13\\u5B58\\u89C4\\u5219\\uFF09",en:"cache",owner:"\\u8DEF\\u7531\\u89C4\\u5219\\u62BD\\u5C49 \\xB7 Cache Rules\\uFF08\\u7F13\\u5B58\\u7B56\\u7565\\uFF09",icon:"\\u{1F4E5}",order:6,allowedOps:["cache"],hideTargetPool:!0},respHeaders:{title:"\\u6539\\u5199\\u54CD\\u5E94\\u5934 / Response Cache Rule",en:"respHeaders",owner:"\\u8DEF\\u7531\\u89C4\\u5219\\u62BD\\u5C49 \\xB7 \\u6539\\u5199\\u54CD\\u5E94\\u5934 / Response Cache Rule",icon:"\\u{1F4DD}",order:7,allowedOps:["respHeaders"],hideTargetPool:!0}},sn=["match","security","error"],Pe={match:{title:"\\u5339\\u914D\\u7AD9\\u70B9\\uFF08\\u5168\\u7AD9\\u9ED8\\u8BA4\\uFF09",en:"match",owner:"\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u7F16\\u8F91\\u5668 \\xB7 \\u5339\\u914D\\u7AD9\\u70B9",icon:"\\u{1F6F0}\\uFE0F",order:1,globalOnly:!0,fields:[]},security:{title:"\\u5B89\\u5168\\u6821\\u9A8C\\uFF08\\u5168\\u7AD9\\u9ED8\\u8BA4\\uFF09",en:"security",owner:"\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u7F16\\u8F91\\u5668 \\xB7 \\u5B89\\u5168\\u6821\\u9A8C",icon:"\\u{1F6A7}",order:2,globalOnly:!0,fields:[{path:"rateLimitRpm",label:"\\u9ED8\\u8BA4\\u9650\\u901F\\uFF08\\u6B21/\\u5206\\u949F\\uFF09",type:"number",min:0,max:1e6,hint:"\\u7AD9\\u70B9\\u672A\\u5355\\u72EC\\u8BBE\\u7F6E\\u9650\\u901F\\u65F6\\u4F7F\\u7528\\u6B64\\u503C\\uFF1B0 \\u8868\\u793A\\u4E0D\\u9650\\u901F\\u3002"},{path:"rlTtlSec",label:"\\u8BA1\\u6570\\u5B58\\u6D3B\\u65F6\\u957F\\uFF08\\u79D2\\uFF09",type:"number",min:1,max:86400,hint:"\\u9650\\u901F\\u8BA1\\u6570\\u69FD\\u7684\\u5B58\\u6D3B\\u79D2\\u6570\\uFF0C\\u4E00\\u822C\\u4E3A\\u9650\\u901F\\u7A97\\u53E3\\u7684 2 \\u500D\\u3002"},{path:"remoteSyncIntervalMs",label:"\\u591A\\u8282\\u70B9\\u540C\\u6B65\\u95F4\\u9694\\uFF08\\u6BEB\\u79D2\\uFF09",type:"number",min:1e3,max:6e5,hint:"\\u5404\\u8FB9\\u7F18\\u8282\\u70B9\\u628A\\u672C\\u5730\\u9650\\u901F\\u8BA1\\u6570\\u540C\\u6B65\\u5230\\u8FDC\\u7AEF\\u7684\\u95F4\\u9694\\u3002\\u8D8A\\u5C0F\\u8D8A\\u51C6\\u3001\\u6210\\u672C\\u8D8A\\u9AD8\\u3002"},{path:"memMaxEntries",label:"\\u5185\\u5B58\\u8BA1\\u6570\\u8868\\u4E0A\\u9650\\uFF08\\u6761\\uFF09",type:"number",min:100,max:1e6,hint:"\\u9650\\u901F\\u5185\\u5B58\\u8868\\u6700\\u5927\\u6761\\u76EE\\u6570\\uFF0C\\u9632\\u6B62\\u8282\\u70B9\\u5185\\u5B58\\u65E0\\u9650\\u589E\\u957F\\u3002"}]},error:{title:"\\u9519\\u8BEF\\u5904\\u7406 / \\u62E6\\u622A\\u54CD\\u5E94\\uFF08\\u5168\\u7AD9\\u9ED8\\u8BA4\\uFF09",en:"error",owner:"\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u7F16\\u8F91\\u5668 \\xB7 \\u9519\\u8BEF\\u5904\\u7406",icon:"\\u{1F6D1}",order:3,globalOnly:!0,fields:[{path:"blockBody",label:"\\u62E6\\u622A\\u54CD\\u5E94\\u4F53",type:"textarea",hint:"\\u88AB\\u5B89\\u5168\\u89C4\\u5219\\u62E6\\u622A\\uFF08403\\uFF09\\u65F6\\u8FD4\\u56DE\\u7684\\u5185\\u5BB9\\u3002\\u53EF\\u586B\\u7EAF\\u6587\\u672C\\u6216\\u5B8C\\u6574 HTML \\u81EA\\u5B9A\\u4E49\\u9519\\u8BEF\\u9875\\u3002"},{path:"blockCacheControl",label:"\\u62E6\\u622A\\u54CD\\u5E94 Cache-Control",type:"text",hint:"\\u62E6\\u622A\\u7ED3\\u679C\\u4E0D\\u5E94\\u88AB\\u7F13\\u5B58\\uFF0C\\u5EFA\\u8BAE\\u4FDD\\u6301 no-store\\u3002"},{path:"messages.internal",label:"500 \\u6587\\u6848",type:"text",hint:"\\u7F51\\u5173\\u5185\\u90E8\\u9519\\u8BEF\\u65F6\\u8FD4\\u56DE\\u7684\\u6587\\u6848\\u3002"},{path:"messages.noOrigin",label:"\\u65E0\\u53EF\\u7528\\u6E90\\u7AD9\\u6587\\u6848",type:"text",hint:"\\u7AD9\\u70B9\\u672A\\u914D\\u7F6E\\u6E90\\u7AD9\\u65F6\\u8FD4\\u56DE\\u7684\\u6587\\u6848\\u3002"},{path:"messages.configError",label:"\\u914D\\u7F6E\\u9519\\u8BEF\\u6587\\u6848",type:"text",hint:"\\u914D\\u7F6E\\u6821\\u9A8C\\u5931\\u8D25\\u65F6\\u8FD4\\u56DE\\u7684\\u6587\\u6848\\u3002"}]}};function mt(t){return Object.prototype.hasOwnProperty.call(Pe,t)}function et(t){return t=Number(t)||0,t>=1e9?(t/1e9).toFixed(2)+" GB":t>=1e6?(t/1e6).toFixed(2)+" MB":t>=1e3?(t/1e3).toFixed(2)+" KB":String(t)+" B"}var Ge=t=>t==null||isNaN(t)?"0%":(t*100).toFixed(1)+"%",On=t=>t?new Date(t).toLocaleString():"-";function _n(t){return Number.isFinite(t)?t<0?"\\u3000\\u5F53\\u524D\\uFF1A\\u8DDF\\u968F\\u6E90\\u7AD9\\uFF0C\\u4E0D\\u6539\\u5199":t===0?"\\u3000\\u5F53\\u524D\\uFF1A0\\uFF08\\u4E0D\\u7F13\\u5B58\\uFF09":t<60?`\\u3000\\u5F53\\u524D\\uFF1A${t} \\u79D2`:t<3600?`\\u3000\\u5F53\\u524D\\uFF1A\\u2248 ${(t/60).toFixed(t%60?1:0)} \\u5206\\u949F`:t<86400?`\\u3000\\u5F53\\u524D\\uFF1A\\u2248 ${(t/3600).toFixed(t%3600?1:0)} \\u5C0F\\u65F6`:`\\u3000\\u5F53\\u524D\\uFF1A\\u2248 ${(t/86400).toFixed(t%86400?1:0)} \\u5929`:""}function je(t,n){return e("div",{class:"card"},[e("div",{class:"card-label"},t),e("div",{class:"card-value"},n)])}function Se(t){if(!t)return"\\u672A\\u8BBE\\u7F6E";let n=D.pools.find(s=>s.id===t);return n&&(n.name||n.id)||t}function ge(t){return ht(t&&t.stage)||null}function Ce(t){return t=Number(t)||0,t<=0?"":t>=86400?`\\uFF08\\u7EA6 ${Math.round(t/86400)} \\u5929\\uFF09`:t>=3600?`\\uFF08\\u7EA6 ${Math.round(t/3600)} \\u5C0F\\u65F6\\uFF09`:t>=60?`\\uFF08\\u7EA6 ${Math.round(t/60)} \\u5206\\u949F\\uFF09`:`\\uFF08${t} \\u79D2\\uFF09`}function pe(t,n){let s=e("table",{class:"table"});s.appendChild(e("thead",{},e("tr",{},t.map(a=>e("th",{},a)))));let o=e("tbody");return n.forEach(a=>o.appendChild(e("tr",{},a.map(l=>l&&l.nodeType?e("td",{},l):e("td",{},String(l)))))),s.appendChild(o),s}function Te(t){return e("div",{class:"row-actions"},t.map(n=>e("button",{class:"btn btn-sm "+(n.cls||"btn-ghost"),text:n.label,onclick:n.onClick})))}function Rt(){let t=S("plat-badge");if(!t)return;let n=D.info&&D.info.caps||{},s=["\\u5E73\\u53F0: "+(D.info?D.info.platform:tt)];n.hasEdgeCache&&s.push("\\u8FB9\\u7F18\\u7F13\\u5B58 \\u2713"),n.hasSocket||s.push("socket \\u2717"),n.hasD1||s.push("D1 \\u2717"),t.textContent=s.join(" \\xB7 "),t.title=(D.info&&D.info.limitations||[]).map(o=>o.message).join(`\n`)}function y(t,n,s,o){return e("div",{class:"form-field"},[e("label",{class:"label"},t),n,s?e("div",{class:"field-hint muted"},s):null,...Array.isArray(o)?o:[]])}function Be(t){return e("div",{class:"field-hint muted var-hint"},[e("span",{class:"var-hint-tag",text:"\\u652F\\u6301\\u52A8\\u6001\\u53D8\\u91CF"}),e("span",{text:t||"\\u5934\\u503C\\u53EF\\u5199 ${host} ${client_ip} ${uri} ${path} ${product_name} \\u7B49\\u5185\\u7F6E\\u53D8\\u91CF\\uFF0C\\u8FD0\\u884C\\u65F6\\u66FF\\u6362\\u4E3A\\u771F\\u5B9E\\u503C\\u3002"})])}function At(t,n){let s=e("select",{class:"input"});s.appendChild(e("option",{value:""},"\\u8BF7\\u9009\\u62E9\\u8981\\u6DFB\\u52A0\\u7684\\u64CD\\u4F5C\\u2026"));for(let o of t){let a=e("optgroup",{label:o.group});for(let l of o.items)a.appendChild(e("option",{value:l.value},l.label));s.appendChild(a)}return n!=null&&(s.value=n),s}function M(t,n,s,o,a){let l=o||n.map(h=>({value:h.value!=null?h.value:h,label:h.label!=null?h.label:h})),d="input"+(a?" "+a:"");return e("select",t?{id:t,class:d}:{class:d},l.map(h=>{let p=e("option",{value:h.value},h.label);return h.value===s&&(p.selected=!0),h.disabled&&(p.disabled=!0),p}))}function St({presets:t,groups:n,tokenOf:s,render:o,placeholder:a}){let l=s||(C=>String(C)),d=o||(C=>String(C)),i=e("input",{class:"input ms-combobox-input",type:"text",value:"",placeholder:a||"\\u8BF7\\u9009\\u62E9\\u2026",spellcheck:"false",autocomplete:"off"}),h=e("span",{class:"ms-caret",text:"\\u25BE"}),p=e("div",{class:"ms-trigger ms-trigger--combo"},[i,h]),g=()=>i.value,f=C=>{i.value=C},r=e("div",{class:"ms-panel",hidden:!0}),c=new Map;function m(C){return g().split(",").map(w=>w.trim()).filter(Boolean).includes(l(C))}for(let C of n){let u=e("div",{class:"ms-group"},[e("div",{class:"ms-group-label",text:C.label})]),w=e("div",{class:"ms-opts"});for(let A of C.values){let b=e("button",{type:"button",class:"ms-opt",text:d(A),onclick:L=>{L.stopPropagation(),$(A)}});c.set(A,b),w.appendChild(b)}u.appendChild(w),r.appendChild(u)}let x=new Set;n.forEach(C=>C.values.forEach(u=>x.add(String(u))));let E=t.filter(C=>!x.has(String(C)));if(E.length){let C=e("div",{class:"ms-opts"});for(let u of E){let w=e("button",{type:"button",class:"ms-opt",text:d(u),onclick:A=>{A.stopPropagation(),$(u)}});c.set(u,w),C.appendChild(w)}r.appendChild(e("div",{class:"ms-group"},[e("div",{class:"ms-group-label",text:"\\u5176\\u5B83"}),C]))}function v(){[...c.keys()].filter(u=>m(u)).length>0?p.classList.add("has-value"):p.classList.remove("has-value")}function F(){for(let[C,u]of c)u.classList.toggle("is-selected",m(C))}function $(C){let u=g().split(",").map(b=>b.trim()).filter(Boolean),w=l(C),A=u.indexOf(w);A>=0?u.splice(A,1):u.push(w),f(u.join(", ")),v(),F()}function H(){let C=p.getBoundingClientRect();r.style.position="fixed",r.style.top=C.bottom+6+"px",r.style.left=C.left+"px",r.style.minWidth=Math.max(C.width,280)+"px"}let k=!1;function T(){H(),r.hidden=!1,k=!0,p.classList.add("is-open"),document.addEventListener("click",B,!0),window.addEventListener("resize",B),window.addEventListener("scroll",B,!0),F(),v()}function R(){r.hidden=!0,k=!1,p.classList.remove("is-open"),document.removeEventListener("click",B,!0),window.removeEventListener("resize",B),window.removeEventListener("scroll",B,!0)}function _(){k?R():T()}function B(C){r.hidden||r.contains(C.target)||p.contains(C.target)||R()}function U(){F(),v()}return i.addEventListener("focus",T),h.addEventListener("click",C=>{C.stopPropagation(),k?R():(i.focus(),T())}),document.body.appendChild(r),v(),{combobox:p,input:i,panel:r,syncFromInput:U,destroy(){R(),r.remove()}}}function Tt({groups:t,getValue:n,setValue:s,render:o,placeholder:a,allowFreetext:l=!0}){let d=o||(k=>String(k)),i=e("input",{class:"input ms-combobox-input",type:"text",value:(n()||"").trim(),placeholder:a||"\\u8BF7\\u9009\\u62E9\\u2026",spellcheck:"false",autocomplete:"off"}),h=e("span",{class:"ms-caret",text:"\\u25BE"}),p=e("div",{class:"ms-trigger ms-trigger--combo"},[i,h]),g=e("div",{class:"ms-panel",hidden:!0}),f=new Map;for(let k of t){let T=e("div",{class:"ms-group"},[e("div",{class:"ms-group-label",text:k.label})]),R=e("div",{class:"ms-opts"});for(let _ of k.values){let B=e("button",{type:"button",class:"ms-opt",text:d(_),onclick:U=>{U.stopPropagation(),c(_)}});f.set(_,B),R.appendChild(B)}T.appendChild(R),g.appendChild(T)}function r(){let k=(n()||"").trim().toLowerCase();for(let[T,R]of f)R.classList.toggle("is-selected",String(T).toLowerCase()===k)}function c(k){s(String(k)),i.value=String(k),r(),v()}function m(){let k=p.getBoundingClientRect();g.style.position="fixed",g.style.top=k.bottom+6+"px",g.style.left=k.left+"px",g.style.minWidth=Math.max(k.width,280)+"px"}let x=!1;function E(){m(),g.hidden=!1,x=!0,p.classList.add("is-open"),document.addEventListener("click",$,!0),window.addEventListener("resize",$),window.addEventListener("scroll",$,!0),r()}function v(){g.hidden=!0,x=!1,p.classList.remove("is-open"),document.removeEventListener("click",$,!0),window.removeEventListener("resize",$),window.removeEventListener("scroll",$,!0)}function F(){x?v():E()}function $(k){g.hidden||g.contains(k.target)||p.contains(k.target)||v()}function H(){i.value=(n()||"").trim(),r()}return i.addEventListener("focus",E),i.addEventListener("input",()=>{s(i.value),r()}),h.addEventListener("click",k=>{k.stopPropagation(),x?v():(i.focus(),E())}),document.body.appendChild(g),{combobox:p,input:i,panel:g,syncFromInput:H,destroy(){v(),g.remove()}}}var on=[{value:"host",label:"Host\\uFF08\\u5BA2\\u6237\\u7AEF\\u8BF7\\u6C42\\u57DF\\u540D\\uFF09"},{value:"path",label:"URL \\u8DEF\\u5F84"},{value:"fullUrl",label:"\\u5B8C\\u6574 URL\\uFF08\\u542B\\u534F\\u8BAE\\u3001\\u57DF\\u540D\\u3001\\u8DEF\\u5F84\\u3001\\u53C2\\u6570\\uFF09"},{value:"query",label:"\\u67E5\\u8BE2\\u5B57\\u7B26\\u4E32\\uFF08Query String\\uFF09"},{value:"extension",label:"\\u6587\\u4EF6\\u540E\\u7F00"},{value:"filename",label:"\\u6587\\u4EF6\\u540D\\u79F0"},{value:"directory",label:"\\u76EE\\u5F55"},{value:"method",label:"\\u8BF7\\u6C42\\u65B9\\u6CD5"},{value:"header",label:"\\u8BF7\\u6C42\\u5934"},{value:"cookie",label:"Cookie"},{value:"clientIp",label:"\\u5BA2\\u6237\\u7AEF IP"},{value:"clientCountry",label:"\\u5BA2\\u6237\\u7AEF\\u5730\\u7406\\u4F4D\\u7F6E\\uFF08\\u56FD\\u5BB6/\\u5730\\u533A\\uFF09"},{value:"userAgent",label:"User-Agent\\uFF08\\u5BA2\\u6237\\u7AEF\\u6D4F\\u89C8\\u5668\\u6807\\u8BC6\\uFF09"},{value:"referer",label:"Referer\\uFF08\\u6765\\u6E90\\u9875\\u9762\\uFF09"},{value:"origin",label:"\\u56DE\\u6E90\\u76EE\\u6807\\uFF08\\u6E90\\u7AD9 ID\\uFF0C\\u7531 \\u2462 \\u9996\\u8981\\u5206\\u6D41\\u6309\\u8D1F\\u8F7D\\u5747\\u8861\\u9009\\u51FA\\uFF09"},{value:"originAddr",label:"\\u56DE\\u6E90\\u76EE\\u6807\\u5730\\u5740\\uFF08\\u6E90\\u7AD9 addr\\uFF0C\\u7531 \\u2462 \\u9996\\u8981\\u5206\\u6D41\\u9009\\u51FA\\uFF09"}],an=[{value:"equal",label:"\\u7B49\\u4E8E"},{value:"notEqual",label:"\\u4E0D\\u7B49\\u4E8E"},{value:"contain",label:"\\u5305\\u542B"},{value:"notContain",label:"\\u4E0D\\u5305\\u542B"},{value:"prefix",label:"\\u524D\\u7F00\\u4E3A"},{value:"notPrefix",label:"\\u524D\\u7F00\\u4E0D\\u4E3A"},{value:"suffix",label:"\\u540E\\u7F00\\u4E3A"},{value:"notSuffix",label:"\\u540E\\u7F00\\u4E0D\\u4E3A"},{value:"regex",label:"\\u6B63\\u5219\\u5339\\u914D"},{value:"notRegex",label:"\\u6B63\\u5219\\u4E0D\\u5339\\u914D"},{value:"exists",label:"\\u5B58\\u5728"},{value:"notExists",label:"\\u4E0D\\u5B58\\u5728"}],ln=["header","cookie","query"],Ht=["exists","notExists"],It=["7z","avi","avif","apk","bin","bmp","bz2","class","css","csv","doc","docx","dmg","ejs","eot","eps","exe","flac","gif","gz","ico","iso","jar","jpg","jpeg","js","mid","midi","mkv","mp3","mp4","ogg","otf","pdf","pict","pls","png","ppt","pptx","ps","rar","svg","svgz","swf","tar","tif","tiff","ttf","webm","webp","woff","woff2","xls","xlsx","zip","zst"],jn=[400,401,403,404,405,406,408,409,410,412,413,415,422,429,500,502,503,504],rn=[{label:"\\u7F51\\u9875\\u4E0E\\u811A\\u672C",values:["css","js","ejs","class","swf"]},{label:"\\u56FE\\u7247",values:["bmp","gif","ico","jpg","jpeg","png","svg","svgz","tif","tiff","avif","webp","pict","eps","eot","otf","ttf","woff","woff2"]},{label:"\\u97F3\\u89C6\\u9891",values:["avi","flac","mid","midi","mkv","mp3","mp4","ogg","webm"]},{label:"\\u6587\\u6863",values:["csv","doc","docx","pdf","ppt","pptx","ps","xls","xlsx"]},{label:"\\u538B\\u7F29\\u5305\\u4E0E\\u955C\\u50CF",values:["7z","bz2","gz","rar","tar","zip","zst","dmg","iso"]},{label:"\\u7A0B\\u5E8F\\u4E0E\\u4E8C\\u8FDB\\u5236",values:["apk","bin","exe","jar","pls"]}],Lt=[{label:"4xx \\u5BA2\\u6237\\u7AEF\\u9519\\u8BEF",values:[400,401,403,404,405,406,407,408,409,410,411,412,413,414,415,416,417,418,429,498,499]},{label:"5xx \\u670D\\u52A1\\u7AEF\\u9519\\u8BEF",values:[500,502,503,504,508,520,521,522,523,524,525,526,530,581,582,583,584,594,595,596,598,599]}];function ft(t,n){t=t||{target:"path",op:"prefix",values:[],key:"",ignoreCase:!0};let s=M("",on,t.target||"path");s.className="input";let o=e("input",{class:"input",value:t.key||"",placeholder:"\\u952E\\u540D"}),a=M("",an,t.op||"prefix");a.className="input";let l="ext-presets-dl-"+Math.random().toString(36).slice(2),d=e("datalist",{id:l},It.map(H=>e("option",{value:H}))),i=e("input",{type:"checkbox",checked:t.ignoreCase!==!1}),h=e("span",{class:"field-hint muted"}),p=e("input",{class:"input",value:t.values&&t.values.length?t.values.join(", "):""}),g=St({presets:It,groups:rn,tokenOf:H=>String(H).toLowerCase(),render:H=>"."+H,placeholder:"\\u591A\\u4E2A\\u503C\\u7528\\u9017\\u53F7\\u5206\\u9694\\uFF08\\u4E4B\\u95F4\\u4E3A\\u201C\\u6216\\u201D\\uFF09\\uFF1B\\u6216\\u70B9\\u53F3\\u4FA7\\u7BAD\\u5934\\u9009\\u62E9\\u6587\\u4EF6\\u540E\\u7F00"});t.values&&t.values.length&&(g.input.value=t.values.join(", ")),g.input.addEventListener("input",()=>g.syncFromInput());let f=!1,r=e("div",{class:"cond-cell"},[o]),c=e("div",{class:"cond-cell"},[p,d,h]),m={equal:"\\u4F8B\\u5982\\u586B /index.html \\u8868\\u793A\\u8DEF\\u5F84\\u6070\\u597D\\u7B49\\u4E8E\\u5B83",notEqual:"\\u4F8B\\u5982\\u586B /admin \\u8868\\u793A\\u8DEF\\u5F84\\u4E0D\\u662F\\u5B83",contain:"\\u4F8B\\u5982\\u586B /api \\u8868\\u793A\\u8DEF\\u5F84\\u91CC\\u5305\\u542B /api",notContain:"\\u4F8B\\u5982\\u586B /private \\u8868\\u793A\\u8DEF\\u5F84\\u4E0D\\u542B /private",prefix:"\\u4F8B\\u5982\\u586B /img \\u8868\\u793A\\u4EE5 /img \\u5F00\\u5934",notPrefix:"\\u4F8B\\u5982\\u586B /old \\u8868\\u793A\\u4E0D\\u4EE5 /old \\u5F00\\u5934",suffix:"\\u4F8B\\u5982\\u586B .php \\u8868\\u793A\\u4EE5 .php \\u7ED3\\u5C3E",notSuffix:"\\u4F8B\\u5982\\u586B .css \\u8868\\u793A\\u4E0D\\u4EE5 .css \\u7ED3\\u5C3E",regex:"\\u53EF\\u5199\\u6807\\u51C6\\u6B63\\u5219\\u5982 ^/old/(.*)\\uFF0C\\u4E5F\\u53EF\\u5199\\u901A\\u914D\\u7B26\\u5982 /img/*\\uFF08* \\u4EE3\\u8868\\u4EFB\\u610F\\u5185\\u5BB9\\uFF0C\\u540E\\u53F0\\u81EA\\u52A8\\u8F6C\\u6B63\\u5219\\uFF09\\uFF1B^/img/ \\u8868\\u793A\\u4EE5 /img/ \\u5F00\\u5934",notRegex:"\\u4F8B\\u5982 ^/admin \\u8868\\u793A\\u4E0D\\u5339\\u914D\\u4EE5 /admin \\u5F00\\u5934\\uFF1B\\u4E5F\\u53EF\\u5199\\u901A\\u914D\\u7B26\\u5982 /secret/*",exists:"\\u65E0\\u9700\\u586B\\u503C\\uFF0C\\u53EA\\u8981\\u8FD9\\u4E2A\\u5934/\\u53C2\\u6570\\u5B58\\u5728\\u5C31\\u547D\\u4E2D",notExists:"\\u65E0\\u9700\\u586B\\u503C\\uFF0C\\u53EA\\u8981\\u8FD9\\u4E2A\\u5934/\\u53C2\\u6570\\u4E0D\\u5B58\\u5728\\u5C31\\u547D\\u4E2D"},x={header:"\\u8981\\u5339\\u914D\\u7684\\u8BF7\\u6C42\\u5934\\u540D\\u79F0\\uFF0C\\u5982 User-Agent",cookie:"\\u8981\\u5339\\u914D\\u7684 Cookie \\u540D\\u79F0\\uFF0C\\u5982 session",query:"\\u8981\\u5339\\u914D\\u7684\\u67E5\\u8BE2\\u53C2\\u6570\\u540D\\uFF0C\\u5982 id"},E="\\u56DE\\u6E90\\u76EE\\u6807 = \\u2462 \\u9996\\u8981\\u5206\\u6D41\\u6309\\u8D1F\\u8F7D\\u5747\\u8861\\u5B9E\\u9645\\u9009\\u51FA\\u7684\\u6E90\\u7AD9\\u3002\\u53EF\\u9009\\u6E90\\u7AD9 ID\\uFF08exact \\u5339\\u914D\\uFF09\\u6216\\u6E90\\u7AD9\\u5730\\u5740\\uFF08\\u652F\\u6301\\u5305\\u542B/\\u524D\\u7F00/\\u6B63\\u5219\\uFF09\\u3002\\u4F8B\\u5982\\u6E90\\u7AD9\\u6C60\\u91CC\\u6709 3 \\u4E2A\\u6E90\\u7AD9\\uFF0C\\u5C31\\u5206\\u522B\\u7528 3 \\u4E2A\\u300C\\u56DE\\u6E90\\u76EE\\u6807\\u300D\\u6761\\u4EF6\\u505A\\u5206\\u652F\\uFF0C\\u2466~\\u2471 \\u5171\\u7528\\u4E00\\u6761\\u7EBF\\u3001\\u2469\\u246D \\u4E3A\\u771F\\u5B9E\\u53EA\\u8BFB\\u7ED3\\u679C\\u3002",v=()=>{let H=ln.includes(s.value);r.style.display=H?"":"none",o.placeholder=H&&x[s.value]||"\\u952E\\u540D",c.style.display=Ht.includes(a.value)?"none":"",s.value==="extension"||a.value==="suffix"||a.value==="notSuffix"?(f||(p.value=g.input.value,p.style.display="none",p.removeAttribute("list"),c.insertBefore(g.combobox,d),f=!0),p.setAttribute("list",l),g.syncFromInput()):(f&&(g.input.value=p.value,g.combobox.remove(),g.destroy(),f=!1),p.style.display="",p.removeAttribute("list")),h.textContent=Ht.includes(a.value)?"":s.value==="origin"||s.value==="originAddr"?E:m[a.value]||""};s.onchange=v,a.onchange=v,v();let F=e("div",{class:"cond-row"},[s,r,a,c,e("label",{class:"check",title:"\\u4E0D\\u533A\\u5206\\u5927\\u5C0F\\u5199\\uFF08\\u5982 Path \\u4E0E path \\u89C6\\u4E3A\\u76F8\\u540C\\uFF09"},[i,e("span",{text:"\\u4E0D\\u533A\\u5206\\u5927\\u5C0F\\u5199"})]),e("button",{class:"btn btn-sm btn-danger",text:"\\xD7",onclick:()=>{f&&g.destroy(),F.remove(),n&&n()}})]);return{row:F,read:()=>{let H=f?g.input.value:p.value,k=H?H.split(",").map(T=>T.trim()).filter(Boolean):[];return{target:s.value,op:a.value,key:o.value.trim(),values:k,ignoreCase:i.checked}}}}function Ft(t){t=Array.isArray(t)&&t.length?t:[];let n=e("div",{class:"cond-groups"}),s=[],o=d=>{let i=e("div",{class:"cond-rows"}),h=[],p={readers:h},g=r=>{let{row:c,read:m}=ft(r,()=>{let x=h.indexOf(m);x>=0&&h.splice(x,1)});h.push(m),i.appendChild(c)};(d&&d.length?d:[null]).forEach(g);let f=e("div",{class:"cond-group"},[e("div",{class:"cond-group-head"},[e("span",{class:"badge",text:"\\u4E14\\uFF08AND\\uFF09"}),e("button",{class:"btn btn-sm",text:"+ \\u6761\\u4EF6",onclick:()=>g(null)}),e("button",{class:"btn btn-sm btn-danger",text:"\\u5220\\u9664\\u6761\\u4EF6\\u7EC4",onclick:()=>{f.remove();let r=s.indexOf(p);r>=0&&s.splice(r,1)}})]),i]);s.push(p),n.appendChild(f)};return t.forEach(o),{root:e("div",{},[e("div",{class:"muted",text:"\\u6761\\u4EF6\\u7EC4\\u4E4B\\u95F4\\u4E3A\\u300C\\u6216\\uFF08OR\\uFF09\\u300D\\u5173\\u7CFB\\uFF0C\\u7EC4\\u5185\\u6761\\u4EF6\\u4E4B\\u95F4\\u4E3A\\u300C\\u4E14\\uFF08AND\\uFF09\\u300D\\u5173\\u7CFB\\u3002\\u4E0D\\u6DFB\\u52A0\\u4EFB\\u4F55\\u6761\\u4EF6\\u65F6\\u5339\\u914D\\u5168\\u90E8\\u8BF7\\u6C42\\u3002"}),n,e("button",{class:"btn btn-sm",text:"+ \\u6DFB\\u52A0\\u6761\\u4EF6\\u7EC4\\uFF08\\u6216\\uFF09",onclick:()=>o(null)})]),read:()=>s.map(d=>d.readers.map(i=>i()).filter(i=>i.op&&i.target)).filter(d=>d.length>0)}}function Pt(t){t=t||{};let n=Array.isArray(t.conditions)?t.conditions.map(a=>Array.isArray(a)?a.slice():[]):[],s=n.length?n[0]:[],o=a=>s.push(a);return Array.isArray(t.extIn)&&t.extIn.length&&o({target:"extension",op:"equal",ignoreCase:!0,values:t.extIn.map(a=>String(a).toLowerCase().replace(/^\\./,""))}),t.pathPrefix&&o({target:"path",op:"prefix",ignoreCase:!0,values:[t.pathPrefix]}),t.pathRegex&&o({target:"path",op:"regex",values:[t.pathRegex]}),Array.isArray(t.methodIn)&&t.methodIn.length&&o({target:"method",op:"equal",values:t.methodIn.map(a=>String(a).toUpperCase())}),s.length&&(n.length?n[0]=s:n.push(s)),{...t,conditions:n}}var $e=/^!?(?:[1-5]\\d{2}|[1-5]xx|[1-5]\\dx)$/i,nt="\\u652F\\u6301\\u4E09\\u79CD\\u5199\\u6CD5\\uFF1A\\u7CBE\\u786E\\u7801 404\\uFF1B\\u6574\\u6BB5\\u901A\\u914D 4xx / 5xx\\uFF1B\\u5341\\u4F4D\\u6BB5 52x\\uFF08CDN \\u6269\\u5C55\\u9519\\u8BEF\\u7801\\uFF09\\u3002\\u52A0 ! \\u524D\\u7F00\\u8868\\u793A\\u4F8B\\u5916\\uFF0C\\u4F8B\\u5982\\u5148\\u5199 4xx \\u518D\\u5199 !418\\uFF0C\\u5C31\\u662F\\u300C\\u9664 418 \\u4EE5\\u5916\\u7684\\u6240\\u6709 4xx\\u300D\\u3002",Bt=[{label:"\\u6574\\u6BB5\\u901A\\u914D",values:["4xx","5xx","52x"]},...Lt.map(t=>({label:t.label,values:t.values.map(String)}))];function cn(t){return e("div",{class:"chips"},Bt.map(n=>e("div",{class:"chip-group"},[e("span",{class:"muted",text:n.label+"\\uFF1A"}),...n.values.map(s=>e("button",{class:"btn btn-sm",text:s,onclick:o=>{o.preventDefault(),t(s)}}))])))}function $t(t){let n=e("div",{class:"kv-list"}),s=e("div",{class:"field-hint muted"}),o=()=>{let i=[];return Array.from(n.children).forEach(h=>{let p=S(".st-code",h),g=p.value.trim();g&&!$e.test(g)&&i.push(g),p.classList.toggle("input-err",!!g&&!$e.test(g))}),s.textContent=i.length?`\\u26A0 \\u5199\\u6CD5\\u4E0D\\u8BA4\\u8BC6\\uFF1A${i.join("\\u3001")}\\u3002${nt}`:"",i.length===0},a=(i,h)=>{let p=null,g=Tt({groups:Bt,placeholder:"404 / 4xx / 52x",getValue:()=>p?p.value:"",setValue:E=>{p&&(p.value=E,o())}});p=g.input,p.classList.add("st-code"),i&&(p.value=i);let f=g.combobox,r=e("input",{class:"input st-ttl",type:"number",min:"0",value:h==null?"":String(h),placeholder:"\\u79D2\\uFF080 = \\u4E0D\\u7F13\\u5B58\\uFF09"}),c=e("span",{class:"field-hint muted"}),m=()=>{let E=Number(r.value);c.textContent=r.value===""?"":E<=0?"\\u3000= \\u5B8C\\u5168\\u4E0D\\u7F13\\u5B58\\uFF08no-store\\uFF09":Ce(E)};r.addEventListener("input",m),m();let x=e("div",{class:"kv-row"},[f,e("div",{class:"kv-val"},[r,c]),e("button",{class:"btn btn-sm btn-danger",text:"\\xD7",onclick:()=>{x.remove(),o()}})]);n.appendChild(x)};return Object.keys(t||{}).forEach(i=>a(i,t[i])),n.children.length||a("",""),{root:e("div",{class:"header-editor"},[e("div",{class:"kv-label"},"\\u72B6\\u6001\\u7801 \\u2192 \\u7F13\\u5B58\\u65F6\\u957F\\uFF08\\u4E00\\u884C\\u4E00\\u6761\\uFF09\\uFF1A"),n,e("button",{class:"btn btn-sm",text:"+ \\u6DFB\\u52A0\\u4E00\\u6761",onclick:()=>a("","")}),e("div",{class:"field-hint muted",text:nt}),s]),read:()=>{let i={};return Array.from(n.children).forEach(h=>{let p=S(".st-code",h).value.trim().toLowerCase(),g=S(".st-ttl",h).value.trim();if(!p||!$e.test(p)||g==="")return;let f=Number(g);!Number.isFinite(f)||f<0||(i[p]=f)}),i},validate:o}}function Yn(t){let n=e("div",{class:"kv-list"}),s=e("div",{class:"field-hint muted"}),o=()=>{let i=[];return Array.from(n.children).forEach(h=>{let p=S(".st-code",h),g=p.value.trim();g&&!$e.test(g)&&i.push(g),p.classList.toggle("input-err",!!g&&!$e.test(g))}),s.textContent=i.length?`\\u26A0 \\u5199\\u6CD5\\u4E0D\\u8BA4\\u8BC6\\uFF1A${i.join("\\u3001")}\\u3002${nt}`:"",i.length===0},a=i=>{let h=e("input",{class:"input st-code",value:i==null?"":String(i),placeholder:"4xx / 5xx / 52x / !418"});h.addEventListener("input",o);let p=e("div",{class:"kv-row"},[h,e("span",{class:"muted",text:"(\\u4E0D\\u5199\\u7F13\\u5B58)"}),e("button",{class:"btn btn-sm btn-danger",text:"\\xD7",onclick:()=>{p.remove(),o()}})]);n.appendChild(p)};return(Array.isArray(t)?t:[]).forEach(i=>a(i)),n.children.length||a(""),{root:e("div",{class:"header-editor"},[e("div",{class:"kv-label"},"\\u8FD9\\u4E9B\\u72B6\\u6001\\u7801\\u7684\\u54CD\\u5E94\\u4E0D\\u5199\\u7F13\\u5B58\\uFF08\\u4E00\\u884C\\u4E00\\u4E2A\\uFF09\\uFF1A"),n,e("button",{class:"btn btn-sm",text:"+ \\u6DFB\\u52A0\\u4E00\\u6761",onclick:()=>a("")}),cn(i=>{a(i),o()}),e("div",{class:"field-hint muted",text:nt+" \\u6E05\\u7A7A\\u6574\\u4E2A\\u5217\\u8868\\u5219\\u8868\\u793A\\u300C\\u4E0D\\u6309\\u72B6\\u6001\\u7801\\u62E6\\u7F13\\u5B58\\u300D\\u3002"}),s]),read:()=>{let i=[];return Array.from(n.children).forEach(h=>{let p=S(".st-code",h).value.trim().toLowerCase();p&&$e.test(p)&&!i.includes(p)&&i.push(p)}),i},validate:o}}function Dt(t,n){n=n||{};let s=e("div",{class:"kv-list"}),o=d=>{let i=e("div",{class:"kv-row"},[e("input",{class:"input sl-val",value:d||"",placeholder:n.placeholder||""}),e("span",{class:"muted",text:n.tag||""}),e("button",{class:"btn btn-sm btn-danger",text:"\\xD7",onclick:()=>i.remove()})]);s.appendChild(i)};return(Array.isArray(t)?t:[]).forEach(d=>o(d)),s.children.length||o(""),{root:e("div",{class:"header-editor"},[e("div",{class:"kv-label"},n.label||""),s,e("button",{class:"btn btn-sm",text:"+ \\u6DFB\\u52A0\\u4E00\\u6761",onclick:()=>o("")}),n.hint?e("div",{class:"field-hint muted",text:n.hint}):null]),read:()=>{let d=[];return Array.from(s.children).forEach(i=>{let h=S(".sl-val",i).value.trim().toLowerCase();h&&!d.includes(h)&&d.push(h)}),d}}}function Ke(t){t=t||{set:{},strip:[]};let n=e("div",{class:"kv-list"}),s=e("div",{class:"kv-list"}),o=()=>{let i={};Array.from(n.children).forEach(p=>{let g=S(".hk",p).value.trim(),f=S(".hv",p).value;g&&(i[g]=f)});let h=[];return Array.from(s.children).forEach(p=>{let g=S(".st-type",p).value,f=S(".st-val",p).value.trim().toLowerCase();f&&h.push({type:g,value:f})}),{set:i,strip:h}},a=(i,h,p)=>{let g=e("div",{class:"kv-row"},[e("input",{class:"input hk",value:h||"",placeholder:"Header-Name"}),e("input",{class:"input hv",value:p||"",placeholder:"value\\uFF08\\u53EF\\u5199 ${var} \\u53D8\\u91CF\\uFF09"}),e("button",{class:"btn btn-sm btn-danger",text:"\\xD7",onclick:()=>g.remove()})]);i.appendChild(g)},l=(i,h)=>{let p=e("select",{class:"input st-type"},[e("option",{value:"exact",text:"\\u7CBE\\u786E"}),e("option",{value:"prefix",text:"\\u524D\\u7F00"}),e("option",{value:"regex",text:"\\u6B63\\u5219"})]);p.value=i||"exact";let g=e("input",{class:"input st-val",value:h||"",placeholder:i==="prefix"?"\\u5982 cf-\\uFF08\\u5220\\u6389\\u6240\\u6709 cf- \\u5F00\\u5934\\u7684\\u5934\\uFF09":i==="regex"?"\\u5982 ^x-.*":"\\u5982 x-powered-by"}),f=e("div",{class:"kv-row"},[p,g,e("button",{class:"btn btn-sm btn-danger",text:"\\xD7",onclick:()=>f.remove()})]);s.appendChild(f)};Object.keys(t.set||{}).forEach(i=>a(n,i,t.set[i])),Array.isArray(t.strip)&&t.strip.forEach(i=>l(i.type,i.value)),n.children.length||a(n,"",""),s.children.length||l("exact","");let d=e("div",{class:"header-editor"},[Be(),e("div",{class:"kv-label"},"\\u65B0\\u589E / \\u4FEE\\u6539\\uFF08\\u628A\\u67D0\\u4E2A\\u8BF7\\u6C42\\u5934\\u8BBE\\u6210\\u6307\\u5B9A\\u503C\\uFF09\\uFF1A"),n,e("button",{class:"btn btn-sm",text:"+ \\u6DFB\\u52A0",onclick:()=>a(n,"","")}),e("div",{class:"kv-label"},"\\u5220\\u9664\\uFF08\\u56DE\\u6E90 / \\u8FD4\\u56DE\\u65F6\\u53BB\\u6389\\u67D0\\u4E2A\\u8BF7\\u6C42\\u5934\\uFF0C\\u652F\\u6301\\u7CBE\\u786E / \\u524D\\u7F00 / \\u6B63\\u5219\\uFF09\\uFF1A"),s,e("button",{class:"btn btn-sm",text:"+ \\u6DFB\\u52A0",onclick:()=>l("exact","")}),e("div",{class:"field-hint muted",text:"\\u5220\\u9664\\u7EDF\\u4E00\\u7528\\u300C\\u5265\\u79BB\\u300D\\u8BED\\u6CD5\\uFF1A\\u7CBE\\u786E=\\u6309\\u5934\\u540D\\u5220\\u5355\\u4E2A\\uFF1B\\u524D\\u7F00=\\u5220\\u6389\\u67D0\\u524D\\u7F00\\u5F00\\u5934\\u7684\\u6240\\u6709\\u5934\\uFF08\\u5982 cf-\\uFF09\\uFF1B\\u6B63\\u5219=\\u6309\\u6A21\\u5F0F\\u6279\\u91CF\\u5220\\u3002\\u4E0D\\u518D\\u6709\\u5355\\u72EC\\u7684\\u300C\\u989D\\u5916\\u5265\\u79BB\\u300D\\u677F\\u5757\\u2014\\u2014\\u7CBE\\u786E\\u5220\\u9664\\u4E0E\\u989D\\u5916\\u5265\\u79BB\\u5B8C\\u5168\\u7B49\\u4EF7\\uFF0C\\u5DF2\\u5408\\u5E76\\u5230\\u6B64\\u5904\\u3002"})]);return d.__read=o,{root:d,read:o}}function st(t,n){t=t||{},n=n||{};let s=n.globalScope===!0,o=t.key||{},a=M("",[{value:"ttl",label:"\\u81EA\\u5B9A\\u4E49\\u7F13\\u5B58\\u65F6\\u95F4\\uFF08\\u63A8\\u8350\\u65B0\\u624B\\uFF09"},{value:"origin",label:"\\u8DDF\\u968F\\u6E90\\u7AD9 Cache-Control"},{value:"noCache",label:"\\u4E0D\\u7F13\\u5B58\\uFF08\\u6BCF\\u6B21\\u56DE\\u6E90\\uFF09"}],t.mode||"ttl");a.className="input";let l=e("input",{class:"input",type:"number",value:t.edgeTtl!=null?t.edgeTtl:15552e3,placeholder:"\\u79D2"}),d=e("input",{class:"input",type:"number",value:t.browserTtl!=null?t.browserTtl:1800,placeholder:"\\u79D2\\uFF0C-1=\\u8DDF\\u968F\\u6E90\\u7AD9"}),i=e("span",{class:"field-hint muted"}),h=e("span",{class:"field-hint muted"}),p=e("input",{type:"checkbox",checked:t.ignoreQuery!==!1}),g=e("input",{class:"input",value:(t.queryWhitelist||[]).join(", "),placeholder:"\\u5982 id, page\\uFF08\\u7559\\u7A7A=\\u5168\\u90E8\\u4FDD\\u7559\\uFF09"}),f=e("input",{type:"checkbox",checked:!!o.ignoreCase}),r=e("input",{type:"checkbox",checked:!!o.includeScheme}),c=e("input",{class:"input",value:(o.headers||[]).join(", "),placeholder:"\\u5982 accept-language"}),m=e("input",{class:"input",value:(o.cookies||[]).join(", "),placeholder:"\\u5982 tier"}),x=$t(t.statusTtl||{}),E=t.disguise&&typeof t.disguise=="object"?t.disguise:{},v=s?e("input",{class:"input",type:"number",min:"0",value:E.cdnMaxAge!=null?E.cdnMaxAge:86400}):null,F=s?e("input",{class:"input",type:"number",min:"0",value:E.isolateTtlMs!=null?E.isolateTtlMs:6e5}):null,$=e("input",{type:"checkbox",checked:!!t.preRefresh}),H=e("input",{class:"input",type:"number",value:t.preRefreshPercent||80,placeholder:"%"}),k=e("input",{type:"checkbox",checked:!!t.offlineCache}),T=()=>{i.textContent="\\u8282\\u70B9\\u4FDD\\u5B58\\u591A\\u4E45\\u518D\\u56DE\\u6E90"+Ce(l.value),h.textContent="\\u6D4F\\u89C8\\u5668\\u672C\\u5730\\u7F13\\u5B58\\u591A\\u4E45\\uFF08\\u7528\\u6237\\u91CD\\u590D\\u8BBF\\u95EE\\u66F4\\u5FEB\\uFF09"+Ce(d.value)};l.addEventListener("input",T),d.addEventListener("input",T),T();let R=e("div",{class:"grid2"},[y("\\u8FB9\\u7F18\\u7F13\\u5B58\\u65F6\\u957F\\uFF08\\u79D2\\uFF09",l,i.textContent),y("\\u6D4F\\u89C8\\u5668\\u7F13\\u5B58\\u65F6\\u957F\\uFF08\\u79D2\\uFF0C-1=\\u8DDF\\u968F\\u6E90\\u7AD9\\uFF09",d,h.textContent)]),_=y("\\u63D0\\u524D\\u5237\\u65B0\\u89E6\\u53D1\\u65F6\\u673A\\uFF08\\u5269\\u4F59\\u767E\\u5206\\u6BD4\\uFF09",H,"\\u4F8B\\u5982 80 \\u8868\\u793A\\u7F13\\u5B58\\u8FD8\\u5269 20% \\u6709\\u6548\\u671F\\u65F6\\u5C31\\u5F00\\u59CB\\u540E\\u53F0\\u5237\\u65B0\\u3002"),B=()=>{_.style.display=$.checked?"":"none"};$.addEventListener("change",B),B();let U=y("\\u53EA\\u4FDD\\u7559\\u8FD9\\u4E9B\\u67E5\\u8BE2\\u53C2\\u6570\\uFF08\\u5176\\u4F59\\u5FFD\\u7565\\uFF09",g,"\\u5173\\u95ED\\u300C\\u5FFD\\u7565\\u67E5\\u8BE2\\u53C2\\u6570\\u300D\\u540E\\u624D\\u9700\\u8981\\u586B\\uFF1B\\u4F8B\\u5982 id,page\\uFF0C\\u7559\\u7A7A\\u8868\\u793A\\u4FDD\\u7559\\u5168\\u90E8\\u3002"),C=()=>{U.style.display=p.checked?"none":""};p.addEventListener("change",C),C();let u=e("div",{},[R,e("div",{class:"grid2"},[e("label",{class:"check"},[p,e("span",{text:"\\u5FFD\\u7565 URL \\u91CC\\u7684\\u67E5\\u8BE2\\u53C2\\u6570 ?x=1\\uFF08\\u63A8\\u8350\\u5F00\\u542F\\uFF0C\\u547D\\u4E2D\\u7387\\u66F4\\u9AD8\\uFF09"})]),e("label",{class:"check"},[f,e("span",{text:"\\u7F13\\u5B58\\u952E\\u4E0D\\u533A\\u5206\\u5927\\u5C0F\\u5199"})])]),U,ve("\\u81EA\\u5B9A\\u4E49\\u7F13\\u5B58\\u533A\\u5206\\u7EF4\\u5EA6","\\u9ED8\\u8BA4\\u6309 URL \\u7F13\\u5B58\\u5373\\u53EF\\uFF1B\\u6B64\\u9879\\u4EC5\\u5728\\u300C\\u540C\\u4E00\\u7F51\\u5740\\u4F46\\u4E0D\\u540C\\u5185\\u5BB9\\u300D\\u65F6\\u624D\\u7528",[e("div",{class:"grid2"},[e("label",{class:"check"},[r,e("span",{text:"\\u533A\\u5206 http \\u4E0E https \\u4E3A\\u4E24\\u4EFD\\u7F13\\u5B58"})])]),y("\\u989D\\u5916\\u6309\\u8BF7\\u6C42\\u5934\\u6765\\u533A\\u5206\\uFF08\\u9017\\u53F7\\u5206\\u9694\\uFF09",c,"\\u4F8B\\u5982 accept-language\\uFF0C\\u5E38\\u7528\\u4E8E\\u591A\\u8BED\\u8A00\\u7AD9\\u70B9\\u3002\\u4E00\\u822C\\u4E0D\\u7528\\u586B\\u3002"),y("\\u989D\\u5916\\u6309 Cookie \\u6765\\u533A\\u5206\\uFF08\\u9017\\u53F7\\u5206\\u9694\\uFF09",m,"\\u4F8B\\u5982 tier\\uFF08\\u4F1A\\u5458\\u7B49\\u7EA7\\uFF09\\u3002\\u4E00\\u822C\\u4E0D\\u7528\\u586B\\u3002")]),ve("\\u9519\\u8BEF\\u7801\\u7F13\\u5B58","\\u6309\\u72B6\\u6001\\u7801\\u63A7\\u5236\\u7F13\\u5B58\\uFF1A\\u7ED9\\u9519\\u8BEF\\u9875\\u52A0\\u7F13\\u5B58 / \\u6216\\u660E\\u786E\\u67D0\\u4E2A\\u72B6\\u6001\\u7801\\u4E0D\\u7F13\\u5B58\\u3002\\u652F\\u6301\\u7CBE\\u786E\\u7801\\uFF08\\u5982 404\\uFF09\\u4E0E\\u6BB5\\u901A\\u914D\\uFF08\\u5982 4xx\\u300152x\\uFF09\\u6DF7\\u7528\\uFF0C\\u7CBE\\u786E\\u7801\\u4F18\\u5148\\u3002",[e("div",{class:"kv-label"},"\\u72B6\\u6001\\u7801 \\u2192 \\u7F13\\u5B58\\u65F6\\u957F\\uFF08\\u4E00\\u884C\\u4E00\\u6761\\uFF09\\uFF1A"),e("div",{class:"field-hint muted",text:"\\u4F8B\\u5982 404 \\u2192 10\\uFF0C\\u8868\\u793A 404 \\u9875\\u9762\\u4E5F\\u7F13\\u5B58 10 \\u79D2\\uFF0C\\u6321\\u4F4F\\u5BF9\\u6E90\\u7AD9\\u7684\\u91CD\\u590D\\u7A7F\\u900F\\uFF1B\\u586B 0 \\u8868\\u793A\\u8BE5\\u72B6\\u6001\\u7801\\u5B8C\\u5168\\u4E0D\\u7F13\\u5B58\\uFF08no-store\\uFF09\\u3002\\u652F\\u6301\\u6574\\u6BB5\\u901A\\u914D\\uFF1A4xx / 5xx / 52x\\uFF0C\\u586B 0 \\u5373\\u8BE5\\u6BB5\\u6240\\u6709\\u9519\\u8BEF\\u7801\\u90FD\\u4E0D\\u7F13\\u5B58\\u3002\\u7CBE\\u786E\\u7801\\u4F18\\u5148\\u4E8E\\u6BB5\\u901A\\u914D\\u2014\\u2014\\u5199 4xx \\u2192 0 \\u518D\\u5199 404 \\u2192 10\\uFF0C\\u5219 404 \\u7F13\\u5B58 10 \\u79D2\\u3001\\u5176\\u4F59 4xx \\u4E0D\\u7F13\\u5B58\\u3002"}),x.root,e("div",{class:"grid2"},[e("label",{class:"check"},[$,e("span",{text:"\\u7F13\\u5B58\\u5373\\u5C06\\u8FC7\\u671F\\u65F6\\u63D0\\u524D\\u56DE\\u6E90\\u5237\\u65B0"})]),e("label",{class:"check"},[k,e("span",{text:"\\u6E90\\u7AD9\\u6302\\u4E86\\u5C31\\u7528\\u65E7\\u7F13\\u5B58\\u9876\\u7740"})])]),_]),s?ve("\\u4F2A\\u88C5\\u9875\\u7F13\\u5B58\\u65F6\\u957F\\uFF08\\u5168\\u7AD9\\uFF09","\\u7AD9\\u70B9\\u672A\\u5339\\u914D\\u65F6\\u8FD4\\u56DE\\u7684\\u4F2A\\u88C5\\u9875\\u7F13\\u5B58\\u591A\\u4E45",[y("CDN \\u7F13\\u5B58\\u65F6\\u957F\\uFF08\\u79D2\\uFF09",v,"\\u4F2A\\u88C5\\u9875\\u5728 CDN \\u5C42\\u7F13\\u5B58\\u591A\\u4E45\\u3002\\u4F2A\\u88C5\\u9875\\u5185\\u5BB9\\u56FA\\u5B9A\\uFF0C\\u5EFA\\u8BAE\\u4FDD\\u6301\\u8F83\\u957F\\u65F6\\u95F4\\u4EE5\\u51CF\\u5C11\\u51FD\\u6570\\u8C03\\u7528\\u3002"),y("\\u8282\\u70B9\\u5185\\u5B58\\u7F13\\u5B58\\u65F6\\u957F\\uFF08\\u6BEB\\u79D2\\uFF09",F,"\\u53CD\\u4EE3\\u578B\\u4F2A\\u88C5\\u9875\\u5728\\u8FB9\\u7F18\\u8282\\u70B9\\u5185\\u5B58\\u91CC\\u7F13\\u5B58\\u591A\\u4E45\\uFF0C\\u907F\\u514D\\u6BCF\\u6B21\\u90FD\\u53BB\\u62C9\\u53D6\\u4F2A\\u88C5\\u76EE\\u6807\\u7AD9\\u3002")]):null]),w=()=>{let L=a.value==="noCache";u.style.display=L?"none":"",R.style.display=a.value==="ttl"?"":"none"};return a.onchange=w,w(),{root:e("div",{},[y("\\u7F13\\u5B58\\u6A21\\u5F0F",a,"\\u81EA\\u5B9A\\u4E49\\u7F13\\u5B58\\u65F6\\u95F4\\uFF1A\\u56FA\\u5B9A\\u5B58\\u591A\\u4E45\\uFF1B\\u8DDF\\u968F\\u6E90\\u7AD9\\uFF1A\\u7531\\u6E90\\u7AD9\\u54CD\\u5E94\\u5934\\u51B3\\u5B9A\\uFF1B\\u4E0D\\u7F13\\u5B58\\uFF1A\\u6BCF\\u6B21\\u90FD\\u56DE\\u6E90\\uFF08\\u9002\\u5408\\u52A8\\u6001\\u5185\\u5BB9\\uFF09\\u3002"),u]),read:()=>{let L={enabled:a.value!=="noCache",mode:a.value,edgeTtl:Number(l.value)||0,browserTtl:d.value===""?0:Number(d.value),ignoreQuery:p.checked,queryWhitelist:g.value.split(",").map(I=>I.trim()).filter(Boolean),key:{ignoreCase:f.checked,includeScheme:r.checked,headers:c.value.split(",").map(I=>I.trim()).filter(Boolean),cookies:m.value.split(",").map(I=>I.trim()).filter(Boolean)},statusTtl:x.read(),preRefresh:$.checked,preRefreshPercent:Number(H.value)||80,offlineCache:k.checked};return s&&(L.disguise={cdnMaxAge:Number(v.value)||0,isolateTtlMs:Number(F.value)||0}),L}}}function un(t,n){if(!t||!t.includes("*"))return null;let s=n==="path"?"([^/]*)":"(.*)",o=t.replace(/\\\\/g,"\\\\\\\\");return o=o.replace(/[.+?(){}|[\\]^$]/g,"\\\\$&"),o.split("*").join(s)}function dn(t,n){let s=n&&n.type||"none",o=t||"/";try{if(s==="prefix"){let a=(n.value||"").replace(/\\/+$/,""),l=(o||"").replace(/^\\/+/,"");o=a?`${a}/${l||""}`:`/${l}`}else if(s==="strip"){let a=n.value||"";a&&o.startsWith(a)&&(o=o.slice(a.length))}else if(s==="regex"){let a=un(n.regexFrom,"path")||n.regexFrom||"",l=new RegExp(a,"g"),d=n.regexTo??"";n.regexFrom&&n.regexFrom.includes("*")?o=o.replace(l,(...i)=>{let h=i[0],p=i.slice(1,-2);return d.replace(/\\$(\\d)\\b/g,(g,f)=>{let r=Number(f);return r===0?p[0]??"":r===1?h:p[r-1]??""})}):o=o.replace(l,d)}}catch{o=t}return o.startsWith("/")||(o=`/${o}`),o=o.replace(/\\/{2,}/g,"/"),o||"/"}function ot(t){t=t||{type:"none",value:"",regexFrom:"",regexTo:""};let n={none:{label:"\\u4E0D\\u91CD\\u5199\\uFF08\\u4FDD\\u6301\\u539F\\u8DEF\\u5F84\\uFF09",desc:"\\u5BA2\\u6237\\u7AEF\\u8BF7\\u6C42\\u4EC0\\u4E48\\u8DEF\\u5F84\\uFF0C\\u5C31\\u56DE\\u6E90\\u4EC0\\u4E48\\u8DEF\\u5F84\\u3002\\u7EDD\\u5927\\u591A\\u6570\\u60C5\\u51B5\\u9009\\u8FD9\\u4E2A\\u5373\\u53EF\\u3002"},prefix:{label:"\\u524D\\u7F00\\u66FF\\u6362\\uFF08\\u5728\\u8DEF\\u5F84\\u524D\\u52A0\\u4E00\\u6BB5\\uFF09",desc:"\\u628A\\u8BF7\\u6C42\\u8DEF\\u5F84\\u6574\\u4F53\\u201C\\u642C\\u201D\\u5230\\u4E00\\u4E2A\\u65B0\\u76EE\\u5F55\\u4E0B\\uFF0C\\u4F8B\\u5982\\u628A /img/x.png \\u53D8\\u6210 /api/img/x.png\\u3002"},strip:{label:"\\u53BB\\u9664\\u524D\\u7F00\\uFF08\\u53BB\\u6389\\u5F00\\u5934\\u7684\\u67D0\\u6BB5\\uFF09",desc:"\\u5265\\u6389\\u8DEF\\u5F84\\u5F00\\u5934\\u7684\\u56FA\\u5B9A\\u524D\\u7F00\\uFF0C\\u4F8B\\u5982\\u628A /img/x.png \\u53D8\\u6210 /x.png\\uFF08\\u5E38\\u7528\\u4E8E\\u9690\\u85CF\\u5B50\\u76EE\\u5F55\\uFF09\\u3002"},regex:{label:"\\u6B63\\u5219\\u91CD\\u5199\\uFF08\\u9AD8\\u7EA7\\uFF0C\\u6309\\u89C4\\u5219\\u6539\\u5199\\uFF09",desc:"\\u7528\\u6B63\\u5219\\u8868\\u8FBE\\u5F0F\\u628A\\u8DEF\\u5F84\\u7684\\u4E00\\u90E8\\u5206\\u66FF\\u6362\\u4E3A\\u53E6\\u4E00\\u6BB5\\uFF0C\\u9002\\u5408\\u6279\\u91CF/\\u590D\\u6742\\u6539\\u5199\\u3002\\u4E0D\\u61C2\\u6B63\\u5219\\u4E5F\\u6CA1\\u5173\\u7CFB\\uFF0C\\u4E0B\\u9762\\u7ED9\\u4E86\\u51E0\\u4E2A\\u6700\\u5E38\\u2ECF\\u53C8\\u597D\\u7528\\u7684\\u7B80\\u5355\\u793A\\u4F8B\\uFF0C\\u70B9\\u4E00\\u4E0B\\u5C31\\u80FD\\u5957\\u7528\\u3002"}},s=M("",[],t.type||"none",Object.entries(n).map(([m,x])=>({value:m,label:x.label})));s.className="input";let o=e("div",{class:"rw-desc muted"}),a=e("input",{class:"input rw-val",value:t.value||"",placeholder:"\\u4F8B\\u5982 /api \\u6216 /img"}),l=e("input",{class:"input rw-from",value:t.regexFrom||"",placeholder:"\\u4F8B\\u5982 /img/* \\u6216 ^/old/(.*)"}),d=e("input",{class:"input rw-to",value:t.regexTo||"",placeholder:"\\u4F8B\\u5982 /images/$0"}),i=e("div",{class:"rw-fields"}),h=e("input",{class:"input",value:"/img/photo.png",placeholder:"\\u793A\\u4F8B\\u8DEF\\u5F84\\uFF0C\\u4EC5\\u7528\\u4E8E\\u9884\\u89C8\\uFF0C\\u4E0D\\u4F1A\\u4FDD\\u5B58"}),p=e("code",{class:"rw-preview"});function g(){let m=s.value;if(o.textContent=n[m].desc,ae(i),m==="prefix"||m==="strip")i.appendChild(y(m==="prefix"?"\\u8981\\u6DFB\\u52A0 / \\u53BB\\u9664\\u7684\\u8DEF\\u5F84\\u524D\\u7F00":"\\u8981\\u53BB\\u9664\\u7684\\u5F00\\u5934\\u524D\\u7F00",a)),i.appendChild(e("div",{class:"rw-example muted",text:m==="prefix"?"\\u793A\\u4F8B\\uFF1A\\u586B /api\\uFF0C\\u5219 /img/x.png \\u2192 /api/img/x.png":"\\u793A\\u4F8B\\uFF1A\\u586B /img\\uFF0C\\u5219 /img/x.png \\u2192 /x.png"}));else if(m==="regex"){i.appendChild(y("\\u5339\\u914D\\u89C4\\u5219\\uFF08\\u6E90\\uFF09",l,"\\u4E0D\\u4F1A\\u5199\\u6B63\\u5219\\u4E5F\\u6CA1\\u5173\\u7CFB\\uFF1A\\u76F4\\u63A5\\u5199 /img/* \\u8FD9\\u79CD\\u901A\\u914D\\u7B26\\uFF0C* \\u4EE3\\u8868\\u300C\\u540E\\u9762\\u4EFB\\u610F\\u5185\\u5BB9\\u300D\\uFF0C\\u540E\\u53F0\\u4F1A\\u81EA\\u52A8\\u8F6C\\u6210\\u6B63\\u5219\\u3002")),i.appendChild(y("\\u66FF\\u6362\\u4E3A\\uFF08\\u76EE\\u6807\\uFF09",d,"\\u7528 $0 \\u5F15\\u7528 * \\u5339\\u914D\\u5230\\u7684\\u90A3\\u6BB5\\u5185\\u5BB9\\uFF0C$1 \\u5F15\\u7528\\u5B8C\\u6574\\u8DEF\\u5F84\\uFF08\\u5982 /images/$0\\uFF09\\u3002\\u4E5F\\u652F\\u6301\\u6807\\u51C6 $1 $2 \\u5F15\\u7528\\u5206\\u7EC4\\u3002",[Be()]));let x=[{from:"/img/*",to:"/images/$0",note:"\\u901A\\u914D\\u7B26\\u5199\\u6CD5\\uFF1A/img/a/b.png \\u2192 /images/a/b.png\\uFF08\\u6700\\u76F4\\u89C2\\uFF0C\\u63A8\\u8350\\u5C0F\\u767D\\uFF09"},{from:"^(.*)$",to:"$1",note:"\\u6574\\u4F53\\u539F\\u6837\\u900F\\u4F20\\uFF08\\u4FDD\\u7559\\u5B8C\\u6574\\u8DEF\\u5F84\\uFF0C\\u4EC5\\u505A\\u5360\\u4F4D/\\u540E\\u7EED\\u62FC\\u63A5\\u7528\\uFF09"},{from:"^/old/(.*)",to:"/new/$1",note:"\\u76EE\\u5F55\\u8FC1\\u79FB\\uFF1A/old/a.png \\u2192 /new/a.png"},{from:"^(.*)\\\\.html$",to:"$1",note:"\\u53BB\\u6389 .html \\u540E\\u7F00\\uFF1A/page.html \\u2192 /page"}],E=e("div",{class:"rw-examples"},[e("div",{class:"muted",text:"\\u5E38\\u7528\\u7B80\\u5355\\u793A\\u4F8B\\uFF08\\u70B9\\u51FB\\u5957\\u7528\\uFF09\\uFF1A"}),...x.map(v=>{let F=e("button",{class:"rw-example-btn",type:"button",text:`${v.from}  \\u2192  ${v.to}`});return F.addEventListener("click",()=>{l.value=v.from,d.value=v.to,f()}),e("div",{class:"rw-example-item"},[F,e("span",{class:"muted",text:v.note})])})]);i.appendChild(E)}}function f(){let m=h.value||"/",x=dn(m,{type:s.value,value:a.value,regexFrom:l.value,regexTo:d.value});p.textContent=`${m}  \\u2192  ${x}`}return s.addEventListener("change",()=>{g(),f()}),a.addEventListener("input",f),l.addEventListener("input",f),d.addEventListener("input",f),h.addEventListener("input",f),g(),f(),{root:e("div",{class:"rw-editor"},[y("\\u7C7B\\u578B",s),o,i,e("div",{class:"rw-preview-row"},[y("\\u793A\\u4F8B\\u8BF7\\u6C42\\u8DEF\\u5F84\\uFF08\\u4EC5\\u9884\\u89C8\\u7528\\uFF0C\\u4E0D\\u4FDD\\u5B58\\uFF09",h),e("div",{class:"rw-preview-wrap"},[e("span",{class:"ro-tag",text:"\\u53EA\\u8BFB\\u9884\\u89C8"}),e("span",{class:"muted",text:"\\u5B9E\\u9645\\u56DE\\u6E90\\u8DEF\\u5F84\\uFF1A"}),p])])]),read:()=>({type:s.value,value:a.value,regexFrom:l.value,regexTo:d.value})}}function ve(t,n,s){let o=e("div",{class:"section-body"},s),a=e("div",{class:"section-toggle"},[e("span",{class:"tw",text:"\\u25B8"}),e("strong",{},t),n?e("span",{class:"muted",text:" "+n}):null]),l=e("div",{class:"subcard"},[a,o]);return a.onclick=()=>l.classList.toggle("collapsed"),l}function ms(t,n,s,o,a){let l=e("div",{class:"section-body"},a),d=e("div",{class:"section-toggle"},[e("span",{class:"tw",text:"\\u25B8"}),e("strong",{},n),s?e("span",{class:"muted",text:" "+s}):null]),i=e("div",{class:"subcard",id:"op-"+t},[d,l]),h=()=>o.watch?o.watch.type==="checkbox"?o.watch.checked:!!o.watch.value&&o.watch.value!=="off":!!o.enabled;return h()||i.classList.add("collapsed"),d.onclick=()=>i.classList.toggle("collapsed"),o.watch&&o.watch.addEventListener("change",()=>{h()&&i.classList.remove("collapsed")}),i}var fs=[{value:"host",label:"Host\\uFF08\\u5BA2\\u6237\\u7AEF\\u8BF7\\u6C42\\u57DF\\u540D\\uFF09"},{value:"path",label:"URL \\u8DEF\\u5F84"},{value:"fullUrl",label:"\\u5B8C\\u6574 URL\\uFF08\\u542B\\u534F\\u8BAE\\u3001\\u57DF\\u540D\\u3001\\u8DEF\\u5F84\\u3001\\u53C2\\u6570\\uFF09"},{value:"query",label:"\\u67E5\\u8BE2\\u5B57\\u7B26\\u4E32\\uFF08Query String\\uFF09"},{value:"extension",label:"\\u6587\\u4EF6\\u540E\\u7F00"},{value:"filename",label:"\\u6587\\u4EF6\\u540D\\u79F0"},{value:"directory",label:"\\u76EE\\u5F55"},{value:"method",label:"\\u8BF7\\u6C42\\u65B9\\u6CD5"},{value:"header",label:"\\u8BF7\\u6C42\\u5934"},{value:"cookie",label:"Cookie"},{value:"clientIp",label:"\\u5BA2\\u6237\\u7AEF IP"},{value:"clientCountry",label:"\\u5BA2\\u6237\\u7AEF\\u5730\\u7406\\u4F4D\\u7F6E\\uFF08\\u56FD\\u5BB6/\\u5730\\u533A\\uFF09"},{value:"userAgent",label:"User-Agent\\uFF08\\u5BA2\\u6237\\u7AEF\\u6D4F\\u89C8\\u5668\\u6807\\u8BC6\\uFF09"},{value:"referer",label:"Referer\\uFF08\\u6765\\u6E90\\u9875\\u9762\\uFF09"},{value:"origin",label:"\\u56DE\\u6E90\\u76EE\\u6807\\uFF08\\u6E90\\u7AD9 ID\\uFF0C\\u7531 \\u2462 \\u9996\\u8981\\u5206\\u6D41\\u6309\\u8D1F\\u8F7D\\u5747\\u8861\\u9009\\u51FA\\uFF09"},{value:"originAddr",label:"\\u56DE\\u6E90\\u76EE\\u6807\\u5730\\u5740\\uFF08\\u6E90\\u7AD9 addr\\uFF0C\\u7531 \\u2462 \\u9996\\u8981\\u5206\\u6D41\\u9009\\u51FA\\uFF09"}],gs=[{value:"equal",label:"\\u7B49\\u4E8E"},{value:"notEqual",label:"\\u4E0D\\u7B49\\u4E8E"},{value:"contain",label:"\\u5305\\u542B"},{value:"notContain",label:"\\u4E0D\\u5305\\u542B"},{value:"prefix",label:"\\u524D\\u7F00\\u4E3A"},{value:"notPrefix",label:"\\u524D\\u7F00\\u4E0D\\u4E3A"},{value:"suffix",label:"\\u540E\\u7F00\\u4E3A"},{value:"notSuffix",label:"\\u540E\\u7F00\\u4E0D\\u4E3A"},{value:"regex",label:"\\u6B63\\u5219\\u5339\\u914D"},{value:"notRegex",label:"\\u6B63\\u5219\\u4E0D\\u5339\\u914D"},{value:"exists",label:"\\u5B58\\u5728"},{value:"notExists",label:"\\u4E0D\\u5B58\\u5728"}],vs=["header","cookie","query"],bs=["exists","notExists"],We=null;function ze(t,n,s,o){o=o||{};let a=o.allowedOps?new Set(o.allowedOps):null,l=!!o.hideTargetPool,d=o.globalScope===!0;t=t||{id:"",priority:0,enabled:!0,match:{conditions:[]},action:{poolId:"",rewrite:{type:"none"},cache:{enabled:!1},reqHeaders:{set:{},strip:[]},respHeaders:{set:{},strip:[]}}};let i=e("input",{type:"checkbox",checked:t.enabled!==!1}),h=e("input",{class:"input",value:t.name||"",placeholder:"\\u5982\\uFF1A\\u9759\\u6001\\u8D44\\u6E90\\u957F\\u7F13\\u5B58\\uFF08\\u9009\\u586B\\uFF09"}),p=e("input",{class:"input",value:t.note||"",placeholder:"\\u8FD9\\u6761\\u89C4\\u5219\\u4E3A\\u4EC0\\u4E48\\u8FD9\\u4E48\\u914D\\uFF08\\u9009\\u586B\\uFF09"}),g="poollist-"+(t.id||"new")+"-"+Math.random().toString(36).slice(2,7),f=e("input",{class:"input",list:g,value:t.action.poolId||"",placeholder:"\\u7559\\u7A7A=\\u7528\\u7AD9\\u70B9\\u9ED8\\u8BA4\\u6E90\\u7AD9\\uFF1B\\u6216\\u9009\\u62E9\\u672C\\u89C4\\u5219\\u4E13\\u7528\\u7684\\u6E90\\u7AD9"}),r=e("datalist",{id:g},n.map(u=>e("option",{value:u.value,label:u.label}))),c=Pt(t.match||{});t={...t,match:c};let m=Ft(t.match.conditions),x=[{group:"\\u7F13\\u5B58\\u914D\\u7F6E",items:[{value:"cache",label:"\\u8282\\u70B9\\u7F13\\u5B58 TTL / \\u7F13\\u5B58\\u6A21\\u5F0F"}]},{group:"HTTPS \\u4F18\\u5316",items:[{value:"forceHttps",label:"\\u5F3A\\u5236 HTTPS \\u8BBF\\u95EE"},{value:"redirect",label:"\\u8BBF\\u95EE URL \\u91CD\\u5B9A\\u5411"},{value:"directResponse",label:"\\u81EA\\u5B9A\\u4E49\\u54CD\\u5E94\\uFF08\\u76F4\\u63A5\\u5E94\\u7B54\\uFF09"}]},{group:"\\u4FEE\\u6539 HTTP \\u5934",items:[{value:"reqHeaders",label:"\\u56DE\\u6E90\\u8BF7\\u6C42\\u5934"},{value:"respHeaders",label:"\\u8282\\u70B9\\u54CD\\u5E94\\u5934"},{value:"hostHeader",label:"\\u56DE\\u6E90 Host"},{value:"clientIp",label:"\\u5BA2\\u6237\\u7AEF IP \\u900F\\u4F20"}]},{group:"\\u7F51\\u7EDC\\u4F18\\u5316",items:[{value:"rewrite",label:"\\u8DEF\\u5F84\\u91CD\\u5199\\uFF08\\u56DE\\u6E90 URL \\u6539\\u5199\\uFF09"},{value:"followRedirect",label:"\\u56DE\\u6E90\\u8DDF\\u968F 3xx"},{value:"originTimeout",label:"\\u56DE\\u6E90\\u8D85\\u65F6"},{value:"originConn",label:"\\u56DE\\u6E90\\u8FDE\\u63A5\\u53C2\\u6570\\uFF08\\u5F15\\u64CE/\\u534F\\u8BAE/\\u7AEF\\u53E3\\uFF09"}]}],E=a?x.map(u=>({group:u.group,items:u.items.filter(w=>a.has(w.value))})).filter(u=>u.items.length):x;function v(u,w,A,b,L){let I=e("span",{class:"tw",text:"\\u25B8"}),G=e("div",{class:"section-body"},b),K=e("div",{class:"section-toggle"},[I,e("strong",{},w),A?e("span",{class:"muted",text:" "+A}):null]),q=e("div",{class:"subcard op-node",id:"op-"+u},[K,G]);return K.onclick=()=>q.classList.toggle("collapsed"),{node:q,read:L}}We={cache(u){let w=st(u.cache,{globalScope:d});return v("cache","\\u7F13\\u5B58\\u914D\\u7F6E","EO\\uFF1A\\u8282\\u70B9\\u7F13\\u5B58 TTL\\u3001\\u7F13\\u5B58\\u6A21\\u5F0F\\u3001\\u81EA\\u5B9A\\u4E49 Cache Key",[w.root],()=>({cache:w.read()}))},forceHttps(u){let w=e("input",{type:"checkbox",checked:!!u.forceHttps}),A=M("",[{value:"301",label:"301 \\u6C38\\u4E45\\u91CD\\u5B9A\\u5411"},{value:"302",label:"302 \\u4E34\\u65F6\\u91CD\\u5B9A\\u5411\\uFF08\\u9ED8\\u8BA4\\uFF09"}],String(u.forceHttpsStatus||301));A.className="input";let b=y("\\u8DF3\\u8F6C\\u65B9\\u5F0F",A),L=()=>{b.style.display=w.checked?"":"none"};w.addEventListener("change",L),L();let I=()=>({forceHttps:w.checked,forceHttpsStatus:Number(A.value)||301});return v("forceHttps","\\u5F3A\\u5236 HTTPS \\u8BBF\\u95EE","\\u5F00\\u542F\\u540E\\u5C06 HTTP \\u8BF7\\u6C42\\u8DF3\\u8F6C\\u81F3 HTTPS",[e("div",{class:"grid2"},[e("label",{class:"check"},[w,e("span",{text:"\\u542F\\u7528\\u5F3A\\u5236 HTTPS"})]),b])],I)},redirect(u){let w=u.redirect||{},A=e("input",{type:"checkbox",checked:!!w.enabled}),b=M("",[{value:"301",label:"301 \\u6C38\\u4E45\\u91CD\\u5B9A\\u5411"},{value:"302",label:"302 \\u4E34\\u65F6\\u91CD\\u5B9A\\u5411"},{value:"307",label:"307 \\u4E34\\u65F6\\uFF08\\u4FDD\\u6301\\u65B9\\u6CD5\\uFF09"},{value:"308",label:"308 \\u6C38\\u4E45\\uFF08\\u4FDD\\u6301\\u65B9\\u6CD5\\uFF09"}],String(w.status||302));b.className="input";let L=e("input",{class:"input",value:w.target||"",placeholder:"/new-path \\u6216 https://b.com/$1"}),I=e("input",{type:"checkbox",checked:w.keepQuery!==!1}),G=()=>({redirect:{enabled:A.checked,status:Number(b.value)||302,target:L.value.trim(),keepQuery:I.checked}}),K=e("div",{class:"grid2"},[y("\\u72B6\\u6001\\u7801",b),e("label",{class:"check"},[I,e("span",{text:"\\u4FDD\\u7559\\u539F\\u67E5\\u8BE2\\u4E32"})])]),q=y("\\u76EE\\u6807 URL\\uFF08\\u652F\\u6301 $1..$9 \\u5F15\\u7528\\u8DEF\\u5F84\\u6B63\\u5219\\u6355\\u83B7\\u7EC4\\uFF09",L,"\\u53EF\\u5199 ${var} \\u5185\\u7F6E\\u53D8\\u91CF\\uFF0C\\u5982 https://${host}/new/$1",[Be()]),O=()=>{K.style.display=A.checked?"":"none",q.style.display=A.checked?"":"none"};return A.addEventListener("change",O),O(),v("redirect","\\u8BBF\\u95EE URL \\u91CD\\u5B9A\\u5411","\\u547D\\u4E2D\\u540E\\u76F4\\u63A5 3xx \\u8DF3\\u8F6C\\uFF0C\\u4E0D\\u56DE\\u6E90",[e("label",{class:"check"},[A,e("span",{text:"\\u542F\\u7528\\u91CD\\u5B9A\\u5411"})]),K,q],G)},directResponse(u){let w=u.directResponse||{},A=e("input",{type:"checkbox",checked:!!w.enabled}),b=e("input",{class:"input",type:"number",value:w.status||200}),L=e("input",{class:"input",value:w.contentType||"text/html; charset=utf-8"}),I=e("textarea",{class:"input",rows:4,placeholder:"\\u54CD\\u5E94\\u5185\\u5BB9"});I.value=w.body||"";let G=()=>({directResponse:{enabled:A.checked,status:Number(b.value)||200,contentType:L.value.trim(),body:I.value}}),K=e("div",{class:"grid2"},[y("\\u72B6\\u6001\\u7801",b),y("Content-Type",L)]),q=y("\\u54CD\\u5E94\\u5185\\u5BB9",I),O=()=>{K.style.display=A.checked?"":"none",q.style.display=A.checked?"":"none"};return A.addEventListener("change",O),O(),v("directResponse","\\u81EA\\u5B9A\\u4E49\\u54CD\\u5E94","\\u547D\\u4E2D\\u540E\\u76F4\\u63A5\\u8FD4\\u56DE\\u5185\\u5BB9\\uFF0C\\u4E0D\\u56DE\\u6E90",[e("label",{class:"check"},[A,e("span",{text:"\\u542F\\u7528\\u81EA\\u5B9A\\u4E49\\u54CD\\u5E94"})]),K,q],G)},reqHeaders(u){let w=u.reqHeaders||{},A=Ke(w),b=d?Dt(w.forwardWhitelist,{label:"\\u5141\\u8BB8\\u900F\\u4F20\\u5230\\u6E90\\u7AD9\\u7684\\u5BA2\\u6237\\u7AEF\\u8BF7\\u6C42\\u5934\\uFF08\\u4E00\\u884C\\u4E00\\u4E2A\\uFF09\\uFF1A",placeholder:"accept-language",tag:"(\\u900F\\u4F20)",hint:"\\u53EA\\u6709\\u5217\\u5728\\u8FD9\\u91CC\\u7684\\u5BA2\\u6237\\u7AEF\\u8BF7\\u6C42\\u5934\\u624D\\u4F1A\\u88AB\\u5E26\\u5230\\u6E90\\u7AD9\\uFF0C\\u5176\\u4F59\\uFF08Cookie\\u3001Referer\\u3001Origin \\u7B49\\uFF09\\u4E00\\u5F8B\\u4E22\\u5F03\\u3002\\u6E05\\u7A7A\\u5219\\u8868\\u793A\\u4E00\\u4E2A\\u90FD\\u4E0D\\u900F\\u4F20\\uFF08\\u6700\\u4E25\\u683C\\uFF09\\u3002"}):null,L=d?[e("hr",{class:"sep"}),e("div",{class:"kv-label"},"\\u2014\\u2014 \\u4EE5\\u4E0B\\u4E3A\\u5168\\u7AD9\\u9ED8\\u8BA4\\u4E13\\u5C5E\\uFF08\\u4E0D\\u968F\\u5355\\u6761\\u89C4\\u5219\\u53D8\\u5316\\uFF09\\u2014\\u2014"),b.root]:[];return v("reqHeaders","\\u56DE\\u6E90\\u8BF7\\u6C42\\u5934","\\u8F6C\\u53D1\\u5230\\u6E90\\u7AD9\\u524D\\u4FEE\\u6539",[A.root,...L],()=>{let I=A.read();return d&&(I.forwardWhitelist=b.read()),{reqHeaders:I}})},respHeaders(u){let w=Ke(u.respHeaders);return v("respHeaders","\\u8282\\u70B9\\u54CD\\u5E94\\u5934","\\u8FD4\\u56DE\\u7ED9\\u5BA2\\u6237\\u7AEF\\u524D\\u4FEE\\u6539",[w.root],()=>({respHeaders:w.read()}))},hostHeader(u){let w=u.hostHeader||{mode:"inherit",custom:""},A=M("",[{value:"inherit",label:"\\u7EE7\\u627F\\uFF08\\u7528\\u7AD9\\u70B9\\u9ED8\\u8BA4\\u56DE\\u6E90 Host\\uFF09"},{value:"origin",label:"\\u6E90\\u7AD9\\u57DF\\u540D"},{value:"client",label:"\\u5BA2\\u6237\\u7AEF Host"},{value:"custom",label:"\\u81EA\\u5B9A\\u4E49"}],w.mode||"inherit");A.className="input";let b=e("input",{class:"input",value:w.custom||"",placeholder:"origin.example.com"}),L=y("\\u81EA\\u5B9A\\u4E49\\u503C",b,"\\u652F\\u6301 ${var} \\u53D8\\u91CF\\uFF0C\\u5982 ${host}",[Be()]),I=()=>{L.style.display=A.value==="custom"?"":"none"};A.addEventListener("change",I),I();let G=()=>({hostHeader:{mode:A.value,custom:A.value==="custom"?b.value.trim():""}});return v("hostHeader","\\u56DE\\u6E90 Host","\\u91CD\\u5199\\u56DE\\u6E90 Host \\u5934",[y("\\u6A21\\u5F0F",A),L],G)},clientIp(u){let w=u.clientIpHeader||{},A=e("input",{type:"checkbox",checked:!!w.enabled}),b=e("input",{class:"input",value:w.name||"X-EdgeGateway-Client-IP",placeholder:"X-EdgeGateway-Client-IP"}),L=()=>({clientIpHeader:{enabled:A.checked,name:b.value.trim()||"X-EdgeGateway-Client-IP"}}),I=y("\\u5B58\\u653E\\u5BA2\\u6237\\u7AEF IP \\u7684\\u5934\\u90E8\\u540D",b),G=()=>{I.style.display=A.checked?"":"none"};return A.addEventListener("change",G),G(),v("clientIp","\\u5BA2\\u6237\\u7AEF IP \\u900F\\u4F20","\\u5C06\\u771F\\u5B9E\\u5BA2\\u6237\\u7AEF IP \\u5199\\u5165\\u6307\\u5B9A\\u56DE\\u6E90\\u5934\\uFF08\\u9ED8\\u8BA4 X-EdgeGateway-Client-IP\\uFF09\\uFF0C\\u4F9B\\u6E90\\u7AD9\\u8BC6\\u522B\\u8BBF\\u5BA2",[e("label",{class:"check"},[A,e("span",{text:"\\u5411\\u6E90\\u7AD9\\u900F\\u4F20\\u5BA2\\u6237\\u7AEF IP"})]),I],L)},rewrite(u){let w=ot(u.rewrite);return v("rewrite","\\u8DEF\\u5F84\\u91CD\\u5199","\\u6539\\u5199\\u56DE\\u6E90 URL \\u8DEF\\u5F84",[w.root],()=>({rewrite:w.read()}))},followRedirect(u){let w=e("input",{type:"checkbox",checked:!!u.followRedirect}),A=()=>({followRedirect:w.checked});return v("followRedirect","\\u56DE\\u6E90\\u8DDF\\u968F 3xx \\u91CD\\u5B9A\\u5411","",[e("div",{class:"grid2"},[e("label",{class:"check"},[w,e("span",{text:"\\u56DE\\u6E90\\u8DDF\\u968F 3xx \\u91CD\\u5B9A\\u5411"})])])],A)},originTimeout(u){let w=e("input",{class:"input",type:"number",value:u.originTimeoutMs||0,placeholder:"\\u6BEB\\u79D2\\uFF0C0=\\u6CBF\\u7528\\u6E90\\u7AD9\\u8BBE\\u7F6E"}),A=()=>({originTimeoutMs:Number(w.value)||0});return v("originTimeout","\\u56DE\\u6E90\\u8D85\\u65F6","",[y("\\u56DE\\u6E90\\u8D85\\u65F6\\uFF08\\u6BEB\\u79D2\\uFF0C0=\\u6CBF\\u7528\\u6E90\\u7AD9\\uFF09",w)],A)},originConn(u){let w=M("",[{value:"",label:"\\u6CBF\\u7528\\u6E90\\u7AD9\\u5F15\\u64CE"},{value:"fetch",label:"fetch\\uFF08HTTP \\u56DE\\u6E90\\uFF09"},{value:"socket",label:"socket\\uFF08TCP \\u900F\\u4F20\\uFF0C\\u4EC5 CF\\uFF09"},{value:"r2",label:"r2\\uFF08R2 \\u76F4\\u8BFB\\uFF0C\\u4EC5 CF\\uFF09"}],u.engine||"");w.className="input";let A=M("",[{value:"",label:"\\u6CBF\\u7528\\u6E90\\u7AD9\\u534F\\u8BAE"},{value:"https",label:"https"},{value:"http",label:"http"}],u.scheme||"");A.className="input";let b=e("input",{class:"input",type:"number",value:u.port||0,placeholder:"0=\\u6CBF\\u7528\\u6E90\\u7AD9\\u7AEF\\u53E3"}),L=()=>({engine:w.value||"",scheme:A.value||"",port:Number(b.value)||0});return v("originConn","\\u56DE\\u6E90\\u8FDE\\u63A5\\u53C2\\u6570","\\u8986\\u76D6\\u672C\\u6B21\\u56DE\\u6E90\\u7684\\u5F15\\u64CE / \\u534F\\u8BAE / \\u7AEF\\u53E3\\uFF08\\u7559\\u7A7A=\\u6CBF\\u7528\\u6E90\\u7AD9\\u7269\\u7406\\u5C5E\\u6027\\uFF09",[e("div",{class:"grid2"},[y("\\u56DE\\u6E90\\u5F15\\u64CE",w),y("\\u56DE\\u6E90\\u534F\\u8BAE",A)]),y("\\u56DE\\u6E90\\u7AEF\\u53E3\\uFF080=\\u6CBF\\u7528\\u6E90\\u7AD9\\uFF09",b)],L)}};function F(u){let w=new Set;return u.cache&&(u.cache.enabled||u.cache.mode==="noCache")&&w.add("cache"),u.forceHttps&&w.add("forceHttps"),u.redirect&&u.redirect.enabled&&w.add("redirect"),u.directResponse&&u.directResponse.enabled&&w.add("directResponse"),u.reqHeaders&&w.add("reqHeaders"),u.respHeaders&&w.add("respHeaders"),u.hostHeader&&u.hostHeader.mode&&u.hostHeader.mode!=="inherit"&&w.add("hostHeader"),u.clientIpHeader&&u.clientIpHeader.enabled&&w.add("clientIp"),u.rewrite&&u.rewrite.type&&u.rewrite.type!=="none"&&w.add("rewrite"),u.followRedirect&&w.add("followRedirect"),Number(u.originTimeoutMs)>0&&w.add("originTimeout"),(u.engine||u.scheme||Number(u.port)>0)&&w.add("originConn"),w}let $=e("div",{class:"ops-list"}),H=[],k=new Set;function T(u){if(!We[u]||a&&!a.has(u))return;if(k.has(u)){let b=document.getElementById("op-"+u);b&&b.classList.remove("collapsed");return}let w=We[u](t.action);k.add(u),H.push(w.read);let A=e("button",{class:"btn btn-sm btn-danger op-remove",text:"\\u79FB\\u9664"});A.onclick=b=>{b.stopPropagation(),w.node.remove();let L=H.indexOf(w.read);L>=0&&H.splice(L,1),k.delete(u)},w.node.querySelector(".section-toggle").appendChild(A),$.appendChild(w.node),U(),w.node.scrollIntoView({behavior:"smooth",block:"center"})}let R=At(E,"");R.className="input",R.addEventListener("change",()=>{let u=R.value;u&&(T(u),R.value="")});let _=!!(t&&t.id),B=e("div",{class:"rule-card"+(_?" collapsed":""),id:"rule-"+(t.id||"new")},[e("div",{class:"rule-head"},[e("span",{class:"rule-grip",text:"\\u283F",title:"\\u62D6\\u62FD\\u8C03\\u6574\\u987A\\u5E8F"}),e("span",{class:"rule-tw",text:"\\u25B8"}),e("span",{class:"rule-name-label",text:t&&t.name||(_?"\\uFF08\\u672A\\u547D\\u540D\\u89C4\\u5219\\uFF09":"\\u65B0\\u5EFA\\u89C4\\u5219")}),e("label",{class:"check"},[i,e("span",{text:"\\u542F\\u7528"})]),e("span",{class:"rule-prio-hint",text:"\\u987A\\u5E8F\\u9760\\u62D6\\u62FD\\u8C03\\u6574"}),e("button",{class:"btn btn-sm btn-danger",text:"\\u5220\\u9664",onclick:u=>{u.stopPropagation(),B.remove()}})]),e("div",{class:"rule-detail"},[y("\\u89C4\\u5219\\u540D\\u79F0",h,"\\u7ED9\\u8FD9\\u6761\\u89C4\\u5219\\u8D77\\u4E2A\\u4E00\\u773C\\u80FD\\u770B\\u61C2\\u7684\\u540D\\u5B57\\uFF0C\\u4F1A\\u663E\\u793A\\u5728\\u6D41\\u91CF\\u5E8F\\u5217\\u91CC\\u3002"),y("\\u5907\\u6CE8",p,"\\u8BB0\\u4E0B\\u8FD9\\u4E48\\u914D\\u7684\\u539F\\u56E0\\uFF0C\\u65B9\\u4FBF\\u65E5\\u540E\\u81EA\\u5DF1\\u6216\\u540C\\u4E8B\\u56DE\\u770B\\u3002"),ve("\\u5339\\u914D\\u6761\\u4EF6\\uFF08\\u51B3\\u5B9A\\u54EA\\u4E9B\\u8BF7\\u6C42\\u547D\\u4E2D\\u6B64\\u89C4\\u5219\\uFF09","\\u6BCF\\u4E2A\\u6761\\u4EF6\\u7EC4\\u5185\\u7684\\u591A\\u6761\\u6761\\u4EF6\\u4E3A\\u300C\\u4E0E\\u300D\\u5173\\u7CFB\\uFF0C\\u591A\\u4E2A\\u6761\\u4EF6\\u7EC4\\u4E4B\\u95F4\\u4E3A\\u300C\\u6216\\u300D\\u5173\\u7CFB",[m.root]),ve("\\u64CD\\u4F5C\\uFF08\\u547D\\u4E2D\\u540E\\u6267\\u884C\\u7684\\u64CD\\u4F5C\\uFF09",a?"\\u672C\\u62BD\\u5C49\\u4EC5\\u5141\\u8BB8\\u914D\\u7F6E\\u300C"+o.title+"\\u300D\\u6240\\u5C5E\\u7684\\u6700\\u5C0F\\u4EFB\\u52A1\\u5305\\u3002\\u8BE5\\u9636\\u6BB5\\u6240\\u6709\\u53EF\\u7528\\u64CD\\u4F5C\\u5DF2\\u76F4\\u63A5\\u5217\\u4E8E\\u4E0B\\u65B9\\uFF0C\\u65E0\\u9700\\u518D\\u70B9\\u300C\\u6DFB\\u52A0\\u64CD\\u4F5C\\u300D\\u3002":"\\u5148\\u9009\\u300C\\u76EE\\u6807\\u6E90\\u7AD9\\u300D\\uFF0C\\u518D\\u70B9\\u300C\\u6DFB\\u52A0\\u64CD\\u4F5C\\u300D\\u52A0\\u5165\\u9700\\u8981\\u7684\\u52A8\\u4F5C\\uFF1B\\u6BCF\\u4E2A\\u52A8\\u4F5C\\u662F\\u72EC\\u7ACB\\u5361\\u7247\\uFF0C\\u672A\\u6DFB\\u52A0\\u7684\\u4E0D\\u663E\\u793A",[...l?[]:[y("\\u76EE\\u6807\\u6E90\\u7AD9\\uFF08\\u8FD9\\u6761\\u89C4\\u5219\\u547D\\u4E2D\\u540E\\u56DE\\u5230\\u54EA\\u53F0\\u540E\\u7AEF\\uFF09",e("div",{},[f,r]),"\\u51B3\\u5B9A\\u300C\\u547D\\u4E2D\\u6761\\u4EF6\\u7684\\u8BF7\\u6C42\\u300D\\u56DE\\u6E90\\u5230\\u54EA\\u4E2A\\u6E90\\u7AD9\\uFF1A\\u7559\\u7A7A\\u5219\\u56DE\\u9000\\u5230\\u7AD9\\u70B9\\u9ED8\\u8BA4\\u6E90\\u7AD9\\uFF1B\\u4E5F\\u53EF\\u4ECE\\u300C\\u6E90\\u7AD9\\u300D\\u9875\\u5DF2\\u6709\\u7684\\u5355\\u4E00\\u6E90\\u7AD9 / \\u6E90\\u7AD9\\u6C60\\u91CC\\u9009\\u4E00\\u4E2A\\u3002\\u7B80\\u5355\\u7AD9\\u4E00\\u822C\\u4E0D\\u7528\\u6539\\uFF0C\\u7559\\u7A7A\\u5373\\u53EF\\u3002")],...a?[]:E.length?[e("div",{class:"op-add"},[e("span",{class:"op-add-label",text:"\\u6DFB\\u52A0\\u64CD\\u4F5C\\uFF1A"}),R])]:[e("div",{class:"hint"},"\\u672C\\u4EFB\\u52A1\\u5305\\u6CA1\\u6709\\u53EF\\u6DFB\\u52A0\\u7684\\u5B50\\u64CD\\u4F5C\\uFF08\\u4EC5\\u300C\\u76EE\\u6807\\u6E90\\u7AD9\\u300D\\u4E00\\u9879\\uFF09\\u3002")],$])])]);B.querySelector(".rule-head").addEventListener("click",()=>B.classList.toggle("collapsed"));let U=()=>B.classList.remove("collapsed");return a?a.forEach(u=>T(u)):F(t.action).forEach(u=>T(u)),{card:B,read:()=>{let u=a?JSON.parse(JSON.stringify(t.action||{})):{};(!a||!l)&&(u.poolId=f.value);for(let A of H)Object.assign(u,A());let w=o.stage;return{id:t.id||"r"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:h.value.trim(),note:p.value.trim(),enabled:i.checked,priority:t.priority||0,stage:w,match:{conditions:m.read()},action:u}}}}function Ot(t){return We?We[t]:null}var pn=t=>t&&typeof t=="object"&&!Array.isArray(t),at={rewrite:["rewrite"],redirect:["redirect"],terminate:["forceHttps","forceHttpsStatus","directResponse"],reqHeaders:["reqHeaders"],origin:["hostHeader","clientIp","followRedirect","originTimeout","originConn"],cache:["cache"],respHeaders:["respHeaders"]},hn=new Set(["id","name","note","priority","match","enabled","stage"]);function _t(t){let n=at[t];return Array.isArray(n)&&n.length===1&&n[0]===t}function Ve(t,n){let s=n&&typeof n=="object"?n:{};return _t(t)?{[t]:s}:{...s}}function Nt(t,n){let s=n&&typeof n=="object"?n:{};if(_t(t))return pn(s[t])?{...s[t]}:{};let o={},a=at[t]||[];for(let l of a)l in s&&(o[l]=s[l]);for(let l of Object.keys(s))hn.has(l)||l in o||(o[l]=s[l]);return o}async function lt(t,n){if(mt(t))return gt(t);let s=t&&V[t]?t:"cache",o={...V[s],stage:s,allowedOps:(at[s]||V[s].allowedOps||[]).slice(),hideTargetPool:!0,globalScope:!0},a=j||{};if(!a[s])try{let E=await N.rules.global();a=E&&E.stages||{}}catch(E){P("\\u8BFB\\u53D6\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u5931\\u8D25\\uFF1A"+(E&&E.message?E.message:"\\u672A\\u77E5\\u9519\\u8BEF"),"err");return}let l=De(),d=a[s]||{},i={id:"__global__",priority:0,enabled:!0,name:"\\u5168\\u7AD9\\u515C\\u5E95\\u9ED8\\u8BA4",note:"\\u5185\\u7F6E\\u4FDD\\u5B88\\u9ED8\\u8BA4\\uFF0C\\u53EF\\u81EA\\u7531\\u4FEE\\u6539\\u3002",match:{conditions:[]},action:Ve(s,d)},h=e("div",{class:"rules-box"}),{card:p,read:g}=ze(i,l,null,o);h.appendChild(p);let f=e("button",{class:"btn btn-sm",text:"\\u21BA \\u6062\\u590D\\u8BE5\\u9636\\u6BB5\\u5185\\u7F6E\\u9ED8\\u8BA4"});f.onclick=()=>{h.innerHTML="";let E=ze(null,l,null,o);h.appendChild(E.card),r=E.read,P("\\u5DF2\\u6062\\u590D\\u8BE5\\u9636\\u6BB5\\u5185\\u7F6E\\u9ED8\\u8BA4\\uFF0C\\u8BB0\\u5F97\\u70B9\\u4FDD\\u5B58","ok")};let r=null,c=e("p",{class:"hint"},"\\u5168\\u7AD9\\u515C\\u5E95\\u9ED8\\u8BA4\\u52A8\\u4F5C\\uFF1A\\u5BF9\\u4EFB\\u4F55\\u7AD9\\u70B9\\u90FD\\u751F\\u6548\\uFF0C\\u4EC5\\u5F53\\u67D0\\u7AD9\\u70B9\\u7684\\u81EA\\u8EAB\\u89C4\\u5219\\u5728\\u8BE5\\u9636\\u6BB5\\u65E0\\u8BBE\\u7F6E\\u65F6\\u624D\\u89E6\\u53D1\\uFF0C\\u76F8\\u5F53\\u4E8E\\u5168\\u5C40\\u9ED8\\u8BA4\\u8BBE\\u7F6E\\uFF08EO \\u7684\\u5168\\u5C40\\u89C4\\u5219\\u6982\\u5FF5\\uFF09\\u3002\\u672C\\u62BD\\u5C49\\u53EA\\u7F16\\u8F91\\u300C"+o.title+"\\u300D\\u8FD9\\u4E00\\u9636\\u6BB5\\u7684\\u9ED8\\u8BA4\\u52A8\\u4F5C\\uFF08\\u6BCF\\u9636\\u6BB5\\u6070\\u597D 1 \\u6761\\u3001\\u65E0\\u6761\\u4EF6\\uFF09\\uFF0C\\u4FDD\\u5B58\\u5373\\u8986\\u76D6\\u8BE5\\u9636\\u6BB5\\u9ED8\\u8BA4\\u503C\\u3002"),m=e("div",{class:"drawer-body"},[c,e("div",{class:"subhead"},[e("span",{},"\\u5168\\u7AD9\\u515C\\u5E95\\u9ED8\\u8BA4 \\xB7 "+o.title),f]),h]),x=async()=>{let E=(r||g)(),v={...a};v[s]=Nt(s,E.action||{});try{await N.rules.saveGlobal({stages:v}),P("\\u5DF2\\u4FDD\\u5B58\\u5168\\u7AD9\\u515C\\u5E95\\u9ED8\\u8BA4","ok");for(let F of Object.keys(j))delete j[F];Object.assign(j,v),te()}catch(F){P("\\u4FDD\\u5B58\\u5931\\u8D25\\uFF1A"+(F&&F.message?F.message:"\\u672A\\u77E5\\u9519\\u8BEF"),"err")}};le("\\u5168\\u7AD9\\u515C\\u5E95\\u9ED8\\u8BA4 \\xB7 "+o.title,"\\u7F16\\u8F91\\u8BE5\\u9636\\u6BB5\\u5BF9\\u6240\\u6709\\u7AD9\\u70B9\\u751F\\u6548\\u7684\\u9ED8\\u8BA4\\u52A8\\u4F5C\\uFF08\\u515C\\u5E95\\uFF09",m,x)}async function gt(t){let n=Pe[t];if(!n){P("\\u672A\\u77E5\\u7684\\u5168\\u7AD9\\u9636\\u6BB5\\uFF1A"+t,"err");return}let s=j||{};if(!s[t])try{let f=await N.rules.global();s=f&&f.stages||{}}catch(f){P("\\u8BFB\\u53D6\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u5931\\u8D25\\uFF1A"+(f&&f.message?f.message:"\\u672A\\u77E5\\u9519\\u8BEF"),"err");return}let o=s[t]&&typeof s[t]=="object"?s[t]:{},a=(f,r)=>r.split(".").reduce((c,m)=>c?.[m],f),l=(f,r,c)=>{let m=r.split("."),x=f;for(let E=0;E<m.length-1;E++)(!x[m[E]]||typeof x[m[E]]!="object")&&(x[m[E]]={}),x=x[m[E]];x[m[m.length-1]]=c},d=[],i=(n.fields||[]).map(f=>{let r=a(o,f.path),c;f.type==="select"?(c=M("",f.options||[],r==null?"":String(r)),c.className="input"):f.type==="number"?c=e("input",{class:"input",type:"number",value:r==null?"":String(r),...f.min!==void 0?{min:String(f.min)}:{},...f.max!==void 0?{max:String(f.max)}:{}}):f.type==="textarea"?c=e("textarea",{class:"input",rows:"8",value:r==null?"":String(r)}):c=e("input",{class:"input",value:r==null?"":String(r)}),d.push({path:f.path,type:f.type,input:c});let m=[];if(f.type==="number"&&/Ms$/.test(f.path)){let x=e("div",{class:"field-hint muted"}),E=()=>{let v=Number(c.value);x.textContent=Number.isFinite(v)&&v>0?"\\u2248 "+Ce(Math.round(v/1e3)):""};c.addEventListener("input",E),E(),m.push(x)}else if(f.type==="number"&&/Sec$/.test(f.path)){let x=e("div",{class:"field-hint muted"}),E=()=>{let v=Number(c.value);x.textContent=Number.isFinite(v)&&v>0?"\\u2248 "+Ce(v):""};c.addEventListener("input",E),E(),m.push(x)}return y(f.label,c,f.hint||"",m)}),h=e("button",{class:"btn btn-sm",text:"\\u21BA \\u6062\\u590D\\u5185\\u7F6E\\u9ED8\\u8BA4"});h.onclick=()=>{d.forEach(f=>{f.type!=="select"&&(f.input.value="",f.input.dispatchEvent(new Event("input")))}),P("\\u5DF2\\u6E05\\u7A7A\\uFF0C\\u4FDD\\u5B58\\u540E\\u5C06\\u6062\\u590D\\u5185\\u7F6E\\u9ED8\\u8BA4","ok")};let p=e("div",{class:"drawer-body"},[e("p",{class:"hint"},"\\u8FD9\\u4E00\\u7EC4\\u53C2\\u6570\\u5BF9\\u6240\\u6709\\u7AD9\\u70B9\\u751F\\u6548\\uFF0C\\u5C5E\\u4E8E\\u5168\\u7AD9\\u57FA\\u7EBF\\u8BBE\\u7F6E\\uFF08\\u4E0D\\u80FD\\u6309 URL \\u5DEE\\u5F02\\u5316\\uFF0C\\u6240\\u4EE5\\u4E0D\\u653E\\u5728\\u8DEF\\u7531\\u89C4\\u5219\\u91CC\\uFF09\\u3002\\u7559\\u7A7A\\u7684\\u5B57\\u6BB5\\u4FDD\\u5B58\\u65F6\\u4F1A\\u81EA\\u52A8\\u586B\\u56DE\\u5185\\u7F6E\\u9ED8\\u8BA4\\u503C\\u3002"),e("div",{class:"subhead"},[e("span",{},"\\u5168\\u7AD9\\u9ED8\\u8BA4 \\xB7 "+n.title),h]),e("div",{},i)]),g=async()=>{let f={};for(let c of d){let m=c.input.value;if(c.type==="number"){let x=Number(m);m!==""&&Number.isFinite(x)&&l(f,c.path,x)}else m!==""&&l(f,c.path,m)}let r={...s,[t]:f};try{let c=await N.rules.saveGlobal({stages:r});P("\\u5DF2\\u4FDD\\u5B58\\u5168\\u7AD9\\u9ED8\\u8BA4\\u8BBE\\u7F6E","ok");let m=c&&c.stages||r;for(let x of Object.keys(j))delete j[x];Object.assign(j,m),te()}catch(c){P("\\u4FDD\\u5B58\\u5931\\u8D25\\uFF1A"+(c&&c.message?c.message:"\\u672A\\u77E5\\u9519\\u8BEF"),"err")}};le("\\u5168\\u7AD9\\u9ED8\\u8BA4 \\xB7 "+n.title,"\\u7F16\\u8F91\\u5BF9\\u6240\\u6709\\u7AD9\\u70B9\\u751F\\u6548\\u7684\\u5168\\u7AD9\\u57FA\\u7EBF\\u53C2\\u6570",p,g)}async function Ut(t,n,s){if(t==="__global__"||t==="__all__"){P("\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u8BF7\\u4F7F\\u7528\\u5168\\u7AD9\\u89C4\\u5219\\u7F16\\u8F91\\u5668","info");return}if(!t){P("\\u8BF7\\u5148\\u521B\\u5EFA\\u7AD9\\u70B9","err");return}let o;try{o=await N.sites.get(t)}catch(i){P(i.message,"err");return}let a=Math.max(0,Number(o.cacheGen)||0),l=e("input",{type:"checkbox"}),d=e("div",{},[e("div",{class:"subhead"},[e("span",{},"\\u246B \\u7F13\\u5B58\\u952E \\xB7 \\u6E05\\u7A7A\\u7F13\\u5B58")]),e("div",{class:"hint"},"\\u5728\\u8FD9\\u91CC\\u53EF\\u4EE5\\u4E00\\u952E\\u6E05\\u7A7A\\u672C\\u7AD9\\u70B9\\u5728\\u8FB9\\u7F18\\u8282\\u70B9\\u4E0A\\u7684\\u5168\\u90E8\\u7F13\\u5B58\\uFF1A\\u52FE\\u9009\\u540E\\u4FDD\\u5B58\\uFF0C\\u8BBF\\u5BA2\\u7684\\u4E0B\\u4E00\\u6B21\\u8BBF\\u95EE\\u4F1A\\u91CD\\u65B0\\u56DE\\u6E90\\u53D6\\u6700\\u65B0\\u5185\\u5BB9\\u3002\\u9002\\u5408\\u521A\\u66F4\\u65B0\\u4E86\\u9875\\u9762 / \\u56FE\\u7247\\u3001\\u4F46\\u8BBF\\u5BA2\\u8FD8\\u770B\\u5230\\u65E7\\u7248\\u672C\\u7684\\u60C5\\u51B5\\u3002"),e("label",{class:"check"},[l,e("span",{text:"\\u6E05\\u7A7A\\u8BE5\\u7AD9\\u70B9\\u7684\\u5168\\u90E8\\u8FB9\\u7F18\\u7F13\\u5B58\\uFF08\\u7ACB\\u5373\\u751F\\u6548\\uFF0C\\u4E0D\\u53EF\\u64A4\\u9500\\uFF09"})]),e("div",{class:"hint"},`\\u5F53\\u524D\\u7F13\\u5B58\\u7248\\u672C\\uFF1A\\u7B2C ${a+1} \\u7248\\uFF08\\u5DF2\\u6E05\\u7A7A\\u8FC7 ${a} \\u6B21\\uFF09\\u3002\\u6E05\\u7A7A\\u4E0D\\u4F1A\\u6539\\u52A8\\u4EFB\\u4F55\\u7F13\\u5B58\\u7B56\\u7565\\uFF0C\\u53EA\\u662F\\u8BA9\\u65E7\\u7F13\\u5B58\\u7ACB\\u523B\\u5931\\u6548\\u3002`),e("div",{class:"hint"},`\\u672C\\u7AD9\\u70B9\\u7684\\u7F13\\u5B58\\u89C4\\u5219\\u5171 ${n} \\u6761${s?"\\uFF08\\u5DF2\\u542F\\u7528\\u8282\\u70B9\\u7F13\\u5B58\\uFF09":"\\uFF08\\u672A\\u542F\\u7528\\u8282\\u70B9\\u7F13\\u5B58\\uFF0C\\u6E05\\u7A7A\\u540E\\u4E5F\\u4E0D\\u4F1A\\u4EA7\\u751F\\u65B0\\u7F13\\u5B58\\uFF09"}\\u3002\\u7F13\\u5B58\\u65F6\\u957F\\u3001\\u662F\\u5426\\u7F13\\u5B58\\u7B49\\u8BBE\\u7F6E\\u5C5E\\u4E8E\\u300CCache Rules\\uFF08\\u7F13\\u5B58\\u89C4\\u5219\\uFF09\\u300D\\u9636\\u6BB5\\uFF0C\\u8BF7\\u5230\\u8BE5\\u9636\\u6BB5\\u7684\\u89C4\\u5219\\u62BD\\u5C49\\u91CC\\u8C03\\u6574\\u3002`)]);le("\\u246B \\u7F13\\u5B58\\u952E: "+t,"\\u4E00\\u952E\\u6E05\\u7A7A\\u672C\\u7AD9\\u70B9\\u7684\\u8FB9\\u7F18\\u7F13\\u5B58\\u3002",d,async()=>{if(!l.checked){P("\\u672A\\u52FE\\u9009\\u300C\\u6E05\\u7A7A\\u7F13\\u5B58\\u300D\\uFF0C\\u65E0\\u6539\\u52A8","info");return}try{await N.sites.saveBasics(t,{cacheGen:a+1}),P("\\u5DF2\\u6E05\\u7A7A\\u8BE5\\u7AD9\\u70B9\\u7F13\\u5B58\\uFF0C\\u8BBF\\u5BA2\\u4E0B\\u6B21\\u8BBF\\u95EE\\u5C06\\u91CD\\u65B0\\u56DE\\u6E90","ok"),await te()}catch(i){P(i.message,"err")}})}async function Mt(){let t=e("div",{class:"section seq-page"});if(!D.sites.length)return t.appendChild(e("h3",{},"\\u6D41\\u91CF\\u5E8F\\u5217")),t.appendChild(e("p",{class:"empty"},"\\u6682\\u65E0\\u7AD9\\u70B9\\uFF0C\\u8BF7\\u5148\\u5728\\u300C\\u7AD9\\u70B9\\u7BA1\\u7406\\u300D\\u4E2D\\u521B\\u5EFA\\u7AD9\\u70B9\\u3002")),t;let n="__all__",s=decodeURIComponent(location.hash.split("?host=")[1]||""),o=s&&(s===n||s==="__global__"||D.sites.some(r=>r.host===s))?s:D.sites[0].host;t.appendChild(e("div",{class:"section-head"},[e("h3",{},"\\u6D41\\u91CF\\u5E8F\\u5217"),e("div",{class:"seq-pick"},[e("label",{class:"muted",text:"\\u7AD9\\u70B9\\uFF1A"}),(()=>{let r=M("",[{value:n,label:"\\u5168\\u90E8\\u7AD9\\u70B9\\u603B\\u89C8\\uFF08\\u8DE8\\u57DF\\u540D\\uFF09"},{value:"__global__",label:"\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\uFF08\\u515C\\u5E95\\u9ED8\\u8BA4\\uFF09"},...D.sites.map(c=>({value:c.host,label:c.host}))],o);return r.className="input",r})()])])),t.appendChild(e("p",{class:"hint"},"\\u672C\\u56FE\\u662F\\u8BF7\\u6C42\\u4ECE\\u8FDB\\u5165\\u7F51\\u5173\\u5230\\u8FD4\\u56DE\\u6D4F\\u89C8\\u5668\\u7684\\u5B8C\\u6574\\u5904\\u7406\\u987A\\u5E8F\\uFF08\\u987A\\u5E8F\\u56FA\\u5B9A\\u3001\\u4E0D\\u53EF\\u66F4\\u6539\\uFF09\\uFF0C\\u5171 18 \\u4E2A\\u9636\\u6BB5\\uFF0C\\u91C7\\u7528 Cloudflare \\u6D41\\u91CF\\u5E8F\\u5217\\u98CE\\u683C\\uFF1A\\u6BCF\\u4E2A\\u9636\\u6BB5\\u5361\\u7247\\u672C\\u8EAB\\u5C31\\u662F\\u4E00\\u4E2A\\u72EC\\u7ACB\\u7684\\u89C4\\u5219\\u5F15\\u64CE\\u6216\\u914D\\u7F6E\\u5165\\u53E3\\uFF0C\\u9636\\u6BB5\\u4E4B\\u95F4\\u76F8\\u4E92\\u72EC\\u7ACB\\uFF08AND\\uFF09\\uFF0C\\u9636\\u6BB5\\u5185\\u90E8\\u53EF\\u6709\\u591A\\u4E2A\\u89C4\\u5219\\u96C6\\uFF08OR\\uFF1A\\u4ECE\\u4E0A\\u5230\\u4E0B\\u5339\\u914D\\uFF0C\\u547D\\u4E2D\\u5373\\u8DF3\\u51FA\\u672C\\u9636\\u6BB5\\u8FDB\\u5165\\u4E0B\\u4E00\\u9636\\u6BB5\\uFF09\\u3002\\u67D0\\u9636\\u6BB5\\u7AD9\\u70B9\\u672A\\u505A\\u4EFB\\u4F55\\u8BBE\\u7F6E\\u65F6\\uFF0C\\u81EA\\u52A8\\u56DE\\u843D\\u300C\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u300D\\u4F5C\\u4E3A\\u5B9E\\u9645\\u751F\\u6548\\uFF08\\u770B\\u5361\\u7247\\u4E0A\\u7684\\u300C\\u56DE\\u843D\\u5168\\u7AD9\\u515C\\u5E95\\u300D\\u63D0\\u793A\\uFF09\\u3002\\u70B9\\u51FB\\u9636\\u6BB5\\u5361\\u7247\\u6216\\u5176\\u4E2D\\u89C4\\u5219\\u5373\\u53EF\\u7F16\\u8F91\\u3002"));let a=S("select",t),l=e("div",{class:"seq-flow"});t.appendChild(l);try{let r=await N.rules.global().catch(()=>null),c=r&&r.stages||{};for(let m of Object.keys(j))delete j[m];Object.assign(j,c)}catch{for(let r of Object.keys(j))delete j[r]}function d(r){let c=r.action||{},m=[],x=c.rewrite||{};x.type&&x.type!=="none"&&m.push(`URL\\u91CD\\u5199(${x.type})`),c.forceHttps&&m.push("\\u5F3A\\u5236HTTPS"),c.redirect&&c.redirect.enabled&&m.push(`\\u91CD\\u5B9A\\u5411(${c.redirect.status||302})`),c.directResponse&&c.directResponse.enabled&&m.push(`\\u81EA\\u5B9A\\u4E49\\u54CD\\u5E94(${c.directResponse.status||200})`),c.poolId&&m.push(`\\u6E90\\u7AD9\\u2192${Se(c.poolId)}`),c.hostHeader&&c.hostHeader.mode&&c.hostHeader.mode!=="accel"&&c.hostHeader.mode!=="inherit"&&m.push(`\\u56DE\\u6E90Host(${c.hostHeader.mode})`),c.clientIpHeader&&c.clientIpHeader.enabled&&m.push(`\\u5BA2\\u6237\\u7AEFIP\\u2192${c.clientIpHeader.name||"X-EdgeGateway-Client-IP"}`),c.followRedirect&&m.push("\\u56DE\\u6E90\\u8DDF\\u968F3xx"),c.originTimeoutMs&&m.push(`\\u56DE\\u6E90\\u8D85\\u65F6${c.originTimeoutMs}ms`),c.engine&&m.push(`\\u5F15\\u64CE(${c.engine})`),c.scheme&&m.push(`\\u534F\\u8BAE(${c.scheme})`),Number(c.port)>0&&m.push(`\\u7AEF\\u53E3(${c.port})`);let E=c.cache||{};E&&E.mode==="noCache"?m.push("\\u4E0D\\u7F13\\u5B58"):E&&E.enabled&&m.push("\\u7F13\\u5B58");let v=c.reqHeaders||{};(v.set&&Object.keys(v.set).length||(v.strip||[]).length)&&m.push("\\u6539\\u8BF7\\u6C42\\u5934");let F=c.respHeaders||{};return(F.set&&Object.keys(F.set).length||(F.strip||[]).length)&&m.push("\\u6539\\u54CD\\u5E94\\u5934"),m}function i(r,c){let m=(r.rules||[]).slice().sort((O,z)=>(z.priority||0)-(O.priority||0)),x=[],E=r.security||{};function v(O,z,Q,J,me,ie){let se=m.filter(Y=>ge(Y)===O),re=se.length>0,X=!re&&!!j[O],ce=re?`${se.length} \\u6761`:X?"\\u56DE\\u843D\\u5168\\u7AD9\\u515C\\u5E95":"\\u672A\\u914D\\u7F6E",be=re?`${se.length} \\u6761\\u89C4\\u5219\\uFF08\\u6309\\u4F18\\u5148\\u7EA7\\u4ECE\\u4E0A\\u5230\\u4E0B\\u5339\\u914D\\uFF0C\\u547D\\u4E2D\\u5373\\u8DF3\\u51FA\\u672C\\u9636\\u6BB5\\uFF09\\uFF1B${J}`:X?"\\u672C\\u7AD9\\u65E0\\u8BBE\\u7F6E \\u2192 \\u5B9E\\u9645\\u751F\\u6548\\u4E3A\\u300C\\u5168\\u7AD9\\u515C\\u5E95\\u9ED8\\u8BA4\\u300D\\u8BE5\\u9636\\u6BB5\\u9ED8\\u8BA4\\u52A8\\u4F5C\\uFF08\\u70B9\\u51FB\\u524D\\u5F80\\u7F16\\u8F91\\uFF09":`\\u672C\\u7AD9\\u65E0\\u8BBE\\u7F6E\\uFF0C\\u4E14\\u65E0\\u5168\\u7AD9\\u515C\\u5E95\\uFF1B${J}`,ye=ie?()=>vt(r.host,{...ie,stage:O,isEmpty:!re}):X?()=>lt(O,{...V[O],stage:O}):null,de=ie?ie.owner:X?"\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\uFF08\\u515C\\u5E95\\uFF0C\\u70B9\\u51FB\\u524D\\u5F80\\uFF09":null;l.appendChild(W(z,`${O} ${Q}`,be,ce,"sec-rules",ye,de)),re&&se.length&&l.appendChild(e("div",{class:"seq-rule-list"},se.map(Y=>{let oe=(Y.match&&Y.match.conditions||[]).reduce((Je,Ne)=>Je+Ne.length,0),fe=m.indexOf(Y),Le=se.indexOf(Y),Fe=qt(Y,d(Y),oe,r.host,c,ge(Y),Le+1);return c&&fe>=0&&x.push({node:Fe,index:fe}),Fe})))}l.appendChild(Z("\\u2460","\\u5339\\u914D\\u7AD9\\u70B9","\\u6309 Host \\u547D\\u4E2D\\u7AD9\\u70B9\\u914D\\u7F6E\\uFF0C\\u51B3\\u5B9A\\u540E\\u7EED\\u6574\\u6761\\u7BA1\\u7EBF\\u8D70\\u54EA\\u5957\\u8BBE\\u7F6E")),l.appendChild(W("\\u{1F6F0}\\uFE0F","\\u2460 \\u5339\\u914D\\u7AD9\\u70B9 matchSite",`${r.host} \\xB7 ${r.enabled===!1?"\\u5DF2\\u505C\\u7528":"\\u542F\\u7528"} \\xB7 IPv6 ${r.ipv6Support?"\\u5DF2\\u5F00\\u542F":"\\u672A\\u5F00\\u542F"}`,r.enabled===!1?"\\u5DF2\\u505C\\u7528":"\\u542F\\u7528","sec-basic",()=>we(r.host,"sec-basic"),"\\u7AD9\\u70B9\\u57FA\\u7840\\u62BD\\u5C49")),l.appendChild(Z("\\u2461","\\u5B89\\u5168\\u6821\\u9A8C checkSecurity","fail-closed\\uFF1A\\u81EA\\u8EAB\\u5F02\\u5E38\\u4E5F\\u6309 403 \\u62E6\\u622A\\uFF0C\\u7EDD\\u4E0D\\u653E\\u884C\\u3002\\u4EE5\\u4E0B 5 \\u5305\\u5168\\u90E8\\u901A\\u8FC7\\u624D\\u7EE7\\u7EED \\u2462"));let F=(E.ipBlacklist||[]).length+(E.ipWhitelist||[]).length;l.appendChild(W("\\u{1F6A7}","\\u2461.1 IP \\u8BBF\\u95EE\\u89C4\\u5219",F?`\\u9ED1\\u540D\\u5355 ${(E.ipBlacklist||[]).length} \\u6761 \\xB7 \\u767D\\u540D\\u5355 ${(E.ipWhitelist||[]).length} \\u6761`:"\\u672A\\u914D\\u7F6E IP \\u8BBF\\u95EE\\u63A7\\u5236",F?"\\u5DF2\\u914D\\u7F6E":"\\u672A\\u914D\\u7F6E","sec-ip",()=>Oe(r.host,"sec-ip"),"\\u5B89\\u5168\\u9632\\u62A4\\u62BD\\u5C49 \\xB7 IP \\u8BBF\\u95EE\\u63A7\\u5236"));let $=[];E.refererMode&&E.refererMode!=="off"&&$.push(`\\u9632\\u76D7\\u94FE ${E.refererMode==="whitelist"?"\\u767D\\u540D\\u5355":"\\u9ED1\\u540D\\u5355"} ${(E.refererList||[]).length} \\u6761`),(E.uaBlacklist||[]).length&&$.push(`UA \\u9ED1\\u540D\\u5355 ${(E.uaBlacklist||[]).length} \\u6761`),l.appendChild(W("\\u{1F6E1}\\uFE0F","\\u2461.2 WAF \\xB7 \\u81EA\\u5B9A\\u4E49\\u89C4\\u5219\\uFF08UA / Referer\\uFF09",$.length?$.join(" \\xB7 "):"\\u672A\\u914D\\u7F6E UA / Referer \\u6821\\u9A8C",$.length?"\\u5DF2\\u914D\\u7F6E":"\\u672A\\u914D\\u7F6E","sec-waf",()=>Oe(r.host,"sec-waf"),"\\u5B89\\u5168\\u9632\\u62A4\\u62BD\\u5C49 \\xB7 UA\\u9ED1\\u540D\\u5355 / \\u9632\\u76D7\\u94FE"));let H=E.botManagement||{};l.appendChild(W("\\u{1F916}","\\u2461.3 \\u81EA\\u52A8\\u7A0B\\u5E8F\\uFF08Bot \\u7BA1\\u7406\\uFF09",H.enabled?`\\u5DF2\\u542F\\u7528 \\xB7 ${H.mode==="allowlist"?"\\u767D\\u540D\\u5355\\u4EC5\\u653E\\u884C":"\\u9ED1\\u540D\\u5355\\u62E6\\u622A"} ${(H.list||[]).length} \\u6761\\u7279\\u5F81`:"\\u672A\\u542F\\u7528 Bot \\u7BA1\\u7406\\uFF08\\u72EC\\u7ACB\\u5B57\\u6BB5 botManagement\\uFF09",H.enabled?"\\u5DF2\\u542F\\u7528":"\\u672A\\u914D\\u7F6E","sec-bot",()=>Oe(r.host,"sec-bot"),"\\u5B89\\u5168\\u9632\\u62A4\\u62BD\\u5C49 \\xB7 \\u81EA\\u52A8\\u7A0B\\u5E8F\\uFF08\\u72EC\\u7ACB\\u6700\\u5C0F\\u4EFB\\u52A1\\u5305\\uFF09"));let k=E.signedUrl||{};l.appendChild(W("\\u{1F511}","\\u2461.4 Access \\xB7 \\u4EE4\\u724C\\u9274\\u6743\\uFF08\\u7B7E\\u540D URL\\uFF09\\u26A0\\uFE0F\\u5B9E\\u9A8C\\u7279\\u6027",k.enabled?`\\u5DF2\\u542F\\u7528 \\xB7 \\u53C2\\u6570 ${k.param||"sign"}${k.ttl?" \\xB7 \\u6709\\u6548\\u671F "+k.ttl+"s":""}`:"\\u672A\\u542F\\u7528\\u7B7E\\u540D URL",k.enabled?"\\u5DF2\\u542F\\u7528":"\\u672A\\u914D\\u7F6E","sec-token",()=>Oe(r.host,"sec-token"),"\\u5B89\\u5168\\u9632\\u62A4\\u62BD\\u5C49 \\xB7 \\u7B7E\\u540D URL\\uFF08\\u5185\\u7F6E\\u7B7E\\u53D1\\u5DE5\\u5177\\u5F85\\u5F00\\u53D1\\uFF09"));let T=E.rateLimit||{};l.appendChild(W("\\u23F1\\uFE0F","\\u2461.5 \\u901F\\u7387\\u9650\\u5236",T.enabled?`\\u5DF2\\u542F\\u7528 \\xB7 ${T.rpm||0} \\u6B21/\\u5206\\u949F`:"\\u672A\\u542F\\u7528\\u8BF7\\u6C42\\u9650\\u901F",T.enabled?"\\u5DF2\\u542F\\u7528":"\\u672A\\u914D\\u7F6E","sec-ratelimit",()=>Oe(r.host,"sec-ratelimit"),"\\u5B89\\u5168\\u9632\\u62A4\\u62BD\\u5C49 \\xB7 \\u8BF7\\u6C42\\u9650\\u901F")),l.appendChild(Z("\\u2462","\\u9996\\u8981\\u5206\\u6D41\\uFF1A\\u9009\\u51FA\\u300C\\u672C\\u6B21\\u56DE\\u6E90\\u5BF9\\u8C61\\u300D\\uFF08\\u771F\\u5B9E\\u63A8\\u5BFC\\u7684\\u5177\\u4F53\\u4E34\\u65F6\\u5BF9\\u8C61\\uFF09","\\u4E0D\\u662F\\u865A\\u62DF\\u5360\\u4F4D\\uFF1A\\u5355\\u6E90\\u7AD9 = \\u8BE5\\u6E90\\u7AD9\\u672C\\u8EAB\\uFF1B\\u6E90\\u7AD9\\u6C60 = \\u6309\\u8D1F\\u8F7D\\u5747\\u8861\\u7B56\\u7565\\uFF08chain/roundrobin/\\u968F\\u673A/\\u52A0\\u6743/IP\\u54C8\\u5E0C\\uFF09\\u5B9E\\u9645\\u9009\\u51FA\\u7684\\u67D0\\u4E00\\u4E2A oX\\u3002\\u8FD9\\u4E2A\\u5177\\u4F53\\u5BF9\\u8C61\\u5373\\u540E\\u7EED \\u2464~\\u2471 \\u89C4\\u5219\\u7684\\u300C\\u56DE\\u6E90\\u76EE\\u6807\\u300D\\u5339\\u914D\\u7EF4\\u5EA6\\uFF08target=origin / originAddr\\uFF09\\uFF0C\\u53EF\\u5728\\u4E00\\u6761\\u7EBF\\u4E0A\\u7528\\u5B83\\u505A\\u591A\\u5206\\u652F\\u3002"));let R=D.pools.find(O=>O.id===r.poolId),_=R?ne(R):"",B=R&&_==="single"?R.origins&&R.origins[0]&&R.origins[0].id:R?"\\u6309\\u7B56\\u7565\\u9009\\u51FA\\u7684 oX":"";l.appendChild(W("\\u{1F3AF}","\\u2462 \\u672C\\u6B21\\u56DE\\u6E90\\u5BF9\\u8C61\\uFF08\\u63A8\\u5BFC\\xB7\\u53EA\\u8BFB\\uFF09",r.poolId?R?_==="single"?`\\u5355\\u4E00\\u6E90\\u7AD9\\uFF1A${R.name||R.id} \\xB7 ${Xe(R)}\\uFF08\\u56DE\\u6E90\\u76EE\\u6807 id=${R.origins&&R.origins[0]&&R.origins[0].id}\\uFF09`:`\\u6E90\\u7AD9\\u6C60\\uFF1A${R.name||R.id} \\xB7 \\u7B56\\u7565 ${R.strategy||"roundrobin"} \\xB7 ${(R.origins||[]).length} \\u4E2A\\u6E90\\u7AD9\\uFF08\\u6BCF\\u6B21\\u6309\\u7B56\\u7565\\u9009\\u51FA\\u4E00\\u4E2A oX \\u4F5C\\u4E3A\\u56DE\\u6E90\\u76EE\\u6807\\uFF09`:`\\u6E90\\u7AD9\\u5DF2\\u88AB\\u5220\\u9664\\u6216\\u4E0D\\u53EF\\u7528\\uFF1A${r.poolId}`:"\\u672A\\u8BBE\\u7F6E\\u9ED8\\u8BA4\\u6E90\\u7AD9",r.poolId?"\\u63A8\\u5BFC":"\\u672A\\u914D\\u7F6E","sec-origin",()=>P("\\u2462 \\u662F\\u63A8\\u5BFC\\u51FA\\u7684\\u4E34\\u65F6\\u865A\\u62DF\\u56DE\\u6E90\\u5BF9\\u8C61\\uFF0C\\u4E0D\\u53EF\\u76F4\\u63A5\\u7F16\\u8F91\\u3002\\u5982\\u9700\\u66F4\\u6539\\u56DE\\u6E90\\u5BF9\\u8C61\\uFF0C\\u8BF7\\u5230\\u300C\\u2460 \\u5339\\u914D\\u7AD9\\u70B9\\u300D\\u6539\\u9ED8\\u8BA4\\u6E90\\u7AD9\\u3001\\u5230\\u300C\\u6E90\\u7AD9\\u300D\\u9875\\u7F16\\u8F91\\u6E90\\u7AD9\\u6C60\\uFF0C\\u6216\\u7528\\u300C\\u2468 Origin Rules\\u300D\\u89C4\\u5219\\u8986\\u76D6\\u3002","info"),null)),l.appendChild(Z("\\u2463","URL \\u89C4\\u8303\\u5316","\\u628A\\u8BF7\\u6C42 URL \\u7EDF\\u4E00\\u6210\\u6807\\u51C6\\u5F62\\u6001\\uFF08\\u5927\\u5C0F\\u5199\\u3001\\u5C3E\\u90E8\\u659C\\u6760\\u3001\\u67E5\\u8BE2\\u6392\\u5E8F\\u7B49\\uFF09\\u3002\\u672C\\u7F51\\u5173\\u6682\\u672A\\u5B9E\\u73B0\\u8BE5\\u9636\\u6BB5\\uFF0C\\u6D41\\u91CF\\u76F4\\u63A5\\u8DF3\\u8FC7\\u8FDB\\u5165 \\u2464")),l.appendChild(W("\\u{1F527}","\\u2463 URL \\u89C4\\u8303\\u5316 normalize","\\u672C\\u7F51\\u5173\\u6682\\u4E0D\\u652F\\u6301 URL \\u89C4\\u8303\\u5316\\uFF0C\\u8BF7\\u6C42\\u539F\\u6837\\u8FDB\\u5165 \\u2464 URL \\u91CD\\u5199\\u9636\\u6BB5\\u3002","\\u6682\\u4E0D\\u652F\\u6301",null,null,null)),l.appendChild(Z("\\u2464-\\u246A","\\u89C4\\u5219\\u9A71\\u52A8\\u9636\\u6BB5\\uFF08\\u6BCF\\u4E2A\\u9636\\u6BB5 = \\u4E00\\u4E2A\\u72EC\\u7ACB\\u89C4\\u5219\\u5F15\\u64CE\\uFF09","\\u6D41\\u91CF\\u4F9D\\u6B21\\u7ECF\\u8FC7\\u8FD9\\u4E9B\\u9636\\u6BB5\\uFF0C\\u6BCF\\u4E2A\\u9636\\u6BB5\\u5185\\u90E8\\u6309\\u300C\\u987A\\u5E8F\\u300D\\u4ECE\\u4E0A\\u5230\\u4E0B\\u5339\\u914D\\uFF08\\u987A\\u5E8F 1 \\u6700\\u5148\\u5339\\u914D\\uFF0C\\u6570\\u5B57\\u8D8A\\u5927\\u8D8A\\u9760\\u540E\\uFF09\\uFF0C\\u547D\\u4E2D\\u5373\\u8DF3\\u51FA\\u672C\\u9636\\u6BB5\\u8FDB\\u5165\\u4E0B\\u6E38\\uFF1B\\u7AD9\\u70B9\\u65E0\\u8BBE\\u7F6E\\u5219\\u56DE\\u843D\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u3002\\u987A\\u5E8F\\u9760\\u62D6\\u62FD\\u8C03\\u6574\\u3002\\u591A\\u5206\\u652F\\u7528\\u300C\\u56DE\\u6E90\\u76EE\\u6807\\u300D\\u6761\\u4EF6\\u8868\\u8FBE\\uFF1A\\u5728\\u89C4\\u5219\\u5339\\u914D\\u91CC\\u52A0 target=origin/originAddr\\uFF08\\u2462 \\u9009\\u51FA\\u7684\\u5177\\u4F53\\u6E90\\u7AD9\\uFF09\\uFF0C\\u5982\\u300C\\u8DEF\\u5F84=/img/ \\u4E14 \\u56DE\\u6E90\\u76EE\\u6807=oX \\u2192 \\u52A8\\u4F5C\\u300D\\uFF0C\\u2466~\\u2471 \\u5168\\u90E8\\u5171\\u7528\\u4E00\\u6761\\u7EBF\\uFF0C\\u2469\\u246D \\u662F\\u771F\\u5B9E\\u53EA\\u8BFB\\u7684\\u5B9E\\u9645\\u751F\\u6548\\u7ED3\\u679C\\u3002")),v("rewrite","\\u2702\\uFE0F","URL \\u91CD\\u5199","\\u6309\\u89C4\\u5219\\u6539\\u5199\\u5BA2\\u6237\\u7AEF\\u8BF7\\u6C42\\u8DEF\\u5F84\\uFF08\\u4E0D\\u542B\\u6E90\\u7AD9 pathPrefix\\uFF09",null,V.rewrite),v("redirect","\\u21AA\\uFE0F","\\u91CD\\u5B9A\\u5411\\u89C4\\u5219","\\u628A\\u8BF7\\u6C42\\u91CD\\u5B9A\\u5411\\u5230\\u5176\\u5B83 URL\\uFF08\\u547D\\u4E2D\\u5373\\u7EC8\\u6B62\\u56DE\\u6E90\\uFF09",null,V.redirect),v("terminate","\\u{1F512}","\\u5F3A\\u5236 HTTPS / \\u76F4\\u63A5\\u54CD\\u5E94\\uFF08\\u7EC8\\u6B62\\u578B\\uFF09","\\u547D\\u4E2D http \\u8FD4\\u56DE 301/307 \\u8DF3 https\\uFF0C\\u6216\\u76F4\\u63A5\\u7528\\u81EA\\u5B9A\\u4E49 body/status \\u54CD\\u5E94\\uFF0C\\u4E0D\\u518D\\u56DE\\u6E90",null,V.terminate),v("reqHeaders","\\u{1F4E4}","\\u4FEE\\u6539\\u8BF7\\u6C42\\u5934","\\u5728\\u56DE\\u6E90\\u8BF7\\u6C42\\u53D1\\u51FA\\u53BB\\u4E4B\\u524D\\u589E / \\u5220 / \\u6539 HTTP \\u5934",null,V.reqHeaders),v("origin","\\u{1F500}","Origin Rules","\\u66F4\\u6539\\u56DE\\u6E90\\u76EE\\u6807\\uFF1A\\u56DE\\u6E90 Host\\u3001\\u56DE\\u6E90\\u8FDE\\u63A5\\u53C2\\u6570\\uFF08\\u5F15\\u64CE/\\u534F\\u8BAE/\\u7AEF\\u53E3\\uFF09\\u6216\\u5019\\u9009\\u6E90\\u7AD9",null,V.origin);let U=m.find(O=>ge(O)==="origin"&&O.action&&O.action.poolId),C=!U&&j.origin&&j.origin.poolId;l.appendChild(Z("\\u2469","\\u786E\\u5B9A\\u5B9E\\u9645\\u6E90\\u7AD9","\\u6CBF\\u7528 \\u2462 \\u9996\\u8981\\u5206\\u6D41\\u7ED3\\u679C\\uFF0C\\u6216\\u88AB origin \\u9636\\u6BB5\\u547D\\u4E2D\\u7684\\u89C4\\u5219\\u8986\\u76D6\\uFF08\\u8FD0\\u884C\\u65F6\\u63A8\\u5BFC\\uFF0C\\u65E0\\u72EC\\u7ACB\\u914D\\u7F6E\\u9879\\uFF09")),l.appendChild(W("\\u{1F9ED}","\\u2469 \\u5B9E\\u9645\\u6E90\\u7AD9",U?`\\u5B58\\u5728\\u7AD9\\u70B9\\u89C4\\u5219\\u8986\\u76D6 \\u2192 ${Se(U.action.poolId)}\\uFF08\\u547D\\u4E2D\\u8BE5\\u89C4\\u5219\\u65F6\\u751F\\u6548\\uFF09`:C?`\\u7AD9\\u70B9\\u65E0\\u8986\\u76D6 \\u2192 \\u56DE\\u843D\\u5168\\u7AD9\\u515C\\u5E95 \\u2192 ${Se(C)}`:`\\u65E0\\u89C4\\u5219\\u8986\\u76D6 \\u2192 \\u6CBF\\u7528 \\u2462 \\u7684 ${r.poolId?Se(r.poolId):"\\u672A\\u914D\\u7F6E"}`,"\\u63A8\\u5BFC",null,null,null)),v("cache","\\u{1F4E5}","Cache Rules\\uFF08\\u7F13\\u5B58\\u8BF7\\u6C42\\u8BBE\\u7F6E\\uFF09","\\u7F13\\u5B58\\u7B56\\u7565\\uFF08edgeTtl / SWR / browserTtl / \\u7ED5\\u8FC7\\u7F13\\u5B58\\uFF09\\u7B49\\u8BF7\\u6C42\\u7EA7\\u7F13\\u5B58\\u8BBE\\u7F6E",null,V.cache),l.appendChild(Z("\\u246B","\\u7F13\\u5B58\\u952E","\\u5408\\u5E76 policy = \\u9ED8\\u8BA4 < \\u6E90\\u7AD9\\u7EA7 cache < cache \\u9636\\u6BB5(Cache Rules)\\uFF1B\\u672C\\u73AF\\u8282\\u53EF\\u5E72\\u9884\\u9879\\uFF1A\\u7AD9\\u70B9\\u7F13\\u5B58\\u7248\\u672C\\uFF08\\u6E05\\u7A7A\\u540E\\u65E7\\u7248\\u672C\\u81EA\\u52A8\\u5931\\u6548\\uFF09\\u3002"));let u=m.filter(O=>ge(O)==="cache"),w=u.some(O=>O.action.cache.enabled);l.appendChild(W("\\u{1F516}","\\u246B \\u5408\\u5E76\\u7F13\\u5B58\\u7B56\\u7565 & \\u6784\\u9020\\u7F13\\u5B58\\u952E",`\\u246A \\u7F13\\u5B58\\u52A8\\u4F5C ${u.length} \\u6761 \\xB7 \\u7AD9\\u70B9\\u7F13\\u5B58\\u7248\\u672C v${r.cacheGen||0}${w?"\\uFF08\\u5DF2\\u542F\\u7528\\u8282\\u70B9\\u7F13\\u5B58\\uFF09":""}`,"\\u63A8\\u5BFC",null,()=>Ut(r.host,u.length,w),"\\u7F13\\u5B58\\u952E\\u62BD\\u5C49\\uFF08\\u4EC5\\u8C03\\u6574\\u6E05\\u7A7A\\u7F13\\u5B58\\uFF09")),l.appendChild(Z("\\u246C","\\u67E5\\u7F13\\u5B58","\\u547D\\u4E2D\\u5219\\u76F4\\u63A5\\u8FD4\\u56DE\\uFF08X-Cache: HIT\\uFF09\\uFF0C\\u672A\\u547D\\u4E2D\\u7EE7\\u7EED \\u246D \\u771F\\u6B63\\u56DE\\u6E90\\u3002\\u8FD0\\u884C\\u65F6\\u884C\\u4E3A\\u3002")),l.appendChild(W("\\u26A1","\\u246C \\u67E5\\u8FB9\\u7F18\\u7F13\\u5B58 cacheMatch","\\u547D\\u4E2D\\u5219\\u76F4\\u63A5\\u8FD4\\u56DE\\uFF08\\u54CD\\u5E94\\u5934 X-Cache: HIT\\uFF09\\uFF0C\\u672A\\u547D\\u4E2D\\u7EE7\\u7EED \\u246D \\u771F\\u6B63\\u56DE\\u6E90\\u3002\\u8FD0\\u884C\\u65F6\\u884C\\u4E3A\\uFF0C\\u65E0\\u914D\\u7F6E\\u9879\\u3002","\\u8FD0\\u884C\\u65F6",null,null,null));let A=U&&U.action.poolId||C&&C.action.poolId||r.poolId,b=D.pools.find(O=>O.id===A),L=b&&b.failover||null,I=m.find(O=>ge(O)==="origin"),G=!I&&j.origin&&(j.origin.clientIpHeader||j.origin.followRedirect||j.origin.originTimeoutMs||j.origin.engine||j.origin.scheme||j.origin.port),K=O=>L?`\\u91CD\\u8BD5 ${L.maxRetries!=null?L.maxRetries:Math.max((O.origins||[]).length-1,0)} \\u6B21`:"\\u65E0\\u56DE\\u9000\\uFF08\\u5355\\u6E90\\u7AD9\\uFF09";l.appendChild(Z("\\u246D","\\u56DE\\u6E90\\u5FAA\\u73AF requestWithFailover\\uFF08\\u771F\\u6B63\\u53D1\\u51FA\\u56DE\\u6E90\\u8BF7\\u6C42\\uFF09","\\u9010\\u4E2A\\u6E90\\u7AD9\\u5C1D\\u8BD5\\uFF1Brewrite/origin/reqHeaders \\u5404\\u9636\\u6BB5\\u89C4\\u5219\\u5728\\u6B64\\u5BF9\\u6BCF\\u4E2A\\u6E90\\u7AD9\\u843D\\u5730\\uFF1B\\u56DE\\u6E90\\u8FDE\\u63A5\\u53C2\\u6570\\u53D7\\u89C4\\u5219 clientIp / \\u8D85\\u65F6 / \\u8DDF\\u968F3xx \\u5F71\\u54CD\\u3002\\u53EF\\u5E72\\u9884\\uFF1A\\u6E90\\u7AD9\\u5730\\u5740\\u3001\\u7B56\\u7565\\u3001\\u6545\\u969C\\u8F6C\\u79FB\\u3002")),l.appendChild(W("\\u{1F5C4}\\uFE0F","\\u246D \\u6E90\\u7AD9\\u4E0E\\u6545\\u969C\\u8F6C\\u79FB",b?ne(b)==="single"?`\\u5355\\u4E00\\u6E90\\u7AD9 ${b.name||b.id} \\xB7 ${Xe(b)} \\xB7 ${K(b)}${I||G?"\\uFF08\\u53D7\\u89C4\\u5219\\u56DE\\u6E90\\u53C2\\u6570\\u5F71\\u54CD\\uFF09":""}`:`\\u6E90\\u7AD9\\u6C60 ${b.name||b.id} \\xB7 \\u7B56\\u7565 ${b.strategy||"roundrobin"} \\xB7 ${(b.origins||[]).length} \\u4E2A\\u6E90\\u7AD9 \\xB7 ${K(b)}${I||G?"\\uFF08\\u53D7\\u89C4\\u5219\\u56DE\\u6E90\\u53C2\\u6570\\u5F71\\u54CD\\uFF09":""}`:"\\u672A\\u914D\\u7F6E\\u6E90\\u7AD9",b?"\\u5DF2\\u914D\\u7F6E":"\\u672A\\u914D\\u7F6E",null,b?()=>_e(b.id):()=>Gt(r.host,"sec-origin"),b?"\\u6E90\\u7AD9\\u62BD\\u5C49":"\\u521D\\u59CB\\u56DE\\u6E90\\u5BF9\\u8C61\\u62BD\\u5C49 \\xB7 \\u6E90\\u7AD9\\u65B9\\u5F0F"));let q=[["\\u246D.1 \\u5408\\u5E76\\u672C\\u6E90\\u7AD9\\u914D\\u7F6E","\\u6E90\\u7AD9\\u7EA7\\u6253\\u5E95 + \\u2464\\u2467\\u2468 \\u89C4\\u5219\\u7EA7\\u8986\\u76D6\\uFF0C\\u5F62\\u6210\\u56DE\\u6E90\\u6539\\u5199\\u8F93\\u5165"],["\\u246D.2 \\u6784\\u9020\\u56DE\\u6E90 URL","\\u843D\\u5B9E \\u2464\\u300CURL \\u91CD\\u5199\\u300D\\u4E0E \\u2468\\u300COrigin Rules\\u300D\\u7684\\u8DEF\\u5F84 / Host \\u6539\\u5199"],["\\u246D.3 \\u6784\\u9020\\u56DE\\u6E90\\u8BF7\\u6C42\\u5934","\\u6E90\\u7AD9 extraHeaders + \\u2467\\u300C\\u4FEE\\u6539\\u8BF7\\u6C42\\u5934\\u300D\\u89C4\\u5219\\u7684\\u6539\\u5199 + \\u5BA2\\u6237\\u7AEFIP"],["\\u246D.4 \\u9009\\u62E9\\u5F15\\u64CE\\u5E76\\u53D1\\u8D77","fetch / socket \\u5F15\\u64CE\\u6309\\u6E90\\u7AD9\\u914D\\u7F6E\\u5206\\u6D3E\\uFF08\\u771F\\u6B63\\u53D1\\u8BF7\\u6C42\\uFF09"],["\\u246D.5 \\u5904\\u7406\\u54CD\\u5E94 / \\u5F02\\u5E38","\\u547D\\u4E2D retryOn \\u72B6\\u6001\\u7801\\u6216\\u5F02\\u5E38 \\u2192 \\u6362\\u4E0B\\u4E00\\u6E90\\u7AD9"]];return l.appendChild(e("div",{class:"seq-substeps"},q.map(([O,z])=>e("div",{class:"seq-substep"},[e("span",{class:"seq-substep-t",text:O}),e("span",{class:"seq-substep-d",text:z})])))),l.appendChild(Z("\\u246E","clone \\u539F\\u59CB\\u54CD\\u5E94","cacheKey \\u5DF2\\u5728 \\u246B \\u56FA\\u5B9A\\uFF0C\\u4E0D\\u968F \\u246D \\u6362\\u6E90\\u53D8\\u5316\\u3002\\u8FD0\\u884C\\u65F6\\u884C\\u4E3A\\u3002")),l.appendChild(W("\\u{1F9EC}","\\u246E clone \\u539F\\u59CB\\u54CD\\u5E94","cacheKey \\u5DF2\\u5728 \\u246B \\u56FA\\u5B9A\\uFF0C\\u4E0D\\u968F \\u246D \\u6362\\u6E90\\u53D8\\u5316\\u3002\\u8FD0\\u884C\\u65F6\\u884C\\u4E3A\\u3002","\\u8FD0\\u884C\\u65F6",null,null,null)),l.appendChild(Z("respHeaders","\\u6539\\u5199\\u54CD\\u5E94\\u5934\\uFF08\\u542B response cache rule\\uFF09","\\u56DE\\u6E90\\u54CD\\u5E94\\u8FD4\\u56DE\\u7528\\u6237\\u524D\\u7684\\u6240\\u6709\\u54CD\\u5E94\\u5934\\u6539\\u5199\\uFF0C\\u4EE5\\u53CA CF \\u98CE\\u683C response cache rule\\uFF08\\u54CD\\u5E94\\u7EA7\\u7F13\\u5B58\\u63A7\\u5236\\uFF09\\u3002")),v("respHeaders","\\u{1F4DD}","\\u6539\\u5199\\u54CD\\u5E94\\u5934 / Response Cache Rule","\\u589E / \\u5220 / \\u6539\\u54CD\\u5E94\\u5934\\uFF0C\\u4EE5\\u53CA\\u54CD\\u5E94\\u7EA7\\u7F13\\u5B58\\u63A7\\u5236\\uFF08response cache rule\\uFF09",null,V.respHeaders),l.appendChild(Z("\\u2470","\\u5199\\u8FB9\\u7F18\\u7F13\\u5B58","\\u6309 \\u246B \\u7684 cacheKey \\u5199\\u5165 \\u246A \\u5B9A\\u4E49\\u7684\\u7F13\\u5B58\\u7B56\\u7565\\u3002")),l.appendChild(W("\\u{1F4BE}","\\u2470 \\u5199\\u8FB9\\u7F18\\u7F13\\u5B58",w?"\\u5E94\\u7528 \\u246A\\u300CCache Rules\\u300D\\u7684\\u7F13\\u5B58\\u7B56\\u7565\\uFF0C\\u6309 \\u246B \\u7684 cacheKey \\u5199\\u5165\\u3002":"\\u672A\\u542F\\u7528\\u7F13\\u5B58\\uFF0C\\u8DF3\\u8FC7\\u5199\\u5165\\u3002","\\u8FD0\\u884C\\u65F6",null,null,null)),l.appendChild(Z("\\u2471","\\u8FD4\\u56DE\\u6700\\u7EC8\\u7528\\u6237","\\u7EDF\\u4E00\\u6CE8\\u5165\\u54C1\\u724C\\u54CD\\u5E94\\u5934\\u5E76\\u8BB0\\u5F55\\u7EDF\\u8BA1\\uFF0C\\u56FA\\u5B9A\\u884C\\u4E3A\\u3002")),l.appendChild(W("\\u{1F464}","\\u2471 \\u54CD\\u5E94 & \\u6700\\u7EC8\\u7528\\u6237","\\u7EDF\\u4E00\\u6CE8\\u5165\\u54C1\\u724C\\u54CD\\u5E94\\u5934 Server: EdgeGateway\\u3001Via: 1.1 EdgeGateway\\uFF0C\\u5E76\\u8BB0\\u5F55\\u7EDF\\u8BA1\\u3002\\u56FA\\u5B9A\\u884C\\u4E3A\\u3002","\\u56FA\\u5B9A",null,null,null)),{ruleNodes:x,rules:m}}function h(r,c,m){let x=null,E=()=>r.forEach(({node:v})=>v.classList.remove("drop-before","drop-after","dragging"));r.forEach(({node:v,index:F})=>{v.addEventListener("dragstart",$=>{x=v,v.classList.add("dragging"),$.dataTransfer.effectAllowed="move",$.dataTransfer.setData("text/plain",String(F))}),v.addEventListener("dragend",E),v.addEventListener("dragover",$=>{if($.preventDefault(),v===x)return;let H=v.getBoundingClientRect(),k=$.clientY>H.top+H.height/2;E(),x&&x.classList.add("dragging"),v.classList.add(k?"drop-after":"drop-before")}),v.addEventListener("drop",async $=>{if($.preventDefault(),!x||x===v)return;let H=Number($.dataTransfer.getData("text/plain")),k=F,T=c.splice(H,1)[0];c.splice(k,0,T);let R={...m,rules:c.map((B,U)=>({...B,priority:(c.length-U)*10}))},_=D.sites.findIndex(B=>B.host===m.host);_>=0&&(D.sites[_]=R);try{await N.sites.save(m.host,R),g(a.value),P("\\u5DF2\\u4FDD\\u5B58\\u89C4\\u5219\\u4F18\\u5148\\u7EA7","ok")}catch(B){P("\\u4FDD\\u5B58\\u5931\\u8D25\\uFF1A"+(B&&B.message?B.message:"\\u672A\\u77E5\\u9519\\u8BEF"),"err"),g(a.value)}})})}function p(){D.sites.forEach(r=>{let c=r.security||{},m=["refererMode","uaBlacklist","ipBlacklist","ipWhitelist","signedUrl","rateLimit","botManagement"].some(x=>x==="refererMode"?c.refererMode&&c.refererMode!=="off":x==="signedUrl"||x==="rateLimit"||x==="botManagement"?c[x]&&c[x].enabled:(c[x]||[]).length);l.appendChild(e("div",{class:"seq-site-head"},[e("div",{class:"seq-site-name",text:r.host}),e("div",{class:"seq-site-meta"},[e("span",{class:"seq-chip",text:`${(r.rules||[]).length} \\u6761\\u89C4\\u5219`}),e("span",{class:"seq-chip",text:m?"\\u5B89\\u5168\\u5DF2\\u542F\\u7528":"\\u5B89\\u5168\\u672A\\u914D\\u7F6E"}),r.poolId?e("span",{class:"seq-chip",text:"\\u6E90\\u7AD9 "+Se(r.poolId)}):null,e("span",{class:"seq-go seq-site-go",text:"\\u7F16\\u8F91\\u7AD9\\u70B9 \\u2192"})]),e("div",{class:"seq-site-click",onclick:()=>we(r.host)})])),i(r,!1)})}let g=r=>{if(ae(l),r===n){p();return}if(r==="__global__"){f();return}let c=D.sites.find(E=>E.host===r)||D.sites[0];if(!c)return;let{ruleNodes:m,rules:x}=i(c,!0);h(m,x,c)};function f(){function r(x,E,v,F,$){let H=j[x]||{},k=!j[x],T=d({action:Ve(x,H)}),R=T.length?`\\u9ED8\\u8BA4\\u52A8\\u4F5C\\uFF1A${T.join("\\u3001")}\\uFF1B${F}`:`\\u9ED8\\u8BA4\\u7A7A\\u64CD\\u4F5C\\uFF08\\u4E0D\\u5E72\\u9884\\uFF09\\uFF1B${F}`;l.appendChild(W(E,`${x} ${v}`,R,k?"\\u5185\\u7F6E\\u9ED8\\u8BA4":"\\u5DF2\\u914D\\u7F6E","sec-rules",()=>lt(x,{...V[x],stage:x}),"\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u7F16\\u8F91\\u5668")),T.length&&l.appendChild(e("div",{class:"seq-rule-list"},[qt({id:"__global_"+x,name:k?"\\u5185\\u7F6E\\u9ED8\\u8BA4\\uFF08\\u53EF\\u6539\\uFF09":"\\u5168\\u7AD9\\u515C\\u5E95\\u9ED8\\u8BA4",action:Ve(x,H)},T,0,"__global__",!1,x,1)]))}function c(x,E,v){let F=Pe[x];if(!F)return;let $=j&&j[x]||{},H=!(j&&j[x]),k=(F.fields||[]).slice(0,3).map(R=>{let _=R.path.split(".").reduce((B,U)=>B?.[U],$);return _===void 0||_===""?null:`${R.label} ${_}`}).filter(Boolean),T=k.length?`\\u5F53\\u524D\\uFF1A${k.join("\\uFF1B")}\\u3002${v}`:v;l.appendChild(W(F.icon,`${E} ${F.title.replace("\\uFF08\\u5168\\u7AD9\\u9ED8\\u8BA4\\uFF09","")}`,T,H?"\\u5185\\u7F6E\\u9ED8\\u8BA4":"\\u5DF2\\u914D\\u7F6E","sec-rules",()=>gt(x),"\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u7F16\\u8F91\\u5668"))}l.appendChild(Z("\\u5168\\u7AD9","\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\uFF08\\u515C\\u5E95\\u9ED8\\u8BA4\\uFF09","\\u65B0\\u9636\\u6BB5\\u2192\\u9ED8\\u8BA4\\u52A8\\u4F5C\\u6620\\u5C04\\uFF0C\\u6BCF\\u4E2A\\u9636\\u6BB5\\u6070\\u597D 1 \\u6761\\u3001\\u65E0\\u6761\\u4EF6\\u3001\\u65E0\\u4F18\\u5148\\u7EA7\\u3002\\u4EE5\\u4E0B\\u89C4\\u5219\\u5BF9\\u4EFB\\u4F55\\u7AD9\\u70B9\\u90FD\\u751F\\u6548\\uFF0C\\u4EC5\\u5F53\\u7AD9\\u70B9\\u81EA\\u8EAB\\u89C4\\u5219\\u672A\\u547D\\u4E2D\\uFF08\\u8BE5\\u9636\\u6BB5\\u5B57\\u6BB5\\u7F3A\\u5931\\uFF09\\u65F6\\u624D\\u89E6\\u53D1\\uFF0C\\u76F8\\u5F53\\u4E8E\\u5168\\u5C40\\u9ED8\\u8BA4\\u8BBE\\u7F6E\\u3002\\u70B9\\u51FB\\u9636\\u6BB5\\u5373\\u53EF\\u7F16\\u8F91\\u8BE5\\u9636\\u6BB5\\u7684\\u9ED8\\u8BA4\\u52A8\\u4F5C\\u3002")),c("match","\\u2460","\\u8BF7\\u6C42 URL \\u6CA1\\u5E26\\u534F\\u8BAE\\u65F6\\u6309\\u6B64\\u534F\\u8BAE\\u8865\\u5168\\uFF0C\\u7136\\u540E\\u518D\\u53BB\\u5339\\u914D\\u7AD9\\u70B9\\u3002"),l.appendChild(Z("\\u2461-\\u2463","\\u5B89\\u5168 / \\u9996\\u8981\\u5206\\u6D41\\uFF08\\u5168\\u7AD9\\u7EF4\\u5EA6\\uFF09","\\u5168\\u7AD9\\u5B89\\u5168\\u57FA\\u7EBF\\u4E0E\\u9519\\u8BEF\\u54CD\\u5E94\\u5728\\u6B64\\u914D\\u7F6E\\uFF1B\\u5177\\u4F53\\u7684\\u9632\\u76D7\\u94FE\\u3001IP \\u540D\\u5355\\u7B49\\u4ECD\\u5728\\u5404\\u7AD9\\u70B9\\u81EA\\u8EAB\\u8BBE\\u7F6E\\u3002")),c("security","\\u2461.1~\\u2461.5","\\u5168\\u7AD9\\u9ED8\\u8BA4\\u9650\\u901F\\u4E0E\\u8BA1\\u6570\\u53C2\\u6570\\uFF1B\\u7AD9\\u70B9\\u81EA\\u5DF1\\u8BBE\\u4E86\\u9650\\u901F\\u5C31\\u4EE5\\u7AD9\\u70B9\\u4E3A\\u51C6\\u3002"),c("error","\\u2461.6","\\u88AB\\u62E6\\u622A\\u65F6\\u8FD4\\u56DE\\u4EC0\\u4E48\\u5185\\u5BB9\\uFF0C\\u4EE5\\u53CA\\u5404\\u7C7B 5xx \\u9519\\u8BEF\\u7684\\u6587\\u6848\\uFF08\\u53EF\\u76F4\\u63A5\\u7C98\\u8D34\\u81EA\\u5B9A\\u4E49\\u9519\\u8BEF\\u9875 HTML\\uFF09\\u3002"),l.appendChild(W("\\u{1F3AF}","\\u2462 \\u521D\\u59CB\\u56DE\\u6E90\\u5BF9\\u8C61","\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u4E0D\\u9009\\u62E9\\u521D\\u59CB\\u6E90\\u7AD9\\uFF0C\\u6E90\\u7AD9\\u7531\\u5404\\u7AD9\\u70B9\\u81EA\\u8EAB\\u51B3\\u5B9A\\u3002","\\u672A\\u914D\\u7F6E",null,null,null)),l.appendChild(W("\\u{1F527}","\\u2463 URL \\u89C4\\u8303\\u5316","\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u6682\\u4E0D\\u652F\\u6301 URL \\u89C4\\u8303\\u5316\\u3002","\\u6682\\u4E0D\\u652F\\u6301",null,null,null)),l.appendChild(Z("\\u2464-\\u246A","\\u89C4\\u5219\\u9A71\\u52A8\\u9636\\u6BB5\\uFF08\\u5168\\u7AD9\\u515C\\u5E95\\uFF09","\\u5404\\u9636\\u6BB5\\u5168\\u7AD9\\u515C\\u5E95\\u89C4\\u5219\\uFF1B\\u7AD9\\u70B9\\u5E8F\\u5217\\u67D0\\u9636\\u6BB5\\u65E0\\u8BBE\\u7F6E\\u65F6\\uFF0C\\u5373\\u5B9E\\u9645\\u751F\\u6548\\u8FD9\\u4E9B\\u89C4\\u5219\\u3002")),r("rewrite","\\u2702\\uFE0F","URL \\u91CD\\u5199","\\u6309\\u89C4\\u5219\\u6539\\u5199\\u5BA2\\u6237\\u7AEF\\u8BF7\\u6C42\\u8DEF\\u5F84",null),r("redirect","\\u21AA\\uFE0F","\\u91CD\\u5B9A\\u5411\\u89C4\\u5219","\\u628A\\u8BF7\\u6C42\\u91CD\\u5B9A\\u5411\\u5230\\u5176\\u5B83 URL",null),r("terminate","\\u{1F512}","\\u5F3A\\u5236 HTTPS / \\u76F4\\u63A5\\u54CD\\u5E94","\\u547D\\u4E2D http \\u8DF3 https\\uFF0C\\u6216\\u76F4\\u63A5\\u54CD\\u5E94",null),r("reqHeaders","\\u{1F4E4}","\\u4FEE\\u6539\\u8BF7\\u6C42\\u5934","\\u56DE\\u6E90\\u524D\\u589E\\u5220\\u6539 HTTP \\u5934",null),r("origin","\\u{1F500}","Origin Rules","\\u6539\\u56DE\\u6E90 Host / \\u56DE\\u6E90\\u8FDE\\u63A5\\u53C2\\u6570 / \\u5019\\u9009\\u6E90\\u7AD9",null),r("cache","\\u{1F4E5}","Cache Rules\\uFF08\\u7F13\\u5B58\\u89C4\\u5219\\uFF09","\\u7F13\\u5B58\\u7B56\\u7565\\u7B49\\u8BF7\\u6C42\\u7EA7\\u7F13\\u5B58\\u8BBE\\u7F6E",null),r("respHeaders","\\u{1F4DD}","\\u6539\\u5199\\u54CD\\u5E94\\u5934 / Response Cache Rule","\\u54CD\\u5E94\\u5934\\u6539\\u5199\\u4E0E\\u54CD\\u5E94\\u7EA7\\u7F13\\u5B58\\u63A7\\u5236",null),l.appendChild(Z("\\u246B-\\u2471","\\u7F13\\u5B58 / \\u56DE\\u6E90 / \\u54CD\\u5E94\\uFF08\\u8FD0\\u884C\\u65F6\\uFF09","\\u5168\\u7AD9\\u515C\\u5E95\\u89C4\\u5219\\u5728\\u6B64\\u88AB\\u5E94\\u7528\\uFF1B\\u4EE5\\u4E0B\\u4E3A\\u8FD0\\u884C\\u65F6\\u63A8\\u5BFC\\u884C\\u4E3A\\u3002")),l.appendChild(W("\\u{1F516}","\\u246B \\u7F13\\u5B58\\u952E","\\u5408\\u5E76 policy \\u65F6\\uFF0C\\u5168\\u7AD9\\u89C4\\u5219\\u7684\\u7F13\\u5B58\\u52A8\\u4F5C\\u4F5C\\u4E3A\\u6700\\u4F4E\\u4F18\\u5148\\u7EA7\\u515C\\u5E95\\u3002","\\u63A8\\u5BFC",null,null,null)),l.appendChild(W("\\u26A1","\\u246C \\u67E5\\u7F13\\u5B58","\\u8FD0\\u884C\\u65F6\\u884C\\u4E3A\\u3002","\\u8FD0\\u884C\\u65F6",null,null,null)),l.appendChild(W("\\u{1F5C4}\\uFE0F","\\u246D \\u56DE\\u6E90\\u5FAA\\u73AF","\\u53D7\\u5168\\u7AD9\\u89C4\\u5219\\u7684\\u56DE\\u6E90\\u8FDE\\u63A5\\u53C2\\u6570\\u5F71\\u54CD\\u3002","\\u8FD0\\u884C\\u65F6",null,null,null)),l.appendChild(W("\\u{1F9EC}","\\u246E clone","\\u8FD0\\u884C\\u65F6\\u884C\\u4E3A\\u3002","\\u8FD0\\u884C\\u65F6",null,null,null)),l.appendChild(W("\\u{1F4BE}","\\u2470 \\u5199\\u7F13\\u5B58","\\u6309 \\u246A \\u5168\\u7AD9\\u7F13\\u5B58\\u7B56\\u7565\\u5199\\u5165\\u3002","\\u8FD0\\u884C\\u65F6",null,null,null)),l.appendChild(W("\\u{1F464}","\\u2471 \\u8FD4\\u56DE\\u7528\\u6237","\\u56FA\\u5B9A\\u884C\\u4E3A\\u3002","\\u56FA\\u5B9A",null,null,null));let m=e("button",{class:"btn",text:"\\u7F16\\u8F91\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\uFF08\\u246A \\u7F13\\u5B58\\uFF09"});m.onclick=()=>lt("cache",{...V.cache,stage:"cache"}),l.appendChild(e("div",{class:"seq-tools"},[m]))}return a.addEventListener("change",()=>g(a.value)),g(o),t}function Z(t,n,s){return e("div",{class:"seq-group"},[e("span",{class:"seq-group-no",text:t}),e("div",{class:"seq-group-main"},[e("div",{class:"seq-group-title",text:n}),s?e("div",{class:"seq-group-desc",text:s}):null])])}function W(t,n,s,o,a,l,d){let i=o==="\\u672A\\u914D\\u7F6E"||o==="\\u672A\\u4F7F\\u7528"||o==="\\u5DF2\\u505C\\u7528",h=e("div",{class:"seq-stage"+(l?" clickable":"")},[e("div",{class:"seq-icon",text:t}),e("div",{class:"seq-main"},[e("div",{class:"seq-title"},[e("span",{},n),o!=null?e("span",{class:"seq-badge "+(i?"off":"on")},o):null]),e("div",{class:"seq-summary",text:s}),d?e("div",{class:"seq-owner",text:"\\u5F52\\u5C5E\\uFF1A"+d}):null]),l?e("div",{class:"seq-go",text:"\\u524D\\u5F80\\u8BBE\\u7F6E \\u2192"}):null]);return l&&(h.onclick=l),h}function qt(t,n,s,o,a,l,d){let i=t.action||{},h=e("div",{class:"seq-rule-head"},[a?e("span",{class:"seq-grip",title:"\\u62D6\\u62FD\\u8C03\\u6574\\u987A\\u5E8F",text:"\\u283F"}):null,e("span",{class:"seq-rule-prio",text:"\\u987A\\u5E8F "+(d??"?")}),e("span",{class:"seq-rule-name",text:(t.name||(t.id?"#"+t.id:"\\u89C4\\u5219"))+(i.poolId?" \\u2192 "+Se(i.poolId):"")}),e("span",{class:"seq-badge "+(t.enabled===!1?"off":"on"),text:t.enabled===!1?"\\u505C\\u7528":"\\u542F\\u7528"})]),p=e("div",{class:"seq-subs"},(n.length?n:["\\uFF08\\u65E0\\u52A8\\u4F5C\\uFF0C\\u4EC5\\u4F5C\\u4E3A\\u5339\\u914D\\u5360\\u4F4D\\uFF09"]).map(c=>e("span",{class:"seq-chip",text:c}))),g=e("div",{class:"seq-stage seq-rule seq-rule-inpack"+(t.enabled===!1?" disabled":"")+(a?" seq-rule-drag":"")},[e("div",{class:"seq-icon",text:"\\u21B3"}),e("div",{class:"seq-main"},[h,t.note?e("div",{class:"seq-note muted",text:t.note}):null,e("div",{class:"seq-summary",text:`\\u5339\\u914D\\u6761\\u4EF6\\uFF1A${s} \\u9879${s?"\\uFF08\\u547D\\u4E2D\\u5373\\u6267\\u884C\\u4E0B\\u5217\\u52A8\\u4F5C\\uFF09":"\\uFF08\\u5339\\u914D\\u5168\\u90E8\\u8BF7\\u6C42\\uFF09"}`}),p]),e("div",{class:"seq-go",text:"\\u7F16\\u8F91\\u89C4\\u5219 \\u2192"})]);a&&(g.draggable=!0);let f=l||ge(t),r=f&&V[f]?{...V[f],stage:f}:null;return g.onclick=()=>r?vt(o,r):P("\\u8BE5\\u89C4\\u5219\\u65E0\\u6709\\u6548\\u9636\\u6BB5\\u7D22\\u5F15","err"),g}async function Kt(){let t=e("div",{class:"section"});if(t.appendChild(e("h3",{},"\\u7F13\\u5B58\\u7BA1\\u7406")),!D.sites.length)return t.appendChild(e("p",{class:"empty"},"\\u6682\\u65E0\\u7AD9\\u70B9\\u3002")),t;let n=D.sites.map(s=>[s.host,"v"+String(s.cacheGen||0),Te([{label:"\\u6E05\\u7A7A\\u7F13\\u5B58",onClick:()=>jt(s.host)}])]);return t.appendChild(pe(["Host","\\u7F13\\u5B58\\u7248\\u672C","\\u64CD\\u4F5C"],n)),t}function Wt(t){let n=D.sites.find(a=>a.host===t),s=n&&n.cacheGen||0,o=e("div",{},[e("div",{class:"hint"},"\\u7AD9\\u70B9 "+t+" \\u5F53\\u524D\\u7F13\\u5B58\\u7248\\u672C v"+s+"\\u3002\\u6E05\\u7A7A\\u7F13\\u5B58\\u4F1A\\u9012\\u589E\\u7F13\\u5B58\\u7248\\u672C\\u53F7\\uFF0C\\u65B0\\u8BF7\\u6C42\\u5168\\u90E8\\u56DE\\u6E90\\u3002"),e("p",{},[e("button",{class:"btn btn-danger",text:"\\u6E05\\u7A7A\\u7F13\\u5B58",onclick:()=>jt(t)})])]);le("\\u7F13\\u5B58\\u7BA1\\u7406: "+t,"",o,null)}async function jt(t){if(await Ee("\\u6E05\\u7A7A\\u7F13\\u5B58","\\u7AD9\\u70B9 "+t+`\n\\u64CD\\u4F5C\\uFF1A\\u6E05\\u7A7A\\u7F13\\u5B58\\uFF08\\u9012\\u589E\\u7F13\\u5B58\\u7248\\u672C\\uFF0C\\u65B0\\u8BF7\\u6C42\\u5168\\u90E8\\u56DE\\u6E90\\uFF09\\uFF0C\\u662F\\u5426\\u7EE7\\u7EED\\uFF1F`))try{await N.cache.purge({host:t}),P("\\u5DF2\\u89E6\\u53D1\\u6E05\\u7A7A\\u7F13\\u5B58","ok"),await te(),await he(location.hash)}catch(s){P(s.message,"err")}}async function zt(){let t=e("div",{class:"section"});t.appendChild(e("h3",{},"\\u7CFB\\u7EDF\\u8BBE\\u7F6E"));let n=D.info;if(!n)try{n=await N.system.info(),D.info=n}catch(H){P(H.message,"err")}let s=n&&n.caps||{},o=[["\\u8FD0\\u884C\\u5E73\\u53F0",n&&n.platform||tt],["\\u7248\\u672C",n&&n.version||"\\u2014"],["\\u8FB9\\u7F18\\u7F13\\u5B58",s.hasEdgeCache?"\\u53EF\\u7528":"\\u4E0D\\u53EF\\u7528\\uFF08\\u964D\\u7EA7\\uFF09"],["TCP Socket",s.hasSocket?"\\u53EF\\u7528":"\\u4E0D\\u53EF\\u7528\\uFF08socket \\u5F15\\u64CE\\u964D\\u7EA7 fetch\\uFF09"],["D1",s.hasD1?"\\u53EF\\u7528":"\\u4E0D\\u53EF\\u7528"],["KV",s.hasKV?"\\u53EF\\u7528":"\\u4E0D\\u53EF\\u7528\\uFF08\\u914D\\u7F6E\\u65E0\\u6CD5\\u6301\\u4E45\\u5316\\uFF01\\uFF09"],["\\u7EDF\\u8BA1\\u9A71\\u52A8",n&&n.statsDriver||"none"]],a=n&&n.cache||null;a&&typeof a.hitRate=="number"&&o.push(["\\u7F13\\u5B58\\u547D\\u4E2D\\uFF08\\u672C\\u5B9E\\u4F8B\\uFF09",`${Ge(a.hitRate)}\\uFF08\\u547D\\u4E2D ${a.hits||0} / \\u672A\\u4E2D ${a.misses||0} / \\u67E5\\u8BE2 ${a.lookups||0}\\uFF09`]),n&&Array.isArray(n.limitations)&&n.limitations.length&&t.appendChild(e("div",{class:"banner warn"},n.limitations.map(H=>e("div",{},"\\u26A0 "+H.message)))),n&&n.bakedMode&&t.appendChild(e("div",{class:"banner info"},[e("div",{},"\\u{1F4E6} \\u5F53\\u524D\\u8FD0\\u884C\\u4E8E\\u300C\\u9759\\u6001\\u70D8\\u7119\\u914D\\u7F6E\\u300D\\u6A21\\u5F0F\\uFF08\\u53EA\\u8BFB\\uFF09"),e("div",{class:"muted"},"\\u914D\\u7F6E\\u7531\\u4E3B\\u8282\\u70B9\\uFF08\\u5982 Cloudflare \\u90E8\\u7F72\\uFF09\\u300C\\u7CFB\\u7EDF\\u8BBE\\u7F6E \\u2192 \\u5BFC\\u51FA\\u914D\\u7F6E\\u300D\\u540E\\u968F\\u4EE3\\u7801\\u6784\\u5EFA\\u53D1\\u5E03\\uFF0C\\u672C\\u8282\\u70B9\\u4E0D\\u8FDE\\u63A5\\u4EFB\\u4F55 KV / Redis\\uFF0C\\u6240\\u6709\\u914D\\u7F6E\\u4FEE\\u6539\\u5747\\u88AB\\u62D2\\u7EDD\\u3002"),e("div",{class:"muted"},"\\u5982\\u9700\\u4FEE\\u6539\\u914D\\u7F6E\\uFF1A\\u5728\\u4E3B\\u8282\\u70B9\\u4FEE\\u6539 \\u2192 \\u5BFC\\u51FA JSON \\u2192 \\u91CD\\u65B0\\u6784\\u5EFA\\u90E8\\u7F72\\uFF08npm run build -- --bake <\\u6587\\u4EF6>\\uFF09\\u3002")])),t.appendChild(pe(["\\u9879\\u76EE","\\u72B6\\u6001"],o));let l=n&&n.kvBackend||(s.hasKV?"native":"none"),d=!!(n&&n.redisConfigured),i=l==="baked"?"\\u9759\\u6001\\u70D8\\u7119\\u914D\\u7F6E\\uFF08\\u53EA\\u8BFB\\uFF0C\\u4E0D\\u4F9D\\u8D56 KV\\uFF09\\u{1F4E6}":l==="redis"?"\\u81EA\\u90E8\\u7F72 Redis\\uFF08Webdis\\uFF09\\u2705":l==="native"?"\\u5E73\\u53F0 KV\\uFF08CDN_KV / KV\\uFF09\\u2705":"\\u65E0\\uFF08\\u914D\\u7F6E\\u65E0\\u6CD5\\u6301\\u4E45\\u5316\\uFF09\\u274C",h=e("div",{class:"card-block"},[e("h4",{},"KV \\u5B58\\u50A8\\u540E\\u7AEF"),e("div",{class:"form-stack"},[y("\\u5F53\\u524D\\u540E\\u7AEF",e("span",{},i)),y("REDIS_URL \\u5DF2\\u914D\\u7F6E",e("span",{},d?"\\u662F":"\\u5426\\uFF08\\u4F7F\\u7528\\u5E73\\u53F0 KV \\u6216\\u9ED8\\u8BA4\\u914D\\u7F6E\\uFF09"))]),e("div",{class:"section-head"},[e("button",{class:"btn",text:"\\u6D4B\\u8BD5\\u8FDE\\u901A\\u6027\\uFF08\\u8BFB\\u5199\\u56DE\\u73AF\\uFF09",disabled:!!(n&&n.bakedMode),onclick:async H=>{let k=H.target;k.disabled=!0,k.textContent="\\u6D4B\\u8BD5\\u4E2D\\u2026";let T=document.getElementById("kv-ping-out");T&&(T.textContent="\\u8BF7\\u6C42\\u4E2D\\u2026",T.className="muted");try{let R=await N.kv.ping(),_=R&&R.ok;T&&(T.className=_?"ok-text":"err-text",T.textContent=_?`\\u2705 \\u540E\\u7AEF=${R.backend} \\u5EF6\\u8FDF=${R.latencyMs}ms \\u8BFB\\u5199\\u56DE\\u73AF\\u4E00\\u81F4`:`\\u274C \\u540E\\u7AEF=${R.backend||"?"} \\u9519\\u8BEF=${R.error||"\\u672A\\u77E5"}`)}catch(R){T&&(T.className="err-text",T.textContent="\\u8BF7\\u6C42\\u5931\\u8D25: "+R.message)}finally{k.disabled=!1,k.textContent="\\u6D4B\\u8BD5\\u8FDE\\u901A\\u6027\\uFF08\\u8BFB\\u5199\\u56DE\\u73AF\\uFF09"}}}),e("span",{id:"kv-ping-out",class:"muted"},"\\u70B9\\u51FB\\u6D4B\\u8BD5\\u81EA\\u90E8\\u7F72 Redis \\u662F\\u5426\\u53EF\\u8BFB\\u53EF\\u5199")]),e("p",{class:"muted small"},"\\u65E0\\u539F\\u751F KV \\u7684\\u5E73\\u53F0\\uFF08\\u5982 EdgeOne Pages / ESA\\uFF09\\u53EF\\u81EA\\u90E8\\u7F72 Webdis\\uFF08HTTP\\u2194Redis \\u7F51\\u5173\\uFF09\\uFF0C\\u5E76\\u5728\\u73AF\\u5883\\u53D8\\u91CF\\u914D\\u7F6E REDIS_URL \\u6307\\u5411\\u5B83\\uFF0C\\u672C\\u9879\\u76EE\\u5373\\u53EF\\u83B7\\u5F97\\u4E0E\\u5E73\\u53F0 KV \\u5B8C\\u5168\\u540C\\u6784\\u7684\\u6301\\u4E45\\u5316\\u80FD\\u529B\\uFF0C\\u914D\\u7F6E / \\u7EDF\\u8BA1\\u81EA\\u52A8\\u843D\\u5230\\u60A8\\u7684 Redis\\u3002")]);t.appendChild(h);let p=e("input",{class:"input",id:"g-adminPath",placeholder:"panel"}),g=e("input",{class:"input",id:"g-adminDomain",placeholder:"panel.example.com"}),f=e("input",{class:"input",id:"g-tokenTtl",type:"number"}),r=e("input",{class:"input",id:"g-configCacheTtl",type:"number"}),c=e("input",{class:"input",id:"g-globalRateLimit",type:"number",placeholder:"0 \\u8868\\u793A\\u4E0D\\u9650\\u5236"}),m=e("input",{type:"checkbox",id:"g-statsEnabled"}),x=M("g-statsDriver",[],"",[{value:"kv",label:"KV"},{value:"d1",label:"D1"+(s.hasD1?"":"\\uFF08\\u5F53\\u524D\\u5E73\\u53F0\\u4E0D\\u53EF\\u7528\\uFF09"),disabled:!s.hasD1},{value:"none",label:"\\u5173\\u95ED"}]),E=y("\\u7EDF\\u8BA1\\u9A71\\u52A8",x),v=()=>{E.style.display=m.checked?"":"none"};m.addEventListener("change",v),v();let F=H=>{H&&(p.value=H.adminPath||"",g.value=H.adminDomain||"",f.value=H.tokenTtl!=null?H.tokenTtl:"",r.value=H.configCacheTtl!=null?H.configCacheTtl:"",m.checked=!!H.statsEnabled,x.value=H.statsDriver||"none",c.value=H.globalRateLimit!=null?H.globalRateLimit:"",v())},$=e("div",{class:"card-block"},[e("h4",{},"\\u5168\\u5C40\\u914D\\u7F6E"),e("div",{class:"form-stack",id:"global-form"},[y("\\u7BA1\\u7406\\u9762\\u8DEF\\u5F84",p,"\\u7559\\u7A7A\\u8868\\u793A\\u6CBF\\u7528\\u5F53\\u524D\\u5DF2\\u4FDD\\u5B58\\u7684\\u503C\\u3002"),y("\\u81EA\\u5B9A\\u4E49\\u9762\\u677F\\u57DF\\u540D",g,"\\u7559\\u7A7A=\\u4EFB\\u610F\\u7ED1\\u5B9A\\u57DF\\u540D\\u5747\\u53EF\\u8FDB\\u7BA1\\u7406\\u9762\\u677F\\uFF1B\\u586B\\u5199\\u540E\\u4EC5\\u6B64\\u57DF\\u540D + \\u7BA1\\u7406\\u9762\\u8DEF\\u5F84\\u53EF\\u8FDB\\u5165\\uFF0C\\u89C4\\u907F\\u63A2\\u6D4B\\u4E0E\\u8D8A\\u754C\\u3002"),y("Token \\u6709\\u6548\\u671F\\uFF08\\u79D2\\uFF09",f,"\\u7559\\u7A7A\\u8868\\u793A\\u6CBF\\u7528\\u5F53\\u524D\\u5DF2\\u4FDD\\u5B58\\u7684\\u503C\\u3002"),y("\\u914D\\u7F6E\\u7F13\\u5B58 TTL\\uFF08\\u79D2\\uFF09",r,"\\u7559\\u7A7A\\u8868\\u793A\\u6CBF\\u7528\\u5F53\\u524D\\u5DF2\\u4FDD\\u5B58\\u7684\\u503C\\u3002"),y("\\u5168\\u5C40\\u9650\\u6D41\\uFF08req/s\\uFF09\\u26A0\\uFE0F\\u5B9E\\u9A8C\\u7279\\u6027",c,"\\u26A0\\uFE0F \\u5B9E\\u9A8C\\u7279\\u6027\\uFF08\\u5F85\\u5F00\\u53D1\\uFF09\\uFF1A\\u5168\\u5C40\\u8BF7\\u6C42\\u9891\\u7387\\u4E0A\\u9650\\uFF0C0 \\u8868\\u793A\\u4E0D\\u9650\\u5236\\uFF1B\\u6700\\u5C11 10 req/s\\u3002\\u5F53\\u524D\\u4E3A\\u5B9E\\u9A8C\\u9636\\u6BB5\\uFF0C\\u4E0D\\u5EFA\\u8BAE\\u751F\\u4EA7\\u4F9D\\u8D56\\u3002"),y("\\u542F\\u7528\\u7EDF\\u8BA1",m),E]),e("div",{class:"section-head"},[e("button",{class:"btn btn-primary",text:"\\u4FDD\\u5B58\\u5168\\u5C40\\u914D\\u7F6E",onclick:async()=>{let H={adminPath:p.value.trim(),adminDomain:g.value.trim(),tokenTtl:f.value.trim(),configCacheTtl:r.value.trim(),globalRateLimit:c.value.trim(),statsEnabled:m.checked,statsDriver:x.value};try{let k=await N.config.save(H);F(k);let T=Object.keys(H).filter(R=>{let _=H[R];return typeof _=="string"&&_===""?!1:String(_)!==String(k[R])});T.length?P("\\u5DF2\\u4FDD\\u5B58\\uFF0C\\u4F46\\u90E8\\u5206\\u503C\\u88AB\\u7CFB\\u7EDF\\u81EA\\u52A8\\u4FEE\\u6B63\\uFF1A"+T.join("\\u3001"),"warn"):P("\\u5DF2\\u4FDD\\u5B58\\u5168\\u5C40\\u914D\\u7F6E","ok"),await Ye()}catch(k){P(k.message,"err")}}})])]);t.appendChild($),t.appendChild(bn());try{F(await N.config.get())}catch{}return t.appendChild(e("div",{class:"section-head"},[e("button",{class:"btn",text:"\\u5BFC\\u51FA\\u914D\\u7F6E",onclick:vn}),e("button",{class:"btn",text:"\\u5BFC\\u5165\\u914D\\u7F6E",onclick:mn}),e("button",{class:"btn",text:"\\u4FEE\\u6539\\u5BC6\\u7801",onclick:gn}),e("button",{class:"btn btn-danger",text:"\\u9000\\u51FA\\u767B\\u5F55",onclick:Qe})])),t}async function mn(){if(!await Ee("\\u5BFC\\u5165\\u914D\\u7F6E","\\u5BFC\\u5165\\u5C06\\u8986\\u76D6\\u5F53\\u524D\\u7AD9\\u70B9/\\u6E90\\u7AD9\\u6C60\\uFF08\\u9ED8\\u8BA4\\u4E0D\\u542B\\u5168\\u5C40\\u914D\\u7F6E\\u4E0E\\u5168\\u7AD9\\u89C4\\u5219\\uFF09\\uFF0C\\u4E14\\u4E0D\\u53EF\\u6062\\u590D\\u3002\\u786E\\u8BA4\\u7EE7\\u7EED\\uFF1F",{confirmText:"IMPORT"}))return;let n=e("input",{type:"file",accept:".json,application/json"});n.onchange=async()=>{let s=n.files&&n.files[0];if(!s)return;let o;try{o=JSON.parse(await s.text())}catch{P("\\u914D\\u7F6E\\u6587\\u4EF6\\u4E0D\\u662F\\u5408\\u6CD5\\u7684 JSON","err");return}if(!o||typeof o!="object"||!Array.isArray(o.sites)&&!Array.isArray(o.pools)){P("\\u914D\\u7F6E\\u6587\\u4EF6\\u683C\\u5F0F\\u4E0D\\u6B63\\u786E\\uFF08\\u7F3A\\u5C11 sites/pools\\uFF09","err");return}let a=D.info&&D.info.version;o.version&&a&&o.version!==a&&P(`\\u5BFC\\u51FA\\u6587\\u4EF6\\u7248\\u672C ${o.version} \\u4E0E\\u5F53\\u524D\\u8282\\u70B9 ${a} \\u53EF\\u80FD\\u4E0D\\u517C\\u5BB9`,"warn"),fn(o)},n.click()}function fn(t){let n=Array.isArray(t.sites)?t.sites.length:0,s=Array.isArray(t.pools)?t.pools.length:0,o=!!(t.global&&typeof t.global=="object"),a=!!(t.globalRules&&typeof t.globalRules=="object"),l=!!t.incomplete,d=e("input",{type:"checkbox"}),i=e("input",{type:"checkbox"}),h=(f,r)=>y(f,e("span",{text:r})),p=l?e("div",{class:"modal-text",style:"color:var(--warn,#c0843e);",text:"\\u26A0 \\u8BE5\\u5BFC\\u51FA\\u4E3A\\u4E0D\\u5B8C\\u6574\\u955C\\u50CF\\uFF08\\u7AD9\\u70B9\\u8D85\\u51FA\\u5355\\u6B21\\u626B\\u63CF\\u4E0A\\u9650\\uFF09\\uFF0C\\u4EC5\\u542B\\u53EF\\u679A\\u4E3E\\u7AD9\\u70B9\\u3002"}):null,g=e("div",{class:"modal-mask",style:"display:flex;"},[e("div",{class:"modal"},[e("h3",{class:"modal-title",text:"\\u5BFC\\u5165\\u9884\\u89C8"}),e("div",{class:"modal-text",text:"\\u4EE5\\u4E0B\\u5185\\u5BB9\\u5C06\\u88AB\\u5199\\u5165\\u5F53\\u524D\\u8282\\u70B9\\uFF08\\u8986\\u76D6\\u540C\\u540D\\u9879\\uFF0C\\u4E0D\\u5220\\u9664\\u672A\\u5305\\u542B\\u9879\\uFF09\\uFF1A"}),e("div",{class:"modal-extra"},[h("\\u7AD9\\u70B9\\u6570\\u91CF",String(n)),h("\\u6E90\\u7AD9\\u6C60\\u6570\\u91CF",String(s)),h("\\u542B\\u5168\\u5C40\\u914D\\u7F6E",o?"\\u662F":"\\u5426"),h("\\u542B\\u5168\\u7AD9\\u89C4\\u5219",a?"\\u662F":"\\u5426"),...p?[p]:[]]),o||a?e("div",{class:"modal-extra",style:"margin-top:8px;border-top:1px solid var(--border);padding-top:8px;"},[e("div",{class:"modal-text",text:"\\u53EF\\u9009\\uFF1A\\u4E00\\u5E76\\u5BFC\\u5165\\u4EE5\\u4E0B\\u5168\\u5C40\\u9879\\uFF08\\u9ED8\\u8BA4\\u4E0D\\u5BFC\\u5165\\uFF0C\\u5B89\\u5168\\u8D77\\u89C1\\uFF09"}),...o?[y("\\u4E00\\u5E76\\u5BFC\\u5165\\u5168\\u5C40\\u914D\\u7F6E",d)]:[],...a?[y("\\u4E00\\u5E76\\u5BFC\\u5165\\u5168\\u7AD9\\u89C4\\u5219",i)]:[]]):null,e("div",{class:"modal-foot",style:"margin-top:16px;display:flex;gap:8px;justify-content:flex-end;"},[e("button",{class:"btn",text:"\\u53D6\\u6D88",onclick:()=>g.remove()}),e("button",{class:"btn btn-primary",text:"\\u786E\\u8BA4\\u5BFC\\u5165",onclick:async()=>{let f={global:o&&d.checked,globalRules:a&&i.checked},r=g.querySelector(".btn-primary");r.disabled=!0;try{let c=await N.system.import({...t,includeGlobal:f}),m=c&&c.message?c.message:"\\u914D\\u7F6E\\u5DF2\\u5BFC\\u5165",x=c&&Array.isArray(c.errors)&&c.errors.length?`\\uFF0C${c.errors.length} \\u9879\\u5931\\u8D25`:"",E=c&&c.versionWarning?`\\uFF08${c.versionWarning}\\uFF09`:"";P(m+x+E,c&&c.errors&&c.errors.length?"warn":"ok"),g.remove(),await Ye()}catch(c){r.disabled=!1,P(c.message,"err")}}})])])]);document.body.appendChild(g)}function gn(){let t=e("input",{class:"input",type:"password",placeholder:"\\u5F53\\u524D\\u5BC6\\u7801"}),n=e("input",{class:"input",type:"password",placeholder:"\\u65B0\\u5BC6\\u7801\\uFF08\\u81F3\\u5C11 8 \\u4F4D\\uFF09"}),s=e("input",{class:"input",type:"password",placeholder:"\\u786E\\u8BA4\\u65B0\\u5BC6\\u7801"}),o=e("div",{class:"modal-mask",style:"display:flex;"},[e("div",{class:"modal"},[e("h3",{class:"modal-title",text:"\\u4FEE\\u6539\\u5BC6\\u7801"}),e("div",{class:"modal-text",text:"\\u4FEE\\u6539\\u6210\\u529F\\u540E\\u9700\\u91CD\\u65B0\\u767B\\u5F55\\u3002"}),e("div",{class:"modal-extra"},[y("\\u5F53\\u524D\\u5BC6\\u7801",t),y("\\u65B0\\u5BC6\\u7801",n),y("\\u786E\\u8BA4\\u65B0\\u5BC6\\u7801",s)]),e("div",{class:"modal-foot",style:"margin-top:16px;display:flex;gap:8px;justify-content:flex-end;"},[e("button",{class:"btn",text:"\\u53D6\\u6D88",onclick:()=>o.remove()}),e("button",{class:"btn btn-primary",text:"\\u786E\\u8BA4\\u4FEE\\u6539",onclick:async()=>{if((n.value||"").length<8){P("\\u65B0\\u5BC6\\u7801\\u81F3\\u5C11 8 \\u4F4D","err");return}if(n.value!==s.value){P("\\u4E24\\u6B21\\u8F93\\u5165\\u7684\\u65B0\\u5BC6\\u7801\\u4E0D\\u4E00\\u81F4","err");return}try{let a=await N.auth.changePassword(t.value,n.value);o.remove(),P(a&&a.reloginRequired?"\\u5BC6\\u7801\\u5DF2\\u4FEE\\u6539\\uFF0C\\u8BF7\\u91CD\\u65B0\\u767B\\u5F55":"\\u5BC6\\u7801\\u5DF2\\u4FEE\\u6539","ok"),a&&a.reloginRequired&&setTimeout(Qe,800)}catch(a){P(a.message,"err")}}})])])]);document.body.appendChild(o)}async function vn(){try{let n=await(await N.system.export()).blob(),s=URL.createObjectURL(n),o=e("a",{href:s,download:"cdn-edge-gateway-config.json"});document.body.appendChild(o),o.click(),o.remove(),setTimeout(()=>URL.revokeObjectURL(s),1e3)}catch(t){P(t.message,"err")}}function bn(){let t=e("div",{class:"card-block"},[e("h4",{},"\\u914D\\u7F6E\\u540C\\u6B65\\uFF08\\u8DE8\\u5E73\\u53F0\\u63A8\\u9001\\uFF09")]),n=e("span",{class:"badge badge-off",text:"\\u72B6\\u6001\\uFF1A\\u68C0\\u6D4B\\u4E2D\\u2026"}),s=e("input",{class:"input",readonly:!0,placeholder:"\\u5F00\\u542F\\u540E\\u6B64\\u5904\\u663E\\u793A\\u6821\\u9A8C\\u7801"}),o=e("button",{class:"btn btn-primary",text:"\\u5F00\\u542F\\u63A5\\u6536"}),a=e("button",{class:"btn btn-danger",text:"\\u5173\\u95ED\\u63A5\\u6536",disabled:!0}),l=e("button",{class:"btn",text:"\\u590D\\u5236\\u6821\\u9A8C\\u7801",disabled:!0}),d=null,i=v=>{d&&(clearInterval(d),d=null);let F=!!(v&&v.open);if(n.className="badge "+(F?"badge-on":"badge-off"),F){n.textContent="\\u72B6\\u6001\\uFF1A\\u5DF2\\u5F00\\u653E",o.disabled=!0,a.disabled=!1,l.disabled=!s.value;let $=v.expiresAt||0;d=setInterval(()=>{let H=$-Date.now();if(H<=0){n.textContent="\\u72B6\\u6001\\uFF1A\\u5DF2\\u5173\\u95ED\\uFF08\\u5DF2\\u8FC7\\u671F\\uFF09",d&&(clearInterval(d),d=null),o.disabled=!1,a.disabled=!0,l.disabled=!0,s.value="";return}let k=Math.ceil(H/1e3),T=Math.floor(k/60);n.textContent=`\\u72B6\\u6001\\uFF1A\\u5DF2\\u5F00\\u653E\\uFF08\\u5269\\u4F59 ${T}:${String(k%60).padStart(2,"0")}\\uFF09`},1e3)}else n.textContent="\\u72B6\\u6001\\uFF1A\\u5DF2\\u5173\\u95ED",o.disabled=!1,a.disabled=!0,l.disabled=!0,s.value=""},h=async()=>{try{let v=await N.sync.status();i(v)}catch{n.textContent="\\u72B6\\u6001\\uFF1A\\u672A\\u77E5",n.className="badge badge-off"}};o.onclick=async()=>{o.disabled=!0;try{let v=await N.sync.open();s.value=v.code||"",i({open:!0,expiresAt:v.expiresAt}),P("\\u63A5\\u6536\\u63A5\\u53E3\\u5DF2\\u5F00\\u542F\\uFF0C\\u6821\\u9A8C\\u7801\\u5DF2\\u751F\\u6210\\uFF0810 \\u5206\\u949F\\u5185\\u6709\\u6548\\uFF09","ok")}catch(v){P(v.message,"err"),o.disabled=!1}},a.onclick=async()=>{a.disabled=!0;try{await N.sync.close(),i({open:!1}),P("\\u63A5\\u6536\\u63A5\\u53E3\\u5DF2\\u5173\\u95ED","ok")}catch(v){P(v.message,"err"),a.disabled=!1}},l.onclick=()=>{s.value&&navigator.clipboard?.writeText(s.value).then(()=>P("\\u6821\\u9A8C\\u7801\\u5DF2\\u590D\\u5236","ok"),()=>P("\\u590D\\u5236\\u5931\\u8D25\\uFF0C\\u8BF7\\u624B\\u52A8\\u9009\\u62E9","err"))};let p=e("div",{class:"sync-subpanel"},[e("div",{class:"section-head-inline"},[e("strong",{},"\\u63A5\\u6536\\u65B9\\uFF08\\u672C\\u673A\\u4F5C\\u4E3A\\u76EE\\u6807\\uFF09"),n]),e("p",{class:"muted small"},"\\u5F00\\u542F\\u540E\\u751F\\u6210\\u4E00\\u6B21\\u6027\\u6821\\u9A8C\\u7801\\uFF0C\\u53D1\\u9001\\u65B9\\u51ED\\u300C\\u6821\\u9A8C\\u7801 + \\u7BA1\\u7406\\u5BC6\\u7801\\u300D\\u53EF\\u5C06\\u914D\\u7F6E\\u63A8\\u9001\\u81F3\\u672C\\u673A\\uFF1B\\u63A5\\u53E3\\u9ED8\\u8BA4\\u5173\\u95ED\\uFF0C\\u63A8\\u9001\\u6210\\u529F\\u540E\\u81EA\\u52A8\\u5173\\u95ED\\uFF0C10 \\u5206\\u949F\\u672A\\u7528\\u4E5F\\u4F1A\\u81EA\\u52A8\\u5931\\u6548\\u3002"),e("div",{class:"form-stack"},[y("\\u6821\\u9A8C\\u7801",s)]),e("div",{class:"section-head"},[o,a,l])]),g=e("input",{class:"input",placeholder:"https://eo.example.com"}),f=e("input",{class:"input",placeholder:"\\u7BA1\\u7406\\u9762\\u8DEF\\u5F84\\uFF0C\\u5982 __panel\\uFF08\\u53EF\\u7559\\u7A7A\\uFF09"}),r=e("input",{class:"input",placeholder:"\\u63A5\\u6536\\u65B9\\u63D0\\u4F9B\\u7684\\u6821\\u9A8C\\u7801"}),c=e("input",{class:"input",type:"password",placeholder:"\\u672C\\u673A ADMIN_PASSWORD"}),m=e("button",{class:"btn btn-primary",text:"\\u63A8\\u9001\\u672C\\u673A\\u914D\\u7F6E"}),x=e("div",{class:"muted small",text:"\\u5C06\\u628A\\u672C\\u673A\\u5168\\u90E8\\u7AD9\\u70B9 / \\u6E90\\u7AD9\\u6C60 / \\u5168\\u5C40\\u89C4\\u5219\\u63A8\\u9001\\u5230\\u63A5\\u6536\\u65B9\\u3002"});m.onclick=async()=>{let v=g.value.trim(),F=r.value.trim(),$=c.value;if(!v||!F||!$){P("\\u8BF7\\u586B\\u5199\\u63A5\\u6536\\u65B9 URL\\u3001\\u6821\\u9A8C\\u7801\\u4E0E\\u7BA1\\u7406\\u5BC6\\u7801","err");return}m.disabled=!0,x.className="muted small",x.textContent="\\u6B63\\u5728\\u62C9\\u53D6\\u672C\\u673A\\u914D\\u7F6E\\u955C\\u50CF\\u5E76\\u63A8\\u9001\\u2026";try{let k=await(await N.system.export()).json(),T=await N.sync.push(v,f.value.trim(),F,$,k),R=T&&T.imported?T.imported:{},_=T&&Array.isArray(T.errors)&&T.errors.length?`\\uFF0C${T.errors.length} \\u9879\\u5931\\u8D25`:"";x.className="ok-text small",x.textContent=`\\u2705 \\u63A8\\u9001\\u6210\\u529F${_}\\uFF08\\u7AD9\\u70B9 ${R.sites||0} / \\u6E90\\u7AD9\\u6C60 ${R.pools||0} / \\u5168\\u5C40 ${R.global?1:0} / \\u515C\\u5E95\\u89C4\\u5219 ${R.globalRules?1:0}\\uFF09\\uFF1B\\u63A5\\u6536\\u63A5\\u53E3\\u5DF2\\u81EA\\u52A8\\u5173\\u95ED\\u3002`,P("\\u914D\\u7F6E\\u5DF2\\u63A8\\u9001\\u5230\\u63A5\\u6536\\u65B9","ok")}catch(H){x.className="err-text small",x.textContent="\\u274C \\u63A8\\u9001\\u5931\\u8D25: "+H.message,P(H.message,"err")}finally{m.disabled=!1}};let E=e("div",{class:"sync-subpanel"},[e("div",{class:"section-head-inline"},[e("strong",{},"\\u53D1\\u9001\\u65B9\\uFF08\\u672C\\u673A\\u4F5C\\u4E3A\\u6E90\\uFF09")]),e("p",{class:"muted small"},"\\u586B\\u5199\\u63A5\\u6536\\u65B9\\u4FE1\\u606F\\u540E\\uFF0C\\u5C06\\u628A\\u672C\\u673A\\u5B8C\\u6574\\u914D\\u7F6E\\u955C\\u50CF\\u8DE8\\u7AD9\\u63A8\\u9001\\u8FC7\\u53BB\\u3002\\u6821\\u9A8C\\u7801\\u4E0E\\u7BA1\\u7406\\u5BC6\\u7801\\u4EC5\\u5728\\u672C\\u6B21\\u8BF7\\u6C42\\u4E2D\\u7528\\u4E8E\\u63A5\\u6536\\u65B9\\u53CC\\u91CD\\u6821\\u9A8C\\uFF0C\\u4E0D\\u4F1A\\u7559\\u5B58\\u3002"),e("div",{class:"form-stack"},[y("\\u63A5\\u6536\\u65B9 URL",g),y("\\u7BA1\\u7406\\u9762\\u8DEF\\u5F84",f),y("\\u6821\\u9A8C\\u7801",r),y("\\u672C\\u673A\\u7BA1\\u7406\\u5BC6\\u7801",c)]),e("div",{class:"section-head"},[m]),x]);return t.appendChild(p),t.appendChild(E),h(),t}var yn={overview:bt,sites:Xt,sequence:Mt,pools:Vt,cache:Kt,system:zt},xn={overview:"\\u6982\\u89C8",sites:"\\u7AD9\\u70B9\\u7BA1\\u7406",sequence:"\\u6D41\\u91CF\\u5E8F\\u5217",pools:"\\u6E90\\u7AD9\\u7BA1\\u7406",cache:"\\u7F13\\u5B58\\u7BA1\\u7406",system:"\\u7CFB\\u7EDF\\u8BBE\\u7F6E"};async function he(t){let n=(t||location.hash||"").replace(/^#\\/?/,"")||"overview",s=yn[n]||bt;S("page-title").textContent=xn[n]||"\\u6982\\u89C8",yt().forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#/"+n));let o=S("content");ae(o),o.appendChild(e("div",{class:"loading"},"\\u52A0\\u8F7D\\u4E2D\\u2026"));try{let a=await s();ae(o),a&&o.appendChild(a)}catch(a){ae(o),o.appendChild(e("div",{class:"empty err"},a.message||"\\u52A0\\u8F7D\\u5931\\u8D25"))}}function yt(){return Array.from(document.querySelectorAll(\'#nav a[href^="#/"]\'))}function P(t,n){let s=S("toasts");if(!s)return;let o=e("div",{class:"toast"+(n?" "+n:"")},t);s.appendChild(o),setTimeout(()=>{o.classList.add("hide"),setTimeout(()=>o.remove(),200)},3e3)}function le(t,n,s,o){S("drawer-title").textContent=t,S("drawer-hint").textContent=n||"";let a=S("drawer-body");if(ae(a),a.appendChild(s),S("drawer-mask").hidden=!1,S("drawer").hidden=!1,S("drawer-save").hidden=!o,!o){S("drawer-save").onclick=null;return}S("drawer-save").onclick=async()=>{try{S("drawer-save").disabled=!0,await o(),He(),P("\\u5DF2\\u4FDD\\u5B58","ok"),await he(location.hash)}catch(l){P(l.message||"\\u4FDD\\u5B58\\u5931\\u8D25","err")}finally{S("drawer-save").disabled=!1}}}function He(){S("drawer").hidden=!0,S("drawer-mask").hidden=!0}function it(t){t&&requestAnimationFrame(()=>{let n=document.getElementById(t);n&&(n.scrollIntoView({block:"start",behavior:"smooth"}),n.classList.add("flash-anchor"),setTimeout(()=>n.classList.remove("flash-anchor"),1600))})}function Ee(t,n,s){return s=s||{},new Promise(o=>{S("confirm-title").textContent=t,S("confirm-text").textContent=n||"";let a=S("confirm-extra"),l=S("confirm-input");s.confirmText?(a.hidden=!1,S("confirm-extra-label").textContent=s.confirmLabel||"",l.value="",l.placeholder=s.confirmPlaceholder||""):a.hidden=!0;let d=S("confirm-mask");d.hidden=!1;let i=h=>{d.hidden=!0,h&&s.confirmText?o(l.value.trim()===s.confirmText):o(h)};S("confirm-ok").onclick=()=>i(!0),S("confirm-cancel").onclick=()=>i(!1)})}async function Qt(){try{let t=await N.auth.me();return!!(t&&t.authed)}catch{return!1}}async function Yt(t){let n=S("login-err");n.hidden=!0;try{await N.auth.login(t),xt()}catch(s){n.textContent=s.message||"\\u767B\\u5F55\\u5931\\u8D25",n.hidden=!1}}async function Qe(){try{await N.auth.logout()}catch{}rt()}function rt(){S("view-app").hidden=!0,S("view-login").hidden=!1}function xt(){S("view-login").hidden=!0,S("view-app").hidden=!1,Ye().catch(t=>P(t.message,"err")),he(location.hash)}function ne(t){return t&&(t.kind==="single"||t.kind==="pool")?t.kind:(t&&t.origins||[]).length===1?"single":"pool"}function Xe(t){let n=t.origins||[];if(!n.length)return"\\u2014";let s=o=>o.engine==="r2"?`r2:${o.r2Binding||"?"}`:`${o.scheme||"https"}://${o.addr||"?"}${o.port&&o.port!==443&&o.port!==80?":"+o.port:""}`;return n.length===1?s(n[0]):`${s(n[0])} \\u7B49 ${n.length} \\u4E2A`}function De(){return[...D.pools].sort((t,n)=>ne(t)===ne(n)?0:ne(t)==="single"?-1:1).map(t=>({value:t.id,label:`${ne(t)==="single"?"\\uFF3B\\u5355\\u4E00\\uFF3D":"\\uFF3B\\u6C60\\uFF3D"} ${t.name||t.id} \\u2014 ${Xe(t)}`}))}function wn(t){let n=t.refs||[];return n.length?e("button",{class:"btn btn-sm",text:`${n.length} \\u5904\\u5F15\\u7528`,onclick:()=>kn(t)}):e("span",{class:"hint",text:"\\u672A\\u88AB\\u5F15\\u7528"})}async function Vt(){let t=e("div",{class:"section"});if(t.appendChild(e("div",{class:"section-head"},[e("h3",{},"\\u6E90\\u7AD9"),e("button",{class:"btn btn-primary",text:"+ \\u65B0\\u5EFA\\u6E90\\u7AD9\\u6C60",onclick:()=>_e(null,"pool")})])),t.appendChild(e("div",{class:"hint"},"\\u8FD9\\u91CC\\u7EB5\\u89C8\\u5168\\u90E8\\u4E0A\\u6E38\\u3002\\u300C\\u5355\\u4E00\\u6E90\\u7AD9\\u300D= \\u4E00\\u4E2A\\u5730\\u5740\\uFF0C\\u5728\\u65B0\\u5EFA/\\u7F16\\u8F91\\u7AD9\\u70B9\\u65F6\\u76F4\\u63A5\\u586B\\u5199\\u6E90\\u7AD9\\u5730\\u5740\\u4F1A\\u81EA\\u52A8\\u521B\\u5EFA\\u5E76\\u51FA\\u73B0\\u5728\\u8FD9\\u91CC\\uFF1B\\u300C\\u6E90\\u7AD9\\u6C60\\u300D= \\u591A\\u4E2A\\u6E90\\u7AD9 + \\u8D1F\\u8F7D\\u5747\\u8861\\u7B56\\u7565\\uFF0C\\u53EA\\u80FD\\u7528\\u53F3\\u4E0A\\u89D2\\u6309\\u94AE\\u65B0\\u5EFA\\u3002\\u4E24\\u8005\\u5F15\\u7528\\u65B9\\u5F0F\\u4E00\\u81F4\\uFF0C\\u7AD9\\u70B9\\u4E0E\\u89C4\\u5219\\u90FD\\u6309\\u540C\\u4E00\\u4E2A\\u4E0B\\u62C9\\u9009\\u62E9\\u3002")),!D.pools.length)return t.appendChild(e("p",{class:"empty"},"\\u6682\\u65E0\\u6E90\\u7AD9\\u3002\\u65B0\\u5EFA\\u7AD9\\u70B9\\u5E76\\u586B\\u5199\\u6E90\\u7AD9\\u5730\\u5740\\u4F1A\\u81EA\\u52A8\\u751F\\u6210\\u5355\\u4E00\\u6E90\\u7AD9\\uFF1B\\u9700\\u8981\\u591A\\u6E90\\u7AD9\\u8D1F\\u8F7D\\u5747\\u8861\\u8BF7\\u70B9\\u300C+ \\u65B0\\u5EFA\\u6E90\\u7AD9\\u6C60\\u300D\\u3002")),t;let n={single:0,pool:1},o=[...D.pools].sort((a,l)=>{let d=n[ne(a)]-n[ne(l)];return d!==0?d:String(a.name||a.id).localeCompare(String(l.name||l.id))}).map(a=>{let d=ne(a)==="single";return[e("span",{class:"badge "+(d?"badge-single":"badge-pool")},d?"\\u5355\\u4E00\\u6E90\\u7AD9":"\\u6E90\\u7AD9\\u6C60"),a.name||a.id,Xe(a),d?"\\u2014":a.strategy||"chain",String((a.origins||[]).length),wn(a),Te([{label:"\\u7F16\\u8F91",onClick:()=>_e(a.id)},{label:"\\u5220\\u9664",cls:"btn-danger",onClick:()=>Cn(a.id,a)}])]});return t.appendChild(pe(["\\u7C7B\\u578B","\\u540D\\u79F0","\\u5730\\u5740","\\u7B56\\u7565","\\u6E90\\u7AD9\\u6570","\\u5F15\\u7528","\\u64CD\\u4F5C"],o)),t}function kn(t){let n=t.refs||[],s=n.map(a=>[a.type==="site"?"\\u7AD9\\u70B9":a.type==="globalRule"?"\\u5168\\u5C40\\u89C4\\u5219":"\\u7AD9\\u70B9\\u89C4\\u5219",a.label||"\\u2014",a.detail||"\\u2014",a.host?Te([{label:"\\u524D\\u5F80\\u7AD9\\u70B9",onClick:()=>{He(),location.hash="#/sites",we(a.host)}}]):e("span",{class:"hint",text:"\\u2014"})]),o=e("div",{},[e("div",{class:"hint"},`\\u300C${t.name||t.id}\\u300D\\u5F53\\u524D\\u88AB ${n.length} \\u5904\\u5F15\\u7528\\u3002\\u5B58\\u5728\\u5F15\\u7528\\u65F6\\u65E0\\u6CD5\\u5220\\u9664\\uFF1B\\u8BF7\\u5148\\u628A\\u8FD9\\u4E9B\\u5F15\\u7528\\u6539\\u6307\\u5230\\u522B\\u7684\\u6E90\\u7AD9\\u3002`),s.length?pe(["\\u6765\\u6E90","\\u5BF9\\u8C61","\\u8BF4\\u660E","\\u64CD\\u4F5C"],s):e("p",{class:"empty"},"\\u6682\\u65E0\\u5F15\\u7528\\u3002")]);le("\\u5F15\\u7528\\u8BE6\\u60C5: "+(t.name||t.id),"",o,null)}async function _e(t,n){let s;if(t)try{s=await N.pools.get(t)}catch(k){P(k.message,"err");return}else s={id:"",name:"",kind:n||"pool",strategy:"chain",origins:[],failover:null};let o=n||ne(s),a=o==="single",l=!(D.info&&D.info.caps&&D.info.caps.hasRawIpFetch),d=e("div",{id:"origin-list"}),i=M("",[],s.strategy||"chain",[{value:"chain",label:"\\u94FE\\u5F0F\\u56DE\\u9000 \\xB7\\u5747\\u8861\\uFF08\\u574F\\u6E90\\u7AD9\\u6392\\u9664\\u540E\\u5269\\u4F59\\u6E90\\u7AD9\\u5168\\u90E8\\u53C2\\u4E0E\\uFF0Corder \\u6D3E\\u751F\\u6743\\u91CD\\uFF09"},{value:"roundrobin",label:"\\u5E73\\u6ED1\\u52A0\\u6743\\u8F6E\\u8BE2\\uFF08\\u914D weight \\u751F\\u6548\\uFF0C\\u672A\\u914D\\u5219\\u8F6E\\u6D41\\uFF09"},{value:"random",label:"\\u968F\\u673A\\uFF08\\u914D weight \\u6309\\u6743\\u91CD\\u968F\\u673A\\uFF0C\\u672A\\u914D\\u7B49\\u6982\\u7387\\uFF09"},{value:"weighted",label:"\\u5E73\\u6ED1\\u52A0\\u6743\\uFF08\\u4E25\\u683C\\u6309\\u6743\\u91CD\\u6BD4\\u4F8B\\u5E73\\u6ED1\\u5206\\u914D\\uFF09"},{value:"iphash",label:"IP \\u4E00\\u81F4\\u6027\\u54C8\\u5E0C\\uFF08\\u589E\\u5220\\u6E90\\u7AD9\\u6700\\u5C0F\\u8FC1\\u79FB\\uFF1B\\u547D\\u4E2D\\u574F\\u6E90\\u7AD9\\u73AF\\u5185\\u56DE\\u9000\\uFF09"}]);i.className="input";let h=[],p=()=>{let k=["weighted","roundrobin","chain"].includes(i.value);h.forEach(T=>{T.style.display=k?"":"none"})};i.addEventListener("change",p);let g=k=>{k=k||{id:"",enabled:!0,order:0,weight:1,engine:"fetch",scheme:"https",addr:"",port:443};let T=M("",[],"",[{value:"fetch",label:"fetch\\uFF08\\u652F\\u6301\\u81EA\\u5B9A\\u4E49 Host\\uFF09"},{value:"socket",label:"socket\\uFF08\\u5DF2\\u5F03\\u7528\\uFF09",disabled:!0},{value:"r2",label:"r2\\uFF08\\u56DE\\u6E90\\u5230 R2 \\u6876\\uFF0C\\u4EC5 CF\\uFF09",disabled:!(D.info&&D.info.caps&&D.info.caps.hasR2)},{value:"cnb",label:"cnb\\uFF08CNB \\u4ED3\\u5E93 raw\\uFF0C\\u81EA\\u52A8\\u751F\\u6210\\u7684\\u89C4\\u5219\\uFF09"},{value:"github",label:"github\\uFF08GitHub \\u4ED3\\u5E93 raw\\uFF0C\\u81EA\\u52A8\\u751F\\u6210\\u7684\\u89C4\\u5219\\uFF09"}]);T.value=k.engine||"fetch",T.className="input o-engine";let R={fetch:{ph:"\\u57DF\\u540D / IP\\uFF08\\u53EF\\u5E26\\u7AEF\\u53E3\\uFF09\\uFF0C\\u5982 storage.example.net \\u6216 1.2.3.4:8080",hint:"\\u4F60\\u7684\\u771F\\u5B9E\\u670D\\u52A1\\u5668\\u5730\\u5740\\uFF08fetch \\u4E3A\\u6807\\u51C6 HTTP \\u56DE\\u6E90\\uFF09\\u3002"},socket:{ph:"\\u771F\\u5B9E\\u76EE\\u6807\\u4E3B\\u673A\\uFF08\\u57DF\\u540D/IP\\uFF0C\\u53EF\\u5E26\\u7AEF\\u53E3\\uFF09\\uFF0C\\u5982 origin.internal:9000",hint:"TCP \\u900F\\u4F20\\uFF08\\u5DF2\\u5F03\\u7528\\uFF09\\u3002"},r2:{ph:"R2 \\u6876\\u540D\\uFF0C\\u5982 my-bucket\\uFF08\\u5730\\u5740\\u680F\\u9690\\u85CF\\uFF0C\\u6539\\u7528\\u4E0B\\u65B9 R2 \\u5B57\\u6BB5\\uFF09",hint:"\\u56DE\\u6E90\\u5230 R2 \\u6876\\uFF08\\u4EC5 CF\\uFF09\\uFF1B\\u5730\\u5740\\u7531\\u4E0B\\u65B9 R2 \\u7ED1\\u5B9A\\u51B3\\u5B9A\\u3002"},cnb:{ph:"\\u4ED3\\u5E93\\u5730\\u5740\\uFF0C\\u5982 https://cnb.cool/owner/repo",hint:"CNB \\u4ED3\\u5E93\\u578B\\u5F15\\u64CE\\uFF1A\\u5730\\u5740\\u680F\\u9690\\u85CF\\uFF0C\\u6539\\u7528\\u4E0B\\u65B9\\u4ED3\\u5E93\\u5B57\\u6BB5\\u3002"},github:{ph:"\\u4ED3\\u5E93\\u5730\\u5740\\uFF0C\\u5982 https://github.com/owner/repo",hint:"GitHub \\u4ED3\\u5E93\\u578B\\u5F15\\u64CE\\uFF1A\\u5730\\u5740\\u680F\\u9690\\u85CF\\uFF0C\\u6539\\u7528\\u4E0B\\u65B9\\u4ED3\\u5E93\\u5B57\\u6BB5\\u3002"}},_=e("input",{class:"input o-r2-binding",value:k.r2Binding||"",placeholder:"CDN_R2\\uFF08\\u5FC5\\u987B\\u4E0E wrangler.toml \\u7684 binding \\u4E00\\u81F4\\uFF09"}),B=e("input",{class:"input o-r2-prefix",value:k.r2KeyPrefix||"",placeholder:"\\u5982 img/\\uFF08\\u6876\\u5185\\u76EE\\u5F55\\u9694\\u79BB\\uFF0C\\u7559\\u7A7A=\\u65E0\\uFF09"}),U=M("",[""],k.r2KeyMode||"none",[{value:"none",label:"none\\uFF08pathname \\u539F\\u6837\\u4F5C key\\uFF09"},{value:"prefix",label:"prefix\\uFF08\\u5728 key \\u524D\\u52A0\\u524D\\u7F00\\uFF09"},{value:"strip",label:"strip\\uFF08\\u5265\\u9664\\u5F00\\u5934\\u4E32\\uFF09"},{value:"regex",label:"regex\\uFF08\\u6B63\\u5219\\u66FF\\u6362\\uFF09"}],"o-r2-keymode"),C=e("input",{class:"input o-r2-rule",value:k.r2KeyPrefixRule||"",placeholder:"prefix/strip: \\u524D\\u7F00\\u4E32\\uFF1Bregex: \\u6B63\\u5219"}),u=e("input",{class:"input o-r2-to",value:k.r2KeyRegexTo||"",placeholder:"regex \\u6A21\\u5F0F\\u4E0B\\u7684\\u66FF\\u6362\\u503C"}),w=y("\\u8F6C\\u6362\\u53C2\\u6570\\uFF08r2KeyPrefixRule\\uFF09",C,"prefix/strip \\u65F6\\u586B\\u524D\\u7F00/\\u8981\\u5265\\u9664\\u7684\\u5F00\\u5934\\uFF1Bregex \\u65F6\\u586B\\u6B63\\u5219\\u5728 r2KeyPrefixRule\\u3002"),A=y("\\u6B63\\u5219\\u66FF\\u6362\\u503C\\uFF08r2KeyRegexTo\\uFF09",u,"\\u4EC5 regex \\u6A21\\u5F0F\\u4F7F\\u7528\\u3002"),b=e("div",{class:"o-r2-fields"},[y("R2 \\u7ED1\\u5B9A\\u540D\\uFF08r2Binding\\uFF09",_,"wrangler.toml \\u91CC [[r2_buckets]].binding \\u7684\\u503C\\uFF0C\\u5982 CDN_R2\\u3002\\u5F15\\u64CE\\u9009 r2 \\u65F6\\u5FC5\\u586B\\u3002"),y("R2 key \\u524D\\u7F00\\uFF08r2KeyPrefix\\uFF09",B,"\\u62FC\\u5230\\u6700\\u7EC8 key \\u524D\\u9762\\u7684\\u56FA\\u5B9A\\u4E32\\uFF0C\\u7528\\u4E8E\\u591A\\u7AD9\\u70B9\\u5171\\u7528\\u4E00\\u4E2A\\u6876\\u65F6\\u9694\\u79BB\\u76EE\\u5F55\\u3002"),y("pathname \\u2192 key \\u8F6C\\u6362\\u65B9\\u5F0F\\uFF08r2KeyMode\\uFF09",U,"none \\u539F\\u6837\\uFF1Bprefix \\u5728\\u524D\\u52A0\\u4E32\\uFF1Bstrip \\u5265\\u5F00\\u5934\\u4E32\\uFF1Bregex \\u7528\\u6B63\\u5219\\u66FF\\u6362\\u3002\\u89C4\\u5219\\u7EA7 rewrite \\u5DF2\\u5148\\u4F5C\\u7528\\uFF0C\\u8FD9\\u91CC\\u505A\\u6700\\u540E\\u4E00\\u6B65\\u3002"),w,A]),L=()=>{let ue=U.value;w.style.display=ue==="prefix"||ue==="strip"||ue==="regex"?"":"none",A.style.display=ue==="regex"?"":"none"};U.onchange=L,L();let I=e("input",{class:"input o-repo-user",value:k.repoUser||"",placeholder:"\\u7EC4\\u7EC7 / owner"}),G=e("input",{class:"input o-repo-name",value:k.repoName||"",placeholder:"\\u4ED3\\u5E93\\u540D\\uFF08\\u4E0D\\u542B .git\\uFF09"}),K=e("input",{class:"input o-repo-branch",value:k.repoBranch||"main",placeholder:"\\u5206\\u652F\\uFF0C\\u9ED8\\u8BA4 main"}),q=e("input",{class:"input o-repo-private",type:"checkbox",checked:!!k.repoPrivate}),O=!!(k.cnbTokenEnc||k.githubTokenEnc),z=e("input",{class:"input o-repo-token",type:"password",value:"",placeholder:O?"\\u5DF2\\u8BBE\\u7F6E\\u52A0\\u5BC6 token\\uFF0C\\u7559\\u7A7A\\u8868\\u793A\\u4E0D\\u6539":"\\u8BBF\\u95EE\\u4EE4\\u724C\\uFF08\\u516C\\u5F00\\u4ED3\\u5E93\\u53EF\\u7559\\u7A7A\\uFF09"}),Q=e("div",{class:"o-repo-fields"},[y("\\u4ED3\\u5E93\\u5F52\\u5C5E\\uFF08repoUser\\uFF09",I,"cnb=\\u7EC4\\u7EC7/\\u7528\\u6237\\uFF1Bgithub=owner\\u3002"),y("\\u4ED3\\u5E93\\u540D\\uFF08repoName\\uFF09",G,"\\u4E0D\\u542B .git \\u540E\\u7F00\\u3001\\u4E0D\\u542B\\u7EC4\\u7EC7\\u524D\\u7F00\\u3002"),y("\\u5206\\u652F\\uFF08repoBranch\\uFF09",K,"\\u6620\\u5C04\\u5230 raw URL \\u7684 ref \\u6BB5\\uFF0C\\u9ED8\\u8BA4 main\\u3002"),e("div",{class:"field"},[e("label",{},"\\u662F\\u5426\\u79C1\\u6709\\u4ED3\\u5E93\\uFF08repoPrivate\\uFF09"),e("label",{class:"check"},[q]),e("div",{class:"field-hint muted"},"\\u52FE\\u9009=\\u79C1\\u6709\\uFF08\\u6CE8\\u5165 Authorization \\u9274\\u6743\\uFF09\\uFF1B\\u4E0D\\u52FE=\\u516C\\u5F00\\uFF08\\u533F\\u540D\\u56DE\\u6E90\\uFF0C\\u53EF\\u4E0D\\u586B token\\uFF09")]),y("\\u8BBF\\u95EE\\u4EE4\\u724C\\uFF08token\\uFF09",z,"\\u52A0\\u5BC6\\u540E\\u843D\\u76D8\\uFF08\\u6BCF\\u7AD9\\u72EC\\u7ACB\\uFF09\\u3002\\u516C\\u5F00\\u4ED3\\u5E93\\u53EF\\u7559\\u7A7A\\uFF1B\\u7F16\\u8F91\\u65F6\\u7559\\u7A7A\\u8868\\u793A\\u4E0D\\u6539\\u3002")]),J=e("div",{class:"hint",text:"\\u56DE\\u6E90\\u8FDE\\u63A5\\u53C2\\u6570\\uFF08\\u534F\\u8BAE / \\u7AEF\\u53E3 / \\u5F15\\u64CE / Host\\uFF09\\u4F5C\\u4E3A\\u672C\\u6E90\\u7AD9\\u6574\\u6C60\\u9ED8\\u8BA4\\uFF1B\\u5982\\u9700\\u6309\\u8BF7\\u6C42\\u6761\\u4EF6\\u5DEE\\u5F02\\u5316\\uFF0C\\u8BF7\\u5728\\u2468\\u300COrigin Rules\\u300D\\u91CC\\u8BBE\\u7F6E\\u5BF9\\u5E94\\u89C4\\u5219\\uFF0C\\u89C4\\u5219\\u7EA7\\u8BBE\\u7F6E\\u4F1A\\u8986\\u76D6\\u6B64\\u5904\\u9ED8\\u8BA4\\u503C\\u3002"}),me=e("input",{class:"input o-addr",value:k.addr||"",placeholder:R[k.engine||"fetch"].ph}),ie=y("\\u6E90\\u7AD9\\u5730\\u5740",me,"\\u683C\\u5F0F\\u968F\\u300C\\u5F15\\u64CE\\u7C7B\\u578B\\u300D\\u53D8\\u5316\\uFF0C\\u89C1\\u4E0A\\u65B9\\u63D0\\u793A\\u3002"),se=y("\\u7AEF\\u53E3",e("input",{class:"input o-port",type:"number",value:k.port||443}),"https \\u9ED8\\u8BA4 443\\uFF0Chttp \\u9ED8\\u8BA4 80\\u3002\\u53EF\\u88AB\\u2468\\u89C4\\u5219\\u8986\\u76D6\\u3002"),re=y("\\u534F\\u8BAE",M("",[""],k.scheme||"https",[{value:"https",label:"https"},{value:"http",label:"http"}],"o-scheme"),"\\u53EF\\u88AB\\u2468\\u89C4\\u5219\\u8986\\u76D6\\u3002"),X=M("",[],k.hostHeader?.mode||"origin",[{value:"accel",label:"\\u52A0\\u901F\\u57DF\\u540D\\uFF08\\u7AD9\\u70B9 Host\\uFF09"},{value:"origin",label:"\\u56DE\\u6E90\\u57DF\\u540D\\uFF08\\u6E90\\u7AD9\\u81EA\\u8EAB\\u5730\\u5740\\uFF09"},{value:"custom",label:"\\u81EA\\u5B9A\\u4E49\\u57DF\\u540D"}],"o-host-mode"),ce=e("input",{class:"input o-host-custom",value:k.hostHeader?.mode==="custom"&&k.hostHeader.custom||"",placeholder:"\\u5982 api1.internal"}),be=y("\\u56DE\\u6E90 Host\\uFF08\\u8BE5\\u6E90\\u7AD9\\u4E13\\u7528\\uFF09",e("div",{class:"host-mode-wrap"},[X,ce]),"\\u8FD9\\u53F0\\u6E90\\u7AD9\\u56DE\\u6E90\\u65F6\\u4F7F\\u7528\\u7684 Host \\u5934\\uFF1B\\u9ED8\\u8BA4\\u300C\\u56DE\\u6E90\\u57DF\\u540D\\u300D\\u5373\\u7528\\u6E90\\u7AD9\\u81EA\\u8EAB\\u5730\\u5740\\uFF0C\\u907F\\u514D\\u8BEF\\u7528\\u52A0\\u901F\\u57DF\\u540D\\u53BB\\u516C\\u7F51\\u6E90\\u7AD9\\u62C9\\u6570\\u636E\\u3002\\u2468\\u89C4\\u5219\\u518D\\u8BBE Host \\u4F1A\\u8986\\u76D6\\u5B83\\u3002"),ye=e("div",{class:"hint",text:"fetch \\u5F15\\u64CE\\u4E0B\\u81EA\\u5B9A\\u4E49 Host \\u7531\\u56DE\\u6E90\\u5730\\u5740\\u51B3\\u5B9A\\u3001\\u5E73\\u53F0\\u4F1A\\u9759\\u9ED8\\u4E22\\u5F03\\uFF1B\\u5982\\u9700\\u771F\\u6B63\\u81EA\\u5B9A\\u4E49 Host \\u8BF7\\u628A\\u5F15\\u64CE\\u6539\\u4E3A socket\\u3002cnb/github \\u7531\\u5F15\\u64CE\\u5E38\\u91CF\\u56FA\\u5B9A\\u56DE\\u6E90\\u57DF\\u540D\\uFF0C\\u6B64\\u5904\\u9009\\u62E9\\u4EC5\\u4F5C\\u793A\\u610F\\u3002"}),de=e("input",{class:"input o-name",value:k.name||"",placeholder:"\\u5982 \\u4E3B\\u7AD9 / \\u5317\\u4EAC\\u5907\\u4EFD"}),Y=y("\\u6E90\\u7AD9\\u540D\\u79F0",de,"\\u7ED9\\u8FD9\\u53F0\\u6E90\\u7AD9\\u8D77\\u4E2A\\u4E00\\u773C\\u80FD\\u770B\\u61C2\\u7684\\u540D\\u5B57\\uFF0C\\u4F1A\\u663E\\u793A\\u5728\\u6298\\u53E0\\u540E\\u7684\\u6807\\u9898\\u884C\\u3002"),oe=y("\\u6743\\u91CD\\uFF08\\u52A0\\u6743/\\u8F6E\\u8BE2/\\u94FE\\u5F0F\\u7B56\\u7565\\u751F\\u6548\\uFF09",e("input",{class:"input o-weight",type:"number",value:k.weight||1}),"\\u9ED8\\u8BA4 1 \\u5373\\u53EF\\u3002weighted \\u4E25\\u683C\\u6309\\u6743\\u91CD\\u5E73\\u6ED1\\u5206\\u914D\\uFF1Broundrobin \\u914D\\u4E86\\u6743\\u91CD\\u5373\\u751F\\u6548\\uFF1Bchain \\u7528 order \\u6D3E\\u751F\\u6743\\u91CD\\u3001\\u663E\\u5F0F\\u586B\\u4E86\\u5219\\u4F18\\u5148\\u6309\\u6B64\\u6743\\u91CD\\u3002");h.push(oe);let fe=()=>{let ue=T.value,qe=ue==="r2",Me=ue==="cnb"||ue==="github";me.placeholder=(R[ue]||R.fetch).ph,ie.querySelector(".field-hint").textContent=(R[ue]||R.fetch).hint,b.style.display=qe?"":"none",Q.style.display=Me?"":"none",ie.style.display=qe||Me?"none":"",se.style.display=qe||Me?"none":"",re.style.display=qe||Me?"none":"";let ct=!(qe||Me);be.style.display=ct?"":"none",ye.style.display=ct?"":"none",ce.style.display=ct&&X.value==="custom"?"":"none"},Le=()=>{ce.style.display=X.value==="custom"?"":"none"};X.onchange=Le,T.onchange=fe;let Fe=!!(k&&k.id),Je=e("span",{class:"origin-name-label",text:k.name||k.addr||(Fe?"\\uFF08\\u672A\\u547D\\u540D\\u6E90\\u7AD9\\uFF09":"\\u65B0\\u5EFA\\u6E90\\u7AD9")}),Ne=e("div",{class:"origin-head"},[e("span",{class:"origin-grip",text:"\\u283F",title:"\\u62D6\\u62FD\\u8C03\\u6574\\u4F18\\u5148\\u7EA7\\uFF08\\u4E0A=\\u4F18\\u5148\\uFF09"}),e("span",{class:"origin-tw",text:"\\u25B8"}),Je,e("button",{class:"btn btn-sm btn-danger",text:"\\u79FB\\u9664\\u6E90\\u7AD9",onclick:ue=>{ue.stopPropagation(),Ue.remove()}})]),Zt=e("div",{class:"origin-detail"},[Y,y("\\u5F15\\u64CE\\u7C7B\\u578B",T,"\\u5148\\u9009\\u5F15\\u64CE\\uFF0C\\u4E0B\\u65B9\\u5730\\u5740\\u683C\\u5F0F\\u4E0E\\u5B57\\u6BB5\\u968F\\u4E4B\\u53D8\\u5316\\uFF1A\\u2460 fetch=\\u6807\\u51C6 HTTP \\u56DE\\u6E90\\uFF1B\\u2461 socket=\\u5DF2\\u5F03\\u7528\\uFF1B\\u2462 r2=\\u56DE\\u6E90\\u5230 R2 \\u6876\\uFF08\\u4EC5 CF\\uFF09\\uFF1B\\u2463 cnb/github=\\u4ED3\\u5E93\\u578B\\u5F15\\u64CE\\uFF08\\u81EA\\u52A8\\u751F\\u6210\\u91CD\\u5199+\\u8BF7\\u6C42\\u5934\\u89C4\\u5219\\uFF09\\u3002\\u53EF\\u88AB\\u2468\\u89C4\\u5219\\u8986\\u76D6\\u3002"),ie,se,re,be,ye,b,Q,oe,J]),Ue=e("div",{class:"subcard origin-card"+(Fe?" collapsed":""),id:"o-"+(k.id||"new")},[Ne,Zt]);Ne.onclick=()=>Ue.classList.toggle("collapsed");let Ze=()=>{Ne.querySelector(".origin-tw").textContent=Ue.classList.contains("collapsed")?"\\u25B8":"\\u25BE",Je.textContent=de.value.trim()||me.value.trim()||(Fe?"\\uFF08\\u672A\\u547D\\u540D\\u6E90\\u7AD9\\uFF09":"\\u65B0\\u5EFA\\u6E90\\u7AD9")};new MutationObserver(Ze).observe(Ue,{attributes:!0,attributeFilter:["class"]}),de.addEventListener("input",Ze),me.addEventListener("input",Ze),Ze(),fe(),d.appendChild(Ue)};(s.origins||[]).forEach(g),(!s.origins||!s.origins.length)&&g(),p();let f=y("\\u8C03\\u5EA6\\u7B56\\u7565",i,"\\u591A\\u4E2A\\u6E90\\u7AD9\\u4E4B\\u95F4\\u600E\\u4E48\\u5206\\u914D\\u8BF7\\u6C42\\u3002\\u65B0\\u624B\\u76F4\\u63A5\\u7528\\u300C\\u94FE\\u5F0F\\u56DE\\u9000\\u300D\\u6700\\u7701\\u5FC3\\u3002"),r=s.failover||{},c=e("input",{class:"input o-penalty",type:"number",min:"0",max:"600",value:r.penaltySeconds??"",placeholder:"\\u9ED8\\u8BA4 15\\uFF080=\\u5173\\u95ED\\uFF09"}),m=e("input",{class:"input o-total-timeout",type:"number",min:"0",max:"120000",value:r.totalTimeoutMs??"",placeholder:"\\u9ED8\\u8BA4 0=\\u6309\\u5E73\\u53F0\\u4E0A\\u9650\\u81EA\\u52A8\\u63A8\\u5BFC"}),x=e("input",{class:"input o-speculative",type:"number",min:"0",max:"60000",value:r.speculativeMs??"",placeholder:"\\u9ED8\\u8BA4 500\\uFF080=\\u5173\\u95ED\\uFF09"}),E=ve("\\u56DE\\u6E90\\u91CD\\u8BD5 / \\u6545\\u969C\\u8F6C\\u79FB","\\u5931\\u8D25\\u5373\\u51B7\\u5374 \\xB7 \\u603B\\u65F6\\u95F4\\u9884\\u7B97 \\xB7 \\u7ADE\\u901F\\uFF08\\u7559\\u7A7A=\\u540E\\u7AEF\\u6309\\u6E90\\u7AD9\\u6570\\u5F52\\u4E00\\u5316\\uFF09",[y("\\u5931\\u8D25\\u5373\\u51B7\\u5374\\uFF08\\u79D2\\uFF09",c,"\\u4E00\\u6B21\\u56DE\\u6E90\\u5931\\u8D25\\u7ACB\\u5373\\u628A\\u8BE5\\u6E90\\u7AD9\\u653E\\u5165\\u51B7\\u5374\\u540D\\u5355 ~15s\\uFF08\\u4EC5\\u672C\\u8FB9\\u7F18\\u5185\\u5B58\\u751F\\u6548\\uFF0C\\u4E0D\\u8DE8\\u8FB9\\u7F18\\u5373\\u65F6\\u540C\\u6B65\\uFF09\\u3002\\u914D\\u5408\\u300C60s \\u5185\\u7D2F\\u8BA1 3 \\u6B21\\u7194\\u65AD\\u300D\\u5E76\\u5B58\\u4E92\\u8865\\uFF0C\\u907F\\u514D\\u53CD\\u590D\\u6253\\u540C\\u4E00\\u4E2A\\u521A\\u5931\\u8D25\\u7684\\u6E90\\u7AD9\\u30020=\\u5173\\u95ED\\u3002"),y("\\u603B\\u65F6\\u95F4\\u9884\\u7B97\\uFF08\\u6BEB\\u79D2\\uFF09",m,"\\u6574\\u8BF7\\u6C42\\u56DE\\u6E90\\u6700\\u957F\\u65F6\\u95F4\\u786C\\u9876\\uFF1B\\u8D85\\u8FC7\\u540E\\u4E0D\\u518D\\u5C1D\\u8BD5\\u65B0\\u6E90\\u7AD9\\uFF0C\\u89E6\\u53D1\\u300C\\u5168\\u5458\\u5931\\u8D25\\u515C\\u5E95\\u300D\\u3002\\u9ED8\\u8BA4 0=\\u6309\\u5E73\\u53F0\\u6267\\u884C\\u4E0A\\u9650\\u81EA\\u52A8\\u63A8\\u5BFC\\uFF08EO/ESA 120s\\u3001CF 30s \\u51CF\\u5B89\\u5168\\u4F59\\u91CF\\uFF09\\uFF0C\\u907F\\u514D (\\u6362\\u6E90\\u6B21\\u6570+1)\\xD7\\u8D85\\u65F6 \\u65E0\\u9884\\u7B97\\u53E0\\u52A0\\u649E\\u5E73\\u53F0\\u5899\\u949F\\u3002"),y("\\u7ADE\\u901F\\u9608\\u503C\\uFF08\\u6BEB\\u79D2\\uFF09",x,"\\u9996\\u4E2A\\u6E90\\u7AD9\\u8D85\\u8FC7\\u8BE5\\u65F6\\u95F4\\u672A\\u8FD4\\u56DE\\u9996\\u5B57\\u8282\\uFF0C\\u7ACB\\u5373\\u5E76\\u884C\\u6253\\u7B2C\\u4E8C\\u4E2A\\u5019\\u9009\\u6E90\\u7AD9\\uFF0C\\u8C01\\u5148\\u6210\\u529F\\u7528\\u8C01\\uFF08\\u4EC5 GET/HEAD \\u53CA\\u5DF2\\u7269\\u5316 body \\u7684\\u8BF7\\u6C42\\u542F\\u7528\\uFF0C\\u53CC\\u5199\\u5B89\\u5168\\uFF09\\u3002\\u9ED8\\u8BA4 500\\uFF1B0=\\u5173\\u95ED\\u7ADE\\u901F\\u3002")]),v=e("button",{class:"btn btn-sm",text:"+ \\u6DFB\\u52A0\\u6E90\\u7AD9",onclick:()=>{g(),p()}});a&&(f.style.display="none",v.style.display="none");let F=s.refs&&s.refs.length?e("div",{class:"hint"},`\\u5F53\\u524D\\u88AB ${s.refs.length} \\u5904\\u5F15\\u7528\\uFF1A${s.refs.map(k=>k.label).filter((k,T,R)=>R.indexOf(k)===T).join("\\u3001")}\\u3002\\u4FEE\\u6539\\u5730\\u5740\\u4F1A\\u7ACB\\u523B\\u5F71\\u54CD\\u8FD9\\u4E9B\\u7AD9\\u70B9\\u3002`):e("div",{class:"hint"},"\\u5F53\\u524D\\u672A\\u88AB\\u4EFB\\u4F55\\u7AD9\\u70B9\\u6216\\u89C4\\u5219\\u5F15\\u7528\\u3002"),$=e("div",{},[y("\\u6E90\\u7AD9 ID\\uFF08\\u7CFB\\u7EDF\\u81EA\\u52A8\\u751F\\u6210\\uFF09",e("input",{class:"input",id:"p-id",value:s.id||"",placeholder:"\\u4FDD\\u5B58\\u540E\\u81EA\\u52A8\\u751F\\u6210\\uFF08\\u5982 pl_xxx\\uFF09",disabled:!0})),y("\\u7C7B\\u578B",e("input",{class:"input",value:a?"\\u5355\\u4E00\\u6E90\\u7AD9\\uFF081 \\u4E2A\\u5730\\u5740\\uFF09":"\\u6E90\\u7AD9\\u6C60\\uFF08\\u591A\\u6E90\\u7AD9 + \\u8D1F\\u8F7D\\u5747\\u8861\\uFF09",disabled:!0}),a?"\\u5355\\u4E00\\u6E90\\u7AD9\\u901A\\u5E38\\u7531\\u300C\\u65B0\\u5EFA\\u7AD9\\u70B9\\u65F6\\u76F4\\u63A5\\u586B\\u5199\\u6E90\\u7AD9\\u5730\\u5740\\u300D\\u81EA\\u52A8\\u521B\\u5EFA\\u3002\\u82E5\\u8981\\u5347\\u7EA7\\u4E3A\\u6E90\\u7AD9\\u6C60\\uFF0C\\u8BF7\\u65B0\\u5EFA\\u4E00\\u4E2A\\u6E90\\u7AD9\\u6C60\\u5E76\\u628A\\u7AD9\\u70B9\\u6539\\u6307\\u8FC7\\u53BB\\u3002":"\\u6E90\\u7AD9\\u6C60\\u53EA\\u80FD\\u5728\\u300C\\u6E90\\u7AD9\\u300D\\u9875\\u624B\\u52A8\\u65B0\\u5EFA\\uFF0C\\u53EF\\u88AB\\u591A\\u4E2A\\u7AD9\\u70B9/\\u89C4\\u5219\\u5171\\u4EAB\\u5F15\\u7528\\u3002"),y("\\u540D\\u79F0\\uFF08\\u53EF\\u9009\\uFF0C\\u7528\\u4E8E\\u533A\\u5206\\uFF09",e("input",{class:"input",id:"p-name",value:s.name||"",placeholder:"\\u5982\\uFF1A\\u4E3B\\u7AD9\\u6E90\\u7AD9 / \\u5317\\u4EAC\\u5907\\u4EFD"}),"\\u7ED9\\u81EA\\u5DF1\\u770B\\u7684\\u5907\\u6CE8\\uFF0C\\u65B9\\u4FBF\\u5728\\u7AD9\\u70B9\\u548C\\u89C4\\u5219\\u91CC\\u9009\\u5BF9\\u6E90\\u7AD9\\u3002"),f,E,F,e("div",{class:"hint"},"\\u6E90\\u7AD9\\u53EA\\u8D1F\\u8D23\\u300C\\u5730\\u5740 + \\u8D1F\\u8F7D\\u5747\\u8861\\u300D\\u3002\\u56DE\\u6E90 Host\\u3001\\u8DEF\\u5F84\\u91CD\\u5199\\u3001\\u8BF7\\u6C42\\u5934\\u3001\\u54CD\\u5E94\\u5934\\u3001\\u7F13\\u5B58\\u7B49\\u5747\\u7531\\u300C\\u7AD9\\u70B9 \\u2192 \\u89C4\\u5219\\u5F15\\u64CE\\u300D\\u6309\\u6761\\u4EF6\\u7ED1\\u5B9A\\uFF0C\\u4E0D\\u5728\\u6B64\\u5904\\u8BBE\\u7F6E\\u3002\\u6E90\\u7AD9\\u6309\\u5217\\u8868\\u987A\\u5E8F\\u51B3\\u5B9A\\u94FE\\u5F0F\\u56DE\\u9000\\uFF08\\u8D8A\\u9760\\u524D\\u8D8A\\u4F18\\u5148\\uFF09\\u3002\\u300C\\u6E90\\u7AD9 ID\\u300D\\u662F\\u7ED9\\u673A\\u5668\\u5F15\\u7528\\u7528\\u7684\\u5185\\u90E8\\u4E3B\\u952E\\uFF0C\\u7531\\u7CFB\\u7EDF\\u81EA\\u52A8\\u751F\\u6210\\u3001\\u4E0D\\u53EF\\u6539\\uFF1B\\u5982\\u9700\\u7ED9\\u4EBA\\u533A\\u5206\\uFF0C\\u8BF7\\u586B\\u4E0A\\u9762\\u7684\\u300C\\u540D\\u79F0\\u300D\\u3002"),e("div",{id:"origin-head",class:"subhead"},[e("span",{},a?"\\u6E90\\u7AD9\\u5730\\u5740":"\\u6E90\\u7AD9\\u5217\\u8868"),v]),d]),H=a?"\\u5355\\u4E00\\u6E90\\u7AD9":"\\u6E90\\u7AD9\\u6C60";le(t?`\\u7F16\\u8F91${H}: `+(s.name||t):`\\u65B0\\u5EFA${H}`,"",$,async()=>{let k=s.id||"",T=[],R=(b,L)=>{let I=(b||"").trim();if(!I)return{addr:I,port:null};I=I.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\\/\\//,"").replace(/^\\/\\//,""),I=I.replace(/^[^@?#\\/:]+@/,"");let G=null;if(L==="cnb"||L==="github")I=I.replace(/[?#].*$/,"");else{I=I.replace(/[/?#].*$/,"");let K=I.match(/:(\\d+)$/);K&&(G=Number(K[1]),I=I.replace(/:\\d+$/,""))}return{addr:I,port:G}};if(Array.from(d.children).forEach((b,L)=>{let I=S(".o-engine",b).value,{addr:G,port:K}=R(S(".o-addr",b).value,I);K!=null&&S(".o-port",b)&&(S(".o-port",b).value=K);let q=I==="cnb"||I==="github";if(I!=="r2"&&!q&&!G)return;let O=s.origins&&s.origins[L]||{},z=S(".o-r2-keymode",b)?S(".o-r2-keymode",b).value:"none",Q={};if(q){let X=S(".o-repo-user",b).value.trim(),ce=S(".o-repo-name",b).value.trim(),be=S(".o-repo-branch",b).value.trim()||"main",ye=!!S(".o-repo-private",b).checked,de=I==="cnb"?"cnbTokenEnc":"githubTokenEnc",Y=S(".o-repo-token",b).value,oe=Y||O[de]||"";Q={repoUser:X,repoName:ce,repoBranch:be,repoPrivate:ye,[de]:oe}}let J=X=>(X||"").trim().toLowerCase().replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,""),me=J(S("p-name").value||s.name)||"pool",ie=I==="r2"?S(".o-r2-binding",b).value.trim()||"r2":q?S(".o-repo-name",b).value.trim()||I:"o"+L,se=J(S(".o-name",b).value)||J(ie),re=`o_${me}_${se}`;T.push({id:re,enabled:!0,order:L,weight:Number(S(".o-weight",b).value)||1,name:(S(".o-name",b).value||"").trim(),engine:I,scheme:S(".o-scheme",b)?S(".o-scheme",b).value:"https",addr:I==="r2"||q?"":G,port:Number(S(".o-port",b).value)||443,pathPrefix:O.pathPrefix||"",hostHeader:(()=>{if(q||I==="r2")return{mode:"inherit",custom:""};let X=S(".o-host-mode",b)?S(".o-host-mode",b).value:"origin",ce=S(".o-host-custom",b)?(S(".o-host-custom",b).value||"").trim():"";return X==="custom"?{mode:"custom",custom:ce}:X==="accel"?{mode:"accel",custom:""}:X==="inherit"?{mode:"inherit",custom:""}:{mode:"origin",custom:""}})(),extraHeaders:O.extraHeaders||{},...I==="r2"?{r2Binding:S(".o-r2-binding",b).value.trim(),r2KeyPrefix:S(".o-r2-prefix",b).value.trim(),r2KeyMode:z,r2KeyPrefixRule:S(".o-r2-rule",b).value.trim(),r2KeyRegexTo:S(".o-r2-to",b).value.trim()}:{},...Q})}),!T.length)throw new Error(a?"\\u8BF7\\u586B\\u5199\\u6E90\\u7AD9\\u5730\\u5740":"\\u81F3\\u5C11\\u9700\\u8981\\u4E00\\u4E2A\\u6E90\\u7AD9");if(a&&T.length>1)throw new Error("\\u5355\\u4E00\\u6E90\\u7AD9\\u53EA\\u80FD\\u6709 1 \\u4E2A\\u5730\\u5740\\uFF1B\\u9700\\u8981\\u591A\\u4E2A\\u8BF7\\u65B0\\u5EFA\\u300C\\u6E90\\u7AD9\\u6C60\\u300D");let _={...s.failover||{}},B=!1,U=b=>{let L=Number(b);return b===""||b==null||Number.isNaN(L)?void 0:L},C=U(c.value),u=U(m.value),w=U(x.value);C!==void 0&&(_.penaltySeconds=C,B=!0),u!==void 0&&(_.totalTimeoutMs=u,B=!0),w!==void 0&&(_.speculativeMs=w,B=!0);let A={name:S("p-name").value.trim(),kind:o,strategy:a?"chain":i.value,origins:T,...B?{failover:_}:s.failover?{failover:s.failover}:{},...s.createdBy?{createdBy:s.createdBy}:{}};await N.pools.save(k||null,A),await te()})}async function Cn(t,n){let s=n||D.pools.find(d=>d.id===t)||{},o=ne(s)==="single"?"\\u5355\\u4E00\\u6E90\\u7AD9":"\\u6E90\\u7AD9\\u6C60",a=s.refs||[];if(a.length){let d=[...new Set(a.map(i=>i.label))].join("\\u3001");P(`\\u8BE5${o}\\u4ECD\\u88AB ${a.length} \\u5904\\u5F15\\u7528\\uFF08${d}\\uFF09\\uFF0C\\u8BF7\\u5148\\u6539\\u6307\\u5176\\u5B83\\u6E90\\u7AD9\\u518D\\u5220\\u9664`,"err");return}if(await Ee(`\\u5220\\u9664${o}`,`\\u786E\\u5B9A\\u5220\\u9664\\u300C${s.name||t}\\u300D\\uFF1F\\u6B64\\u64CD\\u4F5C\\u4E0D\\u53EF\\u6062\\u590D\\u3002`))try{await N.pools.remove(t),P("\\u5DF2\\u5220\\u9664","ok"),await te(),await he(location.hash)}catch(d){P(d.message,"err")}}var Ie=Object.freeze({cnb:"CNB\\uFF08\\u817E\\u8BAF\\u4E91\\u4EE3\\u7801\\u4ED3\\u5E93\\uFF09",github:"GitHub"});function En(t,n){return t==="cnb"?n?"api.cnb.cool":"cnb.cool":t==="github"?"raw.githubusercontent.com":""}function Rn(t){return[{type:"prefix",value:"x-cnb"},{type:"prefix",value:"x-github"},{type:"exact",value:"x-runtime"},{type:"exact",value:"x-served-by"},{type:"exact",value:"x-amz-id-2"}]}function wt(t,n={}){let s=n.repoUser||"",o=n.repoName||"",a=n.repoBranch||"main",l=!!n.repoPrivate,d=[];n.originId&&(d=[{target:"origin",op:"equal",values:[n.originId]}]);let i={conditions:[d]},h=En(t,l),p=t==="cnb"?`/${s}/${o}/-/git/raw/${a}/$1`:`/${s}/${o}/${a}/$1`,g={id:`repo-${t}-${o}-rewrite`,name:`${Ie[t]} \\u4ED3\\u5E93 raw \\u6620\\u5C04\\uFF08${a}\\uFF09`,enabled:!0,stage:"rewrite",priority:10,match:i,action:{rewrite:{type:"regex",regexFrom:"^(/.*)$",regexTo:p,preserveQuery:!0}}},f={id:`repo-${t}-${o}-host`,name:`${Ie[t]} \\u56FA\\u5B9A\\u56DE\\u6E90 Host\\uFF08${h}\\uFF09`,enabled:!0,stage:"origin",priority:10,match:i,action:{hostHeader:{mode:"custom",custom:h}}},r={id:`repo-${t}-${o}-resp`,name:`${Ie[t]} \\u4ED3\\u5E93\\u7279\\u6709\\u54CD\\u5E94\\u5934\\u5265\\u79BB`,enabled:!0,stage:"respHeaders",priority:10,match:i,action:{respHeaders:{set:{},strip:Rn(t)}}},c=null;if(l){let m=t==="cnb"?"__cnb_token__":"__github_token__";c={id:`repo-${t}-${o}-auth`,name:`${Ie[t]} \\u79C1\\u6709\\u4ED3\\u5E93\\u9274\\u6743`,enabled:!0,stage:"reqHeaders",priority:10,match:i,action:{reqHeaders:{set:{Authorization:m},strip:[]}}}}return{rewrite:g,hostHeader:f,respHeaders:r,reqHeaders:c}}async function Xt(){let t=e("div",{class:"section"});if(t.appendChild(e("div",{class:"section-head"},[e("h3",{},"\\u7AD9\\u70B9\\u7BA1\\u7406"),e("button",{class:"btn btn-primary",text:"+ \\u65B0\\u5EFA\\u7AD9\\u70B9",onclick:()=>we(null)})])),!D.sites.length)return t.appendChild(e("p",{class:"empty"},"\\u6682\\u65E0\\u7AD9\\u70B9\\uFF0C\\u70B9\\u51FB\\u53F3\\u4E0A\\u89D2\\u65B0\\u5EFA\\u3002")),t;let n=D.sites.map(s=>{let o=D.pools.find(a=>a.id===s.poolId);return[s.host,s.enabled?"\\u542F\\u7528":"\\u505C\\u7528",o?e("span",{},[e("span",{class:"badge "+(ne(o)==="single"?"badge-single":"badge-pool")},ne(o)==="single"?"\\u5355\\u4E00":"\\u6C60"),e("span",{text:" "+(o.name||o.id)})]):s.poolId||"\\u2014",String((s.rules||[]).length),String(s.cacheGen||0),Te([{label:"\\u7F16\\u8F91",onClick:()=>we(s.host)},{label:"\\u7F13\\u5B58",onClick:()=>Wt(s.host)},{label:"\\u5220\\u9664",cls:"btn-danger",onClick:()=>An(s.host)}])]});return t.appendChild(pe(["Host","\\u72B6\\u6001","\\u6E90\\u7AD9","\\u89C4\\u5219\\u6570","\\u7F13\\u5B58\\u7248\\u672C","\\u64CD\\u4F5C"],n)),t}async function we(t,n){if(t==="__global__"||t==="__all__"){P("\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u8BF7\\u4F7F\\u7528\\u5168\\u7AD9\\u89C4\\u5219\\u7F16\\u8F91\\u5668","info");return}let s;if(t)try{s=await N.sites.get(t)}catch(R){P(R.message,"err");return}else s={host:"",enabled:!0,poolId:"",rules:[],security:{},cacheGen:0};let o=!!(s&&s.host),a=e("input",{class:"input",id:"f-host",value:s.host||"",placeholder:"example.com \\u6216 *.example.com"}),l=e("input",{type:"checkbox",id:"f-enabled",checked:s.enabled!==!1}),d=e("input",{type:"checkbox",id:"f-ipv6",checked:!!s.ipv6Support}),i=e("div",{},[e("div",{class:"subhead",id:"sec-basic"},[e("span",{},"\\u2460 \\u5339\\u914D\\u7AD9\\u70B9")]),e("div",{class:"hint"},"\\u6309 Host \\u547D\\u4E2D\\u7AD9\\u70B9\\u914D\\u7F6E\\uFF0C\\u51B3\\u5B9A\\u540E\\u7EED\\u6574\\u6761\\u7BA1\\u7EBF\\u8D70\\u54EA\\u5957\\u8BBE\\u7F6E\\u3002\\u6E90\\u7AD9\\uFF08\\u2462 \\u9996\\u8981\\u5206\\u6D41 / \\u246D \\u6E90\\u7AD9\\u6C60\\uFF09\\u3001\\u89C4\\u5219\\uFF08\\u2464~\\u246F\\uFF09\\u3001\\u5B89\\u5168\\uFF08\\u2461\\uFF09\\u5404\\u6709\\u72EC\\u7ACB\\u62BD\\u5C49\\u914D\\u7F6E\\uFF0C\\u4E92\\u4E0D\\u8D8A\\u754C\\u3002"),y("\\u52A0\\u901F\\u57DF\\u540D\\uFF08Host\\uFF09",a,o?"\\u7F16\\u8F91\\u65F6\\u4E0D\\u80FD\\u4FEE\\u6539\\uFF0C\\u5982\\u9700\\u66F4\\u6539\\u8BF7\\u5728\\u300C\\u7AD9\\u70B9\\u603B\\u89C8\\u300D\\u5220\\u9664\\u91CD\\u5EFA\\u3002":"\\u4F60\\u63A5\\u5165\\u52A0\\u901F\\u7684\\u57DF\\u540D\\uFF0C\\u4F8B\\u5982 example.com\\u3002"),y("\\u542F\\u7528",l),y("\\u652F\\u6301 IPv6 \\u8BBF\\u95EE",d)]),h,p,g,f,r,c,m,x,E,v,F,$,H,k;if(!o){let R=De();h=M("f-origin-mode",[{value:"inline",label:"\\u586B\\u5199\\u57DF\\u540D/IP"},{value:"pool",label:"\\u9009\\u62E9\\u5DF2\\u6709\\u6E90\\u7AD9"}],"inline"),h.className="input",p=M("f-dup-pool",[{value:"",label:R.length?"\\uFF08\\u8BF7\\u9009\\u62E9\\uFF09":"\\uFF08\\u6682\\u65E0\\u53EF\\u7528\\u6E90\\u7AD9\\uFF09"},...R],""),p.className="input";let _=y("\\u5DF2\\u6709\\u6E90\\u7AD9",p,"\\u4ECE\\u300C\\u6E90\\u7AD9\\u300D\\u6807\\u7B7E\\u9875\\u5DF2\\u521B\\u5EFA\\u7684\\u5355\\u4E00\\u6E90\\u7AD9\\u6216\\u6E90\\u7AD9\\u6C60\\u4E2D\\u9009\\u62E9\\u3002");g=e("input",{class:"input",id:"f-addr",value:"",placeholder:"storage.example.com \\u6216 1.2.3.4"}),f=e("input",{class:"input",id:"f-port",type:"number",value:"443"}),r=M("f-scheme",[],"https",[{value:"https",label:"https"},{value:"http",label:"http"}]),r.className="input",c=M("f-engine",[],"fetch",[{value:"fetch",label:"fetch\\uFF08\\u6807\\u51C6\\u56DE\\u6E90\\uFF0C\\u652F\\u6301\\u81EA\\u5B9A\\u4E49 Host\\uFF09"},{value:"socket",label:"socket\\uFF08\\u5DF2\\u5F03\\u7528\\uFF1A\\u81EA\\u5B9A\\u4E49 Host \\u73B0\\u7531 fetch \\u652F\\u6301\\uFF0C\\u52FF\\u7528\\uFF09",disabled:!0},{value:"r2",label:"r2\\uFF08\\u56DE\\u6E90\\u5230 R2 \\u6876\\uFF0C\\u4EC5 CF\\uFF09",disabled:!(D.info&&D.info.caps&&D.info.caps.hasR2)},{value:"cnb",label:"cnb\\uFF08CNB \\u4ED3\\u5E93 raw \\u9884\\u8BBE\\uFF1A\\u5E95\\u5C42 fetch + \\u81EA\\u52A8\\u5173\\u8054\\u89C4\\u5219\\uFF09"},{value:"github",label:"github\\uFF08GitHub \\u4ED3\\u5E93 raw \\u9884\\u8BBE\\uFF1A\\u5E95\\u5C42 fetch + \\u81EA\\u52A8\\u5173\\u8054\\u89C4\\u5219\\uFF09"}]),c.className="input",x=M("f-host-mode",[],"origin",[{value:"accel",label:"\\u52A0\\u901F\\u57DF\\u540D\\uFF08\\u5F53\\u524D\\u7AD9\\u70B9 Host\\uFF09"},{value:"origin",label:"\\u56DE\\u6E90\\u57DF\\u540D\\uFF08\\u6E90\\u7AD9\\u5730\\u5740\\u672C\\u8EAB\\uFF09"},{value:"custom",label:"\\u81EA\\u5B9A\\u4E49\\u57DF\\u540D"}]),x.className="input",E=e("input",{class:"input",id:"f-host-custom",value:"",placeholder:"\\u5982 backend.internal"});let B=y("\\u6E90\\u7AD9\\u5730\\u5740\\uFF08\\u57DF\\u540D / IP\\uFF09",g,"\\u4F60\\u7684\\u771F\\u5B9E\\u670D\\u52A1\\u5668\\u5730\\u5740\\u3002r2 / cnb / github \\u5F15\\u64CE\\u4E0D\\u9700\\u8981\\u6B64\\u5B57\\u6BB5\\u3002"),U=y("\\u7AEF\\u53E3",f,"https \\u9ED8\\u8BA4 443\\uFF0Chttp \\u9ED8\\u8BA4 80\\u3002"),C=y("\\u56DE\\u6E90\\u534F\\u8BAE",r,"\\u9009\\u62E9 https \\u5219\\u56DE\\u6E90\\u65F6\\u8D70\\u52A0\\u5BC6\\u901A\\u9053\\u3002"),u=y("\\u5F15\\u64CE",c,"fetch=\\u6807\\u51C6\\u56DE\\u6E90\\uFF08\\u652F\\u6301\\u81EA\\u5B9A\\u4E49 Host\\uFF09\\uFF1Br2=\\u56DE\\u6E90\\u5230 R2 \\u6876\\uFF08\\u4EC5 CF\\uFF09\\uFF1Bcnb/github=\\u4ED3\\u5E93\\u578B\\u6E90\\u7AD9\\u9884\\u8BBE\\uFF08\\u586B\\u4ED3\\u5E93\\u53C2\\u6570\\u5373\\u53EF\\uFF0C\\u5E95\\u5C42\\u7EDF\\u4E00\\u8D70 fetch \\u5F15\\u64CE\\u5E76\\u81EA\\u52A8\\u751F\\u6210 URL \\u91CD\\u5199 + \\u9274\\u6743\\u8BF7\\u6C42\\u5934 + \\u54CD\\u5E94\\u5934\\u5265\\u79BB \\u5173\\u8054\\u89C4\\u5219\\uFF09\\u3002");m=e("input",{class:"input",id:"f-r2-binding",value:"",placeholder:"CDN_R2\\uFF08\\u5FC5\\u987B\\u4E0E wrangler.toml \\u7684 R2 \\u7ED1\\u5B9A\\u540D\\u4E00\\u81F4\\uFF09"});let w=y("R2 \\u7ED1\\u5B9A\\u540D\\uFF08r2Binding\\uFF09",m,"wrangler.toml \\u91CC [[r2_buckets]].binding \\u7684\\u503C\\uFF0C\\u5982 CDN_R2\\u3002\\u5F15\\u64CE\\u9009 r2 \\u65F6\\u5FC5\\u586B\\uFF0C\\u4FDD\\u5B58\\u65F6\\u81EA\\u52A8\\u521B\\u5EFA\\u300C\\u5355\\u4E00\\u6E90\\u7AD9\\u300D\\u3002"),A=y("\\u56DE\\u6E90 Host",x,"\\u6E90\\u7AD9\\u54CD\\u5E94\\u8BF7\\u6C42\\u65F6\\u770B\\u5230\\u7684 Host \\u5934\\u3002\\u9009\\u300C\\u81EA\\u5B9A\\u4E49\\u57DF\\u540D\\u300D\\u65F6\\u9700\\u586B\\u4E0B\\u65B9\\u8F93\\u5165\\u6846\\u3002"),b=y("\\u56DE\\u6E90 Host \\u81EA\\u5B9A\\u4E49\\u503C",E,"\\u4EC5\\u7528\\u4E8E\\u56DE\\u6E90\\u8BF7\\u6C42\\u7684 Host \\u5934\\uFF0C\\u4E0E\\u7AD9\\u70B9\\u914D\\u7F6E\\u7684\\u300C\\u52A0\\u901F\\u57DF\\u540D\\u300D\\u65E0\\u5173\\u3002");v=e("input",{class:"input f-repo-user",value:"",placeholder:"\\u7EC4\\u7EC7 / owner"}),F=e("input",{class:"input f-repo-name",value:"",placeholder:"\\u4ED3\\u5E93\\u540D\\uFF08\\u4E0D\\u542B .git\\uFF09"}),$=e("input",{class:"input f-repo-branch",value:"main",placeholder:"\\u5206\\u652F\\uFF0C\\u9ED8\\u8BA4 main"}),H=e("input",{class:"input f-repo-private",type:"checkbox",checked:!1}),k=e("input",{class:"input f-repo-token",type:"password",value:"",placeholder:"\\u8BBF\\u95EE\\u4EE4\\u724C\\uFF08\\u516C\\u5F00\\u4ED3\\u5E93\\u53EF\\u7559\\u7A7A\\uFF09"});let L=e("div",{class:"f-repo-fields"},[y("\\u4ED3\\u5E93\\u5F52\\u5C5E\\uFF08repoUser\\uFF09",v,"cnb=\\u7EC4\\u7EC7/\\u7528\\u6237\\uFF1Bgithub=owner\\u3002"),y("\\u4ED3\\u5E93\\u540D\\uFF08repoName\\uFF09",F,"\\u4E0D\\u542B .git \\u540E\\u7F00\\u3001\\u4E0D\\u542B\\u7EC4\\u7EC7\\u524D\\u7F00\\u3002"),y("\\u5206\\u652F\\uFF08repoBranch\\uFF09",$,"\\u6620\\u5C04\\u5230 raw URL \\u7684 ref \\u6BB5\\uFF0C\\u9ED8\\u8BA4 main\\u3002"),e("div",{class:"field"},[e("label",{},"\\u662F\\u5426\\u79C1\\u6709\\u4ED3\\u5E93\\uFF08repoPrivate\\uFF09"),e("label",{class:"check"},[H]),e("div",{class:"field-hint muted"},"\\u52FE\\u9009=\\u79C1\\u6709\\uFF08\\u6CE8\\u5165 Authorization \\u9274\\u6743\\uFF0C\\u56DE\\u6E90\\u5230 api.cnb.cool\\uFF09\\uFF1B\\u4E0D\\u52FE=\\u516C\\u5F00\\uFF08\\u8D70 cnb.cool \\u516C\\u7F51\\uFF0C\\u53EF\\u4E0D\\u586B token\\uFF09\\u3002")]),y("\\u8BBF\\u95EE\\u4EE4\\u724C\\uFF08token\\uFF09",k,"\\u52A0\\u5BC6\\u540E\\u843D\\u76D8\\uFF08\\u6BCF\\u7AD9\\u72EC\\u7ACB\\uFF09\\u3002\\u516C\\u5F00\\u4ED3\\u5E93\\u53EF\\u7559\\u7A7A\\uFF1B\\u7F16\\u8F91\\u65F6\\u7559\\u7A7A\\u8868\\u793A\\u4E0D\\u6539\\u3002")]),I=e("div",{id:"origin-inline-fields"},[u,B,U,C,w,A,b,L]),G=()=>{let O=c.value,z=O==="r2",Q=O==="cnb"||O==="github";B.style.display=z||Q?"none":"",U.style.display=z||Q?"none":"",C.style.display=z||Q?"none":"",w.style.display=z?"":"none",L.style.display=Q?"":"none";let J=!(z||Q);A.style.display=J?"":"none",b.style.display=J?"":"none"},K=()=>{b.style.display=x.value==="custom"?"":"none"},q=()=>{let O=h.value;_.style.display=O==="pool"?"":"none",I.style.display=O==="inline"?"":"none",O==="inline"&&G()};h.onchange=q,x.onchange=K,c.onchange=G,q(),K(),i.appendChild(e("div",{class:"subhead"},[e("span",{},"\\u2461 \\u9ED8\\u8BA4\\u6E90\\u7AD9")])),i.appendChild(e("div",{class:"hint"},"\\u9009\\u300C\\u57DF\\u540D/IP\\u300D\\u586B\\u5730\\u5740\\u4FDD\\u5B58\\u65F6\\u4F1A\\u81EA\\u52A8\\u521B\\u5EFA\\u5355\\u4E00\\u6E90\\u7AD9\\u5E76\\u7ED1\\u5B9A\\uFF1B\\u9009\\u300C\\u6E90\\u7AD9\\u6C60\\u300D\\u5219\\u5F15\\u7528\\u5DF2\\u5EFA\\u597D\\u7684\\u3002")),i.appendChild(y("\\u6E90\\u7AD9\\u65B9\\u5F0F",h)),i.appendChild(_),i.appendChild(I)}let T={id:"blank",list:[]};if(!o){let R=M("f-template",[],"blank",[{value:"blank",label:"\\u52A0\\u8F7D\\u4E2D\\u2026"}]),_=e("div",{class:"field-hint muted"},""),B=e("div",{class:"field-hint muted"},""),U=()=>{let C=T.list.find(w=>w.id===R.value);T.id=R.value,_.textContent=C?C.desc:"";let u=C&&C.rules?C.rules.length:0;R.value==="blank"?B.textContent="\\u4E0D\\u4F1A\\u751F\\u6210\\u4EFB\\u4F55\\u89C4\\u5219\\uFF0C\\u5EFA\\u7AD9\\u540E\\u8BF7\\u81EA\\u884C\\u5230\\u300C\\u6D41\\u91CF\\u5E8F\\u5217 \\u2192 \\u89C4\\u5219\\uFF08\\u2464~\\u246F\\uFF09\\u300D\\u6DFB\\u52A0\\u3002":B.textContent="\\u5EFA\\u7AD9\\u540E\\u5C06\\u81EA\\u52A8\\u4EE5\\u6D41\\u91CF\\u5E8F\\u5217\\u89C4\\u5219\\u63A5\\u53E3\\u5199\\u5165 "+u+" \\u6761\\u89C4\\u5219\\uFF08\\u53C2\\u6570\\u5DF2\\u56FA\\u5B9A\\uFF09\\uFF0C\\u53EF\\u968F\\u65F6\\u5728\\u300C\\u6D41\\u91CF\\u5E8F\\u5217 \\u2192 \\u89C4\\u5219\\uFF08\\u2464~\\u246F\\uFF09\\u300D\\u589E\\u5220\\u6539\\u3002"};R.onchange=U,i.appendChild(e("div",{class:"subhead"},[e("span",{},"\\u7AD9\\u70B9\\u573A\\u666F\\u6A21\\u677F")])),i.appendChild(e("div",{class:"hint"},"\\u6309\\u7AD9\\u70B9\\u7C7B\\u578B\\u4E00\\u952E\\u94FA\\u597D\\u8BE5\\u573A\\u666F\\u4E0B\\u901A\\u7528\\u4E14\\u56FA\\u5B9A\\u7684\\u57FA\\u7840\\u89C4\\u5219\\uFF0C\\u7701\\u53BB\\u4ECE\\u96F6\\u914D\\u8D77\\u3002\\u6A21\\u677F\\u53C2\\u6570\\u4E3A\\u56FA\\u5B9A\\u9884\\u8BBE\\u3001\\u4E0D\\u53EF\\u5728\\u6B64\\u4FEE\\u6539\\uFF1B\\u5982\\u9700\\u8C03\\u6574\\uFF0C\\u5EFA\\u7AD9\\u540E\\u76F4\\u63A5\\u5230\\u300C\\u6D41\\u91CF\\u5E8F\\u5217 \\u2192 \\u89C4\\u5219\\u300D\\u6539\\u5BF9\\u5E94\\u89C4\\u5219\\u5373\\u53EF\\u3002")),i.appendChild(y("\\u52A0\\u901F\\u7C7B\\u578B",R,"")),i.appendChild(_),i.appendChild(B),N.sites.templates().then(C=>{T.list=C&&C.templates||[],ae(R);for(let u of T.list){let w=e("option",{value:u.id},u.name);u.id==="website"&&(w.selected=!0),R.appendChild(w)}U()}).catch(()=>{ae(R),R.appendChild(e("option",{value:"blank"},"\\u7A7A\\u767D\\uFF08\\u6A21\\u677F\\u52A0\\u8F7D\\u5931\\u8D25\\uFF09"))})}le(t?"\\u7F16\\u8F91\\u7AD9\\u70B9: "+t:"\\u65B0\\u5EFA\\u7AD9\\u70B9","",i,async()=>{let R=a.value.trim();if(!R)throw new Error("\\u8BF7\\u586B\\u5199 Host");let _={host:R,enabled:l.checked,ipv6Support:d.checked},B=c?c.value:"fetch",U=B==="cnb"||B==="github",C="";if(!o&&h)if(h.value==="pool"){if(!p.value)throw new Error("\\u8BF7\\u9009\\u62E9\\u4E00\\u4E2A\\u5DF2\\u6709\\u6E90\\u7AD9");_.poolId=p.value,C=p.value}else{if(B==="r2"){if(!(m&&m.value.trim()))throw new Error("\\u5F15\\u64CE\\u4E3A r2 \\u65F6\\u5FC5\\u987B\\u586B\\u5199 R2 \\u7ED1\\u5B9A\\u540D\\uFF08\\u5982 CDN_R2\\uFF09")}else if(U){if(!v.value.trim()||!F.value.trim())throw new Error(`\\u5F15\\u64CE\\u4E3A ${Ie[B]} \\u65F6\\u5FC5\\u987B\\u586B\\u5199\\u4ED3\\u5E93\\u5F52\\u5C5E\\u4E0E\\u4ED3\\u5E93\\u540D`);if(H.checked&&!k.value.trim())throw new Error(`\\u79C1\\u6709 ${Ie[B]} \\u4ED3\\u5E93\\u5FC5\\u987B\\u586B\\u5199\\u8BBF\\u95EE\\u4EE4\\u724C`)}else if(!g.value.trim())throw new Error("\\u8BF7\\u586B\\u5199\\u6E90\\u7AD9\\u5730\\u5740");let u={addr:B==="r2"||U?"":g.value.trim(),port:B==="r2"?null:Number(f.value)||443,scheme:B==="r2"?"https":r.value,engine:B};if(B==="r2"&&(u.r2Binding=m&&m.value.trim()||""),U){u.repoUser=v.value.trim(),u.repoName=F.value.trim(),u.repoBranch=$.value.trim()||"main",u.repoPrivate=!!H.checked;let w=B==="cnb"?"cnbTokenEnc":"githubTokenEnc";u[w]=k.value.trim()}_.origins=[u],_.defaultHostHeader=B==="r2"||U?{mode:"inherit",custom:""}:{mode:x.value,custom:x.value==="custom"?E.value.trim():""}}if(o)await N.sites.saveBasics(s.host,_),P("\\u7AD9\\u70B9\\u57FA\\u7840\\u7247\\u6BB5\\u5DF2\\u4FDD\\u5B58");else{await N.sites.save(R,_);let u=[];if(T.id&&T.id!=="blank"){let A=T.list.find(L=>L.id===T.id),b=A&&A.rules||[];u.push(...b)}if(U&&_.origins&&_.origins[0]){let A=_.origins[0],b=wt(B,{repoUser:A.repoUser,repoName:A.repoName,repoBranch:A.repoBranch,repoPrivate:A.repoPrivate});u.push(b.rewrite,b.hostHeader,b.respHeaders),b.reqHeaders&&u.push(b.reqHeaders)}if(C){let A=(D.pools||[]).find(b=>b.id===C);if(A&&Array.isArray(A.origins))for(let b of A.origins){if(b.engine!=="cnb"&&b.engine!=="github")continue;let L=wt(b.engine,{repoUser:b.repoUser,repoName:b.repoName,repoBranch:b.repoBranch,repoPrivate:b.repoPrivate,originId:b.id});u.push(L.rewrite,L.hostHeader,L.respHeaders),L.reqHeaders&&u.push(L.reqHeaders)}}u.length&&await N.sites.saveRules(R,u);let w=u.length;P(w?`\\u7AD9\\u70B9\\u5DF2\\u521B\\u5EFA\\uFF0C\\u5E76\\u5DF2\\u5199\\u5165 ${w} \\u6761\\u57FA\\u7840\\u89C4\\u5219\\uFF08\\u6A21\\u677F + \\u5F15\\u64CE\\u5173\\u8054\\u89C4\\u5219\\uFF09`:"\\u7AD9\\u70B9\\u5DF2\\u521B\\u5EFA")}await te()}),it(n)}async function Gt(t,n){let s;try{s=await N.sites.get(t)}catch(C){P(C.message,"err");return}let o=De(),a=s.poolId||o.length?"pool":"inline",l=M("f-pool",[{value:"",label:"\\uFF08\\u672A\\u9009\\u62E9\\uFF09"},...o],s.poolId||"");l.className="input";let d=y("\\u9ED8\\u8BA4\\u6E90\\u7AD9\\uFF08\\u6CA1\\u88AB\\u89C4\\u5219\\u8986\\u76D6\\u7684\\u8BF7\\u6C42\\u5C31\\u7528\\u5B83\\uFF09",l,"\\u6240\\u6709\\u89C4\\u5219\\u90FD\\u6CA1\\u547D\\u4E2D\\u65F6\\uFF0C\\u8BF7\\u6C42\\u56DE\\u5230\\u8FD9\\u91CC\\u8BBE\\u7F6E\\u7684\\u6E90\\u7AD9\\u3002\\u5217\\u8868\\u540C\\u65F6\\u5305\\u542B\\u300C\\u5355\\u4E00\\u6E90\\u7AD9\\u300D\\u4E0E\\u300C\\u6E90\\u7AD9\\u6C60\\u300D\\uFF0C\\u4E24\\u8005\\u7528\\u6CD5\\u4E00\\u81F4\\u3002"),i=e("div",{class:"inline-origin-box"}),h=e("div",{id:"inline-origin-list"}),p={value:"chain"},g=[],f=()=>{g.forEach(C=>{C.style.display="none"})},r=null;(C=>{C=C||{addr:"",port:443,scheme:"https",engine:"fetch",weight:1};let u=M("",[],C.engine||"fetch",[{value:"fetch",label:"fetch\\uFF08\\u652F\\u6301\\u81EA\\u5B9A\\u4E49 Host\\uFF09"},{value:"socket",label:"socket\\uFF08\\u5DF2\\u5F03\\u7528\\uFF09",disabled:!0},{value:"r2",label:"r2\\uFF08\\u56DE\\u6E90\\u5230 R2 \\u6876\\uFF0C\\u4EC5 CF\\uFF09",disabled:!(D.info&&D.info.caps&&D.info.caps.hasR2)}]);u.className="input o-engine";let w=C.hostHeader?.mode==="custom"&&C.hostHeader.custom||"",A=e("input",{type:"checkbox",class:"o-host-en",checked:!!w}),b=e("input",{class:"input o-host",value:w,placeholder:"\\u5982 api1.internal\\uFF08\\u7559\\u7A7A=\\u7528\\u89C4\\u5219/\\u7AD9\\u70B9\\u7EA7 Host\\uFF09"}),L=y("\\u56DE\\u6E90 Host \\u81EA\\u5B9A\\u4E49\\u503C",b,"\\u4EC5\\u8FD9\\u53F0\\u6E90\\u7AD9\\u56DE\\u6E90\\u65F6\\u4F7F\\u7528\\u7684 Host \\u5934\\uFF0C\\u4F1A\\u8986\\u76D6\\u7AD9\\u70B9\\u7EA7\\u300C\\u56DE\\u6E90 Host\\u300D\\u3002\\u7559\\u7A7A\\u7B49\\u540C\\u4E0D\\u8986\\u76D6\\u3002"),I=()=>{L.style.display=u.value==="socket"&&A.checked?"":"none"};A.onchange=I;let G=e("input",{class:"input o-r2-binding",value:C.r2Binding||"",placeholder:"CDN_R2\\uFF08\\u5FC5\\u987B\\u4E0E wrangler.toml \\u7684 binding \\u4E00\\u81F4\\uFF09"}),K=e("input",{class:"input o-r2-prefix",value:C.r2KeyPrefix||"",placeholder:"\\u5982 img/\\uFF08\\u6876\\u5185\\u76EE\\u5F55\\u9694\\u79BB\\uFF0C\\u7559\\u7A7A=\\u65E0\\uFF09"}),q=M("",[""],C.r2KeyMode||"none",[{value:"none",label:"none\\uFF08pathname \\u539F\\u6837\\u4F5C key\\uFF09"},{value:"prefix",label:"prefix\\uFF08\\u5728 key \\u524D\\u52A0\\u524D\\u7F00\\uFF09"},{value:"strip",label:"strip\\uFF08\\u5265\\u9664\\u5F00\\u5934\\u4E32\\uFF09"},{value:"regex",label:"regex\\uFF08\\u6B63\\u5219\\u66FF\\u6362\\uFF09"}],"o-r2-keymode"),O=e("input",{class:"input o-r2-rule",value:C.r2KeyPrefixRule||"",placeholder:"prefix/strip: \\u524D\\u7F00\\u4E32\\uFF1Bregex: \\u6B63\\u5219"}),z=e("input",{class:"input o-r2-to",value:C.r2KeyRegexTo||"",placeholder:"regex \\u6A21\\u5F0F\\u4E0B\\u7684\\u66FF\\u6362\\u503C"}),Q=y("\\u8F6C\\u6362\\u53C2\\u6570\\uFF08r2KeyPrefixRule\\uFF09",O,"prefix/strip \\u65F6\\u586B\\u524D\\u7F00/\\u8981\\u5265\\u9664\\u7684\\u5F00\\u5934\\uFF1Bregex \\u65F6\\u586B\\u6B63\\u5219\\u5728 r2KeyPrefixRule\\u3002"),J=y("\\u6B63\\u5219\\u66FF\\u6362\\u503C\\uFF08r2KeyRegexTo\\uFF09",z,"\\u4EC5 regex \\u6A21\\u5F0F\\u4F7F\\u7528\\u3002"),me=e("div",{class:"o-r2-fields"},[y("R2 \\u7ED1\\u5B9A\\u540D\\uFF08r2Binding\\uFF09",G,"wrangler.toml \\u91CC [[r2_buckets]].binding \\u7684\\u503C\\uFF0C\\u5982 CDN_R2\\u3002\\u5F15\\u64CE\\u9009 r2 \\u65F6\\u5FC5\\u586B\\u3002"),y("R2 key \\u524D\\u7F00\\uFF08r2KeyPrefix\\uFF09",K,"\\u62FC\\u5230\\u6700\\u7EC8 key \\u524D\\u9762\\u7684\\u56FA\\u5B9A\\u4E32\\uFF0C\\u7528\\u4E8E\\u591A\\u7AD9\\u70B9\\u5171\\u7528\\u4E00\\u4E2A\\u6876\\u65F6\\u9694\\u79BB\\u76EE\\u5F55\\u3002"),y("pathname \\u2192 key \\u8F6C\\u6362\\u65B9\\u5F0F\\uFF08r2KeyMode\\uFF09",q,"none \\u539F\\u6837\\uFF1Bprefix \\u5728\\u524D\\u52A0\\u4E32\\uFF1Bstrip \\u5265\\u5F00\\u5934\\u4E32\\uFF1Bregex \\u7528\\u6B63\\u5219\\u66FF\\u6362\\u3002\\u89C4\\u5219\\u7EA7 rewrite \\u5DF2\\u5148\\u4F5C\\u7528\\uFF0C\\u8FD9\\u91CC\\u505A\\u6700\\u540E\\u4E00\\u6B65\\u3002"),Q,J]),ie=()=>{let oe=q.value;Q.style.display=oe==="prefix"||oe==="strip"||oe==="regex"?"":"none",J.style.display=oe==="regex"?"":"none"};q.onchange=ie,ie();let se=()=>{let oe=u.value,fe=oe==="r2";me.style.display=fe?"":"none",X.style.display=fe?"none":"",ce.style.display=fe?"none":"",be.style.display=fe?"none":"";let Le=oe==="socket";ye.style.display=Le?"":"none",L.style.display=Le&&A.checked?"":"none",typeof r=="function"&&r()},re=e("div",{class:"hint",text:"\\u56DE\\u6E90\\u8FDE\\u63A5\\u53C2\\u6570\\uFF08\\u534F\\u8BAE / \\u7AEF\\u53E3 / \\u5F15\\u64CE / Host\\uFF09\\u4F5C\\u4E3A\\u672C\\u6E90\\u7AD9\\u6574\\u6C60\\u9ED8\\u8BA4\\uFF1B\\u5982\\u9700\\u6309\\u8BF7\\u6C42\\u6761\\u4EF6\\u5DEE\\u5F02\\u5316\\uFF0C\\u8BF7\\u5728\\u2468\\u300COrigin Rules\\u300D\\u91CC\\u8BBE\\u7F6E\\u5BF9\\u5E94\\u89C4\\u5219\\uFF0C\\u89C4\\u5219\\u7EA7\\u8BBE\\u7F6E\\u4F1A\\u8986\\u76D6\\u6B64\\u5904\\u9ED8\\u8BA4\\u503C\\u3002"}),X=y("\\u6E90\\u7AD9\\u5730\\u5740\\uFF08\\u57DF\\u540D / IP\\uFF09",e("input",{class:"input o-addr",value:C.addr||"",placeholder:"storage.example.net"}),"\\u4F60\\u7684\\u771F\\u5B9E\\u670D\\u52A1\\u5668\\u5730\\u5740\\u3002"),ce=y("\\u7AEF\\u53E3",e("input",{class:"input o-port",type:"number",value:C.port||443}),"https \\u9ED8\\u8BA4 443\\uFF0Chttp \\u9ED8\\u8BA4 80\\u3002\\u53EF\\u88AB\\u2468\\u89C4\\u5219\\u8986\\u76D6\\u3002"),be=y("\\u534F\\u8BAE",M("",[""],C.scheme||"https",[{value:"https",label:"https"},{value:"http",label:"http"}],"o-scheme"),"\\u53EF\\u88AB\\u2468\\u89C4\\u5219\\u8986\\u76D6\\u3002"),ye=e("label",{class:"check"},[A,e("span",{text:"\\u8986\\u76D6\\u7AD9\\u70B9\\u7EA7\\u56DE\\u6E90 Host\\uFF08\\u6E90\\u7AD9\\u4E13\\u7528\\uFF09"})]),de=y("\\u6743\\u91CD",e("input",{class:"input o-weight",type:"number",value:C.weight||1}),"\\u914D\\u5408\\u300C\\u52A0\\u6743\\u300D\\u7B56\\u7565\\u4F7F\\u7528\\uFF0C\\u9ED8\\u8BA4 1 \\u5373\\u53EF\\u3002");g.push(de);let Y=e("div",{class:"origin-row"},[X,ce,be,ye,L,y("\\u5F15\\u64CE",u,"\\u56DE\\u6E90\\u65B9\\u5F0F\\uFF08\\u6574\\u6C60\\u9ED8\\u8BA4\\uFF09\\uFF1A\\u2460 fetch=\\u6807\\u51C6\\u56DE\\u6E90\\uFF0C\\u652F\\u6301\\u81EA\\u5B9A\\u4E49 Host \\u5934\\uFF08CF/EO/ESA \\u5747\\u53EF\\u7528\\uFF0CHost \\u7531\\u300C\\u56DE\\u6E90\\u57DF\\u540D/\\u5730\\u5740\\u300D\\u6216\\u89C4\\u5219\\u7EA7 hostHeader \\u51B3\\u5B9A\\uFF09\\uFF1B\\u2461 socket=\\u5DF2\\u5F03\\u7528\\uFF08\\u81EA\\u5B9A\\u4E49 Host \\u73B0\\u7531 fetch \\u539F\\u751F\\u652F\\u6301\\uFF0CCF \\u4E0A\\u88F8 IP+HTTPS+\\u81EA\\u5B9A\\u4E49 SNI \\u7531 fetchEngine \\u5185\\u90E8\\u81EA\\u52A8\\u8D70 socket \\u515C\\u5E95\\uFF09\\uFF1B\\u2462 r2=\\u56DE\\u6E90\\u5230 R2 \\u6876\\uFF08\\u4EC5 CF\\uFF0C\\u9700\\u5148\\u5728 wrangler.toml \\u7ED1\\u5B9A\\uFF09\\u3002\\u53EF\\u88AB\\u2468\\u89C4\\u5219\\u8986\\u76D6\\u3002"),me,de,re]);u.onchange=se,I(),se(),Y._carry={},C.extraHeaders!==void 0&&(Y._carry.extraHeaders=C.extraHeaders),h.appendChild(Y)})();let m=M("f-origin-mode",[{value:"pool",label:"\\u9009\\u62E9\\u5DF2\\u6709\\u6E90\\u7AD9\\uFF08\\u5355\\u4E00\\u6E90\\u7AD9 / \\u6E90\\u7AD9\\u6C60\\uFF09"},{value:"inline",label:"\\u65B0\\u5EFA\\u5355\\u4E00\\u6E90\\u7AD9\\uFF08\\u586B\\u5730\\u5740\\uFF0C\\u81EA\\u52A8\\u521B\\u5EFA\\uFF09"}],a);m.className="input";let x=()=>{},E=()=>{let C=m.value;d.style.display=C==="pool"?"":"none",i.style.display=C==="inline"?"":"none",x(),B()};m.onchange=E;let v=s.defaultHostHeader||{mode:"accel",custom:""},F=M("f-hh",[{value:"accel",label:"\\u52A0\\u901F\\u57DF\\u540D\\uFF08\\u5373\\u4F60\\u8BBF\\u95EE\\u7684\\u8FD9\\u4E2A\\u57DF\\u540D\\uFF0C\\u9ED8\\u8BA4\\uFF09"},{value:"origin",label:"\\u6E90\\u7AD9\\u57DF\\u540D\\uFF08\\u7528\\u6E90\\u7AD9\\u81EA\\u5DF1\\u7684\\u57DF\\u540D\\uFF09"},{value:"custom",label:"\\u81EA\\u5B9A\\u4E49\\uFF08\\u6307\\u5B9A\\u4E00\\u4E2A\\u57DF\\u540D\\uFF09"}],v.mode||"accel");F.className="input";let $=e("input",{class:"input",id:"f-hh-custom",value:v.custom||"",placeholder:"origin.example.com"}),H=y("\\u56DE\\u6E90 Host\\uFF08\\u56DE\\u6E90\\u65F6\\u53D1\\u7ED9\\u6E90\\u7AD9\\u7684 Host \\u5934\\uFF09",F,"\\u4E00\\u822C\\u4FDD\\u6301\\u300C\\u52A0\\u901F\\u57DF\\u540D\\u300D\\u5373\\u53EF\\uFF1B\\u4EC5\\u5F53\\u6E90\\u7AD9\\u8981\\u6C42\\u7279\\u5B9A\\u57DF\\u540D\\u65F6\\u624D\\u6539\\u3002\\u9009\\u62E9\\u300C\\u81EA\\u5B9A\\u4E49\\u300D\\u540E\\u4E0B\\u65B9\\u51FA\\u73B0\\u586B\\u5199\\u6846\\u3002"),k=y("\\u56DE\\u6E90 Host \\u81EA\\u5B9A\\u4E49\\u503C",$),T=e("div",{class:"hint"}),R=[{value:"accel",label:"\\u52A0\\u901F\\u57DF\\u540D\\uFF08\\u5373\\u4F60\\u8BBF\\u95EE\\u7684\\u8FD9\\u4E2A\\u57DF\\u540D\\uFF0C\\u9ED8\\u8BA4\\uFF09",socketOnly:!0},{value:"origin",label:"\\u6E90\\u7AD9\\u57DF\\u540D\\uFF08\\u7528\\u6E90\\u7AD9\\u81EA\\u5DF1\\u7684\\u57DF\\u540D\\uFF09",socketOnly:!1},{value:"custom",label:"\\u81EA\\u5B9A\\u4E49\\uFF08\\u6307\\u5B9A\\u4E00\\u4E2A\\u57DF\\u540D\\uFF09",socketOnly:!1}],_=()=>Array.from(h.querySelectorAll(".o-engine")).map(C=>C.value),B=()=>{if(m.value==="pool"){H.style.display="none",T.style.display="none",k.style.display="none";return}let C=_();if(C.length>0&&C.every(I=>I==="cnb"||I==="github"||I==="r2")){H.style.display="none",T.style.display="none",k.style.display="none";return}let w=C.length>0&&C.every(I=>I==="r2"),A=C.some(I=>I==="socket");if(H.style.display=w?"none":"",T.style.display=w?"none":"",w){k.style.display="none";return}let b=R.filter(I=>A||!I.socketOnly),L=F.value;ae(F),b.forEach(I=>{let G=e("option",{value:I.value},I.label);I.value===L&&(G.selected=!0),F.appendChild(G)}),b.some(I=>I.value===L)||(F.value="origin"),T.textContent=A?"":"fetch / r2 \\u5F15\\u64CE\\u4E0B\\u5E73\\u53F0\\u5F3A\\u5236 Host = \\u56DE\\u6E90\\u5730\\u5740\\uFF0C\\u65E0\\u6CD5\\u4F2A\\u88C5\\u6210\\u52A0\\u901F\\u57DF\\u540D\\uFF0C\\u6545\\u300C\\u52A0\\u901F\\u57DF\\u540D\\u300D\\u9009\\u9879\\u4E0D\\u53EF\\u7528\\uFF1B\\u9700\\u8981\\u8BE5\\u80FD\\u529B\\u8BF7\\u5C06\\u6E90\\u7AD9\\u5F15\\u64CE\\u6539\\u4E3A socket\\u3002",T.style.display=T.textContent?"":"none",k.style.display=F.value==="custom"?"":"none"};F.onchange=B,r=B;let U=e("div",{},[e("div",{class:"subhead",id:"sec-origin"},[e("span",{},"\\u2462 \\u521D\\u59CB\\u56DE\\u6E90\\u5BF9\\u8C61\\uFF08\\u9996\\u8981\\u5206\\u6D41\\uFF09")]),e("div",{class:"hint"},"\\u9009\\u51FA\\u300C\\u521D\\u59CB\\u56DE\\u6E90\\u5BF9\\u8C61\\u300D\\uFF0C\\u5B83\\u65E2\\u662F\\u89C4\\u5219\\u5F15\\u64CE\\u7684 origin \\u5339\\u914D\\u7EF4\\u5EA6\\uFF0C\\u4E5F\\u662F\\u6240\\u6709\\u89C4\\u5219\\u90FD\\u672A\\u547D\\u4E2D\\u65F6\\u7684\\u515C\\u5E95\\u56DE\\u6E90\\u76EE\\u6807\\u3002"),y("\\u6E90\\u7AD9\\u65B9\\u5F0F",m,"\\u2460 \\u4ECE\\u300C\\u6E90\\u7AD9\\u300D\\u9875\\u5DF2\\u6709\\u6761\\u76EE\\u91CC\\u9009\\uFF08\\u5355\\u4E00\\u6E90\\u7AD9\\u548C\\u6E90\\u7AD9\\u6C60\\u90FD\\u5728\\u540C\\u4E00\\u4E2A\\u4E0B\\u62C9\\u91CC\\uFF09\\uFF1B\\u2461 \\u76F4\\u63A5\\u586B\\u5730\\u5740\\uFF0C\\u4FDD\\u5B58\\u65F6\\u81EA\\u52A8\\u521B\\u5EFA\\u4E00\\u6761\\u300C\\u5355\\u4E00\\u6E90\\u7AD9\\u300D\\u5E76\\u7ED1\\u5B9A\\uFF0C\\u968F\\u540E\\u53EF\\u5728\\u300C\\u6E90\\u7AD9\\u300D\\u9875\\u7EDF\\u4E00\\u7BA1\\u7406\\u3002"),d,e("div",{class:"hint",id:"origin-mode-hint"},"\\u7AD9\\u70B9\\u4E0D\\u518D\\u6301\\u6709\\u300C\\u5185\\u8054\\u6E90\\u7AD9\\u300D\\uFF1A\\u4EFB\\u4F55\\u76F4\\u63A5\\u586B\\u5199\\u7684\\u5730\\u5740\\u90FD\\u4F1A\\u6210\\u4E3A\\u300C\\u6E90\\u7AD9\\u300D\\u9875\\u91CC\\u7684\\u4E00\\u6761\\u5355\\u4E00\\u6E90\\u7AD9\\uFF0C\\u56E0\\u6B64\\u4F60\\u80FD\\u5728\\u4E00\\u4E2A\\u5730\\u65B9\\u770B\\u5230\\u5168\\u90E8\\u4E0A\\u6E38\\u53CA\\u5176\\u88AB\\u5F15\\u7528\\u60C5\\u51B5\\u3002\\u9700\\u8981\\u591A\\u6E90\\u7AD9\\u8D1F\\u8F7D\\u5747\\u8861\\u65F6\\uFF0C\\u8BF7\\u5230\\u300C\\u6E90\\u7AD9\\u300D\\u9875\\u65B0\\u5EFA\\u6E90\\u7AD9\\u6C60\\uFF0C\\u518D\\u56DE\\u5230\\u8FD9\\u91CC\\u9009\\u62E9\\u5B83\\u3002"),i,H,T,k,e("div",{class:"hint frag-note"},"\\u672C\\u62BD\\u5C49\\u53EA\\u8D1F\\u8D23 \\u2462 \\u9996\\u8981\\u5206\\u6D41\\u8FD9\\u5305\\u3002\\u2460 \\u5339\\u914D\\u7AD9\\u70B9\\u3001\\u2461 \\u5B89\\u5168\\u6821\\u9A8C\\u3001\\u89C4\\u5219\\uFF08\\u2464~\\u246F\\uFF09\\u3001\\u6E90\\u7AD9\\u6C60\\uFF08\\u246D\\uFF09\\u7EC6\\u8282\\u5747\\u6709\\u5404\\u81EA\\u72EC\\u7ACB\\u62BD\\u5C49\\uFF0C\\u8BF7\\u5728\\u300C\\u6D41\\u91CF\\u5E8F\\u5217\\u300D\\u4E2D\\u70B9\\u51FB\\u5BF9\\u5E94\\u9636\\u6BB5\\u8FDB\\u5165\\uFF0C\\u6B64\\u5904\\u4E0D\\u518D\\u91CD\\u590D\\u627F\\u8F7D\\u3002")]);i.appendChild(e("div",{class:"subhead"},[e("span",{},"\\u65B0\\u5EFA\\u5355\\u4E00\\u6E90\\u7AD9")])),i.appendChild(e("div",{class:"hint"},"\\u53EA\\u586B\\u300C\\u8FD9\\u53F0\\u6E90\\u7AD9\\u662F\\u8C01\\u300D\\u2014\\u2014\\u5730\\u5740/\\u7AEF\\u53E3/\\u534F\\u8BAE/\\u8DEF\\u5F84\\u524D\\u7F00/\\u5F15\\u64CE\\u3002\\u4FDD\\u5B58\\u540E\\u4F1A\\u5728\\u300C\\u6E90\\u7AD9\\u300D\\u9875\\u81EA\\u52A8\\u51FA\\u73B0\\u4E00\\u6761\\u540C\\u540D\\u7684\\u5355\\u4E00\\u6E90\\u7AD9\\uFF0C\\u5E76\\u6807\\u8BB0\\u88AB\\u672C\\u7AD9\\u70B9\\u5F15\\u7528\\uFF1B\\u82E5\\u5DF2\\u5B58\\u5728\\u5B8C\\u5168\\u76F8\\u540C\\u7684\\u5730\\u5740\\uFF0C\\u5219\\u76F4\\u63A5\\u590D\\u7528\\u5B83\\u800C\\u4E0D\\u4F1A\\u91CD\\u590D\\u521B\\u5EFA\\u3002\\u9700\\u8981\\u591A\\u53F0\\u6E90\\u7AD9\\u505A\\u8D1F\\u8F7D\\u5747\\u8861\\uFF0C\\u8BF7\\u6539\\u7528\\u300C\\u6E90\\u7AD9\\u6C60\\u300D\\u3002")),i.appendChild(h),E(),x(),f(),B(),le("\\u7F16\\u8F91\\u56DE\\u6E90\\u5BF9\\u8C61: "+t,"",U,async()=>{let C=F.value,u=m.value==="inline",w=[];Array.from(h.children).forEach((L,I)=>{let G=S(".o-engine",L).value,K=S(".o-addr",L).value.trim();if(G!=="r2"&&!K)return;let q=S(".o-r2-keymode",L)?S(".o-r2-keymode",L).value:"none";w.push({id:"o"+I+"_"+(G==="r2"?S(".o-r2-binding",L).value.trim()||"r2":K),enabled:!0,order:I,weight:Number(S(".o-weight",L).value)||1,engine:G,scheme:S(".o-scheme",L)?S(".o-scheme",L).value:"https",addr:G==="r2"?"":K,port:Number(S(".o-port",L).value)||443,pathPrefix:"",hostHeader:(()=>{let O=S(".o-host-en",L),z=(S(".o-host",L).value||"").trim();return O&&O.checked&&z?{mode:"custom",custom:z}:{mode:"inherit",custom:""}})(),extraHeaders:{},...G==="r2"?{r2Binding:S(".o-r2-binding",L).value.trim(),r2KeyPrefix:S(".o-r2-prefix",L).value.trim(),r2KeyMode:q,r2KeyPrefixRule:S(".o-r2-rule",L).value.trim(),r2KeyRegexTo:S(".o-r2-to",L).value.trim()}:{},...L._carry||{}})});let A={};if(u){if(!w.length)throw new Error("\\u8BF7\\u586B\\u5199\\u6E90\\u7AD9\\u5730\\u5740");if(w.length>1)throw new Error("\\u5355\\u4E00\\u6E90\\u7AD9\\u53EA\\u80FD\\u6709 1 \\u4E2A\\u5730\\u5740\\uFF1B\\u9700\\u8981\\u591A\\u4E2A\\u8BF7\\u5230\\u300C\\u6E90\\u7AD9\\u300D\\u9875\\u65B0\\u5EFA\\u6E90\\u7AD9\\u6C60");A.origins=w,A.defaultHostHeader={mode:C,custom:C==="custom"?$.value.trim():""}}else{if(!l.value)throw new Error("\\u8BF7\\u9009\\u62E9\\u4E00\\u4E2A\\u6E90\\u7AD9\\uFF0C\\u6216\\u6539\\u7528\\u300C\\u65B0\\u5EFA\\u5355\\u4E00\\u6E90\\u7AD9\\u300D\\u586B\\u5199\\u5730\\u5740");A.poolId=l.value}let b=await N.sites.saveBasics(s.host,A);b&&b.createdOrigin?P(`\\u5DF2\\u81EA\\u52A8\\u521B\\u5EFA\\u5355\\u4E00\\u6E90\\u7AD9\\u300C${b.createdOrigin.name||b.createdOrigin.id}\\u300D\\u5E76\\u7ED1\\u5B9A\\u5230\\u672C\\u7AD9\\u70B9`,"ok"):P("\\u521D\\u59CB\\u56DE\\u6E90\\u5BF9\\u8C61\\u7247\\u6BB5\\u5DF2\\u4FDD\\u5B58"),await te()}),it(n)}async function Oe(t,n){if(t==="__global__"||t==="__all__"){P("\\u5168\\u7AD9\\u901A\\u7528\\u89C4\\u5219\\u8BF7\\u4F7F\\u7528\\u5168\\u7AD9\\u89C4\\u5219\\u7F16\\u8F91\\u5668","info");return}if(!t){P("\\u8BF7\\u5148\\u521B\\u5EFA\\u7AD9\\u70B9","err");return}let s;try{s=await N.sites.get(t)}catch(q){P(q.message,"err");return}let o=s.security||{},a=M("",[{value:"off",label:"\\u5173\\u95ED"},{value:"whitelist",label:"\\u767D\\u540D\\u5355\\uFF08\\u5141\\u8BB8\\u540D\\u5355\\u5185 Referer \\u8BBF\\u95EE\\uFF09"},{value:"blacklist",label:"\\u9ED1\\u540D\\u5355\\uFF08\\u62E6\\u622A\\u540D\\u5355\\u5185 Referer\\uFF09"}],o.refererMode||"off");a.className="input";let l=e("input",{class:"input",value:(o.refererList||[]).join(", "),placeholder:"\\u5982 example.com, *.test.com"}),d=e("input",{type:"checkbox",checked:!!o.allowEmptyReferer}),i=e("input",{class:"input",value:(o.uaBlacklist||[]).join(", "),placeholder:"\\u5982 BadBot, scraper"}),h=e("input",{type:"checkbox",checked:!!(o.botManagement&&o.botManagement.enabled)}),p=M("",[{value:"blacklist",label:"\\u9ED1\\u540D\\u5355\\uFF08\\u547D\\u4E2D\\u7279\\u5F81\\u5373\\u62E6\\u622A\\uFF09"},{value:"allowlist",label:"\\u767D\\u540D\\u5355\\uFF08\\u4EC5\\u653E\\u884C\\u547D\\u4E2D\\u7279\\u5F81\\uFF0C\\u5176\\u4F59\\u89C6\\u4E3A Bot\\uFF09"}],o.botManagement&&o.botManagement.mode||"blacklist");p.className="input";let g=e("input",{class:"input",value:(o.botManagement&&o.botManagement.list||[]).join(", "),placeholder:"\\u5982 scrapy, python-requests, HeadlessChrome"}),f=e("input",{class:"input",value:(o.ipBlacklist||[]).join(", "),placeholder:"\\u5982 1.2.3.4, 10.0.0.0/8"}),r=e("input",{class:"input",value:(o.ipWhitelist||[]).join(", "),placeholder:"\\u5982 192.168.1.0/24"}),c=e("input",{type:"checkbox",checked:!!(o.signedUrl&&o.signedUrl.enabled)}),m=e("input",{class:"input",value:o.signedUrl&&o.signedUrl.secret||"",placeholder:"\\u7B7E\\u540D\\u5BC6\\u94A5\\uFF0C\\u5EFA\\u8BAE 16 \\u4F4D\\u4EE5\\u4E0A\\u968F\\u673A\\u4E32"}),x=e("input",{class:"input",type:"number",value:o.signedUrl&&o.signedUrl.ttl||300}),E=e("input",{class:"input",value:o.signedUrl&&o.signedUrl.param||"sign",placeholder:"URL \\u67E5\\u8BE2\\u53C2\\u6570\\u540D"}),v=e("input",{type:"checkbox",checked:!!(o.rateLimit&&o.rateLimit.enabled)}),F=e("input",{class:"input",type:"number",value:o.rateLimit&&o.rateLimit.rpm||600}),$=q=>q.split(",").map(O=>O.trim()).filter(Boolean),H=()=>({refererMode:a.value,refererList:$(l.value),allowEmptyReferer:d.checked,uaBlacklist:$(i.value),botManagement:{enabled:h.checked,mode:p.value,list:$(g.value)},ipBlacklist:$(f.value),ipWhitelist:$(r.value),signedUrl:{enabled:c.checked,secret:m.value.trim(),ttl:Number(x.value)||300,param:E.value.trim()||"sign"},rateLimit:{enabled:v.checked,rpm:Number(F.value)||600}}),k=(q,O,z,Q)=>{let J=ve(O,z,Q);return J.id=q,J},T=y("Referer \\u540D\\u5355\\uFF08\\u9017\\u53F7\\u5206\\u9694\\uFF0C\\u53EF\\u542B *.example.com \\u901A\\u914D\\uFF09",l),R=e("label",{class:"check"},[d,e("span",{text:"\\u5141\\u8BB8 Referer \\u4E3A\\u7A7A\\uFF08\\u76F4\\u63A5\\u8BBF\\u95EE\\uFF09"})]),_=()=>{let q=a.value!=="off";T.style.display=q?"":"none",R.style.display=q?"":"none"};a.addEventListener("change",_),_();let B=y("\\u5339\\u914D\\u6A21\\u5F0F",p),U=y("Bot \\u7279\\u5F81\\u5173\\u952E\\u5B57 / UA\\uFF08\\u9017\\u53F7\\u5206\\u9694\\uFF0C\\u652F\\u6301 /regex/ \\u6B63\\u5219\\uFF09",g),C=e("div",{class:"hint"},"\\u5C0F\\u767D\\u793A\\u4F8B\\uFF1A\\u76F4\\u63A5\\u586B\\u5173\\u952E\\u5B57\\u5982 scrapy\\u3001python-requests \\u5373\\u53EF\\u62E6\\u622A\\u5E38\\u89C1\\u722C\\u866B\\uFF1B\\u60F3\\u66F4\\u7075\\u6D3B\\u53EF\\u5199\\u6B63\\u5219\\uFF0C\\u5982 /^HeadlessChrome/ \\u53EA\\u62E6\\u65E0\\u5934\\u6D4F\\u89C8\\u5668\\uFF0C/bot/i \\u5927\\u5C0F\\u5199\\u4E0D\\u654F\\u611F\\u5730\\u62E6\\u542B bot \\u7684 UA\\u3002"),u=e("div",{class:"hint"},"\\u9ED1\\u540D\\u5355\\uFF1AUA \\u547D\\u4E2D\\u4EFB\\u4E00\\u7279\\u5F81\\u5373\\u62E6\\u622A\\uFF1B\\u767D\\u540D\\u5355\\uFF1A\\u4EC5\\u653E\\u884C\\u547D\\u4E2D\\u7279\\u5F81\\uFF08\\u5982\\u5408\\u6CD5\\u641C\\u7D22\\u5F15\\u64CE\\uFF09\\uFF0C\\u5176\\u4F59\\u89C6\\u4E3A Bot \\u62E6\\u622A\\u3002\\u8BE5\\u5B57\\u6BB5\\u72EC\\u7ACB\\u4E8E \\u2461.2 \\u7684 UA \\u9ED1\\u540D\\u5355\\uFF0C\\u4E92\\u4E0D\\u8D8A\\u754C\\u3002"),w=()=>{let q=h.checked;[B,U,C,u].forEach(O=>{O.style.display=q?"":"none"})};h.addEventListener("change",w),w();let A=e("div",{class:"grid2"},[y("\\u7B7E\\u540D\\u5BC6\\u94A5",m),y("URL \\u53C2\\u6570\\u540D",E)]),b=y("\\u7B7E\\u540D\\u6709\\u6548\\u671F\\uFF08\\u79D2\\uFF09",x),L=()=>{let q=c.checked;A.style.display=q?"":"none",b.style.display=q?"":"none"};c.addEventListener("change",L),L();let I=y("\\u6BCF\\u5206\\u949F\\u6700\\u5927\\u8BF7\\u6C42\\u6570",F),G=()=>{I.style.display=v.checked?"":"none"};v.addEventListener("change",G),G();let K=e("div",{},[e("div",{class:"hint frag-note"},"fail-closed\\uFF1A\\u4EFB\\u4E00\\u5305\\u5224\\u5B9A\\u5F02\\u5E38\\u4E5F\\u6309 403 \\u62E6\\u622A\\uFF0C\\u7EDD\\u4E0D\\u653E\\u884C\\u3002\\u4EE5\\u4E0B 5 \\u5305\\u5168\\u90E8\\u901A\\u8FC7\\u624D\\u7EE7\\u7EED \\u2462 \\u9996\\u8981\\u5206\\u6D41\\u3002"),k("sec-ip","\\u2461.1 IP \\u8BBF\\u95EE\\u89C4\\u5219","IP \\u9ED1\\u540D\\u5355\\u4F18\\u5148\\u4E8E\\u767D\\u540D\\u5355\\u62E6\\u622A",[e("div",{class:"grid2"},[y("IP \\u9ED1\\u540D\\u5355\\uFF08\\u9017\\u53F7\\u5206\\u9694\\uFF0C\\u652F\\u6301 CIDR\\uFF09",f),y("IP \\u767D\\u540D\\u5355\\uFF08\\u9017\\u53F7\\u5206\\u9694\\uFF0C\\u652F\\u6301 CIDR\\uFF09",r)])]),k("sec-waf","\\u2461.2 WAF \\xB7 \\u81EA\\u5B9A\\u4E49\\u89C4\\u5219\\uFF08Referer / UA\\uFF09","\\u9632\\u76D7\\u94FE\\u6821\\u9A8C\\u8BF7\\u6C42 Referer\\uFF1BUA \\u5173\\u952E\\u5B57\\u547D\\u4E2D\\u76F4\\u63A5 403",[y("\\u9632\\u76D7\\u94FE\\u6A21\\u5F0F",a),T,R,y("User-Agent \\u9ED1\\u540D\\u5355\\u5173\\u952E\\u5B57\\uFF08\\u9017\\u53F7\\u5206\\u9694\\uFF09",i)]),k("sec-bot","\\u2461.3 \\u81EA\\u52A8\\u7A0B\\u5E8F\\uFF08Bot \\u7BA1\\u7406\\uFF09","\\u72EC\\u7ACB\\u6700\\u5C0F\\u4EFB\\u52A1\\u5305\\uFF1A\\u4E0E \\u2461.2 \\u7684 UA \\u9ED1\\u540D\\u5355\\u89E3\\u8026\\u3002\\u652F\\u6301\\u9ED1\\u540D\\u5355\\u62E6\\u622A / \\u767D\\u540D\\u5355\\u4EC5\\u653E\\u884C\\u4E24\\u79CD\\u6A21\\u5F0F",[e("label",{class:"check"},[h,e("span",{text:"\\u542F\\u7528 Bot \\u7BA1\\u7406"})]),B,U,C,u]),k("sec-token","\\u2461.4 Access \\xB7 \\u4EE4\\u724C\\u9274\\u6743\\uFF08\\u7B7E\\u540D URL\\uFF09\\u26A0\\uFE0F\\u5B9E\\u9A8C\\u7279\\u6027","\\u4EC5\\u5141\\u8BB8\\u643A\\u5E26\\u5408\\u6CD5\\u7B7E\\u540D\\u7684\\u8BF7\\u6C42\\u8BBF\\u95EE\\uFF08\\u5E38\\u7528\\u4E8E\\u79C1\\u6709\\u8D44\\u6E90\\uFF09\\u3002\\u26A0\\uFE0F \\u5B9E\\u9A8C\\u7279\\u6027\\uFF1A\\u6821\\u9A8C\\u4FA7\\u5DF2\\u751F\\u6548\\uFF0C\\u4F46\\u5185\\u7F6E\\u7B7E\\u540D\\u94FE\\u63A5\\u7B7E\\u53D1\\u5DE5\\u5177\\u5C1A\\u672A\\u63D0\\u4F9B\\uFF0C\\u9700\\u81EA\\u884C\\u7528 HMAC \\u751F\\u6210\\u3002",[e("label",{class:"check"},[c,e("span",{text:"\\u542F\\u7528\\u7B7E\\u540D URL \\u6821\\u9A8C"})]),A,b,e("div",{class:"hint warn"},["\\u26A0\\uFE0F \\u5B9E\\u9A8C\\u7279\\u6027\\uFF1A\\u5185\\u7F6E\\u300C\\u751F\\u6210\\u7B7E\\u540D\\u94FE\\u63A5\\u300D\\u5DE5\\u5177\\u5F85\\u5F00\\u53D1\\uFF0C\\u5F00\\u542F\\u540E\\u9700\\u81EA\\u884C\\u7528 HMAC-SHA256 \\u7B7E\\u53D1\\u5E26\\u7B7E\\u540D\\u7684 URL\\u3002"])]),k("sec-ratelimit","\\u2461.5 \\u901F\\u7387\\u9650\\u5236","\\u5355\\u5BA2\\u6237\\u7AEF\\uFF08\\u6309 IP\\uFF09\\u6BCF\\u5206\\u949F\\u6700\\u5927\\u8BF7\\u6C42\\u6570\\uFF0C\\u8D85\\u51FA\\u8FD4\\u56DE 429",[e("label",{class:"check"},[v,e("span",{text:"\\u542F\\u7528\\u8BF7\\u6C42\\u9650\\u901F"})]),I])]);le("\\u5B89\\u5168\\u9632\\u62A4: "+t,"\\u4EC5\\u7BA1\\u7406 \\u2461 \\u5B89\\u5168\\u6821\\u9A8C\\u7684 5 \\u4E2A\\u6700\\u5C0F\\u4EFB\\u52A1\\u5305\\u3002\\u4E0D\\u5F71\\u54CD\\u7AD9\\u70B9\\u57FA\\u7840\\uFF08\\u2460/\\u2462\\uFF09\\u3001\\u8DEF\\u7531\\u89C4\\u5219\\uFF08\\u2464~\\u246F\\uFF09\\u4E0E\\u6E90\\u7AD9\\u6C60\\uFF08\\u246D\\uFF09\\u3002",K,async()=>{await N.sites.saveSecurity(t,H()),await te()}),it(n)}async function vt(t,n){if(!t){P("\\u8BF7\\u5148\\u521B\\u5EFA\\u7AD9\\u70B9","err");return}let s;try{s=await N.sites.get(t)}catch(v){P(v.message,"err");return}let o=De();(!n||!n.allowedOps)&&(n={...V.cache,stage:"cache"}),n={...n,stage:n.stage||null};let a=!!(n&&n.allowedOps),l=a?n.stage:null,d=e("div",{class:"rules-box"}),i=[],h=v=>{let{card:F,read:$}=ze(v,o,s,n||{});i.push($),d.appendChild(F)},p=e("button",{class:"btn btn-sm",text:"+ \\u6DFB\\u52A0\\u89C4\\u5219"});p.onclick=()=>h(null);let g=s.rules&&s.rules.length?s.rules:[],f=l?g.filter(v=>ge(v)===l):g;f.forEach(h);let r=a?n.title:"\\u8DEF\\u7531\\u89C4\\u5219\\uFF08\\u89C4\\u5219\\u5F15\\u64CE\\uFF09: "+t,c=a?n.title:"\\u8DEF\\u7531\\u89C4\\u5219\\uFF08\\u89C4\\u5219\\u5F15\\u64CE\\uFF09",m=a?n.owner:"\\u8DEF\\u7531\\u89C4\\u5219\\u62BD\\u5C49 \\xB7 \\u89C4\\u5219\\u5361\\u7247",x=e("p",{class:"empty"},"\\u6682\\u65E0\\u5C5E\\u4E8E\\u672C\\u4EFB\\u52A1\\u5305\\u7684\\u89C4\\u5219\\uFF0C\\u70B9\\u51FB\\u300C+ \\u6DFB\\u52A0\\u89C4\\u5219\\u300D\\u65B0\\u5EFA\\u4E00\\u6761\\u3002");x.style.display=f.length?"none":"";let E=e("div",{id:"sec-rules"},[e("div",{class:"hint"},a?"\\u672C\\u62BD\\u5C49\\u53EA\\u7BA1\\u7406\\u300C"+n.title+"\\u300D\\u8FD9\\u4E00\\u6700\\u5C0F\\u4EFB\\u52A1\\u5305\\u7684\\u89C4\\u5219\\uFF0C\\u53EA\\u80FD\\u6DFB\\u52A0/\\u7F16\\u8F91\\u8BE5\\u5305\\u5141\\u8BB8\\u7684\\u52A8\\u4F5C\\u7C7B\\u578B\\uFF0C\\u4E0D\\u4F1A\\u8D8A\\u754C\\u5230\\u5176\\u5B83\\u5305\\u3002\\u4FDD\\u5B58\\u65F6\\u53EA\\u5408\\u5E76 rules \\u5B57\\u6BB5\\u3002":"\\u6309\\u6761\\u4EF6\\u628A\\u8BF7\\u6C42\\u8DEF\\u7531\\u5230\\u4E0D\\u540C\\u6E90\\u7AD9\\u3001\\u6539\\u5199\\u8DEF\\u5F84\\u3001\\u8BBE\\u7F6E\\u56DE\\u6E90 Host\\u3001\\u8BF7\\u6C42\\u5934\\u3001\\u54CD\\u5E94\\u5934\\u3001\\u7F13\\u5B58\\u7B49\\u3002\\u4FEE\\u6539\\u4E0D\\u4F1A\\u5F71\\u54CD\\u7AD9\\u70B9\\u57FA\\u7840\\u8BBE\\u7F6E\\u3001\\u6E90\\u7AD9\\u4E0E\\u5B89\\u5168\\u9632\\u62A4\\u3002"),e("div",{class:"subhead"},[e("span",{},c),p]),x,d]);le(r,"\\u4EC5\\u7BA1\\u7406\\u672C\\u7AD9\\u70B9\\u7684\\u8DEF\\u7531\\u89C4\\u5219\\u3002\\u4FDD\\u5B58\\u65F6\\u53EA\\u5408\\u5E76 rules \\u5B57\\u6BB5\\uFF0C\\u4E92\\u4E0D\\u8D8A\\u754C\\u3002",E,async()=>{let v=i.map(F=>F());if(l){let F=new Set(v.map(H=>H.id)),$=(s.rules||[]).filter(H=>!F.has(H.id)&&ge(H)!==l);await N.sites.saveRules(t,$.concat(v))}else await N.sites.saveRules(t,v);await te()})}async function An(t){if(await Ee("\\u5220\\u9664\\u7AD9\\u70B9","\\u786E\\u5B9A\\u5220\\u9664 "+t+" \\uFF1F\\u6B64\\u64CD\\u4F5C\\u4E0D\\u53EF\\u6062\\u590D\\u3002"))try{await N.sites.remove(t),P("\\u5DF2\\u5220\\u9664","ok"),await te(),await he(location.hash)}catch(s){P(s.message,"err")}}async function Ye(){let[t,n,s]=await Promise.all([N.system.info().catch(()=>null),N.sites.list().catch(()=>({sites:[]})),N.pools.list().catch(()=>({pools:[]}))]);D.info=t,D.sites=n.sites||[],D.pools=s.pools||[],Rt()}async function bt(){let t=e("div",{class:"section"});t.appendChild(e("h3",{},"\\u6982\\u89C8"));let n=null;try{n=await N.stats.overview()}catch{}let s=D.sites.length,o=D.pools.length,a=e("div",{class:"cards"},[je("\\u7AD9\\u70B9\\u6570",String(s)),je("\\u6E90\\u7AD9\\u6570",String(o)),je("\\u8BF7\\u6C42\\u6570(24h)",n&&n.enabled?et(n.requests):"\\u672A\\u542F\\u7528"),je("\\u7F13\\u5B58\\u547D\\u4E2D\\u7387",n&&n.enabled?Ge(n.hitRate):"\\u2014")]);if(t.appendChild(a),n&&n.enabled&&Array.isArray(n.topHosts)){t.appendChild(e("h4",{},"Top \\u7AD9\\u70B9"));let l=n.topHosts.slice(0,8).map(d=>[d.host,et(d.requests),et(d.bytes),Ge(d.hitRate)]);t.appendChild(pe(["Host","\\u8BF7\\u6C42","\\u6D41\\u91CF","\\u547D\\u4E2D\\u7387"],l))}else t.appendChild(e("p",{class:"empty"},"\\u7EDF\\u8BA1\\u672A\\u542F\\u7528\\uFF0C\\u53EF\\u5728\\u300C\\u7CFB\\u7EDF\\u8BBE\\u7F6E\\u300D\\u4E2D\\u5F00\\u542F\\u3002"));return t.appendChild(e("div",{class:"quick"},[e("button",{class:"btn btn-primary",text:"+ \\u65B0\\u5EFA\\u7AD9\\u70B9",onclick:()=>we(null)}),e("button",{class:"btn btn-primary",text:"+ \\u65B0\\u5EFA\\u6E90\\u7AD9\\u6C60",onclick:()=>_e(null,"pool")})])),t}var D={global:null,sites:[],pools:[],stats:null,info:null},j={},N=window.API,tt=window.__PLATFORM__||"unknown";async function te(){let[t,n]=await Promise.all([N.sites.list().catch(()=>({sites:[]})),N.pools.list().catch(()=>({pools:[]}))]);D.sites=t.sites||[],D.pools=n.pools||[]}function Sn(){let t=document.getElementById("theme-btn");t&&t.addEventListener("click",()=>{let n=document.documentElement,s=!n.classList.contains("light");n.classList.toggle("light",s)})}function Tn(){let t=a=>{a&&a.preventDefault&&a.preventDefault();let l=document.getElementById("login-btn");l&&(l.disabled=!0),Yt(document.getElementById("login-pwd").value).finally(()=>{l&&(l.disabled=!1)})},n=document.getElementById("login-form");n&&n.addEventListener("submit",t);let s=document.getElementById("login-btn");s&&(s.type="button",s.addEventListener("click",t));let o=document.getElementById("login-eye");o&&o.addEventListener("click",()=>{let a=document.getElementById("login-pwd");a.type=a.type==="password"?"text":"password"}),document.getElementById("logout-btn")&&document.getElementById("logout-btn").addEventListener("click",Qe),document.getElementById("drawer-close")&&(document.getElementById("drawer-close").onclick=He),document.getElementById("drawer-cancel")&&(document.getElementById("drawer-cancel").onclick=He),document.getElementById("drawer-mask")&&document.getElementById("drawer-mask").addEventListener("click",He),document.getElementById("menu-btn")&&document.getElementById("menu-btn").addEventListener("click",()=>{document.getElementById("sidebar").classList.add("open"),document.getElementById("sidebar-mask").hidden=!1}),document.getElementById("sidebar-close")&&document.getElementById("sidebar-close").addEventListener("click",()=>{document.getElementById("sidebar").classList.remove("open"),document.getElementById("sidebar-mask").hidden=!0}),document.getElementById("sidebar-mask")&&document.getElementById("sidebar-mask").addEventListener("click",()=>{document.getElementById("sidebar").classList.remove("open"),document.getElementById("sidebar-mask").hidden=!0}),yt().forEach(a=>a.addEventListener("click",()=>{document.getElementById("sidebar").classList.remove("open"),document.getElementById("sidebar-mask").hidden=!0})),Sn(),window.addEventListener("hashchange",()=>he(location.hash))}async function Jt(){try{Tn(),await Qt()?xt():rt()}catch(t){console.error("[boot] fatal:",t&&t.message||t),rt()}}typeof window<"u"&&window.__ENABLE_TEST_HOOK__&&(window.__TEST__={getOp:Ot,headerEditor:Ke,cacheEditor:st,rewriteEditor:ot,el:e,conditionRow:t=>ft(t)}),document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Jt):Jt();})();\n<\/script></body></html>', gd = `:root{--bg:#0e1116;--bg-soft:#151a21;--panel:#171d26;--panel-2:#1d2430;--border:#262e3b;--border-soft:#1f2733;--text:#e6edf3;--text-dim:#9aa7b6;--text-mute:#6b7888;--primary:#3b82f6;--primary-hover:#2f74e6;--primary-soft:rgba(59,130,246,.14);--success:#22c55e;--warn:#f59e0b;--danger:#ef4444;--danger-soft:rgba(239,68,68,.13);--info:#38bdf8;--shadow:0 8px 28px rgba(0,0,0,.45);--radius:10px;--radius-sm:7px;--sidebar-w:216px;--mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace}@media (prefers-color-scheme:light){:root[data-theme="auto"]{--bg:#f4f6f9;--bg-soft:#eceff4;--panel:#ffffff;--panel-2:#f7f9fc;--border:#dde3ec;--border-soft:#e8edf4;--text:#16202c;--text-dim:#55637a;--text-mute:#8794a8;--primary-soft:rgba(59,130,246,.1);--danger-soft:rgba(239,68,68,.08);--shadow:0 8px 28px rgba(19,32,51,.12)}}:root[data-theme="light"]{--bg:#f4f6f9;--bg-soft:#eceff4;--panel:#ffffff;--panel-2:#f7f9fc;--border:#dde3ec;--border-soft:#e8edf4;--text:#16202c;--text-dim:#55637a;--text-mute:#8794a8;--primary-soft:rgba(59,130,246,.1);--danger-soft:rgba(239,68,68,.08);--shadow:0 8px 28px rgba(19,32,51,.12)}*{box-sizing:border-box}html,body{margin:0;padding:0;height:100%}body{background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}a{color:var(--primary);text-decoration:none}h1,h2,h3,h4{margin:0;font-weight:600}[hidden]{display:none !important}.grow{flex:1}.mono{font-family:var(--mono);font-size:12.5px}.nowrap{white-space:nowrap}::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:var(--border);border-radius:6px;border:2px solid transparent;background-clip:content-box}::-webkit-scrollbar-thumb:hover{background:var(--text-mute);background-clip:content-box}:focus-visible{outline:2px solid var(--primary);outline-offset:2px}.login-wrap{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(1000px 480px at 50% -8%,var(--primary-soft),transparent 62%),var(--bg)}.login-card{width:100%;max-width:380px;background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:34px 28px 26px;box-shadow:var(--shadow)}.login-logo{font-size:40px;text-align:center;line-height:1}.login-title{text-align:center;font-size:20px;margin-top:12px}.login-sub{text-align:center;color:var(--text-dim);font-size:13px;margin:6px 0 22px}.login-foot{text-align:center;color:var(--text-mute);font-size:12px;margin:16px 0 0}.pwd-box{position:relative}.pwd-box .input{padding-right:40px}.pwd-eye{position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;font-size:15px;padding:6px 8px;border-radius:6px;opacity:.65}.pwd-eye:hover{opacity:1}.app{display:flex;min-height:100dvh}.sidebar{width:var(--sidebar-w);flex:0 0 var(--sidebar-w);background:var(--bg-soft);border-right:1px solid var(--border);display:flex;flex-direction:column;position:sticky;top:0;height:100dvh}.brand{display:flex;align-items:center;gap:9px;padding:16px 16px 14px;border-bottom:1px solid var(--border-soft)}.brand-logo{font-size:20px}.brand-text{font-weight:700;font-size:16px;letter-spacing:.3px}.sidebar-close{display:none;margin-left:auto}.nav{padding:10px 8px;display:flex;flex-direction:column;gap:2px;overflow-y:auto}.nav-item{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:var(--radius-sm);color:var(--text-dim);font-size:13.5px;transition:background .15s,color .15s}.nav-item:hover{background:var(--panel-2);color:var(--text)}.nav-item.active{background:var(--primary-soft);color:var(--primary);font-weight:600}.nav-ico{font-size:15px;width:18px;text-align:center}.sidebar-foot{margin-top:auto;padding:12px;border-top:1px solid var(--border-soft)}.plat-badge{font-size:11.5px;color:var(--text-mute);background:var(--panel);border:1px solid var(--border-soft);border-radius:6px;padding:6px 8px;text-align:center;font-family:var(--mono)}.main{flex:1;min-width:0;display:flex;flex-direction:column}.topbar{height:56px;display:flex;align-items:center;gap:12px;padding:0 18px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(8px);position:sticky;top:0;z-index:20}.page-title{font-size:16px}.topbar-actions{margin-left:auto;display:flex;align-items:center;gap:8px}.menu-btn{display:none}.content{padding:20px;max-width:1220px;width:100%}.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--panel-2);color:var(--text);font-size:13.5px;font-family:inherit;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s,opacity .15s}.btn:hover:not(:disabled){border-color:var(--text-mute)}.btn:disabled{opacity:.5;cursor:not-allowed}.btn-primary{background:var(--primary);border-color:var(--primary);color:#fff}.btn-primary:hover:not(:disabled){background:var(--primary-hover);border-color:var(--primary-hover)}.btn-danger{background:var(--danger);border-color:var(--danger);color:#fff}.btn-danger:hover:not(:disabled){filter:brightness(1.08)}.btn-ghost{background:transparent}.btn-ghost:hover:not(:disabled){background:var(--panel-2)}.btn-sm{padding:5px 10px;font-size:12.5px}.btn-xs{padding:3px 8px;font-size:12px;border-radius:5px}.btn-block{width:100%;padding:10px;font-size:14.5px;margin-top:4px}.btn-link{background:none;border:0;color:var(--primary);cursor:pointer;padding:2px 4px;font-size:13px;font-family:inherit}.btn-danger-text{color:var(--danger)}.icon-btn{background:none;border:0;color:var(--text-dim);cursor:pointer;font-size:16px;padding:6px 8px;border-radius:6px;line-height:1}.icon-btn:hover{background:var(--panel-2);color:var(--text)}.field{margin-bottom:15px}.label{display:block;font-size:12.5px;color:var(--text-dim);margin-bottom:6px;font-weight:500}.label .req{color:var(--danger);margin-left:2px}.form-field{margin-bottom:12px}.field-hint{font-size:12px;line-height:1.5;margin-top:4px;color:var(--text-mute)}.var-hint{display:flex;align-items:baseline;gap:6px;padding:4px 8px;border-left:2px solid var(--accent,#3b82f6);background:var(--bg-soft,rgba(59,130,246,0.06));border-radius:0 4px 4px 0}.var-hint .var-hint-tag{flex:0 0 auto;font-size:11px;font-weight:600;color:var(--accent,#3b82f6);white-space:nowrap}.var-hint .var-hint-tag::before{content:'\u2726 '}.kv-val{display:flex;flex-direction:column;gap:2px;flex:1 1 auto}.input,.select,.textarea{width:100%;padding:8px 11px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font:inherit;font-size:13.5px;transition:border-color .15s,box-shadow .15s}.input:focus,.select:focus,.textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-soft)}.input::placeholder,.textarea::placeholder{color:var(--text-mute)}.input:disabled,.select:disabled{opacity:.55;cursor:not-allowed}.input.invalid,.textarea.invalid{border-color:var(--danger)}.textarea{resize:vertical;min-height:74px;font-family:var(--mono);font-size:12.5px}.select{cursor:pointer;appearance:none;padding-right:30px;background-image:linear-gradient(45deg,transparent 50%,var(--text-mute) 50%),linear-gradient(135deg,var(--text-mute) 50%,transparent 50%);background-position:right 14px center,right 9px center;background-size:5px 5px,5px 5px;background-repeat:no-repeat}.hint{font-size:12px;color:var(--text-mute);margin-top:5px}.err{font-size:12px;color:var(--danger);margin-top:5px}.hint.warn{color:var(--warn,#d97706);background:color-mix(in srgb,var(--warn,#d97706) 10%,transparent);border-left:3px solid var(--warn,#d97706);padding:8px 10px;border-radius:var(--radius-sm,6px)}.tpl-params{margin:10px 0 4px;padding:12px 14px;background:var(--bg-soft,rgba(127,127,127,.06));border-left:3px solid var(--primary,#3b82f6);border-radius:var(--radius-sm,6px)}.tpl-params>.hint{margin:0 0 10px}.tpl-params .form-field:last-child{margin-bottom:0}.row{display:flex;gap:12px;flex-wrap:wrap}.row>.field{flex:1;min-width:150px}.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 12px}.switch{display:inline-flex;align-items:center;gap:9px;cursor:pointer;user-select:none}.switch input{position:absolute;opacity:0;width:0;height:0}.switch-track{width:38px;height:21px;border-radius:11px;background:var(--border);position:relative;transition:background .18s;flex:0 0 auto}.switch-track::after{content:"";position:absolute;width:17px;height:17px;border-radius:50%;background:#fff;top:2px;left:2px;transition:transform .18s;box-shadow:0 1px 3px rgba(0,0,0,.3)}.switch input:checked+.switch-track{background:var(--primary)}.switch input:checked+.switch-track::after{transform:translateX(17px)}.switch input:disabled+.switch-track{opacity:.5}.switch-label{font-size:13.5px}.radio-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.radio-card{display:flex;gap:9px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;background:var(--panel-2);transition:border-color .15s,background .15s}.radio-card:hover{border-color:var(--text-mute)}.radio-card.checked{border-color:var(--primary);background:var(--primary-soft)}.radio-card input{margin-top:3px;accent-color:var(--primary);flex:0 0 auto}.radio-card-body{min-width:0}.radio-card-title{font-size:13.5px;font-weight:600}.radio-card-desc{font-size:12px;color:var(--text-dim);margin-top:2px;line-height:1.45}.check-tags{display:flex;flex-wrap:wrap;gap:6px}.check-tag{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border:1px solid var(--border);border-radius:14px;cursor:pointer;font-size:12.5px;background:var(--panel-2);user-select:none;transition:border-color .15s,background .15s,color .15s}.check-tag:hover{border-color:var(--text-mute)}.check-tag.checked{border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}.check-tag input{display:none}.quick-btns{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.range-row{display:flex;align-items:center;gap:11px}.range-row input[type=range]{flex:1;accent-color:var(--primary);cursor:pointer}.range-val{min-width:40px;text-align:right;font-family:var(--mono);font-size:13px}.kv-list{display:flex;flex-direction:column;gap:6px}.kv-row{display:flex;gap:6px;align-items:flex-start}.kv-row>.btn{align-self:center}.kv-row .input{flex:1;min-width:0}.kv-row .input.kv-k{flex:0 0 34%}.card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:16px}.card+.card{margin-top:14px}.card-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}.card-title{font-size:14.5px}.card-sub{font-size:12.5px;color:var(--text-dim);margin-top:3px}.section{margin-bottom:22px}.section:last-child{margin-bottom:0}.section-title{font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;padding-bottom:7px;margin-bottom:12px;border-bottom:1px solid var(--border-soft)}.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;margin-bottom:16px}.stat-card{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius);padding:14px 16px}.stat-label{font-size:12.5px;color:var(--text-dim);display:flex;align-items:center;gap:5px}.stat-value{font-size:25px;font-weight:700;margin-top:7px;line-height:1.15;letter-spacing:-.4px}.stat-unit{font-size:13px;font-weight:500;color:var(--text-dim);margin-left:3px}.stat-foot{font-size:11.5px;color:var(--text-mute);margin-top:5px}.bars{display:flex;flex-direction:column;gap:9px}.bar-item{display:grid;grid-template-columns:62px 1fr 96px;align-items:center;gap:10px}.bar-label{font-family:var(--mono);font-size:12.5px;color:var(--text-dim)}.bar-track{height:9px;background:var(--bg-soft);border-radius:5px;overflow:hidden;border:1px solid var(--border-soft)}.bar-fill{height:100%;border-radius:5px;background:var(--primary);transition:width .45s cubic-bezier(.3,.9,.4,1);min-width:2px}.bar-fill.s2{background:var(--success)}.bar-fill.s3{background:var(--info)}.bar-fill.s4{background:var(--warn)}.bar-fill.s5{background:var(--danger)}.bar-value{font-size:12.5px;color:var(--text-dim);text-align:right;font-family:var(--mono)}.table-wrap{overflow-x:auto;margin:0 -16px -16px;padding:0 16px 16px}.table{width:100%;border-collapse:collapse;font-size:13.5px}.table th,.table td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border-soft)}.table th{font-size:12px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.4px;white-space:nowrap}.table tbody tr:last-child td{border-bottom:0}.table tbody tr:hover{background:var(--panel-2)}.table .col-actions{text-align:right;white-space:nowrap}.table .cell-main{font-weight:600}.badge{display:inline-block;padding:2px 8px;border-radius:11px;font-size:11.5px;font-weight:500;background:var(--panel-2);border:1px solid var(--border);color:var(--text-dim)}.badge-on{color:var(--success);border-color:color-mix(in srgb,var(--success) 40%,transparent);background:color-mix(in srgb,var(--success) 12%,transparent)}.badge-off{color:var(--text-mute)}.badge-warn{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,transparent);background:color-mix(in srgb,var(--warn) 12%,transparent)}.badge-danger{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 40%,transparent);background:color-mix(in srgb,var(--danger) 12%,transparent)}.badge-info{color:var(--info);border-color:color-mix(in srgb,var(--info) 40%,transparent);background:color-mix(in srgb,var(--info) 12%,transparent)}.badge-single{color:var(--text-mute);border-color:color-mix(in srgb,var(--text-mute) 35%,transparent);background:color-mix(in srgb,var(--text-mute) 10%,transparent)}.badge-pool{color:var(--info);border-color:color-mix(in srgb,var(--info) 45%,transparent);background:color-mix(in srgb,var(--info) 14%,transparent)}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;vertical-align:middle}.dot-up{background:var(--success);box-shadow:0 0 0 3px color-mix(in srgb,var(--success) 20%,transparent)}.dot-down{background:var(--danger);box-shadow:0 0 0 3px color-mix(in srgb,var(--danger) 20%,transparent)}.dot-unknown{background:var(--text-mute)}.sync-subpanel{margin-top:14px;padding:14px;border:1px solid var(--border);border-radius:10px;background:var(--panel-2)}.sync-subpanel+.sync-subpanel{margin-top:16px}.section-head-inline{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.state{text-align:center;padding:46px 20px;color:var(--text-dim)}.state-ico{font-size:34px;opacity:.55}.state-title{font-size:14.5px;margin-top:10px;color:var(--text);font-weight:600}.state-text{font-size:13px;margin-top:5px}.state-act{margin-top:15px}.spinner{width:26px;height:26px;border:2.5px solid var(--border);border-top-color:var(--primary);border-radius:50%;margin:0 auto;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.skeleton{background:linear-gradient(90deg,var(--panel-2) 25%,var(--border-soft) 50%,var(--panel-2) 75%);background-size:200% 100%;animation:shimmer 1.3s infinite;border-radius:5px;height:13px}@keyframes shimmer{to{background-position:-200% 0}}.drawer-mask,.sidebar-mask,.modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;animation:fade .16s}@keyframes fade{from{opacity:0}}.drawer{position:fixed;top:0;right:0;bottom:0;width:min(860px,100%);background:var(--panel);border-left:1px solid var(--border);z-index:61;display:flex;flex-direction:column;box-shadow:var(--shadow);animation:slide-in .2s cubic-bezier(.3,.9,.4,1)}@keyframes slide-in{from{transform:translateX(22px);opacity:.4}}.drawer-head{display:flex;align-items:center;padding:15px 18px;border-bottom:1px solid var(--border);flex:0 0 auto}.drawer-head h3{font-size:15.5px;flex:1;min-width:0}.drawer-body{flex:1;overflow-y:auto;padding:22px}.drawer-foot{display:flex;align-items:center;gap:9px;padding:13px 18px;border-top:1px solid var(--border);background:var(--panel-2);flex:0 0 auto}.drawer-hint{font-size:12px;color:var(--text-mute)}.tabs{display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:18px;overflow-x:auto}.tab{padding:8px 15px;border:0;background:none;color:var(--text-dim);cursor:pointer;font-size:13.5px;font-family:inherit;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap;transition:color .15s,border-color .15s}.tab:hover{color:var(--text)}.tab.active{color:var(--primary);border-bottom-color:var(--primary);font-weight:600}.item-list{display:flex;flex-direction:column;gap:9px}.item{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel-2);overflow:hidden}.item.disabled{opacity:.62}.item-head{display:flex;align-items:center;gap:8px;padding:9px 11px;cursor:pointer;user-select:none}.item-head:hover{background:var(--border-soft)}.item-caret{font-size:10px;color:var(--text-mute);transition:transform .15s;flex:0 0 auto}.item.open .item-caret{transform:rotate(90deg)}.item-title{font-size:13.5px;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-meta{font-size:12px;color:var(--text-mute);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.item-tools{margin-left:auto;display:flex;align-items:center;gap:3px;flex:0 0 auto}.item-body{padding:13px;border-top:1px solid var(--border);background:var(--panel)}.empty-inline{text-align:center;padding:22px;color:var(--text-mute);font-size:13px;border:1px dashed var(--border);border-radius:var(--radius-sm)}.alert{display:flex;gap:9px;padding:10px 12px;border-radius:var(--radius-sm);font-size:12.5px;line-height:1.55;margin-bottom:12px;border:1px solid}.alert-warn{background:color-mix(in srgb,var(--warn) 11%,transparent);border-color:color-mix(in srgb,var(--warn) 32%,transparent);color:var(--text)}.alert-info{background:color-mix(in srgb,var(--info) 10%,transparent);border-color:color-mix(in srgb,var(--info) 30%,transparent);color:var(--text)}.alert-danger{background:var(--danger-soft);border-color:color-mix(in srgb,var(--danger) 34%,transparent);color:var(--text)}.alert-ico{flex:0 0 auto}.modal-mask{display:flex;align-items:center;justify-content:center;padding:20px;z-index:80}.modal{background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:22px;width:100%;max-width:400px;box-shadow:var(--shadow);animation:pop .16s cubic-bezier(.3,.9,.4,1)}@keyframes pop{from{transform:scale(.96);opacity:0}}.modal-title{font-size:16px}.modal-text{color:var(--text-dim);font-size:13.5px;margin:10px 0 0;line-height:1.6}.modal-extra{margin-top:14px}.modal-foot{display:flex;justify-content:flex-end;gap:9px;margin-top:20px}.toasts{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:100;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:min(420px,calc(100% - 32px))}.toast{background:var(--panel);border:1px solid var(--border);border-left:3px solid var(--primary);border-radius:var(--radius-sm);padding:10px 14px;font-size:13.5px;box-shadow:var(--shadow);animation:toast-in .2s cubic-bezier(.3,.9,.4,1);max-width:100%;pointer-events:auto}.toast.ok{border-left-color:var(--success)}.toast.err{border-left-color:var(--danger)}.toast.warn{border-left-color:var(--warn)}.toast.hide{animation:toast-out .18s forwards}@keyframes toast-in{from{transform:translateY(-10px);opacity:0}}@keyframes toast-out{to{transform:translateY(-10px);opacity:0}}@media (max-width:860px){.sidebar{position:fixed;left:0;top:0;z-index:70;transform:translateX(-100%);transition:transform .22s cubic-bezier(.3,.9,.4,1)}.sidebar.open{transform:none}.sidebar-close{display:block}.menu-btn{display:block}.content{padding:14px}.topbar{padding:0 12px}.drawer{width:100%}.drawer-body{padding:14px}.stat-grid{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:9px}.stat-value{font-size:21px}.bar-item{grid-template-columns:50px 1fr 72px;gap:7px}.table th,.table td{padding:9px 8px}.kv-row{flex-wrap:wrap}.kv-row .input.kv-k{flex:1 1 100%}}@media (max-width:480px){.login-card{padding:26px 20px 20px}.radio-cards{grid-template-columns:1fr}}@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms !important;transition-duration:.01ms !important}}.subhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 10px;padding-bottom:7px;border-bottom:1px solid var(--border-soft);font-size:13.5px;font-weight:600;color:var(--text)}.rules-box{display:flex;flex-direction:column;gap:12px}.rule-card{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel-2);overflow:hidden}.rule-head{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--bg-soft);flex-wrap:wrap}.rule-head .field{margin-bottom:0;min-width:130px;flex:0 0 auto}.rule-card{cursor:default}.rule-grip{flex:0 0 auto;font-size:15px;line-height:1;color:var(--text-mute);cursor:grab;user-select:none;padding:0 2px;border-radius:5px}.rule-grip:hover{color:var(--primary);background:var(--panel-2)}.rule-tw{font-size:10px;color:var(--text-mute);transition:transform .15s;flex:0 0 auto}.rule-name-label{font-weight:600;font-size:14px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;min-width:0}.rule-prio-hint{font-size:11.5px;color:var(--text-mute)}.rule-card.collapsed .rule-tw{transform:rotate(0deg)}.rule-card:not(.collapsed) .rule-tw{transform:rotate(90deg)}.rule-card.collapsed .rule-detail{display:none}.rule-card:not(.collapsed) .rule-detail{display:block}.subcard{border:1px solid var(--border-soft);border-radius:var(--radius-sm);margin:10px 12px;overflow:hidden;background:var(--panel)}.subcard:last-child{margin-bottom:14px}.section-toggle{display:flex;align-items:center;gap:7px;padding:9px 12px;cursor:pointer;user-select:none;background:var(--panel-2)}.section-toggle:hover{background:var(--border-soft)}.section-toggle .tw{font-size:10px;color:var(--text-mute);transition:transform .15s}.subcard.collapsed .tw{transform:rotate(0deg)}.subcard:not(.collapsed) .tw{transform:rotate(90deg)}.section-toggle strong{font-size:13px}.section-toggle .muted{color:var(--text-mute);font-size:12px;font-weight:400}.section-toggle .op-remove{margin-left:auto;padding:2px 10px;font-size:12px;flex:none}.ops-list{display:flex;flex-direction:column;gap:12px}.rw-editor{display:flex;flex-direction:column;gap:10px}.rw-desc{font-size:12px;line-height:1.5;margin-top:-4px}.rw-fields{display:flex;flex-direction:column;gap:10px}.rw-example{font-size:12px;line-height:1.5}.rw-preview-row{display:flex;flex-direction:column;gap:10px}.rw-preview-wrap{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg-soft,#f6f7f9);border:1px dashed var(--border);border-radius:8px;padding:8px 10px}.rw-preview{font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:13px;color:var(--text);word-break:break-all}.ro-tag{flex:none;font-size:11px;line-height:1;padding:2px 6px;border-radius:4px;background:var(--bg-inset,#eceef1);color:var(--muted,#888);border:1px solid var(--border);user-select:none}.rw-examples{display:flex;flex-direction:column;gap:6px;margin-top:4px;padding:8px 10px;background:var(--bg-soft,#f6f7f9);border:1px solid var(--border);border-radius:8px}.rw-example-item{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rw-example-btn{font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;cursor:pointer;background:var(--bg);color:var(--text);border:1px solid var(--accent,#3b82f6);border-radius:6px;padding:3px 8px;line-height:1.4}.rw-example-btn:hover{background:var(--accent-soft,#eef4ff)}.section-body{padding:12px;border-top:1px solid var(--border-soft)}.subcard.collapsed .section-body{display:none}.origin-row .subcard{margin:10px 0}.origin-card{border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--panel-2);overflow:hidden;margin:10px 0}.origin-head{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--bg-soft);flex-wrap:wrap;cursor:pointer;user-select:none}.origin-grip{flex:0 0 auto;font-size:15px;line-height:1;color:var(--text-mute);cursor:grab;user-select:none;padding:0 2px;border-radius:5px}.origin-grip:hover{color:var(--primary);background:var(--panel-2)}.origin-tw{font-size:10px;color:var(--text-mute);transition:transform .15s;flex:0 0 auto}.origin-name-label{font-weight:600;font-size:14px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;min-width:0}.origin-card.collapsed .origin-tw{transform:rotate(0deg)}.origin-card:not(.collapsed) .origin-tw{transform:rotate(90deg)}.origin-card.collapsed .origin-detail{display:none}.origin-card:not(.collapsed) .origin-detail{display:block}.origin-detail{padding:12px}.origin-detail>.field{margin-bottom:10px}.inline-origin-box{margin:6px 0 4px;padding:14px;border:1px dashed var(--border-soft);border-radius:8px;background:color-mix(in srgb,var(--bg-soft) 50%,transparent)}.inline-origin-box .origin-row{margin:8px 0}.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 14px}.op-add{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 12px;margin-bottom:14px;background:var(--panel-2);border:1px dashed var(--border);border-radius:var(--radius-sm)}.op-add-label{font-size:13px;font-weight:600;color:var(--text)}.op-add .input{min-width:260px;flex:1;max-width:420px}.op-add .hint{margin-top:0}.seq-page .seq-pick{display:flex;align-items:center;gap:8px}.seq-pick .input{min-width:240px}.seq-flow{margin-top:16px;padding-left:8px;border-left:3px solid var(--border);display:flex;flex-direction:column;gap:0}.seq-stage{position:relative;display:flex;align-items:flex-start;gap:14px;padding:14px 16px 14px 22px;margin-left:14px;background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:-1px}.seq-stage::before{content:'';position:absolute;left:-15px;top:-16px;bottom:50%;width:2px;background:var(--border)}.seq-stage:first-child::before{display:none}.seq-icon{flex:0 0 auto;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-size:20px;background:var(--panel-2);border:1px solid var(--border);border-radius:50%}.seq-main{flex:1 1 auto;min-width:0}.seq-title{display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;color:var(--text);margin-bottom:4px}.seq-summary{font-size:13px;color:var(--muted);line-height:1.5;word-break:break-word}.seq-note{font-size:12px;line-height:1.5;margin-bottom:4px;color:var(--text-mute);word-break:break-word}.seq-owner{margin-top:6px;font-size:11px;color:var(--muted);opacity:.8;font-style:italic}.seq-group{position:relative;display:flex;align-items:flex-start;gap:10px;margin:18px 0 2px -15px;padding:6px 12px 6px 14px}.seq-group-no{flex:0 0 auto;font-size:13px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);border-radius:6px;padding:2px 8px;line-height:20px}.seq-group-main{min-width:0}.seq-group-title{font-size:14px;font-weight:700;color:var(--text)}.seq-group-desc{font-size:12px;color:var(--muted);margin-top:2px;line-height:1.5}.seq-substeps{margin:2px 0 6px 52px;padding:10px 14px;border-left:2px dashed var(--border);display:flex;flex-direction:column;gap:6px}.seq-substep{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}.seq-substep-t{font-size:12px;font-weight:600;color:var(--text);white-space:nowrap}.seq-substep-d{font-size:12px;color:var(--muted)}.frag-note{border-left:3px solid var(--accent);padding-left:10px;margin-bottom:12px}.seq-badge{font-size:11px;font-weight:600;padding:1px 8px;border-radius:999px;line-height:18px;white-space:nowrap}.seq-badge.on{background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent)}.seq-badge.off{background:var(--panel-2);color:var(--muted);border:1px solid var(--border)}.seq-go{flex:0 0 auto;align-self:center;font-size:12px;font-weight:600;color:var(--accent);white-space:nowrap}.seq-stage.clickable{cursor:pointer;transition:border-color .15s,transform .05s}.seq-stage.clickable:hover{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,var(--panel))}.seq-stage.clickable:active{transform:scale(.997)}.seq-stage.disabled{opacity:.55}.seq-rule{border-left:3px solid var(--accent)}.seq-rule-list{margin:2px 0 6px 26px;display:flex;flex-direction:column;gap:8px}.seq-rule-inpack{border-left:3px solid var(--border);background:color-mix(in srgb,var(--panel-2) 40%,transparent)}.seq-rule-head{display:flex;align-items:center;gap:10px;margin-bottom:4px}.seq-rule-prio{font-size:11px;font-weight:700;color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent);padding:1px 7px;border-radius:5px}.seq-rule-name{font-weight:600;font-size:15px;color:var(--text)}.seq-subs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.seq-chip{font-size:12px;padding:2px 9px;background:var(--panel-2);color:var(--text-2);border:1px solid var(--border);border-radius:999px}.flash-anchor{animation:flashAnchor 1.6s ease-out;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 45%,transparent)}@keyframes flashAnchor{0%{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 55%,transparent)}100%{box-shadow:0 0 0 3px transparent}}.seq-rule-drag{cursor:grab}.seq-rule-drag .seq-grip{flex:0 0 auto;align-self:center;font-size:15px;line-height:1;color:var(--muted);cursor:grab;user-select:none;padding:0 2px;border-radius:5px}.seq-rule-drag .seq-grip:hover{color:var(--accent);background:var(--panel-2)}.seq-rule-drag.dragging{opacity:.4;cursor:grabbing}.seq-rule-drag.drop-before{box-shadow:inset 0 3px 0 0 var(--accent)}.seq-rule-drag.drop-after{box-shadow:inset 0 -3px 0 0 var(--accent)}.seq-rule-head .seq-grip+.seq-rule-prio{margin-left:0}.seq-site-head{position:relative;margin:18px 0 4px 14px;padding:10px 14px;background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:6px}.seq-site-head:first-of-type{margin-top:4px}.seq-site-name{font-weight:700;font-size:16px;color:var(--text);word-break:break-all}.seq-site-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.seq-site-go{margin-left:auto}.seq-site-click{position:absolute;inset:0;cursor:pointer}.seq-site-head:hover{border-color:var(--accent)}.section>.section-title{color:var(--accent)}.check-row{display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}.check{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border:1px solid var(--border);border-radius:14px;cursor:pointer;font-size:12.5px;background:var(--panel-2);user-select:none;transition:border-color .15s,background .15s,color .15s}.check:hover{border-color:var(--text-mute)}.check input{accent-color:var(--primary);margin:0}.check:has(input:checked){border-color:var(--primary);background:var(--primary-soft);color:var(--primary)}.kv-label{font-size:12px;color:var(--text-dim);margin:8px 0 5px}.header-editor{display:flex;flex-direction:column}.header-editor .btn{align-self:flex-start;margin-top:6px}.header-editor .kv-row .hk{flex:0 0 36%}.header-editor .kv-row .hv{flex:1;min-width:0}.muted{color:var(--text-mute);font-size:12px}.check .muted{margin-left:2px}.cond-groups{display:flex;flex-direction:column;gap:10px;margin:10px 0}.cond-group{border:1px dashed var(--border);border-radius:var(--radius-sm);padding:10px;background:var(--panel);position:relative}.cond-group+.cond-group{margin-top:14px}.cond-group+.cond-group::before{content:'\u6216 (OR)';position:absolute;top:-9px;left:12px;padding:0 6px;font-size:11px;color:var(--text-mute);background:var(--panel-2);border-radius:8px}.cond-group-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.cond-group-head .badge{font-size:11px;padding:2px 7px;border-radius:8px;background:var(--primary-soft);color:var(--primary)}.cond-rows{display:flex;flex-direction:column;gap:6px}.cond-row{display:grid;grid-template-columns:minmax(120px,1.1fr) minmax(0,0.9fr) minmax(110px,1fr) minmax(0,1.6fr) auto auto;gap:6px;align-items:flex-start}.cond-row>.btn,.cond-row>.check,.cond-row>label.check-wrap{align-self:center}.cond-row .input{min-width:0}.cond-cell{min-width:0}.cond-row .check{padding:4px 8px}.ext-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.ext-chip{font-size:11px;line-height:1;padding:3px 7px;border:1px solid var(--border,#d0d7de);border-radius:999px;background:var(--bg-soft,#f3f4f6);color:var(--text,#333);cursor:pointer;white-space:nowrap}.ext-chip:hover{border-color:var(--accent,#3b82f6);color:var(--accent,#3b82f6)}.ext-chip:active{transform:scale(.94)}.ms-trigger-wrap{margin-top:6px}.ms-trigger{display:flex;align-items:center;gap:6px;width:100%;padding:0 8px 0 0;font-size:13px;font-family:inherit;color:var(--text,#1f2937);background:var(--bg,#fff);border:1px solid var(--border,#d0d7de);border-radius:8px;cursor:text;transition:border-color .15s,box-shadow .15s,background .15s}.ms-trigger:hover{border-color:var(--accent,#3b82f6)}.ms-trigger.is-open{border-color:var(--accent,#3b82f6);box-shadow:0 0 0 3px rgba(59,130,246,.15)}.ms-combobox-input{flex:1 1 auto;min-width:0;border:none !important;background:transparent !important;box-shadow:none !important;padding:7px 10px;font-size:13px;font-family:inherit;color:var(--text,#1f2937);outline:none}.ms-combobox-input::placeholder{color:var(--text-muted,#6b7280)}.ms-caret{color:var(--text-muted,#6b7280);transition:transform .18s ease;flex:none;cursor:pointer;padding:7px 2px}.ms-trigger.is-open .ms-caret{transform:rotate(180deg)}.ms-panel{z-index:9999;max-height:320px;overflow-y:auto;padding:8px;background:var(--bg,#fff);border:1px solid var(--border,#d0d7de);border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.18);animation:ms-pop .14s ease}@keyframes ms-pop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}.ms-group{padding:4px 2px}.ms-group+.ms-group{margin-top:4px;border-top:1px solid var(--border,#eef0f3);padding-top:8px}.ms-group-label{font-size:11px;font-weight:600;color:var(--text-muted,#6b7280);letter-spacing:.03em;margin:2px 4px 6px}.ms-opts{display:flex;flex-wrap:wrap;gap:6px}.ms-opt{font-size:12px;font-family:inherit;padding:5px 10px;border:1px solid var(--border,#d0d7de);border-radius:8px;background:var(--bg-soft,#f3f4f6);color:var(--text,#1f2937);cursor:pointer;white-space:nowrap;transition:transform .12s,border-color .12s,background .12s,color .12s,box-shadow .12s}.ms-opt:hover{border-color:var(--accent,#3b82f6);color:var(--accent,#2563eb);transform:translateY(-1px)}.ms-opt:active{transform:scale(.95)}.ms-opt.is-selected{background:linear-gradient(135deg,var(--accent,#3b82f6),#2563eb);border-color:transparent;color:#fff;box-shadow:0 2px 8px rgba(37,99,235,.35)}.ms-opt.is-selected:hover{color:#fff}@media (max-width:720px){.cond-row{grid-template-columns:1fr 1fr}}.rules-box textarea.input{resize:vertical;font-family:inherit}`;
  });
  var gi = {};
  dt(gi, { rawTcpFetch: () => e0 });
  async function e0(e, u, t, r, n) {
    let a = await u0(), o = typeof e == "string" ? new URL(e) : e, s = Number(t) > 0 ? Number(t) : 1e4, i = Number(o.port) || (o.protocol === "https:" ? 443 : 80), l = o.hostname, c = o.protocol === "https:", d = c ? { secureTransport: "on", allowHalfOpen: false } : { allowHalfOpen: false };
    if (c) {
      let g = u.get("Host");
      g && !/^\d{1,3}(\.\d{1,3}){3}$/.test(g.split(":")[0]) && (d.servername = g.split(":")[0]);
    }
    let p = a({ hostname: l, port: i }, d);
    p.opened && await p.opened;
    let f = p.writable.getWriter();
    try {
      let g = (n?.request?.method || "GET").toUpperCase(), m = t0(o, u, g);
      return await f.write(m), g !== "GET" && g !== "HEAD" && (r?.bodyBuf != null ? await f.write(new Uint8Array(r.bodyBuf)) : n?.request?.body && await r0(n.request.body, f)), f.releaseLock(), await n0(p, s, g);
    } catch (g) {
      try {
        f.releaseLock();
      } catch {
      }
      try {
        await p.close();
      } catch {
      }
      throw g;
    }
  }
  async function u0() {
    try {
      let e = await import("cloudflare:sockets");
      if (typeof e?.connect != "function")
        throw new Error("connect() not found in cloudflare:sockets");
      return e.connect;
    } catch (e) {
      throw new Error(`cloudflare:sockets unavailable: ${e?.message || e}`);
    }
  }
  function t0(e, u, t) {
    let r = `${e.pathname}${e.search}`, n = [`${t} ${r} HTTP/1.1`];
    for (let [a, o] of u) {
      let s = a.toLowerCase();
      s === "connection" || s === "transfer-encoding" || n.push(`${a}: ${o}`);
    }
    return n.push("Connection: close"), n.push("", ""), new TextEncoder().encode(n.join(`\r
`));
  }
  async function r0(e, u) {
    let t = e.getReader();
    for (; ; ) {
      let { done: r, value: n } = await t.read();
      if (r)
        break;
      n && await u.write(n);
    }
  }
  async function n0(e, u, t) {
    let r = e.readable.getReader(), n = false, a = setTimeout(() => {
      n = true, e.close().catch(() => {
      });
    }, u);
    try {
      let o = new Uint8Array(0), s = -1;
      for (; s < 0; ) {
        let { done: _, value: H } = await r.read();
        if (_)
          break;
        if (H && (o = Fi(o, H), s = i0(o), o.length > 65536 && s < 0))
          throw new Error("response header too large");
      }
      if (n)
        throw new Error(`socket timeout after ${u}ms`);
      if (s < 0)
        throw new Error("malformed response: header terminator not found");
      let i = new TextDecoder().decode(o.slice(0, s)), l = o.slice(s + 4), c = i.split(`\r
`), d = c.shift() || "", p = /^HTTP\/1\.[01]\s+(\d{3})\s*(.*)$/.exec(d);
      if (!p)
        throw new Error(`malformed status line: ${d.slice(0, 100)}`);
      let f = parseInt(p[1], 10), g = p[2] || "", m = new Headers();
      for (let _ of c) {
        let H = _.indexOf(":");
        if (H <= 0)
          continue;
        let Z = _.slice(0, H).trim(), ue = _.slice(H + 1).trim();
        try {
          m.append(Z, ue);
        } catch {
        }
      }
      let A = /chunked/i.test(m.get("transfer-encoding") || ""), S = m.has("content-length") ? parseInt(m.get("content-length"), 10) : null;
      if (m.delete("transfer-encoding"), m.delete("connection"), m.delete("content-encoding-hint"), t === "HEAD" || f === 204 || f === 304)
        return clearTimeout(a), r.releaseLock(), e.close().catch(() => {
        }), new Response(null, { status: f, statusText: g, headers: m });
      let v = A ? o0(r, l, e, a) : a0(r, l, e, a, S);
      return new Response(v, { status: f, statusText: g, headers: m });
    } catch (o) {
      clearTimeout(a);
      try {
        r.releaseLock();
      } catch {
      }
      throw e.close().catch(() => {
      }), o;
    }
  }
  function a0(e, u, t, r, n) {
    let a = 0;
    return new ReadableStream({ start(o) {
      u.length > 0 && (o.enqueue(u), a += u.length), n !== null && a >= n && ku(o, e, t, r);
    }, async pull(o) {
      try {
        let { done: s, value: i } = await e.read();
        if (s) {
          ku(o, e, t, r);
          return;
        }
        i && (o.enqueue(i), a += i.length, n !== null && a >= n && ku(o, e, t, r));
      } catch (s) {
        clearTimeout(r), o.error(s), t.close().catch(() => {
        });
      }
    }, cancel() {
      clearTimeout(r), t.close().catch(() => {
      });
    } });
  }
  function o0(e, u, t, r) {
    let n = u, a = false;
    function o(s) {
      for (; ; ) {
        let i = s0(n);
        if (i < 0)
          return false;
        let l = new TextDecoder().decode(n.slice(0, i)), c = parseInt(l.split(";")[0].trim(), 16);
        if (!Number.isFinite(c))
          return s.error(new Error(`malformed chunk size: ${l.slice(0, 50)}`)), true;
        if (c === 0)
          return true;
        let d = i + 2, p = d + c;
        if (n.length < p + 2)
          return false;
        s.enqueue(n.slice(d, p)), n = n.slice(p + 2);
      }
    }
    return new ReadableStream({ async pull(s) {
      if (!a)
        try {
          if (o(s)) {
            a = true, ku(s, e, t, r);
            return;
          }
          let { done: i, value: l } = await e.read();
          if (i) {
            a = true, ku(s, e, t, r);
            return;
          }
          l && (n = Fi(n, l), o(s) && (a = true, ku(s, e, t, r)));
        } catch (i) {
          clearTimeout(r), s.error(i), t.close().catch(() => {
          });
        }
    }, cancel() {
      clearTimeout(r), t.close().catch(() => {
      });
    } });
  }
  function ku(e, u, t, r) {
    clearTimeout(r);
    try {
      e.close();
    } catch {
    }
    try {
      u.releaseLock();
    } catch {
    }
    t.close().catch(() => {
    });
  }
  function Fi(e, u) {
    if (e.length === 0)
      return u;
    if (u.length === 0)
      return e;
    let t = new Uint8Array(e.length + u.length);
    return t.set(e, 0), t.set(u, e.length), t;
  }
  function s0(e) {
    for (let u = 0; u + 1 < e.length; u++)
      if (e[u] === 13 && e[u + 1] === 10)
        return u;
    return -1;
  }
  function i0(e) {
    for (let u = 0; u + 3 < e.length; u++)
      if (e[u] === 13 && e[u + 1] === 10 && e[u + 2] === 13 && e[u + 3] === 10)
        return u;
    return -1;
  }
  var hi = R(() => {
  });
  pt();
  Et();
  U();
  Wu();
  U();
  X();
  X();
  var po = 220;
  var sc = Object.freeze([[/\b(bearer|basic)\s+[\w\-._~+/]+=*/gi, "$1 ***"], [/\b(token|access_token|refresh_token|api[_-]?key|apikey|secret|password|passwd|pwd|signature|sig|credential|auth)\s*[=:]\s*[^\s&;,"')]+/gi, "$1=***"], [/\bAKIA[0-9A-Z]{16}\b/g, "AKIA***"], [/\bX-Amz-(Signature|Credential|Security-Token)=[^\s&]*/gi, "X-Amz-$1=***"], [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "***.jwt.***"], [/\b(set-)?cookie\s*:\s*[^\n]*/gi, "cookie: ***"]]);
  function et(e) {
    if (e == null)
      return "";
    let u = typeof e == "string" ? e : String(e);
    for (let [t, r] of sc)
      u = u.replace(t, r);
    return u = u.replace(/\s+/g, " ").trim(), u.length > po && (u = u.slice(0, po - 1) + "\u2026"), u;
  }
  var Se = class extends Error {
    constructor(u, t = {}) {
      super(u), this.name = new.target.name, this.code = t.code || F.INTERNAL, this.status = typeof t.status == "number" ? t.status : 500, this.expose = t.expose === true, this.details = t.details || null, t.cause !== void 0 && (this.cause = t.cause);
    }
    publicMessage() {
      return this.expose ? et(this.message) : "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF";
    }
  };
  var Gt = class extends Se {
    constructor(u = "\u8BF7\u6C42\u53C2\u6570\u6709\u8BEF", t = {}) {
      super(u, { code: F.BAD_REQUEST, status: 400, expose: true, ...t });
    }
  };
  var Du = class extends Se {
    constructor(u = "\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F", t = {}) {
      super(u, { code: F.UNAUTHORIZED, status: 401, expose: true, ...t });
    }
  };
  var Kt = class extends Se {
    constructor(u = "\u8D44\u6E90\u4E0D\u5B58\u5728", t = {}) {
      super(u, { code: F.NOT_FOUND, status: 404, expose: true, ...t });
    }
  };
  var Wt = class extends Se {
    constructor(u = "\u4E0A\u6E38\u670D\u52A1\u4E0D\u53EF\u7528", t = {}) {
      super(u, { code: F.INTERNAL, status: 502, expose: false, ...t });
    }
  };
  function Vt(e) {
    return e instanceof Se ? e : e instanceof Error ? new Se(e.message || String(e), { code: F.INTERNAL, status: 500, expose: false, cause: e }) : new Se(typeof e == "string" ? e : "\u672A\u77E5\u9519\u8BEF", { code: F.INTERNAL, status: 500, expose: false, cause: e });
  }
  var ru = "X-Request-Id";
  var ic = Object.freeze(["x-request-id", "cf-ray", "eo-log-uuid", "x-amzn-trace-id"]);
  var lc = /^[A-Za-z0-9._-]{1,64}$/;
  function cc() {
    try {
      if (typeof crypto < "u" && typeof crypto.randomUUID == "function")
        return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
      if (typeof crypto < "u" && typeof crypto.getRandomValues == "function") {
        let e = new Uint8Array(12);
        return crypto.getRandomValues(e), Array.from(e, (u) => u.toString(16).padStart(2, "0")).join("");
      }
    } catch {
    }
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 24);
  }
  function fo(e) {
    try {
      let u = e && e.headers;
      if (u)
        for (let t of ic) {
          let r = u.get(t);
          if (r && lc.test(r))
            return r;
        }
    } catch {
    }
    return cc();
  }
  var dc = "application/json; charset=utf-8";
  var pc = Object.freeze({ "Cache-Control": "no-store, no-cache, must-revalidate", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  var fc = Object.freeze({ [F.UNAUTHORIZED]: 401, [F.FORBIDDEN]: 403, [F.NOT_FOUND]: 404, [F.BAD_REQUEST]: 400, [F.CONFLICT]: 409, [F.RATE_LIMITED]: 429, [F.INTERNAL]: 500, [F.STORAGE_UNAVAILABLE]: 503 });
  function Fc(e, u) {
    let t = new Headers(pc);
    if (t.set("Content-Type", u), e)
      if (typeof e.forEach == "function" && !Array.isArray(e))
        e.forEach((r, n) => t.set(n, r));
      else
        for (let r of Object.keys(e)) {
          let n = e[r];
          n != null && t.set(r, String(n));
        }
    return t;
  }
  function gc(e) {
    try {
      return JSON.stringify(e);
    } catch {
      return JSON.stringify({ ok: false, error: { code: F.INTERNAL, message: "\u54CD\u5E94\u5E8F\u5217\u5316\u5931\u8D25" } });
    }
  }
  function hn(e, u = 200, t) {
    return new Response(gc(e), { status: u, headers: Fc(t, dc) });
  }
  function x(e = null, u = 200, t) {
    return hn({ ok: true, data: e }, u, t);
  }
  function h(e, u, t, r) {
    let n = typeof e == "string" && e !== "" ? e : F.INTERNAL, a = typeof t == "number" && t >= 100 && t <= 599 ? t : fc[n] ?? 400;
    return hn({ ok: false, error: { code: n, message: typeof u == "string" && u !== "" ? u : n } }, a, r);
  }
  function Fo(e, u = {}) {
    let t = Vt(e), r = u.reqId, n = { ok: false, error: { code: t.code, message: t.publicMessage() } };
    r && (n.error.requestId = r);
    let a = { ...u.headers || {} };
    return r && (a[ru] = r), hn(n, t.status, a);
  }
  function Xt(e = "\u672A\u8BA4\u8BC1\u6216\u767B\u5F55\u5DF2\u8FC7\u671F") {
    return h(F.UNAUTHORIZED, e, 401);
  }
  Dt();
  var mo = 1e5;
  var Eo = 16;
  var bo = "ecw_token";
  var hc = 7200;
  var go = 30;
  var mc = new TextEncoder();
  function xo(e) {
    return xt(mc.encode(e)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function ho(e) {
    try {
      return new TextDecoder().decode(Ea(String(e)));
    } catch {
      return "";
    }
  }
  async function Yt(e, u) {
    let t = typeof e == "string" ? e : String(e ?? ""), r = typeof u == "string" && u.length > 0 ? u : At(Eo);
    return { hash: await Lr(t, r, mo), salt: r };
  }
  async function ut(e, u, t) {
    try {
      let r = typeof t == "string" && t.length > 0 ? t : "0".repeat(Eo * 2), n = await Lr(e == null ? "" : String(e), r, mo);
      return typeof u != "string" || u.length === 0 ? false : _u(n, u);
    } catch {
      return false;
    }
  }
  var Ec = xo(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  async function Ao(e, u) {
    return await xa(u, e);
  }
  async function mn(e, u, t) {
    if (typeof u != "string" || u.length === 0)
      throw new Error("signToken: \u62D2\u7EDD\u4F7F\u7528\u7A7A\u5BC6\u94A5\u7B7E\u540D\uFF0C\u8BF7\u914D\u7F6E JWT_SECRET \u73AF\u5883\u53D8\u91CF");
    let r = Math.floor(Date.now() / 1e3), n = Number.isFinite(t) && t > 0 ? Math.floor(t) : hc, a = { ...e && typeof e == "object" ? e : {}, iat: r, exp: r + n };
    e && typeof e == "object" && Number.isFinite(e.exp) && (a.exp = e.exp);
    let o = xo(JSON.stringify(a)), s = `${Ec}.${o}`, i = await Ao(s, u);
    return `${s}.${i}`;
  }
  async function bc(e, u) {
    try {
      if (typeof e != "string" || e.length === 0 || e.length > 4096 || typeof u != "string" || u.length === 0)
        return null;
      let t = e.split(".");
      if (t.length !== 3)
        return null;
      let [r, n, a] = t;
      if (!r || !n || !a)
        return null;
      let o = ho(r);
      if (!o)
        return null;
      let s = JSON.parse(o);
      if (!s || s.alg !== "HS256")
        return null;
      let i = await Ao(`${r}.${n}`, u);
      if (!_u(a, i))
        return null;
      let l = ho(n);
      if (!l)
        return null;
      let c = JSON.parse(l);
      if (!c || typeof c != "object")
        return null;
      let d = Math.floor(Date.now() / 1e3);
      return !Number.isFinite(c.exp) || d > c.exp + go || Number.isFinite(c.nbf) && d + go < c.nbf ? null : c;
    } catch {
      return null;
    }
  }
  async function Jt(e) {
    try {
      let t = (e && e.env || {}).JWT_SECRET;
      if (typeof t == "string" && t.length >= 8)
        return t;
      let { getGlobal: r } = await Promise.resolve().then(() => (U(), co)), n = await r(e), a = n && n.passwordHash;
      return typeof a == "string" && a.length > 0 ? await Aa(`ecw-jwt-derive:v1:${a}`) : "";
    } catch {
      return "";
    }
  }
  function Qt(e, u, t = true) {
    let r = Number.isFinite(u) && u > 0 ? Math.floor(u) : 0, n = r > 0 ? String(e ?? "") : "", a = `HttpOnly; SameSite=Strict; Path=/; Max-Age=${r}`;
    return t && (a += "; Secure"), `${bo}=${n}; ${a}`;
  }
  function En(e = true) {
    return Qt("", 0, e);
  }
  function xc(e) {
    try {
      if (!e || !e.headers)
        return null;
      let u = e.headers.get("Cookie") || e.headers.get("cookie") || "";
      if (u) {
        let r = u.split(";");
        for (let n of r) {
          let a = n.indexOf("=");
          if (a <= 0)
            continue;
          if (n.slice(0, a).trim() === bo) {
            let s = n.slice(a + 1).trim();
            return s.length > 0 ? s : null;
          }
        }
      }
      let t = e.headers.get("Authorization") || "";
      if (t.length > 7 && t.slice(0, 7).toLowerCase() === "bearer ") {
        let r = t.slice(7).trim();
        return r.length > 0 ? r : null;
      }
      return null;
    } catch {
      return null;
    }
  }
  async function bn(e) {
    try {
      let u = xc(e && e.request);
      if (!u)
        return null;
      let t = await Jt(e);
      return t ? await bc(u, t) : null;
    } catch {
      return null;
    }
  }
  X();
  var er = /* @__PURE__ */ new Map();
  function yu(e, u) {
    try {
      if (!e || !e.headers)
        return "unknown";
      let t = e.headers, r = t.get("CF-Connecting-IP");
      if (r)
        return Zt(r);
      let n = t.get("EO-Connecting-IP");
      if (n)
        return Zt(n);
      if (u && u.trustProxyHeaders === true) {
        let a = t.get("X-Forwarded-For");
        if (a) {
          let s = a.split(",")[0];
          if (s && s.trim())
            return Zt(s);
        }
        let o = t.get("X-Real-IP");
        if (o)
          return Zt(o);
      }
      return "unknown";
    } catch {
      return "unknown";
    }
  }
  function Zt(e) {
    let t = String(e).trim().replace(/^\[|\]$/g, "").replace(/[^0-9a-fA-F.:]/g, "");
    return t ? t.slice(0, 45).toLowerCase() : "unknown";
  }
  function Do(e) {
    let u = er.get(e);
    return u ? u.until <= Date.now() ? (er.delete(e), { n: 0, until: 0 }) : { n: Number(u.n) || 0, until: Number(u.until) || 0 } : { n: 0, until: 0 };
  }
  async function ur(e, u) {
    let t = Do(u);
    if (t.n < 5)
      return { allowed: true, retryAfter: 0, failures: t.n };
    let r = Date.now(), n = t.until > r ? Math.ceil((t.until - r) / 1e3) : 0;
    return n <= 0 && (n = 900), { allowed: false, retryAfter: n, failures: t.n };
  }
  async function nu(e, u) {
    let r = Do(u).n + 1, n = Date.now() + 900 * 1e3;
    return er.set(u, { n: r, until: n }), r;
  }
  async function yo(e, u) {
    er.delete(u);
  }
  async function G(e) {
    let u = Number.isFinite(e) ? e : Date.now(), r = 500 - (Date.now() - u);
    r > 0 && await new Promise((n) => setTimeout(n, r));
  }
  U();
  async function Co(e, u) {
    let t = Date.now(), r = yu(e.request), n = await ur(e, r);
    if (!n.allowed)
      return await G(t), h(F.RATE_LIMITED, `\u5C1D\u8BD5\u6B21\u6570\u8FC7\u591A\uFF0C\u8BF7\u5728 ${n.retryAfter} \u79D2\u540E\u91CD\u8BD5`, 429);
    let a;
    try {
      a = await e.request.json();
    } catch {
      return await G(t), h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    let o = typeof a?.password == "string" ? a.password : "";
    if (!o)
      return await G(t), h(F.BAD_REQUEST, "\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A", 400);
    let s = u || await L(e);
    if (s?.passwordHash) {
      if (!await ut(o, s.passwordHash, s.passwordSalt))
        return await nu(e, r), await G(t), h(F.UNAUTHORIZED, "\u5BC6\u7801\u9519\u8BEF", 401);
    } else {
      let p = e.env?.ADMIN_PASSWORD;
      if (!p)
        return await G(t), h(F.INTERNAL, "\u5C1A\u672A\u521D\u59CB\u5316\u7BA1\u7406\u5458\u5BC6\u7801\uFF0C\u8BF7\u5148\u8BBE\u7F6E ADMIN_PASSWORD \u73AF\u5883\u53D8\u91CF\uFF08wrangler secret put ADMIN_PASSWORD\uFF09", 500);
      if (o !== p)
        return await nu(e, r), await G(t), h(F.UNAUTHORIZED, "\u5BC6\u7801\u9519\u8BEF", 401);
      let { hash: f, salt: g } = await Yt(o);
      s.passwordHash = f, s.passwordSalt = g, await He(e, s);
    }
    await yo(e, r);
    let i = await Jt(e), l = s?.tokenTtl || 7200, c;
    try {
      c = await mn({ sub: "admin", iat: Math.floor(Date.now() / 1e3) }, i, l);
    } catch {
      return await G(t), h(F.INTERNAL, "\u65E0\u6CD5\u7B7E\u53D1\u767B\u5F55\u51ED\u8BC1\uFF1A\u7B7E\u540D\u5BC6\u94A5\u4E0D\u53EF\u7528\uFF0C\u8BF7\u914D\u7F6E JWT_SECRET \u73AF\u5883\u53D8\u91CF\u540E\u91CD\u8BD5", 500);
    }
    await G(t);
    let d = (e.request.url || "").startsWith("https://");
    return new Response(JSON.stringify({ ok: true, data: { authed: true, ttl: l } }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "set-cookie": Qt(c, l, d), "cache-control": "no-store" } });
  }
  async function vo(e) {
    let u = (e.request.url || "").startsWith("https://");
    return new Response(JSON.stringify({ ok: true, data: { loggedOut: true } }), { status: 200, headers: { "content-type": "application/json; charset=utf-8", "set-cookie": En(u), "cache-control": "no-store" } });
  }
  async function Bo(e, u) {
    let t;
    try {
      t = await e.request.json();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    let r = String(t?.oldPassword || ""), n = String(t?.newPassword || "");
    if (n.length < 8)
      return h(F.BAD_REQUEST, "\u65B0\u5BC6\u7801\u957F\u5EA6\u81F3\u5C11 8 \u4F4D", 400);
    if (n.length > 256)
      return h(F.BAD_REQUEST, "\u65B0\u5BC6\u7801\u8FC7\u957F", 400);
    let a = u || await L(e);
    if (a?.passwordHash && !await ut(r, a.passwordHash, a.passwordSalt))
      return h(F.UNAUTHORIZED, "\u539F\u5BC6\u7801\u9519\u8BEF", 401);
    let { hash: o, salt: s } = await Yt(n);
    a.passwordHash = o, a.passwordSalt = s, await He(e, a);
    let i = await Jt(e), l = a?.tokenTtl || 7200, c = null;
    try {
      c = await mn({ sub: "admin", iat: Math.floor(Date.now() / 1e3) }, i, l);
    } catch {
      c = null;
    }
    let d = (e.request.url || "").startsWith("https://"), p = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "set-cookie": c ? Qt(c, l, d) : En(d) };
    return new Response(JSON.stringify({ ok: true, data: { changed: true, reloginRequired: !c } }), { status: 200, headers: p });
  }
  X();
  U();
  Oe();
  re();
  var To = Object.freeze({ edgeTtl: Object.freeze({ label: "\u8FB9\u7F18\u7F13\u5B58\u65F6\u95F4", hint: "\u5185\u5BB9\u5728\u8FB9\u7F18\u8282\u70B9\u4E0A\u4FDD\u7559\u591A\u4E45\u3002\u8D8A\u957F\u56DE\u6E90\u8D8A\u5C11\u3001\u8D8A\u7701\u94B1\uFF0C\u4F46\u6E90\u7AD9\u66F4\u65B0\u540E\u751F\u6548\u8D8A\u6162\u3002\u8FD9\u662F\u76F8\u5BF9\u5168\u7AD9\u9ED8\u8BA4\u57FA\u7EBF\uFF08cache.enabled=true\u3001edgeTtl=86400\uFF09\u7684\u300C\u8986\u76D6\u503C\u300D\u2014\u2014\u6A21\u677F\u53EA\u9488\u5BF9\u5339\u914D\u5230\u7684\u8D44\u6E90\u6539\u8FD9\u4E2A\u503C\uFF0C\u5176\u4F59\u8BF7\u6C42\u4ECD\u8D70\u5168\u7AD9\u9ED8\u8BA4\u3002\u6539\u5B8C\u5185\u5BB9\u8BB0\u5F97\u6E05\u7F13\u5B58\u3002", unit: "s", min: 0, max: 31536e3 }), browserTtl: Object.freeze({ label: "\u6D4F\u89C8\u5668\u7F13\u5B58\u65F6\u95F4", hint: "\u4E0B\u53D1\u7ED9\u8BBF\u5BA2\u6D4F\u89C8\u5668\u7684 max-age\u3002\u6D4F\u89C8\u5668\u7F13\u5B58\u65E0\u6CD5\u4E3B\u52A8\u6E05\u9664\uFF0C\u9664\u975E\u6587\u4EF6\u540D\u5E26\u7248\u672C\u53F7\uFF08\u5982 app.a1b2c3.js\uFF09\uFF0C\u5426\u5219\u522B\u8BBE\u592A\u957F\u3002\u586B -1 \u8868\u793A\u4E0D\u6539\u5199\u3001\u5B8C\u5168\u8DDF\u968F\u6E90\u7AD9\u3002\u540C\u6837\u76F8\u5BF9\u5168\u7AD9\u9ED8\u8BA4\u57FA\u7EBF\uFF08browserTtl=3600\uFF09\u505A\u8986\u76D6\u3002", unit: "s", min: -1, max: 31536e3 }), staleWhileRevalidate: Object.freeze({ label: "\u8FC7\u671F\u540E\u5BBD\u9650\u65F6\u95F4", hint: "\u8FB9\u7F18\u7F13\u5B58\u8FC7\u671F\u540E\u7684\u8FD9\u6BB5\u65F6\u95F4\u5185\uFF0C\u5148\u62FF\u65E7\u5185\u5BB9\u54CD\u5E94\u8BBF\u5BA2\u3001\u540C\u65F6\u540E\u53F0\u6084\u6084\u56DE\u6E90\u5237\u65B0\u3002\u80FD\u663E\u8457\u524A\u5E73\u6E90\u7AD9\u6D41\u91CF\u5C16\u5CF0\uFF0C\u8BBE 0 \u5173\u95ED\u3002\u76F8\u5BF9\u5168\u7AD9\u9ED8\u8BA4\u57FA\u7EBF\uFF08staleWhileRevalidate=3600\uFF09\u505A\u8986\u76D6\u3002", unit: "s", min: 0, max: 604800 }), errorTtl: Object.freeze({ label: "\u9519\u8BEF\u9875\u7F13\u5B58\u65F6\u95F4", hint: "\u7ED9 4xx/5xx \u9519\u8BEF\u9875\u4E5F\u52A0\u77ED\u6682\u8FB9\u7F18\u7F13\u5B58\uFF0C\u6321\u4F4F\u5BF9\u4E0D\u5B58\u5728\u8D44\u6E90\u6216\u6545\u969C\u6E90\u7AD9\u7684\u53CD\u590D\u7A7F\u900F\u3002\u5E95\u5C42\u76F4\u63A5\u751F\u6210 statusTtl \u7684\u300C4xx/5xx \u6BB5\u901A\u914D \u2192 \u8BE5\u79D2\u6570\u300D\uFF08\u9879\u76EE\u5B57\u6BB5\u5DF2\u539F\u751F\u652F\u6301\u6BB5\u901A\u914D\u4E0E ! \u4F8B\u5916\uFF0C\u65E0\u9700\u9010\u7801\u679A\u4E3E\uFF09\u3002\u51E0\u79D2\u5C31\u591F\u4E86\uFF0C\u8BBE 0 \u4E0D\u7F13\u5B58\uFF08\u56DE\u843D\u5230\u5168\u7AD9\u9ED8\u8BA4\u7684 4xx/5xx/52x \u4E0D\u7F13\u5B58\u57FA\u7EBF\uFF09\u3002", unit: "s", min: 0, max: 3600 }) });
  var So = Object.freeze({ edgeTtl: le.edgeTtl, browserTtl: le.browserTtl, staleWhileRevalidate: le.staleWhileRevalidate, errorTtl: 0 });
  var An = Object.freeze(["7z", "avi", "avif", "apk", "bin", "bmp", "bz2", "class", "css", "csv", "doc", "docx", "dmg", "ejs", "eot", "eps", "exe", "flac", "gif", "gz", "ico", "iso", "jar", "jpg", "jpeg", "js", "mid", "midi", "mkv", "mp3", "mp4", "ogg", "otf", "pdf", "pict", "pls", "png", "ppt", "pptx", "ps", "rar", "svg", "svgz", "swf", "tar", "tif", "tiff", "ttf", "webm", "webp", "woff", "woff2", "xls", "xlsx", "zip", "zst"]);
  var xn = Object.freeze(["php", "jsp", "asp", "aspx", "do", "dwr", "cgi", "fcgi", "action", "ashx", "axd"]);
  var wo = An;
  var _o = Object.freeze([{ id: "blank", name: "\u7A7A\u767D\uFF08\u4E0D\u9884\u7F6E\u4EFB\u4F55\u89C4\u5219\uFF09", desc: "\u4EC0\u4E48\u90FD\u4E0D\u751F\u6210\uFF0C\u5168\u90E8\u81EA\u5DF1\u914D\u3002\u5DF2\u7ECF\u6E05\u695A\u8981\u600E\u4E48\u914D\u3001\u6216\u8981\u4ECE\u522B\u5904\u5BFC\u5165\u914D\u7F6E\u65F6\u9009\u5B83\u3002", params: {}, tuning: [], build: () => [] }, { id: "website", name: "\u7F51\u7AD9\u52A0\u901F", desc: "\u901A\u7528\u7F51\u7AD9 / \u524D\u540E\u7AEF\u5206\u79BB\u7AD9\u70B9\u3002\u9759\u6001\u8D44\u6E90\u957F\u7F13\u5B58\uFF0CHTML \u4E0E API \u4E0D\u7F13\u5B58\uFF0C\u907F\u514D\u7528\u6237\u770B\u5230\u65E7\u9875\u9762\u3002", params: { edgeTtl: 2592e3, browserTtl: 86400, staleWhileRevalidate: 60, errorTtl: 10 }, tuning: ["edgeTtl", "browserTtl", "staleWhileRevalidate", "errorTtl"], build: (e) => [{ name: "\u9759\u6001\u8D44\u6E90\u957F\u7F13\u5B58", note: "\u5E26\u7248\u672C\u53F7/\u54C8\u5E0C\u7684 css\u3001js\u3001\u56FE\u7247\u3001\u5B57\u4F53\u7B49\u3002\u5185\u5BB9\u4E00\u53D8\u6587\u4EF6\u540D\u5C31\u53D8\uFF0C\u53EF\u653E\u5FC3\u957F\u7F13\u5B58\u3002", match: { conditions: [[_e(An)]] }, cache: { enabled: true, mode: "ttl", edgeTtl: e.edgeTtl, browserTtl: e.browserTtl, staleWhileRevalidate: e.staleWhileRevalidate, ignoreQuery: true, statusTtl: tt(e), preRefresh: true, preRefreshPercent: 80, offlineCache: true } }, { name: "HTML \u9875\u9762\u4E0D\u7F13\u5B58", note: "HTML \u662F\u5185\u5BB9\u5165\u53E3\uFF0C\u4E00\u65E6\u88AB\u7F13\u5B58\u4F4F\uFF0C\u53D1\u7248\u540E\u7528\u6237\u4F1A\u957F\u65F6\u95F4\u505C\u5728\u65E7\u9875\u9762\u3002\u9ED8\u8BA4\u4E0D\u7F13\u5B58\u6700\u5B89\u5168\u3002", match: { conditions: [[_e(["html", "htm"])]] }, cache: { enabled: false, mode: "noCache" } }, { name: "API \u8DEF\u5F84\u4E0D\u7F13\u5B58", note: "/api/ \u4E0B\u901A\u5E38\u662F\u52A8\u6001\u6570\u636E\u3001\u4E14\u5E38\u5E26\u767B\u5F55\u6001\uFF0C\u7F13\u5B58\u4F1A\u5BFC\u81F4\u4E32\u53F7\u7B49\u4E25\u91CD\u95EE\u9898\u3002\u8DEF\u5F84\u524D\u7F00\u6309\u4F60\u7684\u5B9E\u9645\u60C5\u51B5\u6539\u3002", match: { conditions: [[ko("/api/")]] }, cache: { enabled: false, mode: "noCache" } }, { name: "\u52A8\u6001\u811A\u672C\u4E0D\u7F13\u5B58", note: "php/jsp/asp/aspx \u7B49\u540E\u7AEF\u811A\u672C\u8F93\u51FA\u7684\u662F\u5B9E\u65F6\u6E32\u67D3\u7ED3\u679C\uFF08\u5E38\u542B\u7528\u6237\u6001\uFF09\uFF0C\u7F13\u5B58\u4F1A\u4E32\u53F7\u6216\u66B4\u9732\u4ED6\u4EBA\u6570\u636E\u3002", match: { conditions: [[_e(xn)]] }, cache: { enabled: false, mode: "noCache" } }] }, { id: "api", name: "API \u52A0\u901F", desc: "\u7EAF\u63A5\u53E3\u670D\u52A1\u3002\u9ED8\u8BA4\u5168\u90E8\u4E0D\u7F13\u5B58\uFF0C\u53EA\u505A\u5C31\u8FD1\u63A5\u5165\u548C\u94FE\u8DEF\u4F18\u5316\uFF1B\u7F13\u5B58\u4EA4\u7ED9\u4F60\u6309\u5177\u4F53\u63A5\u53E3\u9010\u4E2A\u5F00\u3002", params: { errorTtl: 0 }, tuning: ["errorTtl"], build: (e) => [{ name: "\u5168\u7AD9\u4E0D\u7F13\u5B58\uFF08API \u9ED8\u8BA4\uFF09", note: "API \u54CD\u5E94\u5927\u591A\u4E0E\u7528\u6237\u8EAB\u4EFD\u76F8\u5173\uFF0C\u9ED8\u8BA4\u4E00\u5F8B\u4E0D\u7F13\u5B58\u3002\u82E5\u67D0\u4E9B\u63A5\u53E3\uFF08\u5982\u516C\u5171\u914D\u7F6E\u3001\u5B57\u5178\u8868\uFF09\u786E\u5B9E\u53EF\u7F13\u5B58\uFF0C\u8BF7\u5355\u72EC\u52A0\u4E00\u6761\u66F4\u9AD8\u4F18\u5148\u7EA7\u7684\u89C4\u5219\u653E\u884C\u3002", match: {}, cache: { enabled: false, mode: "noCache", statusTtl: tt(e) } }] }, { id: "media", name: "\u97F3\u89C6\u9891\u6D41\u5A92\u4F53", desc: "\u70B9\u64AD / HLS / DASH\u3002\u5206\u7247\u957F\u7F13\u5B58\uFF0C\u7D22\u5F15\u6E05\u5355\u77ED\u7F13\u5B58\uFF0C\u4FDD\u8BC1\u80FD\u53CA\u65F6\u5207\u6362\u7801\u7387\u4E0E\u66F4\u65B0\u8282\u76EE\u3002", params: { edgeTtl: 86400, browserTtl: 3600, staleWhileRevalidate: 30, errorTtl: 5 }, tuning: ["edgeTtl", "browserTtl", "staleWhileRevalidate", "errorTtl"], build: (e) => [{ name: "\u5A92\u4F53\u5206\u7247\u957F\u7F13\u5B58", note: "ts / m4s / mp4 \u7B49\u5206\u7247\u4E00\u65E6\u751F\u6210\u5C31\u4E0D\u518D\u53D8\u5316\uFF0C\u9002\u5408\u957F\u7F13\u5B58\uFF0C\u8FD9\u662F\u6D41\u5A92\u4F53\u7701\u5E26\u5BBD\u7684\u5173\u952E\u3002", match: { conditions: [[_e(wo.filter((u) => u !== "m3u8" && u !== "mpd"))]] }, cache: { enabled: true, mode: "ttl", edgeTtl: e.edgeTtl, browserTtl: e.browserTtl, staleWhileRevalidate: e.staleWhileRevalidate, ignoreQuery: false, statusTtl: tt(e), preRefresh: false, preRefreshPercent: 80, offlineCache: false } }, { name: "\u7D22\u5F15\u6E05\u5355\u77ED\u7F13\u5B58", note: "m3u8 / mpd \u662F\u64AD\u653E\u5217\u8868\uFF0C\u76F4\u64AD\u6216\u66F4\u65B0\u4E2D\u7684\u70B9\u64AD\u4F1A\u4E0D\u65AD\u53D8\u5316\u3002\u53EA\u7F13\u5B58\u51E0\u79D2\uFF0C\u65E2\u6321\u4F4F\u9AD8\u5E76\u53D1\u53C8\u4E0D\u5F71\u54CD\u66F4\u65B0\u3002", match: { conditions: [[_e(["m3u8", "mpd"])]] }, cache: { enabled: true, mode: "ttl", edgeTtl: 3, browserTtl: 0, staleWhileRevalidate: 0, ignoreQuery: false, statusTtl: {}, preRefresh: false, preRefreshPercent: 80, offlineCache: false } }, { name: "\u5176\u4F59\u8BF7\u6C42\u8DDF\u968F\u6E90\u7AD9", note: "\u672A\u5339\u914D\u5230\u5177\u4F53\u5A92\u4F53\u6269\u5C55\u540D\u7684\u8BF7\u6C42\uFF0C\u6309\u6E90\u7AD9\u8FD4\u56DE\u7684 Cache-Control \u51B3\u5B9A\u7F13\u5B58\uFF0C\u4E0D\u5F3A\u884C\u5957\u7528\u6A21\u677F\u65F6\u95F4\u3002", match: {}, cache: { enabled: true, mode: "origin" } }] }, { id: "download", name: "\u5927\u6587\u4EF6\u4E0B\u8F7D", desc: "\u5B89\u88C5\u5305 / \u955C\u50CF / \u9759\u6001\u5F52\u6863\u3002\u5185\u5BB9\u57FA\u672C\u4E0D\u53EF\u53D8\uFF0C\u7528\u6700\u957F\u7F13\u5B58\u628A\u56DE\u6E90\u538B\u5230\u6700\u4F4E\u3002", params: { edgeTtl: 15552e3, browserTtl: 86400, staleWhileRevalidate: 300, errorTtl: 10 }, tuning: ["edgeTtl", "browserTtl", "staleWhileRevalidate", "errorTtl"], build: (e) => [{ name: "\u4E0B\u8F7D\u6587\u4EF6\u957F\u7F13\u5B58", note: "\u5B89\u88C5\u5305\u8FD9\u7C7B\u6587\u4EF6\u53D1\u5E03\u540E\u901A\u5E38\u4E0D\u518D\u4FEE\u6539\uFF08\u6539\u4E86\u4E00\u822C\u4E5F\u662F\u6362\u65B0\u7248\u672C\u53F7\uFF09\uFF0C\u9002\u5408\u6700\u957F\u7F13\u5B58\u3002", match: { conditions: [[_e(wo)]] }, cache: { enabled: true, mode: "ttl", edgeTtl: e.edgeTtl, browserTtl: e.browserTtl, staleWhileRevalidate: e.staleWhileRevalidate, ignoreQuery: false, statusTtl: tt(e), preRefresh: true, preRefreshPercent: 80, offlineCache: true } }, { name: "\u52A8\u6001\u811A\u672C\u4E0D\u7F13\u5B58", note: "php/jsp/asp/aspx \u7B49\u540E\u7AEF\u811A\u672C\u5B9E\u65F6\u6E32\u67D3\uFF0C\u7F13\u5B58\u4F1A\u4E32\u53F7\u3002", match: { conditions: [[_e(xn)]] }, cache: { enabled: false, mode: "noCache" } }] }, { id: "wordpress", name: "WordPress \u5EFA\u7AD9", desc: "WP \u7AD9\u70B9\u3002\u9759\u6001\u8D44\u6E90\u957F\u7F13\u5B58\u7701\u5E26\u5BBD\uFF0C\u540E\u53F0\u3001\u9996\u9875\u4E0E\u52A8\u6001\u811A\u672C\u4E0D\u7F13\u5B58\uFF0C\u907F\u514D\u767B\u5F55\u6001\u4E32\u53F7\u4E0E\u53D1\u7248\u770B\u4E0D\u5230\u66F4\u65B0\u3002", params: { edgeTtl: 5184e3, browserTtl: 604800, staleWhileRevalidate: 300, errorTtl: 10 }, tuning: ["edgeTtl", "browserTtl", "staleWhileRevalidate", "errorTtl"], build: (e) => [{ name: "\u9759\u6001\u8D44\u6E90\u957F\u7F13\u5B58", note: "WP \u4E0A\u4F20\u7684\u56FE\u7247\u3001\u4E3B\u9898\u6837\u5F0F/\u811A\u672C\u3001\u5B57\u4F53\u3001\u538B\u7F29\u5305\u7B49\u3002\u5185\u5BB9\u53D1\u5E03\u540E\u57FA\u672C\u4E0D\u53D8\uFF0C\u9002\u5408\u957F\u7F13\u5B58\u3002", match: { conditions: [[_e(An)]] }, cache: { enabled: true, mode: "ttl", edgeTtl: e.edgeTtl, browserTtl: e.browserTtl, staleWhileRevalidate: e.staleWhileRevalidate, ignoreQuery: true, statusTtl: tt(e), preRefresh: true, preRefreshPercent: 80, offlineCache: true } }, { name: "\u9996\u9875\u4E0D\u7F13\u5B58", note: "WP \u9996\u9875\u662F\u805A\u5408\u52A8\u6001\u5185\u5BB9\uFF0C\u53D1\u65B0\u6587\u7AE0\u540E\u9700\u8981\u5C3D\u5FEB\u66F4\u65B0\uFF0C\u7F13\u5B58\u4F1A\u5EF6\u8FDF\u5C55\u793A\u3002", match: { conditions: [[{ target: "path", op: "equal", ignoreCase: true, values: ["/"] }]] }, cache: { enabled: false, mode: "noCache" } }, { name: "\u540E\u53F0\u4E0D\u7F13\u5B58", note: "/wp-admin/ \u662F\u7BA1\u7406\u540E\u53F0\uFF0C\u542B\u767B\u5F55\u6001\u4E0E\u5B9E\u65F6\u64CD\u4F5C\uFF0C\u7F13\u5B58\u4F1A\u4E32\u53F7\u6216\u5361\u5728\u65E7\u9875\u9762\u3002", match: { conditions: [[ko("/wp-admin/")]] }, cache: { enabled: false, mode: "noCache" } }, { name: "\u52A8\u6001\u811A\u672C\u4E0D\u7F13\u5B58", note: "php/asp/jsp \u7B49\u540E\u7AEF\u811A\u672C\u5B9E\u65F6\u6E32\u67D3\uFF0C\u7F13\u5B58\u4F1A\u4E32\u53F7\u6216\u66B4\u9732\u4ED6\u4EBA\u6570\u636E\u3002", match: { conditions: [[_e(xn)]] }, cache: { enabled: false, mode: "noCache" } }] }]);
  function _e(e) {
    return { target: "extension", op: "equal", ignoreCase: true, values: e.map((u) => String(u).toLowerCase().replace(/^\./, "")) };
  }
  function ko(e) {
    return { target: "path", op: "prefix", ignoreCase: true, values: [e] };
  }
  function tt(e) {
    let u = Number(e?.errorTtl) || 0;
    return u <= 0 ? {} : Object.freeze({ "4xx": u, "5xx": u });
  }
  function Ro(e) {
    return _o.find((u) => u.id === e) || null;
  }
  function Lo(e) {
    let u = Ro(e);
    if (!u)
      return {};
    let t = {};
    for (let r of u.tuning || [])
      t[r] = u.params[r] !== void 0 ? u.params[r] : So[r];
    return t;
  }
  function Dc(e, u) {
    let t = Ro(e);
    if (!t || typeof t.build != "function")
      return [];
    let r = { ...So, ...Lo(e) };
    if (u && typeof u == "object")
      for (let [a, o] of Object.entries(u)) {
        let s = Number(o);
        Number.isFinite(s) && (r[a] = s);
      }
    return (t.build(r) || []).map((a, o) => {
      let s = { cache: { ...le, ...a.cache || {} } };
      return { id: `tpl-${e}-${o + 1}`, priority: (o + 1) * 10, enabled: true, name: a.name || "", note: a.note || "", match: a.match || {}, stage: "cache", action: s };
    });
  }
  function Oo() {
    return _o.map((e) => {
      let u = Lo(e.id), t = Dc(e.id, u);
      return { id: e.id, name: e.name, desc: e.desc, tuning: [...e.tuning || []], params: u, ruleCount: t.length, rules: t };
    });
  }
  ju();
  async function Io(e, u) {
    let t = Array.isArray(u.origins) ? u.origins : [];
    if (u.poolId)
      return delete u.origins, delete u.originStrategy, delete u.originFailover, { ok: true };
    if (delete u.originFailover, t.length === 0)
      return { ok: true };
    if (t.length > 1)
      return { ok: false, error: "\u7AD9\u70B9\u53EA\u80FD\u7ED1\u5B9A\u4E00\u4E2A\u6E90\u7AD9\uFF1B\u9700\u8981\u591A\u4E2A\u6E90\u7AD9\u8BF7\u5148\u5728\u300C\u6E90\u7AD9\u300D\u9875\u65B0\u5EFA\u6E90\u7AD9\u6C60\uFF0C\u518D\u5728\u6B64\u5904\u9009\u62E9" };
    let r = (s) => [s?.engine || "fetch", s?.scheme || "https", String(s?.addr || "").toLowerCase(), String(s?.port ?? ""), s?.pathPrefix || ""].join("|"), n = String(t[0]?.addr || "").toLowerCase(), a = hu({ name: n || u.host, kind: "single", strategy: "chain", origins: t, createdBy: u.host || "" }, e.caps);
    if (!a.ok)
      return { ok: false, error: "\u6E90\u7AD9\u6821\u9A8C\u5931\u8D25: " + a.errors.join("; ") };
    let o = r(a.value.origins[0]);
    try {
      let i = (await uu(e)).find((l) => (l.kind || (l.origins?.length === 1 ? "single" : "pool")) === "single" && Array.isArray(l.origins) && l.origins.length === 1 && r(l.origins[0]) === o);
      if (i)
        return u.poolId = i.id, delete u.origins, delete u.originStrategy, { ok: true };
    } catch {
    }
    return a.value.updatedAt = Date.now(), await eu(e, a.value), u.poolId = a.value.id, delete u.origins, delete u.originStrategy, { ok: true, created: a.value };
  }
  async function Ho() {
    return x({ templates: Oo(), paramMeta: To });
  }
  async function No(e) {
    let u = Number(e.url.searchParams.get("offset")) || 0, t = e.url.searchParams.get("limit"), { sites: r, total: n, truncated: a } = await zt(e, { offset: u, limit: t ? Number(t) : void 0 });
    return x({ sites: r, total: n, offset: u, truncated: a });
  }
  async function $o(e, u) {
    let t = await ie(e, u.toLowerCase(), { exact: true });
    return t ? x(t) : h(F.NOT_FOUND, `\u7AD9\u70B9\u4E0D\u5B58\u5728: ${u}`, 404);
  }
  async function Mo(e, u) {
    let t;
    try {
      t = await e.request.json();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    t.host = u.toLowerCase();
    let r = await Io(e, t);
    if (!r.ok)
      return h(F.BAD_REQUEST, r.error, 400);
    let n = Ku(t);
    return n.ok ? (n.value.updatedAt = Date.now(), await xe(e, n.value), x({ ...n.value, createdOrigin: r.created || null })) : h(F.BAD_REQUEST, "\u914D\u7F6E\u6821\u9A8C\u5931\u8D25: " + n.errors.join("; "), 400);
  }
  async function Uo(e, u) {
    let t = u.toLowerCase();
    return await ie(e, t, { exact: true }) ? (await dn(e, t), x({ deleted: t })) : h(F.NOT_FOUND, `\u7AD9\u70B9\u4E0D\u5B58\u5728: ${u}`, 404);
  }
  var yc = ["host", "enabled", "ipv6Support", "poolId", "defaultHostHeader"];
  async function Po(e, u) {
    let t = u.toLowerCase(), r;
    try {
      r = await e.request.json();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    if (!r || typeof r != "object")
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61", 400);
    let n = await ie(e, t, { exact: true });
    if (!n)
      return h(F.NOT_FOUND, `\u7AD9\u70B9\u4E0D\u5B58\u5728: ${u}`, 404);
    r.host = t;
    let a = await Io(e, r);
    if (!a.ok)
      return h(F.BAD_REQUEST, a.error, 400);
    let o = { ...n };
    for (let i of yc)
      i in r && (o[i] = r[i]);
    o.host = t, o.host = t, o.cacheGen = n.cacheGen || 0, o.updatedAt = Date.now();
    let s = Ku(o);
    return s.ok ? (await xe(e, s.value), x({ host: t, basics: "ok", poolId: s.value.poolId, createdOrigin: a.created || null })) : h(F.BAD_REQUEST, "\u914D\u7F6E\u6821\u9A8C\u5931\u8D25: " + s.errors.join("; "), 400);
  }
  async function zo(e, u) {
    let t = u.toLowerCase(), r;
    try {
      r = await e.request.json();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    if (!r || typeof r != "object")
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61", 400);
    if (!("rules" in r) || !Array.isArray(r.rules))
      return h(F.BAD_REQUEST, "rules \u5FC5\u987B\u662F\u6570\u7EC4", 400);
    let n = await ie(e, t, { exact: true });
    if (!n)
      return h(F.NOT_FOUND, `\u7AD9\u70B9\u4E0D\u5B58\u5728: ${u}`, 404);
    let a = (r.rules || []).map((s, i) => {
      let l = Rt(s, i);
      if (!l.value)
        return s;
      let c = zu(s.stage) || null;
      return { ...l.value, stage: c };
    }), o = { ...n, rules: a, cacheGen: n.cacheGen || 0, updatedAt: Date.now() };
    return await xe(e, o), x({ host: t, rules: "ok" });
  }
  async function qo(e, u) {
    let t = u.toLowerCase(), r;
    try {
      r = await e.request.json();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    if (!r || typeof r != "object")
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u5FC5\u987B\u662F JSON \u5BF9\u8C61", 400);
    if (!("security" in r) || typeof r.security != "object")
      return h(F.BAD_REQUEST, "security \u5FC5\u987B\u662F\u5BF9\u8C61", 400);
    let n = await ie(e, t, { exact: true });
    if (!n)
      return h(F.NOT_FOUND, `\u7AD9\u70B9\u4E0D\u5B58\u5728: ${u}`, 404);
    let a = { ...n, security: r.security, cacheGen: n.cacheGen || 0, updatedAt: Date.now() };
    return await xe(e, a), x({ host: t, security: "ok" });
  }
  X();
  U();
  Oe();
  Oe();
  async function Dn(e) {
    let u = /* @__PURE__ */ new Map(), t = (a, o) => {
      if (!a)
        return;
      let s = u.get(a);
      s ? s.push(o) : u.set(a, [o]);
    }, { sites: r, truncated: n } = await Ze(e);
    for (let a of r) {
      a.poolId && t(a.poolId, { type: "site", host: a.host, label: a.host, detail: "\u7AD9\u70B9\u9ED8\u8BA4\u6E90\u7AD9" });
      for (let o of a.rules || []) {
        let s = o?.action?.poolId;
        s && t(s, { type: "rule", host: a.host, label: a.host, detail: `\u89C4\u5219\u300C${o.name || o.id}\u300D\u8986\u76D6\u56DE\u6E90` });
      }
    }
    try {
      let a = await fe(e), o = a && a.stages ? a.stages : a;
      if (o && typeof o == "object") {
        let s = o.origin, i = s && s.poolId;
        i && t(i, { type: "globalRule", host: "", label: "\u5168\u7AD9\u901A\u7528\u89C4\u5219", detail: "\u5168\u7AD9\u901A\u7528\u89C4\u5219\u8986\u76D6\u56DE\u6E90" });
      }
    } catch {
      n = true;
    }
    return { map: u, truncated: n };
  }
  async function jo(e) {
    let u = await uu(e), { map: t, truncated: r } = await Dn(e), n = u.map((a) => {
      let o = t.get(a.id) || [];
      return { ...a, kind: a.kind || (Array.isArray(a.origins) && a.origins.length === 1 ? "single" : "pool"), refs: o, refCount: o.length, deletable: o.length === 0 && !r };
    });
    return x({ pools: n, refsTruncated: r });
  }
  async function Go(e, u) {
    if (!await Ne(e, u))
      return h(F.NOT_FOUND, `\u6E90\u7AD9\u4E0D\u5B58\u5728: ${u}`, 404);
    let { map: r, truncated: n } = await Dn(e), a = r.get(u) || [];
    return x({ id: u, refs: a, refCount: a.length, truncated: n });
  }
  async function Ko(e, u) {
    let t = await Ne(e, u);
    return t ? x(t) : h(F.NOT_FOUND, `\u6E90\u7AD9\u6C60\u4E0D\u5B58\u5728: ${u}`, 404);
  }
  async function Wo(e, u, t) {
    t && (u.id = t);
    let r = hu(u, e.caps);
    return r.ok ? (r.value.updatedAt = Date.now(), await eu(e, r.value), x(r.value)) : h(F.BAD_REQUEST, "\u914D\u7F6E\u6821\u9A8C\u5931\u8D25: " + r.errors.join("; "), 400);
  }
  async function Vo(e) {
    let u;
    try {
      u = await e.request.json();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    return E(u) ? Wo(e, u, null) : h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u5BF9\u8C61", 400);
  }
  async function Xo(e, u) {
    let t;
    try {
      t = await e.request.json();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    return E(t) ? Wo(e, t, u) : h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u5BF9\u8C61", 400);
  }
  async function Yo(e, u) {
    let t = await Ne(e, u);
    if (!t)
      return h(F.NOT_FOUND, `\u6E90\u7AD9\u4E0D\u5B58\u5728: ${u}`, 404);
    let r = (t.kind || "pool") === "single" ? "\u5355\u4E00\u6E90\u7AD9" : "\u6E90\u7AD9\u6C60", { map: n, truncated: a } = await Dn(e), o = n.get(u) || [];
    if (o.length === 0 && a)
      return h(F.CONFLICT, "\u7AD9\u70B9\u6570\u91CF\u8FC7\u591A\uFF0C\u65E0\u6CD5\u5B8C\u6210\u5F15\u7528\u68C0\u67E5\uFF0C\u4E3A\u907F\u514D\u8BEF\u5220\u5DF2\u963B\u6B62\u672C\u6B21\u64CD\u4F5C", 409);
    if (o.length > 0) {
      let s = [...new Set(o.map((i) => `${i.label}\uFF08${i.detail}\uFF09`))];
      return h(F.CONFLICT, `\u8BE5${r}\u4ECD\u88AB\u4EE5\u4E0B\u5BF9\u8C61\u5F15\u7528\uFF0C\u65E0\u6CD5\u5220\u9664\uFF1A${s.join("\u3001")}`, 409);
    }
    return await pn(e, u), x({ deleted: u });
  }
  X();
  U();
  pt();
  var Jo = Symbol("status-ttl-excluded");
  function Bc(e, u) {
    if (!e || typeof e != "object")
      return;
    let t = String(u);
    if (e[t] !== void 0)
      return e[t];
    let r, n = 99, a = false;
    for (let o of Object.keys(e)) {
      let s = String(o).trim().toLowerCase(), i = s.charCodeAt(0) === 33, l = i ? s.slice(1) : s;
      if (l.length !== 3)
        continue;
      let c = true, d = 0;
      for (let p = 0; p < 3; p++) {
        let f = l.charCodeAt(p);
        if (f === 120)
          d++;
        else if (f < 48 || f > 57) {
          c = false;
          break;
        } else if (f !== t.charCodeAt(p)) {
          c = false;
          break;
        }
      }
      c && (i ? a = true : d < n && (n = d, r = e[o]));
    }
    return a ? Jo : r;
  }
  var $e;
  var Fe = { hits: 0, misses: 0, disabled: 0, writes: 0, writeErrors: 0, purged: 0 };
  function tr() {
    if ($e !== void 0)
      return $e;
    try {
      let e = typeof caches < "u" ? caches : null;
      if (e && typeof e.default < "u")
        return $e = e.default, $e;
    } catch {
    }
    try {
      let e = typeof globalThis.cache < "u" ? globalThis.cache : null;
      if (e && typeof e.put == "function")
        return $e = e, $e;
    } catch {
    }
    return $e = null, $e;
  }
  function au(e, u) {
    e && e.debug && typeof e.debug == "object" && (e.debug.cache = u);
  }
  function yn(e) {
    return !!(e && e.caps ? e.caps : Ge(e && e.env)).hasEdgeCache;
  }
  function Cn(e) {
    return !!((e && e.caps ? e.caps : Ge(e && e.env)).hasCacheApi && tr() !== null);
  }
  async function vn(e, u) {
    if (!u)
      return null;
    if (!yn(e))
      return Fe.disabled++, au(e, "DISABLED"), null;
    if (!Cn(e))
      return au(e, "EDGE_HEADER"), null;
    let t = tr();
    try {
      let r = await t.match(u);
      return r ? (Fe.hits++, au(e, "HIT"), r) : (Fe.misses++, au(e, "MISS"), null);
    } catch {
      return Fe.misses++, au(e, "MISS"), null;
    }
  }
  async function Qo(e, u, t) {
    if (!u || !t || !yn(e))
      return;
    if (!Cn(e)) {
      au(e, "EDGE_HEADER");
      return;
    }
    let r = e && e.caps ? e.caps : Ge(e && e.env), n = u;
    r.cacheKeyHttpOnly && u instanceof URL && u.protocol === "https:" && (n = new URL(u.href), n.protocol = "http:");
    let a = tr();
    try {
      await a.put(n, t), Fe.writes++;
    } catch {
      Fe.writeErrors++;
    }
  }
  async function Zo(e, u) {
    if (!u || !yn(e))
      return false;
    if (!Cn(e))
      return au(e, "EDGE_HEADER"), false;
    let t = e && e.caps ? e.caps : Ge(e && e.env), r = u;
    t.cacheKeyHttpOnly && u instanceof URL && u.protocol === "https:" && (r = new URL(u.href), r.protocol = "http:");
    let n = tr();
    try {
      let a = await n.delete(r);
      return a && Fe.purged++, a;
    } catch {
      return false;
    }
  }
  function es() {
    let e = Fe.hits + Fe.misses;
    return { ...Fe, lookups: e, hitRate: e > 0 ? Number((Fe.hits / e).toFixed(4)) : 0 };
  }
  function us(e, u, t) {
    if (!t || t.enabled !== true || !e || !u)
      return false;
    let r = String(e.method || "GET").toUpperCase();
    if (r !== "GET" && r !== "HEAD")
      return false;
    try {
      if (e.headers && e.headers.get("range"))
        return false;
    } catch {
    }
    let n = u.status, a = Bc(t?.statusTtl, n);
    if (a === Jo)
      return true;
    if (a !== void 0)
      return a > 0;
    if (n === 206)
      return false;
    try {
      let o = u.headers;
      if (o) {
        if (o.has("set-cookie"))
          return false;
        let s = (o.get("cache-control") || "").toLowerCase();
        if (s.includes("no-store") || s.includes("private"))
          return false;
        let i = (o.get("vary") || "").toLowerCase();
        if (i && i.split(",").map((d) => d.trim()).filter(Boolean).some((d) => d !== "*" && d !== "accept-encoding"))
          return false;
      }
    } catch {
    }
    return true;
  }
  async function ts(e) {
    let u;
    try {
      u = await e.request.json();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    if (!e.caps.hasEdgeCache)
      return x({ purged: 0, message: "\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301\u8FB9\u7F18\u7F13\u5B58 API\uFF0C\u65E0\u9700\u6E05\u9664\u3002\u7F13\u5B58\u7531\u5E73\u53F0 CDN \u4F9D\u636E Cache-Control \u7BA1\u7406\u3002" });
    e.caps.cacheSingleInstance;
    let t = { byUrl: 0, byGeneration: null, failed: [] };
    if (Array.isArray(u.urls) && u.urls.length > 0) {
      if (u.urls.length > 100)
        return h(F.BAD_REQUEST, "\u5355\u6B21\u6700\u591A\u6E05\u9664 100 \u4E2A URL", 400);
      for (let r of u.urls)
        try {
          await Zo(e, String(r)) && t.byUrl++;
        } catch (n) {
          t.failed.push({ url: r, reason: n.message });
        }
    }
    if (u.host) {
      let r = String(u.host).toLowerCase(), n = await ie(e, r, { exact: true });
      if (!n)
        return h(F.NOT_FOUND, `\u7AD9\u70B9\u4E0D\u5B58\u5728: ${r}`, 404);
      n.cacheGen = (Number(n.cacheGen) || 0) + 1, n.updatedAt = Date.now(), await xe(e, n), t.byGeneration = { host: r, generation: n.cacheGen, note: "\u5DF2\u9012\u589E\u7F13\u5B58\u4EE3\u6B21\uFF0C\u65B0\u8BF7\u6C42\u5C06\u5168\u90E8\u56DE\u6E90\uFF1B\u65E7\u7F13\u5B58\u6761\u76EE\u4F1A\u88AB\u8FB9\u7F18\u81EA\u52A8\u6DD8\u6C70" };
    }
    return t.byUrl === 0 && !t.byGeneration ? h(F.BAD_REQUEST, "\u8BF7\u81F3\u5C11\u6307\u5B9A urls \u6216 host \u4E4B\u4E00", 400) : x(t);
  }
  U();
  U();
  Bn();
  U();
  Wu();
  var Hc = 500;
  var Nc = 3e5;
  var ns = 500;
  function as(e) {
    if (!e || typeof e != "object")
      return 4096;
    try {
      let u = Array.isArray(e.durSamples) ? e.durSamples.length : 0, t = e.origins ? Object.keys(e.origins).length : 0;
      return Math.max(256, 1024 + u * 8 + t * 32);
    } catch {
      return 4096;
    }
  }
  function os() {
    try {
      let e = Ot("stats");
      if (e > 0) {
        let u = Math.floor(e / as(null));
        return Math.max(1, Math.min(ns, u));
      }
    } catch {
    }
    return ns;
  }
  function $c(e) {
    try {
      if (Q.size === 0)
        return;
      let u = e ? Math.ceil(Q.size / 2) : 0;
      if (u <= 0)
        return;
      let t = 0;
      for (let r of Q.keys()) {
        if (t >= u)
          break;
        Q.delete(r), t += 1;
      }
      Re = Math.max(0, Re - t), Eu("stats", Q.size);
    } catch {
    }
  }
  mu("stats", { weight: 2, estimateBytes: as, evict: $c, allowAggressiveEvict: true });
  sn((e, u) => {
    let t = e?.statsDriver, r = u?.statsDriver, n = e?.statsEnabled !== false, a = u?.statsEnabled !== false;
    (t !== r || n !== a) && (console.log(`[stats] \u8FD0\u884C\u65F6\u8282\u7EDF\u8BA1\u5F15\u64CE\u5207\u6362: ${r ?? "d1"} \u2192 ${t ?? "d1"}, enabled=${n}`), jc());
  });
  var Mc = 32;
  var ar = 256;
  var Q = /* @__PURE__ */ new Map();
  var Re = 0;
  var or = Date.now();
  var nt = false;
  var _n = 0;
  function Uc() {
    return { requests: 0, s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0, sOther: 0, bytes: 0, cacheHit: 0, cacheMiss: 0, durSum: 0, durSamples: [], origins: /* @__PURE__ */ Object.create(null) };
  }
  function Pc(e) {
    return String(e || "unknown").toLowerCase().replace(/[^a-z0-9.\-_*]/g, "").slice(0, 128) || "unknown";
  }
  function Rn(e, u) {
    try {
      let t = u || {}, r = Pc(t.host || e && e.url && e.url.hostname), n = Q.get(r);
      if (!n) {
        if (Q.size >= os())
          return;
        n = Uc(), Q.set(r, n), Xe("stats", n);
      }
      n.requests += 1;
      let a = Number(t.status);
      a >= 200 && a < 300 ? n.s2xx += 1 : a >= 300 && a < 400 ? n.s3xx += 1 : a >= 400 && a < 500 ? n.s4xx += 1 : a >= 500 && a < 600 ? n.s5xx += 1 : n.sOther += 1;
      let o = Number(t.bytes);
      Number.isFinite(o) && o > 0 && (n.bytes += o);
      let s = t.cacheHit, i = s === true || typeof s == "string" && s.toUpperCase() === "HIT", l = s === false || typeof s == "string" && s.toUpperCase() === "MISS";
      if (i ? n.cacheHit += 1 : l && (n.cacheMiss += 1), t.originId) {
        let d = String(t.originId).slice(0, 64);
        (n.origins[d] !== void 0 || Object.keys(n.origins).length < Mc) && (n.origins[d] = (n.origins[d] || 0) + 1);
      }
      let c = Number(t.durationMs !== void 0 ? t.durationMs : t.duration);
      if (!Number.isFinite(c) && e && Number.isFinite(e.startTime) && (c = Date.now() - e.startTime), Number.isFinite(c) && c >= 0)
        if (n.durSum += c, n.durSamples.length < ar)
          n.durSamples.push(c);
        else {
          let d = Math.random() * n.requests | 0;
          d < ar && (n.durSamples[d] = c);
        }
      Re += 1;
    } catch {
    }
  }
  function zc(e) {
    return Re === 0 ? false : e || Re >= Hc ? true : Date.now() - or >= Nc;
  }
  function Tn() {
    let e = Q, u = Re;
    return Q = /* @__PURE__ */ new Map(), Re = 0, or = Date.now(), u > 0 && pe("stats", u), { snapshot: e, count: u };
  }
  function Sn(e, u) {
    if (!e || e.length === 0)
      return 0;
    let t = e.slice().sort((n, a) => n - a), r = Math.min(t.length - 1, Math.max(0, Math.round(u * (t.length - 1))));
    return Math.round(t[r]);
  }
  function ss(e, u) {
    return { host: e, requests: u.requests, status2xx: u.s2xx, status3xx: u.s3xx, status4xx: u.s4xx, status5xx: u.s5xx, statusOther: u.sOther, bytes: u.bytes, cacheHit: u.cacheHit, cacheMiss: u.cacheMiss, durAvg: u.requests > 0 ? Math.round(u.durSum / u.requests) : 0, durP50: Sn(u.durSamples, 0.5), durP95: Sn(u.durSamples, 0.95), durP99: Sn(u.durSamples, 0.99), origins: { ...u.origins } };
  }
  function qc(e) {
    try {
      for (let [u, t] of e) {
        let r = Q.get(u);
        if (!r) {
          if (Q.size >= os())
            continue;
          Q.set(u, t), Xe("stats", t);
          continue;
        }
        if (r.requests += t.requests, r.s2xx += t.s2xx, r.s3xx += t.s3xx, r.s4xx += t.s4xx, r.s5xx += t.s5xx, r.sOther += t.sOther, r.bytes += t.bytes, r.cacheHit += t.cacheHit, r.cacheMiss += t.cacheMiss, r.durSum += t.durSum, Array.isArray(t.durSamples) && t.durSamples.length > 0) {
          Array.isArray(r.durSamples) || (r.durSamples = []);
          for (let n of t.durSamples)
            if (r.durSamples.length < ar)
              r.durSamples.push(n);
            else {
              let a = Math.random() * ar | 0;
              r.durSamples[a] = n;
            }
        }
        for (let [n, a] of Object.entries(t.origins))
          r.origins[n] = (r.origins[n] || 0) + a;
      }
    } catch {
    }
  }
  async function Ln(e, u = false) {
    try {
      if (nt || !zc(u))
        return;
      nt = true;
      try {
        let t = null;
        try {
          t = await L(e);
        } catch {
          t = null;
        }
        if (t && t.statsEnabled === false) {
          Tn();
          return;
        }
        let r = t && t.statsDriver || "d1";
        if (r === "kv" && (r = "d1"), r === "none") {
          Tn();
          return;
        }
        let { snapshot: n } = Tn();
        if (n.size === 0)
          return;
        let a = [];
        for (let [o, s] of n)
          a.push(ss(o, s));
        try {
          if (r === "d1") {
            let o = await Promise.resolve().then(() => (nr(), rr)), s = await o.writeStats(e, a);
            s || (s = await o.writeStats(e, a)), s || (_n++, console.warn(`[stats] D1 \u5199\u5165\u5931\u8D25\u4E14\u91CD\u8BD5\u540E\u4ECD\u5931\u8D25\uFF08\u5B58\u50A8= d1\uFF0C\u672A\u964D\u7EA7 KV\uFF09\u3002\u5C06\u4E22\u5F03\u672C\u6B21\u805A\u5408\uFF0Chosts=${a.length}\uFF0C\u7D2F\u8BA1\u4E22\u5F03 ${_n} \u6B21\u3002`));
          }
        } catch (o) {
          qc(n);
          try {
            console.warn("[stats] \u843D\u76D8\u5931\u8D25\uFF1A", String(o && o.message || o));
          } catch {
          }
        }
      } finally {
        nt = false;
      }
    } catch {
      nt = false;
    }
  }
  async function On(e) {
    let u = [];
    for (let [n, a] of Q)
      u.push(ss(n, a));
    let t = false, r = "d1";
    try {
      let n = await L(e);
      if (n && n.statsDriver && (r = n.statsDriver), r === "kv" && (r = "d1"), r === "d1") {
        let a = await Promise.resolve().then(() => (nr(), rr));
        t = typeof a.isAvailable == "function" ? a.isAvailable(e) : false;
      }
    } catch {
    }
    return { pending: Re, lastFlushAt: or, hosts: u, d1FallbackCount: _n, driver: r, d1Available: t };
  }
  function jc() {
    Q = /* @__PURE__ */ new Map(), Re = 0, or = Date.now(), nt = false;
  }
  var Gc = 10;
  var Kc = 10;
  function is() {
    return { requests: 0, hitRate: 0, bytes: 0, statusDist: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 }, topHosts: [] };
  }
  function In(e) {
    return { requests: 0, hitRate: 0, bytes: 0, statusDist: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 }, series: (e || []).map((u) => ({ hour: u, requests: 0, bytes: 0, hit: 0, miss: 0 })) };
  }
  function N(e) {
    let u = Number(e);
    return Number.isFinite(u) && u > 0 ? u : 0;
  }
  function Hn(e, u) {
    let t = e + u;
    return t <= 0 ? 0 : Math.round(e / t * 1e4) / 1e4;
  }
  function Wc(e) {
    let u = Date.now(), t = [];
    for (let r = e - 1; r >= 0; r--)
      t.push(Cu(u - r * 36e5));
    return t;
  }
  async function Vc(e, u) {
    let t = [];
    for (let r = 0; r < e.length; r += u) {
      let n = e.slice(r, r + u), a = await Promise.all(n.map((o) => o().catch(() => null)));
      t.push(...a);
    }
    return t;
  }
  async function ls(e) {
    let u = "d1";
    try {
      let t = await L(e);
      if (t && t.statsEnabled === false)
        return { name: "none", mod: null };
      t && t.statsDriver && (u = t.statsDriver), u === "kv" && (u = "d1");
    } catch {
      u = "d1";
    }
    if (u === "none")
      return { name: "none", mod: null };
    try {
      return { name: "d1", mod: await Promise.resolve().then(() => (nr(), rr)) };
    } catch {
      return { name: "none", mod: null };
    }
  }
  function Xc(e, u) {
    let t = e && e.total || {}, r = /* @__PURE__ */ new Map();
    for (let a of e && e.series || [])
      a && a.hour && r.set(String(a.hour), a);
    let n = u.map((a) => {
      let o = r.get(a);
      return { hour: a, requests: N(o && o.requests), bytes: N(o && o.bytes), hit: N(o && o.cacheHit), miss: N(o && o.cacheMiss) };
    });
    return { requests: N(t.requests), hitRate: Hn(N(t.cacheHit), N(t.cacheMiss)), bytes: N(t.bytes), statusDist: { "2xx": N(t.status2xx), "3xx": N(t.status3xx), "4xx": N(t.status4xx), "5xx": N(t.status5xx) }, series: n };
  }
  async function cs(e, u, t = 24) {
    let r = is();
    try {
      let n = Array.isArray(u) ? u.filter((m) => typeof m == "string" && m) : [];
      if (n.length === 0)
        return r;
      let { mod: a } = await ls(e);
      if (!a || typeof a.queryStats != "function")
        return r;
      let o = Math.max(1, Math.floor(Number(t) || 24)), s = `${n.slice(0, 64).sort().join(",")}:${o}`, i = Date.now();
      if (sr.key === s && i - sr.at < ps)
        return sr.data;
      let c = n.map((m) => async () => {
        let A = await a.queryStats(e, m, o);
        return { host: m, total: A && A.total || {} };
      }), d = await Vc(c, Gc), p = 0, f = 0, g = [];
      for (let m of d) {
        if (!m)
          continue;
        let A = m.total;
        r.requests += N(A.requests), r.bytes += N(A.bytes), r.statusDist["2xx"] += N(A.status2xx), r.statusDist["3xx"] += N(A.status3xx), r.statusDist["4xx"] += N(A.status4xx), r.statusDist["5xx"] += N(A.status5xx), p += N(A.cacheHit), f += N(A.cacheMiss), g.push({ host: m.host, requests: N(A.requests), bytes: N(A.bytes), hitRate: Hn(N(A.cacheHit), N(A.cacheMiss)) });
      }
      return r.hitRate = Hn(p, f), g.sort((m, A) => A.requests - m.requests), r.topHosts = g.slice(0, Kc), sr = { key: s, at: i, data: r }, r;
    } catch {
      return is();
    }
  }
  async function ds(e, u, t = 24) {
    let r = Math.max(1, Math.floor(Number(t) || 24)), n = Wc(r);
    try {
      if (typeof u != "string" || !u)
        return In(n);
      let a = `${u}:${r}`, o = Date.now(), s = at.get(a);
      if (s && o - s.at < ps)
        return s.data;
      let { mod: i } = await ls(e);
      if (!i || typeof i.queryStats != "function")
        return In(n);
      let l = await i.queryStats(e, u, r), c = Xc(l, n);
      if (at.size >= Yc) {
        let d = at.keys().next().value;
        d && at.delete(d);
      }
      return at.set(a, { at: o, data: c }), c;
    } catch {
      return In(n);
    }
  }
  var ps = 3e4;
  var Yc = 20;
  var at = /* @__PURE__ */ new Map();
  var sr = { at: 0, key: "", data: null };
  async function fs(e) {
    let u = await L(e);
    if (!u?.statsEnabled || u?.statsDriver === "none")
      return x({ enabled: false, message: "\u7EDF\u8BA1\u529F\u80FD\u672A\u5F00\u542F\uFF0C\u53EF\u5728\u300C\u7CFB\u7EDF\u8BBE\u7F6E\u300D\u4E2D\u542F\u7528", requests: 0, hitRate: 0, bytes: 0, statusDist: {}, topHosts: [] });
    let { sites: t } = await Ze(e), r = await cs(e, t.map((n) => n.host), 24);
    return x({ enabled: true, siteCount: t.length, ...r });
  }
  async function Fs(e, u) {
    let t = Jc(e.url.searchParams.get("hours"), 1, 168, 24), r = await ds(e, u.toLowerCase(), t);
    return x({ host: u, hours: t, ...r });
  }
  async function gs(e) {
    let u = await On(e);
    return x({ driver: u.driver, d1Available: u.d1Available, d1FallbackCount: u.d1FallbackCount, pending: u.pending, lastFlushAt: u.lastFlushAt, pendingHosts: u.hosts.length });
  }
  function Jc(e, u, t, r) {
    let n = parseInt(e, 10);
    return Number.isFinite(n) ? Math.min(t, Math.max(u, n)) : r;
  }
  X();
  U();
  Oe();
  U();
  async function hs(e, u) {
    let t = u || await L(e), r = J(e);
    return x({ version: me, platform: e.caps.platform, caps: e.caps, kvBackend: r ? "baked" : e.caps.kvBackend || "none", redisConfigured: !!(e.env && (e.env.REDIS_URL || e.env.REDIS_URL_KV)), bakedMode: r, configMode: r ? "baked" : e.caps.kvBackend === "none" ? "defaults" : "kv", statsDriver: t?.statsDriver || "none", statsEnabled: !!t?.statsEnabled, cache: es(), limitations: ed(e) });
  }
  async function Zc(e) {
    let [u, t, r, n] = await Promise.all([Ze(e), uu(e), L(e), fe(e)]), { sites: a, truncated: o } = u, s = { ...r };
    return delete s.passwordHash, delete s.passwordSalt, { payload: { version: me, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), global: s, globalRules: n, sites: a, pools: t, ...o ? { incomplete: true, warning: "\u7AD9\u70B9\u6570\u91CF\u8D85\u8FC7\u5355\u6B21\u5BFC\u51FA\u4E0A\u9650\uFF0C\u672C\u6587\u4EF6\u4EC5\u5305\u542B\u90E8\u5206\u7AD9\u70B9\uFF0C\u8BF7\u52FF\u7528\u4E8E\u5B8C\u6574\u6062\u590D" } : {} }, truncated: o };
  }
  async function ms(e) {
    let { payload: u } = await Zc(e);
    return new Response(JSON.stringify(u, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="cdn-edge-gateway-config-${Date.now()}.json"`, "cache-control": "no-store" } });
  }
  async function Nn(e, u, t = {}) {
    let r = t.includeGlobal, n = typeof r == "object" && r !== null, a = r === true || n && !!r.global, o = r === true || n && !!r.globalRules, s = Array.isArray(u.sites) ? u.sites : [], i = Array.isArray(u.pools) ? u.pools : [], l = [], c = { sites: 0, pools: 0, global: false, globalRules: false };
    for (let d of i) {
      let p = hu(d, e.caps);
      if (!p.ok) {
        l.push(`\u6E90\u7AD9 ${d?.id || "(\u672A\u547D\u540D)"}: ${p.errors.join("; ")}`);
        continue;
      }
      try {
        p.value.updatedAt = Date.now(), await eu(e, p.value), c.pools++;
      } catch (f) {
        l.push(`\u6E90\u7AD9 ${p.value.id} \u5199\u5165\u5931\u8D25: ${f.message}`);
      }
    }
    for (let d of s) {
      let p = Ku(d);
      if (!p.ok) {
        l.push(`\u7AD9\u70B9 ${d?.host || "(\u672A\u547D\u540D)"}: ${p.errors.join("; ")}`);
        continue;
      }
      try {
        p.value.updatedAt = Date.now(), await xe(e, p.value), c.sites++;
      } catch (f) {
        l.push(`\u7AD9\u70B9 ${p.value.host} \u5199\u5165\u5931\u8D25: ${f.message}`);
      }
    }
    if (a && u.global && typeof u.global == "object")
      try {
        let d = await L(e), p = { ...u.global, passwordHash: d.passwordHash || "", passwordSalt: d.passwordSalt || "" };
        await He(e, p), c.global = true;
      } catch (d) {
        l.push(`\u5168\u5C40\u914D\u7F6E\u5199\u5165\u5931\u8D25: ${d.message}`);
      }
    if (o && u.globalRules && typeof u.globalRules == "object")
      try {
        let d = await Au(e, u.globalRules.stages);
        d.ok ? c.globalRules = true : l.push(`\u5168\u7AD9\u89C4\u5219: ${(d.errors || []).join("; ")}`);
      } catch (d) {
        l.push(`\u5168\u7AD9\u89C4\u5219\u5199\u5165\u5931\u8D25: ${d.message}`);
      }
    return Te(), { imported: c, errors: l };
  }
  async function Es(e) {
    let u;
    try {
      u = await e.request.json();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    if (!u || typeof u != "object")
      return h(F.BAD_REQUEST, "\u914D\u7F6E\u683C\u5F0F\u4E0D\u6B63\u786E", 400);
    let t = Array.isArray(u.sites) ? u.sites : [], r = Array.isArray(u.pools) ? u.pools : [];
    if (t.length === 0 && r.length === 0)
      return h(F.BAD_REQUEST, "\u914D\u7F6E\u4E2D\u6CA1\u6709\u53EF\u5BFC\u5165\u7684\u7AD9\u70B9\u6216\u6E90\u7AD9", 400);
    let n = "";
    u.version && typeof u.version == "string" ? u.version !== me && (n = `\u5BFC\u51FA\u6587\u4EF6\u7248\u672C\u4E3A ${u.version}\uFF0C\u5F53\u524D\u8282\u70B9\u4E3A ${me}\uFF0C\u7ED3\u6784\u53EF\u80FD\u4E0D\u517C\u5BB9\uFF0C\u90E8\u5206\u5B57\u6BB5\u53EF\u80FD\u672A\u88AB\u5BFC\u5165`) : n = `\u5BFC\u51FA\u6587\u4EF6\u7F3A\u5C11 version \u5B57\u6BB5\uFF0C\u5F53\u524D\u8282\u70B9\u4E3A ${me}\uFF0C\u7ED3\u6784\u53EF\u80FD\u4E0D\u517C\u5BB9\uFF0C\u5EFA\u8BAE\u4ECE\u540C\u7248\u672C\u8282\u70B9\u5BFC\u51FA`;
    let a = u.includeGlobal, { imported: o, errors: s } = await Nn(e, u, { includeGlobal: a });
    return x({ imported: o, errors: s, versionWarning: n, message: s.length > 0 ? `\u90E8\u5206\u5BFC\u5165\u6210\u529F\uFF0C${s.length} \u9879\u5931\u8D25` : "\u5168\u90E8\u5BFC\u5165\u6210\u529F" });
  }
  function ed(e) {
    let u = e.caps, t = [];
    u.hasEdgeCache ? u.cacheIsNodeLocal ? t.push({ key: "edgeCache", message: "EdgeOne \u7684 caches.default \u4EC5\u5F53\u524D\u8FB9\u7F18\u8282\u70B9\u672C\u5730\u6709\u6548\u3001\u4E0D\u8DE8\u8282\u70B9\u590D\u5236\u3002\u547D\u4E2D\u7387\u968F\u8BF7\u6C42\u5206\u6563\u5230\u4E0D\u540C\u8282\u70B9\u800C\u964D\u4F4E\uFF0C\u5FC5\u8981\u65F6\u53EF\u7528\u300C\u540C\u7AD9 fetch \u59D4\u6258\u8282\u70B9\u7F13\u5B58\u300D(\u8DEF\u5F84 A) \u63D0\u5347\u547D\u4E2D\u3002" }) : u.cacheSingleInstance && t.push({ key: "edgeCache", message: "\u963F\u91CC\u4E91 ESA \u63D0\u4F9B\u5168\u5C40 cache \u5355\u5B9E\u4F8B\uFF08\u975E caches.default\uFF09\u3002Cache \u64CD\u4F5C\u4E0E fetch \u5171\u4EAB 32 \u5B50\u8BF7\u6C42\u786C\u4E0A\u9650\uFF0C\u4E14 cache.put \u7684 key \u5FC5\u987B\u4E3A http URL\u3002" }) : t.push({ key: "edgeCache", message: "\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301\u8FB9\u7F18\u7F13\u5B58 API\uFF0C\u7F13\u5B58\u5C06\u5B8C\u5168\u4F9D\u8D56\u5E73\u53F0\u81EA\u8EAB CDN \u4E0E Cache-Control \u54CD\u5E94\u5934" }), u.hasRawIpFetch || t.push({ key: "rawIpFetch", message: "\u5F53\u524D\u5E73\u53F0\u4E0D\u652F\u6301 fetch \u76F4\u8FDE\u88F8 IP / \u81EA\u5B9A\u4E49\u7AEF\u53E3 / \u81EA\u5B9A\u4E49 SNI\uFF08\u5982 EdgeOne\u3001ESA\uFF09\u3002\u56DE\u6E90\u5230\u88F8 IP \u6E90\u7AD9\u987B\u8D70\u5E73\u53F0\u4FA7\u6E90\u7AD9\u7EC4\u515C\u5E95\uFF1B\u81EA\u5B9A\u4E49\u56DE\u6E90 Host \u5934\u4ECD\u53EF\u7528\u3002" }), u.hasD1 || t.push({ key: "d1", message: "\u5F53\u524D\u5E73\u53F0\u672A\u7ED1\u5B9A D1\uFF1A\u7EDF\u8BA1\u843D\u76D8\u53EA\u652F\u6301 D1\uFF0C\u65E0 D1 \u65F6\u7EDF\u8BA1\u529F\u80FD\u4E0D\u53EF\u7528\uFF08\u4E0D\u4F1A\u56DE\u9000 KV \u5199\u5165\uFF09\u3002\u5982\u9700\u7EDF\u8BA1\u8BF7\u7ED1\u5B9A D1\uFF0C\u6216\u5C06 statsDriver \u8BBE\u4E3A none\u3002" }), u.hasKV || t.push({ key: "kv", message: "\u672A\u68C0\u6D4B\u5230 KV \u7ED1\u5B9A\uFF0C\u914D\u7F6E\u5C06\u65E0\u6CD5\u6301\u4E45\u5316\uFF0C\u5F53\u524D\u8FD0\u884C\u5728\u9ED8\u8BA4\u914D\u7F6E\u4E0B\u3002\u8BF7\u5148\u521B\u5EFA\u5E76\u7ED1\u5B9A KV Namespace" }), u.kvBackend === "redis" && t.push({ key: "kvRedis", message: "\u5F53\u524D\u4F7F\u7528\u81EA\u90E8\u7F72 Redis\uFF08Webdis\uFF09\u4F5C\u4E3A KV \u540E\u7AEF\uFF1A\u672A\u4F9D\u8D56\u5E73\u53F0 KV \u7ED1\u5B9A\uFF0C\u914D\u7F6E\u6301\u4E45\u5316\u5728\u60A8\u81EA\u5DF1\u7684 Redis \u5B9E\u4F8B\u4E2D\u3002\u8BF7\u5728\u300C\u7CFB\u7EDF\u4FE1\u606F \u2192 Redis \u5B58\u50A8\u300D\u4E2D\u6D4B\u8BD5\u8FDE\u901A\u6027\u3002" });
    let r = e && e.env || {};
    return typeof r.JWT_SECRET == "string" && r.JWT_SECRET.length >= 8 || t.push({ key: "jwtSecret", message: "\u672A\u914D\u7F6E\u72EC\u7ACB\u7684 JWT_SECRET \u73AF\u5883\u53D8\u91CF\uFF0C\u9274\u6743\u7B7E\u540D\u5BC6\u94A5\u7531 passwordHash \u6D3E\u751F\uFF08\u964D\u7EA7\u65B9\u6848\uFF0C\u5B89\u5168\u6027\u8F83\u5F31\uFF09\u3002\u5F3A\u70C8\u5EFA\u8BAE\u914D\u7F6E JWT_SECRET\u3002" }), t;
  }
  X();
  U();
  Oe();
  async function bs(e) {
    let u = await L(e);
    if (!u)
      return h(F.NOT_FOUND, "\u5168\u5C40\u914D\u7F6E\u4E0D\u5B58\u5728", 404);
    let t = { ...u };
    return delete t.passwordHash, delete t.passwordSalt, x(t);
  }
  async function xs(e) {
    let u;
    try {
      u = await e.request.json();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    let t = await L(e), r = Le(u, e.caps, t || void 0);
    if (!r.ok)
      return h(F.BAD_REQUEST, "\u914D\u7F6E\u6821\u9A8C\u5931\u8D25: " + r.errors.join("; "), 400);
    let n = r.value;
    t && (n.passwordHash = t.passwordHash || "", n.passwordSalt = t.passwordSalt || ""), await He(e, n);
    let a = { ...n };
    return delete a.passwordHash, delete a.passwordSalt, x(a);
  }
  X();
  U();
  Oe();
  re();
  async function As(e) {
    let u = await fe(e);
    return x({ stages: u.stages });
  }
  async function Ds(e) {
    let u;
    try {
      u = await e.request.json();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON", 400);
    }
    if (u === null || typeof u != "object" || Array.isArray(u))
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u5E94\u4E3A { stages: {...} } \u5BF9\u8C61", 400);
    let t = Gu(u, w);
    return t.ok ? (await Au(e, t.value.stages), x({ stages: t.value.stages })) : h(F.BAD_REQUEST, `\u5168\u7AD9\u89C4\u5219\u6821\u9A8C\u5931\u8D25: ${t.errors.join("; ")}`, 400);
  }
  X();
  Et();
  _r();
  async function ys(e) {
    let u = e.env || {};
    if (typeof u.REDIS_URL == "string" && u.REDIS_URL.trim()) {
      let o = await ca(u);
      return x({ backend: "redis-webdis", ...o });
    }
    let t = se(u);
    if (!t)
      return x({ backend: "none", ok: false, error: "\u672A\u914D\u7F6E\u4EFB\u4F55 KV \u540E\u7AEF\uFF08\u5E73\u53F0 KV \u6216 REDIS_URL\uFF09" });
    let r = `__ping__:${Math.random().toString(36).slice(2)}`, n = `pong-${Date.now()}`, a = Date.now();
    try {
      await t.put(r, n, { expirationTtl: 120 });
      let o = await t.get(r, "text");
      await t.delete(r);
      let s = o === n;
      return x({ backend: "native", ok: s, latencyMs: Date.now() - a, error: s ? void 0 : "\u8BFB\u5199\u56DE\u73AF\u4E0D\u4E00\u81F4" });
    } catch (o) {
      return x({ backend: "native", ok: false, latencyMs: Date.now() - a, error: o && o.message ? o.message : String(o) });
    }
  }
  async function Cs(e, u) {
    let t = se(e.env);
    if (!t)
      return h(F.STORAGE_UNAVAILABLE || "STORAGE_UNAVAILABLE", "\u672A\u914D\u7F6E KV \u540E\u7AEF", 503);
    let r = await t.get(u, "text");
    return r == null ? h(F.NOT_FOUND || "NOT_FOUND", "\u952E\u4E0D\u5B58\u5728", 404) : new Response(r, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  async function vs(e, u) {
    let t = se(e.env);
    if (!t)
      return h(F.STORAGE_UNAVAILABLE || "STORAGE_UNAVAILABLE", "\u672A\u914D\u7F6E KV \u540E\u7AEF", 503);
    let r;
    try {
      r = await e.request.text();
    } catch {
      return h(F.BAD_REQUEST, "\u8BF7\u6C42\u4F53\u8BFB\u53D6\u5931\u8D25", 400);
    }
    r == null && (r = "");
    let n = new URL(e.request.url).searchParams.get("ttl"), a = Number(n), o = Number.isFinite(a) && a > 0 ? { expirationTtl: a } : void 0;
    try {
      await t.put(u, r, o);
    } catch (s) {
      return h(F.INTERNAL, `\u5199\u5165\u5931\u8D25: ${s && s.message ? s.message : s}`, 500);
    }
    return x({ key: u, ttl: o ? o.expirationTtl : null });
  }
  async function Bs(e, u) {
    let t = se(e.env);
    if (!t)
      return h(F.STORAGE_UNAVAILABLE || "STORAGE_UNAVAILABLE", "\u672A\u914D\u7F6E KV \u540E\u7AEF", 503);
    try {
      await t.delete(u);
    } catch (r) {
      return h(F.INTERNAL, `\u5220\u9664\u5931\u8D25: ${r && r.message ? r.message : r}`, 500);
    }
    return x({ key: u, deleted: true });
  }
  async function ws(e) {
    let u = se(e.env);
    if (!u)
      return h(F.STORAGE_UNAVAILABLE || "STORAGE_UNAVAILABLE", "\u672A\u914D\u7F6E KV \u540E\u7AEF", 503);
    let t = new URL(e.request.url).searchParams.get("prefix") || "", r = Math.min(Math.max(Number(new URL(e.request.url).searchParams.get("limit")) || 200, 1), 1e3), n = await u.list({ prefix: t, limit: r });
    return x({ keys: (n.keys || []).map((a) => typeof a == "string" ? a : a.name), complete: n.list_complete });
  }
  X();
  U();
  Dt();
  var ad = 24;
  var ir = "sync-recv";
  async function od(e, u) {
    let t = typeof u.code == "string" ? u.code : "", r = typeof u.password == "string" ? u.password : "", n = await jt(e);
    if (!n || typeof n.code != "string")
      return { ok: false, reason: "closed" };
    let a = _u(t, n.code), o;
    try {
      o = await L(e);
    } catch {
      o = null;
    }
    let s = o && typeof o.passwordHash == "string" ? o.passwordHash : "", i = o && typeof o.passwordSalt == "string" ? o.passwordSalt : "", l = await ut(r, s, i);
    return !a || !l ? { ok: false, reason: "mismatch" } : { ok: true };
  }
  async function ks(e) {
    let u = Yu;
    try {
      let n = await e.request.json();
      n && Number.isFinite(Number(n.ttl)) && Number(n.ttl) > 0 && (u = Number(n.ttl));
    } catch {
    }
    let t = At(ad);
    await gn(e, t, u);
    let r = Date.now() + u * 1e3;
    return x({ code: t, ttlSec: u, expiresAt: r, message: "\u63A5\u6536\u63A5\u53E3\u5DF2\u5F00\u542F\uFF0C\u8BF7\u5C06\u6821\u9A8C\u7801\u63D0\u4F9B\u7ED9\u53D1\u9001\u65B9" });
  }
  async function Ts(e) {
    return await tu(e), x({ closed: true, message: "\u63A5\u6536\u63A5\u53E3\u5DF2\u5173\u95ED" });
  }
  async function Ss(e) {
    let u = await jt(e);
    if (!u || typeof u.expiresAt != "number")
      return x({ open: false });
    let t = u.expiresAt - Date.now();
    return t <= 0 ? x({ open: false }) : x({ open: true, expiresAt: u.expiresAt, remainMs: t });
  }
  async function _s(e) {
    let u = Date.now(), t = yu(e.request), r = await ur(e, `${ir}:${t}`);
    if (!r.allowed)
      return await G(u), h(F.RATE_LIMITED, `\u5C1D\u8BD5\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7 ${r.retryAfter}s \u540E\u91CD\u8BD5`, 429, { "Retry-After": String(r.retryAfter) });
    let n;
    try {
      n = await e.request.json();
    } catch {
      return await nu(e, `${ir}:${t}`), await G(u), Xt("\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5\u7684 JSON");
    }
    if (!n || typeof n != "object")
      return await nu(e, `${ir}:${t}`), await G(u), Xt("\u914D\u7F6E\u683C\u5F0F\u4E0D\u6B63\u786E");
    if (!(await od(e, n)).ok)
      return await nu(e, `${ir}:${t}`), await G(u), Xt("\u6821\u9A8C\u5931\u8D25");
    let o = n.payload;
    if (!o || typeof o != "object" || !Array.isArray(o.sites) && !Array.isArray(o.pools))
      return await tu(e), await G(u), h(F.BAD_REQUEST, "\u914D\u7F6E\u955C\u50CF\u4E2D\u6CA1\u6709\u53EF\u5BFC\u5165\u7684\u7AD9\u70B9\u6216\u6E90\u7AD9", 400);
    try {
      let { imported: s, errors: i } = await Nn(e, o, { includeGlobal: true });
      return await tu(e), await G(u), x({ imported: s, errors: i, closed: true, message: i.length > 0 ? `\u540C\u6B65\u5B8C\u6210\uFF0C${i.length} \u9879\u5931\u8D25\uFF0C\u63A5\u6536\u63A5\u53E3\u5DF2\u81EA\u52A8\u5173\u95ED` : "\u540C\u6B65\u6210\u529F\uFF0C\u63A5\u6536\u63A5\u53E3\u5DF2\u81EA\u52A8\u5173\u95ED" });
    } catch {
      return await tu(e), await G(u), h(F.INTERNAL, "\u540C\u6B65\u5199\u5165\u5931\u8D25", 500);
    }
  }
  var id = Object.freeze([{ method: "POST", path: "/auth/login", auth: false, handler: (e, u) => Co(e, u) }, { method: "POST", path: "/auth/logout", auth: true, handler: (e) => vo(e) }, { method: "GET", path: "/auth/me", auth: false, handler: async (e) => {
    let u = await bn(e);
    return x({ authed: !!(u && u.sub) });
  } }, { method: "POST", path: "/auth/password", handler: (e, u) => Bo(e, u) }, { method: "GET", path: "/sites", handler: (e) => No(e) }, { method: "GET", path: "/sites/templates", handler: () => Ho() }, { method: "GET", path: /^\/sites\/([^/]+)$/, paramName: "host", handler: (e, u, t) => $o(e, t) }, { method: "PUT", path: /^\/sites\/(.+)\/basics$/, paramName: "host", handler: (e, u, t) => Po(e, t) }, { method: "PUT", path: /^\/sites\/(.+)\/rules$/, paramName: "host", handler: (e, u, t) => zo(e, t) }, { method: "PUT", path: /^\/sites\/(.+)\/security$/, paramName: "host", handler: (e, u, t) => qo(e, t) }, { method: "PUT", path: /^\/sites\/([^/]+)$/, paramName: "host", handler: (e, u, t) => Mo(e, t) }, { method: "DELETE", path: /^\/sites\/([^/]+)$/, paramName: "host", handler: (e, u, t) => Uo(e, t) }, { method: "GET", path: "/pools", handler: (e) => jo(e) }, { method: "POST", path: "/pools", handler: (e) => Vo(e) }, { method: "GET", path: /^\/pools\/([^/]+)\/refs$/, paramName: "pool id", handler: (e, u, t) => Go(e, t) }, { method: "GET", path: /^\/pools\/([^/]+)$/, paramName: "pool id", handler: (e, u, t) => Ko(e, t) }, { method: "PUT", path: /^\/pools\/([^/]+)$/, paramName: "pool id", handler: (e, u, t) => Xo(e, t) }, { method: "DELETE", path: /^\/pools\/([^/]+)$/, paramName: "pool id", handler: (e, u, t) => Yo(e, t) }, { method: "GET", path: "/rules/global", handler: (e) => As(e) }, { method: "PUT", path: "/rules/global", handler: (e) => Ds(e) }, { method: "POST", path: "/cache/purge", handler: (e) => ts(e) }, { method: "GET", path: "/stats/overview", handler: (e) => fs(e) }, { method: "GET", path: /^\/stats\/host\/(.+)$/, paramName: "host", handler: (e, u, t) => Fs(e, t) }, { method: "GET", path: "/stats/status", handler: (e) => gs(e) }, { method: "GET", path: "/system/info", handler: (e, u) => hs(e, u) }, { method: "GET", path: "/system/export", handler: (e) => ms(e) }, { method: "POST", path: "/system/import", handler: (e) => Es(e) }, { method: "POST", path: "/system/sync/open", auth: true, handler: (e) => ks(e) }, { method: "POST", path: "/system/sync/close", auth: true, handler: (e) => Ts(e) }, { method: "GET", path: "/system/sync/status", auth: true, handler: (e) => Ss(e) }, { method: "POST", path: "/system/sync/receive", auth: false, csrfExempt: true, handler: (e) => _s(e) }, { method: "GET", path: "/config/global", handler: (e) => bs(e) }, { method: "PUT", path: "/config/global", handler: (e) => xs(e) }, { method: "GET", path: "/kv/ping", handler: (e) => ys(e) }, { method: "GET", path: "/kv", handler: (e) => ws(e) }, { method: "GET", path: /^\/kv\/([^/]+)$/, paramName: "key", handler: (e, u, t) => Cs(e, t) }, { method: "PUT", path: /^\/kv\/([^/]+)$/, paramName: "key", handler: (e, u, t) => vs(e, t) }, { method: "DELETE", path: /^\/kv\/([^/]+)$/, paramName: "key", handler: (e, u, t) => Bs(e, t) }]);
  async function Rs(e, u, t) {
    let r = e.request.method.toUpperCase(), n = e.reqId;
    if (e.mgmt = true, r === "OPTIONS")
      return new Response(null, { status: 204, headers: fd() });
    let a = u.replace(/\/+$/, "") || "/";
    try {
      let o = ld(r, a);
      if (!o)
        throw new Kt(`\u63A5\u53E3\u4E0D\u5B58\u5728: ${r} ${a}`);
      if (o.route.auth !== false && !await cd(e))
        throw new Du("\u672A\u767B\u5F55\u6216\u767B\u5F55\u5DF2\u8FC7\u671F");
      let s;
      if (o.raw !== void 0 && (s = pd(o.raw), !s))
        throw new Gt(`\u975E\u6CD5\u7684 ${o.route.paramName || "\u8DEF\u5F84"} \u53C2\u6570`);
      return (/* @__PURE__ */ new Set(["POST", "PUT", "DELETE", "PATCH"])).has(r) && (o.route.csrfExempt || await dd(e)), await o.route.handler(e, t, s);
    } catch (o) {
      return (!o || o.expose !== true) && console.error(`[api] error reqId=${n} ${r} ${a}: ${et(o?.message)}`, o?.stack), Fo(o, { reqId: n });
    }
  }
  function ld(e, u) {
    for (let t of id) {
      if (t.method !== e)
        continue;
      if (typeof t.path == "string") {
        if (t.path === u)
          return { route: t };
        continue;
      }
      let r = u.match(t.path);
      if (r)
        return { route: t, raw: r[1] };
    }
    return null;
  }
  async function cd(e) {
    try {
      let u = await bn(e);
      return !!(u && u.sub);
    } catch {
      return false;
    }
  }
  async function dd(e) {
    let u = e.request.headers.get("origin");
    if (!u)
      return;
    let t;
    try {
      t = new URL(u).host;
    } catch {
      throw new Du("\u975E\u6CD5\u7684 Origin \u5934");
    }
    let r = (() => {
      try {
        return new URL(e.request.url).host;
      } catch {
        return null;
      }
    })();
    if (r && t !== r)
      throw new Du("\u8DE8\u7AD9\u8BF7\u6C42\u88AB\u62D2\u7EDD\uFF08CSRF \u9632\u62A4\uFF09");
  }
  function pd(e) {
    if (typeof e != "string" || e === "")
      return "";
    let u;
    try {
      u = decodeURIComponent(e).trim();
    } catch {
      return "";
    }
    return !u || u.includes("%") || u.includes("/") || u.includes("\\") || u.includes("..") || /[\x00-\x1f\x7f]/.test(u) || u.length > 255 ? "" : u;
  }
  function fd() {
    return { "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-allow-headers": "content-type,authorization", "access-control-max-age": "86400" };
  }
  async function Os(e, u, t) {
    let r = (t || "__panel").replace(/^\/+|\/+$/g, "") || "__panel", n = new URL(u.url), a = n.pathname, o = `/${r}`;
    if (a !== o && a !== o + "/" && !a.startsWith(o + "/"))
      return null;
    if (a.startsWith(o + "/assets/")) {
      let s = a.slice((o + "/assets/").length);
      if (s !== "app.css" && s !== "app.js")
        return null;
      let i = s.endsWith(".css"), l = e?.env?.ASSETS;
      if (l?.fetch)
        try {
          let c = new Request(n.origin + "/assets/" + s, u), d = await l.fetch(c);
          if (d && d.status < 400) {
            let p = new Headers(d.headers);
            return p.set("cache-control", "public, max-age=86400, immutable"), p.set("x-content-type-options", "nosniff"), new Response(d.body, { status: d.status, headers: p });
          }
        } catch {
        }
      if (e?.caps?.platform === "eo")
        try {
          let c = await fetch(new Request(n.origin + "/assets/" + s, { method: u.method, headers: u.headers, redirect: "follow" }));
          if (c && c.status < 400) {
            let d = new Headers(c.headers);
            return d.set("cache-control", "public, max-age=86400, immutable"), d.set("x-content-type-options", "nosniff"), new Response(c.body, { status: c.status, headers: d });
          }
        } catch {
        }
      if (!i)
        return null;
      try {
        let c = await Promise.resolve().then(() => (Mn(), $n));
        if (typeof c.UI_CSS == "string" && c.UI_CSS)
          return new Response(c.UI_CSS, { status: 200, headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=86400, immutable", "x-content-type-options": "nosniff" } });
      } catch {
      }
      return null;
    }
    return a === o || a === o + "/" ? Un(e, r) : null;
  }
  async function Un(e, u) {
    let t;
    try {
      let i = await Promise.resolve().then(() => (Mn(), $n));
      typeof i.UI_HTML == "string" && i.UI_HTML && (t = i.UI_HTML);
    } catch {
      t = Ls;
    }
    t || (t = Ls);
    let r = e?.env?.ASSETS, n = e?.caps?.platform === "eo";
    if (n || r && typeof r.fetch == "function") {
      let i = n ? "/assets" : "/" + u + "/assets";
      t = t.replace(/<style[\s\S]*?<\/style>/i, () => `<link rel="stylesheet" href="${i}/app.css">`), t = t.replace(/<script[\s\S]*?<\/script>/i, () => `<script src="${i}/app.js"><\/script>`);
    }
    let o = (i) => JSON.stringify(i).replace(/</g, "\\u003c"), s = t.replace("</head>", `<script>window.__BASE__=${o("/" + u)};window.__PLATFORM__=${o(e.caps.platform)};<\/script></head>`);
    return new Response(s, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate", "x-frame-options": "DENY", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
  }
  var Ls = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EdgeCDN \u7BA1\u7406\u9762</title>
<style>
body{background:#0f1115;color:#e6e6e6;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{max-width:520px;padding:32px;background:#171a21;border:1px solid #262b36;border-radius:12px}
h1{margin:0 0 12px;font-size:18px}code{background:#0b0d11;padding:2px 6px;border-radius:4px}
</style></head><body><div class="box">
<h1>\u7BA1\u7406\u9762\u5C1A\u672A\u6784\u5EFA</h1>
<p>\u8BF7\u5728\u9879\u76EE\u6839\u76EE\u5F55\u6267\u884C <code>npm install &amp;&amp; npm run build</code> \u751F\u6210\u524D\u7AEF\u8D44\u6E90\u540E\u91CD\u65B0\u90E8\u7F72\u3002</p>
</div></body></html>`;
  vt();
  vt();
  cu();
  Jr();
  var Is = 8192;
  function ot(e, u) {
    let t = e && e.type && e.type !== "none" ? e : null, r = u && u.type && u.type !== "none" ? u : null;
    return r || t || { type: "none", value: "", regexFrom: "", regexTo: "" };
  }
  function Bu(e, u) {
    let t = { ...e?.set || {}, ...u?.set || {} }, r = [...Array.isArray(e?.strip) ? e.strip : [], ...Array.isArray(u?.strip) ? u.strip : []];
    return { set: t, strip: r };
  }
  function Hs(e, u) {
    let t = { ...e?.set || {}, ...u?.set || {} }, r = Array.isArray(u?.strip) ? u.strip : [];
    for (let a of r)
      a && a.type === "exact" && Object.prototype.hasOwnProperty.call(t, a.value) && delete t[a.value];
    let n = [...Array.isArray(e?.strip) ? e.strip : [], ...r];
    return { set: t, strip: n };
  }
  function hd(e, u, t) {
    let r = u?.type || "none", n = e || "/";
    switch (r) {
      case "prefix": {
        let a = u.value || "";
        n = Ns(a, n);
        break;
      }
      case "strip": {
        let a = u.value || "";
        a && n.startsWith(a) && (n = n.slice(a.length));
        break;
      }
      case "regex": {
        try {
          let a = new RegExp(u.regexFrom || "", "g"), o = ye(u.regexTo ?? "", t, { label: "rewrite.regexTo", maxLen: Is }), s;
          u.glob ? s = n.replace(a, (...i) => {
            let l = i[0], c = i.slice(1, -2);
            return o.replace(/\$(\d)\b/g, (d, p) => {
              let f = Number(p);
              return f === 0 ? c[0] ?? "" : f === 1 ? l : c[f - 1] ?? "";
            });
          }) : s = n.replace(a, o), n = s.length > Is ? n : s;
        } catch {
          n = e;
        }
        break;
      }
      default:
        break;
    }
    return md(n);
  }
  function st(e, u, t, r) {
    let n = hd(e.url.pathname, t?.action?.rewrite, e), a = u.pathPrefix ? Ns(u.pathPrefix, n) : n, o = u.scheme || "https", s = u.addr, i = !u.port || o === "https" && Number(u.port) === 443 || o === "http" && Number(u.port) === 80, l, c = u.port;
    if (u.engine === "r2")
      l = s || e.url.hostname;
    else {
      if (l = s, r && r.mode === "custom" && r.custom) {
        let g = ye(String(r.custom), e, { label: "hostHeader.custom", maxLen: 253 }), [m, A] = g.split(":");
        l = m, A && (c = Number(A));
      } else
        r && (r.mode === "client" || r.mode === "accel") && (l = e.url.hostname);
      l || (u.engine === "cnb" || u.engine === "github" ? l = St(u.engine, !!u.repoPrivate) : l = e.url.hostname);
    }
    let d = l.includes(":") && !/^\[.*\]$/.test(l) ? `[${l}]` : l, p = i ? d : `${d}:${c}`, f = new URL(`${o}://${p}`);
    return f.pathname = a, f.search = e.url.search, f;
  }
  function Ns(e, u) {
    let t = (e || "").replace(/\/+$/, ""), r = (u || "").replace(/^\/+/, "");
    return t ? r ? `${t}/${r}` : t || "/" : `/${r}`;
  }
  function md(e) {
    let u = e || "/";
    return u.startsWith("/") || (u = `/${u}`), u = u.replace(/\/{2,}/g, "/"), u;
  }
  function it(e, u, t) {
    let r = e || {};
    if (r.mode && r.mode !== "inherit")
      return { mode: r.mode, custom: r.custom || "" };
    let n = u || {};
    if (n.mode && n.mode !== "inherit")
      return { mode: n.mode, custom: n.custom || "" };
    let a = t || {};
    return { mode: a.mode || "accel", custom: a.custom || "" };
  }
  re();
  ju();
  function Pn(e, u, t) {
    t !== void 0 && (e.origin = t);
    let r = e.__globalStages || {}, n = {};
    e.debug.ruleSource = e.debug.ruleSource || {};
    for (let o of We) {
      let s = Ta(u, o, e);
      if (s && s.action) {
        let i = k(r[o] || {});
        for (let l of Object.keys(s.action)) {
          let c = s.action[l];
          if (!(!c || typeof c != "object"))
            if (o === "reqHeaders" || o === "respHeaders") {
              let d = Hs(i, c);
              i.set = d.set, i.strip = d.strip, c.forwardWhitelist !== void 0 && (i.forwardWhitelist = c.forwardWhitelist);
            } else
              for (let d of Object.keys(c))
                i[d] = k(c[d]);
        }
        e.debug.ruleSource[o] = "site", n[o] = i;
      } else
        e.debug.ruleSource[o] = "global", n[o] = r[o] || {};
    }
    let a = n.cache || {};
    return e.effCacheTtl = { edgeTtl: Number(a.edgeTtl) || 0, browserTtl: Number(a.browserTtl) || 0, staleWhileRevalidate: Number(a.staleWhileRevalidate) || 0, statusTtl: a.statusTtl != null ? a.statusTtl : 0 }, n;
  }
  function $s(e, u, t) {
    return { action: Pn(e, u, t), _source: e.debug.ruleId ? "site" : "global" };
  }
  U();
  re();
  Mu();
  cu();
  Ct();
  var Ed = Object.freeze({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic", heif: "image/heif", html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "application/javascript; charset=utf-8", mjs: "application/javascript; charset=utf-8", json: "application/json; charset=utf-8", xml: "application/xml; charset=utf-8", txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8", csv: "text/csv; charset=utf-8", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", flac: "audio/flac", aac: "audio/aac", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", avi: "video/x-msvideo", mkv: "video/x-matroska", m4a: "audio/mp4", m4v: "video/mp4", pdf: "application/pdf", zip: "application/zip", "7z": "application/x-7z-compressed", gz: "application/gzip", tar: "application/x-tar", rar: "application/vnd.rar", wasm: "application/wasm" });
  var bd = /* @__PURE__ */ new Set(["text/plain", "application/octet-stream", "application/json", "application/xml", "text/xml"]);
  function xd(e) {
    if (!e || !e.trim())
      return true;
    let u = e.trim().toLowerCase().split(";")[0].trim();
    return !!(!u || bd.has(u) || u.startsWith("text/") && !/^text\/(html|css|markdown|csv)$/.test(u));
  }
  function Ad(e) {
    if (!e)
      return null;
    let u = e.split("?")[0].split("#")[0];
    if (!u)
      return null;
    let t = u.split("/").pop();
    if (!t)
      return null;
    let r = t.lastIndexOf(".");
    return r <= 0 || r === t.length - 1 ? null : t.slice(r + 1).toLowerCase() || null;
  }
  function Dd(e) {
    let u = Ad(e);
    return u && Ed[u] || null;
  }
  function Ms(e, u) {
    let t = e || null;
    if (!xd(e))
      return { changed: false, contentType: t };
    let r = Dd(u);
    return r ? { changed: true, contentType: r } : { changed: false, contentType: t };
  }
  async function yd(e, u) {
    let t = e && e.__globalStages;
    if (!t) {
      try {
        let n = await fe(e);
        t = n && n.stages || {};
      } catch {
        t = {};
      }
      e && (e.__globalStages = t);
    }
    let r = t[u];
    return r && typeof r == "object" ? r : w[u] || {};
  }
  async function zn(e, u, t, r, n) {
    let a = await yd(e, "reqHeaders"), o = t && Array.isArray(t.forwardWhitelist) ? t.forwardWhitelist : a.forwardWhitelist, s = new Set((o || []).map((c) => String(c).toLowerCase())), i = new Headers();
    for (let [c, d] of e.request.headers)
      s.has(c.toLowerCase()) && i.set(c, d);
    let l = u?.extraHeaders || {};
    for (let [c, d] of Object.entries(l)) {
      let p = Ps(d, r);
      if (p === null) {
        qn(e, `missing-secret:${c}`);
        continue;
      }
      i.set(c, p);
    }
    if (cr(i, t, e, r), n?.enabled) {
      let c = lu(e.request.headers);
      c && i.set(n.name || ce.name, c);
    }
    return i;
  }
  async function lr(e, u, t, r) {
    let n = new Headers(u.headers);
    cr(n, r, e, null);
    try {
      let a = e && e.__globalStages && e.__globalStages.fixContentType || w.fixContentType;
      if (a && a.enabled !== false) {
        let o = n.get("content-type"), s = e && e.request && e.request.url || "", i = Ms(o, s);
        i.changed && i.contentType && (n.set("content-type", i.contentType), qn(e, `fix-content-type:${o || "\u2205"}\u2192${i.contentType}`));
      }
    } catch {
    }
    return n;
  }
  function cr(e, u, t, r) {
    if (u) {
      if (u.set && typeof u.set == "object")
        for (let [n, a] of Object.entries(u.set)) {
          let o = r ? Ps(a, r) : String(a ?? "");
          if (r && o === null) {
            qn(t, `missing-secret:${n}`);
            continue;
          }
          let s = ye(o, t, { label: `header:${n}` });
          s = Ha(s, t), s !== "" && e.set(n, s);
        }
      Array.isArray(u.strip) && u.strip.length && Cd(e, zs(u.strip));
    }
  }
  function Us(e, u) {
    let t = u && u.action && u.action.respHeaders && u.action.respHeaders.set || {}, r = w.respHeaders && w.respHeaders.set || {}, n = (i, l) => {
      let c = t[i] !== void 0 ? t[i] : r[l || i];
      if (!(c == null || c === ""))
        return ye(String(c), e, { label: `brand:${i}` });
    }, a = {}, o = n("server");
    o !== void 0 && (a.Server = o);
    let s = n("via");
    return s !== void 0 && (a.Via = s), a;
  }
  function Ps(e, u) {
    let t = String(e ?? "");
    if (!t.startsWith("@secret:"))
      return t;
    let r = t.slice(8).trim();
    if (!r || !u)
      return null;
    let n = u[r];
    return n == null || n === "" ? null : String(n);
  }
  function zs(e) {
    let u = [], t = /* @__PURE__ */ new Set(), r = [], n = Array.isArray(e) && e.length ? e : w.reqHeaders.strip;
    for (let a of n || []) {
      if (!a)
        continue;
      if (typeof a == "string") {
        t.add(a.toLowerCase());
        continue;
      }
      let o = String(a.type || "exact").toLowerCase(), s = String(a.value || "").toLowerCase();
      if (s)
        if (o === "prefix")
          u.push(s);
        else if (o === "regex")
          try {
            r.push(new RegExp(s));
          } catch {
          }
        else
          t.add(s);
    }
    return { prefixes: u, exact: t, regexes: r };
  }
  function Cd(e, u) {
    let { prefixes: t, exact: r, regexes: n } = u || zs(null), a = [];
    for (let o of e.keys()) {
      let s = o.toLowerCase();
      (r.has(s) || t.some((i) => s.startsWith(i)) || n.some((i) => i.test(s))) && a.push(o);
    }
    for (let o of a)
      e.delete(o);
  }
  function qn(e, u) {
    !e || !e.debug || (Array.isArray(e.debug.notes) || (e.debug.notes = []), e.debug.notes.push(u));
  }
  function vd(e) {
    let u = {};
    for (let t of String(e).split(";")) {
      let r = t.indexOf("=");
      if (r < 0)
        continue;
      let n = t.slice(0, r).trim();
      n && (u[n] = t.slice(r + 1).trim());
    }
    return u;
  }
  function qs(e, u, t, r) {
    let n = new URL(String(t));
    if (u?.ignoreQuery)
      n.search = "";
    else {
      let s = Array.isArray(u?.queryWhitelist) ? u.queryWhitelist : [];
      if (s.length === 0 && n.search === "")
        n.search = "";
      else {
        let i = n.searchParams, l = [];
        for (let [d, p] of i)
          (s.length === 0 || s.includes(d)) && l.push([d, p]);
        l.sort((d, p) => d[0] === p[0] ? d[1] < p[1] ? -1 : 1 : d[0] < p[0] ? -1 : 1);
        let c = new URLSearchParams();
        for (let [d, p] of l)
          c.append(d, p);
        n.search = c.toString();
      }
    }
    n.searchParams.set("__h", e.url.hostname.toLowerCase());
    let a = u?.key;
    if (a) {
      if (a.includeScheme && n.searchParams.set("__s", e.url.protocol.replace(":", "")), Array.isArray(a.headers) && a.headers.length) {
        let s = [];
        for (let i of [...a.headers].sort()) {
          let l = e.request.headers.get(i);
          l !== null && s.push(`${i}=${l}`);
        }
        s.length && n.searchParams.set("__hd", s.join("&"));
      }
      if (Array.isArray(a.cookies) && a.cookies.length) {
        let s = vd(e.request.headers.get("cookie") || ""), i = [];
        for (let l of [...a.cookies].sort())
          l in s && i.push(`${l}=${s[l]}`);
        i.length && n.searchParams.set("__ck", i.join("&"));
      }
      a.ignoreCase && (n.pathname = n.pathname.toLowerCase(), n.search = n.search.toLowerCase());
    }
    let o = Number(r?.cacheGen) || 0;
    return o > 0 && n.searchParams.set("__gen", String(o)), new Request(n.toString(), { method: "GET" });
  }
  function js(e, u) {
    return !!(!u?.enabled || u.mode === "noCache" || (e.request.method || "GET").toUpperCase() !== "GET" || e.request.headers.has("range") || e.request.headers.has("authorization"));
  }
  U();
  re();
  var Bd = `<!DOCTYPE html>
<!--[if lt IE 7]><html class="no-js ie6 oldie" lang="en-US"><![endif]-->
<!--[if IE 7]><html class="no-js ie7 oldie" lang="en-US"><![endif]-->
<!--[if IE 8]><html class="no-js ie8 oldie" lang="en-US"><![endif]-->
<!--[if gt IE 8]><!-->
<html class="no-js" lang="en-US">
<!--<![endif]-->
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=Edge">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title id="page-title">cloudflare.com | 502: Bad gateway</title>
    <link rel="stylesheet" href="https://cloudflare.com/cdn-cgi/styles/main.css">

    <script>
        /* ==========  \u914D\u7F6E\u533A\uFF1A\u540E\u7EED\u53EA\u6539\u8FD9\u91CC ========== */
        const rayIdList = [
            '1145141919810CnM',
            '114514gDx1919810',
            '1145141919810Gjb',
            'Qnm1145141919810',
            '19210711949101CN',
            '20200928-GenShin',
            'CnmJBdlGgJBdXQnm'
        ];

        // \u5927\u533A \u2192 \u5C0F\u533A\uFF08\u6570\u7EC4\u4E3A\u7A7A\u65F6\u4EE3\u8868\u53EA\u6709\u5927\u533A\u672C\u8EAB\uFF09
        const regionMap = {
            Mondstadt: [
                'Knights of Favonius',
                'Mondstadt City',
                'Stormbearer Mountains',
                'Windrise'
            ],
            Liyue: [
                'Liyue Harbor',
                'Jueyun Karst',
                'The Chasm',
                'Guyun Stone Forest'
            ],
            Inazuma: [
                'Ritou',
                'Kamisato Estate',
                'Tenshukaku',
                'Narukami Island'
            ],
            Sumeru: [
                'Sumeru City',
                'Avidya Forest',
                'Desert of Hadramaveth',
                'Port Ormos'
            ],
            Fontaine: [
                'Court of Fontaine',
                'Erinnyes Forest',
                'Liffey Region',
                'Fortress of Meropide'
            ],
            Natlan: [
                'People of the Springs',
                'Stadium of the Sacred Flame',
                'Tona Canyon',
                'Basalt Mountain'
            ]
        };

        /* ==========  \u903B\u8F91\u533A\uFF1A\u65E0\u9700\u6539\u52A8 ========== */
        function pickRandom(arr) {
            return arr[Math.floor(Math.random() * arr.length)];
        }

        function generateRayId() {
            return pickRandom(rayIdList);
        }

        function generateRegionText() {
            const standaloneChance = 0.20;          // 20% \u4EC5\u5927\u533A
            const majorRegions = Object.keys(regionMap);

            const major = pickRandom(majorRegions);
            if (Math.random() < standaloneChance || regionMap[major].length === 0) {
                return major;
            }
            const detail = pickRandom(regionMap[major]);
            return \`\${major} - \${detail}\`;
        }

        function formatUTCTime() {
            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            return \`\${now.getUTCFullYear()}-\${pad(now.getUTCMonth() + 1)}-\${pad(now.getUTCDate())} \${pad(now.getUTCHours())}:\${pad(now.getUTCMinutes())}:\${pad(now.getUTCSeconds())} UTC\`;
        }

        async function fetchIP() {
            try {
                const res = await fetch('https://cloudflare.com/cdn-cgi/trace');
                const text = await res.text();
                const ip = text.split('
').find(l => l.startsWith('ip='))?.split('=')[1];
                if (ip) document.getElementById('cf-footer-ip').textContent = ip;
            } catch {}
        }

        document.addEventListener('DOMContentLoaded', () => {
            const domain = window.location.hostname;
            document.title = \`\${domain} | 502: Bad gateway\`;
            document.getElementById('cf-host-status-name').textContent = domain;
            document.querySelector('.mt-3').textContent = formatUTCTime();

            document.getElementById('ray-id').textContent = generateRayId();
            document.getElementById('cf-region-name').textContent = generateRegionText();

            fetchIP();
        });
    <\/script>
</head>

<body>
    <div id="cf-wrapper">
        <div id="cf-error-details" class="p-0">
            <header class="mx-auto pt-10 lg:pt-6 lg:px-8 w-240 lg:w-full mb-8">
                <h1 class="inline-block sm:block sm:mb-2 font-light text-60 lg:text-4xl text-black-dark leading-tight mr-2">
                    <span class="inline-block">Bad gateway</span>
                    <span class="code-label">Error code 502</span>
                </h1>
                <div>
                    Visit <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_502" target="_blank" rel="noopener noreferrer">cloudflare.com</a>
                    for more information.
                </div>
                <div class="mt-3">2000-00-00 00:00:00 UTC</div>
            </header>

            <div class="my-8 bg-gradient-gray">
                <div class="w-240 lg:w-full mx-auto">
                    <div class="clearfix md:px-8">
                        <div id="cf-browser-status" class="relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <span class="cf-icon-browser block md:hidden h-20 bg-center bg-no-repeat"></span>
                                <span class="cf-icon-ok w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                            </div>
                            <span class="md:block w-full truncate">You</span>
                            <h3 class="md:inline-block mt-3 md:mt-0 text-2xl text-gray-600 font-light leading-1.3">Browser</h3>
                            <span class="leading-1.3 text-2xl text-green-success">Working</span>
                        </div>

                        <div id="cf-cloudflare-status" class="relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_502" target="_blank" rel="noopener noreferrer">
                                    <span class="cf-icon-cloud block md:hidden h-20 bg-center bg-no-repeat"></span>
                                    <span class="cf-icon-ok w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                                </a>
                            </div>
                            <span class="md:block w-full truncate" id="cf-region-name">Liyue</span>
                            <h3 class="md:inline-block mt-3 md:mt-0 text-2xl text-gray-600 font-light leading-1.3">
                                <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_502" target="_blank" rel="noopener noreferrer">Cloudflare</a>
                            </h3>
                            <span class="leading-1.3 text-2xl text-green-success">Working</span>
                        </div>

                        <div id="cf-host-status" class="cf-error-source relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <span class="cf-icon-server block md:hidden h-20 bg-center bg-no-repeat"></span>
                                <span class="cf-icon-error w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                            </div>
                            <span class="md:block w-full truncate" id="cf-host-status-name">cloudflare.com</span>
                            <h3 class="md:inline-block mt-3 md:mt-0 text-2xl text-gray-600 font-light leading-1.3">Host</h3>
                            <span class="leading-1.3 text-2xl text-red-error">Error</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="w-240 lg:w-full mx-auto mb-8 lg:px-8">
                <div class="clearfix">
                    <div class="w-1/2 md:w-full float-left pr-6 md:pb-10 md:pr-0 leading-relaxed">
                        <h2 class="text-3xl font-normal leading-1.3 mb-4">What happened?</h2>
                        <p>The web server reported a bad gateway error.</p>
                    </div>
                    <div class="w-1/2 md:w-full float-left leading-relaxed">
                        <h2 class="text-3xl font-normal leading-1.3 mb-4">What can I do?</h2>
                        <p class="mb-6">Please try again in a few minutes.</p>
                    </div>
                </div>
            </div>

            <div class="cf-error-footer cf-wrapper w-240 lg:w-full py-10 sm:py-4 sm:px-8 mx-auto text-center sm:text-left border-solid border-0 border-t border-gray-300">
                <p class="text-13">
                    <span class="cf-footer-item sm:block sm:mb-1">
                        Cloudflare Ray ID: <strong class="font-semibold" id="ray-id">1145141919810CnM</strong>
                    </span>
                    <span class="cf-footer-separator sm:hidden">&bull;</span>
                    <span id="cf-footer-item-ip" class="cf-footer-item hidden sm:block sm:mb-1">
                        Your IP: <button type="button" id="cf-footer-ip-reveal" class="cf-footer-ip-reveal-btn">Click to reveal</button>
                                                <span class="hidden" id="cf-footer-ip">1.1.1.1</span>
                        <span class="cf-footer-separator sm:hidden">&bull;</span>
                    </span>
                    <span class="cf-footer-item sm:block sm:mb-1">
                        <span>Performance &amp; security by</span>
                        <a rel="noopener noreferrer" href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_502" id="brand_link" target="_blank">Cloudflare</a>
                    </span>
                </p>
                <script>
                    (function () {
                        var b = document.getElementById("cf-footer-item-ip");
                        var c = document.getElementById("cf-footer-ip-reveal");
                        if (b && "classList" in b) {
                            b.classList.remove("hidden");
                            c.addEventListener("click", function () {
                                c.classList.add("hidden");
                                document.getElementById("cf-footer-ip").classList.remove("hidden");
                            });
                        }
                    })();
                <\/script>
            </div><!-- /.error-footer -->
        </div><!-- /#cf-error-details -->
    </div><!-- /#cf-wrapper -->
</body>
</html>`;
  var ou = null;
  async function dr(e, u) {
    let t = u || pu, r = e.__globalStages || {}, n = r.cache && typeof r.cache == "object" ? r.cache : w.cache, a = n.disguise && typeof n.disguise == "object" ? n.disguise : w.cache.disguise, o = r.reqHeaders && typeof r.reqHeaders == "object" ? r.reqHeaders : w.reqHeaders, s = o.set && (o.set["User-Agent"] || o.set["user-agent"]) || w.reqHeaders.set["User-Agent"];
    try {
      if (t.mode === "none")
        return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
      if (t.mode === "proxy" && t.target) {
        let i = await wd(e, t.target, a, s);
        if (i)
          return i;
      }
      return Gs(t.status, a);
    } catch {
      return Gs(pu.status, a);
    }
  }
  function Gs(e, u) {
    let t = Number.isInteger(e) && e >= 200 && e <= 599 ? e : 200, r = u.cdnMaxAge, n = w.error.disguiseServer;
    return new Response(Bd, { status: t, headers: { "content-type": "text/html; charset=utf-8", "cache-control": `public, max-age=${r}, s-maxage=${r}`, server: n } });
  }
  async function wd(e, u, t, r) {
    let n = t.isolateTtlMs, a = Date.now();
    if (ou && ou.key === u && a - ou.cachedAt < n)
      return new Response(ou.body, { status: ou.status, headers: new Headers(ou.headers) });
    try {
      let o = await fetch(u, { method: "GET", headers: { "user-agent": r, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout ? AbortSignal.timeout(5e3) : void 0 });
      if (!o || !o.ok)
        return null;
      let s = 512 * 1024, i = await o.arrayBuffer();
      if (i.byteLength > s)
        return null;
      let l = new TextDecoder().decode(i), c = o.headers.get("content-type"), d = t.cdnMaxAge, p = w.error.disguiseServer, f = { "content-type": c || "text/html; charset=utf-8", "cache-control": `public, max-age=${d}, s-maxage=${d}`, server: p };
      return ou = { key: u, body: l, status: o.status, headers: f, cachedAt: a }, new Response(l, { status: o.status, headers: new Headers(f) });
    } catch {
      return null;
    }
  }
  re();
  Wu();
  re();
  var Ks = w.security.memMaxEntries;
  function Ws(e) {
    if (!e || typeof e != "object")
      return 128;
    try {
      return Math.max(48, JSON.stringify(e).length + 32);
    } catch {
      return 128;
    }
  }
  function Vs() {
    try {
      let e = Ot("ratelimit");
      if (e > 0) {
        let u = Math.floor(e / Ws(null));
        return Math.max(1, Math.min(Ks, u));
      }
    } catch {
    }
    return Ks;
  }
  function kd(e) {
    try {
      if (ae.size === 0)
        return;
      if (Ys(Xs()), e && ae.size > Vs() * 0.5) {
        let u = ae.size;
        ae.clear(), u > 0 && pe("ratelimit", u);
      } else
        Eu("ratelimit", ae.size);
    } catch {
    }
  }
  mu("ratelimit", { weight: 1, estimateBytes: Ws, evict: kd, allowAggressiveEvict: true });
  var ae = /* @__PURE__ */ new Map();
  var jn = -1;
  function Xs() {
    return Math.floor(Date.now() / 6e4);
  }
  function Ys(e) {
    if (ae.size > Vs()) {
      let t = ae.size;
      ae.clear(), t > 0 && pe("ratelimit", t), jn = e;
      return;
    }
    if (e === jn)
      return;
    jn = e;
    let u = `:${e}`;
    for (let t of ae.keys())
      t.endsWith(u) || (ae.delete(t), pe("ratelimit", 1));
    Za();
  }
  function Td(e) {
    return String(e || "unknown").toLowerCase().replace(/[^a-z0-9.\-*_]/g, "").slice(0, 128) || "unknown";
  }
  function Sd(e) {
    return String(e || "unknown").replace(/[^0-9a-fA-F.:]/g, "").slice(0, 45).toLowerCase() || "unknown";
  }
  async function Js(e, u, t, r) {
    let n = Number(r);
    if (!Number.isFinite(n) || n <= 0)
      return { limited: false, count: 0, rpm: 0, retryAfter: 0 };
    let a = Xs();
    Ys(a);
    let o = Td(u), s = Sd(t), i = `${o}:${s}:${a}`, l = ae.get(i);
    l || (l = { local: 0, tripped: false }, ae.set(i, l), Xe("ratelimit", l)), l.local += 1;
    let c = Math.max(1, 60 - Math.floor(Date.now() % 6e4 / 1e3));
    return l.tripped ? { limited: true, count: n + 1, rpm: n, retryAfter: c } : l.local > n ? (l.tripped = true, { limited: true, count: l.local, rpm: n, retryAfter: c }) : { limited: false, count: l.local, rpm: n, retryAfter: c };
  }
  var pr = { second: 0, count: 0 };
  function Qs(e) {
    let u = Number(e);
    if (!Number.isFinite(u) || u <= 0)
      return { limited: false, retryAfter: 0 };
    let t = Math.floor(Date.now() / 1e3);
    return pr.second !== t ? (pr = { second: t, count: 1 }, { limited: false, retryAfter: 0 }) : (pr.count += 1, pr.count <= u ? { limited: false, retryAfter: 0 } : { limited: true, retryAfter: 1 });
  }
  re();
  function _d(e, u) {
    let t = { ...e || {} };
    for (let r of Object.keys(u || {})) {
      let n = u[r];
      n !== void 0 && (Array.isArray(n) ? n.length > 0 && (t[r] = n) : t[r] = n);
    }
    return t;
  }
  function su(e, u, t = 403) {
    try {
      e && e.debug && (e.debug.blockedBy = u);
    } catch {
    }
    let r = e && e.__globalStages && e.__globalStages.error || w.error, n = r.blockBody || "Forbidden", a = /^\s*(?:<!doctype html|<html)/i.test(n);
    return new Response(n, { status: t, headers: { "Content-Type": a ? "text/html; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": r.blockCacheControl || "no-store" } });
  }
  function Zs(e) {
    let u = String(e).split(".");
    if (u.length !== 4)
      return null;
    let t = 0;
    for (let r of u) {
      if (!/^\d{1,3}$/.test(r))
        return null;
      let n = Number(r);
      if (n > 255)
        return null;
      t = t << 8 | n;
    }
    return t >>> 0;
  }
  function Rd(e, u) {
    let t = String(u || "").trim().toLowerCase(), r = String(e || "").trim().toLowerCase();
    if (!t || !r || r === "unknown")
      return false;
    let n = t.indexOf("/");
    if (n > 0) {
      let a = t.slice(0, n), o = parseInt(t.slice(n + 1), 10);
      if (!Number.isFinite(o) || o < 0 || o > 32)
        return false;
      let s = Zs(a), i = Zs(r);
      if (s === null || i === null)
        return false;
      if (o === 0)
        return true;
      let l = o === 32 ? 4294967295 : 4294967295 << 32 - o >>> 0;
      return (s & l) === (i & l);
    }
    return t.endsWith("*") ? r.startsWith(t.slice(0, -1)) : r === t;
  }
  function ei(e, u) {
    if (!Array.isArray(u) || u.length === 0)
      return false;
    for (let t of u)
      if (Rd(e, t))
        return true;
    return false;
  }
  function ui(e, u) {
    if (!Array.isArray(u) || u.length === 0)
      return false;
    let r = String(e || "").toLowerCase();
    for (let n of u) {
      let a = String(n || "").trim();
      if (a && r.includes(a.toLowerCase()))
        return true;
    }
    return false;
  }
  function Ld(e) {
    try {
      return e ? new URL(e).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  }
  function Od(e, u) {
    let t = String(u || "").trim().toLowerCase();
    if (!t || !e)
      return false;
    if (t === "*")
      return true;
    if (t.includes("://"))
      try {
        t = new URL(t).hostname.toLowerCase();
      } catch {
      }
    if (t = t.replace(/\/.*$/, "").replace(/:\d+$/, ""), t.startsWith("*.")) {
      let r = t.slice(2);
      return r ? e === r || e.endsWith(`.${r}`) : false;
    }
    return e === t;
  }
  function Id(e, u) {
    let t = u.refererMode;
    if (t !== "whitelist" && t !== "blacklist")
      return false;
    let r = e.headers.get("Referer") || "", n = Ld(r);
    if (!n)
      return u.allowEmptyReferer === false;
    let a = Array.isArray(u.refererList) ? u.refererList : [], o = false;
    for (let s of a)
      if (Od(n, s)) {
        o = true;
        break;
      }
    return t === "whitelist" ? a.length === 0 ? false : !o : o;
  }
  async function ti(e, u) {
    try {
      let t = e && e.__globalStages && e.__globalStages.security || w.security, r = u && u.security || {}, n = _d(t, r);
      if (!n || typeof n != "object")
        return null;
      let a = e.request, o = yu(a);
      if (Array.isArray(n.ipWhitelist) && n.ipWhitelist.length > 0 && !ei(o, n.ipWhitelist))
        return su(e, "ip-whitelist");
      if (ei(o, n.ipBlacklist))
        return su(e, "ip-blacklist");
      if (ui(a.headers.get("User-Agent") || "", n.uaBlacklist))
        return su(e, "ua-blacklist");
      let s = n.botManagement;
      if (s && s.enabled === true) {
        let i = a.headers.get("User-Agent") || "", l = ui(i, s.list || []);
        if (s.mode === "allowlist" ? !l : l)
          return su(e, "bot-management");
      }
      if (Id(a, n))
        return su(e, "referer");
      if (n.rateLimit && n.rateLimit.enabled === true) {
        let i = u && u.host || e.url.hostname, l = await Js(e, i, o, n.rateLimit.rpm);
        if (l.limited) {
          let c = su(e, "ratelimit", 429);
          try {
            c.headers.set("Retry-After", String(l.retryAfter));
          } catch {
          }
          return c;
        }
      }
      return null;
    } catch (t) {
      try {
        console.error("[guard] \u5B89\u5168\u68C0\u67E5\u5F02\u5E38\uFF0C\u6309 fail-closed \u62E6\u622A\uFF1A", String(t && t.message || t));
      } catch {
      }
      try {
        return su(e, "guard-error");
      } catch {
        return new Response("Forbidden", { status: 403, headers: { "cache-control": "no-store" } });
      }
    }
  }
  X();
  var fr = /* @__PURE__ */ new Map();
  var Hd = 60 * 1e3;
  var Ue = /* @__PURE__ */ new Map();
  var ri = /* @__PURE__ */ new Map();
  var iu = /* @__PURE__ */ new Map();
  var Nd = 0.3;
  var $d = 2;
  var Md = 60 * 1e3;
  function Gn(e, u) {
    return `${e}:${u}`;
  }
  function ge(e, u) {
    return `${e}:${u}`;
  }
  function ni(e) {
    let u = fr.get(e);
    if (u) {
      if (Date.now() > u.expireAt) {
        fr.delete(e);
        return;
      }
      return u;
    }
  }
  function Ud(e, u) {
    fr.set(e, { count: u, expireAt: Date.now() + Hd });
  }
  function Pd(e) {
    fr.delete(e);
  }
  function Fr(e, u, t) {
    let r = Ue.get(ge(u, t));
    return r === void 0 ? false : Date.now() > r ? (Ue.delete(ge(u, t)), false) : true;
  }
  function ai(e, u) {
    let t = Ue.get(ge(e, u));
    if (t === void 0)
      return 0;
    let r = t - Date.now();
    return r <= 0 ? (Ue.delete(ge(e, u)), 0) : r;
  }
  function oi(e, u, t) {
    !t || t <= 0 || (iu.delete(ge(e, u)), Ue.set(ge(e, u), Date.now() + t * 1e3));
  }
  function si(e, u) {
    return ri.get(ge(e, u)) || 0;
  }
  function Kn(e, u) {
    let t = iu.get(ge(e, u));
    return t ? Date.now() > t.until ? (iu.delete(ge(e, u)), Ue.set(ge(e, u), Date.now() + 1e3), 1) : Nd : 1;
  }
  function zd(e, u) {
    let t = ge(e, u);
    if (ri.set(t, Date.now()), Ue.get(t) !== void 0)
      Ue.delete(t), iu.set(t, { remaining: $d, until: Date.now() + Md });
    else if (iu.has(t)) {
      let n = iu.get(t);
      n.remaining -= 1, n.remaining <= 0 && iu.delete(t);
    }
  }
  async function ii(e, u, t) {
    let r = Gn(u, t), n = ni(r);
    return n === void 0 ? false : n.count >= 3;
  }
  function li(e, u, t) {
    let r = Gn(u, t), n = ni(r) || { count: 0, expireAt: 0 };
    Ud(r, n.count + 1);
  }
  function Wn(e, u, t) {
    Pd(Gn(u, t)), zd(u, t);
  }
  var qd = 128;
  var jd = 6e4;
  var ci = /* @__PURE__ */ new Map();
  var gr = /* @__PURE__ */ new Map();
  var Vn = /* @__PURE__ */ new Map();
  function wu(e, u, t) {
    u.debug || (u.debug = {}), Array.isArray(u.debug.notes) || (u.debug.notes = []);
    let r = new Set(t || []), n = (e?.origins || []).filter((s) => s && s.enabled !== false), a = n.filter((s) => !r.has(s.id) && !Fr(u, e.id, s.id));
    if (a.length > 0)
      return Gd(e, u, a);
    let o = Jd(e, n, r);
    return o ? (Array.isArray(u.debug.notes) || (u.debug.notes = []), u.debug.notes.push(`failopen:${o.id}`), o) : null;
  }
  function Gd(e, u, t) {
    switch (e.strategy) {
      case "roundrobin":
        return hr(e, t, Xn);
      case "random":
        return Kd(t);
      case "weighted":
        return hr(e, t, Xn);
      case "iphash":
        return Wd(e, u, t);
      default:
        return hr(e, t, di);
    }
  }
  function Xn(e, u) {
    return (Number(e.weight) > 0 ? Number(e.weight) : 1) * Kn(u.id, e.id);
  }
  function di(e, u) {
    if (Number(e.weight) > 0)
      return Xn(e, u);
    let t = u.__maxOrder || 0;
    return Math.max(1, t - (Number(e.order) || 0) + 1) * Kn(u.id, e.id);
  }
  function hr(e, u, t) {
    let r = u.map((i) => Math.max(1, t(i, e))), n = r.reduce((i, l) => i + l, 0), a = 0, o = -1 / 0;
    for (let i = 0; i < u.length; i++) {
      let l = `${e.id}:${u[i].id}`, c = (gr.get(l) || 0) + r[i];
      gr.set(l, c), c > o && (o = c, a = i);
    }
    let s = `${e.id}:${u[a].id}`;
    return gr.set(s, gr.get(s) - n), u[a];
  }
  function Kd(e) {
    if (!e.some((a) => Number(a.weight) > 0))
      return e[Math.floor(Math.random() * e.length)];
    let t = [], r = 0;
    for (let a of e) {
      let o = Number(a.weight) > 0 ? Number(a.weight) : 1;
      r += o, t.push(r);
    }
    let n = Math.random() * r;
    for (let a = 0; a < t.length; a++)
      if (n < t[a])
        return e[a];
    return e[e.length - 1];
  }
  function Wd(e, u, t) {
    let r = u?.request?.headers?.get("cf-connecting-ip") || u?.request?.headers?.get("x-real-ip") || "";
    if (!r)
      return hr(e, t, di);
    let n = Qd(r);
    if (n) {
      let d = t.find((p) => p.id === n);
      if (d)
        return d;
    }
    let { ring: a, ids: o } = Xd(e, t), s = fi(r), i = 0, l = a.length;
    for (; i < l; ) {
      let d = i + l >> 1;
      a[d] < s ? i = d + 1 : l = d;
    }
    let c = i % a.length;
    for (let d = 0; d < a.length; d++) {
      let p = (c + d) % a.length, f = o[p], g = t.find((m) => m.id === f);
      if (g)
        return g.id !== Vd(a, o, s) && Zd(r, g.id), g;
    }
    return t[0];
  }
  function Vd(e, u, t) {
    let r = 0, n = e.length;
    for (; r < n; ) {
      let a = r + n >> 1;
      e[a] < t ? r = a + 1 : n = a;
    }
    return u[r % e.length];
  }
  function Xd(e, u) {
    let t = ci.get(e);
    if (t && Yd(t.idSet, u))
      return { ring: t.ring, ids: t.ids };
    let r = [];
    for (let s of u)
      for (let i = 0; i < qd; i++)
        r.push({ h: fi(`${s.id}#${i}`), id: s.id });
    r.sort((s, i) => s.h - i.h);
    let n = new Uint32Array(r.length), a = new Array(r.length);
    for (let s = 0; s < r.length; s++)
      n[s] = r[s].h, a[s] = r[s].id;
    let o = { ring: n, ids: a, idSet: new Set(u.map((s) => s.id)) };
    return ci.set(e, o), o;
  }
  function Yd(e, u) {
    if (!e || e.size !== u.length)
      return false;
    for (let t of u)
      if (!e.has(t.id))
        return false;
    return true;
  }
  function Jd(e, u, t) {
    let r = u.filter((i) => !t.has(i.id)), n = r.length > 0 ? r : u;
    if (n.length === 0)
      return null;
    let a = null, o = -1 / 0, s = 1 / 0;
    for (let i of n) {
      let l = si(e.id, i.id), c = ai(e.id, i.id);
      (l > o || l === o && c < s) && (a = i, o = l, s = c);
    }
    return a;
  }
  function Qd(e) {
    let u = Vn.get(e);
    if (u !== void 0) {
      if (Date.now() > u.until) {
        Vn.delete(e);
        return;
      }
      return u.originId;
    }
  }
  function Zd(e, u) {
    Vn.set(e, { originId: u, until: Date.now() + jd });
  }
  function pi(e) {
    let u = (e?.origins || []).filter((t) => t && t.enabled !== false).map((t) => Number(t.order) || 0);
    e.__maxOrder = u.length ? Math.max(...u) : 0;
  }
  function fi(e) {
    let u = 2166136261;
    for (let t = 0; t < e.length; t++)
      u ^= e.charCodeAt(t), u = u + ((u << 1) + (u << 4) + (u << 7) + (u << 8) + (u << 24)) >>> 0;
    return u >>> 0;
  }
  Mu();
  function l0(e) {
    let u = (typeof e == "string" ? new URL(e).hostname : e.hostname) || "", t = u.startsWith("[") ? u.slice(1, -1) : u;
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(t) || t.includes(":");
  }
  async function Yn(e, u, t, r, n, a) {
    let o = Number(n) > 0 ? Number(n) : 1e4, s = new AbortController(), i = setTimeout(() => s.abort(), o), l = s.signal;
    if (a?.controller && a.controller !== s) {
      let p = a.controller.signal;
      if (typeof AbortSignal.any == "function") {
        let f = AbortSignal.any([s.signal, p]);
        l = f, f.addEventListener("abort", () => clearTimeout(i), { once: true });
      } else {
        let f = () => s.abort();
        p.aborted ? s.abort() : p.addEventListener("abort", f, { once: true });
      }
    }
    if (e.caps && e.caps.platform === "cf" && e.caps.hasSocket && String(t).startsWith("https://") && l0(t)) {
      clearTimeout(i);
      let { rawTcpFetch: p } = await Promise.resolve().then(() => (hi(), gi));
      return p(t, r, o, a, e);
    }
    let c = (e.request.method || "GET").toUpperCase(), d = { method: c, headers: r, signal: l, redirect: a?.followRedirect ? "follow" : "manual" };
    c !== "GET" && c !== "HEAD" && (a?.bodyBuf != null ? d.body = a.bodyBuf : (d.body = e.request.body, d.duplex = "half"));
    try {
      return await fetch(String(t), d);
    } catch (p) {
      throw new Wt(`\u56DE\u6E90\u5931\u8D25 (${String(t)})`, { cause: p, details: { origin: String(t), timeoutMs: o } });
    } finally {
      clearTimeout(i);
    }
  }
  function c0(e, u) {
    let t = e || "/", r = u.r2KeyMode || "none", n = u.r2KeyPrefixRule || "";
    switch (r) {
      case "prefix": {
        n && (t = (n.replace(/\/+$/, "") + "/" + t.replace(/^\/+/, "")).replace(/^\/+/, ""));
        break;
      }
      case "strip": {
        n && t.startsWith(n) && (t = t.slice(n.length));
        break;
      }
      case "regex": {
        try {
          let a = new RegExp(n || "", "g");
          t = t.replace(a, u.r2KeyRegexTo ?? "");
        } catch {
        }
        break;
      }
      default:
        break;
    }
    return t.replace(/^\/+/, "");
  }
  function d0(e, u) {
    let t = (e.r2KeyPrefix || "").replace(/^\/+/, "").replace(/\/+$/, ""), r = c0(u.pathname, e);
    return t ? `${t}/${r}` : r;
  }
  async function mi(e, u, t, r, n) {
    let a = u.r2Binding, o = e.env?.[a];
    if (!o || typeof o.get != "function")
      return new Response(`R2 binding "${a}" \u672A\u7ED1\u5B9A\u6216\u4E0D\u53EF\u7528\uFF08\u4EC5 Cloudflare \u652F\u6301\uFF09`, { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } });
    let s = d0(u, t);
    if (!s)
      return new Response("R2 key \u4E3A\u7A7A\uFF08\u8BF7\u68C0\u67E5\u6E90\u7AD9 r2KeyPrefix / r2KeyMode \u914D\u7F6E\uFF09", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
    let i = e.request.headers.get("if-none-match"), l = i ? { onlyIf: { etagDoesNotMatch: i } } : void 0, c = o.get(s, l), d = await p0(c, n, `R2 get "${s}"`);
    if (!d)
      return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    if (d.body === null) {
      let g = new Headers();
      return d.httpEtag && g.set("etag", d.httpEtag), d.uploaded && g.set("last-modified", new Date(d.uploaded).toUTCString()), new Response(null, { status: 304, headers: g });
    }
    let p = new Headers();
    if (d.writeHttpMetadata(p), !p.has("content-type")) {
      let g = u.r2ContentType || "application/octet-stream";
      p.set("content-type", g);
    }
    d.size != null && p.set("content-length", String(d.size));
    let f = d.customMetadata || {};
    for (let [g, m] of Object.entries(f))
      (g.toLowerCase().startsWith("x-") || g.toLowerCase().startsWith("access-control-")) && p.set(g, m);
    return new Response(d.body, { status: 200, headers: p });
  }
  function p0(e, u, t) {
    return !u || u <= 0 ? e : new Promise((r, n) => {
      let a = setTimeout(() => n(new Error(`${t} \u8D85\u65F6\uFF08${u}ms\uFF09`)), u);
      e.then((o) => {
        clearTimeout(a), r(o);
      }, (o) => {
        clearTimeout(a), n(o);
      });
    });
  }
  var f0 = Object.freeze({ esa: 2e3, cf: 5e3, eo: 5e3 });
  function F0(e, u, t, r) {
    let n = e?.caps || {}, a = Number(n.maxExecutionMs) > 0 ? n.maxExecutionMs : 12e4, o = Number(n.firstByteMs) > 0 ? n.firstByteMs : 1 / 0, s = f0[n.platform] ?? 5e3, i = Math.max(1e3, Math.min(a, o) - s);
    return r > 0 ? Math.min(r, i) : Math.min((t + 1) * u, i);
  }
  function g0(e, u) {
    let t = (e.request.method || "GET").toUpperCase();
    return t === "GET" || t === "HEAD" ? true : u != null;
  }
  async function Ei(e, u, t, r, n = {}) {
    let { site: a = null, preferredOrigin: o = null } = n, s = u?.failover || {}, i = (u?.origins || []).filter((D) => D && D.enabled !== false), c = !(i.length <= 1) && s.enabled !== false, d = Array.isArray(s.retryOn) && s.retryOn.length > 0 ? s.retryOn : [Ce], p = d.includes(Ce) || d.includes("*") || d.includes("all"), f = p ? null : new Set(d), g = (D) => c && (p && Na(D) || f && f.has(D)), m = c ? Number.isFinite(s.maxRetries) ? s.maxRetries : Math.max(i.length - 1, 0) : 0, A = Number(s.timeoutMs) || 0, S = Number(s.penaltySeconds) || 0, I = Number(s.totalTimeoutMs) || 0, v = Number(s.speculativeMs) || 0, _ = Number(s.maxRetryBodyBytes) || 0, H = await m0(e, u, S);
    pi(u), e.debug.tried = e.debug.tried || [];
    let Z = null, ue = null, Ae = m + 1, he = (e.request.method || "GET").toUpperCase(), y = null;
    if (he !== "GET" && he !== "HEAD" && e.request.body && (Number(e.request.headers.get("content-length")) || 0) <= _)
      try {
        y = await e.request.arrayBuffer();
      } catch {
        y = null;
      }
    let P = F0(e, A, m, I), De = Date.now();
    Array.isArray(e.debug.notes) || (e.debug.notes = []), e.debug.notes.push(`budget-cap:${P}`);
    let Pe = c && v > 0 && g0(e, y);
    for (let D = 0; D < Ae; D++) {
      let oe = D === 0 && o && !H.includes(o.id) ? o : wu(u, e, H);
      if (!oe)
        break;
      let qe = bi(e, a, t, oe), je = qe.origin || {}, Qn = je.scheme || oe.scheme || "https", _i = Number(je.port) > 0 ? Number(je.port) : Number(oe.port) > 0 ? Number(oe.port) : Qn === "http" ? 80 : 443, Ri = je.engine || oe.engine || "fetch", V = { ...oe, scheme: Qn, port: _i, engine: Ri };
      H.push(V.id), e.debug.tried.push(V.id), e.debug.retries = D, e.debug.originId = V.id, e.debug.originAddr = `${V.addr}:${V.port || (V.scheme === "http" ? 80 : 443)}`;
      let Li = ot(void 0, qe.rewrite), Oi = Bu(void 0, qe.reqHeaders), Ii = xi(je.clientIpHeader), Zn = Number(je.originTimeoutMs) || 0, br = P - (Date.now() - De), Hi = Zn > 0 ? Zn : A, ea = Math.min(Hi, Math.max(500, br)), ua = je.followRedirect === true, Ni = { action: { rewrite: Li } }, xr = it(qe.hostHeader, V.hostHeader, r), ta = st(e, V, Ni, xr), ra = await zn(e, V, Oi, e.env, Ii);
      if (Pe && D === 0 && br > v) {
        let $ = await h0(e, u, H, V, ta, ra, { timeoutMs: ea, followRedirect: ua, bodyBuf: y, hostHeader: xr, speculativeMs: v, remaining: br, site: a, rule: t, hostHeaderFallback: r, isRetryableStatus: g });
        if ($) {
          if ($.ok)
            return Wn(e, u.id, $.winner.id), $.resp;
          if (mr(e, u, V, S), $.secondary && $.secondaryFailed && (mr(e, u, $.secondary, S), H.includes($.secondary.id) || H.push($.secondary.id)), Z = $.lastResponse, ue = $.lastError, !c)
            break;
          continue;
        }
      }
      try {
        let $ = await Jn(e, V, ta, ra, ea, { followRedirect: ua, bodyBuf: y, hostHeader: xr });
        if (g($.status)) {
          mr(e, u, V, S, $), await $.body?.cancel().catch(() => {
          }), Z = { status: $.status, statusText: $.statusText, headers: new Headers($.headers) }, ue = null;
          continue;
        }
        return Wn(e, u.id, V.id), $;
      } catch ($) {
        if (ue = $, Z = null, mr(e, u, V, S), !c)
          break;
      }
    }
    if (Z)
      return new Response(null, { status: Z.status, statusText: Z.statusText, headers: Z.headers });
    let ze = ue ? ue.message || String(ue) : "no available origin", ct = e.debug.tried.length ? e.debug.tried.join(", ") : "(none)";
    return new Response(`Bad Gateway: all origins failed.
Tried: ${ct}
Last error: ${ze}`, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  function bi(e, u, t, r) {
    if (!u)
      return e.origin = r, t?.action || {};
    try {
      return Pn(e, u, r) || {};
    } catch {
      return e.origin = r, t?.action || {};
    }
  }
  function mr(e, u, t, r, n) {
    oi(u.id, t.id, r), li(e, u.id, t.id), n && n.body && n.body.cancel().catch(() => {
    });
  }
  async function h0(e, u, t, r, n, a, o) {
    let s = wu(u, e, [...t, r.id]);
    if (!s)
      return null;
    let i = new AbortController(), l = false, c = null, d = null, p = Jn(e, r, n, a, o.timeoutMs, { followRedirect: o.followRedirect, bodyBuf: o.bodyBuf, hostHeader: o.hostHeader, controller: i }).then((D) => (l = true, c = D, D), (D) => (l = true, d = D, null)), f = false;
    if (await new Promise((D) => {
      let oe = Date.now(), qe = () => {
        if (l || f || Date.now() - oe >= o.speculativeMs)
          return D();
        setTimeout(qe, 25);
      };
      setTimeout(qe, o.speculativeMs);
    }), l) {
      if (d)
        return i.abort(), { ok: false, winner: void 0, primaryFailed: true, lastError: d };
      let D = typeof o.isRetryableStatus == "function" ? o.isRetryableStatus : () => false;
      if (c && D(c.status)) {
        let oe = Er(c);
        return c.body?.cancel().catch(() => {
        }), { ok: false, primaryFailed: true, lastResponse: oe };
      }
      return { ok: true, winner: r, resp: c, primaryFailed: false };
    }
    f = true, Array.isArray(e.debug.notes) || (e.debug.notes = []), e.debug.notes.push(`speculative:${r.id}->${s.id}`);
    let g = bi(e, o.site, o.rule, s), m = g.origin || {}, A = m.scheme || s.scheme || "https", S = Number(m.port) > 0 ? Number(m.port) : Number(s.port) > 0 ? Number(s.port) : A === "http" ? 80 : 443, I = m.engine || s.engine || "fetch", v = { ...s, scheme: A, port: S, engine: I }, _ = it(g.hostHeader, v.hostHeader, o.hostHeaderFallback), H = st(e, v, { action: { rewrite: ot(void 0, g.rewrite) } }, _), Z = await zn(e, v, Bu(void 0, g.reqHeaders), e.env, xi(m.clientIpHeader)), ue = Jn(e, v, H, Z, o.timeoutMs, { followRedirect: m.followRedirect === true, bodyBuf: o.bodyBuf, hostHeader: _ }).then((D) => ({ ok: true, resp: D }), (D) => ({ ok: false, err: D })), Ae = typeof o.isRetryableStatus == "function" ? o.isRetryableStatus : () => false, he = null, y = null, P = await Promise.race([p.then((D) => D ? Ae(D.status) ? (he = Er(D), D.body?.cancel().catch(() => {
    }), null) : { lane: "primary", resp: D } : null).catch(() => null), ue.then((D) => !D.ok || !D.resp ? null : Ae(D.resp.status) ? (y = Er(D.resp), D.resp.body?.cancel().catch(() => {
    }), null) : { lane: "secondary", resp: D.resp }).catch(() => null)]);
    if (P && P.resp) {
      P.lane === "secondary" && i.abort();
      let D = P.lane === "primary" ? r : v;
      return e.debug.originId = D.id, e.debug.originAddr = `${D.addr}:${D.port || (D.scheme === "http" ? 80 : 443)}`, P.lane === "secondary" && !e.debug.tried.includes(v.id) && e.debug.tried.push(v.id), { ok: true, winner: D, resp: P.resp, primaryFailed: false };
    }
    let [De, Pe] = await Promise.all([p.catch(() => null), ue.catch(() => ({ ok: false }))]);
    if (De && !Ae(De.status) && !he)
      return { ok: true, winner: r, resp: De, primaryFailed: false };
    if (Pe && Pe.ok && Pe.resp && !y && !Ae(Pe.resp.status))
      return e.debug.originId = v.id, e.debug.originAddr = `${v.addr}:${v.port || (v.scheme === "http" ? 80 : 443)}`, e.debug.tried.includes(v.id) || e.debug.tried.push(v.id), { ok: true, winner: v, resp: Pe.resp, primaryFailed: false };
    let ze = null, ct = null;
    return he ? ze = he : y ? ze = y : c && c.body && (ze = Er(c)), d && !ze && (ct = d), e.debug.tried.includes(v.id) || e.debug.tried.push(v.id), { ok: false, primaryFailed: !!d || !!he || !!c, secondary: v, secondaryFailed: true, lastResponse: ze, lastError: ct };
  }
  function Er(e) {
    return { status: e.status, statusText: e.statusText, headers: new Headers(e.headers) };
  }
  async function Jn(e, u, t, r, n, a) {
    if (u.engine === "r2")
      return mi(e, u, t, r, n, a);
    if (u.engine === "cnb" || u.engine === "github")
      return Yn(e, u, t, r, n, a);
    if (u.engine === "socket")
      throw new Error("engine 'socket' \u5DF2\u5F03\u7528\uFF1A\u81EA\u5B9A\u4E49\u56DE\u6E90 Host \u5DF2\u7531 fetch \u539F\u751F\u652F\u6301\uFF1BCF \u4E0A\u88F8 IP + HTTPS + \u81EA\u5B9A\u4E49 SNI \u7531 fetchEngine \u5185\u90E8\u81EA\u52A8\u8D70 cloudflare:sockets \u515C\u5E95\uFF0C\u8BF7\u79FB\u9664 origin/rule \u914D\u7F6E\u4E2D\u7684 engine:'socket'\u3002");
    let o = a?.hostHeader, s = o?.custom;
    return s && String(s).trim() && String(s).trim() !== String(t.hostname) ? r.set("Host", String(s).trim()) : o?.mode === "accel" && e.url.hostname && e.url.hostname !== String(t.hostname) && r.set("Host", e.url.hostname), Yn(e, u, t, r, n, a);
  }
  async function m0(e, u, t) {
    let r = (u?.origins || []).filter((o) => o && o.enabled !== false);
    if (r.length === 0)
      return [];
    let n = 20, a = [];
    for (let o = 0; o < r.length; o += n) {
      let s = r.slice(o, o + n), i = await Promise.all(s.map(async (l) => Fr(e, u.id, l.id) || await ii(e, u.id, l.id) ? l.id : null));
      for (let l of i)
        l !== null && a.push(l);
    }
    return a.length >= r.length ? (Array.isArray(e.debug.notes) || (e.debug.notes = []), e.debug.notes.push(`all-unavailable:ignoring(penalty=${t})`), []) : a;
  }
  function xi(e) {
    let u = ce.name;
    return e && typeof e.enabled == "boolean" ? { enabled: e.enabled, name: e.name || u } : { enabled: false, name: u };
  }
  async function Ai(e, u, t) {
    let r = new URL(u.url), n = { method: u.method, headers: u.headers, redirect: "follow" }, a = String(u.method || "GET").toUpperCase();
    if (a !== "GET" && a !== "HEAD")
      try {
        n.body = u.clone().body;
      } catch {
      }
    return e && e.debug && (e.debug.eoEdgeFetch = r.host), fetch(r.toString(), n);
  }
  cu();
  $r();
  function E0(e) {
    return e !== null && typeof e == "object" && !Array.isArray(e);
  }
  async function Ci(e, u) {
    if (!u || !u.id || u.engine !== "cnb" && u.engine !== "github")
      return;
    let t = u.engine === "cnb" ? "cnbTokenEnc" : "githubTokenEnc", r = u[t];
    if (!(r == null || r === ""))
      try {
        let n = await va(r, e);
        e.__siteSecrets || (e.__siteSecrets = {}), e.__siteSecrets[u.id] = n;
      } catch (n) {
        e.__siteSecrets || (e.__siteSecrets = {}), e.__siteSecrets[u.id] = "", e.debug && (e.debug.secretError = n.message);
      }
  }
  async function Di(e, u) {
    !u || !Array.isArray(u.origins) || await Promise.all(u.origins.map((t) => Ci(e, t)));
  }
  var b0 = Object.freeze({ enabled: false, edgeTtl: 0, browserTtl: 0, ignoreQuery: false, queryWhitelist: [] });
  async function x0(e, u) {
    if (u.poolId) {
      let t = await Ne(e, u.poolId);
      return t && Array.isArray(t.origins) && t.origins.length > 0 ? t : null;
    }
    return null;
  }
  async function vi(e) {
    try {
      let u = await L(e);
      if (u && u.globalRateLimit > 0) {
        let t = Qs(u.globalRateLimit);
        if (t.limited)
          return new Response("Too Many Requests", { status: 429, headers: { "Retry-After": String(t.retryAfter), "Content-Type": "text/plain" } });
      }
      return await A0(e);
    } catch (u) {
      return lt(500, "Internal Server Error", `Pipeline failure: ${u?.message || String(u)}`, e);
    }
  }
  async function A0(e) {
    let u = {};
    try {
      let y = await fe(e);
      u = y && y.stages || {};
    } catch {
    }
    e.__globalStages = u;
    let t = await ka(e);
    if (!t) {
      let y;
      try {
        y = (await L(e))?.disguise;
      } catch {
        y = void 0;
      }
      let P = await dr(e, y);
      return Tu(e, { status: P.status, cacheHit: "BYPASS" }), P;
    }
    let r = await ti(e, t);
    if (r)
      return Tu(e, { status: r.status, cacheHit: "BYPASS", blocked: true }), r;
    let n = await x0(e, t);
    if (!n)
      return lt(500, "Config Error", `Site "${t.host}" has no usable origin (poolId="${t.poolId || ""}")`, e);
    let a = wu(n, e, []);
    if (!a)
      return lt(502, "No Origin", `No enabled origin in site "${t.host}"`, e);
    e.origin = a, await Di(e, n);
    let o = $s(e, t, a), s = o.action, i = o._source, l = D0(e, o);
    if (l)
      return Tu(e, { status: l.status, cacheHit: "BYPASS" }), l;
    let c = it(o?.action?.hostHeader, void 0, t.defaultHostHeader), d = o?.action || {}, p = n, f = "site-default", g = d.poolId;
    if (g) {
      if (p = await Ne(e, g), f = `pool:${g}`, !p || !Array.isArray(p.origins) || p.origins.length === 0)
        return lt(502, "Config Error", `Origin "${g}" is empty or missing`, e);
      await Di(e, p);
    }
    if (f !== "site-default") {
      let y = wu(p, e, []);
      if (!y)
        return lt(502, "No Origin", `No enabled origin in ${f}`, e);
      e.origin = y, a = y, await Ci(e, y);
    }
    let m = o?.action?.cache || {}, A = { ...b0, ...m }, S = js(e, A), I = null;
    if (!S && e.caps?.hasEdgeCache)
      try {
        let y = ot(void 0, o?.action?.rewrite), P = st(e, a, { action: { rewrite: y } }, c);
        I = qs(e, A, P, { cacheGen: t.cacheGen || 0 });
      } catch (y) {
        e.debug.cacheKeyError = String(y?.message || y);
      }
    if (I) {
      let y = await vn(e, I);
      if (y) {
        e.debug.cache = "HIT";
        let P = Bu(void 0, o?.action?.respHeaders), De = await lr(e, y, A, P);
        return Tu(e, { status: y.status, cacheHit: "HIT" }), new Response(y.body, { status: y.status, statusText: y.statusText, headers: De });
      }
      e.debug.cache = "MISS";
    } else
      e.debug.cache = !e.caps?.hasEdgeCache && A.enabled ? "EDGE_HEADER" : "BYPASS";
    let v = e.caps?.eoEdgeCache && c?.mode === "accel" && !c?.custom && I && yi(e, I, new Response(null, { status: 200 }), A) && !["cnb", "github", "r2"].includes(a?.engine), _;
    if (v ? (e.debug.cachePath = "A_EO_EDGE", _ = await Ai(e, e.request, A)) : _ = await Ei(e, p, o, c, { site: t, preferredOrigin: a }), _ && _.status >= 500 && I)
      try {
        let y = await vn(e, I);
        if (y) {
          e.debug.cache = "STALE";
          let P = e.__globalStages && e.__globalStages.respHeaders || w.respHeaders, De = await lr(e, y, A, P);
          return Tu(e, { status: y.status, cacheHit: "STALE" }), new Response(y.body, { status: y.status, statusText: y.statusText, headers: De });
        }
      } catch {
      }
    let H = null, Z = I && yi(e, I, _, A);
    Z && (H = _.clone());
    let ue = Bu(void 0, o?.action?.respHeaders), Ae = await lr(e, _, A, ue), he = new Response(_.body, { status: _.status, statusText: _.statusText, headers: Ae });
    if (Z && H) {
      let y = new Response(H.body, { status: H.status, statusText: H.statusText, headers: new Headers(Ae) });
      e.waitUntil(Qo(e, I, y).catch(() => {
      }));
    }
    return Tu(e, { status: _.status, cacheHit: e.debug.cache === "HIT" ? "HIT" : e.debug.cache === "MISS" ? "MISS" : void 0, originId: e.debug.originId }), he;
  }
  function D0(e, u) {
    let t = u?.action;
    if (!t)
      return null;
    let r = Us(e, u), n = t.terminate || {}, a = t.redirect || {};
    if (n.forceHttps && e.url.protocol === "http:") {
      let o = new URL(e.url.href);
      return o.protocol = "https:", new Response(null, { status: n.forceHttpsStatus || 301, headers: { Location: o.toString(), "Cache-Control": "no-store", ...r } });
    }
    if (n.directResponse?.enabled) {
      let o = n.directResponse, s = ye(o.body || "", e, { label: "directResponse.body", maxLen: 65536 });
      return new Response(s, { status: o.status || 200, headers: { "Content-Type": o.contentType || "text/plain; charset=utf-8", "Cache-Control": "no-store", ...r } });
    }
    if (a?.enabled && a.target) {
      let o = y0(e, u, a);
      if (o)
        return new Response(null, { status: a.status || 302, headers: { Location: o, "Cache-Control": "no-store", ...r } });
    }
    return null;
  }
  function y0(e, u, t) {
    let r = String(t.target || ""), n = C0(e, u);
    n && (r = r.replace(/\$(\d)/g, (o, s) => {
      let i = Number(s);
      return i >= 1 && i <= n.length ? n[i] : o;
    })), r = ye(r, e, { label: "redirect.target", maxLen: 8192 });
    let a;
    try {
      a = new URL(r, e.url.href);
    } catch {
      return "";
    }
    if (t.keepQuery)
      for (let [o, s] of e.url.searchParams)
        a.searchParams.has(o) || a.searchParams.append(o, s);
    return a.toString();
  }
  function C0(e, u) {
    let t = u?.match?.conditions;
    if (!Array.isArray(t))
      return null;
    for (let r of t)
      if (Array.isArray(r)) {
        for (let n of r)
          if (E0(n) && n.target === "path" && n.op === "regex" && Array.isArray(n.values) && n.values[0])
            try {
              let a = e.url.pathname.match(new RegExp(n.values[0]));
              if (a)
                return a;
            } catch {
            }
      }
    return null;
  }
  function yi(e, u, t, r) {
    try {
      return us(u, t, r) === true;
    } catch {
      return false;
    }
  }
  function Tu(e, u) {
    try {
      Rn(e, { host: e.url.hostname, path: e.url.pathname, method: e.request.method, duration: Date.now() - e.startTime, ...u });
    } catch {
    }
  }
  function lt(e, u, t, r) {
    let n = new Headers({ "Content-Type": "text/plain; charset=utf-8" }), a = r && r.__globalStages && r.__globalStages.respHeaders || w.respHeaders;
    cr(n, a, r, null);
    let o = r.__globalStages && r.__globalStages.error, s = o && o.messages || w.error.messages, l = (o && o.messageMap || w.error.messageMap)[u], c = l && s[l] || u;
    return new Response(`${c}

${t}
`, { status: e, headers: n });
  }
  async function Bi(e) {
    let { url: u } = e, t = u.pathname;
    try {
      await Je(e);
    } catch (c) {
      console.error("[app] loadConfigSnapshot failed:", c?.message);
    }
    try {
      e.waitUntil(cn(e));
    } catch {
    }
    fn(e).catch(() => {
    });
    let r;
    try {
      r = await L(e);
    } catch (c) {
      console.error("[app] getGlobal failed:", c?.message), r = null;
    }
    let n = v0(r?.adminPath) || "__panel", a = `/${n}`, o = r?.adminDomain ? String(r.adminDomain).trim().toLowerCase() : "", s = e.url?.hostname ? e.url.hostname.toLowerCase() : "";
    if ((o === "" || s !== "" && s === o) && (t === a || t.startsWith(a + "/"))) {
      let c = t.slice(a.length);
      if (c === "/api" || c.startsWith("/api/")) {
        let d = c.slice(4) || "/";
        return Rs(e, d, r);
      }
      if (c === "" || c === "/" || c === "/index.html" || c.startsWith("/assets/")) {
        if (e.request.method !== "GET" && e.request.method !== "HEAD")
          return new Response("Method Not Allowed", { status: 405 });
        let d = await Os(e, e.request, n);
        return d || Un(e, n);
      }
      return dr(e, r?.disguise);
    }
    let l = await vi(e);
    try {
      e.waitUntil(Ln(e));
    } catch {
    }
    return l;
  }
  function v0(e) {
    return !e || typeof e != "string" ? "" : e.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  }
  function B0() {
    let e = "";
    for (let u = 0; u < 16; u++)
      e += "0123456789ABCDEF"[Math.floor(Math.random() * 16)];
    return e;
  }
  var wi = Object.freeze(["HKG", "SJC", "NRT", "LHR", "FRA", "LAX", "AMS", "SIN", "CDG", "IAD", "SYD", "YYZ", "GRU", "MAD", "SEA", "MIA"]);
  function w0() {
    let e = wi[Math.floor(Math.random() * wi.length)];
    return Math.random() < 0.3 ? `${e}-${String(Math.floor(Math.random() * 20) + 1).padStart(2, "0")}` : e;
  }
  var ki = Object.freeze({ 502: { title: "Bad gateway", what: "The web server reported a bad gateway error." }, 503: { title: "Service temporarily unavailable", what: "The service is temporarily unavailable." }, 500: { title: "Internal server error", what: "An unexpected error occurred on the server." } });
  function Ti({ status: e = 500, code: u = "INTERNAL", reqId: t = "", domain: r = "" } = {}) {
    let n = ki[e] ? e : 500, a = ki[n], o = B0(), s = w0(), i = r || "cloudflare.com";
    return `<!DOCTYPE html>
<!--[if lt IE 7]><html class="no-js ie6 oldie" lang="en-US"><![endif]-->
<!--[if IE 7]><html class="no-js ie7 oldie" lang="en-US"><![endif]-->
<!--[if IE 8]><html class="no-js ie8 oldie" lang="en-US"><![endif]-->
<!--[if gt IE 8]><!-->
<html class="no-js" lang="en-US">
<!--<![endif]-->
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=Edge">
    <meta name="robots" content="noindex, nofollow">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${i} | ${n}: ${a.title}</title>
    <style>
      body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#333;background:#fff}
      #cf-wrapper{max-width:960px;margin:0 auto;padding:0 16px}
      .code-label{display:inline-block;margin-left:.5rem;padding:.1rem .5rem;font-size:.8rem;background:#f3f4f6;color:#6b7280;border-radius:.25rem}
      h1{font-weight:300;font-size:2rem;line-height:1.2;margin:.5rem 0}
      .grid{display:flex;flex-wrap:wrap;margin:2rem 0;border-top:1px solid #eee;padding-top:1.5rem}
      .cell{flex:1 1 33%;min-width:200px;padding:1rem;text-align:center}
      .ok{color:#16a34a}.err{color:#dc2626}
      h2{font-size:1.25rem;font-weight:400;margin:.5rem 0}
      .meta{border-top:1px solid #eee;margin-top:1.5rem;padding-top:1rem;font-size:.8rem;color:#6b7280}
      .btn{border:1px solid #ccc;background:#fff;border-radius:.25rem;padding:.1rem .5rem;cursor:pointer;font-size:.8rem}
    </style>
</head>

<body>
    <div id="cf-wrapper">
        <div id="cf-error-details" class="p-0">
            <header class="mx-auto pt-10 lg:pt-6 lg:px-8 w-240 lg:w-full mb-8">
                <h1 class="inline-block sm:block sm:mb-2 font-light text-60 lg:text-4xl text-black-dark leading-tight mr-2">
                    <span class="inline-block">${a.title}</span>
                    <span class="code-label">Error code ${n}</span>
                </h1>
                <div>
                    Visit <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_${n}" target="_blank" rel="noopener noreferrer">cloudflare.com</a>
                    for more information.
                </div>
                <div class="mt-3" id="cf-timestamp"></div>
            </header>

            <div class="my-8 bg-gradient-gray">
                <div class="w-240 lg:w-full mx-auto">
                    <div class="clearfix md:px-8">
                        <div id="cf-browser-status" class="relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <span class="block md:hidden h-20 bg-center bg-no-repeat"></span>
                                <span class="w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                            </div>
                            <span class="md:block w-full truncate">You</span>
                            <h3 class="md:inline-block mt-3 md:mt-0 text-2xl text-gray-600 font-light leading-1.3">Browser</h3>
                            <span class="leading-1.3 text-2xl text-green-success">Working</span>
                        </div>

                        <div id="cf-cloudflare-status" class="relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_${n}" target="_blank" rel="noopener noreferrer">
                                    <span class="block md:hidden h-20 bg-center bg-no-repeat"></span>
                                    <span class="w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                                </a>
                            </div>
                            <span class="md:block w-full truncate" id="cf-region-name">${s}</span>
                            <h3 class="md:inline-block mt-3 md:mt-0 text-2xl text-gray-600 font-light leading-1.3">
                                <a href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_${n}" target="_blank" rel="noopener noreferrer">Cloudflare</a>
                            </h3>
                            <span class="leading-1.3 text-2xl text-green-success">Working</span>
                        </div>

                        <div id="cf-host-status" class="cf-error-source relative w-1/3 md:w-full py-15 md:p-0 md:py-8 md:text-left md:border-solid md:border-0 md:border-b md:border-gray-400 overflow-hidden float-left md:float-none text-center">
                            <div class="relative mb-10 md:m-0">
                                <span class="block md:hidden h-20 bg-center bg-no-repeat"></span>
                                <span class="w-12 h-12 absolute left-1/2 md:left-auto md:right-0 md:top-0 -ml-6 -bottom-4"></span>
                            </div>
                            <span class="md:block w-full truncate" id="cf-host-status-name">${i}</span>
                            <h3 class="md:inline-block mt-3 md:mt-0 text-2xl text-gray-600 font-light leading-1.3">Host</h3>
                            <span class="leading-1.3 text-2xl text-red-error">Error</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="w-240 lg:w-full mx-auto mb-8 lg:px-8">
                <div class="clearfix">
                    <div class="w-1/2 md:w-full float-left pr-6 md:pb-10 md:pr-0 leading-relaxed">
                        <h2 class="text-3xl font-normal leading-1.3 mb-4">What happened?</h2>
                        <p>${a.what}</p>
                    </div>
                    <div class="w-1/2 md:w-full float-left leading-relaxed">
                        <h2 class="text-3xl font-normal leading-1.3 mb-4">What can I do?</h2>
                        <p class="mb-6">Please try again in a few minutes.</p>
                    </div>
                </div>
            </div>

            <div class="cf-error-footer cf-wrapper w-240 lg:w-full py-10 sm:py-4 sm:px-8 mx-auto text-center sm:text-left border-solid border-0 border-t border-gray-300">
                <p class="text-13">
                    <span class="cf-footer-item sm:block sm:mb-1">
                        Cloudflare Ray ID: <strong class="font-semibold" id="ray-id">${o}</strong>
                    </span>
                    <span class="cf-footer-separator sm:hidden">&bull;</span>
                    <span id="cf-footer-item-ip" class="cf-footer-item hidden sm:block sm:mb-1">
                        Your IP: <button type="button" id="cf-footer-ip-reveal" class="btn">Click to reveal</button>
                        <span class="hidden" id="cf-footer-ip">1.1.1.1</span>
                        <span class="cf-footer-separator sm:hidden">&bull;</span>
                    </span>
                    <span class="cf-footer-item sm:block sm:mb-1">
                        <span>Performance &amp; security by</span>
                        <a rel="noopener noreferrer" href="https://www.cloudflare.com/5xx-error-landing?utm_source=errorcode_${n}" id="brand_link" target="_blank">Cloudflare</a>
                    </span>
                </p>
                <script>
                    (function () {
                        // \u6E32\u67D3\u65F6\u95F4\u6233\uFF08\u670D\u52A1\u7AEF\u751F\u6210\uFF0C\u907F\u514D\u5BA2\u6237\u7AEF\u65F6\u533A\u5DEE\u5F02\u66B4\u9732\uFF09
                        try {
                            document.getElementById('cf-timestamp').textContent =
                                new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
                        } catch (e) {}

                        // \u663E\u793A\u8BBF\u5BA2\u771F\u5B9E IP\uFF1A\u540C\u6E90 /cdn-cgi/trace \u7531 Cloudflare \u8FB9\u7F18\u76F4\u63A5\u54CD\u5E94\uFF0C
                        // \u4E0D\u7ECF\u8FC7\u672C Worker \u811A\u672C\uFF0C\u56E0\u6B64\u4E0D\u589E\u52A0 Workers \u8BF7\u6C42\u6570\u3002
                        var b = document.getElementById('cf-footer-item-ip');
                        var c = document.getElementById('cf-footer-ip-reveal');
                        if (b && 'classList' in b) {
                            b.classList.remove('hidden');
                            c.addEventListener('click', function () {
                                c.classList.add('hidden');
                                document.getElementById('cf-footer-ip').classList.remove('hidden');
                                fetch('/cdn-cgi/trace').then(function (r) { return r.text(); }).then(function (t) {
                                    var ip = t.split('\\n').find(function (l) { return l.indexOf('ip=') === 0; });
                                    if (ip) document.getElementById('cf-footer-ip').textContent = ip.slice(3);
                                }).catch(function () {});
                            });
                        }
                    })();
                <\/script>
            </div><!-- /.error-footer -->
        </div><!-- /#cf-error-details -->
    </div><!-- /#cf-wrapper -->
</body>
</html>`;
  }
  async function PF(e) {
    let u = e?.env || {}, t = typeof e?.waitUntil == "function" ? e.waitUntil.bind(e) : null;
    return Si(e.request, u, t);
  }
  var zF = { async fetch(e, u = {}, t = null) {
    let r = t && typeof t.waitUntil == "function" ? t.waitUntil.bind(t) : null;
    return Si(e, u || {}, r);
  } };
  async function Si(e, u, t) {
    let r = [], n = t || ((l) => {
      r.push(Promise.resolve(l).catch(() => {
      }));
    }), a;
    try {
      a = new URL(e.url);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    let o = fo(e), s = Ge(u);
    try {
      Ya({ totalBytes: s.memBudgetBytes, env: u });
    } catch (l) {
      console.error("[entry] initMemBudget \u5931\u8D25\uFF0C\u964D\u7EA7\u4E3A\u65E0\u7EDF\u4E00\u5185\u5B58\u7BA1\u7406:", l?.message);
    }
    try {
      await ma(u, s);
    } catch (l) {
      console.error("[entry] preloadKV \u5931\u8D25\uFF0C\u914D\u7F6E\u5B58\u50A8\u964D\u7EA7\u4E3A\u65E0\u6301\u4E45\u5316:", l?.message);
    }
    let i = { request: e, url: a, env: u, caps: s, waitUntil: n, startTime: Date.now(), reqId: o, debug: {} };
    try {
      await Je(i);
    } catch (l) {
      console.error("[entry] loadConfigSnapshot \u5931\u8D25\uFF08\u914D\u7F6E\u5B58\u50A8\u964D\u7EA7\u4E3A\u6309\u9700\u8BFB\uFF09:", l?.message);
    }
    try {
      let l = await Bi(i);
      return k0(l, o);
    } catch (l) {
      let c = Vt(l);
      console.error(`[entry] unhandled error reqId=${o} code=${c.code} msg=${et(c.message)}`, c.cause instanceof Error ? c.cause.stack : void 0);
      let d = c.status || 500, p = Ti({ status: d, code: c.code, reqId: o, domain: a ? a.hostname : "" });
      return new Response(p, { status: d, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=60", "x-robots-tag": "noindex, nofollow", [ru]: o } });
    }
  }
  function k0(e, u) {
    if (!e || !u)
      return e;
    try {
      return e.headers.has(ru) || e.headers.set(ru, u), e;
    } catch {
      try {
        let t = new Headers(e.headers);
        t.set(ru, u);
        let r = e.status === 204 || e.status === 304;
        return new Response(r ? null : e.body, { status: e.status, statusText: e.statusText, headers: t });
      } catch {
        return e;
      }
    }
  }

  // edge-functions/[[default]].js
  function installEoRuntimePolyfills() {
    try {
      if (typeof Response !== "undefined" && typeof Response.json !== "function") {
        Response.json = function json(data, init) {
          const headers = init && init.headers || { "content-type": "application/json" };
          return new Response(JSON.stringify(data), { ...init, headers });
        };
      }
      if (typeof Headers === "undefined") {
        globalThis.Headers = class {
          constructor(init) {
            this._m = /* @__PURE__ */ new Map();
            if (init) {
              if (init instanceof Headers)
                init.forEach((v, k2) => this._m.set(k2.toLowerCase(), v));
              else if (Array.isArray(init))
                init.forEach(([k2, v]) => this._m.set(String(k2).toLowerCase(), v));
              else if (typeof init === "object")
                Object.entries(init).forEach(([k2, v]) => this._m.set(k2.toLowerCase(), v));
            }
          }
          get(k2) {
            return this._m.get(String(k2).toLowerCase());
          }
          set(k2, v) {
            this._m.set(String(k2).toLowerCase(), v);
          }
          has(k2) {
            return this._m.has(String(k2).toLowerCase());
          }
          delete(k2) {
            return this._m.delete(String(k2).toLowerCase());
          }
          forEach(fn2) {
            this._m.forEach((v, k2) => fn2(v, k2, this));
          }
          get entries() {
            return this._m.entries.bind(this._m);
          }
          [Symbol.iterator]() {
            return this._m.entries();
          }
        };
      }
    } catch {
    }
  }
  function resolveEnv(passedEnv) {
    let base = {};
    if (passedEnv && typeof passedEnv === "object") {
      base = passedEnv;
    } else if (typeof process !== "undefined" && process.env && typeof process.env === "object") {
      base = process.env;
    }
    if (!base.CLOUD_PLATFORM) {
      base = { ...base, CLOUD_PLATFORM: "eo" };
    }
    return base;
  }
  var default_default = {
    async fetch(request, env, ctx) {
      installEoRuntimePolyfills();
      const resolvedEnv = resolveEnv(env);
      const waitUntil = ctx && typeof ctx.waitUntil === "function" ? ctx.waitUntil.bind(ctx) : null;
      if (zF && typeof zF.fetch === "function") {
        return zF.fetch(request, resolvedEnv, { waitUntil });
      }
      return PF({ request, env: resolvedEnv, waitUntil });
    }
  };
  async function onRequest(context) {
    installEoRuntimePolyfills();
    return PF({
      request: context.request,
      env: resolveEnv(context?.env),
      waitUntil: context && typeof context.waitUntil === "function" ? context.waitUntil.bind(context) : null
    });
  }

        pagesFunctionResponse = onRequest;
      })();
          }
        
        };
      

          let middlewareResponseHeaders = null;

          // 走到这里说明：
          // 1. 没有中间件响应（middlewareResponse 为 null/undefined）
          // 2. 或者中间件返回了 next
          // 需要判断是否命中边缘函数

          runEdgeFunctions();

          // 动态路由命中时，检查该路径的 runtime 是否为 edge
          // 如果不是 edge（如 node/file），则跳出边缘函数，走回源逻辑
          if (matchedFunc && routeParams.mode > 0 && hookCtx && hookCtx.getPathRuntime) {
            try {
              const pathRuntime = await hookCtx.getPathRuntime(urlInfo.pathname);
              if (pathRuntime && pathRuntime !== 'edge') {
                matchedFunc = false;
              }
            } catch(e) {
              // getPathRuntime 调用失败时不阻断，继续执行边缘函数
            }
          }

          //没有命中边缘函数，执行回源
          if (!matchedFunc) {
            const originResponse = await fetch(request);

            // 如果中间件设置了响应头，合并到回源响应中
            if (middlewareResponseHeaders) {
              const mergedHeaders = new Headers(originResponse.headers);
              // 删除可能导致问题的编码相关头
              mergedHeaders.delete('content-encoding');
              mergedHeaders.delete('content-length');
              middlewareResponseHeaders.forEach((value, key) => {
                if (key.toLowerCase() === 'set-cookie') {
                  mergedHeaders.append(key, value);
                } else {
                  mergedHeaders.set(key, value);
                }
              });
              return new Response(originResponse.body, {
                status: originResponse.status,
                statusText: originResponse.statusText,
                headers: mergedHeaders,
              });
            }

            return originResponse;
          }

          // 命中了边缘函数，继续执行边缘函数逻辑

          const params = {};
          if (routeParams.id) {
            if (routeParams.mode === 1) {
              const value = urlInfo.pathname.match(routeParams.left);
              for (let i = 1; i < value.length; i++) {
                params[routeParams.id[i - 1]] = value[i];
              }
            } else {
              const value = urlInfo.pathname.replace(routeParams.left, '');
              const splitedValue = value.split('/');
              if (splitedValue.length === 1) {
                params[routeParams.id] = splitedValue[0];
              } else {
                params[routeParams.id] = splitedValue;
              }
            }

          }
          const edgeFunctionResponse = await pagesFunctionResponse({request, params, env: {"EDGEONE_PAGES_API_REGION":"global"}, waitUntil, eo });

          // 如果中间件设置了响应头，合并到边缘函数响应中
          if (middlewareResponseHeaders && edgeFunctionResponse) {
            const mergedHeaders = new Headers(edgeFunctionResponse.headers);
            // 删除可能导致问题的编码相关头
            mergedHeaders.delete('content-encoding');
            mergedHeaders.delete('content-length');
            middlewareResponseHeaders.forEach((value, key) => {
              if (key.toLowerCase() === 'set-cookie') {
                mergedHeaders.append(key, value);
              } else {
                mergedHeaders.set(key, value);
              }
            });
            return new Response(edgeFunctionResponse.body, {
              status: edgeFunctionResponse.status,
              statusText: edgeFunctionResponse.statusText,
              headers: mergedHeaders,
            });
          }

          return edgeFunctionResponse;
        })({request: ev.request, params: {}, env: {"EDGEONE_PAGES_API_REGION":"global"}, waitUntil: ev.waitUntil.bind(ev) });
        // ↑ 用户原始代码结束
      }

      addEventListener('fetch', (event, hookCtx) => {
        const res = usercode(event, hookCtx);
        event.respondWith(res);
      });