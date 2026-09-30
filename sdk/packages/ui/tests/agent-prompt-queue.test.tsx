// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentPromptQueue } from "../components/index.js";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
});

describe("AgentPromptQueue", () => {
	it("expands queued prompts and submits host actions", async () => {
		const onRemove = vi.fn();
		const onSteer = vi.fn();
		await act(async () =>
			root.render(
				<AgentPromptQueue
					items={[
						{ id: "one", prompt: "First prompt", steer: false },
						{
							attachmentCount: 2,
							id: "two",
							prompt: "Second prompt",
							steer: true,
						},
					]}
					onEdit={vi.fn()}
					onRemove={onRemove}
					onSteer={onSteer}
				/>,
			),
		);

		const toggle = container.querySelector<HTMLButtonElement>(
			"button[aria-expanded]",
		);
		expect(toggle?.textContent).toContain("2 条提示词已排队");
		expect(toggle?.getAttribute("aria-expanded")).toBe("false");
		await act(async () => toggle?.click());
		expect(toggle?.getAttribute("aria-expanded")).toBe("true");
		expect(container.textContent).toContain("2 个附件");
		expect(container.textContent).toContain("下一轮");

		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[aria-label="引导排队的提示"]')
				?.click();
			await Promise.resolve();
		});
		expect(onSteer).toHaveBeenCalledWith("one");

		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[aria-label="移除排队的提示"]')
				?.click();
			await Promise.resolve();
		});
		expect(onRemove).toHaveBeenCalledWith("one");
	});

	it("edits a prompt without owning queue data", async () => {
		const onEdit = vi.fn();
		await act(async () =>
			root.render(
				<AgentPromptQueue
					items={[{ id: "one", prompt: "Original", steer: false }]}
					onEdit={onEdit}
					onRemove={vi.fn()}
					onSteer={vi.fn()}
				/>,
			),
		);
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>("button[aria-expanded]")
				?.click(),
		);
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>('[aria-label="编辑排队的提示"]')
				?.click(),
		);

		const editor = container.querySelector<HTMLTextAreaElement>(
			'[aria-label="编辑排队的提示"]',
		);
		expect(editor?.value).toBe("Original");
		await act(async () => {
			if (!editor) return;
			const valueSetter = Object.getOwnPropertyDescriptor(
				HTMLTextAreaElement.prototype,
				"value",
			)?.set;
			valueSetter?.call(editor, " Updated ");
			editor.dispatchEvent(new Event("input", { bubbles: true }));
			editor.dispatchEvent(
				new KeyboardEvent("keydown", {
					bubbles: true,
					isComposing: true,
					key: "Enter",
				}),
			);
		});
		expect(onEdit).not.toHaveBeenCalled();
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[aria-label="保存排队的提示"]')
				?.click();
			await Promise.resolve();
		});

		expect(onEdit).toHaveBeenCalledWith("one", "Updated");
		expect(container.textContent).toContain("Original");
	});

	it("keeps the edit open when the host rejects it", async () => {
		const onEdit = vi.fn(async () => {
			throw new Error("Could not edit prompt");
		});
		await act(async () =>
			root.render(
				<AgentPromptQueue
					items={[{ id: "one", prompt: "Original", steer: false }]}
					onEdit={onEdit}
					onRemove={vi.fn()}
					onSteer={vi.fn()}
				/>,
			),
		);
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>("button[aria-expanded]")
				?.click(),
		);
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>('[aria-label="编辑排队的提示"]')
				?.click(),
		);

		const editor = container.querySelector<HTMLTextAreaElement>(
			'[aria-label="编辑排队的提示"]',
		);
		await act(async () => {
			if (!editor) return;
			const valueSetter = Object.getOwnPropertyDescriptor(
				HTMLTextAreaElement.prototype,
				"value",
			)?.set;
			valueSetter?.call(editor, "Keep this draft");
			editor.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[aria-label="保存排队的提示"]')
				?.click();
			await Promise.resolve();
		});

		expect(onEdit).toHaveBeenCalledWith("one", "Keep this draft");
		expect(
			container.querySelector<HTMLTextAreaElement>(
				'[aria-label="编辑排队的提示"]',
			)?.value,
		).toBe("Keep this draft");
		expect(
			container.querySelector<HTMLButtonElement>(
				'[aria-label="保存排队的提示"]',
			)?.disabled,
		).toBe(false);
		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			"Could not edit prompt",
		);
	});

	it("surfaces remove failures and clears them on retry", async () => {
		const onRemove = vi
			.fn()
			.mockRejectedValueOnce(new Error(""))
			.mockResolvedValueOnce(undefined);
		await act(async () =>
			root.render(
				<AgentPromptQueue
					items={[{ id: "one", prompt: "Original", steer: false }]}
					onEdit={vi.fn()}
					onRemove={onRemove}
					onSteer={vi.fn()}
				/>,
			),
		);
		await act(async () =>
			container
				.querySelector<HTMLButtonElement>("button[aria-expanded]")
				?.click(),
		);

		const removeButton = () =>
			container.querySelector<HTMLButtonElement>(
				'[aria-label="移除排队的提示"]',
			);
		await act(async () => {
			removeButton()?.click();
			await Promise.resolve();
		});
		expect(container.querySelector('[role="alert"]')?.textContent).toBe(
			"无法移除已排队的提示词。",
		);

		await act(async () => {
			removeButton()?.click();
			await Promise.resolve();
		});
		expect(onRemove).toHaveBeenCalledTimes(2);
		expect(container.querySelector('[role="alert"]')).toBeNull();
	});

	it("renders nothing without queued prompts", async () => {
		await act(async () =>
			root.render(
				<AgentPromptQueue
					items={[]}
					onEdit={vi.fn()}
					onRemove={vi.fn()}
					onSteer={vi.fn()}
				/>,
			),
		);
		expect(container.childElementCount).toBe(0);
	});
});
