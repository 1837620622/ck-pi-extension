/**
 * ck-pi-guard 类型定义
 */

export interface GuardConfig {
	enabled: boolean;
	maxConsecutiveContinues: number;
	gatewayRetryEnabled: boolean;
	maxGatewayRetries: number;
	gatewayInitialBackoffMs: number;
	gatewayMaxBackoffMs: number;
	retryStatusCodes: number[];
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
	// 504: Gateway Timeout
	// 520: Web Server Returned an Unknown Error
	// 521: Web Server Is Down
	// 522: Connection Timed Out (Cloudflare 源站连接超时)
	// 524: A Timeout Occurred (Cloudflare 响应超时)
	// 533: Cloudflare 边缘连接重置 / 路由异常
	retryStatusCodes: [504, 520, 521, 522, 524, 533],
};
