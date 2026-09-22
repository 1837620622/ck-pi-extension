/**
 * OpenCode Zen 插件主入口 (ck-pi-zen-session)
 *
 * 功能特色：
 * 1. 提供 /zen 命令：支持输入 Key 即刻激活、刷新 Session、查看状态与模型清单；
 * 2. 逆向对齐官方 Identifier.descending("ses") 算法，保真生成 30 位降序会话 ID；
 * 3. 自动注入伪装请求头 (User-Agent, x-opencode-session)；
 * 4. 自动双写 ~/.pi/agent/models.json 与 CC-Switch 本地数据库；
 * 5. 常驻 before_agent_start 钩子：每当 Session 临近过期（>12h），后台无感自动刷新。
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	getStoredZenApiKey,
	getStoredZenSessionId,
	getZenStatusInfo,
	syncZenConfiguration,
} from "./sync.js";
import { isZenSessionExpired } from "./session.js";

export default function piZenSession(pi: ExtensionAPI): void {
	// 1. 常驻生命周期守卫：在每次 Agent 循环执行前，自动检测 Session 有效性并无感续期
	pi.on("before_agent_start", async () => {
		try {
			const currentSession = getStoredZenSessionId();
			// 若当前会话不存在或已使用超过 12 小时，后台自动续期
			if (!currentSession || isZenSessionExpired(currentSession, 12 * 3600 * 1000)) {
				const apiKey = getStoredZenApiKey();
				if (apiKey) {
					await syncZenConfiguration({ forceSession: true });
				}
			}
		} catch {
			// 后台静默处理，绝不中断用户的编码交互流程
		}
	});

	// 2. 注册 /zen 指令
	pi.registerCommand("zen", {
		description: "OpenCode Zen 免费模型与 Session 会话自动维护 (/zen [key|refresh|status|list])",
		getArgumentCompletions: (prefix: string) => {
			const candidates = ["refresh", "status", "list", "models"]
				.filter((cmd) => cmd.startsWith(prefix.toLowerCase()))
				.map((cmd) => ({ value: cmd, label: cmd }));
			return candidates.length > 0 ? candidates : null;
		},
		handler: async (args, ctx) => {
			await handleZenCommand(args, ctx);
		},
	});
}

export async function handleZenCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const rawArg = args.trim();
	const command = rawArg.toLowerCase();

	// 1. 查看状态: /zen status
	if (command === "status") {
		const status = getZenStatusInfo();
		if (!status.hasKey) {
			notify(ctx, "OpenCode Zen 尚未配置 API Key。请使用 /zen <oc_sk_xxx> 进行配置。", "warning");
			return;
		}

		const ageDesc = status.sessionAgeMinutes < 60
			? `${status.sessionAgeMinutes} 分钟`
			: `${(status.sessionAgeMinutes / 60).toFixed(1)} 小时`;

		const msg = [
			"✨ [OpenCode Zen 运行状态]",
			`• API Key: ${status.maskedKey}`,
			`• Session: ${status.sessionId || "未生成"} (${status.sessionExpired ? "已过期" : `有效，创建于 ${ageDesc}前`})`,
			`• 模型库: 已激活 ${status.modelsCount} 个免费模型`,
			"",
			"常用指令：",
			"  /zen <key>   - 更新 Key 并全量重新同步",
			"  /zen refresh - 强制换新 Session ID",
			"  /zen list    - 查看所有可用免费模型规格",
		].join("\n");

		notify(ctx, msg, "info");
		return;
	}

	// 2. 查看模型清单: /zen list 或 /zen models
	if (command === "list" || command === "models") {
		const status = getZenStatusInfo();
		if (status.modelIds.length === 0) {
			notify(ctx, "当前尚未同步任何模型，请先运行 /zen <key>。", "warning");
			return;
		}

		const listMsg = [
			`✨ [OpenCode Zen 免费模型列表 (${status.modelIds.length} 个)]`,
			...status.modelIds.map((id) => `  • ${id}`),
			"",
			"提示：这些模型已就绪，可在 Pi 中直接切换使用！",
		].join("\n");

		notify(ctx, listMsg, "info");
		return;
	}

	// 3. 强制换新 Session: /zen refresh
	if (command === "refresh") {
		try {
			notify(ctx, "正在生成全新 OpenCode Zen 会话 ID 并同步...", "info");
			const result = await syncZenConfiguration({ forceSession: true });
			const successMsg = [
				"✓ OpenCode Zen Session 已成功刷新！",
				`• 全新 Session: ${result.sessionId}`,
				`• 请求头伪装: User-Agent, x-opencode-session 已注入`,
				`• 同步状态: models.json ✓ | CC-Switch ${result.ccSwitchUpdated ? "✓" : "-(未安装或无此条目)"}`,
			].join("\n");
			notify(ctx, successMsg, "info");
		} catch (error) {
			notify(ctx, `刷新失败: ${formatError(error)}`, "error");
		}
		return;
	}

	// 4. 输入了具体的 API Key: /zen oc_sk_... 或其它 key
	if (rawArg.length > 0 && !["status", "refresh", "list", "models"].includes(command)) {
		try {
			notify(ctx, "正在验证 OpenCode Zen API Key 并探测免费模型...", "info");
			const result = await syncZenConfiguration({ apiKey: rawArg, forceSession: true });
			const msg = [
				"🎉 OpenCode Zen 配置成功！免费套餐与请求头已全部就绪：",
				`• API Key: ${maskKey(result.apiKey)} (已验证并保存)`,
				`• 会话 Session: ${result.sessionId} (官方降序时间戳逆向算法)`,
				`• 发现免费模型: ${result.modelsCount} 个已自动配置 (含思维链 thinkingLevelMap 适配)`,
				`• 同步路径: ${result.modelsPath}`,
				result.ccSwitchUpdated ? "• CC-Switch: 本地数据库已同步更新" : "",
			].filter(Boolean).join("\n");
			notify(ctx, msg, "info");
		} catch (error) {
			notify(ctx, `配置失败: ${formatError(error)}`, "error");
		}
		return;
	}

	// 5. 无参调用: /zen
	const status = getZenStatusInfo();
	if (status.hasKey) {
		// 已有 Key 时，自动检测并刷新 Session
		try {
			notify(ctx, "正在检测并刷新 OpenCode Zen 会话...", "info");
			const result = await syncZenConfiguration({ forceSession: status.sessionExpired });
			const msg = [
				"✨ [OpenCode Zen 已连接就绪]",
				`• API Key: ${maskKey(result.apiKey)}`,
				`• 活跃 Session: ${result.sessionId} (${result.isNewSession ? "已换新" : "仍有效"})`,
				`• 免费模型: ${result.modelsCount} 个可用`,
				"",
				"常用操作：",
				"  /zen <key>   - 更换 API Key",
				"  /zen refresh - 换新会话 ID",
				"  /zen status  - 详情状态",
			].join("\n");
			notify(ctx, msg, "info");
		} catch (error) {
			notify(ctx, `同步状态失败: ${formatError(error)}`, "error");
		}
		return;
	}

	// 没有 Key，如果在支持交互的 UI 环境下，弹出输入框
	if (ctx.hasUI && typeof ctx.ui.input === "function") {
		try {
			const enteredKey = await ctx.ui.input(
				"请输入 OpenCode Zen API Key (形如 oc_sk_...):",
				"oc_sk_",
			);
			if (enteredKey && enteredKey.trim()) {
				await handleZenCommand(enteredKey.trim(), ctx);
				return;
			}
			notify(ctx, "已取消输入。如需配置请使用 /zen <oc_sk_xxx>", "info");
			return;
		} catch {
			// fallthrough to text usage
		}
	}

	notify(ctx, "请提供 OpenCode Zen API Key。用法：/zen <oc_sk_xxx>", "warning");
}

function maskKey(key: string): string {
	if (!key) return "未配置";
	if (key.length <= 12) return "******";
	return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

function notify(
	ctx: ExtensionCommandContext,
	message: string,
	level: "info" | "warning" | "error" = "info",
): void {
	try {
		if (ctx.hasUI) {
			ctx.ui.notify(message, level);
		} else {
			// 终端或非交互环境日志输出
			console.log(`[${level.toUpperCase()}] ${message}`);
		}
	} catch {
		// 容错
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
