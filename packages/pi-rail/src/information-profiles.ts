import type { ConfigSegmentName, SegmentName } from "./types.js";

export const INFORMATION_PROFILE_NAMES = ["minimal", "balanced", "detailed", "full"] as const;
export type InformationProfileName = (typeof INFORMATION_PROFILE_NAMES)[number];
export type InformationProfile = InformationProfileName | "custom";

export const INFORMATION_PROFILES: Readonly<
	Record<InformationProfileName, readonly SegmentName[]>
> = {
	minimal: ["model", "cwd", "branch", "context"],
	balanced: ["model", "thinking", "cwd", "branch", "tools", "context", "time"],
	detailed: [
		"provider",
		"model",
		"thinking",
		"cwd",
		"branch",
		"tools",
		"context",
		"tokens",
		"cache",
		"cost",
		"time",
	],
	// 全量：能加的都加上，窄终端下自适应压缩/丢段，宽屏全展开。
	full: [
		"brand",
		"provider",
		"model",
		"thinking",
		"cwd",
		"branch",
		"tools",
		"context",
		"tokens",
		"cache",
		"cost",
		"time",
		"turn",
	],
};

export function inferInformationProfile(
	segments: readonly ConfigSegmentName[],
): InformationProfile {
	for (const name of INFORMATION_PROFILE_NAMES) {
		const profile = INFORMATION_PROFILES[name];
		if (
			segments.length === profile.length &&
			segments.every((segment, index) => segment === profile[index])
		) {
			return name;
		}
	}
	return "custom";
}
