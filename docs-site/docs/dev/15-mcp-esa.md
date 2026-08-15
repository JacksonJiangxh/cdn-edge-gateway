# 15 · ESA MCP Server（AI IDE 自然语言管理）

> [!NOTE]
> **本文面向**：开发者（想用 AI 助手管 ESA 网关，不手点控制台）。
> 部署到 ESA 见 [部署 ESA](/dev/14-deploy-esa.md)。

---

## 这是什么

**MCP（Model Context Protocol）** 是让 AI 工具（如 CodeBuddy / Cursor / Claude）直接调用你系统能力的一套协议。
本项目提供 **ESA MCP Server**：把它接进 AI IDE 后，你用**自然语言**就能管理阿里云 ESA 上的网关——

> 「帮我把 img.example.com 的缓存 TTL 改成 1 小时」
> 「看看现在有几个源站池，把其中一个下线」

AI 会自动调用 ESA 的发布/配置接口完成，不用你手点控制台。

```mermaid
flowchart LR
    U[你: 自然语言] --> AI[AI IDE]
    AI -->|MCP 协议| S[ESA MCP Server]
    S -->|ESA API| E[阿里云 ESA]
    E -->|网关配置| R[(你的网关)]
```

---

## 前置

1. 网关已部署到 ESA（见 [部署 ESA](/dev/14-deploy-esa.md)）。
2. 有 ESA 的访问凭证（API Key / AK-SK，按 ESA 控制台获取）。
3. Node.js ≥ 22（跑 MCP Server）。

---

## 配置 MCP Server

MCP Server 是一个本地 Node 进程，`package.json` 提供 `mcp:esa*` 系列脚本。
在 AI IDE 的 MCP 配置里加（示意）：

```jsonc
// 以 CodeBuddy / Claude Desktop 的 mcp 配置为例
{
  "mcpServers": {
    "esa-gateway": {
      "command": "npm",
      "args": ["run", "mcp:esa"],
      "env": {
        "ESA_API_KEY": "你的ESA凭证",
        "CLOUD_PLATFORM": "esa"
      }
    }
  }
}
```

> [!TIP]
> 具体脚本名与参数以仓库 `package.json` 的 `mcp:esa*` 为准（如 `mcp:esa` / `mcp:esa:setup`）。
> 接好后，在 IDE 里问「列出可用的 ESA 工具」即可看到暴露的能力清单。

---

## 能做什么（典型能力）

MCP Server 把下面这些网关操作暴露成「AI 可调用工具」：

| 能力 | 自然语言示例 |
|---|---|
| 查看站点/源站池 | 「列出现在所有站点」 |
| 改站点配置 | 「把 www 站点的回源协议改成 https」 |
| 调缓存 | 「把静态资源缓存 TTL 设 24 小时」 |
| 安全规则 | 「给 img 站点开防盗链，只允许 example.com」 |
| 发布/同步 | 「把改动发布到 ESA」 |
| 健康检查 | 「网关现在健康吗，caps 是什么」 |

> [!NOTE]
> 每个「工具」底层对应一个 ESA API 调用（或本项目管理面 API），AI 只是替你组织参数 + 调用。
> 涉及写操作（改配置/发布）AI 通常会先确认再执行——别让它在你不知情时动生产配置。

---

## 安全注意

- MCP Server 持有 ESA 凭证，**只在本机/可信环境运行**，不要把凭证提交进仓库。
- 写类操作（改配置、发布）建议在 AI 对话里设「需确认」门槛。
- 凭证走环境变量（`ESA_API_KEY`），不要用明文写进配置文件。

---

## 排障

| 现象 | 原因 | 解法 |
|---|---|---|
| IDE 连不上 MCP | 脚本名/路径错 | 对照 `package.json` 的 `mcp:esa*` 修正 |
| 调用报无权限 | 凭证错/过期 | 刷新 ESA API Key |
| 改了不生效 | 没发布 | 让 AI「发布到 ESA」或走 [部署 ESA](/dev/14-deploy-esa.md) |
| 平台探测失败 | 没设 `CLOUD_PLATFORM=esa` | 环境变量补 `esa` |

---

## 教程站到这里就结束了

回到 [首页](/index.md) 选你的读者路线；或查看 [附录 · 隐藏配置字段](/appendix/hidden-fields.md)。
