import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { ansiStyle } from "./ansi.js";
import {
	FILL_BG,
	FILL_BG_LIGHT,
	FILL_FG,
	FILL_FG_LIGHT,
	LEAD_FG,
	LEAD_FG_LIGHT,
	LEAD_GLYPH,
	RIGHT_DIVIDER,
	RIGHT_DIVIDER_FG,
	RIGHT_DIVIDER_FG_LIGHT,
	RIGHT_PART_SEPARATOR,
} from "./icons.js";
import { resolvePreset } from "./presets/index.js";
import { stripEmoji, truncatePath, truncateToWidthWithEllipsis } from "./text.js";
import type { BlockColors, PowerlinePreset } from "./presets/types.js";
import {
	LINE_BREAK_SEGMENT_NAME,
	type PalettePreset,
	type PowerlineBlockName,
	type RenderItem,
	type RenderSegment,
	type SegmentPalette,
	type SeparatorName,
	type StatuslineConfig,
} from "./types.js";

interface PowerlineBlock {
	baseBlock: PowerlineBlockName;
	colors: BlockColors;
	segments: RenderSegment[];
}

export interface RailChrome {
	fillBg: string;
	fillFg: string;
	leadFg: string;
	dividerFg: string;
}

export const DARK_CHROME: RailChrome = {
	fillBg: FILL_BG,
	fillFg: FILL_FG,
	leadFg: LEAD_FG,
	dividerFg: RIGHT_DIVIDER_FG,
};

export const LIGHT_CHROME: RailChrome = {
	fillBg: FILL_BG_LIGHT,
	fillFg: FILL_FG_LIGHT,
	leadFg: LEAD_FG_LIGHT,
	dividerFg: RIGHT_DIVIDER_FG_LIGHT,
};

export function resolveChrome(isLight: boolean): RailChrome {
	return isLight ? LIGHT_CHROME : DARK_CHROME;
}

const LEAD_WIDTH = 1;
const MAX_RIGHT_PARTS = 4;

type RailConfig = Pick<
	StatuslineConfig,
	"palettePreset" | "palette" | "density" | "separator"
>;

/** 右侧状态归一化：去表情、去空、最多保留 4 段，保证全终端可读。 */
export function splitRightParts(rightText: string | readonly string[]): string[] {
	const rawParts =
		typeof rightText === "string"
			? rightText.split("|")
			: [...rightText];
	return rawParts
		.map((part) => stripEmoji(part))
		.filter((part) => part.length > 0)
		.slice(0, MAX_RIGHT_PARTS);
}

export function renderPowerlineStatusline(
	width: number,
	items: RenderItem[],
	config: RailConfig,
	trueColor = true,
	isLight = false,
): string {
	if (width <= 0) return "";
	const chrome = resolveChrome(isLight);
	return splitLines(sanitizeItems(items))
		.map((segments) => composePlainLine(width, segments, config, chrome, trueColor))
		.join("\n");
}

/**
 * 左簇 + 导轨填充 + 右簇，逐行精确铺满终端宽度。
 * 全屏拉宽时填充自动伸长；窗口缩窄时先压缩弹性段（cwd/model/branch）、
 * 再按优先级丢次要段、最后硬截断，保证 visibleWidth(line) === width。
 */
export function composeAdaptiveLine(
	width: number,
	leftItems: RenderItem[],
	rightText: string | readonly string[],
	config: RailConfig,
	trueColor = true,
	isLight = false,
): string {
	if (width <= 0) return "";
	const chrome = resolveChrome(isLight);
	const lines = splitLines(sanitizeItems(leftItems));
	const parts = splitRightParts(rightText);
	return lines
		.map((segments, index) =>
			index === lines.length - 1
				? composeLastLine(width, segments, parts, config, chrome, trueColor)
				: composePlainLine(width, segments, config, chrome, trueColor),
		)
		.join("\n");
}

/** 排版入口统一去表情：任何调用方传进来的文本都先净化，底栏永不出现表情包。 */
function sanitizeItems(items: RenderItem[]): RenderItem[] {
	return items.map((item) =>
		item.name === LINE_BREAK_SEGMENT_NAME
			? item
			: { ...item, text: stripEmoji(item.text) },
	);
}

function composePlainLine(
	width: number,
	segments: RenderSegment[],
	config: RailConfig,
	chrome: RailChrome,
	trueColor: boolean,
): string {
	const left = fitSegmentsToBudget(segments, Math.max(0, width - LEAD_WIDTH), config, trueColor);
	return `${renderLead(chrome, trueColor)}${padLine(left.text, width - LEAD_WIDTH, chrome, trueColor)}`;
}

function composeLastLine(
	width: number,
	segments: RenderSegment[],
	parts: string[],
	config: RailConfig,
	chrome: RailChrome,
	trueColor: boolean,
): string {
	const lead = renderLead(chrome, trueColor);
	// 基准：不放右簇时左侧能保住哪些段；右簇只有在不造成丢段时才保留。
	const alone = fitSegmentsToBudget(segments, Math.max(0, width - LEAD_WIDTH), config, trueColor);
	// 右簇从全保留到全丢逐档尝试：优先保住左侧核心信息。
	for (let keep = parts.length; keep >= 0; keep -= 1) {
		const right = renderRight(parts.slice(0, keep), chrome, trueColor);
		const rightWidth = visibleWidth(right);
		const leftBudget = width - LEAD_WIDTH - rightWidth;
		if (leftBudget < 0) continue;
		const left = fitSegmentsToBudget(segments, leftBudget, config, trueColor);
		if (keep > 0 && left.names !== alone.names) continue;
		const leftWidth = visibleWidth(left.text);
		if (LEAD_WIDTH + leftWidth + rightWidth > width) continue;
		const fill = renderFill(width - LEAD_WIDTH - leftWidth - rightWidth, chrome, trueColor);
		return `${lead}${left.text}${fill}${right}`;
	}
	// 极窄终端兜底：只放起始刻度，其余全填导轨，保证不溢出。
	return `${lead}${renderFill(Math.max(0, width - LEAD_WIDTH), chrome, trueColor)}`;
}

function renderLead(chrome: RailChrome, trueColor: boolean): string {
	return ansiStyle(LEAD_GLYPH, { fg: chrome.leadFg, bg: chrome.fillBg }, trueColor);
}

function renderRight(parts: string[], chrome: RailChrome, trueColor: boolean): string {
	if (parts.length === 0) return "";
	const divider = ansiStyle(
		` ${RIGHT_DIVIDER} `,
		{ fg: chrome.dividerFg, bg: chrome.fillBg },
		trueColor,
	);
	const body = ansiStyle(parts.join(RIGHT_PART_SEPARATOR), { fg: chrome.fillFg, bg: chrome.fillBg }, trueColor);
	return `${divider}${body}`;
}

function renderFill(size: number, chrome: RailChrome, trueColor: boolean): string {
	if (size <= 0) return "";
	return ansiStyle(" ".repeat(size), { fg: chrome.fillFg, bg: chrome.fillBg }, trueColor);
}

function padLine(left: string, budget: number, chrome: RailChrome, trueColor: boolean): string {
	return `${left}${renderFill(Math.max(0, budget - visibleWidth(left)), chrome, trueColor)}`;
}

function splitLines(items: RenderItem[]): RenderSegment[][] {
	const lines: RenderSegment[][] = [[]];
	for (const item of items) {
		if (item.name === LINE_BREAK_SEGMENT_NAME) lines.push([]);
		else lines.at(-1)?.push(item);
	}
	return lines;
}

const SEGMENT_RETENTION_PRIORITY: Readonly<Record<RenderSegment["name"], number>> = {
	context: 120,
	model: 110,
	branch: 100,
	tools: 90,
	cwd: 80,
	thinking: 70,
	cost: 60,
	provider: 50,
	cache: 45,
	tokens: 40,
	time: 30,
	turn: 20,
	brand: 10,
};

/**
 * 渐进式装箱：
 * 1) 弹性段（cwd / model / branch）按档压缩，保段不丢信息；
 * 2) 仍超宽则按保留优先级丢次要段；
 * 3) 只剩一段还超宽则硬截断，保证永不溢出、左侧永不消失。
 */
function fitSegmentsToBudget(
	segments: readonly RenderSegment[],
	budget: number,
	config: RailConfig,
	trueColor: boolean,
): { text: string; names: string } {
	if (segments.length === 0 || budget <= 0) return { text: "", names: "" };
	const originals = segments.map((segment) => segment.text);
	let current = segments.map((segment) => ({ ...segment }));
	let cwdLevel = 0;
	let modelLevel = 0;
	let branchLevel = 0;
	const done = () => ({
		text: joinPowerlineSegments(current, config, trueColor),
		names: current.map((segment) => segment.name).join(","),
	});
	for (let step = 0; step < 64; step += 1) {
		const rendered = joinPowerlineSegments(current, config, trueColor);
		if (visibleWidth(rendered) <= budget) return { text: rendered, names: current.map((segment) => segment.name).join(",") };
		const target = widestShrinkableIndex(current, cwdLevel, modelLevel, branchLevel);
		if (target) {
			if (target.kind === "cwd") {
				cwdLevel += 1;
				current[target.index] = {
					...current[target.index],
					text: shrinkCwd(originals[target.index] ?? "", cwdLevel),
				} as RenderSegment;
			} else if (target.kind === "model") {
				modelLevel += 1;
				current[target.index] = {
					...current[target.index],
					text: shrinkText(originals[target.index] ?? "", MODEL_SHRINK_CAPS[modelLevel] ?? 8),
				} as RenderSegment;
			} else {
				branchLevel += 1;
				current[target.index] = {
					...current[target.index],
					text: shrinkText(originals[target.index] ?? "", BRANCH_SHRINK_CAPS[branchLevel] ?? 12),
				} as RenderSegment;
			}
			continue;
		}
		if (current.length > 1) {
			const dropIndex = findDropIndex(current);
			current.splice(dropIndex, 1);
			originals.splice(dropIndex, 1);
			continue;
		}
		return {
			text: joinPowerlineSegments(
				[hardTruncateSegment(current[0] as RenderSegment, budget, config, trueColor)],
				config,
				trueColor,
			),
			names: (current[0] as RenderSegment).name,
		};
	}
	return done();
}

const CWD_SHRINK_CAPS = [32, 24, 16, 12];
const MODEL_SHRINK_CAPS = [24, 16, 12, 8];
const BRANCH_SHRINK_CAPS = [32, 24, 16, 12];
const MAX_SHRINK_LEVEL = 4;

function shrinkCwd(text: string, level: number): string {
	return truncatePath(text, CWD_SHRINK_CAPS[Math.min(level - 1, CWD_SHRINK_CAPS.length - 1)] ?? 12);
}

function shrinkText(text: string, cap: number): string {
	return truncateToWidthWithEllipsis(text, cap);
}

function findDropIndex(current: RenderSegment[]): number {
	let dropIndex = 0;
	for (let index = 1; index < current.length; index += 1) {
		const candidate = current[index];
		const currentBest = current[dropIndex];
		if (
			candidate &&
			currentBest &&
			(SEGMENT_RETENTION_PRIORITY[candidate.name] ?? 0) <
				(SEGMENT_RETENTION_PRIORITY[currentBest.name] ?? 0)
		) {
			dropIndex = index;
		}
	}
	return dropIndex;
}

/** 单段兜底：扣除色块内边距后截断文本，保证精确 fitting。 */
function hardTruncateSegment(
	segment: RenderSegment,
	budget: number,
	config: RailConfig,
	trueColor: boolean,
): RenderSegment {
	const overhead = visibleWidth(
		joinPowerlineSegments([{ ...segment, text: "" }], config, trueColor),
	);
	return { ...segment, text: truncateToWidthWithEllipsis(segment.text, Math.max(0, budget - overhead)) };
}

function widestShrinkableIndex(
	current: RenderSegment[],
	cwdLevel: number,
	modelLevel: number,
	branchLevel: number,
): { index: number; kind: "cwd" | "model" | "branch" } | undefined {
	let best: { index: number; kind: "cwd" | "model" | "branch"; width: number } | undefined;
	for (const [index, segment] of current.entries()) {
		const level =
			segment.name === "cwd" ? cwdLevel : segment.name === "model" ? modelLevel : segment.name === "branch" ? branchLevel : MAX_SHRINK_LEVEL;
		if (level >= MAX_SHRINK_LEVEL) continue;
		if (segment.name !== "cwd" && segment.name !== "model" && segment.name !== "branch") continue;
		const width = visibleWidth(segment.text);
		if (width <= 12) continue;
		if (!best || width > best.width) best = { index, kind: segment.name, width };
	}
	return best;
}

export function powerlineExtensionSeparator(
	_theme: Theme,
	palettePreset: PalettePreset = "tokyo-night",
	trueColor = true,
): string {
	return ansiStyle(" • ", { fg: resolvePreset(palettePreset).extensionSeparator }, trueColor);
}

function joinPowerlineSegments(
	segments: RenderSegment[],
	config: RailConfig,
	trueColor: boolean,
): string {
	const preset = resolvePreset(config.palettePreset);
	const blocks = contiguousBlocks(segments, preset, config.palettePreset, config.palette);
	let line = "";

	for (const block of blocks) {
		line += ansiStyle(formatBlockText(block, config), block.colors, trueColor);
	}
	return line;
}

function contiguousBlocks(
	segments: RenderSegment[],
	preset: PowerlinePreset,
	palettePreset: PalettePreset,
	configuredPalette: SegmentPalette,
): PowerlineBlock[] {
	const blocks: PowerlineBlock[] = [];
	const usesConfiguredColors = palettePreset === "custom";
	for (const segment of segments) {
		const colors = usesConfiguredColors
			? (configuredPalette[segment.name] ?? {})
			: preset.blocks[segment.block];
		const previous = blocks.at(-1);
		const matchesPrevious =
			previous !== undefined &&
			(usesConfiguredColors
				? colorsEqual(previous.colors, colors)
				: previous.baseBlock === segment.block);
		if (matchesPrevious) previous.segments.push(segment);
		else blocks.push({ baseBlock: segment.block, colors, segments: [segment] });
	}
	return blocks;
}

function colorsEqual(left: BlockColors, right: BlockColors): boolean {
	return left.fg === right.fg && left.bg === right.bg;
}

function formatBlockText(
	block: PowerlineBlock,
	config: Pick<StatuslineConfig, "density" | "separator">,
): string {
	const texts = block.segments.map(formatSegmentText);
	const separator = separatorText(config.separator, config.density === "cozy");
	const leading = config.density === "cozy" ? "  " : " ";
	const trailing = config.density === "cozy" ? " " : "";
	return `${leading}${texts.join(separator)}${trailing}`;
}

function formatSegmentText(segment: RenderSegment): string {
	return segment.emphasis ? `\u001b[1m${segment.text}\u001b[22m` : segment.text;
}

function separatorText(separator: SeparatorName, cozy: boolean): string {
	const padding = cozy ? "  " : " ";
	switch (separator) {
		case "dot":
			return `${padding}•${padding}`;
		case "bar":
			return `${padding}│${padding}`;
		case "powerline":
			return padding;
		case "round":
			return `${padding}/${padding}`;
		case "none":
			return padding;
	}
}
