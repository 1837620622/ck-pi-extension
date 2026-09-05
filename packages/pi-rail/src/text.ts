import { sliceByColumn, visibleWidth } from "@earendil-works/pi-tui";

// ------------------------------------------------------------
// 文本净化：去掉 Emoji（用户要求无表情包），保留科技线条符号。
// 科技符号白名单（系统字体可显示，非 Emoji）：
// π • · │ ─ ┃ › ↑ ↓ … → ^ v + ~ ? ! # $ / < > [ ] ( ) = - _ %
// ------------------------------------------------------------
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;
const EMOJI_TEST = /\p{Extended_Pictographic}/u;
// Emoji 组装残件与隐形字符（审计 L-3 加固）：
// - U+FE00-FE0F 变体选择器（含 VS16）、U+20E3 keycap 圈、U+E0020-E007F tags、U+E0100-E01EF 变体补充
// - U+200D ZWJ、U+200B/U+200C/U+2060/U+FEFF/U+00AD 零宽与格式字符
// - U+200E/U+200F/U+202A-U+202E/U+2066-U+2069/U+061C 双向覆盖（视觉欺骗）
// 注意：终端转义（ESC/CSI/OSC）不在此处理，由 sanitizeTerminalText 负责，调用方两者叠加使用。
const EMOJI_GLUE_PATTERN =
	/[\u{FE00}-\u{FE0F}\u{20E3}\u{E0020}-\u{E007F}\u{E0100}-\u{E01EF}\u{200B}\u{200C}\u{2060}\u{FEFF}\u{00AD}\u{200E}\u{200F}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{061C}\u{200D}]/gu;

/** 去掉 Emoji 与变体选择器，压缩多余空白。保留 ASCII 与常规符号。 */
export function stripEmoji(value: string): string {
	return value
		.replace(EMOJI_PATTERN, "")
		.replace(EMOJI_GLUE_PATTERN, "")
		.replace(/\s+/g, " ")
		.trim();
}

/** 是否还残留 Emoji（测试与诊断用）。 */
export function containsEmoji(value: string): boolean {
	return EMOJI_TEST.test(value);
}

/** 按终端列宽截断，末尾加省略号，保证可见宽度 <= maxWidth。 */
export function truncateToWidthWithEllipsis(value: string, maxWidth: number): string {
	if (maxWidth <= 0) return "";
	if (visibleWidth(value) <= maxWidth) return value;
	if (maxWidth === 1) return "…";
	return `${sliceByColumn(value, 0, maxWidth - 1, true)}…`;
}

/**
 * 路径渐进压缩：优先丢掉中间目录，保留首尾。
 * 例：~/a/b/c/d -> …/c/d -> …/d
 */
export function truncatePath(value: string, maxWidth: number): string {
	if (visibleWidth(value) <= maxWidth) return value;
	const parts = value.split("/");
	if (parts.length <= 1) return truncateToWidthWithEllipsis(value, maxWidth);
	// 逐步丢掉左侧目录，保留右侧，前面加 …/
	for (let keep = parts.length - 1; keep >= 1; keep -= 1) {
		const candidate = `…/${parts.slice(parts.length - keep).join("/")}`;
		if (visibleWidth(candidate) <= maxWidth) return candidate;
	}
	return truncateToWidthWithEllipsis(value, maxWidth);
}
