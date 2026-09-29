// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
	ConversationViewport,
	formatThoughtLabel,
	formatWorkActivityLabel,
	Message,
	MessageContent,
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
	ThinkingBlock,
	ToolActivity,
	ToolActivityContent,
	ToolActivityTrigger,
	WorkActivity,
	WorkActivityContent,
	WorkActivityTrigger,
} from "../components/agent-chat";
import { getInertAttributeValue } from "../components/agent-chat/disclosure";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	HTMLElement.prototype.scrollTo = vi.fn();
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
});

async function render(element: React.ReactNode) {
	await act(async () => root.render(element));
}

describe("@cline/ui agent chat primitives", () => {
	it("uses the inert prop form supported by each React major", () => {
		expect(getInertAttributeValue(false, "18.3.1")).toBe("");
		expect(getInertAttributeValue(false, "19.2.4")).toBe(true);
		expect(getInertAttributeValue(true, "18.3.1")).toBeUndefined();
		expect(getInertAttributeValue(true, "19.2.4")).toBeUndefined();
	});

	it("marks message roles without requiring a runtime message schema", async () => {
		await render(
			<Message from="assistant">
				<MessageContent>Hello from Cline</MessageContent>
			</Message>,
		);

		const message = container.querySelector(".cline-chat-message");
		expect(message?.getAttribute("data-role")).toBe("assistant");
		expect(message?.textContent).toContain("Hello from Cline");
	});

	it("gives the scrollable conversation log accessible defaults", async () => {
		await render(
			<Conversation>
				<ConversationViewport>
					<ConversationContent />
				</ConversationViewport>
			</Conversation>,
		);

		const viewport = container.querySelector(
			".cline-chat-conversation-viewport",
		);
		expect(viewport?.getAttribute("aria-label")).toBe("智能体对话");
		expect(viewport?.getAttribute("role")).toBe("log");
		expect(viewport?.getAttribute("tabindex")).toBe("0");
	});

	it("exposes an accessible reasoning disclosure", async () => {
		await render(
			<Reasoning>
				<ReasoningTrigger />
				<ReasoningContent>Inspect the shared contract</ReasoningContent>
			</Reasoning>,
		);

		const trigger = container.querySelector("button");
		const panelId = trigger?.getAttribute("aria-controls");
		const panel = document.getElementById(panelId ?? "");
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		expect(panel?.getAttribute("data-state")).toBe("closed");
		expect(panel?.getAttribute("aria-hidden")).toBe("true");
		expect(panel?.getAttribute("inert")).toBe("");
		expect(panel?.textContent).not.toContain("Inspect the shared contract");

		await act(async () => trigger?.click());
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(panel?.getAttribute("data-state")).toBe("open");
		expect(panel?.getAttribute("aria-hidden")).toBe("false");
		expect(panel?.hasAttribute("inert")).toBe(false);
		expect(panel?.textContent).toContain("Inspect the shared contract");

		await act(async () => trigger?.click());
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		expect(panel?.getAttribute("data-state")).toBe("closed");
		expect(panel?.getAttribute("inert")).toBe("");
		expect(panel?.textContent).toContain("Inspect the shared contract");
	});

	it("renders non-expandable tool activity as static content", async () => {
		await render(
			<ToolActivity expandable={false}>
				<ToolActivityTrigger label="Explored workspace" />
			</ToolActivity>,
		);

		const summary = container.querySelector(".cline-chat-tool-trigger");
		expect(summary?.tagName).toBe("DIV");
		expect(summary?.closest("button")).toBeNull();
	});

	it("swaps the icon for the spinner while the tool is in flight", async () => {
		await render(
			<ToolActivity expandable={false}>
				<ToolActivityTrigger
					icon={<svg data-testid="tool-icon" />}
					label="Editing file app.tsx"
					status="running"
				/>
			</ToolActivity>,
		);

		expect(container.querySelector(".cline-chat-tool-progress")).not.toBeNull();
		expect(container.querySelector("[data-testid='tool-icon']")).toBeNull();

		await render(
			<ToolActivity expandable={false}>
				<ToolActivityTrigger
					icon={<svg data-testid="tool-icon" />}
					label="Edited file app.tsx"
					status="success"
				/>
			</ToolActivity>,
		);

		expect(container.querySelector(".cline-chat-tool-progress")).toBeNull();
		expect(container.querySelector("[data-testid='tool-icon']")).not.toBeNull();
	});

	it("toggles expandable tool details", async () => {
		await render(
			<ToolActivity>
				<ToolActivityTrigger label="Edited 2 files" />
				<ToolActivityContent>theme.css</ToolActivityContent>
			</ToolActivity>,
		);

		const trigger = container.querySelector("button");
		const panelId = trigger?.getAttribute("aria-controls");
		const panel = document.getElementById(panelId ?? "");
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		expect(panel?.getAttribute("data-state")).toBe("closed");
		expect(panel?.getAttribute("inert")).toBe("");
		expect(
			container.querySelector(".cline-chat-disclosure-icon"),
		).not.toBeNull();

		await act(async () => trigger?.click());
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(panel?.getAttribute("data-state")).toBe("open");
		expect(panel?.hasAttribute("inert")).toBe(false);
		expect(panel?.textContent).toContain("theme.css");
	});

	it("hides the disclosure chevron on request while keeping the row clickable", async () => {
		await render(
			<ToolActivity>
				<ToolActivityTrigger
					label="Edited 2 files"
					showDisclosureIcon={false}
				/>
				<ToolActivityContent>theme.css</ToolActivityContent>
			</ToolActivity>,
		);

		const trigger = container.querySelector("button");
		expect(container.querySelector(".cline-chat-disclosure-icon")).toBeNull();

		await act(async () => trigger?.click());
		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		expect(
			document.getElementById(trigger?.getAttribute("aria-controls") ?? "")
				?.textContent,
		).toContain("theme.css");
	});

	it("labels the thinking row by streaming state and duration", async () => {
		expect(formatThoughtLabel(undefined)).toBe("思考中");
		expect(formatThoughtLabel(0)).toBe("思考了 0 秒");
		expect(formatThoughtLabel(120)).toBe("思考了 1 秒");
		expect(formatThoughtLabel(2_600)).toBe("思考了 3 秒");

		await render(
			<ThinkingBlock isStreaming>
				<p>Considering the options.</p>
			</ThinkingBlock>,
		);
		let trigger = container.querySelector("button") as HTMLButtonElement;
		expect(trigger.textContent).toContain("思考中");
		expect(trigger.querySelector(".cline-chat-streaming-title")).not.toBeNull();

		await render(
			<ThinkingBlock durationMilliseconds={4_000}>
				<p>Considering the options.</p>
			</ThinkingBlock>,
		);
		trigger = container.querySelector("button") as HTMLButtonElement;
		expect(trigger.textContent).toContain("思考了 4 秒");
		expect(trigger.querySelector(".cline-chat-streaming-title")).toBeNull();

		await act(async () => trigger.click());
		const panel = document.getElementById(
			trigger.getAttribute("aria-controls") ?? "",
		);
		expect(panel?.textContent).toContain("Considering the options.");
		expect(
			panel?.querySelector(
				".cline-chat-thinking-content.cline-chat-panel-rail",
			),
		).not.toBeNull();
	});

	it("falls back to a redaction notice without reasoning content", async () => {
		await render(<ThinkingBlock durationMilliseconds={1_000} redacted />);
		const trigger = container.querySelector("button") as HTMLButtonElement;
		await act(async () => trigger.click());
		expect(
			document.getElementById(trigger.getAttribute("aria-controls") ?? "")
				?.textContent,
		).toContain("[redacted]");
	});

	it("formats work summary labels", () => {
		expect(
			formatWorkActivityLabel({
				durationMilliseconds: 252_000,
				toolCallCount: 14,
			}),
		).toBe("工作了 4m 12s，共 14 次工具调用");
		expect(
			formatWorkActivityLabel({ durationMilliseconds: 800, toolCallCount: 1 }),
		).toBe("工作了 1s，共 1 次工具调用");
		expect(formatWorkActivityLabel({ durationMilliseconds: 3_720_000 })).toBe(
			"工作了 1h 2m",
		);
		expect(formatWorkActivityLabel({ toolCallCount: 3 })).toBe(
			"共 3 次工具调用",
		);
		expect(formatWorkActivityLabel({})).toBe("已完成工作");
	});

	it("toggles the collapsed work summary open and closed", async () => {
		await render(
			<WorkActivity>
				<WorkActivityTrigger durationMilliseconds={65_000} toolCallCount={2} />
				<WorkActivityContent>Ran tests, edited theme.css</WorkActivityContent>
			</WorkActivity>,
		);

		const trigger = container.querySelector(
			"button.cline-chat-work-trigger",
		) as HTMLButtonElement;
		expect(trigger.textContent).toContain(
			"工作了 1m 5s，共 2 次工具调用",
		);
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		const panel = document.getElementById(
			trigger.getAttribute("aria-controls") ?? "",
		);
		expect(panel?.getAttribute("data-state")).toBe("closed");
		// Collapsed content stays lazy until first opened.
		expect(panel?.textContent).not.toContain("Ran tests");

		await act(async () => trigger.click());
		expect(trigger.getAttribute("aria-expanded")).toBe("true");
		expect(panel?.getAttribute("data-state")).toBe("open");
		expect(panel?.textContent).toContain("Ran tests, edited theme.css");
		// Expanded rows sit at transcript level — no rail or extra indent.
		const content = panel?.querySelector(".cline-chat-work-content");
		expect(content).not.toBeNull();
		expect(content?.classList.contains("cline-chat-panel-rail")).toBe(false);

		await act(async () => trigger.click());
		expect(panel?.getAttribute("data-state")).toBe("closed");
	});

	it("offers a scroll-to-latest action after the reader moves away", async () => {
		await render(
			<Conversation>
				<ConversationViewport>
					<ConversationContent>Long conversation</ConversationContent>
				</ConversationViewport>
				<ConversationScrollButton />
			</Conversation>,
		);

		const viewport = container.querySelector(
			".cline-chat-conversation-viewport",
		) as HTMLDivElement;
		const scrollTo = vi.fn();
		Object.defineProperties(viewport, {
			clientHeight: { configurable: true, value: 100 },
			scrollHeight: { configurable: true, value: 500 },
			scrollTop: { configurable: true, value: 0, writable: true },
			scrollTo: { configurable: true, value: scrollTo },
		});

		await act(async () => viewport.dispatchEvent(new Event("scroll")));
		const button = container.querySelector(
			'button[aria-label="滚动到最新消息"]',
		) as HTMLButtonElement;
		expect(button).not.toBeNull();

		await act(async () => button.click());
		expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 500 });

		viewport.scrollTop = 300;
		await act(async () => viewport.dispatchEvent(new Event("scroll")));
		expect(
			container.querySelector('button[aria-label="滚动到最新消息"]'),
		).toBeNull();

		viewport.scrollTop = 100;
		await act(async () => viewport.dispatchEvent(new Event("scroll")));
		expect(
			container.querySelector('button[aria-label="滚动到最新消息"]'),
		).not.toBeNull();
	});

	it("resets conversation state when its React key changes", async () => {
		const transcript = (conversationKey: string) => (
			<Conversation key={conversationKey}>
				<ConversationViewport>
					<ConversationContent>
						Conversation {conversationKey}
					</ConversationContent>
				</ConversationViewport>
				<ConversationScrollButton />
			</Conversation>
		);
		await render(transcript("session-a"));

		const firstViewport = container.querySelector(
			".cline-chat-conversation-viewport",
		) as HTMLDivElement;
		Object.defineProperties(firstViewport, {
			clientHeight: { configurable: true, value: 100 },
			scrollHeight: { configurable: true, value: 500 },
			scrollTop: { configurable: true, value: 0, writable: true },
		});

		await act(async () => firstViewport.dispatchEvent(new Event("scroll")));
		expect(
			container.querySelector('button[aria-label="滚动到最新消息"]'),
		).not.toBeNull();

		await render(transcript("session-b"));

		const nextViewport = container.querySelector(
			".cline-chat-conversation-viewport",
		);
		expect(nextViewport).not.toBe(firstViewport);
		expect(
			container.querySelector('button[aria-label="滚动到最新消息"]'),
		).toBeNull();
	});
});
