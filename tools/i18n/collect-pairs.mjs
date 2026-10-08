// collect-pairs.mjs — 从 git 基线累计 diff + maps/ 提取 EN→ZH 双语对
// 用法: node collect-pairs.mjs <repoRoot> <baselineSha> <outJson>
// 输出: [{ en, zh, file, line, kind, prop }]
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [repo, base, out] = process.argv.slice(2);
const CJK = /[\u4e00-\u9fff]/;

// ---- 1. 载入 maps/ 反查词典（ZH -> EN，供 diff 配不上的兜底） ----
// maps 已随工具链收编进本仓库（tools/i18n/maps）；同时兼容历史上放在仓库外的
// <workspace>/tools/maps（可用 MAPS_DIR 显式覆盖）。
const z2e = new Map();
const mapsDir =
	process.env.MAPS_DIR ||
	join(repo, "tools", "i18n", "maps");
try {
	for (const f of readdirSync(mapsDir)) {
		if (!f.endsWith(".json")) continue;
		const m = JSON.parse(readFileSync(join(mapsDir, f), "utf8"));
		for (const [en, zh] of Object.entries(m)) {
			if (!z2e.has(zh)) z2e.set(zh, en);
		}
	}
} catch {}

// ---- 2. 字符串提取 ----
// 提取一行里的引号串 / 模板串 / JSX 文本，返回 [{text, kind, prop}]
function extract(line) {
	const out = [];
	// 注释行跳过（JSDoc/行注释不属 UI 文案）
	const t = line.trim();
	if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return out;
	const push = (text, kind, prop) => {
		if (CJK.test(text)) out.push({ text, kind, prop });
	};
	// 属性 = "串" 或 属性: "串"（捕获属性名做上下文）
	const attrRe =
		/([A-Za-z-]+)\s*=\s*(?:\{)?["'`]([^"'`]+)["'`]/g;
	for (const m of line.matchAll(attrRe)) {
		if (CJK.test(m[2])) push(m[2], "attr", m[1]);
	}
	// 对象字面量 label: "…" / title: "…"
	const objRe = /([A-Za-z_$][\w$]*)\s*:\s*["'`]([^"'`]*[\u4e00-\u9fff][^"'`]*)["'`]/g;
	for (const m of line.matchAll(objRe)) push(m[2], "prop", m[1]);
	// 模板串（可能带插值）
	const tplRe = /`([^`]*[\u4e00-\u9fff][^`]*)`/g;
	for (const m of line.matchAll(tplRe)) push(m[1], "template", null);
	// JSX 文本 >中文<
	const jsxRe = />>([^<>{}]*[\u4e00-\u9fff][^<>{}]*)<</g;
	for (const m of line.matchAll(jsxRe)) push(m[1], "jsx", null);
	// 兜底：普通引号串（去重：已被上面覆盖的会因 kind 不同重复，这里只补漏）
	if (out.length === 0) {
		const qRe = /["'`]([^"'`]*[\u4e00-\u9fff][^"'`]*)["'`]/g;
		for (const m of line.matchAll(qRe)) push(m[1], "str", null);
	}
	return out;
}
// 英文候选：含 ≥2 个连续拉丁词（避免把 api/HTML 之类单词当文案）
const EN = (s) => /[A-Za-z][A-Za-z\s']*[a-zA-Z]/.test(s) && (s.match(/[A-Za-z]+/g) || []).length >= 2;

// ---- 3. git diff 解析 ----
const SPA = ["-U0", base, "HEAD", "--"];
const paths = [
	"apps/examples/desktop-app/webview",
	"apps/examples/desktop-app/sidecar",
	"sdk/packages/ui/components",
];
const raw = execFileSync("git", ["-C", repo, "diff", ...SPA, ...paths], {
	maxBuffer: 1 << 28,
	encoding: "utf8",
});
const pairs = [];
let file = null;
let removed = [];
let added = [];
let curLine = 0;
function flushHunk() {
	if (!file) { removed = []; added = []; return; }
	const zhAdded = added.flatMap((l) => extract(l.text).map((x) => ({ ...x, line: l.line })));
	// 英文侧只取引号/模板串**内容**（不是整行代码），并按出现顺序展开
	const enRemoved = removed.flatMap((l) => {
		const out = [];
		const qRe = /["'`]([^"'`\n]+)["'`]/g;
		for (const m of l.text.matchAll(qRe)) if (EN(m[1])) out.push(m[1]);
		if (out.length === 0 && EN(l.text.replace(/\b(if|throw|return|new|Error|const|await|function|push)\b/g, ""))) out.push(l.text.trim());
		return out;
	});
	const n = Math.max(zhAdded.length, enRemoved.length);
	for (let i = 0; i < n; i++) {
		const zh = zhAdded[i];
		const en = enRemoved[i];
		if (!zh) continue;
		pairs.push({
			en: en ? en.replace(/^>>|<</g, "").trim() : z2e.get(zh.text) ?? null,
			zh: zh.text.trim(),
			file: file.replace(/\\/g, "/"),
			line: zh.line,
			kind: zh.kind,
			prop: zh.prop,
		});
	}
	removed = [];
	added = [];
}
const diffHeader = /^diff --git a\/(.+?) b\//;
const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)/;
for (const line of raw.split("\n")) {
	const df = line.match(diffHeader);
	if (df) { flushHunk(); file = df[1]; continue; }
	const hk = line.match(hunkHeader);
	if (hk) { flushHunk(); curLine = Number(hk[1]); continue; }
	if (!file) continue;
	if (line.startsWith("-") && !line.startsWith("---")) removed.push({ text: line.slice(1), line: 0 });
	else if (line.startsWith("+") && !line.startsWith("+++")) { added.push({ text: line.slice(1), line: curLine }); curLine++; }
}
flushHunk();
// 补行号：diff 解析里行号懒算容易错，这里用重扫当前源码的方式校正（按 zh 内容定位首行）
function fixLineNumbers() {
	const idx = new Map();
	for (const p of pairs) {
		const key = p.file;
		if (!idx.has(key)) {
			try {
				idx.set(key, readFileSync(join(repo, key), "utf8").split("\n"));
			} catch { idx.set(key, null); }
		}
		const lines = idx.get(key);
		if (!lines) { p.line = 0; continue; }
		const at = lines.findIndex((l) => l.includes(p.zh));
		p.line = at >= 0 ? at + 1 : 0;
	}
}
fixLineNumbers();
// 去重（同文件同 zh 同 en）
const seen = new Set();
const uniq = pairs.filter((p) => {
	const k = `${p.file}|${p.zh}|${p.en ?? ""}`;
	if (seen.has(k)) return false;
	seen.add(k);
	return true;
});
uniq.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
writeFileSync(out, JSON.stringify(uniq, null, 1), "utf8");
const noEn = uniq.filter((p) => !p.en);
console.log(`pairs=${uniq.length}  files=${new Set(uniq.map((p) => p.file)).size}  noEN=${noEn.length}`);
console.log(`out -> ${out}`);
