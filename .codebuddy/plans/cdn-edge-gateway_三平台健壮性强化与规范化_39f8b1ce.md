---
name: cdn-edge-gateway 三平台健壮性强化与规范化
overview: 系统审查并强化 cdn-edge-gateway 全项目（src/、web/、三平台薄壳、脚本），用规范语法/结构/导出统一 CF/EO/ESA 三平台适配，彻底消除「手写 gitignored 入口文件 + 字符串拼接转义」导致的构建期语法错误（括号丢失、<> 丢失、误转义），让 build 开箱即用、产物自检更强壮。
---

I have completed thorough exploration with full grounding. I'm ready to produce the final comprehensive plan in the required XML format.

The plan covers:

1. **Build self-containment** (auto-generate entry files) — the root cause of "build can't run out-of-box"
2. **Platform enum unification** (fix the confirmed `CLOUD_PLATFORM` run-time throw bug across CF/EO/ESA)
3. **Full code review & hardening** across all sources, shells, scripts
4. **Strengthened build verification**
5. **Cleanup leftover diag files**
6. **Documentation sync**

No new UI → no `<design>` tag. Using the `code-explorer` subagent, `lsp-code-analysis` skill, and the three platform skills.

<plan_result>
<req>

## 产品概述

对现有边缘回源网关（cdn-edge-gateway）做一次系统性健壮性改造：让「底层源码 → npm install → build → 部署」全流程开箱即能成功、产物语法稳定，并统一适配 Cloudflare(CF) / EdgeOne(EO) / 阿里云ESA 三平台的规范写法，从根上消除「构建成功但运行期出现语法/转义错误 → 再反向二分定位原始代码」的脆弱循环。

## 核心功能

- 构建链路自包含：`npm run build` 不再依赖被 gitignore 且仓库中缺失的手写入口文件，入口文件由构建自动生成。
- 统一 `CLOUD_PLATFORM` 平台枚举口径（规范值 `cf|eo|esa`），消除本地 dev 与 ESA 运行期的平台探测崩溃。
- 全面审查并规范化 `src/`、`web/`、三平台薄壳、构建/部署脚本的语法、结构、导出写法。
- 加固构建期自检（平台口径一致性、自动生成入口可解析、既有 HTML/JS/括号/产物校验）。
- 清理根目录残留诊断脚本，并同步 README 与部署文档。

## 边界与说明

- 用户已确认：无需兼容任何旧产物/旧版本；不做激进架构重写，仅做规范性修正与构建加固；改动面大（全面强化）。
</req>

<tech>

## 技术栈

- 运行平台：Cloudflare Workers / Pages、EdgeOne Makers、阿里云 ESA Functions/Pages
- 构建：Node.js ≥ 22 + esbuild ^0.28.1 + wrangler 4.x
- 语言：ESM（`"type":"module"`），统一 `cf|eo|esa` 三平台枚举

## 实施方案

### 1. 构建自包含：入口文件自动生成（根因修复）

当前 `build.mjs` 步骤0/1 读取 `web/_stage.entry.js` 与 `web/_app.entry.js`，二者被 `.gitignore` 排除且仓库中不存在，缺失即 `throw`，导致 `npm run build` 开箱即失败。改为：

- 新增 `scripts/gen-entries.mjs`：由 build 自动生成两个入口——
- `web/_stage.entry.js`：显式 re-export `src/config/stages.js` 的 `STAGE_ORDER / STAGE_OPS / STAGE_ALIASES / normalizeStage`，作为 esbuild 抽取前端阶段字典的输入（产出 `web/_stage.gen.js`）。
- `web/_app.entry.js`：`import './api.js'; import './app.js';` 聚合，作为前端 bundle 输入。
- `build.mjs` 在步骤0/1 前调用该生成器；生成物仍写入 `.gitignore`（构建期中间产物），但由构建生成而非人手写。
- 消除「用户手写入口文件 → 非标准导出/误转义」的最大风险源。

### 2. 统一平台枚举口径（消除运行期崩溃）

已探明矛盾点：规范值 `cf|eo|esa`（`src/platform/caps.js#readPlatform`、`contracts.js`、`wrangler.toml`、`docs/07/09/11/14`）与错误取值（`scripts/dev.mjs` 注入 `edgeone`/`cloudflare`、`.dev.vars` 模板 `edgeone`、`esa/index.js`/`esa.jsonc`/`deploy-esa-cli.mjs` 用 `aliyun-esa`、`docs/03/04/08` 用 `edgeone`/`pages`）。由于 `readPlatform()` 对非规范值直接 throw，本地 dev（`edgeone`）与 ESA（`aliyun-esa`）运行时会崩溃；而 `kv.js#isEsaPlatform` 却能容忍别名，行为不一致。统一方案：

- 确立 `cf|eo|esa` 为唯一规范源（`caps.js#VALID_PLATFORMS`）。
- `caps.js#readPlatform()` 对旧别名做安全归一（`edgeone→eo`、`cloudflare→cf`、`aliyun-esa→esa`、`pages→cf`）并 `console.warn`，消除运行期崩溃的同时保留向后兼容。
- `scripts/dev.mjs` 注入值改为 `eo`/`cf`；`.dev.vars` 默认模板同步；`esa/index.js` 强制值改为 `esa`；`esa.jsonc`、`deploy-esa-cli.mjs` 提示文案同步。
- 同步修正 `docs/03`、`docs/04`、`docs/08` 中错误取值说明，与 `docs/07/09/11/14` 对齐。

### 3. 全面审查与规范化（源码 + 薄壳 + 脚本）

- 使用 code-explorer 子代理 + lsp-code-analysis 全量遍历：定位所有 `CLOUD_PLATFORM` 直读、`window.API` 全局副作用、`_stage.gen.js` import 链路、`ui.gen.js` 内联字符串拼接/转义、`<>`/括号拼接处，识别脆弱写法并统一 ESM 导入导出风格。
- 核对 `src/entry.js` 三平台双导出（`export async function onRequest` + `export default {fetch}`）、`edge-functions/[[default]].js` 与 `esa/index.js` 薄壳的转发契约，保证导出面与 `build.mjs#verify()` 的断言（onRequest / default.fetch）一致。
- 在不改变业务行为前提下做规范性修正；存疑处仅记录到审查报告，不做激进重写。

### 4. 加固构建自检

- 在 `build.mjs#verify()` 中新增：平台枚举口径一致性检查（断言关键文件的 `CLOUD_PLATFORM` 取值仅出现规范值）与自动生成入口可解析断言。
- `package.json` 增加 `check` 脚本（轻量静态口径检查），供提交前/CI 使用。

### 5. 清理残留

- 删除根目录 `_diag_stage.mjs`、`_verify_tmp.mjs`（已确认无任何引用）。

### 6. 文档与 README 同步

- 更新 `README.md` 构建说明与 `docs/`，反映「入口文件自动生成」新机制、`CLOUD_PLATFORM` 唯一取值、新增的 `check` 脚本，并修正 `docs/14` 中不存在的 `detectAliyunEsaRuntime` 过时描述。

## 架构说明

- 改动聚焦「构建自包含 + 平台口径统一 + 校验加固」，保持既有分层（core/proxy/balancer/config/security/stats/api/platform）与数据流不变。
- 三平台收敛点仍为 `src/entry.js` 双导出，薄壳纯转发 `_worker.js`，不引入新架构模式。

## 目录结构

```
/workspace/
├── build.mjs                        # [MODIFY] 调用 gen-entries 自动生成入口；新增平台口径与生成成功性自检
├── scripts/
│   ├── gen-entries.mjs              # [NEW] 生成 web/_stage.entry.js 与 web/_app.entry.js（build/dev 复用）
│   ├── dev.mjs                      # [MODIFY] CLOUD_PLATFORM 注入值统一为 eo/cf
│   └── deploy-esa-cli.mjs           # [MODIFY] 提示文案 aliyun-esa → esa
├── .dev.vars                        # [MODIFY] 默认模板 CLOUD_PLATFORM=edgeone → eo（生成逻辑同步）
├── src/
│   ├── entry.js                     # [MODIFY] 核对并规范化三平台双导出与转发契约
│   └── platform/caps.js             # [MODIFY] readPlatform 别名归一 + 保留 VALID_PLATFORMS 规范源
├── web/
│   ├── _stage.entry.js              # [自动生成] 由 build 生成（替代手写 gitignored 文件）
│   ├── _app.entry.js                # [自动生成] 由 build 生成（替代手写 gitignored 文件）
│   ├── _stage.gen.js                # [自动生成] 构建期产物（保留现有机制）
│   ├── app.js                       # [MODIFY] 核对 _stage.gen.js import 链路与 IIFE 副作用入口
│   └── api.js                       # [MODIFY] 核对 window.API 副作用入口
├── edge-functions/[[default]].js    # [MODIFY] 核对薄壳导出转发
├── esa/
│   └── index.js                     # [MODIFY] 强制 CLOUD_PLATFORM 值 aliyun-esa → esa
├── esa.jsonc                        # [MODIFY] 环境变量取值说明 aliyun-esa → esa
├── edgeone.json                     # [核对] 部署配置（如无需改动则仅确认）
├── package.json                     # [MODIFY] 新增 check 脚本；核对 scripts
├── wrangler.toml                    # [核对] 平台枚举注释与规范值一致
├── _diag_stage.mjs                  # [DELETE] 残留诊断脚本
├── _verify_tmp.mjs                  # [DELETE] 残留诊断脚本
└── docs/                            # [MODIFY] 03/04/08/14 修正 CLOUD_PLATFORM 取值；README 同步新机制
```

## 关键代码结构（平台归一，最关键的契约）

```js
// src/platform/caps.js —— 唯一规范源，兼容旧别名
export const VALID_PLATFORMS = ['cf', 'eo', 'esa'];
const PLATFORM_ALIASES = { edgeone: 'eo', cloudflare: 'cf', 'aliyun-esa': 'esa', aliyun: 'esa', esa: 'esa', pages: 'cf' };

function readPlatform(env) {
  const declared = (readEnvVar(env, 'CLOUD_PLATFORM') || '').toLowerCase().trim();
  if (!declared) throw new Error('[caps] 必须设置环境变量 CLOUD_PLATFORM，取值为 cf / eo / esa 之一。');
  const canonical = PLATFORM_ALIASES[declared];
  if (!canonical) throw new Error(`[caps] CLOUD_PLATFORM 取值 "${declared}" 非法，必须为 cf / eo / esa 之一。`);
  if (canonical !== declared) console.warn(`[caps] CLOUD_PLATFORM="${declared}" 已归一为 "${canonical}"，建议显式使用 cf / eo / esa。`);
  return canonical;
}
```

```js
// scripts/gen-entries.mjs —— 构建期自动生成前端入口（不依赖手写 gitignored 文件）
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

export async function genStageEntry() {
  const src = `// 自动生成：由 scripts/gen-entries.mjs 从 src/config/stages.js 抽取前端阶段字典子集（勿手改）
export { STAGE_ORDER, STAGE_OPS, STAGE_ALIASES, normalizeStage } from '../src/config/stages.js';
`;
  await writeFile(join(ROOT, 'web/_stage.entry.js'), src, 'utf8');
}

export async function genAppEntry() {
  const src = `// 自动生成：聚合管理面前端（勿手改）
import './api.js';
import './app.js';
`;
  await writeFile(join(ROOT, 'web/_app.entry.js'), src, 'utf8');
}
```

</tech>

<extensions>

## Agent 扩展

### 子代理 (SubAgent)

- **code-explorer**
- 用途：全量遍历 `src/`、`web/`、三平台薄壳、脚本，系统识别脆弱写法（转义/编码/非标准导出/`CLOUD_PLATFORM` 直读/`window.API` 副作用/内联拼接），为「全面强化」提供完整、可核查的问题清单。
- 预期产出：问题清单（文件+行号+问题+修复建议），供逐项规范化。

### 技能 (Skill)

- **lsp-code-analysis**
- 用途：语义级定位 `CLOUD_PLATFORM`、`window.API`、`_stage.gen.js`、`ui.gen.js` 等符号的定义/引用/调用链，交叉核对三处平台枚举矛盾，验证入口自动生成后的 import 链路完整性与导出面契约。
- 预期产出：符号引用图，确认自动生成入口可被 esbuild 安全打包、导出面与 `build.mjs#verify()` 断言一致。
- **cloudflare**（CF 平台规范）
- 用途：核对 Cloudflare Workers/Pages 入口与 `export default {fetch}` / `onRequest` 导出的官方规范写法，校验 `wrangler.toml` 的静态资产/缓存配置。
- 预期产出：CF 入口与配置规范化校验结论。
- **edgeone-makers-tools**（EO 平台规范）
- 用途：核对 EdgeOne Makers 边缘函数目录约定（`edge-functions/[[default]].js`）与 `onRequest` 导出规范，确认 KV-only 收口策略正确。
- 预期产出：EO 薄壳导出面规范化校验结论。
- **alibabacloud-esa-pages-deploy**（ESA 平台规范）
- 用途：核对阿里云 ESA Pages/Functions 入口范式与 `esa.jsonc` 配置，验证 `esa/index.js` 薄壳 `fetch(request, env, ctx)` 转发契约与 `CLOUD_PLATFORM=esa` 归一。
- 预期产出：ESA 入口、薄壳、`esa.jsonc` 规范化校验结论。
</extensions>

<todolist>
<item id="review-full-code" deps="">用 [subagent:code-explorer] 与 [skill:lsp-code-analysis] 全量审查 src/web/薄壳/脚本，输出脆弱写法与平台口径问题清单</item>
<item id="auto-gen-entries" deps="review-full-code">新增 scripts/gen-entries.mjs，改造 build.mjs 自动生成 _stage.entry.js/_app.entry.js 取代手写 gitignored 入口</item>
<item id="unify-platform-enum" deps="review-full-code">统一 CLOUD_PLATFORM 为 cf|eo|esa：caps.js 别名归一，dev.mjs/.dev.vars/esa/index.js/esa.jsonc/deploy-esa-cli.mjs 全部对齐</item>
<item id="normalize-src-web" deps="review-full-code">规范化 src/entry.js、web/app.js、web/api.js 与三薄壳导出面，确保与 build.mjs 校验断言一致</item>
<item id="harden-build-check" deps="auto-gen-entries,unify-platform-enum">加固 build.mjs 自检（平台口径一致性+入口可解析），package.json 新增 check 脚本</item>
<item id="cleanup-and-docs" deps="normalize-src-web,harden-build-check">删除 _diag_stage.mjs/_verify_tmp.mjs，更新 README 与 docs/03/04/08/14 的取值说明与新机制</item>
</todolist>
</plan_result>