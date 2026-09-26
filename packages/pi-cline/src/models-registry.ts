/**
 * Cline 模型参数注册表与多模态能力推断引擎
 *
 * 对齐 Cline 官方 API 规约与官方客户端标头，深度识别：
 * 1. 100% 零额度免费模型 (:free)
 * 2. 上下文窗口限制 (Context Window: 32K ~ 1000K)
 * 3. 最大输出 Token 上限 (Max Tokens: <= 32768)
 * 4. 深度推理思考模型与等级映射
 * 5. 官方 8 大指纹标头伪装
 */

import type { ClineModelDefinition } from "./types.js";

export const CLINE_PROVIDER_ID = "cline";
export const CLINE_BASE_URL = "https://api.cline.bot/api/v1";
export const CLINE_DEFAULT_KEY = "sk_0ea2446a7ca63262db183e2e3816f503cdd65fb0f695b5629b2b85126f5625dd";

/**
 * Cline 官方 VSCode 扩展完整客户端伪装标头
 */
export const CLINE_CLIENT_HEADERS: Record<string, string> = {
	"User-Agent": "Cline/4.1.16",
	"x-client-version": "4.1.16",
	"x-core-version": "4.1.16",
	"x-platform-version": "1.106.0",
	"x-client-type": "cline-vscode",
	"http-referer": "https://cline.bot",
	"x-platform": "vscode",
	"x-title": "Cline",
};

export const STANDARD_THINKING_LEVELS: Record<string, string | null> = {
	minimal: "low",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "high",
	max: "high",
	off: null,
};

/**
 * 已实测确认可用的 Cline 免费模型精选字典
 */
export const KNOWN_CLINE_FREE_MODELS: Record<string, ClineModelDefinition> = {
	"inclusionai/ling-3.0-flash-fin:free": {
		id: "inclusionai/ling-3.0-flash-fin:free",
		name: "InclusionAI Ling 3.0 Flash Fin (Free)",
		contextWindow: 262144,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
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
		isFree: true,
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
		isFree: true,
	},
	"nvidia/nemotron-3-ultra-550b-a55b:free": {
		id: "nvidia/nemotron-3-ultra-550b-a55b:free",
		name: "NVIDIA Nemotron 3 Ultra 550B (Free)",
		contextWindow: 1000000,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
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
		isFree: true,
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
		isFree: true,
	},
	"nvidia/nemotron-3.5-content-safety:free": {
		id: "nvidia/nemotron-3.5-content-safety:free",
		name: "NVIDIA Nemotron 3.5 Content Safety (Free)",
		contextWindow: 131072,
		maxTokens: 16384,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
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
		isFree: true,
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
		isFree: true,
	},
	"liquid/lfm-2.5-2.6b:free": {
		id: "liquid/lfm-2.5-2.6b:free",
		name: "Liquid LFM 2.5 2.6B (Free)",
		contextWindow: 32768,
		maxTokens: 8192,
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
	},
	"openrouter/free": {
		id: "openrouter/free",
		name: "OpenRouter Auto Free Router",
		contextWindow: 200000,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
	},
	"typesafe/jev-router": {
		id: "typesafe/jev-router",
		name: "TypeSafe JEV Router (GPT-6 Luna Free)",
		contextWindow: 128000,
		maxTokens: 16384,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
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
		isFree: true,
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
		isFree: true,
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
		isFree: true,
	},
	"openai/gpt-4o-mini": {
		id: "openai/gpt-4o-mini",
		name: "OpenAI GPT-4o Mini (Cline)",
		contextWindow: 128000,
		maxTokens: 16384,
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 0.15, output: 0.6, cacheRead: 0.075, cacheWrite: 0.15 },
		isFree: false,
	},
};

/**
 * 免费模型路由映射与别名解析算法 (Model Alias & Free Protection Router)
 *
 * 1. 自动剔除 cline/、cline-free/ 等前缀；
 * 2. 映射常用短别名 (free -> openrouter/free, fusion -> openrouter/fusion, code -> openrouter/pareto-code 等)；
 * 3. 若调用者输入了未带 :free 的模型名 (如 inclusionai/ling-3.0-flash-fin)，自动匹配到免费版 (:free) 以防误扣费。
 */
export function resolveFreeModelId(rawId?: string): string {
	if (!rawId || typeof rawId !== "string" || !rawId.trim()) {
		return "openrouter/free";
	}

	let id = rawId.trim();

	// 1. 剔除客户端或供应商前缀
	id = id.replace(/^(cline|cline-free|cline-bot)\//i, "");

	// 2. 快捷别名转换
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

	// 3. 若直接匹配已知免费模型
	if (KNOWN_CLINE_FREE_MODELS[id]) {
		return id;
	}

	// 4. 自动追加 :free 保护（若同名免费版存在，如用户只写了 inclusionai/ling-3.0-flash-fin）
	const withFree = `${id}:free`;
	if (KNOWN_CLINE_FREE_MODELS[withFree]) {
		return withFree;
	}

	return id;
}

/**
 * 智能模型参数与能力自动推断
 */
export function inferClineModelCapabilities(
	modelId: string,
	raw?: Record<string, unknown>,
): ClineModelDefinition {
	if (KNOWN_CLINE_FREE_MODELS[modelId]) {
		const base: ClineModelDefinition = { ...KNOWN_CLINE_FREE_MODELS[modelId] };
		if (typeof raw?.context_length === "number" && raw.context_length > 0) {
			base.contextWindow = raw.context_length;
		} else if (typeof raw?.context_window === "number" && raw.context_window > 0) {
			base.contextWindow = raw.context_window;
		}
		return base;
	}

	const lower = modelId.toLowerCase();
	const isFree =
		lower.includes("free") ||
		lower.endsWith(":free") ||
		lower.includes("openrouter/free") ||
		lower.includes("openrouter/fusion") ||
		lower.includes("openrouter/pareto-code") ||
		lower.includes("typesafe/jev-router");

	// 1. 上下文窗口识别
	let contextWindow = 131072;
	if (typeof raw?.context_length === "number" && raw.context_length > 0) {
		contextWindow = raw.context_length;
	} else if (typeof raw?.context_window === "number" && raw.context_window > 0) {
		contextWindow = raw.context_window;
	} else if (
		lower.includes("1m") ||
		lower.includes("ultra") ||
		lower.includes("550b") ||
		lower.includes("gemini")
	) {
		contextWindow = 1000000;
	} else if (
		lower.includes("256k") ||
		lower.includes("nemotron-3.5") ||
		lower.includes("ling") ||
		lower.includes("super-120b")
	) {
		contextWindow = 262144;
	} else if (lower.includes("32k") || lower.includes("lfm")) {
		contextWindow = 32768;
	}

	// 2. 最大输出 Token
	let maxTokens = 32768;
	if (typeof raw?.max_tokens === "number" && raw.max_tokens > 0) {
		maxTokens = Math.min(raw.max_tokens, 32768);
	} else if (typeof raw?.max_output_tokens === "number" && raw.max_output_tokens > 0) {
		maxTokens = Math.min(raw.max_output_tokens, 32768);
	} else if (lower.includes("lfm") || lower.includes("nano")) {
		maxTokens = 8192;
	}

	// 3. 推理思考能力识别
	const reasoning =
		lower.includes("reasoning") ||
		lower.includes("thinking") ||
		lower.includes("r1") ||
		lower.includes("o1") ||
		lower.includes("o3") ||
		lower.includes("nemotron") ||
		lower.includes("ling") ||
		lower.includes("north") ||
		lower.includes("note");

	// 4. 多模态识别
	const input: ("text" | "image")[] =
		lower.includes("omni") ||
		lower.includes("vision") ||
		lower.includes("vl") ||
		lower.includes("4o") ||
		lower.includes("image")
			? ["text", "image"]
			: ["text"];

	return {
		id: modelId,
		name: `${modelId} (Cline${isFree ? " Free" : ""})`,
		contextWindow,
		maxTokens,
		reasoning,
		input,
		thinkingLevelMap: reasoning ? STANDARD_THINKING_LEVELS : undefined,
		cost: isFree
			? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
			: { input: 1.0, output: 3.0, cacheRead: 0.5, cacheWrite: 1.0 },
		isFree,
	};
}

export function formatTokens(tokens: number): string {
	if (tokens >= 1_000_000) {
		return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
	}
	if (tokens >= 1_000) {
		return `${Math.round(tokens / 1_000)}k`;
	}
	return String(tokens);
}

export function formatClineModelCard(model: ClineModelDefinition): string {
	const freeTag = model.isFree ? "🎁 免费" : "💳 付费";
	const reasonTag = model.reasoning ? "🧠 深度思考" : "⚡ 快速";
	const imageTag = model.input.includes("image") ? "👁️ 视觉多模态" : "📝 文本";
	const ctxStr = formatTokens(model.contextWindow);
	const outStr = formatTokens(model.maxTokens);

	return `• \x1b[36m${model.id}\x1b[0m [${freeTag}] [${reasonTag}] [${imageTag}] (上下文: ${ctxStr}, 最大输出: ${outStr})`;
}

export function formatClineModelsTable(models: ClineModelDefinition[]): string {
	const freeModels = models.filter((m) => m.isFree);
	const paidModels = models.filter((m) => !m.isFree);

	const lines: string[] = [];
	lines.push(`\x1b[1m=== Cline 可用免费模型 (${freeModels.length} 款) ===\x1b[0m`);
	for (const m of freeModels) {
		lines.push(formatClineModelCard(m));
	}

	if (paidModels.length > 0) {
		lines.push("");
		lines.push(`\x1b[1m=== Cline 常用高级模型 (${paidModels.length} 款) ===\x1b[0m`);
		for (const m of paidModels.slice(0, 10)) {
			lines.push(formatClineModelCard(m));
		}
		if (paidModels.length > 10) {
			lines.push(`  ... 另有 ${paidModels.length - 10} 款高级模型已收录`);
		}
	}

	return lines.join("\n");
}
