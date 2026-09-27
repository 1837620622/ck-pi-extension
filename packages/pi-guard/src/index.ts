/**
 * ck-pi-guard: Pi Coding Agent 智能续行守护与边缘网关重试扩展
 *
 * 核心特色：
 * 1. 深度思考后脱机守卫：彻底解决 DeepSeek 等推理模型思考完毕后直接发 stop 导致会话意外停顿的缺陷；
 * 2. 边缘网关状态码拦截重试：专门拦截 Cloudflare / 反向代理层的 504, 520, 521, 522, 524, 533 状态码与网络瞬断；
 * 3. 严格职责隔离：业务状态码与原有 retry 保持 100% 独立，绝不冲突重合；
 * 4. 熔断与安全边界：用户中断 (Ctrl+C) 立即放行，连续 3 次异常自动熔断，0 风险。
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { DEFAULT_GUARD_CONFIG, type GuardConfig, type GuardStats } from "./types.js";
import { installGatewayFetchInterceptor, restoreGatewayFetchInterceptor } from "./retry.js";
import { registerSentinelHooks } from "./sentinel.js";

export { DEFAULT_GUARD_CONFIG } from "./types.js";
export type { GuardConfig, GuardStats } from "./types.js";
export { installGatewayFetchInterceptor, restoreGatewayFetchInterceptor } from "./retry.js";
export { registerSentinelHooks, extractContentInfo } from "./sentinel.js";

const config: GuardConfig = { ...DEFAULT_GUARD_CONFIG };
const stats: GuardStats = {
	totalAutoContinues: 0,
	totalGatewayRetries: 0,
	consecutiveContinues: 0,
};

export default function piGuard(pi: ExtensionAPI): void {
	// 1. 安装边缘网关 Fetch 拦截器 (504, 522, 533 等超时保护)
	installGatewayFetchInterceptor(config, stats);

	// 2. 注册思考后脱机守卫钩子 (turn_end / agent_end)
	registerSentinelHooks(pi, config, stats);

	// 3. 注册 /guard 诊断与控制指令
	pi.registerCommand("guard", {
		description: "查看或配置 ck-pi-guard 智能续行守护与边缘网关重试状态",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const sub = (args || "").trim().toLowerCase();

			if (sub === "on" || sub === "enable") {
				config.enabled = true;
				stats.consecutiveContinues = 0;
				const msg = "[ck-pi-guard] 智能续行守护与边缘网关重试已开启。";
				if (ctx.hasUI) ctx.ui.notify(msg, "info");
				return msg;
			}

			if (sub === "off" || sub === "disable") {
				config.enabled = false;
				stats.consecutiveContinues = 0;
				const msg = "[ck-pi-guard] 智能续行守护与边缘网关重试已暂停。";
				if (ctx.hasUI) ctx.ui.notify(msg, "warning");
				return msg;
			}

			if (sub === "reset") {
				stats.totalAutoContinues = 0;
				stats.totalGatewayRetries = 0;
				stats.consecutiveContinues = 0;
				stats.lastAutoContinueAt = undefined;
				stats.lastAutoContinueReason = undefined;
				stats.lastGatewayRetryAt = undefined;
				stats.lastGatewayRetryStatus = undefined;
				const msg = "[ck-pi-guard] 守护统计指标与熔断计数已成功重置。";
				if (ctx.hasUI) ctx.ui.notify(msg, "info");
				return msg;
			}

			const lines = [
				"=== ck-pi-guard 运行状态 ===",
				`• 守护总开关: ${config.enabled ? "已启用 (Active)" : "已暂停 (Disabled)"}`,
				`• 思考脱机守卫: 已累计无感续行 ${stats.totalAutoContinues} 次`,
				`• 当前连续触发计数: ${stats.consecutiveContinues} / ${config.maxConsecutiveContinues}`,
				`• 网关超时重试 (504/522/533): 已累计救援重试 ${stats.totalGatewayRetries} 次`,
				`• 最近一次脱机续行: ${stats.lastAutoContinueAt || "无"} (${stats.lastAutoContinueReason || "无"})`,
				`• 最近一次网关重试: ${stats.lastGatewayRetryAt || "无"} (状态码: ${stats.lastGatewayRetryStatus ?? "无"})`,
				`• 监听网关状态码: [${config.retryStatusCodes.join(", ")}]`,
				"",
				"常用指令:",
				"  /guard status  - 查看当前详细运行指标",
				"  /guard on      - 开启守护",
				"  /guard off     - 关闭守护",
				"  /guard reset   - 重置触发与重试计数",
			];

			const report = lines.join("\n");
			if (ctx.hasUI) ctx.ui.notify(report, "info");
			return report;
		},
	});
}
