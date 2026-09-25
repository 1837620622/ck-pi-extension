/**
 * OpenCode Zen 免费模型参数与配置注册表
 *
 * 严格基于 OpenCode 官方客户端内置参数与在线端点响应对齐：
 * 包含精确上下文上限（Context Window）、最大输出（Max Tokens）、推理思考等级映射（thinkingLevelMap）与输入模态。
 */

import type { ZenModelDefinition } from "./types.js";

export const ZEN_PROVIDER_ID = "opencode-zen-free";
export const ZEN_BASE_URL = "https://opencode.ai/zen/v1";
export const ZEN_USER_AGENT = "opencode/1.18.32 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14";

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
	"mimo-v2.5-free": {
		id: "mimo-v2.5-free",
		name: "Xiaomi Mimo v2.5 Free (OpenCode Zen)",
		contextWindow: 200000,
		maxTokens: 32000,
		reasoning: true,
		input: ["text", "image"],
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
		maxTokens: 262144,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"nemotron-3-ultra-free": {
		id: "nemotron-3-ultra-free",
		name: "Nemotron 3 Ultra Free (OpenCode Zen)",
		contextWindow: 1000000,
		maxTokens: 128000,
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
	"muse-spark-1.3-contributor-free": {
		id: "muse-spark-1.3-contributor-free",
		name: "Meta Muse Spark 1.3 Free (OpenCode Zen)",
		contextWindow: 1048576,
		maxTokens: 131072,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: MUSE_SPARK_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"muse-spark-1.2-contributor-free": {
		id: "muse-spark-1.2-contributor-free",
		name: "Meta Muse Spark 1.2 Free (OpenCode Zen)",
		contextWindow: 1048576,
		maxTokens: 131072,
		reasoning: true,
		input: ["text", "image"],
		thinkingLevelMap: MUSE_SPARK_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	"jev-1.13-free": {
		id: "jev-1.13-free",
		name: "TypeSafe Jev 1.13 System-1 Free (OpenCode Zen)",
		contextWindow: 128000,
		maxTokens: 16384,
		reasoning: false,
		input: ["text"],
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
};

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
		lower.includes("jev")
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
 * OpenCode 官方 6 大核心内置工具规范与 Schema 定义
 * 严格对齐 OpenCode 客户端源码（按字母顺序排序：bash, edit, glob, grep, read, write）
 */
export const OPENCODE_OFFICIAL_TOOLS = [
	{
		type: "function",
		function: {
			name: "bash",
			description: "Execute bash commands in the workspace environment",
			parameters: {
				type: "object",
				properties: {
					command: { type: "string", description: "Shell command string to execute" },
					workdir: {
						type: "string",
						description:
							"Working directory. Defaults to the active Location; relative paths resolve within it.",
					},
				},
				required: ["command"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "edit",
			description: "Edit a file by replacing text",
			parameters: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description:
							"File path to edit. Relative paths resolve within the active Location.",
					},
					oldString: { type: "string", description: "The string in the file to be replaced" },
					newString: { type: "string", description: "The string to replace oldString with" },
					replaceAll: {
						type: "boolean",
						description: "Replace all occurrences of oldString (default false)",
					},
				},
				required: ["path", "oldString", "newString"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "glob",
			description: "Find files matching a glob pattern",
			parameters: {
				type: "object",
				properties: {
					pattern: {
						type: "string",
						description: 'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
					},
					path: {
						type: "string",
						description: "Relative directory to search in. Defaults to the active Location.",
					},
				},
				required: ["pattern"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "grep",
			description: "Search file contents using regular expressions",
			parameters: {
				type: "object",
				properties: {
					pattern: {
						type: "string",
						description: "Regex pattern to search for in file contents",
					},
					path: {
						type: "string",
						description: "Relative directory to search in. Defaults to the active Location.",
					},
				},
				required: ["pattern"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "read",
			description: "Read file contents",
			parameters: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description:
							"File path to read. Relative paths resolve within the active Location.",
					},
					offset: {
						type: "number",
						description: "The 1-based directory entry or text line offset",
					},
					limit: {
						type: "number",
						description: "The maximum number of lines to read (defaults to 2000)",
					},
				},
				required: ["path"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "write",
			description: "Write or overwrite file contents",
			parameters: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description:
							"File path to write. Relative paths resolve within the active Location.",
					},
					content: {
						type: "string",
						description: "Content to write to the file",
					},
				},
				required: ["path", "content"],
			},
		},
	},
];
