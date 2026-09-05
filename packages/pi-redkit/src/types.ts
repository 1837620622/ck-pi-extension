/**
 * pi-redkit 共享类型与常量
 *
 * 模式、范围条目、笔记条目、配置的统一定义。
 * 状态恢复与提示词注入都基于这里的类型。
 */

/** 作战模式：off 完全关闭；pentest 只注入渗透条令；reverse 只注入逆向条令；full 全量 */
export type RedkitMode = "off" | "pentest" | "reverse" | "full";

/** 范围执行强度：off 不检查；warn 越界只提醒；strict 越界直接拦截 bash 命令 */
export type ScopeEnforcement = "off" | "warn" | "strict";

/** 范围条目类型：域名 / CIDR 网段 / 单 IP / URL / 本地文件（二进制目标） / 移动应用包名 */
export type ScopeEntryType = "domain" | "cidr" | "ip" | "url" | "file" | "app";

export interface ScopeEntry {
	type: ScopeEntryType;
	/** 规范化后的值：域名小写、URL 保留原文、file 为展开后的路径 */
	value: string;
	note?: string;
}

/** 笔记/发现类别 */
export type NoteKind = "finding" | "evidence" | "credential" | "todo" | "log";

export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export interface NoteEntry {
	kind: NoteKind;
	title: string;
	content: string;
	severity?: FindingSeverity;
	target?: string;
	/** 运行期时间戳（交战证据链需要，非代码内硬编码日期） */
	ts: string;
}

/** 配置文件 ~/.pi/agent/ck-pi-redkit.json 的结构 */
export interface RedkitConfig {
	mode: RedkitMode;
	enforcement: ScopeEnforcement;
	/** 交战产物目录（相对 cwd） */
	engagementDir: string;
	/** 用户额外的基础设施白名单（包管理、文档站等永不拦截的域名） */
	allowlist: string[];
}

export const REDKIT_MODES: readonly RedkitMode[] = ["off", "pentest", "reverse", "full"];
export const SCOPE_ENFORCEMENTS: readonly ScopeEnforcement[] = ["off", "warn", "strict"];

export const DEFAULT_CONFIG: RedkitConfig = {
	mode: "full",
	enforcement: "warn",
	engagementDir: ".redkit",
	allowlist: [],
};

/** 会话持久化条目的 customType */
export const STATE_ENTRY_TYPE = "ck-pi-redkit-state";

/** 状态条目数据结构（appendEntry 持久化，分支恢复用） */
export interface RedkitStateEntry {
	mode: RedkitMode;
	enforcement: ScopeEnforcement;
	scope: ScopeEntry[];
}

export const CONFIG_FILE_NAME = "ck-pi-redkit.json";

/** redkit_note 工具调用结果 details 的形状（分支恢复时扫描用） */
export interface NoteToolDetails {
	note: NoteEntry;
	total: number;
}

/** redkit_scope 工具调用结果 details 的形状 */
export interface ScopeToolDetails {
	scope: ScopeEntry[];
}
