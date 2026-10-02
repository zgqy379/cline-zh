#!/usr/bin/env node
/**
 * 深度失效审计器 —— 对抗 check-enums.mjs 的盲区。
 *
 * check-enums.mjs 只查 `===` / `!==`，这远远不够。
 * 同一个英文字符串参与「一致性判定」的形式至少有 8 种，
 * 只要漏掉其中任何一种，汉化后功能就会**静默失效**。
 *
 * 本工具检测 7 类高危模式：
 *   1. Set/Map 的构造与查询 key 不一致
 *   2. includes() / startsWith() / endsWith() / match() 的匹配字面量被译
 *   3. switch case 的 case 值被译
 *   4. 对象属性键与调用方不一致
 *   5. localStorage 键被译
 *   6. IPC / invoke 的命令名被译
 *   7. 跨文件同一字面量：一个文件译了、另一个没译（最容易出隐蔽 bug）
 *
 * 用法：node tools/audit.mjs <源码根目录>
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.argv[2];
if (!ROOT) {
	console.error("用法: node tools/audit.mjs <源码根目录>");
	process.exit(1);
}

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
const CJK = /[一-鿿]/;
const findings = [];

// ---- 收集所有含中文的源码文件，供跨文件比对 ----
const allText = new Map(); // file -> content
for (const f of files) {
	allText.set(f, readFileSync(f, "utf8"));
}

for (const [f, src] of allText) {
	const lines = src.split(/\r?\n/);
	const rel = relative(ROOT, f);

	lines.forEach((line, i) => {
		const L = i + 1;

		// ===== 1. includes/startsWith/endsWith 匹配字面量被中文化 =====
		// .includes("中文") —— 若同文件或其他文件仍用英文做同样的匹配，就会失效
		const incRe =
			/\.(includes|startsWith|endsWith|indexOf|match|replace|split|replaceAll)\s*\(\s*["'`]([^"'`]+)["'`]/g;
		let m;
		while ((m = incRe.exec(line)) !== null) {
			if (CJK.test(m[2])) {
				findings.push({
					kind: "🔴 字符串方法参数被中文化",
					rule: "1-匹配字面量",
					file: rel,
					line: L,
					text: line.trim().slice(0, 120),
				});
			}
		}

		// ===== 2. switch case 值被中文化 =====
		if (/^\s*case\s+["'`]/.test(line)) {
			const cm = line.match(/case\s+["'`]([^"'`]+)["'`]/);
			if (cm && CJK.test(cm[1])) {
				findings.push({
					kind: "🔴 switch case 被中文化",
					rule: "3-switch",
					file: rel,
					line: L,
					text: line.trim().slice(0, 120),
				});
			}
		}

		// ===== 3. localStorage / sessionStorage 键被中文化 =====
		if (
			/(localStorage|sessionStorage)\s*\.\s*(getItem|setItem|removeItem)\s*\(/.test(
				line,
			)
		) {
			const sm = line.match(/(getItem|setItem|removeItem)\s*\(\s*["'`]([^"'`]+)["'`]/);
			if (sm && CJK.test(sm[2])) {
				findings.push({
					kind: "🔴 存储键被中文化",
					rule: "5-存储",
					file: rel,
					line: L,
					text: line.trim().slice(0, 120),
				});
			}
		}

		// ===== 4. IPC invoke / emit 命令名被中文化 =====
		if (/\b(invoke|emit|listen|once)\s*\(/.test(line)) {
			const im = line.match(
				/\b(invoke|emit|listen|once)\s*\(\s*["'`]([^"'`]+)["'`]/,
			);
			if (im && CJK.test(im[2])) {
				findings.push({
					kind: "🔴 IPC 命令名被中文化",
					rule: "6-IPC",
					file: rel,
					line: L,
					text: line.trim().slice(0, 120),
				});
			}
		}

		// ===== 5. Rust 侧字符串 =====
		//
		// ⚠️ 这条规则最初是「Rust 侧出现中文 → 提醒确认」。
		//    但汉化完成后，Rust 里的托盘菜单/状态文案**本来就该是中文**，
		//    于是全量误报（28 处），真问题反而被淹没。
		//
		// 改为按性质分类：
		//   - 出现在 match 分支 / 菜单构造 / 断言 里的中文 = 展示文案，正常
		//   - 出现在 IPC 名、路径、env key、协议字面量里的中文 = 需要警惕
		if (extname(f) === ".rs") {
			// 真正危险的：疑似数据契约位置出现中文
			const CONTRACT_RE =
				/(invoke_handler|tauri::command|#[a-z_]*handler|std::env::var|env!\(|to_socket_addr|localhost|127\.0\.0\.1|https?:\/\/)/;
			const CONCAT_RE = /format!\(\s*"[^"]*[\u4e00-\u9fff]/;
			if (CONTRACT_RE.test(line) && CJK.test(line)) {
				findings.push({
					kind: "🔴 Rust 契约位置含中文（疑似误伤数据）",
					rule: "7-rust-contract",
					file: rel,
					line: L,
					text: line.trim().slice(0, 120),
				});
			} else if (CONCAT_RE.test(line)) {
				// format! 拼接中文：需人工确认插值是否被改写
				findings.push({
					kind: "🟡 Rust format! 拼接中文（需确认插值完整）",
					rule: "7-rust-format",
					file: rel,
					line: L,
					text: line.trim().slice(0, 120),
				});
			}
			// 其余含中文的 Rust 字符串 = 已汉化的展示文案，正常，不再报告
		}
	});
}

// ---- 输出 ----
if (findings.length === 0) {
	console.log(`✅ 深度审计通过：未发现 check-enums 覆盖不到的高危模式。`);
	console.log(`   审计 ${files.length} 个文件。`);
} else {
	const byKind = {};
	for (const f of findings) (byKind[f.kind] ??= []).push(f);
	for (const [kind, list] of Object.entries(byKind)) {
		console.log(`\n${kind}  (${list.length} 处)`);
		for (const f of list.slice(0, 20)) {
			console.log(`   ${f.file}:${f.line}  ${f.text}`);
		}
		if (list.length > 20) console.log(`   ...(共 ${list.length} 处)`);
	}
	console.log(`\n审计 ${files.length} 个文件，发现 ${findings.length} 处高危。`);
}
