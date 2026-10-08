// check-stale-assertions.mjs — 过期断言的**诊断辅助**，不是扫描器
// 用法:
//   node check-stale-assertions.mjs guard
//       列出「断言的英文在 HEAD 产品源码里仍然存在」的条目 —— 这是**护栏**：
//       源还是英文，说明没汉化过，动断言只会造假红。
//       （B52 我差点把 marketplace.test.ts 的 "Goal is already installed."
//         改成中文，源 marketplace.ts:776/829 明明还是英文，靠的就是这条。）
//
//   node check-stale-assertions.mjs explain --json=<vitest.json>
//       输入 vitest 的 JSON report，对**每一条失败用例**直接打印：
//         失败断言的字面量 + 它在 HEAD 源码里还在不在 + 在基线里在不在
//       这是真正能收敛人工排查时间的形态：过期断言必然让用例失败（或被
//       平台问题掩盖），所以**失败列表就是候选列表**，而断言与源的词面
//       对比才是判定依据。
//
// ⚠️ 为什么不做「全量静态扫描过期断言」——试过，失败了，记录在此免得重蹈：
//   ① 判据一：断言的英文「在 HEAD 源码里不存在」⇒ 噪声极大。实测 442 条里
//      绝大多数是测试专属夹具（会话标题、选择器片段、日志样本）。
//   ② 判据二：加上「但基线 41deb5d 的源码里存在」⇒ 精确度反而更差，
//      实测 9 条**全是误报**：`not.toContain` 反向断言、测试自带夹具、
//      以及源串只是变长但根本没汉化的情况。
//   ③ 召回也不够：B52 真实的 6 条一条都没抓到——3 条栽在**模板串**
//      （源 `已安装 ${name}。` 的基线形态是模板，渲染值 `Installed Goal.`
//      并非字面存在），3 条栽在字面量过滤器（单词 `Continue` 不满足
//      "≥2 个空格分隔的词"）。
//   结论：静态扫描无法可靠配对「测试断言 ↔ 源字符串」。**失败列表 + 词面比对**
//   才是可靠路径，也就是 explain 模式。
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 脚本位于 <repo>/tools/i18n/，上溯两级即仓库根；可用 REPO 环境变量覆盖。
const REPO =
	process.env.REPO ??
	join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = process.env.BASELINE ?? "41deb5d";
const argv = process.argv.slice(2);
const mode = argv.find((a) => !a.startsWith("--")) ?? "guard";
const opt = (name, dflt) => (argv.find((a) => a.startsWith(`--${name}=`)) ?? "").slice(name.length + 3) || dflt;

const SRC_ROOTS = [
	"apps/examples/desktop-app/webview",
	"apps/examples/desktop-app/sidecar",
	"sdk/packages/ui/components",
	"sdk/packages/shared/src",
];
const isTestFile = (p) => /(^|[\\/])(tests?[\\/])/.test(p) || /\.(test|spec|stories)\.[jt]sx?$/.test(p);
const toGitPath = (p) => p.split(/[\\/]/).join("/");
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "out", ".next", ".turbo", "coverage", "storybook-static"]);

function walk(dir, out = []) {
	if (!existsSync(join(REPO, dir))) return out;
	for (const entry of readdirSync(join(REPO, dir))) {
		if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
		const p = join(dir, entry);
		let st;
		try { st = statSync(join(REPO, p)); } catch { continue; }
		if (st.isDirectory()) walk(p, out);
		else if (/\.[jt]sx?$/.test(p) && !p.endsWith(".d.ts")) out.push(p);
	}
	return out;
}

// ---- 产品源码全文（不含测试）----
let srcHaystack = "";
let srcFiles = 0;
for (const root of SRC_ROOTS) {
	for (const f of walk(root)) {
		if (isTestFile(f)) continue;
		try { srcHaystack += `\n${readFileSync(join(REPO, f), "utf8")}`; srcFiles++; } catch {}
	}
}
const inSource = (raw) => {
	if (raw && srcHaystack.includes(raw)) return true;
	try {
		const d = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
		return d !== raw && srcHaystack.includes(d);
	} catch { return false; }
};

const RE_LITERAL = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

/** 抽出一行里的字面量（跳过行注释） */
function literalsIn(line) {
	const out = [];
	for (const m of line.replace(/\/\/.*$/, "").matchAll(RE_LITERAL)) out.push(m[2]);
	return out;
}

// ================================================================ guard 模式
function guard() {
	const COMPARISON_CTX = [
		/\btoBe\s*\(/, /\btoEqual\s*\(/, /\btoMatchObject\s*\(/, /\btoContain\s*\(/,
		/\btoThrow\s*\(/, /\btoHaveBeenCalledWith\s*\(/, /\bstartsWith\s*\(/, /\bendsWith\s*\(/,
		/===/, /!==/, /\.includes\s*\(/, /\btextContent\b/, /getAttribute\s*\(/, /querySelector/,
	];
	const TEST_NAME = /\b(it|test|describe)(\.each)?\s*\(/;
	const rows = [];
	let tests = 0;
	for (const root of ["apps/examples/desktop-app/webview", "apps/examples/desktop-app/sidecar", "sdk/packages/ui"]) {
		for (const f of walk(root)) {
			if (!isTestFile(f)) continue;
			let text;
			try { text = readFileSync(join(REPO, f), "utf8"); } catch { continue; }
			tests++;
			const lines = text.split("\n");
			let inName = false;
			lines.forEach((line, i) => {
				const code = line.replace(/\/\/.*$/, "").trimEnd();
				if (/\b(it|test|describe)(\.each)?\s*\($/.test(code)) { inName = true; return; }
				const skip = inName || TEST_NAME.test(code);
				if (inName && code.trim() !== "") inName = false;
				if (skip) return;
				if (!COMPARISON_CTX.some((re) => re.test(code))) return;
				for (const raw of literalsIn(code)) {
					if (!/[A-Za-z]/.test(raw) || /[\u4e00-\u9fff]/.test(raw)) continue;
					// 压掉枚举值/标识符噪声（plan / yolo / thinking / hub_command_timeout）：
					// 护栏只需提醒「可能不该动」，太短或无空格的多半是枚举。
					if (raw.length < 6 && !raw.includes(" ")) continue;
					if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(raw)) continue;
					if (inSource(raw)) rows.push({ file: toGitPath(f), line: i + 1, literal: raw });
				}
			});
		}
	}
	rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
	console.log(`guard：扫描 ${tests} 个测试文件 / 产品源码 ${srcFiles} 个文件`);
	console.log(`\n以下断言的英文在 HEAD 产品源码里仍然存在 ⇒ 源未汉化，勿改断言（${rows.length} 条）\n`);
	for (const r of rows.slice(0, Number(opt("limit", 60)))) console.log(`  ${r.file}:${r.line}  <${r.literal}>`);
	if (rows.length > Number(opt("limit", 60))) console.log(`  …（用 --limit= 调整）`);
	return rows.length === 0 ? 0 : 0; // 护栏只是提示，不作为闸门
}

// ============================================================== explain 模式
function explain() {
	const jsonPath = opt("json", "");
	if (!jsonPath) {
		console.error("用法: node check-stale-assertions.mjs explain --json=<vitest.json>");
		process.exit(2);
	}
	let report;
	try { report = JSON.parse(readFileSync(jsonPath, "utf8")); } catch (e) {
		console.error(`❌ 读不了 ${jsonPath}: ${e.message}`);
		process.exit(2);
	}
	const COMPARISON_CTX = [
		/\btoBe\s*\(/, /\btoEqual\s*\(/, /\btoMatchObject\s*\(/, /\btoContain\s*\(/,
		/\btoThrow\s*\(/, /\btoHaveBeenCalledWith\s*\(/, /\bstartsWith\s*\(/, /\bendsWith\s*\(/,
		/===/, /!==/, /\.includes\s*\(/,
	];
	const out = [];
	let n = 0;
	for (const t of report.testResults ?? []) {
		const full = t.name ?? "";                       // 绝对路径，用于读文件
		const rel = full.replace(/^.*desktop-app[\\/]/, ""); // 短路径，仅用于显示
		let text = "";
		try { text = readFileSync(full, "utf8"); } catch {}
		const lines = text.split("\n");
		for (const a of t.assertionResults ?? []) {
			if (a.status !== "failed") continue;
			n++;
			const msg = (a.failureMessages?.[0] ?? "").replace(/\x1b\[[0-9;]*m/g, "");
			const firstLine = (msg.split("\n").find((l) => l.trim()) ?? "").trim();
			// vitest 的堆栈给的是**绝对路径**：`at D:/.../foo.test.ts:669:40`。
			// 按相对路径去匹配必然失败（本工具第一版就这么写的，18 条全部"未能定位"）。
			// 改为只取文件名，再在堆栈里找 `文件名:行:列`。
			const base = rel.split(/[\\/]/).pop() || rel;
			const at = [...msg.matchAll(new RegExp(`${base.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}:(\\d+):\\d+`, "g"))]
				.map((x) => Number(x[1]))
				.find((n) => n >= 1 && n <= lines.length) ?? null;

			const cands = [];
			if (at && lines[at - 1]) {
				const code = lines[at - 1];
				if (COMPARISON_CTX.some((re) => re.test(code)))
					for (const raw of literalsIn(code)) if (/[A-Za-z]/.test(raw)) cands.push({ line: at, literal: raw });
			}
			out.push({
				file: rel,
				test: a.fullName ?? a.title,
				assertLine: at,
				assertLiterals: cands,
				stillInSource: cands.filter((c) => inSource(c.literal)).map((c) => c.literal),
				error: firstLine.slice(0, 200),
			});
		}
	}
	console.log(`explain：${n} 条失败用例\n`);
	for (const r of out) {
		const verdict = r.stillInSource.length
			? "⚠️ 断言的英文在源里仍存在 ⇒ 源未汉化，多为平台/实现差异，勿改断言"
			: r.assertLiterals.length
				? "🔎 断言的英文在源里已不存在 ⇒ 可能是过期断言，去比对源的中文词面"
				: "（未能定位到断言行）";
		console.log(`${"=".repeat(72)}\n${r.file}${r.assertLine ? `:${r.assertLine}` : ""}\n  用例: ${r.test}\n  报错: ${r.error}\n  ⇒ ${verdict}`);
		for (const c of r.assertLiterals) console.log(`     断言字面量 <${c.literal}>${inSource(c.literal) ? "  [源里仍在]" : "  [源里已无]"}`);
	}
	const o = opt("out", "");
	if (o) {
		writeFileSync(o, JSON.stringify({ failures: n, items: out }, null, 1), "utf8");
		console.log(`\njson -> ${o}`);
	}
	return 0;
}

process.exit(mode === "explain" ? explain() : guard());
