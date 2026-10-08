#!/usr/bin/env node
/**
 * §4.20 十六类盲区复扫（B57 · 0.0.43 增量）
 *
 * residual.mjs 只认 JSX 属性白名单 / 三元 / 独占行 JSX 文本，下列形态永远扫不到。
 * 本脚本把其中可脚本化的十类集中跑一遍，逐条打印待人工判定。
 *
 * 用法：node blindspot-scan.mjs <目录> [更多目录...]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const roots = process.argv.slice(2);
if (!roots.length) {
	console.error("用法: node blindspot-scan.mjs <目录>...");
	process.exit(1);
}

const SKIP_DIRS = new Set([
	"node_modules",
	".next",
	"out",
	".git",
	"dist",
	"tmp",
	"target",
	"__snapshots__",
]);
const CJK = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
// 散文形态：至少两个英文单词，允许 CJK 插值
const PROSE = /[A-Za-z][A-Za-z'-]*(\s+[A-Za-z][A-Za-z'-]*)+/;

function walk(dir, out = []) {
	for (const e of readdirSync(dir)) {
		if (SKIP_DIRS.has(e)) continue;
		const full = join(dir, e);
		const st = statSync(full);
		if (st.isDirectory()) walk(full, out);
		else if (
			[".ts", ".tsx", ".rs"].includes(extname(e)) &&
			!/\.(test|spec|stories)\./.test(e)
		)
			out.push(full);
	}
	return out;
}

/** 抽取引号内的散文（跳过 import/注释行），返回 [line, text] */
function quotes(line) {
	const hits = [];
	const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
	let m;
	while ((m = re.exec(line)) !== null) {
		const text = m[1] ?? m[2];
		if (!text || CJK.test(text)) continue;
		if (!PROSE.test(text)) continue;
		hits.push(text);
	}
	return hits;
}

const RULES = [
	{
		id: "① 多行 throw new Error(",
		test: (lines, i) => /throw new Error\($/.test(lines[i]),
		extract: (lines, i) => [lines[i + 1] ?? ""],
	},
	{
		id: "② 对象字段 message:/description:/error:/reason:",
		test: (lines, i) =>
			/\b(message|description|error|reason)\s*:\s*$/.test(lines[i]),
		extract: (lines, i) => [lines[i + 1] ?? ""],
	},
	{
		id: "②b 对象字段 message:/description:/error:（同行）",
		test: (lines, i) =>
			/\b(message|description|error)\s*:\s*["'`]/.test(lines[i]),
		extract: (lines, i) => quotes(lines[i]),
	},
	{
		id: "⑤ sr-only 无障碍文本",
		test: (lines, i) => /sr-only[^>]*>[A-Za-z]/.test(lines[i]),
		extract: (lines, i) => quotes(lines[i]),
	},
	{
		id: "⑨ 顶层大写错误常量",
		test: (lines, i) =>
			/^const [A-Z][A-Z0-9_]*(ERROR|MESSAGE|LABEL|TEXT|TITLE|DESCRIPTION|HINT)[A-Z0-9_]*\s*(:\s*string)?\s*=\s*$/.test(
				lines[i],
			),
		extract: (lines, i) => [lines[i + 1] ?? ""],
	},
	{
		id: "⑨b 单行式 const = \"English …\"",
		test: (lines, i) =>
			/^const [A-Za-z][A-Za-z0-9_]*\s*(:\s*string)?\s*=\s*["']/.test(
				lines[i],
			),
		extract: (lines, i) => quotes(lines[i]),
	},
	{
		id: "⑫ 裸兜底 return \"English\"",
		test: (lines, i) => /^\s*return\s*["'`]/.test(lines[i]),
		extract: (lines, i) => quotes(lines[i]),
	},
	{
		id: "⑬ 模板串插值后挂英文后缀",
		test: (lines, i) => /`[^`]*\}\s+[a-z][A-Za-z ]*`/.test(lines[i]),
		extract: (lines, i) => [lines[i].trim()],
	},
	{
		id: "⑯ Intl/toLocale 的 locale 实参",
		test: (lines, i) => /toLocale[A-Za-z]*\(["']en-|new Intl\./.test(lines[i]),
		extract: (lines, i) => [lines[i].trim()],
	},
	{
		id: "⑧ JSX 属性 = {模板串英文}",
		test: (lines, i) => /=\s*\{\s*`[^`]*[A-Za-z][^`]*`\s*\}/.test(lines[i]),
		extract: (lines, i) => [lines[i].trim()],
	},
];

const findings = [];
for (const root of roots) {
	for (const file of walk(root)) {
		const rel = file;
		const lines = readFileSync(file, "utf8").split(/\r?\n/);
		lines.forEach((line, i) => {
			if (/^\s*(import|export)\s|^\s*\/\//.test(line)) return;
			for (const rule of RULES) {
				if (!rule.test(lines, i)) continue;
				for (const text of rule.extract(lines, i)) {
					if (!text || CJK.test(text)) continue;
					if (!/[A-Za-z]{3,}/.test(text)) continue;
					findings.push([rule.id, rel, i + 1, text.trim().slice(0, 150)]);
				}
			}
		});
	}
}

const byRule = new Map();
for (const f of findings) {
	if (!byRule.has(f[0])) byRule.set(f[0], []);
	byRule.get(f[0]).push(f);
}
for (const [id, rows] of byRule) {
	console.log(`\n${id}  —— ${rows.length} 条`);
	for (const [, rel, line, text] of rows) {
		console.log(`  ${rel}:${line}  ${text}`);
	}
}
console.log(`\n合计 ${findings.length} 条 / ${byRule.size} 类`);
