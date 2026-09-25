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

		// 检查并获取有效 Session ID (若过期或缺失自动轮换)
		let currentSession = getStoredZenSessionId();
		if (
			!currentSession ||
			!isValidZenSessionId(currentSession) ||
			isZenSessionExpired(currentSession, DEFAULT_SESSION_MAX_AGE_MS)
		) {
			currentSession = generateZenSessionId();
			setActiveZenSessionId(currentSession);
			debouncedAutoSync(true);
		}

		const requestId = generateZenRequestId();

		// 构建完整官方客户端伪装请求头
		headers.set("User-Agent", ZEN_USER_AGENT);
		headers.set("x-opencode-client", "cli");
		if (!headers.has("x-opencode-project")) {
			headers.set("x-opencode-project", generateZenProjectId());
		}
		headers.set("x-opencode-session", currentSession);
		headers.set("x-opencode-request", requestId);
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

				// A. 关键防 403 规约：OpenCode Zen 后端严格要求 tools 参数存在，缺失时立即报 403 FreeTierError
				// 针对无工具场景（如 Pi Compaction / Summarization 总结），注入官方 6 件套并将 tool_choice 设为 "none"，
				// 既满足网关 tools 存在性校验，又严禁模型生成工具调用，彻底杜绝 "Summarization attempted to call a tool" 报错
				if (!Array.isArray(payload.tools) || payload.tools.length === 0) {
					payload.tools = OPENCODE_OFFICIAL_TOOLS;
					payload.tool_choice = "none";
					modified = true;
				} else {
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

				// C. 规范化 reasoning_effort
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

				// D. 剔除多余 thinking 顶层对象
				if ("thinking" in payload && typeof payload.thinking === "object") {
					delete payload.thinking;
					modified = true;
				}

				// E. 上下文超限保护（Compaction Context Guard）：
				// 当上下文过大（如会话累积超 40 万 Token，超过 200K 模型上限）触发 Compaction 时，
				// 避免超大请求体导致 Cloudflare/OpenCode 网关连接重置或 400 溢出报错。
				// 自动保留初始上下文与最近会话消息，修剪中间冗余历史，确保总结和压缩请求顺利跑通。
				if (Array.isArray(payload.messages) && payload.messages.length > 6) {
					const bodyStr = JSON.stringify(payload.messages);
					// 500,000 字符约为 125,000 tokens，能安全适配 200k 上下文窗口
					if (bodyStr.length > 500_000) {
						const head = payload.messages.slice(0, 2);
						const tail: unknown[] = [];
						let tailChars = 0;
						// 从末尾向前累加，保留约 300,000 字符的最新上下文
						for (let i = payload.messages.length - 1; i >= 2; i--) {
							const msg = payload.messages[i];
							const msgLen = JSON.stringify(msg).length;
							if (tailChars + msgLen > 300_000 && tail.length > 0) {
								break;
							}
							tail.unshift(msg);
							tailChars += msgLen;
						}
						const notice = {
							role: "system",
							content: `[Zen Guard: Omitted ${payload.messages.length - head.length - tail.length} intermediate messages to fit context window for compaction]`,
						};
						payload.messages = [...head, notice, ...tail];
						modified = true;
					}
				}

				if (modified) {
					newBody = JSON.stringify(payload);
				}
			} catch {
				// 忽略非 JSON 请求体
			}
		}

		const newInit: RequestInit = {
			...init,
			headers,
			body: newBody,
		};

		let response: Response;
		try {
			response = await originalFetch.call(this, targetUrl, newInit);
		} catch (networkError) {
			throw networkError;
		}

		// 遇 401/403 自动触发 Session 自愈轮换 (防抖控制，30 秒最多一次)
		if (response.status === 401 || response.status === 403) {
			debouncedAutoSync(true);
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
		if (!textContent) {
			throw readErr;
		}
	}

	const promptTokens = Number(usage.prompt_tokens) || 0;
	let completionTokens = Number(usage.completion_tokens) || 0;
	if (completionTokens === 0 && textContent) {
		completionTokens = Math.ceil(textContent.length / 4);
	}
	const totalTokens = Number(usage.total_tokens) || (promptTokens + completionTokens);

	const assembled = {
		id,
		object: "chat.completion",
		created: Math.floor(Date.now() / 1000),
		model: modelId || "opencode-zen-model",
		choices: [
			{
				index: 0,
				message: {
					role: "assistant",
					content: textContent,
				},
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
			// 检查 x-opencode-session 是否过期 (>30分钟) 或缺失
			let currentSession = event.headers["x-opencode-session"];
			if (
				typeof currentSession !== "string" ||
				!isValidZenSessionId(currentSession) ||
				isZenSessionExpired(currentSession, DEFAULT_SESSION_MAX_AGE_MS)
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
			const tools = payload.tools;
			let modified = false;
			const transformed = { ...payload };

			// A. 工具规范对齐：无工具时补齐官方 6 大核心工具；已有工具时按字母升序严格重排 (localeCompare)
			if (!Array.isArray(tools) || tools.length === 0) {
				transformed.tools = OPENCODE_OFFICIAL_TOOLS;
				transformed.tool_choice = "auto";
				modified = true;
			} else {
				transformed.tools = [...tools].sort((a: any, b: any) => {
					const nameA = a.function?.name || a.name || "";
					const nameB = b.function?.name || b.name || "";
					return nameA.localeCompare(nameB);
				});
				modified = true;
			}

			// B. 流式元数据对齐：补充 stream_options: { include_usage: true }
			if (transformed.stream === true && !transformed.stream_options) {
				transformed.stream_options = { include_usage: true };
				modified = true;
			}

			// C. 规范化 reasoning_effort：OpenCode Zen 上游端点仅支持 "low", "medium", "high"
			// 若模型本身为非思考模型 (如 jev-1.13-free)，直接移除 reasoning_effort 避免 400
			// 若为 "max" 或 "xhigh"，降级映射为 "high"；若为 "minimal" 映射为 "low"，彻底根除 400 Invalid request parameters
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

			// D. 移除 OpenAI 兼容接口不识别的额外 thinking 顶层对象 (如 Anthropic 遗留字段)
			if ("thinking" in transformed && typeof transformed.thinking === "object") {
				delete transformed.thinking;
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
			// 若当前会话不存在或已使用超过 30 分钟，后台自动续期
			if (!currentSession || isZenSessionExpired(currentSession, DEFAULT_SESSION_MAX_AGE_MS)) {
				const apiKey = getStoredZenApiKey();
				if (apiKey) {
					await syncZenConfiguration({ forceSession: true });
				}
			}
		} catch {
			// 后台静默处理，绝不中断用户的编码交互流程
		}
	});

	// 6. 注册 /zen 指令
	pi.registerCommand("zen", {
		description: "OpenCode Zen 免费模型与 Session 会话自动维护 (/zen [key|refresh|status|list])",
		getArgumentCompletions: (prefix: string) => {
			const candidates = ["refresh", "status", "list", "models"]
				.filter((cmd) => cmd.startsWith(prefix.toLowerCase()))
				.map((cmd) => ({ value: cmd, label: cmd }));
			return candidates.length > 0 ? candidates : null;
		},
		handler: async (args, ctx) => {
			await handleZenCommand(args, ctx, pi);
		},
	});
}

export async function handleZenCommand(
	args: string,
	ctx: ExtensionCommandContext,
	pi?: ExtensionAPI,
): Promise<void> {
	const rawArg = args.trim();
	const command = rawArg.toLowerCase();

	// 1. 查看状态: /zen status
	if (command === "status") {
		const status = getZenStatusInfo();
		if (!status.hasKey) {
			notify(ctx, "OpenCode Zen 尚未配置 API Key。请使用 /zen <oc_sk_xxx> 进行配置。", "warning");
			return;
		}

		const ageDesc = status.sessionAgeMinutes < 60
			? `${status.sessionAgeMinutes} 分钟`
			: `${(status.sessionAgeMinutes / 60).toFixed(1)} 小时`;

		const storedModels = getStoredZenModels();
		const reasoningCount = storedModels.filter((m) => m.reasoning).length;
		const visionCount = storedModels.filter((m) => m.input.includes("image")).length;

		const msg = [
			"✨ [OpenCode Zen 运行状态]",
			`• API Key: ${status.maskedKey}`,
			`• Session: ${status.sessionId || "未生成"} (${status.sessionExpired ? "已过期" : `有效，创建于 ${ageDesc}前`})`,
			`• 模型库: 已激活 ${storedModels.length} 款 0 额度模型 (${reasoningCount} 款支持思考推理，${visionCount} 款支持多模态)`,
			`• 请求头保护: 7维官方客户端签名 + 30分钟降序时间戳自愈`,
			"",
			"常用指令：",
			"  /zen <key>   - 更新 Key 并全自动识别免费模型/上下文/思考等级",
			"  /zen refresh - 强制换新 Session ID",
			"  /zen list    - 查看所有可用免费模型详细规格卡片",
		].join("\n");

		notify(ctx, msg, "info");
		return;
	}

	// 2. 查看模型清单: /zen list 或 /zen models
	if (command === "list" || command === "models") {
		const storedModels = getStoredZenModels();
		if (storedModels.length === 0) {
			notify(ctx, "当前尚未同步任何模型，请先运行 /zen <key>。", "warning");
			return;
		}

		const modelCards = storedModels.map((m, idx) => formatModelCard(m, idx + 1));
		const listMsg = [
			`✨ [OpenCode Zen 免费模型列表 (${storedModels.length} 款)]`,
			"智能识别精确上下文上限（Context）、最大输出（Max Tokens）及推理思考等级（Thinking）：",
			"",
			...modelCards,
			"",
			"提示：这些模型已全量注册至 Pi，使用 /model 或快捷键随时切换！",
		].join("\n");

		notify(ctx, listMsg, "info");
		return;
	}

	// 3. 强制换新 Session: /zen refresh
	if (command === "refresh") {
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
				"✓ OpenCode Zen Session 已成功刷新！",
				`• 全新 Session: ${result.sessionId}`,
				`• 免费模型: 已对齐 ${result.modelsCount} 款 0 额度模型 (${reasoningCount} 款支持思考推理)`,
				`• 请求头伪装: 7 维官方客户端签名已注入`,
				`• 同步状态: models.json ✓ | CC-Switch ${result.ccSwitchUpdated ? "✓" : "-(未安装或无此条目)"}`,
			].join("\n");
			notify(ctx, successMsg, "info");
		} catch (error) {
			notify(ctx, `刷新失败: ${formatError(error)}`, "error");
		}
		return;
	}

	// 4. 输入了具体的 API Key: /zen oc_sk_... 或其它 key
	if (rawArg.length > 0 && !["status", "refresh", "list", "models"].includes(command)) {
		try {
			notify(ctx, "正在验证 OpenCode Zen API Key 并智能探测免费模型上下文与思考等级...", "info");
			const result = await syncZenConfiguration({ apiKey: rawArg, forceSession: true });
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
				"🎉 OpenCode Zen 配置成功！免费套餐与零额度模型已全自动识别并对接：",
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
		} catch (error) {
			notify(ctx, `配置失败: ${formatError(error)}`, "error");
		}
		return;
	}

	// 5. 无参调用: /zen
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
				"✨ [OpenCode Zen 已自动刷新并就绪]",
				`• API Key: ${maskKey(result.apiKey)}`,
				`• 全新 Session: ${result.sessionId} (有效且已持久化)`,
				`• 自动对接免费模型: 已同步 ${result.modelsCount} 个 0 额度消耗模型 (${reasoningCount} 款支持思考推理)`,
				`• 请求头保护: 30分钟自动轮换 + 7维官方签名 + 6大核心工具全注入`,
				"",
				"常用操作：",
				"  /zen <key>   - 更换 API Key (自动重识免费模型/上下文/思考等级)",
				"  /zen status  - 详情状态",
				"  /zen list    - 查看所有可用免费模型详细规格",
			].join("\n");
			notify(ctx, msg, "info");
		} catch (error) {
			notify(ctx, `同步状态失败: ${formatError(error)}`, "error");
		}
		return;
	}

	// 没有 Key，如果在支持交互的 UI 环境下，弹出输入框
	if (ctx.hasUI && typeof ctx.ui.input === "function") {
		try {
			const enteredKey = await ctx.ui.input(
				"请输入 OpenCode Zen API Key (形如 oc_sk_...):",
				"oc_sk_",
			);
			if (enteredKey && enteredKey.trim()) {
				await handleZenCommand(enteredKey.trim(), ctx, pi);
				return;
			}
			notify(ctx, "已取消输入。如需配置请使用 /zen <oc_sk_xxx>", "info");
			return;
		} catch {
			// fallthrough to text usage
		}
	}

	notify(ctx, "请提供 OpenCode Zen API Key。用法：/zen <oc_sk_xxx>", "warning");
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
