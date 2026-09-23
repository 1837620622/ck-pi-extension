# ck-pi-zen-session

OpenCode Zen 免费模型同步、请求头伪装与 Session 会话自动维护插件，专为 [Pi 编码智能体](https://github.com/earendil-works/pi) 打造。

---

## 🌟 核心特性

- ⚡ **/zen 指令一键激活与动态免费模型全量探测**：输入一次 API Key (`/zen oc_sk_...`)，全自动在线探测所有带有 `free` / `zero` / `pickle` 标识的模型，全量标记 0 额度消耗 (`cost: { input: 0, output: 0 }`) 并动态热挂载进 Pi 与 CC-Switch。
- 🔄 **官方算法深度逆向**：完整对齐 OpenCode 客户端 `Identifier.descending("ses")` 与 `Identifier.ascending("msg")` 算法，生成 30 位降序会话 ID 与升序请求 ID，支持毫秒级时间戳反解。
- 🛡️ **全套官方级伪装请求头**：自动注入全部 7 个官方客户端对齐请求头：
  - `User-Agent`: `opencode/1.18.32 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14`
  - `x-opencode-client`: `cli`
  - `x-opencode-session`: `ses_<12位反转时间戳十六进制><14位Base62>`
  - `x-opencode-request`: `msg_<12位升序时间戳十六进制><14位Base62>`（每次 HTTP 请求唯一）
  - `x-opencode-project`: `prj_<16位工作区哈希>`（与官方项目哈希行为对齐）
  - `x-session-affinity`: 与 session 严格同步
  - `X-Session-Id`: 与 session 严格同步
- ⏱️ **30 分钟无感前置平滑轮换**：官方后端限制免费会话时长约为 1 小时（超时直接 403 `FreeTierError`）。本插件在底层请求拦截器（`before_provider_headers`）和 Agent 循环守卫（`before_agent_start`）中设置 30 分钟主动换新阈值，兼顾会话上下文平滑与长期高频调用稳定性，确保永不触碰 1 小时硬限制。
- 🚑 **网关异常自愈守卫 (`after_provider_response`)**：新增底层响应拦截，一旦检测到远端网关返回 401 或 403 `FreeTierError`，立即当场触发 Session 换新与后台持久化，并提示用户，彻底终结会话失效死锁。
- 🔑 **多源凭据自适应感知**：支持优先读取 `OPENCODE_API_KEY`、`OPENCODE_ZEN_API_KEY` 环境变量，亦可直接使用 `/zen <key>` 配置，无缝兼容各类容器与终端环境。
- 🌐 **原生代理支持解除限速与额度**：由于 OpenCode 端点受 Cloudflare WAF 保护，在 HTTP 头部伪造假 IP 无法欺骗底层 TCP 握手并会招致 WAF 封禁；如需轮换出口解除 IP 限制，直接配置标准网络代理（如 `export HTTPS_PROXY=http://127.0.0.1:7890`）即可让物理连接从新节点发起，安全解除限速与额度。
- 🧰 **官方全套 6 大核心工具链守卫与字母序规约**：OpenCode Zen 免费端点对工具集有硬性要求（无工具直接拒绝）。插件在 `before_provider_request` 钩子中实时监控请求体：
  - 若用户处于纯文本或无工具模式，自动补齐官方完整的 6 大核心工具（`bash`, `edit`, `glob`, `grep`, `read`, `write`）与 `tool_choice: "auto"`，彻底根除 403 拦截；
  - 若请求已有工具，严格按照官方客户端规约（`localeCompare`）按函数名升序重排；
  - 自动对齐流式用量元数据 `stream_options: { include_usage: true }`。
- 🌐 **独立供应商隔离与零干扰保障 (`isZenModelTarget`)**：严格将生命周期守卫、请求头与请求体拦截限制在 `opencode-zen-free` 命名空间内，对 `relayhub`、`deepseek`、`anthropic`、`openai`、`onerouter`、`apmix` 等其他任何模型及 Claude Code（`pi-cc-extensions`）插件 100% 保持完全静默放行，零副作用、零冲突。
- 🧠 **高精智能模型能力与参数解析引擎 (v0.1.7)**：无论输入新 Key 还是 OpenCode Zen 官方端点动态上线任何新免费/零额度模型，自动深度识别其上下文窗口（Context Window，如 1M, 256K, 200K, 128K）、最大输出（Max Tokens，如 128K, 64K, 32K, 16K）、推理思考能力与思考等级映射（thinkingLevelMap，涵盖 6 档深度推理 [minimal..xhigh]、3 档标准推理 [low, high, max] 或快反模式）以及视觉多模态支持，并在 `/zen <key>` 和 `/zen list` 中呈现精美结构化卡片。
- 🛡️ **OpenAI 标准思考档位全链路映射与双重防线 (v0.1.8)**：彻底修复 OpenCode Zen 上游端点不支持 `max` / `xhigh` 思考档位导致抛出 `[400] Invalid request parameters` 的致命问题。全面将思考档位映射对齐 OpenAI 标准 `reasoning_effort`（`low` / `medium` / `high`），并在 `before_provider_request` 请求体守卫中设立兜底防线，自动将非标准或溢出档位降级规约为合法参数，确保小米 MiMo、英伟达 Nemotron、Meta Muse Spark 等全系模型在任意 Pi 默认思考模式下 100% 稳定响应。
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
| `/zen` | 立即一键强制换新 Session 并全面刷新所有请求头；若未配置 Key 则弹出交互输入框 |
| `/zen refresh` | 强制生成全新的合法降序 Session ID 并更新所有请求头与落盘配置 |
| `/zen status` | 查看当前 API Key 掩码、活跃会话精确存活时间及模型就绪状态 |
| `/zen list`（或 `/zen models`） | 查看当前已激活的所有免费模型列表 |

---

## 🤖 内置免费模型库参数

插件自动同步官方 9 款免费模型并配置精准上限与思维链等级：

| 模型 ID | 上下文窗口 | 最大输出 | 推理思考等级 (thinkingLevelMap) | 支持模态 |
| --- | --- | --- | --- | --- |
| `mimo-v2.5-free` | 200,000 | 32,000 | 全档位支持 (自动对齐 OpenAI low/medium/high) | 文本、图像 |
| `mimo-v2.6-flash-free` | 200,000 | 32,000 | 全档位支持 (自动对齐 OpenAI low/medium/high) | 文本、图像 |
| `nemotron-3.5-lightning-free` | 262,144 | 262,144 | 全档位支持 (自动对齐 OpenAI low/medium/high) | 文本 |
| `nemotron-3-ultra-free` | 1,000,000 (1M) | 128,000 | 全档位支持 (自动对齐 OpenAI low/medium/high) | 文本 |
| `ling-3.0-flash-fin-free` | 262,144 | 32,768 | 全档位支持 (自动对齐 OpenAI low/medium/high) | 文本 |
| `big-pickle` | 200,000 | 32,000 | 全档位支持 (自动对齐 OpenAI low/medium/high) | 文本 |
| `muse-spark-1.3-contributor-free` | 1,048,576 (1M) | 131,072 | 全档位支持 (自动对齐 OpenAI low/medium/high) | 文本、图像 |
| `muse-spark-1.2-contributor-free` | 1,048,576 (1M) | 131,072 | 全档位支持 (自动对齐 OpenAI low/medium/high) | 文本、图像 |
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
