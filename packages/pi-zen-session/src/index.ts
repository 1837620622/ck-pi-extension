/**
 * OpenCode Zen 插件主入口 (ck-pi-zen-session)
 *
 * 功能特色：
 * 1. 提供 /zen 命令：支持输入 Key 即刻激活、刷新 Session、查看状态与模型清单；
 * 2. 逆向对齐官方 Identifier.descending("ses") 算法，保真生成 30 位降序会话 ID；
 * 3. 自动注入伪装请求头 (User-Agent, x-opencode-session)；
 * 4. 自动双写 ~/.pi/agent/models.json 与 CC-Switch 本地数据库；
 * 5. 常驻 before_agent_start 钩子：每当 Session 临近过期（>12h），后台无感自动刷新。
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
export {
	formatModelCard,
	formatThinkingSummary,
	formatTokens,
	inferModelCapabilities,
	KNOWN_ZEN_FREE_MODELS,
	OPENCODE_OFFICIAL_TOOLS,
	ZEN_BASE_URL,
	ZEN_PROVIDER_ID,
	ZEN_USER_AGENT,
} from "./models-registry.js";
import {
	formatModelCard,
	formatThinkingSummary,
	formatTokens,
	KNOWN_ZEN_FREE_MODELS,
	OPENCODE_OFFICIAL_TOOLS,
	ZEN_BASE_URL,
	ZEN_PROVIDER_ID,
	ZEN_USER_AGENT,
} from "./models-registry.js";
import {
	getActiveZenSessionId,
	getStoredZenApiKey,
	getStoredZenModels,
	getStoredZenSessionId,
	getZenStatusInfo,
	setActiveZenSessionId,
	syncZenConfiguration,
} from "./sync.js";
import {
	DEFAULT_SESSION_MAX_AGE_MS,
	PROACTIVE_REFRESH_AGE_MS,
	generateZenProjectId,
	generateZenRequestId,
	generateZenSessionId,
	isZenSessionExpired,
	isValidZenSessionId,
} from "./session.js";
import type { ZenModelDefinition } from "./types.js";

export function registerZenProviderToPi(
	pi: ExtensionAPI,
	apiKey: string,
	sessionId: string = getStoredZenSessionId() || generateZenSessionId(),
	models: ZenModelDefinition[] = getStoredZenModels(),
): void {
	try {
		pi.registerProvider(ZEN_PROVIDER_ID, {
			name: "OpenCode Zen (Free)",
			baseUrl: ZEN_BASE_URL,
			apiKey: apiKey,
			api: "openai-completions",
			headers: {
				"User-Agent": ZEN_USER_AGENT,
				"x-opencode-client": "cli",
				"x-opencode-session": sessionId,
				"x-opencode-project": generateZenProjectId(),
				"x-session-affinity": sessionId,
				"X-Session-Id": sessionId,
			},
			compat: {
				maxTokensField: "max_tokens",
				requiresReasoningContentOnAssistantMessages: true,
				supportsDeveloperRole: false,
				supportsStore: false,
				supportsUsageInStreaming: true,
			},
			models: models && models.length > 0 ? models : Object.values(KNOWN_ZEN_FREE_MODELS),
		});
	} catch {
		// 忽略重复注册
	}
}

export function isZenModelTarget(model?: { provider?: string; id?: string }, payloadModel?: string): boolean {
	if (!model) {
		if (payloadModel) {
			const lower = payloadModel.toLowerCase();
			return (
				lower.endsWith("-free") ||
				lower === "big-pickle" ||
				lower.includes("zen")
			);
		}
		return false;
	}
	// 严格隔离：仅处理 opencode-zen-free 或明确属于 opencode 官方的免费模型
	// 绝不干涉 relayhub、deepseek、anthropic、openai 等其他任何供应商或 CC 插件
	if (model.provider === ZEN_PROVIDER_ID) return true;
	if (
		model.provider === "opencode" &&
		(model.id?.includes("-free") || model.id === "big-pickle")
	) {
		return true;
	}
	return false;
}

let lastAutoSyncMs = 0;
function debouncedAutoSync(forceSession = true): void {
	const now = Date.now();
	if (now - lastAutoSyncMs < 30_000) {
		return;
	}
	lastAutoSyncMs = now;
	syncZenConfiguration({ forceSession }).catch(() => {});
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
 * 安全更新消息中的文本内容，无论其原始类型为 string 还是 Array<{type, text}>
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
 * 寻找符合 OpenAI ChatCompletions 协议切分规范的安全切点：
 * 切点起始位置必须为 user 消息，彻底杜绝孤立 tool 响应或断头 assistant tool_calls 导致的 400 协议错误。
 */
export function findSafeUserCutPoint(messages: unknown[], maxTailChars: number): number {
	let accumulatedChars = 0;
	let userCutIndex = -1;
	for (let i = messages.length - 1; i >= 2; i--) {
		const msg = messages[i] as Record<string, unknown>;
		accumulatedChars += JSON.stringify(msg).length;
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
 * 智能判定是否为 Compaction / Summarization / 无工具压缩任务请求
 */
export function isCompactionOrNoToolRequest(payload: Record<string, unknown>): boolean {
	// 1. 显式指定 tool_choice 为 "none"
	if (payload.tool_choice === "none") return true;

	// 2. 检查 messages 中是否包含压缩或总结标识 (如 Pi 的 <conversation> 或 <previous-summary> 标签)
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

	// 3. Pi completeSimple 等非流式调用通常用于总结压缩
	if (payload.stream === false) return true;

	return false;
}

/**
 * 上下文超限全自动修剪与性能护航引擎
 * 针对 Pi 的各种工作场景进行细粒度优化：
 * 1. Tool 输出截断：单个 tool 输出（如巨大 bash / grep / cat 日志）截断至 25,000 字符内，防止单个命令输出几兆文本撑爆上下文；
 * 2. Compaction 压缩保护：对包含 <conversation> 的海量历史（通常单条可超 100K~2M 字符），
 *    严格修剪至 70,000 字符以内（保留头部任务目标 25,000 字符与尾部最新状态 45,000 字符），
 *    确保即使从 1M 模型切换至 200K 的 Zen 模型进行压缩，也绝不超出目标模型 Context Window，并在 5~8 秒内疾速完成且杜绝网关 524 超时；
 * 3. 多轮交互超长修剪：当 messages 总体积超过 180,000 字符时，安全溯源至合法 user 消息边界切割，
 *    严禁在消息序列中随意插入非法 system 消息，严格维护 assistant(tool_calls) 与 tool(result) 的配对完整性，彻底杜绝 400 Bad Request。
 */
export function pruneZenContext(payload: Record<string, unknown>): boolean {
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
				if (toolText.length > 25_000) {
					const newText =
						toolText.slice(0, 25_000) +
						"\n\n[... Zen Guard: Tool output truncated to 25,000 chars to avoid context overflow ...]";
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

					// 若压缩历史主体超过 80,000 字符 (~20,000 tokens)
					if (convoBody.length > 80_000) {
						const headChars = 25_000;
						const tailChars = 45_000;
						const head = convoBody.slice(0, headChars);
						const tail = convoBody.slice(-tailChars);
						const omittedChars = convoBody.length - headChars - tailChars;
						const omittedTokensEst = Math.round(omittedChars / 4);
						const notice = `\n\n[... Zen Compaction Guard: Omitted ${omittedChars} intermediate characters (~${omittedTokensEst} tokens) of verbose logs to fit model context limit & optimize speed ...]\n\n`;

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
						const pNotice = `\n\n[... Zen Compaction Guard: Omitted ${pOmitted} intermediate chars of previous summary ...]\n\n`;
						currentText = pPrefix + pHead + pNotice + pTail + pSuffix;
						updateMessageText(m, currentText);
						modified = true;
					}
				}
			}

			if (!currentText.includes("<conversation>") && currentText.length > 90_000 && isCompactionOrNoToolRequest(payload)) {
				// 兜底保护：即使没有明确的 <conversation> 标签，但单条超大消息出现在总结任务中
				const head = currentText.slice(0, 30_000);
				const tail = currentText.slice(-50_000);
				const omitted = currentText.length - 80_000;
				const notice = `\n\n[... Zen Compaction Guard: Truncated ${omitted} intermediate characters to fit model context limit ...]\n\n`;
				updateMessageText(m, head + notice + tail);
				modified = true;
			}
		}
	}

	// 3. 多轮交互超长上下文修剪 (针对常规 Agent 长任务对话，严格保持 Tool 配对合法性)
	const totalChars = JSON.stringify(payload.messages).length;
	// 针对 200k 模型，若请求体积超过 180,000 字符 (~45,000 tokens)
	if (payload.messages.length > 4 && totalChars > 180_000) {
		const userCutIndex = findSafeUserCutPoint(payload.messages, 120_000);
		if (userCutIndex > 2) {
			const head = payload.messages.slice(0, 2);
			const tail = payload.messages.slice(userCutIndex);
			const omittedCount = userCutIndex - 2;
			if (omittedCount > 0) {
				const firstUser = tail[0] as Record<string, unknown>;
				const userOriginalText = getMessageText(firstUser.content);
				const note = `[Zen Guard: Omitted ${omittedCount} intermediate turns to fit context limit]\n\n`;
				updateMessageText(firstUser, note + userOriginalText);
				payload.messages = [...head, ...tail];
				modified = true;
			}
		}
	}

	return modified;
}

export function installZenFetchInterceptor(targetGlobal: typeof globalThis = globalThis): void {
	const ZEN_FETCH_INTERCEPTOR = Symbol.for("ck.zen.fetch.interceptor");
	if ((targetGlobal as any)[ZEN_FETCH_INTERCEPTOR]) {
		return;
	}
	(targetGlobal as any)[ZEN_FETCH_INTERCEPTOR] = true;

	const originalFetch = targetGlobal.fetch;
	targetGlobal.fetch = async function zenFetchInterceptor(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		// 1. 严格过滤：仅拦截发往 OpenCode Zen 的 chat/completions 请求
		// 严禁拦截 /models 等管理与元数据接口，彻底切断同步与请求拦截间的自调用递归闭环
		let targetUrl: string;
		const headers = new Headers();

		if (typeof input === "string") {
			targetUrl = input;
		} else if (input instanceof URL) {
			targetUrl = input.href;
		} else if (input && typeof (input as Request).url === "string") {
			targetUrl = (input as Request).url;
			// 继承 Request 对象上的全部原始 Headers (如 Authorization)
			const reqHeaders = (input as Request).headers;
			if (reqHeaders && typeof reqHeaders.forEach === "function") {
				reqHeaders.forEach((val, key) => headers.set(key, val));
			}
		} else {
			return originalFetch.call(this, input, init);
		}

		if (!targetUrl.includes("opencode.ai/zen/v1/chat/completions")) {
			return originalFetch.call(this, input, init);
		}

		// 合并 init 中传入的 Headers
		if (init?.headers) {
			const initHeaders = new Headers(init.headers);
			initHeaders.forEach((val, key) => headers.set(key, val));
		}

		// 检查并获取有效 Session ID (若过期、非合法 ses_ 格式或缺失，自动轮换)
		let currentSession = headers.get("x-opencode-session") || getStoredZenSessionId();
		if (
			!currentSession ||
			!isValidZenSessionId(currentSession) ||
			isZenSessionExpired(currentSession, DEFAULT_SESSION_MAX_AGE_MS)
		) {
			currentSession = generateZenSessionId();
			setActiveZenSessionId(currentSession);
			debouncedAutoSync(true);
		}

		// 构建完整官方客户端伪装请求头
		headers.set("User-Agent", ZEN_USER_AGENT);
		headers.set("x-opencode-client", "cli");
		if (!headers.has("x-opencode-project")) {
			headers.set("x-opencode-project", generateZenProjectId());
		}
		headers.set("x-opencode-session", currentSession);
		headers.set("x-session-affinity", currentSession);
		headers.set("X-Session-Id", currentSession);

		// 拦截并修补请求体：在 Summarization / Compaction / 非工具调用场景下强制注入官方 tools
		let newBody = init?.body;
		let originalStreamRequested = true;
		let payloadModel = "";

		if (typeof init?.body === "string" && init.body.trim().startsWith("{")) {
			try {
				const payload = JSON.parse(init.body) as Record<string, unknown>;
				let modified = false;
				originalStreamRequested = payload.stream === true;
				payloadModel = typeof payload.model === "string" ? payload.model : "";

				// A. 关键防 403 规约：OpenCode Zen 后端严格要求 tools 参数存在
				const isCompaction = isCompactionOrNoToolRequest(payload);
				if (isCompaction || !Array.isArray(payload.tools) || payload.tools.length === 0) {
					// 针对压缩/总结/未提供工具的请求：注入官方 tools 并设置 tool_choice: "none"，
					// 既满足网关 tools 存在性校验，又严禁模型生成工具调用，彻底杜绝 "Summarization attempted to call a tool" 报错
					payload.tools = OPENCODE_OFFICIAL_TOOLS;
					payload.tool_choice = "none";
					modified = true;
				} else {
					// 正常 Agent 对话：已有工具时按字母严格重排
					payload.tools = [...payload.tools].sort((a: any, b: any) => {
						const nameA = a.function?.name || a.name || "";
						const nameB = b.function?.name || b.name || "";
						return nameA.localeCompare(nameB);
					});
					modified = true;
				}

				// B. 强制流式规约：OpenCode Zen 免费端点对非流式请求一律拒绝 (HTTP 403 FreeTierError)
				// 若调用方原本期望非流式 JSON（如 Pi 压缩任务 completeSimple），强制开启 stream: true，
				// 后续由拦截器在底层透明聚合上游 SSE 帧，拼装为完整的 OpenAI ChatCompletion JSON 响应
				if (!originalStreamRequested) {
					payload.stream = true;
					modified = true;
				}
				if (!payload.stream_options) {
					payload.stream_options = { include_usage: true };
					modified = true;
				}

				// C. 上下文超限全自动修剪与防护
				if (pruneZenContext(payload)) {
					modified = true;
				}

				// D. 规范化 reasoning_effort 与思考参数
				if (isCompaction) {
					// 压缩/总结场景：必须压制长思考，强制设为 low 并移除 thinking 对象，
					// 避免模型思考几十秒导致 Cloudflare 524 握手超时或撞 stopReason: length 截断错误
					payload.reasoning_effort = "low";
					if ("thinking" in payload) {
						delete payload.thinking;
					}
					modified = true;
				} else {
					const isNonReasoning =
						payloadModel.startsWith("jev-") || payloadModel.startsWith("ling-2.6-flash");

					if (isNonReasoning && "reasoning_effort" in payload) {
						delete payload.reasoning_effort;
						modified = true;
					} else if (typeof payload.reasoning_effort === "string") {
						const eff = payload.reasoning_effort.toLowerCase();
						if (eff === "max" || eff === "xhigh") {
							payload.reasoning_effort = "high";
							modified = true;
						} else if (eff === "minimal") {
							payload.reasoning_effort = "low";
							modified = true;
						} else if (eff === "off" || eff === "none" || eff === "") {
							delete payload.reasoning_effort;
							modified = true;
						} else if (!["low", "medium", "high"].includes(eff)) {
							payload.reasoning_effort = "high";
							modified = true;
						}
					}

					// E. 剔除多余 thinking 顶层对象
					if ("thinking" in payload && typeof payload.thinking === "object") {
						delete payload.thinking;
						modified = true;
					}
				}

				// F. 输出 Token 阈值安全钳位 (防止 Pi reserveTokens 传出超大 max_tokens 导致 400 Bad Request)
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
				// 忽略非 JSON 请求体
			}
		}

		// 3. 透明重试循环 (解决 401/403 会话过期与 502/503/504 抖动)
		let response: Response | undefined;
		let lastError: unknown;
		const maxAttempts = 3;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			try {
				headers.set("x-opencode-request", generateZenRequestId());

				const newInit: RequestInit = {
					...init,
					headers,
					body: newBody,
				};

				response = await originalFetch.call(this, targetUrl, newInit);

				// 遇 401/403 自动触发 Session 自愈轮换并重试
				if (response.status === 401 || response.status === 403) {
					const newSession = generateZenSessionId();
					currentSession = newSession;
					setActiveZenSessionId(newSession);
					headers.set("x-opencode-session", newSession);
					headers.set("x-session-affinity", newSession);
					headers.set("X-Session-Id", newSession);
					debouncedAutoSync(true);

					if (attempt < maxAttempts) {
						await new Promise((r) => setTimeout(r, 300));
						continue;
					}
				}

				// 遇 502/503/504/524 临时网络抖动或上游过载进行退避重试
				if ([502, 503, 504, 524].includes(response.status)) {
					if (attempt < maxAttempts) {
						const backoffMs = attempt * 1000;
						await new Promise((r) => setTimeout(r, backoffMs));
						continue;
					}
				}

				// 正常 200 或业务状态码，跳出重试
				break;
			} catch (networkError) {
				lastError = networkError;
				if (attempt < maxAttempts) {
					const backoffMs = attempt * 1000;
					await new Promise((r) => setTimeout(r, backoffMs));
					continue;
				}
				throw lastError;
			}
		}

		if (!response) {
			if (lastError) throw lastError;
			throw new Error("OpenCode Zen request failed with no response");
		}

		// 核心自愈：若调用方原本发起的为非流式请求（如 Pi 总结压缩），而上游返回 200 SSE 流，
		// 将其聚合反序列化为标准的 OpenAI ChatCompletion JSON 响应对象
		if (response.ok && !originalStreamRequested) {
			return assembleSseToChatCompletionResponse(response, payloadModel);
		}

		return response;
	};
}

/**
 * 将 OpenCode Zen 上游强制要求的 SSE 流（Server-Sent Events）
 * 汇聚装配为符合 OpenAI 规范的标准 ChatCompletion JSON 响应对象，
 * 使 Pi 的 completeSimple 等非流式调用方（包括核心 Compaction/Summarization）无缝完成解析。
 */
export async function assembleSseToChatCompletionResponse(
	response: Response,
	modelId: string,
): Promise<Response> {
	if (!response.body) {
		return response;
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let done = false;

	let id = `gen-${Date.now()}`;
	let textContent = "";
	let reasoningContent = "";
	let finishReason = "stop";
	let usage: Record<string, unknown> = {
		prompt_tokens: 0,
		completion_tokens: 0,
		total_tokens: 0,
	};

	try {
		while (!done) {
			const { value, done: readerDone } = await reader.read();
			done = readerDone;
			if (value) {
				buffer += decoder.decode(value, { stream: !done });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					const trimmed = line.trim();
					if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
						try {
							const chunk = JSON.parse(trimmed.slice(6)) as Record<string, any>;
							if (chunk.id) id = chunk.id;
							const choice = chunk.choices?.[0];
							if (choice?.delta?.content) {
								textContent += choice.delta.content;
							}
							if (choice?.delta?.reasoning_content) {
								reasoningContent += choice.delta.reasoning_content;
							} else if (choice?.delta?.reasoning) {
								reasoningContent += choice.delta.reasoning;
							}
							if (choice?.finish_reason) {
								finishReason = choice.finish_reason;
							}
							if (chunk.usage && typeof chunk.usage === "object") {
								usage = chunk.usage;
							}
						} catch {
							// 忽略单个坏帧
						}
					}
				}
			}
		}
	} catch (readErr) {
		// 若流读取中断但已拿到部分文本，尽可能保全产物
		if (!textContent && !reasoningContent) {
			throw readErr;
		}
	}

	const promptTokens = Number(usage.prompt_tokens) || 0;
	let completionTokens = Number(usage.completion_tokens) || 0;
	if (completionTokens === 0 && (textContent || reasoningContent)) {
		completionTokens = Math.ceil((textContent.length + reasoningContent.length) / 4);
	}
	const totalTokens = Number(usage.total_tokens) || (promptTokens + completionTokens);

	let finalContent = textContent;
	if (!finalContent.trim() && reasoningContent.trim()) {
		finalContent = reasoningContent.trim();
	}

	const messageObj: Record<string, unknown> = {
		role: "assistant",
		content: finalContent,
	};
	if (reasoningContent) {
		messageObj.reasoning_content = reasoningContent;
	}

	const assembled = {
		id,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model: modelId || "opencode-zen-model",
		choices: [
			{
				index: 0,
				message: messageObj,
				finish_reason: finishReason,
			},
		],
		usage: {
			...usage,
			prompt_tokens: promptTokens,
			completion_tokens: completionTokens,
			total_tokens: totalTokens,
		},
	};

	return new Response(JSON.stringify(assembled), {
		status: 200,
		statusText: "OK",
		headers: {
			"content-type": "application/json; charset=utf-8",
		},
	});
}

export default function piZenSession(pi: ExtensionAPI): void {
	// 0. 全局 Fetch 守卫：无缝拦截包括 Pi Compaction/Summarization 在内的所有 Zen 流量，杜绝 403 FreeTierError
	installZenFetchInterceptor();

	const existingKey = getStoredZenApiKey();
	if (existingKey) {
		const storedSession = getStoredZenSessionId();
		const storedModels = getStoredZenModels();
		registerZenProviderToPi(pi, existingKey, storedSession || generateZenSessionId(), storedModels);

		// 若已有 Key 但还没有持久化模型列表，后台静默自动探测一次
		if (!storedModels || storedModels.length === 0) {
			syncZenConfiguration()
				.then((res) => {
					registerZenProviderToPi(pi, res.apiKey, res.sessionId, res.resolvedModels);
				})
				.catch(() => {});
		}
	}

	// 2. 核心请求头拦截钩子：在每一次请求发往 Provider 前注入完整官方客户端对齐请求头
	pi.on("before_provider_headers", (event, ctx) => {
		if (isZenModelTarget(ctx.model)) {
			// 检查 x-opencode-session 是否过期 (>25分钟) 或缺失或格式不合规
			let currentSession = event.headers["x-opencode-session"];
			if (
				typeof currentSession !== "string" ||
				!isValidZenSessionId(currentSession) ||
				isZenSessionExpired(currentSession, PROACTIVE_REFRESH_AGE_MS)
			) {
				currentSession = generateZenSessionId();
				event.headers["x-opencode-session"] = currentSession;
				setActiveZenSessionId(currentSession);
				// 异步落盘，保持配置同步
				debouncedAutoSync(true);
			}

			// 注入全部官方客户端 7 维对齐请求头
			delete event.headers["user-agent"];
			event.headers["User-Agent"] = ZEN_USER_AGENT;
			event.headers["x-opencode-client"] = "cli";
			event.headers["x-opencode-session"] = currentSession;
			event.headers["x-opencode-project"] = generateZenProjectId();
			event.headers["x-session-affinity"] = currentSession;
			event.headers["X-Session-Id"] = currentSession;
			event.headers["x-opencode-request"] = generateZenRequestId();
		}
	});

	// 3. 核心请求体守卫钩子：深度对齐 OpenCode 官方请求体结构与工具集
	pi.on("before_provider_request", (event, ctx) => {
		const payload = event.payload as Record<string, unknown> | undefined;
		const payloadModel = typeof payload?.model === "string" ? payload.model : undefined;
		if (isZenModelTarget(ctx.model, payloadModel) && payload && typeof payload === "object") {
			let modified = false;
			const transformed = { ...payload };

			// A. 工具规范对齐：Compaction 时强制 tool_choice: "none"；对话时补齐官方 6 大核心工具并重排
			const isCompaction = isCompactionOrNoToolRequest(transformed);
			if (isCompaction) {
				transformed.tools = OPENCODE_OFFICIAL_TOOLS;
				transformed.tool_choice = "none";
				modified = true;
			} else {
				if (!Array.isArray(transformed.tools) || transformed.tools.length === 0) {
					transformed.tools = OPENCODE_OFFICIAL_TOOLS;
					transformed.tool_choice = "auto";
					modified = true;
				} else {
					transformed.tools = [...transformed.tools].sort((a: any, b: any) => {
						const nameA = a.function?.name || a.name || "";
						const nameB = b.function?.name || b.name || "";
						return nameA.localeCompare(nameB);
					});
					modified = true;
				}
			}

			// B. 流式元数据对齐：补充 stream_options: { include_usage: true }
			if (transformed.stream === true && !transformed.stream_options) {
				transformed.stream_options = { include_usage: true };
				modified = true;
			}

			// C. 上下文超限全自动修剪与防护 (Compaction、超大 tool 输出及多轮交互过载)
			if (pruneZenContext(transformed)) {
				modified = true;
			}

			// D. 规范化 reasoning_effort 与思考参数
			if (isCompaction) {
				// 压缩/总结场景：必须压制长思考，强制设为 low 并移除 thinking 对象，
				// 避免模型思考几十秒导致 Cloudflare 524 握手超时或撞 stopReason: length 截断错误
				transformed.reasoning_effort = "low";
				if ("thinking" in transformed) {
					delete transformed.thinking;
				}
				modified = true;
			} else {
				const isNonReasoningModel =
					ctx.model?.reasoning === false ||
					(typeof payloadModel === "string" && (payloadModel.startsWith("jev-") || payloadModel.startsWith("ling-2.6-flash")));

				if (isNonReasoningModel && "reasoning_effort" in transformed) {
					delete transformed.reasoning_effort;
					modified = true;
				} else if (typeof transformed.reasoning_effort === "string") {
					const effort = transformed.reasoning_effort.toLowerCase();
					if (effort === "max" || effort === "xhigh") {
						transformed.reasoning_effort = "high";
						modified = true;
					} else if (effort === "minimal") {
						transformed.reasoning_effort = "low";
						modified = true;
					} else if (effort === "off" || effort === "none" || effort === "") {
						delete transformed.reasoning_effort;
						modified = true;
					} else if (!["low", "medium", "high"].includes(effort)) {
						transformed.reasoning_effort = "high";
						modified = true;
					}
				}

				// E. 移除 OpenAI 兼容接口不识别的额外 thinking 顶层对象 (如 Anthropic 遗留字段)
				if ("thinking" in transformed && typeof transformed.thinking === "object") {
					delete transformed.thinking;
					modified = true;
				}
			}

			// F. 安全上限钳位与防死循环微调 (防止超长 max_tokens 失控导致 400 报错)
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

	// 4. 网关响应守卫：遇 401/403 会话受限或过期时，立即自愈换新 Session ID；遇 502/503/504 友好告警上游服务状态
	pi.on("after_provider_response", (event, ctx) => {
		if (!isZenModelTarget(ctx.model)) return;

		if (event.status === 401 || event.status === 403) {
			// 自动异步刷新 Session (防抖)
			debouncedAutoSync(true);
			if (ctx.hasUI) {
				ctx.ui.notify(
					`检测到 OpenCode Zen 会话受限 (HTTP ${event.status})，已自动轮换新 Session ID。`,
					"warning",
				);
			}
		} else if (event.status === 502 || event.status === 503 || event.status === 504) {
			if (ctx.hasUI) {
				ctx.ui.notify(
					`OpenCode Zen 远端集群暂时不可用 (HTTP ${event.status})，上游模型服务维护中或未上线，建议切换其他 Zen 模型。`,
					"warning",
				);
			}
		}
	});

	// 5. 常驻生命周期守卫：在每次 Agent 循环执行前，自动检测 Session 有效性并无感续期
	pi.on("before_agent_start", async (_event, ctx) => {
		try {
			// 严格隔离：仅在当前激活/选择的是 Zen 模型时才触发轮换检测，绝不干扰其他模型或 CC 插件
			if (!isZenModelTarget(ctx.model)) return;

			const currentSession = getStoredZenSessionId();
			// 若当前会话不存在或已使用超过 25 分钟（前置续期，避免踩中 30 分钟硬过期边界），后台自动续期
			if (!currentSession || isZenSessionExpired(currentSession, PROACTIVE_REFRESH_AGE_MS)) {
				const apiKey = getStoredZenApiKey();
				if (apiKey) {
					await syncZenConfiguration({ forceSession: true });
				}
			}
		} catch {
			// 后台静默处理，绝不中断用户的编码交互流程
		}
	});

	// 6. 注册 /zen 指令（语法与 completions 与 /cline 完全对齐）
	pi.registerCommand("zen", {
		description: "OpenCode Zen 免费模型与 Session 会话自动维护 (/zen [key|refresh|sync|status|list|free|ping|model])",
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
			]
				.filter((cmd) => cmd.startsWith(prefix.toLowerCase()))
				.map((cmd) => ({ value: cmd, label: cmd }));
			return candidates.length > 0 ? candidates : null;
		},
		handler: async (args, ctx) => {
			return await handleZenCommand(args, ctx, pi);
		},
	});
}

export async function handleZenCommand(
	args: string,
	ctx: ExtensionCommandContext,
	pi?: ExtensionAPI,
): Promise<string> {
	const rawArg = args.trim();
	const sub = rawArg.split(/\s+/);
	const command = sub[0]?.toLowerCase() || "";

	// 1. 查看状态: /zen status
	if (command === "status") {
		const status = getZenStatusInfo();
		if (!status.hasKey) {
			const warnMsg = "OpenCode Zen 尚未配置 API Key。请使用 /zen <oc_sk_xxx> 进行配置。";
			notify(ctx, warnMsg, "warning");
			return `[WARN] ${warnMsg}`;
		}

		const ageDesc = status.sessionAgeMinutes < 60
			? `${status.sessionAgeMinutes} 分钟`
			: `${(status.sessionAgeMinutes / 60).toFixed(1)} 小时`;

		const storedModels = getStoredZenModels();
		const reasoningCount = storedModels.filter((m) => m.reasoning).length;
		const visionCount = storedModels.filter((m) => m.input.includes("image")).length;

		const msg = [
			"[OpenCode Zen 运行状态]",
			`• API Key: ${status.maskedKey}`,
			`• Session: ${status.sessionId || "未生成"} (${status.sessionExpired ? "已过期" : `有效，创建于 ${ageDesc}前`})`,
			`• 模型库: 已激活 ${storedModels.length} 款 0 额度模型 (${reasoningCount} 款支持思考推理，${visionCount} 款支持多模态)`,
			`• 请求头保护: 7维官方客户端签名 + 30分钟降序时间戳自愈`,
			"",
			"常用指令：",
			"  /zen <key>   - 更新 Key 并全自动识别免费模型/上下文/思考等级",
			"  /zen refresh - 强制换新 Session ID",
			"  /zen list    - 查看所有可用免费模型详细规格卡片",
			"  /zen ping    - 实时探测 Zen 免费模型连通性与网络时延",
		].join("\n");

		notify(ctx, msg, "info");
		return msg;
	}

	// 2. 查看模型清单: /zen list 或 /zen models 或 /zen free
	if (command === "list" || command === "models" || command === "free") {
		const storedModels = getStoredZenModels();
		if (storedModels.length === 0) {
			const warn = "当前尚未同步任何模型，请先运行 /zen <key>。";
			notify(ctx, warn, "warning");
			return `[WARN] ${warn}`;
		}

		const modelCards = storedModels.map((m, idx) => formatModelCard(m, idx + 1));
		const listMsg = [
			`[OpenCode Zen 免费模型列表 (${storedModels.length} 款)]`,
			"智能识别精确上下文上限（Context）、最大输出（Max Tokens）及推理思考等级（Thinking）：",
			"",
			...modelCards,
			"",
			"提示：这些模型已全量注册至 Pi，使用 /model 或快捷键随时切换！",
		].join("\n");

		notify(ctx, listMsg, "info");
		return listMsg;
	}

	// 3. 强制换新 Session: /zen refresh 或 /zen sync
	if (command === "refresh" || command === "sync") {
		try {
			notify(ctx, "正在生成全新 OpenCode Zen 会话 ID 并同步...", "info");
			const result = await syncZenConfiguration({ forceSession: true });
			if (pi) {
				registerZenProviderToPi(pi, result.apiKey, result.sessionId, result.resolvedModels);
			}
			if ((ctx as { modelRegistry?: { refresh?: (arg: unknown) => Promise<unknown> } }).modelRegistry?.refresh) {
				await (ctx as { modelRegistry: { refresh: (arg: unknown) => Promise<unknown> } }).modelRegistry
					.refresh({ providers: [ZEN_PROVIDER_ID] })
					.catch(() => {});
			}
			const reasoningCount = result.resolvedModels.filter((m) => m.reasoning).length;
			const successMsg = [
				"[OK] OpenCode Zen Session 已成功刷新！",
				`• 全新 Session: ${result.sessionId}`,
				`• 免费模型: 已对齐 ${result.modelsCount} 款 0 额度模型 (${reasoningCount} 款支持思考推理)`,
				`• 请求头伪装: 7 维官方客户端签名已注入`,
				`• 同步状态: models.json [OK] | CC-Switch ${result.ccSwitchUpdated ? "[OK]" : "-(未安装或无此条目)"}`,
			].join("\n");
			notify(ctx, successMsg, "info");
			return successMsg;
		} catch (error) {
			const err = `[ERR] 刷新失败: ${formatError(error)}`;
			notify(ctx, err, "error");
			return err;
		}
	}

	// 4. /zen ping [modelId]：网络时延实时探测
	if (command === "ping") {
		const target = sub[1] || "big-pickle";
		const key = getStoredZenApiKey();
		notify(ctx, "正在探测 OpenCode Zen 免费模型网络时延与连通性...", "info");
		const start = Date.now();
		try {
			const res = await fetch(`${ZEN_BASE_URL}/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${key}`,
					"Content-Type": "application/json",
					"User-Agent": ZEN_USER_AGENT,
					"x-opencode-client": "cli",
					"x-opencode-session": getStoredZenSessionId() || generateZenSessionId(),
				},
				body: JSON.stringify({
					model: target,
					messages: [{ role: "user", content: "ping" }],
					max_tokens: 5,
					stream: false,
				}),
			});
			const ms = Date.now() - start;
			const statusTag = res.ok ? "[200 OK]" : `[HTTP ${res.status}]`;
			const speedTag = ms < 800 ? "极速" : ms < 2000 ? "良好" : "稍慢";
			const pingMsg = `• ${target}: ${statusTag} (${ms}ms, ${speedTag})`;
			notify(ctx, pingMsg, "info");
			return pingMsg;
		} catch (e: any) {
			const ms = Date.now() - start;
			const pingMsg = `• ${target}: [FAILED] (${ms}ms, ${e.message})`;
			notify(ctx, pingMsg, "info");
			return pingMsg;
		}
	}

	// 5. /zen model <modelId>：快速切换模型
	if (command === "model") {
		const targetId = sub[1];
		if (!targetId) {
			const err = "[ERR] 用法: /zen model <模型ID>\n示例: /zen model big-pickle";
			notify(ctx, err, "warning");
			return err;
		}
		if (typeof (ctx as any).setModel === "function") {
			await (ctx as any).setModel({ provider: ZEN_PROVIDER_ID, id: targetId });
			const msg = `[OK] 已成功切换至 Zen 模型: ${targetId}`;
			notify(ctx, msg, "info");
			return msg;
		}
		const warnMsg = `[WARN] 当前环境暂不支持动态 setModel，请在配置文件或交互界面选择 ${targetId}`;
		notify(ctx, warnMsg, "warning");
		return warnMsg;
	}

	// 6. 输入了具体的 API Key: /zen oc_sk_... 或 /zen key oc_sk_...
	let zenApiKey: string | undefined;
	if (command === "key" && sub[1]) {
		zenApiKey = sub[1].trim();
	} else if (rawArg.startsWith("oc_sk_")) {
		zenApiKey = rawArg;
	} else if (
		rawArg.length > 0 &&
		!["status", "refresh", "sync", "list", "models", "free", "ping", "model"].includes(command)
	) {
		zenApiKey = rawArg;
	}

	if (zenApiKey) {
		try {
			notify(ctx, "正在验证 OpenCode Zen API Key 并智能探测免费模型上下文与思考等级...", "info");
			const result = await syncZenConfiguration({ apiKey: zenApiKey, forceSession: true });
			if (pi) {
				registerZenProviderToPi(pi, result.apiKey, result.sessionId, result.resolvedModels);
			}
			if ((ctx as { modelRegistry?: { refresh?: (arg: unknown) => Promise<unknown> } }).modelRegistry?.refresh) {
				await (ctx as { modelRegistry: { refresh: (arg: unknown) => Promise<unknown> } }).modelRegistry
					.refresh({ providers: [ZEN_PROVIDER_ID] })
					.catch(() => {});
			}

			const modelCards = result.resolvedModels.map((m, idx) => formatModelCard(m, idx + 1));
			const reasoningCount = result.resolvedModels.filter((m) => m.reasoning).length;

			const msg = [
				"[OK] OpenCode Zen 配置成功！免费套餐与零额度模型已全自动识别并对接：",
				`• API Key: ${maskKey(result.apiKey)} (已验证并保存)`,
				`• 会话 Session: ${result.sessionId} (官方降序时间戳逆向算法，30分钟自动轮换自愈)`,
				`• 识别到 ${result.modelsCount} 款 0 额度免费模型 (${reasoningCount} 款支持深度推理/思考)：`,
				"",
				...modelCards,
				"",
				`• 同步路径: ${result.modelsPath}`,
				result.ccSwitchUpdated ? "• CC-Switch: 本地数据库已同步更新" : "",
				"提示：全部模型参数已热载入 Pi，输入 /model 或在模型选择器中可即刻选用！",
			].filter(Boolean).join("\n");
			notify(ctx, msg, "info");
			return msg;
		} catch (error) {
			const err = `[ERR] 配置失败: ${formatError(error)}`;
			notify(ctx, err, "error");
			return err;
		}
	}

	// 7. 无参调用: /zen
	const status = getZenStatusInfo();
	if (status.hasKey) {
		// 已有 Key 时，自动强制刷新 Session 并重新注册热载
		try {
			notify(ctx, "正在刷新 OpenCode Zen 会话与请求头...", "info");
			const result = await syncZenConfiguration({ forceSession: true });
			if (pi) {
				registerZenProviderToPi(pi, result.apiKey, result.sessionId, result.resolvedModels);
			}
			if ((ctx as { modelRegistry?: { refresh?: (arg: unknown) => Promise<unknown> } }).modelRegistry?.refresh) {
				await (ctx as { modelRegistry: { refresh: (arg: unknown) => Promise<unknown> } }).modelRegistry
					.refresh({ providers: [ZEN_PROVIDER_ID] })
					.catch(() => {});
			}
			const reasoningCount = result.resolvedModels.filter((m) => m.reasoning).length;
			const msg = [
				"[OpenCode Zen 已自动刷新并就绪]",
				`• API Key: ${maskKey(result.apiKey)}`,
				`• 全新 Session: ${result.sessionId} (有效且已持久化)`,
				`• 自动对接免费模型: 已同步 ${result.modelsCount} 个 0 额度消耗模型 (${reasoningCount} 款支持思考推理)`,
				`• 请求头保护: 30分钟自动轮换 + 7维官方签名 + 6大核心工具全注入`,
				"",
				"常用操作：",
				"  /zen <key>   - 更换 API Key (自动重识免费模型/上下文/思考等级)",
				"  /zen status  - 详情状态",
				"  /zen list    - 查看所有可用免费模型详细规格",
				"  /zen ping    - 实时探测网络连通性与时延",
			].join("\n");
			notify(ctx, msg, "info");
			return msg;
		} catch (error) {
			const err = `[ERR] 同步状态失败: ${formatError(error)}`;
			notify(ctx, err, "error");
			return err;
		}
	}

	// 没有 Key，如果在支持交互的 UI 环境下，弹出输入框
	if (ctx.hasUI && typeof ctx.ui.input === "function") {
		try {
			const enteredKey = await ctx.ui.input(
				"请输入 OpenCode Zen API Key (形如 oc_sk_...):",
				"oc_sk_",
			);
			if (enteredKey && enteredKey.trim()) {
				return await handleZenCommand(enteredKey.trim(), ctx, pi);
			}
			const cancelMsg = "已取消输入。如需配置请使用 /zen <oc_sk_xxx>";
			notify(ctx, cancelMsg, "info");
			return cancelMsg;
		} catch {
			// fallthrough to text usage
		}
	}

	const noKeyMsg = "请提供 OpenCode Zen API Key。用法：/zen <oc_sk_xxx>";
	notify(ctx, noKeyMsg, "warning");
	return `[WARN] ${noKeyMsg}`;
}

function maskKey(key: string): string {
	if (!key) return "未配置";
	if (key.length <= 12) return "******";
	return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

function notify(
	ctx: ExtensionCommandContext,
	message: string,
	level: "info" | "warning" | "error" = "info",
): void {
	try {
		if (ctx.hasUI) {
			ctx.ui.notify(message, level);
		} else {
			// 终端或非交互环境日志输出
			console.log(`[${level.toUpperCase()}] ${message}`);
		}
	} catch {
		// 容错
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
