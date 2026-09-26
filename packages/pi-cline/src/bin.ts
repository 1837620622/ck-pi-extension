#!/usr/bin/env node

/**
 * Cline OpenAI-Compatible Reverse Proxy CLI (本地反代独立运行器)
 */

import { startClineProxyServer, stopClineProxyServer } from "./proxy.js";
import { getStoredClineApiKey } from "./sync.js";
import { KNOWN_CLINE_FREE_MODELS } from "./models-registry.js";

const args = process.argv.slice(2);
let port = 4116;
let customKey = "";

for (let i = 0; i < args.length; i++) {
	const arg = args[i];
	if (arg === "--port" || arg === "-p") {
		port = parseInt(args[++i], 10) || 4116;
	} else if (arg === "--key" || arg === "-k") {
		customKey = args[++i] || "";
	} else if (/^\d+$/.test(arg)) {
		port = parseInt(arg, 10);
	}
}

const apiKey = customKey || getStoredClineApiKey();

async function main() {
	console.log("\x1b[1m\x1b[36m=== Cline OpenAI-Compatible 本地反向代理服务 ===\x1b[0m");
	console.log(`• 指纹伪装: 8大官方客户端特征标头已启用`);
	console.log(`• 免费模型: 已收录 ${Object.keys(KNOWN_CLINE_FREE_MODELS).length} 款零额度模型`);

	try {
		const srv = await startClineProxyServer({ port, apiKey });
		console.log(`\n\x1b[32m[OK] 代理服务已就绪！\x1b[0m`);
		console.log(`• OpenAI Base URL: \x1b[1m\x1b[34m${srv.url}\x1b[0m`);
		console.log(`• 对话补全端点:   \x1b[34m${srv.url}/chat/completions\x1b[0m`);
		console.log(`• 模型列表端点:   \x1b[34m${srv.url}/models\x1b[0m`);
		console.log(`• 免费模型端点:   \x1b[34m${srv.url}/models/free\x1b[0m`);
		console.log(`• 健康检查端点:   \x1b[34mhttp://127.0.0.1:${port}/health\x1b[0m`);
		console.log(`\n\x1b[90m可在 CC-Switch、Cursor、Cherry Studio 等任何 OpenAI 兼容客户端直接配置使用。\x1b[0m`);
		console.log(`\x1b[90m按 Ctrl+C 可停止代理服务。\x1b[0m\n`);

		process.on("SIGINT", async () => {
			console.log("\n正在停止反向代理服务...");
			await stopClineProxyServer();
			console.log("代理服务已安全退出。");
			process.exit(0);
		});

		process.on("SIGTERM", async () => {
			await stopClineProxyServer();
			process.exit(0);
		});
	} catch (err: any) {
		console.error(`\x1b[31m[x] 启动失败: ${err.message}\x1b[0m`);
		process.exit(1);
	}
}

main();
