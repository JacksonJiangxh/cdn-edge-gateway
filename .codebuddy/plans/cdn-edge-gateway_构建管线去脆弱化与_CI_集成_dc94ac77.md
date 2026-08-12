---
name: cdn-edge-gateway 构建管线去脆弱化与 CI 集成
overview: 继续处理审查报告低优先级项：① 用「唯一注释标记」取代 build.mjs 中基于正则匹配 HTML 结构的脆弱替换；② 消除 ui.gen.js 内联兜底与 dist/public 静态资源的重复字节（移除 base64 B64 冗余导出）；③ 把 npm run check 接入 ci.yml 与各部署流水线，形成构建前守卫。
todos:
  - id: marker-driven-inject
    content: 改造 build.mjs 的 buildInlineUI/buildPublic 用 BUILD:STYLE/BUILD:SCRIPT 标记替换取代正则猜结构，并加注入后产物断言
    status: completed
  - id: remove-b64-redundancy
    content: 移除 build.mjs 的 UI_HTML_B64/UI_CSS_B64 导出，改 src/api/adminPage.js 用直接 UI_HTML/UI_CSS
    status: completed
  - id: ci-check-integration
    content: 在 ci.yml 及 4 个 deploy workflow 的 build 前加 npm run check 步骤（保持手动触发）
    status: completed
  - id: verify-and-docs
    content: 运行 npm run check + npm run build 验证全流程，同步 README 描述与 ui.gen.js 导出
    status: completed
    dependencies:
      - marker-driven-inject
      - remove-b64-redundancy
      - ci-check-integration
---

## 产品概述

在上阶段完成的三平台健壮性强化基础上，继续处理审查报告标注的低优先级健壮性项，进一步消除「构建成功但产物不可用」的隐性回归源，并把静态检查接入 CI 流水线。

## 核心功能

- **构建注入标记化**：将 build.mjs 中「用正则猜测 HTML 标签结构（`<link style.css>`、`<script src=api|app.js>`、`</body>`、`</head>`）」改为基于 `web/index.html` 显式注释标记（`<!-- BUILD:STYLE -->` / `<!-- BUILD:SCRIPT -->`）的确定性替换，HTML 结构调整不再导致产物缺 CSS/JS。
- **移除 base64 双份冗余**：删除 `src/ui.gen.js` 的 `UI_HTML_B64` / `UI_CSS_B64` base64 导出及 `src/api/adminPage.js` 对应解码分支（用户已确认无需兼容旧产物），消除 base64 体积膨胀与 `UI_CSS`/内联 `<style>` 重复。
- **check 接入 CI**：在 `ci.yml` 及 4 个 deploy workflow 的 build 前显式执行 `npm run check`，前置拦截平台口径/入口损坏类回归。

## 边界

- 不删除 `.codebuddy` 目录；CI 全部保持手动触发（仓库铁律，不新增 push/pull_request 触发器）。
- 构建产物（`_worker.js`、`dist/`、`src/ui.gen.js`、`web/_stage*`）维持 gitignore。
- 改后必须运行 `npm run check` + `npm run build` 验证（含产物自检与语法校验）。

## 技术栈

- Node.js ≥ 22 + esbuild ^0.28.1，ESM（`"type":"module"`）
- CI：GitHub Actions，Node 22，全部 `workflow_dispatch` 手动触发
- 三平台：Cloudflare / EdgeOne / 阿里云 ESA

## 实施方案

### 1. 构建注入标记化（根除正则猜结构）

`web/index.html` 已具备两个显式标记点，build 改为「标记替换」而非「正则猜标签」：

- **CSS 注入**：`buildInlineUI` 与 `buildPublic` 统一把 `<!-- BUILD:STYLE -->` 整体替换为内联 `<style>{css}</style>`（inline）或 `<link rel="stylesheet" href="/assets/app.css">`（静态）。不再用 `/href="style.css"/` 正则去猜 `<link>` 位置。
- **JS 注入**：把 `<!-- BUILD:SCRIPT -->` 到其后的 `<script src=api.js/app.js></script>` 整块（含标记）替换为内联 `<script>{safeJs}</script>` 或外部 `<script src="/assets/app.js"></script>`。删除对 `</body>` 位置与 `<script src=api|app.js>` 的正则猜测。
- **注入顺序与唯一性**：`buildInlineUI` 先替换 `BUILD:STYLE` 再替换 `BUILD:SCRIPT`，标记在 index.html 中唯一（当前已唯一），避免替换后字符串互相干扰。
- `minifyHtml` 的 `@@STASH@@` 保护机制保留（仍保护 `<script>/<style>` 内部不被压缩），仅其「压缩标签间空白」逻辑不变。
- 新增/调整一个「注入后 HTML 断言」：替换完成后必须仍含目标产物（内联 `<style>` 与 `<script>` 存在；静态版含 `<link …app.css>` 与 `<script …app.js>`），否则抛错——把「结构猜错导致缺资源」从隐性回归变为显式构建失败。

### 2. 移除 base64 双份冗余

- `build.mjs#buildInlineUI`：`src/ui.gen.js` 仅导出 `UI_HTML`（直接字符串，含内联 CSS+JS）与 `UI_CSS`（单独 CSS 字符串），删除 `UI_HTML_B64` / `UI_CSS_B64` 及 `Buffer.from(...).toString('base64')` 计算。
- `src/api/adminPage.js`：
- `tryServePanelStatic`（无 ASSETS 回退）：`UI_CSS_B64` → `UI_CSS`（直接字符串）。
- `renderAdminPage`：删除 `UI_HTML_B64` 解码回退分支，仅读 `UI_HTML`（仍保留 `FALLBACK_HTML` 兜底与动态 import 的 try/catch）。
- 体积收益：`ui.gen.js` 不再含 base64（约 -33% 字节），`_worker.js` 相应减小；`UI_CSS` 仍保留供 CSS 回退透传使用（不产生重复 JS 字节，仅 CSS 一段）。

### 3. check 接入 CI

- `ci.yml`：在 `npm run build` 步骤前插入 `npm run check` 步骤（脚本已存在 `package.json`，上阶段已加）。
- 4 个 deploy workflow（cf-pages / cf-workers / eo-pages / esa-pages）：在各自的 `npm run build` 前插入 `npm run check`（防御性，成本极低）。
- 全部保持 `workflow_dispatch` 手动触发，不改触发器类型。

## 架构说明

- 保持既有分层与数据流不变；改动集中在构建注入逻辑（`build.mjs`）、生成产物消费方（`src/api/adminPage.js`）、CI 编排（workflow）。
- `web/index.html` 的标记即「单一注入真相源」，与 build 步骤一一对应，消除「改 HTML 结构 → 正则失配 → 隐性缺资源」链路。
- 不引入新架构模式，仅将既有的脆正则替换为确定性的标记替换 + 显式断言。

## 目录结构

```
/workspace/
├── build.mjs                        # [MODIFY] buildInlineUI/buildPublic 用 BUILD:STYLE/BUILD:SCRIPT 标记替换取代正则；注入后断言；移除 B64 导出
├── web/
│   └── index.html                   # [MODIFY] 确认 BUILD:STYLE / BUILD:SCRIPT 标记唯一、位置稳定（已具备，微调注释/缩进）
├── src/
│   └── api/adminPage.js             # [MODIFY] 移除 UI_HTML_B64/UI_CSS_B64 解码分支，改直接 UI_HTML/UI_CSS
├── .github/workflows/
│   ├── ci.yml                       # [MODIFY] build 前加 npm run check 步骤
│   ├── deploy-cf-pages.yml          # [MODIFY] build 前加 npm run check 步骤
│   ├── deploy-cf-workers.yml        # [MODIFY] build 前加 npm run check 步骤
│   ├── deploy-eo-pages.yml          # [MODIFY] build 前加 npm run check 步骤
│   └── deploy-esa-pages.yml         # [MODIFY] build 前加 npm run check 步骤
└── README.md                        # [MODIFY] 同步 ui.gen.js 导出（去 B64）、标记注入机制、CI 含 check 的描述
```

## 关键代码结构（标记替换契约）

```js
// build.mjs —— 标记驱动的确定性注入（取代正则猜标签结构）
const MARK = {
  STYLE: '<!-- BUILD:STYLE -->',       // index.html 中唯一，位于 <head>
  SCRIPT: '<!-- BUILD:SCRIPT -->',     // index.html 中唯一，位于 </body> 前
};

// 内联兜底：把「CSS 标记」替换为内联 <style>；把「SCRIPT 标记 + 其后原始 <script src> 块」替换为内联 <script>
function injectInline(html, css, safeJs) {
  if (!html.includes(MARK.STYLE)) throw new Error('index.html 缺少 BUILD:STYLE 标记');
  if (!html.includes(MARK.SCRIPT)) throw new Error('index.html 缺少 BUILD:SCRIPT 标记');
  let out = html.replace(MARK.STYLE, () => `<style>${css}</style>`);
  // 用非贪婪匹配吃掉「SCRIPT 标记 + 紧随其后的 <script src=…></script> 行块」
  out = out.replace(new RegExp(MARK.SCRIPT + '[\\s\\S]*?<\\/body>', 'i'),
    () => `${MARK.SCRIPT}<script>${safeJs}</script></body>`);
  // 断言产物已注入，否则显式失败（不再隐性缺资源）
  if (!/<style>[\s\S]*<\/style>/.test(out) || !/<script>[\s\S]*<\/script>/.test(out)) {
    throw new Error('内联注入后缺少 style/script 产物');
  }
  return out;
}

// 静态版：CSS 标记 → 外部 <link>；SCRIPT 标记+原始块 → 外部 <script src=/assets/app.js>
function injectExternal(html) {
  let out = html.replace(MARK.STYLE, () => '<link rel="stylesheet" href="/assets/app.css">');
  out = out.replace(new RegExp(MARK.SCRIPT + '[\\s\\S]*?<\\/body>', 'i'),
    () => `${MARK.SCRIPT}<script src="/assets/app.js"></script></body>`);
  if (!/<link[^>]*app\.css/.test(out) || !/<script[^>]*app\.js/.test(out)) {
    throw new Error('静态注入后缺少外部 css/js 产物');
  }
  return out;
}
```

```js
// src/api/adminPage.js —— 移除 base64 冗余，仅用直接字符串
// tryServePanelStatic 回退：UI_CSS_B64 → UI_CSS
const mod = await import('../ui.gen.js');
if (typeof mod.UI_CSS === 'string' && mod.UI_CSS) {
  return new Response(mod.UI_CSS, { status: 200, headers: cssHeaders });
}
// renderAdminPage：仅读 UI_HTML（无 B64 回退分支），仍保留 FALLBACK_HTML 兜底
if (typeof mod.UI_HTML === 'string' && mod.UI_HTML) html = mod.UI_HTML;
if (!html) html = FALLBACK_HTML;
```

## Agent 扩展

### 子代理 (SubAgent)

- **code-explorer**
- 用途：核对 `web/index.html` 的 `BUILD:STYLE`/`BUILD:SCRIPT` 标记唯一性，以及 `src/api/adminPage.js` 与 `build.mjs` 中所有 B64 导出消费点，确认改动不遗漏。
- 预期产出：标记与 B64 消费点清单，确保删除 B64 后无残留引用、标记替换覆盖全部注入路径。

### 技能 (Skill)

- **lsp-code-analysis**
- 用途：语义级定位 `UI_HTML`/`UI_CSS`/`UI_HTML_B64`/`UI_CSS_B64` 的全部定义与引用，以及 `buildInlineUI`/`buildPublic`/`renderAdminPage`/`tryServePanelStatic` 的调用链，验证去 B64 后 import 面与消费方一致。
- 预期产出：符号引用图，确认移除 base64 后无 dangling 引用、产物自检仍通过。