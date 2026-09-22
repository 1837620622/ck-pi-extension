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
	getStoredZenApiKey,
	getStoredZenModels,
	getStoredZenSessionId,
	getZenStatusInfo,
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

export function isZenModelTarget(model?: { provider?: string; id?: string }): boolean {
	if (!model) return false;
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

export default function piZenSession(pi: ExtensionAPI): void {
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
				// 异步落盘，保持配置同步
				syncZenConfiguration({ forceSession: true }).catch(() => {});
			}

			// 注入全部官方客户端 7 维对齐请求头
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
		if (isZenModelTarget(ctx.model) && event.payload && typeof event.payload === "object") {
			const payload = event.payload as Record<string, unknown>;
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

			if (modified) {
				return transformed;
			}
		}
	});

	// 4. 网关响应守卫：遇 401/403 会话受限或过期时，立即自愈换新 Session ID
	pi.on("after_provider_response", (event, ctx) => {
		if (isZenModelTarget(ctx.model) && (event.status === 401 || event.status === 403)) {
			// 自动异步刷新 Session
			syncZenConfiguration({ forceSession: true }).catch(() => {});
			if (ctx.hasUI) {
				ctx.ui.notify(
					`检测到 OpenCode Zen 会话受限 (HTTP ${event.status})，已自动轮换新 Session ID。`,
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
