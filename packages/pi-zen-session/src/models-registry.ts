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

const STANDARD_THINKING_LEVELS: Record<string, string | null> = {
	low: "low",
	high: "high",
	max: "max",
	medium: null,
	minimal: null,
	off: null,
	xhigh: null,
};

const MUSE_SPARK_THINKING_LEVELS: Record<string, string | null> = {
	minimal: "minimal",
	low: "low",
	medium: "medium",
	high: "high",
	xhigh: "xhigh",
	max: "xhigh",
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
};

/**
 * 为未来可能新增的免费模型生成自适应默认配置
 */
export function buildFallbackModelDefinition(modelId: string): ZenModelDefinition {
	const isReasoning = !modelId.includes("chat") && !modelId.includes("turbo");
	const friendlyName = modelId
		.split(/[-_]/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");

	return {
		id: modelId,
		name: `${friendlyName} (OpenCode Zen)`,
		contextWindow: 200000,
		maxTokens: 32000,
		reasoning: isReasoning,
		input: ["text", "image"],
		thinkingLevelMap: isReasoning ? STANDARD_THINKING_LEVELS : undefined,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	};
}

/**
 * 解析并生成完整的模型列表
 */
export function resolveModelDefinitions(discoveredIds: string[]): ZenModelDefinition[] {
	const list: ZenModelDefinition[] = [];
	const seen = new Set<string>();

	for (const id of discoveredIds) {
		if (seen.has(id)) continue;
		seen.add(id);

		if (KNOWN_ZEN_FREE_MODELS[id]) {
			list.push(KNOWN_ZEN_FREE_MODELS[id]);
		} else {
			list.push(buildFallbackModelDefinition(id));
		}
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
