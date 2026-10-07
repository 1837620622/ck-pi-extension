# ck-pi-extension

Pi 插件 monorepo：一个 GitHub 仓库，多个彼此独立的 npm 包，用户按需单装。
Monorepo for Pi extensions: one GitHub repository containing independent npm packages. Install only what you need.

| 插件 / Extension | npm 包 / Package | 描述 / Description | 文档 / Docs |
| --- | --- | --- | --- |
| Pi Rail | `ck-pi-rail` | 无表情、自适应满宽状态栏 / Pure-tech adaptive full-width status line | [README](packages/pi-rail/README.md) |
| Pi Redkit | `ck-pi-redkit` | 授权交战条令注入（渗透/逆向） / Authorized rules of engagement injection | [README](packages/pi-redkit/README.md) |
| Pi Zen Session | `ck-pi-zen-session` | OpenCode Zen 免费模型、Responses/Completions 双协议路由与会话自愈 / Zen free-tier models with dual-protocol routing | [README](packages/pi-zen-session/README.md) |
| Pi Cline | `ck-pi-cline` | Cline 官方指纹伪装、21 款零额度模型与本地反向代理 / Cline official fingerprint disguise, 21 zero-cost models & local proxy | [README](packages/pi-cline/README.md) |
| Pi Guard | `ck-pi-guard` | 深度思考后脱机守卫与边缘网关超时拦截重试 (502, 503, 504, 520-525, 533) / Thinking offline sentinel & edge gateway retry | [README](packages/pi-guard/README.md) |

---

## 赞助与支持 / Sponsorship & Support

如果您觉得这些插件提升了您的开发效率，欢迎赞助支持本项目！您的赞助将直接用于持续维护、网络节点验证、逆向协议对齐与新特性的快速迭代。

If you find these extensions helpful and time-saving, consider sponsoring this project. Your support directly funds continuous maintenance, endpoint testing, reverse-engineering protocol alignment, and rapid feature development.

### 赞助渠道 / Sponsorship Channels

- **GitHub Sponsors**: [https://github.com/sponsors/1837620622](https://github.com/sponsors/1837620622)
- **企业赞助与商务合作 / Enterprise & Commercial Sponsorship**:
  - 欢迎 AI 基础设施提供商、代理网关服务商或团队提供赞助。
  - 赞助权益包含：在项目 README 显著位置展示企业 Logo 与链接、优先处理定制化需求与专属问题支持。
  - Sponsors can display their brand logo and link prominently in the project README, receive priority issue response, and request custom protocol optimizations.

---

## 安装方法 / Installation

按需单装，互不顺带 / Install on demand:

```bash
pi install npm:ck-pi-rail        # 状态栏 / Statusline
pi install npm:ck-pi-redkit      # 条令注入 / Security rules of engagement
pi install npm:ck-pi-zen-session # OpenCode Zen 免费模型与会话自动维护 / Zen free models & session refresh
pi install npm:ck-pi-cline       # Cline 官方指纹、21 款零额度模型与本地反代 / Cline free models & proxy
pi install npm:ck-pi-guard       # 深度思考脱机守卫与网关重试 / Thinking sentinel & gateway retry
```

旧合集包 `ck-pi-extension` 已废弃（不再更新），新用户请装上面单包。
Legacy bundle `ck-pi-extension` is deprecated; please install individual packages above.

GitHub 源安装 / Install from GitHub:
```bash
pi install git:github.com/1837620622/ck-pi-extension
```

冲突说明 / Conflict Notice:
`pi-rail` 不要和 `@narumitw/pi-statusline`、`pi-starline`、`pi-zentui` 同时开，它们都会抢同一条页脚。
Do not enable `pi-rail` concurrently with other statusline extensions (`@narumitw/pi-statusline`, `pi-starline`, `pi-zentui`) as they compete for the footer.

---

## 快速开始 / Quick Start

```text
/statusline          状态栏设置菜单（外观 / 信息 / 高级 / 状态 / 帮助）
                     Status line settings (appearance, info, advanced, status, help)

/redkit status       查看条令注入状态 / View rules of engagement status
/redkit full         切换条令模式 (full/pentest/reverse/off) / Switch rules mode

/zen                 无参运行：自动续期降序会话、刷新请求头并全量同步本地配置与运行时
                     Auto-refresh descending session ID and sync configurations
/zen <key>           配置/更新 OpenCode Zen Key，自动探测免费模型、上下文与思考等级
                     Configure Zen key and auto-discover models & thinking levels
/zen status          查看 Zen 会话年龄、请求头保护与模型库状态 / View Zen status
/zen refresh         强制生成全新降序 Session ID 并刷新请求头 / Force new session ID
/zen list            查看所有已激活的 Zen 免费模型规格清单 / View model catalog
/zen add <id> [name] 自定义登记新增的免费模型至本地模型库 / Register custom model
/zen ping [model]    实时探测 Zen 免费模型网络连通性与往返时延 / Test network latency
/zen model <id>      快速切换当前激活的 Zen 模型 / Switch active Zen model

/cline               无参运行：自动拉取远端模型、刷新配置并热重载 Pi 模型库
                     Auto-refresh Cline models and hot-reload registry
/cline <key>         配置/更新 Cline API Key，自动在线探测 21 款零额度模型
                     Configure Cline key and discover 21 zero-cost models
/cline status        查看当前详细运行状态、指纹签名与本地反代状态 / View Cline status
/cline refresh       强制在线拉取远端模型并刷新本地配置 / Force pull remote models
/cline list          查看所有可用免费模型详细规格清单 / View free model catalog
/cline free          查看 21 款零额度模型注册表 / View zero-cost model registry
/cline add <id> [name] 自定义登记新增的零额度免费模型 / Register custom model
/cline ping [model]  实时探测免费模型连通性与网络时延 / Test latency
/cline proxy start   在后台启动本地 OpenAI 兼容反向代理服务 (默认端口 4116)
                     Start local OpenAI-compatible reverse proxy (port 4116)

/guard status        查看思考脱机守卫与网关重试实时指标与熔断状态 / View guard status
/guard reset         重置守卫统计计数与熔断状态 / Reset sentinel statistics
/guard on / off      开启或关闭守卫与网关拦截 / Enable or disable guard
```

---

## 更新日志 / Changelog

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

## 许可证 / License

MIT License，见 [LICENSE](LICENSE)。
