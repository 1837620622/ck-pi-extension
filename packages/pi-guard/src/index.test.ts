import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import piGuard, {
	DEFAULT_GUARD_CONFIG,
	extractContentInfo,
	installGatewayFetchInterceptor,
	restoreGatewayFetchInterceptor,
	registerSentinelHooks,
	isGatewayRetryCandidate,
	isEligibleLLMEndpoint,
	shouldBypassDuplicatePluginRetry,
	isOperationAborted,
} from "./index.js";
import type { GuardConfig, GuardStats } from "./types.js";

describe("ck-pi-guard: 核心内容提取算法测试", () => {
	it("正确提取纯文本消息", () => {
		const info = extractContentInfo("Hello World");
		assert.equal(info.hasToolCall, false);
		assert.equal(info.text, "Hello World");
		assert.equal(info.thinking, "");
		assert.equal(info.hasThinkingBlock, false);
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
		assert.equal(info.hasThinkingBlock, true);
	});

	it("精准识别仅包含 thinking 且无文本无工具的脱机状态", () => {
		const content = [
			{ type: "thinking", thinking: "GO! Let me run this! GO!" },
		];
		const info = extractContentInfo(content);
		assert.equal(info.hasToolCall, false);
		assert.equal(info.text, "");
		assert.equal(info.thinking, "GO! Let me run this! GO!");
		assert.equal(info.hasThinkingBlock, true);
	});

	it("精准剥离 text 块中嵌入的 <think>...</think> 标签", () => {
		const content = [
			{
				type: "text",
				text: "<think>\nLet me think about how to solve this.\nI will execute bash command.\n</think>",
			},
		];
		const info = extractContentInfo(content);
		assert.equal(info.hasToolCall, false);
		assert.equal(info.text, "", "标签剥离后正文应为空");
		assert.ok(info.thinking.includes("Let me think about how to solve this."));
		assert.equal(info.hasThinkingBlock, true);
	});

	it("正确识别多种协议工具调用格式 (tool_use, function, tool_calls 顶级字段)", () => {
		// 1. Anthropic 格式
		const anthropicContent = [
			{ type: "tool_use", name: "bash", input: { command: "ls" } },
		];
		const info1 = extractContentInfo(anthropicContent);
		assert.equal(info1.hasToolCall, true);
		assert.deepEqual(info1.toolNames, ["bash"]);

		// 2. OpenAI 兼容顶级 tool_calls
		const rawMsg = {
			role: "assistant",
			tool_calls: [{ function: { name: "edit" } }],
		};
		const info2 = extractContentInfo([], rawMsg);
		assert.equal(info2.hasToolCall, true);
		assert.deepEqual(info2.toolNames, ["edit"]);
	});

	it("识别 reasoning_content 顶级推理字段并兼容纯换行空白思考", () => {
		const rawMsg = {
			role: "assistant",
			reasoning_content: "Internal chain of thought",
		};
		const info = extractContentInfo([], rawMsg);
		assert.equal(info.hasThinkingBlock, true);
		assert.ok(info.thinking.includes("Internal chain of thought"));

		// 纯空白换行思考块
		const emptyThinkingBlock = [{ type: "thinking", thinking: "   \n\n  " }];
		const infoEmpty = extractContentInfo(emptyThinkingBlock);
		assert.equal(infoEmpty.hasThinkingBlock, true);
	});
});

describe("ck-pi-guard: 边缘网关状态码与 LLM 端点匹配逻辑测试", () => {
	const config: GuardConfig = { ...DEFAULT_GUARD_CONFIG };

	it("对大模型端点的 502, 503, 504, 522, 524, 533 返回 true", () => {
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", "POST", 502, config), true);
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", "POST", 503, config), true);
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", "POST", 504, config), true);
		assert.equal(isGatewayRetryCandidate("https://api.openai.com/v1/chat/completions", "POST", 522, config), true);
		assert.equal(isGatewayRetryCandidate("https://api.deepseek.com/chat/completions", "POST", 524, config), true);
		assert.equal(isGatewayRetryCandidate("https://openrouter.ai/api/v1/chat/completions", "POST", 533, config), true);
		// /v1/models GET 请求
		assert.equal(isGatewayRetryCandidate("https://api.openai.com/v1/models", "GET", 502, config), true);
	});

	it("对非网关状态码 (200, 400, 401, 403, 429) 返回 false，绝不越权拦截", () => {
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", "POST", 200, config), false);
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", "POST", 400, config), false);
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", "POST", 401, config), false);
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", "POST", 403, config), false);
		assert.equal(isGatewayRetryCandidate("https://relay.zhimolin.shop/v1/chat/completions", "POST", 429, config), false);
	});

	it("对非大模型相关的外部 URL 不做匹配，防范误伤非幂等 API", () => {
		assert.equal(isEligibleLLMEndpoint("https://api.github.com/repos/owner/repo/issues", "POST", config), false);
		assert.equal(isEligibleLLMEndpoint("https://registry.npmjs.org/ck-pi-guard", "GET", config), false);
		assert.equal(isEligibleLLMEndpoint("http://127.0.0.1:4116/v1/chat/completions", "POST", config), false, "本地回环地址应排除");
	});

	it("避免与同进程内其他插件 (Zen, Cline) 发生乘法重试风暴", () => {
		// api.cline.bot 已由 Cline 全权接管
		assert.equal(shouldBypassDuplicatePluginRetry("https://api.cline.bot/api/v1/chat/completions", 504), true);
		// opencode.ai/zen/ 的 504 已由 Zen 接管
		assert.equal(shouldBypassDuplicatePluginRetry("https://opencode.ai/zen/v1/chat/completions", 504), true);
		// opencode.ai/zen/ 的 522 Zen 未接管，Guard 进行兜底
		assert.equal(shouldBypassDuplicatePluginRetry("https://opencode.ai/zen/v1/chat/completions", 522), false);
	});
});

describe("ck-pi-guard: 边缘网关 Fetch 拦截重试机制测试", () => {
	let originalFetchBackup: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetchBackup = globalThis.fetch;
		restoreGatewayFetchInterceptor();
	});

	afterEach(() => {
		restoreGatewayFetchInterceptor();
		globalThis.fetch = originalFetchBackup;
	});

	it("遇 504 自动重试并在恢复 200 后顺利返回，Headers 100% 完整继承", async () => {
		let callCount = 0;
		let receivedAuthHeader = "";

		const rawFetch = async (input: any, init: any) => {
			callCount++;
			const headers = new Headers(init?.headers);
			receivedAuthHeader = headers.get("authorization") || "";

			if (callCount === 1) {
				return new Response("Gateway Timeout", { status: 504 });
			}
			return new Response(JSON.stringify({ id: "ok" }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		};
		globalThis.fetch = rawFetch;

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

		// 使用包含 Authorization 的 Request 对象调用
		const req = new Request("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			headers: { authorization: "Bearer secret-token" },
			body: JSON.stringify({ model: "gpt-4" }),
		});

		const res = await globalThis.fetch(req, {
			headers: { "x-custom-trace": "trace-123" },
		});

		assert.equal(res.status, 200);
		assert.equal(callCount, 2);
		assert.equal(testStats.totalGatewayRetries, 1);
		assert.equal(receivedAuthHeader, "Bearer secret-token", "上游 Request 的 Authorization 标头绝不能丢失");
	});

	it("GET / HEAD 请求绝不注入 Body，杜绝 TypeError", async () => {
		let receivedBody: any = undefined;

		const rawFetch = async (input: any, init: any) => {
			receivedBody = init?.body;
			return new Response("[]", { status: 200 });
		};
		globalThis.fetch = rawFetch;

		const testConfig: GuardConfig = { ...DEFAULT_GUARD_CONFIG };
		const testStats: GuardStats = { totalAutoContinues: 0, totalGatewayRetries: 0, consecutiveContinues: 0 };
		installGatewayFetchInterceptor(testConfig, testStats);

		const res = await globalThis.fetch("https://api.openai.com/v1/models", {
			method: "GET",
		});
		assert.equal(res.status, 200);
		assert.equal(receivedBody, undefined, "GET 请求绝不能带有 body 属性");
	});

	it("遇 400 或 429 等普通状态码直接放行，不触发多余重试", async () => {
		let callCount = 0;
		globalThis.fetch = async () => {
			callCount++;
			return new Response(JSON.stringify({ error: "rate limit" }), { status: 429 });
		};

		const testConfig: GuardConfig = { ...DEFAULT_GUARD_CONFIG };
		const testStats: GuardStats = { totalAutoContinues: 0, totalGatewayRetries: 0, consecutiveContinues: 0 };
		installGatewayFetchInterceptor(testConfig, testStats);

		const res = await globalThis.fetch("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: "{}",
		});

		assert.equal(res.status, 429);
		assert.equal(callCount, 1);
		assert.equal(testStats.totalGatewayRetries, 0);
	});
});

describe("ck-pi-guard: 深度思考后脱机守卫测试", () => {
	it("检测到思考后脱机时自动派发 followUp 续行指令 (通过 followUp 队列)", async () => {
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
			consecutiveContinues: 0,
		};

		registerSentinelHooks(mockPi, testConfig, testStats);

		const mockCtx: any = {
			hasUI: false,
			signal: undefined,
		};

		// 模拟推理模型仅返回 thinking 块
		const prematureStopEvent = {
			message: {
				role: "assistant",
				stopReason: "stop",
				content: [{ type: "thinking", thinking: "I will read the file and write test now..." }],
			},
		};

		await handlers["turn_end"][0](prematureStopEvent, mockCtx);

		assert.equal(sentMessages.length, 1);
		assert.equal(sentMessages[0].options?.deliverAs, "followUp");
		assert.equal(testStats.totalAutoContinues, 1);
		assert.equal(testStats.consecutiveContinues, 1);
	});

	it("用户主动中断 (aborted / ctx.signal) 时绝对不阻拦、不触发续行", async () => {
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

		// 1. message.stopReason === "aborted"
		const mockCtx1: any = { hasUI: false, signal: undefined };
		const abortEvent1 = {
			message: {
				role: "assistant",
				stopReason: "aborted",
				content: [{ type: "thinking", thinking: "Cancelled" }],
			},
		};
		await handlers["turn_end"][0](abortEvent1, mockCtx1);
		assert.equal(sentMessages.length, 0);

		// 2. ctx.signal.aborted === true
		const mockCtx2: any = {
			hasUI: false,
			signal: { aborted: true },
		};
		const abortEvent2 = {
			message: {
				role: "assistant",
				stopReason: "stop",
				content: [{ type: "thinking", thinking: "Interrupted" }],
			},
		};
		await handlers["turn_end"][0](abortEvent2, mockCtx2);
		assert.equal(sentMessages.length, 0);
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
			consecutiveContinues: 3, // 已达熔断上限
		};

		registerSentinelHooks(mockPi, testConfig, testStats);

		const mockCtx: any = { hasUI: false, signal: undefined };
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

	it("新用户轮次 (before_agent_start / input) 自动重置连续脱机计数，防范误熔断", async () => {
		const handlers: Record<string, Function[]> = {};

		const mockPi: any = {
			on: (event: string, fn: Function) => {
				handlers[event] = handlers[event] || [];
				handlers[event].push(fn);
			},
			sendUserMessage: () => {},
		};

		const testConfig: GuardConfig = { ...DEFAULT_GUARD_CONFIG };
		const testStats: GuardStats = {
			totalAutoContinues: 2,
			totalGatewayRetries: 0,
			consecutiveContinues: 2, // 上一轮遗留
		};

		registerSentinelHooks(mockPi, testConfig, testStats);

		// 触发 before_agent_start
		handlers["before_agent_start"][0]();
		assert.equal(testStats.consecutiveContinues, 0, "before_agent_start 必须重置连续脱机计数");

		testStats.consecutiveContinues = 2;
		// 模拟人类用户在终端敲入新内容
		handlers["input"][0]({ source: "interactive", text: "next task" });
		assert.equal(testStats.consecutiveContinues, 0, "真实用户 input 必须重置连续脱机计数");

		// 插件自身发送的 followUp 绝不重置
		testStats.consecutiveContinues = 2;
		handlers["input"][0]({ source: "extension", text: "system prompt" });
		assert.equal(testStats.consecutiveContinues, 2, "extension 自身发送的输入不重置计数");
	});

	it("turn_end 与 agent_end 双重兜底不重复触发 (防重入去重)", async () => {
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
			consecutiveContinues: 0,
		};

		registerSentinelHooks(mockPi, testConfig, testStats);

		const mockCtx: any = { hasUI: false, signal: undefined };

		const sameAssistantMessage = {
			role: "assistant",
			stopReason: "stop",
			content: [
				{
					type: "thinking",
					thinking: "I will read the file and write test now...",
				},
			],
		};

		// 模拟先触发 turn_end
		const turnEndEvent = { message: sameAssistantMessage };
		await handlers["turn_end"][0](turnEndEvent, mockCtx);
		assert.equal(sentMessages.length, 1, "turn_end 应该派发一次续行");
		assert.equal(testStats.consecutiveContinues, 1);

		// 模拟随后触发 agent_end，包含同一条消息
		const agentEndEvent = { messages: [sameAssistantMessage] };
		await handlers["agent_end"][0](agentEndEvent, mockCtx);

		// 验证：agent_end 绝不可二次派发！
		assert.equal(sentMessages.length, 1, "同一消息经过 turn_end 处理后，agent_end 绝不能重复派发");
		assert.equal(testStats.consecutiveContinues, 1, "计数器绝不重复增加");
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
