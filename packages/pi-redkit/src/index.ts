/**
 * pi-redkit 入口
 *
 * 当前阶段只做一件事，且做死：把授权安全作战条令钉进系统提示词。
 * 通过 before_agent_start 在每次 agent 循环启动前重注入，
 * 压缩（compaction）后系统提示词重建时条令依旧在场，不会丢失。
 *
 * 模式与开关来自 ~/.pi/agent/ck-pi-redkit.json（见 config.ts）：
 * - mode: "off" 完全停用（不注入）
 * - mode: "pentest" 核心条令 + 渗透作战条令
 * - mode: "reverse" 核心条令 + 网络与协议逆向条令
 * - mode: "full"    全量（默认）
 *
 * 后续阶段再挂载工具、scope 守卫、技能与提示词模板。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.js";
import { buildPromptBlock } from "./prompt.js";
import type { RedkitConfig } from "./types.js";

export default function piRedkit(pi: ExtensionAPI, config: RedkitConfig = loadConfig()): void {
	// 默认在加载期读取一次配置；/reload 会重新执行本工厂函数，配置随之刷新
	if (config.mode === "off") return;

	pi.on("before_agent_start", (event) => {
		const block = buildPromptBlock(config.mode);
		if (!block) return undefined;
		return { systemPrompt: event.systemPrompt + "\n\n" + block };
	});
}
