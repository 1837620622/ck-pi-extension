import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, describe, it } from "node:test";
import piCline, {
	CLINE_BASE_URL,
	CLINE_CLIENT_HEADERS,
	CLINE_DEFAULT_KEY,
	CLINE_PROVIDER_ID,
	formatClineModelCard,
	formatClineModelsTable,
	formatTokens,
	getClineProxyStatus,
	getMessageText,
	getStoredClineApiKey,
	inferClineModelCapabilities,
	installClineFetchInterceptor,
	isClineModelTarget,
	KNOWN_CLINE_FREE_MODELS,
	pruneClineContext,
	registerClineProviderToPi,
	addCustomClineModel,
	loadCustomClineModels,
	resolveFreeModelId,
	startClineProxyServer,
	stopClineProxyServer,
	syncClineConfiguration,
	updateCcSwitchDbForCline,
	updateMessageText,
	sanitizePiModelDefinition,
} from "./index.js";

const globalTestDir = mkdtempSync(join(tmpdir(), "cline-global-test-"));
const globalModelsPath = join(globalTestDir, "models.json");
const globalAuthPath = join(globalTestDir, "auth.json");
const globalDbPath = join(globalTestDir, "cc-switch.db");
const globalCustomModelsPath = join(globalTestDir, "cline-models.json");

writeFileSync(globalModelsPath, JSON.stringify({ providers: { relayhub: { baseUrl: "https://relay.example.com", models: [] } } }, null, 2));
writeFileSync(globalAuthPath, JSON.stringify({ relayhub: { type: "api_key", key: "existing_key" } }, null, 2));
const globalDb = new DatabaseSync(globalDbPath);
globalDb.exec("CREATE TABLE providers (id TEXT PRIMARY KEY, name TEXT, type TEXT, config TEXT);");
globalDb.close();

process.env.TEST_PI_MODELS_PATH = globalModelsPath;
process.env.TEST_PI_AUTH_PATH = globalAuthPath;
process.env.TEST_CC_SWITCH_DB_PATH = globalDbPath;
process.env.TEST_CLINE_CUSTOM_MODELS_PATH = globalCustomModelsPath;

describe("Cline 模型注册表与能力推断测试", () => {
	it("包含全部已确认的常用免费模型且计费均为 0", () => {
		const models = Object.values(KNOWN_CLINE_FREE_MODELS);
		assert.ok(models.length >= 10, "已知免费模型数量不少于 10 款");

		const freeModels = models.filter((m) => m.isFree);
		assert.ok(freeModels.length >= 10, "免费模型标志必须为 true");

		for (const m of freeModels) {
			assert.equal(m.cost.input, 0);
			assert.equal(m.cost.output, 0);
			assert.equal(m.cost.cacheRead, 0);
			assert.equal(m.cost.cacheWrite, 0);
			assert.ok(m.contextWindow > 0);
			assert.ok(m.maxTokens <= 32768, "maxTokens 必须符合安全上限");
		}
	});

	it("inferClineModelCapabilities: 精准识别已知与未知免费模型", () => {
		// 已知模型
		const ling = inferClineModelCapabilities("inclusionai/ling-3.0-flash-sante:free");
		assert.equal(ling.isFree, true);
		assert.equal(ling.contextWindow, 262144);
		assert.equal(ling.reasoning, true);

		// 已下架/陷阱模型被安全识别为非免费
		const deadFin = inferClineModelCapabilities("inclusionai/ling-3.0-flash-fin:free");
		assert.equal(deadFin.isFree, false);
		const deadBunny = inferClineModelCapabilities("stealth/space-bunny-alpha");
		assert.equal(deadBunny.isFree, false);

		const ultra = inferClineModelCapabilities("nvidia/nemotron-3-ultra-550b-a55b:free");
		assert.equal(ultra.isFree, true);
		assert.equal(ultra.contextWindow, 1000000);

		// 未知外部免费模型自适应推断
		const dynamicFree = inferClineModelCapabilities("my-org/custom-coder-v1:free", {
			context_length: 524288,
			max_tokens: 16384,
		});
		assert.equal(dynamicFree.isFree, true);
		assert.equal(dynamicFree.contextWindow, 524288);
		assert.equal(dynamicFree.maxTokens, 16384);
		assert.equal(dynamicFree.cost.input, 0);

		// 远端 pricing 为 0 的未带 free 标识模型（0 额度扣费模型）
		const zeroPriceModel = inferClineModelCapabilities("custom-ai/future-stealth-router", {
			context_length: 1000000,
			pricing: { prompt: "0", completion: "0", request: "0" },
		});
		assert.equal(zeroPriceModel.isFree, true);
		assert.equal(zeroPriceModel.cost.input, 0);

		// credit_cost 为 0 的免扣费模型
		const zeroCreditModel = inferClineModelCapabilities("custom-ai/free-experimental-coder", {
			context_length: 256000,
			credit_cost: 0,
		});
		assert.equal(zeroCreditModel.isFree, true);
		assert.equal(zeroCreditModel.cost.input, 0);

		// 未知付费模型
		const paid = inferClineModelCapabilities("anthropic/claude-3-5-sonnet", {
			context_length: 200000,
			pricing: { prompt: "0.003", completion: "0.015" },
		});
		assert.equal(paid.isFree, false);
		assert.ok(paid.cost.input > 0);
	});

	it("resolveFreeModelId: 正确剥离前缀、解析短别名并自动追加 :free 保护", () => {
		// 剥离前缀
		assert.equal(resolveFreeModelId("cline/inclusionai/ling-3.0-flash-sante:free"), "inclusionai/ling-3.0-flash-sante:free");
		assert.equal(resolveFreeModelId("cline-free/openrouter/free"), "openrouter/free");

		// 快捷别名
		assert.equal(resolveFreeModelId("free"), "openrouter/free");
		assert.equal(resolveFreeModelId("fusion"), "openrouter/free");
		assert.equal(resolveFreeModelId("code"), "openrouter/free");
		assert.equal(resolveFreeModelId("bunny"), "openrouter/free");
		assert.equal(resolveFreeModelId("space-bunny"), "openrouter/free");
		assert.equal(resolveFreeModelId("space-bunny-alpha"), "openrouter/free");
		assert.equal(resolveFreeModelId("qwen"), "openrouter/free");
		assert.equal(resolveFreeModelId("ling"), "inclusionai/ling-3.0-flash-sante:free");
		assert.equal(resolveFreeModelId("sante"), "inclusionai/ling-3.0-flash-sante:free");
		assert.equal(resolveFreeModelId("550b"), "nvidia/nemotron-3-ultra-550b-a55b:free");
		assert.equal(resolveFreeModelId("reasoning"), "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free");
		assert.equal(resolveFreeModelId("laguna"), "poolside/laguna-s-2.1:free");
		assert.equal(resolveFreeModelId("dots"), "dots-studio/dots-3-note-preview:free");
		assert.equal(resolveFreeModelId("apodex"), "apodex/apodex-1.1-mini:free");

		// 自动追加 :free 保护
		assert.equal(resolveFreeModelId("inclusionai/ling-3.0-flash-sante"), "inclusionai/ling-3.0-flash-sante:free");
		assert.equal(resolveFreeModelId("nvidia/nemotron-3.5-lightning"), "nvidia/nemotron-3.5-lightning:free");

		// 默认兜底
		assert.equal(resolveFreeModelId(""), "openrouter/free");
		assert.equal(resolveFreeModelId(undefined), "openrouter/free");
	});

	it("格式化工具输出易读且精确的 Token 数量与卡片", () => {
		assert.equal(formatTokens(1_000_000), "1M");
		assert.equal(formatTokens(262_144), "262k");
		assert.equal(formatTokens(32_768), "33k");
		assert.equal(formatTokens(500), "500");

		const card = formatClineModelCard(KNOWN_CLINE_FREE_MODELS["inclusionai/ling-3.0-flash-sante:free"]);
		assert.ok(card.includes("inclusionai/ling-3.0-flash-sante:free"));
		assert.ok(card.includes("[FREE]"));
		assert.ok(card.includes("[THINK]"));

		const table = formatClineModelsTable(Object.values(KNOWN_CLINE_FREE_MODELS));
		assert.ok(table.includes("Cline 零额度模型注册表"));
	});
});

describe("Cline 本地反向代理服务器测试", () => {
	const TEST_PROXY_PORT = 4199;

	after(async () => {
		await stopClineProxyServer();
	});

	it("成功启动并在 /health 返回服务状态与免费模型清单", async () => {
		const res = await startClineProxyServer({ port: TEST_PROXY_PORT });
		assert.equal(res.port, TEST_PROXY_PORT);
		assert.equal(res.url, `http://127.0.0.1:${TEST_PROXY_PORT}/v1`);

		const status = getClineProxyStatus();
		assert.equal(status.running, true);
		assert.equal(status.port, TEST_PROXY_PORT);

		const healthRes = await fetch(`http://127.0.0.1:${TEST_PROXY_PORT}/health`);
		assert.equal(healthRes.status, 200);
		const json = await healthRes.json();
		assert.equal(json.status, "ok");
		assert.equal(json.service, "cline-reverse-proxy");
		assert.ok(json.freeModelsCount >= 10);
	});

	it("/v1/models 标准端点返回符合 OpenAI 规范的模型列表", async () => {
		const modelsRes = await fetch(`http://127.0.0.1:${TEST_PROXY_PORT}/v1/models`);
		assert.equal(modelsRes.status, 200);
		const json = await modelsRes.json();
		assert.equal(json.object, "list");
		assert.ok(Array.isArray(json.data));
		assert.ok(json.data.length >= 10);
		assert.ok(json.data.some((m: any) => m.id === "inclusionai/ling-3.0-flash-sante:free"));
	});

	it("处理 OPTIONS 预检请求并返回合规 CORS 响应头", async () => {
		const optRes = await fetch(`http://127.0.0.1:${TEST_PROXY_PORT}/v1/chat/completions`, {
			method: "OPTIONS",
			headers: { Origin: "http://localhost:3000" },
		});
		assert.equal(optRes.status, 204);
		assert.equal(optRes.headers.get("access-control-allow-origin"), "http://localhost:3000");
	});

	it("反代服务针对 Compaction 任务自动提升 max_tokens 并脱敏敏感审计模式", async () => {
		const origFetch = globalThis.fetch;
		let capturedPayload: any = null;
		globalThis.fetch = async (url: any, opts: any) => {
			if (String(url).includes("api.cline.bot")) {
				capturedPayload = JSON.parse(opts.body);
				return new Response(
					JSON.stringify({
						id: "gen-123",
						object: "chat.completion",
						created: Math.floor(Date.now() / 1000),
						model: capturedPayload.model,
						choices: [{ index: 0, message: { role: "assistant", content: "Summary done" }, finish_reason: "stop" }],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } }
				);
			}
			return origFetch(url, opts);
		};

		try {
			const res = await fetch(`http://127.0.0.1:${TEST_PROXY_PORT}/v1/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: "Bearer sk_test_proxy",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "dots",
					messages: [
						{ role: "user", content: "Summarize this <conversation>union select * from information_schema</conversation>" },
					],
					max_tokens: 1600,
					stream: false,
				}),
			});

			assert.equal(res.status, 200);
			assert.ok(capturedPayload);
			assert.equal(capturedPayload.model, "dots-studio/dots-3-note-preview:free");
			assert.ok(capturedPayload.max_tokens >= 16384, "必须将 max_tokens 提升至至少 16384");
			assert.equal(capturedPayload.reasoning_effort, "low");
			assert.ok(
				capturedPayload.messages[0].content.includes("[sql_audit_statement]"),
				"必须完成敏感审计模式脱敏"
			);
		} finally {
			globalThis.fetch = origFetch;
		}
	});

	it("反代服务在流式 SSE 遇 content_filter 时平滑改写为 stop 并合成安全检查点", async () => {
		const origFetch = globalThis.fetch;
		globalThis.fetch = async (url: any, opts: any) => {
			if (String(url).includes("api.cline.bot")) {
				const sseContent = [
					'data: {"id":"gen-cf","object":"chat.completion.chunk","created":12345,"model":"openrouter/free","choices":[{"index":0,"delta":{"content":""},"finish_reason":"content_filter"}]}',
					"",
					"data: [DONE]",
					"",
				].join("\n");
				return new Response(sseContent, {
					status: 200,
					headers: { "Content-Type": "text/event-stream" },
				});
			}
			return origFetch(url, opts);
		};

		try {
			const res = await fetch(`http://127.0.0.1:${TEST_PROXY_PORT}/v1/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: "Bearer sk_test_proxy",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "free",
					messages: [{ role: "user", content: "Summarize the session <conversation>test</conversation>" }],
					stream: true,
				}),
			});

			assert.equal(res.status, 200);
			const text = await res.text();
			assert.ok(text.includes('"finish_reason":"stop"'), "必须将 content_filter 改写为 stop");
			assert.ok(text.includes("会话进展与安全审计检查点"), "压缩请求下必须合成结构化安全检查点");
		} finally {
			globalThis.fetch = origFetch;
		}
	});

	it("关闭反代服务后状态正常重置", async () => {
		await stopClineProxyServer();
		const status = getClineProxyStatus();
		assert.equal(status.running, false);
	});
});

describe("配置同步与落盘逻辑测试", () => {
	let tempDir: string;
	let tempModelsPath: string;
	let tempAuthPath: string;
	let tempDbPath: string;

	before(() => {
		tempDir = mkdtempSync(join(tmpdir(), "cline-sync-test-"));
		tempModelsPath = join(tempDir, "models.json");
		tempAuthPath = join(tempDir, "auth.json");
		tempDbPath = join(tempDir, "cc-switch.db");

		process.env.TEST_PI_MODELS_PATH = tempModelsPath;
		process.env.TEST_PI_AUTH_PATH = tempAuthPath;
		process.env.TEST_CC_SWITCH_DB_PATH = tempDbPath;

		// 初始化已有的其他供应商配置
		writeFileSync(
			tempModelsPath,
			JSON.stringify(
				{
					providers: {
						relayhub: { baseUrl: "https://relay.example.com", models: [] },
					},
				},
				null,
				2,
			),
		);

		writeFileSync(
			tempAuthPath,
			JSON.stringify(
				{
					relayhub: { type: "api_key", key: "existing_key" },
				},
				null,
				2,
			),
		);

		const db = new DatabaseSync(tempDbPath);
		db.exec("CREATE TABLE providers (id TEXT PRIMARY KEY, name TEXT, type TEXT, config TEXT);");
		db.close();
	});

	after(() => {
		process.env.TEST_PI_MODELS_PATH = globalModelsPath;
		process.env.TEST_PI_AUTH_PATH = globalAuthPath;
		process.env.TEST_CC_SWITCH_DB_PATH = globalDbPath;
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("getStoredClineApiKey 支持读取环境变量与兜底默认 Key", () => {
		const originalEnv = process.env.CLINE_API_KEY;
		try {
			process.env.CLINE_API_KEY = "sk_custom_env_key";
			assert.equal(getStoredClineApiKey("/non/existent", "/non/existent"), "sk_custom_env_key");
		} finally {
			if (originalEnv === undefined) {
				delete process.env.CLINE_API_KEY;
			} else {
				process.env.CLINE_API_KEY = originalEnv;
			}
		}

		// 兜底默认 key
		assert.equal(getStoredClineApiKey("/non/existent", "/non/existent"), CLINE_DEFAULT_KEY);
	});

	it("syncClineConfiguration 原子写入 models.json 与 auth.json 并保留其他 Provider", async () => {
		const res = await syncClineConfiguration({
			modelsPath: tempModelsPath,
			authPath: tempAuthPath,
			ccSwitchDbPath: tempDbPath,
			apiKey: "sk_test_sync_key_12345",
			silent: true,
		});

		assert.equal(res.success, true);
		assert.equal(res.provider, "cline-free");
		assert.equal(res.apiKey, "sk_test_sync_key_12345");
		assert.ok(res.modelCount >= 10);

		// 验证 models.json 保留其他 Provider 并正确新增 cline-free
		const modelsData = JSON.parse(readFileSync(tempModelsPath, "utf-8"));
		assert.ok(modelsData.providers.relayhub, "保留已有 relayhub 供应商");
		assert.ok(modelsData.providers["cline-free"], "成功写入 cline-free 供应商");
		assert.equal(modelsData.providers["cline-free"].apiKey, "sk_test_sync_key_12345");
		assert.equal(modelsData.providers["cline-free"].headers["User-Agent"], "Cline/4.1.16");
		assert.equal(modelsData.providers["cline-free"].headers["x-client-type"], "cline-vscode");

		// 验证模型列表绝无重复，且无短别名污染
		const clineModels = modelsData.providers["cline-free"].models;
		const modelIds = clineModels.map((m: any) => m.id);
		const uniqueIds = new Set(modelIds);
		assert.equal(modelIds.length, uniqueIds.size, "cline-free 注册的模型 ID 必须完全唯一，绝无重复别名干扰");
		assert.ok(!uniqueIds.has("bunny"), "短别名 bunny 绝不可作为独立模型注册");
		assert.ok(!uniqueIds.has("550b"), "短别名 550b 绝不可作为独立模型注册");
		assert.ok(uniqueIds.has("inclusionai/ling-3.0-flash-sante:free"), "必须包含规范模型 ID inclusionai/ling-3.0-flash-sante:free");

		// 验证 auth.json
		const authData = JSON.parse(readFileSync(tempAuthPath, "utf-8"));
		assert.equal(authData.relayhub.key, "existing_key");
		assert.equal(authData["cline-free"].key, "sk_test_sync_key_12345");

		// 验证 CC-Switch SQLite 数据库
		const db = new DatabaseSync(tempDbPath);
		const row = db.prepare("SELECT id, config FROM providers WHERE id = 'cline-free'").get() as any;
		db.close();
		assert.ok(row, "CC-Switch 中成功插入 cline-free 供应商");
		const parsedConfig = JSON.parse(row.config);
		assert.equal(parsedConfig.id, "cline-free");
		assert.equal(parsedConfig.apiKey, "sk_test_sync_key_12345");
	});
});

describe("上下文修剪与防护机制测试", () => {
	it("getMessageText 与 updateMessageText 兼容 string 与块数组", () => {
		const strMsg = { role: "user", content: "simple text" };
		assert.equal(getMessageText(strMsg.content), "simple text");
		updateMessageText(strMsg, "updated text");
		assert.equal(strMsg.content, "updated text");

		const arrMsg = {
			role: "user",
			content: [{ type: "text", text: "block text 1" }, { type: "text", text: "block text 2" }],
		};
		assert.equal(getMessageText(arrMsg.content), "block text 1\nblock text 2");
		updateMessageText(arrMsg, "updated block text");
		assert.deepEqual(arrMsg.content, [{ type: "text", text: "updated block text" }]);
	});

	it("pruneClineContext: 单个超大 Tool 输出自动截断至 25,000 字符", () => {
		const hugeOutput = "LOG_LINE_DATA_".repeat(3000); // 42,000 字符
		const payload = {
			model: "inclusionai/ling-3.0-flash-fin:free",
			messages: [
				{ role: "user", content: "run command" },
				{ role: "tool", content: hugeOutput },
			],
		};

		const modified = pruneClineContext(payload);
		assert.equal(modified, true);

		const toolMsg = payload.messages[1].content as string;
		assert.ok(toolMsg.length < 30_000);
		assert.ok(toolMsg.includes("Tool output truncated to 25,000 chars"));
	});

	it("pruneClineContext: Compaction <conversation> 标签超长内容安全修剪", () => {
		const headText = "HEAD_".repeat(6000); // 30,000 字符
		const midText = "MID_".repeat(20000); // 80,000 字符
		const tailText = "TAIL_".repeat(12000); // 60,000 字符
		const rawContent = `<conversation>\n${headText}${midText}${tailText}\n</conversation>\n\nSummarize the history.`;

		const payload = {
			model: "inclusionai/ling-3.0-flash-fin:free",
			messages: [{ role: "user", content: rawContent }],
		};

		const modified = pruneClineContext(payload);
		assert.equal(modified, true);

		const resultText = payload.messages[0].content as string;
		assert.ok(resultText.startsWith("<conversation>"));
		assert.ok(resultText.includes("Cline Compaction Guard: Omitted"));
		assert.ok(resultText.endsWith("Summarize the history."));
		assert.ok(resultText.length < rawContent.length);
	});

	it("pruneClineContext: Compaction <previous-summary> 标签超长内容安全修剪", () => {
		const prevSummaryBody = "OLD_SUMMARY_".repeat(4000); // 48,000 字符
		const rawContent = `<conversation>\nTask started\n</conversation>\n\n<previous-summary>\n${prevSummaryBody}\n</previous-summary>\n\nSummarize.`;

		const payload = {
			model: "inclusionai/ling-3.0-flash-fin:free",
			messages: [{ role: "user", content: rawContent }],
		};

		const modified = pruneClineContext(payload);
		assert.equal(modified, true);

		const resultText = payload.messages[0].content as string;
		assert.ok(resultText.includes("<previous-summary>"));
		assert.ok(resultText.includes("Cline Compaction Guard: Omitted"));
		assert.ok(resultText.endsWith("Summarize."));
	});
});

describe("Extension 钩子、命令与拦截测试", () => {
	it("严格隔离：isClineModelTarget 仅对 cline 模型生效，不干涉其他供应商", () => {
		assert.equal(isClineModelTarget({ provider: "cline", id: "ling-3.0-flash-fin:free" }), true);
		assert.equal(isClineModelTarget({ provider: "cline-free", id: "openrouter/free" }), true);
		assert.equal(isClineModelTarget(undefined, "inclusionai/ling-3.0-flash-fin:free"), true);
		assert.equal(isClineModelTarget(undefined, "deepseek/deepseek-v4.1-flash"), true);
		assert.equal(isClineModelTarget(undefined, "stealth/space-bunny-alpha"), true);
		assert.equal(isClineModelTarget(undefined, "google/gemma-4-26b-a4b-it:free"), true);
		assert.equal(isClineModelTarget(undefined, "apodex/apodex-1.1-mini:free"), true);
		assert.equal(isClineModelTarget(undefined, "poolside/laguna-s-2.1:free"), true);

		// 绝不能干涉其他供应商
		assert.equal(isClineModelTarget({ provider: "relayhub", id: "deepseek-v4.1-flash" }), false);
		assert.equal(isClineModelTarget({ provider: "relayhub", id: "deepseek/deepseek-v4.1-flash" }), false);
		assert.equal(isClineModelTarget({ provider: "relayhub", id: "inclusionai/ling-3.0-flash-fin:free" }), false);
		assert.equal(isClineModelTarget({ provider: "opencode-zen-free", id: "mimo-v2.5-free" }), false);
		assert.equal(isClineModelTarget({ provider: "anthropic", id: "claude-3-7-sonnet" }), false);
	});

	it("before_provider_headers 自动补全 8 个伪装请求头", () => {
		const handlers: Record<string, Function[]> = {};
		const commands: Record<string, any> = {};
		const mockPi: any = {
			registerProvider: () => {},
			registerCommand: (name: string, def: any) => {
				commands[name] = def;
			},
			on: (event: string, fn: Function) => {
				handlers[event] = handlers[event] || [];
				handlers[event].push(fn);
			},
		};

		piCline(mockPi);
		assert.ok(handlers["before_provider_headers"]?.length > 0);
		assert.ok(handlers["before_provider_request"]?.length > 0);
		assert.ok(commands["cline"]);

		const headerEvent = { headers: {} as Record<string, string> };
		handlers["before_provider_headers"][0](headerEvent, {
			model: { provider: "cline", id: "inclusionai/ling-3.0-flash-fin:free" },
		});

		assert.equal(headerEvent.headers["User-Agent"], "Cline/4.1.16");
		assert.equal(headerEvent.headers["x-client-type"], "cline-vscode");
		assert.equal(headerEvent.headers["x-platform"], "vscode");
		assert.equal(headerEvent.headers["http-referer"], "https://cline.bot");
		assert.equal(headerEvent.headers["x-client-version"], "4.1.16");
	});

	it("before_provider_request 钳位超大 max_tokens 并注入防死循环惩罚", () => {
		const handlers: Record<string, Function[]> = {};
		const mockPi: any = {
			registerProvider: () => {},
			registerCommand: () => {},
			on: (event: string, fn: Function) => {
				handlers[event] = handlers[event] || [];
				handlers[event].push(fn);
			},
		};

		piCline(mockPi);

		const runawayEvent = {
			payload: {
				model: "inclusionai/ling-3.0-flash-fin:free",
				messages: [],
				max_tokens: 128000,
			},
		};

		const sanitized = handlers["before_provider_request"][0](runawayEvent, {
			model: { provider: "cline", id: "inclusionai/ling-3.0-flash-fin:free" },
		});

		assert.equal(sanitized.max_tokens, 32768, "超长 max_tokens 必须被钳位至 32768");
		assert.equal(sanitized.frequency_penalty, 0.05, "必须注入防死循环轻微惩罚");
	});

	it("installClineFetchInterceptor 拦截 api.cline.bot 并自动补齐请求头", async () => {
		let capturedUrl: string | undefined;
		let capturedInit: RequestInit | undefined;
		const mockRes = new Response(JSON.stringify({ ok: true }), { status: 200 });

		const mockGlobal: any = {
			fetch: async (input: any, init: any) => {
				capturedUrl = String(input);
				capturedInit = init;
				return mockRes;
			},
		};

		const prevKey = process.env.CLINE_API_KEY;
		try {
			process.env.CLINE_API_KEY = "sk_interceptor_test_key_12345";
			installClineFetchInterceptor(mockGlobal);

			await mockGlobal.fetch("https://api.cline.bot/api/v1/chat/completions", {
				method: "POST",
				body: JSON.stringify({
					model: "inclusionai/ling-3.0-flash-fin:free",
					messages: [{ role: "user", content: "test" }],
				}),
			});

			assert.equal(capturedUrl, "https://api.cline.bot/api/v1/chat/completions");
			const headers = new Headers(capturedInit?.headers);
			assert.equal(headers.get("User-Agent"), "Cline/4.1.16");
			assert.equal(headers.get("x-client-type"), "cline-vscode");
			assert.ok(headers.get("Authorization")?.startsWith("Bearer sk_"));
		} finally {
			if (prevKey === undefined) {
				delete process.env.CLINE_API_KEY;
			} else {
				process.env.CLINE_API_KEY = prevKey;
			}
		}
	});

	it("installClineFetchInterceptor 自动解包上游 data.choices 并注入 reasoning_content", async () => {
		const upstreamWrappedBody = {
			data: {
				id: "gen-12345",
				choices: [
					{
						index: 0,
						message: {
							role: "assistant",
							content: "Hello from unwrapped Cline!",
							reasoning: "Thinking about greeting...",
						},
						finish_reason: "stop",
					},
				],
			},
			success: true,
		};

		const mockGlobal: any = {
			fetch: async () => {
				return new Response(JSON.stringify(upstreamWrappedBody), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		};

		installClineFetchInterceptor(mockGlobal);

		const res = await mockGlobal.fetch("https://api.cline.bot/api/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "cline/inclusionai/ling-3.0-flash-fin",
				messages: [{ role: "user", content: "test" }],
			}),
		});

		const json = await res.json();
		// 校验根节点直接拥有 choices，无 data 包装
		assert.ok(Array.isArray(json.choices), "解包后根对象必须直接包含 choices 数组");
		assert.equal(json.choices[0].message.content, "Hello from unwrapped Cline!");
		assert.equal(json.choices[0].message.reasoning_content, "Thinking about greeting...");
	});

	it("/cline 命令执行: status, free, key 指令响应正常", async () => {
		const commands: Record<string, any> = {};
		const mockPi: any = {
			registerProvider: () => {},
			registerCommand: (name: string, def: any) => {
				commands[name] = def;
			},
			on: () => {},
		};

		piCline(mockPi);
		const clineCmd = commands["cline"];
		assert.ok(clineCmd);

		// 1. /cline status
		const statusOutput = await clineCmd.handler("status", {
			model: { provider: "cline", id: "inclusionai/ling-3.0-flash-fin:free" },
		});
		assert.ok(statusOutput.includes("Cline 运行状态"));
		assert.ok(statusOutput.includes("API Key"));
		assert.ok(statusOutput.includes("常用指令"));

		// 1.1 未配置 Key 时无参 /cline 触发友好提示
		const noKeyOutput = await clineCmd.handler("", {});
		assert.ok(noKeyOutput.includes("尚未配置 API Key"));

		// 2. /cline free
		const freeOutput = await clineCmd.handler("free", {});
		assert.ok(freeOutput.includes("Cline 零额度模型注册表"));

		// 3. /cline key
		const keyOutput = await clineCmd.handler("key sk_test_new_key_9999", {});
		assert.ok(keyOutput.includes("已更新并同步"));

		// 4. /cline proxy status
		const proxyOutput = await clineCmd.handler("proxy status", {});
		assert.ok(proxyOutput.includes("Cline 本地反代"));

		// 5. /cline ping (默认 0 Token 0 扣费探测)
		const pingOutput = await clineCmd.handler("ping", {});
		assert.ok(pingOutput.includes("连通性"));

		// 6. /cline add <modelId> [name] (自定义免费模型登记)
		const addOutput = await clineCmd.handler("add stealth/future-bunny-next 未来兔子测试版", {});
		assert.ok(addOutput.includes("已成功登记新模型至本地模型库"));
		assert.ok(addOutput.includes("stealth/future-bunny-next"));

		// 7. /cline model <modelId>
		const modelOutput = await clineCmd.handler("model stealth/future-bunny-next", {});
		assert.ok(modelOutput.includes("已成功切换至 Cline 模型") || modelOutput.includes("stealth/future-bunny-next"));
	});

	it("loadCustomClineModels 与 addCustomClineModel: 支持持久化与动态发现自定义免费模型", () => {
		const customTestPath = join(globalTestDir, "test-custom-cline-models.json");
		const added = addCustomClineModel("stealth/test-router-model", { name: "Test Router (Free)" }, customTestPath);
		assert.equal(added.id, "stealth/test-router-model");
		assert.equal(added.isFree, true);
		assert.equal(added.contextWindow, 1000000);
		assert.equal(added.cost.input, 0);

		const loaded = loadCustomClineModels(customTestPath);
		assert.equal(loaded.length, 1);
		assert.equal(loaded[0].id, "stealth/test-router-model");
		assert.equal(loaded[0].name, "Test Router (Free)");
	});

	it("installClineFetchInterceptor 遭遇 500 异常时保持同模型重试（绝不擅自降级模型）", async () => {
		const requestLog: string[] = [];
		let attempts = 0;
		const mockGlobal: any = {
			fetch: async (input: any, init: any) => {
				const body = JSON.parse(init.body);
				requestLog.push(body.model);
				attempts++;
				if (attempts === 1) {
					// 模拟第一次主模型服务遭遇临时 502 Bad Gateway
					return new Response(JSON.stringify({ error: "Upstream 502 Bad Gateway" }), {
						status: 502,
						headers: { "Content-Type": "application/json" },
					});
				}
				// 模拟第二次同模型指数退避重试成功
				return new Response(
					JSON.stringify({
						data: {
							choices: [{ message: { role: "assistant", content: "Same Model Retry Success!" } }],
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			},
		};

		installClineFetchInterceptor(mockGlobal);

		const res = await mockGlobal.fetch("https://api.cline.bot/api/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
				messages: [{ role: "user", content: "test" }],
			}),
		});

		assert.equal(res.status, 200);
		const json = await res.json();
		assert.equal(json.choices[0].message.content, "Same Model Retry Success!");
		assert.equal(requestLog.length, 2);
		assert.equal(requestLog[0], "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free");
		assert.equal(requestLog[1], "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "失败重试必须保持同一高品质模型，绝不降级或替换模型");
	});

	it("installClineFetchInterceptor 遭遇 Provider returned an empty response SSE 错误帧时自动同模型重试并在成功后正常返回", async () => {
		let attempts = 0;
		const mockGlobal: any = {
			fetch: async () => {
				attempts++;
				if (attempts < 3) {
					// 前 2 次返回伪 200 SSE 但携带 Provider returned an empty response 错误帧
					const errorChunk = `data: {"error": {"message": "Provider returned an empty response", "code": 502}}\n\n`;
					const stream = new ReadableStream({
						start(controller) {
							controller.enqueue(new TextEncoder().encode(errorChunk));
							controller.close();
						},
					});
					return new Response(stream, {
						status: 200,
						headers: { "Content-Type": "text/event-stream" },
					});
				}

				// 第 3 次同模型重试成功，输出有效响应
				const okChunk = `data: {"id":"gen-test-ok","choices":[{"index":0,"delta":{"content":"Success after empty response retry!"}}]}\n\ndata: [DONE]\n\n`;
				const stream = new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(okChunk));
						controller.close();
					},
				});
				return new Response(stream, {
					status: 200,
					headers: { "Content-Type": "text/event-stream" },
				});
			},
		};

		installClineFetchInterceptor(mockGlobal);

		const res = await mockGlobal.fetch("https://api.cline.bot/api/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "stealth/space-bunny-alpha",
				messages: [{ role: "user", content: "test" }],
				stream: true,
			}),
		});

		assert.equal(res.status, 200);
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let totalText = "";
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			totalText += decoder.decode(value);
		}

		assert.equal(attempts, 3, "必须经历 2 次重试并在第 3 次成功返回");
		assert.ok(totalText.includes("Success after empty response retry!"));
		assert.ok(!totalText.includes("供应商节点异常"));
	});

	it("installClineFetchInterceptor 遭遇 Provider returned an empty response 连续 3 次重试耗尽后合成为供应商节点异常提示", async () => {
		let attempts = 0;
		const mockGlobal: any = {
			fetch: async () => {
				attempts++;
				// 始终返回 Provider returned an empty response
				const errorChunk = `data: {"error": {"message": "Provider returned an empty response", "code": 502}}\n\n`;
				const stream = new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(errorChunk));
						controller.close();
					},
				});
				return new Response(stream, {
					status: 200,
					headers: { "Content-Type": "text/event-stream" },
				});
			},
		};

		installClineFetchInterceptor(mockGlobal);

		const res = await mockGlobal.fetch("https://api.cline.bot/api/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "openrouter/fusion",
				messages: [{ role: "user", content: "test" }],
				stream: true,
			}),
		});

		assert.equal(res.status, 200);
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let totalText = "";
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			totalText += decoder.decode(value);
		}

		// 初始 1 次 + 最多 3 次重试 = 共 4 次尝试
		assert.equal(attempts, 4, "最多进行 3 次重试（共 4 次尝试）");
		assert.ok(
			totalText.includes("[!][Cline 供应商节点异常: Provider returned an empty response，请尝试重试或切换其他免费模型]"),
			"重试耗尽后合成为标准供应商节点异常指引提示",
		);
	});

	it("installClineFetchInterceptor 遭遇 JSON 格式 Provider returned an empty response 时同样自动重试", async () => {
		let attempts = 0;
		const mockGlobal: any = {
			fetch: async () => {
				attempts++;
				if (attempts === 1) {
					return new Response(
						JSON.stringify({ error: { message: "Provider returned an empty response", code: 502 } }),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}
				return new Response(
					JSON.stringify({
						choices: [{ message: { role: "assistant", content: "JSON retry success" } }],
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			},
		};

		installClineFetchInterceptor(mockGlobal);

		const res = await mockGlobal.fetch("https://api.cline.bot/api/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "openrouter/free",
				messages: [{ role: "user", content: "test" }],
				stream: false,
			}),
		});

		assert.equal(res.status, 200);
		const json = await res.json();
		assert.equal(attempts, 2);
		assert.equal(json.choices[0].message.content, "JSON retry success");
	});

	it("installClineFetchInterceptor 在遇到包含多轮 OpenRouter processing keepalive 注释后才出现 Provider returned an empty response 时依然能正确捕获并自动重试 3 次", async () => {
		let attempts = 0;
		const mockGlobal: any = {
			fetch: async () => {
				attempts++;
				if (attempts < 4) {
					// 前 3 次请求：模拟真实 OpenRouter 场景，先发送 4 个 keepalive 注释包，第 5 包才出现 empty response 报错
					const stream = new ReadableStream({
						start(controller) {
							const encoder = new TextEncoder();
							controller.enqueue(encoder.encode(": OPENROUTER PROCESSING\n\n"));
							controller.enqueue(encoder.encode(": OPENROUTER PROCESSING\n\n"));
							controller.enqueue(encoder.encode(": OPENROUTER PROCESSING\n\n"));
							controller.enqueue(encoder.encode(": OPENROUTER PROCESSING\n\n"));
							controller.enqueue(
								encoder.encode(
									`data: {"error": {"message": "Provider returned an empty response", "code": 502}}\n\n`,
								),
							);
							controller.close();
						},
					});
					return new Response(stream, {
						status: 200,
						headers: { "Content-Type": "text/event-stream" },
					});
				}

				// 第 4 次重试成功（第 3 次重试命中）：返回正常数据流
				const stream = new ReadableStream({
					start(controller) {
						const encoder = new TextEncoder();
						controller.enqueue(encoder.encode(": OPENROUTER PROCESSING\n\n"));
						controller.enqueue(
							encoder.encode(
								`data: {"id":"chatcmpl-test","choices":[{"index":0,"delta":{"content":"Success after delayed keepalive error!"},"finish_reason":null}]}\n\n`,
							),
						);
						controller.enqueue(
							encoder.encode(
								`data: {"id":"chatcmpl-test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
							),
						);
						controller.enqueue(encoder.encode("data: [DONE]\n\n"));
						controller.close();
					},
				});
				return new Response(stream, {
					status: 200,
					headers: { "Content-Type": "text/event-stream" },
				});
			},
		};

		installClineFetchInterceptor(mockGlobal);

		const res = await mockGlobal.fetch("https://api.cline.bot/api/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "stealth/space-bunny-alpha",
				messages: [{ role: "user", content: "hello" }],
				stream: true,
			}),
		});

		assert.equal(res.status, 200);
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let totalText = "";
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			totalText += decoder.decode(value);
		}

		assert.equal(attempts, 4, "前 3 次遭遇带 processing 的 empty response 必须全部触发重试，第 4 次尝试成功");
		assert.ok(totalText.includes("Success after delayed keepalive error!"), "最终成功接收模型内容");
		assert.ok(!totalText.includes("供应商节点异常"), "不应向用户抛出供应商节点异常错误");
	});

	it("sanitizePiModelDefinition 严格规范化模型定义并过滤格式畸变与缺失字段", () => {
		// 1. 正常模型定义
		const valid = sanitizePiModelDefinition({
			id: "stealth/space-bunny-alpha",
			name: "Stealth Space Bunny",
			contextWindow: 1000000,
			maxTokens: 32768,
			reasoning: true,
			input: ["text", "image"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			thinkingLevelMap: { high: "high", off: null },
		});
		assert.ok(valid);
		assert.equal(valid.id, "stealth/space-bunny-alpha");
		assert.equal(valid.contextWindow, 1000000);
		assert.equal(valid.maxTokens, 32768);
		assert.equal(valid.reasoning, true);
		assert.deepEqual(valid.input, ["text", "image"]);
		assert.deepEqual(valid.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
		assert.equal(valid.thinkingLevelMap?.high, "high");

		// 2. 缺失与非法畸变字段修复
		const repaired = sanitizePiModelDefinition({
			id: " incomplete-model ",
			contextWindow: "invalid",
			maxTokens: -50,
			reasoning: 1,
			cost: undefined,
			input: null,
		});
		assert.ok(repaired);
		assert.equal(repaired.id, "incomplete-model");
		assert.equal(repaired.name, "incomplete-model");
		assert.equal(repaired.contextWindow, 131072, "非法上下文自动回退 131072");
		assert.equal(repaired.maxTokens, 32768, "非法最大 Token 自动回退 32768");
		assert.equal(repaired.reasoning, true);
		assert.deepEqual(repaired.input, ["text"]);
		assert.deepEqual(repaired.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

		// 3. 彻底无效的模型对象过滤
		assert.equal(sanitizePiModelDefinition(null), null);
		assert.equal(sanitizePiModelDefinition({}), null);
		assert.equal(sanitizePiModelDefinition({ id: "   " }), null);
	});

	it("installClineFetchInterceptor 在遇到流中途突发网络中断但已产生内容时，优雅注入 [DONE] 结束流，保留已生成的内容", async () => {
		let pullCount = 0;
		const mockGlobal: any = {
			fetch: async () => {
				const stream = new ReadableStream({
					async pull(controller) {
						pullCount++;
						const encoder = new TextEncoder();
						if (pullCount === 1) {
							// Peek 阶段读到第一包
							controller.enqueue(
								encoder.encode(
									`data: {"id":"chatcmpl-stream-err","choices":[{"index":0,"delta":{"content":"function solveProblem() {"},"finish_reason":null}]}\n\n`,
								),
							);
						} else if (pullCount === 2) {
							// 客户端开始消费流，后续包继续产生内容
							controller.enqueue(
								encoder.encode(
									`data: {"id":"chatcmpl-stream-err","choices":[{"index":0,"delta":{"content":"\\n  return 42;\\n}"},"finish_reason":null}]}\n\n`,
								),
							);
						} else {
							// 中途突发网络中断
							controller.error(new Error("TCP connection reset by peer"));
						}
					},
				});
				return new Response(stream, {
					status: 200,
					headers: { "Content-Type": "text/event-stream" },
				});
			},
		};

		installClineFetchInterceptor(mockGlobal);

		const res = await mockGlobal.fetch("https://api.cline.bot/api/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "deepseek/deepseek-v4.1-flash",
				messages: [{ role: "user", content: "code" }],
				stream: true,
			}),
		});

		assert.equal(res.status, 200);
		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let totalText = "";
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			totalText += decoder.decode(value);
		}

		assert.ok(totalText.includes("function solveProblem() {"), "保留已生成的代码片段");
		assert.ok(totalText.includes("return 42;"), "保留后续生成的代码片段");
		assert.ok(totalText.includes("网络传输中途异常中断"), "包含友好且醒目的中断提示，告知用户接续");
		assert.ok(totalText.includes('"finish_reason":"stop"'), "包含合法完备的 finish_reason 闭合帧，防止 SDK 挂起");
		assert.ok(totalText.includes("data: [DONE]"), "优雅追加 [DONE] 结束标志，避免客户端崩溃");
	});

	it("installClineFetchInterceptor 遭遇 content_filter 时自动平滑转换为 stop 并合成安全检查点总结", async () => {
		const mockGlobal: any = {
			fetch: async () => {
				const body = JSON.stringify({
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: "Partial explanation before filter" },
							finish_reason: "content_filter",
						},
					],
				});
				return new Response(body, {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		};

		installClineFetchInterceptor(mockGlobal);

		const res = await mockGlobal.fetch("https://api.cline.bot/api/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "inclusionai/ling-3.0-flash-sante:free",
				messages: [
					{ role: "user", content: "Summarize this conversation:\n<conversation>secret exploit audit</conversation>" },
				],
			}),
		});

		assert.equal(res.status, 200);
		const data = await res.json();
		assert.equal(data.choices[0].finish_reason, "stop", "finish_reason 必须被平滑重写为 stop");
		assert.ok(
			data.choices[0].message.content.includes("会话进展与安全审计检查点"),
			"压缩任务遭遇 content_filter 时合成为合规检查点",
		);
	});

	it("installClineFetchInterceptor 遭遇 length (token cap) 时在 Compaction 任务下自动重写为 stop", async () => {
		const mockGlobal: any = {
			fetch: async () => {
				const body = JSON.stringify({
					choices: [
						{
							index: 0,
							message: { role: "assistant", content: "Summary reached token cap..." },
							finish_reason: "length",
						},
					],
				});
				return new Response(body, {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		};

		installClineFetchInterceptor(mockGlobal);

		const res = await mockGlobal.fetch("https://api.cline.bot/api/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "inclusionai/ling-3.0-flash-sante:free",
				messages: [
					{ role: "user", content: "Compact and summarize session:\n<conversation>long session...</conversation>" },
				],
			}),
		});

		assert.equal(res.status, 200);
		const data = await res.json();
		assert.equal(data.choices[0].finish_reason, "stop", "压缩任务下的 length 必须重写为 stop 消除 token cap 崩溃");
	});

	it("installClineFetchInterceptor 针对 Compaction 任务自动将 max_tokens 提升至至少 16384", async () => {
		let capturedPayload: any = null;
		const mockGlobal: any = {
			fetch: async (_url: any, init: any) => {
				capturedPayload = JSON.parse(init.body);
				return new Response(JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content: "ok" } }] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		};

		installClineFetchInterceptor(mockGlobal);
		await mockGlobal.fetch("https://api.cline.bot/api/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "openrouter/free",
				messages: [{ role: "user", content: "Compact and summarize session:\n<conversation>long session...</conversation>" }],
				max_tokens: 1600, // 极小 token 预算
			}),
		});

		assert.ok(capturedPayload);
		assert.equal(capturedPayload.max_tokens, 16384, "压缩任务必须将 max_tokens 提升至 16384");
		assert.equal(capturedPayload.reasoning_effort, "low", "压缩任务必须降低推理思考负载");
	});

	it("pruneClineContext 针对 <conversation> 包含敏感审计模式进行脱敏，消除 content_filter 诱因", () => {
		const payload = {
			messages: [
				{
					role: "user",
					content:
						"Summarize:\n<conversation>\nSELECT * FROM users WHERE '1'='1' UNION SELECT credit_card FROM payments;\n<script>alert(1)</script>\n</conversation>",
				},
			],
		};

		const modified = pruneClineContext(payload as any);
		assert.equal(modified, true);
		const text = (payload.messages[0].content as string);
		assert.ok(!text.includes("UNION SELECT"), "SQL 敏感审计特征被脱敏");
		assert.ok(!text.includes("<script>"), "XSS 特征被脱敏");
		assert.ok(text.includes("[sql_audit_statement]"), "包含 SQL 脱敏占位");
		assert.ok(text.includes("[xss_audit_script]"), "包含 XSS 脱敏占位");
	});
});
