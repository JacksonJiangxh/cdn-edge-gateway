#!/usr/bin/env node
// =============================================================================
// gen-deploy-config.mjs — 部署前动态生成「一次性」wrangler 配置
// -----------------------------------------------------------------------------
// 解决 wrangler deploy 的全量覆盖语义：
//   只要 toml 没声明某绑定，远程已存在的 KV/R2/D1 绑定就会被清空；
//   toml 里写死的变量会覆盖远程同名 Secret。
//
// 正确做法（已修正）：
//   资源 id / 桶名 / 库名【不是固定的】——是系统生成或用户自定义的。
//   所以不能「按资源名猜测」，必须【按 binding 类型去拉远程已绑定的真实配置】。
//
//   本脚本直接调 Cloudflare API 拉取该 Worker 的远程完整配置，提取所有
//   KV 命名空间 / R2 桶 / D1 库 绑定（含真实 id/桶名/库名/绑定名），
//   原样追加进「临时 toml」，使部署保留这些绑定——小白资源随便命名都行。
//
//   兼容性说明：
//     - 服务运行所需的代码契约绑定 CDN_KV / CDN_R2 / CDN_DB 仍会被保留；
//     - 同时，用户在 Dashboard 额外绑定的任何 KV / R2 / D1（如多 R2 桶
//       BUCKET_A / BUCKET_B）也会一并保留，避免 wrangler deploy 的全量覆盖
//       把它们清空。运行时按源站配置的 r2Binding 名从 env 动态取桶。
//
//   变量 ADMIN_PATH：本脚本【刻意不处理】。adminPath 的生效值是
//   「KV 中管理面保存的值 > 内置默认 __panel」，部署时用内置默认兜底，
//   部署后由用户在管理面把入口前缀改成随机串并存进 KV（最高优先级生效）。
//   这样变量页面不会出现 ADMIN_PATH，避免小白误以为入口一直是 __panel。
//
// 用法：
//   node scripts/gen-deploy-config.mjs
//   依赖环境变量（CI 已注入）：
//     CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
//     script 名取根 wrangler.toml 的 name 字段。
// =============================================================================

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const BASE_TOML = `${ROOT}/wrangler.toml`;
const OUT_TOML = `${ROOT}/wrangler.deploy.toml`;

// 各绑定类型的字段映射：key 是远程 API 返回的取值字段，toField 是写入 toml 的字段名。
// 注意：这里不再绑定「具体 binding 名」，而是按「类型」保留该类型下【全部】远程绑定，
// 使 CDN_KV/CDN_R2/CDN_DB（代码契约）与用户在 Dashboard 额外绑定的 KV/R2/D1 都能安全存活。
const TARGET_TYPES = {
  kv_namespace: { key: "namespace_id", toField: "id" },
  r2_bucket: { key: "bucket_name", toField: "bucket_name" },
  d1: { key: "id", toField: "database_id" },
};

// ---- 读根 toml 的 name（script 名）----
function getScriptName() {
  const t = readFileSync(BASE_TOML, "utf8");
  const m = t.match(/^\s*name\s*=\s*"([^"]+)"/m);
  return m ? m[1] : "cdn-edge-gateway";
}

// ---- 调 CF API 拉远程 Worker 配置 ----
// ⚠️ 必须用 /settings 子资源端点 + Accept: application/json。
// 根脚本端点 GET /workers/scripts/{name} 默认返回 multipart 形式的代码包，
// JSON.parse 会直接抛错，导致「拉取失败 → 跳过绑定探测 → 部署清空远程绑定」。
// /settings 端点返回纯 JSON 的 { result: { bindings: [...] } }，稳定可靠。
//
// 🔒 失败即中断（C6 修复，严格模式 A）：拉取远程绑定是「保留线上绑定、避免清空」的
//    前置探测。一旦探测失败（凭据缺失 / 网络错误 / token 无权限 / Worker 尚未
//    部署导致 /settings 返回 404 无绑定信息），**必须让流水线失败退出**，绝不能用
//    空绑定继续 `wrangler deploy`（全量覆盖语义会清空远程已绑定的 KV/R2/D1）。
//    正确流程：先在 Dashboard 创建 Worker 并绑定 CDN_KV/CDN_R2/CDN_DB，
//    再触发部署，脚本才能探测到并保留它们。
//    ⚠️ 严格模式含义：即使 Worker「从未部署过」（/settings 返回 404）也会被
//    视为失败而中止流水线——首次部署需先在 Dashboard 手动建壳并绑好
//    CDN_KV/CDN_R2/CDN_DB，再触发 CI 部署，不可用空绑定覆盖。这是 A 方案的
//    刻意取舍（宁可卡住首次部署，也不冒清空风险），勿擅自改为「404 放行」。
function fetchRemoteBindings(scriptName) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    console.error(
      "✗ [gen-deploy-config] 缺少 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID，无法探测远程绑定。\n" +
      "  请先在仓库 Secret（GitHub Actions）或密钥仓库（CNB）配置这两个变量，\n" +
      "  否则部署会清空远程已绑定的 KV/R2/D1。流水线中止。"
    );
    process.exit(1);
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${scriptName}/settings`;
  try {
    const out = execFileSync(
      "curl",
      [
        "-fsS",
        "-H", `Authorization: Bearer ${token}`,
        "-H", "Accept: application/json",
        url,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const json = JSON.parse(out);
    if (!json.success) {
      console.error(
        `✗ [gen-deploy-config] Cloudflare API 返回错误：code=${json.errors?.[0]?.code ?? "?"} ` +
        `${json.errors?.[0]?.message ?? JSON.stringify(json.errors ?? json)}`
      );
      process.exit(1);
    }
    return (json.result && json.result.bindings) || [];
  } catch (e) {
    console.error(
      "✗ [gen-deploy-config] 拉取远程绑定失败（网络错误 / token 无权限 / Worker 尚未部署过）。\n" +
      "  若 Worker 从未部署，请先在 Dashboard 创建并绑定 CDN_KV/CDN_R2/CDN_DB 后再部署。\n" +
      "  为保护线上绑定不被清空，流水线在此中止，不会继续 wrangler deploy。"
    );
    process.exit(1);
  }
}

// ---------- 1. 基线配置 ----------
let toml = readFileSync(BASE_TOML, "utf8");
toml = toml.replace(/\n# === AUTO-APPENDED-BINDINGS[\s\S]*$/u, "");

// ---------- 1.5 剥离平台开关，避免被误当作 [vars] 环境变量 ----------
// assets / preview_urls / observability 是 wrangler 顶层【平台功能开关】，
// 不是运行时环境变量。若基线 toml 把它们写在 [vars] 段内（历史版本曾如此），
// wrangler 会把它们以 env.assets / env.preview_urls / env.observability 形式
// 注入 Worker，既无意义又会污染变量页面。
// 这里统一从复制的基线中剥离这三行（含其顶层与 [vars] 内两种写法），
// 再在文件末尾以【规范顶层格式】重写，确保它们永远位于顶层、永不混入 [vars]。
toml = toml
  // 顶层 assets = { ... }
  .replace(/^\s*assets\s*=[\s\S]*?\}\s*$/m, "")
  .replace(/^\s*preview_urls\s*=\s*(true|false)\s*$/m, "")
  .replace(/^\s*observability\s*=[\s\S]*?\}\s*$/m, "")
  // 兜底：若它们曾被写进 [vars] 段（行内形式），也一并剥离
  .replace(/^\s*assets\s*=.*$/m, "")
  .replace(/^\s*preview_urls\s*=.*$/m, "")
  .replace(/^\s*observability\s*=.*$/m, "");

// ---------- 2. 按类型拉远程真实绑定（保留该类型下全部绑定） ----------
const scriptName = getScriptName();
const remote = fetchRemoteBindings(scriptName);
const appended = [];
// 同一类型的多个绑定名去重，避免同一绑定被重复写入 toml
const seen = new Set();

for (const [type, spec] of Object.entries(TARGET_TYPES)) {
  // 遍历远程该类型的全部绑定（不再限定固定 binding 名）
  for (const hit of remote.filter((b) => b.type === type)) {
    const bindingName = hit.name;
    if (!bindingName) continue;
    if (seen.has(`${type}:${bindingName}`)) continue;
    const value = hit[spec.key];
    if (!value) continue;
    seen.add(`${type}:${bindingName}`);

    if (type === "kv_namespace") {
      toml += `
# === AUTO-APPENDED-BINDINGS (CI 按远程绑定提取，勿手改) ===
[[kv_namespaces]]
binding = "${bindingName}"
id = "${value}"
`;
    } else if (type === "r2_bucket") {
      // jurisdiction 是 CF 后台给 R2 绑定默认附加的字段（如 default / eu / fedramp）。
      // 远程读取时原样保留，否则 wrangler deploy 对比时会产生空 {} diff warning
      // （功能不受影响，但会误导用户以为绑定有问题）。
      const jur = hit.jurisdiction ? `jurisdiction = "${hit.jurisdiction}"\n` : "";
      toml += `
[[r2_buckets]]
binding = "${bindingName}"
${jur}${spec.toField} = "${value}"
`;
    } else if (type === "d1") {
      const dbName = hit.database_name ? `database_name = "${hit.database_name}"\n` : "";
      toml += `
[[d1_databases]]
binding = "${bindingName}"
${dbName}${spec.toField} = "${value}"
`;
    }
    // 隐私保护：只记录绑定名（CDN_KV / CDN_R2 / BUCKET_A 等用户自定义标识符），
    // 【绝不】把资源真实值（KV namespace id / R2 桶名 / D1 database id）打进 CI 日志。
    appended.push(bindingName);
  }
}

// ---------- 3. ADMIN_PATH：刻意不传 ----------
// 设计：adminPath 的生效值是「KV 中管理面保存的值 > 内置默认 __panel」。
// 部署时【不注入】ADMIN_PATH 变量/Secret，使运行时始终用内置默认 __panel 兜底，
// 部署后由用户在管理面把入口前缀改成自己的随机串并存入 KV（最高优先级生效）。
// 这样变量页面不会出现 ADMIN_PATH，避免小白误以为入口一直是 __panel、
// 而实际 KV 里已是别的值（认知错乱）。若用户确实在 Dashboard 主动设了
// ADMIN_PATH，运行时 env 层仍会作为兜底生效（src/config/store.js）。
console.log("✓ ADMIN_PATH 不注入（部署后用管理面修改并存 KV，优先级最高）");

// ---------- 3.5 CLOUD_PLATFORM：无需注入，仅提示 ----------
// 该变量声明部署厂商。真正的保障在构建期：build.mjs 用 esbuild define 把默认值
// 'cf' 烘焙进 _worker.js，caps.js 读不到运行时变量时即用它兜底。
// 基线 wrangler.toml 的 [vars] 只是可选的双保险（本脚本整体复制基线 toml，
// 有就自动带上），缺失也不影响运行，故这里只提示、不中断流水线。
if (/^\s*CLOUD_PLATFORM\s*=\s*"(cf|eo|esa)"/m.test(toml)) {
  console.log('✓ CLOUD_PLATFORM 已随 [vars] 一并注入（构建期另有烘焙默认值兜底）');
} else {
  console.log("· CLOUD_PLATFORM 未在 [vars] 中声明——依赖构建期烘焙的默认值，无需处理");
}

// ---------- 3.6 平台开关：以规范顶层格式重写（绝不在 [vars] 内） ----------
// 这些不是环境变量，是 wrangler 顶层配置项。assets 为构建产物静态层必需，
// preview_urls 显式关闭避免 workers.dev 下被默认开启，observability 开启日志追踪。
toml += `
# === 平台功能开关（顶层，非 [vars] 环境变量） ===
assets = { directory = "./dist/public", binding = "ASSETS", html_handling = "none", not_found_handling = "none" }
preview_urls = false
`;

// 可观测性：Logs 全量（免费）+ Traces 10% 采样（控成本）。
// 必须用完整 [observability] 表写法（而非行内 observability = { enabled = true }），
// 否则 wrangler 会忽略该开关、导致远程面板里 Logs/Traces 显示关闭（历史踩坑）。
// 根 wrangler.toml 现采用完整表写法，其 [observability] 块在第 1.5 节不会被剥离
// （剥离正则只匹配行内形式），会被复制进临时 toml；此时此处不可再追加，否则出现
// 重复的 [observability] 表使 toml 解析报错。仅当基线仍是旧行内写法（已被 1.5 剥离）时才补写。
if (!/^\[observability\]/m.test(toml)) {
  toml += `
# 可观测性：Logs 全量（免费）+ Traces 10% 采样（控成本）。
[observability]
enabled = true
head_sampling_rate = 1.0

[observability.traces]
enabled = true
head_sampling_rate = 0.1
`;
}

// ---------- 4. 写出临时 toml ----------
writeFileSync(OUT_TOML, toml);
console.log(`✓ 已生成临时配置: ${OUT_TOML}`);
console.log(
  appended.length
    ? `✓ 已保留 ${appended.length} 个 KV/R2/D1 绑定（绑定名: ${appended.join(", ")}；资源 ID 已隐藏不打印）`
    : "⚠ 远程未探测到任何 KV/R2/D1 绑定（请先在 Dashboard 创建并绑定，服务运行必需 CDN_KV/CDN_R2/CDN_DB）"
);

// ⚠️ 注意：不要在脚本内注册 process.on("exit", unlinkSync(...))。
// 当前部署流程是「先 node 生成 wrangler.deploy.toml，再由 wrangler deploy -c
// 读取它」的两段式。若在此进程退出时删除该文件，wrangler 进程拿到的就是
// 已删除的文件（ENOENT）。临时文件由调用方（deploy:cf / CI）在部署完成后
// 显式 rm -f 清理，这里只负责生成，绝不自行删除。
