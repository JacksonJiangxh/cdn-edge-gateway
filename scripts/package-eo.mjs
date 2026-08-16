#!/usr/bin/env node
/**
 * ============================================================================
 * scripts/package-eo.mjs —— 产出 EO Makers「仅上传产物」部署包
 * ----------------------------------------------------------------------------
 * 目的：让 EdgeOne 部署与 Cloudflare 对齐——**本地先 build 好，云端只上传产物、
 * 不触发云端构建（不消耗 EO 构建次数，也不在云端重复跑 e2e 校验）**。
 *
 * 为什么不能直接 `edgeone makers deploy .`：
 *   - 仓库根 `edgeone.json` 含 `buildCommand: "npm run build"` + `installCommand`，
 *     `deploy .` 会把整个仓库推上去，EO 云端重新装依赖、跑 build（含 e2e）、再部署，
 *     既消耗构建次数，又让「带病部署拦截」在云端复现。
 *
 * 官方 CLI 文档明确支持「手动构建后传产物目录」：
 *   `edgeone makers deploy <目录>` 时，若目录内是已构建产物（含 edge-functions 薄壳
 *   + _worker.js + 静态资源），且不含触发构建的 buildCommand，云端不再重新构建。
 *
 * 本脚本产出 dist-eo/，结构：
 *   dist-eo/
 *     ├── edgeone.json        # 精简版：无 buildCommand / installCommand
 *     ├── edge-functions/[[default]].js   # 薄壳（转发 _worker.js）
 *     ├── _worker.js          # 已打包产物
 *     └── dist/public/        # 管理面静态资源（自动托管）
 *
 * 用法：node scripts/package-eo.mjs   （应在 npm run build 之后调用）
 * ============================================================================
 */

import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist-eo');

// 精简版 edgeone.json：刻意不含 buildCommand / installCommand，
// 使云端读取后不触发构建，直接托管已上传产物。
// outputDirectory 必须指向静态资源所在目录（dist/public），EO 会把它作为静态根托管
// /assets/app.js → dist-eo/dist/public/assets/app.js。若设为 '.' 则 EO 在 dist-eo/ 根
// 找 /assets，导致 404。
const EO_JSON = {
  name: 'cdn-edge-gateway',
  version: '1.0.0',
  description: '通用 CDN 回源加速网关 — EdgeOne Makers 部署配置（本地产物上传，不触发云端构建）',
  framework: 'others',
  outputDirectory: 'dist/public',
  env: {
    NODE_VERSION: '22',
    CLOUD_PLATFORM: 'eo',
  },
};

async function main() {
  const required = [
    join(ROOT, '_worker.js'),
    join(ROOT, 'edge-functions', '[[default]].js'),
    join(ROOT, 'dist', 'public', 'index.html'),
  ];
  const missing = required.filter((f) => !existsSync(f));
  if (missing.length) {
    throw new Error(
      'EO 部署包需要先本地构建产物，但缺失：\n  - ' +
        missing.map((f) => f.replace(ROOT + '/', '')).join('\n  - ') +
        '\n请先运行 `npm run build`。'
    );
  }

  // 清理旧包，确保幂等
  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'edge-functions'), { recursive: true });
  await mkdir(join(OUT, 'dist', 'public'), { recursive: true });

  // 1) 薄壳（保持相对 ../_worker.js 的引用关系）
  await cp(join(ROOT, 'edge-functions', '[[default]].js'), join(OUT, 'edge-functions', '[[default]].js'));
  // 2) 已打包 worker 产物（薄壳 import 的目标）
  await cp(join(ROOT, '_worker.js'), join(OUT, '_worker.js'));
  // 3) 静态资源：只拷贝 assets/，【刻意排除 dist/public/index.html】
  //    index.html 是管理面页面本身（含 app.js 前端）。若把它放进 EO 静态根，EO 会把它
  //    作为站点首页挂到 `/`，导致访问根路径直接暴露管理面登录页，绕过 core/app.js 的
  //    adminPath 校验门（安全漏洞）。管理面 HTML 必须由 worker 在 /{adminPath} 动态渲染
  //    （renderAdminPage → ui.gen.js 内联生成），assets 走 EO 静态托管即可。
  await mkdir(join(OUT, 'dist', 'public', 'assets'), { recursive: true });
  await cp(join(ROOT, 'dist', 'public', 'assets'), join(OUT, 'dist', 'public', 'assets'), { recursive: true });
  // 4) 精简 edgeone.json（无 buildCommand）
  await writeFile(join(OUT, 'edgeone.json'), JSON.stringify(EO_JSON, null, 2) + '\n', 'utf8');

  console.log('✓ EO 部署包已产出：dist-eo/（薄壳 + _worker.js + 静态资源 + 精简 edgeone.json，无 buildCommand）');
  console.log('  部署命令：edgeone makers deploy dist-eo -n <project> -t <token> -e <env>');
}

main().catch((e) => {
  console.error('✗ 产出 EO 部署包失败：', e.message);
  process.exit(1);
});
