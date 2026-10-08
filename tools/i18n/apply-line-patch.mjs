#!/usr/bin/env node
/**
 * 行锚定精确替换器（B57 用）
 *
 * 为什么不直接用 apply-zh.mjs：
 *   1. 0.0.43 新增文案大量出现在「同一行内既有标签又有文本」的形态
 *      （<p className="...">Loading providers...</p>），apply-zh 的 BARE_RE 不认；
 *   2. §4.10 要求跨行英文段落「整段重写」，按行替换会打碎句子；
 *   3. 本脚本每条替换都绑定「文件 + 行号 + 原文」三重校验，原文对不上立即退出，
 *      避免误伤与静默改错位置。
 *
 * 约定：
 *   - `old` / `new` 均**不含首行缩进**（脚本沿用原行缩进）；
 *   - 多行替换时，第 2 行起的缩进由调用方在 `new` 里显式写全（含换行符）。
 *
 * 用法：node apply-line-patch.mjs <patch.json> [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = "D:/cline-zh/cline";
const patchPath = process.argv[2];
if (!patchPath) {
	console.error("用法: node apply-line-patch.mjs <patch.json> [--write]");
	process.exit(1);
}
const write = process.argv.includes("--write");
const patchDoc = JSON.parse(readFileSync(resolve(patchPath), "utf8"));
const patch = patchDoc.batch ?? patchDoc;

let applied = 0;
const problems = [];

for (const group of patch) {
	const abs = resolve(REPO, group.file);
	const lines = readFileSync(abs, "utf8").split("\n");
	// 同一文件内的多条编辑按行号倒序应用，避免行号漂移
	for (const edit of [...group.edits].sort((a, b) => b.line - a.line)) {
		const oldLines = edit.old.split("\n");
		const newLines = edit.new.split("\n");
		const idx = edit.line - 1;
		const span = oldLines.length;
		const actual = lines[idx];
		if (actual === undefined) {
			problems.push(`${group.file}:${edit.line} 行不存在`);
			continue;
		}
		const indent = actual.slice(0, actual.length - actual.trimStart().length);
		// old 的首行不含缩进，其余行须与文件内原文逐字相同（含缩进）
		const expected = oldLines.map((l, i) => (i === 0 ? indent + l : l));
		const actualSpan = lines.slice(idx, idx + span);
		if (expected.join("\n") !== actualSpan.join("\n")) {
			problems.push(
				`${group.file}:${edit.line} 原文不匹配\n    期望: ${JSON.stringify(expected.join("\\n"))}\n    实际: ${JSON.stringify(actualSpan.join("\\n"))}`,
			);
			continue;
		}
		const rendered = newLines
			.map((l, i) => (i === 0 ? indent + l : l))
			.join("\n");
		lines.splice(idx, span, ...rendered.split("\n"));
		applied++;
		if (rendered === actualSpan.join("\n")) {
			problems.push(`${group.file}:${edit.line} 替换后内容未变化`);
		}
	}
	if (write && problems.length === 0) {
		writeFileSync(abs, lines.join("\n"), "utf8");
	}
}

if (problems.length) {
	console.error("🔴 校验失败，未写入：\n" + problems.join("\n"));
	process.exit(1);
}
console.log(`${write ? "✅ 已写入" : "🔍 校验通过"}：${applied} 处`);
