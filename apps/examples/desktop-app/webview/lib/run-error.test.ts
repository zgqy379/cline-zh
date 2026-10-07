import { describe, expect, it } from "vitest";
import { formatRunError } from "./run-error";

describe("formatRunError", () => {
	it.each([
		"API key expired",
		"The run failed because the API key expired",
		"The run failed: Unauthorized",
	])("adds guidance exactly once for %s", (detail) => {
		const auth = { providerId: "openrouter" };
		const formatted = formatRunError(detail, "openrouter", auth);
		expect(formatted).toContain("设置 → 供应商");
		expect(formatted.match(/The run failed|运行失败：/g)).toHaveLength(1);
		expect(formatRunError(formatted, "openrouter", auth)).toBe(formatted);
	});
	it("does not suggest changing credentials for a token limit", () => {
		expect(
			formatRunError("The run failed: maximum context tokens exceeded"),
		).not.toContain("Settings");
	});
});

it.each([
	"session expired",
	"not logged in",
	"Please /login",
	"Please authenticate",
])("preserves CLI guidance for %s", (detail) => {
	const auth = { providerId: "claude-code", localCli: { command: "claude" } };
	const text = formatRunError(detail, "claude-code", auth);
	expect(text).toContain("`claude` CLI");
	expect(text).not.toContain("Settings");
	expect(formatRunError(text, "claude-code", auth)).toBe(text);
});

it("uses neutral guidance when restored errors have no auth metadata", () => {
	const text = formatRunError("session expired", "claude-code");
	expect(text).toContain("你的供应商的认证方式");
	expect(text).not.toContain("设置 → 供应商");
	expect(formatRunError(text, "claude-code")).toBe(text);
});
