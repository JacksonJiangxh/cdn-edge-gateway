#!/usr/bin/env node
/**
 * 本地一键开发脚本（不依赖任何厂商平台）
 *
 * 用法：
 *   node scripts/dev.mjs                 # build + 启动本地 dev（模拟 EdgeOne 能力集）
 *   node scripts/dev.mjs --clean         # 先清空本地 KV (.wrangler) 再启动
 *   node scripts/dev.mjs --port 8788     # 自定义端口
 *   node scripts/dev.mjs --cf            # 以 Cloudflare 能力集启动（有缓存/D1 模拟）
 *   node scripts/dev.mjs --no-build      # 跳过 build（已 build 过想快点重启）
 *   node scripts/dev.mjs --local          # 仅本地回环监听（默认行为，外部不可访问）
 *
 * 等价于原来 npm run dev，但多了清缓存 / 换端口 / 切平台的能力。
 */
import { spawnSync, spawn } from "node:child_process";
import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const args = process.argv.slice(2);
const getOpt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] ?? def : def;
};
const hasFlag = (name) => args.includes(name);

const port = getOpt("--port", "8799");
const clean = hasFlag("--clean");
const noBuild = hasFlag("--no-build");
const cfMode = hasFlag("--cf");
// 管理面入口前缀（仅本地 dev 生效）：允许本地用 --admin-path xxx 或环境变量
// ADMIN_PATH 覆盖，便于演示入口前缀可变更、无需重新构建。缺省走代码默认 __panel。
// 注意：生产环境推荐「部署后管理面改 + 存 KV」（见 wrangler.toml / gen-deploy-config.mjs），
// 部署脚本刻意不传 ADMIN_PATH，此处覆盖仅作用于本地 Miniflare 运行时。
const adminPath = getOpt("--admin-path", process.env.ADMIN_PATH || "");
// 默认监听 0.0.0.0，便于 CNB / 云开发等容器环境的临时公网 URL 访问；
// 用 --local 可回退到仅 127.0.0.1 的本地模式。
const localOnly = hasFlag("--local");

// 1) 确保 .dev.vars 存在（干净 clone 也能跑）
const devVars = resolve(root, ".dev.vars");
const DEFAULT_DEV_VARS = `# 本地开发 Secrets（已被 .gitignore 忽略，切勿提交）
ADMIN_PASSWORD=local-dev-pass
JWT_SECRET=0011223344556677889900aabbccddeeff0011223344556677889900aabbccddeeff

# 声明本地模拟 EdgeOne 能力集
CLOUD_PLATFORM=edgeone
`;
if (!existsSync(devVars)) {
  writeFileSync(devVars, DEFAULT_DEV_VARS, "utf8");
  console.log("ℹ️  已生成默认 .dev.vars（本地口令 local-dev-pass）");
}

// 2) 清本地 KV
if (clean) {
  const state = resolve(root, ".wrangler");
  if (existsSync(state)) {
    rmSync(state, { recursive: true, force: true });
    console.log("🧹  已清空本地 KV 存储 (.wrangler)");
  }
}

// 3) build
if (!noBuild) {
  console.log("🔨  构建 _worker.js ...");
  // 本地开发显式关闭压缩（--no-minify），保证产物可读、便于调试；
  // 生产部署的 npm run build / deploy 默认即压缩（见 build.mjs）。
  const r = spawnSync("node", ["build.mjs", "--no-minify"], {
    cwd: root,
    stdio: "inherit",
  });
  if (r.status !== 0) {
    console.error("❌ build 失败，终止启动");
    process.exit(1);
  }
}

// 4) 平台能力集：默认 edgeone，--cf 切 cloudflare
const platform = cfMode ? "cloudflare" : "edgeone";
console.log(
  `🚀  启动本地 dev（端口 ${port}，平台能力集=${platform}${localOnly ? "，仅本地" : "，监听 0.0.0.0"}）`
);
console.log(`    管理面: http://${localOnly ? "127.0.0.1" : "0.0.0.0"}:${port}/__panel`);

// wrangler dev 默认绑定 127.0.0.1，只在本地可访问。
// 在 CNB / 云开发等容器环境里，临时公网 URL 会转发到容器端口，
// 需要 --ip 0.0.0.0 绑定所有网卡才能被外部访问；--local 时回退到回环监听。
// 注意：wrangler 的 --host 是「上游转发 host」，并非「监听地址」，此处用 --ip。
// 本地 dev 走独立的 wrangler.dev.toml，其中额外声明了 CDN_KV 绑定。
// wrangler 会用 Miniflare 在 .wrangler/ 下模拟 KV，不需要云端账号或真实 namespace id。
// 缺这个绑定时 getKV() 返回 null，登录与保存配置会直接 500，
// 干净 clone 下 `npm run dev` 就走不完「登录管理面」这一步。
// 该文件只在本地生效：wrangler deploy 仍读根 wrangler.toml + 控制台完成的绑定。
const wranglerArgs = [
  "dev",
  "-c",
  "wrangler.dev.toml",
  ...(localOnly ? [] : ["--ip", "0.0.0.0"]),
  "--port",
  port,
  "--var",
  `CLOUD_PLATFORM=${platform}`,
];
// ADMIN_PATH 通过 --var 注入本地 dev 运行时（--var 优先级高于 toml [vars]）。
// 仅本地 dev 用；生产部署由管理面存 KV 管理，部署脚本刻意不传该变量。
// 配置了才注入，避免空字符串覆盖默认值。
if (adminPath) {
  wranglerArgs.push("--var", `ADMIN_PATH=${adminPath}`);
}

const child = spawn("npx", ["wrangler", ...wranglerArgs], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code) => process.exit(code ?? 0));
