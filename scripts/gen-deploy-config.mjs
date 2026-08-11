#!/usr/bin/env node
// =============================================================================
// gen-deploy-config.mjs — 部署前动态生成「一次性」wrangler 配置
// -----------------------------------------------------------------------------
// 解决 wrangler deploy 的全量覆盖语义：
//   只要 toml 没声明某绑定，远程已存在的 KV/R2/D1 绑定就会被清空；
//   toml 里写死的变量会覆盖远程同名 Secret。
//
// 正确做法（已修正）：
//   绑定（binding）名是固定的代码契约：CDN_KV / CDN_R2 / CDN_DB。
//   但资源的 id / 桶名 / 库名【不是固定的】——是系统生成或用户自定义的。
//   所以不能「按资源名猜测」，必须【按 binding 名去拉远程已绑定的真实配置】。
//
//   本脚本直接调 Cloudflare API 拉取该 Worker 的远程完整配置，提取
//   binding 名为 CDN_KV / CDN_R2 / CDN_DB 的条目（含真实 id/桶名/库名），
//   原样追加进「临时 toml」，使部署保留这些绑定——小白资源随便命名都行。
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

const TARGET_BINDINGS = {
  kv_namespace: { binding: "CDN_KV", key: "namespace_id", toField: "id" },
  r2_bucket: { binding: "CDN_R2", key: "bucket_name", toField: "bucket_name" },
  d1: { binding: "CDN_DB", key: "id", toField: "database_id" },
};

// ---- 读根 toml 的 name（script 名）----
function getScriptName() {
  const t = readFileSync(BASE_TOML, "utf8");
  const m = t.match(/^\s*name\s*=\s*"([^"]+)"/m);
  return m ? m[1] : "cdn-edge-gateway";
}

// ---- 调 CF API 拉远程 Worker 配置 ----
function fetchRemoteBindings(scriptName) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    console.log("⚠ 缺少 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID，跳过绑定探测");
    return [];
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${scriptName}`;
  try {
    const out = execFileSync(
      "curl",
      [
        "-fsS",
        "-H", `Authorization: Bearer ${token}`,
        "-H", "Content-Type: application/json",
        url,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const json = JSON.parse(out);
    return (json.result && json.result.bindings) || [];
  } catch (e) {
    console.log("⚠ 拉取远程绑定失败（可能 Worker 尚未部署过），跳过绑定探测");
    return [];
  }
}

// ---------- 1. 基线配置 ----------
let toml = readFileSync(BASE_TOML, "utf8");
toml = toml.replace(/\n# === AUTO-APPENDED-BINDINGS[\s\S]*$/u, "");

// ---------- 2. 按 binding 名拉远程真实绑定 ----------
const scriptName = getScriptName();
const remote = fetchRemoteBindings(scriptName);
const appended = [];

for (const [type, spec] of Object.entries(TARGET_BINDINGS)) {
  const hit = remote.find((b) => b.type === type && b.name === spec.binding);
  if (!hit) continue;
  const value = hit[spec.key];
  if (!value) continue;

  if (type === "kv_namespace") {
    toml += `
# === AUTO-APPENDED-BINDINGS (CI 按远程 binding 名提取，勿手改) ===
[[kv_namespaces]]
binding = "${spec.binding}"
id = "${value}"
`;
  } else if (type === "r2_bucket") {
    toml += `
[[r2_buckets]]
binding = "${spec.binding}"
${spec.toField} = "${value}"
`;
  } else if (type === "d1") {
    const dbName = hit.database_name ? `database_name = "${hit.database_name}"\n` : "";
    toml += `
[[d1_databases]]
binding = "${spec.binding}"
${dbName}${spec.toField} = "${value}"
`;
  }
  appended.push(`${spec.binding} → ${value}`);
}

// ---------- 3. ADMIN_PATH：刻意不传 ----------
// 设计：adminPath 的生效值是「KV 中管理面保存的值 > 内置默认 __panel」。
// 部署时【不注入】ADMIN_PATH 变量/Secret，使运行时始终用内置默认 __panel 兜底，
// 部署后由用户在管理面把入口前缀改成自己的随机串并存入 KV（最高优先级生效）。
// 这样变量页面不会出现 ADMIN_PATH，避免小白误以为入口一直是 __panel、
// 而实际 KV 里已是别的值（认知错乱）。若用户确实在 Dashboard 主动设了
// ADMIN_PATH，运行时 env 层仍会作为兜底生效（src/config/store.js）。
console.log("✓ ADMIN_PATH 不注入（部署后用管理面修改并存 KV，优先级最高）");

// ---------- 4. 写出临时 toml ----------
writeFileSync(OUT_TOML, toml);
console.log(`✓ 已生成临时配置: ${OUT_TOML}`);
console.log(
  appended.length
    ? `✓ 按 binding 名提取到远程绑定: ${appended.join(", ")}`
    : "⚠ 远程未探测到 CDN_KV/CDN_R2/CDN_DB 绑定（请先在 Dashboard 创建并绑定，binding 名须为 CDN_KV/CDN_R2/CDN_DB）"
);

process.on("exit", () => {
  try {
    unlinkSync(OUT_TOML);
  } catch {}
});
