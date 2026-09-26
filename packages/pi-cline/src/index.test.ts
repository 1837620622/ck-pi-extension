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
	resolveFreeModelId,
	startClineProxyServer,
	stopClineProxyServer,
	syncClineConfiguration,
	updateCcSwitchDbForCline,
	updateMessageText,
} from "./index.js";

const globalTestDir = mkdtempSync(join(tmpdir(), "cline-global-test-"));
const globalModelsPath = join(globalTestDir, "models.json");
const globalAuthPath = join(globalTestDir, "auth.json");
const globalDbPath = join(globalTestDir, "cc-switch.db");

writeFileSync(globalModelsPath, JSON.stringify({ providers: { relayhub: { baseUrl: "https://relay.example.com", models: [] } } }, null, 2));
writeFileSync(globalAuthPath, JSON.stringify({ relayhub: { type: "api_key", key: "existing_key" } }, null, 2));
const globalDb = new DatabaseSync(globalDbPath);
globalDb.exec("CREATE TABLE providers (id TEXT PRIMARY KEY, name TEXT, type TEXT, config TEXT);");
globalDb.close();

process.env.TEST_PI_MODELS_PATH = globalModelsPath;
process.env.TEST_PI_AUTH_PATH = globalAuthPath;
process.env.TEST_CC_SWITCH_DB_PATH = globalDbPath;

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
		const ling = inferClineModelCapabilities("inclusionai/ling-3.0-flash-fin:free");
		assert.equal(ling.isFree, true);
		assert.equal(ling.contextWindow, 262144);
		assert.equal(ling.reasoning, true);

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
		assert.equal(resolveFreeModelId("cline/inclusionai/ling-3.0-flash-fin:free"), "inclusionai/ling-3.0-flash-fin:free");
		assert.equal(resolveFreeModelId("cline-free/openrouter/free"), "openrouter/free");

		// 快捷别名
		assert.equal(resolveFreeModelId("free"), "openrouter/free");
		assert.equal(resolveFreeModelId("fusion"), "openrouter/fusion");
		assert.equal(resolveFreeModelId("code"), "openrouter/pareto-code");
		assert.equal(resolveFreeModelId("bunny"), "stealth/space-bunny-alpha");
		assert.equal(resolveFreeModelId("stealth"), "stealth/space-bunny-alpha");
		assert.equal(resolveFreeModelId("luna"), "typesafe/jev-router");
		assert.equal(resolveFreeModelId("ling"), "inclusionai/ling-3.0-flash-fin:free");
		assert.equal(resolveFreeModelId("550b"), "nvidia/nemotron-3-ultra-550b-a55b:free");
		assert.equal(resolveFreeModelId("reasoning"), "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free");
		assert.equal(resolveFreeModelId("laguna"), "poolside/laguna-s-2.1:free");

		// 自动追加 :free 保护
		assert.equal(resolveFreeModelId("inclusionai/ling-3.0-flash-fin"), "inclusionai/ling-3.0-flash-fin:free");
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

		const card = formatClineModelCard(KNOWN_CLINE_FREE_MODELS["inclusionai/ling-3.0-flash-fin:free"]);
		assert.ok(card.includes("inclusionai/ling-3.0-flash-fin:free"));
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
		assert.ok(json.data.some((m: any) => m.id === "inclusionai/ling-3.0-flash-fin:free"));
	});

	it("处理 OPTIONS 预检请求并返回合规 CORS 响应头", async () => {
		const optRes = await fetch(`http://127.0.0.1:${TEST_PROXY_PORT}/v1/chat/completions`, {
			method: "OPTIONS",
			headers: { Origin: "http://localhost:3000" },
		});
		assert.equal(optRes.status, 204);
		assert.equal(optRes.headers.get("access-control-allow-origin"), "http://localhost:3000");
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

		// 绝不能干涉其他供应商
		assert.equal(isClineModelTarget({ provider: "relayhub", id: "deepseek-v4.1-flash" }), false);
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

		// 5. /cline ping
		const pingOutput = await clineCmd.handler("ping", {});
		assert.ok(pingOutput.includes("Cline 免费模型连通性与时延实时探测"));
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
});
