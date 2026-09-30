// @vitest-environment jsdom

import { act, type HTMLAttributes } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteEnvironmentProfile } from "@/lib/remote-environments";
import { RemoteEnvironmentsContent } from "./remote-environments-view";

const { invokeMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
}));

vi.mock("@/lib/desktop-client", () => ({
	desktopClient: { invoke: invokeMock },
}));

vi.mock("@/components/ui/scroll-area", () => ({
	ScrollArea: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
		<div {...props}>{children}</div>
	),
}));

const profile: RemoteEnvironmentProfile = {
	id: "build-box",
	name: "Build box",
	host: "builder.example.com",
	user: "ubuntu",
	port: 22,
	identityFile: "~/.ssh/id_ed25519",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	invokeMock.mockReset();
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
});

function buttonWithText(text: string): HTMLButtonElement {
	const button = [
		...container.querySelectorAll<HTMLButtonElement>("button"),
	].find((candidate) => candidate.textContent?.includes(text));
	expect(button).toBeDefined();
	return button as HTMLButtonElement;
}

function inputById(id: string): HTMLInputElement {
	const input = container.querySelector<HTMLInputElement>(`#${id}`);
	expect(input).not.toBeNull();
	return input as HTMLInputElement;
}

async function click(element: Element): Promise<void> {
	await act(async () => {
		element.dispatchEvent(
			new MouseEvent("click", { bubbles: true, cancelable: true }),
		);
		await Promise.resolve();
	});
}

async function type(input: HTMLInputElement, value: string): Promise<void> {
	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)?.set;
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

describe("RemoteEnvironmentsContent", () => {
	it("locks a saved profile destination while leaving editable metadata available", async () => {
		invokeMock.mockImplementation(async (command: string) => {
			if (command === "list_remote_environments") {
				return { profiles: [profile], activeProfileId: null };
			}
			throw new Error(`Unexpected command: ${command}`);
		});

		await act(async () => {
			root.render(<RemoteEnvironmentsContent />);
		});
		await vi.waitFor(() => {
			expect(inputById("remote-name").value).toBe("Build box");
		});

		expect(inputById("remote-host").disabled).toBe(true);
		expect(inputById("remote-user").disabled).toBe(true);
		expect(inputById("remote-port").disabled).toBe(true);
		expect(inputById("remote-name").disabled).toBe(false);
		expect(inputById("remote-identity").disabled).toBe(false);
		expect(container.textContent).toContain(
			"如需更改 SSH 主机、用户或端口，请新建主机。",
		);

		await click(buttonWithText("新建主机"));

		expect(inputById("remote-host").disabled).toBe(false);
		expect(inputById("remote-user").disabled).toBe(false);
		expect(inputById("remote-port").disabled).toBe(false);
		expect(container.textContent).not.toContain(
			"如需更改 SSH 主机、用户或端口，请新建主机。",
		);
	});

	it("only enables Save once an existing host has unsaved changes", async () => {
		invokeMock.mockImplementation(async (command: string) => {
			if (command === "list_remote_environments") {
				return { profiles: [profile], activeProfileId: null };
			}
			throw new Error(`Unexpected command: ${command}`);
		});

		await act(async () => {
			root.render(<RemoteEnvironmentsContent />);
		});
		await vi.waitFor(() => {
			expect(inputById("remote-name").value).toBe("Build box");
		});

		expect(buttonWithText("保存").disabled).toBe(true);

		await type(inputById("remote-name"), "Build box 2");
		expect(buttonWithText("保存").disabled).toBe(false);

		await type(inputById("remote-name"), "Build box");
		expect(buttonWithText("保存").disabled).toBe(true);

		await click(buttonWithText("新建主机"));
		expect(
			[...container.querySelectorAll("button")].some((button) =>
				button.textContent?.includes("保存"),
			),
		).toBe(false);
		expect(buttonWithText("添加").disabled).toBe(false);
	});

	it("keeps settings limited to saving and testing SSH hosts", async () => {
		invokeMock.mockImplementation(async (command: string) => {
			switch (command) {
				case "list_remote_environments":
					return { profiles: [profile], activeProfileId: profile.id };
				case "upsert_remote_environment":
					return { profile };
				default:
					throw new Error(`Unexpected command: ${command}`);
			}
		});

		await act(async () => {
			root.render(<RemoteEnvironmentsContent />);
		});
		await vi.waitFor(() => {
			expect(container.textContent).toContain("Build box");
			expect(buttonWithText("测试连接").disabled).toBe(false);
		});
		expect(container.querySelector("#remote-workspace")).toBeNull();
		expect(container.textContent).not.toContain("Connect & Open");
		expect(container.textContent).not.toContain("Disconnect");
		expect(container.textContent).toContain(
			"管理你的远程 SSH 主机及其配置。",
		);
		expect(container.textContent).toContain(
			"不支持密码登录。",
		);

		await type(inputById("remote-name"), "Build box 2");
		await click(buttonWithText("保存"));

		await vi.waitFor(() => {
			expect(invokeMock).toHaveBeenCalledTimes(2);
		});
		expect(invokeMock).toHaveBeenNthCalledWith(2, "upsert_remote_environment", {
			profile: { ...profile, name: "Build box 2" },
		});
		expect(container.textContent).toContain("Connected");
		expect(container.textContent).toContain("Ready");
	});

	it("keeps a failed SSH test visible on its profile", async () => {
		invokeMock.mockImplementation(async (command: string) => {
			switch (command) {
				case "list_remote_environments":
					return { profiles: [profile], activeProfileId: null };
				case "upsert_remote_environment":
					return { profile };
				case "test_remote_environment":
					throw new Error("Permission denied (publickey)");
				default:
					throw new Error(`Unexpected command: ${command}`);
			}
		});

		await act(async () => {
			root.render(<RemoteEnvironmentsContent />);
		});
		await vi.waitFor(() => {
			expect(buttonWithText("测试连接").disabled).toBe(false);
		});
		await click(buttonWithText("测试连接"));

		await vi.waitFor(() => {
			expect(container.textContent).toContain("Permission denied (publickey)");
		});
		expect(container.textContent).toContain("Failed");
		expect(invokeMock).toHaveBeenNthCalledWith(3, "test_remote_environment", {
			id: profile.id,
		});
	});
});
