/**
 * pi-redkit 入口
 *
 * 只做注入，不碰原提示词：每次 agent 循环启动前（before_agent_start），
 * 把条令块追加到 Pi 链式系统提示词尾部。原提示词（含 sys.md / 全局 agent.md /
 * --append-system-prompt 等上下文）由 Pi 从干净基线重建，原样保留在前；
 * 本扩展只做字符串拼接，从不改写、删除或重排它们。幂等标记防重复钉入。
 *
 * 模式来自 ~/.pi/agent/ck-pi-redkit.json，开机读一次；/redkit 命令可即时切换
 * 并写回文件；/reload 会重新执行本工厂函数，从文件刷新配置。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { configFilePath, loadConfig } from "./config.js";
import { buildPromptBlock, REDKIT_INJECTION_MARKER } from "./prompt.js";
import { REDKIT_MODES, type RedkitConfig, type RedkitMode } from "./types.js";

export interface RedkitFactoryOptions {
	/** 配置文件路径（测试注入用，默认 ~/.pi/agent/ck-pi-redkit.json）。 */
	configPath?: string;
}

export default function piRedkit(
	pi: ExtensionAPI,
	initial: RedkitConfig = loadConfig(),
	options: RedkitFactoryOptions = {},
): void {
	let current = initial;
	const configPath = options.configPath ?? configFilePath();

	// 常驻处理器：off 时直接放行，零注入；切模式即时生效，无需 /reload。
	pi.on("before_agent_start", (event) => {
		if (current.mode === "off") return undefined;
		if (event.systemPrompt.includes(REDKIT_INJECTION_MARKER)) return undefined;
		const block = buildPromptBlock(current.mode);
		if (!block) return undefined;
		return { systemPrompt: `${event.systemPrompt}\n\n${block}` };
	});

	pi.registerCommand("redkit", {
		description: "Show redkit status or switch doctrine mode (full/pentest/reverse/off)",
		getArgumentCompletions: (prefix: string) => {
			const items = ["full", "pentest", "reverse", "off", "status"]
				.filter((value) => value.startsWith(prefix))
				.map((value) => ({ value, label: value }));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			await handleRedkitCommand(args, ctx, {
				getMode: () => current.mode,
				getPath: () => configPath,
				setMode: (mode) => {
					persistMode(configPath, mode);
					current = { ...current, mode };
				},
			});
		},
	});
}

export interface RedkitCommandDeps {
	getMode(): RedkitMode;
	getPath(): string;
	setMode(mode: RedkitMode): void;
}

export async function handleRedkitCommand(
	args: string,
	ctx: ExtensionCommandContext,
	deps: RedkitCommandDeps,
): Promise<void> {
	const token = args.trim().toLowerCase();
	if (!token || token === "status") {
		notify(ctx, `redkit mode: ${deps.getMode()} (config: ${deps.getPath()})`);
		if (!token) notify(ctx, "Usage: /redkit [full|pentest|reverse|off|status]");
		return;
	}
	if (!(REDKIT_MODES as readonly string[]).includes(token)) {
		notify(ctx, `Unknown redkit mode: ${token}. Usage: /redkit [full|pentest|reverse|off|status]`, "warning");
		return;
	}
	try {
		deps.setMode(token as RedkitMode);
	} catch (error) {
		notify(ctx, `redkit mode was not switched: ${formatError(error)}`, "error");
		return;
	}
	notify(ctx, `redkit mode switched to ${token} (takes effect immediately).`);
}

/** 把 mode 写回配置文件，保留文件里其他字段原样。 */
export function persistMode(configPath: string, mode: RedkitMode): void {
	let document: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			document = parsed as Record<string, unknown>;
		}
	} catch {
		// 文件不存在或损坏都从空对象起写，只保证 mode 落盘。
	}
	document.mode = mode;
	mkdirSync(dirname(configPath), { recursive: true });
	writeFileSync(configPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

function notify(
	ctx: ExtensionCommandContext,
	message: string,
	level: "info" | "warning" | "error" = "info",
): void {
	try {
		if (ctx.hasUI) ctx.ui.notify(message, level);
	} catch {
		// 通知失败不影响模式切换本身。
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
