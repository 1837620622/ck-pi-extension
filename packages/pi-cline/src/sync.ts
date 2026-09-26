/**
 * Cline 模型同步与本地落盘引擎
 *
 * 负责：
 * 1. 验证 Cline API Key 并在线获取最新可用免费模型清单；
 * 2. 深度推断各模型上下文窗口、最大输出与深度思考参数；
 * 3. 自动注入官方 8 大客户端伪装标头；
 * 4. 同步更新 ~/.pi/agent/models.json 与 ~/.pi/agent/auth.json；
 * 5. 同步更新 CC-Switch 本地 SQLite 数据库。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
	CLINE_BASE_URL,
	CLINE_CLIENT_HEADERS,
	CLINE_DEFAULT_KEY,
	CLINE_PROVIDER_ID,
	inferClineModelCapabilities,
	KNOWN_CLINE_FREE_MODELS,
} from "./models-registry.js";
import type { ClineModelDefinition, ClineSyncOptions, ClineSyncResult } from "./types.js";

export function defaultModelsPath(): string {
	if (process.env.TEST_PI_MODELS_PATH) return process.env.TEST_PI_MODELS_PATH;
	return join(homedir(), ".pi", "agent", "models.json");
}

export function defaultAuthPath(): string {
	if (process.env.TEST_PI_AUTH_PATH) return process.env.TEST_PI_AUTH_PATH;
	return join(homedir(), ".pi", "agent", "auth.json");
}

export function defaultCcSwitchDbPath(): string {
	if (process.env.TEST_CC_SWITCH_DB_PATH) return process.env.TEST_CC_SWITCH_DB_PATH;
	return join(homedir(), ".cc-switch", "cc-switch.db");
}

let syncMutexPromise = Promise.resolve();

/**
 * 获取当前存储或环境变量中的 Cline API Key
 */
export function getStoredClineApiKey(
	authPath = defaultAuthPath(),
	modelsPath = defaultModelsPath(),
): string {
	if (process.env.CLINE_API_KEY && process.env.CLINE_API_KEY.trim()) {
		return process.env.CLINE_API_KEY.trim();
	}

	try {
		if (existsSync(authPath)) {
			const auth = JSON.parse(readFileSync(authPath, "utf-8"));
			if (typeof auth?.cline?.key === "string" && auth.cline.key.trim()) {
				return auth.cline.key.trim();
			}
			if (typeof auth?.["cline-free"]?.key === "string" && auth["cline-free"].key.trim()) {
				return auth["cline-free"].key.trim();
			}
		}
	} catch {
		// 忽略读取错误
	}

	try {
		if (existsSync(modelsPath)) {
			const models = JSON.parse(readFileSync(modelsPath, "utf-8"));
			const prov = models?.providers?.cline || models?.cline;
			if (typeof prov?.apiKey === "string" && prov.apiKey.trim()) {
				return prov.apiKey.trim();
			}
		}
	} catch {
		// 忽略读取错误
	}

	return CLINE_DEFAULT_KEY;
}

/**
 * 校验 API Key 并拉取 Cline 在线模型目录
 */
export async function fetchClineModelCatalog(apiKey: string): Promise<ClineModelDefinition[]> {
	try {
		const res = await fetch(`${CLINE_BASE_URL}/models`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey.trim()}`,
				...CLINE_CLIENT_HEADERS,
			},
		});

		if (res.ok) {
			const data = (await res.json()) as { data?: Array<{ id: string; [key: string]: unknown }> };
			if (data && Array.isArray(data.data) && data.data.length > 0) {
				const modelsMap = new Map<string, ClineModelDefinition>();

				// 1. 先载入已知精选免费模型保底
				for (const [id, m] of Object.entries(KNOWN_CLINE_FREE_MODELS)) {
					modelsMap.set(id, m);
				}

				// 2. 将远端返回的免费模型与常用模型推断并合入
				for (const raw of data.data) {
					const id = String(raw.id || "");
					if (!id) continue;
					const inferred = inferClineModelCapabilities(id, raw);
					// 优先展示免费模型和常用高优模型
					if (inferred.isFree || !modelsMap.has(id)) {
						modelsMap.set(id, inferred);
					}
				}

				return Array.from(modelsMap.values());
			}
		}
	} catch {
		// 网络故障或超时，回退内置目录
	}

	return Object.values(KNOWN_CLINE_FREE_MODELS);
}

/**
 * 执行 Cline 模型与凭据全量同步
 */
export async function syncClineConfiguration(
	options: ClineSyncOptions = {},
): Promise<ClineSyncResult> {
	const currentSync = syncMutexPromise.then(async () => {
		const modelsPath = options.modelsPath || defaultModelsPath();
		const authPath = options.authPath || defaultAuthPath();
		const ccSwitchDbPath = options.ccSwitchDbPath || defaultCcSwitchDbPath();

		const apiKey = options.apiKey?.trim() || getStoredClineApiKey(authPath, modelsPath);
		const models = await fetchClineModelCatalog(apiKey);
		const freeModels = models.filter((m) => m.isFree);

		const baseUrl = options.useLocalProxy
			? `http://127.0.0.1:${options.proxyPort || 4116}/v1`
			: CLINE_BASE_URL;

		let updatedModelsJson = false;
		let updatedAuthJson = false;
		let updatedCcSwitchDb = false;

		// 1. 更新 ~/.pi/agent/models.json
		try {
			let modelsData: Record<string, any> = {};
			if (existsSync(modelsPath)) {
				modelsData = JSON.parse(readFileSync(modelsPath, "utf-8"));
			}

			const providerConfig = {
				baseUrl,
				api: "openai-completions",
				apiKey,
				headers: {
					...CLINE_CLIENT_HEADERS,
				},
				models: [
					...[
						{ id: "bunny", ref: "stealth/space-bunny-alpha", name: "Cline Bunny (1M Stealth Free)" },
						{ id: "ling", ref: "inclusionai/ling-3.0-flash-fin:free", name: "Cline Ling 3.0 Flash Fin (Free)" },
						{ id: "code", ref: "openrouter/pareto-code", name: "Cline Pareto Code (2M Free)" },
						{ id: "fusion", ref: "openrouter/fusion", name: "Cline Fusion (1M Free)" },
						{ id: "free", ref: "openrouter/free", name: "Cline OpenRouter Free (200k)" },
						{ id: "550b", ref: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "Cline Nemotron 550B (1M Free)" },
						{ id: "120b", ref: "nvidia/nemotron-3-super-120b-a12b:free", name: "Cline Nemotron 120B (Free)" },
						{ id: "qwen", ref: "qwen/qwen3.8-27b:free", name: "Cline Qwen 3.8 27B (Free)" },
					].map((a) => {
						const base = KNOWN_CLINE_FREE_MODELS[a.ref] || models.find((m) => m.id === a.ref);
						return {
							id: a.id,
							name: a.name,
							contextWindow: base?.contextWindow || 262144,
							maxTokens: base?.maxTokens || 32768,
							reasoning: base?.reasoning ?? true,
							input: base?.input || (["text"] as ("text" | "image")[]),
							thinkingLevelMap: base?.thinkingLevelMap,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						};
					}),
					...models.map((m) => ({
						id: m.id,
						name: m.name,
						contextWindow: m.contextWindow,
						maxTokens: m.maxTokens,
						reasoning: m.reasoning,
						input: m.input,
						thinkingLevelMap: m.thinkingLevelMap,
						cost: m.cost,
					})),
				],
			};

			if (modelsData.providers && typeof modelsData.providers === "object") {
				modelsData.providers[CLINE_PROVIDER_ID] = providerConfig;
			} else {
				modelsData[CLINE_PROVIDER_ID] = providerConfig;
			}

			mkdirSync(dirname(modelsPath), { recursive: true });
			writeFileSync(modelsPath, JSON.stringify(modelsData, null, 2), "utf-8");
			updatedModelsJson = true;
		} catch (err: any) {
			if (!options.silent) {
				console.error(`[Cline Sync] 写入 models.json 失败:`, err.message);
			}
		}

		// 2. 更新 ~/.pi/agent/auth.json
		try {
			let authData: Record<string, any> = {};
			if (existsSync(authPath)) {
				authData = JSON.parse(readFileSync(authPath, "utf-8"));
			}

			authData[CLINE_PROVIDER_ID] = {
				type: "api_key",
				key: apiKey,
			};

			mkdirSync(dirname(authPath), { recursive: true });
			writeFileSync(authPath, JSON.stringify(authData, null, 2), "utf-8");
			updatedAuthJson = true;
		} catch (err: any) {
			if (!options.silent) {
				console.error(`[Cline Sync] 写入 auth.json 失败:`, err.message);
			}
		}

		// 3. 更新 CC-Switch 本地 SQLite 数据库
		try {
			updatedCcSwitchDb = updateCcSwitchDbForCline(ccSwitchDbPath, apiKey, baseUrl, models);
		} catch {
			// CC-Switch 可选
		}

		return {
			success: updatedModelsJson || updatedAuthJson,
			provider: CLINE_PROVIDER_ID,
			apiKey,
			modelCount: models.length,
			freeModelCount: freeModels.length,
			models,
			updatedModelsJson,
			updatedAuthJson,
			updatedCcSwitchDb,
		};
	});

	syncMutexPromise = currentSync.then(() => {}).catch(() => {});
	return currentSync;
}

/**
 * 更新 CC-Switch SQLite 数据库中的 Cline 供应商配置
 */
export function updateCcSwitchDbForCline(
	dbPath: string,
	apiKey: string,
	baseUrl: string,
	models: ClineModelDefinition[],
): boolean {
	if (!existsSync(dbPath)) {
		return false;
	}

	try {
		const db = new DatabaseSync(dbPath);
		const tables = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='providers'")
			.all();

		if (tables.length === 0) {
			db.close();
			return false;
		}

		const existing = db
			.prepare("SELECT id, config FROM providers WHERE id = ?")
			.get(CLINE_PROVIDER_ID) as { id: string; config?: string } | undefined;

		const providerConfig = {
			id: CLINE_PROVIDER_ID,
			name: "Cline (Free Tier & Router)",
			baseUrl,
			apiKey,
			headers: CLINE_CLIENT_HEADERS,
			models: models.map((m) => ({
				id: m.id,
				name: m.name,
				contextWindow: m.contextWindow,
				maxTokens: m.maxTokens,
			})),
		};

		if (existing) {
			db.prepare("UPDATE providers SET config = ? WHERE id = ?").run(
				JSON.stringify(providerConfig),
				CLINE_PROVIDER_ID,
			);
		} else {
			db.prepare(
				"INSERT INTO providers (id, name, type, config) VALUES (?, 'Cline (Free Tier & Router)', 'openai', ?)",
			).run(CLINE_PROVIDER_ID, JSON.stringify(providerConfig));
		}

		db.close();
		return true;
	} catch {
		return false;
	}
}
