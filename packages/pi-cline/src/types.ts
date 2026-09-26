/**
 * Cline 扩展类型规约
 */

export interface ClineModelDefinition {
	id: string;
	name: string;
	contextWindow: number;
	maxTokens: number;
	reasoning: boolean;
	input: ("text" | "image")[];
	thinkingLevelMap?: Record<string, string | null>;
	cost: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
	};
	isFree?: boolean;
}

export interface ClineSyncOptions {
	apiKey?: string;
	modelsPath?: string;
	authPath?: string;
	ccSwitchDbPath?: string;
	silent?: boolean;
	useLocalProxy?: boolean;
	proxyPort?: number;
}

export interface ClineSyncResult {
	success: boolean;
	provider: string;
	apiKey: string;
	modelCount: number;
	freeModelCount: number;
	models: ClineModelDefinition[];
	updatedModelsJson: boolean;
	updatedAuthJson: boolean;
	updatedCcSwitchDb: boolean;
	error?: string;
}

export interface ClineProxyServerOptions {
	port?: number;
	host?: string;
	apiKey?: string;
}

export interface ClineProxyStatus {
	running: boolean;
	port?: number;
	host?: string;
	url?: string;
	requestCount: number;
	errorCount: number;
	startedAt?: number;
}

export interface ClineStatusInfo {
	apiKeyMasked: string;
	provider: string;
	baseUrl: string;
	activeModel?: string;
	totalModels: number;
	freeModelsCount: number;
	proxy: ClineProxyStatus;
}
