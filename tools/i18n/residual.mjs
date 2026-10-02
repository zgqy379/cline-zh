#!/usr/bin/env node
/**
 * 真实残留扫描：找出「已汉化文件里还剩下的用户可见英文」。
 *
 * 为什么不用 scan-i18n.mjs：它的启发式会把 className、import 路径、
 * 逻辑枚举、已翻译文件里的技术术语统统算成候选，误报率极高
 * （extensions-view.tsx 已汉化 39 处，扫描器仍报 152 条）。
 *
 * 本工具只找**明确是展示文案**的形态：
 *   1. title/placeholder/aria-label/alt/label/description/emptyText
 *      等属性直接赋英文短语
 *   2. JSX 裸文本独占一行且首字母大写（单行）
 *   3. 三元/条件表达式里 ?: "English Phrase"
 *   4. 【新增 v0.2】跨行 JSX 文本块（盲区）：
 *      a) 多行 opening tag + 内部文本（例：<Tag\n  attr=...>\n  Text\n</Tag>）
 *      b) 单行 opening tag + 内部文本跨多行（例：<Tag>\n  Text\n</Tag>）
 *      由 qoder 2026-09-29 17:13 alert 提出；supervisor 17:20 派给工具维护者；
 *      coordinator 在 17:35 实现 v0.2，加入 4a/4b 两种形态。
 *
 * 用法：node tools/residual.mjs <目录>
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.argv[2];
if (!ROOT) {
	console.error("用法: node tools/residual.mjs <目录>");
	process.exit(1);
}

// 展示类属性
const ATTR_RE =
	/\b(placeholder|title|aria-label|ariaLabel|alt|emptyText|searchPlaceholder|confirmText|cancelText|label|description|helperText|subtitle|heading)\s*=\s*"([A-Z][^"]{2,})"/g;
// 三元里的英文短语
const TERNARY_RE = /\?\s*"([A-Z][A-Za-z ,.'!?-]{6,})"/g;
// JSX 独占行裸文本（单行版，保留兼容）
const BARE_RE = /^\s*>([A-Z][A-Za-z ,.'!?-]{3,})<\s*$/;

// 英文裸文本候选：大写开头、字母/空格/常见标点、无数字打头
const EN_BARE_RE = /^[A-Z][A-Za-z ,.'!?-]{2,}$/;

function isJSXOpenTagClose(line) {
	// 行尾是 `>`，且行内含 `<Tag` 起始（普通 JSX 开标签）或就是 `>` 独占行
	const trimmed = line.trim();
	// 排除：自闭合 `/>` 结尾的（如 <Input />）
	if (/<[^<>]*\/>\s*$/.test(trimmed)) return false;
	// 排除：泛型箭头里的 `=>` （如 () => { ... }）
	if (/=>$/.test(trimmed)) return false;
	// 行尾必须是 `>`
	if (!/>\s*$/.test(trimmed)) return false;
	// 必须有 JSX 开标签的迹象：要么行首是 `<`（单行 <Tag> / <Tag attr=...>），要么上一行是多行开标签的延续（行内是 `>` 独占，前面有 `<Tag` 跨行 attrs）
	// 这里放宽：只要满足 ① 行尾是 `>` ② 不是自闭合/箭头 即可。
	// 多行开标签的「属性行」（如 `  className="x"  onClick={...}`）不匹配本规则——它们不含 `>`。
	return true;
}

// 跨行 JSX 文本扫描：对每行检测其是否为 JSX 开标签的闭合行，
// 再向后看 1~6 行寻找英文裸文本。
function scanCrossLineJSX(lines) {
	const hits = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!isJSXOpenTagClose(line)) continue;
		// 往后看 1~6 行
		for (let j = i + 1; j < Math.min(i + 7, lines.length); j++) {
			const next = lines[j].trim();
			// 遇到闭标签则停止（找到匹配闭标签）
			if (/^<\//.test(next)) break;
			// 遇到空白行——继续往下看
			if (next === "") continue;
			// 遇到另一段 JSX（缩进对齐同级）或 `{...}` 表达式——停止
			if (/^[{}]/.test(next)) break;
			// 遇到 `<...>`（另一段 JSX 子元素，如 <span>{x}</span>）——停止
			if (/^</.test(next)) break;
			// 是英文裸文本？
			if (EN_BARE_RE.test(next)) {
				if (!/[一-鿿]/.test(next)) {
					hits.push([j + 1, "跨行JSX", next]);
				}
				// 命中后继续看下一行（多行裸文本罕见，但仍可继续）
				continue;
			}
			// 其他形态（表达式、数字开头的标识符等）——停止
			break;
		}
	}
	return hits;
}

// 防止重复报告
function dedupe(hits) {
	const seen = new Set();
	const out = [];
	for (const h of hits) {
		const key = `${h[0]}|${h[1]}|${h[2]}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(h);
	}
	return out;
}

function walk(dir, out = []) {
	for (const e of readdirSync(dir)) {
		const full = join(dir, e);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (["node_modules", ".next", "out", ".git"].includes(e)) continue;
			walk(full, out);
		} else if (
			[".ts", ".tsx"].includes(extname(e)) &&
			// 测试文件断言已同步，这里不重复报
			!/\.test\.|\.spec\./.test(e)
		) {
			out.push(full);
		}
	}
	return out;
}

const files = walk(ROOT);
let total = 0;
const rows = [];

for (const f of files) {
	const content = readFileSync(f, "utf8");
	const lines = content.split(/\r?\n/);
	const hits = [];

	// 单行规则（保留原行为）
	lines.forEach((line, i) => {
		// 跳过 import / 注释行
		if (/^\s*(import|export)\s|^\s*\/\//.test(line)) return;
		let m;
		ATTR_RE.lastIndex = 0;
		while ((m = ATTR_RE.exec(line)) !== null) {
			hits.push([i + 1, `属性 ${m[1]}`, m[2]]);
		}
		TERNARY_RE.lastIndex = 0;
		while ((m = TERNARY_RE.exec(line)) !== null) {
			hits.push([i + 1, "三元", m[1]]);
		}
		const b = line.match(BARE_RE);
		if (b) hits.push([i + 1, "裸文本", b[1]]);
	});

	// 跨行 JSX 规则（v0.2 新增）
	const crossHits = scanCrossLineJSX(lines);
	hits.push(...crossHits);

	const uniq = dedupe(hits);
	if (uniq.length) {
		total += uniq.length;
		rows.push([relative(ROOT, f), uniq]);
	}
}

rows.sort((a, b) => b[1].length - a[1].length);
for (const [f, hits] of rows) {
	console.log(`\n${f}  (${hits.length})`);
	for (const [line, kind, text] of hits.slice(0, 25)) {
		console.log(`  L${line} [${kind}] ${text}`);
	}
	if (hits.length > 25) console.log(`  ...(共 ${hits.length} 条)`);
}
console.log(`\n合计残留 ${total} 条 / ${rows.length} 个文件`);