#!/usr/bin/env node
/**
 * 扫描 webview / sidecar / src-tauri 中的用户可见英文文案。
 *
 * 用途：为汉化任务精确定位需要翻译的文件与字符串，避免漏译。
 * 用法：node tools/scan-i18n.mjs [目标目录]
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.argv[2] ?? "apps/examples/desktop-app/webview";

// 明确不能翻译的标识：类名、导入、协议字段、API 名等
const SKIP_PATTERNS = [
	/^class(Name)?=/,
	/^(import|export|from|require)\b/,
	/\b(useState|useEffect|useMemo|useCallback|useRef)\b/,
	/data-\w+/,
	/^aria-[a-z]+$/,
	/\.(png|jpg|svg|css)$/,
];

// 常见技术词，出现即视为无需翻译
const TECH_TERMS = new Set([
	"claude", "openai", "anthropic", "gemini", "openrouter", "ollama",
	"cline", "mcp", "json", "api", "html", "css", "http", "https", "url",
	"id", "url", "pdf", "csv", "xml", "yaml", "env", "npm", "bun", "node",
	"github", "git", "bash", "powershell", "windows", "linux", "macos",
	"true", "false", "null", "undefined", "typescript", "javascript", "react",
	"tauri", "sidecar", "vscode", "utf-8", "cjk", "ellipsis", "ellipsis",
]);

const UI_ATTRS = [
	"title", "placeholder", "description", "label", "heading", "alt",
	"aria-label", "tooltip", "message", "text", "name", "confirm",
];

/** 判断一行是否像用户可见文案 */
function looksLikeUIString(line) {
	const t = line.trim();
	if (!t) return false;
	if (SKIP_PATTERNS.some((re) => re.test(t))) return false;

	// 提取字符串字面量
	const strs = t.match(/"([^"\\]{2,})"|'([^'\\]{2,})'|`([^`\\]{2,})`/g);
	if (!strs) return false;

	for (const raw of strs) {
		const s = raw.slice(1, -1);
		// 必须是英文
		if (!/[a-zA-Z]{2,}/.test(s)) continue;
		// 纯技术词/标识符跳过
		const low = s.toLowerCase().trim();
		if (TECH_TERMS.has(low)) continue;
		// 疑似变量名/路径/键名跳过
		if (/^[a-z0-9_]+$/.test(low) && !/\s/.test(low)) continue;
		if (s.includes("/") && !s.includes(" ")) continue;
		if (s.includes(".") && !s.includes(" ") && /^[a-z0-9.]+$/.test(low)) continue;
		// 需要有空格，或是 UI 常见短词（Cancel/Save/Delete 等）
		if (!/\s/.test(s) && s.length > 14) continue;
		return true;
	}
	return false;
}

function walk(dir, out = []) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (entry === "node_modules" || entry === ".next" || entry === "out") continue;
			walk(full, out);
		} else {
			const ext = extname(entry);
			if ([".tsx", ".ts", ".jsx", ".js"].includes(ext) && !/\.test\.|\.spec\./.test(entry)) {
				out.push(full);
			}
		}
	}
	return out;
}

const files = walk(ROOT);
const report = [];
let totalStrings = 0;

for (const f of files) {
	const src = readFileSync(f, "utf8");
	const hits = [];
	src.split("\n").forEach((line, i) => {
		if (looksLikeUIString(line)) hits.push({ line: i + 1, text: line.trim().slice(0, 150) });
	});
	if (hits.length) {
		report.push({ file: relative(ROOT, f), count: hits.length, hits });
		totalStrings += hits.length;
	}
}

report.sort((a, b) => b.count - a.count);

console.log(`扫描目录: ${ROOT}`);
console.log(`文件总数: ${files.length}，含文案文件: ${report.length}，候选文案行: ${totalStrings}\n`);
console.log("=== 按文案数量排序（Top 40）===");
for (const r of report.slice(0, 40)) {
	console.log(`${String(r.count).padStart(4)}  ${r.file}`);
}
console.log("\n=== 全部文件及数量 ===");
for (const r of report) console.log(`${String(r.count).padStart(4)}  ${r.file}`);
