# ESA MCP Server（AI IDE 直接管理阿里云 ESA）

本文说明如何在 **CodeBuddy / Cursor / Claude Desktop 等 AI IDE** 中通过 **MCP（Model Context Protocol）**
直接管理你的阿里云 **ESA（边缘安全加速）** 资源——项目级配置已随仓库植入，开箱即用。

> MCP 服务器来源：`aliyun/mcp-server-esa`（官方开源，MIT 许可，npm 包 `mcp-server-esa`）。
> 它提供 **40+ 个工具**，覆盖 Pages 部署、边缘函数（ER）全生命周期、站点/DNS/证书/IPv6 管理。

---

## 1. 项目级配置位置

本仓库已在项目级配置文件 `.codebuddy/mcp.json` 注册了全量模式的 ESA MCP server：

```json
{
  "mcpServers": {
    "esa": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "-p", "mcp-server-esa", "mcp-server-esa"],
      "env": {
        "ALIBABA_CLOUD_ACCESS_KEY_ID": "${ALIBABA_CLOUD_ACCESS_KEY_ID}",
        "ALIBABA_CLOUD_ACCESS_KEY_SECRET": "${ALIBABA_CLOUD_ACCESS_KEY_SECRET}"
      }
    }
  }
}
```

- 已加入 `package.json` devDependencies（`mcp-server-esa@^1.1.0`），`npm install` 后本地即可离线运行；
- 备用脚本：`npm run mcp:esa`（全量）/ `mcp:esa:pages` / `mcp:esa:er` / `mcp:esa:site`（按需拆分）；
- 想用 Cursor / Claude Desktop / Cline 时，把同一段 `mcpServers` 拷到对应客户端的全局配置
  （如 Cursor `~/.cursor/mcp.json`、Claude Desktop `claude_desktop_config.json`）即可。

---

## 2. 前置条件

1. 在[阿里云 AccessKey 页面](https://ram.console.aliyun.com/profile/access-keys)获取 **AccessKey ID（AK）/ Secret（SK）**。
   > 安全建议：使用 **RAM 子账号 + 最小权限策略**（如 `AliyunESAFullAccess`），不要用主账号 AK。
2. 开通[边缘函数服务](https://esa.console.aliyun.com/edge/function/list)。
3. 注入密钥（二选一）：
   - **方式 A（推荐，配置已默认）**：在 shell 环境导出，MCP 配置用 `${VAR}` 引用，密钥不落盘、不提交：
     ```bash
     # 写入 ~/.zshrc 后 source 一次即可
     export ALIBABA_CLOUD_ACCESS_KEY_ID="你的AK"
     export ALIBABA_CLOUD_ACCESS_KEY_SECRET="你的SK"
     ```
   - **方式 B**：直接把 `.codebuddy/mcp.json` 里 `${...}` 替换为明文 AK/SK。
     ⚠️ 明文方式请确保该文件**不要提交到公开仓库**（若需提交，务必用方式 A）。
   - 使用 STS 临时凭证时，可再传 `ALIBABA_CLOUD_SECURITY_TOKEN`。

---

## 3. 模块化拆分（可选）

全量模式包含全部工具，启动稍慢；只用到其中一部分时可拆开（对应 `npm run mcp:esa:*`）：

| 模块 | 二进制名 | 适用场景 | 工具数 |
|------|---------|---------|--------|
| Pages | `mcp-server-esa-pages` | 前端 — 部署 HTML / 静态目录到边缘 | 2 |
| ER | `mcp-server-esa-er` | 边缘开发 — 边缘函数完整生命周期 | 16 |
| Site | `mcp-server-esa-site` | 运维/SRE — DNS、证书、IPv6、站点配置 | 22+ |

---

## 4. 工具速览（40+）

- **Pages**：`html_deploy`（部署单页）、`folder_deploy`（部署静态目录，如 `dist/`）。
- **ER 边缘函数**：`routine_create/delete/list/get`、`routine_code_commit`（保存代码版本）、
  `routine_code_deploy`（部署到测试/生产）、`deployment_delete`、`route_create/update/delete/get`、
  `routine_route_list`、`site_route_list`、`er_record_create/delete/list`。
- **Site 站点**：`list_sites`、`site_active_list`、`site_match`、`create_site`、`get/update_site_pause`、
  DNS（`site_record_list`、创建 A/AAAA/CNAME/TXT/NS/MX 记录、`update/get/list/delete_record`）、
  IPv6（`update_ipv6` / `get_ipv6`）、托管转换（`update/get_managed_transform`）、
  证书（`set_certificate`、`apply_certificate`（申请免费证书）、`get/delete/list_certificates`、`get_certificate_quota`）。

---

## 5. 使用示例（在 AI IDE 对话中直接说）

```text
写一个 2048 游戏并部署到边缘函数上，显示访问 URL。
帮我把 ./dist 目录部署到 ESA Pages 上。
列出我账户下的所有边缘函数。
我的边缘函数 "hello-world" 的默认访问地址是什么？
为 test.example.com 创建一个 CNAME 记录，值设置为 example2.com。
帮我的站点 example.com 申请一个免费 SSL 证书。
查看我站点的 IPv6 配置。
```

---

## 6. 与本地开发的配合

- 本仓库默认构建产物为 `_worker.js` + `dist/public`（`npm run build`），
  可配合 `folder_deploy ./dist/public` 快速部署管理面 UI 到 ESA Pages 预览。
- 数据面 / 管理面依赖运行期环境变量（如 `REDIS_URL`，见 `docs/14-deploy-esa.md`），
  这些仍需在 ESA 控制台设置，MCP 只负责平台资源管理，不替代控制台环境变量配置。
