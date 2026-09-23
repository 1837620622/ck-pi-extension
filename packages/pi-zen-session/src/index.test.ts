/**
 * ck-pi-zen-session 单元测试
 * 运行方式: npm test
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	KNOWN_ZEN_FREE_MODELS,
	resolveModelDefinitions,
	buildFallbackModelDefinition,
	inferModelCapabilities,
	formatTokens,
	formatThinkingSummary,
	formatModelCard,
	ZEN_PROVIDER_ID,
} from "./models-registry.js";
import { DatabaseSync } from "node:sqlite";
import {
	DEFAULT_SESSION_MAX_AGE_MS,
	extractZenSessionTimestamp,
	generateZenRequestId,
	generateZenSessionId,
	isZenSessionExpired,
	isValidZenSessionId,
} from "./session.js";
import {
	getStoredZenApiKey,
	getStoredZenSessionId,
	syncZenConfiguration,
	updateCcSwitchDb,
} from "./sync.js";
import piZenSession from "./index.js";

describe("OpenCode Zen Session 算法单元测试", () => {
	it("生成合规且长度恰好为 30 字符的 Session ID", () => {
		const id = generateZenSessionId();
		assert.equal(id.length, 30, "ID 总长必须严格为 30 字符");
		assert.ok(isValidZenSessionId(id), "必须匹配 ses_[0-9a-f]{12}[0-9A-Za-z]{14} 正则");
	});

	it("生成合规升序 Request ID (msg_ 开头，长度 30 字符)", () => {
		const reqId = generateZenRequestId();
		assert.equal(reqId.length, 30);
		assert.ok(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/.test(reqId));

		const earlier = 1790000000000;
		const later = 1790000100000;
		const reqEarlier = generateZenRequestId(earlier);
		const reqLater = generateZenRequestId(later);
		// 升序：更晚的时间戳，十六进制数值更大
		assert.ok(reqLater.slice(4, 16) > reqEarlier.slice(4, 16));
	});

	it("同一毫秒内连续生成不会冲突，序列自增", () => {
		const fixedTime = 1790000000000;
		const id1 = generateZenSessionId(fixedTime);
		const id2 = generateZenSessionId(fixedTime);
		const id3 = generateZenSessionId(fixedTime);

		assert.notEqual(id1, id2);
		assert.notEqual(id2, id3);
	});

	it("严格满足 descending 降序排序特性（越新的时间戳，十六进制字典序越靠前/越小）", () => {
		const earlier = 1790000000000;
		const later = 1790000100000;

		const idEarlier = generateZenSessionId(earlier);
		const idLater = generateZenSessionId(later);

		const hexEarlier = idEarlier.slice(4, 16);
		const hexLater = idLater.slice(4, 16);

		assert.ok(
			hexEarlier > hexLater,
			`早的时间戳 (${earlier}) 反转后十六进制 (${hexEarlier}) 必须大于晚的时间戳 (${later}) 十六进制 (${hexLater})`,
		);
	});

	it("时间戳提取与反解具备毫秒级精度", () => {
		const now = Date.now();
		const id = generateZenSessionId(now);
		const extracted = extractZenSessionTimestamp(id, now);
		assert.ok(extracted !== null);
		assert.equal(extracted, now, "提取的时间戳必须与生成时间完全吻合");
	});

	it("精准检测 Session 30分钟有效期与过期逻辑", () => {
		const now = Date.now();
		const freshId = generateZenSessionId(now - 10 * 60 * 1000); // 10分钟前
		assert.equal(isZenSessionExpired(freshId, DEFAULT_SESSION_MAX_AGE_MS, now), false);

		const oldId = generateZenSessionId(now - 35 * 60 * 1000); // 35分钟前 (>30m)
		assert.equal(isZenSessionExpired(oldId, DEFAULT_SESSION_MAX_AGE_MS, now), true);

		assert.equal(isZenSessionExpired(null), true);
		assert.equal(isZenSessionExpired("invalid_id"), true);
	});
});

describe("OpenCode Zen 模型库与参数注册表测试", () => {
	it("包含全部已确认的 9 款免费模型", () => {
		const expectedModels = [
			"mimo-v2.5-free",
			"mimo-v2.6-flash-free",
			"nemotron-3.5-lightning-free",
			"nemotron-3-ultra-free",
			"ling-3.0-flash-fin-free",
			"big-pickle",
			"muse-spark-1.3-contributor-free",
			"muse-spark-1.2-contributor-free",
			"jev-1.13-free",
		];

		for (const id of expectedModels) {
			assert.ok(KNOWN_ZEN_FREE_MODELS[id], `必须包含模型定义: ${id}`);
		}
	});

	it("模型上下文上限与输出参数准确", () => {
		assert.equal(KNOWN_ZEN_FREE_MODELS["nemotron-3-ultra-free"].contextWindow, 1000000);
		assert.equal(KNOWN_ZEN_FREE_MODELS["muse-spark-1.3-contributor-free"].contextWindow, 1048576);
		assert.equal(KNOWN_ZEN_FREE_MODELS["mimo-v2.5-free"].contextWindow, 200000);
		assert.equal(KNOWN_ZEN_FREE_MODELS["jev-1.13-free"].reasoning, false);
		assert.equal(KNOWN_ZEN_FREE_MODELS["big-pickle"].reasoning, true);
	});

	it("支持未知未来免费模型自适应回退", () => {
		const fallback = buildFallbackModelDefinition("quantum-9-free");
		assert.equal(fallback.id, "quantum-9-free");
		assert.equal(fallback.reasoning, true);
		assert.ok(fallback.name.includes("Quantum 9 Free"));
	});

	it("深度自适应识别不同模型家族的上下文窗口、输出上限与思考等级", () => {
		// DeepSeek 家族
		const ds = inferModelCapabilities("deepseek-v4-flash-free");
		assert.equal(ds.contextWindow, 1000000, "DeepSeek 默认上下文 1M");
		assert.equal(ds.maxTokens, 65536, "DeepSeek V4 输出上限 64K");
		assert.equal(ds.reasoning, true);
		assert.ok(ds.name.startsWith("DeepSeek"));
		assert.deepEqual(ds.thinkingLevelMap?.low, "low");

		// Gemini 家族
		const gemini = inferModelCapabilities("gemini-3.7-flash-free");
		assert.equal(gemini.contextWindow, 1048576, "Gemini 默认上下文 1M (1048576)");
		assert.equal(gemini.maxTokens, 65536, "Gemini 输出上限 64K");
		assert.equal(gemini.reasoning, true);
		assert.ok(gemini.input.includes("image"), "Gemini 支持视觉图像输入");
		assert.ok(gemini.name.startsWith("Google Gemini"));
		assert.equal(gemini.thinkingLevelMap?.minimal, "low");

		// Claude 家族
		const claude = inferModelCapabilities("claude-sonnet-4-5-free");
		assert.equal(claude.contextWindow, 200000, "Claude 默认上下文 200K");
		assert.equal(claude.maxTokens, 65536, "Claude Sonnet 输出上限 64K (65536)");
		assert.equal(claude.reasoning, true);
		assert.ok(claude.input.includes("image"));

		// 快反无思考模型
		const reflex = inferModelCapabilities("fast-system-1-instruct-free");
		assert.equal(reflex.reasoning, false, "system-1 / reflex / instruct 为快反无思考模型");
		assert.equal(reflex.thinkingLevelMap, undefined);

		// 在线接口显式元数据覆盖优先级最高
		const custom = inferModelCapabilities("custom-ai-model-free", {
			context_window: 524288,
			max_output_tokens: 16384,
			reasoning: true,
			modalities: ["text", "image"],
		});
		assert.equal(custom.contextWindow, 524288, "显式 context_window 覆盖");
		assert.equal(custom.maxTokens, 16384, "显式 max_output_tokens 覆盖");
		assert.equal(custom.reasoning, true);
		assert.ok(custom.input.includes("image"));
	});

	it("格式化工具输出易读且精确的 Token 数量与思考等级卡片", () => {
		assert.equal(formatTokens(1048576), "1M (1,048,576 tokens)");
		assert.equal(formatTokens(262144), "256K (262,144 tokens)");
		assert.equal(formatTokens(32000), "31K (32,000 tokens)");

		const museCard = formatThinkingSummary(KNOWN_ZEN_FREE_MODELS["muse-spark-1.3-contributor-free"]);
		assert.ok(museCard.includes("6档深度思考"));

		const jevCard = formatThinkingSummary(KNOWN_ZEN_FREE_MODELS["jev-1.13-free"]);
		assert.ok(jevCard.includes("不支持"));

		const card = formatModelCard(KNOWN_ZEN_FREE_MODELS["mimo-v2.6-flash-free"], 1);
		assert.ok(card.includes("1. Xiaomi Mimo v2.6 Flash Free"));
		assert.ok(card.includes("上下文: 195K (200,000 tokens)"));
		assert.ok(card.includes("模态: 文本 + 视觉 (多模态)"));
		assert.ok(card.includes("额度: 0免费"));
	});
});

describe("配置同步与落盘逻辑测试", () => {
	it("原子更新临时 models.json 与 auth.json 并保留其他 Provider", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "pi-zen-test-"));
		const tempModelsPath = join(tempDir, "models.json");
		const tempAuthPath = join(tempDir, "auth.json");

		try {
			// 初始化预设 Provider
			writeFileSync(
				tempModelsPath,
				JSON.stringify({
					providers: {
						other_provider: { baseUrl: "https://example.com" },
					},
				}),
			);
			writeFileSync(
				tempAuthPath,
				JSON.stringify({
					other_provider: { key: "other_key" },
				}),
			);

			const testKey = "oc_sk_test_key_1234567890abcdef";
			const result = await syncZenConfiguration({
				apiKey: testKey,
				modelsPath: tempModelsPath,
				authPath: tempAuthPath,
				dbPath: join(tempDir, "non_existent.db"),
				forceSession: true,
				fetchModels: async () => ["mimo-v2.5-free", "big-pickle"],
			});

			assert.ok(result.sessionId.startsWith("ses_"));
			assert.equal(result.apiKey, testKey);

			// 验证 models.json
			const writtenModels = JSON.parse(readFileSync(tempModelsPath, "utf8"));
			assert.ok(writtenModels.providers.other_provider, "原有 provider 不得被冲掉");
			assert.ok(writtenModels.providers[ZEN_PROVIDER_ID], "必须写入 opencode-zen-free");
			assert.equal(
				writtenModels.providers[ZEN_PROVIDER_ID].headers["x-opencode-session"],
				result.sessionId,
			);
			assert.equal(
				writtenModels.providers[ZEN_PROVIDER_ID].headers["User-Agent"],
				"opencode/1.18.32 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14",
			);

			// 验证 auth.json
			const writtenAuth = JSON.parse(readFileSync(tempAuthPath, "utf8"));
			assert.ok(writtenAuth.other_provider, "原有 auth key 不得丢失");
			assert.equal(writtenAuth[ZEN_PROVIDER_ID].key, testKey);

			// 验证读取函数
			assert.equal(getStoredZenApiKey(tempAuthPath, tempModelsPath), testKey);
			assert.equal(getStoredZenSessionId(tempModelsPath), result.sessionId);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it("更新 CC-Switch 本地 SQLite 数据库中的 providers 表", () => {
		const tempDir = mkdtempSync(join(tmpdir(), "pi-zen-db-"));
		const tempDbPath = join(tempDir, "cc-switch.db");
		try {
			const db = new DatabaseSync(tempDbPath);
			db.exec(`
				CREATE TABLE providers (
					id TEXT,
					app_type TEXT,
					settings_config TEXT
				);
				INSERT INTO providers (id, app_type, settings_config) VALUES
				('opencode-zen-free', 'pi', '{"baseUrl":"https://opencode.ai/zen/v1","headers":{}}'),
				('opencode-zen-free', 'opencode', '{"options":{"headers":{}}}');
			`);
			db.close();

			const testSession = generateZenSessionId();
			const success = updateCcSwitchDb(tempDbPath, "oc_sk_test_db_key", testSession, []);
			assert.equal(success, true);

			const verifyDb = new DatabaseSync(tempDbPath);
			const rows = verifyDb
				.prepare("SELECT app_type, settings_config FROM providers WHERE id = ?")
				.all("opencode-zen-free");
			verifyDb.close();

			assert.equal(rows.length, 2);
			const piRow = rows.find((r) => r.app_type === "pi");
			const opencodeRow = rows.find((r) => r.app_type === "opencode");

			const piCfg = JSON.parse(piRow!.settings_config);
			const opencodeCfg = JSON.parse(opencodeRow!.settings_config);

			assert.equal(piCfg.headers["x-opencode-session"], testSession);
			assert.equal(opencodeCfg.options.headers["x-opencode-session"], testSession);
			assert.equal(piCfg.apiKey, "oc_sk_test_db_key");
			assert.equal(opencodeCfg.options.apiKey, "oc_sk_test_db_key");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe("Extension API 钩子拦截测试", () => {
	it("before_provider_headers 自动补全 7 个伪装请求头 (含 x-opencode-project)", () => {
		const handlers: Record<string, Function[]> = {};
		const mockPi: any = {
			registerProvider: () => {},
			registerCommand: () => {},
			on: (event: string, fn: Function) => {
				handlers[event] = handlers[event] || [];
				handlers[event].push(fn);
			},
		};

		piZenSession(mockPi);
		assert.ok(handlers["before_provider_headers"]?.length > 0);

		const headerEvent = { headers: {} as Record<string, string> };
		const ctx = { model: { provider: "opencode-zen-free", id: "mimo-v2.5-free" } };

		handlers["before_provider_headers"][0](headerEvent, ctx);

		assert.equal(
			headerEvent.headers["User-Agent"],
			"opencode/1.18.32 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14",
		);
		assert.equal(headerEvent.headers["x-opencode-client"], "cli");
		assert.ok(headerEvent.headers["x-opencode-session"].startsWith("ses_"));
		assert.ok(headerEvent.headers["x-opencode-project"].startsWith("prj_"));
		assert.equal(
			headerEvent.headers["x-session-affinity"],
			headerEvent.headers["x-opencode-session"],
		);
		assert.equal(
			headerEvent.headers["X-Session-Id"],
			headerEvent.headers["x-opencode-session"],
		);
		assert.ok(headerEvent.headers["x-opencode-request"].startsWith("msg_"));
	});

	it("before_provider_request 当缺失 tools 时注入官方 6 件套，已有 tools 时严格字母重排", () => {
		const handlers: Record<string, Function[]> = {};
		const mockPi: any = {
			registerProvider: () => {},
			registerCommand: () => {},
			on: (event: string, fn: Function) => {
				handlers[event] = handlers[event] || [];
				handlers[event].push(fn);
			},
		};

		piZenSession(mockPi);
		assert.ok(handlers["before_provider_request"]?.length > 0);

		const ctx = { model: { provider: "opencode-zen-free", id: "mimo-v2.5-free" } };

		// 1. 无 tools 时补齐官方 6 大核心工具，并补充 stream_options
		const emptyPayloadEvent = { payload: { model: "mimo-v2.5-free", messages: [], stream: true } };
		const transformed = handlers["before_provider_request"][0](emptyPayloadEvent, ctx);
		assert.ok(transformed);
		assert.ok(Array.isArray(transformed.tools));
		assert.equal(transformed.tools.length, 6);
		assert.deepEqual(
			transformed.tools.map((t: any) => t.function.name),
			["bash", "edit", "glob", "grep", "read", "write"],
		);
		assert.equal(transformed.tool_choice, "auto");
		assert.deepEqual(transformed.stream_options, { include_usage: true });

		// 2. 已有 tools 时严格按照函数名升序重排
		const disorderedTools = [
			{ type: "function", function: { name: "write" } },
			{ type: "function", function: { name: "bash" } },
			{ type: "function", function: { name: "read" } },
		];
		const withToolsEvent = {
			payload: { model: "mimo-v2.5-free", messages: [], tools: disorderedTools },
		};
		const sortedResult = handlers["before_provider_request"][0](withToolsEvent, ctx);
		assert.ok(sortedResult);
		assert.deepEqual(
			sortedResult.tools.map((t: any) => t.function.name),
			["bash", "read", "write"],
			"已有工具必须按官方规约字母升序重排",
		);

		// 3. reasoning_effort 规范化对齐：将 max / xhigh 降级映射为 high，将 minimal 映射为 low
		const maxEffortEvent = {
			payload: {
				model: "mimo-v2.6-flash-free",
				messages: [],
				tools: [{ type: "function", function: { name: "bash" } }],
				reasoning_effort: "max",
			},
		};
		const sanitizedMax = handlers["before_provider_request"][0](maxEffortEvent, ctx);
		assert.equal(sanitizedMax.reasoning_effort, "high", "max 必须被规范化为 high");

		const xhighEffortEvent = {
			payload: {
				model: "mimo-v2.6-flash-free",
				messages: [],
				tools: [{ type: "function", function: { name: "bash" } }],
				reasoning_effort: "xhigh",
			},
		};
		const sanitizedXhigh = handlers["before_provider_request"][0](xhighEffortEvent, ctx);
		assert.equal(sanitizedXhigh.reasoning_effort, "high", "xhigh 必须被规范化为 high");

		const minimalEffortEvent = {
			payload: {
				model: "mimo-v2.6-flash-free",
				messages: [],
				tools: [{ type: "function", function: { name: "bash" } }],
				reasoning_effort: "minimal",
			},
		};
		const sanitizedMinimal = handlers["before_provider_request"][0](minimalEffortEvent, ctx);
		assert.equal(sanitizedMinimal.reasoning_effort, "low", "minimal 必须被规范化为 low");

		// 非思考模型（如 jev-1.13-free）如果附带了 reasoning_effort，必须被彻底移除
		const nonReasoningEvent = {
			payload: {
				model: "jev-1.13-free",
				messages: [],
				tools: [{ type: "function", function: { name: "bash" } }],
				reasoning_effort: "high",
				thinking: { type: "adaptive" },
			},
		};
		const sanitizedNonReasoning = handlers["before_provider_request"][0](nonReasoningEvent, {
			model: { provider: "opencode-zen-free", id: "jev-1.13-free", reasoning: false },
		});
		assert.equal(sanitizedNonReasoning.reasoning_effort, undefined, "非思考模型必须剔除 reasoning_effort");
		assert.equal(sanitizedNonReasoning.thinking, undefined, "必须剔除顶层 thinking 对象");
	});

	it("after_provider_response 遇 401 或 403 自动触发 Session 换新和用户通知", () => {
		const handlers: Record<string, Function[]> = {};
		const mockPi: any = {
			registerProvider: () => {},
			registerCommand: () => {},
			on: (event: string, fn: Function) => {
				handlers[event] = handlers[event] || [];
				handlers[event].push(fn);
			},
		};

		piZenSession(mockPi);
		assert.ok(handlers["after_provider_response"]?.length > 0);

		let notifiedMessage = "";
		let notifiedLevel = "";
		const ctx = {
			model: { provider: "opencode-zen-free", id: "mimo-v2.5-free" },
			hasUI: true,
			ui: {
				notify: (msg: string, level: string) => {
					notifiedMessage = msg;
					notifiedLevel = level;
				},
			},
		};

		// 模拟网关返回 403 FreeTierError
		handlers["after_provider_response"][0]({ status: 403, headers: {} }, ctx);
		assert.ok(notifiedMessage.includes("HTTP 403"));
		assert.equal(notifiedLevel, "warning");

		// 模拟网关返回 503 远端服务不可用
		handlers["after_provider_response"][0]({ status: 503, headers: {} }, ctx);
		assert.ok(notifiedMessage.includes("HTTP 503"));
		assert.equal(notifiedLevel, "warning");
	});

	it("getStoredZenApiKey 支持优先读取环境变量 OPENCODE_API_KEY", () => {
		const originalEnv = process.env.OPENCODE_API_KEY;
		try {
			process.env.OPENCODE_API_KEY = "oc_sk_env_variable_test";
			const foundKey = getStoredZenApiKey("/non/existent/auth.json", "/non/existent/models.json");
			assert.equal(foundKey, "oc_sk_env_variable_test");
		} finally {
			if (originalEnv === undefined) {
				delete process.env.OPENCODE_API_KEY;
			} else {
				process.env.OPENCODE_API_KEY = originalEnv;
			}
		}
	});

	it("registerZenProviderToPi 支持动态注入发现的零额度免费模型", () => {
		let registeredConfig: any = null;
		const mockPi: any = {
			registerProvider: (_id: string, config: any) => {
				registeredConfig = config;
			},
			registerCommand: () => {},
			on: () => {},
		};

		const customFreeModels = [
			{
				id: "custom-vision-free",
				name: "Custom Vision Free",
				contextWindow: 128000,
				maxTokens: 16000,
				reasoning: true,
				input: ["text", "image"] as ("text" | "image")[],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			},
		];

		const { registerZenProviderToPi } = require("./index.js");
		registerZenProviderToPi(mockPi, "oc_sk_test", "ses_test_session_id", customFreeModels);

		assert.ok(registeredConfig);
		assert.equal(registeredConfig.apiKey, "oc_sk_test");
		assert.equal(registeredConfig.headers["x-opencode-session"], "ses_test_session_id");
		assert.equal(registeredConfig.models.length, 1);
		assert.equal(registeredConfig.models[0].id, "custom-vision-free");
		assert.equal(registeredConfig.models[0].cost.input, 0);
	});

	it("严格隔离：isZenModelTarget 对 relayhub、onerouter、deepseek、apmix 完全返回 false，钩子绝不干涉其他供应商", () => {
		const { isZenModelTarget } = require("./index.js");

		// 必须为 true 的场景
		assert.equal(isZenModelTarget({ provider: "opencode-zen-free", id: "mimo-v2.5-free" }), true);
		assert.equal(isZenModelTarget({ provider: "opencode-zen-free", id: "big-pickle" }), true);
		assert.equal(isZenModelTarget({ provider: "opencode", id: "mimo-v2.5-free" }), true);
		assert.equal(isZenModelTarget({ provider: "opencode", id: "big-pickle" }), true);

		// 必须为 false 的场景：绝不能干涉用户在 CC 里的其他供应商
		assert.equal(isZenModelTarget(undefined), false);
		assert.equal(isZenModelTarget({ provider: "relayhub", id: "deepseek-v4.1-flash" }), false);
		assert.equal(isZenModelTarget({ provider: "deepseek", id: "deepseek-flash" }), false);
		assert.equal(isZenModelTarget({ provider: "onerouter", id: "deepseek/deepseek-v4.1-flash:free" }), false);
		assert.equal(isZenModelTarget({ provider: "apmix", id: "deepseek-v4-flash-free" }), false);
		assert.equal(isZenModelTarget({ provider: "anthropic", id: "claude-3-7-sonnet" }), false);
	});
});


