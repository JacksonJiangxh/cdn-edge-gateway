/**
 * scripts/test-unit/index.mjs —— 后端单测汇聚入口
 * ----------------------------------------------------------------------------
 * 各分组文件（matcher/rewrite/cachekey/headers/balancer/security/platform/
 * config/datasource）在 import 时即把用例 push 进 _testkit.mjs 的共享 _queue；
 * 本文件 import 它们完成注册，再统一执行 runQueue() 汇总 { ok, failures }。
 *
 * 对外导出：runBackendUnitTests() —— 签名与原 test-unit-backend.mjs 完全一致，
 *           build.mjs 无需改动即可调用。
 *
 * CLI：node scripts/test-unit/index.mjs 直接运行单测（供 npm test:unit）。
 */
import { pathToFileURL } from 'node:url';

// 按依赖/阅读顺序 import 各分组（import 即注册用例）
import './matcher.mjs';
import './rewrite.mjs';
import './cachekey.mjs';
import './headers.mjs';
import './resp-headers.mjs';
import './balancer.mjs';
import './security.mjs';
import './platform.mjs';
import './proxy.mjs';
import './config.mjs';
import './datasource.mjs';
import './stats.mjs';

import { runQueue } from './_testkit.mjs';

/**
 * 执行全部后端单测用例，返回构建闸门契约 { ok, failures }。
 * @returns {Promise<{ok:boolean, failures:number}>}
 */
export async function runBackendUnitTests() {
  console.log('--- 后端单测（按模块分组）---');
  const res = await runQueue();
  if (res.failures > 0) {
    console.log(`\n✗ 后端单测失败 ${res.failures} 项（共 ${res.checks} 组）。`);
  } else {
    console.log(`\n✓ 后端单测全部通过（共 ${res.checks} 组）。`);
  }
  return { ok: res.ok, failures: res.failures };
}

// CLI 主入口：以本文件运行（而非被 import）时执行
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBackendUnitTests().then((r) => {
    process.exit(r.ok ? 0 : 1);
  }).catch((err) => {
    console.error('单测执行异常:', err);
    process.exit(1);
  });
}
