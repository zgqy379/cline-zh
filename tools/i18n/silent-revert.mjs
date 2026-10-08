#!/usr/bin/env node
/**
 * 🔴 静默回退检测器（对抗审查用，与 merge-regress.mjs 互补）
 *
 * merge-regress.mjs 靠「基线里的中文现在没了」发现问题，
 * **查不到「基线里被删掉/改掉的东西」** —— 例如把 `plugins.updater` 整块换成
 * 「禁用」说明、或把某个 key 改名。0.0.43 合并正是这样把
 * 「禁用自动更新」整块打回上游的（merge-regress 完全无感，因为那段文字是英文）。
 *
 * 做法：只对**配置 / 构建 / 身份类文件**做结构化对比（JSON 深比较、
 * TOML/文本按行集合比较），列出「基线有、现在没有」的键与行。
 * 这类文件数量少、语义关键，适合全量核对。
 *
 * 用法：node silent-revert.mjs <baseCommit> <headCommit>
 */
import { execFileSync } from "node:child_process";

const [, , base = "0dcc90658", head = "HEAD"] = process.argv;

// 配置 / 构建 / 身份 / 打包类文件——这些地方的一行改动都可能改变产品行为
const FILES = [
	"apps/examples/desktop-app/src-tauri/tauri.conf.json",
	"apps/examples/desktop-app/package.json",
	"apps/examples/desktop-app/src-tauri/Cargo.toml",
	"apps/examples/desktop-app/src-tauri/src/main.rs",
	"apps/examples/desktop-app/next.config.mjs",
	"apps/examples/desktop-app/webview/next.config.mjs",
	"apps/examples/desktop-app/.gitignore",
	".gitignore",
	"package.json",
	"bun.lock",
	"apps/examples/desktop-app/CHANGELOG.md",
];

function show(ref, file) {
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

/** 展平 JSON 为 path -> value，便于逐键对比 */
function flatten(obj, prefix = "", out = new Map()) {
	if (obj && typeof obj === "object" && !Array.isArray(obj)) {
		for (const [k, v] of Object.entries(obj)) {
			flatten(v, prefix ? `${prefix}.${k}` : k, out);
		}
	} else {
		out.set(prefix, JSON.stringify(obj));
	}
	return out;
}

let problems = 0;
for (const file of FILES) {
	const a = show(base, file);
	const b = show(head, file);
	if (a === null && b === null) continue;
	if (a === null) {
		console.log(`\n${file}  ⚠ 基线不存在，现存在`);
		problems++;
		continue;
	}
	if (b === null) {
		console.log(`\n${file}  🔴 现已删除（基线存在）`);
		problems++;
		continue;
	}
	if (file.endsWith(".json")) {
		let ja, jb;
		try {
			ja = JSON.parse(a);
			jb = JSON.parse(b);
		} catch {
			console.log(`\n${file}  ⚠ JSON 解析失败，跳过`);
			continue;
		}
		const fa = flatten(ja);
		const fb = flatten(jb);
		const lost = [...fa].filter(([k]) => !fb.has(k));
		const changed = [...fa].filter(([k, v]) => fb.has(k) && fb.get(k) !== v);
		const added = [...fb].filter(([k]) => !fa.has(k));
		if (!lost.length && !changed.length && !added.length) continue;
		console.log(`\n${file}`);
		for (const [k, v] of lost) console.log(`  🔴 丢失键 ${k} = ${v.slice(0, 110)}`);
		for (const [k, v] of changed)
			console.log(`  🟡 改值 ${k}\n       基线 ${v.slice(0, 110)}\n       现值 ${fb.get(k).slice(0, 110)}`);
		if (added.length) console.log(`  🟢 新增键 ${added.length} 个（升级带来的，属正常）`);
		problems += lost.length + changed.length;
	} else {
		const la = new Set(a.split("\n").map((s) => s.trim()).filter(Boolean));
		const lb = new Set(b.split("\n").map((s) => s.trim()).filter(Boolean));
		const lost = [...la].filter((s) => !lb.has(s));
		if (!lost.length) continue;
		console.log(`\n${file}  （基线有、现无的行 ${lost.length} 条，过滤空行/纯注释后人工判读）`);
		for (const s of lost.slice(0, 40)) console.log(`  - ${s.slice(0, 130)}`);
		problems += lost.length;
	}
}
console.log(`\n合计需人工判读 ${problems} 处（base=${base} head=${head}）`);
