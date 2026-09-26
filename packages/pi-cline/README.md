# ck-pi-cline

> **Cline Account / API 免费模型管理、官方指纹伪装与本地反向代理插件 (for Pi Coding Agent)**

---

## 🌟 核心特性

- **官方 8 大指纹伪装**：自动注入 `User-Agent: Cline/4.1.16`、`x-client-version`、`x-client-type: cline-vscode`、`http-referer` 等，完美突破 Cline 网关防盗刷校验。
- **免费模型自动反代**：内置 OpenAI 兼容的本地反代服务器 (`/cline proxy start`)，提供标准 `/v1/chat/completions` 与 `/v1/models`，可直接对接 CC-Switch、Cursor、Cherry Studio 等任何客户端。
- **12+ 款免费模型开箱即用**：收录 `inclusionai/ling-3.0-flash-fin:free`、`nvidia/nemotron-3-ultra-550b-a55b:free`、`openrouter/free` 等 100% 零额度模型。
- **双向无缝同步**：一键自动探测远端模型并写入 `~/.pi/agent/models.json`、`~/.pi/agent/auth.json` 与 CC-Switch 本地 SQLite 数据库。
- **全链路上下文超限防护**：自动拦截截断海量 Tool 日志并压缩 `<conversation>`、`<previous-summary>` 标签，彻底避免切换模型时的 400 Context Length Exceeded。

---

## 🚀 常用命令

在 Pi 终端中直接运行：

| 命令 | 说明 |
| :--- | :--- |
| `/cline` | 查看当前连接状态、API Key、本地反代状态与免费模型概览 |
| `/cline free` | 列出全部可用免费模型的上下文上限与推理能力卡片 |
| `/cline sync` | 立即在线探测远端模型并同步写入 `models.json` 与 CC-Switch |
| `/cline model <ID>` | 快速切换当前会话至指定的 Cline 模型 |
| `/cline key <KEY>` | 更新并持久化存储 Cline API Key |
| `/cline proxy start [端口]` | 启动本地 OpenAI 兼容反向代理服务 (默认端口 4116) |
| `/cline proxy stop` | 停止本地反代服务器 |

---

## 🛠️ 本地反向代理说明

启动反代后：
```bash
/cline proxy start 4116
```
即可在任意第三方软件中配置：
- **Base URL**: `http://127.0.0.1:4116/v1`
- **API Key**: 任意填写（反代服务已自动内置官方认证与伪装标头）
- **模型**: 直接调用 `inclusionai/ling-3.0-flash-fin:free`、`openrouter/free` 等。
