# ck-pi-extension

Pi 插件 monorepo：一个 GitHub 仓库，多个彼此独立的 npm 包，用户只装自己需要的。

| 插件 | npm 包 | 说明 | 文档 |
| --- | --- | --- | --- |
| Pi Rail | `ck-pi-rail` | 无表情、自适应满宽状态栏 | [README](packages/pi-rail/README.md) |
| Pi Redkit | `ck-pi-redkit` | 授权交战条令注入（渗透/逆向） | [README](packages/pi-redkit/README.md) |
| Pi Zen Session | `ck-pi-zen-session` | OpenCode Zen 免费模型、全套请求头伪装与会话自动轮换 | [README](packages/pi-zen-session/README.md) |
| Pi Cline | `ck-pi-cline` | Cline 官方指纹伪装、21 款零额度模型与本地反向代理 | [README](packages/pi-cline/README.md) |

## 安装

按需单装，互不顺带：

```bash
pi install npm:ck-pi-rail        # 只要状态栏
pi install npm:ck-pi-redkit      # 只要条令注入
pi install npm:ck-pi-zen-session # 只要 OpenCode Zen 免费模型与 Session 自动维护
pi install npm:ck-pi-cline       # 只要 Cline 官方指纹伪装、21 款零额度免费模型与本地反代
```

旧合集包 `ck-pi-extension` 已废弃（不再更新），新用户请装上面单包。
GitHub 源安装：`pi install git:github.com/1837620622/ck-pi-extension`。

冲突说明：`pi-rail` 不要和 `@narumitw/pi-statusline`、`pi-starline`、`pi-zentui` 同时开，它们都会抢同一条页脚。

## 快速开始

```text
/statusline          状态栏设置菜单（外观 / 信息 / 高级 / 状态 / 帮助）
/redkit status       查看条令注入状态
/redkit full         切换条令模式（full/pentest/reverse/off，即时生效）
/zen                 无参运行：自动续期降序会话、刷新请求头并全量同步本地配置与运行时
/zen <key>           配置/更新 OpenCode Zen Key，自动在线探测 9 款免费模型、上下文与思考等级
/zen status          查看 Zen 会话年龄、请求头保护与模型库状态
/zen refresh         强制生成全新降序 Session ID 并刷新请求头
/zen list            查看所有已激活的 Zen 免费模型规格清单（精确上下文、最大输出、思考等级）
/zen ping            实时探测 Zen 免费模型网络连通性与往返时延
/cline               无参运行：自动拉取远端模型、刷新配置并热重载 Pi 模型库
/cline <key>         配置/更新 Cline API Key，自动在线探测 21 款零额度模型、上下文与思考等级
/cline status        查看当前详细运行状态、指纹签名与本地反代状态
/cline refresh       强制在线拉取远端模型并刷新本地配置
/cline list          查看所有 21 款可用免费模型详细规格清单（精确上下文、最大输出、思考等级）
/cline free          查看 21 款零额度模型注册表（含 1M 隐身模型与 2M 代码专精模型）
/cline ping          实时探测免费模型连通性与网络时延
/cline proxy start   在后台启动本地 OpenAI 兼容反向代理服务 (默认端口 4116)
```

## 更新日志

- `ck-pi-cline 0.1.3` / `ck-pi-zen-session 0.1.19` / `ck-pi-rail 0.1.1` / `ck-pi-redkit 0.1.8`：系统级安全与架构深度审计全面加固：
  - **网络与本地代理安全**：强化 DNS Rebinding 防护、严格解析中括号 IPv6 主机头、受信任 CORS 来源白名单校验、SSE 帧缓存 2MB 熔断机制、客户端断开自动取消上游流式传输；
  - **同模型全抖动退避重试**：Fetch 拦截器遭遇 500/502/503/504 及 429 时，执行带 Full Jitter 全抖动的指数退避重试，绝不自动切换备用模型（严格保障模型质量不降级）；
  - **凭据与数据库安全**：`auth.json` 与 `models.json` 目录与文件权限严格限制为 0700 / 0600；CC-Switch SQLite 同步兼容 Node < 22.5.0 并杜绝进程参数凭据暴露；
  - **终端与配置原子落盘**：OSC 8 参数与 ST 终止符完整支持、状态栏配置 CAS 乐观锁防并发覆盖、全工程严格无 Emoji 注入。
- `ck-pi-cline 0.1.1` / `ck-pi-zen-session 0.1.18`：双插件指令体系全面对齐（`/cline` 与 `/zen` 均支持无参自刷新、直接传 Key 识别模型与热重载、`sync`/`refresh`、`list`/`models`/`free`、`ping` 实时探针与 `model` 切换）；双向保全流式推理思考链 CoT（`delta.reasoning` 与 `delta.reasoning_content` 双向写入）；彻底消除历史遗留 Emoji；模型注册与命令执行全链路异常容灾加固。
- `ck-pi-cline 0.1.0`：全新发布！Cline 官方指纹伪装、21 款实测零额度免费模型（含 1M 隐身模型 `stealth/space-bunny-alpha` 与 2M 代码模型 `openrouter/pareto-code`）、本地 OpenAI 兼容反向代理（端口 4116）、Empty Output Guard 空输出死锁防御与自动故障转移。
- `ck-pi-zen-session 0.1.15`：全面深度优化：极速压缩修剪、透明三重重试自愈与多场景护航。
  - **Compaction 标签级深度修剪与极速响应 (`pruneZenContext`)**：深度定位 Pi 在执行 `/compact` 或自动压缩时将历史封装在单条 `<conversation>` 消息的底层机制。当累积超 100K 字符时，保留首尾关键任务与执行结果，修剪中间冗长过程并完整缝合 XML，压缩时间从 142s 直降至 8~10s，彻底根除 Cloudflare 超时与 `Connection error` 断连；
  - **Tool 巨型输出截断**：单个 Tool 命令（如超长 bash 输出、cat 巨大日志）截断在 25,000 字符内，杜绝撑爆上下文；
  - **底层透明三重重试循环 (Transparent Retry Loop)**：Fetch 拦截器内嵌自动重试：遇 401/403 自动轮换新降序 Session 并重试；遇 502/503/504/524 或网络临时异常自动退避重试，Pi 业务层无感且直接接收 200 OK，告别中断与报错；
  - **新开对话与会话轮换新鲜度保障**：主动续期阈值优化至 25 分钟，彻底避免踩中 30 分钟硬过期边界；自动规范非法会话 ID 为 `ses_` 降序格式；
  - **10 款官方免费模型完整对齐**：新增上线确认的 `space-bunny-free`（200K 上下文，支持视觉与深度思考）；
  - **反序列化支持思考推理 (`reasoning_content`)**：SSE-to-JSON 汇聚引擎完整输出思考内容，完美兼容离线总结与非流式调用。
- `ck-pi-zen-session 0.1.14`：会话压缩 403 根治与 SSE-to-JSON 汇聚反序列化、递归死循环与调用栈溢出根治。针对 OpenCode Zen 免费端点拒绝非流式请求（报 403 `FreeTierError`）的硬限制，在底层 Fetch 拦截器中将 Pi 压缩请求转译为 `stream: true` 与 `tool_choice: "none"`，并通过 `assembleSseToChatCompletionResponse` 透明聚合还原为标准 OpenAI ChatCompletion JSON 响应；严格限定仅拦截 `chat/completions` 切断死循环（彻底根除 `RangeError: Maximum call stack size exceeded`）；引入单例锁与 30 秒防抖控制消灭并发风暴；支持 `Request` 对象原生保留所有请求头；新增 Compaction Context Guard，智能修剪超长历史防止会话压缩时网关连接断开 (`Connection error`)。
- `ck-pi-zen-session 0.1.13`：全局 Fetch 守卫与会话压缩（Compaction/Summarization）403 根治防御。拦截 Pi 绕过 Agent 生命周期直接发起的纯文本摘要请求，自动注入官方 6 大核心工具链、毫秒级降序 Session ID 与升序 Request ID，对齐 `stream_options`，彻底根除 `403 FreeTierError`。
- `ck-pi-zen-session 0.1.11`：OpenAI 兼容协议全面净化与非思考模型智能防御。针对 `jev-1.13-free` 等非思考模型自动剔除 `reasoning_effort`，并彻底清除任何非法顶层 `thinking` 冗余字段；全链路对齐 `@ai-sdk/openai-compatible` 官方规范。
- `ck-pi-zen-session 0.1.10`：远端网关健康感知守卫升级。实时感知上游 502/503/504 等端点离线与维护状态并发出友好通知，阻断死循环；进一步优化 Session 自动轮换与全系 9 款免费模型稳定性。
- `ck-pi-zen-session 0.1.9`：彻底根除 `[400] Invalid request parameters`。将思考档位映射与请求拦截守卫严格对齐 OpenAI 标准（`low`/`medium`/`high`），自动安全规约 `max` / `xhigh` / `minimal` 档位，确保小米 MiMo、英伟达 Nemotron 等全系免费模型在 Pi 默认思考模式下 100% 稳定高频可用。
- `ck-pi-zen-session 0.1.7`：高精智能模型能力与参数解析引擎，在线自动探测任意新免费模型与上下文窗口/输出/思考等级。
- `ck-pi-zen-session 0.1.2`：深度对齐 OpenCode 官方请求体结构，补齐官方全套 6 大核心工具链守卫、工具字母序严格升序重排规约、`stream_options` 用量元数据与 7 维全套伪装请求头（含 `x-opencode-project`）。
- `ck-pi-rail 0.1.0` / `ck-pi-redkit 0.1.0`：monorepo 拆分首发，各自独立版本与依赖。
- 旧合集包 `ck-pi-extension 0.1.1`：自适应导轨、主题跟随、无表情、安全加固。
## License

MIT，见 [LICENSE](LICENSE)。
