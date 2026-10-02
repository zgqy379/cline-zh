#!/usr/bin/env node
/**
 * 精确文案替换工具（汉化用）。
 *
 * 设计原则 —— 安全第一：
 *   1. 只做「整词精确匹配」，不做模糊/正则替换
 *   2. 每条映射都必须报告命中次数，命中 0 会报警
 *   3. 默认 dry-run 只预览不落盘，加 --write 才真正写入
 *   4. 写入前自动备份为 .bak
 *
 * 用法：
 *   node tools/apply-zh.mjs <映射文件.json> [--write] [目标文件...]
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const positional = args.filter((a) => !a.startsWith("--"));
const mapFile = positional.find((a) => a.endsWith(".json"));
const targets = positional.filter((a) => a !== mapFile);

if (!mapFile) {
	console.error("用法: node tools/apply-zh.mjs <映射文件.json> [--write] [目标文件...]");
	process.exit(1);
}

const mapping = JSON.parse(readFileSync(mapFile, "utf8"));
console.log(`映射文件: ${mapFile}  (${Object.keys(mapping).length} 条)`);
console.log(`模式: ${WRITE ? "写入" : "预览(dry-run)"}\n`);

const files = targets.length ? targets : Object.keys(mapping.__files ?? {});
let totalChanged = 0;
let totalMiss = 0;
const misses = [];

for (const file of files) {
	if (!existsSync(file)) {
		console.error(`✗ 文件不存在: ${file}`);
		continue;
	}
	let src = readFileSync(file, "utf8");
	let fileChanged = 0;
	const fileMiss = [];

	for (const [en, zh] of Object.entries(mapping)) {
		if (en.startsWith("__")) continue;

		// 转义源串中的正则元字符，保证按字面量匹配
		const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

		// 只匹配被引号包裹的完整字面量，或独占一行的 JSX 裸文本，
		// 避免误伤标识符 / 变量名 / 属性名。
		const patterns = [
			{ re: `"${esc(en)}"`, to: `"${zh}"` },
			{ re: `'${esc(en)}'`, to: `'${zh}'` },
			// JSX 裸文本：>text< 或 独占一行（换行 + 缩进 + 文本 + 换行）
			{ re: `>${esc(en)}<`, to: `>${zh}<` },
			{ re: `\\n([\\t ]*)${esc(en)}\\n`, to: `\n$1${zh}\n` },
		];

		let hit = 0;
		for (const { re, to } of patterns) {
			const rx = new RegExp(re, "g");
			const count = (src.match(rx) ?? []).length;
			if (count > 0) {
				// 替换串中 $ 有特殊含义：$1 等为捕获组引用。
				// 先把「原文中需要保留的 $」保护起来，再放行捕获组，
				// 最后还原，避免把 $1 也转义掉。
				const holds = [];
				let safe = to.replace(/\$(?![\d&`])/g, (m) => {
					holds.push(m);
					return `\u0000${holds.length - 1}\u0000`;
				});
				src = src.replace(rx, safe);
				src = src.replace(/\u0000(\d+)\u0000/g, (_, i) => holds[Number(i)]);
				hit += count;
			}
		}

		if (hit > 0) {
			fileChanged += hit;
		} else {
			fileMiss.push(en);
		}
	}

	if (fileChanged > 0) {
		if (WRITE) {
			copyFileSync(file, `${file}.bak`);
			writeFileSync(file, src, "utf8");
			console.log(`✓ ${basename(file)}: ${fileChanged} 处替换${targets.length === 1 ? "" : ""}`);
		} else {
			console.log(`· ${basename(file)}: ${fileChanged} 处待替换`);
		}
		totalChanged += fileChanged;
	}

	if (fileMiss.length) {
		totalMiss += fileMiss.length;
		misses.push({ file: basename(file), items: fileMiss });
	}
}

console.log(`\n合计: ${totalChanged} 处替换, ${totalMiss} 条未命中`);
if (misses.length) {
	console.log("\n未命中明细（可能已翻译或本就不在此文件）:");
	for (const m of misses) {
		console.log(`  ${m.file}: ${m.items.slice(0, 12).join(" | ")}${m.items.length > 12 ? ` ...(+${m.items.length - 12})` : ""}`);
	}
}
if (!WRITE && totalChanged > 0) {
	console.log("\n提示: 这是预览。加 --write 才会真正写入文件。");
}
