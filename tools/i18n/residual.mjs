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
 *   4. 【v0.2】跨行 JSX 文本块（盲区）：
 *      a) 多行 opening tag + 内部文本（例：<Tag\n  attr=...>\n  Text\n</Tag>）
 *      b) 单行 opening tag + 内部文本跨多行（例：<Tag>\n  Text\n</Tag>）
 *      由 qoder 2026-09-29 17:13 alert 提出；supervisor 17:20 派给工具维护者；
 *      coordinator 在 17:35 实现 v0.2，加入 4a/4b 两种形态。
 *
 * v0.3（2026-10-03，Cline）——修掉两类「信不过」的问题：
 *   ① 误报：单行规则只看「首字母大写」，于是把「Cline 主页」「MCP 服务器」
 *      「Cline API 密钥」「Authorization=Bearer 令牌」这类**已汉化**的
 *      「品牌名/协议名 + 中文」当残留报出来（webview 复扫 9 条里 5 条是这种）。
 *      修法：所有规则统一加 CJK 守卫 —— 串里只要含中文，就不是英文残留。
 *   ② 漏报：
 *      a) JSX 文本与插值同行（`Couldn't scan for sessions: {err}`）正则看不见；
 *      b) 以省略号/花引号结尾的三元串（`"Scanning…"`）字符集没覆盖；
 *      c) v0.2 的跨行启发式在 `<Tag ...>` 后 6 行内乱抓，误报多且仍漏上面两种。
 *      修法：JSX 文本改用 TypeScript 编译器 API 直接遍历 `JsxText` 节点
 *      （一个节点即一段用户可见文本，精确且不限行），三元字符集补全 `…’“”—`。
 *      实据：v0.3 一次就揪出 webview 8 个文件共 9 处真漏翻（见 PROGRESS B55）。
 *   ③ 判不改白名单：`tools/i18n/residual-keep.json`（每条带 reason），
 *      产品名/命令名/快捷键/单位/数据契约这类「不该翻」的命中只单独计数，
 *      不计入残留 —— 这样「残留清零」是可信的，而不是靠人记住哪些是误报。
 *
 * 用法：node tools/residual.mjs <目录>
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = process.argv[2];
if (!ROOT) {
	console.error("用法: node tools/residual.mjs <目录>");
	process.exit(1);
}

// TypeScript 编译器 API：JSX 文本规则用它做 AST 遍历（见 scanJsxTextAst）。
// 解析不到时退化为 v0.2 的正则启发式，并在结尾给出显式告警（不静默降级）。
let ts = null;
try {
	ts = createRequire(import.meta.url)("typescript");
} catch {
	ts = null;
}

// 展示类属性
const ATTR_RE =
	/\b(placeholder|title|aria-label|ariaLabel|alt|emptyText|searchPlaceholder|confirmText|cancelText|label|description|helperText|subtitle|heading)\s*=\s*"([A-Z][^"]{2,})"/g;
// 展示类属性（大小写不敏感版）。上一条以大写开头过滤是为了避开 CSS 类名，
// 但 `aria-label`/`alt`/`title`/`placeholder` 的值几乎总是展示文案，
// 大写过滤会漏掉 shadcn 样板里的 `aria-label="breadcrumb"`/`"pagination"`
// （B55 实测：ui/breadcrumb.tsx、ui/pagination.tsx 就是这么漏掉的）。
const ATTR_ANY_RE =
	/\b(placeholder|title|aria-label|ariaLabel|alt|label|description)\s*=\s*"([A-Za-z][^"]{3,})"/g;
// 三元两分支 / 对象展示值的英文短语。v0.3 起把 `:` 分支也纳入 —— 多行三元
// 的 else 分支（`: "Scanning…"`）与对象字面量（`{ label: "Last run:" }`）都落在
// `: "大写开头"` 形态上；只匹配大写开头，故 `: "flex items-center"`（三元里选
// CSS 类名）这类小写值不会误报。字符集另补全 `… ’ “ ” —` 以覆盖省略号结尾的串。
const TERNARY_RE = /(?:\?|:)\s*"([A-Z][A-Za-z0-9 ,.'!?\-—…’“”()/]{3,})"/g;
// JSX 独占行裸文本（v0.2 兜底；有 TS 时由 scanJsxTextAst 取代）
const BARE_RE = /^\s*>([A-Z][A-Za-z ,.'!?-]{3,})<\s*$/;

// 英文裸文本候选：大写开头、字母/空格/常见标点、无数字打头
const EN_BARE_RE = /^[A-Z][A-Za-z ,.'!?-]{2,}$/;

// ── 残留判据（v0.3 统一）──────────────────────────────────────────
const CJK_RE = /[\u4e00-\u9fff]/;
// 已按中文排版：出现全角标点即视为中文语境（不含花引号 —— `打开文件夹“` 那种
// 半汉化串仍要被揪出来，故 “ ” 不算「已汉化」证据）
const ZH_PUNCT_RE = /[：。，、？！；（）〔〕「」【】]/;
const LETTER_RE = /[A-Za-z]{2}/;
// 展示类键名：对象字面量里这些键的字符串值当文案候选（与 ATTR_RE 同源）
const DISPLAY_KEYS = new Set([
	"label",
	"title",
	"description",
	"placeholder",
	"ariaLabel",
	"aria-label",
	"alt",
	"heading",
	"subtitle",
	"helperText",
	"emptyText",
	"tooltip",
	"confirmText",
	"cancelText",
	"searchPlaceholder",
]);
/** 这段文本算不算「用户可见的英文残留」？ */
function isDisplayEnglish(text) {
	if (!text) return false;
	if (!LETTER_RE.test(text)) return false;
	if (CJK_RE.test(text)) return false; // 含中文 → 不是英文残留（v0.3 ①）
	if (ZH_PUNCT_RE.test(text)) return false; // 已按中文标点排版
	return true;
}

/** 展示类属性值是否算文案候选？placeholder 额外过滤「格式示例值」。 */
function isDisplayAttr(name, value) {
	if (!isDisplayEnglish(value)) return false;
	// placeholder 里大量是「照着输入的样例值」而非文案：my-provider、
	// https://api.example.com/v1、sk-...、ubuntu、automation,review、/path/to/…
	// 这类翻译后会误导用户，故要求以大写字母开头或含空格才当文案候选。
	if (name === "placeholder" && !/^[A-Z]/.test(value) && !/\s/.test(value)) {
		return false;
	}
	return true;
}

// ── 判不改白名单（v0.3 ③）────────────────────────────────────────
// 结构：[{ "path": "文件路径片段", "text": "命中文本", "reason": "为什么不翻" }]
let keepList = [];
const keepPath = join(dirname(fileURLToPath(import.meta.url)), "residual-keep.json");
if (existsSync(keepPath)) {
	try {
		keepList = JSON.parse(readFileSync(keepPath, "utf8"));
	} catch (error) {
		console.error(`✗ 白名单解析失败：${keepPath}\n  ${error.message}`);
		process.exit(2);
	}
}

/**
 * 命中白名单？返回对应 reason，否则 null。
 * 同时用「相对路径」和「仓库内绝对路径」匹配，这样从不同目录起扫
 * （扫 webview 还是扫 apps/examples/desktop-app）都能命中同一条判据。
 */
function keepReason(relPath, absPath, text) {
	const rel = relPath.replace(/\\/g, "/");
	const abs = absPath.replace(/\\/g, "/");
	for (const entry of keepList) {
		if (!rel.includes(entry.path) && !abs.includes(entry.path)) continue;
		if (entry.text && entry.text !== text) continue;
		if (entry.textPrefix && !text.startsWith(entry.textPrefix)) continue;
		return entry.reason ?? "判不改（白名单）";
	}
	return null;
}

/** 条件分支常被写成 `cond ? … : ("Approve")`，要剥掉括号才是字面量。 */
function unwrapParens(node) {
	let cur = node;
	while (
		cur &&
		(ts.isParenthesizedExpression(cur) ||
			ts.isAsExpression(cur) ||
			ts.isTypeAssertionExpression?.(cur))
	) {
		cur = cur.expression;
	}
	return cur;
}

// ── JSX 文本扫描（v0.3 主规则，AST）──────────────────────────────
// 为什么要 AST：JSX 里一段用户可见文本 = 一个 `JsxText` 节点。用编译器 API
// 直接遍历，既能拿到「文本 + 同行插值」的形态（`Couldn't scan for sessions: {err}`
// 的 JsxText 就是 "Couldn't scan for sessions: "），也不会像跨行启发式那样乱抓。
// 同一行多段文本会分别成为独立节点，因此不需要再按行去重。
function scanJsxTextAst(file, content) {
	const hits = [];
	const sf = ts.createSourceFile(
		file,
		content,
		ts.ScriptTarget.ESNext,
		/* setParentNodes */ true,
		ts.ScriptKind.TSX,
	);
	const visit = (node) => {
		const lineOf = (n) =>
			sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
		if (ts.isJsxText(node)) {
			const text = node.text.replace(/\s+/g, " ").trim();
			if (isDisplayEnglish(text)) {
				hits.push([lineOf(node), "JSX 文本", text]);
			}
		}
		// v0.3：JSX 子节点/属性表达式位置上的字符串字面量 `{ "Approve" }`。
		// 这类写法在条件式里极常见（`{pending ? <Spinner/>… : "Approve"}`），
		// 只扫 JsxText 完全看不见。要求大写开头，避开 `{cn("flex …")}` 之类。
		if (
			ts.isJsxExpression(node) &&
			node.expression && // `{/* 注释 */}` 形态的 JsxExpression 没有 expression
			ts.isStringLiteral(node.expression) &&
			/^[A-Z]/.test(node.expression.text) &&
			isDisplayEnglish(node.expression.text)
		) {
			hits.push([lineOf(node), "JSX 表达式", node.expression.text]);
		}
		// v0.3：条件表达式两分支的字符串字面量。格式化工具常把
		// `{a ? x : "Approve"}` 拆成多行，此时 `:` 与串不在同一行，
		// 正则的 `: "..."` 规则抓不到（agent-approval-card 就是这样漏的）。
		if (ts.isConditionalExpression(node)) {
			for (const raw of [node.whenTrue, node.whenFalse]) {
				const branch = unwrapParens(raw);
				if (
					branch &&
					ts.isStringLiteral(branch) &&
					/^[A-Z]/.test(branch.text) &&
					isDisplayEnglish(branch.text)
				) {
					hits.push([lineOf(branch), "三元", branch.text]);
				}
			}
		}
		// v0.3：展示类键的对象字面量取值（`label: "Copy message"`），
		// 补「键与值被格式化拆到两行」的形态。只认展示类键名，
		// 避免把 `{ type: "text", text: … }` 这类数据字段算成文案。
		if (ts.isPropertyAssignment(node)) {
			const key = node.name.getText(sf);
			if (DISPLAY_KEYS.has(key) && ts.isStringLiteral(node.initializer)) {
				const value = node.initializer.text;
				if (/^[A-Z]/.test(value) && isDisplayEnglish(value)) {
					hits.push([lineOf(node), `键 ${key}`, value]);
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return hits;
}

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
			// dist/ 是构建产物（dist 里全是 .d.ts，会把同一份文案重复报一遍）
			if (["node_modules", ".next", "out", ".git", "dist", "tmp"].includes(e)) continue;
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
let keptTotal = 0;
const rows = [];
const keptRows = [];

for (const f of files) {
	const rel = relative(ROOT, f);
	const content = readFileSync(f, "utf8");
	const lines = content.split(/\r?\n/);
	const hits = [];

	// 单行规则（属性 / 三元）——v0.3 起统一过 isDisplayEnglish 判据
	lines.forEach((line, i) => {
		// 跳过 import / 注释行
		if (/^\s*(import|export)\s|^\s*\/\//.test(line)) return;
		let m;
		ATTR_RE.lastIndex = 0;
		while ((m = ATTR_RE.exec(line)) !== null) {
			if (!isDisplayAttr(m[1], m[2])) continue;
			hits.push([i + 1, `属性 ${m[1]}`, m[2]]);
		}
		ATTR_ANY_RE.lastIndex = 0;
		while ((m = ATTR_ANY_RE.exec(line)) !== null) {
			if (!isDisplayAttr(m[1], m[2])) continue;
			hits.push([i + 1, `属性 ${m[1]}`, m[2]]);
		}
		TERNARY_RE.lastIndex = 0;
		while ((m = TERNARY_RE.exec(line)) !== null) {
			if (!isDisplayEnglish(m[1])) continue;
			hits.push([i + 1, "三元", m[1]]);
		}
	});

	// JSX 文本规则：优先 AST（v0.3 主规则），拿不到 typescript 时退化到
	// v0.2 的「独占行 + 跨行」正则启发式，并在结尾显式告警。
	if (ts) {
		hits.push(...scanJsxTextAst(f, content));
	} else {
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (/^\s*(import|export)\s|^\s*\/\//.test(line)) continue;
			const b = line.match(BARE_RE);
			if (b && isDisplayEnglish(b[1])) hits.push([i + 1, "裸文本", b[1]]);
		}
		hits.push(...scanCrossLineJSX(lines));
	}

	const uniq = dedupe(hits);
	// 白名单分流：judged-keep 的命中单独计数，不计入残留
	const residual = [];
	const kept = [];
	for (const hit of uniq) {
		const reason = keepReason(rel, f, hit[2]);
		if (reason) kept.push([...hit, reason]);
		else residual.push(hit);
	}
	if (residual.length) {
		total += residual.length;
		rows.push([rel, residual]);
	}
	if (kept.length) {
		keptTotal += kept.length;
		keptRows.push([rel, kept]);
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

// 判不改（白名单）单列 —— 供审查：每条都带 reason，改了白名单就等于改了判据
keptRows.sort((a, b) => b[1].length - a[1].length);
if (keptTotal) {
	console.log(`\n判不改（白名单命中）${keptTotal} 条 / ${keptRows.length} 个文件：`);
	for (const [f, hits] of keptRows) {
		console.log(`  ${f}  (${hits.length})`);
		for (const [line, kind, text, reason] of hits.slice(0, 12)) {
			console.log(`    L${line} [${kind}] ${text}  — ${reason}`);
		}
		if (hits.length > 12) console.log(`    ...(共 ${hits.length} 条)`);
	}
}
if (!ts) {
	console.log(
		"\n⚠ 未加载 typescript，JSX 文本规则退化为 v0.2 正则启发式（可能漏报/误报）；" +
			"请在仓库根目录（node_modules 可见处）运行。",
	);
}