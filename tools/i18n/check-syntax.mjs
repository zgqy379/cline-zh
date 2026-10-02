#!/usr/bin/env node
/**
 * 语法校验器（汉化专用闸门）。
 *
 * 为什么需要：apply-zh.mjs 做的是纯文本替换，无法保证替换后仍是合法 TSX。
 * 批量汉化几百处文案后，一旦出现括号/引号/JSX 标签不配对，
 * 编译期才会报错，而那时已经改了很多批次，定位成本高。
 *
 * 本工具用 TypeScript 编译器 API 逐文件 parse，只报语法错误（不做类型检查，
 * 因为项目依赖尚未安装，类型检查必然大量报缺模块的假错）。
 *
 * 用法：node tools/check-syntax.mjs <文件或目录...>
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const targets = process.argv.slice(2);
if (targets.length === 0) {
	console.error("用法: node tools/check-syntax.mjs <文件或目录...>");
	process.exit(1);
}

function walk(dir, out = []) {
	for (const e of readdirSync(dir)) {
		const full = join(dir, e);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (["node_modules", ".next", "out", ".git"].includes(e)) continue;
			walk(full, out);
		} else if (
			[".ts", ".tsx", ".js", ".jsx"].includes(extname(e)) &&
			// 测试文件里的英文断言（如 expect(...).toBe("Copy message")）不是 UI 文案，
			// 但它们同样必须能解析，故一并校验。
			true
		) {
			out.push(full);
		}
	}
	return out;
}

let files = [];
for (const t of targets) {
	if (!existsSync(t)) {
		console.error(`✗ 路径不存在: ${t}`);
		process.exit(1);
	}
	const st = statSync(t);
	if (st.isDirectory()) {
		files.push(...walk(t));
	} else if ([".ts", ".tsx", ".js", ".jsx"].includes(extname(t))) {
		files.push(t);
	} else {
		// 本工具是 JS/TS 语法闸门；显式传入 .rs 等非 JS/TS 文件时跳过，
		// 避免把 Rust 源码当 TS 解析（如 main.rs 恒报 2448 条假错，误导 Agent）。
		console.log(`跳过非 JS/TS 文件: ${t}`);
	}
}

let bad = 0;
for (const f of files) {
	const src = readFileSync(f, "utf8");
	const sf = ts.createSourceFile(
		f,
		src,
		ts.ScriptTarget.ESNext,
		/* setParentNodes */ true,
		f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
	// parseDiagnostics 是内部 API，但这是唯一能拿到纯语法错误的地方
	const diags = sf.parseDiagnostics ?? [];
	if (diags.length > 0) {
		bad++;
		console.log(`\n✗ ${f}`);
		for (const d of diags.slice(0, 5)) {
			const { line, character } = sf.getLineAndCharacterOfPosition(d.start);
			const msg = ts.flattenDiagnosticMessageText(d.messageText, " ");
			console.log(`   L${line + 1}:${character + 1}  ${msg}`);
		}
		if (diags.length > 5) console.log(`   ...(共 ${diags.length} 条)`);
	}
}

console.log(`\n检查 ${files.length} 个文件`);
if (bad === 0) {
	console.log("✅ 全部文件语法正确。");
	process.exit(0);
} else {
	console.log(`❌ ${bad} 个文件存在语法错误。`);
	process.exit(1);
}
