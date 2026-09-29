import { describe, expect, it } from "vitest";
import { formatRunError } from "./run-error";

describe("formatRunError", () => {
	it.each([
		"API key expired",
		"The run failed because the API key expired",
		"The run failed: Unauthorized",
	])("adds guidance exactly once for %s", (detail) => {
		const formatted = formatRunError(detail);
		expect(formatted).toContain("设置 → 供应商");
		expect(formatted.match(/The run failed/g)).toHaveLength(1);
		expect(formatRunError(formatted)).toBe(formatted);
	});
	it("does not suggest changing credentials for a token limit", () => {
		expect(
			formatRunError("The run failed: maximum context tokens exceeded"),
		).not.toContain("设置");
	});
});

it.each([
	"session expired",
	"not logged in",
	"Please /login",
	"Please authenticate",
])("preserves CLI guidance for %s", (detail) => {
	const text = formatRunError(detail, "claude-code");
	expect(text).toContain("`claude` CLI");
	expect(text).not.toContain("设置");
	expect(formatRunError(text, "claude-code")).toBe(text);
});
