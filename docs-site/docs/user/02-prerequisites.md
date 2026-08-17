# 02 · 环境准备

> [!NOTE]
> **本文面向**：普通用户（准备本地环境，10 分钟搞定）。
> 本篇结束后你会有一个「依赖装好、构建通过」的本地仓库。

---

## 步骤 1：确认 Node.js 版本

要求 **Node.js ≥ 22**（构建工具 Wrangler v4 要求 Node ≥ 20.19，推荐 22）。

```bash
node -v
```

**预期**：输出 `v22.x.x` 或更高，例如 `v22.11.0`。

<details>
<summary>❌ 版本低于 22 或提示 command not found</summary>

推荐用 nvm 安装，不污染系统：

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# 重开终端后
nvm install 22
nvm use 22
```

Windows 用户到 [nodejs.org](https://nodejs.org/) 下载 22 LTS 安装包一路下一步。
</details>

---

## 步骤 2：确认 npm 可用

```bash
npm -v
```

正常会输出版本号。npm 随 Node 一起装好，无需单独装。

---

## 步骤 3：克隆仓库

```bash
git clone <你的仓库地址>
cd <仓库目录名>
ls
```

能看到 `package.json`、`src/`、`web/` 等文件即正常。

---

## 步骤 4：安装依赖

```bash
npm install
```

> [!TIP]
> 本项目**运行时零依赖**，`node_modules` 里只是构建/部署工具（esbuild、wrangler），不会进线上产物。装出几十 MB 很正常。

国内网络卡可换源：

```bash
npm config set registry https://registry.npmmirror.com
npm install
```

---

## 步骤 5：构建一次，验证环境（关键）

```bash
npm run build
```

**预期**：四个步骤都过，最后出现 `构建完成`：

```
cdn-edge-gateway 构建开始（压缩模式）
▸ [1/4] 内联前端资源（兜底）...
▸ [2/4] 输出静态资源目录 dist/public/...
▸ [3/4] 打包 Worker...
▸ [4/4] 产物自检...
  ✓ 构建完成
```

构建产物在 `dist/public/`（`index.html` + `assets/`）和根目录 `_worker.js`。

<details>
<summary>❌ 构建报错「产物缺失」</summary>

先确认 Node ≥ 22，再清空重试：

```bash
rm -rf dist node_modules && npm install && npm run build
```
</details>

---

## 步骤 6（可选）：Wrangler / EdgeOne CLI

- **Cloudflare 命令行部署**需要 Wrangler（已在 devDependencies，`npx` 直接调用）：`npx wrangler --version`。
- **EdgeOne Makers 命令行部署**需要 `edgeone` CLI（本地直传 `dist-eo/` 用）：`npm i -g edgeone` 或随流水线用镜像自带版本。CNB / GitHub 流水线已内置，本地手动 deploy 才需自装。

如果你打算用网页控制台 / 流水线部署，跳过这步。

---

## 检查清单

进入下一篇前确认三项都 ✅：

- [ ] `node -v` ≥ v22
- [ ] `npm install` 成功
- [ ] `npm run build` 输出 `✓ 构建完成`

---

## 下一步

→ [部署指南](/user/03-deploy.md)：把网关真正上线到边缘节点。
