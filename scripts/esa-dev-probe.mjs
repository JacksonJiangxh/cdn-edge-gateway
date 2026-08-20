/**
 * esa-dev-probe.mjs —— 真机 ESA dev 子请求审计脚本
 * ----------------------------------------------------------------------------
 * 用途：用 esa-cli dev 跑真机 ESA 运行时（edgeworker2），连接用户 Webdis db3，
 *       真实测量各请求路径的子请求数，重点验证：
 *         · 冷启动隐藏子请求（ensureGlobalRulesSeeded 写 + reconcileVersion 后台读 + loadConfigSnapshot MGET）
 *         · 数据面回源 fetch 数
 *         · 管理面子请求数
 *         · 组合是否超过 ESA 软限制 8
 *
 * 前置（由主流程保证）：
 *   · 已 chmod -R 777 /root/.ew2/edgeworker2（运行时可执行）
 *   · 本机已 npm i -g esa-cli（v1.0.11）
 *
 * 写操作（用户已授权）：
 *   · FLUSHDB db3（清理旧数据）
 *   · 往 db3 自灌临时配置（临时域名 esa-probe.test + httpbin 源站）
 *
 * 运行：node scripts/esa-dev-probe.mjs
 * ============================================================================
 */
import { spawn, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// ---- 用户 Webdis 凭据（用户提供，已授权）----
const REDIS_URL = 'https://redis.jxh.cc.cd';
const REDIS_TOKEN = 'Basic amlhbmd4aDpqaWFuZzIxMjQ='; // jiangxh:jiang2124
const REDIS_DB = 3;

const DEV_PORT = 8799;
const DEV_HOST = '127.0.0.1';
const PROBE_HOST = 'esa-probe.test'; // 临时测试域名，灌进配置指向 httpbin

// ---- 复用项目内持久化适配，确保灌配置与运行时读配置键名/编码一致 ----
const { createRedisKV } = await import('../src/platform/redis-kv.js');
const { encodeKey } = await import('../src/platform/keyCodec.js');
const { cloneGlobal } = await import('../src/config/global.js');
const { cloneGlobalRules } = await import('../src/config/stages-defaults.js');

const log = (...a) => console.log('[probe]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// 阶段 A：清 db3 + 自灌临时配置
// ============================================================================
async function flushDb3() {
  // Webdis 默认禁用 FLUSHDB，改用 KEYS + DEL 清空本网关（esa: 前缀）键。
  // 等效于清空 db3 中的项目数据；用户已授权清理旧数据。
  const keysRes = await fetch(`${REDIS_URL}/${REDIS_DB}/KEYS/esa:*`, {
    headers: { Authorization: REDIS_TOKEN },
  });
  const keysJson = await keysRes.json();
  const keys = keysJson.KEYS || [];
  if (keys.length === 0) {
    log('db3 当前无 esa: 键，无需清理');
    return;
  }
  // 逐个 DEL（Webdis 不支持批量 DEL 数组，逐条调用）
  let ok = 0;
  for (const k of keys) {
    const r = await fetch(`${REDIS_URL}/${REDIS_DB}/DEL/${encodeURIComponent(k)}`, {
      method: 'POST',
      headers: { Authorization: REDIS_TOKEN },
    });
    if (r.ok) ok++;
  }
  log(`DEL db3 esa:* => 共 ${keys.length} 键，成功删除 ${ok}`);
}

async function seedConfig() {
  const env = { REDIS_URL, REDIS_TOKEN, REDIS_DB, REDIS_PREFIX: 'esa:' };
  const kv = createRedisKV(env);

  const global = cloneGlobal();
  global.adminPath = '__panel';
  global.adminDomain = '';
  global.configCacheTtl = 60;

  const sites = {
    hosts: [PROBE_HOST],
    wildcards: [],
    byHost: {
      [PROBE_HOST]: {
        host: PROBE_HOST,
        pool: 'httpbin',
        mode: 'proxy',
      },
    },
  };

  const pools = {
    ids: ['httpbin'],
    byId: {
      httpbin: {
        id: 'httpbin',
        origins: [{ url: 'http://127.0.0.1:8801', weight: 1 }],
        healthCheck: { enabled: false },
      },
    },
  };

  const globalRules = { stages: cloneGlobalRules() };

  await kv.put('cfg:version', JSON.stringify(1));
  await kv.put('cfg:global', JSON.stringify(global));
  await kv.put('cfg:sites', JSON.stringify(sites));
  await kv.put('cfg:pools', JSON.stringify(pools));
  await kv.put('cfg:global_rules', JSON.stringify(globalRules));
  log('已自灌临时配置：version/global/sites/pools/global_rules');

  // 自检：读回一次，确认落库与编码正确
  const back = await kv.get('cfg:global', 'json');
  if (!back || back.adminPath !== '__panel') {
    throw new Error('自检失败：cfg:global 读回异常 => ' + JSON.stringify(back));
  }
  log('自检通过：cfg:global 读回 adminPath =', back.adminPath);
}

// ============================================================================
// 本地 mock 源站（绕过运行时对外 https 的 deno_fetch 兼容性问题，得到真实回源计数）
// ============================================================================
function startMockOrigin() {
  const srv = spawn('node', ['-e', `
    const http=require('http');
    http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<h1>mock-origin-ok</h1>');}).listen(8801,'127.0.0.1',()=>console.log('mock-origin on 8801'));
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  return srv;
}

// ============================================================================
// 阶段 B：先在当前进程 env 下构建（确保 ESA_BUILD_* 烤进 __BUILD_ENV__），
//         再 spawn esa-cli dev（复用产物，避免 dev 内部 build 丢失变量）
// ============================================================================
function buildWithEnv() {
  // 直接在当前 process.env 设置，确保 npm run build 子进程继承
  process.env.ESA_BUILD_REDIS_URL = REDIS_URL;
  process.env.ESA_BUILD_REDIS_TOKEN = REDIS_TOKEN;
  process.env.ESA_BUILD_REDIS_DB = String(REDIS_DB);
  process.env.ESA_BUILD_REDIS_PREFIX = 'esa:';
  process.env.ESA_BUILD_CLOUD_PLATFORM = 'esa';
  process.env.ESA_BUILD_STATIC_CONFIG = '0';
  process.env.ESA_BUILD_JWT_SECRET =
    'esa-probe-dev-only-' + createHash('sha1').update(String(Date.now())).digest('hex').slice(0, 16);
  process.env.ESA_BUILD_ADMIN_PASSWORD = 'esa-probe-dev-only';
  log('构建期环境变量已设置，执行 npm run build ...');
  execSync('npm run build', { stdio: 'inherit', env: process.env });
  log('build 完成');
}

function startDev() {
  const env = { ...process.env };
  log('spawn: esa-cli dev ./esa/index.js -p', DEV_PORT);
  const p = spawn(
    'esa-cli',
    ['dev', './esa/index.js', '-p', String(DEV_PORT), '--skip-update-check'],
    { env, cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
  );
  p.stdout.on('data', (d) => process.stdout.write('[dev] ' + d));
  p.stderr.on('data', (d) => process.stdout.write('[dev-err] ' + d));
  return p;
}

async function waitForDev(timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://${DEV_HOST}:${DEV_PORT}/`, {
        method: 'GET',
        headers: { Host: PROBE_HOST },
      });
      // 只要能连上并拿到响应（任意状态码）即视为就绪
      log('dev 就绪，探测状态 =', res.status);
      return true;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error('dev 启动超时');
}

// ============================================================================
// 阶段 C：驱动场景并打印 X-Subreq-Used
// ============================================================================
async function hit(method, path, host = PROBE_HOST, body = null) {
  const res = await fetch(`http://${DEV_HOST}:${DEV_PORT}${path}`, {
    method,
    headers: { Host: host, 'content-type': 'application/json' },
    body,
    redirect: 'manual',
  });
  const used = res.headers.get('x-subreq-used');
  const limit = res.headers.get('x-subreq-limit');
  return { status: res.status, used, limit, path, host };
}

async function runScenarios() {
  const rows = [];

  // 1) 冷启动 · 数据面（首个请求：触发 loadConfigSnapshot + ensureGlobalRulesSeeded + 回源 fetch）
  log('场景1：冷启动数据面');
  rows.push({ name: '冷启动·数据面', ...(await hit('GET', '/')) });

  // 2) 稳态 · 数据面 ×3（内存缓存生效）
  log('场景2：稳态数据面 ×3');
  for (let i = 1; i <= 3; i++) {
    rows.push({ name: `稳态·数据面#${i}`, ...(await hit('GET', '/')) });
  }

  // 3) 数据面 · 带路径（回源 /get 路径，验证同站静态 fetch 是否触发）
  log('场景3：数据面带路径 /get');
  rows.push({ name: '数据面·/get', ...(await hit('GET', '/get')) });

  // 4) 管理面 · 页面
  log('场景4：管理面页面 /__panel');
  rows.push({ name: '管理面·页面', ...(await hit('GET', '/__panel')) });

  // 5) 管理面 · 读取 API（global 配置读取）
  log('场景5：管理面API /__panel/api/config/global');
  rows.push({ name: '管理面·API', ...(await hit('GET', '/__panel/api/config/global')) });

  // 6) 数据面 · 另一个域名（未命中站点，走 disguise）
  log('场景6：未命中域名（disguise）');
  rows.push({ name: '未命中域名', ...(await hit('GET', '/', 'unknown.example.com')) });

  return rows;
}

function report(rows) {
  log('================ 子请求审计结果 ================');
  log('场景'.padEnd(20), '状态', 'used', 'limit');
  for (const r of rows) {
    const used = r.used == null ? 'n/a' : r.used;
    const limit = r.limit == null ? 'n/a' : r.limit;
    const flag = r.used != null && Number(r.limit) && Number(r.used) > Number(r.limit) ? ' ⚠超预算' : '';
    log(String(r.name).padEnd(20), String(r.status).padEnd(5), String(used).padEnd(4), String(limit), flag);
  }
  log('================================================');
  log('说明：used 取自 X-Subreq-Used 响应头（真机运行时计数）；');
  log('冷启动 used 含 loadConfigSnapshot(MGET=1) + ensureGlobalRulesSeeded(写=1) + 回源 fetch + 可能 cache 操作。');
  log('后台 reconcileVersion 走 waitUntil，不计入主响应 used（看 dev 日志 [SUBREQ-AUDIT]）。');
}

// ============================================================================
// 主流程
// ============================================================================
async function main() {
  log('=== 阶段A：清 db3 + 自灌配置 ===');
  await flushDb3();
  await seedConfig();

  log('=== 阶段B：先构建，再启动真机 dev ===');
  buildWithEnv();
  const mock = startMockOrigin();
  await sleep(800);
  const dev = startDev();
  let exitCode = 0;
  try {
    await waitForDev();
    // 等 1s 让首请求前的预热日志刷出
    await sleep(1000);
    log('=== 阶段C：驱动场景 ===');
    const rows = await runScenarios();
    report(rows);
  } catch (e) {
    log('运行异常：', e?.message || e);
    exitCode = 1;
  } finally {
    log('终止 dev 进程');
    dev.kill('SIGTERM');
    try { mock.kill('SIGTERM'); } catch {}
    // 等待子进程退出
    await new Promise((r) => {
      dev.on('exit', r);
      setTimeout(r, 3000);
    });
  }
  process.exit(exitCode);
}

main().catch((e) => {
  console.error('[probe] FATAL', e);
  process.exit(1);
});
