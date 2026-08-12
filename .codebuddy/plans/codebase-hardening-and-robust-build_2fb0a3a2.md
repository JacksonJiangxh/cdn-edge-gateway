---
name: codebase-hardening-and-robust-build
overview: 对 cdn-edge-gateway 项目做全面代码审查与加固：规范 src/ 全部源码写法（转义、导出、结构、编码），重构 build.mjs 消除脆弱的 workaround（base64 内联 HTML、函数 replacement 防 $ 展开、前端不压缩、HTML 压缩保护 script/style），统一 web/ 与 src/ 的重复逻辑到单一权威源，保持三平台双导出兼容并加固，最终使 npm run build 三平台产物健壮、自检通过，从根上消除「构建成功但产物出现语法错误（误转义、括号丢失、<>标签丢失）」的脆弱链路。
todos:
  - id: audit-src
    content: 审查并规范 src/ 全部源码写法（转义、导出、结构、编码边界）
    status: completed
  - id: gen-stage
    content: 重构为单一权威源：src/config/stages.js 保持真相源，build 期生成 web/_stage.gen.js，web/app.js 改为 import 并删除硬编码副本
    status: completed
  - id: refactor-build-inline
    content: 重构 build 内联：用 esbuild text loader 替代 base64 内联 HTML/CSS，生成字符串版 src/ui.gen.js，同步改 adminPage.js 消费点
    status: completed
    dependencies:
      - gen-stage
  - id: refactor-build-frontend
    content: 前端走正常 esbuild bundle：app.js+api.js 压缩打包到 dist/public/assets/app.js，消除前端不压缩妥协
    status: completed
    dependencies:
      - gen-stage
  - id: remove-hacks
    content: 移除 build.mjs 中函数 replacement 防 $ 展开、HTML 压缩 script/style 保护、STAGE_OPS 文本切片断言等脆弱 hack
    status: completed
    dependencies:
      - refactor-build-inline
      - refactor-build-frontend
  - id: add-syntax-check
    content: 新增专项语法校验：esbuild transform 解析内联脚本 + 栈式校验 HTML 标签闭合与括号配对，失败即非零退出
    status: completed
    dependencies:
      - remove-hacks
  - id: verify-and-docs
    content: 运行 npm run build 验证三平台构建 + verify 自检全过，同步更新 docs 中描述的 workaround 章节
    status: completed
    dependencies:
      - add-syntax-check
---

## 用户需求

对 cdn-edge-gateway 项目做全面代码审查与加固，消除「构建成功但产物出现语法错误」的脆弱链路。适配 Cloudflare Workers/Pages、EdgeOne Pages、阿里云 ESA 三平台。

## 产品概述

本项目是运行在边缘平台的 CDN 反向代理网关（npm install → build → 部署）。当前 build 流程把 HTML/JS/CSS 当作字符串手动拼接、正则注入，并叠加了大量脆弱 workaround（base64 内联 HTML、函数 replacement 防  `展开、前端不压缩、HTML 压缩保护 script/style、STAGE_OPS 文本切片断言同步），导致产物频繁出现误转义、括号丢失、`<>` 标签丢失等语法错误，排查艰难。

## 核心特性

- 规范 `src/` 全部 51 个源码文件的写法（转义、导出、结构、编码），消除可疑写法与边界隐患。
- 重构 `build.mjs`：用 esbuild 原生能力（text loader / 正常 bundle）替代手动字符串拼接与 base64 内联，从根上消除误转义、括号丢失、标签丢失。
- 统一 `web/` 与 `src/` 的重复逻辑（STAGE_OPS 等）到单一权威源 `src/config/stages.js`，构建期生成前端配置副本，移除文本切片断言。
- 前端资源走正常 esbuild bundle（保留入口标记避免死代码消除），消除「前端不压缩」妥协。
- 保持三平台双导出（`onRequest` + `default.fetch`）+ 薄壳（`edge-functions/[[default]].js`、`esa/index.js`）不变，仅加固写法。
- 在 build 流程新增专项语法校验（内联脚本可被 esbuild parse、HTML 标签闭合、括号配对），持续拦截回归。
- 保留并强化产物自检 `verify()`（文件完整 + `_worker.js` 可加载 + 导出面正确）。

## Tech Stack

- 构建工具：Node.js + esbuild ^0.28.1（保持现有依赖，不引入新包）
- 平台运行时：Cloudflare Workers/Pages、EdgeOne Pages、阿里云 ESA（三平台共用单产物 `_worker.js`）
- 前端：原生 JS 单页应用（web/），构建期产出静态目录 + 内联兜底
- 语言标准：ESM、target es2022、platform neutral（与现有 esbuild 配置一致）

## Implementation Approach

### 总体策略

采用「用 esbuild 原生能力替代手动字符串拼接」的核心策略，将 build 从「字符串拼接 + 正则注入 + base64 hack」范式转为「声明式资源加载 + 单一权威源生成」。

### 关键决策与理由

1. **内联 HTML 不再 base64**：改用 esbuild `loader: 'text'` 读取 `web/index.html` 作为字符串常量导出到 `src/ui.gen.js`。esbuild 在打包时会自动处理字符串内的反引号/`<>`/` 边界（转义为安全字面量），无需 base64 中转。删除 358KB 的 base64 单行文件，消除重写边界串扰风险。
2. **前端走正常 bundle**：`web/api.js` + `web/app.js` 经 esbuild bundle（minify:true），通过显式保留入口（挂 `window.API`、顶层调用）避免死代码消除，消除「前端不压缩」妥协。产物写入 `dist/public/assets/app.js`。
3. **STAGE_OPS 单一权威源**：`src/config/stages.js` 保持唯一真相源；构建期用 esbuild 打包出 `web/_stage.gen.js`（仅含 STAGE_ORDER/STAGE_OPS/STAGE_ALIASES/normalizeStage），`web/app.js` 改为 `import` 该生成文件，删除硬编码副本，移除 `assertStageDictSync` 文本切片断言。
4. **专项语法校验**：build 末尾用 esbuild `transform` 解析内联脚本、用轻量栈式解析校验 HTML 标签闭合与括号配对，失败即非零退出。

### 性能与可靠性

- esbuild text loader 与 bundle 均为 O(n) 线性处理，开销可忽略；产物体积因正常压缩而更优。
- 构建期专项校验以秒级完成，无运行时开销。
- 保留 `verify()` 的 import 加载校验，确保产物在 Node 侧语法合法、导出面正确。

### 避免技术债

- 复用现有 esbuild 配置（`EXTERNAL_MODULES`、`platform: 'neutral'` 等），不引入新架构模式。
- 三平台薄壳与 `entry.js` 双导出保持不变，不引入条件编译。

## Implementation Notes

- **基线保护**：重构 `build.mjs` 时保留 `verify()` 全量校验逻辑与 `EXTERNAL_MODULES` 列表；`ui.gen.js` 的 `UI_HTML_B64` 消费点（`src/api/adminPage.js` 的 `renderAdminPage`）需同步改为读取新的字符串导出（`UI_HTML`），保留 `UI_HTML_B64` 兼容分支以避免未重新构建时崩溃。
- **前端 bundle 防死代码消除**：app.js 的顶层 IIFE 本身即副作用入口，esbuild 不会消除；api.js 挂 `window.API` 亦为副作用，无需特殊标记。仅需在 bundle 时确保 `format: 'iife'`、`target: 'es2022'`。
- **HTML 压缩**：保留 `minifyHtml` 中「保护 script/style 原样」的逻辑（这是合理防护），但注入改为 esbuild text loader 统一处理，不再依赖函数 replacement 防 ` 展开。
- **日志与回归**：构建失败信息需指向具体文件与行号（esbuild 原生错误已带），避免二分法排查。

## Architecture Design

### 现有架构（保持）

```
src/entry.js ──(onRequest + default.fetch)──> _worker.js
                                          ├── edge-functions/[[default]].js (薄壳转发 onRequest)
                                          └── esa/index.js (薄壳转发 default.fetch + env 合并)
```

三平台共用 `_worker.js`，薄壳零逻辑转发。

### 重构后的构建流

```
web/ (index.html, style.css, api.js, app.js, _stage.gen.js[生成])
   │  esbuild text loader / bundle
   ▼
src/ui.gen.js (UI_HTML 字符串 + UI_CSS 字符串，非 base64)
src/config/stages.js ──(esbuild)──> web/_stage.gen.js (前端配置副本)

build.mjs:
  1. 生成 web/_stage.gen.js（单一权威源 → 前端副本）
  2. esbuild bundle api.js+app.js → dist/public/assets/app.js + 内联备用
  3. esbuild text loader 读 index.html+style.css+app.js → src/ui.gen.js
  4. esbuild bundle src/entry.js → _worker.js
  5. 专项语法校验（内联脚本 parse + HTML 标签闭合 + 括号配对）
  6. verify() 自检（文件完整 + import 加载 + 导出面）
```

## Directory Structure

```
/workspace/
├── build.mjs                         # [MODIFY] 重构构建流程：移除 base64 内联、函数 replacement、
│                                     #   前端不压缩、STAGE_OPS 文本切片断言；改用 esbuild text loader
│                                     #   + bundle + 单一权威源生成 + 专项语法校验。保留 verify() 与
│                                     #   EXTERNAL_MODULES。
├── src/
│   ├── config/stages.js              # [MODIFY] 保持唯一真相源（STAGE_ORDER/STAGE_OPS/
│   │                                #   STAGE_ALIASES/normalizeStage），移除「前端副本靠断言同步」
│   │                                #   的注释说明，改为指向构建期生成 web/_stage.gen.js。
│   ├── ui.gen.js                     # [MODIFY] 由 build 生成：导出 UI_HTML（字符串）、UI_CSS
│   │                                #   （字符串）替代 UI_HTML_B64/UI_CSS_B64（保留旧字段兼容读取）。
│   ├── api/adminPage.js              # [MODIFY] renderAdminPage 解码逻辑改为读取 UI_HTML 字符串
│   │                                #   导出，保留 UI_HTML_B64 回退分支（未重新构建时）。
│   └── entry.js                      # [KEEP] 双导出不变，仅审查写法规范（无逻辑改动）。
├── web/
│   ├── index.html                    # [MODIFY] 移除 <!-- BUILD:STYLE -->/BUILD:SCRIPT 注释占位，
│   │                                #   改为构建期由 esbuild text loader 注入，保留标准结构。
│   ├── app.js                       # [MODIFY] 删除第 382-413 行硬编码 STAGE_OPS/STAGE_ORDER/
│   │                                #   STAGE_ALIASES/normalizeStage 副本，改为 import
│   │                                #   './_stage.gen.js'。其余逻辑不变。
│   ├── api.js                       # [KEEP] 标准 fetch 封装，仅审查规范（无逻辑改动）。
│   ├── style.css                    # [KEEP] 样式文件，构建期压缩（保持 minifyCss）。
│   └── _stage.gen.js               # [NEW] 由 build 从 src/config/stages.js 经 esbuild 打包生成
│                                     #   的前端配置副本（仅含 STAGE_ORDER/STAGE_OPS/
│                                     #   STAGE_ALIASES/normalizeStage），供 app.js import。
├── edge-functions/
│   └── [[default]].js               # [KEEP] 薄壳转发 onRequest，不变。
├── esa/index.js                     # [KEEP] 薄壳转发 default.fetch + env 合并，不变。
└── scripts/
    └── dev.mjs                      # [KEEP] 本地开发脚本，调用 build.mjs --no-minify，不变。
```

## Key Code Structures

### web/_stage.gen.js（生成文件，对应 src/config/stages.js 的子集）

```js
// 自动生成 —— 请勿手动编辑。由 build.mjs 从 src/config/stages.js 打包。
export const STAGE_ORDER = ['rewrite', 'redirect', 'terminate', 'reqHeaders', 'origin', 'cache', 'respHeaders'];
export const STAGE_OPS = { /* 与 src/config/stages.js 逐字一致，含 match 函数 */ };
export const STAGE_ALIASES = { '⑤': 'rewrite', /* ... */ };
export function normalizeStage(s) { /* 同 src/config/stages.js */ }
```

### src/ui.gen.js（生成文件，替代 base64）

```js
// 自动生成 —— 请勿手动编辑。由 build.mjs 经 esbuild text loader 从 web/ 注入。
export const UI_HTML = `...完整 HTML 字符串（esbuild 已安全转义反引号/<>/$）...`;
export const UI_CSS = `...压缩后 CSS 字符串...`;
// 兼容旧版
export const UI_HTML_B64 = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(UI_HTML))) : '';
export const UI_CSS_B64 = typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(UI_CSS))) : '';
```