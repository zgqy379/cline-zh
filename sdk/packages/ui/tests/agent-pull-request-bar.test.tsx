// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
	AgentPullRequestBar,
	type AgentPullRequestData,
} from "../components/agent-pull-request-bar.js";

let container: HTMLDivElement;
let root: Root;
const data: AgentPullRequestData = {
	repository: "cline/core",
	branch: "feature",
	pullRequest: {
		number: 7,
		title: "Fix",
		url: "https://github.com/cline/core/pull/7",
		state: "OPEN",
		isDraft: false,
		mergeable: "UNKNOWN",
		mergeStateStatus: "CLEAN",
		checks: [
			{ name: "build", state: "failure", url: "https://github.com/check/1" },
			{ name: "test", state: "pending" },
		],
		additions: 5,
		deletions: 2,
	},
};
beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.append(container);
	root = createRoot(container);
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
});
it("shares readiness precedence, CI summary, counts and ordinary web navigation", async () => {
	await act(async () =>
		root.render(
			<AgentPullRequestBar
				data={data}
				onRefresh={() => {}}
				renderChecks={(trigger, content) => (
					<>
						{trigger}
						{content}
					</>
				)}
			/>,
		),
	);
	expect(container.textContent).toContain("合并状态待定");
	expect(container.querySelector('[aria-label="CI 失败"]')).not.toBeNull();
	expect(
		container.querySelector('[aria-label="新增 5 行，删除 2 行"]'),
	).not.toBeNull();
	expect(container.querySelector("a")?.getAttribute("href")).toBe(
		data.pullRequest?.url,
	);
	expect(container.querySelector("a")?.getAttribute("rel")).toBe(
		"noopener noreferrer",
	);
});
it("delegates native links and refresh to its host without owning popover state", async () => {
	const onNavigate = vi.fn(),
		onRefresh = vi.fn();
	await act(async () =>
		root.render(
			<AgentPullRequestBar
				data={data}
				onNavigate={onNavigate}
				onRefresh={onRefresh}
				renderChecks={(trigger, content) => (
					<>
						{trigger}
						{content}
					</>
				)}
			/>,
		),
	);
	await act(async () => {
		container
			.querySelector<HTMLButtonElement>('[aria-label^="打开拉取请求"]')
			?.click();
		Array.from(container.querySelectorAll("button"))
			.find((b) => b.textContent?.trim() === "build")
			?.click();
		container
			.querySelector<HTMLButtonElement>(
				'[aria-label="刷新拉取请求状态"]',
			)
			?.click();
	});
	expect(onNavigate.mock.calls).toEqual([
		[data.pullRequest?.url, "open"],
		["https://github.com/check/1", "check"],
	]);
	expect(onRefresh).toHaveBeenCalledOnce();
});
it("distinguishes unavailable checks from a successfully loaded empty list", async () => {
	for (const checks of [undefined, []]) {
		await act(async () =>
			root.render(
				<AgentPullRequestBar
					data={{ ...data, pullRequest: { ...data.pullRequest!, checks } }}
					onRefresh={() => {}}
					renderChecks={(trigger, content) => (
						<>
							{trigger}
							{content}
						</>
					)}
				/>,
			),
		);
		expect(
			container.querySelector(
				`button[aria-label="${checks ? "无 CI 检查" : "CI 不可用"}"]`,
			),
		).not.toBeNull();
	}
});

it("keeps the missing-branch fallback and refresh without showing a misleading PR", async () => {
	await act(async () =>
		root.render(
			<AgentPullRequestBar
				data={{ ...data, branch: "" }}
				onRefresh={() => {}}
				renderChecks={(trigger) => trigger}
			/>,
		),
	);
	expect(container.textContent).toContain("任务分支不可用。");
	expect(
		container.querySelector('[aria-label^="打开拉取请求"]'),
	).toBeNull();
	expect(
		container.querySelector('[aria-label="刷新拉取请求状态"]'),
	).not.toBeNull();
});
