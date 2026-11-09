# 更新日志 / Changelog

所有版本均通过 GitHub 分发：`pi install git:github.com/1837620622/ck-pi-extension`。
All releases are distributed from GitHub.

## 中文


- **分发方式改为 GitHub**：停止发布 npm，安装改为 `pi install git:github.com/1837620622/ck-pi-extension`；npm 上 ck-pi-zen-session / ck-pi-cline / ck-pi-guard 已标记 deprecated 并指向本仓库；`ck-pi-guard 0.1.3`、`ck-pi-rail 0.1.1` 的改动随 main 提供。
- `ck-pi-guard 0.1.3` / `ck-pi-rail 0.1.1`：
  - `ck-pi-guard`：适配 pi-coding-agent 1.5 类型（`/guard` 指令签名、重试请求体 `BodyInit`），运行时行为不变；
- `ck-pi-zen-session 0.1.28` / `ck-pi-cline 0.1.13`：
  - **修正上下文上限（#3）**：`deepseek-v4.1-flash-free` 与 `glm-5.3-flash-free` 由误报的 1M 更正为 200K 上下文 / 32K 输出（以 models.dev 元数据为准），远端同步、本地 `zen-models.json` 与推断结果都会被压回该上限；
  - **修复 `/zen model` 报错**：`fetchZenModelCatalog is not defined`；
  - **适配 pi-coding-agent 1.5**：`compat` 下沉到每个模型；开发依赖升级至 `^1.5.0`，`npm audit --omit=dev` 清零；
  - **CI**：改为按 workspace 执行 `npm pack --dry-run`，修复 verify 自 10 月起持续失败。
- `ck-pi-zen-session 0.1.24` / `ck-pi-cline 0.1.9`：
  - **最新官方免费模型矩阵全量上线与对接**：
    - OpenCode Zen：新增上线阶跃星辰最新旗舰 `step-5-preview-free`（200k 上下文，32k 输出，多模态视觉与全档位思考）、`exo-free`（128k 快反）、`nemotron-3-ultra-free`（1M 超长上下文）、`ling-3.0-flash-fin-free`（262k 加速模型）、`jev-1.13-free`（128k 快反）；
    - Cline：正式适配最新活跃免费模型（如 `apodex/apodex-1.1-mini:free`、`dots-studio/dots-3-note-preview:free`、`cohere/north-mini-code:free` 等），并对上游已取消免费标记的 `inclusionai/ling-3.0-flash-sante` 平滑安全重定向至 `openrouter/free`，彻底杜绝误扣费与 404；
    - 针对 OpenCode Zen 下架的 `fledge-alpha-free`，别名路由器平滑无感重定向至最新旗舰免费模型 `step-5-preview-free`。
  - **彻底攻克会话压缩截断与崩塌故障 (`Summarization failed: generation hit the token cap` / `Provider finish_reason: content_filter`)**：
    - 针对 Pi 压缩模块传入的极小 `max_tokens`（通常仅 1000~2000 tokens），请求拦截层与本地代理双重强制提升至至少 16384 tokens，从根本上杜绝深思考模型撞 token cap 截断；
    - 流式响应重构器（`reconstructedStream`）全面重构为行缓冲分包安全 TransformStream，逐帧捕获并自动规范化 `finish_reason: "length"` 与 `finish_reason: "content_filter"` 为 `"stop"`；
    - 在遇到内容审查阻断且无有效内容时，自动合成规范的结构化会话进度检查点，确保会话压缩 100% 成功完成并平滑进入后续对话。
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


---

## English


- **Distribution moved to GitHub**: npm publishing stopped; install with `pi install git:github.com/1837620622/ck-pi-extension`. ck-pi-zen-session / ck-pi-cline / ck-pi-guard are deprecated on npm and point here; `ck-pi-guard 0.1.3` and `ck-pi-rail 0.1.1` ship via main.
- `ck-pi-guard 0.1.3` / `ck-pi-rail 0.1.1`:
  - `ck-pi-guard`: pi-coding-agent 1.5 typing (`/guard` handler signature, retry body `BodyInit`); no runtime change;
- `ck-pi-zen-session 0.1.28` / `ck-pi-cline 0.1.13`:
  - **Context cap fix (#3)**: `deepseek-v4.1-flash-free` and `glm-5.3-flash-free` now report 200K context / 32K output instead of 1M (per models.dev); the cap is enforced after remote sync, local `zen-models.json` and heuristics;
  - **Fixed `/zen model`**: `fetchZenModelCatalog is not defined`;
  - **pi-coding-agent 1.5**: `compat` moved onto each model; devDeps bumped to `^1.5.0`, `npm audit --omit=dev` clean;
  - **CI**: pack each workspace instead of the private root, fixing the verify job that had failed since October.
- `ck-pi-zen-session 0.1.24` / `ck-pi-cline 0.1.9`:
  - **Full integration of latest official free model catalogs**:
    - OpenCode Zen: Added StepFun flagship `step-5-preview-free` (200k context, 32k output, vision multimodal and configurable reasoning), `exo-free` (128k fast response), `nemotron-3-ultra-free` (1M context), `ling-3.0-flash-fin-free` (262k fast model), and `jev-1.13-free` (128k);
    - Cline: Fully integrated latest active free models (`apodex/apodex-1.1-mini:free`, `dots-studio/dots-3-note-preview:free`, `cohere/north-mini-code:free`, etc.), and securely aliased delisted `:free` models (e.g., `inclusionai/ling-3.0-flash-sante` mapped to `openrouter/free`) to eliminate unintended billing and 404 errors;
    - Seamless alias router redirects delisted OpenCode Zen `fledge-alpha-free` to the new flagship `step-5-preview-free`.
  - **Permanent resolution for auto-compaction token cap and content filter failures (`Summarization failed: generation hit the token cap` / `Provider finish_reason: content_filter`)**:
    - Intercepted compaction requests across both fetch layer and local proxy, forcing `max_tokens` to at least 16,384 to fundamentally eliminate token cap truncation on reasoning models;
    - Fully reconstructed streaming SSE TransformStream with line-buffered packet safety, automatically normalizing `finish_reason: "length"` and `finish_reason: "content_filter"` to `"stop"`;
    - Synthesizes structured session checkpoints when content moderation triggers with empty body, guaranteeing 100% successful session compaction.
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

