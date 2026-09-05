import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { formatGitStatusSummary } from "./git-status.js";
import { composeAdaptiveLine, splitRightParts } from "./powerline.js";
import { isLightRailTheme, prLinkFromStatuses } from "./render.js";
import { DEFAULT_STATUSLINE_CONFIG, normalizeStatuslineConfig } from "./settings.js";
import { stripEmoji } from "./text.js";
import type { RenderSegment, StatuslineConfig } from "./types.js";

const config = {
	palettePreset: "custom",
	palette: {
		brand: { fg: "#0b1220", bg: "#22d3ee" },
		model: { fg: "#0b1220", bg: "#22d3ee" },
		thinking: { fg: "#e2e8f0", bg: "#334155" },
		cwd: { fg: "#e2e8f0", bg: "#1e293b" },
		branch: { fg: "#0b1220", bg: "#34d399" },
		tools: { fg: "#0b1220", bg: "#f59e0b" },
		context: { fg: "#e2e8f0", bg: "#0f172a" },
		time: { fg: "#94a3b8", bg: "#020617" },
	},
	density: "compact",
	separator: "bar",
} as Pick<StatuslineConfig, "palettePreset" | "palette" | "density" | "separator">;

function seg(name: RenderSegment["name"], text: string): RenderSegment {
	return { name, text, color: "accent", block: "header", emphasis: false };
}

const items = [
	seg("brand", "π"),
	seg("model", "opus-4-5-20260901"),
	seg("thinking", "high"),
	seg("cwd", "~/Downloads/ck-pi-extension/packages/pi-rail/src"),
	seg("branch", "main ^2 ~1 ?3"),
	seg("tools", "read"),
	seg("context", "ctx 12.5%/200k"),
	seg("time", "21:41"),
];
const right = ["TPS 42", "MCP 9", "lint ok"];

describe("composeAdaptiveLine", () => {
	it("fills the terminal width exactly, fullscreen or narrow", () => {
		for (const width of [20, 30, 40, 60, 80, 100, 120, 160, 200]) {
			for (const trueColor of [true, false]) {
				for (const isLight of [false, true]) {
					const line = composeAdaptiveLine(width, items, right, config, trueColor, isLight);
					assert.equal(visibleWidth(line), width, `width=${width} tc=${trueColor} light=${isLight}`);
				}
			}
		}
	});

	it("keeps the rail head visible even when narrow", () => {
		const line = composeAdaptiveLine(40, items, right, config, true);
		assert.match(line, /┃/);
	});

	it("contains no emoji even with emoji input", () => {
		const dirty = [
			seg("model", "🚀omen-alpha🎉"),
			seg("cwd", "🔥~/Downloads"),
			seg("branch", "main ✅"),
		];
		const line = composeAdaptiveLine(80, dirty, ["TPS 🚀 42", "MCP 🎉 9"], config, true);
		assert.equal(/\p{Extended_Pictographic}/u.test(line), false);
		assert.equal(visibleWidth(line), 80);
	});

	it("progressively drops right parts when narrowing", () => {
		const wide = composeAdaptiveLine(200, items, right, config, true);
		assert.match(wide, /MCP 9/);
		const narrow = composeAdaptiveLine(50, items, right, config, true);
		assert.equal(visibleWidth(narrow), 50);
	});

	it("supports legacy string right cluster", () => {
		const line = composeAdaptiveLine(120, items, "TPS 42  |  MCP 9", config, true);
		assert.equal(visibleWidth(line), 120);
		assert.match(line, /TPS 42/);
	});

	it("light chrome uses light fill, dark chrome uses dark fill", () => {
		const dark = composeAdaptiveLine(80, items, right, config, true, false);
		const light = composeAdaptiveLine(80, items, right, config, true, true);
		assert.match(dark, /24;24;37/);
		assert.match(light, /226;232;240/);
	});

	it("separates blocks with arrow dividers", () => {
		const line = composeAdaptiveLine(120, items, right, config, true);
		assert.match(line, /›/);
		assert.equal(visibleWidth(line), 120);
	});

	it("defaults to the full segment set", () => {
		const segments = DEFAULT_STATUSLINE_CONFIG.segments;
		for (const name of ["tokens", "cache", "cost", "time", "turn", "provider", "brand"]) {
			assert.ok((segments as string[]).includes(name), `missing ${name}`);
		}
	});

	it("strips terminal escapes from segments and right parts", () => {
		const evil = [
			seg("model", "omen[2Jalpha"),
			seg("cwd", "~/x]0;pwnedy"),
		];
		const line = composeAdaptiveLine(80, evil, ["TPS [2J42"], config, true);
		assert.equal(line.includes("2J"), false);
		assert.equal(line.includes("]0;"), false);
		assert.equal(line.includes("pwned"), false);
		assert.equal(visibleWidth(line), 80);
	});

	it("keeps github links but drops phishing links", () => {
		const good = new Map([
			["github-pr", "PR ]8;;https://github.com/o/r/pull/1#1]8;;: checks passing"],
		]);
		const evil = new Map([
			["github-pr", "PR ]8;;http://evil.example/p#1]8;;: checks passing"],
		]);
		assert.ok(prLinkFromStatuses(good)?.includes("github.com"));
		assert.equal(prLinkFromStatuses(evil), undefined);
		assert.equal(prLinkFromStatuses(new Map()), undefined);
	});

	it("rejects emoji and control chars in extension status icons", () => {
		const { config: parsed, diagnostics } = normalizeStatuslineConfig({
			extensionStatusIcons: { mcp: "🚀", lsp: "[2J", ok: "OK" },
		});
		assert.equal(parsed.extensionStatusIcons["mcp"], "");
		assert.equal(parsed.extensionStatusIcons["lsp"], "");
		assert.equal(parsed.extensionStatusIcons["ok"], "OK");
		assert.ok(diagnostics.length >= 2);
	});

	it("strips keycap, tags and zero-width chars", () => {
		assert.equal(stripEmoji("12️⃣3"), "123");
				assert.equal(stripEmoji("hi\u{E0020}bye"), "hibye");
		assert.equal(stripEmoji("a​b‏c"), "abc");
	});
});

describe("splitRightParts", () => {
	it("caps at 4 parts and strips emoji", () => {
		assert.deepEqual(splitRightParts(["a", "b", "c", "d", "e"]), ["a", "b", "c", "d"]);
		assert.deepEqual(splitRightParts(["TPS 🚀 42", "  "]), ["TPS 42"]);
		assert.deepEqual(splitRightParts("A  |  B | C"), ["A", "B", "C"]);
	});
});

describe("no-emoji rails", () => {
	it("stripEmoji removes emoji but keeps tech glyphs", () => {
		assert.equal(stripEmoji("🚀hi🎉 ✓ ok"), "hi ✓ ok");
		assert.equal(stripEmoji("π ↑↓ │ · … ^v"), "π ↑↓ │ · … ^v");
	});

	it("git status uses ascii markers", () => {
		const text = formatGitStatusSummary({ ahead: 2, behind: 1, staged: 3, modified: 1, untracked: 0, conflicts: 0 });
		assert.equal(/\p{Extended_Pictographic}/u.test(text), false);
		assert.match(text, /↑2/);
		assert.match(text, /↓1/);
	});

	it("detects light themes from text luminance", () => {
		const darkTheme = { name: "tokyo-night", getFgAnsi: () => "\u001b[38;2;226;232;240m" };
		const lightTheme = { name: "light", getFgAnsi: () => "\u001b[38;2;30;41;59m" };
		assert.equal(isLightRailTheme(darkTheme as never), false);
		assert.equal(isLightRailTheme(lightTheme as never), true);
	});
});
