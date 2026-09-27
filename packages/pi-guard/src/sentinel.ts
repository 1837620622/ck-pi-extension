/**
 * ck-pi-guard: 深度思考后脱机守卫 (Auto-Continuation Sentinel)
 *
 * 核心机制：
 * 解决推理模型 (如 DeepSeek-V4.1-Flash、DeepSeek-R1、Qwen-Thinking 等) 在复杂多步任务中，
 * 仅完成内部思考 (thinking) 却在未发射任何工具调用且未输出任何正式回复时提前发出 stop 信号的问题。
 *
 * 关键架构设计：
 * 1. 全格式思考与标签穿透提取：不仅支持结构化 thinking 块，全面支持 <think>...</think> 文本标签剥离，
 *    解决中转模型将思考夹带在普通文本中导致的漏判难题；
 * 2. 多协议 ToolCall 深度兼容：支持 toolCall, tool_use, tool_call, function 以及 message.tool_calls；
 * 3. 严格遵循 Pi Boundary 与事件规范：turn_end 仅投递 followUp 消息，绝对不返回 { continue: true }，
 *    彻底规避 "requested continuation without runnable model context" 内核异常；
 * 4. 消除取消信号失效隐患：标准读取 ctx.signal.aborted，兼容全场景用户 Ctrl+C 中断；
 * 5. 全生命周期状态隔离：在 before_agent_start、session_start 及用户输入时重置计数，
 *    杜绝旧轮次计数污染与误熔断，同时严禁在 agent_start 中重置。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GuardConfig, GuardStats } from "./types.js";

export interface ContentInfo {
	hasToolCall: boolean;
	text: string;
	thinking: string;
	toolNames: string[];
	hasThinkingBlock: boolean;
}

/**
 * 正则表达式：用于匹配并剥离文本中嵌入的思考标签
 * 兼容闭合的 <think>...</think> 以及因 token 截断未闭合的 <think>...
 */
const THINKING_TAG_REGEX =
	/<(?:think|thought|reasoning)>([\s\S]*?)(?:<\/(?:think|thought|reasoning)>|$)/gi;

/**
 * 深入提取并分析消息内容，全面兼顾结构化思考块、内嵌文本标签、多种工具调用协议及顶级推理字段
 */
export function extractContentInfo(content: unknown, rawMessage?: unknown): ContentInfo {
	let combinedText = "";
	let combinedThinking = "";
	let hasThinkingBlock = false;
	const toolNames: string[] = [];

	// 1. 检查顶级 message 对象的推理与工具字段 (OpenAI-compatible / 某些中转格式)
	const msgObj = rawMessage && typeof rawMessage === "object" ? (rawMessage as any) : undefined;
	if (msgObj) {
		if (typeof msgObj.reasoning_content === "string" && msgObj.reasoning_content.length > 0) {
			combinedThinking += msgObj.reasoning_content + "\n";
			hasThinkingBlock = true;
		} else if (typeof msgObj.reasoning === "string" && msgObj.reasoning.length > 0) {
			combinedThinking += msgObj.reasoning + "\n";
			hasThinkingBlock = true;
		}

		if (Array.isArray(msgObj.tool_calls)) {
			for (const call of msgObj.tool_calls) {
				const name = call?.function?.name || call?.name || "unknown";
				toolNames.push(name);
			}
		}
		if (Array.isArray(msgObj.toolCalls)) {
			for (const call of msgObj.toolCalls) {
				const name = call?.name || "unknown";
				toolNames.push(name);
			}
		}
	}

	// 2. 块结构解析
	if (Array.isArray(content)) {
		for (const block of content) {
			if (!block || typeof block !== "object") continue;

			// A. 判定是否为工具调用 (兼容 Pi native / Anthropic / OpenAI 代理)
			const isTool =
				block.type === "toolCall" ||
				block.type === "tool_use" ||
				block.type === "tool_call" ||
				block.type === "function" ||
				Boolean(block.tool_call_id || block.toolCallId || block.function);

			if (isTool) {
				const name = block.name || block.function?.name || block.toolName || "unknown";
				toolNames.push(name);
				continue;
			}

			// B. 判定是否为结构化思考块
			if (block.type === "thinking" || block.type === "reasoning") {
				hasThinkingBlock = true;
				const thinkText =
					typeof (block as any).thinking === "string"
						? (block as any).thinking
						: typeof (block as any).reasoning === "string"
							? (block as any).reasoning
							: typeof (block as any).text === "string"
								? (block as any).text
								: "";
				combinedThinking += thinkText + "\n";
				continue;
			}

			// C. 文本块处理 (需排查内嵌 <think>...</think> 标签)
			if (block.type === "text" && typeof (block as any).text === "string") {
				combinedText += (block as any).text + "\n";
			}
		}
	} else if (typeof content === "string") {
		combinedText = content;
	}

	// 3. 文本中内嵌思考标签的分离与剔除
	let cleanText = combinedText;
	if (cleanText.includes("<think") || cleanText.includes("<thought") || cleanText.includes("<reasoning")) {
		cleanText = cleanText.replace(THINKING_TAG_REGEX, (_, matchContent) => {
			hasThinkingBlock = true;
			combinedThinking += matchContent + "\n";
			return "";
		});
	}

	return {
		hasToolCall: toolNames.length > 0,
		text: cleanText.trim(),
		thinking: combinedThinking.trim(),
		toolNames,
		hasThinkingBlock,
	};
}

/**
 * 完整、严密的取消信号检测
 */
export function isOperationAborted(message: any, ctx: ExtensionContext): boolean {
	if (message?.stopReason === "aborted" || message?.aborted === true) return true;
	if (ctx?.signal?.aborted === true) return true;
	if (typeof (ctx as any)?.getSignal === "function" && (ctx as any).getSignal()?.aborted === true) {
		return true;
	}
	return false;
}

export function registerSentinelHooks(
	pi: ExtensionAPI,
	config: GuardConfig,
	stats: GuardStats,
): void {
	// 用于防止同一消息在 turn_end 与 agent_end 重复触发双重续行
	const handledMessages = new WeakSet<object>();

	function markHandled(msg: unknown): void {
		if (msg && (typeof msg === "object" || typeof msg === "function")) {
			handledMessages.add(msg as object);
		}
	}

	function isHandled(msg: unknown): boolean {
		if (msg && (typeof msg === "object" || typeof msg === "function")) {
			return handledMessages.has(msg as object);
		}
		return false;
	}

	// 1. 用户输入与新轮次生命周期：重置连续脱机计数，彻底避免跨任务误熔断
	pi.on("before_agent_start", () => {
		stats.consecutiveContinues = 0;
	});

	pi.on("session_start", () => {
		stats.consecutiveContinues = 0;
	});

	pi.on("input", (event) => {
		// 只要输入源不是插件自动发送的续行指令（即为真实用户在终端或 RPC 输入），重置连续计数
		if (event.source !== "extension") {
			stats.consecutiveContinues = 0;
		}
	});

	const continuePrompt =
		"【系统自动续行指令】：你上一轮仅完成了内部深度思考，但未输出任何回答且未触发任何工具调用（如 bash、read、edit 等）。请立即根据上一轮的思考结论调用相应工具执行操作，或给出明确的回复，不要在此处停止。";

	// 2. 每轮结束 (turn_end) 守卫检查
	pi.on("turn_end", async (event, ctx: ExtensionContext) => {
		if (!config.enabled) return;

		const message = event.message as any;
		if (!message || message.role !== "assistant") return;

		// 用户主动按 Ctrl+C / 中断或上游报错时，绝对不干预
		if (isOperationAborted(message, ctx) || message.stopReason === "error") {
			stats.consecutiveContinues = 0;
			return;
		}

		const { hasToolCall, text, thinking, hasThinkingBlock } = extractContentInfo(
			message.content,
			message,
		);

		// 如果产生了工具调用或者输出了可见正文，说明正常工作，重置连续脱机计数
		if (hasToolCall || text.length > 0) {
			stats.consecutiveContinues = 0;
			return;
		}

		// 命中脱机特征：未调用工具，未输出正式文本，但存在思考块或非空思考内容
		const isPrematureStop = !hasToolCall && text.length === 0 && (hasThinkingBlock || thinking.length > 0);

		if (isPrematureStop) {
			markHandled(message);

			if (stats.consecutiveContinues >= config.maxConsecutiveContinues) {
				stats.consecutiveContinues = 0;
				if (ctx.hasUI) {
					ctx.ui.notify(
						`[Auto-Guard] 模型连续 ${config.maxConsecutiveContinues} 次仅输出思考未触发工具，已暂停自动唤醒以防死循环。`,
						"warning",
					);
				}
				return;
			}

			stats.consecutiveContinues++;
			stats.totalAutoContinues++;
			stats.lastAutoContinueAt = new Date().toISOString();
			stats.lastAutoContinueReason =
				thinking.length > 0
					? `思考完成后未调用工具 (已输出思考 ${thinking.length} 字符)`
					: "思考块未产生有效正文且未调用工具";

			if (ctx.hasUI) {
				ctx.ui.notify(
					`[Auto-Guard] 检测到模型思考后提前脱机 (${stats.consecutiveContinues}/${config.maxConsecutiveContinues})，正在自动无感唤醒继续执行...`,
					"info",
				);
			}

			// 通过 followUp 队列安全派发，绝对不返回 { continue: true }，防止触发 Pi 的 boundary 校验异常
			pi.sendUserMessage(continuePrompt, { deliverAs: "followUp" });
		}
	});

	// 3. 整个循环结束 (agent_end) 作二级兜底
	pi.on("agent_end", async (event, ctx: ExtensionContext) => {
		if (!config.enabled) return;

		const messages = event.messages;
		if (!messages || messages.length === 0) return;

		const lastMsg = messages[messages.length - 1] as any;
		if (!lastMsg || lastMsg.role !== "assistant") return;

		// 若已在 turn_end 处理过此消息，坚决不重复触发
		if (isHandled(lastMsg)) return;

		if (isOperationAborted(lastMsg, ctx) || lastMsg.stopReason === "error") {
			stats.consecutiveContinues = 0;
			return;
		}

		const { hasToolCall, text, thinking, hasThinkingBlock } = extractContentInfo(
			lastMsg.content,
			lastMsg,
		);

		const isPrematureStop = !hasToolCall && text.length === 0 && (hasThinkingBlock || thinking.length > 0);

		if (isPrematureStop) {
			markHandled(lastMsg);

			if (stats.consecutiveContinues >= config.maxConsecutiveContinues) {
				stats.consecutiveContinues = 0;
				return;
			}

			stats.consecutiveContinues++;
			stats.totalAutoContinues++;
			stats.lastAutoContinueAt = new Date().toISOString();
			stats.lastAutoContinueReason =
				thinking.length > 0
					? `agent_end 兜底捕获: 思考后脱机 (${thinking.length} 字符)`
					: "agent_end 兜底捕获: 思考后脱机 (空思考内容)";

			if (ctx.hasUI) {
				ctx.ui.notify(
					`[Auto-Guard] agent_end 兜底守卫触发，正在恢复执行链 (${stats.consecutiveContinues}/${config.maxConsecutiveContinues})...`,
					"info",
				);
			}

			pi.sendUserMessage(continuePrompt, { deliverAs: "followUp" });
		}
	});
}
