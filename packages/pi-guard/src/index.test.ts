import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import piGuard, {
	DEFAULT_GUARD_CONFIG,
	extractContentInfo,
	installGatewayFetchInterceptor,
	restoreGatewayFetchInterceptor,
	registerSentinelHooks,
} from "./index.js";
import { isGatewayRetryCandidate } from "./retry.js";
import type { GuardConfig, GuardStats } from "./types.js";

describe("ck-pi-guard: 核心内容提取算法测试", () => {
	it("正确提取纯文本消息", () => {
		const info = extractContentInfo("Hello World");
		assert.equal(info.hasToolCall, false);
		assert.equal(info.text, "Hello World");
		assert.equal(info.thinking, "");
	});

	it("正确从多块结构中提取 thinking、text 与 toolCall", () => {
		const content = [
			{ type: "thinking", thinking: "Let me check the file structure." },
			{ type: "text", text: "I found the file." },
			{ type: "toolCall", name: "read", arguments: { path: "package.json" } },
		];
		const info = extractContentInfo(content);
		assert.equal(info.hasToolCall, true);
		assert.equal(info.text, "I found the file.");
		assert.equal(info.thinking, "Let me check the file structure.");
		assert.deepEqual(info.toolNames, ["read"]);
	});

	it("精准识别仅包含 thinking 且无文本无工具的脱机状态", () => {
		const content = [
			{ type: "thinking", thinking: "GO! Let me run this! GO!" },
		];
		const info = extractContentInfo(content);
		assert.equal(info.hasToolCall, false);
		assert.equal(info.text, "");
		assert.equal(info.thinking, "GO! Let me run this! GO!");
	});
});

describe("ck-pi-guard: 边缘网关状态码匹配逻辑测试", () => {
	const codes = DEFAULT_GUARD_CONFIG.retryStatusCodes; // [504, 520, 521, 522, 524, 533]

	it("对大模型端点的 504, 522, 533 返回 true", () => {
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", 504, codes), true);
		assert.equal(isGatewayRetryCandidate("https://api.cline.bot/api/v1/chat/completions", 522, codes), true);
		assert.equal(isGatewayRetryCandidate("https://opencode.ai/api/v1/messages", 533, codes), true);
		assert.equal(isGatewayRetryCandidate("https://api.openai.com/v1/chat/completions", 524, codes), true);
	});

	it("对非网关状态码 (200, 400, 401, 403, 429) 返回 false，绝不越权拦截", () => {
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", 200, codes), false);
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", 400, codes), false);
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", 401, codes), false);
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", 403, codes), false);
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", 429, codes), false);
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", 500, codes), false);
	});

	it("对非大模型相关的外部 URL 不做匹配", () => {
		assert.equal(isGatewayRetryCandidate("https://example.com/asset.png", 504, codes), false);
	});
});

describe("ck-pi-guard: 边缘网关 Fetch 拦截重试机制测试", () => {
	let originalFetchBackup: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetchBackup = globalThis.fetch;
	});

	afterEach(() => {
		restoreGatewayFetchInterceptor();
		globalThis.fetch = originalFetchBackup;
	});

	it("遇 504 或 522 时自动重试并在恢复 200 后顺利返回", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			if (callCount === 1) {
				return new Response("Gateway Timeout", { status: 504 });
			}
			return new Response(JSON.stringify({ id: "chat_ok", choices: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		};

		const testConfig: GuardConfig = {
			...DEFAULT_GUARD_CONFIG,
			gatewayInitialBackoffMs: 10,
			gatewayMaxBackoffMs: 50,
		};
		const testStats: GuardStats = {
			totalAutoContinues: 0,
			totalGatewayRetries: 0,
			consecutiveContinues: 0,
		};

		installGatewayFetchInterceptor(testConfig, testStats);

		const res = await fetch("https://relay.zhimolin.shop/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({ model: "deepseek-v4.1-flash" }),
		});

		assert.equal(res.status, 200);
		assert.equal(callCount, 2, "第 1 次 504 失败后必须自动发起第 2 次重试");
		assert.equal(testStats.totalGatewayRetries, 1, "必须准确累加网关重试计数");
		assert.equal(testStats.lastGatewayRetryStatus, 504);
	});

	it("遇 400 或 429 等普通状态码直接放行，不触发多余重试", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response("Rate Limit", { status: 429 });
		};

		const testConfig: GuardConfig = {
			...DEFAULT_GUARD_CONFIG,
			gatewayInitialBackoffMs: 10,
			gatewayMaxBackoffMs: 50,
		};
		const testStats: GuardStats = {
			totalAutoContinues: 0,
			totalGatewayRetries: 0,
			consecutiveContinues: 0,
		};

		installGatewayFetchInterceptor(testConfig, testStats);

		const res = await fetch("https://relay.zhimolin.shop/v1/chat/completions");
		assert.equal(res.status, 429);
		assert.equal(callCount, 1, "非网关状态码必须单次放行，不发生重复调用");
		assert.equal(testStats.totalGatewayRetries, 0);
	});
});

describe("ck-pi-guard: 深度思考后脱机守卫测试", () => {
	it("检测到思考后脱机时自动派发 followUp 续行指令", async () => {
		const sentMessages: Array<{ text: string; options?: any }> = [];
		const handlers: Record<string, Function[]> = {};

		const mockPi: any = {
			on: (event: string, fn: Function) => {
				handlers[event] = handlers[event] || [];
				handlers[event].push(fn);
			},
			sendUserMessage: (text: string, options?: any) => {
				sentMessages.push({ text, options });
			},
		};

		const testConfig: GuardConfig = { ...DEFAULT_GUARD_CONFIG };
		const testStats: GuardStats = {
			totalAutoContinues: 0,
			totalGatewayRetries: 0,
			consecutiveContinues: 0,
		};

		registerSentinelHooks(mockPi, testConfig, testStats);

		const mockCtx: any = {
			hasUI: false,
			getSignal: () => undefined,
		};

		// 模拟模型输出：只有思考，没有文本，没有工具调用
		const prematureStopEvent = {
			message: {
				role: "assistant",
				stopReason: "stop",
				content: [{ type: "thinking", thinking: "GO! Let me check both! GO!" }],
			},
		};

		await handlers["turn_end"][0](prematureStopEvent, mockCtx);

		assert.equal(sentMessages.length, 1, "必须自动派发续行指令");
		assert.equal(sentMessages[0].options?.deliverAs, "followUp", "必须以 followUp 形式队列投递");
		assert.equal(testStats.totalAutoContinues, 1);
		assert.equal(testStats.consecutiveContinues, 1);
	});

	it("当产生工具调用或正常文本时，重置连续脱机计数，不触发续行", async () => {
		const sentMessages: any[] = [];
		const handlers: Record<string, Function[]> = {};

		const mockPi: any = {
			on: (event: string, fn: Function) => {
				handlers[event] = handlers[event] || [];
				handlers[event].push(fn);
			},
			sendUserMessage: (text: string, options?: any) => {
				sentMessages.push({ text, options });
			},
		};

		const testConfig: GuardConfig = { ...DEFAULT_GUARD_CONFIG };
		const testStats: GuardStats = {
			totalAutoContinues: 1,
			totalGatewayRetries: 0,
			consecutiveContinues: 2,
		};

		registerSentinelHooks(mockPi, testConfig, testStats);

		const mockCtx: any = {
			hasUI: false,
			getSignal: () => undefined,
		};

		// 模拟正常调用工具
		const normalToolEvent = {
			message: {
				role: "assistant",
				stopReason: "toolUse",
				content: [
					{ type: "thinking", thinking: "I will read the file." },
					{ type: "toolCall", name: "read", arguments: { path: "a.txt" } },
				],
			},
		};

		await handlers["turn_end"][0](normalToolEvent, mockCtx);

		assert.equal(sentMessages.length, 0, "正常调用工具绝不能触发额外续行");
		assert.equal(testStats.consecutiveContinues, 0, "连续脱机计数必须被重置为 0");
	});

	it("用户主动中断 (aborted) 时绝对不阻拦、不触发续行", async () => {
		const sentMessages: any[] = [];
		const handlers: Record<string, Function[]> = {};

		const mockPi: any = {
			on: (event: string, fn: Function) => {
				handlers[event] = handlers[event] || [];
				handlers[event].push(fn);
			},
			sendUserMessage: (text: string, options?: any) => {
				sentMessages.push({ text, options });
			},
		};

		const testConfig: GuardConfig = { ...DEFAULT_GUARD_CONFIG };
		const testStats: GuardStats = {
			totalAutoContinues: 0,
			totalGatewayRetries: 0,
			consecutiveContinues: 1,
		};

		registerSentinelHooks(mockPi, testConfig, testStats);

		const mockCtx: any = {
			hasUI: false,
			getSignal: () => undefined,
		};

		// 模拟用户按 Ctrl+C / 中断
		const abortEvent = {
			message: {
				role: "assistant",
				stopReason: "aborted",
				content: [{ type: "thinking", thinking: "Cancelled" }],
			},
		};

		await handlers["turn_end"][0](abortEvent, mockCtx);
		assert.equal(sentMessages.length, 0, "用户主动中断时绝不能触发续行");
	});

	it("连续 3 次异常脱机自动熔断保护，防止死循环", async () => {
		const sentMessages: any[] = [];
		const handlers: Record<string, Function[]> = {};

		const mockPi: any = {
			on: (event: string, fn: Function) => {
				handlers[event] = handlers[event] || [];
				handlers[event].push(fn);
			},
			sendUserMessage: (text: string, options?: any) => {
				sentMessages.push({ text, options });
			},
		};

		const testConfig: GuardConfig = { ...DEFAULT_GUARD_CONFIG, maxConsecutiveContinues: 3 };
		const testStats: GuardStats = {
			totalAutoContinues: 2,
			totalGatewayRetries: 0,
			consecutiveContinues: 3, // 已达到上限
		};

		registerSentinelHooks(mockPi, testConfig, testStats);

		const mockCtx: any = {
			hasUI: false,
			getSignal: () => undefined,
		};

		const prematureStopEvent = {
			message: {
				role: "assistant",
				stopReason: "stop",
				content: [{ type: "thinking", thinking: "Looping..." }],
			},
		};

		await handlers["turn_end"][0](prematureStopEvent, mockCtx);
		assert.equal(sentMessages.length, 0, "达到熔断上限后必须暂停自动续行");
		assert.equal(testStats.consecutiveContinues, 0, "熔断后重置连续计数");
	});
});

describe("ck-pi-guard: /guard 命令行交互测试", () => {
	it("/guard status, /guard off, /guard on, /guard reset 指令测试", async () => {
		let registeredCmdHandler: Function | undefined;

		const mockPi: any = {
			on: () => {},
			registerCommand: (name: string, def: any) => {
				if (name === "guard") {
					registeredCmdHandler = def.handler;
				}
			},
		};

		piGuard(mockPi);
		assert.ok(registeredCmdHandler, "必须注册 /guard 指令");

		const mockCtx: any = { hasUI: false };

		// 1. /guard status
		const statusText = await registeredCmdHandler!("status", mockCtx);
		assert.ok(statusText.includes("ck-pi-guard 运行状态"));

		// 2. /guard off
		const offText = await registeredCmdHandler!("off", mockCtx);
		assert.ok(offText.includes("已暂停"));

		// 3. /guard on
		const onText = await registeredCmdHandler!("on", mockCtx);
		assert.ok(onText.includes("已开启"));

		// 4. /guard reset
		const resetText = await registeredCmdHandler!("reset", mockCtx);
		assert.ok(resetText.includes("已成功重置"));
	});
});
