import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { INFORMATION_PROFILES } from "./information-profiles.js";
import { segmentPaletteForPreset } from "./presets/index.js";
import {
	type ConfigSegmentName,
	DENSITIES,
	LINE_BREAK_SEGMENT_NAME,
	PALETTE_NAMES,
	PALETTE_PRESET_NAMES,
	type PaletteName,
	SEGMENT_NAMES,
	SEPARATOR_NAMES,
	type SegmentName,
	type SegmentPalette,
	type StatuslineConfig,
	TRUNCATION_DIRECTIONS,
} from "./types.js";

import { DEFAULT_EXTENSION_STATUS_ICONS, DEFAULT_SEGMENT_PREFIX, isForbiddenKey } from "./icons.js";
import { containsEmoji } from "./text.js";

export const SETTINGS_FILE_NAME = "ck-pi-rail.json";
const LEGACY_SETTINGS_FILE_NAME = "pi-statusline.json";
const MAX_SETTINGS_DOCUMENT_LENGTH = 1024 * 1024;

export { DEFAULT_EXTENSION_STATUS_ICONS };

const DEFAULT_DOCUMENT_EXTENSION_STATUS_ICONS: Record<string, string> = {
	...DEFAULT_EXTENSION_STATUS_ICONS,
};

const LEGACY_STATUS_ICON_KEYS = {
	pisync: "sync",
	"unknown-error-retry": "retry",
} as const;

const DEFAULT_SEGMENTS: SegmentName[] = [...INFORMATION_PROFILES.full];

export const DEFAULT_STATUSLINE_CONFIG: StatuslineConfig = {
	palettePreset: "custom",
	palette: {
		brand: { fg: "#0b1220", bg: "#22d3ee" },
		provider: { fg: "#0b1220", bg: "#38bdf8" },
		model: { fg: "#0b1220", bg: "#22d3ee" },
		thinking: { fg: "#e2e8f0", bg: "#334155" },
		cwd: { fg: "#e2e8f0", bg: "#1e293b" },
		branch: { fg: "#0b1220", bg: "#34d399" },
		tools: { fg: "#0b1220", bg: "#f59e0b" },
		context: { fg: "#e2e8f0", bg: "#0f172a" },
		tokens: { fg: "#0b1220", bg: "#38bdf8" },
		cache: { fg: "#0b1220", bg: "#22d3ee" },
		cost: { fg: "#0b1220", bg: "#fbbf24" },
		time: { fg: "#94a3b8", bg: "#020617" },
		turn: { fg: "#cbd5e1", bg: "#1e293b" },
	},
	density: "compact",
	separator: "bar",
	segments: DEFAULT_SEGMENTS,
	segmentText: {
		brand: { prefix: DEFAULT_SEGMENT_PREFIX.brand, suffix: "" },
		provider: { prefix: DEFAULT_SEGMENT_PREFIX.provider, suffix: "" },
		model: {
			prefix: DEFAULT_SEGMENT_PREFIX.model,
			suffix: "",
			truncationLength: 36,
			truncationSymbol: "…",
			truncationDirection: "start",
		},
		thinking: { prefix: DEFAULT_SEGMENT_PREFIX.thinking, suffix: "" },
		cwd: { prefix: DEFAULT_SEGMENT_PREFIX.cwd, suffix: "" },
		branch: { prefix: DEFAULT_SEGMENT_PREFIX.branch, suffix: "" },
		tools: { prefix: DEFAULT_SEGMENT_PREFIX.tools, suffix: "" },
		context: { prefix: DEFAULT_SEGMENT_PREFIX.context, suffix: "" },
		tokens: { prefix: DEFAULT_SEGMENT_PREFIX.tokens, suffix: "" },
		cache: { prefix: DEFAULT_SEGMENT_PREFIX.cache, suffix: "" },
		cost: { prefix: DEFAULT_SEGMENT_PREFIX.cost, suffix: "" },
		time: { prefix: DEFAULT_SEGMENT_PREFIX.time, suffix: "" },
		turn: { prefix: DEFAULT_SEGMENT_PREFIX.turn, suffix: "" },
	},
	extensionStatusIcons: DEFAULT_EXTENSION_STATUS_ICONS,
};

const DEFAULT_STATUSLINE_DOCUMENT_CONFIG = {
	palettePreset: DEFAULT_STATUSLINE_CONFIG.palettePreset,
	density: DEFAULT_STATUSLINE_CONFIG.density,
	separator: DEFAULT_STATUSLINE_CONFIG.separator,
	segments: DEFAULT_SEGMENTS,
	segmentText: DEFAULT_STATUSLINE_CONFIG.segmentText,
	extensionStatusIcons: DEFAULT_DOCUMENT_EXTENSION_STATUS_ICONS,
} satisfies Omit<StatuslineConfig, "palette">;

export const DEFAULT_STATUSLINE_DOCUMENT = `${JSON.stringify(
	DEFAULT_STATUSLINE_DOCUMENT_CONFIG,
	null,
	"\t",
)}\n`;

export interface StatuslineConfigDiagnostic {
	severity: "warning" | "error";
	code: "unknown" | "invalid" | "parse" | "io";
	path: string;
	message: string;
}

export interface StatuslineFileIdentity {
	dev: number;
	ino: number;
	/** 读取时刻的 mtime/size，用于保存前 CAS 比对，缺失则只比 dev+ino。 */
	mtimeMs?: number;
	size?: number;
}

export interface LoadedStatuslineSettings {
	config: StatuslineConfig;
	source: "built-in" | "user";
	settingsPath: string;
	rawDocument?: string;
	fileIdentity?: StatuslineFileIdentity;
	diagnostics: StatuslineConfigDiagnostic[];
}

interface AtomicFileSystem {
	mkdirSync: typeof mkdirSync;
	writeFileSync: typeof writeFileSync;
	renameSync: typeof renameSync;
	rmSync: typeof rmSync;
}

let pendingSettingsNotice: string | undefined;

export function settingsFilePath(agentDir = getAgentDir()): string {
	return join(agentDir, SETTINGS_FILE_NAME);
}

export function createDefaultConfig(): StatuslineConfig {
	return cloneConfig(DEFAULT_STATUSLINE_CONFIG);
}

export function normalizeStatuslineConfig(value: unknown): {
	config: StatuslineConfig;
	diagnostics: StatuslineConfigDiagnostic[];
} {
	const config = createDefaultConfig();
	const diagnostics: StatuslineConfigDiagnostic[] = [];
	if (!isRecord(value)) {
		return {
			config,
			diagnostics: [invalidDiagnostic("", "Settings must contain a JSON object", "error")],
		};
	}
	const knownRoot = new Set([
		"palettePreset",
		"palette",
		"density",
		"separator",
		"segments",
		"segmentText",
		"extensionStatusIcons",
	]);
	for (const key of Object.keys(value)) {
		if (!knownRoot.has(key)) diagnostics.push(unknownDiagnostic(key));
	}

	normalizePalette(value.palette, config, diagnostics);
	normalizeEnum(value, "palettePreset", PALETTE_PRESET_NAMES, config, diagnostics);
	if (!isRecord(value.palette) && isPaletteName(config.palettePreset)) {
		config.palette = segmentPaletteForPreset(config.palettePreset);
	}
	normalizeEnum(value, "density", DENSITIES, config, diagnostics);
	normalizeEnum(value, "separator", SEPARATOR_NAMES, config, diagnostics);

	if (value.segments !== undefined) {
		if (!Array.isArray(value.segments)) {
			diagnostics.push(invalidDiagnostic("segments", "Expected an array of segment names"));
		} else {
			const segments: ConfigSegmentName[] = [];
			const seen = new Set<SegmentName>();
			for (const [index, item] of value.segments.entries()) {
				const path = `segments[${index}]`;
				if (typeof item !== "string" || !isConfigSegmentName(item)) {
					diagnostics.push(invalidDiagnostic(path, "Unknown or non-string segment name"));
					continue;
				}
				if (item === LINE_BREAK_SEGMENT_NAME) {
					if (segments.at(-1) === LINE_BREAK_SEGMENT_NAME) {
						diagnostics.push(
							invalidDiagnostic(path, "Consecutive line_break segments are not allowed"),
						);
						continue;
					}
					segments.push(item);
					continue;
				}
				if (seen.has(item)) {
					diagnostics.push(invalidDiagnostic(path, `Duplicate segment ${JSON.stringify(item)}`));
					continue;
				}
				seen.add(item);
				segments.push(item);
			}
			config.segments = segments;
		}
	}

	if (value.segmentText !== undefined) {
		if (!isRecord(value.segmentText)) {
			diagnostics.push(invalidDiagnostic("segmentText", "Expected an object"));
		} else {
			for (const [name, presentation] of Object.entries(value.segmentText)) {
				if (isForbiddenKey(name)) continue;
				const path = `segmentText.${name}`;
				if (!isSegmentName(name)) {
					diagnostics.push(unknownDiagnostic(path));
					continue;
				}
				if (!isRecord(presentation)) {
					diagnostics.push(invalidDiagnostic(path, "Expected an object"));
					continue;
				}
				const knownFields = new Set([
					"prefix",
					"suffix",
					...(name === "model"
						? ["truncationLength", "truncationSymbol", "truncationDirection"]
						: []),
				]);
				for (const key of Object.keys(presentation)) {
					if (!knownFields.has(key)) diagnostics.push(unknownDiagnostic(`${path}.${key}`));
				}
				for (const field of ["prefix", "suffix"] as const) {
					const fieldValue = presentation[field];
					if (fieldValue === undefined) continue;
					if (!isSafeSegmentText(fieldValue, `${path}.${field}`, diagnostics)) continue;
					config.segmentText[name][field] = fieldValue;
				}
				if (name === "model") {
					normalizeModelTruncation(presentation, config, diagnostics);
				}
			}
		}
	}

	if (value.extensionStatusIcons !== undefined) {
		if (!isRecord(value.extensionStatusIcons)) {
			diagnostics.push(invalidDiagnostic("extensionStatusIcons", "Expected an object"));
		} else {
			for (const [key, icon] of Object.entries(value.extensionStatusIcons)) {
				if (isForbiddenKey(key)) continue;
				const iconPath = `extensionStatusIcons.${key}`;
				if (typeof icon !== "string") {
					diagnostics.push(invalidDiagnostic(iconPath, "Expected a string"));
					continue;
				}
				// M-1：图标与前后缀同标准，拒绝 Emoji/控制字符/Bidi，防止终端转义注入。
				if (!isSafeSegmentText(icon, iconPath, diagnostics)) continue;
				Object.defineProperty(config.extensionStatusIcons, key, {
					value: icon,
					enumerable: true,
					configurable: true,
					writable: true,
				});
			}
			for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_STATUS_ICON_KEYS)) {
				const legacyIcon = Object.hasOwn(value.extensionStatusIcons, legacyKey)
					? value.extensionStatusIcons[legacyKey]
					: undefined;
				const canonicalIcon = Object.hasOwn(value.extensionStatusIcons, canonicalKey)
					? value.extensionStatusIcons[canonicalKey]
					: undefined;
				const targetKey = typeof canonicalIcon === "string" ? legacyKey : canonicalKey;
				const inheritedIcon =
					typeof canonicalIcon === "string"
						? canonicalIcon
						: typeof legacyIcon === "string"
							? legacyIcon
							: undefined;
				if (inheritedIcon === undefined) continue;
				Object.defineProperty(config.extensionStatusIcons, targetKey, {
					value: inheritedIcon,
					enumerable: true,
					configurable: true,
					writable: true,
				});
			}
		}
	}

	return { config, diagnostics };
}

export function loadStatuslineSettings(settingsPath: string): LoadedStatuslineSettings {
	let rawDocument: string;
	let fileIdentity: StatuslineFileIdentity | undefined;
	// ②：先 stat 限大小再读，避免超大文件进内存与 JSON.parse。
	try {
		const info = statSync(settingsPath);
		if (info.size > MAX_SETTINGS_DOCUMENT_LENGTH) {
			return {
				...builtInSettings(settingsPath, [
					diagnostic("error", "io", "", "Settings file exceeds 1MB and was ignored"),
				]),
			};
		}
		rawDocument = readFileSync(settingsPath, "utf8");
		fileIdentity = {
			dev: info.dev,
			ino: info.ino,
			mtimeMs: info.mtimeMs,
			size: info.size,
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT" && !pathExists(settingsPath)) {
			return builtInSettings(settingsPath);
		}
		return builtInSettings(settingsPath, [
			diagnostic("error", "io", "", `Unable to read settings: ${formatError(error)}`),
		]);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawDocument);
	} catch (error) {
		return {
			...builtInSettings(settingsPath, [
				diagnostic("error", "parse", "", `Unable to parse JSON: ${formatError(error)}`),
			]),
			rawDocument,
			...(fileIdentity ? { fileIdentity } : {}),
		};
	}
	const normalized = normalizeStatuslineConfig(parsed);
	return {
		config: normalized.config,
		source: normalized.diagnostics.some((item) => item.severity === "error") ? "built-in" : "user",
		settingsPath,
		rawDocument,
		...(fileIdentity ? { fileIdentity } : {}),
		diagnostics: normalized.diagnostics,
	};
}

export function loadStatuslineSettingsForAgent(agentDir = getAgentDir()): LoadedStatuslineSettings {
	pendingSettingsNotice = undefined;
	const canonicalPath = settingsFilePath(agentDir);
	const legacyPath = join(agentDir, LEGACY_SETTINGS_FILE_NAME);
	const canonical = loadStatuslineSettings(canonicalPath);
	if (!isMissingStatuslineSettings(canonical)) {
		if (!isMissingStatuslineSettings(loadStatuslineSettings(legacyPath))) {
			pendingSettingsNotice = `${LEGACY_SETTINGS_FILE_NAME} ignored because ${SETTINGS_FILE_NAME} takes precedence.`;
		}
		return canonical;
	}
	const legacy = loadStatuslineSettings(legacyPath);
	return isMissingStatuslineSettings(legacy)
		? canonical
		: migrateLegacySettings(canonicalPath, legacy);
}

function migrateLegacySettings(
	canonicalPath: string,
	legacy: LoadedStatuslineSettings,
): LoadedStatuslineSettings {
	const racedCanonical = loadStatuslineSettings(canonicalPath);
	if (!isMissingStatuslineSettings(racedCanonical)) {
		pendingSettingsNotice = `${LEGACY_SETTINGS_FILE_NAME} ignored because ${SETTINGS_FILE_NAME} was created concurrently.`;
		return racedCanonical;
	}
	if (
		legacy.source !== "user" ||
		legacy.rawDocument === undefined ||
		blockingDiagnostics(legacy.diagnostics).length > 0
	) {
		pendingSettingsNotice = `${LEGACY_SETTINGS_FILE_NAME} is invalid and was ignored.`;
		return legacy;
	}
	pendingSettingsNotice = `Using legacy ${LEGACY_SETTINGS_FILE_NAME}; rename it to ${SETTINGS_FILE_NAME}. Future saves write ${SETTINGS_FILE_NAME} without modifying the legacy file.`;
	return legacy;
}

function isMissingStatuslineSettings(settings: LoadedStatuslineSettings): boolean {
	return (
		settings.source === "built-in" &&
		settings.rawDocument === undefined &&
		settings.diagnostics.length === 0
	);
}

export function saveStatuslineSettingsDocument(
	settingsPath: string,
	rawDocument: string,
	overrides: Partial<AtomicFileSystem> = {},
	expectedIdentity?: StatuslineFileIdentity,
): LoadedStatuslineSettings {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawDocument);
	} catch (error) {
		throw new Error(`Unable to parse JSON: ${formatError(error)}`);
	}
	const normalized = normalizeStatuslineConfig(parsed);
	const blocking = blockingDiagnostics(normalized.diagnostics);
	if (blocking.length > 0) {
		throw new Error(blocking.map((item) => `${item.path || "root"}: ${item.message}`).join("\n"));
	}

	// ④ CAS：调用方打开编辑器时的文件若已被改动（另一 Pi/编辑器），拒绝覆盖，避免 lost-update。
	if (expectedIdentity && !statuslineFileMatches(settingsPath, expectedIdentity)) {
		throw new Error(
			`${SETTINGS_FILE_NAME} changed on disk since you opened it; reopen settings and retry. Your edits were not saved.`,
		);
	}

	const fs = { mkdirSync, writeFileSync, renameSync, rmSync, ...overrides };
	const replaceExisting = pathEntryExists(settingsPath);
	const temporaryPath = temporarySettingsPath(settingsPath);
	let fileIdentity: StatuslineFileIdentity | undefined;
	try {
		fs.mkdirSync(dirname(settingsPath), { recursive: true });
		fs.writeFileSync(temporaryPath, rawDocument, { encoding: "utf8", flag: "wx" });
		const info = lstatSync(temporaryPath);
		fileIdentity = { dev: info.dev, ino: info.ino };
		if (!replaceExisting && pathEntryExists(settingsPath)) {
			throw new Error(`${SETTINGS_FILE_NAME} was created concurrently; reopen settings and retry.`);
		}
		fs.renameSync(temporaryPath, settingsPath);
	} finally {
		removeTemporaryFile(fs.rmSync, temporaryPath);
	}
	return {
		config: normalized.config,
		source: "user",
		settingsPath,
		rawDocument,
		...(fileIdentity ? { fileIdentity } : {}),
		diagnostics: normalized.diagnostics,
	};
}

export function removeStatuslineSettingsDocumentIfMatches(
	settingsPath: string,
	expectedRawDocument: string,
	expectedIdentity: StatuslineFileIdentity,
): void {
	const quarantinePath = join(
		dirname(settingsPath),
		`.${SETTINGS_FILE_NAME}.${randomUUID()}.rollback`,
	);
	const before = lstatSync(settingsPath);
	if (before.dev !== expectedIdentity.dev || before.ino !== expectedIdentity.ino) {
		throw new Error("Statusline settings changed concurrently; the newer file was preserved");
	}
	renameSync(settingsPath, quarantinePath);
	const quarantined = lstatSync(quarantinePath);
	const quarantinedSavedFile =
		quarantined.isFile() &&
		!quarantined.isSymbolicLink() &&
		quarantined.dev === expectedIdentity.dev &&
		quarantined.ino === expectedIdentity.ino;
	if (quarantinedSavedFile && readFileSync(quarantinePath, "utf8") === expectedRawDocument) {
		rmSync(quarantinePath);
		return;
	}
	if (quarantinedSavedFile && !pathEntryExists(settingsPath)) {
		try {
			renameSync(quarantinePath, settingsPath);
		} catch {
			// Keep the quarantine for recovery when its atomic restoration fails.
		}
	}
	throw new Error("Statusline settings changed concurrently; the newer file was preserved");
}

/** 磁盘文件是否与期望身份一致（dev+ino 必比，mtimeMs/size 有则比）。文件不存在返回 false。 */
function statuslineFileMatches(settingsPath: string, expected: StatuslineFileIdentity): boolean {
	let info: { dev: number; ino: number; mtimeMs: number; size: number };
	try {
		info = statSync(settingsPath);
	} catch {
		return false;
	}
	if (info.dev !== expected.dev || info.ino !== expected.ino) return false;
	if (expected.mtimeMs !== undefined && info.mtimeMs !== expected.mtimeMs) return false;
	if (expected.size !== undefined && info.size !== expected.size) return false;
	return true;
}

export function consumeStatuslineSettingsNotice(): string | undefined {
	const notice = pendingSettingsNotice;
	pendingSettingsNotice = undefined;
	return notice;
}

export function readStatuslineSettings(settingsPath?: string): StatuslineConfig {
	return settingsPath
		? loadStatuslineSettings(settingsPath).config
		: loadStatuslineSettingsForAgent().config;
}

export function normalizeStatuslineSettings(value: unknown): StatuslineConfig {
	return normalizeStatuslineConfig(value).config;
}

function normalizePalette(
	value: unknown,
	config: StatuslineConfig,
	diagnostics: StatuslineConfigDiagnostic[],
) {
	if (value === undefined) return;
	if (typeof value === "string") {
		if (!(PALETTE_NAMES as readonly string[]).includes(value)) {
			diagnostics.push(
				invalidDiagnostic(
					"palette",
					`Expected a palette object or one of: ${PALETTE_NAMES.join(", ")}`,
				),
			);
			return;
		}
		config.palettePreset = value as (typeof PALETTE_NAMES)[number];
		return;
	}
	if (!isRecord(value)) {
		diagnostics.push(invalidDiagnostic("palette", "Expected a palette object"));
		return;
	}

	const palette: SegmentPalette = {};
	config.palette = palette;
	for (const [name, colors] of Object.entries(value)) {
		const path = `palette.${name}`;
		if (!isSegmentName(name)) {
			diagnostics.push(unknownDiagnostic(path));
			continue;
		}
		if (!isRecord(colors)) {
			diagnostics.push(invalidDiagnostic(path, "Expected an object"));
			continue;
		}
		const normalizedColors: NonNullable<SegmentPalette[SegmentName]> = {};
		palette[name] = normalizedColors;
		for (const [field, color] of Object.entries(colors)) {
			const colorPath = `${path}.${field}`;
			if (field !== "fg" && field !== "bg") {
				diagnostics.push(unknownDiagnostic(colorPath));
				continue;
			}
			if (typeof color !== "string" || !/^#[0-9a-f]{6}$/iu.test(color)) {
				diagnostics.push(invalidDiagnostic(colorPath, "Expected a full #RRGGBB hexadecimal color"));
				continue;
			}
			normalizedColors[field] = color.toLowerCase();
		}
	}
	config.palette = palette;
	config.palettePreset = "custom";
}

function normalizeModelTruncation(
	presentation: Record<string, unknown>,
	config: StatuslineConfig,
	diagnostics: StatuslineConfigDiagnostic[],
) {
	const path = "segmentText.model";
	const length = presentation.truncationLength;
	if (length !== undefined) {
		if (typeof length !== "number" || !Number.isInteger(length) || length < 0 || length > 1000) {
			diagnostics.push(
				invalidDiagnostic(`${path}.truncationLength`, "Expected an integer from 0 through 1000"),
			);
		} else config.segmentText.model.truncationLength = length;
	}

	const symbol = presentation.truncationSymbol;
	if (symbol !== undefined && isSafeSegmentText(symbol, `${path}.truncationSymbol`, diagnostics)) {
		config.segmentText.model.truncationSymbol = symbol;
	}

	const direction = presentation.truncationDirection;
	if (direction !== undefined) {
		if (
			typeof direction !== "string" ||
			!TRUNCATION_DIRECTIONS.includes(direction as (typeof TRUNCATION_DIRECTIONS)[number])
		) {
			diagnostics.push(
				invalidDiagnostic(
					`${path}.truncationDirection`,
					`Expected one of: ${TRUNCATION_DIRECTIONS.join(", ")}`,
				),
			);
		} else {
			config.segmentText.model.truncationDirection =
				direction as (typeof TRUNCATION_DIRECTIONS)[number];
		}
	}
}

function isSafeSegmentText(
	value: unknown,
	path: string,
	diagnostics: StatuslineConfigDiagnostic[],
): value is string {
	if (typeof value !== "string") {
		diagnostics.push(invalidDiagnostic(path, "Expected a string"));
		return false;
	}
	if (/[\r\n\u2028\u2029]/u.test(value)) {
		diagnostics.push(invalidDiagnostic(path, "Line breaks are not allowed; use line_break"));
		return false;
	}
	if (hasControlCharacter(value)) {
		diagnostics.push(invalidDiagnostic(path, "Control characters are not allowed"));
		return false;
	}
	if (hasBidiControl(value)) {
		diagnostics.push(invalidDiagnostic(path, "Bidirectional controls are not allowed"));
		return false;
	}
	if (containsEmoji(value)) {
		diagnostics.push(invalidDiagnostic(path, "Emoji is not allowed"));
		return false;
	}
	return true;
}

function normalizeEnum<
	K extends "palettePreset" | "density" | "separator",
	T extends StatuslineConfig[K],
>(
	value: Record<string, unknown>,
	field: K,
	accepted: readonly T[],
	config: StatuslineConfig,
	diagnostics: StatuslineConfigDiagnostic[],
) {
	const candidate = value[field];
	if (candidate === undefined) return;
	if (typeof candidate !== "string" || !accepted.includes(candidate as T)) {
		diagnostics.push(
			invalidDiagnostic(field, `Expected one of: ${accepted.map(String).join(", ")}`),
		);
		return;
	}
	config[field] = candidate as StatuslineConfig[K];
}

function cloneSegmentPalette(palette: SegmentPalette): SegmentPalette {
	return Object.fromEntries(
		Object.entries(palette).map(([name, colors]) => [name, { ...colors }]),
	) as SegmentPalette;
}

function cloneConfig(config: StatuslineConfig): StatuslineConfig {
	return {
		...config,
		palette: cloneSegmentPalette(config.palette),
		segments: [...config.segments],
		segmentText: Object.fromEntries(
			SEGMENT_NAMES.map((name) => [name, { ...config.segmentText[name] }]),
		) as StatuslineConfig["segmentText"],
		extensionStatusIcons: { ...config.extensionStatusIcons },
	};
}

function builtInSettings(
	settingsPath: string,
	diagnostics: StatuslineConfigDiagnostic[] = [],
): LoadedStatuslineSettings {
	return {
		config: createDefaultConfig(),
		source: "built-in",
		settingsPath,
		diagnostics,
	};
}

function hasControlCharacter(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0) ?? 0;
		if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
	}
	return false;
}

/** 双向覆盖符（视觉欺骗），与 sanitizeTerminalText 的 Bidi 语义对齐。 */
function hasBidiControl(value: string): boolean {
	for (const character of value) {
		const codePoint = character.codePointAt(0) ?? 0;
		if (
			codePoint === 0x061c ||
			codePoint === 0x200e ||
			codePoint === 0x200f ||
			(codePoint >= 0x202a && codePoint <= 0x202e) ||
			(codePoint >= 0x2066 && codePoint <= 0x2069)
		) {
			return true;
		}
	}
	return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

function isConfigSegmentName(value: string): value is ConfigSegmentName {
	return value === LINE_BREAK_SEGMENT_NAME || isSegmentName(value);
}

function isPaletteName(value: StatuslineConfig["palettePreset"]): value is PaletteName {
	return (PALETTE_NAMES as readonly StatuslineConfig["palettePreset"][]).includes(value);
}

function isSegmentName(value: string): value is SegmentName {
	return (SEGMENT_NAMES as readonly string[]).includes(value);
}

function blockingDiagnostics(
	diagnostics: readonly StatuslineConfigDiagnostic[],
): StatuslineConfigDiagnostic[] {
	return diagnostics.filter((item) => item.code !== "unknown");
}

function unknownDiagnostic(path: string): StatuslineConfigDiagnostic {
	return diagnostic("warning", "unknown", path, `Unknown setting ${JSON.stringify(path)}`);
}

function invalidDiagnostic(
	path: string,
	message: string,
	severity: StatuslineConfigDiagnostic["severity"] = "warning",
): StatuslineConfigDiagnostic {
	return diagnostic(severity, "invalid", path, message);
}

function diagnostic(
	severity: StatuslineConfigDiagnostic["severity"],
	code: StatuslineConfigDiagnostic["code"],
	path: string,
	message: string,
): StatuslineConfigDiagnostic {
	return { severity, code, path, message };
}

function temporarySettingsPath(settingsPath: string): string {
	return join(dirname(settingsPath), `.${SETTINGS_FILE_NAME}.${randomUUID()}.tmp`);
}

function removeTemporaryFile(remove: typeof rmSync, temporaryPath: string) {
	try {
		remove(temporaryPath, { force: true });
	} catch {
		// Best-effort cleanup must not replace the original operation result.
	}
}

function pathExists(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch {
		return false;
	}
}

function pathEntryExists(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
