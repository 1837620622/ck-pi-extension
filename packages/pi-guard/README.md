# ck-pi-guard

Pi Coding Agent 智能续行守护与边缘网关重试扩展（Thinking Sentinel & Edge Gateway Retry Guard）。

专门解决两类导致 Pi 长时间自主任务意外中断的高频痛点：
1. **推理模型思考后脱机中断**：DeepSeek-V4.1-Flash、DeepSeek-R1、Qwen-Thinking 等深度思考模型在完成 `<think>` 内部推理后，偶发直接向客户端发射 `finish_reason: "stop"`，未输出可见文本且未发射工具调用，导致 Pi 核心循环误判为交付完成而挂起。
2. **边缘网关与中转握手瞬态异常**：在调用中转站、OpenAI 兼容反代或 Cloudflare 保护的 API 节点时，遭遇 `502`、`503`、`504`、`520`、`521`、`522`、`523`、`524`、`525`、`533` 等边缘超时与连接中断。

---

## 核心功能与工作原理

### 1. 深度思考后脱机守卫（Auto-Continuation Sentinel）

#### 问题现象
在执行复杂渗透测试、逆向工程或代码重构时，模型在思考块中得出了下一步执行计划（例如输出了 `"GO! Let me check that endpoint! GO!"`），但在关闭 `<think>` 标签后直接发送了 `stop` 结束符。此时输出数据呈现为：
- `thinking`: 完整深度思考内容（包含结构化块与嵌入正文的 `<think>...</think>` 标签）
- `text`: 0 字符（无可见回复）
- `tool_calls`: 0 个（未调用任何工具）
- `stopReason`: `"stop"`

Pi 原生内核收到该消息后，判定助手本轮已正常交代完毕，将控制权交还终端 Prompt，导致用户必须手动输入“继续”才能唤醒。

#### 守卫机制
- **全格式思考与内嵌标签剥离**：不仅识别原生 `type: "thinking"` 结构块，还能自动从文本块中解析并剥离 `<think>...</think>`、`<thought>`、`<reasoning>` 标签与顶层 `reasoning_content`，杜绝因中转格式差异导致的漏判；
- **多协议 ToolCall 深度兼容**：原生兼容 `toolCall`、`tool_use`、`tool_call`、`function` 以及消息顶层 `tool_calls` 结构；
- **严格遵循 Pi 调度契约**：常驻监听 `turn_end` 与 `agent_end`，通过 `{ deliverAs: "followUp" }` 消息队列平滑驱动下一轮自主执行，杜绝内核 Boundary 异常；
- **全生命周期防污染隔离**：监听 `before_agent_start`、`session_start` 与真实用户输入，自动重置连续脱机计数，彻底防止跨任务误触发熔断。

#### 安全边界与防死循环设计
- **用户主动中止绝对不碰**：当用户按下 `Ctrl+C`、Esc 或输入取消指令时（`stopReason === "aborted"` 或 `ctx.signal.aborted`），守卫立即退出，绝不阻拦用户的取消操作；
- **业务报错绝对不碰**：当上游返回鉴权错误或系统异常（`stopReason === "error"`）时，交由系统原生机制处理；
- **正常回答 0 介入**：只要模型产生了哪怕一个字的可见文本回复，或调用了任何工具，守卫立即重置计数，不发生任何额外动作；
- **连续 3 次熔断保护**：若模型因逻辑死锁连续 3 次仅思考不输出动作，自动触发熔断暂停并友好通知用户，彻底杜绝死循环。

---

### 2. 边缘网关状态码拦截重试（Edge Gateway Fetch Retry）

#### 支持捕获的网关异常状态码
- **502 Bad Gateway**：反向代理上游崩溃或 Pod 瞬态重启；
- **503 Service Unavailable**：网关过载排队或服务冷启动（支持读取 `Retry-After` 标头）；
- **504 Gateway Timeout**：上游网关连接或计算超时；
- **520 Web Server Returned an Unknown Error**：源站返回未知异常；
- **521 Web Server Is Down**：源站服务器宕机无法响应；
- **522 Connection Timed Out**：Cloudflare 连接目标源站超时；
- **523 Origin Is Unreachable**：Cloudflare 源站临时路由不可达；
- **524 A Timeout Occurred**：Cloudflare 与源站 100 秒响应超时；
- **525 SSL Handshake Failed**：Cloudflare 与源站 TLS 握手瞬态超时；
- **533 Gateway Route / Connection Reset**：边缘节点连接重置或路由异常；
- **网络底层瞬断**：`ECONNRESET`、`ETIMEDOUT`、`fetch failed` 等网络抖动。

#### 与 Pi 原生 retry (settings.retry) 的职责隔离
本插件严格遵循**分层解耦**原则，绝不与 Pi 内核自带的重试逻辑重合或冲突：

| 维度 | Pi 原生重试 (`settings.retry`) | `ck-pi-guard` 网关重试 |
| :--- | :--- | :--- |
| **所在层次** | Agent 会话层（Session & Message Layer） | HTTP 传输与网关层（Transport & Gateway Layer） |
| **处理对象** | 已经成功解析为 AssistantMessage 的**业务级错误**（如 `429 Too Many Requests` 限流、模型暂时过载） | 中间件或 Cloudflare 在 HTTP 阶段直接丢弃连接或超时的**网关层原始响应**（502, 503, 504, 522 等） |
| **退避算法** | 会话轮次级退避 | Full Jitter 随机抖动指数退避（1s ~ 8s，优先尊重 `Retry-After`） |
| **常规状态码处理** | 处理 429 与模型级错误 | **完全透传放行**：对 200, 400, 401, 403, 429 100% 保持原生逻辑，绝不干涉 |
| **同进程协同** | 单插件视角 | 具备同进程协同感知：主动让出已由 `ck-pi-cline` 或 `ck-pi-zen-session` 接管的重试端点，杜绝乘法重试风暴 |

---

## 指令说明

在 Pi 命令行或交互界面中可随时使用 `/guard` 管理插件：

```text
/guard status  - 查看守护运行状态、累计自动续行次数与网关重试数据
/guard on      - 开启守护总开关
/guard off     - 暂停守护总开关
/guard reset   - 重置触发计数与熔断状态
```

---

## 安装与配置

### 方式一：通过 npm 安装为 Pi 插件包（推荐）
在终端中执行：
```bash
pi install npm:ck-pi-guard
```

### 方式二：手动在 `~/.pi/agent/settings.json` 中配置
在 `packages` 列表中添加：
```json
{
  "packages": [
    "npm:ck-pi-guard"
  ]
}
```

---

## 单元测试与验证

本包内置高覆盖率自动化测试套件（涵盖内容提取、标签剥离、状态码过滤、标头继承、防重入去重与命令行交互等 19 项测试）：
```bash
npm test
```
