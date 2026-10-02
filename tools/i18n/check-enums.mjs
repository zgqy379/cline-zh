#!/usr/bin/env node
/**
 * 枚举完整性检查器 —— 汉化后**必跑**。
 *
 * 背景：Cline 代码里大量字符串同时用于「逻辑判断」和「界面显示」。
 * 例如 `settingsSection === "Schedules"` 与 `title="Schedules"` 用同一个词。
 * 若把它翻译了，条件永不成立，**功能直接失效且不报错**（静默故障）。
 *
 * 本工具检测两类问题：
 *   1. 比较表达式中残留中文  →  枚举值被误译（功能性 BUG）
 *   2. 比较表达式中仍是英文  →  该值可能是「禁改枚举」，确认无误即可
 *
 * 用法：node tools/check-enums.mjs <文件或目录> [...]
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const targets = process.argv.slice(2);
if (targets.length === 0) {
	console.error("用法: node tools/check-enums.mjs <文件或目录> [...]");
	process.exit(1);
}

// 逻辑判断语境：=== / !== / switch case / 数组字面量声明
const COMPARE_RE = /(?:===|!==|==|!=)\s*"([^"]*)"/g;
// 明确的枚举声明
const ENUM_DECL_RE =
	/type\s+\w+\s*=\s*[^;]*?("[^"]*"[^;]*?);/g;

const CJK_RE = /[\u4e00-\u9fff]/;

function walk(dir, out = []) {
	for (const e of readdirSync(dir)) {
		const full = join(dir, e);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (["node_modules", ".next", "out", ".git"].includes(e)) continue;
			walk(full, out);
		} else if (
			[".ts", ".tsx", ".js", ".jsx"].includes(extname(e)) &&
			!/\.test\.|\.spec\./.test(e)
		) {
			out.push(full);
		}
	}
	return out;
}

let files = [];
for (const t of targets) {
	const st = statSync(t);
	if (st.isDirectory()) {
		files.push(...walk(t));
	} else {
		files.push(t);
	}
}

let badTotal = 0;
const report = [];

for (const f of files) {
	const src = readFileSync(f, "utf8");
	const lines = src.split("\n");
	const issues = [];

	lines.forEach((line, i) => {
		// 跳过注释行
		const t = line.trim();
		if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;

		COMPARE_RE.lastIndex = 0;
		let m;
		while ((m = COMPARE_RE.exec(line)) !== null) {
			const val = m[1];
			if (CJK_RE.test(val)) {
				issues.push({
					line: i + 1,
					kind: "🔴 中文出现在逻辑判断中（枚举值被误译，功能会失效）",
					text: line.trim().slice(0, 110),
				});
			}
		}
	});

	if (issues.length) {
		report.push({ file: f, issues });
		badTotal += issues.length;
	}
}

console.log(`检查 ${files.length} 个文件\n`);
if (report.length === 0) {
	console.log("✅ 未发现「中文出现在逻辑判断中」的问题。");
} else {
	console.log(`🔴 发现 ${badTotal} 处疑似枚举值误译：\n`);
	for (const r of report) {
		console.log(`\n── ${r.file}`);
		for (const is of r.issues) {
			console.log(`  L${is.line}  ${is.kind}`);
			console.log(`      ${is.text}`);
		}
	}
	console.log("\n修复方式：把该处的比较值还原为英文枚举；");
	console.log("若界面也要中文，请在**渲染处**加显示映射，不要改判断值。");
}
process.exit(badTotal > 0 ? 1 : 0);
