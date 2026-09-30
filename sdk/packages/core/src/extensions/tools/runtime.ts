import { supportsModelTool } from "@cline/llms";
import type { CoreAgentMode } from "../../types/config";
import {
	DEFAULT_MODEL_TOOL_ROUTING_RULES,
	resolveToolRoutingConfig,
} from "./model-tool-routing";
import { resolveToolPresetName, ToolPresets } from "./presets";
import { TEAM_TOOL_NAMES } from "./team/team-tools";
import type { DefaultToolsConfig } from "./types";

export interface ToolCatalogEntry {
	id: string;
	description: string;
	defaultEnabled: boolean;
	headlessToolNames: string[];
	unavailableClientTypes?: readonly ToolClientType[];
}

export type ToolClientType = "cli" | "vscode";

export function resolveToolClientType(
	source?: string,
): ToolClientType | undefined {
	if (source === "vscode") return "vscode";
	if (source === "cli" || source?.startsWith("cline-cli")) return "cli";
	return undefined;
}

export interface BuiltinToolAvailabilityContext {
	mode?: CoreAgentMode;
	clientType?: ToolClientType;
	providerId?: string;
	modelId?: string;
	enableSpawnAgent?: boolean;
	enableAgentTeams?: boolean;
	disabledToolIds?: ReadonlySet<string>;
	enabledModelToolIds?: ReadonlySet<string>;
}

type RuntimeToolCatalogEntry = Omit<ToolCatalogEntry, "defaultEnabled">;

const BASE_TOOL_CATALOG: readonly RuntimeToolCatalogEntry[] = [
	{
		id: "web_search",
		description:
			"使用所选模型供应商的原生搜索能力搜索公开网页。",
		headlessToolNames: ["web_search"],
	},
	{
		id: "read_files",
		description:
			"读取指定绝对路径下的文本或图片文件内容；提供 start_line/end_line 时仅返回包含首末行的闭区间。长文件会分窗显示，可用 start_line/end_line 翻页。",
		headlessToolNames: ["read_files"],
	},
	{
		id: "search_codebase",
		description:
			"在整个代码库中执行正则搜索，匹配代码模式、定义、导入及其他文本。",
		headlessToolNames: ["search_codebase"],
	},
	{
		id: "run_commands",
		description:
			"在工作区根目录运行 shell 命令，用于列出文件、查看 git 状态、构建、测试等任务。",
		headlessToolNames: ["run_commands"],
	},
	{
		id: "editor",
		description:
			"通过创建、替换和插入操作，对文本文件进行受控的文件系统编辑。",
		headlessToolNames: ["editor"],
	},
	{
		id: "fetch_web_content",
		description:
			"抓取 URL 内容，并按给定的提取要求用提示词进行分析。",
		headlessToolNames: ["fetch_web_content"],
	},
	{
		id: "skills",
		description:
			"当存在与任务匹配的技能时，在主对话中执行该技能。",
		headlessToolNames: ["skills"],
	},
	{
		id: "ask_question",
		description:
			"向用户提出一个澄清问题，提供 2-5 个可选项。",
		headlessToolNames: ["ask_question"],
	},
	{
		id: "tasks",
		description:
			"创建并管理用户明确要求的单次与周期性智能体定时任务。",
		headlessToolNames: ["tasks"],
		unavailableClientTypes: ["cli", "vscode"],
	},
	{
		id: "spawn_agent",
		description:
			"创建子智能体来并行处理独立的子任务。",
		headlessToolNames: ["spawn_agent"],
	},
	{
		id: "teams",
		description:
			"启用团队协作工具：队友管理、任务协调、邮箱消息、任务日志与成果。",
		headlessToolNames: [...TEAM_TOOL_NAMES],
	},
] as const;

const TOOL_NAME_TO_FLAG: Partial<
	Record<
		string,
		keyof Pick<
			DefaultToolsConfig,
			| "enableReadFiles"
			| "enableSearch"
			| "enableBash"
			| "enableWebFetch"
			| "enableApplyPatch"
			| "enableEditor"
			| "enableSkills"
			| "enableAskQuestion"
			| "enableSubmitAndExit"
		>
	>
> = {
	read_files: "enableReadFiles",
	search_codebase: "enableSearch",
	run_commands: "enableBash",
	fetch_web_content: "enableWebFetch",
	apply_patch: "enableApplyPatch",
	editor: "enableEditor",
	skills: "enableSkills",
	ask_question: "enableAskQuestion",
};

function resolveContextMode(
	mode?: BuiltinToolAvailabilityContext["mode"],
): CoreAgentMode {
	return mode === "plan" || mode === "yolo" ? mode : "act";
}

type ResolvedToolFlags = Pick<
	DefaultToolsConfig,
	| "enableReadFiles"
	| "enableSearch"
	| "enableBash"
	| "enableWebFetch"
	| "enableApplyPatch"
	| "enableEditor"
	| "enableSkills"
	| "enableAskQuestion"
	| "enableSubmitAndExit"
> & {
	enableSpawnAgent?: boolean;
	enableAgentTeams?: boolean;
};

function resolvePresetFlags(context: BuiltinToolAvailabilityContext): {
	mode: CoreAgentMode;
	flags: ResolvedToolFlags;
} {
	const mode = resolveContextMode(context.mode);
	const preset = ToolPresets[resolveToolPresetName({ mode })];
	const routed = resolveToolRoutingConfig(
		context.providerId ?? "",
		context.modelId ?? "",
		mode,
		DEFAULT_MODEL_TOOL_ROUTING_RULES,
	);
	return {
		mode,
		flags: {
			...preset,
			...routed,
			...(typeof context.enableSpawnAgent === "boolean"
				? { enableSpawnAgent: context.enableSpawnAgent }
				: {}),
			...(typeof context.enableAgentTeams === "boolean"
				? { enableAgentTeams: context.enableAgentTeams }
				: {}),
		},
	};
}

export function isCoreBuiltinToolAvailable(
	toolName: string,
	clientType?: ToolClientType,
): boolean {
	if (!clientType) return true;
	const entry = BASE_TOOL_CATALOG.find(
		(candidate) =>
			candidate.id === toolName ||
			candidate.headlessToolNames.includes(toolName),
	);
	return !entry?.unavailableClientTypes?.includes(clientType);
}

function isEntryEnabledByDefault(
	entryId: string,
	context: BuiltinToolAvailabilityContext,
): boolean {
	if (context.disabledToolIds?.has(entryId)) {
		return false;
	}
	if (entryId === "web_search") {
		return context.enabledModelToolIds?.has(entryId) === true;
	}

	const { flags } = resolvePresetFlags(context);
	if (entryId === "spawn_agent") {
		return flags.enableSpawnAgent === true;
	}
	if (entryId === "teams") {
		return flags.enableAgentTeams === true;
	}
	if (entryId === "tasks") {
		return true;
	}
	if (entryId === "editor") {
		return flags.enableEditor === true || flags.enableApplyPatch === true;
	}

	const flag = TOOL_NAME_TO_FLAG[entryId];
	return flag ? flags[flag] === true : false;
}

function buildCatalogEntry(
	entry: RuntimeToolCatalogEntry,
	context: BuiltinToolAvailabilityContext,
): ToolCatalogEntry {
	if (entry.id === "editor") {
		const { flags } = resolvePresetFlags(context);
		const usesApplyPatch =
			flags.enableApplyPatch === true && flags.enableEditor !== true;
		return {
			...entry,
			defaultEnabled: isEntryEnabledByDefault(entry.id, context),
			headlessToolNames: [usesApplyPatch ? "apply_patch" : "editor"],
		};
	}

	return {
		...entry,
		defaultEnabled: isEntryEnabledByDefault(entry.id, context),
	};
}

export function getCoreBuiltinToolCatalog(
	context: BuiltinToolAvailabilityContext = {},
): ToolCatalogEntry[] {
	return BASE_TOOL_CATALOG.filter(
		(entry) =>
			isCoreBuiltinToolAvailable(entry.id, context.clientType) &&
			(entry.id !== "tasks" || resolveContextMode(context.mode) !== "yolo") &&
			(entry.id !== "web_search" ||
				supportsModelTool(
					{ providerId: context.providerId ?? "", modelId: context.modelId },
					"web_search",
				)),
	).map((entry) => buildCatalogEntry(entry, context));
}

/**
 * Whether the `skills` tool is part of a session's default toolset for this
 * availability context. Hosts consult this before dispatching a typed
 * `/skill` command: when the tool is available the command passes through as
 * typed and the model loads the instructions via the tool; when it is not
 * (e.g. the yolo preset or a user toggle disables it), textual expansion is
 * the only delivery path left.
 */
export function isSkillsToolAvailable(
	context: BuiltinToolAvailabilityContext = {},
): boolean {
	return getCoreBuiltinToolCatalog(context).some(
		(entry) => entry.id === "skills" && entry.defaultEnabled,
	);
}

export function getCoreDefaultEnabledToolIds(
	context: BuiltinToolAvailabilityContext = {},
): string[] {
	return getCoreBuiltinToolCatalog(context)
		.filter((entry) => entry.defaultEnabled)
		.map((entry) => entry.id);
}

export function resolveCoreSelectedToolIds(input: {
	enabled: boolean;
	allowlist?: string[];
	availabilityContext?: BuiltinToolAvailabilityContext;
}): Set<string> {
	if (!input.enabled) {
		return new Set();
	}

	const catalog = getCoreBuiltinToolCatalog(input.availabilityContext);
	const known = new Set(catalog.map((entry) => entry.id));
	if (!input.allowlist || input.allowlist.length === 0) {
		return new Set(
			catalog.filter((entry) => entry.defaultEnabled).map((entry) => entry.id),
		);
	}

	for (const id of input.allowlist) {
		if (!known.has(id)) {
			throw new Error(
				`Unknown tool "${id}". Available tools: ${catalog.map((entry) => entry.id).join(", ")}`,
			);
		}
	}
	return new Set(input.allowlist);
}

export function getCoreHeadlessToolNames(
	selectedToolIds: ReadonlySet<string>,
	context: BuiltinToolAvailabilityContext = {},
): string[] {
	return getCoreBuiltinToolCatalog(context)
		.filter((entry) => selectedToolIds.has(entry.id))
		.flatMap((entry) => entry.headlessToolNames);
}

export function getCoreAcpToolNames(
	selectedToolIds: ReadonlySet<string>,
	context: BuiltinToolAvailabilityContext = {},
): string[] {
	return getCoreHeadlessToolNames(selectedToolIds, context);
}
