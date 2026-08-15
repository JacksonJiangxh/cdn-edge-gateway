# 依赖缓存镜像：把「环境部署」全部烤进镜像，供流水线运行时直接复用。
# 对应官方 use-cache 的 docker:cache 机制（见 use-cache/README.md）。
#
# 烤入内容：
#   1) Debian 13 的 25+ 个 chromium 系统共享库（运行时免 apt-get）
#   2) npm ci 好的项目依赖（/space/node_modules）
#   3) Playwright 的 chromium 二进制（/opt/playwright-browsers）
#   4) 全局 esa-cli（ESA 按钮免 npm install -g）
#
# 重建触发：.cnb.yml 中 docker:cache 任务的 by=[package.json,package-lock.json]，
#           versionBy=[package-lock.json] —— 仅 lock 变化才重建镜像。

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
# 必须 COPY 整个上下文：postinstall（scripts/ensure-playwright-browsers.mjs）
# 依赖 scripts/ 目录，缺失会导致 npm ci 失败。
COPY . .
RUN npm ci \
 && echo "✓ node_modules 已固化进镜像"

# ---------- 3) Playwright chromium 二进制 ----------
# 注意：chromium 已由上面 npm ci 的 postinstall（scripts/ensure-playwright-browsers.mjs，
# 在 root 环境走 --with-deps）装好。
# 关键：浏览器二进制必须落在 /opt/playwright-browsers，而非默认的 /root/.cache/ms-playwright。
# 原因（官方文档佐证，https://docs.cnb.cool/zh/build/grammar.html 的 DOCKER.VOLUMES 章节）：
#   - volumes 的 copy-on-write 模式「并非实时跨 stage 共享可变写层」，且「挂载点会覆盖（遮蔽）
#     容器内原有内容」。install 阶段写入 /root/.cache/ms-playwright 的私有副本，build 阶段
#     看不到；即便可见，空卷挂载还会遮蔽镜像层，导致 build 阶段又重新下载约 300MB。
#   - 官方结论：「二进制固化进镜像层后，不需要挂卷来提供本身」。故将 chromium 固化到 /opt
#     （非 /root/.cache 标准缓存目录，规避 docker:cache 导出链路对其的不可靠保留），所有
#     stage 直接读镜像层、零下载。脚本 ensure-playwright-browsers.mjs / e2e-browser.mjs
#     会自动尊重该 ENV。
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright-browsers
RUN mkdir -p /opt/playwright-browsers \
 && echo "✓ Playwright 浏览器缓存目录已就绪: $PLAYWRIGHT_BROWSERS_PATH"

# ---------- 4) 全局 esa-cli（ESA 按钮复用） ----------
RUN npm install -g esa-cli \
 && echo "✓ esa-cli 已固化进镜像"

# 运行时容器把镜像内 /space/node_modules cp 到工作区即可（见 .cnb.yml 的 use cache 阶段）
ENV NODE_PATH=/space/node_modules
