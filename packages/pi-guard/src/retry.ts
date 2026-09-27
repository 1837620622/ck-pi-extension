/**
 * ck-pi-guard: 边缘网关与传输层异常重试拦截器 (Gateway Fetch Retry)
 *
 * 核心定位与职责隔离：
 * 1. Pi 原生 retry (settings.retry)：工作于 Agent 会话层，针对已解析为 AssistantMessage 的
 *    业务级可重试错误 (如 429 限流、模型过载)。
 * 2. 本拦截器：专门工作于 HTTP 传输与边缘网关握手层，拦截直接在 Cloudflare / 反向代理处
 *    因网络链路瞬断或超时返回的网关异常状态码 (504, 520, 521, 522, 524, 533) 与网络中断。
 * 3. 对 200、400、401、403、429 等业务状态码 100% 原生透传放行，绝不与原有系统重试冲突。
 */

import type { GuardConfig, GuardStats } from "./types.js";

let originalFetch: typeof globalThis.fetch | undefined;
let isInterceptorInstalled = false;

function sleepWithSignal(ms: number, signal?: AbortSignal | null): Promise<void> {
	if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			reject(new DOMException("Aborted", "AbortError"));
		};
		signal?.addEventListener("abort", onAbort);
	});
}

function calculateBackoffDelay(
	attempt: number,
	initialMs: number,
	maxMs: number,
): number {
	// Full Jitter 指数退避：基准延迟 * 2^(attempt-1)，再随机取 0 ~ delay 之间的均匀分布
	const exponential = Math.min(maxMs, initialMs * Math.pow(2, attempt - 1));
	return Math.floor(Math.random() * (exponential - initialMs + 1)) + initialMs;
}

export function isGatewayRetryCandidate(
	urlStr: string,
	status: number,
	retryStatusCodes: number[],
): boolean {
	if (!retryStatusCodes.includes(status)) {
		return false;
	}

	const lower = urlStr.toLowerCase();
	// 仅对大模型推理相关端点 (chat/completions, completions, messages, v1/ 等) 生效
	return (
		lower.includes("chat/completions") ||
		lower.includes("/completions") ||
		lower.includes("/messages") ||
		lower.includes("/v1/") ||
		lower.includes("relay") ||
		lower.includes("api.")
	);
}

export function installGatewayFetchInterceptor(
	config: GuardConfig,
	stats: GuardStats,
): void {
	if (isInterceptorInstalled) return;

	originalFetch = globalThis.fetch;

	globalThis.fetch = async function guardFetch(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		if (!config.enabled || !config.gatewayRetryEnabled || !originalFetch) {
			return (originalFetch || fetch)(input, init);
		}

		const urlString =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: input.url;

		// 快速判断：非 HTTP/HTTPS 请求直接原生调用
		if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
			return originalFetch(input, init);
		}

		// 提取 signal 用于主动取消支持
		const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);

		// 如果请求体是已消耗的 ReadableStream，克隆支持可能受限，预读为 Buffer/ArrayBuffer
		let cachedBody: BodyInit | null | undefined = init?.body;
		if (!cachedBody && input instanceof Request && input.body) {
			try {
				cachedBody = await input.clone().arrayBuffer();
			} catch {
				// 无法克隆则退化为单次请求
			}
		}

		let lastError: unknown;
		let lastResponse: Response | undefined;

		for (let attempt = 1; attempt <= config.maxGatewayRetries + 1; attempt++) {
			if (signal?.aborted) {
				throw new DOMException("Aborted", "AbortError");
			}

			try {
				let requestInput: RequestInfo | URL = input;
				let requestInit: RequestInit | undefined = init;

				if (cachedBody !== undefined && cachedBody !== null) {
					requestInit = { ...init, body: cachedBody };
					if (input instanceof Request) {
						requestInput = new Request(input, { body: cachedBody });
					}
				}

				const response = await originalFetch(requestInput, requestInit);

				// 检查响应状态码是否属于边缘网关瞬态超时异常
				if (isGatewayRetryCandidate(urlString, response.status, config.retryStatusCodes)) {
					lastResponse = response;
					if (attempt <= config.maxGatewayRetries) {
						stats.totalGatewayRetries++;
						stats.lastGatewayRetryAt = new Date().toISOString();
						stats.lastGatewayRetryStatus = response.status;

						const delay = calculateBackoffDelay(
							attempt,
							config.gatewayInitialBackoffMs,
							config.gatewayMaxBackoffMs,
						);

						// 释放上一轮未使用的响应体
						try {
							await response.arrayBuffer();
						} catch {
							// 忽略释放异常
						}

						await sleepWithSignal(delay, signal);
						continue;
					}
				}

				return response;
			} catch (err) {
				lastError = err;
				if (signal?.aborted) {
					throw err;
				}

				// 网络级瞬断（如 ECONNRESET, ETIMEDOUT, fetch failed）同样在网关重试范围
				const errMsg = String(err).toLowerCase();
				const isNetworkGlitch =
					errMsg.includes("econnreset") ||
					errMsg.includes("etimedout") ||
					errMsg.includes("fetch failed") ||
					errMsg.includes("network error");

				if (isNetworkGlitch && attempt <= config.maxGatewayRetries) {
					stats.totalGatewayRetries++;
					stats.lastGatewayRetryAt = new Date().toISOString();
					stats.lastGatewayRetryStatus = 0; // 表示网络级错误

					const delay = calculateBackoffDelay(
						attempt,
						config.gatewayInitialBackoffMs,
						config.gatewayMaxBackoffMs,
					);
					await sleepWithSignal(delay, signal);
					continue;
				}

				throw err;
			}
		}

		if (lastResponse) {
			return lastResponse;
		}
		throw lastError;
	};

	isInterceptorInstalled = true;
}

export function restoreGatewayFetchInterceptor(): void {
	if (isInterceptorInstalled && originalFetch) {
		globalThis.fetch = originalFetch;
		isInterceptorInstalled = false;
	}
}
