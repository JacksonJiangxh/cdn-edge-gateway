# 02 · 环境准备

> 上一篇：[01 项目概述](./01-overview.md) ｜ 下一篇：[03 部署指南](./03-deploy.md)

本篇结束后，你会有一个**依赖装好、构建通过**的本地仓库。
预计耗时 10 分钟。

---

## 步骤 1：确认 Node.js 版本

本项目要求 **Node.js ≥ 22**（Wrangler v4 要求 Node ≥ 20.19，推荐 22，18 会报错）。

```bash
node -v
```

**预期结果**：输出 `v22.x.x` 或更高，例如：

```
v22.11.0
```

<details>
<summary>❌ 版本低于 20 或提示 command not found，点这里</summary>

推荐用 nvm 安装，不污染系统环境：

```bash
# macOS / Linux
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# 重开终端后执行
nvm install 20
nvm use 20
```

Windows 用户：到 [nodejs.org](https://nodejs.org/) 下载 20 LTS 安装包，一路下一步。

装完重新执行 `node -v` 确认。
</details>

---

## 步骤 2：确认 npm 可用

```bash
npm -v
```

**预期结果**：输出版本号，例如 `10.2.4`。npm 随 Node 一起安装，正常情况无需单独装。

---

## 步骤 3：克隆仓库

```bash
git clone <你的仓库地址>
cd <仓库目录名>
```

**预期结果**：当前目录下能看到 `package.json`、`src/`、`web/` 等文件：

```bash
ls
```

```
LICENSE  README.md  _worker.js  build.mjs  docs  edge-functions
edgeone.json  index.js  package.json  scripts  src  web  wrangler.toml
```

---

## 步骤 4：安装依赖

```bash
npm install
```

**预期结果**：结尾出现类似输出（数字不用完全一致）：

```
added 89 packages, and audited 90 packages in 12s
found 0 vulnerabilities
```

> 本项目运行时**零依赖**，`node_modules` 里装的只是构建/部署工具（esbuild、wrangler）。
> 装出来几十 MB 是正常的，不会进入线上产物。

<details>
<summary>❌ 卡住或报网络错误，点这里</summary>

国内网络建议换源后重试：

```bash
npm config set registry https://registry.npmmirror.com
npm install
```
</details>

---

## 步骤 5：执行一次构建，验证环境

这是**验证环境是否真的可用**的关键一步。

```bash
npm run build
```

**预期结果**：四个步骤全部通过，最后出现 `构建完成`：

```
cdn-edge-gateway 构建开始（压缩模式）
▸ [1/4] 内联前端资源（兜底）...
  ✓ src/ui.gen.js 已生成 (xxx KB)
▸ [2/4] 输出静态资源目录 dist/public/...
  ✓ dist/public/index.html + assets/app.{css,js} 已生成（资源路径固定，与 ADMIN_PATH 解耦）
▸ [3/4] 打包 Worker...
  ✓ _worker.js 已生成 (xxx KB)
▸ [4/4] 产物自检...
  ✓ 产物文件完整（4 个）
  ✓ 入口导出可用: onRequest
  ✓ 构建完成
```

> 四个步骤实际为：① 内联前端兜底（生成 `src/ui.gen.js`，用于无静态托管的粘贴部署）→ ② 输出静态资源目录 `dist/public/`（管理面静态资源，固定 `/assets` 路径，与 `ADMIN_PATH` 解耦）→ ③ 打包 Worker（`esbuild` 打包 `src/entry.js` → 根目录 `_worker.js`）→ ④ 产物自检（文件完整性 + `_worker.js` 可加载 + 导出面）。**没有「生成入口薄壳」这一步**（旧架构残留描述，已移除）。

构建产物在 `dist/public/` 下：

```bash
ls dist/public
```

```
assets  index.html
```

> `assets/` 里是管理面静态资源（`app.css` / `app.js`），`index.html` 是站点根页。
> **注意：这里不会出现以 `ADMIN_PATH` 命名的目录。**
> `ADMIN_PATH` 是【纯运行时】参数（构建期不读取它，见 [04 §6](./04-configuration.md)），
> 管理面静态资源一律走固定的 `assets/` 物理路径，与入口前缀解耦——
> 因此其值无论怎么改，产物结构永远不变，无需重新构建。
> 运行时生效值 = **「KV 中管理面保存的值 > 内置默认 `__panel`」**（环境变量层仅作兜底，详见 [04 §6](./04-configuration.md)）。
> 部署用默认 `__panel` 兜底，部署后请到管理面把入口前缀改成随机串并存进 KV（最高优先级生效）。

<details>
<summary>❌ 构建报错「产物缺失」，点这里</summary>

先确认 Node 版本 ≥ 22（步骤 1），再清空产物重试：

```bash
rm -rf dist node_modules
npm install
npm run build
```
</details>

---

## 步骤 6（可选）：安装 Wrangler

**只有走 [03 部署指南](./03-deploy.md) 方式 ①（命令行静态挂载）才需要。**
如果你打算走方式 ②/③/④（纯网页 / Pages / EdgeOne），**跳过这步**，直接进入下一篇。

Wrangler 已在 `devDependencies` 中，`npm install` 时已装好，用 `npx` 调用即可：

```bash
npx wrangler --version
```

**预期结果**：输出版本号，例如：

```
⛅️ wrangler 3.x.x
```

---

## 检查清单

进入下一篇前，确认以下三项都为 ✅：

- [ ] `node -v` ≥ v22
- [ ] `npm install` 成功，无报错
- [ ] `npm run build` 输出 `✓ 构建完成`

---

## 下一步

→ **[09 本地开发与验证](./09-local-development.md)**：把服务在本机跑起来，进管理面点一遍。
