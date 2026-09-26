/**
 * Cline 免费模型本地反向代理服务 (Cline Reverse Proxy)
 *
 * 将 Cline 官方加密/指纹校验接口无缝反代为标准的 OpenAI ChatCompletions 接口：
 * 1. 自动注入官方 8 大指纹伪装标头 (x-client-version, User-Agent, x-platform 等)；
 * 2. 自动注入或兜底 Cline API Key；
 * 3. 完整支持 SSE 流式转发 (Streaming) 与非流式反序列化 (JSON)；
 * 4. 提供 /v1/models 与 /v1/chat/completions 标准端点，可直接供 Pi、CC-Switch、Cursor、Cherry Studio 等任何 OpenAI 客户端调用。
 */

import http from "node:http";
import {
	CLINE_BASE_URL,
	CLINE_CLIENT_HEADERS,
	KNOWN_CLINE_FREE_MODELS,
	resolveFreeModelId,
} from "./models-registry.js";
import { getStoredClineApiKey } from "./sync.js";
import type { ClineProxyServerOptions, ClineProxyStatus } from "./types.js";

let activeServer: http.Server | null = null;
let activePort = 4116;
let activeHost = "127.0.0.1";
let configuredApiKey = "";
let requestCounter = 0;
let errorCounter = 0;
let serverStartedAt: number | undefined;

export function getClineProxyStatus(): ClineProxyStatus {
	return {
		running: activeServer !== null && activeServer.listening,
		port: activeServer ? activePort : undefined,
		host: activeServer ? activeHost : undefined,
		url: activeServer ? `http://${activeHost}:${activePort}/v1` : undefined,
		requestCount: requestCounter,
		errorCount: errorCounter,
		startedAt: serverStartedAt,
	};
}

export function setProxyDefaultApiKey(key: string): void {
	if (key && key.trim()) {
		configuredApiKey = key.trim();
	}
}

function sleepWithSignal(ms: number, signal?: AbortSignal | null): Promise<void> {
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

/**
 * 将 SSE 流汇总解析为单次 ChatCompletion JSON 响应
 */
async function assembleSseStreamToJson(
	upstreamRes: Response,
	modelId: string,
): Promise<Record<string, unknown>> {
	if (!upstreamRes.body) {
		return {
			id: `gen-${Date.now()}`,
			object: "chat.completion",
			created: Math.floor(Date.now() / 1000),
			model: modelId,
			choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" }],
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
	let usage: Record<string, unknown> = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
	const toolCallsMap = new Map<number, { id: string; type: string; function: { name: string; arguments: string } }>();

	try {
		while (!done) {
			const { value, done: rDone } = await reader.read();
			done = rDone;
			if (value) {
				buffer += decoder.decode(value, { stream: !done });
				if (buffer.length > 2 * 1024 * 1024) {
					buffer = "";
					await reader.cancel("Buffer exceeded 2MB limit").catch(() => {});
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

						// 累计流式工具调用
						if (Array.isArray(choice?.delta?.tool_calls)) {
							for (const tc of choice.delta.tool_calls) {
								const idx = typeof tc.index === "number" ? tc.index : 0;
								let existing = toolCallsMap.get(idx);
								if (!existing) {
									existing = {
										id: tc.id || `call_${Date.now()}_${idx}`,
										type: tc.type || "function",
										function: { name: tc.function?.name || "", arguments: "" },
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
						// 忽略坏帧
					}
				}
			}
		}
	}
	} catch (err) {
		await reader.cancel(err).catch(() => {});
	}

	const promptTokens = Number(usage.prompt_tokens) || 0;
	let completionTokens = Number(usage.completion_tokens) || 0;
	if (completionTokens === 0) {
		completionTokens = Math.ceil((textContent.length + reasoningContent.length) / 4);
	}

	const messageObj: Record<string, unknown> = {
		role: "assistant",
		content: textContent || (toolCallsMap.size > 0 ? null : (reasoningContent || "")),
	};
	if (reasoningContent) {
		messageObj.reasoning_content = reasoningContent;
		messageObj.reasoning = reasoningContent;
	}
	if (toolCallsMap.size > 0) {
		messageObj.tool_calls = Array.from(toolCallsMap.entries())
			.sort(([a], [b]) => a - b)
			.map(([_, tc]) => tc);
		if (finishReason === "stop") {
			finishReason = "tool_calls";
		}
	}

	return {
		id,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model: modelId,
		choices: [{ index: 0, message: messageObj, finish_reason: finishReason }],
		usage: {
			prompt_tokens: promptTokens,
			completion_tokens: completionTokens,
			total_tokens: promptTokens + completionTokens,
		},
	};
}

/**
 * 创建并启动 Cline 本地反向代理服务器
 */
export async function startClineProxyServer(
	options: ClineProxyServerOptions = {},
): Promise<{ port: number; url: string }> {
	if (activeServer && activeServer.listening) {
		return { port: activePort, url: `http://${activeHost}:${activePort}/v1` };
	}

	activePort = options.port || 4116;
	activeHost = options.host || "127.0.0.1";
	if (options.apiKey) {
		configuredApiKey = options.apiKey.trim();
	}

	const server = http.createServer(async (req, res) => {
		// Host 标头安全校验：防止 DNS 重绑定与未授权局域网访问 (DNS Rebinding Protection)
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
		const allowedHosts = new Set(["127.0.0.1", "localhost", "::1", activeHost.toLowerCase()]);
		if (!allowedHosts.has(hostName)) {
			res.writeHead(403, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: { message: "Forbidden: Invalid Host header" } }));
			return;
		}

		// 1. CORS 安全防护：仅反射受信任的本地/编辑器 Origin
		const origin = req.headers.origin || "";
		const isTrustedOrigin =
			origin.startsWith("http://localhost:") ||
			origin.startsWith("http://127.0.0.1:") ||
			origin.startsWith("http://[::1]:") ||
			origin === "http://localhost" ||
			origin === "http://127.0.0.1" ||
			origin === "http://[::1]" ||
			origin.startsWith("vscode-webview://") ||
			origin.startsWith("vscode-file://");

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

		// 2. 健康检查 / 状态路由
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
					requestsHandled: requestCounter,
				}),
			);
			return;
		}

		// 3. 模型列表路由 (/v1/models 或 /models 或 /v1/models/free)
		if (pathname === "/v1/models" || pathname === "/models" || pathname === "/v1/models/free") {
			const onlyFree =
				pathname.endsWith("/free") ||
				parsedUrl.searchParams.get("free") === "true" ||
				parsedUrl.searchParams.get("free") === "1";

			const clientAuth = req.headers["authorization"] || "";
			const token =
				(clientAuth.startsWith("Bearer ") && clientAuth.slice(7).trim()) ||
				configuredApiKey ||
				getStoredClineApiKey();

			if (!onlyFree && token) {
				try {
					// 尝试向上游同步，失败则快速回退本地已知免费模型
					const upstreamRes = await fetch(`${CLINE_BASE_URL}/models`, {
						headers: {
							Authorization: `Bearer ${token}`,
							...CLINE_CLIENT_HEADERS,
						},
						signal: AbortSignal.timeout(10_000),
					}).catch(() => null);

					if (upstreamRes && upstreamRes.ok) {
						const data = await upstreamRes.json();
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify(data));
						return;
					}
				} catch {
					// 回退到本地内置免费模型字典
				}
			}

			const modelList = Object.values(KNOWN_CLINE_FREE_MODELS).map((m) => ({
				id: m.id,
				object: "model",
				created: Math.floor(Date.now() / 1000),
				owned_by: "cline",
				permission: [],
				root: m.id,
				parent: null,
			}));

			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ object: "list", data: modelList }));
			return;
		}

		// 4. 对话补全路由 (/v1/chat/completions 或 /chat/completions)
		if (pathname === "/v1/chat/completions" || pathname === "/chat/completions") {
			if (req.method !== "POST") {
				res.writeHead(405, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "Method Not Allowed" }));
				return;
			}

			requestCounter++;

			// 收集请求体（设置 10MB 上限防御堆内存耗尽 DoS 攻击）
			const MAX_BODY_BYTES = 10 * 1024 * 1024;
			let receivedBytes = 0;
			let exceeded = false;
			const chunks: Buffer[] = [];

			req.on("data", (chunk: Buffer) => {
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
					let payload: Record<string, unknown> = {};
					try {
						payload = JSON.parse(bodyText);
					} catch {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "Invalid JSON body" }));
						return;
					}

					// 解析模型：自动解析短别名、剔除 cline/ 前缀并自动追加 :free 保护
					const rawModel = typeof payload.model === "string" ? payload.model : "";
					const resolvedModel = resolveFreeModelId(rawModel);
					payload.model = resolvedModel;
					const modelId = resolvedModel;

					// 提取认证 Token：优先使用请求头 Bearer Token，其次使用本地配置或存储的 Key
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
									type: "invalid_request_error",
								},
							}),
						);
						return;
					}

					const upstreamHeaders: Record<string, string> = {
						Authorization: `Bearer ${tokenToUse}`,
						"Content-Type": "application/json",
						...CLINE_CLIENT_HEADERS,
					};

					const isStreaming = payload.stream === true;
					const abortController = new AbortController();
					let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

					const onClientAbort = () => {
						abortController.abort();
						reader?.cancel("Client disconnected").catch(() => {});
					};
					req.on("close", onClientAbort);
					res.on("close", onClientAbort);

					// 向上游 Cline 官方 API 发起转发（严守同模型重试，绝不降级模型）
					let upstreamRes: Response | undefined;
					const maxProxyRetries = 3;
					for (let attempt = 0; attempt <= maxProxyRetries; attempt++) {
						if (abortController.signal.aborted) break;
						try {
							upstreamRes = await fetch(`${CLINE_BASE_URL}/chat/completions`, {
								method: "POST",
								headers: upstreamHeaders,
								body: JSON.stringify(payload),
								signal: abortController.signal,
							});
							if (upstreamRes.ok || (upstreamRes.status < 500 && upstreamRes.status !== 429)) {
								break;
							}
							if (attempt < maxProxyRetries) {
								const isTestEnv = !!process.env.TEST_PI_MODELS_PATH || process.env.NODE_ENV === "test";
								const baseDelay = isTestEnv ? 10 : Math.min(1000 * Math.pow(2, attempt), 5000);
								const delayMs = isTestEnv ? 10 : Math.max(10, Math.floor(Math.random() * baseDelay));
								await sleepWithSignal(delayMs, abortController.signal);
							}
						} catch (netErr: any) {
							if (netErr?.name === "AbortError" || abortController.signal.aborted) {
								return;
							}
							if (attempt < maxProxyRetries) {
								const isTestEnv = !!process.env.TEST_PI_MODELS_PATH || process.env.NODE_ENV === "test";
								const baseDelay = isTestEnv ? 10 : Math.min(1000 * Math.pow(2, attempt), 5000);
								const delayMs = isTestEnv ? 10 : Math.max(10, Math.floor(Math.random() * baseDelay));
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
						let errorJson: unknown;
						try {
							errorJson = JSON.parse(errText);
						} catch {
							errorJson = {
								error: {
									message: errText.slice(0, 500) || upstreamRes?.statusText || "Upstream request failed",
									code: status,
								},
							};
						}
						if (!res.headersSent) {
							res.writeHead(status, { "Content-Type": "application/json" });
							res.end(JSON.stringify(errorJson));
						}
						return;
					}

					if (isStreaming) {
						// 流式转发 SSE
						res.writeHead(200, {
							"Content-Type": "text/event-stream; charset=utf-8",
							"Cache-Control": "no-cache, no-transform",
							Connection: "keep-alive",
						});

						if (upstreamRes.body) {
							reader = upstreamRes.body.getReader();
							const decoder = new TextDecoder();
							let buffer = "";
							let hasSentAnyContent = false;
							try {
								while (true) {
									const { done, value } = await reader.read();
									if (done) break;
									if (value) {
										buffer += decoder.decode(value, { stream: true });
										if (buffer.length > 2 * 1024 * 1024) {
											buffer = "";
											await reader.cancel("Buffer exceeded 2MB limit").catch(() => {});
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
													// 拦截上游内嵌错误帧（如 HTTP 200 但 choices: [] 且 error: {...}）
													if (chunk.error && (!chunk.choices || chunk.choices.length === 0)) {
														const errMsg = chunk.error.message || "Upstream provider error";
														const synthetic = {
															id: chunk.id || `err-${Date.now()}`,
															object: "chat.completion.chunk",
															created: Math.floor(Date.now() / 1000),
															model: modelId,
															choices: [
																{
																	index: 0,
																	delta: { content: `\n\n[!][Cline 供应商异常: ${errMsg}，请重试或切换其他免费模型]` },
																	finish_reason: "stop",
																},
															],
														};
														res.write(`data: ${JSON.stringify(synthetic)}\n\n`);
														hasSentAnyContent = true;
														continue;
													}

													const choice = chunk.choices?.[0];
													const rawReasoning = choice?.delta?.reasoning_content || choice?.delta?.reasoning || (choice?.delta as any)?.thinking;

													if (choice?.delta?.content || (Array.isArray(choice?.delta?.tool_calls) && choice.delta.tool_calls.length > 0) || rawReasoning) {
														hasSentAnyContent = true;
													}

													// 规范化思考过程：全量保障 CoT 完整转发（双向写入 reasoning 与 reasoning_content）
													if (rawReasoning && choice?.delta) {
														choice.delta.reasoning_content = rawReasoning;
														choice.delta.reasoning = rawReasoning;
														res.write(`data: ${JSON.stringify(chunk)}\n\n`);
														continue;
													}
												} catch {
													// 忽略解析错误，保持原样输出
												}
											}
											res.write(line + "\n");
										}
									}
								}
								// 防御空输出：若整个流结束既无 content 也无 tool_calls，注入兜底避免客户端崩溃
								if (!hasSentAnyContent) {
									const emptyGuardChunk = {
										id: `guard-${Date.now()}`,
										object: "chat.completion.chunk",
										created: Math.floor(Date.now() / 1000),
										model: modelId,
										choices: [
											{
												index: 0,
												delta: { content: "[!][当前模型节点暂时无响应，请重试或使用 /cline free 切换高可用模型]" },
												finish_reason: "stop",
											},
										],
									};
									res.write(`data: ${JSON.stringify(emptyGuardChunk)}\n\n`);
								}
								if (buffer) {
									res.write(buffer);
								}
							} catch (streamErr) {
								await reader?.cancel(streamErr).catch(() => {});
								if (!res.headersSent) {
									res.writeHead(502, { "Content-Type": "application/json" });
									res.end(JSON.stringify({ error: { message: "Stream reading failed" } }));
								} else {
									res.destroy();
								}
							} finally {
								if (!res.writableEnded) {
									res.end();
								}
							}
						} else {
							res.end();
						}
					} else {
						// 非流式转发：若上游返回 SSE 则装配为 JSON，若直接为 JSON 则解包并规范化
						const contentType = upstreamRes.headers.get("content-type") || "";
						if (contentType.includes("text/event-stream")) {
							const assembledJson = await assembleSseStreamToJson(upstreamRes, modelId);
							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify(assembledJson));
						} else {
							let rawJson: unknown;
							try {
								rawJson = await upstreamRes.json();
							} catch {
								errorCounter++;
								res.writeHead(502, { "Content-Type": "application/json" });
								res.end(JSON.stringify({ error: { message: "Invalid JSON response from upstream provider" } }));
								return;
							}
							// 核心解包：Cline 官方接口会将非流式结果包裹在 { data: { ... }, success: true }
							// 标准 OpenAI 客户端期待根对象包含 choices，此处透明解包
							const unwrapped: Record<string, any> = (rawJson && typeof rawJson === "object" && (rawJson as any).data?.choices)
								? (rawJson as any).data
								: (rawJson as Record<string, any>) || {};

							if (Array.isArray(unwrapped.choices) && unwrapped.choices.length > 0) {
								for (const choice of unwrapped.choices) {
									if (choice?.message?.reasoning && !choice.message.reasoning_content) {
										choice.message.reasoning_content = choice.message.reasoning;
									}
									// 防御 content 与 tool_calls 同时为空导致的崩溃
									const hasTools = Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0;
									if (!hasTools && (!choice?.message?.content || !choice.message.content.trim())) {
										choice.message.content = choice?.message?.reasoning || "[!][模型服务暂未返回有效文本，请重试或切换至其他免费模型]";
									}
								}
							}

							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify(unwrapped));
						}
					}
				} catch (err: any) {
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

		// 404 兜底
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Not Found", path: pathname }));
	});

	return new Promise((resolve, reject) => {
		server.on("error", (e: any) => {
			reject(new Error(`Failed to start Cline proxy on port ${activePort}: ${e.message}`));
		});

		server.listen(activePort, activeHost, () => {
			activeServer = server;
			serverStartedAt = Date.now();
			resolve({
				port: activePort,
				url: `http://${activeHost}:${activePort}/v1`,
			});
		});
	});
}

/**
 * 停止本地反向代理服务器
 */
export async function stopClineProxyServer(): Promise<void> {
	if (!activeServer) return;
	return new Promise((resolve) => {
		activeServer!.close(() => {
			activeServer = null;
			serverStartedAt = undefined;
			resolve();
		});
	});
}
