# ck-pi-zen-session

OpenCode Zen 免费模型同步、请求头伪装与 Session 会话自动维护插件，专为 [Pi 编码智能体](https://github.com/earendil-works/pi) 打造。

---

## 🌟 核心特性

- ⚡ **/zen 指令一键激活**：输入一次 API Key (`/zen oc_sk_...`)，全自动验证、探测 9 款可用免费模型并注入 Pi 与 CC-Switch。
- 🔄 **官方算法深度逆向**：完整对齐 OpenCode 客户端 `Identifier.descending("ses")` 与 `Identifier.ascending("msg")` 算法，生成 30 位降序会话 ID 与升序请求 ID，支持毫秒级时间戳反解。
- 🛡️ **全套官方级伪装请求头**：自动注入全部 6 个官方客户端对齐请求头：
  - `User-Agent`: `opencode/1.18.32 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14`
  - `x-opencode-client`: `cli`
  - `x-opencode-session`: `ses_<12位反转时间戳十六进制><14位Base62>`
  - `x-session-affinity`: 与 session 严格同步
  - `X-Session-Id`: 与 session 严格同步
  - `x-opencode-request`: `msg_<12位升序时间戳十六进制><14位Base62>`（每次 HTTP 请求唯一）
- ⏱️ **30 分钟无感前置平滑轮换**：官方后端限制免费会话时长约为 1 小时（超时直接 403 `FreeTierError`）。本插件在底层请求拦截器（`before_provider_headers`）和 Agent 循环守卫（`before_agent_start`）中设置 30 分钟主动换新阈值，兼顾会话上下文平滑与长期高频调用稳定性，确保永不触碰 1 小时硬限制。
- 🧰 **Agent 工具链兼容性守卫**：OpenCode Zen 免费端点对工具集有硬性要求（无工具直接拒绝）。插件在 `before_provider_request` 钩子中实时监控请求体，若用户处于无工具或纯文本问答模式，自动补齐兼容性工具定义，彻底根除 403 拦截。
- 🌐 **独立供应商隔离命名空间**：注册为独立供应商 `opencode-zen-free`，彻底避开并兼容用户自带的官方登录 `opencode` / `opencode-zen` 套餐，互不干扰、平稳共存。
- 🧠 **精准上下文与思维链适配**：严格对齐 9 款免费模型的 `contextWindow`、`maxTokens` 与 `thinkingLevelMap`（涵盖小米 MiMo、英伟达 Nemotron、Meta Muse Spark、Ling、Jev 等）。
- 🔌 **全自动多端持久化同步**：自动双写 Pi 本地配置（`~/.pi/agent/models.json` 和 `~/.pi/agent/auth.json`），若检测到 CC-Switch 亦无缝同步其 SQLite 数据库。

---

## 📦 安装方法

### 方式 1：npm 安装（推荐）

```bash
pi install npm:ck-pi-zen-session
```

### 方式 2：GitHub 源码安装

```bash
pi install git:github.com/1837620622/ck-pi-extension
```

---

## 🚀 指令用法

在 Pi 交互界面中直接键入 `/zen`：

| 指令 | 说明 |
| --- | --- |
| `/zen <oc_sk_xxx>` | 设置/更新 API Key，自动在线验证并全量同步模型与全套请求头 |
| `/zen` | 智能检查当前会话状态；若会话临近过期自动换新；若未配置 Key 则弹出交互输入框 |
| `/zen refresh` | 强制生成全新的合法降序 Session ID 并更新所有请求头与落盘配置 |
| `/zen status` | 查看当前 API Key 掩码、活跃会话精确存活时间及模型就绪状态 |
| `/zen list`（或 `/zen models`） | 查看当前已激活的所有免费模型列表 |

---

## 🤖 内置免费模型库参数

插件自动同步官方 9 款免费模型并配置精准上限与思维链等级：

| 模型 ID | 上下文窗口 | 最大输出 | 推理思考等级 (thinkingLevelMap) | 支持模态 |
| --- | --- | --- | --- | --- |
| `mimo-v2.5-free` | 200,000 | 32,000 | low / high / max | 文本、图像 |
| `mimo-v2.6-flash-free` | 200,000 | 32,000 | low / high / max | 文本、图像 |
| `nemotron-3.5-lightning-free` | 262,144 | 262,144 | low / high / max | 文本 |
| `nemotron-3-ultra-free` | 1,000,000 (1M) | 128,000 | low / high / max | 文本 |
| `ling-3.0-flash-fin-free` | 262,144 | 32,768 | low / high / max | 文本 |
| `big-pickle` | 200,000 | 32,000 | low / high / max | 文本 |
| `muse-spark-1.3-contributor-free` | 1,048,576 (1M) | 131,072 | minimal / low / medium / high / xhigh | 文本、图像 |
| `muse-spark-1.2-contributor-free` | 1,048,576 (1M) | 131,072 | minimal / low / medium / high / xhigh | 文本、图像 |
| `jev-1.13-free` | 128,000 | 16,384 | 基础模型（无 reasoning） | 文本 |

> 若 OpenCode 后端未来发布新免费模型，插件将自动探测发现并使用安全的自适应参数接入。

---

## 🔬 官方算法逆向解析

OpenCode Zen 客户端针对防刷和网关鉴权设计了基于时间戳编码的降序（descending）与升序（ascending）标识符体系：

```typescript
// 1. Session ID (前缀 ses_, 降序排列)
export function generateZenSessionId(timestampMs = Date.now()): string {
  const combined = BigInt(timestampMs) * 0x1000n + BigInt(sequenceCounter);
  const inverted = ~combined; // 关键位反转：时间越新，字典序十六进制越小
  let hex = "";
  for (let i = 0; i < 6; i++) {
    const byte = Number((inverted >> BigInt(40 - 8 * i)) & 0xffn);
    hex += byte.toString(16).padStart(2, "0");
  }
  return `ses_${hex}${randomBase62(14)}`; // 30 字符
}

// 2. Request ID (前缀 msg_, 升序排列)
export function generateZenRequestId(timestampMs = Date.now()): string {
  const combined = BigInt(timestampMs) * 0x1000n + BigInt(sequenceCounter);
  let hex = "";
  for (let i = 0; i < 6; i++) {
    const byte = Number((combined >> BigInt(40 - 8 * i)) & 0xffn);
    hex += byte.toString(16).padStart(2, "0");
  }
  return `msg_${hex}${randomBase62(14)}`; // 30 字符
}
```

---

## 👨‍💻 作者与许可

- 作者：传康Kk
- 邮箱：`1837620622@qq.com`
- 仓库：[https://github.com/1837620622/ck-pi-extension](https://github.com/1837620622/ck-pi-extension)
- 协议：MIT License
