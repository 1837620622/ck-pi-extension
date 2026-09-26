/**
 * Cline 模型参数注册表与多模态能力推断引擎
 *
 * 对齐 Cline 官方 API 规约与官方客户端标头，深度识别：
 * 1. 100% 零额度隐身与免费模型 (Stealth & Free Models, cost === $0.00)
 * 2. 上下文窗口限制 (Context Window: 32K ~ 1000K / 2000K)
 * 3. 最大输出 Token 上限 (Max Tokens: <= 32768)
 * 4. 深度推理思考模型与等级映射
 * 5. 官方 8 大指纹标头伪装
 */

import type { ClineModelDefinition } from "./types.js";

export const CLINE_PROVIDER_ID = "cline";
export const CLINE_BASE_URL = "https://api.cline.bot/api/v1";
export const CLINE_DEFAULT_KEY = "";

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
 * 实测确认 100% 零额度消耗 (Cost: $0.000000) 的 Cline 免费与隐身模型注册表
 */
export const KNOWN_CLINE_FREE_MODELS: Record<string, ClineModelDefinition> = {
	// ==================== 1. 隐身与智能路由零消耗模型 (Stealth & Smart Routers) ====================
	"stealth/space-bunny-alpha": {
		id: "stealth/space-bunny-alpha",
		name: "Stealth Space Bunny Alpha (1M Stealth Free)",
		contextWindow: 1000000,
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
		contextWindow: 1000000,
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
		contextWindow: 2000000,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
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

	// ==================== 2. 百万级超长上下文免费模型 (1M+ Giant Context) ====================
	"nvidia/nemotron-3-ultra-550b-a55b:free": {
		id: "nvidia/nemotron-3-ultra-550b-a55b:free",
		name: "NVIDIA Nemotron 3 Ultra 550B (1M Free)",
		contextWindow: 1000000,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
	},
	"nvidia/nemotron-3.5-lightning:free": {
		id: "nvidia/nemotron-3.5-lightning:free",
		name: "NVIDIA Nemotron 3.5 Lightning (1M Free)",
		contextWindow: 1000000,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
	},
	"thinkingmachines/inkling:free": {
		id: "thinkingmachines/inkling:free",
		name: "Thinking Machines Inkling (1M Free)",
		contextWindow: 1048576,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
	},
	"thinkingmachines/inkling-small:free": {
		id: "thinkingmachines/inkling-small:free",
		name: "Thinking Machines Inkling Small (1M Free)",
		contextWindow: 1048576,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
	},

	// ==================== 3. 主力代码与推理思考免费模型 (Core Coding & Reasoning) ====================
	"inclusionai/ling-3.0-flash-fin:free": {
		id: "inclusionai/ling-3.0-flash-fin:free",
		name: "InclusionAI Ling 3.0 Flash Fin (262k Free)",
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
		name: "InclusionAI Ling 3.0 Flash Sante (262k Free)",
		contextWindow: 262144,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
	},
	"qwen/qwen3.8-27b:free": {
		id: "qwen/qwen3.8-27b:free",
		name: "Qwen 3.8 27B (262k Free)",
		contextWindow: 262144,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
	},
	"nvidia/nemotron-3-super-120b-a12b:free": {
		id: "nvidia/nemotron-3-super-120b-a12b:free",
		name: "NVIDIA Nemotron 3 Super 120B (262k Free)",
		contextWindow: 262144,
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
	"poolside/laguna-xs-2.1:free": {
		id: "poolside/laguna-xs-2.1:free",
		name: "Poolside Laguna XS 2.1 (Free)",
		contextWindow: 131072,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
	},

	// ==================== 4. 轻量极速与专用工具模型 (Lightweight & Tools) ====================
	"google/gemma-4-26b-a4b-it:free": {
		id: "google/gemma-4-26b-a4b-it:free",
		name: "Google Gemma 4 26B A4B IT (Free)",
		contextWindow: 262144,
		maxTokens: 32768,
		reasoning: true,
		input: ["text"],
		thinkingLevelMap: STANDARD_THINKING_LEVELS,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		isFree: true,
	},
	"google/gemma-4-31b-it:free": {
		id: "google/gemma-4-31b-it:free",
		name: "Google Gemma 4 31B IT (Free)",
		contextWindow: 262144,
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
};

/**
 * 免费模型路由映射与别名解析算法 (Model Alias & Free Protection Router)
 *
 * 1. 自动剔除 cline/、cline-free/ 等前缀；
 * 2. 映射常用短别名 (bunny/stealth -> stealth/space-bunny-alpha, free -> openrouter/free, fusion -> openrouter/fusion 等)；
 * 3. 隐身模型自动识别并直接保留原名 (无须 :free)；
 * 4. 若调用者输入了未带 :free 的模型名 (如 inclusionai/ling-3.0-flash-fin)，自动匹配到免费版 (:free) 以防误扣费。
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
	if (lower === "bunny" || lower === "stealth" || lower === "space-bunny") {
		return "stealth/space-bunny-alpha";
	}
	if (lower === "ling" || lower === "flash" || lower === "flash-fin") {
		return "inclusionai/ling-3.0-flash-fin:free";
	}
	if (lower === "sante" || lower === "flash-sante") {
		return "inclusionai/ling-3.0-flash-sante:free";
	}
	if (lower === "qwen" || lower === "qwen-free") {
		return "qwen/qwen3.8-27b:free";
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
	if (lower === "laguna") {
		return "poolside/laguna-s-2.1:free";
	}
	if (lower === "north") {
		return "cohere/north-mini-code:free";
	}
	if (lower === "gemma" || lower === "gemma-free") {
		return "google/gemma-4-26b-a4b-it:free";
	}
	if (lower === "inkling") {
		return "thinkingmachines/inkling:free";
	}
	if (lower === "note") {
		return "dots-studio/dots-3-note-preview:free";
	}
	if (lower === "lfm") {
		return "liquid/lfm-2.5-2.6b:free";
	}

	// 3. 若直接匹配已知免费或隐身模型
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
 * 校验模型是否属于已确认的零额度模型（含隐身模型与 :free 模型）
 */
export function isClineFreeModel(rawId: string): boolean {
	const resolved = resolveFreeModelId(rawId);
	if (KNOWN_CLINE_FREE_MODELS[resolved]?.isFree) return true;
	const lower = resolved.toLowerCase();
	return (
		lower.endsWith(":free") ||
		lower === "stealth/space-bunny-alpha" ||
		lower === "openrouter/free" ||
		lower === "openrouter/fusion" ||
		lower === "openrouter/pareto-code"
	);
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
		lower === "stealth/space-bunny-alpha" ||
		lower === "openrouter/free" ||
		lower === "openrouter/fusion" ||
		lower === "openrouter/pareto-code";

	// 1. 上下文窗口识别
	let contextWindow = 131072;
	if (typeof raw?.context_length === "number" && raw.context_length > 0) {
		contextWindow = raw.context_length;
	} else if (typeof raw?.context_window === "number" && raw.context_window > 0) {
		contextWindow = raw.context_window;
	} else if (
		lower.includes("2m") ||
		lower.includes("pareto-code")
	) {
		contextWindow = 2000000;
	} else if (
		lower.includes("1m") ||
		lower.includes("ultra") ||
		lower.includes("550b") ||
		lower.includes("bunny") ||
		lower.includes("fusion") ||
		lower.includes("inkling")
	) {
		contextWindow = 1000000;
	} else if (
		lower.includes("256k") ||
		lower.includes("nemotron-3.5") ||
		lower.includes("ling") ||
		lower.includes("qwen") ||
		lower.includes("gemma") ||
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
		lower.includes("note") ||
		lower.includes("pareto") ||
		lower.includes("bunny");

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

/**
 * 格式化模型思考等级与推理能力描述
 */
export function formatThinkingSummary(model: ClineModelDefinition): string {
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
 * 格式化模型卡片（专业无 Emoji 终端风格单行）
 */
export function formatClineModelCard(model: ClineModelDefinition): string {
	const freeTag = model.isFree ? "\x1b[32m[FREE]\x1b[0m" : "\x1b[33m[PAID]\x1b[0m";
	const reasonTag = model.reasoning ? "\x1b[35m[THINK]\x1b[0m" : "\x1b[90m[FAST]\x1b[0m";
	const imageTag = model.input.includes("image") ? "\x1b[34m[VISION]\x1b[0m" : "\x1b[90m[TEXT]\x1b[0m";
	const ctxStr = formatTokens(model.contextWindow);
	const outStr = formatTokens(model.maxTokens);

	return `  • \x1b[36m${model.id.padEnd(50)}\x1b[0m ${freeTag} ${reasonTag} ${imageTag} \x1b[90m(ctx: ${ctxStr}, out: ${outStr})\x1b[0m`;
}

/**
 * 格式化模型详细规格卡片 (与 Zen 插件对齐的双行树形结构)
 */
export function formatClineModelDetailCard(model: ClineModelDefinition, index?: number): string {
	const prefix = typeof index === "number" ? `${index}. ` : "• ";
	const ctxTokens = model.contextWindow;
	const outTokens = model.maxTokens;
	const ctxStr = `${formatTokens(ctxTokens)} (${ctxTokens.toLocaleString("en-US")} tokens)`;
	const outStr = `${formatTokens(outTokens)} (${outTokens.toLocaleString("en-US")} tokens)`;
	const thinkStr = formatThinkingSummary(model);
	const inputStr = model.input.includes("image") ? "文本 + 视觉 (多模态)" : "纯文本";
	const freeTag = model.isFree ? "0免费 (实测 0 Credit 消耗)" : "付费";

	return [
		`${prefix}${model.name} (${model.id})`,
		`   └─ 上下文: ${ctxStr} | 最大输出: ${outStr} | 思考等级: ${thinkStr} | 模态: ${inputStr} | 额度: ${freeTag}`,
	].join("\n");
}

/**
 * 格式化精美模型列表（分类结构化呈现）
 */
export function formatClineModelsTable(models: ClineModelDefinition[]): string {
	const freeModels = models.filter((m) => m.isFree);
	const stealthModels = freeModels.filter((m) => !m.id.includes(":free"));
	const officialFree = freeModels.filter((m) => m.id.includes(":free"));

	const lines: string[] = [];
	lines.push(`\x1b[1m=== Cline 零额度模型注册表 (${freeModels.length} 款实测 0 Credit 消耗) ===\x1b[0m`);
	lines.push(`\x1b[90m─────────────────────────────────────────────────────────────────────────────\x1b[0m`);

	if (stealthModels.length > 0) {
		lines.push(`\x1b[1m\x1b[33m[隐身与智能路由零消耗模型] (无需 :free 标识，实测 credit 消耗恒为 $0):\x1b[0m`);
		for (const m of stealthModels) {
			lines.push(formatClineModelCard(m));
		}
		lines.push("");
	}

	lines.push(`\x1b[1m\x1b[32m[官方标准免费模型] (带 :free 防护，实测 credit 消耗恒为 $0):\x1b[0m`);
	for (const m of officialFree) {
		lines.push(formatClineModelCard(m));
	}

	return lines.join("\n");
}

