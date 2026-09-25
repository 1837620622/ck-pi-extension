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
	getActiveZenSessionId,
	getStoredZenApiKey,
	getStoredZenSessionId,
	setActiveZenSessionId,
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
	it("包含全部已确认的 10 款免费模型", () => {
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
			"space-bunny-free",
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

	it("installZenFetchInterceptor: 全局 Fetch 拦截器拦截无 tools 的 Summarization 请求并补全 tools 与请求头", async () => {
		const { installZenFetchInterceptor } = require("./index.js");

		let capturedUrl: string | undefined;
		let capturedInit: RequestInit | undefined;
		const mockRes = new Response(JSON.stringify({ id: "mock_res" }), { status: 200 });

		const mockGlobal: any = {
			fetch: async (input: any, init: any) => {
				capturedUrl = String(input);
				capturedInit = init;
				return mockRes;
			},
		};

		installZenFetchInterceptor(mockGlobal);

		const bodyWithoutTools = {
			model: "mimo-v2.5-free",
			messages: [{ role: "user", content: "summarize conversation" }],
			stream: true,
		};

		await mockGlobal.fetch("https://opencode.ai/zen/v1/chat/completions", {
			method: "POST",
			headers: { Authorization: "Bearer test" },
			body: JSON.stringify(bodyWithoutTools),
		});

		assert.ok(capturedInit, "全局 Fetch 必须成功拦截目标请求");
		const headers = new Headers(capturedInit?.headers);
		assert.equal(headers.get("User-Agent"), "opencode/1.18.32 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14");
		assert.equal(headers.get("x-opencode-client"), "cli");
		assert.ok(headers.get("x-opencode-session")?.startsWith("ses_"));
		assert.ok(headers.get("x-opencode-request")?.startsWith("msg_"));

		const parsedBody = JSON.parse(String(capturedInit?.body));
		assert.ok(Array.isArray(parsedBody.tools), "拦截器必须为 Summarization 请求强制注入 tools");
		assert.equal(parsedBody.tools.length, 6, "必须注入官方 6 大核心工具");
		assert.equal(parsedBody.tool_choice, "none", "当请求本身无工具时 tool_choice 必须为 none 保证纯文本输出");
		assert.deepEqual(parsedBody.stream_options, { include_usage: true });
	});

	it("assembleSseToChatCompletionResponse: 将 SSE 帧流反序列化为标准 ChatCompletion JSON", async () => {
		const { assembleSseToChatCompletionResponse } = require("./index.js");

		const sseData = [
			'data: {"id":"gen-123","model":"mimo-v2.6-flash-free","choices":[{"index":0,"delta":{"content":"Summary: "}}]}',
			'data: {"id":"gen-123","model":"mimo-v2.6-flash-free","choices":[{"index":0,"delta":{"content":"Task completed successfully."}}]}',
			'data: {"id":"gen-123","model":"mimo-v2.6-flash-free","choices":[{"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":20,"total_tokens":120}}',
			"data: [DONE]",
		].join("\n\n");

		const sseResponse = new Response(sseData, {
			status: 200,
			headers: { "content-type": "text/event-stream" },
		});

		const assembledRes = await assembleSseToChatCompletionResponse(sseResponse, "mimo-v2.6-flash-free");
		assert.equal(assembledRes.status, 200);
		assert.equal(assembledRes.headers.get("content-type"), "application/json; charset=utf-8");

		const json = await assembledRes.json();
		assert.equal(json.id, "gen-123");
		assert.equal(json.model, "mimo-v2.6-flash-free");
		assert.equal(json.choices[0].message.content, "Summary: Task completed successfully.");
		assert.equal(json.choices[0].finish_reason, "stop");
		assert.equal(json.usage.total_tokens, 120);
	});

	it("installZenFetchInterceptor: 绝不拦截 /models 请求，杜绝递归循环", async () => {
		const { installZenFetchInterceptor } = require("./index.js");

		let capturedUrl: string | undefined;
		let capturedInit: RequestInit | undefined;
		const mockRes = new Response(JSON.stringify({ data: [] }), { status: 200 });

		const mockGlobal: any = {
			fetch: async (input: any, init: any) => {
				capturedUrl = String(input);
				capturedInit = init;
				return mockRes;
			},
		};

		installZenFetchInterceptor(mockGlobal);

		await mockGlobal.fetch("https://opencode.ai/zen/v1/models", {
			method: "GET",
			headers: { Authorization: "Bearer key_test" },
		});

		assert.equal(capturedUrl, "https://opencode.ai/zen/v1/models");
		assert.equal(capturedInit?.body, undefined, "/models 请求绝不注入 body");
		const headers = new Headers(capturedInit?.headers);
		assert.equal(headers.get("x-opencode-session"), null, "/models 请求绝不被包装 session 请求头");
	});

	it("installZenFetchInterceptor: 支持 Request 对象输入并完整保留 Authorization 凭证", async () => {
		const { installZenFetchInterceptor } = require("./index.js");

		let capturedUrl: string | undefined;
		let capturedInit: RequestInit | undefined;
		const mockRes = new Response(JSON.stringify({ id: "ok" }), { status: 200 });

		const mockGlobal: any = {
			fetch: async (input: any, init: any) => {
				capturedUrl = String(input);
				capturedInit = init;
				return mockRes;
			},
		};

		installZenFetchInterceptor(mockGlobal);

		const requestObj = new Request("https://opencode.ai/zen/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: "Bearer oc_sk_auth_secret",
				"X-Custom-Client": "my-client",
			},
			body: JSON.stringify({
				model: "mimo-v2.6-flash-free",
				messages: [{ role: "user", content: "hello" }],
			}),
		});

		await mockGlobal.fetch(requestObj);

		assert.equal(capturedUrl, "https://opencode.ai/zen/v1/chat/completions");
		const headers = new Headers(capturedInit?.headers);
		assert.equal(
			headers.get("Authorization"),
			"Bearer oc_sk_auth_secret",
			"Request 对象的 Authorization 必须完整保留",
		);
		assert.equal(headers.get("X-Custom-Client"), "my-client");
		assert.equal(headers.get("User-Agent"), "opencode/1.18.32 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14");
		assert.ok(headers.get("x-opencode-session")?.startsWith("ses_"));
	});

	it("installZenFetchInterceptor: Compaction 上下文超限保护（截断中间冗余消息）", async () => {
		const { installZenFetchInterceptor } = require("./index.js");

		let capturedInit: RequestInit | undefined;
		const mockRes = new Response(JSON.stringify({ id: "ok" }), { status: 200 });

		const mockGlobal: any = {
			fetch: async (_input: any, init: any) => {
				capturedInit = init;
				return mockRes;
			},
		};

		installZenFetchInterceptor(mockGlobal);

		// 构建大量超长消息 (>600k 字符)
		const longText = "x".repeat(100_000);
		const hugeMessages = [
			{ role: "system", content: "You are an assistant" },
			{ role: "user", content: "Initial goal: do task" },
			{ role: "assistant", content: longText },
			{ role: "user", content: longText },
			{ role: "assistant", content: longText },
			{ role: "user", content: longText },
			{ role: "assistant", content: longText },
			{ role: "user", content: "Summarize the above conversation" },
		];

		await mockGlobal.fetch("https://opencode.ai/zen/v1/chat/completions", {
			method: "POST",
			headers: { Authorization: "Bearer test" },
			body: JSON.stringify({
				model: "mimo-v2.6-flash-free",
				messages: hugeMessages,
			}),
		});

		const parsed = JSON.parse(String(capturedInit?.body));
		assert.ok(parsed.messages.length < hugeMessages.length, "中间过载消息必须被适度裁剪");
		assert.equal(parsed.messages[0].role, "system");
		assert.equal(parsed.messages[0].content, "You are an assistant");
		assert.equal(parsed.messages[1].content, "Initial goal: do task");
		assert.ok(
			parsed.messages[2].content.includes("Zen Guard"),
			"裁剪处必须插入 Zen Guard 提示信息",
		);
		assert.equal(
			parsed.messages[parsed.messages.length - 1].content,
			"Summarize the above conversation",
			"末尾最新总结要求必须保留",
		);
	});

	it("setActiveZenSessionId 与 getActiveZenSessionId 内存缓存有效性", () => {
		const testSes = generateZenSessionId();
		setActiveZenSessionId(testSes);
		assert.equal(getActiveZenSessionId(), testSes);

		// 过期 Session 不会被作为活跃缓存返回
		const expiredSes = generateZenSessionId(Date.now() - 35 * 60 * 1000);
		setActiveZenSessionId(expiredSes);
		assert.equal(getActiveZenSessionId(), null);

		// 清空缓存
		setActiveZenSessionId(null);
		assert.equal(getActiveZenSessionId(), null);
	});
});

describe("Compaction 压缩防护、深度上下文修剪与透明重试机制测试", () => {
	const { isCompactionOrNoToolRequest, pruneZenContext, assembleSseToChatCompletionResponse, installZenFetchInterceptor } = require("./index.js");

	it("isCompactionOrNoToolRequest: 精确识别各种形式的 Compaction / 压缩总结任务", () => {
		// 非流式请求
		assert.equal(isCompactionOrNoToolRequest({ stream: false }), true);
		// 显式 tool_choice: "none"
		assert.equal(isCompactionOrNoToolRequest({ stream: true, tool_choice: "none" }), true);
		// 含有 <conversation> 标签
		assert.equal(
			isCompactionOrNoToolRequest({
				stream: true,
				messages: [{ role: "user", content: "<conversation>\n[User]: test\n</conversation>\n\nSummarize" }],
			}),
			true,
		);
		// 含有 summarize 关键字
		assert.equal(
			isCompactionOrNoToolRequest({
				stream: true,
				messages: [{ role: "user", content: "Please summarize the conversation history" }],
			}),
			true,
		);
		// 含有 compaction 关键字
		assert.equal(
			isCompactionOrNoToolRequest({
				stream: true,
				messages: [{ role: "user", content: "Run context compaction now" }],
			}),
			true,
		);
		// 常规 Agent 对话请求，带 tools
		assert.equal(
			isCompactionOrNoToolRequest({
				stream: true,
				tools: [{ type: "function", function: { name: "bash" } }],
				messages: [{ role: "user", content: "Fix the bug in index.ts" }],
			}),
			false,
		);
	});

	it("pruneZenContext: Compaction <conversation> 标签超长内容安全修剪", () => {
		const headText = "A".repeat(30_000);
		const middleText = "B".repeat(60_000);
		const tailText = "C".repeat(60_000);
		const rawContent = `<conversation>\n${headText}${middleText}${tailText}\n</conversation>\n\nSummarize the conversation.`;

		const payload: Record<string, unknown> = {
			model: "mimo-v2.5-free",
			messages: [{ role: "user", content: rawContent }],
		};

		const modified = pruneZenContext(payload);
		assert.equal(modified, true);

		const resultMsg = (payload.messages as any[])[0].content as string;
		assert.ok(resultMsg.startsWith("<conversation>"), "以 conversation 标签开头");
		assert.ok(resultMsg.includes(headText.slice(0, 20_000)), "前置任务目标完整保留");
		assert.ok(resultMsg.includes("Zen Compaction Guard: Omitted"), "插入修剪提示");
		assert.ok(resultMsg.includes(tailText.slice(-20_000)), "末尾最新执行状态完整保留");
		assert.ok(resultMsg.endsWith("Summarize the conversation."), "尾部总结指令完好");
		assert.ok(resultMsg.length < rawContent.length, "大幅精简请求体积");
	});

	it("pruneZenContext: 单个超大 Tool 输出自动截断至 25,000 字符", () => {
		const hugeToolOutput = "LOG_LINE_DATA_".repeat(3000); // 42,000 字符
		const payload: Record<string, unknown> = {
			model: "mimo-v2.6-flash-free",
			messages: [
				{ role: "user", content: "run command" },
				{ role: "tool", content: hugeToolOutput },
			],
		};

		const modified = pruneZenContext(payload);
		assert.equal(modified, true);

		const toolMsg = (payload.messages as any[])[1].content as string;
		assert.ok(toolMsg.length < 30_000, "Tool 输出被截断在合理安全范围");
		assert.ok(toolMsg.includes("Tool output truncated to 25,000 chars"));
	});

	it("installZenFetchInterceptor: 遇 403 FreeTierError 自动轮换 Session 并透明重试成功", async () => {
		let attempt = 0;
		const capturedSessions: string[] = [];

		const mockGlobal: any = {
			fetch: async (_input: any, init: any) => {
				attempt++;
				const headers = new Headers(init?.headers);
				capturedSessions.push(headers.get("x-opencode-session") || "");

				if (attempt === 1) {
					// 第一次模拟上游返回 403 FreeTierError
					return new Response(JSON.stringify({ error: { type: "FreeTierError", message: "session rejected" } }), {
						status: 403,
						headers: { "content-type": "application/json" },
					});
				}

				// 第二次生成了新 Session 后成功返回 SSE
				const sseData = [
					'data: {"id":"retry-1","model":"mimo-v2.5-free","choices":[{"index":0,"delta":{"content":"Compacted summary."}}]}',
					'data: {"id":"retry-1","model":"mimo-v2.5-free","choices":[{"index":0,"finish_reason":"stop"}],"usage":{"total_tokens":50}}',
					"data: [DONE]",
				].join("\n\n");

				return new Response(sseData, {
					status: 200,
					headers: { "content-type": "text/event-stream" },
				});
			},
		};

		installZenFetchInterceptor(mockGlobal);

		// 模拟 Pi 发起的 compaction 请求 (非流式)
		const res = await mockGlobal.fetch("https://opencode.ai/zen/v1/chat/completions", {
			method: "POST",
			headers: { Authorization: "Bearer test_key" },
			body: JSON.stringify({
				model: "mimo-v2.5-free",
				messages: [{ role: "user", content: "<conversation>test</conversation>\n\nSummarize" }],
				stream: false,
			}),
		});

		assert.equal(res.status, 200, "Pi 最终接收到透明重试后的 200 OK，不抛 403 异常");
		assert.equal(attempt, 2, "经历了 1 次自动透明重试");
		assert.equal(capturedSessions.length, 2);
		assert.notEqual(capturedSessions[0], capturedSessions[1], "重试时自动换用全新降序 Session ID");
		assert.ok(capturedSessions[1].startsWith("ses_"), "新 Session 符合 ses_ 规范");

		const json = await res.json();
		assert.equal(json.choices[0].message.content, "Compacted summary.");
	});

	it("installZenFetchInterceptor: 遇 504 Gateway Timeout 自动退避重试成功", async () => {
		let attempt = 0;

		const mockGlobal: any = {
			fetch: async () => {
				attempt++;
				if (attempt === 1) {
					return new Response("Gateway Timeout", { status: 504 });
				}
				const sseData = [
					'data: {"id":"retry-504","model":"mimo-v2.5-free","choices":[{"index":0,"delta":{"content":"Recovered from 504."}}]}',
					'data: [DONE]',
				].join("\n\n");
				return new Response(sseData, { status: 200, headers: { "content-type": "text/event-stream" } });
			},
		};

		installZenFetchInterceptor(mockGlobal);

		const res = await mockGlobal.fetch("https://opencode.ai/zen/v1/chat/completions", {
			method: "POST",
			headers: { Authorization: "Bearer test_key" },
			body: JSON.stringify({
				model: "mimo-v2.5-free",
				messages: [{ role: "user", content: "Hello" }],
				stream: false,
			}),
		});

		assert.equal(res.status, 200);
		assert.equal(attempt, 2);
		const json = await res.json();
		assert.equal(json.choices[0].message.content, "Recovered from 504.");
	});

	it("assembleSseToChatCompletionResponse: 完整组装深度思考 reasoning_content 字段", async () => {
		const sseData = [
			'data: {"id":"think-1","model":"mimo-v2.5-free","choices":[{"index":0,"delta":{"reasoning_content":"Thinking step 1..."}}]}',
			'data: {"id":"think-1","model":"mimo-v2.5-free","choices":[{"index":0,"delta":{"reasoning_content":" Step 2 complete."}}]}',
			'data: {"id":"think-1","model":"mimo-v2.5-free","choices":[{"index":0,"delta":{"content":"Final answer."}}]}',
			'data: {"id":"think-1","model":"mimo-v2.5-free","choices":[{"index":0,"finish_reason":"stop"}],"usage":{"prompt_tokens":30,"completion_tokens":50,"total_tokens":80}}',
			"data: [DONE]",
		].join("\n\n");

		const sseRes = new Response(sseData, { status: 200, headers: { "content-type": "text/event-stream" } });
		const assembled = await assembleSseToChatCompletionResponse(sseRes, "mimo-v2.5-free");
		assert.equal(assembled.status, 200);

		const json = await assembled.json();
		assert.equal(json.choices[0].message.content, "Final answer.");
		assert.equal(json.choices[0].message.reasoning_content, "Thinking step 1... Step 2 complete.");
		assert.equal(json.usage.total_tokens, 80);
	});
});



