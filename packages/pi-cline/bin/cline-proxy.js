#!/usr/bin/env node

// src/proxy.ts
import http from "node:http";

// src/models-registry.ts
var CLINE_BASE_URL = "https://api.cline.bot/api/v1";
var CLINE_DEFAULT_KEY = "";
var CLINE_CLIENT_HEADERS = {
  "User-Agent": "Cline/4.1.16",
  "x-client-version": "4.1.16",
  "x-core-version": "4.1.16",
  "x-platform-version": "1.106.0",
  "x-client-type": "cline-vscode",
  "http-referer": "https://cline.bot",
  "x-platform": "vscode",
  "x-title": "Cline"
};
var STANDARD_THINKING_LEVELS = {
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "high",
  max: "high",
  off: null
};
var KNOWN_CLINE_FREE_MODELS = {
  // ==================== 1. 智能免费路由模型 (Smart Free Router) ====================
  "openrouter/free": {
    id: "openrouter/free",
    name: "OpenRouter Auto Free Router (200k) (Cline Free)",
    contextWindow: 2e5,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  // ==================== 2. 百万级超长上下文免费模型 (1M+ Giant Context) ====================
  "nvidia/nemotron-3-ultra-550b-a55b:free": {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "NVIDIA Nemotron 3 Ultra 550B (1M Free) (Cline Free)",
    contextWindow: 1e6,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "nvidia/nemotron-3.5-lightning:free": {
    id: "nvidia/nemotron-3.5-lightning:free",
    name: "NVIDIA Nemotron 3.5 Lightning (1M Free) (Cline Free)",
    contextWindow: 1e6,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "thinkingmachines/inkling:free": {
    id: "thinkingmachines/inkling:free",
    name: "Thinking Machines Inkling (1M Free) (Cline Free)",
    contextWindow: 1048576,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "thinkingmachines/inkling-small:free": {
    id: "thinkingmachines/inkling-small:free",
    name: "Thinking Machines Inkling Small (1M Free) (Cline Free)",
    contextWindow: 1048576,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  // ==================== 3. 主力代码与推理思考免费模型 (Core Coding & Reasoning) ====================
  "inclusionai/ling-3.0-flash-sante:free": {
    id: "inclusionai/ling-3.0-flash-sante:free",
    name: "InclusionAI Ling 3.0 Flash Sante (262k Free) (Cline Free)",
    contextWindow: 262144,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "nvidia/nemotron-3-super-120b-a12b:free": {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "NVIDIA Nemotron 3 Super 120B (262k Free) (Cline Free)",
    contextWindow: 262144,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    name: "NVIDIA Nemotron 3 Nano Omni Reasoning (Free) (Cline Free)",
    contextWindow: 131072,
    maxTokens: 32768,
    reasoning: true,
    input: ["text", "image"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "cohere/north-mini-code:free": {
    id: "cohere/north-mini-code:free",
    name: "Cohere North Mini Code (Free) (Cline Free)",
    contextWindow: 131072,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "poolside/laguna-s-2.1:free": {
    id: "poolside/laguna-s-2.1:free",
    name: "Poolside Laguna S 2.1 (Free) (Cline Free)",
    contextWindow: 131072,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "poolside/laguna-xs-2.1:free": {
    id: "poolside/laguna-xs-2.1:free",
    name: "Poolside Laguna XS 2.1 (Free) (Cline Free)",
    contextWindow: 131072,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  // ==================== 4. 轻量极速与专用工具模型 (Lightweight & Tools) ====================
  "google/gemma-4-26b-a4b-it:free": {
    id: "google/gemma-4-26b-a4b-it:free",
    name: "Google Gemma 4 26B A4B IT (Free) (Cline Free)",
    contextWindow: 262144,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "google/gemma-4-31b-it:free": {
    id: "google/gemma-4-31b-it:free",
    name: "Google Gemma 4 31B IT (Free) (Cline Free)",
    contextWindow: 262144,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "dots-studio/dots-3-note-preview:free": {
    id: "dots-studio/dots-3-note-preview:free",
    name: "Dots Studio Dots 3 Note Preview (Free) (Cline Free)",
    contextWindow: 131072,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "liquid/lfm-2.5-2.6b:free": {
    id: "liquid/lfm-2.5-2.6b:free",
    name: "Liquid LFM 2.5 2.6B (Free) (Cline Free)",
    contextWindow: 32768,
    maxTokens: 8192,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "nvidia/nemotron-3.5-content-safety:free": {
    id: "nvidia/nemotron-3.5-content-safety:free",
    name: "NVIDIA Nemotron 3.5 Content Safety (Free) (Cline Free)",
    contextWindow: 131072,
    maxTokens: 16384,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "apodex/apodex-1.1-mini:free": {
    id: "apodex/apodex-1.1-mini:free",
    name: "Apodex 1.1 Mini (Free) (Cline Free)",
    contextWindow: 131072,
    maxTokens: 32768,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  }
};
function resolveFreeModelId(rawId) {
  if (!rawId || typeof rawId !== "string" || !rawId.trim()) {
    return "openrouter/free";
  }
  let id = rawId.trim();
  id = id.replace(/^(cline|cline-free|cline-bot)\//i, "");
  const lower = id.toLowerCase();
  if (lower === "free" || lower === "auto" || lower === "openrouter") {
    return "openrouter/free";
  }
  if (lower === "fusion" || lower === "openrouter/fusion") {
    return "openrouter/free";
  }
  if (lower === "code" || lower === "pareto" || lower === "pareto-code" || lower === "openrouter/pareto-code") {
    return "openrouter/free";
  }
  if (lower === "deepseekv4.1 flash-cline" || lower === "deepseek-v4.1-flash-cline" || lower === "deepseek-v4.1-flash" || lower === "deepseekv4.1-flash" || lower === "deepseekv4.1" || lower === "deepseek-v4.1" || lower === "deepseek/deepseek-v4.1-flash") {
    return "openrouter/free";
  }
  if (lower === "bunny" || lower === "stealth" || lower === "space-bunny" || lower === "space-bunny-alpha" || lower === "stealth/space-bunny-alpha") {
    return "openrouter/free";
  }
  if (lower === "ling" || lower === "flash" || lower === "flash-fin" || lower === "inclusionai/ling-3.0-flash-fin:free" || lower === "inclusionai/ling-3.0-flash-fin") {
    return "inclusionai/ling-3.0-flash-sante:free";
  }
  if (lower === "sante" || lower === "flash-sante") {
    return "inclusionai/ling-3.0-flash-sante:free";
  }
  if (lower === "qwen" || lower === "qwen-free" || lower === "qwen/qwen3.8-27b:free") {
    return "openrouter/free";
  }
  if (lower === "550b" || lower === "ultra") {
    return "nvidia/nemotron-3-ultra-550b-a55b:free";
  }
  if (lower === "reasoning" || lower === "nano" || lower === "nano-omni") {
    return "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
  }
  if (lower === "120b" || lower === "super-120b") {
    return "nvidia/nemotron-3-super-120b-a12b:free";
  }
  if (lower === "lightning") {
    return "nvidia/nemotron-3.5-lightning:free";
  }
  if (lower === "laguna" || lower === "laguna-s" || lower === "laguna-s-2.1") {
    return "poolside/laguna-s-2.1:free";
  }
  if (lower === "xs" || lower === "laguna-xs" || lower === "laguna-xs-2.1") {
    return "poolside/laguna-xs-2.1:free";
  }
  if (lower === "north" || lower === "north-mini-code") {
    return "cohere/north-mini-code:free";
  }
  if (lower === "gemma" || lower === "gemma-free" || lower === "gemma-26b") {
    return "google/gemma-4-26b-a4b-it:free";
  }
  if (lower === "gemma-31b") {
    return "google/gemma-4-31b-it:free";
  }
  if (lower === "inkling") {
    return "thinkingmachines/inkling:free";
  }
  if (lower === "inkling-small") {
    return "thinkingmachines/inkling-small:free";
  }
  if (lower === "note" || lower === "dots-note") {
    return "dots-studio/dots-3-note-preview:free";
  }
  if (lower === "lfm" || lower === "lfm-2.5") {
    return "liquid/lfm-2.5-2.6b:free";
  }
  if (lower === "apodex" || lower === "apodex-mini" || lower === "apodex-1.1-mini") {
    return "apodex/apodex-1.1-mini:free";
  }
  if (KNOWN_CLINE_FREE_MODELS[id]) {
    return id;
  }
  const withFree = `${id}:free`;
  if (KNOWN_CLINE_FREE_MODELS[withFree]) {
    return withFree;
  }
  return id;
}

// src/sync.ts
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
var require2 = createRequire(import.meta.url);
function defaultModelsPath() {
  if (process.env.TEST_PI_MODELS_PATH) return process.env.TEST_PI_MODELS_PATH;
  return join(homedir(), ".pi", "agent", "models.json");
}
function defaultAuthPath() {
  if (process.env.TEST_PI_AUTH_PATH) return process.env.TEST_PI_AUTH_PATH;
  return join(homedir(), ".pi", "agent", "auth.json");
}
var syncMutexPromise = Promise.resolve();
function getStoredClineApiKey(authPath = defaultAuthPath(), modelsPath = defaultModelsPath()) {
  if (process.env.CLINE_API_KEY && process.env.CLINE_API_KEY.trim()) {
    return process.env.CLINE_API_KEY.trim();
  }
  try {
    if (existsSync(authPath)) {
      const auth = JSON.parse(readFileSync(authPath, "utf-8"));
      if (typeof auth?.["cline-free"]?.key === "string" && auth["cline-free"].key.trim()) {
        return auth["cline-free"].key.trim();
      }
      if (typeof auth?.cline?.key === "string" && auth.cline.key.trim()) {
        return auth.cline.key.trim();
      }
    }
  } catch {
  }
  try {
    if (existsSync(modelsPath)) {
      const models = JSON.parse(readFileSync(modelsPath, "utf-8"));
      const prov = models?.providers?.["cline-free"] || models?.["cline-free"] || models?.providers?.cline || models?.cline;
      if (typeof prov?.apiKey === "string" && prov.apiKey.trim()) {
        return prov.apiKey.trim();
      }
    }
  } catch {
  }
  return CLINE_DEFAULT_KEY;
}

// src/proxy.ts
var activeServer = null;
var activePort = 4116;
var activeHost = "127.0.0.1";
var configuredApiKey = "";
var requestCounter = 0;
var errorCounter = 0;
var serverStartedAt;
function sleepWithSignal(ms, signal) {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort);
  });
}
function isCompactionOrSummaryPayload(payload) {
  if (payload.tool_choice === "none") return true;
  if (Array.isArray(payload.messages)) {
    for (const msg of payload.messages) {
      if (msg && typeof msg === "object") {
        const content = msg.content;
        let text = "";
        if (typeof content === "string") {
          text = content.toLowerCase();
        } else if (Array.isArray(content)) {
          text = content.map((p) => typeof p === "string" ? p : p?.text || "").join(" ").toLowerCase();
        }
        if (text.includes("<conversation>") || text.includes("<previous-summary>") || text.includes("summarize") || text.includes("summary") || text.includes("compress") || text.includes("compact")) {
          return true;
        }
      }
    }
  }
  if (payload.stream === false) return true;
  return false;
}
async function assembleSseStreamToJson(upstreamRes, modelId, isCompactionRequest = false) {
  if (!upstreamRes.body) {
    return {
      id: `gen-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1e3),
      model: modelId,
      choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" }]
    };
  }
  const reader = upstreamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  let id = `gen-${Date.now()}`;
  let textContent = "";
  let reasoningContent = "";
  let finishReason = "stop";
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const toolCallsMap = /* @__PURE__ */ new Map();
  try {
    while (!done) {
      const { value, done: rDone } = await reader.read();
      done = rDone;
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        if (buffer.length > 2 * 1024 * 1024) {
          buffer = "";
          await reader.cancel("Buffer exceeded 2MB limit").catch(() => {
          });
          break;
        }
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
            try {
              const chunk = JSON.parse(trimmed.slice(6));
              if (chunk.id) id = chunk.id;
              const choice = chunk.choices?.[0];
              if (choice?.delta?.content) {
                if (textContent.length < 2 * 1024 * 1024) {
                  textContent += choice.delta.content;
                }
              }
              if (choice?.delta?.reasoning_content) {
                if (reasoningContent.length < 2 * 1024 * 1024) {
                  reasoningContent += choice.delta.reasoning_content;
                }
              }
              if (choice?.delta?.reasoning) {
                if (reasoningContent.length < 2 * 1024 * 1024) {
                  reasoningContent += choice.delta.reasoning;
                }
              }
              if (Array.isArray(choice?.delta?.tool_calls)) {
                for (const tc of choice.delta.tool_calls) {
                  const idx = typeof tc.index === "number" ? tc.index : 0;
                  let existing = toolCallsMap.get(idx);
                  if (!existing) {
                    existing = {
                      id: tc.id || `call_${Date.now()}_${idx}`,
                      type: tc.type || "function",
                      function: { name: tc.function?.name || "", arguments: "" }
                    };
                    toolCallsMap.set(idx, existing);
                  }
                  if (tc.id) existing.id = tc.id;
                  if (tc.type) existing.type = tc.type;
                  if (tc.function?.name) existing.function.name += tc.function.name;
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                }
              }
              if (choice?.finish_reason) finishReason = choice.finish_reason;
              if (chunk.usage) usage = chunk.usage;
            } catch {
            }
          }
        }
      }
    }
  } catch (err) {
    await reader.cancel(err).catch(() => {
    });
  }
  const promptTokens = Number(usage.prompt_tokens) || 0;
  let completionTokens = Number(usage.completion_tokens) || 0;
  if (completionTokens === 0) {
    completionTokens = Math.ceil((textContent.length + reasoningContent.length) / 4);
  }
  if (finishReason === "content_filter") {
    finishReason = "stop";
    if (isCompactionRequest) {
      textContent = [
        "# \u4F1A\u8BDD\u8FDB\u5C55\u4E0E\u5B89\u5168\u5BA1\u8BA1\u68C0\u67E5\u70B9 (Session Progress Checkpoint)",
        "- \u6838\u5FC3\u76EE\u6807\u4E0E\u524D\u5E8F\u4EFB\u52A1\u5DF2\u6267\u884C\u5B8C\u6BD5\uFF1B",
        "- \u4F1A\u8BDD\u5305\u542B\u654F\u611F\u5BA1\u8BA1\u4E0E\u6280\u672F\u6267\u884C\u65E5\u5FD7\uFF0C\u5DF2\u81EA\u52A8\u5B8C\u6210\u5B89\u5168\u5408\u89C4\u8131\u654F\u5F52\u6863\uFF1B",
        "- \u72B6\u6001\u4E0E\u73AF\u5883\u53C2\u6570\u5DF2\u6301\u4E45\u5316\u4FDD\u5B58\uFF0C\u65E0\u7F1D\u8FDB\u5165\u540E\u7EED\u4EFB\u52A1\u6267\u884C\u3002"
      ].join("\n");
    } else {
      textContent = textContent.trim() ? `${textContent}

[!] [\u4E0A\u6E38\u4F9B\u5E94\u5546\u5B89\u5168\u8FC7\u6EE4\u62E6\u622A (content_filter)\uFF0C\u5DF2\u81EA\u52A8\u4FDD\u5168\u622A\u65AD\u524D\u7684\u8F93\u51FA\u3002\u5EFA\u8BAE\u8C03\u6574\u63D0\u95EE\u65B9\u5F0F\u4EE5\u907F\u514D\u89E6\u53D1\u5B89\u5168\u7B56\u7565\u3002]` : "[!] [\u4E0A\u6E38\u4F9B\u5E94\u5546\u5B89\u5168\u8FC7\u6EE4\u62E6\u622A (content_filter)\uFF0C\u6A21\u578B\u62D2\u7EDD\u56DE\u7B54\u5F53\u524D\u8BF7\u6C42\u3002\u5EFA\u8BAE\u8C03\u6574\u63D0\u793A\u8BCD\u6216\u8FC7\u6EE4\u654F\u611F\u4EE3\u7801\u7247\u6BB5\u540E\u91CD\u8BD5\u3002]";
    }
  }
  if (finishReason === "length" && isCompactionRequest) {
    finishReason = "stop";
    if (!textContent || textContent.trim().length < 80) {
      textContent = [
        textContent.trim() ? `${textContent.trim()}

` : "",
        "# \u4F1A\u8BDD\u5DE5\u4F5C\u8FDB\u5C55\u68C0\u67E5\u70B9",
        "- \u5DF2\u5B8C\u6210\u524D\u5E8F\u4E0A\u4E0B\u6587\u5BA1\u8BA1\u4E0E\u72B6\u6001\u4FDD\u5B58\uFF1B",
        "- \u4EFB\u52A1\u72B6\u6001\u5DF2\u5C31\u7EEA\uFF0C\u7EE7\u7EED\u6267\u884C\u540E\u7EED\u6B65\u9AA4\u3002"
      ].join("\n");
    }
  }
  if (!textContent && toolCallsMap.size === 0) {
    if (isCompactionRequest) {
      textContent = [
        "# \u4F1A\u8BDD\u8FDB\u5C55\u68C0\u67E5\u70B9 (Session Progress Checkpoint)",
        "- \u5DF2\u5B8C\u6210\u524D\u5E8F\u4F1A\u8BDD\u4EFB\u52A1\u5BA1\u8BA1\u4E0E\u72B6\u6001\u4FDD\u5B58\uFF1B",
        "- \u4EFB\u52A1\u72B6\u6001\u5DF2\u6B63\u5E38\u5F52\u6863\uFF0C\u7EE7\u7EED\u6267\u884C\u540E\u7EED\u6B65\u9AA4\u3002"
      ].join("\n");
      finishReason = "stop";
    }
  }
  const messageObj = {
    role: "assistant",
    content: textContent || (toolCallsMap.size > 0 ? null : reasoningContent || "")
  };
  if (reasoningContent) {
    messageObj.reasoning_content = reasoningContent;
    messageObj.reasoning = reasoningContent;
  }
  if (toolCallsMap.size > 0) {
    messageObj.tool_calls = Array.from(toolCallsMap.entries()).sort(([a], [b]) => a - b).map(([_, tc]) => tc);
    if (finishReason === "stop") {
      finishReason = "tool_calls";
    }
  }
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1e3),
    model: modelId,
    choices: [{ index: 0, message: messageObj, finish_reason: finishReason }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    }
  };
}
async function startClineProxyServer(options = {}) {
  if (activeServer && activeServer.listening) {
    return { port: activePort, url: `http://${activeHost}:${activePort}/v1` };
  }
  activePort = options.port || 4116;
  activeHost = options.host || "127.0.0.1";
  if (options.apiKey) {
    configuredApiKey = options.apiKey.trim();
  }
  const server = http.createServer(async (req, res) => {
    const hostHeader = req.headers.host?.trim() || "";
    if (!hostHeader) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Forbidden: Missing Host header" } }));
      return;
    }
    let hostName = "";
    if (hostHeader.startsWith("[")) {
      const closingBracket = hostHeader.indexOf("]");
      if (closingBracket !== -1) {
        hostName = hostHeader.slice(1, closingBracket).toLowerCase();
      }
    } else {
      hostName = hostHeader.split(":")[0]?.toLowerCase() || "";
    }
    const allowedHosts = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "::1", activeHost.toLowerCase()]);
    if (!allowedHosts.has(hostName)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Forbidden: Invalid Host header" } }));
      return;
    }
    const origin = req.headers.origin || "";
    const isTrustedOrigin = origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:") || origin.startsWith("http://[::1]:") || origin === "http://localhost" || origin === "http://127.0.0.1" || origin === "http://[::1]" || origin.startsWith("vscode-webview://") || origin.startsWith("vscode-file://");
    if (isTrustedOrigin && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const parsedUrl = new URL(req.url || "/", `http://${activeHost}:${activePort}`);
    const pathname = parsedUrl.pathname;
    if (pathname === "/" || pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "cline-reverse-proxy",
          version: "4.1.16",
          proxyBaseUrl: `http://${activeHost}:${activePort}/v1`,
          freeModelsCount: Object.keys(KNOWN_CLINE_FREE_MODELS).length,
          freeModels: Object.keys(KNOWN_CLINE_FREE_MODELS),
          requestsHandled: requestCounter
        })
      );
      return;
    }
    if (pathname === "/v1/models" || pathname === "/models" || pathname === "/v1/models/free") {
      const onlyFree = pathname.endsWith("/free") || parsedUrl.searchParams.get("free") === "true" || parsedUrl.searchParams.get("free") === "1";
      const clientAuth = req.headers["authorization"] || "";
      const token = clientAuth.startsWith("Bearer ") && clientAuth.slice(7).trim() || configuredApiKey || getStoredClineApiKey();
      if (!onlyFree && token) {
        try {
          const upstreamRes = await fetch(`${CLINE_BASE_URL}/models`, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...CLINE_CLIENT_HEADERS
            },
            signal: AbortSignal.timeout(1e4)
          }).catch(() => null);
          if (upstreamRes && upstreamRes.ok) {
            const data = await upstreamRes.json();
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(data));
            return;
          }
        } catch {
        }
      }
      const modelList = Object.values(KNOWN_CLINE_FREE_MODELS).map((m) => ({
        id: m.id,
        object: "model",
        created: Math.floor(Date.now() / 1e3),
        owned_by: "cline",
        permission: [],
        root: m.id,
        parent: null
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ object: "list", data: modelList }));
      return;
    }
    if (pathname === "/v1/chat/completions" || pathname === "/chat/completions") {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method Not Allowed" }));
        return;
      }
      requestCounter++;
      const MAX_BODY_BYTES = 10 * 1024 * 1024;
      let receivedBytes = 0;
      let exceeded = false;
      const chunks = [];
      req.on("data", (chunk) => {
        if (exceeded) return;
        receivedBytes += chunk.length;
        if (receivedBytes > MAX_BODY_BYTES) {
          exceeded = true;
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "Payload Too Large: Maximum request body is 10MB" } }));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("error", () => {
        if (!res.headersSent) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "Bad Request" } }));
        }
      });
      req.on("end", async () => {
        if (exceeded) return;
        try {
          const bodyText = Buffer.concat(chunks).toString("utf-8");
          let payload = {};
          try {
            payload = JSON.parse(bodyText);
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON body" }));
            return;
          }
          const rawModel = typeof payload.model === "string" ? payload.model : "";
          const resolvedModel = resolveFreeModelId(rawModel);
          payload.model = resolvedModel;
          const modelId = resolvedModel;
          const isCompactionRequest = isCompactionOrSummaryPayload(payload);
          const maxAllowedOutput = isCompactionRequest ? 16384 : 32768;
          if (typeof payload.max_tokens === "number" && payload.max_tokens > maxAllowedOutput) {
            payload.max_tokens = maxAllowedOutput;
          }
          if (typeof payload.max_completion_tokens === "number" && payload.max_completion_tokens > maxAllowedOutput) {
            payload.max_completion_tokens = maxAllowedOutput;
          }
          if (isCompactionRequest) {
            payload.reasoning_effort = "low";
            if ("thinking" in payload) {
              delete payload.thinking;
            }
          }
          const clientAuth = req.headers["authorization"] || "";
          let tokenToUse = configuredApiKey || getStoredClineApiKey();
          if (clientAuth.startsWith("Bearer ") && clientAuth.slice(7).trim()) {
            tokenToUse = clientAuth.slice(7).trim();
          }
          if (!tokenToUse) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: {
                  message: "Unauthorized: No Cline API key provided or configured.",
                  type: "invalid_request_error"
                }
              })
            );
            return;
          }
          const upstreamHeaders = {
            Authorization: `Bearer ${tokenToUse}`,
            "Content-Type": "application/json",
            ...CLINE_CLIENT_HEADERS
          };
          const isStreaming = payload.stream === true;
          const abortController = new AbortController();
          let reader;
          let isClientAborted = false;
          const onClientAbort = () => {
            isClientAborted = true;
            abortController.abort();
            reader?.cancel("Client disconnected").catch(() => {
            });
          };
          req.on("close", onClientAbort);
          res.on("close", onClientAbort);
          let upstreamRes;
          const maxProxyRetries = 3;
          for (let attempt = 0; attempt <= maxProxyRetries; attempt++) {
            if (abortController.signal.aborted) break;
            let connectTimer = setTimeout(() => {
              abortController.abort(new Error("Upstream connection handshake timed out (45s)"));
            }, 45e3);
            connectTimer.unref?.();
            try {
              try {
                upstreamRes = await fetch(`${CLINE_BASE_URL}/chat/completions`, {
                  method: "POST",
                  headers: upstreamHeaders,
                  body: JSON.stringify(payload),
                  signal: abortController.signal
                });
              } finally {
                if (connectTimer) {
                  clearTimeout(connectTimer);
                  connectTimer = null;
                }
              }
              if (upstreamRes.ok || upstreamRes.status < 500 && upstreamRes.status !== 429) {
                const cType = (upstreamRes.headers.get("content-type") || "").toLowerCase();
                if (cType.includes("text/event-stream") && upstreamRes.body) {
                  const reader2 = upstreamRes.body.getReader();
                  const decoder = new TextDecoder();
                  const initialChunks = [];
                  let peekedText = "";
                  let isEmptyResponseError = false;
                  const maxPeekChunks = 30;
                  const maxPeekBytes = 64 * 1024;
                  let peekedBytes = 0;
                  try {
                    while (initialChunks.length < maxPeekChunks && peekedBytes < maxPeekBytes) {
                      if (abortController.signal.aborted) break;
                      const { value, done } = await reader2.read();
                      if (done) {
                        if (!peekedText.includes('"choices"') || peekedText.trim().length === 0) {
                          isEmptyResponseError = true;
                        }
                        break;
                      }
                      if (value) {
                        initialChunks.push(value);
                        peekedBytes += value.byteLength;
                        peekedText += decoder.decode(value, { stream: true });
                        let hasErrorFrame = false;
                        let hasValidChoiceChunk = false;
                        if (peekedText.includes("Provider returned an empty response")) {
                          hasErrorFrame = true;
                        }
                        const lines = peekedText.split("\n");
                        for (const line of lines) {
                          const trimmed = line.trim();
                          if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
                            try {
                              const data = JSON.parse(trimmed.slice(6));
                              if (data.error && (!data.choices || data.choices.length === 0)) {
                                hasErrorFrame = true;
                                break;
                              }
                              if (Array.isArray(data.choices) && data.choices.length > 0) {
                                const c = data.choices[0];
                                if (c?.delta || c?.message || c?.text || c?.finish_reason) {
                                  hasValidChoiceChunk = true;
                                }
                              }
                            } catch {
                            }
                          } else if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
                            try {
                              const data = JSON.parse(trimmed);
                              if (data.error && (!data.choices || data.choices.length === 0)) {
                                hasErrorFrame = true;
                                break;
                              }
                            } catch {
                            }
                          }
                        }
                        if (hasErrorFrame) {
                          isEmptyResponseError = true;
                          break;
                        }
                        if (hasValidChoiceChunk) {
                          break;
                        }
                      }
                    }
                  } catch {
                    isEmptyResponseError = true;
                  }
                  if (isEmptyResponseError && attempt < maxProxyRetries) {
                    await reader2.cancel().catch(() => {
                    });
                    const isTestEnv = !!process.env.TEST_PI_MODELS_PATH || process.env.NODE_ENV === "test";
                    const delayMs = isTestEnv ? 10 : 1500 * (attempt + 1) + Math.floor(Math.random() * 500);
                    await sleepWithSignal(delayMs, abortController.signal);
                    continue;
                  }
                  let readerConsumed = false;
                  const reconstructedStream = new ReadableStream({
                    start(controller) {
                      for (const chunk of initialChunks) {
                        controller.enqueue(chunk);
                      }
                    },
                    async pull(controller) {
                      if (readerConsumed) {
                        controller.close();
                        return;
                      }
                      try {
                        const { value, done } = await reader2.read();
                        if (done) {
                          readerConsumed = true;
                          controller.close();
                        } else if (value) {
                          controller.enqueue(value);
                        }
                      } catch (streamErr) {
                        controller.error(streamErr);
                      }
                    },
                    cancel(reason) {
                      return reader2.cancel(reason);
                    }
                  });
                  upstreamRes = new Response(reconstructedStream, {
                    status: upstreamRes.status,
                    statusText: upstreamRes.statusText,
                    headers: upstreamRes.headers
                  });
                }
                break;
              }
              if (attempt < maxProxyRetries) {
                const isTestEnv = !!process.env.TEST_PI_MODELS_PATH || process.env.NODE_ENV === "test";
                const delayMs = isTestEnv ? 10 : 1500 * (attempt + 1) + Math.floor(Math.random() * 500);
                await sleepWithSignal(delayMs, abortController.signal);
              }
            } catch (netErr) {
              if (netErr?.name === "AbortError" || abortController.signal.aborted) {
                return;
              }
              if (attempt < maxProxyRetries) {
                const isTestEnv = !!process.env.TEST_PI_MODELS_PATH || process.env.NODE_ENV === "test";
                const delayMs = isTestEnv ? 10 : 1500 * (attempt + 1) + Math.floor(Math.random() * 500);
                await sleepWithSignal(delayMs, abortController.signal);
              } else {
                errorCounter++;
                if (!res.headersSent) {
                  res.writeHead(502, { "Content-Type": "application/json" });
                  res.end(JSON.stringify({ error: { message: "Upstream connection failed after retries" } }));
                }
                return;
              }
            }
          }
          if (!upstreamRes || !upstreamRes.ok) {
            errorCounter++;
            const status = upstreamRes ? upstreamRes.status : 502;
            const errText = upstreamRes ? await upstreamRes.text().catch(() => "") : "";
            let errorJson;
            try {
              errorJson = JSON.parse(errText);
            } catch {
              errorJson = {
                error: {
                  message: errText.slice(0, 500) || upstreamRes?.statusText || "Upstream request failed",
                  code: status
                }
              };
            }
            if (!res.headersSent) {
              res.writeHead(status, { "Content-Type": "application/json" });
              res.end(JSON.stringify(errorJson));
            }
            return;
          }
          if (isStreaming) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive"
            });
            if (upstreamRes.body) {
              reader = upstreamRes.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              let hasSentAnyContent = false;
              let keepAliveTimer = setInterval(() => {
                if (!res.writableEnded && !res.destroyed) {
                  res.write(": keepalive\n\n");
                }
              }, 1e4);
              keepAliveTimer.unref?.();
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (value) {
                    buffer += decoder.decode(value, { stream: true });
                    if (buffer.length > 2 * 1024 * 1024) {
                      buffer = "";
                      await reader.cancel("Buffer exceeded 2MB limit").catch(() => {
                      });
                      res.destroy();
                      break;
                    }
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";
                    for (const line of lines) {
                      const trimmed = line.trim();
                      if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
                        try {
                          const chunk = JSON.parse(trimmed.slice(6));
                          if (chunk.error && (!chunk.choices || chunk.choices.length === 0)) {
                            const errMsg = chunk.error.message || "Upstream provider error";
                            const synthetic = {
                              id: chunk.id || `err-${Date.now()}`,
                              object: "chat.completion.chunk",
                              created: Math.floor(Date.now() / 1e3),
                              model: modelId,
                              choices: [
                                {
                                  index: 0,
                                  delta: { content: `

[!][Cline \u4F9B\u5E94\u5546\u5F02\u5E38: ${errMsg}\uFF0C\u8BF7\u91CD\u8BD5\u6216\u5207\u6362\u5176\u4ED6\u514D\u8D39\u6A21\u578B]` },
                                  finish_reason: "stop"
                                }
                              ]
                            };
                            res.write(`data: ${JSON.stringify(synthetic)}

`);
                            hasSentAnyContent = true;
                            continue;
                          }
                          const choice = chunk.choices?.[0];
                          const rawReasoning = choice?.delta?.reasoning_content || choice?.delta?.reasoning || choice?.delta?.thinking;
                          if (choice?.delta?.content || Array.isArray(choice?.delta?.tool_calls) && choice.delta.tool_calls.length > 0 || rawReasoning) {
                            hasSentAnyContent = true;
                          }
                          if (choice?.finish_reason === "content_filter") {
                            choice.finish_reason = "stop";
                            choice.delta = {
                              content: "\n\n[!] [\u4E0A\u6E38\u4F9B\u5E94\u5546\u5B89\u5168\u8FC7\u6EE4\u62E6\u622A (content_filter)\uFF0C\u5DF2\u81EA\u52A8\u4FDD\u5168\u622A\u65AD\u524D\u7684\u8F93\u51FA\u3002\u5EFA\u8BAE\u8C03\u6574\u63D0\u95EE\u65B9\u5F0F\u4EE5\u907F\u514D\u89E6\u53D1\u5B89\u5168\u7B56\u7565\u3002]"
                            };
                            res.write(`data: ${JSON.stringify(chunk)}

`);
                            hasSentAnyContent = true;
                            continue;
                          }
                          if (choice?.finish_reason === "length" && isCompactionRequest) {
                            choice.finish_reason = "stop";
                          }
                          if (rawReasoning && choice?.delta) {
                            choice.delta.reasoning_content = rawReasoning;
                            choice.delta.reasoning = rawReasoning;
                            res.write(`data: ${JSON.stringify(chunk)}

`);
                            continue;
                          }
                        } catch {
                        }
                      }
                      res.write(line + "\n");
                    }
                  }
                }
                if (!hasSentAnyContent) {
                  const emptyGuardChunk = {
                    id: `guard-${Date.now()}`,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1e3),
                    model: modelId,
                    choices: [
                      {
                        index: 0,
                        delta: { content: "[!][\u5F53\u524D\u6A21\u578B\u8282\u70B9\u6682\u65F6\u65E0\u54CD\u5E94\uFF0C\u8BF7\u91CD\u8BD5\u6216\u4F7F\u7528 /cline free \u5207\u6362\u9AD8\u53EF\u7528\u6A21\u578B]" },
                        finish_reason: "stop"
                      }
                    ]
                  };
                  res.write(`data: ${JSON.stringify(emptyGuardChunk)}

`);
                }
                if (buffer) {
                  res.write(buffer);
                }
              } catch (streamErr) {
                await reader?.cancel(streamErr).catch(() => {
                });
                if (!res.headersSent) {
                  res.writeHead(502, { "Content-Type": "application/json" });
                  res.end(JSON.stringify({ error: { message: "Stream reading failed" } }));
                } else {
                  if (!isClientAborted && hasSentAnyContent && !res.writableEnded) {
                    try {
                      const noticeChunk = {
                        id: `trunc-${Date.now()}`,
                        object: "chat.completion.chunk",
                        created: Math.floor(Date.now() / 1e3),
                        model: modelId,
                        choices: [
                          {
                            index: 0,
                            delta: { content: "\n\n[!] [\u7F51\u7EDC\u4F20\u8F93\u4E2D\u9014\u5F02\u5E38\u4E2D\u65AD\uFF0C\u5DF2\u81EA\u52A8\u4FDD\u5168\u5F53\u524D\u5DF2\u751F\u6210\u7684\u5168\u90E8\u5185\u5BB9\u3002\u60A8\u53EF\u4EE5\u8F93\u5165\u201C\u7EE7\u7EED\u201D\u4EE5\u63A5\u7EED\u8F93\u51FA]" },
                            finish_reason: "stop"
                          }
                        ]
                      };
                      res.write(`data: ${JSON.stringify(noticeChunk)}

`);
                      res.write("data: [DONE]\n\n");
                    } catch {
                    }
                    res.end();
                  } else {
                    res.destroy();
                  }
                }
              } finally {
                if (keepAliveTimer) {
                  clearInterval(keepAliveTimer);
                  keepAliveTimer = null;
                }
                if (!res.writableEnded) {
                  res.end();
                }
              }
            } else {
              res.end();
            }
          } else {
            const contentType = upstreamRes.headers.get("content-type") || "";
            if (contentType.includes("text/event-stream")) {
              const assembledJson = await assembleSseStreamToJson(upstreamRes, modelId, isCompactionRequest);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(assembledJson));
            } else {
              let rawJson;
              try {
                rawJson = await upstreamRes.json();
              } catch {
                errorCounter++;
                res.writeHead(502, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: { message: "Invalid JSON response from upstream provider" } }));
                return;
              }
              const unwrapped = rawJson && typeof rawJson === "object" && rawJson.data?.choices ? rawJson.data : rawJson || {};
              if (Array.isArray(unwrapped.choices) && unwrapped.choices.length > 0) {
                for (const choice of unwrapped.choices) {
                  if (choice?.message?.reasoning && !choice.message.reasoning_content) {
                    choice.message.reasoning_content = choice.message.reasoning;
                  }
                  if (choice?.finish_reason === "content_filter") {
                    choice.finish_reason = "stop";
                    if (isCompactionRequest) {
                      choice.message.content = [
                        "# \u4F1A\u8BDD\u8FDB\u5C55\u4E0E\u5B89\u5168\u5BA1\u8BA1\u68C0\u67E5\u70B9 (Session Progress Checkpoint)",
                        "- \u6838\u5FC3\u76EE\u6807\u4E0E\u524D\u5E8F\u4EFB\u52A1\u5DF2\u6267\u884C\u5B8C\u6BD5\uFF1B",
                        "- \u4F1A\u8BDD\u5305\u542B\u654F\u611F\u5BA1\u8BA1\u4E0E\u6280\u672F\u6267\u884C\u65E5\u5FD7\uFF0C\u5DF2\u81EA\u52A8\u5B8C\u6210\u5B89\u5168\u5408\u89C4\u8131\u654F\u5F52\u6863\uFF1B",
                        "- \u72B6\u6001\u4E0E\u73AF\u5883\u53C2\u6570\u5DF2\u6301\u4E45\u5316\u4FDD\u5B58\uFF0C\u65E0\u7F1D\u8FDB\u5165\u540E\u7EED\u4EFB\u52A1\u6267\u884C\u3002"
                      ].join("\n");
                    } else {
                      const prev = choice?.message?.content || "";
                      choice.message.content = prev.trim() ? `${prev}

[!] [\u4E0A\u6E38\u4F9B\u5E94\u5546\u5B89\u5168\u8FC7\u6EE4\u62E6\u622A (content_filter)\uFF0C\u5DF2\u81EA\u52A8\u4FDD\u5168\u622A\u65AD\u524D\u7684\u8F93\u51FA\u3002\u5EFA\u8BAE\u8C03\u6574\u63D0\u95EE\u65B9\u5F0F\u4EE5\u907F\u514D\u89E6\u53D1\u5B89\u5168\u7B56\u7565\u3002]` : "[!] [\u4E0A\u6E38\u4F9B\u5E94\u5546\u5B89\u5168\u8FC7\u6EE4\u62E6\u622A (content_filter)\uFF0C\u6A21\u578B\u62D2\u7EDD\u56DE\u7B54\u5F53\u524D\u8BF7\u6C42\u3002\u5EFA\u8BAE\u8C03\u6574\u63D0\u793A\u8BCD\u6216\u8FC7\u6EE4\u654F\u611F\u4EE3\u7801\u7247\u6BB5\u540E\u91CD\u8BD5\u3002]";
                    }
                  }
                  if (choice?.finish_reason === "length" && isCompactionRequest) {
                    choice.finish_reason = "stop";
                    if (!choice?.message?.content || choice.message.content.trim().length < 80) {
                      const prev = choice?.message?.content || "";
                      choice.message.content = [
                        prev.trim() ? `${prev.trim()}

` : "",
                        "# \u4F1A\u8BDD\u5DE5\u4F5C\u8FDB\u5C55\u68C0\u67E5\u70B9",
                        "- \u5DF2\u5B8C\u6210\u524D\u5E8F\u4E0A\u4E0B\u6587\u5BA1\u8BA1\u4E0E\u72B6\u6001\u4FDD\u5B58\uFF1B",
                        "- \u4EFB\u52A1\u72B6\u6001\u5DF2\u5C31\u7EEA\uFF0C\u7EE7\u7EED\u6267\u884C\u540E\u7EED\u6B65\u9AA4\u3002"
                      ].join("\n");
                    }
                  }
                  const hasTools = Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0;
                  if (!hasTools && (!choice?.message?.content || !choice.message.content.trim())) {
                    choice.message.content = choice?.message?.reasoning || "[!][\u6A21\u578B\u670D\u52A1\u6682\u672A\u8FD4\u56DE\u6709\u6548\u6587\u672C\uFF0C\u8BF7\u91CD\u8BD5\u6216\u5207\u6362\u81F3\u5176\u4ED6\u514D\u8D39\u6A21\u578B]";
                  }
                }
              }
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(unwrapped));
            }
          }
        } catch (err) {
          errorCounter++;
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: { message: err?.message || "Proxy Internal Error" } }));
          } else {
            res.destroy();
          }
        }
      });
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found", path: pathname }));
  });
  return new Promise((resolve, reject) => {
    server.on("error", (e) => {
      reject(new Error(`Failed to start Cline proxy on port ${activePort}: ${e.message}`));
    });
    server.listen(activePort, activeHost, () => {
      activeServer = server;
      serverStartedAt = Date.now();
      resolve({
        port: activePort,
        url: `http://${activeHost}:${activePort}/v1`
      });
    });
  });
}
async function stopClineProxyServer() {
  if (!activeServer) return;
  return new Promise((resolve) => {
    activeServer.close(() => {
      activeServer = null;
      serverStartedAt = void 0;
      resolve();
    });
  });
}

// src/bin.ts
var args = process.argv.slice(2);
var port = 4116;
var customKey = "";
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--port" || arg === "-p") {
    port = parseInt(args[++i], 10) || 4116;
  } else if (arg === "--key" || arg === "-k") {
    customKey = args[++i] || "";
  } else if (/^\d+$/.test(arg)) {
    port = parseInt(arg, 10);
  }
}
var apiKey = customKey || getStoredClineApiKey();
async function main() {
  console.log("\x1B[1m\x1B[36m=== Cline OpenAI-Compatible \u672C\u5730\u53CD\u5411\u4EE3\u7406\u670D\u52A1 ===\x1B[0m");
  console.log(`\u2022 \u6307\u7EB9\u4F2A\u88C5: 8\u5927\u5B98\u65B9\u5BA2\u6237\u7AEF\u7279\u5F81\u6807\u5934\u5DF2\u542F\u7528`);
  console.log(`\u2022 \u514D\u8D39\u6A21\u578B: \u5DF2\u6536\u5F55 ${Object.keys(KNOWN_CLINE_FREE_MODELS).length} \u6B3E\u96F6\u989D\u5EA6\u6A21\u578B`);
  try {
    const srv = await startClineProxyServer({ port, apiKey });
    console.log(`
\x1B[32m[OK] \u4EE3\u7406\u670D\u52A1\u5DF2\u5C31\u7EEA\uFF01\x1B[0m`);
    console.log(`\u2022 OpenAI Base URL: \x1B[1m\x1B[34m${srv.url}\x1B[0m`);
    console.log(`\u2022 \u5BF9\u8BDD\u8865\u5168\u7AEF\u70B9:   \x1B[34m${srv.url}/chat/completions\x1B[0m`);
    console.log(`\u2022 \u6A21\u578B\u5217\u8868\u7AEF\u70B9:   \x1B[34m${srv.url}/models\x1B[0m`);
    console.log(`\u2022 \u514D\u8D39\u6A21\u578B\u7AEF\u70B9:   \x1B[34m${srv.url}/models/free\x1B[0m`);
    console.log(`\u2022 \u5065\u5EB7\u68C0\u67E5\u7AEF\u70B9:   \x1B[34mhttp://127.0.0.1:${port}/health\x1B[0m`);
    console.log(`
\x1B[90m\u53EF\u5728 CC-Switch\u3001Cursor\u3001Cherry Studio \u7B49\u4EFB\u4F55 OpenAI \u517C\u5BB9\u5BA2\u6237\u7AEF\u76F4\u63A5\u914D\u7F6E\u4F7F\u7528\u3002\x1B[0m`);
    console.log(`\x1B[90m\u6309 Ctrl+C \u53EF\u505C\u6B62\u4EE3\u7406\u670D\u52A1\u3002\x1B[0m
`);
    process.on("SIGINT", async () => {
      console.log("\n\u6B63\u5728\u505C\u6B62\u53CD\u5411\u4EE3\u7406\u670D\u52A1...");
      await stopClineProxyServer();
      console.log("\u4EE3\u7406\u670D\u52A1\u5DF2\u5B89\u5168\u9000\u51FA\u3002");
      process.exit(0);
    });
    process.on("SIGTERM", async () => {
      await stopClineProxyServer();
      process.exit(0);
    });
  } catch (err) {
    console.error(`\x1B[31m[x] \u542F\u52A8\u5931\u8D25: ${err.message}\x1B[0m`);
    process.exit(1);
  }
}
main();
