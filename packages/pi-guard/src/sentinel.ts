/**
 * ck-pi-guard: 深度思考后脱机守卫 (Auto-Continuation Sentinel)
 *
 * 核心机制：
 * 解决推理模型 (如 DeepSeek-V4.1-Flash、DeepSeek-R1、Qwen-Thinking 等) 在复杂多步任务中，
 * 仅完成内部思考 (thinking) 却在未发射任何工具调用且未输出任何正式回复时提前发出 stop 信号的问题。
 *
 * 边界保护：
 * 1. 用户主动取消 (stopReason: aborted / signal.aborted)：绝对放行，绝不阻拦取消；
 * 2. 真实错误 (stopReason: error)：放行给系统原生重试或错误提示；
 * 3. 产生正常文本或工具调用：重置计数，0 介入；
 * 4. 熔断保护：连续触发达到阈值 (默认 3 次) 自动暂停，彻底杜绝死循环。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { GuardConfig, GuardStats } from "./types.js";

export function extractContentInfo(content: unknown): {
	hasToolCall: boolean;
	text: string;
	thinking: string;
	toolNames: string[];
} {
	if (!Array.isArray(content)) {
		const textStr = typeof content === "string" ? content.trim() : "";
		return { hasToolCall: false, text: textStr, thinking: "", toolNames: [] };
	}

	let text = "";
	let thinking = "";
	const toolNames: string[] = [];

	for (const block of content) {
		if (!block || typeof block !== "object") continue;
		if (block.type === "toolCall") {
			toolNames.push((block as any).name || "unknown");
		} else if (block.type === "text" && typeof (block as any).text === "string") {
			text += (block as any).text;
		} else if (block.type === "thinking" && typeof (block as any).thinking === "string") {
			thinking += (block as any).thinking;
		}
	}

	return {
		hasToolCall: toolNames.length > 0,
		text: text.trim(),
		thinking: thinking.trim(),
		toolNames,
	};
}

export function registerSentinelHooks(
	pi: ExtensionAPI,
	config: GuardConfig,
	stats: GuardStats,
): void {
	// 用于防止同一消息在 turn_end 与 agent_end 重复触发双重续行
	const handledMessages = new WeakSet<object>();

	// 1. 每轮结束 (turn_end) 检查
	pi.on("turn_end", async (event, ctx: ExtensionContext) => {
		if (!config.enabled) return;

		const message = event.message as any;
		if (!message || message.role !== "assistant") return;

		// 用户主动按 Ctrl+C / 中断或上游报错时，绝对不干预
		if (message.stopReason === "aborted" || message.stopReason === "error") {
			stats.consecutiveContinues = 0;
			return;
		}
		if (ctx.getSignal?.()?.aborted) {
			stats.consecutiveContinues = 0;
			return;
		}

		const { hasToolCall, text, thinking } = extractContentInfo(message.content);

		// 如果产生了工具调用或者输出了可见文本，说明执行正常，重置连续计数
		if (hasToolCall || text.length > 0) {
			stats.consecutiveContinues = 0;
			return;
		}

		// 命中脱机特征：未调用工具，未输出正式文本，但存在深度思考内容
		if (thinking.length > 0 && text.length === 0 && !hasToolCall) {
			handledMessages.add(message);

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
			stats.lastAutoContinueReason = `思考完成后未调用工具 (已输出思考 ${thinking.length} 字符)`;

			if (ctx.hasUI) {
				ctx.ui.notify(
					`[Auto-Guard] 检测到模型思考后提前脱机 (${stats.consecutiveContinues}/${config.maxConsecutiveContinues})，正在自动无感唤醒继续执行...`,
					"info",
				);
			}

			const prompt =
				"【系统自动续行指令】：你上一轮仅完成了内部深度思考，但未输出任何回答且未触发任何工具调用（如 bash、read、edit 等）。请立即根据上一轮的思考结论调用相应工具执行操作，或给出明确的回复，不要在此处停止。";

			try {
				pi.sendUserMessage(prompt, { deliverAs: "followUp" });
			} catch {
				pi.sendUserMessage(prompt);
			}

			return { continue: true };
		}
	});

	// 2. 整个循环结束 (agent_end) 作二级兜底
	pi.on("agent_end", async (event, ctx: ExtensionContext) => {
		if (!config.enabled) return;

		const messages = event.messages;
		if (!messages || messages.length === 0) return;

		const lastMsg = messages[messages.length - 1] as any;
		if (!lastMsg || lastMsg.role !== "assistant") return;

		// 若已在 turn_end 处理过此消息，坚决不重复触发
		if (handledMessages.has(lastMsg)) return;

		if (lastMsg.stopReason === "aborted" || lastMsg.stopReason === "error") {
			stats.consecutiveContinues = 0;
			return;
		}
		if (ctx.getSignal?.()?.aborted) {
			stats.consecutiveContinues = 0;
			return;
		}

		const { hasToolCall, text, thinking } = extractContentInfo(lastMsg.content);

		if (!hasToolCall && text.length === 0 && thinking.length > 0) {
			handledMessages.add(lastMsg);

			if (stats.consecutiveContinues >= config.maxConsecutiveContinues) {
				stats.consecutiveContinues = 0;
				return;
			}

			stats.consecutiveContinues++;
			stats.totalAutoContinues++;
			stats.lastAutoContinueAt = new Date().toISOString();
			stats.lastAutoContinueReason = `agent_end 兜底捕获: 思考后脱机 (${thinking.length} 字符)`;

			if (ctx.hasUI) {
				ctx.ui.notify(
					`[Auto-Guard] agent_end 兜底守卫触发，正在恢复执行链 (${stats.consecutiveContinues}/${config.maxConsecutiveContinues})...`,
					"info",
				);
			}

			const prompt =
				"【系统自动续行指令】：你上一轮仅输出了内部思考（thinking）但未执行任何工具调用（toolCall）或交付最终回复。请立即根据思考结果调用相应工具执行下一步操作。";

			try {
				pi.sendUserMessage(prompt, { deliverAs: "followUp" });
			} catch {
				pi.sendUserMessage(prompt);
			}
		}
	});
}
