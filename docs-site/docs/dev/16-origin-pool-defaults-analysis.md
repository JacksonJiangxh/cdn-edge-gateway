# 源站池回源参数默认值盘点与合理性分析

> 事实来源：源码实读（非记忆/缓存快照）。涉及 `src/config/schema.js`、`src/balancer/failover.js`、`src/balancer/circuit.js`、`src/platform/caps.js` 与 `web/app/views/pools.js`。
> 适用范围：**仅当池内源站数 ≥ 2 时**（`normFailover` 在单源站时返回 `null`，不承载任何 failover 配置）。

---

## 0. 先纠正 3 处常见记忆偏差

| 你的记忆 | 代码真相 | 影响 |
|---|---|---|
| 超时 10 秒 | `timeoutMs` 默认 **0**（回落全站/平台基础超时），且单次尝试有 **500ms 下限**兜底 | 不是"固定 10s"，而是"不配置就交给平台/全站" |
| `maxRetryBodyBytes` 6.5 万 | 默认 **5242880（5MB）** | 重试时可物化的请求体上限宽得多 |
| "失败冷却 15 秒 = 15 秒内不再使用" | 是"**某源站一次失败后的 15s 内，不被同边缘 isolate 复用**"（纯内存冷却名单），**非全局禁用**，跨 isolate 由 failover+竞速兜底 | 单 isolate 语义，新 isolate 仍可能短窗内打到该源站 |

---

## 1. 参数全集：默认值 / 源码位置 / 前端可见性

| 参数 | 归一化默认值 | 允许范围 | 源码位置 | 前端可见/可编辑 |
|---|---|---|---|---|
| `enabled` | `true` | bool | `schema.js:1458` | 不可直接编辑（池级自动带） |
| `retryOn` | `['4xx5xx']`（所有 status≥400 换源，200/3xx 不换） | 数组 / 特标 | `schema.js:1459,1473-1489` | 不可编辑 |
| `maxRetries` | **源站数 − 1**（上限 9） | 0–10 | `schema.js:1456,1494` | 不可编辑 |
| `timeoutMs`（单次回源超时） | **0**（回落全站/平台） | 1000–60000 | `schema.js:1461,1495` | 池内不可编辑（由顶层 origin 配置） |
| `maxRetryBodyBytes` | **5242880（5MB）** | 0–32MB | `schema.js:1462,1498` | 不可编辑 |
| `penaltySeconds`（失败即冷却） | **15** | 0–600（0=关闭） | `schema.js:1463,1500` | ✅ 可编辑（placeholder 15） |
| `totalTimeoutMs`（总时间预算） | **0**（自动推导） | 0–120000 | `schema.js:1464,1502` | ✅ 可编辑（placeholder 0） |
| `speculativeMs`（竞速阈值） | **500** | 0–60000（0=关闭） | `schema.js:1465,1504` | ✅ 可编辑（placeholder 500） |
| `TRIP_THRESHOLD`（被动熔断阈值） | **3 次**（60s 内） | 常量 | `circuit.js:26` | ❌ 不可见 |
| `COUNTER_TTL`（熔断计数器存活） | **60s**（到期自动恢复） | 常量 | `circuit.js:29` | ❌ 不可见 |
| 软恢复试水窗口 | **60s**（冷却到期后进试水，`×0.3` 权重，需连续成功 2 次才恢复满权重） | 常量 | `circuit.js:65-71` | ❌ 不可见 |
| `WRITE_DEBOUNCE_MS`（熔断 KV 写去抖） | **3000** | 常量 | `circuit.js` 设计注释 | ❌ 不可见 |
| `READ_SAMPLE`（熔断 KV 采样读概率） | **~0.1** | 常量 | `circuit.js` 设计注释 | ❌ 不可见 |

### 平台能力（caps，决定硬上限）

| 平台 | `maxExecutionMs`（请求执行上限） | `firstByteMs`（首字节约束） | `SAFETY_RESERVE`（安全余量） |
|---|---|---|---|
| Cloudflare (`cf`) | **30000** | 无（undefined） | **5000** |
| EdgeOne (`eo`) | **120000`** | 无（undefined） | **5000** |
| ESA (`esa`) | **120000** | **10000**（网关 10s 首字节硬约束） | **2000** |

> 来源：`caps.js:336-340`、`failover.js:43-47`。均可被环境变量 `EXECUTION_LIMIT_MS` / `FIRST_BYTE_LIMIT_MS` 覆盖（测试/特殊部署）。

---

## 2. 运行时生效路径（数据流）

```mermaid
flowchart TD
  A[平台 caps: maxExecutionMs / firstByteMs] --> B[normFailover POOL_BASE 基线归一化]
  B --> C[failover.js 读取池级参数]
  C --> D[computeBudget: hardCap 与 totalTimeoutMs / timeoutMs×maxRetries]
  D --> E[单次尝试 timeoutMs = min(baseTimeout, max(500, remaining))]
  E --> F[竞速 speculativeMs 并行打第二候选]
  C --> G[circuit.js 冷却 penaltySeconds + 熔断 TRIP_THRESHOLD/COUNTER_TTL]
  G --> H[selectOrigin 排除冷却/熔断源站]
  F --> H
```

### 2.1 总时间预算 `computeBudget`（`failover.js:62-70`）

```
hardCap = max(1000, min(maxExecutionMs, firstByteMs ?? ∞) - SAFETY_RESERVE)
budget  = totalTimeoutMs > 0
            ? min(totalTimeoutMs, hardCap)
            : min((maxRetries + 1) × timeoutMs, hardCap)
```

- 当 `totalTimeoutMs = 0`（默认）：预算 = `(maxRetries+1) × timeoutMs`，但 `timeoutMs` 默认也是 0！此时 `0 × (maxRetries+1) = 0`，会被 `hardCap` 的 `max(1000, …)` 兜底——**实际等效为 hardCap**（平台上限减余量）。
- 当 `timeoutMs = 0` 时，单次回源超时回落到"全站/平台基础超时"（取决于上层 `ruleOrigin.originTimeoutMs` 或 `poolTimeout`），**不是**字面 10000ms。

### 2.2 单次尝试超时（`failover.js:188-192`）

```
remaining = budget - (now - startTs)
baseTimeout = ruleTimeout>0 ? ruleTimeout : poolTimeout(origin 级)
timeoutMs(单次) = min(baseTimeout, max(500, remaining))
```

- **500ms 下限**：预算将耗尽时，最后一次尝试至少给 500ms，避免"预算见底就 0ms 立即失败"。
- 每次换源都重算 `remaining`，保证所有尝试之和不超过 `budget`。

### 2.3 竞速（`failover.js:204-214`）

- 仅首个尝试 (`attempt === 0`)、请求幂等安全（GET/HEAD 或已物化 body）、且 `remaining > speculativeMs` 时启用。
- 首路超 `speculativeMs` 无首字节 → 并行打第二候选，谁先成功用谁，**慢路 abort 且不记入冷却/熔断**（竞速失败不惩罚）。

### 2.4 失败即冷却 vs 被动熔断（`circuit.js`）

| 机制 | 触发 | 范围 | 持久化 | 恢复 |
|---|---|---|---|---|
| **冷却（penalize）** | 一次失败 | **本 isolate 内存** | 零 KV | `penaltySeconds` 后自动过期 |
| **熔断（trip）** | 60s 内失败 ≥ 3 次 | 跨 isolate（KV） | KV（去抖 3s、采样读 10%） | `COUNTER_TTL=60s` 后自动恢复 + 软恢复试水 |

> 设计意图：`circuit.js:13-20` 明确"冷却/最近成功/软恢复全存 isolate 内存、零 KV；只有熔断计数持久化 KV"。理由：KV 最终一致传播（1-5s）对 15s 冷却窗几乎无收益，新 isolate 多打一次坏源站由 failover + 竞速兜速度、fail-open 兜可用性。

---

## 3. 参数间的关联与约束（合理性分析）

### 3.1 `budget` 与 `timeoutMs × maxRetries` 的叠加约束
默认 `timeoutMs=0` 且 `totalTimeoutMs=0` 时，预算 = `hardCap`（平台上限减余量）：
- **CF**：`min(30000, ∞) − 5000 = 25000ms`
- **EO**：`min(120000, ∞) − 5000 = 115000ms`
- **ESA**：`min(120000, 10000) − 2000 = 8000ms`（**首字节约束 10s 主导**）

一旦用户显式设 `timeoutMs`（如 10000）又保留 `totalTimeoutMs=0`，预算变为 `min((maxRetries+1)×10000, hardCap)`。例如 3 源站 `maxRetries=2`：`min(30000, 25000[CF]) = 25000ms`——CF 下会被 hardCap 截断，**多出的换源次数拿不到时间**，可能"预算耗尽但还有候选源站没试"。这是默认 0/0 设计刻意规避的陷阱：**留空=按平台自动推导，最稳**。

### 3.2 竞速 `speculativeMs` 与冷却/熔断的互补
- 竞速是"**速度兜底**"：首字节慢就并行，不惩罚失败路。
- 冷却/熔断是"**准确性兜底**"：明确标记坏源站，避免反复重试已知坏节点。
- 二者不冲突：`speculativeMs=500` 默认很激进（500ms 就开第二路），在源站偶发慢但没死时**显著降低尾延迟**；只有当源站**真失败**（连接错/5xx）才进冷却/熔断名单。

### 3.3 ESA 10s 首字节硬约束的特殊影响
ESA 平台 `firstByteMs=10000`，使 `hardCap=8000ms`。这带来两个连锁效应：
1. `totalTimeoutMs` 即便配到 120000，也会被 `min(…, 8000)` 截断，**在 ESA 上无效**。
2. `speculativeMs=500` 相对 8000ms 预算占比合理；但若用户把 `speculativeMs` 配到 5000+，首路就已吃掉大半预算，竞速价值骤降。

### 3.4 单源站恒关 failover 的边界
`normFailover` 在 `originsLen <= 1` 时直接返回 `null`（`schema.js:1453`）。意味着**所有上述参数对单源站池都不存在**——没有换源、没有冷却、没有竞速，只有顶层 origin 自身的 `originTimeoutMs`。这是合理设计（无第二地址可回退）。

### 3.5 重试体上限 `maxRetryBodyBytes=5MB`
换源时需物化请求体才能复用到第二路。5MB 默认上限对绝大多数 API/网页回源足够；上传大文件（>5MB）的请求**不会被换源**（超出部分无法物化），将直接走 fail-open。这是有意的代价取舍（避免内存爆量）。

---

## 4. 潜在默认值冲突与调优建议

### 4.1 冲突预警

| 场景 | 风险 | 建议 |
|---|---|---|
| CF + 显式 `timeoutMs=10000` + `totalTimeoutMs=0` + 多源站 | 预算被 hardCap(25s) 截断，换源次数"有名额没时间" | 显式设 `totalTimeoutMs ≤ 25000`，或保持 `timeoutMs=0` 让 budget 走 hardCap |
| ESA + 大 `speculativeMs`(>3000) | 首路吃掉预算大半，竞速收益低且挤压换源时间 | ESA 上 `speculativeMs` 控制在 500–2000 |
| 全平台 + `penaltySeconds=0` 且 `timeoutMs` 很短 | 无冷却，坏源站每请求都被重试一遍，放大故障 | 至少保留默认 15s 冷却 |
| 全平台 + `retryOn` 配成仅 `[503]` | 其他 5xx（502/504）不换源，直接透传错误 | 默认 `['4xx5xx']` 已覆盖绝大多数故障，自定义需谨慎 |

### 4.2 分平台推荐配置

**Cloudflare（硬上限 30s，余量 5s → 预算 25s）**
- 保持 `timeoutMs=0`、`totalTimeoutMs=0`（自动推导最稳）。
- 2–3 源站时 `maxRetries` 自动 1–2，配合 25s 预算绰绰有余。
- `speculativeMs=500` 默认即可，源站慢时尾延迟改善明显。

**EdgeOne（硬上限 120s，余量 5s → 预算 115s）**
- 大预算下可适度提高 `timeoutMs`（如 15000）应对慢源站，仍不会撞墙钟。
- 高可用场景可启用 `totalTimeoutMs` 明确封顶，防止雪崩时长时间挂起。

**ESA（首字节 10s 约束 → 预算 8s）**
- **总时间被首字节死死卡在 8s**，任何 `totalTimeoutMs > 8000` 都无效，别浪费配置。
- 源站必须能在 10s 内出首字节，否则 ESA 网关先超时（早于应用层 budget）。
- `speculativeMs` 建议 500–1500，给换源/竞速留足预算。

### 4.3 熔断 × 冷却 的协同调优
- 默认 **冷却 15s + 熔断 60s/3 次** 是"短窗防抖 + 长窗确诊"的组合：15s 冷却挡住瞬时抖动，60s 内累计 3 次才确诊熔断（避免单次抖动误杀）。
- 若源站故障恢复慢（如 5 分钟才修好），默认 60s 后会自动重试并可能再次熔断——这是 **fail-open 兜底** 的预期行为，不致命。
- 高流量场景：冷却 15s 在单 isolate 内足够；跨 isolate 一致性靠熔断 KV（去抖+采样）保证，无需调小冷却窗口。

---

## 5. 速查小结

- 你点名的 4 个：
  - **失败冷却 15s** = `penaltySeconds`（仅本 isolate，非全局禁用）✅
  - **请求超时** = `timeoutMs`，默认 **0（回落平台）**，单次尝试 **500ms 下限** ✅
  - **总耗时** = `totalTimeoutMs`，默认 **0（按平台上限自动推导）** ✅
  - **首包耗 500** = `speculativeMs`（首字节 500ms 未到就并行第二路）✅
- 额外强相关：
  - `maxRetries` = 源站数 − 1（上限 9），`retryOn` = 全部 4xx/5xx
  - 被动熔断：60s 内失败 ≥ 3 次 → 熔断，60s 后自动恢复
  - 平台硬约束：CF 25s / EO 115s / **ESA 8s**（受 10s 首字节约束）
- **最关键的合理性结论**：默认 `timeoutMs=0` + `totalTimeoutMs=0` 的组合是**刻意设计**——让预算自动贴合各平台执行上限，避免"换源次数×超时"无脑叠加撞墙钟。用户一旦显式填 `timeoutMs` 却漏填 `totalTimeoutMs`，在 CF/ESA 上极易出现"有换源名额却没时间"的隐性截断，应优先显式配置 `totalTimeoutMs` 或保持双 0。
