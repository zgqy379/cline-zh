import { describe, expect, it } from "vitest";
import { isTranscriptionNetworkError } from "./transcription-network-error";

describe("transcription network errors", () => {
	it.each([
		"fetch failed",
		"Failed to fetch",
		"Load failed",
		"Streaming transcription network is too slow to send microphone audio",
		"connect ECONNREFUSED",
		"Streaming transcription network connection was lost",
		"流式转录网络连接已断开",
		"流式转录网络太慢，无法发送麦克风音频",
		"流式转录连接超时",
	])("recognizes %s across the sidecar boundary", (message) => {
		expect(isTranscriptionNetworkError(new Error(message))).toBe(true);
	});
	it.each([
		"Unauthorized",
		"API key budget exceeded",
		"Connection error on AI Gateway transcription stream",
		"Rate limit exceeded",
		"Model not found",
		"Permission denied",
		"Streaming transcription connection failed",
		"流式转录连接失败",
		"流式转录在收到最终转录结果前已结束 (code 1006)",
		"流式转录失败",
		"流式转录在建立阶段即结束",
		"流式转录连接尚未打开",
		"流式转录收尾超时",
	])("does not hide %s", (message) => {
		expect(isTranscriptionNetworkError(new Error(message))).toBe(false);
	});
	it("does not treat cancellation or HTTP responses as networking failures", () => {
		expect(
			isTranscriptionNetworkError(
				new DOMException("fetch failed", "AbortError"),
			),
		).toBe(false);
		expect(
			isTranscriptionNetworkError({ statusCode: 401, message: "fetch failed" }),
		).toBe(false);
	});
	it("recognizes nested network causes without looping", () => {
		expect(
			isTranscriptionNetworkError(
				new Error("Transcription failed", {
					cause: new TypeError("fetch failed"),
				}),
			),
		).toBe(true);
		const error = new Error("Other error");
		error.cause = error;
		expect(isTranscriptionNetworkError(error)).toBe(false);
	});
});
