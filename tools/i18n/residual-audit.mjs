#!/usr/bin/env node
// 独立、精确的「可见英文残留」审计（不依赖项目自产 scan/apply 工具）。
// 逐文件逐行做轻量正则，统计两类真实残留：
//   A) JSX 裸文本节点  >English...<
//   B) 可见属性仍为英文 title/placeholder/aria-label/alt/heading/tooltip
// 跳过测试文件、className、import、注释。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.argv[2];
if (!root) {
	console.error("用法: node residual-audit.mjs <webview-dir>");
	process.exit(1);
}

function walk(dir, out = []) {
	for (const e of readdirSync(dir)) {
		if (["node_modules", ".next", "out"].includes(e)) continue;
		const full = join(dir, e);
		const st = statSync(full);
		if (st.isDirectory()) walk(full, out);
		else if (extname(e) === ".tsx" && !/\.(test|spec)\.tsx$/.test(e)) out.push(full);
	}
	return out;
}

const files = walk(root);
const A_RE = />\s*([A-Za-z][A-Za-z0-9 ,.!?:'’…\-/&]{2,}?)\s*</g;
const B_RE =
	/\b(title|placeholder|aria-label|alt|heading|tooltip)\s*=\s*"([A-Za-z][^"]{2,})"/g;

let aTotal = 0;
let bTotal = 0;
const byFile = [];

// 常见非文案噪声过滤
const NOISE =
	/^(Loading|Error)$/i;

for (const f of files) {
	const src = readFileSync(f, "utf8");
	let m;
	const a = [];
	const b = [];
	A_RE.lastIndex = 0;
	while ((m = A_RE.exec(src)) !== null) {
		const t = m[1].trim();
		// 排除纯变量/标签残留、纯驼峰无空格的短词
		if (/^[A-Z][a-zA-Z]{0,3}$/.test(t)) continue;
		if (NOISE.test(t)) {
			// 仍计入，但单独不细化
		}
		a.push(t);
	}
	B_RE.lastIndex = 0;
	while ((m = B_RE.exec(src)) !== null) {
		b.push(`${m[1]}="${m[2]}"`);
	}
	if (a.length || b.length) {
		byFile.push({ f: f.replace(root, ""), a: a.length, b: b.length, aSample: a.slice(0, 6), bSample: b.slice(0, 6) });
		aTotal += a.length;
		bTotal += b.length;
	}
}

byFile.sort((x, y) => y.a + y.b - (x.a + x.b));
console.log(`审计 ${files.length} 个非测试 tsx 文件`);
console.log(`A) JSX 裸英文文本节点: ${aTotal}`);
console.log(`B) 可见属性英文残留  : ${bTotal}`);
console.log(`合计可见英文残留(上限): ${aTotal + bTotal}\n`);
for (const x of byFile.slice(0, 30)) {
	console.log(`${x.f}  A=${x.a} B=${x.b}`);
	for (const s of x.aSample) console.log(`    文本: ${s.slice(0, 80)}`);
	for (const s of x.bSample) console.log(`    属性: ${s.slice(0, 80)}`);
}
