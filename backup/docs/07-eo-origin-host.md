# 07 · EdgeOne 回源 Host 配置

> **EdgeOne 自定义回源 Host 平台侧配置指南**
>
> 上一篇：[06 缓存策略](./06-cache-strategy.md) ｜ 下一篇：[08 FAQ](./08-faq.md)
>
> 返回 [项目首页](../README.md)

> 适用场景：本项目运行在 EdgeOne Makers 时，边缘 `fetch` **本身就能访问外部公网 URL 并携带自定义 Host 头**（与 Cloudflare 一致），常规「域名源站 + 自定义 Host」无需任何平台配置即可在代码层完成。但 EO 边缘函数**没有 `cloudflare:sockets` 那样的可编程 TCP**，无法直接自定义 SNI 连到「裸 IP + 自定义 Host」。这种「裸 IP + 自定义 Host + SNI」场景，应把「回源 Host 自定义」下沉到 **EdgeOne 平台层**，由 EO 在回源时自动注入正确 Host——网关代码只需 `fetch` 到 EO 源站组即可。
>
> 本文档对应 `docs/04-configuration.md` 跨平台能力矩阵中 EO 列的「平台级回源 Host 重写」兜底方案。
>
> **与 1+1 缓存架构的关系**：本项目在 EO 上采用「Makers 做高级定制 + EO 边缘做 CDN」的 1+1 架构。当请求走 **路径 A（同站 fetch 委托 EO 节点缓存）** 时，回源被整体委托给 EO 边缘——此时回源 Host 的自定义**无法再由边缘函数代码层表达**（同站 fetch 必须 HOST/host 头一致），只能靠本指南的「源站组 + 回源 Host 重写」在平台层完成。因此**配置本指南的源站组是路径 A 生效的必要前置**：未完成则 EO 回源会落到错误的 Host 或失败。有自定义回源 Host 的请求会改走路径 B（项目多源站逻辑回源 + 响应头委托缓存），不依赖本配置。

---

> **前置**：本指南的「源站组 / 回源 Host」操作都挂在 **已存在的 EdgeOne Makers 项目** 之下。该项目须先在 [03 部署指南 §2.0](./03-deploy.md#20-先新建项目--服务cf-与-eo-都要且必须最先做) 建好（关联 Git、填 Project Name、输出目录 `.`），否则 `project name` 等变量无从而来，源站组也无处挂载。已建好可直接看下文。

## 一、两种平台机制对比

| 机制 | 配置位置 | 作用范围 | 适合场景 |
|---|---|---|---|
| **A. 回源 HOST 头（源站配置）** | 加速域名 → 源站配置 | 该域名所有回源请求 | 单域名固定的回源 Host（如裸 IP 源站要带 `real.example.com`） |
| **B. Host Header 重写（规则引擎）** | 站点加速 → 规则引擎 | 按匹配条件（Host / 路径等）触发 | 多域名 / 多路径需不同回源 Host，或需动态覆盖 |

> 二者都会把回源请求里的 `Host` 头改成目标值；区别在**触发粒度**：A 跟着域名走，B 跟着规则条件走。绝大多数「CDN 网关回源到固定真实 Host」用 **A** 即可；需要一套 EO 站点承载多个加速域名、各走不同源站 Host 时用 **B**。

---

## 二、机制 A：源站组 + 回源 HOST 头（控制台）

### 2.1 创建源站组（多 IP / 统一源站）

当源站是多个 IP（或一组服务器）时，先建「源站组」，再在域名里引用它。

1. 登录 [EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)，左侧 **服务总览** → 选择目标站点（网站安全加速）。
2. 进入 **域名服务 → 源站组**，单击 **新建源站组**。
3. 填写：
   - **源站组名称**：如 `my-origin-group`
   - **源站类型**：`IP/域名`（裸 IP 源站选 IP）
   - **源站地址**：逐个添加源站 IP（如 `1.2.3.4`、`1.2.3.5`），可配端口与权重
4. 保存。

### 2.2 在加速域名上引用并设回源 HOST

1. **域名服务 → 域名管理** → **添加域名**（或编辑已有域名）。
2. **源站配置**：
   - **源站类型** 选 **源站组** → 选择刚建的 `my-origin-group`（单 IP 也可直接选「IP/域名」填 IP）。
   - **回源 HOST 头**（源站类型为 IP/域名或源站组时出现）：
     - `使用加速域名`：回源 Host = EO 加速域名
     - `使用源站域名`：**源站为 IP 时置灰不可选**
     - `自定义`：填入真实回源 Host，如 `real.example.com` ✅（裸 IP + 自定义 Host 场景选这个）
3. 完成添加 / 保存并发布。

> 这就是「裸 IP 源站 + 自定义 Host」在 EO 上的标准解法：源站填 IP，回源 HOST 头填自定义域名。EO 平台回源时会用该 Host 做 HTTP Host 与 SNI，无需边缘函数写 socket。

---

## 三、机制 B：规则引擎 Host Header 重写（控制台）

当同一 EO 站点需要根据请求 Host / 路径把回源 Host 改写成不同值时使用。

1. 控制台 → 站点 → **站点加速** → **规则引擎** Tab。
2. **创建规则 → 新增空白规则**。
3. **匹配条件**：例如 `Host` 等于 `www.example.com`（或按路径、文件后缀等）。
4. **操作**：单击 **+ 操作** → 选择 **Host Header 重写**。
5. 模式：
   - `自定义`：填固定回源 Host（如 `origin-a.internal`）
   - `跟随源站域名`：回源 Host 跟随源站组里配置的域名
6. **保存并发布**。

> 适用：一套 EO 站点下 `a.example.com` 回源 Host=`host-a`、`b.example.com` 回源 Host=`host-b`，用两条规则分别覆盖。

---

## 四、API 自动化（CI / 一键脚本）

控制台能做的，API 都能做。以下用 EdgeOne OpenAPI（`teo.tencentcloudapi.com`）签名调用，适合写进部署脚本或 CI 步骤（需 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`）。

### 4.1 创建 / 修改源站组（含回源 Host 无关，仅源站列表）

参考 [ModifyOriginGroup](https://cloud.tencent.com/document/api/1552/80592)。关键入参：

```json
{
  "ZoneId": "zone-xxxxxxxx",
  "GroupId": "origin-group-xxxxxxxx",   // 新建时由创建接口返回
  "Name": "my-origin-group",
  "Type": "weight",
  "Records": [
    { "Type": "IP", "Value": "1.2.3.4", "Weight": 100, "Port": 80 }
  ]
}
```

> 源站组本身只管「去哪台机器」，不管 Host；Host 由加速域名的回源 HOST 头或规则引擎决定。

### 4.2 在加速域名上设置回源 HOST 头（API）

创建 / 修改加速域名（`CreateAccelerationDomain` / `ModifyAccelerationDomain`）时，源站配置对象的 `OriginPullHost` 字段即「回源 HOST 头」，取值：
- `origin`：使用源站域名
- `acceleration`：使用加速域名
- 或自定义字符串（填入真实 Host）

### 4.3 规则引擎 Host Header 重写（API）

通过 **规则引擎批量配置接口**（`CreateRule` / `ModifyRule`）下发一条 `HostHeader` 类型动作。动作结构（示意）：

```json
{
  "RuleName": "rewrite-host-to-origin",
  "Status": "enable",
  "Rules": [
    {
      "Criteria": [
        { "CriteriaType": "HOST", "Operator": "equal", "Value": ["www.example.com"] }
      ],
      "Actions": [
        { "Action": "HostHeader", "Parameters": [{ "Name": "HostHeader", "Values": ["real.example.com"] }] }
      ]
    }
  ]
}
```

### 4.4 一体化脚本示例（伪代码）

```bash
# 1) 确保源站组存在（不存在则创建，记录 GroupId）
# 2) 创建加速域名，源站类型=源站组，OriginPullHost=自定义 Host
# 3) 如需按条件改写，下发规则引擎 HostHeader 动作
# 4) 等待 CNAME 生效 + EO 节点预热
```

> 把以上三步封装成 `scripts/eo-setup-origin.sh`，即可在 `edgeone makers deploy` 之后自动补「平台级回源 Host」配置，实现"代码层 Makers + 平台层回源 Host"的完整自动化。

---

## 五、与本项目的对接关系

> **认知修订（2026-08）**：早期文档曾断言「fetch 不能自定义回源 Host，必须靠 TCP SOCKS（仅 CF Workers 有、Pages 无），因此 EO 也不具备该能力」。经 CF 官方文档 + 实测 + 阿里云 ESA 官方 Fetch API 文档查证，**该结论已推翻**：
> - `fetch` 原生支持自定义 Host 头：CF / EO / ESA 三平台均可（`init.headers` 设置 Host）。
> - CF Workers 与 Pages Functions 同 `workerd` 运行时，`fetch` 行为完全一致，**不再区分二者**。
> - SOCKS / `cloudflare:sockets` 不再是「自定义 Host」的必要手段，仅在 CF 上「裸 IP + HTTPS + 自定义 SNI」场景作为 `fetchEngine` 内部自动兜底。
> - **必须设置环境变量 `CLOUD_PLATFORM=cf|eo|esa`** 声明部署厂商，程序不再靠运行时指纹猜测（见 `src/platform/caps.js`）。

| 项目部署形态 | 自定义回源 Host 实现方式 |
|---|---|
| **CF（`CLOUD_PLATFORM=cf`，含 Workers 与 Pages）** | 代码层 `fetch` 即可「域名/裸IP 源站 + 自定义 Host」；HTTPS + 裸 IP + 自定义 SNI 由 `fetchEngine` 内部自动走 `cloudflare:sockets` 兜底，无需平台配置 |
| **EO Makers（`CLOUD_PLATFORM=eo`，本文档）** | 代码层 `fetch` 即可「域名/裸IP 源站 + 自定义 Host」（EO 官方 Fetch 文档未禁止裸 IP，标准 fetch 直连可用）；仅 EO 无可编程 TCP，「HTTPS + 裸 IP + 自定义 SNI」需走 **EO 源站组 + 回源 HOST 头 / 规则引擎 Host Header 重写** 兜底 |
| **阿里云 ESA（`CLOUD_PLATFORM=esa`）** | 代码层 `fetch` 支持自定义 Host 头（仅改 HTTP 头，连接仍按 URL 域名 DNS）；ESA `fetch` 明确不支持 IP/自定义端口，裸 IP 场景须走平台侧源站组兜底 |

**对接要点**：
1. 在 EO 上按本文档配好源站组与回源 HOST 头（或规则引擎）。
2. 本项目的 `src/config/*` 里源站配置仍填 **EO 源站组对应的加速域名 / EO 回源地址**；真正的「真实 Host」由 EO 平台注入，网关代码无需再手写 Host。
3. 若同时开了网关自身的 `hostHeader=custom`，EO 平台层注入的 Host 优先级高于边缘函数 fetch 的 Host 头——以平台配置为准，二者保持一致即可。
4. `engine` 配置：源站/规则级 `engine` 仅支持 `fetch`（默认）、`r2`（CF 直读 R2）、`api`（未来 cnb/github 扩展）。**`socket` 已弃用**，自定义 Host 由 fetch 原生支持，勿再配置。

---

## 六、常见排查

- **回源 502**：源站安全组未放行 EO 回源 IP 段 → 在源站防火墙把 [EO 回源 IP 网段](https://cloud.tencent.com/document/product/1552/https://cloud.tencent.com/document/api/1552/) 加白名单。
- **源站收到 Host 仍是加速域名**：回源 HOST 头选了「使用加速域名」→ 改为「自定义」填真实 Host；或检查规则引擎是否覆盖了该 Host。
- **源站为 IP 但回源 HOST 想用源站域名**：IP 源站不支持「使用源站域名」，必须选「自定义」显式填 Host。
- **EO Makers 边缘函数里手动设 Host 无效**：属正常——EO 回源 Host 由平台层（源站配置 / 规则引擎）统一管控，边缘函数 fetch 的 Host 头不主导回源 Host。
