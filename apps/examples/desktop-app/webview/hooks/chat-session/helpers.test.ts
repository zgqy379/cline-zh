import { describe, expect, it } from "vitest";
import type { ChatSessionConfig } from "@/lib/chat-schema";
import {
	extractAssistantTurnDataFromRpcMessages,
	inferHydratedChatStatus,
	resolveCredentialError,
	resolveCredentialFailureAction,
	resolveCredentialFailureHint,
} from "./helpers";

const CLOUD_CONFIG: ChatSessionConfig = {
	executionTarget: "cloud",
	provider: "cline",
	model: "anthropic/claude-sonnet-5",
	apiKey: "",
	workspaceRoot: "",
	cwd: "",
	repoUrl: "https://github.com/cline/cline",
} as ChatSessionConfig;

describe("resolveCredentialError (cloud)", () => {
	it("接受新会话的有效 HTTPS GitHub URL", () => {
		expect(resolveCredentialError(CLOUD_CONFIG)).toBeNull();
	});

	it("拒绝无效的 GitHub 仓库 URL", () => {
		for (const repoUrl of [
			"https://exa",
			"git@github.com:cline/cline.git",
			"https://gitlab.com/cline/cline",
			"http://github.com/cline/cline",
		]) {
			expect(resolveCredentialError({ ...CLOUD_CONFIG, repoUrl })).toMatch(
				/有效的 HTTPS GitHub 仓库地址/,
			);
		}
	});

	it("does not require a repo URL when sending into an existing session", () => {
		expect(
			resolveCredentialError(
				{ ...CLOUD_CONFIG, repoUrl: "" },
				{ hasActiveSession: true },
			),
		).toBeNull();
	});

	it("still requires the Cline 供应商 for existing sessions", () => {
		expect(
			resolveCredentialError(
				{ ...CLOUD_CONFIG, provider: "anthropic" },
				{ hasActiveSession: true },
			),
		).toMatch(/Cline 供应商/);
	});
});

function makeConfig(overrides: Partial<ChatSessionConfig>): ChatSessionConfig {
	return {
		workspaceRoot: "/tmp/project",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		mode: "act",
		apiKey: "",
		enableTools: true,
		providerAuth: { providerId: "anthropic", capabilities: [] },
		...overrides,
	};
}

describe("resolveCredentialError", () => {
	it("开始会话前必须先选择供应商", () => {
		expect(resolveCredentialError(makeConfig({ provider: "  " }))).toMatch(
			/开始会话前必须先选择供应商/,
		);
	});

	it("当事实属于其他供应商时将认证委托给宿主", () => {
		expect(
			resolveCredentialError(
				makeConfig({
					provider: "anthropic",
					providerAuth: {
						providerId: "custom-cli",
						capabilities: ["local-auth"],
					},
				}),
			),
		).toBeNull();
	});

	it.each([
		"claude-code",
		"custom-oauth",
		"custom-local",
		"anthropic",
	])("当 %s 没有目录事实时将认证委托给宿主", (provider) => {
		expect(
			resolveCredentialError(makeConfig({ provider, providerAuth: undefined })),
		).toBeNull();
	});

	it("阻止没有密钥的 API 密钥供应商", () => {
		expect(
			resolveCredentialError(makeConfig({ provider: "anthropic" })),
		).toMatch(/缺少 API 密钥/);
	});

	it("allows a provider whose metadata declares the API key optional", () => {
		// Local OpenAI-compatible endpoints (LM Studio, vLLM, ...) and Ollama
		// have no key; the catalog carries the declaration from `@cline/llms`.
		expect(
			resolveCredentialError(
				makeConfig({
					provider: "openai-compatible",
					providerAuth: {
						providerId: "openai-compatible",
						capabilities: ["tools"],
						apiKeyOptional: true,
					},
				}),
			),
		).toBeNull();
	});

	it("允许有密钥的 API 密钥供应商", () => {
		expect(
			resolveCredentialError(
				makeConfig({ provider: "anthropic", apiKey: "sk-123" }),
			),
		).toBeNull();
	});

	it.each([
		"cline",
		"cline-pass",
		"oca",
		"openai-codex",
	])("allows OAuth-managed provider %s without a visible API key", (provider) => {
		// OAuth credentials live in the backend provider settings store
		// (ClinePass shares the Cline account login), never in the webview
		// config, so the pre-flight gate must not demand an API key.
		expect(resolveCredentialError(makeConfig({ provider }))).toBeNull();
	});

	it.each([
		"claude-code",
		"openai-codex-cli",
	])("允许没有 API 密钥的本地认证供应商 %s", (provider) => {
		// Local CLI providers authenticate from the CLI's own credential
		// store; the catalog marks them `local-auth` and the key is inert.
		expect(
			resolveCredentialError(
				makeConfig({
					provider,
					providerAuth: { providerId: provider, capabilities: ["local-auth"] },
				}),
			),
		).toBeNull();
	});

	it("allows a catalog-declared OAuth provider outside the fallback id set", () => {
		expect(
			resolveCredentialError(
				makeConfig({
					provider: "custom-oauth",
					providerAuth: { providerId: "custom-oauth", capabilities: ["oauth"] },
				}),
			),
		).toBeNull();
	});

	it("不区分大小写地处理供应商 ID", () => {
		expect(
			resolveCredentialError(makeConfig({ provider: "Cline-Pass" })),
		).toBeNull();
	});
});

describe("resolveCredentialFailureHint", () => {
	it("将本地认证供应商指向其 CLI", () => {
		expect(
			resolveCredentialFailureHint("claude-code", {
				providerId: "claude-code",
				localCli: { command: "claude" },
			}),
		).toBe(
			"请在终端中用 `claude` CLI 重新登录，然后重试。",
		);
		expect(
			resolveCredentialFailureHint("openai-codex-cli", {
				providerId: "openai-codex-cli",
				localCli: { command: "codex" },
			}),
		).toMatch(/`codex` CLI/);
		expect(
			resolveCredentialFailureHint("opencode", {
				providerId: "opencode",
				localCli: { command: "opencode" },
			}),
		).toMatch(/`opencode` CLI/);
	});

	it("将 Cline 指向「设置 → 账户」重新登录", () => {
		expect(resolveCredentialFailureHint("cline")).toBe(
			"请在「设置 → 账户」中重新登录 Cline，然后重试。",
		);
	});

	it("将已知的非 CLI 供应商指向「设置 → 供应商」", () => {
		for (const providerId of ["anthropic", "openai-codex"]) {
			expect(resolveCredentialFailureHint(providerId, { providerId })).toMatch(
				/设置 → 供应商/,
			);
		}
	});

	it.each([
		undefined,
		{ providerId: "unrelated", localCli: { command: "other" } },
	])("当目录事实缺失或过期时不编造凭据修复方案", (auth) => {
		expect(resolveCredentialFailureHint("claude-code", auth)).toBe(
			"请使用你的供应商的认证方式重新登录，然后重试。",
		);
		expect(resolveCredentialFailureAction("claude-code", auth)).toBeNull();
	});
});

describe("resolveCredentialFailureAction", () => {
	it("不使用其他供应商的 CLI 元数据", () => {
		expect(
			resolveCredentialFailureAction("anthropic", {
				providerId: "custom-cli",
				localCli: { command: "custom" },
			}),
		).toBeNull();
	});
	it("处理来自宿主元数据的自定义 CLI 供应商", () => {
		expect(
			resolveCredentialFailureAction("custom-cli", {
				providerId: "custom-cli",
				localCli: { command: "custom" },
			}),
		).toBeNull();
	});
	it("offers no in-app action for local-auth providers", () => {
		expect(
			resolveCredentialFailureAction("claude-code", {
				providerId: "claude-code",
				localCli: { command: "claude" },
			}),
		).toBeNull();
	});

	it("将 Cline 发送到账户页面，其他供应商发送到模型页面", () => {
		expect(resolveCredentialFailureAction("cline")).toEqual({
			label: "登录 Cline",
			target: "account",
		});
		expect(
			resolveCredentialFailureAction("anthropic", { providerId: "anthropic" }),
		).toEqual({
			label: "打开 API 供应商",
			target: "models",
		});
	});
});

describe("inferHydratedChatStatus", () => {
	it("treats an assistant-answered running record as completed", () => {
		// The stale-record heuristic: a "running" record whose transcript
		// ends on an assistant answer is read as a session that died without
		// a status flip. (The stale-stream poll deliberately bypasses this
		// via mapSessionRecordStatus — see use-chat-session.)
		expect(
			inferHydratedChatStatus("running", [
				{
					id: "u",
					sessionId: "s",
					role: "user",
					content: "prompt",
					createdAt: 1,
				},
				{
					id: "a",
					sessionId: "s",
					role: "assistant",
					content: "answer",
					createdAt: 2,
				},
			]),
		).toBe("completed");
	});
});

describe("extractAssistantTurnDataFromRpcMessages", () => {
	it("does not render a display-only error as an assistant response", () => {
		expect(
			extractAssistantTurnDataFromRpcMessages([
				{ role: "user", content: "hi" },
				{
					role: "assistant",
					content: "API key expired.",
					metadata: { displayOnly: true, displayRole: "error" },
				},
			]),
		).toEqual({
			text: "",
			reasoning: "",
			reasoningRedacted: false,
			images: [],
			media: [],
		});
	});
});
