#!/usr/bin/env node
/**
 * 🔴 合并回退检测器（B57 对抗审查用）
 *
 * 要解决的问题：0.0.43 merge（7190d75cf）**不仅**把 `src-tauri/src/main.rs` 的汉化打回英文，
 * 也把 webview / sidecar 里**0.0.37 时代已译**的文案打回了英文。
 * zcode 只按「丢失清单」恢复了 Rust 层，webview 层的回退**漏了一整批**。
 *
 * 为什么不靠 residual.mjs：residual 只看「现在还剩哪些英文」，
 * 判不出「这句英文本来是中文、被合并覆盖回去了」——
 * 而后者危险得多（已验收过的页面会静默退回英文）。
 *
 * 做法：对每个文件，取两个 commit 的**含 CJK 的字符串字面量集合**，
 * 输出「基线有、现在没有」的那些 token。人工逐条判定是「上游删了这段代码」
 * 还是「汉化被覆盖」。
 *
 * 用法：node merge-regress.mjs <baseCommit> <headCommit> [路径前缀...]
 */
import { execFileSync } from "node:child_process";

const [, , base = "0dcc90658", head = "HEAD", ...prefixes] = process.argv;
const SCOPE = prefixes.length
	? prefixes
	: [
			"apps/examples/desktop-app",
			"sdk/packages/ui",
			"sdk/packages/shared/src",
		];

// 含 CJK 的「像文案的」token：CJK 连续段，允许夹杂 CJK 标点/数字/拉丁词/空格
const TOKEN_RE =
	/[⺀-鿿　-〿＀-￯][⺀-鿿　-〿＀-￯0-9A-Za-z%：:，。、（）()「」“”‘’·\-—/ ]{1,80}/g;

function listFiles(ref) {
	const out = execFileSync(
		"git",
		["ls-tree", "-r", "--name-only", ref, "--", ...SCOPE],
		{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
	);
	return out.split("\n").filter((f) => /\.(ts|tsx|rs|json)$/.test(f) && !/\.test\.|\.stories\./.test(f));
}

function blob(ref, file) {
	try {
		return execFileSync("git", ["show", `${ref}:${file}`], {
			encoding: "utf8",
			maxBuffer: 32 * 1024 * 1024,
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch {
		return null;
	}
}

function tokens(text) {
	const set = new Set();
	let m;
	TOKEN_RE.lastIndex = 0;
	while ((m = TOKEN_RE.exec(text)) !== null) {
		const t = m[0].trim();
		// 去掉纯符号/单字的噪声；保留 ≥2 个字符且至少含 2 个 CJK 的
		if (t.length >= 2 && (t.match(/[⺀-鿿]/g) || []).length >= 2) set.add(t);
	}
	return set;
}

const baseFiles = new Set(listFiles(base));
const headFiles = listFiles(head);
let totalLost = 0;
let touchedFiles = 0;

for (const file of headFiles) {
	const baseText = baseFiles.has(file) ? blob(base, file) : null;
	const headText = blob(head, file);
	if (!headText) continue;
	const baseTokens = baseText ? tokens(baseText) : new Set();
	const headTokens = tokens(headText);
	const lost = [...baseTokens].filter((t) => !headTokens.has(t));
	if (!lost.length) continue;
	touchedFiles++;
	totalLost += lost.length;
	console.log(`\n${file}  (${lost.length})`);
	for (const t of lost.sort()) console.log(`  ${t}`);
}
console.log(
	`\n合计丢失 ${totalLost} 条 / ${touchedFiles} 个文件（base=${base} head=${head}）`,
);
