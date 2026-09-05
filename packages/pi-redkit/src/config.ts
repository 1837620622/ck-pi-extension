/**
 * 配置文件加载：~/.pi/agent/ck-pi-redkit.json
 *
 * 只做宽松合并：文件缺失、JSON 损坏、字段类型不对都回退到默认值，
 * 绝不让配置问题阻断扩展加载。
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
	CONFIG_FILE_NAME,
	DEFAULT_CONFIG,
	REDKIT_MODES,
	SCOPE_ENFORCEMENTS,
	type RedkitConfig,
	type RedkitMode,
	type ScopeEnforcement,
} from "./types.js";

/** 配置文件体积上限：正常几百字节，超限直接回退默认（先 stat 后读）。 */
const MAX_CONFIG_BYTES = 64 * 1024;
/** allowlist 上限：条数与单条长度，避免超大配置拖慢每次加载。 */
const MAX_ALLOWLIST_ENTRIES = 200;
const MAX_ALLOWLIST_ENTRY_LENGTH = 253;

export function configFilePath(): string {
	return join(getAgentDir(), CONFIG_FILE_NAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadConfig(path = configFilePath()): RedkitConfig {
	const config: RedkitConfig = {
		...DEFAULT_CONFIG,
		allowlist: [...DEFAULT_CONFIG.allowlist],
	};
	let raw: string;
	try {
		if (statSync(path).size > MAX_CONFIG_BYTES) return config;
		raw = readFileSync(path, "utf8");
	} catch {
		return config;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return config;
	}
	if (!isRecord(parsed)) return config;

	if (typeof parsed.mode === "string" && (REDKIT_MODES as readonly string[]).includes(parsed.mode)) {
		config.mode = parsed.mode as RedkitMode;
	}
	if (
		typeof parsed.enforcement === "string" &&
		(SCOPE_ENFORCEMENTS as readonly string[]).includes(parsed.enforcement)
	) {
		config.enforcement = parsed.enforcement as ScopeEnforcement;
	}
	if (typeof parsed.engagementDir === "string" && parsed.engagementDir.trim().length > 0) {
		// 只接受相对目录名，避免配置把产物写到任意位置：
		// 拒绝绝对路径、~、Windows 盘符、反斜杠与 .. 穿越。
		const dir = parsed.engagementDir.trim();
		if (
			!dir.startsWith("/") &&
			!dir.startsWith("~") &&
			!/^[a-zA-Z]:/.test(dir) &&
			!dir.includes("\\") &&
			!dir.includes("..")
		) {
			config.engagementDir = dir;
		}
	}
	if (Array.isArray(parsed.allowlist)) {
		config.allowlist = parsed.allowlist
			.filter(
				(item): item is string =>
					typeof item === "string" &&
					item.trim().length > 0 &&
					item.trim().length <= MAX_ALLOWLIST_ENTRY_LENGTH,
			)
			.slice(0, MAX_ALLOWLIST_ENTRIES)
			.map((item) => item.trim());
	}
	return config;
}
