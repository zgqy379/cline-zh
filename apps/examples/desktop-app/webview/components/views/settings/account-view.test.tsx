// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountView, normalizeAccountViewError } from "./account-view";

const { invoke, openExternalUrl } = vi.hoisted(() => ({
	invoke: vi.fn(),
	openExternalUrl: vi.fn(),
}));
vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke, subscribe: vi.fn(() => () => {}) },
	openExternalUrl,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	invoke.mockReset();
	openExternalUrl.mockReset();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
});

describe("AccountView usage table", () => {
	it("opens the full usage dashboard from the empty table footer", async () => {
		invoke.mockImplementation(
			async (_command: string, args?: Record<string, unknown>) => {
				switch (args?.operation) {
					case "fetchMe":
						return {
							id: "user-1",
							email: "beatrix@cline.bot",
							displayName: "Beatrix",
							createdAt: "2024-01-01T00:00:00Z",
							updatedAt: "2024-01-01T00:00:00Z",
							organizations: [],
						};
					case "fetchBalance":
						return { balance: 5_000_000 };
					case "fetchUserOrganizations":
						return [];
					case "fetchUsageTransactions":
						return [];
					default:
						return {};
				}
			},
		);

		await act(async () => {
			root.render(<AccountView />);
		});
		await vi.waitFor(() => {
			expect(container.textContent).toContain("Beatrix");
		});

		const usageTab = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "用量",
		);
		expect(usageTab).toBeDefined();
		await act(async () => usageTab?.click());

		await vi.waitFor(() => {
			expect(container.textContent).toContain("查看更多");
			expect(container.textContent).toContain("暂无用量记录。");
		});
		const seeMoreButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("查看更多"),
		);
		await act(async () => seeMoreButton?.click());

		expect(openExternalUrl).toHaveBeenCalledWith(
			"https://app.cline.bot/dashboard/usage",
		);
	});
});

describe("AccountView signed-out state", () => {
	it("recovers from a failed cancel and restores Sign in without reloading the overview", async () => {
		let rejectLogin!: (error: Error) => void;
		let failCancel = true;
		invoke.mockImplementation(async (command) => {
			if (command === "run_provider_oauth_login") {
				return await new Promise((_, reject) => {
					rejectLogin = reject;
				});
			}
			if (command === "cancel_provider_oauth_login") {
				if (failCancel) {
					failCancel = false;
					throw new Error("Connection unavailable");
				}
				rejectLogin(new Error("Sign-in cancelled"));
				return { cancelled: true };
			}
			return { signedIn: false, code: "ACCOUNT_NOT_AUTHENTICATED" };
		});
		await act(async () => root.render(<AccountView />));
		const button = (label: string) => {
			const found = Array.from(container.querySelectorAll("button")).find(
				(button) => button.textContent === label,
			);
			if (!found) throw new Error(`Missing button: ${label}`);
			return found;
		};
		await act(async () => button("登录").click());
		expect(button("登录中").disabled).toBe(true);
		expect(container.textContent).not.toContain("Create account");
		await act(async () => button("取消").click());
		expect(container.textContent).toContain("Could not cancel sign-in");
		expect(button("登录中").disabled).toBe(true);
		expect(button("取消").disabled).toBe(false);
		await act(async () => button("取消").click());
		expect(container.textContent).not.toContain("Could not cancel sign-in");
		expect(button("登录").disabled).toBe(false);
		expect(button("创建账户").disabled).toBe(false);
		expect(container.textContent).not.toContain("Sign-in cancelled");
		expect(
			invoke.mock.calls.filter(([command]) => command === "cline_account"),
		).toHaveLength(1);
	});

	it("renders the sign-in prompt from the typed result and stops fetching account data", async () => {
		invoke.mockResolvedValue({
			signedIn: false,
			code: "ACCOUNT_NOT_AUTHENTICATED",
		});

		await act(async () => {
			root.render(<AccountView />);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toContain("登录 Cline");
		});
		expect(container.textContent).not.toContain(
			"No Cline account auth token found",
		);
		// The auth state gates the rest of the overview: signed out means the
		// balance/organization commands are never fired.
		const accountCalls = invoke.mock.calls.filter(
			([command]) => command === "cline_account",
		);
		expect(accountCalls).toEqual([
			["cline_account", { action: "clineAccount", operation: "fetchMe" }],
		]);
	});

	it("signs out when the organization balance fetch reports the typed signed-out result", async () => {
		// The token can expire between the initial account fetches and the
		// organization-balance fetch; the typed result must sign the view out
		// rather than being coerced into a signed-in view with no balance.
		invoke.mockImplementation(
			async (_command: string, args?: Record<string, unknown>) => {
				switch (args?.operation) {
					case "fetchMe":
						return {
							id: "user-1",
							email: "beatrix@cline.bot",
							displayName: "Beatrix",
							createdAt: "2024-01-01T00:00:00Z",
							updatedAt: "2024-01-01T00:00:00Z",
							organizations: [],
						};
					case "fetchBalance":
						return { balance: 5_000_000 };
					case "fetchUserOrganizations":
						return [
							{
								organizationId: "org-1",
								name: "Cline",
								active: true,
								roles: ["member"],
							},
						];
					case "fetchOrganizationBalance":
						return { signedIn: false, code: "ACCOUNT_NOT_AUTHENTICATED" };
					default:
						return {};
				}
			},
		);

		await act(async () => {
			root.render(<AccountView />);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toContain("登录 Cline");
		});
		expect(container.textContent).not.toContain("Beatrix");
	});

	it("renders account data when the session is signed in", async () => {
		invoke.mockImplementation(
			async (_command: string, args?: Record<string, unknown>) => {
				switch (args?.operation) {
					case "fetchMe":
						return {
							id: "user-1",
							email: "beatrix@cline.bot",
							displayName: "Beatrix",
							createdAt: "2024-01-01T00:00:00Z",
							updatedAt: "2024-01-01T00:00:00Z",
							organizations: [],
						};
					case "fetchBalance":
						return { balance: 5_000_000 };
					case "fetchUserOrganizations":
						return [];
					default:
						return {};
				}
			},
		);

		await act(async () => {
			root.render(<AccountView />);
		});

		await vi.waitFor(() => {
			expect(container.textContent).toContain("Beatrix");
		});
		expect(container.textContent).not.toContain("登录 Cline");
	});
});

// 回归测试：sidecar 抛出的错误文案被汉化后，webview 侧靠 includes() 识别
// 「过旧 sidecar」的分支也必须仍然命中 —— 否则用户只会看到原始英文错误。
describe("normalizeAccountViewError", () => {
	const STALE_HINT = "版本过旧";

	it("recognizes the localized sidecar message", () => {
		const error = new Error("不支持的桌面端命令：cline_account");
		expect(normalizeAccountViewError(error).message).toContain(STALE_HINT);
	});

	it("still recognizes the original English message", () => {
		const error = new Error("unsupported desktop command: cline_account");
		expect(normalizeAccountViewError(error).message).toContain(STALE_HINT);
	});

	it("passes unrelated errors through untouched", () => {
		const error = new Error("network unreachable");
		expect(normalizeAccountViewError(error)).toBe(error);
	});
});
