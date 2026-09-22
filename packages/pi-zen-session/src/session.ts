/**
 * OpenCode Zen 客户端会话 ID 逆向生成器与时间戳解析器
 *
 * 逆向自 OpenCode 官方二进制客户端 Identifier.descending("ses") 算法：
 * 1. 结构：ses_<12位反转时间戳十六进制><14位Base62随机安全字符>，总长 30 字符。
 * 2. 时间戳编码：
 *    combined = BigInt(Date.now()) * 4096n + BigInt(counter)
 *    inverted = ~combined
 *    取低 48 位按大端序编码为 12 位十六进制。
 * 3. 降序特性（descending）：时间越晚，按字典序排序越靠前。
 */

import { webcrypto } from "node:crypto";

const B62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

let lastTimestamp = 0;
let sequenceCounter = 0;

/**
 * 生成符合 OpenCode 官方规约的 Session ID (前缀 ses_)
 * @param timestampMs 毫秒时间戳，默认为 Date.now()
 */
export function generateZenSessionId(timestampMs: number = Date.now()): string {
	if (timestampMs !== lastTimestamp) {
		lastTimestamp = timestampMs;
		sequenceCounter = 0;
	}
	sequenceCounter++;

	// 0x1000n = 4096n
	const combined = BigInt(timestampMs) * 0x1000n + BigInt(sequenceCounter);
	const inverted = ~combined;

	// 6 字节（48 位）大端序十六进制
	let hex = "";
	for (let i = 0; i < 6; i++) {
		const byte = Number((inverted >> BigInt(40 - 8 * i)) & 0xffn);
		hex += byte.toString(16).padStart(2, "0");
	}

	// 14 字符 Base62 密码学安全随机串
	const randBytes = new Uint8Array(14);
	if (typeof crypto !== "undefined" && crypto.getRandomValues) {
		crypto.getRandomValues(randBytes);
	} else if (webcrypto && webcrypto.getRandomValues) {
		webcrypto.getRandomValues(randBytes);
	} else {
		for (let i = 0; i < 14; i++) {
			randBytes[i] = Math.floor(Math.random() * 256);
		}
	}

	let randStr = "";
	for (let i = 0; i < 14; i++) {
		randStr += B62_CHARS[randBytes[i] % 62];
	}

	return `ses_${hex}${randStr}`;
}

/**
 * 生成符合 OpenCode 官方规约的 Request 请求唯一标识符 (前缀 msg_, 升序 ascending)
 * @param timestampMs 毫秒时间戳，默认为 Date.now()
 */
export function generateZenRequestId(timestampMs: number = Date.now()): string {
	if (timestampMs !== lastTimestamp) {
		lastTimestamp = timestampMs;
		sequenceCounter = 0;
	}
	sequenceCounter++;

	const combined = BigInt(timestampMs) * 0x1000n + BigInt(sequenceCounter);
	// 升序直接编码，不取反
	let hex = "";
	for (let i = 0; i < 6; i++) {
		const byte = Number((combined >> BigInt(40 - 8 * i)) & 0xffn);
		hex += byte.toString(16).padStart(2, "0");
	}

	const randBytes = new Uint8Array(14);
	if (typeof crypto !== "undefined" && crypto.getRandomValues) {
		crypto.getRandomValues(randBytes);
	} else if (webcrypto && webcrypto.getRandomValues) {
		webcrypto.getRandomValues(randBytes);
	} else {
		for (let i = 0; i < 14; i++) {
			randBytes[i] = Math.floor(Math.random() * 256);
		}
	}

	let randStr = "";
	for (let i = 0; i < 14; i++) {
		randStr += B62_CHARS[randBytes[i] % 62];
	}

	return `msg_${hex}${randStr}`;
}

/**
 * 校验字符串是否为标准 OpenCode Zen Session ID
 */
export function isValidZenSessionId(id: string | null | undefined): boolean {
	if (!id || typeof id !== "string") return false;
	return /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/.test(id);
}

/**
 * 从降序 Session ID 中提取精确创建毫秒时间戳
 * @param sessionId ses_ 开头的 30 位 ID
 * @param referenceTimeMs 参考基准时间（默认当前时间），用于消解 36 位周期（约 2.18 年）
 */
export function extractZenSessionTimestamp(
	sessionId: string,
	referenceTimeMs: number = Date.now(),
): number | null {
	if (!isValidZenSessionId(sessionId)) return null;

	const hex = sessionId.slice(4, 16);
	const inverted48 = BigInt(`0x${hex}`);
	// inverted48 = 0xffffffffffffn - (combined & 0xffffffffffffn)
	const combined48 = 0xffffffffffffn - inverted48;
	const ts48 = combined48 / 0x1000n; // 36 位时间戳部分

	const MOD_36 = 1n << 36n;
	const refBig = BigInt(referenceTimeMs);
	const refBase = refBig - (refBig % MOD_36);
	let candidate = refBase + ts48;

	// 若相差超过半个周期，微调回正确的时间跨度
	if (candidate > refBig + (MOD_36 / 2n)) {
		candidate -= MOD_36;
	} else if (candidate < refBig - (MOD_36 / 2n)) {
		candidate += MOD_36;
	}

	return Number(candidate);
}

/**
 * 官方 OpenCode Zen 后端对会话生命周期严格限制（超 1 小时即报 403 FreeTierError）
 * 默认设定为 45 分钟，确保在达到 1 小时硬限制前无感平滑轮换
 */
export const DEFAULT_SESSION_MAX_AGE_MS = 45 * 60 * 1000;

/**
 * 判断指定 Session ID 是否已过期
 * @param sessionId 会话 ID
 * @param maxAgeMs 最大允许有效时长（默认 45 分钟）
 * @param nowMs 当前时间戳
 */
export function isZenSessionExpired(
	sessionId: string | null | undefined,
	maxAgeMs: number = DEFAULT_SESSION_MAX_AGE_MS,
	nowMs: number = Date.now(),
): boolean {
	if (!sessionId) return true;
	const ts = extractZenSessionTimestamp(sessionId, nowMs);
	if (ts === null) return true;
	const age = nowMs - ts;
	// 超过最大年限或超出未来 5 分钟（时钟漂移异常）均视为过期
	return age > maxAgeMs || age < -(5 * 60 * 1000);
}
