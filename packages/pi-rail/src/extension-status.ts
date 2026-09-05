import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { getAgentDir, type Theme, type ThemeColor } from "@earendil-works/pi-coding-agent";
import { wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { powerlineExtensionSeparator } from "./powerline.js";
import { DEFAULT_EXTENSION_STATUS_ICONS } from "./settings.js";
import { stripEmoji, boundRawStatus, truncateToWidthWithEllipsis } from "./text.js";
import { sanitizeTerminalText } from "@narumitw/pi-tui-kit/terminal-text";
import type { StatuslineConfig } from "./types.js";

export type ExtensionStatusIconAliasMap = ReadonlyMap<string, readonly string[]>;
export interface ExtensionStatusRuntime {
	duplicateExtensions: string[];
	extensionStatusIconAliases: ExtensionStatusIconAliasMap;
}

const STATUSLINE_KEY = "statusline";
const MAX_PACKAGES_PER_SETTINGS_FILE = 200;
const MAX_PACKAGE_JSON_BYTES = 64 * 1024;
const COMPATIBLE_STATUS_ICON_KEYS: Readonly<Record<string, string>> = {
	retry: "unknown-error-retry",
	sync: "pisync",
	"unknown-error-retry": "retry",
	pisync: "sync",
};
const EMPTY_EXTENSION_STATUS_ICON_ALIASES: ExtensionStatusIconAliasMap = new Map();
function extensionStatusSeparator(
	config: StatuslineConfig,
	theme: Theme,
	trueColor: boolean,
): string {
	return powerlineExtensionSeparator(theme, config.palettePreset, trueColor);
}

export function formatExtensionStatuses(
	statuses: ReadonlyMap<string, string>,
	theme: Theme,
	config: StatuslineConfig,
	runtime: ExtensionStatusRuntime,
	hiddenKeys: ReadonlySet<string> = new Set(),
	trueColor = true,
): string {
	const separator = extensionStatusSeparator(config, theme, trueColor);
	const visibleStatuses = [
		...formatDuplicateExtensionStatus(runtime, theme),
		...[...statuses.entries()]
			.filter(
				([key, value]) => key !== STATUSLINE_KEY && !hiddenKeys.has(key) && value.trim().length > 0,
			)
			.map(([key, value]) =>
				formatExtensionStatus(key, value, theme, config, runtime.extensionStatusIconAliases),
			),
	].slice(0, 5);

	return visibleStatuses.join(separator);
}

export function formatExtensionStatus(
	key: string,
	value: string,
	theme: Theme,
	config: Pick<StatuslineConfig, "extensionStatusIcons">,
	extensionStatusIconAliases: ExtensionStatusIconAliasMap = EMPTY_EXTENSION_STATUS_ICON_ALIASES,
): string {
	const status = splitExtensionStatusIcon(
		stripExtensionStatusPrefix(key, sanitizeTerminalText(boundRawStatus(value))),
	);
	const text = simplifyExtensionStatusText(status.text);
	const color = extensionColor(key, value);
	const textColor = color === "warning" ? "warning" : "muted";
	const icon = extensionStatusIcon(
		key,
		status.icon,
		config.extensionStatusIcons,
		extensionStatusIconAliases,
	);
	const renderedText = theme.fg(textColor, text);
	return icon ? `${theme.fg(color, icon)} ${renderedText}` : renderedText;
}

function extensionStatusIcon(
	key: string,
	leadingIcon: string | undefined,
	configuredIcons: Record<string, string>,
	extensionStatusIconAliases: ExtensionStatusIconAliasMap,
) {
	// 用户配置的图标若含 Emoji 则忽略，保证无表情包。
	const configured = pickConfiguredIcon(key, configuredIcons, extensionStatusIconAliases);
	if (configured !== undefined) {
		return /\p{Extended_Pictographic}/u.test(configured) ? "" : configured;
	}
	if (leadingIcon) {
		const cleanIcon = stripEmoji(sanitizeTerminalText(leadingIcon));
		if (cleanIcon && !/\p{Extended_Pictographic}/u.test(cleanIcon)) return cleanIcon;
	}
	return DEFAULT_EXTENSION_STATUS_ICONS[key] ?? "";
}

function pickConfiguredIcon(
	key: string,
	configuredIcons: Record<string, string>,
	extensionStatusIconAliases: ExtensionStatusIconAliasMap,
): string | undefined {
	if (Object.hasOwn(configuredIcons, key)) return configuredIcons[key];
	const namespaceIcon = configuredNamespaceIcon(key, configuredIcons);
	if (namespaceIcon !== undefined) return namespaceIcon;
	const compatibleKey = COMPATIBLE_STATUS_ICON_KEYS[key];
	if (compatibleKey && Object.hasOwn(configuredIcons, compatibleKey)) {
		return configuredIcons[compatibleKey];
	}
	for (const alias of extensionStatusAliasesForKey(key, extensionStatusIconAliases)) {
		if (Object.hasOwn(configuredIcons, alias)) return configuredIcons[alias];
	}
	return undefined;
}

function configuredNamespaceIcon(
	key: string,
	configuredIcons: Readonly<Record<string, string>>,
): string | undefined {
	let match: { baseLength: number; icon: string } | undefined;
	for (const [selector, icon] of Object.entries(configuredIcons)) {
		if (!selector.endsWith(":*")) continue;
		const base = selector.slice(0, -2);
		if (!base || !key.startsWith(`${base}:`)) continue;
		if (!match || base.length > match.baseLength) match = { baseLength: base.length, icon };
	}
	return match?.icon;
}

function extensionStatusAliasesForKey(
	key: string,
	extensionStatusIconAliases: ExtensionStatusIconAliasMap,
): readonly string[] {
	for (const [statusBase, aliases] of extensionStatusIconAliases) {
		if (statusKeyMatchesStatusBase(key, statusBase)) return aliases;
	}
	return [];
}

function statusKeyMatchesStatusBase(key: string, statusBase: string): boolean {
	return key === statusBase || key.startsWith(`${statusBase}:`) || key.startsWith(`${statusBase}/`);
}

export function wrapExtensionStatusline(status: string, width: number): string[] {
	if (!status || width <= 0) return [];
	return wrapTextWithAnsi(status, width);
}

function formatDuplicateExtensionStatus(runtime: ExtensionStatusRuntime, theme: Theme): string[] {
	if (runtime.duplicateExtensions.length === 0) return [];
	const names = runtime.duplicateExtensions
		.slice(0, 2)
		.map((name) =>
			truncateToWidthWithEllipsis(stripEmoji(sanitizeTerminalText(boundRawStatus(name))), 32),
		)
		.join(", ");
	const suffix =
		runtime.duplicateExtensions.length > 2 ? ` +${runtime.duplicateExtensions.length - 2}` : "";
	return [`${theme.fg("warning", "dup")} ${theme.fg("warning", `${names}${suffix}`)}`];
}

export function splitExtensionStatusIcon(value: string): { icon?: string; text: string } {
	const trimmed = value.trim();
	const [firstToken, ...restTokens] = trimmed.split(/\s+/);
	if (firstToken && isEmojiOnlyToken(firstToken)) {
		return { icon: firstToken, text: restTokens.join(" ") };
	}
	return { text: trimmed };
}

function isEmojiOnlyToken(value: string): boolean {
	return /^(?=.*(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\ufe0f?\u20e3))(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200d|\ufe0f|[0-9#*]\ufe0f?\u20e3)+$/u.test(
		value,
	);
}

export function extensionColor(key: string, value: string): ThemeColor {
	const normalized = `${key} ${value}`.toLowerCase();
	if (/missing|error|fail|conflict|duplicate|unavailable/.test(normalized)) return "warning";
	if (normalized.includes("codex")) return "accent";
	if (/ready|active|running|enabled|awake|ok/.test(normalized)) return "success";
	return "muted";
}

export function stripExtensionStatusPrefix(key: string, value: string): string {
	return value.trim().replace(new RegExp(`^${escapeRegExp(key)}\\s*:\\s*`, "iu"), "");
}

export function simplifyExtensionStatusText(value: string): string {
	return (
		stripEmoji(value)
			.trim()
			// 纯 ASCII：ready -> ok，missing -> miss，避免符号字体缺字。
			.replace(/\bready\b/giu, "ok")
			.replace(/\bmissing\b/giu, "miss")
			.replace(/,\s*/g, " ")
			.replace(/\s+\([^)]*\)\s*$/, "")
			.replace(/\s+/g, " ")
	);
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface InstalledExtensionPackage {
	packageName: string;
	source: string;
	identity: string;
}

export function readInstalledExtensionPackages(cwd: string): InstalledExtensionPackage[] {
	const packages: InstalledExtensionPackage[] = [];
	const settingsFiles = extensionSettingsFiles(cwd);

	for (const settingsFile of settingsFiles) {
		const baseDirectory = dirname(settingsFile);
		for (const rawSource of readPackageSources(settingsFile)) {
			const source = rawSource.trim();
			if (!source) continue;
			const packageName = packageNameForSource(source, baseDirectory);
			if (!packageName) continue;
			packages.push({ packageName, source, identity: sourceIdentity(source, baseDirectory) });
		}
	}

	return packages;
}

function extensionSettingsFiles(cwd: string): string[] {
	return [join(getAgentDir(), "settings.json"), join(cwd, ".pi", "settings.json")].filter((file) =>
		existsSync(file),
	);
}

export function findDuplicateExtensions(
	installedPackages: readonly InstalledExtensionPackage[],
): string[] {
	const sourcesByPackage = new Map<string, Set<string>>();

	for (const extensionPackage of installedPackages) {
		const sources = sourcesByPackage.get(extensionPackage.packageName) ?? new Set<string>();
		sources.add(extensionPackage.identity);
		sourcesByPackage.set(extensionPackage.packageName, sources);
	}

	return [...sourcesByPackage.entries()]
		.filter(([, sources]) => sources.size > 1)
		.map(([packageName]) => packageName.replace(/^@[^/]+\//, "").replace(/^pi-/, ""));
}

export function buildExtensionStatusIconAliases(
	installedPackages: readonly { packageName: string; source?: string }[],
): Map<string, string[]> {
	const packageAliasesByStatusBase = new Map<string, Map<string, string[]>>();

	for (const extensionPackage of installedPackages) {
		const candidate = extensionStatusIconAliasCandidate(
			extensionPackage.packageName,
			extensionPackage.source,
		);
		if (!candidate) continue;
		const aliasesByPackage =
			packageAliasesByStatusBase.get(candidate.statusBase) ?? new Map<string, string[]>();
		const existingAliases = aliasesByPackage.get(extensionPackage.packageName) ?? [];
		aliasesByPackage.set(
			extensionPackage.packageName,
			uniqueStrings([...existingAliases, ...candidate.aliases]),
		);
		packageAliasesByStatusBase.set(candidate.statusBase, aliasesByPackage);
	}

	const aliases = new Map<string, string[]>();
	for (const [statusBase, aliasesByPackage] of packageAliasesByStatusBase) {
		if (aliasesByPackage.size === 1)
			aliases.set(statusBase, [...aliasesByPackage.values()][0] ?? []);
	}
	return aliases;
}

function extensionStatusIconAliasCandidate(
	packageName: string,
	source?: string,
): { statusBase: string; aliases: string[] } | undefined {
	const packageBase = packageBaseName(packageName);
	const statusBase = statusBaseFromPackageBase(packageBase);
	if (!statusBase) return undefined;

	const sourceAliases = source?.startsWith("npm:") ? [source, `npm:${npmPackageName(source)}`] : [];
	return {
		statusBase,
		aliases: uniqueStrings([...sourceAliases, packageName, packageBase, statusBase]),
	};
}

function packageBaseName(packageName: string): string {
	const slashIndex = packageName.lastIndexOf("/");
	return slashIndex === -1 ? packageName : packageName.slice(slashIndex + 1);
}

function statusBaseFromPackageBase(packageBase: string): string {
	return packageBase.startsWith("pi-") && packageBase.length > "pi-".length
		? packageBase.slice("pi-".length)
		: packageBase;
}

function uniqueStrings(values: readonly string[]): string[] {
	return [...new Set(values.filter((value) => value.length > 0))];
}

function readPackageSources(settingsFile: string): string[] {
	try {
		const settings = JSON.parse(readFileSync(settingsFile, "utf8")) as { packages?: unknown[] };
		// D2：恶意仓库可能塞数万条 packages，封顶避免同步 readFileSync 卡顿。
		return (settings.packages ?? [])
			.slice(0, MAX_PACKAGES_PER_SETTINGS_FILE)
			.map((entry) => {
				if (typeof entry === "string") return entry;
				if (
					entry &&
					typeof entry === "object" &&
					typeof (entry as { source?: unknown }).source === "string"
				) {
					return (entry as { source: string }).source;
				}
				return undefined;
			})
			.filter((source): source is string => source !== undefined);
	} catch {
		return [];
	}
}

function packageNameForSource(source: string, baseDirectory: string): string | undefined {
	if (source.startsWith("npm:")) return npmPackageName(source);
	const packageJson = join(resolveSourcePath(source, baseDirectory), "package.json");
	try {
		// 体积 guard：package.json 正常几 KB，超 64KB 直接跳过。
		if (statSync(packageJson).size > MAX_PACKAGE_JSON_BYTES) return undefined;
		const packageData = JSON.parse(readFileSync(packageJson, "utf8")) as { name?: unknown };
		return typeof packageData.name === "string" ? packageData.name : undefined;
	} catch {
		return undefined;
	}
}

export function npmPackageName(source: string): string {
	const spec = source.slice("npm:".length);
	if (spec.startsWith("@")) return spec.split("@").slice(0, 2).join("@");
	return spec.split("@")[0] ?? spec;
}

function sourceIdentity(source: string, baseDirectory: string): string {
	if (source.startsWith("npm:")) return `npm:${npmPackageName(source)}`;
	return resolveSourcePath(source, baseDirectory);
}

function resolveSourcePath(source: string, baseDirectory: string): string {
	return isAbsolute(source) ? source : resolve(baseDirectory, source);
}
