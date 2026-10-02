#!/usr/bin/env node
/**
 * 提取候选文案字符串（汉化辅助）。
 *
 * 用途：批量汉化前，一次性把某个文件里「可能是用户可见文案」的字符串
 * 全部导出，避免逐个 read_files 精读（1854 行的文件读一遍很贵）。
 *
 * 判定为「疑似 UI 文案」的条件（全部满足）：
 *   1. 是双引号/单引号/模板字符串字面量
 *   2. 含至少两个英文单词（允许空格分隔，或首字母大写开头）
 *   3. 不是 import 路径、类名、CSS 变量、URL、纯标识符
 *
 * 输出：按出现顺序列出 `行号: 字符串`，供人工挑选后写进 tools/maps/*.json
 *
 * 用法：node tools/extract.mjs <文件...>
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const files = process.argv.slice(2);
if (!files.length) {
	console.error("用法: node tools/extract.mjs <文件...>");
	process.exit(1);
}

const SKIP_LINE =
	/^\s*(import|export)\s|^\s*from\s|className=|^\s*\/\/|^\s*\*/;

for (const f of files) {
	const src = readFileSync(f, "utf8");
	const lines = src.split(/\r?\n/);
	console.log(`\n########## ${basename(f)} (${lines.length} 行) ##########`);
	let count = 0;
	lines.forEach((line, i) => {
		if (SKIP_LINE.test(line)) return;
		// 匹配 "..." / '...' / `...`
		const re = /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g;
		let m;
		while ((m = re.exec(line)) !== null) {
			const s = m[2];
			if (s.length < 3) continue;
			// 至少两个「单词」，或一个大写开头的短语
			const words = s.match(/[A-Za-z][A-Za-z'-]*/g);
			if (!words || words.length < 2) continue;
			// 排除纯技术标识
			if (/^[a-z0-9_./:@#-]+$/.test(s)) continue;
			if (/^(https?:|data:)/.test(s)) continue;
			// 排除 className 风格的长串（虽然已跳过，但保险）
			if (s.includes("flex ") || s.includes("text-") || s.includes("bg-"))
				continue;
			count++;
			console.log(`${i + 1}: ${s}`);
		}

		// JSX 裸文本：>Some Words Here< 独占一行（apply-zh.mjs 能替换的形式）
		const bare = line.match(/^\s*>([A-Z][A-Za-z ,.'!?-]{2,})<\s*$/);
		if (bare) {
			count++;
			console.log(`${i + 1}: [裸文本] ${bare[1]}`);
		}
	});
	console.log(`---- 共 ${count} 条 ----`);
}
