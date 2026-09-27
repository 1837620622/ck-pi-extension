/**
 * ck-pi-guard 类型定义
 */

export interface GuardConfig {
	/** 守护总开关 */
	enabled: boolean;
	/** 思考脱机守卫最大连续自动续行次数 */
	maxConsecutiveContinues: number;
	/** 边缘网关 Fetch 重试总开关 */
	gatewayRetryEnabled: boolean;
	/** 最大网关重试次数 (默认 3 次) */
	maxGatewayRetries: number;
	/** 指数退避初始延迟毫秒 (默认 1000ms) */
	gatewayInitialBackoffMs: number;
	/** 指数退避最大延迟毫秒 (默认 8000ms) */
	gatewayMaxBackoffMs: number;
	/** 触发网关重试的目标 HTTP 状态码列表 */
	retryStatusCodes: number[];
	/** 自定义纳入重试的 URL 包含规则 (字符串或正则) */
	urlIncludePatterns?: (string | RegExp)[];
	/** 自定义排除重试的 URL 排除规则 (字符串或正则) */
	urlExcludePatterns?: (string | RegExp)[];
}

export interface GuardStats {
	totalAutoContinues: number;
	totalGatewayRetries: number;
	consecutiveContinues: number;
	lastAutoContinueAt?: string;
	lastAutoContinueReason?: string;
	lastGatewayRetryAt?: string;
	lastGatewayRetryStatus?: number;
}

export const DEFAULT_GUARD_CONFIG: GuardConfig = {
	enabled: true,
	maxConsecutiveContinues: 3,
	gatewayRetryEnabled: true,
	maxGatewayRetries: 3,
	gatewayInitialBackoffMs: 1000,
	gatewayMaxBackoffMs: 8000,
	// 502: Bad Gateway (Nginx / 反向代理上游崩溃重灾区)
	// 503: Service Unavailable (服务过载 / 容器冷启动)
	// 504: Gateway Timeout (网关超时)
	// 520: Web Server Returned an Unknown Error (Cloudflare 异常空包)
	// 521: Web Server Is Down (Cloudflare 源站宕机 / RST)
	// 522: Connection Timed Out (Cloudflare 源站握手超时)
	// 523: Origin Is Unreachable (Cloudflare 源站不可达)
	// 524: A Timeout Occurred (Cloudflare 100s 响应超时)
	// 525: SSL Handshake Failed (Cloudflare TLS 握手瞬态超时)
	// 533: Cloudflare 边缘连接重置 / 路由异常
	retryStatusCodes: [502, 503, 504, 520, 521, 522, 523, 524, 525, 533],
};
