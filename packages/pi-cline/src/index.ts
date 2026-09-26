/**
 * ck-pi-cline: Cline Account / API 免费模型管理、伪装反代与会话护航插件
 *
 * 核心功能：
 * 1. 自动注入 Cline 官方 8 大客户端特征指纹与认证凭证；
 * 2. 免费模型自动反代与本地代理服务器 (/cline proxy [start|stop])；
 * 3. 实时同步远端模型目录与上下文规格至 models.json 与 CC-Switch；
 * 4. 深度上下文超限防护 (Compaction 标签裁剪、超大 Tool 截断、多轮安全切分)；
 * 5. 交互式 /cline 命令支持模型速切、Key 管理与代理监控。
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	CLINE_BASE_URL,
	CLINE_CLIENT_HEADERS,
	CLINE_DEFAULT_KEY,
	CLINE_PROVIDER_ID,
	formatClineModelCard,
	formatClineModelDetailCard,
	formatClineModelsTable,
	formatThinkingSummary,
	formatTokens,
	inferClineModelCapabilities,
	KNOWN_CLINE_FREE_MODELS,
	resolveFreeModelId,
} from "./models-registry.js";
export {
	CLINE_BASE_URL,
	CLINE_CLIENT_HEADERS,
	CLINE_DEFAULT_KEY,
	CLINE_PROVIDER_ID,
	formatClineModelCard,
	formatClineModelDetailCard,
	formatClineModelsTable,
	formatThinkingSummary,
	formatTokens,
	inferClineModelCapabilities,
	KNOWN_CLINE_FREE_MODELS,
	resolveFreeModelId,
};
import {
	getClineProxyStatus,
	setProxyDefaultApiKey,
	startClineProxyServer,
	stopClineProxyServer,
} from "./proxy.js";
export { getClineProxyStatus, setProxyDefaultApiKey, startClineProxyServer, stopClineProxyServer };
import {
	fetchClineModelCatalog,
	getStoredClineApiKey,
	syncClineConfiguration,
	updateCcSwitchDbForCline,
} from "./sync.js";
export {
	fetchClineModelCatalog,
	getStoredClineApiKey,
	syncClineConfiguration,
	updateCcSwitchDbForCline,
};
import type { ClineModelDefinition } from "./types.js";

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
 * 判断当前目标是否属于 Cline 模型
 */
export function isClineModelTarget(
	model?: { provider?: string; id?: string },
	payloadModel?: string,
): boolean {
	const prov = model?.provider?.toLowerCase();
	if (prov === CLINE_PROVIDER_ID || prov === "cline-free" || prov === "cline-bot") {
		return true;
	}

	const id = (model?.id || payloadModel || "").toLowerCase();
	if (
		id.startsWith("inclusionai/") ||
		id.startsWith("dots-studio/") ||
		id.startsWith("typesafe/jev-router") ||
		id.startsWith("poolside/") ||
		id.startsWith("nvidia/nemotron") ||
		id.startsWith("cohere/north") ||
		id.startsWith("liquid/lfm") ||
		id === "openrouter/free" ||
		id === "openrouter/fusion" ||
		id === "openrouter/pareto-code"
	) {
		return true;
	}

	return false;
}

/**
 * 从不同形式的消息 content (string 或 Array<{type, text}>) 中提取纯文本
 */
export function getMessageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((b) => b && typeof b === "object" && typeof (b as any).text === "string")
			.map((b) => (b as any).text)
			.join("\n");
	}
	return "";
}

/**
 * 安全更新消息中的文本内容
 */
export function updateMessageText(msg: Record<string, unknown>, newText: string): void {
	if (typeof msg.content === "string") {
		msg.content = newText;
	} else if (Array.isArray(msg.content)) {
		const nonText = msg.content.filter((b) => b && typeof b === "object" && (b as any).type !== "text");
		msg.content = [{ type: "text", text: newText }, ...nonText];
	} else {
		msg.content = newText;
	}
}

/**
 * 寻找符合 OpenAI ChatCompletions 协议切分规范的安全切点
 */
export function findSafeUserCutPoint(messages: unknown[], maxTailChars: number): number {
	let accumulatedChars = 0;
	let userCutIndex = -1;
	for (let i = messages.length - 1; i >= 2; i--) {
		const msg = messages[i] as Record<string, unknown> | null | undefined;
		if (!msg || typeof msg !== "object") continue;
		try {
			accumulatedChars += JSON.stringify(msg).length;
		} catch {
			// 忽略循环引用或不可序列化对象
		}
		if (msg.role === "user") {
			userCutIndex = i;
			if (accumulatedChars >= maxTailChars) {
				break;
			}
		}
	}
	return userCutIndex;
}

/**
 * 判定是否为 Compaction / 压缩总结任务请求
 */
export function isCompactionOrSummaryRequest(payload: Record<string, unknown>): boolean {
	if (payload.tool_choice === "none") return true;

	if (Array.isArray(payload.messages)) {
		for (const msg of payload.messages) {
			if (msg && typeof msg === "object") {
				const text = getMessageText((msg as any).content).toLowerCase();
				if (
					text.includes("<conversation>") ||
					text.includes("<previous-summary>") ||
					text.includes("summarize") ||
					text.includes("summary") ||
					text.includes("compress") ||
					text.includes("compact")
				) {
					return true;
				}
			}
		}
	}

	if (payload.stream === false) return true;
	return false;
}

/**
 * Cline 上下文超限全自动修剪与防护引擎
 */
export function pruneClineContext(payload: Record<string, unknown>): boolean {
	if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
		return false;
	}

	let modified = false;

	// 1. Tool 消息超大内容截断 (防止单个命令输出几兆文本撑爆上下文)
	for (const msg of payload.messages) {
		if (msg && typeof msg === "object") {
			const m = msg as Record<string, unknown>;
			if (m.role === "tool") {
				const toolText = getMessageText(m.content);
				if (toolText.length > 25_000 && !toolText.includes("Tool output truncated to 25,000 chars")) {
					const notice =
						"\n\n[... Cline Guard: Tool output truncated to 25,000 chars to avoid context overflow ...]";
					const maxBody = Math.max(0, 25_000 - notice.length);
					const newText = toolText.slice(0, maxBody) + notice;
					updateMessageText(m, newText);
					modified = true;
				}
			}
		}
	}

	// 2. Compaction / Summarization <conversation> 标签深度修剪
	for (const msg of payload.messages) {
		if (msg && typeof msg === "object") {
			const m = msg as Record<string, unknown>;
			let currentText = getMessageText(m.content);
			if (currentText.includes("<conversation>")) {
				const startTag = "<conversation>";
				const endTag = "</conversation>";
				const startIndex = currentText.indexOf(startTag);
				const endIndex = currentText.indexOf(endTag);

				if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
					const prefix = currentText.slice(0, startIndex + startTag.length);
					const convoBody = currentText.slice(startIndex + startTag.length, endIndex);
					const suffix = currentText.slice(endIndex);

					if (convoBody.length > 80_000) {
						const headChars = 25_000;
						const tailChars = 45_000;
						const head = convoBody.slice(0, headChars);
						const tail = convoBody.slice(-tailChars);
						const omittedChars = convoBody.length - headChars - tailChars;
						const omittedTokensEst = Math.round(omittedChars / 4);
						const notice = `\n\n[... Cline Compaction Guard: Omitted ${omittedChars} intermediate characters (~${omittedTokensEst} tokens) of verbose logs to fit model context limit & optimize speed ...]\n\n`;

						currentText = prefix + head + notice + tail + suffix;
						updateMessageText(m, currentText);
						modified = true;
					}
				}
			}

			if (currentText.includes("<previous-summary>")) {
				const pStartTag = "<previous-summary>";
				const pEndTag = "</previous-summary>";
				const pStart = currentText.indexOf(pStartTag);
				const pEnd = currentText.indexOf(pEndTag);
				if (pStart !== -1 && pEnd !== -1 && pEnd > pStart) {
					const pPrefix = currentText.slice(0, pStart + pStartTag.length);
					const pBody = currentText.slice(pStart + pStartTag.length, pEnd);
					const pSuffix = currentText.slice(pEnd);
					if (pBody.length > 40_000) {
						const pHead = pBody.slice(0, 15_000);
						const pTail = pBody.slice(-20_000);
						const pOmitted = pBody.length - 35_000;
						const pNotice = `\n\n[... Cline Compaction Guard: Omitted ${pOmitted} intermediate chars of previous summary ...]\n\n`;
						currentText = pPrefix + pHead + pNotice + pTail + pSuffix;
						updateMessageText(m, currentText);
						modified = true;
					}
				}
			}

			if (!currentText.includes("<conversation>") && currentText.length > 90_000 && isCompactionOrSummaryRequest(payload)) {
				const head = currentText.slice(0, 30_000);
				const tail = currentText.slice(-50_000);
				const omitted = currentText.length - 80_000;
				const notice = `\n\n[... Cline Compaction Guard: Truncated ${omitted} intermediate characters to fit model context limit ...]\n\n`;
				updateMessageText(m, head + notice + tail);
				modified = true;
			}
		}
	}

	// 3. 多轮交互超长上下文修剪
	const totalChars = JSON.stringify(payload.messages).length;
	if (payload.messages.length > 4 && totalChars > 180_000) {
		const userCutIndex = findSafeUserCutPoint(payload.messages, 120_000);
		if (userCutIndex > 2) {
			const head = payload.messages.slice(0, 2);
			const tail = payload.messages.slice(userCutIndex);
			const omittedCount = userCutIndex - 2;
			if (omittedCount > 0) {
				const firstUser = tail[0] as Record<string, unknown>;
				const userOriginalText = getMessageText(firstUser.content);
				const note = `[Cline Guard: Omitted ${omittedCount} intermediate turns to fit context limit]\n\n`;
				updateMessageText(firstUser, note + userOriginalText);
				payload.messages = [...head, ...tail];
				modified = true;
			}
		}
	}

	return modified;
}

/**
 * 全局 Fetch 拦截器，保证所有发往 Cline API 或本地代理的请求均具备官方指纹与上下文保护
 */
export function installClineFetchInterceptor(targetGlobal: typeof globalThis = globalThis): void {
	const CLINE_FETCH_INTERCEPTOR = Symbol.for("ck.cline.fetch.interceptor");
	if ((targetGlobal as any)[CLINE_FETCH_INTERCEPTOR]) {
		return;
	}
	(targetGlobal as any)[CLINE_FETCH_INTERCEPTOR] = true;

	const originalFetch = targetGlobal.fetch;
	targetGlobal.fetch = async function clineFetchInterceptor(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		let targetUrl = "";
		const headers = new Headers();

		if (typeof input === "string") {
			targetUrl = input;
		} else if (input instanceof URL) {
			targetUrl = input.href;
		} else if (input && typeof (input as Request).url === "string") {
			targetUrl = (input as Request).url;
			const reqHeaders = (input as Request).headers;
			if (reqHeaders && typeof reqHeaders.forEach === "function") {
				reqHeaders.forEach((val, key) => headers.set(key, val));
			}
		} else {
			return originalFetch.call(this, input, init);
		}

		if (!targetUrl.includes("api.cline.bot/api/v1") && !targetUrl.includes(":4116/v1")) {
			return originalFetch.call(this, input, init);
		}

		if (init?.headers) {
			const initHeaders = new Headers(init.headers);
			initHeaders.forEach((val, key) => headers.set(key, val));
		}

		// 补齐 8 大官方客户端标头
		for (const [key, value] of Object.entries(CLINE_CLIENT_HEADERS)) {
			if (!headers.has(key)) {
				headers.set(key, value);
			}
		}

		// 若未提供 Authorization，则注入存储的 Key
		if (!headers.has("Authorization")) {
			const storedKey = getStoredClineApiKey();
			headers.set("Authorization", `Bearer ${storedKey}`);
		}

		// 检查修补请求体
		let newBody = init?.body;
		let targetModelId = "openrouter/free";
		if (typeof init?.body === "string" && init.body.trim().startsWith("{")) {
			try {
				const payload = JSON.parse(init.body) as Record<string, unknown>;
				let modified = false;

				// 模型路由与别名解析
				if (typeof payload.model === "string") {
					const resolved = resolveFreeModelId(payload.model);
					payload.model = resolved;
					targetModelId = resolved;
					modified = true;
				}

				if (pruneClineContext(payload)) {
					modified = true;
				}

				// 安全限制 max_tokens
				const isCompaction = isCompactionOrSummaryRequest(payload);
				const maxAllowedOutput = isCompaction ? 8192 : 32768;
				if (typeof payload.max_tokens === "number" && (payload.max_tokens as number) > maxAllowedOutput) {
					payload.max_tokens = maxAllowedOutput;
					modified = true;
				}
				if (typeof payload.max_completion_tokens === "number" && (payload.max_completion_tokens as number) > maxAllowedOutput) {
					payload.max_completion_tokens = maxAllowedOutput;
					modified = true;
				}

				if (modified) {
					newBody = JSON.stringify(payload);
				}
			} catch {
				// 忽略坏 JSON
			}
		}

		const newInit: RequestInit = {
			...init,
			headers,
			body: newBody,
		};

		let res!: Response;
		const maxRetries = 3;

		// 核心同模型指数退避重试 (Exponential Backoff Retry on Same Model)
		// 严守模型质量底线：遭遇 500/502/503/504/524 或 429 时，透明进行同模型指数退避重试，绝不擅自降级或切换备用模型
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			if (newInit.signal?.aborted) break;
			try {
				res = await originalFetch.call(this, targetUrl, newInit);
				// 若不是重试状态码（500/502/503/504/524/429），或者已经是成功的 2xx，直接返回/退出重试循环
				if (res.ok || (res.status < 500 && res.status !== 429)) {
					break;
				}
				// 遭遇 500/502/503/504/524 或 429 报错，且还有重试机会
				if (attempt < maxRetries) {
					const isTestEnv = !!process.env.TEST_PI_MODELS_PATH || process.env.NODE_ENV === "test";
					const baseDelay = isTestEnv ? 10 : Math.min(1000 * Math.pow(2, attempt), 5000);
					const delayMs = isTestEnv ? 10 : Math.max(10, Math.floor(Math.random() * baseDelay));
					await sleepWithSignal(delayMs, newInit.signal);
				}
			} catch (err: any) {
				if (err?.name === "AbortError" || newInit.signal?.aborted) {
					throw err;
				}
				if (attempt < maxRetries) {
					const isTestEnv = !!process.env.TEST_PI_MODELS_PATH || process.env.NODE_ENV === "test";
					const baseDelay = isTestEnv ? 10 : Math.min(1000 * Math.pow(2, attempt), 5000);
					const delayMs = isTestEnv ? 10 : Math.max(10, Math.floor(Math.random() * baseDelay));
					await sleepWithSignal(delayMs, newInit.signal);
				} else {
					throw err;
				}
			}
		}

		// 核心解包：Cline 官方 API 会将非流式结果包裹在 { data: { choices: [...] }, success: true } 中
		// 标准 OpenAI 客户端与 Pi 内置 openai-completions 适配器期待根节点拥有 choices，此处透明解包
		const contentType = res.headers.get("content-type") || "";

		// 1. 流式响应拦截与容错守护 (SSE TransformStream)
		// 拦截并合成上游隐式错误帧，确保 Pi 与 OpenAI 客户端绝不因 choices: [] 抛出 model output error
		if (targetUrl.includes("chat/completions") && contentType.includes("text/event-stream") && res.body) {
			const decoder = new TextDecoder();
			const encoder = new TextEncoder();
			let buffer = "";
			let hasSentAnyContent = false;
			let targetModelId = "openrouter/free";
			if (typeof newBody === "string") {
				try {
					const p = JSON.parse(newBody);
					if (p.model) targetModelId = p.model;
				} catch {
					// 忽略
				}
			}

			const transform = new TransformStream({
				transform(chunk, controller) {
					buffer += decoder.decode(chunk, { stream: true });
					if (buffer.length > 2 * 1024 * 1024) {
						buffer = "";
						controller.error(new Error("SSE stream line exceeded maximum allowable buffer size (2MB)"));
						return;
					}
					const lines = buffer.split("\n");
					buffer = lines.pop() || "";
					for (const line of lines) {
						const trimmed = line.trim();
						if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
							try {
								const data = JSON.parse(trimmed.slice(6));
								// 拦截并合成上游隐式错误帧（如 HTTP 200 但 choices: [] 且带有 error 描述）
								if (data.error && (!data.choices || data.choices.length === 0)) {
									const errMsg = data.error.message || "Upstream provider error";
									const synthetic = {
										id: data.id || `err-${Date.now()}`,
										object: "chat.completion.chunk",
										created: Math.floor(Date.now() / 1000),
										model: targetModelId,
										choices: [
											{
												index: 0,
												delta: { content: `\n\n[!][Cline 供应商节点异常: ${errMsg}，请尝试重试或切换其他免费模型]` },
												finish_reason: "stop",
											},
										],
									};
									controller.enqueue(encoder.encode(`data: ${JSON.stringify(synthetic)}\n\n`));
									hasSentAnyContent = true;
									continue;
								}

								const choice = data.choices?.[0];
								const rawReasoning = choice?.delta?.reasoning_content || choice?.delta?.reasoning || (choice?.delta as any)?.thinking;

								if (choice?.delta?.content || (Array.isArray(choice?.delta?.tool_calls) && choice.delta.tool_calls.length > 0) || rawReasoning) {
									hasSentAnyContent = true;
								}

								// 规范化思考过程：全量保障 CoT 完整转发（双向写入 reasoning 与 reasoning_content）
								if (rawReasoning && choice?.delta) {
									choice.delta.reasoning_content = rawReasoning;
									choice.delta.reasoning = rawReasoning;
									controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
									continue;
								}
							} catch {
								// 忽略坏帧
							}
						}
						controller.enqueue(encoder.encode(line + "\n"));
					}
				},
				flush(controller) {
					const remaining = decoder.decode();
					if (remaining) buffer += remaining;
					if (buffer.trim()) {
						controller.enqueue(encoder.encode(buffer + "\n"));
					}
					// 核心防护：若整个流结束既无 content 也无 tool_calls，注入保底输出，彻底杜绝 Pi 的 model output error
					if (!hasSentAnyContent) {
						const emptyGuard = {
							id: `guard-${Date.now()}`,
							object: "chat.completion.chunk",
							created: Math.floor(Date.now() / 1000),
							model: targetModelId,
							choices: [
								{
									index: 0,
									delta: { content: "[!][当前模型节点暂时无输出，请重试或使用 /cline free 切换高可用模型]" },
									finish_reason: "stop",
								},
							],
						};
						controller.enqueue(encoder.encode(`data: ${JSON.stringify(emptyGuard)}\n\n`));
					}
				},
			});

			return new Response(res.body.pipeThrough(transform), {
				status: res.status,
				statusText: res.statusText,
				headers: res.headers,
			});
		}

		// 2. 非流式响应解包与空值保护
		if (targetUrl.includes("chat/completions") && contentType.includes("application/json")) {
			try {
				const rawJson = await res.json();
				if (rawJson && typeof rawJson === "object" && (rawJson as any).data?.choices) {
					const unwrapped = (rawJson as any).data;
					if (Array.isArray(unwrapped.choices) && unwrapped.choices.length > 0) {
						for (const choice of unwrapped.choices) {
							if (choice?.message?.reasoning && !choice.message.reasoning_content) {
								choice.message.reasoning_content = choice.message.reasoning;
							}
							const hasTools = Array.isArray(choice?.message?.tool_calls) && choice.message.tool_calls.length > 0;
							if (!hasTools && (!choice?.message?.content || !choice.message.content.trim())) {
								choice.message.content = choice?.message?.reasoning || "[!][当前模型服务暂未返回有效文本，请重试或切换至其他免费模型]";
							}
						}
					}
					return new Response(JSON.stringify(unwrapped), {
						status: res.status,
						statusText: res.statusText,
						headers: res.headers,
					});
				}
				return new Response(JSON.stringify(rawJson), {
					status: res.status,
					statusText: res.statusText,
					headers: res.headers,
				});
			} catch {
				return res;
			}
		}

		return res;
	};
}

/**
 * 将 Cline Provider 动态注册到 Pi 运行态
 */
export function registerClineProviderToPi(
	pi: ExtensionAPI,
	apiKey: string,
	models: ClineModelDefinition[],
): void {
	if (!pi || typeof pi.registerProvider !== "function") return;

	try {
		const aliasList = [
			{ id: "bunny", ref: "stealth/space-bunny-alpha", name: "Cline Bunny (1M Stealth Free)" },
			{ id: "ling", ref: "inclusionai/ling-3.0-flash-fin:free", name: "Cline Ling 3.0 Flash Fin (Free)" },
			{ id: "code", ref: "openrouter/pareto-code", name: "Cline Pareto Code (2M Free)" },
			{ id: "fusion", ref: "openrouter/fusion", name: "Cline Fusion (1M Free)" },
			{ id: "free", ref: "openrouter/free", name: "Cline OpenRouter Free (200k)" },
			{ id: "550b", ref: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Cline Nemotron 550B (1M Free)" },
			{ id: "120b", ref: "nvidia/nemotron-3-super-120b-a12b:free", name: "Cline Nemotron 120B (Free)" },
			{ id: "qwen", ref: "qwen/qwen3.8-27b:free", name: "Cline Qwen 3.8 27B (Free)" },
		].map((a) => {
			const base = KNOWN_CLINE_FREE_MODELS[a.ref] || models.find((m) => m.id === a.ref);
			return {
				id: a.id,
				name: a.name,
				contextWindow: base?.contextWindow || 262144,
				maxTokens: base?.maxTokens || 32768,
				reasoning: base?.reasoning ?? true,
				input: base?.input || (["text"] as ("text" | "image")[]),
				thinkingLevelMap: base?.thinkingLevelMap,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			};
		});

		pi.registerProvider(CLINE_PROVIDER_ID, {
			baseUrl: CLINE_BASE_URL,
			api: "openai-completions",
			apiKey,
			headers: {
				...CLINE_CLIENT_HEADERS,
			},
			models: [
				...aliasList,
				...models.map((m) => ({
					id: m.id,
					name: m.name,
					contextWindow: m.contextWindow,
					maxTokens: m.maxTokens,
					reasoning: m.reasoning,
					input: m.input,
					thinkingLevelMap: m.thinkingLevelMap,
					cost: m.cost,
				})),
			],
		});
	} catch {
		// 忽略重复或上下文过期注册
	}
}

/**
 * 主插件入口
 */
export default function piCline(pi: ExtensionAPI): void {
	installClineFetchInterceptor(globalThis);

	const initialKey = getStoredClineApiKey();
	setProxyDefaultApiKey(initialKey);

	// 同步初始注册已知免费模型与短别名，保障冷启动零等待
	registerClineProviderToPi(pi, initialKey, Object.values(KNOWN_CLINE_FREE_MODELS));

	// 后台静默拉取远端目录并更新
	fetchClineModelCatalog(initialKey)
		.then((catalog) => {
			try {
				registerClineProviderToPi(pi, initialKey, catalog);
			} catch {
				// 忽略 session 替换后的旧 ctx
			}
		})
		.catch(() => {});

	// 1. 标头注入钩子：注入官方 8 维客户端指纹与凭证
	pi.on("before_provider_headers", (event, ctx) => {
		if (isClineModelTarget(ctx.model)) {
			for (const [key, value] of Object.entries(CLINE_CLIENT_HEADERS)) {
				event.headers[key] = value;
			}
		}
	});

	// 2. 请求体拦截防护：短别名解析、上下文修剪与输出钳位
	pi.on("before_provider_request", (event, ctx) => {
		const payload = event.payload as Record<string, unknown> | undefined;
		const payloadModel = typeof payload?.model === "string" ? payload.model : undefined;

		if (isClineModelTarget(ctx.model, payloadModel) && payload && typeof payload === "object") {
			let modified = false;
			const transformed = { ...payload };

			// 自动解析模型短别名并剥除客户端/供应商前缀
			if (typeof transformed.model === "string") {
				const resolved = resolveFreeModelId(transformed.model);
				if (resolved !== transformed.model) {
					transformed.model = resolved;
					modified = true;
				}
			}

			if (pruneClineContext(transformed)) {
				modified = true;
			}

			const isCompaction = isCompactionOrSummaryRequest(transformed);
			const maxAllowedOutput = isCompaction ? 8192 : 32768;
			if (typeof transformed.max_tokens === "number" && (transformed.max_tokens as number) > maxAllowedOutput) {
				transformed.max_tokens = maxAllowedOutput;
				modified = true;
			}
			if (typeof transformed.max_completion_tokens === "number" && (transformed.max_completion_tokens as number) > maxAllowedOutput) {
				transformed.max_completion_tokens = maxAllowedOutput;
				modified = true;
			}
			if (transformed.frequency_penalty === undefined) {
				transformed.frequency_penalty = 0.05;
				modified = true;
			}

			if (modified) {
				return transformed;
			}
		}
	});

	// 3. 响应异常感知
	pi.on("after_provider_response", (event, ctx) => {
		if (isClineModelTarget(ctx.model)) {
			if (event.status === 401 || event.status === 403) {
				notify(
					ctx,
					`[Cline] 接收到 HTTP ${event.status} 认证错误，请使用 /cline key <新KEY> 更新 API Key`,
					"warning",
				);
			} else if (event.status === 429) {
				notify(ctx, `[Cline] 请求触发频次限制 (HTTP 429)，请稍后重试`, "warning");
			}
		}
	});

	// 4. 注册 /cline 命令行工具（语法与 completions 完全对齐 /zen）
	pi.registerCommand("cline", {
		description: "Cline 官方 API 免费模型管理、伪装反代与会话护航 (/cline [key|refresh|sync|status|list|free|ping|proxy|model])",
		getArgumentCompletions: (prefix: string) => {
			const candidates = [
				"refresh",
				"sync",
				"status",
				"list",
				"models",
				"free",
				"key",
				"model",
				"ping",
				"proxy",
			]
				.filter((cmd) => cmd.startsWith(prefix.toLowerCase()))
				.map((cmd) => ({ value: cmd, label: cmd }));
			return candidates.length > 0 ? candidates : null;
		},
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			return await handleClineCommand(args, ctx, pi);
		},
	});
}

export async function handleClineCommand(
	args: string,
	ctx: ExtensionCommandContext,
	pi?: ExtensionAPI,
): Promise<string> {
	const rawArg = args.trim();
	const sub = rawArg.split(/\s+/);
	const cmd = sub[0]?.toLowerCase() || "";

	// 1. 无参直接调用 /cline：全自动在线探测拉取后端模型、同步本地配置并热重载
	if (rawArg.length === 0) {
		const storedKey = getStoredClineApiKey();
		if (!storedKey) {
			if (ctx.hasUI && typeof ctx.ui?.input === "function") {
				const entered = await ctx.ui.input("请输入 Cline API Key (以 sk_ 开头):", "sk_");
				if (entered && entered.trim()) {
					return await handleClineCommand(`key ${entered.trim()}`, ctx, pi);
				}
			}
			const msg = "[WARN] Cline 尚未配置 API Key。请使用 /cline key <sk_xxx> 进行配置。";
			notify(ctx, msg, "warning");
			return msg;
		}

		notify(ctx, "正在拉取 Cline 最新模型并同步至本地配置...", "info");
		try {
			const result = await syncClineConfiguration({ silent: true });
			if (pi) {
				registerClineProviderToPi(pi, result.apiKey, result.models);
			}
			if ((ctx as any).modelRegistry?.refresh) {
				await (ctx as any).modelRegistry.refresh({ providers: [CLINE_PROVIDER_ID] }).catch(() => {});
			}

			const freeModels = result.models.filter((m) => m.isFree);
			const reasoningCount = freeModels.filter((m) => m.reasoning).length;
			const visionCount = freeModels.filter((m) => m.input.includes("image")).length;
			const proxyStatus = getClineProxyStatus();
			const maskedKey = maskKey(result.apiKey);

			const lines: string[] = [
				`[Cline 免费模型与本地反代控制面板]`,
				`• API Key: ${maskedKey} (已验证并持久化)`,
				`• 基础端点: ${CLINE_BASE_URL}`,
				`• 自动对接免费模型: 已同步 ${freeModels.length} 款 0 额度消耗模型 (${reasoningCount} 款支持深度思考，${visionCount} 款支持多模态视觉)`,
				`• 官方客户端伪装: 8 维官方指纹签名已注入 (VSCode 4.1.16 / cline-vscode)`,
				`• 本地配置同步: models.json [OK] | auth.json [OK] | CC-Switch DB ${result.updatedCcSwitchDb ? "[OK]" : "[跳过]"}`,
				`• 本地反向代理: ${proxyStatus.running ? `运行中 (${proxyStatus.url})` : "未运行"}`,
				"",
				`常用指令:`,
				`  /cline <key>                 更换 API Key (自动重识免费模型/上下文/思考等级)`,
				`  /cline refresh               强制在线拉取远端模型并刷新本地配置`,
				`  /cline list                  查看所有 21 款可用免费模型详细规格`,
				`  /cline free                  查看零额度模型注册表`,
				`  /cline status                查看当前详细运行状态与代理信息`,
				`  /cline ping [模型ID]         实时探测免费模型连通性与网络时延`,
				`  /cline model <模型ID>        快速切换至指定 Cline 模型`,
				`  /cline proxy start [4116]    启动本地 OpenAI 兼容反向代理服务`,
				`  /cline proxy stop            停止本地反代服务器`,
				"",
				`精选高优免费与隐身模型:`,
			];

			for (const m of freeModels.slice(0, 6)) {
				lines.push(formatClineModelCard(m));
			}

			const msg = lines.join("\n");
			notify(ctx, msg, "info");
			return msg;
		} catch (error) {
			const errMsg = `[ERR] Cline 同步失败: ${formatError(error)}`;
			notify(ctx, errMsg, "error");
			return errMsg;
		}
	}

	// 2. 输入了 API Key (/cline sk_... 或 /cline key sk_... 或直接粘贴的长 Key)
	let newKey: string | undefined;
	if (cmd === "key" && sub[1]) {
		newKey = sub[1].trim();
	} else if (rawArg.startsWith("sk_")) {
		newKey = rawArg;
	} else if (
		rawArg.length > 20 &&
		!["status", "refresh", "sync", "list", "models", "free", "ping", "proxy", "model"].includes(cmd)
	) {
		newKey = rawArg;
	}

	if (cmd === "key" && !sub[1]) {
		const err = "[ERR] 用法: /cline key <sk_xxx>";
		notify(ctx, err, "warning");
		return err;
	}

	if (newKey) {
		if (!newKey.startsWith("sk_")) {
			const err = "[ERR] 请提供有效的 Cline API Key (以 sk_ 开头)";
			notify(ctx, err, "warning");
			return err;
		}

		try {
			notify(ctx, "正在验证 Cline API Key 并拉取最新免费模型/上下文规格/深度思考配置...", "info");
			setProxyDefaultApiKey(newKey);
			const result = await syncClineConfiguration({ apiKey: newKey });
			if (pi) {
				registerClineProviderToPi(pi, newKey, result.models);
			}
			if ((ctx as any).modelRegistry?.refresh) {
				await (ctx as any).modelRegistry.refresh({ providers: [CLINE_PROVIDER_ID] }).catch(() => {});
			}

			const freeModels = result.models.filter((m) => m.isFree);
			const reasoningCount = freeModels.filter((m) => m.reasoning).length;
			const modelCards = freeModels.slice(0, 8).map((m, idx) => formatClineModelDetailCard(m, idx + 1));

			const msg = [
				`[OK] Cline API Key 配置成功！免费套餐与零额度模型已全自动识别并对接：`,
				`• API Key: ${maskKey(newKey)} (已验证并保存，配置已更新并同步)`,
				`• 识别到 ${result.modelCount} 款可用模型 (${freeModels.length} 款完全免费 / 零额度消耗，${reasoningCount} 款支持深度思考)：`,
				"",
				...modelCards,
				"",
				`• 同步路径: models.json [OK] | auth.json [OK]`,
				`• CC-Switch: ${result.updatedCcSwitchDb ? "本地数据库已同步更新" : "无数据库或跳过"}`,
				`提示：全部模型参数已热载入 Pi，输入 /model 或在模型选择器中可即刻选用！`,
			].join("\n");

			notify(ctx, msg, "info");
			return msg;
		} catch (error) {
			const errMsg = `[ERR] 配置失败: ${formatError(error)}`;
			notify(ctx, errMsg, "error");
			return errMsg;
		}
	}

	// 3. /cline refresh 或 /cline sync：强制全量刷新模型与配置
	if (cmd === "refresh" || cmd === "sync") {
		try {
			notify(ctx, "正在拉取 Cline 最新模型并同步至本地配置...", "info");
			const result = await syncClineConfiguration();
			if (pi) {
				registerClineProviderToPi(pi, result.apiKey, result.models);
			}
			if ((ctx as any).modelRegistry?.refresh) {
				await (ctx as any).modelRegistry.refresh({ providers: [CLINE_PROVIDER_ID] }).catch(() => {});
			}

			const freeModels = result.models.filter((m) => m.isFree);
			const reasoningCount = freeModels.filter((m) => m.reasoning).length;
			const visionCount = freeModels.filter((m) => m.input.includes("image")).length;

			const msg = [
				`[OK] Cline 配置与模型已成功刷新！`,
				`• API Key: ${maskKey(result.apiKey)}`,
				`• 免费模型: 已对齐 ${freeModels.length} 款 0 额度消耗模型 (${reasoningCount} 款支持深度思考，${visionCount} 款支持多模态视觉)`,
				`• 请求头伪装: 8 维官方客户端指纹已注入 (VSCode 4.1.16 / cline-vscode)`,
				`• 同步状态: models.json [OK] | auth.json [OK] | CC-Switch DB ${result.updatedCcSwitchDb ? "[OK]" : "[跳过]"}`,
			].join("\n");

			notify(ctx, msg, "info");
			return msg;
		} catch (error) {
			const errMsg = `[ERR] 刷新失败: ${formatError(error)}`;
			notify(ctx, errMsg, "error");
			return errMsg;
		}
	}

	// 4. /cline list 或 /cline models：查看所有可用免费模型详细规格卡片
	if (cmd === "list" || cmd === "models") {
		const storedKey = getStoredClineApiKey();
		const catalog = await fetchClineModelCatalog(storedKey).catch(() => Object.values(KNOWN_CLINE_FREE_MODELS));
		const freeModels = catalog.filter((m) => m.isFree);

		const cards = freeModels.map((m, idx) => formatClineModelDetailCard(m, idx + 1));
		const msg = [
			`[Cline 免费模型列表 (${freeModels.length} 款)]`,
			`智能识别精确上下文上限（Context）、最大输出（Max Tokens）及推理思考等级（Thinking）：`,
			"",
			...cards,
			"",
			`提示：这些模型已全量注册至 Pi，使用 /model 或快捷键随时切换！`,
		].join("\n");

		notify(ctx, msg, "info");
		return msg;
	}

	// 5. /cline free：查看零额度模型注册表分类视图
	if (cmd === "free") {
		const storedKey = getStoredClineApiKey();
		const catalog = await fetchClineModelCatalog(storedKey).catch(() => Object.values(KNOWN_CLINE_FREE_MODELS));
		const freeModels = catalog.filter((m) => m.isFree);
		const table = formatClineModelsTable(freeModels);
		notify(ctx, table, "info");
		return table;
	}

	// 6. /cline status：查看当前运行状态与代理信息
	if (cmd === "status") {
		const storedKey = getStoredClineApiKey();
		const maskedKey = maskKey(storedKey);
		const proxyStatus = getClineProxyStatus();
		const catalog = await fetchClineModelCatalog(storedKey).catch(() => Object.values(KNOWN_CLINE_FREE_MODELS));
		const freeModels = catalog.filter((m) => m.isFree);
		const reasoningCount = freeModels.filter((m) => m.reasoning).length;
		const visionCount = freeModels.filter((m) => m.input.includes("image")).length;
		const currentModel = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "未连接";

		const lines: string[] = [
			`[Cline 运行状态]`,
			`• API Key: ${maskedKey}`,
			`• 基础端点: ${CLINE_BASE_URL}`,
			`• 当前会话模型: ${currentModel}`,
			`• 模型库: 已激活 ${catalog.length} 款可用模型 (${freeModels.length} 款完全免费 / 零额度消耗，${reasoningCount} 款支持深度思考，${visionCount} 款支持多模态视觉)`,
			`• 本地反向代理: ${proxyStatus.running ? `运行中 (${proxyStatus.url}, 已处理 ${proxyStatus.requestCount} 次请求)` : "未运行"}`,
			`• 指纹保护: 8 维官方客户端签名 + 响应空值守卫`,
			"",
			`常用指令:`,
			`  /cline <key>                 更新 Key 并全自动识别免费模型/上下文/思考等级`,
			`  /cline refresh               重新拉取远端模型并刷新本地配置`,
			`  /cline list                  查看所有可用免费模型详细规格卡片`,
			`  /cline ping [模型ID]         实时探测网络连通性与时延`,
			`  /cline proxy start [4116]    启动本地 OpenAI 兼容反代服务器`,
		];

		const msg = lines.join("\n");
		notify(ctx, msg, "info");
		return msg;
	}

	// 7. /cline ping [modelId]：网络时延实时探测
	if (cmd === "ping") {
		const target = sub[1];
		const key = getStoredClineApiKey();
		const testTargets = target
			? [resolveFreeModelId(target)]
			: [
				"stealth/space-bunny-alpha",
				"inclusionai/ling-3.0-flash-fin:free",
				"openrouter/fusion",
				"openrouter/pareto-code",
				"openrouter/free",
				"nvidia/nemotron-3-ultra-550b-a55b:free",
			];

		notify(ctx, "正在探测 Cline 免费模型网络时延与连通性...", "info");

		const results: string[] = ["=== Cline 免费模型连通性与时延实时探测 ==="];
		for (const m of testTargets) {
			const start = Date.now();
			try {
				const res = await fetch(`${CLINE_BASE_URL}/chat/completions`, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${key}`,
						"Content-Type": "application/json",
						...CLINE_CLIENT_HEADERS,
					},
					body: JSON.stringify({
						model: m,
						messages: [{ role: "user", content: "ping" }],
						max_tokens: 5,
						stream: false,
					}),
				});
				const ms = Date.now() - start;
				if (res.ok) {
					const speedTag = ms < 800 ? "极速" : ms < 2000 ? "良好" : "稍慢";
					results.push(`  • ${m}: [200 OK] (${ms}ms, ${speedTag})`);
				} else {
					results.push(`  • ${m}: [HTTP ${res.status}] (${ms}ms)`);
				}
			} catch (e: any) {
				const ms = Date.now() - start;
				results.push(`  • ${m}: [FAILED] (${ms}ms, ${e.message})`);
			}
		}
		const pingMsg = results.join("\n");
		notify(ctx, pingMsg, "info");
		return pingMsg;
	}

	// 8. /cline model <modelId>：快速切换模型
	if (cmd === "model") {
		const targetId = sub[1];
		if (!targetId) {
			const err = "[ERR] 用法: /cline model <模型ID>\n示例: /cline model inclusionai/ling-3.0-flash-fin:free";
			notify(ctx, err, "warning");
			return err;
		}
		const resolvedId = resolveFreeModelId(targetId);
		if (typeof (ctx as any).setModel === "function") {
			await (ctx as any).setModel({ provider: CLINE_PROVIDER_ID, id: resolvedId });
			const msg = `[OK] 已成功切换至 Cline 模型: ${resolvedId}`;
			notify(ctx, msg, "info");
			return msg;
		}
		const warnMsg = `[WARN] 当前环境暂不支持动态 setModel，请在配置文件或交互界面选择 ${resolvedId}`;
		notify(ctx, warnMsg, "warning");
		return warnMsg;
	}

	// 9. /cline proxy [start|stop|status] [port]：管理本地反向代理服务器
	if (cmd === "proxy") {
		const action = sub[1]?.toLowerCase() || "status";
		if (action === "start") {
			const port = parseInt(sub[2], 10) || 4116;
			try {
				const res = await startClineProxyServer({ port });
				const msg = `[OK] Cline 本地反向代理已就绪！\n• 接口地址: ${res.url}\n• 标准端点: ${res.url}/chat/completions\n• 模型列表: ${res.url}/models\n• 指纹伪装: 8大官方客户端标头已自动注入\n可在 CC-Switch、Cursor、Cherry Studio 中直接作为 OpenAI 供应商接入使用。`;
				notify(ctx, msg, "info");
				return msg;
			} catch (e: any) {
				const err = `[ERR] 反代启动失败: ${e.message}`;
				notify(ctx, err, "error");
				return err;
			}
		} else if (action === "stop") {
			await stopClineProxyServer();
			const msg = "[INFO] Cline 本地反向代理已停止。";
			notify(ctx, msg, "info");
			return msg;
		} else {
			const status = getClineProxyStatus();
			if (status.running) {
				const msg = `[ONLINE] Cline 本地反代运行中: ${status.url}\n• 已处理请求: ${status.requestCount}\n• 错误数: ${status.errorCount}`;
				notify(ctx, msg, "info");
				return msg;
			}
			const msg = `[OFFLINE] Cline 本地反代未启动。\n使用 /cline proxy start [端口] 即可启动本地 OpenAI 兼容反向代理服务 (默认端口 4116)。`;
			notify(ctx, msg, "info");
			return msg;
		}
	}

	// 兜底提示
	const fallback = `[INFO] 未知指令: ${cmd}。可用指令: /cline [key|refresh|sync|status|list|free|ping|proxy|model]`;
	notify(ctx, fallback, "warning");
	return fallback;
}

function maskKey(key: string): string {
	if (!key || key === CLINE_DEFAULT_KEY) {
		return key && key.length > 12 ? `${key.slice(0, 8)}...${key.slice(-4)}` : "未配置";
	}
	if (key.length <= 12) return "******";
	return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

function notify(
	ctx: ExtensionCommandContext,
	message: string,
	level: "info" | "warning" | "error" = "info",
): void {
	try {
		if (ctx.hasUI && typeof ctx.ui?.notify === "function") {
			ctx.ui.notify(message, level);
		} else {
			console.log(`[${level.toUpperCase()}] ${message}`);
		}
	} catch {
		// 容错
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

