/**
 * pi-redkit 注入提示词与配置加载的单元测试
 * 运行方式见根 package.json 的 test 脚本（esbuild 打包后 node --test）
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "./config.js";
import piRedkit from "./index.js";
import { buildPromptBlock } from "./prompt.js";
import { DEFAULT_CONFIG, type RedkitConfig } from "./types.js";

// ---------------------------------------------------------------------------
// 提示词组装：四种模式的行为分界
// ---------------------------------------------------------------------------

test("off 模式不注入任何内容", () => {
	assert.equal(buildPromptBlock("off"), "");
});

test("pentest 模式：核心条令 + 渗透条令，不含逆向条令", () => {
	const block = buildPromptBlock("pentest");
	assert.ok(block.includes("授权事实"), "必须包含授权框架");
	assert.ok(block.includes("渗透作战条令"), "必须包含渗透条令");
	assert.ok(!block.includes("协议逆向条令"), "不得包含逆向条令");
});

test("reverse 模式：核心条令 + 逆向条令，不含渗透条令", () => {
	const block = buildPromptBlock("reverse");
	assert.ok(block.includes("授权事实"));
	assert.ok(block.includes("协议逆向条令"), "必须包含网络与协议逆向条令");
	assert.ok(!block.includes("渗透作战条令"), "不得包含渗透条令");
});

test("full 模式：全量注入", () => {
	const block = buildPromptBlock("full");
	for (const marker of ["授权事实", "渗透作战条令", "协议逆向条令"]) {
		assert.ok(block.includes(marker), `缺少 ${marker}`);
	}
});

test("注入块包含方法论关键要素", () => {
	const block = buildPromptBlock("full");
	// 威胁建模优先 / oracle 证据纪律 / 假定 breach / exploit 导向 / 薄切片
	for (const marker of ["威胁建模", "oracle", "假定 breach", "exploit", "薄切片", "先证伪再上报"]) {
		assert.ok(block.includes(marker), `缺少方法论要素：${marker}`);
	}
});

test("注入块体量受控（防止上下文腐化）", () => {
	// 全量注入也不应超过 4000 字符，脚手架必须保持小体量
	assert.ok(buildPromptBlock("full").length < 4000, "注入块过大，会挤占分析 token");
});

// ---------------------------------------------------------------------------
// 配置加载：损坏与缺失一律回退默认，绝不阻断扩展加载
// ---------------------------------------------------------------------------

test("配置文件不存在时回退默认配置", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-redkit-test-"));
	try {
		assert.deepEqual(loadConfig(join(dir, "missing.json")), DEFAULT_CONFIG);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("配置文件 JSON 损坏时回退默认配置", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-redkit-test-"));
	try {
		const path = join(dir, "bad.json");
		writeFileSync(path, "{ not json", "utf8");
		assert.deepEqual(loadConfig(path), DEFAULT_CONFIG);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("配置非法字段被过滤，合法字段生效", () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-redkit-test-"));
	try {
		const path = join(dir, "cfg.json");
		writeFileSync(
			path,
			JSON.stringify({
				mode: "reverse",
				enforcement: "bogus",
				engagementDir: "../escape",
				allowlist: ["docs.example.com", "", 42],
			}),
			"utf8",
		);
		const config = loadConfig(path);
		assert.equal(config.mode, "reverse");
		assert.equal(config.enforcement, DEFAULT_CONFIG.enforcement, "非法 enforcement 回退默认");
		assert.equal(config.engagementDir, DEFAULT_CONFIG.engagementDir, "路径穿越的目录被拒绝");
		assert.deepEqual(config.allowlist, ["docs.example.com"]);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

// ---------------------------------------------------------------------------
// 扩展工厂：模拟 pi 加载过程，验证每次运行都会钉入条令
// ---------------------------------------------------------------------------

/** 最小 pi 存根：只捕获 before_agent_start 处理器 */
function stubPi() {
	const handlers: Array<(event: { systemPrompt: string }) => { systemPrompt?: string } | undefined> = [];
	const pi = {
		on(event: string, handler: (event: { systemPrompt: string }) => { systemPrompt?: string } | undefined) {
			assert.equal(event, "before_agent_start", "只应订阅 before_agent_start");
			handlers.push(handler);
		},
	};
	return { pi, handlers };
}

function makeConfig(mode: RedkitConfig["mode"]): RedkitConfig {
	return { ...DEFAULT_CONFIG, mode };
}

test("工厂注册 before_agent_start，处理器把条令追加到系统提示词尾部", () => {
	const { pi, handlers } = stubPi();
	// 类型层面 pi 存根不等于 ExtensionAPI，这里只验证运行时行为
	piRedkit(pi as never, makeConfig("full"));
	assert.equal(handlers.length, 1);
	const result = handlers[0]({ systemPrompt: "BASE_PROMPT" });
	assert.ok(result?.systemPrompt.startsWith("BASE_PROMPT"), "原系统提示词必须保留在前");
	assert.ok(result.systemPrompt.includes("授权事实"), "条令必须钉在原提示词之后");
	assert.ok(result.systemPrompt.includes("协议逆向条令"));
});

test("off 模式不注册任何处理器（零注入、零开销）", () => {
	const { pi, handlers } = stubPi();
	piRedkit(pi as never, makeConfig("off"));
	assert.equal(handlers.length, 0);
});
