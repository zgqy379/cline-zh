// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ComposioIntegrationSummary } from "@/lib/composio-types";

const mocks = vi.hoisted(() => ({
	integrations: [] as ComposioIntegrationSummary[],
	configured: true,
	catalog: vi.fn(),
	connect: vi.fn(),
	disconnect: vi.fn(),
	cancel: vi.fn(),
	refresh: vi.fn(),
	invoke: vi.fn(),
	openExternalUrl: vi.fn(),
	loadError: null as string | null,
}));
vi.mock("@/lib/composio", () => ({
	fetchComposioToolkitCatalog: mocks.catalog,
}));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke: mocks.invoke, subscribe: () => () => {} },
	openExternalUrl: mocks.openExternalUrl,
}));
vi.mock("@/lib/provider-model-catalog", () => ({
	invalidateProviderCatalogCache: () => {},
}));
vi.mock("@/lib/use-composio-connections", () => ({
	useComposioConnections: () => ({
		configured: mocks.configured,
		status: { integrations: mocks.integrations },
		statusBySlug: new Map(
			mocks.integrations.map((integration) => [
				integration.toolkit,
				integration,
			]),
		),
		connect: mocks.connect,
		disconnect: mocks.disconnect,
		cancelConnect: mocks.cancel,
		refresh: mocks.refresh,
		refreshing: false,
		loadError: mocks.loadError,
	}),
}));

import { AccountProvider } from "@/contexts/account-context";
import { ComposioConnectorsView } from "./composio-connectors-view";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	vi.clearAllMocks();
	mocks.loadError = null;
	mocks.configured = true;
	mocks.catalog.mockResolvedValue({ configured: true, toolkits: [] });
	mocks.integrations = [
		{
			toolkit: "gmail",
			name: "Gmail",
			description: "Email",
			recommended: true,
			status: "connected",
			toolNames: ["GMAIL_SEND_EMAIL"],
		},
	];
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.unstubAllGlobals();
});
function button(text: string) {
	return [...document.querySelectorAll("button")].find(
		(entry) => entry.textContent?.trim() === text,
	);
}
async function render() {
	await act(async () => root.render(<ComposioConnectorsView />));
}
async function type(selector: string, value: string) {
	const input = container.querySelector(selector) as HTMLInputElement;
	await act(async () => {
		Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

describe("Customize connector catalog", () => {
	it("shows the grid, installs apps, and manages an existing connection in its dialog", async () => {
		mocks.catalog.mockResolvedValue({
			configured: true,
			toolkits: [
				{ slug: "gmail", name: "Gmail", description: "Email" },
				{ slug: "github", name: "GitHub", description: "Code" },
				{
					slug: "googlecalendar",
					name: "Google Calendar",
					description: "Events",
				},
			],
		});
		await render();
		expect(container.textContent).toContain("GitHub");
		expect(container.textContent).toContain("Google Calendar");
		expect(container.textContent).not.toContain("市场");
		await act(async () => button("安装")?.click());
		expect(mocks.connect).toHaveBeenCalledWith("github");
		await act(async () => button("查看")?.click());
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
			"GMAIL_SEND_EMAIL",
		);
		await act(async () => button("卸载")?.click());
		expect(mocks.disconnect).toHaveBeenCalledWith("gmail");
	});

	it("searches beyond the initial 24 apps", async () => {
		mocks.catalog.mockResolvedValue({
			configured: true,
			toolkits: Array.from({ length: 25 }, (_, i) => ({
				slug: `app_${i}`,
				name: `App ${i}`,
				description: "An app",
			})),
		});
		await render();
		expect(container.textContent).toContain("搜索还可找到 1 个");
		expect(container.textContent).not.toContain("App 24");
		await type('input[aria-label="搜索连接器"]', "App 24");
		expect(container.textContent).toContain("App 24");
		expect(container.textContent).not.toContain("App 23");
	});

	it("shows catalog errors and retries in Customize", async () => {
		mocks.catalog
			.mockRejectedValueOnce(new Error("服务不可用"))
			.mockResolvedValueOnce({
				configured: true,
				toolkits: [{ slug: "gmail", name: "Gmail" }],
			});
		await render();
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"服务不可用",
		);
		await act(async () => button("重试")?.click());
		expect(container.textContent).toContain("Gmail");
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});
});

describe("installed connectors", () => {
	it("shows all 47 installed tools without inventing an unknown catalog total", async () => {
		const toolNames = Array.from(
			{ length: 47 },
			(_, i) => `Calendar tool ${i}`,
		);
		mocks.integrations = [
			{
				toolkit: "googlecalendar",
				name: "Google Calendar",
				description: "Events",
				recommended: true,
				status: "connected",
				toolNames,
			},
		];
		await act(async () =>
			root.render(<ComposioConnectorsView variant="installed" />),
		);
		// The card itself opens the detail dialog.
		await act(async () =>
			(
				container.querySelector(
					'[aria-label="打开 Google Calendar 详情"]',
				) as HTMLElement
			).click(),
		);
		const dialog = document.querySelector('[role="dialog"]');
		expect(dialog?.textContent).toContain("47 个在新会话中可用");
		expect(dialog?.textContent).not.toContain("47/47");
		expect(
			[...(dialog?.querySelectorAll("li") ?? [])].map(
				(item) => item.textContent,
			),
		).toEqual(toolNames);
	});

	it("shows the installed tool count, not the stale catalog total", async () => {
		mocks.catalog.mockResolvedValue({
			configured: true,
			toolkits: [{ slug: "gmail", name: "Gmail", toolsCount: 47 }],
		});
		await render();
		await act(async () => button("查看")?.click());
		expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
			"1 个在新会话中可用",
		);
		expect(
			document.querySelector('[role="dialog"]')?.textContent,
		).not.toContain("/47");
		expect(
			document.querySelector('[role="dialog"]')?.textContent,
		).not.toContain("标识");
	});

	it("shows zero installed tools instead of the catalog total when none were retrieved", async () => {
		mocks.integrations = [
			{
				toolkit: "gmail",
				name: "Gmail",
				description: "Email",
				recommended: true,
				status: "connected",
				toolNames: [],
			},
		];
		mocks.catalog.mockResolvedValue({
			configured: true,
			toolkits: [{ slug: "gmail", name: "Gmail", toolsCount: 47 }],
		});
		await render();
		await act(async () => button("查看")?.click());
		const text = document.querySelector('[role="dialog"]')?.textContent;
		expect(text).toContain("0 个在新会话中可用");
		expect(text).not.toContain("47");
	});

	it("shows the empty state when no connectors are installed", async () => {
		mocks.integrations = [
			{
				toolkit: "gmail",
				name: "Gmail",
				description: "Email",
				recommended: true,
				status: "not_connected",
			},
		];
		await act(async () =>
			root.render(<ComposioConnectorsView variant="installed" />),
		);
		const installed = container.querySelector("section");
		expect(installed?.textContent).toContain("已安装0");
		expect(installed?.textContent).toContain("尚未安装连接器");
		expect(installed?.textContent).not.toContain("Gmail");
		// Every recipe is suggested; chips install their connector.
		expect(container.textContent).toContain("推荐");
		expect(container.textContent).toContain("Organize your day");
		expect(container.textContent).toContain("Debug production incidents");
		await act(async () =>
			(
				container.querySelector('[aria-label="Install Sentry"]') as HTMLElement
			).click(),
		);
		expect(mocks.connect).toHaveBeenCalledWith("sentry");
	});

	it("hides a recipe once all of its connectors are connected", async () => {
		mocks.integrations = [
			["gmail", "Gmail"],
			["slack", "Slack"],
			["googlecalendar", "Google Calendar"],
		].map(([toolkit, name]) => ({
			toolkit,
			name,
			description: "",
			recommended: toolkit !== "slack",
			status: "connected" as const,
		}));
		await act(async () =>
			root.render(<ComposioConnectorsView variant="installed" />),
		);
		expect(container.textContent).not.toContain("Organize your day");
		expect(container.textContent).toContain("Debug production incidents");
		// Slack is connected, so it is a non-interactive chip there.
		expect(container.querySelector('[aria-label="安装 Slack"]')).toBeNull();
		expect(
			container.querySelector('[aria-label="Install Sentry"]'),
		).not.toBeNull();
	});

	it("refreshes from the toolbar and keeps the list when a refresh fails", async () => {
		mocks.loadError = "Network down";
		await act(async () =>
			root.render(<ComposioConnectorsView variant="installed" />),
		);
		expect(container.textContent).toContain("Gmail");
		expect(container.querySelector('[role="alert"]')?.textContent).toContain(
			"Network down",
		);
		await act(async () =>
			(
				container.querySelector(
					'[aria-label="刷新连接器"]',
				) as HTMLElement
			).click(),
		);
		expect(mocks.refresh).toHaveBeenCalledOnce();
	});

	it("lists installed connectors without showing recommendations", async () => {
		mocks.integrations = [
			{
				toolkit: "gmail",
				name: "Gmail",
				description: "Email",
				recommended: true,
				status: "connected",
			},
			{
				toolkit: "github",
				name: "GitHub",
				description: "Code",
				recommended: true,
				status: "not_connected",
			},
		];
		await act(async () =>
			root.render(<ComposioConnectorsView variant="installed" />),
		);
		const installed = container.querySelector("section");
		expect(installed?.textContent).toContain("Gmail");
		expect(installed?.textContent).not.toContain("GitHub");
		// 上游此断言守卫「行内 Recommended 徽标」不回归；保留英文词面，
		// 以免与「推荐」分区标题（Suggested，本场景合法渲染）撞词。
		expect(container.textContent).not.toContain("Recommended");
		await act(async () => button("卸载")?.click());
		expect(mocks.disconnect).toHaveBeenCalledWith("gmail");
	});

	it("browses the catalog below the suggestions, skipping installed connectors", async () => {
		mocks.catalog.mockResolvedValue({
			configured: true,
			toolkits: [
				{ slug: "gmail", name: "Gmail", description: "Email" },
				{ slug: "github", name: "GitHub", description: "Code" },
				{ slug: "notion", name: "Notion", description: "Docs" },
			],
		});
		await act(async () =>
			root.render(
				<ComposioConnectorsView appendOnScroll variant="installed" />,
			),
		);
		const [installed, , browse] = container.querySelectorAll("section");
		expect(installed?.textContent).toContain("Gmail");
		expect(browse?.textContent).toContain("浏览2");
		expect(browse?.textContent).toContain("GitHub");
		expect(browse?.textContent).toContain("Notion");
		expect(browse?.textContent).not.toContain("Gmail");
		expect(
			browse?.querySelector('img[src="https://logos.composio.dev/api/notion"]'),
		).not.toBeNull();
		await act(async () => button("安装")?.click());
		expect(mocks.connect).toHaveBeenCalledWith("github");
		// Each list has its own search: Browse's narrows only the catalog.
		await type('input[aria-label="搜索全部连接器"]', "notion");
		expect(browse?.textContent).toContain("Notion");
		expect(browse?.textContent).not.toContain("GitHub");
		expect(installed?.textContent).toContain("Gmail");
		await type('input[aria-label="搜索已安装的连接器"]', "zzz");
		expect(installed?.textContent).toContain(
			'没有匹配"zzz"的已安装连接器',
		);
		expect(browse?.textContent).toContain("Notion");
	});

	it("hides the installed search when nothing is installed", async () => {
		mocks.integrations = [];
		await act(async () =>
			root.render(<ComposioConnectorsView variant="installed" />),
		);
		expect(
			container.querySelector(
				'input[aria-label="搜索已安装的连接器"]',
			),
		).toBeNull();
		expect(
			container.querySelector('input[aria-label="搜索全部连接器"]'),
		).not.toBeNull();
	});

	it("waits for the account lookup before offering sign-in", async () => {
		mocks.configured = false;
		let resolveMe: (value: unknown) => void = () => {};
		mocks.invoke.mockImplementation(
			(command: string) =>
				new Promise((resolve) => {
					if (command === "cline_account") resolveMe = resolve;
					else resolve({});
				}),
		);
		await act(async () =>
			root.render(
				<AccountProvider>
					<ComposioConnectorsView variant="installed" />
				</AccountProvider>,
			),
		);
		expect(
			container.querySelector('[aria-label="正在加载账号"]'),
		).not.toBeNull();
		expect(button("登录")).toBeUndefined();
		await act(async () =>
			resolveMe({ email: "dev@cline.bot", displayName: "Dev" }),
		);
		expect(container.textContent).toContain(
			"你的账号尚未开通连接器功能",
		);
	});

	it("offers Cline sign-in when connectors are unavailable and the user is signed out", async () => {
		mocks.configured = false;
		mocks.invoke.mockResolvedValue({
			signedIn: false,
			code: "ACCOUNT_NOT_AUTHENTICATED",
		});
		await act(async () =>
			root.render(
				<AccountProvider>
					<ComposioConnectorsView variant="installed" />
				</AccountProvider>,
			),
		);
		expect(container.textContent).toContain(
			"登录 Cline 以使用连接器",
		);
		expect(container.textContent).not.toContain("浏览");
		expect(
			container.querySelector(
				'img[src="https://logos.composio.dev/api/slack"]',
			),
		).not.toBeNull();
		await act(async () => button("登录")?.click());
		expect(mocks.invoke).toHaveBeenCalledWith(
			"run_provider_oauth_login",
			{ provider: "cline" },
			expect.anything(),
		);
		expect(mocks.refresh).toHaveBeenCalled();
		await act(async () => button("创建账号")?.click());
		expect(mocks.openExternalUrl).toHaveBeenCalledWith("https://app.cline.bot");
	});

	it("explains the beta rollout when signed in without connector access", async () => {
		mocks.configured = false;
		mocks.invoke.mockResolvedValue({
			email: "dev@cline.bot",
			displayName: "Dev",
		});
		await act(async () =>
			root.render(
				<AccountProvider>
					<ComposioConnectorsView variant="installed" />
				</AccountProvider>,
			),
		);
		expect(container.textContent).toContain(
			"你的账号尚未开通连接器功能",
		);
		expect(button("登录")).toBeUndefined();
		await act(async () => button("再试一次")?.click());
		expect(mocks.refresh).toHaveBeenCalled();
	});

	it("shows catalog errors and retries in the Browse section", async () => {
		mocks.catalog
			.mockRejectedValueOnce(new Error("服务不可用"))
			.mockResolvedValueOnce({
				configured: true,
				toolkits: [{ slug: "notion", name: "Notion" }],
			});
		await act(async () =>
			root.render(<ComposioConnectorsView variant="installed" />),
		);
		expect(container.textContent).toContain("服务不可用");
		await act(async () => button("重试")?.click());
		expect(container.textContent).toContain("Notion");
		expect(container.textContent).not.toContain("服务不可用");
	});
});
