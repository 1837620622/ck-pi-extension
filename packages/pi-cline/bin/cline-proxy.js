#!/usr/bin/env node

// src/proxy.ts
import http from "node:http";

// src/models-registry.ts
var CLINE_BASE_URL = "https://api.cline.bot/api/v1";
var CLINE_DEFAULT_KEY = "sk_0ea2446a7ca63262db183e2e3816f503cdd65fb0f695b5629b2b85126f5625dd";
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
  "inclusionai/ling-3.0-flash-fin:free": {
    id: "inclusionai/ling-3.0-flash-fin:free",
    name: "InclusionAI Ling 3.0 Flash Fin (Free)",
    contextWindow: 262144,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "inclusionai/ling-3.0-flash-sante:free": {
    id: "inclusionai/ling-3.0-flash-sante:free",
    name: "InclusionAI Ling 3.0 Flash Sante (Free)",
    contextWindow: 262144,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "nvidia/nemotron-3.5-lightning:free": {
    id: "nvidia/nemotron-3.5-lightning:free",
    name: "NVIDIA Nemotron 3.5 Lightning (Free)",
    contextWindow: 262144,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "nvidia/nemotron-3-ultra-550b-a55b:free": {
    id: "nvidia/nemotron-3-ultra-550b-a55b:free",
    name: "NVIDIA Nemotron 3 Ultra 550B (Free)",
    contextWindow: 1e6,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": {
    id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    name: "NVIDIA Nemotron 3 Nano Omni Reasoning (Free)",
    contextWindow: 131072,
    maxTokens: 32768,
    reasoning: true,
    input: ["text", "image"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "nvidia/nemotron-3-super-120b-a12b:free": {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "NVIDIA Nemotron 3 Super 120B (Free)",
    contextWindow: 262144,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "nvidia/nemotron-3.5-content-safety:free": {
    id: "nvidia/nemotron-3.5-content-safety:free",
    name: "NVIDIA Nemotron 3.5 Content Safety (Free)",
    contextWindow: 131072,
    maxTokens: 16384,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "cohere/north-mini-code:free": {
    id: "cohere/north-mini-code:free",
    name: "Cohere North Mini Code (Free)",
    contextWindow: 131072,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "dots-studio/dots-3-note-preview:free": {
    id: "dots-studio/dots-3-note-preview:free",
    name: "Dots Studio Dots 3 Note Preview (Free)",
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
    name: "Liquid LFM 2.5 2.6B (Free)",
    contextWindow: 32768,
    maxTokens: 8192,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "openrouter/free": {
    id: "openrouter/free",
    name: "OpenRouter Auto Free Router",
    contextWindow: 2e5,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "typesafe/jev-router": {
    id: "typesafe/jev-router",
    name: "TypeSafe JEV Router (GPT-6 Luna Free)",
    contextWindow: 128e3,
    maxTokens: 16384,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "poolside/laguna-s-2.1:free": {
    id: "poolside/laguna-s-2.1:free",
    name: "Poolside Laguna S 2.1 (Free)",
    contextWindow: 131072,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "openrouter/fusion": {
    id: "openrouter/fusion",
    name: "OpenRouter Fusion (Smart Meta Router - Free)",
    contextWindow: 262144,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "openrouter/pareto-code": {
    id: "openrouter/pareto-code",
    name: "OpenRouter Pareto Code (Coding Specialist - Free)",
    contextWindow: 262144,
    maxTokens: 32768,
    reasoning: true,
    input: ["text"],
    thinkingLevelMap: STANDARD_THINKING_LEVELS,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    isFree: true
  },
  "openai/gpt-4o-mini": {
    id: "openai/gpt-4o-mini",
    name: "OpenAI GPT-4o Mini (Cline)",
    contextWindow: 128e3,
    maxTokens: 16384,
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0.15 },
    isFree: false
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
  if (lower === "fusion") {
    return "openrouter/fusion";
  }
  if (lower === "code" || lower === "pareto" || lower === "pareto-code") {
    return "openrouter/pareto-code";
  }
  if (lower === "luna" || lower === "jev") {
    return "typesafe/jev-router";
  }
  if (lower === "ling" || lower === "flash-fin") {
    return "inclusionai/ling-3.0-flash-fin:free";
  }
  if (lower === "sante" || lower === "flash-sante") {
    return "inclusionai/ling-3.0-flash-sante:free";
  }
  if (lower === "550b" || lower === "ultra") {
    return "nvidia/nemotron-3-ultra-550b-a55b:free";
  }
  if (lower === "reasoning" || lower === "nano-omni") {
    return "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
  }
  if (lower === "120b" || lower === "super-120b") {
    return "nvidia/nemotron-3-super-120b-a12b:free";
  }
  if (lower === "lightning") {
    return "nvidia/nemotron-3.5-lightning:free";
  }
  if (lower === "laguna") {
    return "poolside/laguna-s-2.1:free";
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

// src/proxy.ts
var activeServer = null;
var activePort = 4116;
var activeHost = "127.0.0.1";
var configuredApiKey = CLINE_DEFAULT_KEY;
var requestCounter = 0;
var errorCounter = 0;
var serverStartedAt;
async function assembleSseStreamToJson(upstreamRes, modelId) {
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
  while (!done) {
    const { value, done: rDone } = await reader.read();
    done = rDone;
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
          try {
            const chunk = JSON.parse(trimmed.slice(6));
            if (chunk.id) id = chunk.id;
            const choice = chunk.choices?.[0];
            if (choice?.delta?.content) textContent += choice.delta.content;
            if (choice?.delta?.reasoning_content) reasoningContent += choice.delta.reasoning_content;
            if (choice?.delta?.reasoning) reasoningContent += choice.delta.reasoning;
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
  const promptTokens = Number(usage.prompt_tokens) || 0;
  let completionTokens = Number(usage.completion_tokens) || 0;
  if (completionTokens === 0) {
    completionTokens = Math.ceil((textContent.length + reasoningContent.length) / 4);
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
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, *");
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
      if (!onlyFree) {
        try {
          const upstreamRes = await fetch(`${CLINE_BASE_URL}/models`, {
            headers: {
              Authorization: `Bearer ${configuredApiKey}`,
              ...CLINE_CLIENT_HEADERS
            }
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
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", async () => {
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
          const clientAuth = req.headers["authorization"] || "";
          let tokenToUse = configuredApiKey;
          if (clientAuth.startsWith("Bearer ") && clientAuth.slice(7).trim().startsWith("sk_")) {
            tokenToUse = clientAuth.slice(7).trim();
          }
          const upstreamHeaders = {
            Authorization: `Bearer ${tokenToUse}`,
            "Content-Type": "application/json",
            ...CLINE_CLIENT_HEADERS
          };
          const isStreaming = payload.stream === true;
          const upstreamRes = await fetch(`${CLINE_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: upstreamHeaders,
            body: JSON.stringify(payload)
          });
          if (!upstreamRes.ok) {
            errorCounter++;
            const errText = await upstreamRes.text().catch(() => "");
            res.writeHead(upstreamRes.status, { "Content-Type": "application/json" });
            res.end(errText || JSON.stringify({ error: upstreamRes.statusText }));
            return;
          }
          if (isStreaming) {
            res.writeHead(200, {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache, no-transform",
              Connection: "keep-alive"
            });
            if (upstreamRes.body) {
              const reader = upstreamRes.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              let hasSentAnyContent = false;
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (value) {
                    buffer += decoder.decode(value, { stream: true });
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

\u26A0\uFE0F [Cline \u4F9B\u5E94\u5546\u5F02\u5E38: ${errMsg}\uFF0C\u8BF7\u91CD\u8BD5\u6216\u5207\u6362\u5176\u4ED6\u514D\u8D39\u6A21\u578B]` },
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
                          if (choice?.delta?.content || Array.isArray(choice?.delta?.tool_calls) && choice.delta.tool_calls.length > 0) {
                            hasSentAnyContent = true;
                          }
                          if (choice?.delta?.reasoning && !choice.delta.reasoning_content) {
                            choice.delta.reasoning_content = choice.delta.reasoning;
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
                        delta: { content: "\u26A0\uFE0F [\u5F53\u524D\u6A21\u578B\u8282\u70B9\u6682\u65F6\u65E0\u54CD\u5E94\uFF0C\u8BF7\u91CD\u8BD5\u6216\u4F7F\u7528 /cline free \u5207\u6362\u9AD8\u53EF\u7528\u6A21\u578B]" },
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
              } finally {
                res.end();
              }
            } else {
              res.end();
            }
          } else {
            const contentType = upstreamRes.headers.get("content-type") || "";
            if (contentType.includes("text/event-stream")) {
              const assembledJson = await assembleSseStreamToJson(upstreamRes, modelId);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(assembledJson));
            } else {
              const rawJson = await upstreamRes.json();
              const unwrapped = rawJson && typeof rawJson === "object" && rawJson.data?.choices ? rawJson.data : rawJson;
              if (Array.isArray(unwrapped.choices) && unwrapped.choices.length > 0) {
                for (const choice of unwrapped.choices) {
                  if (choice?.message?.reasoning && !choice.message.reasoning_content) {
                    choice.message.reasoning_content = choice.message.reasoning;
                  }
                  const hasTools = Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0;
                  if (!hasTools && (!choice?.message?.content || !choice.message.content.trim())) {
                    choice.message.content = choice?.message?.reasoning || "\u26A0\uFE0F [\u6A21\u578B\u670D\u52A1\u6682\u672A\u8FD4\u56DE\u6709\u6548\u6587\u672C\uFF0C\u8BF7\u91CD\u8BD5\u6216\u5207\u6362\u81F3\u5176\u4ED6\u514D\u8D39\u6A21\u578B]";
                  }
                }
              }
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(unwrapped));
            }
          }
        } catch (err) {
          errorCounter++;
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message || "Proxy Internal Error" }));
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

// src/sync.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
      if (typeof auth?.cline?.key === "string" && auth.cline.key.trim()) {
        return auth.cline.key.trim();
      }
      if (typeof auth?.["cline-free"]?.key === "string" && auth["cline-free"].key.trim()) {
        return auth["cline-free"].key.trim();
      }
    }
  } catch {
  }
  try {
    if (existsSync(modelsPath)) {
      const models = JSON.parse(readFileSync(modelsPath, "utf-8"));
      const prov = models?.providers?.cline || models?.cline;
      if (typeof prov?.apiKey === "string" && prov.apiKey.trim()) {
        return prov.apiKey.trim();
      }
    }
  } catch {
  }
  return CLINE_DEFAULT_KEY;
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
  console.log("\x1B[1m\x1B[36m=== \u{1F916} Cline OpenAI-Compatible \u672C\u5730\u53CD\u5411\u4EE3\u7406\u670D\u52A1 ===\x1B[0m");
  console.log(`\u2022 \u6307\u7EB9\u4F2A\u88C5: 8\u5927\u5B98\u65B9\u5BA2\u6237\u7AEF\u7279\u5F81\u6807\u5934\u5DF2\u542F\u7528`);
  console.log(`\u2022 \u514D\u8D39\u6A21\u578B: \u5DF2\u6536\u5F55 ${Object.keys(KNOWN_CLINE_FREE_MODELS).length} \u6B3E\u96F6\u989D\u5EA6\u6A21\u578B`);
  try {
    const srv = await startClineProxyServer({ port, apiKey });
    console.log(`
\x1B[32m\u2714 \u4EE3\u7406\u670D\u52A1\u5DF2\u5C31\u7EEA\uFF01\x1B[0m`);
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
    console.error(`\x1B[31m\u2716 \u542F\u52A8\u5931\u8D25: ${err.message}\x1B[0m`);
    process.exit(1);
  }
}
main();
