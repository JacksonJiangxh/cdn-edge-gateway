// deploy-esa-cli.mjs — 基于阿里云官方 ESA CLI（esa-cli）+ 仓库 esa.jsonc 部署 ESA Pages。
//
// 与「SDK + OSS 中转上传」方案不同，本脚本**完全不依赖 OSS**：
// 由 esa-cli 读取 esa.jsonc（entry + assets.directory）完成打包，
// 上传与构建由阿里云后台处理（与控制台/GitHub 连接的部署通道一致）。
//
// 前置条件：
//   1) RAM 用户/角色已授权 AliyunESAFullAccess，并已在 ESA 控制台开启 Functions & Pages；
//   2) 认证：执行 `esa-cli login`（AK/SK），或设置环境变量（ALIBABA_CLOUD_ACCESS_KEY_ID/SECRET 等，
//      具体以 esa-cli login 的环境变量模式为准）；
//   3) 已运行 `npm run build` 产出 _worker.js 与 dist/public。
//
// 用法：
//   node scripts/deploy-esa-cli.mjs [env] [description]
//     env         默认 production（也可 staging）
//     description 本次部署说明，默认 "deploy <时间戳>"

import { existsSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const ENV = process.argv[2] || 'production';
const DESC = process.argv[3] || `deploy ${new Date().toISOString()}`;

// ---- 0) 校验构建产物 ----
const WORKER = join(ROOT, '_worker.js');
const INDEX_SHELL = join(ROOT, 'esa', 'index.js');
const ASSETS_DIR = join(ROOT, 'dist', 'public');

if (!existsSync(WORKER)) {
  console.error('✗ 未找到 _worker.js，请先运行 npm run build');
  process.exit(1);
}
if (!existsSync(INDEX_SHELL)) {
  console.error('✗ 未找到 ESA 入口薄壳 esa/index.js（应转发 _worker.js）');
  process.exit(1);
}
if (!existsSync(ASSETS_DIR)) {
  console.error('✗ 未找到静态资源目录 dist/public，请先运行 npm run build');
  process.exit(1);
}
if (!existsSync(join(ROOT, 'esa.jsonc'))) {
  console.error('✗ 未找到 esa.jsonc，esa-cli 需要它来定位 entry 与 assets');
  process.exit(1);
}

// ---- 1) 解析 esa.jsonc 的 name（仅用于日志展示）并校验不含平台开关误写 ----
let routineName = basename(ROOT);
try {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(join(ROOT, 'esa.jsonc'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n');
  const cfg = JSON.parse(raw);
  routineName = cfg.name || routineName;

  // ESA 的 jsonc 只认顶层字段（name/entry/installCommand/buildCommand/assets），
  // 不支持 env，也没有 CF 那种 assets 之外的「开关」（preview_urls/observability/cache）。
  // 若误写入这些 CF 风格字段，esa-cli 会忽略或报错，提前拦下避免困惑。
  const SWITCH_LIKE = ['preview_urls', 'observability', 'cache', 'compatibility_date', 'compatibility_flags'];
  const bad = SWITCH_LIKE.filter((k) => k in cfg);
  if (bad.length) {
    console.error(
      `✗ esa.jsonc 含 CF 风格平台开关字段 ${bad.join(', ')}——ESA 不支持，且它们不是运行时变量，请删除（ESA 无此类开关）。`
    );
    process.exit(1);
  }
  // ESA 的 assets 是合法顶层字段（静态资源目录），非变量——确认其形态
  if (cfg.assets && typeof cfg.assets !== 'object') {
    console.error('✗ esa.jsonc 的 assets 应为对象（如 { directory: "./dist/public" }），且是顶层字段而非变量');
    process.exit(1);
  }
} catch (e) {
  console.error('✗ esa.jsonc 解析失败：', e.message);
  process.exit(1);
}
console.log(`▸ 目标 Routine/Pages: ${routineName}  env=${ENV}`);

// ---- 2) 确保 esa-cli 可用（优先本地 .bin，其次全局，最后 npx 临时下载）----
function resolveEsaCli() {
  const localBin = join(ROOT, 'node_modules', '.bin', 'esa-cli');
  if (existsSync(localBin)) return localBin; // 作为 devDependency 安装时直接命中
  const probe = spawnSync('esa-cli', ['--version'], { cwd: ROOT, encoding: 'utf8' });
  if (probe.status === 0) return 'esa-cli';
  return 'npx esa-cli';
}

const ESA = resolveEsaCli();
console.log(`▸ 使用 ESA CLI: ${ESA}`);

// ---- 3) commit：打包并生成版本（不依赖 OSS，后台上传）----
console.log('▸ 执行 esa-cli commit ...');
const commit = spawnSync(ESA, ['commit', '--description', DESC], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
});
if (commit.status !== 0) {
  console.error('✗ esa-cli commit 失败（请确认已 esa-cli login 且 AK 有 AliyunESAFullAccess）');
  process.exit(commit.status || 1);
}

// ---- 4) deploy：部署到目标环境（非交互）----
console.log(`▸ 执行 esa-cli deploy --environment ${ENV} ...`);
const deploy = spawnSync(ESA, ['deploy', '--environment', ENV, '--description', DESC], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: true,
});
if (deploy.status !== 0) {
  console.error('✗ esa-cli deploy 失败');
  process.exit(deploy.status || 1);
}

console.log('\n=== ESA Pages 部署完成（esa-cli，未使用 OSS）===');
console.log('下一步：在 ESA 控制台为该 Routine/Pages 绑定域名/路由。');
console.log('── 变量 vs 开关 说明（ESA）──');
console.log('  • 【运行时变量】全部在 ESA 控制台「环境变量」设置（esa.jsonc 不支持 env 字段）：');
console.log('      CLOUD_PLATFORM=esa  REDIS_URL=<必填>  ADMIN_PASSWORD/JWT_SECRET=<可选>');
console.log('  • 【平台开关】esa.jsonc 顶层只有 assets.directory（静态资源目录，合法顶层字段，非变量）。');
console.log('      ESA 无 preview_urls / observability / cache 等 CF 风格开关——请勿写入。');
