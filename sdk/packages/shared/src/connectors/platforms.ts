export type ConnectorCatalogEntry = {
	name: string;
	description: string;
};

export const CONNECTOR_CATALOG: ConnectorCatalogEntry[] = [
	{
		name: "discord",
		description:
			"Discord interactions and gateway bridge backed by RPC runtime sessions",
	},
	{
		name: "gchat",
		description: "Google Chat webhook bridge backed by RPC runtime sessions",
	},
	{
		name: "linear",
		description: "Linear webhook bridge backed by RPC runtime sessions",
	},
	{
		name: "slack",
		description: "Slack webhook/socket bridge backed by RPC runtime sessions",
	},
	{
		name: "telegram",
		description: "Bridge Telegram bot messages into RPC chat sessions",
	},
	{
		name: "whatsapp",
		description: "Bridge WhatsApp webhook messages into RPC chat sessions",
	},
];

export function listConnectorCatalog(): ConnectorCatalogEntry[] {
	return CONNECTOR_CATALOG.map((entry) => ({ ...entry }));
}

export interface ConnectorPlatformDef {
	id: string;
	name: string;
	type: "polling" | "webhook" | "hybrid";
	hint: string;
	fields: ConnectorFieldDef[];
	/**
	 * Adapter-derived flags that may be persisted for fast reconnects but must
	 * be regenerated whenever dashboard-managed configuration changes.
	 */
	derivedReconnectFlags?: string[];
	security?: ConnectorSecurityDef;
}

export interface ConnectorFieldDef {
	flag: string;
	aliases?: string[];
	label: string;
	placeholder?: string;
	required?: boolean;
	help?: string[];
	initialValue?: string;
	options?: Array<{ value: string; label: string; hint?: string }>;
	includeWhen?: ConnectorFieldCondition;
}

export type ConnectorFieldCondition = {
	flag: string;
	equals?: string;
	notEquals?: string;
};

export interface ConnectorSecurityFieldDef {
	key: string;
	label: string;
	placeholder?: string;
	help?: string[];
	requiredMessage: string;
	validate?: (value: string) => string | undefined;
}

export interface ConnectorSecurityDef {
	prompt: string;
	fields: ConnectorSecurityFieldDef[];
	argumentFlags: string[];
	buildArgs: (values: Record<string, string>) => string[];
}

export type ConnectorChannel = {
	id: string;
	name: string;
	type: ConnectorPlatformDef["type"];
	hint: string;
	fields: ConnectorFieldDef[];
	security?: {
		prompt: string;
		fields: Array<Omit<ConnectorSecurityFieldDef, "validate">>;
	};
};

export type ActiveConnectorRecord = {
	id: string;
	type: string;
	instanceId: string;
	pid: number;
	hubUrl: string;
	startedAt?: string;
	applicationId?: string;
	botUsername?: string;
	userName?: string;
	phoneNumberId?: string;
	port?: number;
	baseUrl?: string;
	connectionMode?: string;
};

export type ConfiguredConnectorRecord = {
	id: string;
	type: string;
	configuredAt: string;
	updatedAt: string;
};

export type ConnectorChannelsResponse = {
	available: ConnectorChannel[];
	active: ActiveConnectorRecord[];
	configured: ConfiguredConnectorRecord[];
};

export function shouldIncludeConnectorField(
	field: ConnectorFieldDef,
	values: Record<string, string>,
): boolean {
	const condition = field.includeWhen;
	if (!condition) {
		return true;
	}
	const value = values[condition.flag] ?? "";
	if (condition.equals !== undefined && value !== condition.equals) {
		return false;
	}
	if (condition.notEquals !== undefined && value === condition.notEquals) {
		return false;
	}
	return true;
}

/**
 * Build the non-interactive CLI arguments for a validated connector
 * configuration. The channel name itself is intentionally omitted so the
 * arguments can be persisted and reused by any host.
 */
export function buildConnectorConnectArgs(
	platform: ConnectorPlatformDef,
	values: Record<string, string>,
	security?: { enabled: boolean; values: Record<string, string> },
): string[] {
	const fieldValues: Record<string, string> = {};
	for (const field of platform.fields) {
		const rawValue = values[field.flag];
		fieldValues[field.flag] =
			typeof rawValue === "string"
				? rawValue.trim()
				: (field.initialValue ?? "");
	}

	const args: string[] = [];
	for (const field of platform.fields) {
		if (!shouldIncludeConnectorField(field, fieldValues)) {
			continue;
		}
		const value = fieldValues[field.flag] ?? "";
		if (!value) {
			if (field.required) {
				throw new Error(`${field.label} is required`);
			}
			continue;
		}
		args.push(field.flag, value);
	}

	if (security?.enabled === true && platform.security) {
		const hookValues: Record<string, string> = {};
		for (const field of platform.security.fields) {
			const value = security.values[field.key]?.trim();
			if (!value) {
				throw new Error(field.requiredMessage);
			}
			const validationError = field.validate?.(value);
			if (validationError) {
				throw new Error(validationError);
			}
			hookValues[field.key] = value;
		}
		args.push(...platform.security.buildArgs(hookValues));
	}

	return args;
}

function isManagedConnectorArg(
	arg: string,
	managedFlags: Set<string>,
): { managed: boolean; consumesNext: boolean } {
	if (managedFlags.has(arg)) {
		return { managed: true, consumesNext: true };
	}
	for (const flag of managedFlags) {
		if (arg.startsWith(`${flag}=`)) {
			return { managed: true, consumesNext: false };
		}
	}
	return { managed: false, consumesNext: false };
}

/**
 * Replace dashboard-owned connector and security flags while retaining
 * CLI-only runtime options such as provider, model, cwd, and tool settings.
 */
export function mergeConnectorConnectArgs(
	platform: ConnectorPlatformDef,
	existingArgs: string[],
	configuredArgs: string[],
	options: { replaceSecurityArgs: boolean },
): string[] {
	const managedFlags = new Set([
		...platform.fields.flatMap((field) => [
			field.flag,
			...(field.aliases ?? []),
		]),
		...(platform.derivedReconnectFlags ?? []),
	]);
	if (options.replaceSecurityArgs) {
		for (const flag of platform.security?.argumentFlags ?? []) {
			managedFlags.add(flag);
		}
	}

	const preservedArgs: string[] = [];
	for (let index = 0; index < existingArgs.length; index += 1) {
		const arg = existingArgs[index] ?? "";
		const match = isManagedConnectorArg(arg, managedFlags);
		if (!match.managed) {
			preservedArgs.push(arg);
			continue;
		}
		if (match.consumesNext) {
			index += 1;
		}
	}
	return [...preservedArgs, ...configuredArgs];
}

export function connectorChannelsFromPlatforms(
	platforms: ConnectorPlatformDef[] = CONNECTOR_PLATFORMS,
): ConnectorChannel[] {
	const supported = new Set(
		listConnectorCatalog().map((connector) => connector.name),
	);
	return platforms
		.filter((platform) => supported.has(platform.id))
		.map((platform) => ({
			id: platform.id,
			name: platform.name,
			type: platform.type,
			hint: platform.hint,
			fields: platform.fields.map((field) => ({
				flag: field.flag,
				label: field.label,
				placeholder: field.placeholder,
				required: field.required,
				help: field.help,
				initialValue: field.initialValue,
				options: field.options,
				includeWhen: field.includeWhen,
			})),
			security: platform.security
				? {
						prompt: platform.security.prompt,
						fields: platform.security.fields.map((field) => ({
							key: field.key,
							label: field.label,
							placeholder: field.placeholder,
							help: field.help,
							requiredMessage: field.requiredMessage,
						})),
					}
				: undefined,
		}));
}

function validateTelegramUserId(value: string): string | undefined {
	return /^\d+$/.test(value)
		? undefined
		: "Telegram 用户 ID 只能包含数字";
}

function validateSlackTeamId(value: string): string | undefined {
	return /^T[A-Z0-9]+$/.test(value)
		? undefined
		: "Slack 工作区 ID 需以 T 开头，且只能包含大写字母或数字";
}

function validateSlackUserId(value: string): string | undefined {
	return /^[UW][A-Z0-9]+$/.test(value)
		? undefined
		: "Slack 成员 ID 需以 U 或 W 开头，且只能包含大写字母或数字";
}

export const CONNECTOR_PLATFORMS: ConnectorPlatformDef[] = [
	{
		id: "telegram",
		name: "Telegram",
		type: "polling",
		hint: "最易配置，无需公网 URL。",
		derivedReconnectFlags: ["-m", "--bot-username"],
		fields: [
			{
				flag: "-k",
				aliases: ["--bot-token"],
				label: "机器人令牌",
				placeholder: "7123456789:AAH...",
				required: true,
				help: [
					"打开 Telegram，与 @BotFather 开始对话",
					"发送 /newbot 并按提示操作",
					"创建机器人后 BotFather 会返回这个令牌",
					"形如 7123456789:AAHxxx...",
				],
			},
		],
		security: {
			prompt:
				"默认情况下，任何找到该机器人都能向它发消息并在你的机器上运行任务。是否限制为仅你的 Telegram 用户 ID 可用？",
			fields: [
				{
					key: "userId",
					label: "你的 Telegram 用户 ID",
					placeholder: "123456789",
					help: [
						"在 Telegram 上给 @userinfobot 发消息",
						"它会回复你的数字用户 ID",
					],
					requiredMessage: "限制访问范围时必须填写用户 ID",
					validate: validateTelegramUserId,
				},
			],
			argumentFlags: ["--allowed-user-id", "--hook-command"],
			buildArgs: ({ userId }) => ["--allowed-user-id", userId ?? ""],
		},
	},
	{
		id: "slack",
		name: "Slack",
		type: "hybrid",
		hint: "Webhook 模式需公网 URL；留空则用 socket 模式。",
		fields: [
			{
				flag: "--bot-token",
				label: "机器人令牌",
				placeholder: "xoxb-...",
				required: true,
				help: [
					"前往 api.slack.com/apps 新建一个应用",
					"添加 Bot Token Scopes：chat:write、app_mentions:read、channels:history、channels:read、im:history、im:read、im:write、users:read",
					"安装到工作区并复制 Bot Token",
				],
			},
			{
				flag: "--base-url",
				label: "公网基础 URL",
				placeholder: "留空则使用 socket 模式",
				help: [
					"为 webhook 模式填写一个可公网访问的 URL",
					"留空则改用 Slack socket 模式",
				],
			},
			{
				flag: "--signing-secret",
				label: "签名密钥",
				required: true,
				help: ["在应用的 Basic Information 页面可找到"],
				includeWhen: { flag: "--base-url", notEquals: "" },
			},
			{
				flag: "--app-token",
				label: "应用级令牌",
				placeholder: "xapp-...",
				required: true,
				help: [
					"在 Slack 应用中启用 Socket Mode",
					"生成带有 connections:write 权限范围的应用级令牌",
				],
				includeWhen: { flag: "--base-url", equals: "" },
			},
		],
		security: {
			prompt: "是否限制可与机器人交互的 Slack 用户？",
			fields: [
				{
					key: "teamId",
					label: "允许的 Slack 工作区 ID",
					placeholder: "T01ABC123",
					help: [
						"在浏览器中打开你的 Slack 工作区 URL",
						"工作区 ID 是 /client/ 之后的那一段，例如 T01ABC123",
					],
					requiredMessage: "限制访问范围时必须填写工作区 ID",
					validate: validateSlackTeamId,
				},
				{
					key: "userId",
					label: "允许的 Slack 成员 ID",
					placeholder: "U01ABC123",
					help: [
						"在 Slack 中点击某个用户的名字，再查看完整资料",
						"点击“...”并复制成员 ID",
					],
					requiredMessage: "限制访问范围时必须填写成员 ID",
					validate: validateSlackUserId,
				},
			],
			argumentFlags: ["--hook-command"],
			buildArgs: ({ teamId, userId }) => [
				"--hook-command",
				`jq -r ".payload.actor.participantKey" | grep -qx "slack:team:${teamId}:user:${userId}" && echo '{"action":"allow"}' || echo '{"action":"deny"}'`,
			],
		},
	},
	{
		id: "discord",
		name: "Discord",
		type: "webhook",
		hint: "需要一个 Discord 应用和公网 URL。",
		fields: [
			{
				flag: "--application-id",
				aliases: ["--app-id"],
				label: "应用 ID",
				required: true,
				help: [
					"前往 discord.com/developers/applications",
					"新建一个应用并复制 Application ID",
				],
			},
			{
				flag: "--bot-token",
				aliases: ["--token"],
				label: "机器人令牌",
				required: true,
				help: ["进入 Bot 分区，创建机器人并复制令牌"],
			},
			{
				flag: "--public-key",
				label: "公钥",
				required: true,
				help: ["在应用的 General Information 中可找到"],
			},
			{
				flag: "--base-url",
				label: "公网基础 URL",
				placeholder: "https://example.com",
				required: true,
				help: [
					"连接器的基础 URL",
					"Discord 需把 Interactions Endpoint URL 设为 <base-url>/api/webhooks/discord",
				],
			},
		],
	},
	{
		id: "whatsapp",
		name: "WhatsApp",
		type: "webhook",
		hint: "需要 Meta 开发者账号和公网 URL。",
		fields: [
			{
				flag: "--phone-number-id",
				label: "电话号码 ID",
				required: true,
				help: ["在 Meta 开发者后台的 WhatsApp Business 账号中获取"],
			},
			{
				flag: "--access-token",
				label: "访问令牌",
				required: true,
				help: ["在 Meta 开发者后台生成永久令牌"],
			},
			{
				flag: "--app-secret",
				label: "应用密钥",
				required: true,
				help: ["在 App Settings > Basic 中可找到"],
			},
			{
				flag: "--verify-token",
				label: "Webhook 校验令牌",
				placeholder: "my-verify-token",
				required: true,
				help: ["任意自选字符串，用于校验 webhook 配置"],
			},
			{
				flag: "--base-url",
				label: "公网基础 URL",
				placeholder: "https://example.com",
				required: true,
			},
		],
	},
	{
		id: "gchat",
		name: "Google Chat",
		type: "webhook",
		hint: "需要 Google Cloud 项目和公网 URL。",
		fields: [
			{
				flag: "--credentials-json",
				label: "服务账号凭据 JSON",
				required: true,
				help: [
					"在 Google Cloud Console 创建服务账号",
					"下载凭据 JSON 文件",
					"在此粘贴 JSON 内容",
				],
			},
			{
				flag: "--base-url",
				label: "公网基础 URL",
				placeholder: "https://example.com",
				required: true,
			},
		],
	},
	{
		id: "linear",
		name: "Linear",
		type: "webhook",
		hint: "响应 Linear 议题与评论。",
		fields: [
			{
				flag: "--api-key",
				label: "API 密钥",
				required: true,
				help: ["前往 Linear 设置 > API > 个人 API 密钥"],
			},
			{
				flag: "--webhook-secret",
				label: "Webhook 签名密钥",
				required: true,
				help: [
					"前往设置 > API > Webhooks，新建一个",
					"复制签名密钥",
				],
			},
			{
				flag: "--base-url",
				label: "公网基础 URL",
				placeholder: "https://example.com",
				required: true,
			},
		],
	},
];

export const PLATFORMS = CONNECTOR_PLATFORMS;
export const shouldIncludeField = shouldIncludeConnectorField;
