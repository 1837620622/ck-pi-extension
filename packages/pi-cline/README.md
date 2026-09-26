# ck-pi-cline

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.1-blue.svg?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/runtime-Pi%20Agent%20%3E%3D0.85.0-orange.svg?style=flat-square" alt="Pi Runtime" />
  <img src="https://img.shields.io/badge/protocol-OpenAI%20Compatible-informational.svg?style=flat-square" alt="Protocol" />
  <img src="https://img.shields.io/badge/client%20fingerprint-Cline%20v4.1.16-purple.svg?style=flat-square" alt="Fingerprint" />
  <img src="https://img.shields.io/badge/zero--cost%20models-21%20Verified-success.svg?style=flat-square" alt="Zero Cost Models" />
</p>

---

## 目录

- [一、项目概述](#一项目概述)
- [二、系统架构与技术原理解析](#二系统架构与技术原理解析)
  - [1. 官方客户端特征标头伪装 (Fingerprint Spoofing)](#1-官方客户端特征标头伪装-fingerprint-spoofing)
  - [2. 响应体解包与协议归一化 (Protocol Normalization)](#2-响应体解包与协议归一化-protocol-normalization)
  - [3. 空输出死锁防御机制 (Empty Output Guard Invariant)](#3-空输出死锁防御机制-empty-output-guard-invariant)
  - [4. 隐身模型识别与零额度白嫖判定机理 (Stealth Models & Zero-Cost Guard)](#4-隐身模型识别与零额度白嫖判定机理-stealth-models--zero-cost-guard)
  - [5. 深度思考推理链映射 (Reasoning Tokens Alignment)](#5-深度思考推理链映射-reasoning-tokens-alignment)
  - [6. 透明故障转移重试机制 (Auto-Failover Circuit Breaker)](#6-透明故障转移重试机制-auto-failover-circuit-breaker)
  - [7. 全链路上下文超限修剪 (Context Pruning Engine)](#7-全链路上下文超限修剪-context-pruning-engine)
- [三、实测 21 款零额度模型全量矩阵](#三实测-21-款零额度模型全量矩阵)
  - [1. 隐身与智能路由零消耗模型 (Stealth & Smart Routers)](#1-隐身与智能路由零消耗模型-stealth--smart-routers)
  - [2. 百万级超长上下文免费模型 (1M+ Giant Context)](#2-百万级超长上下文免费模型-1m-giant-context)
  - [3. 主力代码与深度思考免费模型 (Core Coding & Reasoning)](#3-主力代码与深度思考免费模型-core-coding--reasoning)
  - [4. 轻量极速与专用工具模型 (Lightweight & Specialized Tools)](#4-轻量极速与专用工具模型-lightweight--specialized-tools)
  - [5. 计费陷阱警示模型 (Paid Traps - 严禁误用)](#5-计费陷阱警示模型-paid-traps---严禁误用)
- [四、命令使用与交互面板](#四命令使用与交互面板)
- [五、本地反向代理配置与第三方集成](#五本地反向代理配置与第三方集成)
  - [1. 独立 CLI 启动代理](#1-独立-cli-启动代理)
  - [2. CC-Switch 客户端接入](#2-cc-switch-客户端接入)
  - [3. Cursor / VS Code 接入](#3-cursor--vs-code-接入)
  - [4. OpenAI SDK (Python / Node.js) 接入](#4-openai-sdk-python--nodejs-接入)
- [六、版本变更记录 (Changelog)](#六版本变更记录-changelog)

---

## 一、项目概述

`ck-pi-cline` 是专为 **Pi Coding Agent** 打造的高可用 Cline 官方 API 逆向代理、客户端指纹伪装、全量零额度模型智能路由与本地 OpenAI 兼容反向代理插件。

在实际使用官方 Cline 接口时，开发者普遍面临以下技术痛点：
1. **防盗刷指纹拦截**：非官方客户端直接请求 `https://api.cline.bot/api/v1` 会遭遇 403 阻断或限制；
2. **响应格式不兼容**：Cline 官方接口在非流式模式下将结果包裹于 `{ success: true, data: { choices: [...] } }`，直接破坏了原生 OpenAI SDK 与各类 IDE 适配器的预期；
3. **节点异常引发客户端崩溃**：上游推理集群满载或故障时，在 `text/event-stream` 中返回 `choices: []` 且下发内部错误帧，触发 Pi 等智能体运行时致命错误 `model output must contain either output text or tool calls, these cannot both be empty`；
4. **同名模型扣费陷阱**：例如 `inclusionai/ling-3.0-flash-fin` 是按 Token 计费的付费模型，而只有附带 `:free` 标识的 `inclusionai/ling-3.0-flash-fin:free` 才是 100% 零额度消耗；
5. **隐身免扣费模型未被发掘**：官方存在部分实测 `cost: 0` 的隐身与路由模型（如 `stealth/space-bunny-alpha` 100 万超长窗口、`openrouter/fusion` 等），未带 `:free` 后缀但完全不消耗余额。

`ck-pi-cline` 从协议层、拦截层与代理层彻底解决了上述所有问题，实现即插即用、完全零额度消耗与高可靠容灾保障。

---

## 二、系统架构与技术原理解析

```
+-----------------------------------------------------------------------------------+
|                            Client Integration Layer                               |
|   Pi Terminal Agent  |  CC-Switch  |  Cursor IDE  |  Cherry Studio  |  OpenAI SDK |
+-----------------------------------------------------------------------------------+
                                         | (HTTP / SSE Requests)
                                         v
+-----------------------------------------------------------------------------------+
|                 ck-pi-cline Local Proxy & Hook Layer (Port: 4116)                 |
|                                                                                   |
|  [1. Fingerprint Injector]                                                        |
|      - x-client-version: 4.1.16 | User-Agent: Cline/4.1.16 | vscode headers       |
|                                                                                   |
|  [2. Model Alias & Zero-Cost Guard]                                               |
|      - Short Aliases (bunny, ling, 550b, code, fusion)                            |
|      - Auto append :free protection to shield credits                             |
|      - Whitelist 21 verified zero-cost stealth & free models                      |
|                                                                                   |
|  [3. Context Pruning Engine]                                                      |
|      - Truncate giant tool logs (> 25,000 chars)                                  |
|      - Safe compaction on <conversation> & <previous-summary> tags                |
|                                                                                   |
|  [4. SSE Stream Transformer & Empty Output Guard]                                 |
|      - Intercept choices: [] & error frames                                       |
|      - Normalize delta.reasoning -> delta.reasoning_content                       |
|      - Invariant Guard: Force synthetic chunk on stream close if empty            |
|                                                                                   |
|  [5. Auto-Failover Circuit Breaker]                                               |
|      - Transparent retry on 500/502/503/504/429 to high-availability backups     |
+-----------------------------------------------------------------------------------+
                                         | (Disguised HTTPS Upstream)
                                         v
+-----------------------------------------------------------------------------------+
|                        Cline Cloud Gateway (api.cline.bot)                        |
|                                         |
|       +---------------------------------+---------------------------------+
|       v                                 v                                 v
| [OpenRouter Infrastructure]   [Novita AI GPU Cluster]   [NVIDIA NIM Distributed]  |
+-----------------------------------------------------------------------------------+
```

### 1. 官方客户端特征标头伪装 (Fingerprint Spoofing)
Cline 网关部署了反作弊指纹校验。插件在所有出站请求中精准伪造官方 VS Code 扩展的完整指纹特征：
```http
User-Agent: Cline/4.1.16
x-client-version: 4.1.16
x-core-version: 4.1.16
x-platform-version: 1.106.0
x-client-type: cline-vscode
http-referer: https://cline.bot
x-platform: vscode
x-title: Cline
```
无论是 Pi 内置全局 Fetch 拦截器，还是独立运行的本地反代服务，均确保出站请求与官方客户端完全一致。

### 2. 响应体解包与协议归一化 (Protocol Normalization)
Cline 官方非流式端点会将 OpenAI 规范的 Completion 对象嵌套在 `data` 属性内：
```json
{
  "success": true,
  "data": {
    "id": "gen-1790396311-mKqJdWPRCifjwqmzFQBu",
    "choices": [{ "message": { "role": "assistant", "content": "..." } }],
    "usage": { "cost": 0, "total_tokens": 183 }
  }
}
```
标准客户端（如 CC-Switch、Cursor、Pi 内部适配器）在解析根节点时找不到 `choices` 会直接抛出解析异常。插件在反向代理与 Fetch 拦截层自动执行透明解包：
* 提取 `rawJson.data` 提升至根节点；
* 完整保留 `id`, `model`, `choices`, `usage` 等标准字段；
* 对外暴露符合标准 RFC 的 OpenAI ChatCompletion 数据格式。

### 3. 空输出死锁防御机制 (Empty Output Guard Invariant)
* **故障复现**：在上游 GPU 节点饱和时，网关返回 HTTP 200 流，但首帧即包含 `choices: []` 与错误信息。流在未下发任何文本的情况下正常关闭（`data: [DONE]`）。Pi 运行时断言失败并崩溃：
  ```text
  Error: model output error: model output must contain either output text or tool calls, these cannot both be empty, please try again
  ```
* **解决机制**：
  1. 通过流式管道 (`TransformStream`) 逐行分析 SSE 帧；
  2. 若遇到异常错误帧或 `choices: []`，将其透明转化为标准 Assistant 文本块并下发；
  3. 维护流状态变量 `hasSentAnyContent`；
  4. 当流触发 `flush()` 关闭时，若检测到既未发出 `content` 也未发出 `tool_calls`，强制注入一条保底响应帧，确保调用链不崩溃并友好提示用户重试。

### 4. 隐身模型识别与零额度白嫖判定机理 (Stealth Models & Zero-Cost Guard)
通过对 Cline 网关 458 款模型进行实测探测，我们发现了两类零额度模型：
1. **隐身零消耗模型 (Stealth Models)**：模型 ID 中不带 `:free` 标识，但网关返回的 `usage.cost` 严格为 `0`。例如 `stealth/space-bunny-alpha`（100 万超长窗口）、`openrouter/fusion`、`openrouter/pareto-code`（200 万上下文代码专用）；
2. **官方 `:free` 免费模型**：带有 `:free` 后缀。如果调用者遗漏 `:free`（如调用 `inclusionai/ling-3.0-flash-fin`），上游将走商业计费通道扣除账户余额。

**防御算法**：
```typescript
// 路由自动防护：若存在免费版本，自动追加 :free 后缀防误扣
const withFree = `${id}:free`;
if (KNOWN_CLINE_FREE_MODELS[withFree]) {
    return withFree;
}
```

### 5. 深度思考推理链映射 (Reasoning Tokens Alignment)
Novita 及部分上游集群将深度思考推理链输出到 `delta.reasoning` 或 `message.reasoning`，导致标准 DeepSeek 渲染器（期待 `reasoning_content`）无法显示思考折叠块。
插件流式与非流式中间件自动完成双向字段归一化：
```typescript
if (choice?.delta?.reasoning && !choice.delta.reasoning_content) {
    choice.delta.reasoning_content = choice.delta.reasoning;
}
```

### 6. 透明故障转移重试机制 (Auto-Failover Circuit Breaker)
当免费模型遭遇上游节点 500、502、503、504 或 429 限流时，插件拦截器自动启动透明故障转移：
* 自动判定请求类型；
* 立即使用高可用兜底模型（`inclusionai/ling-3.0-flash-fin:free` 或 `openrouter/free`）重新发起请求；
* 对上层业务透明，保障长程代理自动化任务平稳执行。

### 7. 全链路上下文超限修剪 (Context Pruning Engine)
在会话压缩 (Compaction) 或包含海量 Tool 执行日志的场景下：
* 拦截并截断单个超过 25,000 字符的巨型终端输出；
* 深度修剪 `<conversation>` 与 `<previous-summary>` 标签中超过 80,000 字符的冗余中间内容；
* 彻底解决切换模型时触发的 `400 Context Length Exceeded` 异常。

---

## 三、实测 21 款零额度模型全量矩阵

所有收录模型均经过真实请求验证，确认 `usage.cost === 0.000000`：

### 1. 隐身与智能路由零消耗模型 (Stealth & Smart Routers)

| 模型 ID | 简写别名 | 上下文窗口 | 最大输出 | 思考推理 | 特性与适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `stealth/space-bunny-alpha` | `bunny`, `stealth` | 1,000,000 (1M) | 32,768 | 支持 | 隐身测试旗舰，1M 极限窗口，完全零额度消耗 |
| `openrouter/fusion` | `fusion` | 1,000,000 (1M) | 32,768 | 支持 | 智能元路由模型，根据任务动态分流最优节点 |
| `openrouter/pareto-code` | `code`, `pareto` | 2,000,000 (2M) | 32,768 | 支持 | 代码专精超长模型，针对工程重构与智能体优化 |
| `openrouter/free` | `free`, `auto` | 200,000 | 32,768 | 支持 | OpenRouter 官方高可用免费聚合节点，兜底首选 |

### 2. 百万级超长上下文免费模型 (1M+ Giant Context)

| 模型 ID | 简写别名 | 上下文窗口 | 最大输出 | 思考推理 | 特性与适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | `550b`, `ultra` | 1,000,000 (1M) | 32,768 | 支持 | 550B 参数巨无霸模型，超强通用推理与知识检索 |
| `nvidia/nemotron-3.5-lightning:free` | `lightning` | 1,000,000 (1M) | 32,768 | 支持 | 1M 上下文轻量化极速变体 |
| `thinkingmachines/inkling:free` | `inkling` | 1,048,576 (1M) | 32,768 | 支持 | 1M 上下文长文本分析模型 |
| `thinkingmachines/inkling-small:free` | - | 1,048,576 (1M) | 32,768 | 支持 | 1M 轻量长文本模型 |

### 3. 主力代码与深度思考免费模型 (Core Coding & Reasoning)

| 模型 ID | 简写别名 | 上下文窗口 | 最大输出 | 思考推理 | 特性与适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `inclusionai/ling-3.0-flash-fin:free` | `ling`, `flash` | 262,144 | 32,768 | 支持 | 极速响应，稳定性最高的主力高可用模型 |
| `inclusionai/ling-3.0-flash-sante:free` | `sante` | 262,144 | 32,768 | 支持 | 综合能力平衡变体 |
| `qwen/qwen3.8-27b:free` | `qwen` | 262,144 | 32,768 | 支持 | 通义千问 27B 免费开源版本，逻辑严谨 |
| `nvidia/nemotron-3-super-120b-a12b:free` | `120b` | 262,144 | 32,768 | 支持 | 120B 参数级深度思考模型 |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | `nano`, `reasoning` | 131,072 | 32,768 | 支持 (带视觉) | 多模态图像识别 + 深度思考链路 |
| `cohere/north-mini-code:free` | `north` | 131,072 | 32,768 | 支持 | 代码补全、单元测试与代码审查专用 |
| `poolside/laguna-s-2.1:free` | `laguna` | 131,072 | 32,768 | 支持 | 算法与逻辑推导优化模型 |
| `poolside/laguna-xs-2.1:free` | - | 131,072 | 32,768 | 支持 | 轻量级逻辑变体 |

### 4. 轻量极速与专用工具模型 (Lightweight & Specialized Tools)

| 模型 ID | 简写别名 | 上下文窗口 | 最大输出 | 思考推理 | 特性与适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `google/gemma-4-26b-a4b-it:free` | `gemma` | 262,144 | 32,768 | 支持 | 谷歌 Gemma 开源免费微调版 |
| `google/gemma-4-31b-it:free` | - | 262,144 | 32,768 | 支持 | 谷歌 Gemma 31B 结构化推理版 |
| `dots-studio/dots-3-note-preview:free` | `note` | 131,072 | 32,768 | 支持 | 笔记、提纲与纪要总结优化 |
| `liquid/lfm-2.5-2.6b:free` | `lfm` | 32,768 | 8,192 | 快速 | Liquid 神经架构轻量模型 |
| `nvidia/nemotron-3.5-content-safety:free` | - | 131,072 | 16,384 | 快速 | 内容安全审计过滤专用 |

### 5. 计费陷阱警示模型 (Paid Traps - 严禁误用)

以下模型在部分非官方列表中常被误标为免费，经真实请求探测，均会**扣除真实账户余额**，插件已将其列入黑名单过滤：
* `typesafe/jev-router`: 实测单次请求产生 `cost: $0.0000152`
* `openrouter/auto`: 实测单次请求产生 `cost: $0.0000594`
* `openrouter/auto-beta`: 实测单次请求产生 `cost: $0.0000099`
* `openrouter/bodybuilder`: 实测单次请求产生 `cost: $0.0004500`
* `unbiased/pareto`: 实测单次请求产生 `cost: $0.0002482`
* `fireworks/ember-1`: 实测单次请求产生 `cost: $0.0024870`
* `google/lyria-3-pro-preview`: 实测单次请求产生 `cost: $0.0800000`

---

## 四、命令使用与交互面板

在 Pi 终端交互界面中，可通过 `/cline` 体系指令进行全方位控制（命令语法与 `/zen` 插件完全对称一致）：

| 命令 | 说明 | 交互效果 |
|:---|:---|:---|
| `/cline` | **无参直接运行**：全自动在线探测拉取后端最新模型，刷新上下文与思考等级，同步 `models.json` / `auth.json` / CC-Switch 并热载入 Pi | 输出控制面板与已同步模型摘要 |
| `/cline <key>` 或 `/cline key <key>` | **更新 API Key**：保存新 Key，自动在线探测拉取最新免费模型并热重载 | 输出新 Key 验证结果与模型卡片 |
| `/cline refresh` 或 `/cline sync` | **强制在线刷新**：重新在线拉取远端模型目录并全量同步本地配置与运行时 | 输出同步状态报告 |
| `/cline list` 或 `/cline models` | **查看模型列表**：展示全部 21 款零额度模型详细树形卡片（上下文、最大输出、思考等级、模态） | 输出分级卡片列表 |
| `/cline free` | **查看零额度注册表**：分类呈现隐身零消耗模型与官方标准免费模型 | 输出分类结构表格 |
| `/cline status` | **查看运行状态**：脱敏 Key、端点、可用模型总数、思考模型数、多模态数及本地反代状态 | 输出运行状态仪表盘 |
| `/cline ping [模型ID]` | **网络时延探针**：实时探测免费模型连通性与往返延迟 (RTT) | 输出各模型网络时延与评级 |
| `/cline model <模型ID>` | **快速切换模型**：一键切换当前 Pi 会话所使用的模型 | 即刻切换生效 |
| `/cline proxy start [端口]` | **启动本地反向代理**：在指定端口（默认 4116）启动 OpenAI 兼容本地代理 | 输出端点信息 |
| `/cline proxy stop` | **停止本地反向代理**：停止正在运行的代理进程 | 释放端口 |

```text
[Cline 免费模型与本地反代控制面板]
• API Key: sk_0ea24...25dd (已验证并持久化)
• 基础端点: https://api.cline.bot/api/v1
• 自动对接免费模型: 已同步 21 款 0 额度消耗模型 (19 款支持深度思考，1 款支持多模态视觉)
• 官方客户端伪装: 8 维官方指纹签名已注入 (VSCode 4.1.16 / cline-vscode)
• 本地配置同步: models.json [OK] | auth.json [OK] | CC-Switch DB [OK]
• 本地反向代理: 未运行
```

### 1. 快速命令行调用
在终端中使用短别名直接运行任务：
```bash
# 启动 100 万超长隐身模型
pi --model cline/bunny -p "深度分析大型工程架构"

# 启动 200 万上下文代码专用模型
pi --model cline/code -p "审查当前 Git 仓库所有改动"

# 启动 550B 参数级巨型模型
pi --model cline/550b -p "解答高难度数理逻辑问题"

# 启动极速主力免费模型
pi --model cline/ling -p "编写一个 Rust 异步并发队列"
```

### 2. 实时网络连通性与时延探针 (`/cline ping`)
```bash
/cline ping
```
输出样例：
```text
=== Cline 免费模型连通性与时延实时探测 ===
  • stealth/space-bunny-alpha: [200 OK] (531ms, 极速)
  • inclusionai/ling-3.0-flash-fin:free: [200 OK] (489ms, 极速)
  • openrouter/fusion: [200 OK] (612ms, 极速)
  • openrouter/pareto-code: [200 OK] (720ms, 极速)
  • openrouter/free: [200 OK] (544ms, 极速)
  • nvidia/nemotron-3-ultra-550b-a55b:free: [200 OK] (1120ms, 良好)
```

---

## 五、本地反向代理配置与第三方集成

插件内置工业级 Node.js 反向代理服务，将 Cline 官方私有接口转换为完全符合标准 OpenAI 规范的本地服务。

### 1. 独立 CLI 启动代理
可在终端直接执行打包后的可执行文件：
```bash
# 默认在 4116 端口启动
node ./bin/cline-proxy.js 4116

# 或通过自定义参数启动
node ./bin/cline-proxy.js --port 4116 --key sk_0ea2446a...
```
控制台将输出服务就绪信息：
```text
=== Cline OpenAI-Compatible 本地反向代理服务 ===
• 指纹伪装: 8大官方客户端特征标头已启用
• 免费模型: 已收录 21 款零额度模型

[OK] 代理服务已就绪！
• OpenAI Base URL: http://127.0.0.1:4116/v1
• 对话补全端点:   http://127.0.0.1:4116/v1/chat/completions
• 模型列表端点:   http://127.0.0.1:4116/v1/models
• 免费模型端点:   http://127.0.0.1:4116/v1/models/free
• 健康检查端点:   http://127.0.0.1:4116/health
```

### 2. CC-Switch 客户端接入
在 CC-Switch 中添加自定义 OpenAI 供应商：
* **Provider Name**: `Cline-Free`
* **Base URL**: `http://127.0.0.1:4116/v1`
* **API Key**: 填入任意字符串（如 `cline-proxy`）
* **Models**: 可通过 `/v1/models` 端点一键自动发现。

### 3. Cursor / VS Code 接入
在 Cursor 设置的 `OpenAI API Key` 中：
* **Override OpenAI Base URL**: `http://127.0.0.1:4116/v1`
* **API Key**: 任意填写
* **Model Name**: 手动输入 `stealth/space-bunny-alpha` 或 `openrouter/pareto-code`。

### 4. OpenAI SDK (Python / Node.js) 接入

**Python**:
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:4116/v1",
    api_key="cline-local-token"
)

response = client.chat.completions.create(
    model="stealth/space-bunny-alpha",
    messages=[{"role": "user", "content": "写一段关于分布式锁的最佳实践"}],
    stream=True
)

for chunk in response:
    content = chunk.choices[0].delta.content
    if content:
        print(content, end="", flush=True)
```

**Node.js**:
```javascript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://127.0.0.1:4116/v1",
  apiKey: "cline-local-token",
});

const completion = await openai.chat.completions.create({
  model: "openrouter/pareto-code",
  messages: [{ role: "user", content: "Implement a Red-Black Tree in TypeScript" }],
});

console.log(completion.choices[0].message.content);
```

---

## 六、版本变更记录 (Changelog)

### v0.1.1 (2026-09-26)
* **指令体系全面对称**：`/cline` 与 `/zen` 深度对齐，支持无参直接拉取远端模型、直接传入 Key 自动验证并热载入模型库、`refresh`/`sync`、`list`/`models`/`free`、`ping` 实时探针与 `model` 快捷切换；
* **思考链 (CoT) 双向保全**：SSE 流式传输中同时双向写入 `delta.reasoning` 与 `delta.reasoning_content`，杜绝思考内容在部分客户端被遗漏；
* **零表情纯净终端**：彻底清除终端输出与文档中的所有 Emoji，全面采用结构化标签与统一格式。

### v0.1.0 (2026-09-26)
* **协议逆向与指纹注入**：完整实现官方 VS Code 扩展 4.1.16 的 8 大请求标头伪装；
* **双模式架构**：
  * 进程内无缝全局 Fetch 拦截器（Pi 终端内直接免代理启动）；
  * 独立本地反向代理服务器（端口 4116），提供对外标准 OpenAI 兼容端点；
* **零额度隐身模型支持**：
  * 首发支持 `stealth/space-bunny-alpha`（1M 上下文）隐身零消耗模型；
  * 首发支持 `openrouter/fusion` 与 `openrouter/pareto-code`（2M 上下文）路由免费模型；
  * 全量收录并验证 21 款零额度模型（实测 `cost: 0`）；
  * 严格隔离并过滤扣费陷阱模型（`typesafe/jev-router`, `openrouter/auto`, `unbiased/pareto` 等）；
* **死锁防护与空输出阻断 (Empty Output Guard)**：
  * SSE 流式转换管道自动拦截 `choices: []` 与网关异常帧；
  * 流关闭时断言保护，杜绝两字段皆空的运行时崩溃；
* **思考链归一化**：自动将 `delta.reasoning` / `message.reasoning` 映射为标准 `reasoning_content`；
* **透明容灾重试 (Auto-Failover)**：遭遇 500/502/503/504/429 报错时，自动无缝重试高可用备用免费模型；
* **会话修剪与上下文保护**：拦截海量 Tool 日志与会话压缩标签，防止上下文溢出；
* **视觉美化**：去除所有 Emoji，全面采用纯净结构化 ANSI 与专业标签设计。
