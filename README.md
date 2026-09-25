# ck-pi-extension

Pi 插件 monorepo：一个 GitHub 仓库，多个彼此独立的 npm 包，用户只装自己需要的。

| 插件 | npm 包 | 说明 | 文档 |
| --- | --- | --- | --- |
| Pi Rail | `ck-pi-rail` | 无表情、自适应满宽状态栏 | [README](packages/pi-rail/README.md) |
| Pi Redkit | `ck-pi-redkit` | 授权交战条令注入（渗透/逆向） | [README](packages/pi-redkit/README.md) |
| Pi Zen Session | `ck-pi-zen-session` | OpenCode Zen 免费模型、全套请求头伪装与会话自动轮换 | [README](packages/pi-zen-session/README.md) |

## 安装

按需单装，互不顺带：

```bash
pi install npm:ck-pi-rail        # 只要状态栏
pi install npm:ck-pi-redkit      # 只要条令注入
pi install npm:ck-pi-zen-session # 只要 OpenCode Zen 免费模型与 Session 自动维护
```

旧合集包 `ck-pi-extension` 已废弃（不再更新），新用户请装上面单包。
GitHub 源安装：`pi install git:github.com/1837620622/ck-pi-extension`。

冲突说明：`pi-rail` 不要和 `@narumitw/pi-statusline`、`pi-starline`、`pi-zentui` 同时开，它们都会抢同一条页脚。

## 快速开始

```text
/statusline          状态栏设置菜单（外观 / 信息 / 高级 / 状态 / 帮助）
/redkit status       查看条令注入状态
/redkit full         切换条令模式（full/pentest/reverse/off，即时生效）
/zen <key>           配置 OpenCode Zen API Key 并全量同步 10 款免费模型、全套伪装请求头与降序会话
/zen status          查看 Zen 会话年龄与在线模型状态
/zen refresh         强制生成全新 Session ID 并刷新请求头
/zen list            查看所有已激活的 Zen 免费模型清单
```

## 更新日志

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

## 作者

传康Kk（万能程序员）

- GitHub：[1837620622](https://github.com/1837620622)
- 邮箱：`1837620622@qq.com`
- 微信：`1837620622`

## License

MIT，见 [LICENSE](LICENSE)。
