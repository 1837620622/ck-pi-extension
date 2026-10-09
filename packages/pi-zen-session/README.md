# ck-pi-zen-session

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.24-blue.svg?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/runtime-Pi%20Agent%20%3E%3D0.85.0-orange.svg?style=flat-square" alt="Pi Runtime" />
  <img src="https://img.shields.io/badge/protocol-Completions%20%26%20Responses-informational.svg?style=flat-square" alt="Protocol" />
  <img src="https://img.shields.io/badge/session%20algorithm-Descending%20Timestamp%20Base62-purple.svg?style=flat-square" alt="Session Algorithm" />
  <img src="https://img.shields.io/badge/zero--cost%20models-13%20Verified-success.svg?style=flat-square" alt="Zero Cost Models" />
</p>

<p align="center">
  <a href="#ck-pi-zen-session">中文说明</a> | <a href="#ck-pi-zen-session-en">English Documentation</a>
</p>

OpenCode Zen 免费模型同步、双协议路由 (Completions & Responses)、请求头伪装与会话自愈插件，专为 [Pi 编码智能体](https://github.com/earendil-works/pi) 打造。

---

## 赞助与支持

如果您觉得本项目提升了您的开发效率，欢迎赞助支持！您的赞助将直接用于持续维护、网络节点验证、逆向协议对齐与新特性的快速迭代。

### 赞助渠道

- **GitHub Sponsors**: [https://github.com/sponsors/1837620622](https://github.com/sponsors/1837620622)
- **企业赞助与商务合作**:
  - 欢迎 AI 基础设施提供商、代理网关服务商或团队提供赞助。
  - 赞助权益包含：在项目 README 显著位置展示企业 Logo 与链接、优先处理定制化需求与专属支持。

---

## 目录

- [一、核心特性](#一核心特性)
- [二、双协议架构与 Issue #1 修复](#二双协议架构与-issue-1-修复)
- [三、指令用法与操作面板](#三指令用法与操作面板)
- [四、内置免费模型库参数](#四内置免费模型库参数)
- [五、官方算法逆向解析](#五官方算法逆向解析)
- [六、安装方法](#六安装方法)
- [七、更新日志](#七更新日志)
- [八、许可](#八许可)

---

## 一、核心特性

- **/zen 指令一键激活与动态免费模型全量探测**：
  输入一次 API Key (`/zen oc_sk_...`)，全自动在线探测所有带有 `free` / `zero` / `pickle` 标识的模型，全量标记 0 额度消耗 (`cost: { input: 0, output: 0 }`) 并动态热挂载进 Pi 与 CC-Switch。

- **双供应商双协议分流架构**：
  将 OpenCode Zen 拆分为 `opencode-zen-free` (`openai-completions`) 与 `opencode-zen-free-responses` (`openai-responses`)，彻底解决 Muse Spark 系列模型报错 `400 ModelProtocolUnsupported` 的协议冲突问题。

- **官方算法深度逆向**：
  完整对齐 OpenCode 客户端 `Identifier.descending("ses")` 与 `Identifier.ascending("msg")` 算法，生成 30 位降序会话 ID 与升序请求 ID，支持毫秒级时间戳反解。

- **全套官方级伪装请求头**：
  自动注入全部 7 个官方客户端对齐请求头：
  - `User-Agent`: `opencode/1.18.32 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14`
  - `x-opencode-client`: `cli`
  - `x-opencode-session`: `ses_<12位反转时间戳十六进制><14位Base62>`
  - `x-opencode-request`: `msg_<12位升序时间戳十六进制><14位Base62>`（每次 HTTP 请求唯一）
  - `x-opencode-project`: `prj_<16位工作区哈希>`（与官方项目哈希行为对齐）
  - `x-session-affinity`: 与 session 严格同步
  - `X-Session-Id`: 与 session 严格同步

- **25 分钟平滑轮换与 401/403 自动换新自愈**：
  官方后端免费会话限制约 1 小时（超时直接 403 `FreeTierError`）。本插件在底层拦截器和生命周期钩子中设置 25 分钟主动换新阈值，且在收到 401/403 异常时当场自动轮换并重试，彻底杜绝死锁。

- **全局 Fetch 底层拦截与会话压缩 403 根治**：
  Pi 执行上下文压缩时常发起纯文本无工具请求，导致网关拦截。底层拦截器自动注入官方 6 大核心工具链（`bash`, `edit`, `glob`, `grep`, `read`, `write`）与 `tool_choice: "none"`，并对 ChatCompletions 执行 SSE-to-JSON 汇聚反序列化，彻底解决压缩卡死。

- **同模型 3 次透明重试自愈**：
  遇网络抖动、网关超时（500/502/503/504/520-525/533）或上游伪 200 空响应（`Provider returned an empty response`）时，底层无损流预读并在内存中自动进行 3 次指数退避重试，严禁擅自跨模型降级。

- **严格供应商隔离**：
  所有生命周期钩子与拦截逻辑严格限定于 `opencode-zen-free` 和 `opencode-zen-free-responses`，对 `relayhub`、`deepseek`、`anthropic`、`openai` 及其他插件完全静默放行，零副作用。

---

## 二、双协议架构与 Issue #1 修复

### 1. 问题背景 (Issue #1)

OpenCode Zen 上游网关对不同的模型系列启用了不同的传输协议：
- **标准 Chat 模型**（Xiaomi MiMo, NVIDIA Nemotron, Big Pickle, Ling, Space Bunny 等）：运行在 `/zen/v1/chat/completions`（OpenAI Chat Completions 协议）；
- **Meta Muse Spark 系列**（`muse-spark-1.3-contributor-free`, `muse-spark-1.2-contributor-free`）：**仅部署在** `/zen/v1/responses`（OpenAI Responses API 协议）。

如果将 Muse Spark 模型作为 `openai-completions` 提交到 `/zen/v1/chat/completions`，OpenCode 网关会立即拒绝并返回 HTTP 400 错误：
```json
{"type": "ModelProtocolUnsupported", "message": "Model does not support this protocol."}
```

### 2. 双供应商架构设计

为从根本上解决该协议限制，`ck-pi-zen-session 0.1.22` 引入了双供应商路由体系：

1. **`opencode-zen-free` (api: `openai-completions`)**：
   - 托管模型：`fledge-alpha-free`, `ling-3.1-flash-free`, `mimo-v2.6-flash-free`, `nemotron-3.5-lightning-free`, `big-pickle`, `space-bunny-free`, `longcat-2.5-preview-free`。
   - 请求端点：`/zen/v1/chat/completions`。
   - 工具格式：Nested function 结构 (`{ type: "function", function: { ... } }`)。
   - 携带参数：`stream_options: { include_usage: true }`, `reasoning_effort`。

2. **`opencode-zen-free-responses` (api: `openai-responses`)**：
   - 托管模型：`muse-spark-1.3-contributor-free`, `muse-spark-1.2-contributor-free`。
   - 请求端点：`/zen/v1/responses`。
   - 工具格式：Flat 扁平结构 (`{ type: "function", name, description, parameters }`)。
   - 请求参数规约：使用 `input`（而非 `messages`）、`max_output_tokens`，在无工具/压缩模式下注入 `tool_choice: "none"`，**严禁注入 Chat 专有字段**（`stream_options`, `reasoning_effort`, `max_tokens`），避免网关抛出 400 校验异常。

3. **双端点透明持久化与路由**：
   - 同步时自动在 `~/.pi/agent/models.json` 和 `auth.json` 中配置两个独立 Provider；
   - `/zen refresh` 与 `/zen ping` 自适应分流探测；
   - `/zen model muse-spark-1.3-contributor-free` 自动切换底层 Provider 为 `opencode-zen-free-responses`。

---

## 三、指令用法与操作面板

在 Pi 终端交互界面中，可通过 `/zen` 体系指令进行全方位控制：

| 指令 | 说明 | 交互效果 |
|:---|:---|:---|
| `/zen` | **无参直接运行**：全自动检测并续期 Session ID，刷新请求头，重新对齐免费模型，双写同步 `models.json` / CC-Switch 并热载入 Pi | 输出状态面板与已同步模型摘要 |
| `/zen <key>` 或 `/zen key <key>` | **更新 API Key**：设置/更换 OpenCode Zen API Key，自动在线验证并全量同步模型与全套请求头 | 输出新 Key 验证结果与模型卡片 |
| `/zen refresh` 或 `/zen sync` | **强制换新 Session**：强制生成全新的合法降序 Session ID 并更新所有请求头与落盘配置 | 输出全新 Session ID 与就绪状态 |
| `/zen list` 或 `/zen models` 或 `/zen free` | **查看模型列表**：展示全部可用免费模型详细规格卡片（上下文、最大输出、思考等级、协议归属） | 输出分级卡片列表 |
| `/zen add <模型ID> [名称]` | **登记自定义模型**：支持将新上线的免费模型登记至本地扩展库并实时热载入 | 输出新增模型配置状态 |
| `/zen status` | **查看运行状态**：查看当前 API Key 掩码、活跃会话精确存活时间、模型库与请求头保护状态 | 输出运行状态仪表盘 |
| `/zen ping [模型ID]` | **网络时延探针**：实时探测 Zen 免费模型网络连通性与往返延迟 (RTT) | 输出各模型网络时延与评级 |
| `/zen model <模型ID>` | **快速切换模型**：一键切换当前 Pi 会话所使用的 Zen 模型（自动识别 Provider 归属） | 即刻切换生效 |

面板输出示例：
```text
[OpenCode Zen 已自动刷新并就绪]
- API Key: oc_sk_cb...yRSa
- 全新 Session: ses_f23f81105fferIvyODUuNI61BM (有效且已持久化)
- 自动对接免费模型: 已同步 10 个 0 额度消耗模型 (包含 Completions 与 Responses 双协议)
- 请求头保护: 25分钟自动轮换 + 7维官方签名 + 6大核心工具全注入
```

---

## 四、内置免费模型库参数

插件自动同步官方免费模型并配置精准上限与思维链等级：

| 模型 ID | 协议 | 供应商 | 上下文窗口 | 最大输出 | 推理思考等级 | 支持模态 |
|:---|:---|:---|:---|:---|:---|:---|
| `step-5-preview-free` | Completions | `opencode-zen-free` | 200,000 | 32,768 | 全档位支持 (OpenAI low/med/high) | 文本、图像 (多模态) |
| `exo-free` | Completions | `opencode-zen-free` | 128,000 | 16,384 | 不支持 (快反系统/无需思考) | 文本 |
| `nemotron-3-ultra-free` | Completions | `opencode-zen-free` | 1,000,000 (1M) | 32,768 | 全档位支持 (OpenAI low/med/high) | 文本 |
| `ling-3.0-flash-fin-free` | Completions | `opencode-zen-free` | 262,144 | 32,768 | 全档位支持 (OpenAI low/med/high) | 文本 |
| `ling-3.1-flash-free` | Completions | `opencode-zen-free` | 262,144 | 32,768 | 全档位支持 (OpenAI low/med/high) | 文本 |
| `mimo-v2.6-flash-free` | Completions | `opencode-zen-free` | 200,000 | 32,000 | 全档位支持 (OpenAI low/med/high) | 文本、图像 (多模态) |
| `nemotron-3.5-lightning-free` | Completions | `opencode-zen-free` | 262,144 | 32,768 | 全档位支持 (OpenAI low/med/high) | 文本 |
| `big-pickle` | Completions | `opencode-zen-free` | 200,000 | 32,000 | 全档位支持 (OpenAI low/med/high) | 文本 |
| `space-bunny-free` | Completions | `opencode-zen-free` | 200,000 | 32,000 | 全档位支持 (OpenAI low/med/high) | 文本、图像 (多模态) |
| `longcat-2.5-preview-free` | Completions | `opencode-zen-free` | 200,000 | 32,000 | 全档位支持 (OpenAI low/med/high) | 文本 |
| `jev-1.13-free` | Completions | `opencode-zen-free` | 128,000 | 16,384 | 不支持 (快反系统/无需思考) | 文本 |
| `muse-spark-1.3-contributor-free` | Responses | `opencode-zen-free-responses` | 1,048,576 (1M) | 32,768 | 全档位支持 (OpenAI low/med/high) | 文本、图像 (多模态) |
| `muse-spark-1.2-contributor-free` | Responses | `opencode-zen-free-responses` | 1,048,576 (1M) | 32,768 | 全档位支持 (OpenAI low/med/high) | 文本、图像 (多模态) |
| `fledge-alpha-free` | Completions | `opencode-zen-free` | 200,000 | 32,000 | 上游已下架 (已自动平滑重定向至 step-5-preview-free) | 文本、图像 (多模态) |

> 若 OpenCode 后端未来发布新免费模型，插件将自动在线探测发现并使用安全的自适应参数接入。

---

## 五、官方算法逆向解析

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

## 六、安装方法

### 方式 1：npm 安装（推荐）

```bash
pi install npm:ck-pi-zen-session
```

### 方式 2：GitHub 源码安装

```bash
pi install git:github.com/1837620622/ck-pi-extension
```

---

## 七、更新日志

- `0.1.24`：
  - **全新对接与上线 OpenCode Zen 最新免费模型矩阵**：
    - 全面收录并高精适配 13 款可用官方免费模型：包含最新旗舰 `step-5-preview-free`（阶跃星辰 Step-5 免费模型，200k 上下文，32k 输出，多模态视觉与全档位思考）、`exo-free`（128k 极速快反）、`nemotron-3-ultra-free`（1M 超长上下文）、`ling-3.0-flash-fin-free`（262k 金融与代码加速）、`jev-1.13-free`（128k 快反）；
    - 针对上游下架的 `fledge-alpha-free`，路由器自动平滑无感重定向至最新旗舰免费模型 `step-5-preview-free`，彻底避免 404 或内容过滤报错。
  - **彻底攻克会话压缩截断与崩塌故障 (`Summarization failed: generation hit the token cap` / `Provider finish_reason: content_filter`)**：
    - 针对 Pi 会话压缩默认传入的 1600 tokens 极小 token 预算，请求拦截层强制将其提升至 16384 tokens，并在压缩总结请求中强制压制深思考（`reasoning_effort: "low"`），从根本上避免深思考模型耗尽 token cap 触发截断；
    - 流式响应重构器（`reconstructedStream`）全面重构为行缓冲分包安全 TransformStream，逐帧捕获并自动规范化 `finish_reason: "length"` 与 `finish_reason: "content_filter"` 为 `"stop"`；
    - 在遇到安全策略阻断且尚未生成有效内容时，自动合成规范的结构化会话进度检查点，确保会话压缩 100% 成功完成并平滑进入后续对话。
- `0.1.23`：
  - **核心修复会话压缩失败与 Token Cap 崩溃问题 (`generation hit the token cap and the summary is incomplete`)**：
    - 调优压缩输出上限至 16,384 tokens，并在压缩总结请求中强制设置 `reasoning_effort: "low"` 并剔除冗余思考，避免深度推理模型（如 `fledge-alpha-free`）耗尽 token 额度；
    - 针对上游返回的 `finish_reason: "length"`，在非空摘要场景下平滑改写为 `finish_reason: "stop"`，彻底根除 Pi 官方压缩模块在命中 token cap 时的崩溃中断。
  - **全链路防御安全审核过滤阻断 (`finish_reason: content_filter`)**：
    - 引入 `sanitizeSensitiveAuditContent` 审计脱敏引擎：针对 `<conversation>` 中的 SQL 注入特征、XSS 脚本块、漏洞利用载荷、密码散列和卡号等敏感特征进行合规占位脱敏，从源头杜绝触发上游内容审查拦截；
    - 在拦截器和流反序列化中捕获 `finish_reason: "content_filter"`：在压缩模式下自动合成规范的结构化会话检查点摘要并置 `finish_reason: "stop"`，在对话模式下保全已生成内容并附带友好安全调整提示。
  - **动态优化免费模型检测算法与最新在线模型矩阵**：
    - 剔除已下架不可用的历史模型（`mimo-v2.5-free`, `ling-3.0-flash-fin-free`, `nemotron-3-ultra-free`）；
    - 正式同步并支持 9 款在线可用免费模型（包含全新 `fledge-alpha-free`, `ling-3.1-flash-free`, `longcat-2.5-preview-free` 等）；
    - 优化短别名映射引擎（`mimo`, `ultra`, `ling`, `fledge` 等自动平滑重定向至最新存活模型）。
- `0.1.22`：
  - **支持 OpenAI Responses API 协议与双供应商路由架构 (彻底修复 Issue #1)**：
    - **双供应商精准分流**：将 OpenCode Zen 拆分为 `opencode-zen-free`（走 `openai-completions`，负责 Big Pickle, Xiaomi MiMo, NVIDIA Nemotron, Ling, Space Bunny）与 `opencode-zen-free-responses`（走 `openai-responses`，负责 Meta Muse Spark 1.3/1.2 Contributor Free）；
    - **彻底解决 400 ModelProtocolUnsupported 报错**：由于 OpenCode Zen 网关仅在 `/responses` 端点提供 Muse Spark 系列模型，通过独立 provider 注册让 Pi 原生通过 Responses API 发送请求；
    - **Responses 协议结构对齐**：为 Responses API 注入扁平化工具定义（`OPENCODE_OFFICIAL_RESPONSES_TOOLS`），在 Compaction 场景下注入 `tool_choice: "none"`，严禁注入 ChatCompletions 专有字段（如 `stream_options`, `reasoning_effort`, `max_tokens`），防止网关参数校验失败；
    - **Fetch 拦截器双端点适配**：拦截器同时支持 `/zen/v1/chat/completions` 与 `/zen/v1/responses`，区分 SSE 解析逻辑，且仅对 ChatCompletions 端点执行 SSE-to-ChatCompletion 反序列化；
    - **持久化与运行态双写**：`syncZenConfiguration` 自动双写双供应商配置至 `~/.pi/agent/models.json` 与 `auth.json`，`/zen model` 与 `/zen ping` 指令自适应路由。
- `0.1.21`：
  - **深度修复上游空响应重试机制 (`Provider returned an empty response`)**：
    - SSE 流式预读探测上限提升至 30 个数据包与 64KB，精准穿透网关 keepalive 帧；
    - 严格限定错误结构匹配，杜绝模型正常回复误判；
    - 真实指数退避带随机抖动，坚守 3 次同模型重试；
    - 运行态模型规范化校验 (`sanitizePiModelDefinition`)，杜绝畸变数据写入。
- `0.1.20`：
  - **供应商节点空响应自动同模型重试与隐身零额度模型识别**：首创无损首包 Stream Peek 预读探测，当上游节点返回伪 200 空流时自动 3 次重试；自动识别 `stealth/space-bunny-alpha` 等隐身零消耗模型。

---

## 八、许可

- 仓库: [https://github.com/1837620622/ck-pi-extension](https://github.com/1837620622/ck-pi-extension)
- 协议: MIT License

---

<a id="ck-pi-zen-session-en"></a>
# ck-pi-zen-session (English)

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.23-blue.svg?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/runtime-Pi%20Agent%20%3E%3D0.85.0-orange.svg?style=flat-square" alt="Pi Runtime" />
  <img src="https://img.shields.io/badge/protocol-Completions%20%26%20Responses-informational.svg?style=flat-square" alt="Protocol" />
  <img src="https://img.shields.io/badge/session%20algorithm-Descending%20Timestamp%20Base62-purple.svg?style=flat-square" alt="Session Algorithm" />
  <img src="https://img.shields.io/badge/zero--cost%20models-9%20Verified-success.svg?style=flat-square" alt="Zero Cost Models" />
</p>

<p align="center">
  <a href="#ck-pi-zen-session">中文说明</a> | <a href="#ck-pi-zen-session-en">English Documentation</a>
</p>

OpenCode Zen free-tier model sync, dual-protocol routing (Completions & Responses), request header disguise, and automatic session self-healing extension designed for Pi coding agent.

---

## Sponsorship & Support

If you find this project helpful, please consider sponsoring. Your support directly funds continuous maintenance, endpoint verification, reverse-engineering protocol alignment, and rapid iteration.

### Sponsorship Channels

- **GitHub Sponsors**: [https://github.com/sponsors/1837620622](https://github.com/sponsors/1837620622)
- **Enterprise Sponsorship**:
  - AI infrastructure providers, proxy gateway services, and engineering teams are welcome to sponsor.
  - Benefits: Prominent brand logo and link display in the README, priority issue response, and custom protocol optimizations.

---

## Table of Contents

- [1. Key Features](#1-key-features)
- [2. Dual-Protocol Architecture & Issue #1 Fix](#2-dual-protocol-architecture--issue-1-fix)
- [3. Command Usage & Panel](#3-command-usage--panel)
- [4. Built-in Free Models](#4-built-in-free-models)
- [5. Reverse-Engineered Session Algorithm](#5-reverse-engineered-session-algorithm)
- [6. Installation](#6-installation)
- [7. Changelog](#7-changelog)
- [8. License](#8-license)

---

## 1. Key Features

- **One-click Activation & Dynamic Discovery**:
  Discover all models marked with free, zero, or pickle with one key command (`/zen oc_sk_...`), tagging zero cost and mounting into Pi runtime and CC-Switch dynamically.

- **Dual-Provider Protocol Routing**:
  Routes Chat models via `opencode-zen-free` (`openai-completions`) and Muse Spark models via `opencode-zen-free-responses` (`openai-responses`), eliminating `400 ModelProtocolUnsupported` errors.

- **Reverse-Engineered Session Algorithm**:
  Generates descending 30-char session IDs and ascending request IDs aligned with official OpenCode client algorithms.

- **Official Disguise Headers**:
  Automatically injects all 7 official client-aligned headers:
  - `User-Agent`: `opencode/1.18.32 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14`
  - `x-opencode-client`: `cli`
  - `x-opencode-session`: `ses_<12-hex-descending-ts><14-base62>`
  - `x-opencode-request`: `msg_<12-hex-ascending-ts><14-base62>`
  - `x-opencode-project`: `prj_<16-hex-hash>`
  - `x-session-affinity`: synchronized with session ID
  - `X-Session-Id`: synchronized with session ID

- **Preemptive Renewal & Auto-Healing**:
  Active 25-minute preemptive rotation with immediate auto-renewal on 401/403 gateway errors, preventing expiration deadlocks.

- **Global Fetch Interceptor & Compaction Defense**:
  Injects required tool signatures during context compaction and handles SSE-to-JSON aggregation seamlessly without gateway rejection.

- **3-Attempt Same-Model Retry**:
  Catches gateway timeouts (500/502/503/504/520-525/533) and empty responses (`Provider returned an empty response`) with 3-attempt exponential backoff same-model retry.

- **Strict Namespace Isolation**:
  Operates strictly inside OpenCode Zen namespaces, preserving zero side effects for third-party providers.

---

## 2. Dual-Protocol Architecture & Issue #1 Fix

### Background (Issue #1)

OpenCode Zen gateway serves models across different protocols:
- **Standard Chat models** (Xiaomi MiMo, NVIDIA Nemotron, Big Pickle, Ling, Space Bunny): Served via `/zen/v1/chat/completions` (OpenAI Chat Completions protocol);
- **Meta Muse Spark models** (`muse-spark-1.3-contributor-free`, `muse-spark-1.2-contributor-free`): Served exclusively via `/zen/v1/responses` (OpenAI Responses API protocol).

Posting Muse Spark models to `/zen/v1/chat/completions` results in HTTP 400:
```json
{"type": "ModelProtocolUnsupported", "message": "Model does not support this protocol."}
```

### Architecture Solution

In `ck-pi-zen-session 0.1.22`, a dual-provider architecture was introduced:

1. **`opencode-zen-free` (api: `openai-completions`)**:
   - Models: `fledge-alpha-free`, `ling-3.1-flash-free`, `mimo-v2.6-flash-free`, `nemotron-3.5-lightning-free`, `big-pickle`, `space-bunny-free`, `longcat-2.5-preview-free`.
   - Endpoint: `/zen/v1/chat/completions`.
   - Tools format: Nested function structure (`{ type: "function", function: { ... } }`).
   - Parameters: `stream_options: { include_usage: true }`, `reasoning_effort`.

2. **`opencode-zen-free-responses` (api: `openai-responses`)**:
   - Models: `muse-spark-1.3-contributor-free`, `muse-spark-1.2-contributor-free`.
   - Endpoint: `/zen/v1/responses`.
   - Tools format: Flat structure (`{ type: "function", name, description, parameters }`).
   - Parameters: Uses `input` and `max_output_tokens`; injects `tool_choice: "none"` on empty-tool requests; strictly excludes Chat-only fields (`stream_options`, `reasoning_effort`, `max_tokens`).

3. **Transparent Persistence & Routing**:
   - Dual-writes both providers into `~/.pi/agent/models.json` and `auth.json`.
   - `/zen refresh` and `/zen ping` route probes dynamically according to protocol.
   - `/zen model muse-spark-1.3-contributor-free` switches active provider to `opencode-zen-free-responses`.

---

## 3. Command Usage & Panel

Control all features in the Pi interactive interface using `/zen` commands:

| Command | Description | Output |
|:---|:---|:---|
| `/zen` | No args: check/renew session ID, refresh headers, sync `models.json` / CC-Switch, and hot reload | Status panel and synced models summary |
| `/zen <key>` or `/zen key <key>` | Update OpenCode Zen API key, verify online, and sync all models | Verification result and model cards |
| `/zen refresh` or `/zen sync` | Force generate new descending session ID and refresh headers | New session ID and ready state |
| `/zen list` or `/zen models` or `/zen free` | View catalog of available free models (context, max tokens, thinking levels, protocol) | Formatted model catalog cards |
| `/zen add <model-id> [name]` | Register custom free model into local catalog and hot reload | Registration status |
| `/zen status` | View API key mask, session age, and header protection status | Operational status dashboard |
| `/zen ping [model-id]` | Probe Zen free model network connectivity and round-trip time (RTT) | Latency and grade report |
| `/zen model <model-id>` | Quickly switch active Zen model (auto-detects provider namespace) | Immediate activation |

Example Panel Output:
```text
[OpenCode Zen 已自动刷新并就绪]
- API Key: oc_sk_cb...yRSa
- 全新 Session: ses_f23f81105fferIvyODUuNI61BM (有效且已持久化)
- 自动对接免费模型: 已同步 10 个 0 额度消耗模型 (包含 Completions 与 Responses 双协议)
- 请求头保护: 25分钟自动轮换 + 7维官方签名 + 6大核心工具全注入
```

---

## 4. Built-in Free Models

The extension syncs official free models with verified context windows and thinking levels:

| Model ID | Protocol | Provider | Context Window | Max Output | Thinking Levels | Modality |
|:---|:---|:---|:---|:---|:---|:---|
| `step-5-preview-free` | Completions | `opencode-zen-free` | 200,000 | 32,768 | Full support (OpenAI low/med/high) | Text, Vision |
| `exo-free` | Completions | `opencode-zen-free` | 128,000 | 16,384 | Unsupported (fast reflex / no thinking) | Text |
| `nemotron-3-ultra-free` | Completions | `opencode-zen-free` | 1,000,000 (1M) | 32,768 | Full support (OpenAI low/med/high) | Text |
| `ling-3.0-flash-fin-free` | Completions | `opencode-zen-free` | 262,144 | 32,768 | Full support (OpenAI low/med/high) | Text |
| `ling-3.1-flash-free` | Completions | `opencode-zen-free` | 262,144 | 32,768 | Full support (OpenAI low/med/high) | Text |
| `mimo-v2.6-flash-free` | Completions | `opencode-zen-free` | 200,000 | 32,000 | Full support (OpenAI low/med/high) | Text, Vision |
| `nemotron-3.5-lightning-free` | Completions | `opencode-zen-free` | 262,144 | 32,768 | Full support (OpenAI low/med/high) | Text |
| `big-pickle` | Completions | `opencode-zen-free` | 200,000 | 32,000 | Full support (OpenAI low/med/high) | Text |
| `space-bunny-free` | Completions | `opencode-zen-free` | 200,000 | 32,000 | Full support (OpenAI low/med/high) | Text, Vision |
| `longcat-2.5-preview-free` | Completions | `opencode-zen-free` | 200,000 | 32,000 | Full support (OpenAI low/med/high) | Text |
| `jev-1.13-free` | Completions | `opencode-zen-free` | 128,000 | 16,384 | Unsupported (fast reflex / no thinking) | Text |
| `muse-spark-1.3-contributor-free` | Responses | `opencode-zen-free-responses` | 1,048,576 (1M) | 32,768 | Full support (OpenAI low/med/high) | Text, Vision |
| `muse-spark-1.2-contributor-free` | Responses | `opencode-zen-free-responses` | 1,048,576 (1M) | 32,768 | Full support (OpenAI low/med/high) | Text, Vision |
| `fledge-alpha-free` | Completions | `opencode-zen-free` | 200,000 | 32,000 | Delisted upstream (aliased to step-5-preview-free) | Text, Vision |

---

## 5. Reverse-Engineered Session Algorithm

OpenCode Zen client implements timestamp-encoded descending and ascending identifiers:

```typescript
// 1. Session ID (prefix ses_, descending order)
export function generateZenSessionId(timestampMs = Date.now()): string {
  const combined = BigInt(timestampMs) * 0x1000n + BigInt(sequenceCounter);
  const inverted = ~combined; // Key bit inversion: newer timestamps produce smaller hex values
  let hex = "";
  for (let i = 0; i < 6; i++) {
    const byte = Number((inverted >> BigInt(40 - 8 * i)) & 0xffn);
    hex += byte.toString(16).padStart(2, "0");
  }
  return `ses_${hex}${randomBase62(14)}`; // 30 chars
}

// 2. Request ID (prefix msg_, ascending order)
export function generateZenRequestId(timestampMs = Date.now()): string {
  const combined = BigInt(timestampMs) * 0x1000n + BigInt(sequenceCounter);
  let hex = "";
  for (let i = 0; i < 6; i++) {
    const byte = Number((combined >> BigInt(40 - 8 * i)) & 0xffn);
    hex += byte.toString(16).padStart(2, "0");
  }
  return `msg_${hex}${randomBase62(14)}`; // 30 chars
}
```

---

## 6. Installation

### Method 1: npm (Recommended)

```bash
pi install npm:ck-pi-zen-session
```

### Method 2: From GitHub

```bash
pi install git:github.com/1837620622/ck-pi-extension
```

---

## 7. Changelog

- `0.1.24`:
  - **Full integration & synchronization with OpenCode Zen latest free models**:
    - Registered 13 active official free models: `step-5-preview-free` (StepFun Step-5, 200k context, 32k output, multimodal vision & full thinking levels), `exo-free` (128k fast reflex), `nemotron-3-ultra-free` (1M long context), `ling-3.0-flash-fin-free` (262k finance/code accelerated), `jev-1.13-free` (128k fast reflex);
    - Delisted model graceful migration: `fledge-alpha-free` smoothly redirected to `step-5-preview-free` without 404s or moderation crashes.
  - **Auto-compaction token cap & truncation crash permanent fix (`Summarization failed: generation hit the token cap` / `Provider finish_reason: content_filter`)**:
    - Compaction max tokens boost: forced minimum 16,384 tokens with `reasoning_effort: "low"` during summarization tasks, eliminating token cap exhaustion;
    - Robust SSE stream transformer: upgraded `reconstructedStream` to a line-buffered TransformStream that intercepts and normalizes both `finish_reason: "length"` and `finish_reason: "content_filter"` to `"stop"`;
    - Synthesized structured progress checkpoints when content filter is encountered with empty text, guaranteeing 100% successful session compaction.
- `0.1.22`:
  - **Support OpenAI Responses API protocol & dual-provider architecture (Resolves Issue #1)**:
    - **Dual-provider routing**: Partitioned OpenCode Zen into `opencode-zen-free` (`openai-completions`) and `opencode-zen-free-responses` (`openai-responses`);
    - **Fix 400 ModelProtocolUnsupported error**: Serves Muse Spark models via native Responses API;
    - **Responses protocol alignment**: Flat tool definitions (`OPENCODE_OFFICIAL_RESPONSES_TOOLS`), `tool_choice: "none"` on compaction, no Chat-only fields;
    - **Dual-endpoint fetch interceptor**: Intercepts both `/zen/v1/chat/completions` and `/zen/v1/responses`;
    - **Configuration persistence**: Dual-writes both providers into `models.json` and `auth.json`.
- `0.1.21`:
  - **Deep fix for upstream empty response retry (`Provider returned an empty response`)**:
    - Peek buffer increased to 30 packets and 64KB, penetrating initial gateway keepalive/processing comments;
    - Strict error boundary matching;
    - Exponential backoff retry with jitter;
    - Model definition sanitization (`sanitizePiModelDefinition`).
- `0.1.20`:
  - 3-attempt same-model retry on empty response or zero-byte stream;
  - Auto-discovery of stealth zero-cost models (`space-bunny-alpha`, etc.).

---

## 8. License

- Repository: [https://github.com/1837620622/ck-pi-extension](https://github.com/1837620622/ck-pi-extension)
- License: MIT License
