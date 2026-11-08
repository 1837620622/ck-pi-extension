/**
 * OpenCode Zen 免费模型参数与配置注册表
 *
 * 严格基于 OpenCode 官方客户端内置参数与在线端点响应对齐：
 * 包含精确上下文上限（Context Window）、最大输出（Max Tokens）、推理思考等级映射（thinkingLevelMap）与输入模态。
 */

import type { ZenModelDefinition } from "./types.js";

export const ZEN_PROVIDER_ID = "opencode-zen-free";
export const ZEN_RESPONSES_PROVIDER_ID = "opencode-zen-free-responses";
export const ZEN_BASE_URL = "https://opencode.ai/inference/v1";
export const ZEN_LEGACY_BASE_URL = "https://opencode.ai/zen/v1";
export const ZEN_USER_AGENT = "opencode/latest/2.0.28/cli";
export const ZEN_DEFAULT_KEY = "public";

/**
 * 判定模型 ID 是否属于必须走 OpenAI Responses API 协议的端点模型 (如 Meta Muse Spark 家族)
 */
export function isResponsesProtocolModelId(id?: string): boolean {
	if (!id || typeof id !== "string") return false;
	const cleanId = id.replace(/^(opencode-zen-free(-responses)?|zen|opencode)\//i, "").trim();
	return /^muse-spark/i.test(cleanId);
}

/**
 * 将 OpenCode Zen 模型划分为标准 ChatCompletions 协议模型与 Responses 协议模型
 */
export function partitionZenModels(models: ZenModelDefinition[]): {
	completions: ZenModelDefinition[];
	responses: ZenModelDefinition[];
} {
	const completions: ZenModelDefinition[] = [];
	const responses: ZenModelDefinition[] = [];
	for (const m of models) {
		if (isResponsesProtocolModelId(m.id)) {
			responses.push(m);
		} else {
			completions.push(m);
		}
	}
	return { completions, responses };
}

export const STANDARD_THINKING_LEVELS: Record<string, string | null> = {
	minimal: "low",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "high",
	max: "high",
	off: null,
};

export const MUSE_SPARK_THINKING_LEVELS: Record<string, string | null> = {
	minimal: "low",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "high",
	max: "high",
	off: null,
};

export const GRANULAR_THINKING_LEVELS: Record<string, string | null> = {
	minimal: "low",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "high",
	max: "high",
	off: null,
};

/**
 * 官方已知免费模型精确规格字典
 */
export const KNOWN_ZEN_FREE_MODELS: Record<string, ZenModelDefinition> = {
	"step-5-preview-free": {
		id: "step-5-preview-free",
		name: "StepFun Step-5 Preview Free (OpenCode Zen)",
		contextWindow: 200000,
		maxTokens: 32768,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"exo-free": {
		id: "exo-free",
		name: "Exo Free (OpenCode Zen)",
		contextWindow: 128000,
		maxTokens: 16384,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"nemotron-3-ultra-free": {
		id: "nemotron-3-ultra-free",
		name: "NVIDIA Nemotron 3 Ultra Free (OpenCode Zen)",
		contextWindow: 1000000,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"ling-3.0-flash-fin-free": {
		id: "ling-3.0-flash-fin-free",
		name: "Ling 3.0 Flash Fin Free (OpenCode Zen)",
		contextWindow: 262144,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"jev-1.13-free": {
		id: "jev-1.13-free",
		name: "Jev 1.13 Free (OpenCode Zen)",
		contextWindow: 128000,
		maxTokens: 16384,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"fledge-alpha-free": {
		id: "fledge-alpha-free",
		name: "Fledge Alpha Free (OpenCode Zen)",
		contextWindow: 200000,
		maxTokens: 32000,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"ling-3.1-flash-free": {
		id: "ling-3.1-flash-free",
		name: "Ling 3.1 Flash Free (OpenCode Zen)",
		contextWindow: 262144,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"mimo-v2.6-flash-free": {
		id: "mimo-v2.6-flash-free",
		name: "Xiaomi Mimo v2.6 Flash Free (OpenCode Zen)",
		contextWindow: 200000,
		maxTokens: 32000,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"nemotron-3.5-lightning-free": {
		id: "nemotron-3.5-lightning-free",
		name: "Nemotron 3.5 Lightning Free (OpenCode Zen)",
		contextWindow: 262144,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"big-pickle": {
		id: "big-pickle",
		name: "Big Pickle Free (OpenCode Zen)",
		contextWindow: 200000,
		maxTokens: 32000,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"space-bunny-free": {
		id: "space-bunny-free",
		name: "Space Bunny Free (OpenCode Zen)",
		contextWindow: 200000,
		maxTokens: 32000,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"longcat-2.5-preview-free": {
		id: "longcat-2.5-preview-free",
		name: "LongCat 2.5 Preview Free (OpenCode Zen)",
		contextWindow: 200000,
		maxTokens: 32000,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"muse-spark-1.3-contributor-free": {
		id: "muse-spark-1.3-contributor-free",
		name: "Meta Muse Spark 1.3 Free (OpenCode Zen)",
		contextWindow: 1048576,
		maxTokens: 32768,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: MUSE_SPARK_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"muse-spark-1.2-contributor-free": {
		id: "muse-spark-1.2-contributor-free",
		name: "Meta Muse Spark 1.2 Free (OpenCode Zen)",
		contextWindow: 1048576,
		maxTokens: 32768,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: MUSE_SPARK_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"cat-jam-free": {
		id: "cat-jam-free",
		name: "Cat Jam Free (OpenCode Zen)",
		contextWindow: 262144,
		maxTokens: 32768,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"deepseek-v4.1-flash-free": {
		id: "deepseek-v4.1-flash-free",
		name: "DeepSeek V4.1 Flash Free (OpenCode Zen)",
		contextWindow: 200000,
		maxTokens: 32000,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"glm-5.3-flash-free": {
		id: "glm-5.3-flash-free",
		name: "GLM 5.3 Flash Free (OpenCode Zen)",
		contextWindow: 200000,
		maxTokens: 32000,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"nemotron-3.5-super-vl-free": {
		id: "nemotron-3.5-super-vl-free",
		name: "NVIDIA Nemotron 3.5 Super VL Free (OpenCode Zen)",
		contextWindow: 1048576,
		maxTokens: 32768,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
};

/**
 * 服务端强制的上下文/输出上限（以 models.dev 官方元数据为准）。
 * 远端同步、本地 zen-models.json 或启发式推断给出更大的值时一律压回这里，
 * 否则 Pi 会按虚报的窗口计算 compaction 时机，长会话在服务端被拒。
 * 来源: https://github.com/anomalyco/models.dev/tree/dev/providers/opencode/models (2026-11-09)
 */
export const ZEN_SERVER_LIMITS: Record<string, { context: number; output: number }> = {
	"deepseek-v4.1-flash-free": { context: 200000, output: 32000 },
	"glm-5.3-flash-free": { context: 200000, output: 32000 },
};

export function applyZenServerLimits<T extends { id: string; contextWindow: number; maxTokens: number }>(def: T): T {
	const limit = ZEN_SERVER_LIMITS[def.id] ?? ZEN_SERVER_LIMITS[def.id.replace(/^opencode(-zen)?\//, "")];
	if (!limit) return def;
	return {
		...def,
		contextWindow: Math.min(def.contextWindow, limit.context),
		maxTokens: Math.min(def.maxTokens, limit.output),
	};
}

/**
 * 高精智能模型能力与参数解析引擎
 * 当用户输入新 Key 或探测到未收录的免费/零额度模型时，全自动深度识别：
 * 1. 上下文窗口限制 (Context Window)
 * 2. 最大输出 Token 上限 (Max Tokens)
 * 3. 思考推理能力与思考等级映射 (Reasoning & thinkingLevelMap)
 * 4. 文本/视觉多模态输入支持 (Input Modalities)
 * 5. 0 额度计费配置 (Zero-Cost Billing)
 */
export function inferModelCapabilities(
	modelId: string,
	raw?: Record<string, unknown>,
): ZenModelDefinition {
	return applyZenServerLimits(inferModelCapabilitiesRaw(modelId, raw));
}

function inferModelCapabilitiesRaw(
	modelId: string,
	raw?: Record<string, unknown>,
): ZenModelDefinition {
	// 1. 若为已知免费模型，以此为高精基准
	if (KNOWN_ZEN_FREE_MODELS[modelId]) {
		const base: ZenModelDefinition = { ...KNOWN_ZEN_FREE_MODELS[modelId] };
		// 若在线接口返回了显式上下文或最大输出覆盖，进行动态微调
		if (typeof raw?.context_window === "number" && raw.context_window > 0) {
			base.contextWindow = raw.context_window;
		} else if (typeof raw?.context_length === "number" && raw.context_length > 0) {
			base.contextWindow = raw.context_length;
		}
		if (typeof raw?.max_tokens === "number" && raw.max_tokens > 0) {
			base.maxTokens = raw.max_tokens;
		} else if (typeof raw?.max_output_tokens === "number" && raw.max_output_tokens > 0) {
			base.maxTokens = raw.max_output_tokens;
		}
		return base;
	}

	const lower = modelId.toLowerCase();

	// 2. 上下文窗口识别 (contextWindow)
	let contextWindow = 200000;
	if (typeof raw?.context_window === "number" && raw.context_window > 0) {
		contextWindow = raw.context_window;
	} else if (typeof raw?.context_length === "number" && raw.context_length > 0) {
		contextWindow = raw.context_length;
	} else if (typeof raw?.max_context_length === "number" && raw.max_context_length > 0) {
		contextWindow = raw.max_context_length;
	} else if (typeof (raw?.limit as { context?: number } | undefined)?.context === "number") {
		contextWindow = (raw!.limit as { context: number }).context;
	} else if (lower.includes("2m") || lower.includes("2000k")) {
		contextWindow = 2097152;
	} else if (
		lower.includes("1m") ||
		lower.includes("1000k") ||
		lower.includes("1024k") ||
		lower.includes("muse") ||
		lower.includes("spark") ||
		lower.includes("gemini") ||
		lower.includes("deepseek") ||
		(lower.includes("nemotron") && lower.includes("ultra")) ||
		(lower.includes("kimi") && lower.includes("k3")) ||
		lower.includes("minimax")
	) {
		contextWindow = lower.includes("muse") || lower.includes("gemini") ? 1048576 : 1000000;
	} else if (lower.includes("512k")) {
		contextWindow = 524288;
	} else if (
		lower.includes("256k") ||
		(lower.includes("nemotron") && lower.includes("lightning")) ||
		lower.includes("ling") ||
		lower.includes("cat-jam") ||
		lower.includes("catjam") ||
		(lower.includes("kimi") && !lower.includes("k3"))
	) {
		contextWindow = 262144;
	} else if (
		lower.includes("128k") ||
		lower.includes("qwen") ||
		lower.includes("grok") ||
		lower.includes("jev") ||
		lower.includes("system-1")
	) {
		contextWindow = lower.includes("qwen") ? 131072 : 128000;
	} else {
		contextWindow = 200000;
	}

	// 3. 最大输出 Token 识别 (maxTokens)
	let maxTokens = 32000;
	if (typeof raw?.max_output_tokens === "number" && raw.max_output_tokens > 0) {
		maxTokens = raw.max_output_tokens;
	} else if (typeof raw?.max_tokens === "number" && raw.max_tokens > 0) {
		maxTokens = raw.max_tokens;
	} else if (typeof (raw?.limit as { output?: number } | undefined)?.output === "number") {
		maxTokens = (raw!.limit as { output: number }).output;
	} else if (lower.includes("nemotron") && lower.includes("lightning")) {
		maxTokens = 262144;
	} else if (lower.includes("muse") || lower.includes("spark")) {
		maxTokens = 131072;
	} else if (lower.includes("nemotron") && lower.includes("ultra")) {
		maxTokens = 128000;
	} else if (
		lower.includes("gemini") ||
		lower.includes("claude-3-7") ||
		lower.includes("claude-sonnet") ||
		lower.includes("claude-opus") ||
		lower.includes("deepseek-v4")
	) {
		maxTokens = 65536;
	} else if (
		lower.includes("deepseek") ||
		lower.includes("ling") ||
		lower.includes("glm") ||
		lower.includes("qwen") ||
		lower.includes("grok") ||
		lower.includes("minimax") ||
		lower.includes("gpt-5") ||
		lower.includes("o1") ||
		lower.includes("o3")
	) {
		maxTokens = 32768;
	} else if (lower.includes("jev") || lower.includes("system-1") || lower.includes("kimi-k2")) {
		maxTokens = 16384;
	} else {
		maxTokens = 32000;
	}

	// 安全上限钳位：单次输出 Token 绝不能超过 65536，坚决杜绝 384k/100万 Token 的失控死循环
	const safeMaxLimit = 65536;
	if (maxTokens > safeMaxLimit) {
		maxTokens = safeMaxLimit;
	}

	// 4. 是否支持推理思考 (reasoning)
	let reasoning = true;
	if (typeof raw?.reasoning === "boolean") {
		reasoning = raw.reasoning;
	} else if (typeof raw?.supports_thinking === "boolean") {
		reasoning = raw.supports_thinking;
	} else if (typeof raw?.thinking === "boolean") {
		reasoning = raw.thinking;
	} else if (
		lower.includes("system-1") ||
		lower.includes("reflex") ||
		lower.includes("chat-only") ||
		lower.includes("instruct-only") ||
		lower.includes("base") ||
		lower.includes("instant") ||
		lower.includes("jev") ||
		lower.includes("exo")
	) {
		reasoning = false;
	}

	// 5. 思考等级映射 (thinkingLevelMap)
	let thinkingLevelMap: ZenModelDefinition["thinkingLevelMap"] = undefined;
	if (reasoning) {
		if (lower.includes("muse") || lower.includes("spark")) {
			thinkingLevelMap = MUSE_SPARK_THINKING_LEVELS;
		} else if (
			lower.includes("gemini") ||
			lower.includes("claude") ||
			lower.includes("gpt-5") ||
			lower.includes("o1") ||
			lower.includes("o3") ||
			lower.includes("o4")
		) {
			thinkingLevelMap = GRANULAR_THINKING_LEVELS;
		} else {
			thinkingLevelMap = STANDARD_THINKING_LEVELS;
		}
	}

	// 6. 输入模态识别 (input)
	let input: ("text" | "image")[] = ["text"];
	if (Array.isArray(raw?.modalities) && raw.modalities.length > 0) {
		input = raw.modalities.includes("image") || raw.modalities.includes("vision") ? ["text", "image"] : ["text"];
	} else if (
		lower.includes("vision") ||
		lower.includes("vl") ||
		lower.includes("multimodal") ||
		lower.includes("image") ||
		lower.includes("omni") ||
		lower.includes("gemini") ||
		lower.includes("claude") ||
		lower.includes("mimo") ||
		lower.includes("muse") ||
		lower.includes("step") ||
		lower.includes("cat-jam") ||
		lower.includes("catjam") ||
		lower.includes("deepseek-v4.1") ||
		lower.includes("deepseekv4.1") ||
		lower.includes("gpt-4o") ||
		lower.includes("gpt-5")
	) {
		input = ["text", "image"];
	}

	let baseCleanName = modelId
		.split(/[-_]/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

	// 修正品牌专有大小写
	baseCleanName = baseCleanName
		.replace(/\bDeepseek\b/g, "DeepSeek")
		.replace(/\bQwen\b/g, "Qwen")
		.replace(/\bMinimax\b/g, "MiniMax")
		.replace(/\bGpt\b/g, "GPT")
		.replace(/\bGlm\b/g, "GLM")
		.replace(/\bStepfun\b/g, "StepFun")
		.replace(/\bOpencode\b/g, "OpenCode");

	let displayName = baseCleanName;
	if (lower.includes("gemini") && !displayName.includes("Google")) {
		displayName = `Google ${displayName}`;
	} else if (lower.includes("claude") && !displayName.includes("Anthropic")) {
		displayName = `Anthropic ${displayName}`;
	} else if ((lower.includes("gpt") || lower.includes("o1") || lower.includes("o3")) && !displayName.includes("OpenAI")) {
		displayName = `OpenAI ${displayName}`;
	} else if (lower.includes("kimi") && !displayName.includes("Moonshot")) {
		displayName = `Moonshot ${displayName}`;
	} else if (lower.includes("grok") && !displayName.includes("xAI")) {
		displayName = `xAI ${displayName}`;
	} else if (lower.includes("nemotron") && !displayName.includes("NVIDIA")) {
		displayName = `NVIDIA ${displayName}`;
	} else if (lower.includes("mimo") && !displayName.includes("Xiaomi")) {
		displayName = `Xiaomi ${displayName}`;
	} else if (lower.includes("muse") && !displayName.includes("Meta")) {
		displayName = `Meta ${displayName}`;
	} else if (lower.includes("step") && !displayName.includes("StepFun")) {
		displayName = `StepFun ${displayName}`;
	} else if (lower.includes("exo") && !displayName.includes("Exo")) {
		displayName = `Exo ${displayName}`;
	}

	displayName = `${displayName} (OpenCode Zen)`;

	return {
		id: modelId,
		name: displayName,
		contextWindow,
		maxTokens,
		reasoning,
		input,
		thinkingLevelMap,
		...(reasoning
			? {}
			: {
					samplingParams: {
						frequency_penalty: 0.05,
						presence_penalty: 0.05,
					},
			  }),
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	};
}

/**
 * 格式化 Token 数量为人类易读字符串 (如 1M, 256K, 200K)
 */
export function formatTokens(tokens: number): string {
	if (tokens >= 1000000) {
		const m = Math.round(tokens / 100000) / 10;
		return `${m}M (${tokens.toLocaleString("en-US")} tokens)`;
	}
	if (tokens >= 1000) {
		const k = Math.round(tokens / 1024);
		return `${k}K (${tokens.toLocaleString("en-US")} tokens)`;
	}
	return `${tokens.toLocaleString("en-US")} tokens`;
}

/**
 * 格式化模型思考等级与推理能力描述
 */
export function formatThinkingSummary(model: ZenModelDefinition): string {
	if (!model.reasoning) {
		return "不支持 (快反系统/无需思考)";
	}
	if (!model.thinkingLevelMap) {
		return "支持思考 (默认档位)";
	}
	const activeLevels = Object.entries(model.thinkingLevelMap)
		.filter(([_, v]) => v !== null && v !== undefined)
		.map(([k]) => k);

	if (activeLevels.length >= 6) {
		return `6档深度思考 [${activeLevels.join(", ")}]`;
	}
	if (activeLevels.length > 0) {
		return `${activeLevels.length}档思考 [${activeLevels.join(", ")}]`;
	}
	return "支持思考";
}

/**
 * 格式化生成模型的结构化卡片展示信息
 */
export function formatModelCard(model: ZenModelDefinition, index?: number): string {
	const prefix = typeof index === "number" ? `${index}. ` : "• ";
	const ctxStr = formatTokens(model.contextWindow);
	const outStr = formatTokens(model.maxTokens);
	const thinkStr = formatThinkingSummary(model);
	const inputStr = model.input.includes("image") ? "文本 + 视觉 (多模态)" : "纯文本";

	return [
		`${prefix}${model.name} (${model.id})`,
		`   └─ 上下文: ${ctxStr} | 最大输出: ${outStr} | 思考等级: ${thinkStr} | 模态: ${inputStr} | 额度: 0免费`,
	].join("\n");
}

/**
 * 为未来可能新增的免费模型生成自适应默认配置（向后兼容）
 */
export function buildFallbackModelDefinition(modelId: string): ZenModelDefinition {
	return inferModelCapabilities(modelId);
}

/**
 * 解析并生成完整的模型列表
 */
export function resolveModelDefinitions(
	discovered: Array<string | { id: string; [key: string]: unknown }>,
): ZenModelDefinition[] {
	const list: ZenModelDefinition[] = [];
	const seen = new Set<string>();

	for (const item of discovered) {
		const id = typeof item === "string" ? item : item?.id;
		if (!id || seen.has(id)) continue;
		seen.add(id);

		const rawItem = typeof item === "object" ? item : undefined;
		list.push(inferModelCapabilities(id, rawItem));
	}

	return list;
}

/**
 * OpenCode 官方 v2 闸门强校验指纹工具 (read 与 shell)
 * 逐字对齐 OpenCode 官方 v2.0.26 CLI，description 与 schema 必须完全一致以防 403 FreeTierError
 */
export const OPENCODE_V2_FINGERPRINT_TOOLS = [
	{
		type: "function",
		function: {
			name: "read",
			description:
				"Read the contents of a file or directory. Supports text files, images, and PDFs. Images and PDFs are presented directly to the model. Each text line is prefixed by its 1-based line number as <line>: <content>. The prefix is for reference and is not part of the file content. Directory entries are returned one per line. Use offset and limit to read large files or directories in sections. Prefer one larger read over many small slices, and use grep to find specific content in large files.",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "File or directory to read" },
					offset: {
						type: "integer",
						minimum: 0,
						description: "The line or directory entry to start reading from (1-based)",
					},
					limit: {
						type: "integer",
						minimum: 0,
						description:
							"The maximum number of lines or directory entries to read (defaults to and capped at 2000)",
					},
				},
				required: ["path"],
				additionalProperties: false,
			},
		},
	},
	{
		type: "function",
		function: {
			name: "shell",
			description:
				"Execute a shell command and return its output. Commands run on Linux using bash. Quote file paths containing spaces or special characters. Prefer dedicated tools over shell commands when possible. When output is large, the full result is saved to a file and a truncated preview is returned. Rely on automatic truncation unless filtering the output is more useful. Commands accept an optional timeout, background commands have no timeout by default. Background commands return immediately, and you will be notified when they complete.",
			parameters: {
				type: "object",
				properties: {
					command: { type: "string", description: "Shell command string to execute" },
					workdir: {
						type: "string",
						description:
							"Working directory to execute the command in. Defaults to the current working directory. When possible, avoid changing directories in the command and set the working directory here instead.",
					},
					timeout: {
						type: "integer",
						minimum: 0,
						description:
							"Timeout in milliseconds. Set to 0 to disable the timeout. Defaults to 120000 for foreground commands. Background commands have no timeout by default.",
					},
					background: {
						type: "boolean",
						description:
							"Run the command in the background and return immediately (useful for dev servers and long-running builds). You do not need to use '&' at the end of the command when using this parameter. You will be notified when it completes. DO NOT poll for completion.",
					},
				},
				required: ["command"],
				additionalProperties: false,
			},
		},
	},
];

export const OPENCODE_OFFICIAL_TOOLS = OPENCODE_V2_FINGERPRINT_TOOLS;

/**
 * OpenCode 官方工具规范 (OpenAI Responses 协议展平格式)
 */
export const OPENCODE_V2_RESPONSES_TOOLS = OPENCODE_V2_FINGERPRINT_TOOLS.map((t) => ({
	type: "function",
	name: t.function.name,
	description: t.function.description,
	parameters: t.function.parameters,
}));

export const OPENCODE_OFFICIAL_RESPONSES_TOOLS = OPENCODE_V2_RESPONSES_TOOLS;

/**
 * 免费模型路由映射与别名解析算法 (Zen Model Alias Router)
 */
export function resolveZenModelId(rawId?: string): string {
	if (!rawId || typeof rawId !== "string" || !rawId.trim()) {
		return "big-pickle";
	}

	let id = rawId.trim();

	// 1. 剔除客户端或供应商前缀
	id = id.replace(/^(opencode-zen-free|zen|opencode)\//i, "");

	// 2. 快捷别名转换 (自动对齐已下架模型的继承替代方案)
	const lower = id.toLowerCase();
	if (lower === "fledge" || lower === "fledge-alpha" || lower === "fledge-alpha-free") {
		return "step-5-preview-free";
	}
	if (
		lower === "step" ||
		lower === "step5" ||
		lower === "step-5" ||
		lower === "step-5-preview" ||
		lower === "step-5-preview-free" ||
		lower === "stepfun"
	) {
		return "step-5-preview-free";
	}
	if (lower === "exo" || lower === "exo-free") {
		return "exo-free";
	}
	if (lower === "pickle" || lower === "big-pickle") {
		return "big-pickle";
	}
	if (
		lower === "bunny" ||
		lower === "space-bunny" ||
		lower === "space-bunny-free" ||
		lower === "space-bunny-alpha"
	) {
		return "space-bunny-free";
	}
	if (
		lower === "mimo" ||
		lower === "mimo-v2.5" ||
		lower === "mimo-v2.5-free" ||
		lower === "flash" ||
		lower === "mimo-flash" ||
		lower === "mimo-v2.6" ||
		lower === "mimo-v2.6-flash-free"
	) {
		return "mimo-v2.6-flash-free";
	}
	if (
		lower === "ultra" ||
		lower === "nemotron-ultra" ||
		lower === "550b" ||
		lower === "nemotron-3-ultra" ||
		lower === "nemotron-3-ultra-free" ||
		lower === "ultra-free"
	) {
		return "nemotron-3-ultra-free";
	}
	if (
		lower === "lightning" ||
		lower === "nemotron-lightning" ||
		lower === "nemotron-3.5-lightning" ||
		lower === "nemotron-3.5-lightning-free"
	) {
		return "nemotron-3.5-lightning-free";
	}
	if (
		lower === "ling-3.0" ||
		lower === "flash-fin" ||
		lower === "ling-3.0-flash-fin" ||
		lower === "ling-3.0-flash-fin-free"
	) {
		return "ling-3.0-flash-fin-free";
	}
	if (
		lower === "ling" ||
		lower === "ling-3.1" ||
		lower === "ling-3.1-flash" ||
		lower === "ling-3.1-flash-free"
	) {
		return "ling-3.1-flash-free";
	}
	if (lower === "jev" || lower === "jev-1.13" || lower === "jev-1.13-free") {
		return "jev-1.13-free";
	}
	if (
		lower === "spark" ||
		lower === "muse" ||
		lower === "muse-spark" ||
		lower === "muse-spark-1.3-contributor-free"
	) {
		return "muse-spark-1.3-contributor-free";
	}
	if (
		lower === "spark12" ||
		lower === "muse-1.2" ||
		lower === "muse-spark-1.2-contributor-free"
	) {
		return "muse-spark-1.2-contributor-free";
	}
	if (
		lower === "longcat" ||
		lower === "longcat-free" ||
		lower === "longcat-2.5-preview-free"
	) {
		return "longcat-2.5-preview-free";
	}
	if (
		lower === "glm" ||
		lower === "glm-5.3" ||
		lower === "glm-5.3-flash" ||
		lower === "glm-5.3-flash-free"
	) {
		return "glm-5.3-flash-free";
	}
	if (
		lower === "super-vl" ||
		lower === "supervl" ||
		lower === "nemotron-vl" ||
		lower === "nemotron-3.5-super-vl" ||
		lower === "nemotron-3.5-super-vl-free"
	) {
		return "nemotron-3.5-super-vl-free";
	}
	if (
		lower === "cat-jam" ||
		lower === "catjam" ||
		lower === "cat-jam-free" ||
		lower === "catjam-free" ||
		lower === "jam"
	) {
		return "cat-jam-free";
	}
	if (
		lower === "deepseek" ||
		lower === "deepseek-free" ||
		lower === "deepseek-v4.1" ||
		lower === "deepseek-v4.1-free" ||
		lower === "deepseek-v4.1-flash" ||
		lower === "deepseek-v4.1-flash-free" ||
		lower === "deepseekv4.1" ||
		lower === "deepseekv4" ||
		lower === "deepseek-v4"
	) {
		return "deepseek-v4.1-flash-free";
	}

	// 3. 若直接匹配已知免费模型
	if (KNOWN_ZEN_FREE_MODELS[id]) {
		return id;
	}

	// 4. 自动追加 -free 保护
	const withFree = `${id}-free`;
	if (KNOWN_ZEN_FREE_MODELS[withFree]) {
		return withFree;
	}

	return id;
}

export interface PiModelEntry {
	id: string;
	name: string;
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	input: ("text" | "image")[];
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	thinkingLevelMap?: Record<string, string | null>;
}

/**
 * 校验并规范化 Pi 运行态与 models.json 模型定义
 * 杜绝任何 undefined、NaN、空 ID 或格式畸变，确保写入完全合规的严格 JSON
 */
export function sanitizePiModelDefinition(raw: any): PiModelEntry | null {
	if (!raw || typeof raw !== "object") return null;
	const id = typeof raw.id === "string" ? raw.id.trim() : "";
	if (!id) return null;

	const name =
		typeof raw.name === "string" && raw.name.trim()
			? raw.name.trim()
			: id;

	const contextWindow =
		typeof raw.contextWindow === "number" && Number.isFinite(raw.contextWindow) && raw.contextWindow > 0
			? Math.floor(raw.contextWindow)
			: 131072;

	const maxTokens =
		typeof raw.maxTokens === "number" && Number.isFinite(raw.maxTokens) && raw.maxTokens > 0
			? Math.floor(raw.maxTokens)
			: 32768;

	const capped = applyZenServerLimits({ id, contextWindow, maxTokens });

	const reasoning = Boolean(raw.reasoning);

	const rawInput = Array.isArray(raw.input) ? raw.input : [];
	const input: ("text" | "image")[] = [];
	for (const item of rawInput) {
		if (item === "text" || item === "image") {
			if (!input.includes(item)) input.push(item);
		}
	}
	if (input.length === 0) {
		input.push("text");
	}

	const cost = {
		input: typeof raw.cost?.input === "number" && Number.isFinite(raw.cost.input) ? raw.cost.input : 0,
		output: typeof raw.cost?.output === "number" && Number.isFinite(raw.cost.output) ? raw.cost.output : 0,
		cacheRead: typeof raw.cost?.cacheRead === "number" && Number.isFinite(raw.cost.cacheRead) ? raw.cost.cacheRead : 0,
		cacheWrite: typeof raw.cost?.cacheWrite === "number" && Number.isFinite(raw.cost.cacheWrite) ? raw.cost.cacheWrite : 0,
	};

	const result: PiModelEntry = {
		id,
		name,
		contextWindow: capped.contextWindow,
		maxTokens: capped.maxTokens,
		reasoning,
		input,
		cost,
	};

	if (raw.thinkingLevelMap && typeof raw.thinkingLevelMap === "object" && !Array.isArray(raw.thinkingLevelMap)) {
		const cleanMap: Record<string, string | null> = {};
		for (const [k, v] of Object.entries(raw.thinkingLevelMap)) {
			if (typeof v === "string" || v === null) {
				cleanMap[k] = v;
			}
		}
		if (Object.keys(cleanMap).length > 0) {
			result.thinkingLevelMap = cleanMap;
		}
	}

	return result;
}
