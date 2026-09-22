/**
 * OpenCode Zen 类型定义
 */

export interface ZenModelDefinition {
	id: string;
	name: string;
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	input: ("text" | "image")[];
	thinkingLevelMap?: Partial<Record<"off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max", string | null>>;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
}

export interface ZenProviderConfig {
	baseUrl: string;
	api: string;
	apiKey: string;
	headers: {
		"User-Agent": string;
		"x-opencode-session": string;
		[key: string]: string;
	};
	compat: {
		maxTokensField: string;
		requiresReasoningContentOnAssistantMessages: boolean;
		supportsDeveloperRole: boolean;
		supportsStore: boolean;
		[key: string]: unknown;
	};
	models: ZenModelDefinition[];
}

export interface ZenSyncOptions {
	apiKey?: string;
	forceSession?: boolean;
	modelsPath?: string;
	authPath?: string;
	dbPath?: string;
	fetchModels?: (apiKey: string) => Promise<string[]>;
}

export interface ZenSyncResult {
	apiKey: string;
	sessionId: string;
	isNewSession: boolean;
	modelsCount: number;
	models: string[];
	modelsPath: string;
	ccSwitchUpdated: boolean;
}

export interface ZenStatusInfo {
	hasKey: boolean;
	maskedKey: string;
	sessionId: string;
	sessionAgeMinutes: number;
	sessionExpired: boolean;
	modelsCount: number;
	modelIds: string[];
}
