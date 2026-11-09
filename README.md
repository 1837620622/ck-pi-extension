# ck-pi-extension

<p align="center">
  <a href="#中文">中文</a> · <a href="#english">English</a>
</p>

<p align="center">
  <a href="https://github.com/1837620622/ck-pi-extension"><img alt="Pi" src="https://img.shields.io/badge/Pi-%E2%89%A51.5-000000"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue"></a>
  <img alt="Distribution: GitHub" src="https://img.shields.io/badge/install-git%3Agithub-181717?logo=github">
</p>

---

<a id="中文"></a>

**[Pi](https://pi.dev) 插件合集。** 一个仓库收录五个独立插件，一条命令装齐，单个插件可在 `pi config` 里按需开关。本仓库通过 **GitHub 分发**，已停止向 npm 发布。

## 插件一览

| 插件 | 作用 | 一键安装 | 文档 |
| --- | --- | :---: | --- |
| **Pi Zen Session** | OpenCode Zen 免费模型接入；Completions / Responses 双协议路由；会话自愈 | ✅ | [README](packages/pi-zen-session/README.md) |
| **Pi Cline** | Cline 官方指纹伪装；17 款零额度模型；本地反向代理 | ✅ | [README](packages/pi-cline/README.md) |
| **Pi Guard** | 深度思考脱机守卫；边缘网关超时拦截重试（502/503/504/520–525/533） | ✅ | [README](packages/pi-guard/README.md) |
| **Pi Rail** | 无表情、自适应满宽状态栏 | ✅ | [README](packages/pi-rail/README.md) |
| **Pi Redkit** | 授权交战条令注入（渗透 / 逆向） | — | [README](packages/pi-redkit/README.md) |

> Redkit 不在一键安装内，需要时单独按本地路径装（见下）。

## 环境要求

- Pi（`@earendil-works/pi-coding-agent`）**≥ 1.5**
- Node.js **≥ 20**
- 安装过程需要 `git` 与网络（`pi install git:` 走 `git clone`）

## 安装

```bash
# 装齐 zen-session、cline、guard、rail（不含 redkit）
pi install git:github.com/1837620622/ck-pi-extension

# 升级到 main 最新提交
pi update --extensions

# 固定到某个 tag 或 commit（固定后不随 pi update 变动）
pi install git:github.com/1837620622/ck-pi-extension@<tag-或-commit>
```

装完用 `pi config` 开关各插件，`pi list` 查看已装来源。

**单独安装 Redkit**（仅在需要授权渗透 / 逆向场景时）：

```bash
git clone https://github.com/1837620622/ck-pi-extension
pi install ./ck-pi-extension/packages/pi-redkit
```

> **迁移提示**：旧的 npm 包 `ck-pi-zen-session` / `ck-pi-cline` / `ck-pi-guard` 已标记 deprecated 并指向本仓库。已装 npm 版的用户先 `pi remove npm:<包名>`，再按上面的 git 方式重装。

## 冲突说明

`pi-rail` 会独占页脚状态栏，**不要**与 `@narumitw/pi-statusline`、`pi-starline`、`pi-zentui` 等其他状态栏插件同时开启。

## 命令速查

<details>
<summary><b>Zen Session</b> — <code>/zen</code></summary>

```text
/zen                 自动续期降序会话、刷新请求头、全量同步本地配置与运行态
/zen <key>           配置 / 更新 OpenCode Zen Key，自动探测免费模型、上下文与思考等级
/zen status          查看会话年龄、请求头保护与模型库状态
/zen refresh         强制生成全新降序 Session ID 并刷新请求头
/zen list            查看所有已激活的免费模型规格
/zen add <id> [name] 登记自定义免费模型到本地模型库
/zen ping [model]    探测免费模型连通性与往返时延
/zen model <id>      切换当前激活模型
```
</details>

<details>
<summary><b>Cline</b> — <code>/cline</code></summary>

```text
/cline               自动拉取远端模型、刷新配置并热重载模型库
/cline <key>         配置 / 更新 Cline API Key，在线探测 17 款零额度模型
/cline status        查看运行状态、指纹签名与本地反代状态
/cline refresh       强制在线拉取远端模型并刷新本地配置
/cline list          查看可用免费模型规格
/cline free          查看 17 款零额度模型注册表
/cline add <id> [name] 登记自定义零额度模型
/cline ping [model]  探测免费模型连通性与网络时延
/cline proxy start   后台启动本地 OpenAI 兼容反向代理（默认端口 4116）
```
</details>

<details>
<summary><b>Guard</b> — <code>/guard</code></summary>

```text
/guard status        查看脱机守卫与网关重试指标、熔断状态
/guard reset         重置统计计数与熔断状态
/guard on / off      开启 / 关闭守卫与网关拦截
```
</details>

<details>
<summary><b>Rail</b> — <code>/statusline</code></summary>

```text
/statusline          状态栏设置菜单（外观 / 信息 / 高级 / 状态 / 帮助）
```
</details>

<details>
<summary><b>Redkit</b> — <code>/redkit</code></summary>

```text
/redkit status       查看条令注入状态
/redkit full         切换条令模式（full / pentest / reverse / off）
```
</details>

## 本地开发

```bash
git clone https://github.com/1837620622/ck-pi-extension && cd ck-pi-extension
npm install
npm run typecheck      # 严格类型检查（src + 测试）
npm test               # 全部单测
npm run manifest:check # 校验根 pi.extensions 入口文件存在
```

本仓库为 npm workspaces，每个子包都是独立 Pi 包。CI 在每次推送跑上面四项。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。近期要点：

- **分发改为 GitHub**：停止 npm 发布，安装统一走 `pi install git:github.com/1837620622/ck-pi-extension`；npm 上的三个旧包已 deprecated 指向本仓库。
- **`ck-pi-guard` / `ck-pi-rail`**：适配 pi-coding-agent 1.5 类型，运行时行为不变。
- **`ck-pi-zen-session` / `ck-pi-cline`**：修正 `deepseek-v4.1-flash-free`、`glm-5.3-flash-free` 上下文上限（1M → 200K / 32K，依据 models.dev）；修复 `/zen model` 报错；适配 pi-coding-agent 1.5。

## 赞助

如果这些插件为你省了时间，欢迎赞助，直接用于持续维护、节点验证与协议对齐：

- **GitHub Sponsors** — <https://github.com/sponsors/1837620622>
- **企业 / 商务合作** — 面向 AI 基础设施、代理网关服务商与团队；权益含 README 展示位、优先问题响应与定制协议优化。

## 许可证

[MIT](LICENSE)。

---

<a id="english"></a>

# ck-pi-extension (English)

<p align="center">
  <a href="#中文">中文</a> · <a href="#english">English</a>
</p>

**A collection of [Pi](https://pi.dev) extensions.** One repository, five independent extensions, one command to install them all; toggle each in `pi config`. Distributed from **GitHub** — npm publishing has stopped.

## Extensions

| Extension | What it does | One-command install | Docs |
| --- | --- | :---: | --- |
| **Pi Zen Session** | OpenCode Zen free models; dual-protocol routing (Completions / Responses); session self-healing | ✅ | [README](packages/pi-zen-session/README.md) |
| **Pi Cline** | Cline official fingerprint disguise; 17 zero-cost models; local reverse proxy | ✅ | [README](packages/pi-cline/README.md) |
| **Pi Guard** | Thinking offline sentinel; edge gateway retry (502/503/504/520–525/533) | ✅ | [README](packages/pi-guard/README.md) |
| **Pi Rail** | Emoji-free, adaptive full-width status line | ✅ | [README](packages/pi-rail/README.md) |
| **Pi Redkit** | Authorized rules-of-engagement injection (pentest / reverse) | — | [README](packages/pi-redkit/README.md) |

> Redkit is excluded from the one-command install; install it by local path when needed (below).

## Requirements

- Pi (`@earendil-works/pi-coding-agent`) **≥ 1.5**
- Node.js **≥ 20**
- `git` and network access at install time (`pi install git:` runs `git clone`)

## Install

```bash
# Installs zen-session, cline, guard, rail (not redkit)
pi install git:github.com/1837620622/ck-pi-extension

# Update to the latest main commit
pi update --extensions

# Pin to a tag or commit (pinned installs are skipped by pi update)
pi install git:github.com/1837620622/ck-pi-extension@<tag-or-commit>
```

After installing, toggle extensions with `pi config`; `pi list` shows installed sources.

**Install Redkit separately** (only for authorized pentest / reverse work):

```bash
git clone https://github.com/1837620622/ck-pi-extension
pi install ./ck-pi-extension/packages/pi-redkit
```

> **Migrating:** the old npm packages `ck-pi-zen-session` / `ck-pi-cline` / `ck-pi-guard` are deprecated and point here. If you installed from npm, run `pi remove npm:<name>` first, then reinstall via git above.

## Conflict notice

`pi-rail` takes over the footer status line. **Do not** enable it alongside other status-line extensions (`@narumitw/pi-statusline`, `pi-starline`, `pi-zentui`), which compete for the same line.

## Command reference

<details>
<summary><b>Zen Session</b> — <code>/zen</code></summary>

```text
/zen                 Auto-refresh descending session ID, rotate headers, sync local config & runtime
/zen <key>           Configure / update the OpenCode Zen key; discover free models, context & reasoning
/zen status          Session age, header protection, and model-catalog status
/zen refresh         Force a new descending session ID and refresh headers
/zen list            List all activated free models
/zen add <id> [name] Register a custom free model into the local catalog
/zen ping [model]    Probe free-model latency and round-trip time
/zen model <id>      Switch the active model
```
</details>

<details>
<summary><b>Cline</b> — <code>/cline</code></summary>

```text
/cline               Pull remote models, refresh config, hot-reload the registry
/cline <key>         Configure / update the Cline API key; discover 17 zero-cost models
/cline status        Status, fingerprint signature, and local proxy state
/cline refresh       Force-pull remote models and refresh local config
/cline list          List available free models
/cline free          Show the 17 zero-cost model registry
/cline add <id> [name] Register a custom zero-cost model
/cline ping [model]  Probe free-model connectivity and latency
/cline proxy start   Start a local OpenAI-compatible reverse proxy (default port 4116)
```
</details>

<details>
<summary><b>Guard</b> — <code>/guard</code></summary>

```text
/guard status        Sentinel & gateway-retry metrics and circuit-breaker state
/guard reset         Reset counters and circuit-breaker state
/guard on / off      Enable / disable the guard and gateway interceptor
```
</details>

<details>
<summary><b>Rail</b> — <code>/statusline</code></summary>

```text
/statusline          Status-line settings (appearance / info / advanced / status / help)
```
</details>

<details>
<summary><b>Redkit</b> — <code>/redkit</code></summary>

```text
/redkit status       View rules-of-engagement injection status
/redkit full         Switch mode (full / pentest / reverse / off)
```
</details>

## Local development

```bash
git clone https://github.com/1837620622/ck-pi-extension && cd ck-pi-extension
npm install
npm run typecheck      # strict type check (src + tests)
npm test               # all unit tests
npm run manifest:check # verify root pi.extensions entry files exist
```

The repo is an npm workspace; each package is a standalone Pi package. CI runs all four on every push.

## Changelog

See [CHANGELOG.md](CHANGELOG.md). Recent highlights:

- **Distribution moved to GitHub**: npm publishing stopped; install via `pi install git:github.com/1837620622/ck-pi-extension`. The three old npm packages are deprecated and point here.
- **`ck-pi-guard` / `ck-pi-rail`**: adapted to pi-coding-agent 1.5 typings; no runtime change.
- **`ck-pi-zen-session` / `ck-pi-cline`**: corrected context caps for `deepseek-v4.1-flash-free` and `glm-5.3-flash-free` (1M → 200K / 32K, per models.dev); fixed `/zen model`; adapted to pi-coding-agent 1.5.

## Sponsorship

If these extensions save you time, consider sponsoring — it funds maintenance, endpoint testing, and protocol alignment:

- **GitHub Sponsors** — <https://github.com/sponsors/1837620622>
- **Enterprise / commercial** — for AI-infrastructure and proxy-gateway providers and teams; benefits include a README placement, priority issue response, and custom protocol optimizations.

## License

[MIT](LICENSE).
