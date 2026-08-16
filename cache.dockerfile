# 依赖缓存镜像：把「环境部署」全部烤进镜像，供流水线运行时直接复用。
# 对应官方 use-cache 的 docker:cache 机制（见 use-cache/README.md）。
#
# 烤入内容：
#   1) Debian 13 的 25+ 个 chromium 系统共享库（运行时免 apt-get）
#   2) npm ci 好的项目依赖（/space/node_modules）
#   3) Playwright 的 chromium 二进制（/opt/playwright-browsers）
#   4) 全局 esa-cli（ESA 按钮免 npm install -g）
#
# 重建触发：.cnb.yml 中 docker:cache 任务的 by=[package.json,package-lock.json,cache.dockerfile]，
#           versionBy=[package-lock.json] —— 仅 lock/package.json 变化才重建镜像。
# 关键设计：构建上下文【只含依赖清单】，不含业务代码（src/web/docs）也不含 scripts/。
#   - npm ci 仅需 package.json + package-lock.json 即可装出完整 node_modules，无需业务代码；
#   - postinstall（scripts/ensure-playwright-browsers.mjs）用 --ignore-scripts 跳过，
#     故 scripts/ 无需进 by —— 改业务代码或改脚本都【不会】触发镜像重建；
#   - chromium 改由下方显式 `npx playwright install --with-deps` 固化进镜像层（playwright 已在
#     node_modules，不依赖 scripts/），运行时各 stage 探测 /opt 命中秒过、零下载。

# 基础镜像与运行时流水线保持一致（debian:13-all 已预装 node24/npm11/git/curl/python3）
FROM docker.cnb.cool/xzydm/mirrors/debian:13-all

WORKDIR /space

# ---------- 1) 预装 chromium 运行所需系统共享库（固化进镜像） ----------
# 兼容 Debian 13 的 t64 改名（libasound2 → libasound2t64）。
RUN export DEBIAN_FRONTEND=noninteractive \
 && apt-get update -qq \
 && for p in libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 \
            libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libatspi2.0-0 \
            libx11-6 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
            libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
            libudev1 fonts-liberation ca-certificates; do \
      apt-get install -y --no-install-recommends "$p" >/dev/null 2>&1 \
        || apt-get install -y --no-install-recommends "${p}t64" >/dev/null 2>&1 \
        || echo "  ⚠ 跳过不可用包: $p"; \
    done \
 && rm -rf /var/lib/apt/lists/* \
 && echo "✓ 系统共享库已固化进镜像"

# ---------- 2) npm ci 项目依赖 ----------
# 只 COPY 依赖清单（最小集）：业务代码（src/web/docs）与 scripts/ 都不进构建上下文，
# 从根本上杜绝「改代码触发镜像重建」。npm ci 仅需 package.json + package-lock.json
# 即可按 lock 精确装出完整 node_modules（devDependencies 含 playwright/esbuild/wrangler/esa-cli）。
# --ignore-scripts 跳过 postinstall（它依赖 scripts/ 上下文），chromium 改由下方第 3 步显式固化。
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts \
 && echo "✓ node_modules 已固化进镜像"

# ---------- 3) Playwright chromium 二进制 ----------
# 浏览器二进制必须落在 /opt/playwright-browsers，而非默认的 /root/.cache/ms-playwright。
# 原因（官方文档佐证，https://docs.cnb.cool/zh/build/grammar.html 的 DOCKER.VOLUMES 章节）：
#   - volumes 的 copy-on-write 模式「并非实时跨 stage 共享可变写层」，且「挂载点会覆盖（遮蔽）
#     容器内原有内容」。install 阶段写入 /root/.cache/ms-playwright 的私有副本，build 阶段
#     看不到；即便可见，空卷挂载还会遮蔽镜像层，导致 build 阶段又重新下载约 300MB。
#   - 官方结论：「二进制固化进镜像层后，不需要挂卷来提供本身」。故将 chromium 固化到 /opt
#     （非 /root/.cache 标准缓存目录，规避 docker:cache 导出链路对其的不可靠保留），所有
#     stage 直接读镜像层、零下载。脚本 ensure-playwright-browsers.mjs / e2e-browser.mjs
#     会自动尊重该 ENV。
# 此处用显式 `npx playwright install --with-deps` 固化（playwright 已在 node_modules，不依赖
# scripts/），替代原 postinstall 的 chromium 准备；系统共享库已由第 1 步 apt 固化，--with-deps
# 幂等且 so 已就绪、不会重复 apt。运行时各 stage 在完整仓库跑 postinstall 时探测 /opt 命中秒过。
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN mkdir -p /opt/playwright-browsers \
 && npx playwright install --with-deps chromium \
 && echo "✓ chromium 已固化进镜像: $PLAYWRIGHT_BROWSERS_PATH"

# ---------- 4) 全局 CLI 固化（ESA / EO 部署复用） ----------
# esa-cli：ESA 按钮免 npm install -g
RUN npm install -g esa-cli \
 && echo "✓ esa-cli 已固化进镜像"
# edgeone：EO Makers 部署 CLI（edgeone makers deploy）。预装进镜像，
# 避免部署 stage 每次 `npx -y edgeone@latest` 临时下载（约数十 MB、耗时且依赖联网）。
# 与 esa-cli 同级全局安装，运行时容器直接在 PATH 拿到 `edgeone` 命令。
# 注意：edgeone 不进 package.json devDependencies，避免影响其他 stage 的依赖树与镜像重建触发条件。
RUN npm install -g edgeone@latest \
 && echo "✓ edgeone 已固化进镜像"

# 运行时容器把镜像内 /space/node_modules cp 到工作区即可（见 .cnb.yml 的 use cache 阶段）
ENV NODE_PATH=/space/node_modules
