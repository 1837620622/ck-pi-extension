# ck-pi-zen-session

OpenCode Zen 免费模型同步与 Session 会话自动维护插件，专为 [Pi 编码智能体](https://github.com/earendil-works/pi) 打造。

---

- ⚡ **/zen 指令一键配置**：输入一次 API Key，全自动在线探测可用免费模型并注入。
- 🔄 **官方算法逆向对齐**：完整复现 OpenCode 客户端 `Identifier.descending("ses")` 算法，生成 30 位降序会话 ID，时间戳毫秒级精确反解。
- 🛡️ **合规伪装请求头**：自动配置 `User-Agent` 与 `x-opencode-session` 请求头，并在每次底层请求（`before_provider_headers`）动态拦截校验，彻底解决服务端 403 `FreeTierError` 拦截。
- 🌐 **独立供应商命名空间**：采用独立 Provider ID `opencode-zen-free`，彻底避开并与官方 `pi auth login opencode` 套餐完全隔离，二者并行不悖、互不冲突。
- 🧠 **精准上下文与思维链**：精确对齐 9 款免费模型的 `contextWindow`、`maxTokens` 与 `thinkingLevelMap`（含小米 MiMo、英伟达 Nemotron、Meta Muse Spark 等）。
- 🔌 **双端自动同步**：自动写入 Pi 配置（`~/.pi/agent/models.json` 和 `auth.json`），并无缝同步 CC-Switch 本地数据库（`~/.cc-switch/cc-switch.db`）。
- ⏳ **后台无感自动续期**：常驻 `before_agent_start` 钩子，当会话使用超过 12 小时自动后台换新，永不中断编码交互。

---

## 安装方法

### 方式 1：npm 安装（推荐）

```bash
pi install npm:ck-pi-zen-session
```

### 方式 2：GitHub 源安装

```bash
pi install git:github.com/1837620622/ck-pi-extension
```

---

## 指令用法

在 Pi 交互界面中直接键入 `/zen`：

| 指令 | 说明 |
| --- | --- |
| `/zen <oc_sk_xxx>` | 设置/更新 API Key，自动在线验证并全量同步模型与请求头 |
| `/zen` | 智能检查当前会话状态；若会话临近过期自动换新；若未配置 Key 则弹出交互输入框 |
| `/zen refresh` | 强制重新生成全新的合法 Session ID 并更新请求头 |
| `/zen status` | 查看当前 API Key 掩码、活跃会话创建时间及模型就绪状态 |
| `/zen list`（或 `/zen models`） | 查看当前已激活的所有免费模型列表 |

---

## 内置免费模型库

插件自动同步官方 9 款免费模型并配置合理上限与思维链等级：

| 模型 ID | 上下文窗口 | 最大输出 | 推理支持 | 模态 |
| --- | --- | --- | --- | --- |
| `mimo-v2.5-free` | 200,000 | 32,000 | ✅ (low/high/max) | 文本、图像 |
| `mimo-v2.6-flash-free` | 200,000 | 32,000 | ✅ (low/high/max) | 文本、图像 |
| `nemotron-3.5-lightning-free` | 262,144 | 262,144 | ✅ (low/high/max) | 文本 |
| `nemotron-3-ultra-free` | 1,000,000 (1M) | 128,000 | ✅ (low/high/max) | 文本 |
| `ling-3.0-flash-fin-free` | 262,144 | 32,768 | ✅ (low/high/max) | 文本 |
| `big-pickle` | 200,000 | 32,000 | ✅ (low/high/max) | 文本 |
| `muse-spark-1.3-contributor-free` | 1,048,576 (1M) | 131,072 | ✅ (五档 effort) | 文本、图像 |
| `muse-spark-1.2-contributor-free` | 1,048,576 (1M) | 131,072 | ✅ (五档 effort) | 文本、图像 |
| `jev-1.13-free` | 128,000 | 16,384 | ❌ (常规模型) | 文本 |

> 若 OpenCode 未来上线新免费模型，插件将自动探测发现并使用安全的自适应默认参数接入。

---

## 逆向算法解析

OpenCode Zen 客户端要求所有请求头携带合规的 `x-opencode-session`。其算法规范如下：

```typescript
function generateZenSessionId(timestampMs = Date.now()): string {
  // 1. 时间戳与自增序列合并
  const combined = BigInt(timestampMs) * 4096n + BigInt(sequenceCounter);
  // 2. 按位反转（保证时间越靠后，字典序越靠前）
  const inverted = ~combined;
  // 3. 提取低 48 位（6 字节）大端序十六进制（12 字符）
  let hex = "";
  for (let i = 0; i < 6; i++) {
    const byte = Number((inverted >> BigInt(40 - 8 * i)) & 0xffn);
    hex += byte.toString(16).padStart(2, "0");
  }
  // 4. 追加 14 位 Base62 密码学随机字符
  return `ses_${hex}${randomBase62(14)}`;
}
```

本插件严格实现上述规约，确保服务端 100% 接受。

---

## 作者与许可

- 作者：传康Kk
- 邮箱：`1837620622@qq.com`
- 仓库：[https://github.com/1837620622/ck-pi-extension](https://github.com/1837620622/ck-pi-extension)
- 协议：MIT License
