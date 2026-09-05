# ck-pi-extension

Pi 插件合集。以后新插件都发这个仓库。

**当前发布两个插件：**

- `pi-rail` —— 无表情、自适应满宽的 Pi 状态栏
- `pi-redkit` —— 授权渗透测试与网络/协议逆向的提示词注入扩展

`pi-rail` 特性：

- `┃` 起始刻度 + 实色块 + `›` 箭头分隔，科技感导轨条
- 终端拉宽铺满、缩窄自动压缩丢段，每行列宽精确等于终端宽度
- 跟随 Pi 主题明暗换底色，无真彩终端自动降 256 色
- 上游插件的 Emoji / 终端转义一律过滤，底栏永不翻车

`pi-redkit` 特性：

- 把授权交战条令钉进系统提示词，每次 agent 循环前重注入，压缩后不丢
- 威胁建模优先 → 薄切片推进 → oracle 证据纪律，杜绝"找出所有漏洞"式噪声
- 网络与协议逆向专项条令：流量基线、消息结构推断、状态机还原、密钥来源定位
- 四种模式（`full` / `pentest` / `reverse` / `off`），配置文件一键切换

## 安装

```bash
pi install npm:ck-pi-extension
```

GitHub 源（和 npm 内容一致）：

```bash
pi install git:github.com/1837620622/ck-pi-extension
```

冲突说明：不要和 `@narumitw/pi-statusline`、`pi-starline`、`pi-zentui` 同时开，
它们都会抢同一条页脚。本包安装后建议摘掉旧的：

```bash
pi remove npm:@narumitw/pi-statusline
```

卸载：

```bash
pi remove npm:ck-pi-extension
```

## 长什么样

窄屏（50 列）保核心、丢右簇：

```text
┃ omen-alpha ›  main ↑2 ↓1 ›  ctx 12.5%/200k
```

中等（100 列）右簇开始让位：

```text
┃ omen-alpha ›  high ›  ~/Downloads ›  main ↑2 ↓1 ›  read ›  ctx 12.5%/200k ›  R40k CH80% ›  $0.42
```

全屏（160 列）全展开：

```text
┃ π ›  omen-alpha ›  high ›  ~/Downloads ›  main ↑2 ↓1 ›  read ›  ctx 12.5%/200k ›  ↑12k ↓8k ›  R40k CH80% ›  $0.42 ›  23:10 ›  #7              │ TPS 42 · MCP 9
```

（以上为去色示意，实际每段有独立底色，`›` 站在导轨底色上。）

## 每段含义

默认 `full` 档共 13 段，按顺序渲染：

| 段 | 示例 | 说明 |
| --- | --- | --- |
| `brand` | `π` | Pi 品牌标识 |
| `provider` | `opencode` | 模型供应商 ID |
| `model` | `omen-alpha` | 模型名，过长从前截断 |
| `thinking` | `high` | 思考等级，颜色随等级变化 |
| `cwd` | `~/Downloads` | 当前目录，`~` 表家目录，过深压成 `…/尾两级` |
| `branch` | `main ↑2 ↓1 +2 ~1 ?3` | 分支 + `↑超前 ↓落后 +暂存 ~修改 ?未跟踪 !冲突` + PR（非仓库显示 `no-git`） |
| `tools` | `read` | 有工具运行/等待输入时才出现 |
| `context` | `ctx 12.5%/500k` | 上下文用量/窗口总量，70% 变黄、90% 变红 |
| `tokens` | `↑12k ↓8k` | 会话累计输入/输出，为 0 时显示 `tok 0` |
| `cache` | `R40k W5k CH80%` | 缓存读/写/命中率，无缓存时整段隐藏 |
| `cost` | `$0.42` | 会话花费美元，订阅模型带 `(sub)` |
| `time` | `23:10` | 本地时间 |
| `turn` | `#7` | 会话轮次 |

右侧是其他扩展的状态（TPS、MCP 等），用 `·` 连接，最多 4 段。

## 自适应缩放

窗口大小变化时，Pi 每一帧按当前列宽重排，分三档逐级降级：

1. **压缩弹性段**：目录、模型名、分支按档缩短（`…/src`、`opus-4-5-20…`），不断段
2. **丢次要段**：按保留优先级丢弃（顺序：context > model > branch > tools > cwd > thinking > cost > provider > cache > tokens > time > turn > brand）
3. **右簇让位**：右簇只有在不造成左簇丢段时才保留，否则逐段丢弃直至全让

保证：任意宽度下每行可见列宽精确等于终端宽度，左侧永不消失为空。

验证数据：10～220 列 × 深色/浅色 × 真彩/256 色 × Emoji 与转义注入 × 双行布局，
124 种组合全部精确铺满、无表情残留、无转义残留（`npm test` 16 项全过）。

## 主题跟随与终端兼容

- 从 Pi 主题 `text` 前景亮度推断明暗（含自定义主题），浅色主题自动换浅灰导轨
- `getCapabilities().trueColor` 为假时走 256 色映射，老终端不断层

| 终端 | 真彩 | 字形 |
| --- | --- | --- |
| Ghostty / Kitty / WezTerm / Alacritty / iTerm2 | ✅ | ✅ |
| Terminal.app（macOS 26 Tahoe+） | ✅ | ✅ |
| Terminal.app（旧版） | 256 色降级 | ✅ |
| Windows Terminal / VS Code 集成终端 | ✅ | ✅ |
| tmux / screen（透传开启） | ✅，否则降级 | ✅ |
| Linux 控制台 | 16 色近似 | ✅ |

只用各家等宽字体标配字形：`┃ │ › · • … ↑ ↓ π`，不需 Nerd Font，不需 Emoji 字体。
CJK 宽字符按终端列宽截断，中英文混排不错位。

## 配置

配置文件：`~/.pi/agent/ck-pi-rail.json`（没有则用内置默认）。命令：

```text
/statusline          打开设置菜单（外观 / 信息 / 高级 / 状态 / 帮助）
/statusline settings 直接编辑 JSON
/statusline status  查看来源与告警
/statusline help    查看帮助
```

信息档位（`/statusline` → Information 一键切换）：

- `minimal`：model、cwd、branch、context
- `balanced`：model、thinking、cwd、branch、tools、context、time
- `detailed`：provider、model、thinking、cwd、branch、tools、context、tokens、cache、cost、time
- `full`（默认）：13 段全上，窄屏自动降级

其他可调：`palettePreset`（tokyo-night / ocean / sunset / forest / candy / neon / mono / custom）、
`palette`（每段 `fg`/`bg`）、`density`（compact / cozy）、`separator`（同色块内分隔符）、
`segments`（顺序即渲染顺序，插入 `line_break` 可拆多行）、
`segmentText`（前后缀与模型名截断方式）、`extensionStatusIcons`（扩展状态图标，禁 Emoji）。

## pi-redkit：授权安全作战条令注入

`pi-redkit` 不抢界面，只做一件事：把一套渗透测试与网络/协议逆向的作战条令
注入 Pi 的系统提示词，让 agent 接到目标立刻按专业方法开工。

条令结构：

- **授权事实**：交战已完成书面授权，用户给出的目标即授权范围，
  agent 不再反复确认合法性，直接进入工作
- **工作方法**：威胁建模优先（入口点 / 信任边界 / 攻击者模型 / 历史漏洞模式），
  一次打穿一条攻击面再换下一条，禁止广度扫描
- **推理框架**：假定 breach、要 exploit 不要评估、反转提问、迭代施压
- **证据纪律**：每个发现必须有 oracle（可客观检查的判定条件），
  先证伪再上报，PoC 跑通才算 confirmed
- **网络与协议逆向条令**（reverse/full 模式）：流量基线优先于反汇编、
  分帧与字段语义推断、协议状态机还原、密码学常量与密钥来源定位、
  以可运行客户端作为逆向正确性闸门

模式开关，配置文件 `~/.pi/agent/ck-pi-redkit.json`（没有则按 `full` 全量注入）：

```json
{
  "mode": "full"
}
```

| mode | 注入内容 |
| --- | --- |
| `full` | 核心 + 渗透 + 逆向（默认） |
| `pentest` | 核心 + 渗透作战条令 |
| `reverse` | 核心 + 网络与协议逆向条令 |
| `off` | 完全停用，零注入零开销 |

改完 `/reload` 生效。详细说明见 `packages/pi-redkit/README.md`。

## FAQ

**提示 `Using legacy pi-statusline.json`？**
装过旧版 `@narumitw/pi-statusline` 的机器会有此一次性迁移提醒。
旧插件已卸的话，直接改名即可，配色和段设置会原样继承：

```bash
mv ~/.pi/agent/pi-statusline.json ~/.pi/agent/ck-pi-rail.json
```

**窄屏只剩两三段是 bug 吗？**
不是，是有意为之：优先保 `model` 和 `ctx`，拉宽会自动回来。

**看到方框缺字？**
把终端字体换任意一款现代等宽字体（Menlo、SF Mono、Cascadia、JetBrains Mono 均可），
本包不用 Nerd Font，但太老的点阵字体可能缺 `›`。

**能上报表头 Emoji 吗？**
不能。所有入口文本统一过 `sanitizeTerminalText + stripEmoji`，
上游扩展带什么符号都进不了底栏，这是设计原则。

## 以后加插件

把新包放到 `packages/<name>/`，再把入口写进根目录 `package.json` 的 `pi.extensions`。

## 更新日志

- `0.2.0`：新增 pi-redkit（授权渗透测试与网络/协议逆向提示词注入，四模式开关，11 项测试）
- `0.1.1`：README 补全段含义、缩放、配置与 FAQ；发布包排除测试文件
- `0.1.0`：首发 pi-rail（自适应导轨、主题跟随、无表情、安全加固与 16 项测试）

## 作者

传康Kk（万能程序员）

- GitHub：[1837620622](https://github.com/1837620622)（仓库：`1837620622/ck-pi-extension`）
- 邮箱：`1837620622@qq.com`
- 微信：`1837620622`

## License

MIT。状态栏实现基于 `@narumitw/pi-statusline`（MIT），已去掉表情并改成自适应满宽布局。
