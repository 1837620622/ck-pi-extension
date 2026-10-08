# ck-pi-extension

<p align="center">
  <a href="#ck-pi-extension">中文</a> | <a href="#ck-pi-extension-en">English</a>
</p>

Pi 插件 monorepo：一个 GitHub 仓库，多个彼此独立的 npm 包，用户按需单装。

| 插件 | npm 包 | 描述 | 文档 |
| --- | --- | --- | --- |
| Pi Rail | `ck-pi-rail` | 无表情、自适应满宽状态栏 | [README](packages/pi-rail/README.md) |
| Pi Redkit | `ck-pi-redkit` | 授权交战条令注入（渗透/逆向） | [README](packages/pi-redkit/README.md) |
| Pi Zen Session | `ck-pi-zen-session` | OpenCode Zen 免费模型、Responses/Completions 双协议路由与会话自愈 | [README](packages/pi-zen-session/README.md) |
| Pi Cline | `ck-pi-cline` | Cline 官方指纹伪装、17 款零额度模型与本地反向代理 | [README](packages/pi-cline/README.md) |
| Pi Guard | `ck-pi-guard` | 深度思考后脱机守卫与边缘网关超时拦截重试 (502, 503, 504, 520-525, 533) | [README](packages/pi-guard/README.md) |

---

## 赞助与支持

如果您觉得这些插件提升了您的开发效率，欢迎赞助支持本项目！您的赞助将直接用于持续维护、网络节点验证、逆向协议对齐与新特性的快速迭代。

### 赞助渠道

- **GitHub Sponsors**: [https://github.com/sponsors/1837620622](https://github.com/sponsors/1837620622)
- **企业赞助与商务合作**:
  - 欢迎 AI 基础设施提供商、代理网关服务商或团队提供赞助。
  - 赞助权益包含：在项目 README 显著位置展示企业 Logo 与链接、优先处理定制化需求与专属问题支持。

---

## 安装方法

按需单装，互不顺带：

```bash
pi install npm:ck-pi-rail        # 状态栏
pi install npm:ck-pi-redkit      # 条令注入
pi install npm:ck-pi-zen-session # OpenCode Zen 免费模型与会话自动维护
pi install npm:ck-pi-cline       # Cline 官方指纹、17 款零额度模型与本地反代
pi install npm:ck-pi-guard       # 深度思考脱机守卫与网关重试
```

旧合集包 `ck-pi-extension` 已废弃（不再更新），新用户请装上面单包。

GitHub 源安装：
```bash
pi install git:github.com/1837620622/ck-pi-extension
```

冲突说明：
`pi-rail` 不要和 `@narumitw/pi-statusline`、`pi-starline`、`pi-zentui` 同时开，它们都会抢同一条页脚。

---

## 快速开始

```text
/statusline          状态栏设置菜单（外观 / 信息 / 高级 / 状态 / 帮助）

/redkit status       查看条令注入状态
/redkit full         切换条令模式 (full/pentest/reverse/off)

/zen                 无参运行：自动续期降序会话、刷新请求头并全量同步本地配置与运行时
/zen <key>           配置/更新 OpenCode Zen Key，自动探测免费模型、上下文与思考等级
/zen status          查看 Zen 会话年龄、请求头保护与模型库状态
/zen refresh         强制生成全新降序 Session ID 并刷新请求头
/zen list            查看所有已激活的 Zen 免费模型规格清单
/zen add <id> [name] 自定义登记新增的免费模型至本地模型库
/zen ping [model]    实时探测 Zen 免费模型网络连通性与往返时延
/zen model <id>      快速切换当前激活的 Zen 模型

/cline               无参运行：自动拉取远端模型、刷新配置并热重载 Pi 模型库
/cline <key>         配置/更新 Cline API Key，自动在线探测 17 款零额度模型
/cline status        查看当前详细运行状态、指纹签名与本地反代状态
/cline refresh       强制在线拉取远端模型并刷新本地配置
/cline list          查看所有可用免费模型详细规格清单
/cline free          查看 17 款零额度模型注册表
/cline add <id> [name] 自定义登记新增的零额度免费模型
/cline ping [model]  实时探测免费模型连通性与网络时延
/cline proxy start   在后台启动本地 OpenAI 兼容反向代理服务 (默认端口 4116)

/guard status        查看思考脱机守卫与网关重试实时指标与熔断状态
/guard reset         重置守卫统计计数与熔断状态
/guard on / off      开启或关闭守卫与网关拦截
```

---

## 更新日志

- `ck-pi-zen-session 0.1.23` / `ck-pi-cline 0.1.8`：
  - **核心修复会话自动压缩失败与 Token Cap 截断崩溃 (`generation hit the token cap and the summary is incomplete`)**：
    - 调优压缩输出上限至 16,384 tokens 并强制 `reasoning_effort: "low"`，避免深度推理模型（如 `fledge-alpha-free`）耗尽 token 额度；
    - 在会话压缩摘要非空时，将上游返回的 `finish_reason: "length"` 自动重写为 `"stop"`，彻底根除 Pi 官方压缩模块在命中 token cap 时的崩溃中断。
  - **全链路防御安全审核过滤阻断 (`finish_reason: content_filter`)**：
    - 引入 `sanitizeSensitiveAuditContent` 审计特征脱敏引擎：针对 `<conversation>` 中的 SQL 注入特征、XSS 脚本块、漏洞利用载荷、密码散列和卡号等敏感特征进行合规占位脱敏，从源头杜绝触发上游内容审查拦截；
    - 全局拦截器与本地反向代理双向捕获 `content_filter`：在压缩模式下自动合成规范的结构化会话检查点摘要并置 `finish_reason: "stop"`，在对话模式下保全已生成内容并附带友好安全调整提示。
  - **更新最新在线免费模型目录与剔除失效模型**：
    - 剔除已下架的历史不可用模型（`mimo-v2.5-free`, `ling-3.0-flash-fin-free`, `nemotron-3-ultra-free`, `deepseek-v4.1-flash`, `space-bunny-alpha`, `openrouter/fusion` 等）；
    - 正式同步上线在线活跃模型（Zen: 9 款，Cline: 17 款），优化短别名映射引擎平滑重定向至最新存活模型。
- `ck-pi-zen-session 0.1.22`：
  - **支持 OpenAI Responses API 协议与双供应商路由架构 (修复 Issue #1)**：
    - **双供应商精准分流**：将 OpenCode Zen 拆分为 `opencode-zen-free`（走 `openai-completions`，负责 Big Pickle, Xiaomi MiMo, NVIDIA Nemotron, Ling, Space Bunny）与 `opencode-zen-free-responses`（走 `openai-responses`，负责 Meta Muse Spark 1.3/1.2 Contributor Free）；
    - **彻底解决 400 ModelProtocolUnsupported 报错**：由于 OpenCode Zen 网关仅在 `/responses` 端点提供 Muse Spark 系列模型，通过独立 provider 注册让 Pi 原生通过 Responses API 发送请求；
    - **Responses 协议结构对齐**：为 Responses API 注入扁平化工具定义（`OPENCODE_OFFICIAL_RESPONSES_TOOLS`，不嵌套在 `.function` 内），在 Compaction 场景下注入 `tool_choice: "none"`，严禁注入 ChatCompletions 专有字段（如 `stream_options`, `reasoning_effort`, `max_tokens`），防止网关参数校验失败；
    - **Fetch 拦截器双端点适配**：拦截器同时支持 `/zen/v1/chat/completions` 与 `/zen/v1/responses`，区分 SSE 解析逻辑，且仅对 ChatCompletions 端点执行 SSE-to-ChatCompletion 反序列化；
    - **持久化与运行态双写**：`syncZenConfiguration` 自动双写双供应商配置至 `~/.pi/agent/models.json` 与 `auth.json`，`/zen model` 与 `/zen ping` 指令自适应路由。
- `ck-pi-cline 0.1.6` / `ck-pi-zen-session 0.1.21`：
  - **深度修复上游空响应重试机制 (`Provider returned an empty response`)**：
    - **流式深度探测穿透多轮注释包**：SSE 流式预读上限提升至 30 个数据包与 64KB，彻底穿透网关初始下发的 3~5 轮 `: OPENROUTER PROCESSING\n\n` 或 keepalive 注释，精准捕捉延后出现的 `Provider returned an empty response` 错误帧；
    - **严格限定错误匹配边界**：错误识别限定于 `data.error` 结构与标准错误提示，避免模型自身生成的正常文本（如含 "empty response" 解释）被误判；
    - **真实指数退避重试**：设定生产环境最小退避底线（1.5s ~ 5.0s 带 Jitter 抖动），为上游算力集群提供充足故障转移窗口，严守 3 次自动同模型重试；
    - **测试环境完全沙盒隔离**：测试环境强制注入临时配置路径，杜绝单元测试写入真实配置；
    - **配置注入安全性规范**：集成 `sanitizePiModelDefinition` 机制，写入 `~/.pi/agent/models.json` 时严格类型校验与字段修剪，杜绝无效或畸变 JSON 注入。
- `ck-pi-cline 0.1.5` / `ck-pi-zen-session 0.1.20`：
  - **供应商节点空响应自动同模型重试 3 次 (`Provider returned an empty response`)**：首创无损首包 Stream Peek 预读探测，当上游节点返回伪 200 但首包为 `empty response` 错误帧或 0 字节空流时，立即断开并自动进行指数退避 3 次同模型重试，彻底消除偶发性空响应弹窗；
  - **Pi 运行态与 `models.json` 严格 JSON 校验与防畸变过滤 (`sanitizePiModelDefinition`)**：严格校验 `contextWindow`、`maxTokens`、`input`、`cost` 四维参数，非法值自动回退安全默认值，清洗根级历史残留键，杜绝注入畸变或非法 JSON；
  - **零额度隐身模型智能识别与零扣费后台实时目录拉取**：深度识别 `stealth/space-bunny-alpha` 等隐身零消耗模型与定价为 0 的元数据，每次启动与每 30 分钟后台静默拉取远端目录（0 Token 0 扣费），并支持 `~/.pi/agent/cline-models.json` 与 `~/.pi/agent/zen-models.json` 本地扩展；
  - **模型去重保障**：彻底移除冗余人工别名注入，统一以规范 canonical ID 唯一键去重，杜绝 `/model` 菜单出现重复项。
- `ck-pi-guard 0.1.2`：全新发布！深度思考模型脱机守卫与边缘网关状态码拦截重试：
  - **全格式思考与内嵌标签剥离**：不仅支持结构化 thinking 块，全面自动剥离 `<think>...</think>`、`<thought>` 文本标签与顶层 `reasoning_content`，多协议兼容 toolCall、tool_use 与 function 调用；
  - **10 大边缘网关状态码与防风暴协同**：覆盖 502, 503, 504, 520, 521, 522, 523, 524, 525, 533，支持 Retry-After 标头退避，主动让出已由 Cline/Zen 接管的端点，杜绝 16 倍乘法重试风暴；
  - **生命周期隔离与安全契约**：在 before_agent_start、session_start 及用户 input 时重置脱机计数，防范误熔断；遵循 ctx.signal 取消信号与 followUp 队列调度规范，绝不返回非法 boundary continuation。
- `ck-pi-cline 0.1.4` / `ck-pi-zen-session 0.1.19` / `ck-pi-rail 0.1.1` / `ck-pi-redkit 0.1.8`：系统级安全与架构深度审计全面加固：
  - **网络与本地代理安全**：强化 DNS Rebinding 防护、严格解析中括号 IPv6 主机头、受信任 CORS 来源白名单校验、SSE 帧缓存 2MB 熔断机制、客户端断开自动取消上游流式传输；
  - **同模型全抖动退避重试**：Fetch 拦截器遭遇 500/502/503/504 及 429 时，执行带 Full Jitter 全抖动的指数退避重试，绝不自动切换备用模型（严格保障模型质量不降级）；
  - **凭据与数据库安全**：`auth.json` 与 `models.json` 目录与文件权限严格限制为 0700 / 0600；CC-Switch SQLite 同步兼容 Node < 22.5.0 并杜绝进程参数凭据暴露；
  - **终端与配置原子落盘**：OSC 8 参数与 ST 终止符完整支持、状态栏配置 CAS 乐观锁防并发覆盖、全工程严格无 Emoji 注入。
- `ck-pi-cline 0.1.1` / `ck-pi-zen-session 0.1.18`：双插件指令体系全面对齐。
- `ck-pi-cline 0.1.0`：全新发布！Cline 官方指纹伪装、21 款实测零额度免费模型。
- `ck-pi-zen-session 0.1.15`：Compaction 标签级深度修剪与极速响应、底层透明三重重试自愈。
- `ck-pi-rail 0.1.0` / `ck-pi-redkit 0.1.0`：monorepo 拆分首发。

---

## 许可证

MIT License，见 [LICENSE](LICENSE)。

---

<a id="ck-pi-extension-en"></a>
# ck-pi-extension (English)

<p align="center">
  <a href="#ck-pi-extension">中文</a> | <a href="#ck-pi-extension-en">English</a>
</p>

Monorepo for Pi extensions: one GitHub repository containing independent npm packages. Install only what you need.

| Extension | npm Package | Description | Documentation |
| --- | --- | --- | --- |
| Pi Rail | `ck-pi-rail` | Pure-tech adaptive full-width status line | [README](packages/pi-rail/README.md) |
| Pi Redkit | `ck-pi-redkit` | Authorized rules of engagement injection (pentest / reverse) | [README](packages/pi-redkit/README.md) |
| Pi Zen Session | `ck-pi-zen-session` | OpenCode Zen free models, dual-protocol routing (Completions & Responses), and session self-healing | [README](packages/pi-zen-session/README.md) |
| Pi Cline | `ck-pi-cline` | Cline official fingerprint disguise, 17 zero-cost models & local reverse proxy | [README](packages/pi-cline/README.md) |
| Pi Guard | `ck-pi-guard` | Thinking offline sentinel & edge gateway retry (502, 503, 504, 520-525, 533) | [README](packages/pi-guard/README.md) |

---

## Sponsorship & Support

If you find these extensions helpful and time-saving, consider sponsoring this project. Your support directly funds continuous maintenance, endpoint testing, reverse-engineering protocol alignment, and rapid feature development.

### Sponsorship Channels

- **GitHub Sponsors**: [https://github.com/sponsors/1837620622](https://github.com/sponsors/1837620622)
- **Enterprise & Commercial Sponsorship**:
  - AI infrastructure providers, proxy gateway services, and engineering teams are welcome to sponsor.
  - Benefits: Prominent brand logo and link display in the project README, priority issue response, and custom protocol optimizations.

---

## Installation

Install packages individually on demand:

```bash
pi install npm:ck-pi-rail        # Statusline
pi install npm:ck-pi-redkit      # Rules of engagement injection
pi install npm:ck-pi-zen-session # OpenCode Zen free models & session auto-maintenance
pi install npm:ck-pi-cline       # Cline official fingerprint, 17 zero-cost models & local proxy
pi install npm:ck-pi-guard       # Thinking offline sentinel & gateway retry
```

The legacy bundle package `ck-pi-extension` is deprecated (no longer updated); new users should install individual packages above.

Install from GitHub:
```bash
pi install git:github.com/1837620622/ck-pi-extension
```

Conflict Notice:
Do not enable `pi-rail` concurrently with other statusline extensions (`@narumitw/pi-statusline`, `pi-starline`, `pi-zentui`) as they compete for the same footer line.

---

## Quick Start

```text
/statusline          Status line settings (appearance, info, advanced, status, help)

/redkit status       View rules of engagement injection status
/redkit full         Switch rules mode (full / pentest / reverse / off)

/zen                 No args: auto-refresh descending session ID, disguise headers, and sync configuration
/zen <key>           Configure/update OpenCode Zen key, discover free models, context windows, and thinking levels
/zen status          View Zen session age, header protection, and model catalog status
/zen refresh         Force generate new descending session ID and refresh headers
/zen list            View catalog of all activated Zen free models
/zen add <id> [name] Register custom free model into local catalog
/zen ping [model]    Probe Zen model network latency and RTT in real time
/zen model <id>      Quickly switch active Zen model

/cline               No args: pull remote models, refresh configuration, and reload registry
/cline <key>         Configure/update Cline API key, discover 17 zero-cost models
/cline status        View Cline status, fingerprint signature, and local proxy state
/cline refresh       Force pull remote models and update local configuration
/cline list          View full catalog of available free models
/cline free          View 17 zero-cost model registry
/cline add <id> [name] Register custom zero-cost model
/cline ping [model]  Probe free model network connectivity and latency
/cline proxy start   Start local OpenAI-compatible reverse proxy in background (port 4116)

/guard status        View thinking offline sentinel and gateway retry real-time metrics
/guard reset         Reset sentinel counters and circuit breaker state
/guard on / off      Enable or disable guard and gateway interceptor
```

---

## Changelog

- `ck-pi-zen-session 0.1.23` / `ck-pi-cline 0.1.8`:
  - **Auto-compaction token cap crash fix & length normalization (`generation hit the token cap and the summary is incomplete`)**:
    - Relaxed compaction output token ceiling to 16,384 tokens with forced `reasoning_effort: "low"` and CoT suppression, preventing reasoning models (such as `fledge-alpha-free`) from exhausting the compaction token budget;
    - Intercepted upstream `finish_reason: "length"` during summarization tasks and smoothly normalized to `finish_reason: "stop"` whenever non-empty text is generated, eliminating Pi's compaction crash.
  - **End-to-end safety moderation defense (`finish_reason: content_filter`)**:
    - Integrated `sanitizeSensitiveAuditContent` desensitization engine: automatically sanitized SQL injection patterns, XSS script tags, exploit tools, password hashes, and card numbers inside `<conversation>` tags during compaction to prevent triggering upstream content moderation filters;
    - Global fetch interceptor and reverse proxy intercept `finish_reason: "content_filter"`: synthesized structured session progress checkpoints with `finish_reason: "stop"` during compaction, and preserved partial generations with friendly notices during regular chat.
  - **Catalog synchronization & dead model pruning**:
    - Delisted unavailable models (`mimo-v2.5-free`, `ling-3.0-flash-fin-free`, `nemotron-3-ultra-free`, `deepseek-v4.1-flash`, `space-bunny-alpha`, `openrouter/fusion`, etc.);
    - Synchronized verified active models (Zen: 9 models, Cline: 17 models);
    - Upgraded short alias resolver to seamlessly route old model names to active working successors.
- `ck-pi-zen-session 0.1.22`:
  - **Support OpenAI Responses API protocol & dual-provider architecture (Resolves Issue #1)**:
    - **Dual-provider routing**: Partitioned OpenCode Zen into `opencode-zen-free` (`openai-completions` for Big Pickle, Xiaomi MiMo, NVIDIA Nemotron, Ling, Space Bunny) and `opencode-zen-free-responses` (`openai-responses` for Meta Muse Spark 1.3/1.2 Contributor Free);
    - **Fix 400 ModelProtocolUnsupported error**: OpenCode Zen gateway serves Muse Spark models exclusively on `/responses`; registering independent providers allows Pi to natively communicate via Responses API;
    - **Responses protocol alignment**: Injects flat tool definitions (`OPENCODE_OFFICIAL_RESPONSES_TOOLS`), injects `tool_choice: "none"` on compaction/empty-tool calls, and strictly prevents injecting Chat-only fields (`stream_options`, `reasoning_effort`, `max_tokens`);
    - **Dual-endpoint fetch interceptor**: Intercepts both `/zen/v1/chat/completions` and `/zen/v1/responses`, distinguishes SSE event types, and restricts SSE-to-ChatCompletion reconstruction strictly to ChatCompletions;
    - **Configuration persistence & CLI**: Dual-writes both providers into `~/.pi/agent/models.json` and `auth.json`; `/zen model` and `/zen ping` route automatically based on model protocol.
- `ck-pi-cline 0.1.6` / `ck-pi-zen-session 0.1.21`:
  - **Deep fix for upstream empty response retry (`Provider returned an empty response`)**:
    - Peek buffer increased to 30 packets and 64KB, penetrating initial gateway keepalive/processing comments;
    - Strict error boundary matching avoiding normal model output false positives;
    - Production exponential backoff retry with jitter (1.5s - 5.0s floor), guaranteeing 3 same-model attempts;
    - Sandboxed test environment preventing unit tests from modifying local agent configuration;
    - Model definition sanitization (`sanitizePiModelDefinition`) preventing malformed JSON injection into `models.json`.
- `ck-pi-cline 0.1.5` / `ck-pi-zen-session 0.1.20`:
  - 3-attempt same-model retry on empty response or zero-byte stream;
  - Model sanitization ensuring valid integer context windows and zero costs;
  - Auto-discovery of stealth zero-cost models (`space-bunny-alpha`, etc.) and background non-consuming sync.
- `ck-pi-guard 0.1.2`: Initial release! Deep thinking offline sentinel and 10 edge gateway status code retry (502, 503, 504, 520-525, 533).
- `ck-pi-cline 0.1.4` / `ck-pi-zen-session 0.1.19` / `ck-pi-rail 0.1.1` / `ck-pi-redkit 0.1.8`: Security audits, DNS rebinding protection, full-jitter exponential backoff, atomic writes.
- `ck-pi-cline 0.1.0`: Initial release with official fingerprint disguise and 21 zero-cost models.
- `ck-pi-zen-session 0.1.15`: Context compaction pruning and transparent 3-attempt retry.
- `ck-pi-rail 0.1.0` / `ck-pi-redkit 0.1.0`: Monorepo split release.

---

## License

MIT License, see [LICENSE](LICENSE).
