# 依赖缓存镜像：把「环境部署」全部烤进镜像，供流水线运行时直接复用。
# 对应官方 use-cache 的 docker:cache 机制（见 use-cache/README.md）。
#
# 烤入内容：
#   1) Debian 13 的 25+ 个 chromium 系统共享库（运行时免 apt-get）
#   2) npm ci 好的项目依赖（/space/node_modules）
#   3) Playwright 的 chromium 二进制（~/ .cache/ms-playwright）
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
# 仅 COPY 两个清单即可（npm ci 按 lock 全量解析），不引入源码，构建更快。
COPY package.json package-lock.json ./
RUN npm ci \
 && echo "✓ node_modules 已固化进镜像"

# ---------- 3) Playwright chromium 二进制 ----------
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright
RUN npx playwright install chromium \
 && echo "✓ chromium 二进制已固化进镜像（${PLAYWRIGHT_BROWSERS_PATH}）"

# ---------- 4) 全局 esa-cli（ESA 按钮复用） ----------
RUN npm install -g esa-cli \
 && echo "✓ esa-cli 已固化进镜像"

# 运行时容器把镜像内 /space/node_modules cp 到工作区即可（见 .cnb.yml 的 use cache 阶段）
ENV NODE_PATH=/space/node_modules
