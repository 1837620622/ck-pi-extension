/**
 * 不使用 emoji，也不使用 Nerd Font 私有区字形。
 * 各终端用系统字体就能显示；状态靠 ANSI 色块区分，不靠表情。
 */
export const DEFAULT_SEGMENT_PREFIX: Record<string, string> = {
	brand: "",
	provider: "",
	model: "",
	thinking: "",
	cwd: "",
	branch: "",
	tools: "",
	context: "ctx ",
	tokens: "",
	cache: "cache ",
	cost: "$",
	time: "",
	turn: "#",
};

/** 扩展状态不插图标。未知键保持空，避免回退成表情。 */
export const DEFAULT_EXTENSION_STATUS_ICONS: Record<string, string> = {
	accounts: "",
	caffeinate: "",
	"chrome-devtools": "",
	firecrawl: "",
	"github-pr": "",
	goal: "",
	"google-genai": "",
	lsp: "",
	"plan-mode": "",
	retry: "",
	subagents: "",
	sync: "",
	usage: "",
	"codex-usage": "",
	pisync: "",
	"unknown-error-retry": "",
	tokenSpeed: "",
	mcp: "",
	"mcp-adapter": "",
};

export const FILL_BG = "#181825";
export const FILL_FG = "#a6adc8";
// 浅色主题跟随：深底换成浅灰底，保证浅色终端下不出现“黑腰带”。
export const FILL_BG_LIGHT = "#e2e8f0";
export const FILL_FG_LIGHT = "#475569";

/**
 * 科技风导轨（全终端兼容说明）：
 * LEAD_GLYPH 用重竖线 U+2503：属于 Box Drawing 区，
 * Menlo / SF Mono / Cascadia / DejaVu / Noto 及 Linux 控制台字库全带，
 * 不依赖 Nerd Font，不用 Emoji，与分隔符 │ 同族、大众顺眼。
 * RIGHT_PART_SEPARATOR 用 Latin-1 的 ·，ASCII  fallback 也可读。
 */
export const LEAD_GLYPH = "┃";
export const LEAD_FG = "#22d3ee";
export const LEAD_FG_LIGHT = "#0891b2";
export const RIGHT_DIVIDER = "│";
export const RIGHT_DIVIDER_FG = "#45475a";
export const RIGHT_DIVIDER_FG_LIGHT = "#94a3b8";
export const RIGHT_PART_SEPARATOR = " · ";

const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function isForbiddenKey(key: string): boolean {
	return FORBIDDEN_OBJECT_KEYS.has(key);
}
