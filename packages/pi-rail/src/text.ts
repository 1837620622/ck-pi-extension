import { sliceByColumn, visibleWidth } from "@earendil-works/pi-tui";

// ------------------------------------------------------------
// 文本净化：去掉 Emoji（用户要求无表情包），保留科技线条符号。
// 科技符号白名单（系统字体可显示，非 Emoji）：
// π • · │ ─ ─ ▍ ^ v + ~ ? ! # $ / < > [ ] ( ) = - _ % ↑ ↓ … →
// ------------------------------------------------------------
const EMOJI_PATTERN = /\p{Extended_Pictographic}/gu;
const EMOJI_TEST = /\p{Extended_Pictographic}/u;
const VARIATION_SELECTOR_PATTERN = /[\uFE00-\uFE0F]/gu;
// ZWJ 序列残留的连接符单独出现时也去掉，避免悬空字符。
const ZWJ_PATTERN = /\u200D/gu;

/** 去掉 Emoji 与变体选择器，压缩多余空白。保留 ASCII 与常规符号。 */
export function stripEmoji(value: string): string {
	return value
		.replace(EMOJI_PATTERN, "")
		.replace(VARIATION_SELECTOR_PATTERN, "")
		.replace(ZWJ_PATTERN, "")
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
