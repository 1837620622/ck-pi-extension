/**
 * ck-pi-guard: 边缘网关与传输层异常重试拦截器 (Gateway Fetch Retry)
 *
 * 核心特性与安全保障：
 * 1. 全局 Symbol 单例与动态透传：防止热重载或多实例重复包装，支持无缝参数更新；
 * 2. 标头完备继承：精准合并 Request 与 RequestInit Headers，绝不丢失鉴权与 Session 凭据；
 * 3. 跨重试安全复用：针对 Body 进行只读快照缓存，流式 Body/已扰动请求安全降级，防范 Disturbed Body 异常；
 * 4. GET/HEAD 严格规约：绝不为 GET/HEAD 请求构造 Body，符合 HTTP/WHATWG 规范；
 * 5. 防范重试风暴：智能识别已由专用插件 (Cline/Zen) 接管的端点与状态码，避免 16 倍乘法重试；
 * 6. 精准候选匹配：严格限制 LLM 推理特征路径与白名单，杜绝误伤非幂等业务 API；
 * 7. 零延时 AbortSignal 熔断：退避期间监听取消信号并透传原始 abort reason；
 * 8. 安全清理响应流：使用 response.body.cancel() 替代阻塞式 arrayBuffer，杜绝悬挂并保护响应完整性。
 */

import type { GuardConfig, GuardStats } from "./types.js";

const GUARD_INTERCEPTOR_GLOBAL_KEY = Symbol.for("ck.pi.guard.fetch.interceptor");

interface GuardGlobalContainer {
	installed: boolean;
	originalFetch: typeof globalThis.fetch;
	config: GuardConfig;
	stats: GuardStats;
}

function getGlobalState(): GuardGlobalContainer | undefined {
	return (globalThis as any)[GUARD_INTERCEPTOR_GLOBAL_KEY];
}

function setGlobalState(state: GuardGlobalContainer): void {
	(globalThis as any)[GUARD_INTERCEPTOR_GLOBAL_KEY] = state;
}

/**
 * 带有 AbortSignal 监听的零悬挂安全休眠
 */
export function sleepWithSignal(ms: number, signal?: AbortSignal | null): Promise<void> {
	if (signal?.aborted) {
		const reason = signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
		return Promise.reject(reason);
	}
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);

		const onAbort = () => {
			clearTimeout(timer);
			signal?.removeEventListener("abort", onAbort);
			const reason = signal?.reason ?? new DOMException("The operation was aborted.", "AbortError");
			reject(reason);
		};

		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

/**
 * Full Jitter 指数退避算法 (兼容 Retry-After 标头)
 */
export function calculateBackoffDelay(
	attempt: number,
	initialMs: number,
	maxMs: number,
	retryAfterHeader?: string | null,
): number {
	if (retryAfterHeader) {
		const seconds = Number.parseInt(retryAfterHeader, 10);
		if (!Number.isNaN(seconds) && seconds > 0) {
			return Math.min(maxMs, seconds * 1000);
		}
		const dateMs = Date.parse(retryAfterHeader);
		if (!Number.isNaN(dateMs)) {
			const diff = dateMs - Date.now();
			if (diff > 0) {
				return Math.min(maxMs, diff);
			}
		}
	}

	// Full Jitter: 保证在 initialMs 到 min(maxMs, initialMs * 2^(attempt-1)) 之间均匀随机
	const exponential = Math.min(maxMs, initialMs * Math.pow(2, attempt - 1));
	const spread = Math.max(0, exponential - initialMs);
	return Math.floor(Math.random() * (spread + 1)) + initialMs;
}

/**
 * 标准大模型推理路径特征正则
 */
const LLM_PATH_REGEX =
	/(?:\/v1)?\/(?:chat\/completions|completions|messages|responses|models)(?:\?|$)|(?:\/zen\/v1\/chat\/completions)|(?::generateContent(?:\?|$))/i;

/**
 * 知名主流大模型供应商 Host 表
 */
const KNOWN_LLM_HOSTS = [
	"api.openai.com",
	"api.anthropic.com",
	"api.deepseek.com",
	"openrouter.ai",
	"api.groq.com",
	"api.mistral.ai",
	"generativelanguage.googleapis.com",
	"api.together.xyz",
	"api.perplexity.ai",
	"opencode.ai",
	"api.cline.bot",
];

/**
 * 检查 URL 与 Method 是否为合法的大模型推理或元数据接口
 */
export function isEligibleLLMEndpoint(
	urlStr: string,
	method: string,
	config: GuardConfig,
): boolean {
	const normMethod = (method || "GET").toUpperCase();

	// 排除黑名单
	if (config.urlExcludePatterns && config.urlExcludePatterns.length > 0) {
		for (const pattern of config.urlExcludePatterns) {
			if (typeof pattern === "string" && urlStr.includes(pattern)) return false;
			if (pattern instanceof RegExp && pattern.test(urlStr)) return false;
		}
	}

	// 检查白名单
	if (config.urlIncludePatterns && config.urlIncludePatterns.length > 0) {
		for (const pattern of config.urlIncludePatterns) {
			if (typeof pattern === "string" && urlStr.includes(pattern)) return true;
			if (pattern instanceof RegExp && pattern.test(urlStr)) return true;
		}
	}

	// 解析 URL
	let parsedUrl: URL;
	try {
		parsedUrl = new URL(urlStr);
	} catch {
		return false;
	}

	const host = parsedUrl.hostname.toLowerCase();
	const path = parsedUrl.pathname;

	// 排除本地回环代理 (已由本地插件进程保障，不需要长退避)
	if (host === "127.0.0.1" || host === "localhost") {
		return false;
	}

	// 核心路径匹配
	const isLlmPath = LLM_PATH_REGEX.test(path);

	// 大模型推理通常为 POST；/models 路径通常为 GET
	if (normMethod === "POST") {
		if (isLlmPath) return true;
		if (host.includes("relay") && (path.includes("completions") || path.includes("messages"))) {
			return true;
		}
		if (KNOWN_LLM_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
			return true;
		}
	} else if (normMethod === "GET") {
		// 仅对明确的模型目录接口放行 GET 重试
		if (path.endsWith("/models") || path.includes("/v1/models")) {
			return true;
		}
	}

	return false;
}

/**
 * 判定当前请求是否属于网关重试候选者 (严格匹配，防范误伤)
 */
export function isGatewayRetryCandidate(
	urlStr: string,
	method: string,
	status: number,
	config: GuardConfig,
): boolean {
	if (!config.retryStatusCodes.includes(status)) {
		return false;
	}

	return isEligibleLLMEndpoint(urlStr, method, config);
}

/**
 * 避免与同进程内其他插件 (Zen, Cline) 发生乘法重试风暴
 */
export function shouldBypassDuplicatePluginRetry(urlStr: string, status: number): boolean {
	// Cline 已经全面接管了 api.cline.bot 的所有 5xx 重试，Guard 应当主动让出，防止 16 次风暴
	if (urlStr.includes("api.cline.bot")) {
		return true;
	}

	// Zen 已经针对 opencode.ai/zen/ 接管了 500, 502, 503, 504, 524
	// Guard 仅对 Zen 未处理的 520, 521, 522, 523, 525, 533 进行兜底，绝不重复重试 504/524
	if (urlStr.includes("opencode.ai/zen/")) {
		if ([500, 502, 503, 504, 524].includes(status)) {
			return true;
		}
	}

	return false;
}

/**
 * 安装网关 Fetch 拦截器
 */
export function installGatewayFetchInterceptor(
	config: GuardConfig,
	stats: GuardStats,
): void {
	let state = getGlobalState();

	// 若已安装，更新配置与统计对象引用，防止多层洋葱包装
	if (state?.installed) {
		state.config = config;
		state.stats = stats;
		return;
	}

	const originalFetch = globalThis.fetch;
	state = {
		installed: true,
		originalFetch,
		config,
		stats,
	};
	setGlobalState(state);

	globalThis.fetch = async function guardFetch(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		const currentState = getGlobalState();
		// 若被禁用或未就绪，完全透传
		if (!currentState?.installed || !currentState.config.enabled || !currentState.config.gatewayRetryEnabled) {
			return currentState ? currentState.originalFetch(input, init) : originalFetch(input, init);
		}

		const cfg = currentState.config;
		const st = currentState.stats;
		const nextFetch = currentState.originalFetch;

		// 提取 URL 字符串
		const urlString =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: input.url;

		// 仅拦截 HTTP/HTTPS
		if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
			return nextFetch(input, init);
		}

		// 提取与规范化 Method
		const method = (
			init?.method ?? (input instanceof Request ? input.method : "GET")
		).toUpperCase();

		// 快速判断：若当前请求完全不属于 LLM 推理范畴，直接调用底层 Fetch，不消耗任何内存做 Body 克隆
		if (!isEligibleLLMEndpoint(urlString, method, cfg)) {
			return nextFetch(input, init);
		}

		// 提取 AbortSignal
		const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
		if (signal?.aborted) {
			throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
		}

		// 完整合并 Headers，确保鉴权与追踪标头绝不丢失
		const mergedHeaders = new Headers();
		if (input instanceof Request) {
			input.headers.forEach((val, key) => mergedHeaders.set(key, val));
		}
		if (init?.headers) {
			new Headers(init.headers).forEach((val, key) => mergedHeaders.set(key, val));
		}

		// 处理请求体安全快照 (GET/HEAD 严禁有 Body)
		let cachedBodySnapshot: Uint8Array | string | null = null;
		let bodyReusable = true;

		if (method !== "GET" && method !== "HEAD") {
			if (typeof init?.body === "string") {
				cachedBodySnapshot = init.body;
			} else if (init?.body instanceof Uint8Array || init?.body instanceof ArrayBuffer) {
				cachedBodySnapshot = init.body instanceof ArrayBuffer ? new Uint8Array(init.body) : init.body;
			} else if (init?.body) {
				// Body 为 ReadableStream 或 FormData 等不可重置流
				try {
					const tempRes = new Response(init.body as BodyInit);
					const ab = await tempRes.arrayBuffer();
					cachedBodySnapshot = new Uint8Array(ab);
				} catch {
					bodyReusable = false;
				}
			} else if (input instanceof Request && input.body) {
				if (input.bodyUsed) {
					bodyReusable = false;
				} else {
					try {
						const ab = await input.clone().arrayBuffer();
						cachedBodySnapshot = new Uint8Array(ab);
					} catch {
						bodyReusable = false;
					}
				}
			}
		}

		// 若 Body 无法安全复用，退化为仅执行 1 次请求，禁止任何重试，杜绝抛出 disturbed or locked 异常
		const maxRetries = bodyReusable ? cfg.maxGatewayRetries : 0;

		let lastError: unknown;
		let lastResponse: Response | undefined;

		for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
			if (signal?.aborted) {
				throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
			}

			try {
				// 构建本轮调用的纯净 RequestInit
				const currentInit: RequestInit = {
					...init,
					method,
					headers: mergedHeaders,
					signal,
				};

				if (method !== "GET" && method !== "HEAD" && cachedBodySnapshot !== null) {
					currentInit.body = cachedBodySnapshot;
					// Node 环境下提供 duplex 保障
					(currentInit as any).duplex = "half";
				} else if (method === "GET" || method === "HEAD") {
					delete currentInit.body;
				}

				// 使用统一的 urlString + currentInit 调用，避免传入 Request 实例造成二次 Header 冲刷
				const response = await nextFetch(urlString, currentInit);

				// 检查状态码是否命中重试条件
				const isCandidate = isGatewayRetryCandidate(urlString, method, response.status, cfg);
				const isBypassed = shouldBypassDuplicatePluginRetry(urlString, response.status);

				if (isCandidate && !isBypassed) {
					if (attempt <= maxRetries) {
						st.totalGatewayRetries++;
						st.lastGatewayRetryAt = new Date().toISOString();
						st.lastGatewayRetryStatus = response.status;

						const retryAfter = response.headers.get("retry-after");
						const delay = calculateBackoffDelay(
							attempt,
							cfg.gatewayInitialBackoffMs,
							cfg.gatewayMaxBackoffMs,
							retryAfter,
						);

						// 快速取消并丢弃当前失败的流，绝不使用阻塞式 arrayBuffer()
						response.body?.cancel().catch(() => {});

						await sleepWithSignal(delay, signal);
						continue;
					}
				}

				// 正常 2xx、4xx 或已耗尽重试次数时返回最新响应 (其 Body 未被破坏，可安全读取)
				return response;
			} catch (err) {
				lastError = err;

				// 遇到用户主动取消，立即抛出，绝不重试
				if (signal?.aborted || (err as any)?.name === "AbortError" || (err as any)?.code === 20) {
					throw err;
				}

				// 网络级瞬断重试判定 (必须同时满足是合格的 LLM 端点)
				const errMsg = String(err).toLowerCase();
				const isNetworkGlitch =
					errMsg.includes("econnreset") ||
					errMsg.includes("etimedout") ||
					errMsg.includes("fetch failed") ||
					errMsg.includes("und_err_socket") ||
					errMsg.includes("network error");

				if (isNetworkGlitch && attempt <= maxRetries && !shouldBypassDuplicatePluginRetry(urlString, 0)) {
					st.totalGatewayRetries++;
					st.lastGatewayRetryAt = new Date().toISOString();
					st.lastGatewayRetryStatus = 0;

					const delay = calculateBackoffDelay(
						attempt,
						cfg.gatewayInitialBackoffMs,
						cfg.gatewayMaxBackoffMs,
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
}

/**
 * 恢复/卸载网关 Fetch 拦截器 (采用安全的 Bypass 模式，绝不破坏下游拦截链)
 */
export function restoreGatewayFetchInterceptor(): void {
	const state = getGlobalState();
	if (state) {
		state.installed = false;
	}
}
