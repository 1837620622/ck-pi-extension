# ck-pi-extension

Pi 插件合集。以后新插件都发这个仓库。

**当前只发布一个：`pi-rail`（状态栏）**

无表情、不依赖 Nerd Font / Emoji 字体。用系统自带字形 + ANSI 色块，
宽度跟着终端走：全屏铺满，缩窗口先压弹性段、再丢次要段，右侧状态不挤占核心信息。

## 安装

官方插件库（npm，`pi.dev/packages` 会索引带 `pi-package` 的包）：

```bash
pi install npm:ck-pi-extension
```

GitHub：

```bash
pi install git:github.com/1837620622/ck-pi-extension
```

不要和 `@narumitw/pi-statusline`、`pi-starline`、`pi-zentui` 同时开，它们都会抢页脚。

## pi-rail 做什么

- 单行底栏（默认全量）：品牌、供应商、模型、thinking、目录、分支、工具、上下文、吞吐、缓存、费用、时间、轮次
- 段间用 `›` 箭头在导轨底色上切开，git 超前/落后恢复 `↑↓` 箭头
- 右侧放 TPS / MCP 等扩展状态（纯文字，`·` 连接）
- 左簇 + 导轨填充 + 右簇逐行精确铺满终端宽度
- 缩窄时三档自适应：弹性段压缩（目录/模型/分支）→ 按优先级丢段 → 右簇让位
- 跟随 Pi 主题明暗自动换底色（浅色主题用浅灰导轨，不出现“黑腰带”）
- 无真彩终端自动降级 256 色；上游插件的 Emoji 一律过滤
- 配置文件：`~/.pi/agent/ck-pi-rail.json`
- 命令：`/statusline`

## 终端兼容

| 终端 | 真彩 | 降级 | 字形 |
| --- | --- | --- | --- |
| Ghostty / Kitty / WezTerm / Alacritty | ✅ | — | ✅ |
| iTerm2 | ✅ | — | ✅ |
| Terminal.app（macOS 26 Tahoe+） | ✅ | — | ✅ |
| Terminal.app（旧版） | ❌ | 256 色自动降级 | ✅ |
| Windows Terminal / VS Code 集成终端 | ✅ | — | ✅ |
| tmux / screen（透传开启时） | ✅ | 否则 256 色 | ✅ |
| Linux 控制台 | ❌ | 16 色近似显示 | ✅（纯 ASCII + 制表符） |

只用各家等宽字体标配字形：`┃ │ · • … ↑ ↓ π ^ v`，不需 Nerd Font，不需 Emoji 字体。
CJK 宽字符按终端列宽截断，中英文混排不对齐错位。

## 以后加插件

把新包放到 `packages/<name>/`，再把入口写进根目录 `package.json` 的 `pi.extensions`。

## 作者

传康Kk（万能程序员）

- GitHub：[1837620622](https://github.com/1837620622)（仓库：`1837620622/ck-pi-extension`）
- 邮箱：`1837620622@qq.com`
- 微信：`1837620622`

## License

MIT。状态栏实现基于 `@narumitw/pi-statusline`（MIT），已去掉表情并改成自适应满宽布局。
