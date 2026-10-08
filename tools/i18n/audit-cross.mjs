#!/usr/bin/env node
/**
 * 跨文件一致性审计（对抗式）。
 *
 * 最隐蔽的 bug 形态：**同一个英文串在一处被汉化、另一处没被汉化**。
 * 单文件检查永远发现不了，因为两处各自都"看起来正确"，
 * 但运行时它们本该匹配，翻译后就再也匹配不上了。
 *
 * 检测方法：
 *   1. 收集所有「被汉化过」的英文字符串（即映射表里的 key -> value 对）
 *   2. 在源码中找「仍以英文形态出现」的同一个串
 *   3. 差集即为不一致点，人工判定是「故意保留」还是「漏网」
 *
 * 用法：node tools/audit-cross.mjs <源码根>
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.argv[2];
// maps 已收编进本仓库（tools/i18n/maps）；可用 MAPS_DIR 显式覆盖。
const MAPS =
	process.env.MAPS_DIR ||
	join(dirname(fileURLToPath(import.meta.url)), "maps");
if (!ROOT || !existsSync(ROOT)) {
	console.error("用法: node tools/audit-cross.mjs <源码根目录>");
	process.exit(1);
}

// 1. 加载全部映射
const dict = new Map();
for (const f of readdirSync(MAPS)) {
	if (!f.endsWith(".json")) continue;
	const o = JSON.parse(readFileSync(join(MAPS, f), "utf8"));
	for (const [en, zh] of Object.entries(o)) {
		if (!en.startsWith("__") && typeof zh === "string") dict.set(en, zh);
	}
}
console.log(`映射词典: ${dict.size} 条\n`);

function walk(dir, out = []) {
	for (const e of readdirSync(dir)) {
		const full = join(dir, e);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (
				["node_modules", ".next", "out", ".git", "target", "dist", ".bun-cache"]
					.includes(e)
			)
				continue;
			walk(full, out);
		} else if (
			[".ts", ".tsx", ".rs"].includes(extname(e)) &&
			!/\.test\.|\.spec\./.test(e)
		) {
			out.push(full);
		}
	}
	return out;
}

const files = walk(ROOT);
const results = [];

for (const f of files) {
	const src = readFileSync(f, "utf8");
	const lines = src.split(/\r?\n/);
	const rel = relative(ROOT, f);
	lines.forEach((line, i) => {
		// 逐个映射 key，检查是否仍以英文形态出现
		for (const [en] of dict) {
			if (en.length < 6) continue; // 太短的字符串误报率高
			// 只在引号内精确匹配
			if (
				line.includes(`"${en}"`) ||
				line.includes(`'${en}'`) ||
				line.includes("`" + en)
			) {
				// 排除：这一行本来就同时含中文（说明是混合行，多半是有意的）
				if (/[一-鿿]/.test(line)) continue;
				results.push({ file: rel, line: i + 1, en, text: line.trim().slice(0, 110) });
			}
		}
	});
}

if (results.length === 0) {
	console.log("✅ 未发现跨文件不一致。");
} else {
	console.log(`发现 ${results.length} 处「已映射但仍为英文」：\n`);
	// 按文件分组
	const byFile = {};
	for (const r of results) (byFile[r.file] ??= []).push(r);
	for (const [file, list] of Object.entries(byFile)) {
		console.log(`${file}`);
		for (const r of list.slice(0, 12)) {
			console.log(`   L${r.line}  "${r.en}"`);
			console.log(`        ${r.text}`);
		}
		if (list.length > 12) console.log(`   ...(共 ${list.length} 处)`);
	}
}
