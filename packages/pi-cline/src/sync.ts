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

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

function getDatabaseSync(): any {
	try {
		return require("node:sqlite").DatabaseSync;
	} catch {
		return null;
	}
}
import {
	CLINE_BASE_URL,
	CLINE_CLIENT_HEADERS,
	CLINE_DEFAULT_KEY,
	CLINE_PROVIDER_ID,
	inferClineModelCapabilities,
	KNOWN_CLINE_FREE_MODELS,
	sanitizePiModelDefinition,
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
			if (typeof auth?.["cline-free"]?.key === "string" && auth["cline-free"].key.trim()) {
				return auth["cline-free"].key.trim();
			}
			if (typeof auth?.cline?.key === "string" && auth.cline.key.trim()) {
				return auth.cline.key.trim();
			}
		}
	} catch {
		// 忽略读取错误
	}

	try {
		if (existsSync(modelsPath)) {
			const models = JSON.parse(readFileSync(modelsPath, "utf-8"));
			const prov =
				models?.providers?.["cline-free"] ||
				models?.["cline-free"] ||
				models?.providers?.cline ||
				models?.cline;
			if (typeof prov?.apiKey === "string" && prov.apiKey.trim()) {
				return prov.apiKey.trim();
			}
		}
	} catch {
		// 忽略读取错误
	}

	return CLINE_DEFAULT_KEY;
}

export function defaultCustomModelsPath(): string {
	if (process.env.TEST_CLINE_CUSTOM_MODELS_PATH) return process.env.TEST_CLINE_CUSTOM_MODELS_PATH;
	return join(homedir(), ".pi", "agent", "cline-models.json");
}

/**
 * 载入用户本地自定义或新增的 Cline 免费/隐身模型列表 (~/.pi/agent/cline-models.json)
 */
export function loadCustomClineModels(customPath = defaultCustomModelsPath()): ClineModelDefinition[] {
	if (!existsSync(customPath)) {
		return [];
	}
	try {
		const content = readFileSync(customPath, "utf-8");
		const parsed = JSON.parse(content);
		const list: ClineModelDefinition[] = [];
		const rawItems: any[] = Array.isArray(parsed)
			? parsed
			: parsed && typeof parsed === "object" && Array.isArray(parsed.models)
			? parsed.models
			: parsed && typeof parsed === "object"
			? Object.values(parsed)
			: [];

		for (const item of rawItems) {
			if (typeof item === "string" && item.trim()) {
				list.push(inferClineModelCapabilities(item.trim(), { is_free: true }));
			} else if (item && typeof item === "object" && typeof item.id === "string" && item.id.trim()) {
				const inferred = inferClineModelCapabilities(item.id.trim(), { ...item, is_free: true });
				list.push({
					...inferred,
					name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : inferred.name,
					contextWindow:
						typeof item.contextWindow === "number" && item.contextWindow > 0
							? item.contextWindow
							: inferred.contextWindow,
					maxTokens:
						typeof item.maxTokens === "number" && item.maxTokens > 0
							? item.maxTokens
							: inferred.maxTokens,
					reasoning: typeof item.reasoning === "boolean" ? item.reasoning : inferred.reasoning,
				});
			}
		}
		return list;
	} catch {
		return [];
	}
}

/**
 * 登记自定义或新增的 Cline 免费/隐身模型至 ~/.pi/agent/cline-models.json (0 消耗)
 */
export function addCustomClineModel(
	modelId: string,
	options?: { name?: string; contextWindow?: number; maxTokens?: number; reasoning?: boolean },
	customPath = defaultCustomModelsPath(),
): ClineModelDefinition {
	mkdirSync(dirname(customPath), { recursive: true, mode: 0o700 });
	let existing: any[] = [];
	try {
		if (existsSync(customPath)) {
			const content = readFileSync(customPath, "utf-8");
			const parsed = JSON.parse(content);
			if (Array.isArray(parsed)) {
				existing = parsed;
			}
		}
	} catch {}

	const def = inferClineModelCapabilities(modelId, { ...options, is_free: true });
	if (options?.name) def.name = options.name;
	if (options?.contextWindow) def.contextWindow = options.contextWindow;
	if (options?.maxTokens) def.maxTokens = options.maxTokens;
	if (typeof options?.reasoning === "boolean") def.reasoning = options.reasoning;

	const filtered = existing.filter((item) => {
		const id = typeof item === "string" ? item : item?.id;
		return id !== modelId;
	});
	filtered.push({
		id: def.id,
		name: def.name,
		contextWindow: def.contextWindow,
		maxTokens: def.maxTokens,
		reasoning: def.reasoning,
		isFree: true,
	});

	writeFileSync(customPath, JSON.stringify(filtered, null, 2), { encoding: "utf-8", mode: 0o600 });
	try {
		chmodSync(customPath, 0o600);
	} catch {}
	return def;
}

/**
 * 校验 API Key 并拉取 Cline 在线模型目录 (0 Token 0 扣费消耗元数据查询)
 */
export async function fetchClineModelCatalog(
	apiKey: string,
	customPath = defaultCustomModelsPath(),
): Promise<ClineModelDefinition[]> {
	const modelsMap = new Map<string, ClineModelDefinition>();

	// 1. 先载入已知精选免费模型保底 (包含 stealth/space-bunny-alpha 等 21 款零额度模型)
	for (const [id, m] of Object.entries(KNOWN_CLINE_FREE_MODELS)) {
		modelsMap.set(id, m);
	}

	// 2. 载入本地自定义与新增模型清单 (~/.pi/agent/cline-models.json)
	const customModels = loadCustomClineModels(customPath);
	for (const m of customModels) {
		modelsMap.set(m.id, m);
	}

	// 3. 安全查询远端模型元数据列表 (严格仅使用 GET /models，绝不大批量测试 completions，0 Token 0 扣费消耗)
	try {
		const res = await fetch(`${CLINE_BASE_URL}/models`, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey.trim()}`,
				...CLINE_CLIENT_HEADERS,
			},
			signal: AbortSignal.timeout(15_000),
		});

		if (res.ok) {
			const data = (await res.json()) as { data?: Array<{ id: string; [key: string]: unknown }> };
			if (data && Array.isArray(data.data) && data.data.length > 0) {
				// 将远端返回的免费模型推断并合入 (仅限零额度免费模型，与 Zen 保持一致)
				for (const raw of data.data) {
					const id = String(raw.id || "");
					if (!id) continue;
					const inferred = inferClineModelCapabilities(id, raw);
					// 严格只合入零额度/免费模型
					if (inferred.isFree) {
						modelsMap.set(id, inferred);
					}
				}
			}
		}
	} catch {
		// 网络故障或超时，回退内置目录与本地自定义目录
	}

	return Array.from(modelsMap.values());
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
		const customModelsPath = options.customModelsPath || defaultCustomModelsPath();

		const apiKey = options.apiKey?.trim() || getStoredClineApiKey(authPath, modelsPath);
		const allModels = await fetchClineModelCatalog(apiKey, customModelsPath);
		const freeModels = allModels.filter((m) => m.isFree ?? true);
		const baseModels = freeModels.length > 0 ? freeModels : Object.values(KNOWN_CLINE_FREE_MODELS);

		// 严格去重防护：以 canonical ID 唯一键去重，绝不混入 alias 或重复项
		const uniqueModelsMap = new Map<string, ClineModelDefinition>();
		for (const m of baseModels) {
			if (m && m.id && !uniqueModelsMap.has(m.id)) {
				uniqueModelsMap.set(m.id, m);
			}
		}
		const modelsToUse = Array.from(uniqueModelsMap.values());

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
				try {
					modelsData = JSON.parse(readFileSync(modelsPath, "utf-8"));
				} catch {
					modelsData = {};
				}
			}

			if (!modelsData.providers || typeof modelsData.providers !== "object") {
				modelsData.providers = {};
			}

			// 清理根节点历史遗留键，避免注入错误 JSON 结构
			delete modelsData.cline;
			delete modelsData[CLINE_PROVIDER_ID];
			if (modelsData.providers) {
				delete modelsData.providers.cline;
			}

			const sanitizedModels = modelsToUse
				.map(sanitizePiModelDefinition)
				.filter((m): m is NonNullable<typeof m> => m !== null);

			const providerConfig = {
				name: "Cline (Free)",
				baseUrl,
				api: "openai-completions",
				apiKey: apiKey || "",
				headers: {
					...CLINE_CLIENT_HEADERS,
				},
				compat: {
					maxTokensField: "max_tokens",
					requiresReasoningContentOnAssistantMessages: true,
					supportsDeveloperRole: false,
					supportsStore: false,
					supportsUsageInStreaming: true,
				},
				models: sanitizedModels,
			};

			modelsData.providers[CLINE_PROVIDER_ID] = providerConfig;

			mkdirSync(dirname(modelsPath), { recursive: true, mode: 0o700 });
			try {
				chmodSync(dirname(modelsPath), 0o700);
			} catch {}
			writeFileSync(modelsPath, `${JSON.stringify(modelsData, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
			try {
				chmodSync(modelsPath, 0o600);
			} catch {}
			updatedModelsJson = true;
		} catch (err: any) {
			if (!options.silent) {
				console.error(`[Cline Sync] 写入 models.json 失败:`, err.message);
			}
		}

		// 2. 更新 ~/.pi/agent/auth.json (强制 0600 权限保护 API Key)
		try {
			let authData: Record<string, any> = {};
			if (existsSync(authPath)) {
				authData = JSON.parse(readFileSync(authPath, "utf-8"));
			}

			delete authData.cline;
			authData[CLINE_PROVIDER_ID] = {
				type: "api_key",
				key: apiKey,
			};

			mkdirSync(dirname(authPath), { recursive: true, mode: 0o700 });
			try {
				chmodSync(dirname(authPath), 0o700);
			} catch {}
			writeFileSync(authPath, JSON.stringify(authData, null, 2), { encoding: "utf-8", mode: 0o600 });
			try {
				chmodSync(authPath, 0o600);
			} catch {}
			updatedAuthJson = true;
		} catch (err: any) {
			if (!options.silent) {
				console.error(`[Cline Sync] 写入 auth.json 失败:`, err.message);
			}
		}

		// 3. 更新 CC-Switch 本地 SQLite 数据库
		try {
			updatedCcSwitchDb = updateCcSwitchDbForCline(ccSwitchDbPath, apiKey, baseUrl, modelsToUse);
		} catch {
			// CC-Switch 可选
		}

		return {
			success: updatedModelsJson || updatedAuthJson,
			provider: CLINE_PROVIDER_ID,
			apiKey,
			modelCount: modelsToUse.length,
			freeModelCount: freeModels.length,
			models: modelsToUse,
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

	const DatabaseSync = getDatabaseSync();
	if (!DatabaseSync) {
		return false;
	}

	let db: any = null;
	try {
		db = new DatabaseSync(dbPath);
		db.exec("PRAGMA busy_timeout = 5000;");
		const tables = db
			.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='providers'")
			.all();

		if (tables.length === 0) {
			return false;
		}

		const colRows = db.prepare("PRAGMA table_info(providers)").all() as Array<{ name: string }>;
		const colNames = new Set(colRows.map((r) => r.name));

		const providerConfig = {
			id: CLINE_PROVIDER_ID,
			name: "Cline (Free)",
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

		if (colNames.has("settings_config")) {
			const rows = db.prepare("SELECT app_type, settings_config FROM providers WHERE id = ?").all(CLINE_PROVIDER_ID) as Array<{ app_type: string; settings_config: string }>;
			if (rows.length > 0) {
				const updateStmt = db.prepare("UPDATE providers SET settings_config = ? WHERE id = ? AND app_type = ?");
				for (const row of rows) {
					try {
						const cfg = JSON.parse(row.settings_config) as Record<string, unknown>;
						cfg.apiKey = apiKey;
						cfg.baseUrl = baseUrl;
						cfg.headers = CLINE_CLIENT_HEADERS;
						cfg.models = models;
						updateStmt.run(JSON.stringify(cfg), CLINE_PROVIDER_ID, row.app_type);
					} catch {}
				}
			} else {
				const insertStmt = db.prepare(
					"INSERT INTO providers (id, app_type, name, settings_config) VALUES (?, 'pi', 'Cline (Free)', ?)",
				);
				insertStmt.run(
					CLINE_PROVIDER_ID,
					JSON.stringify({
						apiKey,
						baseUrl,
						headers: CLINE_CLIENT_HEADERS,
						models,
					}),
				);
			}
		} else if (colNames.has("config")) {
			const existing = db
				.prepare("SELECT id, config FROM providers WHERE id = ?")
				.get(CLINE_PROVIDER_ID) as { id: string; config?: string } | undefined;

			if (existing) {
				db.prepare("UPDATE providers SET config = ? WHERE id = ?").run(
					JSON.stringify(providerConfig),
					CLINE_PROVIDER_ID,
				);
			} else {
				db.prepare(
					"INSERT INTO providers (id, name, type, config) VALUES (?, 'Cline (Free)', 'openai', ?)",
				).run(CLINE_PROVIDER_ID, JSON.stringify(providerConfig));
			}
		}

		try {
			chmodSync(dbPath, 0o600);
		} catch {}

		return true;
	} catch {
		return false;
	} finally {
		db?.close();
	}
}
