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
/zen <key>           配置 OpenCode Zen API Key 并全量同步 9 款免费模型、全套伪装请求头与降序会话
/zen status          查看 Zen 会话年龄与在线模型状态
/zen refresh         强制生成全新 Session ID 并刷新请求头
/zen list            查看所有已激活的 Zen 免费模型清单
```

## 更新日志

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
