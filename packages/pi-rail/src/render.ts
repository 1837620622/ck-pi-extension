import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
	Theme,
	ThemeColor,
	UIPromptKind,
} from "@earendil-works/pi-coding-agent";
import { sliceByColumn, visibleWidth } from "@earendil-works/pi-tui";
import { sanitizeTerminalText } from "@narumitw/pi-tui-kit/terminal-text";
import { formatDirectoryPath } from "./directory.js";
import {
	type ExtensionStatusRuntime,
	stripExtensionStatusPrefix,
	wrapExtensionStatusline,
} from "./extension-status.js";
import { formatGitBranchValue, type GitStatusSummary } from "./git-status.js";
import { composeAdaptiveLine } from "./powerline.js";
import { stripEmoji } from "./text.js";
import {
	LINE_BREAK_SEGMENT_NAME,
	type PowerlineBlockName,
	type RenderItem,
	type RenderSegment,
	type SegmentName,
	type StatuslineConfig,
	type TruncationDirection,
} from "./types.js";
import { type FooterUsageSummary, summarizeFooterUsage } from "./usage.js";

type ThinkingLevel = ReturnType<ExtensionAPI["getThinkingLevel"]>;
export interface RuntimeState extends ExtensionStatusRuntime {
	homeDir?: string;
	turnCount: number;
	activeTools: Map<string, number>;
	isStreaming: boolean;
	uiPrompt?: { kind: UIPromptKind; title?: string };
	thinkingLevel: ThinkingLevel;
	gitStatus?: GitStatusSummary;
	requestRender?: () => void;
}
const GITHUB_PR_KEY = "github-pr";
const GITHUB_PR_STATUS_KEYS = new Set([GITHUB_PR_KEY]);
export function renderStatusline(
	width: number,
	ctx: ExtensionContext,
	footerData: ReadonlyFooterDataProvider,
	theme: Theme,
	config: StatuslineConfig,
	runtime: RuntimeState,
	trueColor = true,
): string {
	if (width <= 0) return "";

	const usageSummary = summarizeFooterUsage(ctx.sessionManager.getEntries());
	const rows: Array<{ configuredSegments: number; segments: RenderSegment[] }> = [
		{ configuredSegments: 0, segments: [] },
	];
	for (const name of config.segments) {
		if (name === LINE_BREAK_SEGMENT_NAME) {
			rows.push({ configuredSegments: 0, segments: [] });
			continue;
		}

		const row = rows.at(-1);
		if (!row) continue;
		row.configuredSegments += 1;
		const rendered = buildSegment(name, ctx, footerData, config, runtime, usageSummary);
		if (rendered && rendered.text.length > 0) row.segments.push(rendered);
	}

	const segments: RenderItem[] = [];
	const renderedRows = rows.filter(
		(row) => row.configuredSegments === 0 || row.segments.length > 0,
	);
	for (const [index, row] of renderedRows.entries()) {
		if (index > 0) segments.push({ name: LINE_BREAK_SEGMENT_NAME });
		segments.push(...row.segments);
	}

	const rightParts = formatRightCluster(footerData.getExtensionStatuses());
	const isLight = isLightRailTheme(theme);
	return composeAdaptiveLine(width, segments, rightParts, config, trueColor, isLight);
}

function formatRightCluster(statuses: ReadonlyMap<string, string>): string[] {
	const parts: string[] = [];
	for (const [key, value] of statuses) {
		if (key === "statusline" || key === "github-pr") continue;
		// 去表情 + 去前缀，上游插件带什么符号都不会污染底栏。
		const text = stripEmoji(stripExtensionStatusPrefix(key, value));
		if (!text) continue;
		parts.push(text);
	}
	return parts.slice(0, 4);
}

/**
 * 主题跟随：从主题 text 前景色亮度推断明暗（自定义主题同样有效），
 * 浅色主题自动换浅底导轨，避免深色“腰带”。失败时按主题名启发式，默认深色。
 */
export function isLightRailTheme(theme: Theme): boolean {
	try {
		const rgb = parseAnsiForeground(theme.getFgAnsi("text"));
		if (rgb) return relativeLuminance(rgb) < 0.45;
	} catch {
		// 忽略，走主题名启发式。
	}
	return /light/i.test(theme.name ?? "");
}

function parseAnsiForeground(ansi: string): { red: number; green: number; blue: number } | undefined {
	const trueColor = /38;2;(\d{1,3});(\d{1,3});(\d{1,3})/.exec(ansi);
	if (trueColor) {
		return {
			red: Number(trueColor[1]),
			green: Number(trueColor[2]),
			blue: Number(trueColor[3]),
		};
	}
	const palette = /38;5;(\d{1,3})/.exec(ansi);
	if (palette) return ansi256ToRgb(Number(palette[1]));
	return undefined;
}

function ansi256ToRgb(code: number): { red: number; green: number; blue: number } {
	// 标准 16 色（xterm 近似值，亮度判断够用）。
	const standard: ReadonlyArray<readonly [number, number, number]> = [
		[0, 0, 0], [205, 0, 0], [0, 205, 0], [205, 205, 0],
		[0, 0, 238], [205, 0, 205], [0, 205, 205], [229, 229, 229],
		[127, 127, 127], [255, 0, 0], [0, 255, 0], [255, 255, 0],
		[92, 92, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
	];
	if (code < 16) {
		const [red = 128, green = 128, blue = 128] = standard[code] ?? [];
		return { red, green, blue };
	}
	if (code < 232) {
		const index = code - 16;
		const channel = (value: number) => (value === 0 ? 0 : value * 40 + 55);
		return {
			red: channel(Math.floor(index / 36)),
			green: channel(Math.floor((index % 36) / 6)),
			blue: channel(index % 6),
		};
	}
	const gray = (code - 232) * 10 + 8;
	return { red: gray, green: gray, blue: gray };
}

function relativeLuminance(rgb: { red: number; green: number; blue: number }): number {
	const linear = (channel: number) => {
		const value = channel / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linear(rgb.red) + 0.7152 * linear(rgb.green) + 0.0722 * linear(rgb.blue);
}

export function renderExtensionStatusline(
	width: number,
	footerData: ReadonlyFooterDataProvider,
	theme: Theme,
	config: StatuslineConfig,
	runtime: RuntimeState,
	mainLine: string,
	trueColor = true,
): string[] {
	const statuses = footerData.getExtensionStatuses();
	const prContext = prContextFromStatuses(statuses);
	const rendersPrInline = prContext !== undefined && mainLine.includes(prContext);
	const status = formatExtensionStatuses(
		statuses,
		theme,
		config,
		runtime,
		rendersPrInline ? GITHUB_PR_STATUS_KEYS : undefined,
		trueColor,
	);
	return wrapExtensionStatusline(status, width);
}

function buildSegment(
	name: SegmentName,
	ctx: ExtensionContext,
	footerData: ReadonlyFooterDataProvider,
	config: StatuslineConfig,
	runtime: RuntimeState,
	usageSummary: FooterUsageSummary,
): RenderSegment | undefined {
	switch (name) {
		case "brand":
			return segment(name, "π", config, "accent", "header", true);
		case "provider":
			return segment(name, stripEmoji(ctx.model?.provider ?? "no-provider"), config, "accent", "header");
		case "model": {
			const presentation = config.segmentText.model;
			const model = stripEmoji(
				truncateModel(
					shortenModel(ctx.model?.id ?? "no-model"),
					presentation.truncationLength,
					presentation.truncationSymbol,
					presentation.truncationDirection,
				),
			);
			return segment(name, model, config, "accent", "header");
		}
		case "thinking":
			return segment(
				name,
				runtime.thinkingLevel,
				config,
				thinkingColor(runtime.thinkingLevel),
				"header",
			);
		case "branch": {
			const branch = footerData.getGitBranch();
			const pr = branch ? prContextFromStatuses(footerData.getExtensionStatuses()) : undefined;
			return segment(
				name,
				stripEmoji(formatGitBranchValue(branch, runtime.gitStatus, pr)),
				config,
				"accent",
				"git",
			);
		}
		case "cwd":
			return segment(
				name,
				stripEmoji(formatDirectoryPath(ctx.cwd, runtime.homeDir, runtime.gitStatus?.root)),
				config,
				"accent",
				"directory",
			);
		case "tools": {
			const activity = formatToolActivity(runtime);
			return activity ? segment(name, stripEmoji(activity), config, "accent", "runtime") : undefined;
		}
		case "context": {
			const usage = ctx.getContextUsage();
			const percentage =
				usage?.percent === null || usage?.percent === undefined
					? "?"
					: `${usage.percent.toFixed(1)}%`;
			const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
			return segment(
				name,
				`${percentage}/${formatCount(contextWindow)}`,
				config,
				contextColor(usage?.percent),
				"runtime",
			);
		}
		case "tokens": {
			const value =
				usageSummary.input === 0 && usageSummary.output === 0
					? "tok 0"
					: `↑${formatCount(usageSummary.input)} ↓${formatCount(usageSummary.output)}`;
			return segment(name, value, config, "accent", "runtime");
		}
		case "cache": {
			if (usageSummary.cacheRead === 0 && usageSummary.cacheWrite === 0) return undefined;
			const values: string[] = [];
			if (usageSummary.cacheRead > 0) values.push(`R${formatCount(usageSummary.cacheRead)}`);
			if (usageSummary.cacheWrite > 0) values.push(`W${formatCount(usageSummary.cacheWrite)}`);
			if (usageSummary.latestCacheHitRate !== undefined) {
				values.push(`CH${usageSummary.latestCacheHitRate.toFixed(1)}%`);
			}
			return segment(name, values.join(" "), config, "accent", "runtime");
		}
		case "cost": {
			const subscription = isSubscriptionBacked(ctx) ? " (sub)" : "";
			return segment(
				name,
				`${usageSummary.cost.toFixed(usageSummary.cost >= 1 ? 2 : 3)}${subscription}`,
				config,
				"accent",
				"meter",
			);
		}
		case "time":
			return segment(name, formatTime(), config, "accent", "meter");
		case "turn":
			return segment(name, `${runtime.turnCount}`, config, "accent", "meter");
	}
}

function segment(
	name: SegmentName,
	value: string,
	config: StatuslineConfig,
	color: RenderSegment["color"],
	block: PowerlineBlockName,
	emphasis = false,
): RenderSegment {
	return { name, text: formatConfiguredSegment(name, value, config), color, block, emphasis };
}

export function formatConfiguredSegment(
	name: SegmentName,
	value: string,
	config: Pick<StatuslineConfig, "segmentText">,
): string {
	const presentation = config.segmentText[name];
	return `${presentation.prefix}${value}${presentation.suffix}`;
}

function thinkingColor(level: ThinkingLevel): ThemeColor {
	switch (level as string) {
		case "off":
			return "dim";
		case "minimal":
			return "thinkingMinimal";
		case "low":
			return "thinkingLow";
		case "medium":
			return "thinkingMedium";
		case "high":
			return "thinkingHigh";
		case "xhigh":
			return "thinkingXhigh";
		case "max":
			return "thinkingMax" as ThemeColor;
		default:
			return "dim";
	}
}

export function contextColor(percent: number | null | undefined): ThemeColor {
	if (percent === null || percent === undefined) return "dim";
	if (percent >= 90) return "error";
	if (percent >= 70) return "warning";
	return "success";
}

const MAX_UI_PROMPT_TITLE_CODE_POINTS = 256;
const MAX_UI_PROMPT_TITLE_WIDTH = 40;

function boundUIPromptTitleLength(title: string): string {
	let end = 0;
	let ellipsisEnd = 0;
	let codePoints = 0;
	while (end < title.length && codePoints < MAX_UI_PROMPT_TITLE_CODE_POINTS) {
		const codePoint = title.codePointAt(end) ?? 0;
		end += codePoint > 0xffff ? 2 : 1;
		codePoints += 1;
		if (codePoints < MAX_UI_PROMPT_TITLE_CODE_POINTS) ellipsisEnd = end;
	}
	return end < title.length ? `${title.slice(0, ellipsisEnd)}…` : title;
}

function formatUIPromptTitle(title: string | undefined): string {
	const safeTitle = title ? sanitizeTerminalText(title).trim() : "";
	const boundedTitle = boundUIPromptTitleLength(safeTitle);
	if (visibleWidth(boundedTitle) <= MAX_UI_PROMPT_TITLE_WIDTH) return boundedTitle;
	return `${sliceByColumn(boundedTitle, 0, MAX_UI_PROMPT_TITLE_WIDTH - 1, true)}…`;
}

export function formatToolActivity(runtime: RuntimeState): string | undefined {
	if (runtime.uiPrompt) {
		const title = formatUIPromptTitle(runtime.uiPrompt.title);
		return `wait ${runtime.uiPrompt.kind}${title ? ` ${title}` : ""}`;
	}

	const active = [...runtime.activeTools.entries()];
	if (active.length > 0) {
		const [name, count] = active[0] ?? ["tool", 1];
		const suffix = count > 1 ? `x${count}` : active.length > 1 ? `+${active.length - 1}` : "";
		return `${name}${suffix}`;
	}

	return runtime.isStreaming ? "run" : undefined;
}

export function prLinkFromStatuses(statuses: ReadonlyMap<string, string>): string | undefined {
	const value = statuses.get(GITHUB_PR_KEY);
	if (!value) return undefined;
	// Extract the OSC 8 hyperlink span (the clickable "#123"); skip non-PR states
	// like "PR gh missing" that carry no link. github-pr emits exactly one link, so the
	// first OSC 8 span is the PR number.
	const open = value.indexOf("\x1b]8;;");
	if (open === -1) return undefined;
	const closeMarker = "\x1b]8;;\x07";
	const close = value.indexOf(closeMarker, open + 1);
	return close === -1 ? undefined : value.slice(open, close + closeMarker.length);
}

export function prContextFromStatuses(statuses: ReadonlyMap<string, string>): string | undefined {
	const value = statuses.get(GITHUB_PR_KEY);
	if (!value) return undefined;
	const link = prLinkFromStatuses(statuses);
	const reference = link ?? plainPrReference(value);
	if (!reference) return undefined;

	const state = compactPrState(link ? value.replace(link, "") : value);
	const context = state ? `${reference} · ${state}` : undefined;
	return context ? stripEmoji(context) : undefined;
}

function plainPrReference(value: string): string | undefined {
	return /^PR\s+(#\d+):/u.exec(value)?.[1];
}

function compactPrState(value: string): string | undefined {
	if (/:\s*merged\s*$/.test(value)) return "merged";
	if (/:\s*closed\s*$/.test(value)) return "closed";
	if (/\bdraft\b/.test(value)) return "draft";

	const failing = /\bchecks failing \((\d+)\)/.exec(value);
	if (failing) return `${failing[1]} failing`;
	if (/\bchanges requested\b/.test(value)) return "changes requested";

	const pending = /\bchecks pending \((\d+)\)/.exec(value);
	if (pending) return `${pending[1]} pending`;
	if (/\bapproved\b/.test(value)) return "approved";
	if (/\breview required\b/.test(value)) return "review required";
	if (/\bchecks passing\b/.test(value)) return "checks passing";
	if (/\bno checks\b/.test(value)) return "no checks";
	return undefined;
}

function isSubscriptionBacked(ctx: ExtensionContext): boolean {
	const model = ctx.model;
	return (
		model !== undefined &&
		(model.provider === "kimi-coding" || ctx.modelRegistry.isUsingOAuth(model))
	);
}

export function formatCount(value: number): string {
	if (value < 1000) return `${value}`;
	if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
	return `${(value / 1_000_000).toFixed(1)}m`;
}

function formatTime(): string {
	const now = new Date();
	const hours = now.getHours().toString().padStart(2, "0");
	const minutes = now.getMinutes().toString().padStart(2, "0");
	return `${hours}:${minutes}`;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function truncateModel(
	model: string,
	length: number,
	symbol: string,
	direction: TruncationDirection,
): string {
	const safeModel = sanitizeTerminalText(model);
	if (length === 0) return safeModel;
	const graphemes = [...graphemeSegmenter.segment(safeModel)].map(({ segment }) => segment);
	if (graphemes.length <= length) return safeModel;
	const safeSymbol = sanitizeTerminalText(symbol);

	switch (direction) {
		case "start":
			return `${safeSymbol}${graphemes.slice(-length).join("")}`;
		case "middle": {
			const headLength = Math.ceil(length / 2);
			const tailLength = Math.floor(length / 2);
			const tail = tailLength > 0 ? graphemes.slice(-tailLength).join("") : "";
			return `${graphemes.slice(0, headLength).join("")}${safeSymbol}${tail}`;
		}
		case "end":
			return `${graphemes.slice(0, length).join("")}${safeSymbol}`;
	}
}

export function shortenModel(model: string): string {
	return model
		.replace(/^claude-/, "")
		.replace(/^gpt-/, "gpt ")
		.replace(/-20\d{6}$/, "")
		.replace(/-latest$/, "");
}
