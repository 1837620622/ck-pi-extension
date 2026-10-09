# ck-pi-cline

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.9-blue.svg?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/runtime-Pi%20Agent%20%3E%3D0.85.0-orange.svg?style=flat-square" alt="Pi Runtime" />
  <img src="https://img.shields.io/badge/protocol-OpenAI%20Compatible-informational.svg?style=flat-square" alt="Protocol" />
  <img src="https://img.shields.io/badge/client%20fingerprint-Cline%20v4.1.16-purple.svg?style=flat-square" alt="Fingerprint" />
  <img src="https://img.shields.io/badge/zero--cost%20models-17%20Verified-success.svg?style=flat-square" alt="Zero Cost Models" />
</p>

<p align="center">
  <a href="#ck-pi-cline">中文说明</a> | <a href="#ck-pi-cline-en">English Documentation</a>
</p>

---

## 赞助与支持

如果您觉得本项目提升了您的开发效率，欢迎赞助支持！您的赞助将直接用于持续维护、网络节点验证、逆向协议对齐与新特性的快速迭代。

### 赞助渠道

- **GitHub Sponsors**: [https://github.com/sponsors/1837620622](https://github.com/sponsors/1837620622)
- **企业赞助与商务合作**:
  - 欢迎 AI 基础设施提供商、代理网关服务商或团队提供赞助。
  - 赞助权益包含：在项目 README 显著位置展示企业 Logo 与链接、优先处理定制化需求与专属技术支持。

---

## 目录

- [一、项目概述](#一项目概述)
- [二、系统架构与技术原理解析](#二系统架构与技术原理解析)
  - [1. 官方客户端特征标头伪装 (Fingerprint Spoofing)](#1-官方客户端特征标头伪装-fingerprint-spoofing)
  - [2. 响应体解包与协议归一化 (Protocol Normalization)](#2-响应体解包与协议归一化-protocol-normalization)
  - [3. 空输出死锁防御机制 (Empty Output Guard Invariant)](#3-空输出死锁防御机制-empty-output-guard-invariant)
  - [4. 隐身模型识别与零额度白嫖判定机理 (Stealth Models & Zero-Cost Guard)](#4-隐身模型识别与零额度白嫖判定机理-stealth-models--zero-cost-guard)
  - [5. 深度思考推理链映射 (Reasoning Tokens Alignment)](#5-深度思考推理链映射-reasoning-tokens-alignment)
  - [6. 同模型指数退避重试机制 (Same-Model Exponential Backoff Retry)](#6-同模型指数退避重试机制-same-model-exponential-backoff-retry)
  - [7. 全链路上下文超限修剪 (Context Pruning Engine)](#7-全链路上下文超限修剪-context-pruning-engine)
  - [8. 安全审核过滤阻断防御与 Token Cap 修复 (content_filter & Token Cap Defense)](#8-安全审核过滤阻断防御与-token-cap-修复-content_filter--token-cap-defense)
- [三、实测 17 款零额度模型全量矩阵](#三实测-17-款零额度模型全量矩阵)
  - [1. 隐身与智能路由零消耗模型 (Stealth & Smart Routers)](#1-隐身与智能路由零消耗模型-stealth--smart-routers)
  - [2. 百万级超长上下文免费模型 (1M+ Giant Context)](#2-百万级超长上下文免费模型-1m-giant-context)
  - [3. 主力代码与深度思考免费模型 (Core Coding & Reasoning)](#3-主力代码与深度思考免费模型-core-coding--reasoning)
  - [4. 轻量极速与专用工具模型 (Lightweight & Specialized Tools)](#4-轻量极速与专用工具模型-lightweight--specialized-tools)
  - [5. 计费陷阱与已下架模型警示 (Paid Traps & Delisted Models)](#5-计费陷阱与已下架模型警示-paid-traps--delisted-models)
- [四、命令使用与交互面板](#四命令使用与交互面板)
- [五、本地反向代理配置与第三方集成](#五本地反向代理配置与第三方集成)
  - [1. 独立 CLI 启动代理](#1-独立-cli-启动代理)
  - [2. CC-Switch 客户端接入](#2-cc-switch-客户端接入)
  - [3. Cursor / VS Code 接入](#3-cursor--vs-code-接入)
  - [4. OpenAI SDK (Python / Node.js) 接入](#4-openai-sdk-python--nodejs-接入)
- [六、版本变更记录 (Changelog)](#六版本变更记录-changelog)
- [七、许可](#七许可)

---

## 一、项目概述

`ck-pi-cline` 是专为 **Pi Coding Agent** 打造的高可用 Cline 官方 API 逆向代理、客户端指纹伪装、全量零额度模型智能路由与本地 OpenAI 兼容反向代理插件。

> **架构与运行原则**：
> * **默认原生极简直连与模型注入**：启动运行时默认**不开启本地反代端口**，直接在 Pi 运行时中以 `Cline (Free)` 供应商注入 17 款零额度免费模型，通过全局 Fetch 拦截器直连官方网关（零本地代理开销，架构与 `ck-pi-zen-session` 完全对齐）；
> * **按需启动本地反向代理**：仅在显式执行 `/cline proxy start` 命令或需要供第三方工具（如 CC-Switch、Cursor）使用时才启动本地 4116 端口，可通过 `/cline proxy stop` 随时停止并恢复直连；
> * **同模型指数退避重试**：遭遇 500/502/503/504/429 报错时，坚守模型质量底线，自动进行同模型指数退避重试，绝不擅自降级或切换低配备用模型。

在实际使用官方 Cline 接口时，开发者普遍面临以下技术痛点：
1. **防盗刷指纹拦截**：非官方客户端直接请求 `https://api.cline.bot/api/v1` 会遭遇 403 阻断或限制；
2. **响应格式不兼容**：Cline 官方接口在非流式模式下将结果包裹于 `{ success: true, data: { choices: [...] } }`，直接破坏了原生 OpenAI SDK 与各类 IDE 适配器的预期；
3. **节点异常引发客户端崩溃**：上游推理集群满载或故障时，在 `text/event-stream` 中返回 `choices: []` 且下发内部错误帧，触发 Pi 等智能体运行时致命错误 `model output must contain either output text or tool calls, these cannot both be empty`；
4. **同名模型扣费陷阱**：例如历史模型若遗漏 `:free` 标识，上游将走商业计费通道扣除账户余额；
5. **模型下架与变动频繁**：部分旧模型（如 `deepseek-v4.1-flash`, `space-bunny-alpha`, `ling-3.0-flash-fin` 等）已被官方下架或转为付费。

`ck-pi-cline` 从协议层、拦截层与代理层彻底解决了上述所有问题，实现即插即用、完全零额度消耗与高可靠容灾保障。

---

## 二、系统架构与技术原理解析

```text
+-----------------------------------------------------------------------------------+
|                            Client Integration Layer                               |
|   Pi Terminal Agent  |  CC-Switch  |  Cursor IDE  |  Cherry Studio  |  OpenAI SDK |
+-----------------------------------------------------------------------------------+
                                         | (HTTP / SSE Requests)
                                         v
+-----------------------------------------------------------------------------------+
|                 ck-pi-cline Hook & Local Proxy Layer                              |
|                                                                                   |
|  [1. Fingerprint Injector]                                                        |
|      - x-client-version: 4.1.16 | User-Agent: Cline/4.1.16 | vscode headers       |
|                                                                                   |
|  [2. Model Alias & Zero-Cost Guard]                                               |
|      - Short Aliases (free, ling, 550b, lightning, laguna, etc.)                  |
|      - Auto append :free protection to shield credits                             |
|      - Whitelist 17 verified zero-cost active models                              |
|                                                                                   |
|  [3. Context Pruning & Audit Sanitization]                                        |
|      - Truncate giant tool logs (> 25,000 chars)                                  |
|      - Sanitize SQLi/XSS/exploit payloads in <conversation> against content_filter|
|                                                                                   |
|  [4. SSE Stream Transformer & Empty Output Guard]                                 |
|      - Intercept choices: [] & error frames                                       |
|      - Normalize delta.reasoning -> delta.reasoning_content                       |
|      - Force synthetic chunk on stream close if empty                             |
|                                                                                   |
|  [5. Same-Model Exponential Backoff Retry]                                        |
|      - Transparent retry on 500/502/503/504/429 preserving target model & context|
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

### 2. 响应体解包与协议归一化 (Protocol Normalization)
Cline 官方非流式端点会将 OpenAI 规范的 Completion 对象嵌套在 `data` 属性内。标准客户端找不到根节点的 `choices` 会抛出异常。插件在反向代理与 Fetch 拦截层自动执行透明解包：
* 提取 `rawJson.data` 提升至根节点；
* 完整保留 `id`, `model`, `choices`, `usage` 等标准字段；
* 对外暴露符合标准 RFC 的 OpenAI ChatCompletion 数据格式。

### 3. 空输出死锁防御机制 (Empty Output Guard Invariant)
在上游节点高载荷时，网关偶发返回空流，触发 Pi 的致命断言失败。插件通过管道分析 SSE 帧：若遭遇异常错误帧或流结束时无文本也无工具调用，自动注入保底响应帧，确保调用链不崩溃并友好提示用户重试。

### 4. 隐身模型识别与零额度白嫖判定机理 (Stealth Models & Zero-Cost Guard)
自动识别官方零扣费模型（如 `openrouter/free`），对同名模型自动追加 `:free` 防护后缀，拦截历史下架付费陷阱。

### 5. 深度思考推理链映射 (Reasoning Tokens Alignment)
自动双向归一化 `delta.reasoning` 与 `delta.reasoning_content`，保障思考折叠块在各类前端与终端正常渲染。

### 6. 同模型指数退避重试机制 (Same-Model Exponential Backoff Retry)
遭遇 500、502、503、504、524 或 429 限流时，坚守模型质量底线，自动进行最多 3 轮指数退避重试，绝不擅自降级或切换低配备用模型。

### 7. 全链路上下文超限修剪 (Context Pruning Engine)
拦截单个超过 25,000 字符的巨型终端输出，修剪 `<conversation>` 与 `<previous-summary>` 中的冗余中间历史，避免触发 `400 Context Length Exceeded`。

### 8. 安全审核过滤阻断防御与 Token Cap 修复 (content_filter & Token Cap Defense)
* **审计日志脱敏**：引入 `sanitizeSensitiveAuditContent`，对压缩历史中的 SQL 注入、XSS 脚本块、漏洞载荷进行占位脱敏，从源头消除上游内容审查拦截；
* **finish_reason content_filter 平滑恢复**：捕获内容审核过滤帧，在压缩模式下合成安全检查点摘要，在对话模式下保全已生成文本并附带合规指引；
* **Token Cap 自动续接**：将压缩请求上限提升至 16,384 tokens 并压制 CoT 思考耗时；当命中 `finish_reason: "length"` 时自动改写为 `"stop"`，彻底解决 `Summarization failed: generation hit the token cap` 异常。

---

## 三、实测 17 款零额度模型全量矩阵

所有收录模型均经过真实在线请求验证，确认额度消耗为 0：

### 1. 隐身与智能路由零消耗模型 (Stealth & Smart Routers)

| 模型 ID | 简写别名 | 上下文窗口 | 最大输出 | 思考推理 | 特性与适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `openrouter/free` | `free`, `auto` | 200,000 | 32,768 | 支持 | OpenRouter 官方高可用免费聚合节点，首选兜底 |

### 2. 百万级超长上下文免费模型 (1M+ Giant Context)

| 模型 ID | 简写别名 | 上下文窗口 | 最大输出 | 思考推理 | 特性与适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | `550b`, `ultra` | 1,000,000 (1M) | 32,768 | 支持 | 550B 参数超大规模模型，通用推理与知识检索 |
| `nvidia/nemotron-3.5-lightning:free` | `lightning` | 1,000,000 (1M) | 32,768 | 支持 | 1M 上下文轻量化极速变体 |
| `thinkingmachines/inkling:free` | `inkling` | 1,048,576 (1M) | 32,768 | 支持 | 1M 上下文长文本分析模型 |
| `thinkingmachines/inkling-small:free` | `inkling-small` | 1,048,576 (1M) | 32,768 | 支持 | 1M 轻量长文本模型 |

### 3. 主力代码与深度思考免费模型 (Core Coding & Reasoning)

| 模型 ID | 简写别名 | 上下文窗口 | 最大输出 | 思考推理 | 特性与适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `inclusionai/ling-3.0-flash-sante:free` | `ling`, `sante` | 262,144 | 32,768 | 支持 | 极速响应，稳定性高的高可用主力模型 |
| `nvidia/nemotron-3-super-120b-a12b:free` | `120b` | 262,144 | 32,768 | 支持 | 120B 参数级深度思考模型 |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | `nano`, `reasoning` | 131,072 | 32,768 | 支持 (带视觉) | 多模态图像识别 + 深度思考链路 |
| `cohere/north-mini-code:free` | `north` | 131,072 | 32,768 | 支持 | 代码补全、单元测试与代码审查专用 |
| `poolside/laguna-s-2.1:free` | `laguna` | 131,072 | 32,768 | 支持 | 算法与逻辑推导优化模型 |
| `poolside/laguna-xs-2.1:free` | `xs` | 131,072 | 32,768 | 支持 | 轻量级逻辑变体 |

### 4. 轻量极速与专用工具模型 (Lightweight & Specialized Tools)

| 模型 ID | 简写别名 | 上下文窗口 | 最大输出 | 思考推理 | 特性与适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `google/gemma-4-26b-a4b-it:free` | `gemma` | 262,144 | 32,768 | 支持 | 谷歌 Gemma 开源免费微调版 |
| `google/gemma-4-31b-it:free` | `gemma-31b` | 262,144 | 32,768 | 支持 | 谷歌 Gemma 31B 结构化推理版 |
| `dots-studio/dots-3-note-preview:free` | `note` | 131,072 | 32,768 | 支持 | 笔记、提纲与纪要总结优化 |
| `liquid/lfm-2.5-2.6b:free` | `lfm` | 32,768 | 8,192 | 快速 | Liquid 神经架构轻量模型 |
| `nvidia/nemotron-3.5-content-safety:free` | `safety` | 131,072 | 16,384 | 快速 | 内容安全审计过滤专用 |
| `apodex/apodex-1.1-mini:free` | `apodex` | 131,072 | 32,768 | 快速 | 极速辅助对话模型 |

### 5. 计费陷阱与已下架模型警示 (Paid Traps & Delisted Models)

以下模型已被上游下架或转为商业计费，插件已将其列入防御过滤，自动重定向至可用模型：
* `deepseek/deepseek-v4.1-flash`: 官方已停止免费分发，已自动映射至 `openrouter/free`；
* `stealth/space-bunny-alpha`: 上游节点已下架，已自动平滑重定向；
* `openrouter/fusion` / `openrouter/pareto-code`: 节点已停用，已自动平滑重定向；
* `inclusionai/ling-3.0-flash-fin:free`: 历史版本已下架，已自动升级至 `inclusionai/ling-3.0-flash-sante:free`；
* `qwen/qwen3.8-27b:free`: 上游免费端点不可用，已自动重定向至 `openrouter/free`。

---

## 四、命令使用与交互面板

在 Pi 终端交互界面中，可通过 `/cline` 体系指令进行全方位控制：

| 命令 | 说明 | 交互效果 |
|:---|:---|:---|
| `/cline` | 无参直接运行：自动在线探测拉取后端最新模型，刷新上下文与思考等级，同步配置并热载入 Pi | 输出控制面板与已同步模型摘要 |
| `/cline <key>` 或 `/cline key <key>` | 更新 API Key：保存新 Key，自动在线探测拉取最新免费模型并热重载 | 输出新 Key 验证结果与模型卡片 |
| `/cline refresh` 或 `/cline sync` | 强制在线刷新：重新在线拉取远端模型目录并全量同步本地配置与运行时 | 输出同步状态报告 |
| `/cline list` 或 `/cline models` | 查看模型列表：展示全部 17 款零额度模型详细树形卡片 | 输出分级卡片列表 |
| `/cline free` | 查看零额度注册表：分类呈现隐身零消耗模型与官方标准免费模型 | 输出分类结构表格 |
| `/cline status` | 查看运行状态：脱敏 Key、端点、可用模型总数、思考模型数及本地反代状态 | 输出运行状态仪表盘 |
| `/cline ping [模型ID]` | 网络时延探针：实时探测免费模型连通性与往返延迟 (RTT) | 输出各模型网络时延与评级 |
| `/cline model <模型ID>` | 快速切换模型：一键切换当前 Pi 会话所使用的模型 | 即刻切换生效 |
| `/cline proxy start [端口]` | 启动本地反向代理：在指定端口（默认 4116）启动 OpenAI 兼容本地代理 | 输出端点信息 |
| `/cline proxy stop` | 停止本地反向代理：停止正在运行的代理进程 | 释放端口 |

---

## 五、本地反向代理配置与第三方集成

插件内置 Node.js 反向代理服务，将 Cline 官方私有接口转换为完全符合标准 OpenAI 规范的本地服务。

### 1. 独立 CLI 启动代理
可在终端直接执行打包后的可执行文件：
```bash
# 默认在 4116 端口启动
node ./bin/cline-proxy.js 4116

# 或通过自定义参数启动
node ./bin/cline-proxy.js --port 4116 --key sk_test_placeholder_key
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
* **Model Name**: 手动输入 `openrouter/free` 或 `nvidia/nemotron-3.5-lightning:free`。

### 4. OpenAI SDK (Python / Node.js) 接入

**Python**:
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:4116/v1",
    api_key="cline-local-token"
)

response = client.chat.completions.create(
    model="openrouter/free",
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
  model: "openrouter/free",
  messages: [{ role: "user", content: "Implement a Red-Black Tree in TypeScript" }],
});

console.log(completion.choices[0].message.content);
```

---

## 六、版本变更记录 (Changelog)

### v0.1.9
* **全新免费模型深度对接与别名路由强化 (New Free Models & Alias Enhancement)**：
  * 正式收录并适配最新 `apodex/apodex-1.1-mini:free` 等活跃免费模型，强化 `dots-studio/dots-3-note-preview:free`、`cohere/north-mini-code:free` 等代码与推理模型；
  * 针对上游已取消免费标识的 `inclusionai/ling-3.0-flash-sante`，路由层平滑安全重定向至 `openrouter/free`，彻底杜绝扣费与 404 隐患；
  * 增强短别名支持（`dots`, `apodex`, `laguna`, `north`, `gemma` 等）。
* **会话压缩深度自愈与 Token Cap 彻底防御 (Auto-compaction Token Cap Boost)**：
  * 针对 Pi 压缩模块传入的极小 `max_tokens`（通常仅 1000~2000 tokens），拦截层与本地反向代理双重强制提升至至少 16384 tokens，从源头根除 `Summarization failed: generation hit the token cap` 异常；
  * 强化流式与非流式 `finish_reason: "content_filter"` 与 `finish_reason: "length"` 的捕获，平滑重写为 `stop` 并兜底输出合规的结构化会话进度检查点，确保压缩任务 100% 成功。

### v0.1.8
* **全链路会话压缩与安全策略防御 (content_filter & Token Cap Fix)**：
  * **修复 Token Cap 截断异常**：调优压缩任务输出上限至 16,384 tokens，并在压缩模式下强制设置 `reasoning_effort: "low"` 并剥离思考过程，彻底消除推理模型触发 token cap 导致压缩失败；
  * **平滑重写 finish_reason length -> stop**：在压缩摘要非空时将 length 结果重写为 stop，避免 Pi 触发 `stopReason === "length"` 运行时报错；
  * **安全审核过滤防御**：集成 `sanitizeSensitiveAuditContent` 审计脱敏引擎，自动合规替换 `<conversation>` 中的 SQL 注入、XSS 脚本标签与利用工具特征；
  * **拦截器与本地代理双向 content_filter 兜底**：在压缩时合成结构化会话检查点，在对话时保全已有输出并提示调整提问方式。
* **免费模型注册表更新与别名路由升级**：
  * 清除上游已失效或下架的 6 款模型，精准锁定 17 款在线零扣费模型；
  * 自动将旧模型别名（如 `bunny`, `fusion`, `code`, `deepseek-v4.1-flash`, `ling`）平滑重定向至当前活跃免费模型。

### v0.1.7
* **安全审计与网络加固**：
  * 增强本地代理 Host 标头安全校验与 DNS 重绑定防护；
  * 统一请求体重试与多字节 UTF-8 流分包保障。

### v0.1.6
* **深度修复上游空响应重试机制 (Provider Returned an Empty Response)**：
  * 流式预读上限提升至 30 包与 64KB，精准穿透网关 processing 注释；
  * 严格限定错误边界匹配，生产环境全抖动指数退避重试。

### v0.1.5
* **供应商节点空响应自动同模型重试 3 次**：首创首包无损流式 Stream Peek 预读探测，当上游节点返回伪 200 空流时自动 3 次重试；
* **Pi 运行态规范化校验 (`sanitizePiModelDefinition`)**：严格清洗畸变字段，保证配置安全落盘。

### v0.1.4
* 系统安全审计全面加固：DNS Rebinding 防护、受信任 CORS 来源校验、0700/0600 权限保障。

### v0.1.2
* 坚守模型品质底线，严格执行同模型指数退避重试，绝不自动跨模型降级；极简默认免代理直连模式。

### v0.1.1
* 指令体系与 `/zen` 全面深度对齐；思考链 (CoT) 双向字段规范化；清除所有 Emoji 表情符号。

### v0.1.0
* 全新发布！Cline 官方指纹伪装、全量零额度免费模型智能路由与本地 OpenAI 兼容反向代理。

---

## 七、许可

- 仓库: [https://github.com/1837620622/ck-pi-extension](https://github.com/1837620622/ck-pi-extension)
- 协议: MIT License

---

<a id="ck-pi-cline-en"></a>
# ck-pi-cline (English)

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.9-blue.svg?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/runtime-Pi%20Agent%20%3E%3D0.85.0-orange.svg?style=flat-square" alt="Pi Runtime" />
  <img src="https://img.shields.io/badge/protocol-OpenAI%20Compatible-informational.svg?style=flat-square" alt="Protocol" />
  <img src="https://img.shields.io/badge/client%20fingerprint-Cline%20v4.1.16-purple.svg?style=flat-square" alt="Fingerprint" />
  <img src="https://img.shields.io/badge/zero--cost%20models-17%20Verified-success.svg?style=flat-square" alt="Zero Cost Models" />
</p>

<p align="center">
  <a href="#ck-pi-cline">中文说明</a> | <a href="#ck-pi-cline-en">English Documentation</a>
</p>

---

## Sponsorship & Support

If you find this project helpful, please consider sponsoring. Your support directly funds continuous maintenance, endpoint testing, reverse-engineering protocol alignment, and rapid iteration.

### Sponsorship Channels

- **GitHub Sponsors**: [https://github.com/sponsors/1837620622](https://github.com/sponsors/1837620622)
- **Enterprise Sponsorship**:
  - AI infrastructure providers, proxy gateway services, and engineering teams are welcome to sponsor.
  - Benefits: Prominent brand logo and link display in the README, priority issue response, and custom protocol optimizations.

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. System Architecture & Technical Principles](#2-system-architecture--technical-principles)
- [3. Verified 17 Zero-Cost Models Matrix](#3-verified-17-zero-cost-models-matrix)
- [4. Commands & Dashboard](#4-commands--dashboard)
- [5. Local Reverse Proxy & Third-Party Integration](#5-local-reverse-proxy--third-party-integration)
- [6. Changelog](#6-changelog)
- [7. License](#7-license)

---

## 1. Overview

`ck-pi-cline` is a high-availability Cline official API reverse proxy, client fingerprint disguise, zero-cost model intelligent router, and local OpenAI-compatible reverse proxy extension built for the **Pi Coding Agent**.

> **Architecture & Operational Principles**:
> * **Default Direct Connection & Injection**: By default, the local proxy port is **not started** upon launch. The extension directly mounts 17 zero-cost models into Pi runtime via a global Fetch interceptor pointing to the official gateway with zero local proxy overhead (fully aligned with `ck-pi-zen-session`);
> * **On-Demand Local Reverse Proxy**: Starts the local port 4116 only when explicitly executed via `/cline proxy start` or when needed by external tools (e.g., CC-Switch, Cursor);
> * **Same-Model Exponential Backoff Retry**: Transparently retries errors (500/502/503/504/429) on the exact same model, refusing to downgrade model capability.

Key problems resolved:
1. **Fingerprint Validation Blocking**: Bypasses 403 errors by spoofing official VS Code headers;
2. **Payload Discrepancies**: Unpacks non-streaming responses nested in `{ data: { choices: [...] } }`;
3. **Empty Output Freezes**: Intercepts `choices: []` frames to prevent agent crashes;
4. **Credit Depletion Traps**: Excludes paid models and enforces `:free` parameters;
5. **Model Deprecations**: Cleans delisted models and dynamically redirects aliases to working free alternatives.

---

## 2. System Architecture & Technical Principles

1. **Official Client Fingerprint Spoofing**: Injects 8 official headers (`User-Agent: Cline/4.1.16`, `x-client-version: 4.1.16`, `x-client-type: cline-vscode`, etc.) across all outgoing requests.
2. **Protocol Normalization**: Transparently unpacks `{ success: true, data: { ... } }` into standard OpenAI ChatCompletion objects.
3. **Empty Output Invariant Guard**: Inspects SSE frames and synthesizes fallback assistant chunks when the upstream returns empty choices.
4. **Zero-Cost Model Safeguard**: Detects verified free models and appends `:free` to prevent billable routing.
5. **Reasoning Chain Mapping**: Normalizes `delta.reasoning` into `delta.reasoning_content` for proper CoT rendering.
6. **Same-Model Exponential Backoff Retry**: Retries up to 3 times on 5xx and 429 gateway responses without model substitution.
7. **Context Pruning**: Truncates oversized tool outputs (> 25,000 chars) and trims intermediate conversation turns.
8. **content_filter Defense & Token Cap Fix**:
   - Sanitizes SQLi, XSS, and security payloads in `<conversation>` to prevent triggering safety moderation;
   - Intercepts `finish_reason: "content_filter"` and normalizes to structured checkpoint summaries;
   - Relaxes compaction token limit to 16,384 tokens with `reasoning_effort: "low"`, rewriting `finish_reason: "length"` to `"stop"` to eliminate summarization crashes.

---

## 3. Verified 17 Zero-Cost Models Matrix

All listed models have been tested online with verified zero credit deduction (`cost === 0`):

| Model ID | Short Alias | Context Window | Max Output | Reasoning | Modality |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `openrouter/free` | `free`, `auto` | 200,000 | 32,768 | Yes | Text |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | `550b`, `ultra` | 1,000,000 (1M) | 32,768 | Yes | Text |
| `nvidia/nemotron-3.5-lightning:free` | `lightning` | 1,000,000 (1M) | 32,768 | Yes | Text |
| `thinkingmachines/inkling:free` | `inkling` | 1,048,576 (1M) | 32,768 | Yes | Text |
| `thinkingmachines/inkling-small:free` | `inkling-small` | 1,048,576 (1M) | 32,768 | Yes | Text |
| `inclusionai/ling-3.0-flash-sante:free` | `ling`, `sante` | 262,144 | 32,768 | Yes | Text |
| `nvidia/nemotron-3-super-120b-a12b:free` | `120b` | 262,144 | 32,768 | Yes | Text |
| `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` | `nano`, `reasoning` | 131,072 | 32,768 | Yes | Text, Vision |
| `cohere/north-mini-code:free` | `north` | 131,072 | 32,768 | Yes | Text |
| `poolside/laguna-s-2.1:free` | `laguna` | 131,072 | 32,768 | Yes | Text |
| `poolside/laguna-xs-2.1:free` | `xs` | 131,072 | 32,768 | Yes | Text |
| `google/gemma-4-26b-a4b-it:free` | `gemma` | 262,144 | 32,768 | Yes | Text |
| `google/gemma-4-31b-it:free` | `gemma-31b` | 262,144 | 32,768 | Yes | Text |
| `dots-studio/dots-3-note-preview:free` | `note` | 131,072 | 32,768 | Yes | Text |
| `liquid/lfm-2.5-2.6b:free` | `lfm` | 32,768 | 8,192 | Fast | Text |
| `nvidia/nemotron-3.5-content-safety:free` | `safety` | 131,072 | 16,384 | Fast | Text |
| `apodex/apodex-1.1-mini:free` | `apodex` | 131,072 | 32,768 | Fast | Text |

---

## 4. Commands & Dashboard

Control extension features inside the Pi interactive terminal:

| Command | Description | Output |
| :--- | :--- | :--- |
| `/cline` | No args: discover remote models, sync configuration, and hot reload Pi | Status panel and synced summary |
| `/cline <key>` or `/cline key <key>` | Configure API key and reload models | Key verification report |
| `/cline refresh` or `/cline sync` | Force remote sync and update local configuration | Refresh status report |
| `/cline list` or `/cline models` | View catalog of 17 zero-cost models | Tree card list |
| `/cline free` | View categorized zero-cost models table | Structured catalog table |
| `/cline status` | View API key mask, endpoint, model count, and proxy state | Operational dashboard |
| `/cline ping [model-id]` | Probe free model network connectivity and round-trip time | Latency and rating report |
| `/cline model <model-id>` | Switch active Cline model | Immediate activation |
| `/cline proxy start [port]` | Start local OpenAI-compatible proxy (default port 4116) | Endpoint details |
| `/cline proxy stop` | Stop local proxy service | Port release |

---

## 5. Local Reverse Proxy & Third-Party Integration

### Standalone CLI Proxy
```bash
node ./bin/cline-proxy.js 4116
```

### CC-Switch
* Provider: `Cline-Free`
* Base URL: `http://127.0.0.1:4116/v1`
* API Key: `cline-proxy`

### OpenAI SDK Integration
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:4116/v1",
    api_key="cline-local-token"
)

response = client.chat.completions.create(
    model="openrouter/free",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)
for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

---

## 6. Changelog

### v0.1.9
- **New Free Models Integration & Enhanced Routing**:
  - Registered and calibrated newly active free models such as `apodex/apodex-1.1-mini:free`, `dots-studio/dots-3-note-preview:free`, and `cohere/north-mini-code:free`;
  - Safely and smoothly routed unflagged `inclusionai/ling-3.0-flash-sante` to `openrouter/free` to eliminate unexpected charges or 404s;
  - Expanded shorthand aliases (`dots`, `apodex`, `laguna`, `north`, `gemma`, etc.).
- **Auto-compaction Token Cap Boost & Crash Defense**:
  - Compaction requests dynamically boost `max_tokens` / `max_completion_tokens` to at least 16,384 tokens with `reasoning_effort: "low"` to eliminate token cap exhaustion crashes;
  - Both interceptor and proxy intercept and normalize `finish_reason: "content_filter"` and `finish_reason: "length"` to `"stop"`, synthesizing structured checkpoints when needed.

### v0.1.8
- **Auto-compaction & content_filter defense**:
  - Relaxed compaction token output limit to 16,384 tokens with `reasoning_effort: "low"` and CoT suppression, preventing token cap exhaustion crashes;
  - Normalized `finish_reason: "length"` on compaction tasks to `"stop"`;
  - Added `sanitizeSensitiveAuditContent` to sanitize SQL injection, XSS script tags, and exploit patterns in `<conversation>` tags;
  - Intercepted `finish_reason: "content_filter"`, synthesizing structured session checkpoints on compaction.
- **Model catalog & alias routing update**:
  - Purged 6 delisted/paid trap models, locking catalog to 17 verified active models;
  - Smooth alias auto-routing for deprecated models.

### v0.1.7
- Strengthened Host header validation, DNS rebinding defenses, and cross-chunk UTF-8 stream decoding.

### v0.1.6
- Deep fix for upstream empty response retry (`Provider returned an empty response`) with 30-packet peek buffer.

### v0.1.5
- 3-attempt same-model retry on empty response or zero-byte stream; `sanitizePiModelDefinition` data protection.

### v0.1.4
- Comprehensive security audit fixes: DNS rebinding protection, trusted CORS origin validation, 0700/0600 file permissions.

### v0.1.2
- Strict same-model exponential backoff retry; default direct connection mode.

### v0.1.1
- Command parity with `/zen`; bidirectional CoT reasoning mapping; stripped all emojis.

### v0.1.0
- Initial release with official fingerprint spoofing and verified zero-cost models.

---

## 7. License

- Repository: [https://github.com/1837620622/ck-pi-extension](https://github.com/1837620622/ck-pi-extension)
- License: MIT License
