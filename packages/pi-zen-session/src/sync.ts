/**
 * OpenCode Zen 模型发现、Session 维护与配置同步服务
 *
 * 负责：
 * 1. 验证 OpenCode Zen API Key 并在线获取最新可用免费模型清单；
 * 2. 依据官方 Identifier.descending 规约生成/刷新合规 Session ID；
 * 3. 自动注入伪装请求头 (User-Agent 与 x-opencode-session)；
 * 4. 同步更新 ~/.pi/agent/models.json 与 ~/.pi/agent/auth.json；
 * 5. 若已安装 CC-Switch，自动无缝同步更新 ~/.cc-switch/cc-switch.db。
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
	formatModelCard,
	formatThinkingSummary,
	formatTokens,
	KNOWN_ZEN_FREE_MODELS,
	resolveModelDefinitions,
	ZEN_BASE_URL,
	ZEN_PROVIDER_ID,
	ZEN_USER_AGENT,
} from "./models-registry.js";
export { formatModelCard, formatThinkingSummary, formatTokens };
import {
	DEFAULT_SESSION_MAX_AGE_MS,
	extractZenSessionTimestamp,
	generateZenProjectId,
	generateZenSessionId,
	isZenSessionExpired,
	isValidZenSessionId,
} from "./session.js";
import type { ZenModelDefinition, ZenStatusInfo, ZenSyncOptions, ZenSyncResult } from "./types.js";

export function defaultModelsPath(): string {
	return join(homedir(), ".pi", "agent", "models.json");
}

export function defaultAuthPath(): string {
	return join(homedir(), ".pi", "agent", "auth.json");
}

export function defaultCcSwitchDbPath(): string {
	return join(homedir(), ".cc-switch", "cc-switch.db");
}

/**
 * 校验 API Key 并拉取 OpenCode Zen 在线模型清单，自动识别所有免费与零额度模型 ID
 */
export async function fetchZenFreeModels(apiKey: string): Promise<string[]> {
	const catalog = await fetchZenModelCatalog(apiKey);
	return catalog.map((m) => m.id);
}

/**
 * 校验 API Key 并拉取 OpenCode Zen 完整免费模型目录，深度解析上下文与思考等级
 */
export async function fetchZenModelCatalog(apiKey: string): Promise<ZenModelDefinition[]> {
	const res = await fetch(`${ZEN_BASE_URL}/models`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${apiKey.trim()}`,
			"User-Agent": ZEN_USER_AGENT,
		},
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`OpenCode Zen API 验证失败 (HTTP ${res.status}): ${text || res.statusText}`);
	}

	const data = (await res.json()) as { data?: Array<{ id: string; [key: string]: unknown }> };
	if (!data || !Array.isArray(data.data)) {
		return Object.values(KNOWN_ZEN_FREE_MODELS);
	}

	// 自动识别所有带 free / zero / pickle / trial / demo / community 标识或零额度的免费模型
	const freeItems = data.data.filter((item) => {
		const id = String(item.id || "");
		const lower = id.toLowerCase();
		const isFreeByKeyword =
			lower.includes("free") ||
			lower.includes("pickle") ||
			lower.includes("zero") ||
			lower.includes("trial") ||
			lower.includes("demo") ||
			lower.includes("community") ||
			lower.endsWith("-free");

		const isFreeByMetadata =
			(item as { free?: boolean }).free === true ||
			(item as { is_free?: boolean }).is_free === true ||
			(item as { tier?: string }).tier === "free" ||
			((item as { cost?: { input?: number; output?: number } }).cost &&
				(item as { cost: { input: number; output: number } }).cost.input === 0 &&
				(item as { cost: { input: number; output: number } }).cost.output === 0) ||
			((item as { pricing?: { input?: number } }).pricing &&
				(item as { pricing: { input: number } }).pricing.input === 0);

		const isKnown = KNOWN_ZEN_FREE_MODELS[id] !== undefined;

		return isFreeByKeyword || isFreeByMetadata || isKnown;
	});

	return freeItems.length > 0 ? resolveModelDefinitions(freeItems) : Object.values(KNOWN_ZEN_FREE_MODELS);
}

/**
 * 读取当前系统已持久化配置的 OpenCode Zen 模型清单
 */
export function getStoredZenModels(modelsPath = defaultModelsPath()): ZenModelDefinition[] {
	try {
		if (existsSync(modelsPath)) {
			const modelsDoc = JSON.parse(readFileSync(modelsPath, "utf8")) as {
				providers?: Record<string, { models?: ZenModelDefinition[] }>;
			};
			const list = modelsDoc.providers?.[ZEN_PROVIDER_ID]?.models;
			if (Array.isArray(list) && list.length > 0) {
				return list;
			}
		}
	} catch {
		// 忽略读取错误
	}
	return Object.values(KNOWN_ZEN_FREE_MODELS);
}

/**
 * 读取当前系统中已配置的 OpenCode Zen API Key
 */
export function getStoredZenApiKey(authPath = defaultAuthPath(), modelsPath = defaultModelsPath()): string | null {
	// 优先读取环境变量，支持免配置直接启动
	const envKey =
		process.env.OPENCODE_API_KEY ||
		process.env.OPENCODE_ZEN_API_KEY ||
		process.env.ZEN_API_KEY;
	if (envKey && envKey.trim()) {
		return envKey.trim();
	}

	try {
		if (existsSync(authPath)) {
			const auth = JSON.parse(readFileSync(authPath, "utf8")) as Record<string, { key?: string }>;
			if (auth[ZEN_PROVIDER_ID]?.key) {
				return auth[ZEN_PROVIDER_ID].key;
			}
		}
	} catch {
		// 忽略读取错误
	}

	try {
		if (existsSync(modelsPath)) {
			const models = JSON.parse(readFileSync(modelsPath, "utf8")) as {
				providers?: Record<string, { apiKey?: string }>;
			};
			if (models.providers?.[ZEN_PROVIDER_ID]?.apiKey) {
				return models.providers[ZEN_PROVIDER_ID].apiKey;
			}
		}
	} catch {
		// 忽略读取错误
	}

	return null;
}

/**
 * 读取当前已配置的 Session ID
 */
export function getStoredZenSessionId(modelsPath = defaultModelsPath()): string | null {
	try {
		if (existsSync(modelsPath)) {
			const models = JSON.parse(readFileSync(modelsPath, "utf8")) as {
				providers?: Record<string, { headers?: { "x-opencode-session"?: string } }>;
			};
			const ses = models.providers?.[ZEN_PROVIDER_ID]?.headers?.["x-opencode-session"];
			if (isValidZenSessionId(ses)) return ses;
		}
	} catch {
		// 忽略错误
	}
	return null;
}

/**
 * 获取 OpenCode Zen 的运行状态摘要
 */
export function getZenStatusInfo(
	modelsPath = defaultModelsPath(),
	authPath = defaultAuthPath(),
): ZenStatusInfo {
	const key = getStoredZenApiKey(authPath, modelsPath);
	const sessionId = getStoredZenSessionId(modelsPath) ?? "";
	const ts = sessionId ? extractZenSessionTimestamp(sessionId) : null;
	const now = Date.now();
	const ageMinutes = ts ? Math.max(0, Math.round((now - ts) / 60000)) : 999999;
	const expired = isZenSessionExpired(sessionId, DEFAULT_SESSION_MAX_AGE_MS, now);

	let modelIds: string[] = [];
	try {
		if (existsSync(modelsPath)) {
			const models = JSON.parse(readFileSync(modelsPath, "utf8")) as {
				providers?: Record<string, { models?: Array<{ id: string }> }>;
			};
			const list = models.providers?.[ZEN_PROVIDER_ID]?.models;
			if (Array.isArray(list)) {
				modelIds = list.map((m) => m.id);
			}
		}
	} catch {
		// ignore
	}

	let maskedKey = "未配置";
	if (key) {
		maskedKey = key.length > 12 ? `${key.slice(0, 8)}...${key.slice(-4)}` : "******";
	}

	return {
		hasKey: Boolean(key),
		maskedKey,
		sessionId,
		sessionAgeMinutes: ageMinutes,
		sessionExpired: expired,
		modelsCount: modelIds.length,
		modelIds,
	};
}

/**
 * 执行 OpenCode Zen 全量同步（Key 校验、模型拉取、Session 生成、文件落盘、CC-Switch 数据库同步）
 */
export async function syncZenConfiguration(options: ZenSyncOptions = {}): Promise<ZenSyncResult> {
	const modelsPath = options.modelsPath ?? defaultModelsPath();
	const authPath = options.authPath ?? defaultAuthPath();
	const dbPath = options.dbPath ?? defaultCcSwitchDbPath();

	const resolvedApiKey = options.apiKey?.trim() || getStoredZenApiKey(authPath, modelsPath);
	if (!resolvedApiKey) {
		throw new Error("未检测到 OpenCode Zen API Key。请指定 Key，例如：/zen oc_sk_xxx");
	}

	// 1. 在线校验 API Key 并拉取最新免费模型及精确能力规格
	let resolvedModels: ZenModelDefinition[] = [];
	if (options.fetchModels) {
		try {
			const fetched = await options.fetchModels(resolvedApiKey);
			resolvedModels = resolveModelDefinitions(fetched);
		} catch (error) {
			if (!options.apiKey) {
				resolvedModels = Object.values(KNOWN_ZEN_FREE_MODELS);
			} else {
				throw error;
			}
		}
	} else {
		try {
			resolvedModels = await fetchZenModelCatalog(resolvedApiKey);
		} catch (error) {
			if (!options.apiKey) {
				resolvedModels = Object.values(KNOWN_ZEN_FREE_MODELS);
			} else {
				throw error;
			}
		}
	}
	const freeModelIds = resolvedModels.map((m) => m.id);

	// 2. 确定 Session ID：若显式强制更新或当前已过期，则生成全新合规 Session
	const currentSession = getStoredZenSessionId(modelsPath);
	let targetSession = currentSession;
	let isNewSession = false;

	if (options.forceSession || !currentSession || isZenSessionExpired(currentSession, DEFAULT_SESSION_MAX_AGE_MS)) {
		targetSession = generateZenSessionId();
		isNewSession = true;
	}

	// 3. 更新 ~/.pi/agent/models.json
	let modelsDoc: { providers?: Record<string, unknown> } = {};
	try {
		if (existsSync(modelsPath)) {
			modelsDoc = JSON.parse(readFileSync(modelsPath, "utf8")) as { providers?: Record<string, unknown> };
		}
	} catch {
		modelsDoc = {};
	}
	if (!modelsDoc.providers || typeof modelsDoc.providers !== "object") {
		modelsDoc.providers = {};
	}

	modelsDoc.providers[ZEN_PROVIDER_ID] = {
		baseUrl: ZEN_BASE_URL,
		api: "openai-completions",
		apiKey: resolvedApiKey,
		headers: {
			"User-Agent": ZEN_USER_AGENT,
			"x-opencode-client": "cli",
			"x-opencode-session": targetSession,
			"x-opencode-project": generateZenProjectId(),
			"x-session-affinity": targetSession,
			"X-Session-Id": targetSession,
		},
		compat: {
			maxTokensField: "max_tokens",
			requiresReasoningContentOnAssistantMessages: true,
			supportsDeveloperRole: false,
			supportsStore: false,
			supportsUsageInStreaming: true,
		},
		models: resolvedModels,
	};

	mkdirSync(dirname(modelsPath), { recursive: true });
	writeFileSync(modelsPath, `${JSON.stringify(modelsDoc, null, 2)}\n`, "utf8");

	// 4. 更新 ~/.pi/agent/auth.json
	let authDoc: Record<string, unknown> = {};
	try {
		if (existsSync(authPath)) {
			authDoc = JSON.parse(readFileSync(authPath, "utf8")) as Record<string, unknown>;
		}
	} catch {
		authDoc = {};
	}
	authDoc[ZEN_PROVIDER_ID] = {
		type: "api_key",
		key: resolvedApiKey,
	};
	mkdirSync(dirname(authPath), { recursive: true });
	writeFileSync(authPath, `${JSON.stringify(authDoc, null, 2)}\n`, "utf8");

	// 5. 同步 CC-Switch 数据库
	let ccSwitchUpdated = false;
	try {
		ccSwitchUpdated = updateCcSwitchDb(dbPath, resolvedApiKey, targetSession, resolvedModels);
	} catch {
		ccSwitchUpdated = false;
	}

	return {
		apiKey: resolvedApiKey,
		sessionId: targetSession,
		isNewSession,
		modelsCount: resolvedModels.length,
		models: resolvedModels.map((m) => m.id),
		resolvedModels,
		modelsPath,
		ccSwitchUpdated,
	};
}

/**
 * 同步 CC-Switch 数据库中的 opencode-zen-free 配置
 */
export function updateCcSwitchDb(
	dbPath: string,
	apiKey: string,
	sessionId: string,
	models: unknown[],
): boolean {
	if (!existsSync(dbPath)) return false;

	// 优先使用 Node 22+ 内置的 node:sqlite
	try {
		const db = new DatabaseSync(dbPath);
		const selectStmt = db.prepare("SELECT app_type, settings_config FROM providers WHERE id = ?");
		const rows = selectStmt.all(ZEN_PROVIDER_ID) as Array<{ app_type: string; settings_config: string }>;

		if (rows.length > 0) {
			const updateStmt = db.prepare(
				"UPDATE providers SET settings_config = ? WHERE id = ? AND app_type = ?",
			);

			for (const row of rows) {
				try {
					const cfg = JSON.parse(row.settings_config) as Record<string, unknown>;
					if (row.app_type === "pi") {
						cfg.apiKey = apiKey;
						const headers = (cfg.headers ?? {}) as Record<string, string>;
						headers["User-Agent"] = ZEN_USER_AGENT;
						headers["x-opencode-client"] = "cli";
						headers["x-opencode-session"] = sessionId;
						headers["x-opencode-project"] = generateZenProjectId();
						headers["x-session-affinity"] = sessionId;
						headers["X-Session-Id"] = sessionId;
						cfg.headers = headers;
						cfg.models = models;
					} else if (row.app_type === "opencode") {
						const opts = (cfg.options ?? {}) as Record<string, unknown>;
						opts.apiKey = apiKey;
						const headers = (opts.headers ?? {}) as Record<string, string>;
						headers["User-Agent"] = ZEN_USER_AGENT;
						headers["x-opencode-client"] = "cli";
						headers["x-opencode-session"] = sessionId;
						headers["x-opencode-project"] = generateZenProjectId();
						headers["x-session-affinity"] = sessionId;
						headers["X-Session-Id"] = sessionId;
						opts.headers = headers;
						cfg.options = opts;
					}
					updateStmt.run(JSON.stringify(cfg), ZEN_PROVIDER_ID, row.app_type);
				} catch {
					// 忽略单行解析失败
				}
			}
			db.close();
			return true;
		}
		db.close();
	} catch {
		// 若 node:sqlite 不可用，尝试调用 Python3 脚本无痛回退
		try {
			const script = `
import sqlite3, json, sys
conn = sqlite3.connect('${dbPath}')
c = conn.cursor()
c.execute("SELECT app_type, settings_config FROM providers WHERE id = '${ZEN_PROVIDER_ID}'")
rows = c.fetchall()
if rows:
    for app, cfg_str in rows:
        try:
            cfg = json.loads(cfg_str)
            if app == 'pi':
                cfg['apiKey'] = '${apiKey}'
                headers = cfg.get('headers', {})
                headers['User-Agent'] = '${ZEN_USER_AGENT}'
                headers['x-opencode-session'] = '${sessionId}'
                cfg['headers'] = headers
            elif app == 'opencode':
                opts = cfg.get('options', {})
                opts['apiKey'] = '${apiKey}'
                headers = opts.get('headers', {})
                headers['User-Agent'] = '${ZEN_USER_AGENT}'
                headers['x-opencode-session'] = '${sessionId}'
                opts['headers'] = headers
                cfg['options'] = opts
            c.execute("UPDATE providers SET settings_config = ? WHERE id = ? AND app_type = ?", (json.dumps(cfg), '${ZEN_PROVIDER_ID}', app))
        except Exception:
            pass
    conn.commit()
conn.close()
`;
			execFileSync("python3", ["-c", script], { timeout: 3000 });
			return true;
		} catch {
			return false;
		}
	}

	return false;
}
