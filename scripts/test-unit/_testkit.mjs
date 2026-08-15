/**
 * scripts/test-unit/_testkit.mjs —— 后端单测公共桩
 * ----------------------------------------------------------------------------
 * 抽出所有分组文件（matcher/rewrite/cachekey/headers/balancer/security/
 * platform/config/datasource）共享的测试运行器与 mock 工具，消除重复桩
 * （原 test-field-coverage 与 test-global-fallback 的同构 mock 即源于此）。
 *
 * 运行器契约（与历史 test-unit-backend.mjs 完全一致）：
 *   - _queue：test()/testA() 把用例 push 进同一个数组，由 index.mjs 的
 *     runBackendUnitTests() 统一遍历执行、汇总 { ok, failures }。
 *   - test(name, fn)：fn 可同步或 async；断言失败只需 throw（用 node:assert）。
 *   - testA(name, fn)：断言组，fn 接收一个 assert 对象，组内任意失败仍继续
 *     执行其余断言，便于「一组关联断言一次性看清哪些挂了」。
 */

import assert from 'node:assert';

/** 用例队列：所有分组文件 import 即把用例 push 进来，index.mjs 统一消费 */
export const _queue = [];

/**
 * 普通用例：fn 抛错即该用例失败，并停止该用例后续逻辑。
 * @param {string} name
 * @param {() => void | Promise<void>} fn
 */
export function test(name, fn) {
  _queue.push({ name, fn, group: false });
}

/**
 * 断言组用例：fn(assertObj) 内可多次调用 assertObj.xxx，组内任一失败
 * 仅计入失败计数、不中断同组其它断言。
 * @param {string} name
 * @param {(a: object) => void | Promise<void>} fn
 */
export function testA(name, fn) {
  _queue.push({ name, fn, group: true });
}

/**
 * 返回一个带 .throws / .equal / .deepEqual / .ok / .notEqual 的断言器。
 * 落入 failures 数组（每个元素 {name, message}）而非直接 throw，便于组内聚合。
 */
function makeAssertGroup(failures, name) {
  const record = (cond, message) => {
    if (!cond) failures.push({ name, message });
  };
  return {
    throws(fn, message) {
      let threw = false;
      try { fn(); } catch { threw = true; }
      record(threw, message || '应抛出但未抛出');
    },
    rejects(p, message) {
      return Promise.resolve(p).then(
        () => failures.push({ name, message: message || '应 rejected 但未' }),
        () => {}
      );
    },
    equal(actual, expected, message) {
      record(actual === expected, message || `equal 失败: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    },
    notEqual(actual, expected, message) {
      record(actual !== expected, message || `notEqual 失败: ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`);
    },
    deepEqual(actual, expected, message) {
      try { assert.deepStrictEqual(actual, expected); }
      catch (e) { failures.push({ name, message: message || e.message }); }
    },
    ok(val, message) {
      record(!!val, message || `ok 失败: ${JSON.stringify(val)} 为假`);
    },
    fail(message) {
      failures.push({ name, message: message || '显式失败' });
    },
  };
}

/**
 * 执行整个队列，返回 { ok, failures }。failures 为失败用例数（非断言数）。
 * @returns {Promise<{ok:boolean, failures:number}>}
 */
export async function runQueue() {
  let failures = 0;
  let checks = 0;
  for (const item of _queue) {
    const tag = item.group ? '  ▸ [组]' : '  ▸';
    try {
      if (item.group) {
        const groupFails = [];
        await item.fn(makeAssertGroup(groupFails, item.name));
        checks++;
        if (groupFails.length) {
          failures++;
          for (const g of groupFails) console.log(`    ✗ ${item.name} —— ${g.message}`);
        } else {
          console.log(`    ✓ ${item.name}`);
        }
      } else {
        await item.fn();
        checks++;
        console.log(`    ✓ ${item.name}`);
      }
    } catch (e) {
      failures++;
      console.log(`    ✗ ${item.name} —— ${e && e.message ? e.message : String(e)}`);
    }
  }
  return { ok: failures === 0, failures, checks };
}

// ---------------------------------------------------------------------------
// mock 工具：集中复用，避免各分组/孤儿脚本各自重复定义。
// ---------------------------------------------------------------------------

/**
 * 极简内存 KV mock —— 与 src/platform/kv.js 的 KVLike 契约一致。
 * getKV(env) 通过鸭子类型（get/put 函数）识别，注入 { CDN_KV: mockKV } 即可
 * 复用真实 store 存储路径（含 keyCodec 编码）。
 * @returns {{writes:number, get, put, delete, list}}
 */
export function createMockKV() {
  const store = new Map();
  const now = () => Math.floor(Date.now() / 1000);
  return {
    writes: 0,
    async get(key, _type) {
      const hit = store.get(String(key));
      if (!hit) return null;
      if (hit.expireAt !== 0 && hit.expireAt < now()) {
        store.delete(String(key));
        return null;
      }
      return hit.value;
    },
    async put(key, value, opts) {
      this.writes++;
      store.set(String(key), {
        value: String(value),
        expireAt: opts && opts.expirationTtl ? now() + opts.expirationTtl : 0,
      });
    },
    async delete(key) {
      store.delete(String(key));
    },
    async list(opts) {
      const prefix = (opts && opts.prefix) || '';
      const keys = [];
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) keys.push({ name: k });
      }
      return { keys, list_complete: true };
    },
  };
}

/**
 * 构造一个最小可用的 ctx 桩，覆盖 matcher/rewrite/cachekey/security 等
 * 纯函数路径所需的字段（不依赖真实 Request）。
 * @param {object} [overrides]
 * @returns {object}
 */
export function makeCtx(overrides = {}) {
  const url = new URL(overrides.url || 'https://example.com/');
  return {
    method: 'GET',
    url,
    request: {
      method: 'GET',
      url: url.toString(),
      headers: new Map(Object.entries(overrides.reqHeaders || {})),
    },
    env: overrides.env || {},
    runtime: overrides.runtime || {},
    // 以下为各模块消费的可选字段占位（按需覆盖）
    clientIp: overrides.clientIp || '1.2.3.4',
    geo: overrides.geo || {},
    site: overrides.site || null,
    rule: overrides.rule || null,
    status: overrides.status ?? 200,
    upstream: overrides.upstream || { status: 200, headers: new Map() },
    ...overrides.extra,
  };
}

/**
 * 临时替换全局 fetch（env 注入 fetch）执行 fn，再还原。
 * @param {(url:string, init:object)=>Promise<Response>} handler
 * @param {() => any | Promise<any>} fn
 * @returns {Promise<any>}
 */
export async function withFakeFetch(handler, fn) {
  const prev = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    const res = await handler(url, init);
    return res;
  });
  try {
    return await fn();
  } finally {
    globalThis.fetch = prev;
  }
}

/** 便捷构造 Response（避免在各分组里重复写 new Response） */
export function mockResponse(status, body, headers = {}) {
  return new Response(body == null ? null : body, {
    status,
    headers,
  });
}
