// check-consistency.mjs — 对双语对跑确定性质量规则
// 用法: node check-consistency.mjs <pairsJson> <outJson>
// 规则: R1 EN→ZH 多义冲突 | R2 GLOSSARY 偏离 | R3 半角标点 | R4 复数残留
//       R5a CJK 紧贴**字面量**拉丁（真缺空格）| R5b CJK 紧贴**插值边界**（风格约定，非缺陷）
//
// ⚠️ 降噪设计（B46）：pairs.json 由 collect-pairs.mjs 从 git diff **按 hunk 内出现顺序**
// 配对 EN↔ZH，而 extract() 是逐行正则，所以「同一 EN 对上多个 ZH」有相当比例是**提取噪声**
// 而非真术语漂移。B41 分诊实测 R1 153 条里约 140 条是测试选择器噪声。真噪声集中在三类：
//   ① CSS/JSX 属性选择器片段当成了英文文案（`[aria-label=`、`button[aria-label=`…83 条）
//   ② WAI-ARIA / data-* 属性名、Tailwind 类名（`aria-label`、`text-muted-foreground/70`）
//   ③ 跨行 JSX 被打包成一串，EN 侧取到了 className 或整行代码（`>命令：</span>{`）
// 本版做法：**不静默丢弃**——噪声走 `suppressed` 桶并附原因与样本，可审计、可回溯。
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [pairsPath, outPath] = process.argv.slice(2);
const SELFTEST = process.argv.includes("--selftest");
// 脚本位于 <repo>/tools/i18n/，上溯两级即仓库根；GLOSSARY 在仓库 docs/ 下。
const REPO = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
);
const GLOSSARY = process.env.GLOSSARY || path.join(REPO, "docs", "GLOSSARY.md");
// 自检模式不读输入文件（闸门函数在下方定义，故只延后读文件、提前记录标志）
const pairs = SELFTEST ? [] : JSON.parse(readFileSync(pairsPath, "utf8"));
const CJK = "[\\u4e00-\\u9fff]";
const INTERP = /\$\{[^}]*\}/g;

// ---------------------------------------------------------------- 噪声闸门
// 设计原则：**判据必须窄到不误伤正常文案**。
// 反例（2026-10-01 踩到）：初版把「ZH 以 `}`/`)` 结尾」当噪声，一次扔掉 110 条
// `未找到会话 ${sessionId}` 这类完全正常的模板串。模板串天然以 `}` 结尾，不是缺陷形态。
const suppress = { R1: [], R2: [], R3: [], R4: [] };
const bump = (rule, p, why) => suppress[rule].push({ file: p.file, line: p.line, en: p.en, zh: p.zh, why });

/** EN 侧是不是「一句用户可见的散文」？挡掉选择器片段 / 属性名 / 类名 / 代码表达式。 */
function enNoiseReason(en) {
	if (!en) return "EN 缺失（collect-pairs 未配上，靠 maps/ 反查也未命中）";
	const raw = en.trim();
	// 骨架：去掉插值后再判形态，避免 `${...}` 里的内容影响判断
	const s = raw.replace(INTERP, " ").replace(/\s+/g, " ").trim();
	if (!s) return "EN 只剩插值，无可比对的文案";
	// ① CSS / JSX 属性选择器片段：`[aria-label=`、`button[aria-label=`、`<div[title^=`、`][x=`
	//    散文里不会出现 ASCII 方括号，故此判据不会误伤。
	if (/[[\]]/.test(raw)) return "EN 是 CSS/JSX 属性选择器片段，非文案";
	// ② WAI-ARIA / data-* / xml-* 属性名
	if (/^(aria|data|xml)[-_]/i.test(s)) return "EN 是属性名（ARIA/data-*/xml-*），非文案";
	if (/^(aria|data|xml)[A-Z]/.test(s)) return "EN 是 camelCase 的 ARIA/data-* 属性名，非文案";
	// ③ Tailwind / CSS 类名片段（类名前缀 + `-`，且整串无空格）
	if (!/\s/.test(s) && /^(text|bg|border|flex|grid|inline|block|hidden|rounded|font|gap|items|justify|overflow|absolute|relative|fixed|sticky|ring|shadow|opacity|transition|transform|from|via|to|hover|focus|active|group|peer|dark|sm|md|lg|xl)-/.test(s))
		return "EN 是 CSS/Tailwind 类名，非文案";
	// ④ 代码表达式 / 导入语句（只列 UI 文案绝不会出现的形态）
	if (/\|\||\?\?|=>|\bimport\s|\brequire\(|\bfunction\s|\bexport\s|\.(map|filter|reduce|forEach)\(/.test(s))
		return "EN 是代码表达式，非文案";
	// ⑤ JSX 标签名泄漏
	if (/<\/?[A-Za-z]/.test(raw)) return "EN 含 JSX 标签片段，非文案";
	// ⑥ kebab-case 标识符（agent-plugins-example 之类）
	if (/^[a-z]+(-[a-z0-9]+)+$/.test(s)) return "EN 是 kebab-case 标识符，非文案";
	return null;
}

/** ZH 侧是不是被跨行 JSX 打包污染了？（`>命令：</span>{` 这类） */
function zhNoiseReason(zh) {
	const s = zh ?? "";
	// ① 混进 JSX 标签（跨行文本节点被打包：`<>命令：</span>{`）
	if (/<\/?[A-Za-z]/.test(s)) return "ZH 含 JSX 标签片段（跨行文本被打包）";
	// ② 提取时从插值中间截断（原文以 `)` 开头，如 `)?.replace(/^切换 /,`）
	//    注意只判「开头」，不判结尾——模板串以 `}`/`)` 结尾是正常的。
	if (/^[)\]}]/.test(s)) return "ZH 开头是表达式括号（提取截断）";
	return null;
}

const enOk = (p) => {
	const r = enNoiseReason(p.en);
	if (r) { bump("R1", p, r); return false; }
	return true;
};
const zhOk = (p, rule) => {
	const r = zhNoiseReason(p.zh);
	if (r) { bump(rule, p, r); return false; }
	return true;
};

// ---- GLOSSARY 解析 ----
// ⚠️ 术语表单元格不只是词条本身，常带括号写用法示例：
//    `Team task | 团队任务（已分配 N 项团队任务）`
//    若拿整串做匹配，`项团队任务` 这种正确译法永远判不出「包含」⇒ 误报。
//    故把括号内外都拆成可接受变体。
const splitGlossaryCell = (cell) => {
	const out = [];
	for (const seg of cell.split(/[/、；;]/)) {
		const s = seg.trim();
		if (!s) continue;
		out.push(s);
		// 括号内容本身也是合法译法（用法示例）
		for (const m of s.matchAll(/[（(]([^（()）]+)[)）]/g)) {
			const inner = m[1].trim();
			if (inner) out.push(inner);
		}
		// 括号前的词条主体
		const head = s.split(/[（(]/)[0].trim();
		if (head && head !== s) out.push(head);
	}
	return [...new Set(out)];
};
const glossary = []; // {en, zh:[变体]}
try {
	const g = readFileSync(GLOSSARY, "utf8");
	for (const line of g.split("\n")) {
		const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
		if (!m || m[1] === "英文" || /^-+$/.test(m[1])) continue;
		if (!/[A-Za-z]/.test(m[1])) continue;
		glossary.push({ en: m[1].trim(), head: m[2].split(/[（(]/)[0].trim(), zh: splitGlossaryCell(m[2]) });
	}
} catch {}

const normEn = (s) => (s ?? "").replace(/\$\{[^}]*\}/g, "{}").replace(/\s+/g, " ").trim().toLowerCase();
const normZh = (s) => (s ?? "").replace(/\$\{[^}]*\}/g, "{}").trim();

const findings = [];
const add = (rule, sev, p, detail) =>
	findings.push({ rule, sev, file: p.file, line: p.line, kind: p.kind, prop: p.prop, en: p.en, zh: p.zh, detail });

// ---- R1: 同一 EN 不同 ZH（先过噪声闸门，再按 EN 分组） ----
// ⚠️ 测试文件是**消费方**不是文案源：断言里的串往往是多个渲染标签的拼接
// （如 chat-input-bar.test.tsx 的 `上下文窗口500.5k / 1.0M (50%)`），
// 拿它跟产品源码比「同源英文多译法」必然误报。故：只有**两侧都是产品源码**的组
// 才算 R1（术语漂移，闸门级）；掺了测试文件的降到 R1t（仅提示断言可能已漂移）。
const isTestFile = (p) => /(^|\/)(tests?\/)|\.(test|spec|stories)\.[jt]sx?$/.test(p.file);
const byEn = new Map();
for (const p of pairs) {
	if (!p.en) continue;
	if (!enOk(p)) continue; // ① EN 侧噪声：整条不进 R1
	if (!zhOk(p, "R1")) continue; // ③ ZH 侧被跨行 JSX 污染
	const k = normEn(p.en);
	if (!k) continue;
	if (!byEn.has(k)) byEn.set(k, []);
	byEn.get(k).push(p);
}
let r1 = 0, r1t = 0;
for (const [k, group] of byEn) {
	const variants = new Set(group.map((p) => normZh(p.zh)));
	if (!(variants.size > 1 && group.length >= 2)) continue;
	const srcCount = group.filter((p) => !isTestFile(p)).length;
	const rule = srcCount >= 2 ? "R1-术语不一致" : "R1t-断言可能漂移";
	if (rule === "R1-术语不一致") r1++;
	else r1t++;
	for (const p of group)
		add(
			rule,
			rule === "R1-术语不一致" ? "high" : "low",
			p,
			`同源英文「${p.en}」在别处译作「${[...variants].filter((v) => v !== normZh(p.zh)).join("」「")}」` +
				(rule === "R1t-断言可能漂移" ? "（该组含测试文件，仅提示断言与源码可能已不同步）" : ""),
		);
}

// ---- R2: GLOSSARY 偏离 ----
const gmap = new Map(glossary.map((g) => [g.en.toLowerCase(), g]));
let r2 = 0;
for (const p of pairs) {
	if (!p.en) continue;
	const g = gmap.get(p.en.trim().toLowerCase());
	if (!g) continue;
	if (!zhOk(p, "R2")) continue;
	const zh = normZh(p.zh).replace(/[。.!！]?$/, "");
	const ok = g.zh.some((v) => zh === v || zh.includes(v));
	if (!ok) {
		r2++;
		add("R2-GLOSSARY偏离", "medium", p, `术语表规定「${g.en}」→「${g.head}」（括号内为用法示例：${g.zh.filter((v) => v !== g.head).join("/") || "无"}），此处为「${p.zh}」`);
	}
}

// ---- R3: 半角标点紧贴 CJK ----
let r3 = 0;
for (const p of pairs) {
	const core = p.zh.replace(INTERP, ""); // 插值里的内容不算
	const m = core.match(new RegExp(`${CJK}[,;:!?]|[,;:!?]${CJK}|${CJK}\\.\\.\\.`));
	if (m) {
		// 排除明显代码语境（串里含 http / 路径 / = ）
		if (/https?:|\/|\.(ts|js|json|com)\b|=/.test(p.zh)) continue;
		if (!zhOk(p, "R3")) continue;
		r3++;
		add("R3-半角标点", "medium", p, `「${m[0]}」应使用全角标点`);
	}
}

// ---- R4: 复数残留（附件s / prompt{s}） ----
let r4 = 0;
for (const p of pairs) {
	const m = p.zh.match(new RegExp(`${CJK}s(?!\\w)`)) || p.zh.match(/\{s\}/);
	if (m) {
		if (!zhOk(p, "R4")) continue;
		r4++;
		add("R4-复数残留", "high", p, `「${m[0]}」——中文无复数，疑似 pluralize 残留`);
	}
}

// ---- R5: CJK↔拉丁无空格 —— 拆成两类（B46 修掉「${…}→X 而 X 是拉丁字母」这个根因） ----
// R5a 真缺陷：CJK 紧贴**同一串里的字面量**拉丁/数字（「已读取3files」「模型ID」）。
//      判据：把插值替换成哨兵 \u0000（**非拉丁**），哨兵两侧不算「拉丁紧贴」。
// R5b 非缺陷：CJK 紧贴**插值边界**（「搜索${title}」「当前为${深色}」）——渲染结果由插值内容
//      决定，加空格反而可能错（B41 已裁定多数不加，且属风格约定，需 human 拍板）。
// 两者都只统计**产品源码**：测试断言里的是多个渲染标签的拼接（`上下文窗口500.5k / 1.0M`），
// 不是可翻译的文案，计进去只会稀释信号。
let r5a = 0, r5b = 0;
const r5aSamples = [], r5bSamples = [];
const SENTINEL = "\u0000";
for (const p of pairs) {
	if (isTestFile(p)) continue;
	// R5a：插值 → 非拉丁哨兵
	const coreA = p.zh.replace(INTERP, SENTINEL);
	const hitA = coreA.match(new RegExp(`${CJK}[A-Za-z0-9]|[A-Za-z0-9]${CJK}`, "g"));
	if (hitA) {
		r5a++;
		if (r5aSamples.length < 20)
			r5aSamples.push({ zh: p.zh, file: p.file.split("/").pop(), line: p.line, m: hitA.slice(0, 3).join(" ") });
	}
	// R5b：CJK 紧贴插值边界。判据必须**排除已有空格**的情形——
	//      `未找到会话 ${id} 的消息`（前后都有空格）是正确写法，不是缺陷。
	//      ⚠️ 这里踩过一次：用 `\\}\\s*${CJK}` 会把「有空格」和「无空格」一起命中，
	//      98 条里大部分根本没问题。改成三种「真的贴住」的形态。
	const hitB = p.zh.match(
		new RegExp(`${CJK}\\$\\{|\\}\\$\\{|\\}\\${CJK}|\\}\\$\\{|\\}\\n|\\}\\t`, "g"),
	);
	if (hitB) {
		r5b++;
		if (r5bSamples.length < 20)
			r5bSamples.push({ zh: p.zh, file: p.file.split("/").pop(), line: p.line, m: hitB.slice(0, 3).join(" ") });
	}
}

// ---------------------------------------------------------------- 自检
// 用法: node check-consistency.mjs --selftest
// 按 §6.6「判定器本身要有测试」：噪声闸门一旦收窄过头就会静默吃掉真文案，
// 所以把「必须放行」和「必须拦下」两侧都钉死。
if (SELFTEST) {
	const ALLOW_EN = [
		"New session", "Delete session", "Save changes", "Waiting for browser...",
		"Search ${pageDetails.title}", "Get a ${provider.name} API key",
		"Choose PNG, JPEG, GIF, or WebP images, or switch to Local to attach other files.",
		"Task completed", "Approval needed", "All providers", "Not configured",
		"Pull request status", "What would you like to build?", "alpha session 1",
		"Expand sidebar", "Add Provider", "Team task",
	];
	const BLOCK_EN = [
		["[aria-label=", "CSS 选择器"],
		["button[aria-label=", "CSS 选择器"],
		["input[placeholder=", "CSS 选择器"],
		["][aria-label=", "CSS 选择器"],
		["[aria-label^=", "CSS 选择器"],
		["aria-current", "ARIA 属性名"],
		["aria-label", "ARIA 属性名"],
		["data-testid", "data-* 属性名"],
		["text-muted-foreground/70", "Tailwind 类名"],
		["agent-plugins-example", "kebab 标识符"],
		["result.stderr || result.stdout,", "代码表达式"],
		["${schedule.name}", "裸插值"],
	];
	// ZH 侧：**模板串天然以 `}` 结尾**，判据收窄过一次，这里钉死防回退
	const ALLOW_ZH = [
		"未找到会话 ${sessionId}", "至少需要选择一个 { tool, sourceId }",
		"Cline API 请求失败：${error instanceof Error ? error.message : String(error)}",
		"没有匹配“${query.trim()}”的连接器。", "「${schedule.name}」已加入队列，将立即运行。",
	];
	const BLOCK_ZH = [
		[">命令：</span>{", "JSX 标签片段"],
		[")?.replace(/^切换 /,", "提取截断"],
	];
	let fail = 0;
	for (const en of ALLOW_EN) {
		const r = enNoiseReason(en);
		if (r) { console.error(`FAIL 误杀 EN: <${en}> —— ${r}`); fail++; }
	}
	for (const [en, why] of BLOCK_EN) {
		if (!enNoiseReason(en)) { console.error(`FAIL 漏放 EN: <${en}>（应为${why}）`); fail++; }
	}
	for (const zh of ALLOW_ZH) {
		const r = zhNoiseReason(zh);
		if (r) { console.error(`FAIL 误杀 ZH: <${zh}> —— ${r}`); fail++; }
	}
	for (const [zh, why] of BLOCK_ZH) {
		if (!zhNoiseReason(zh)) { console.error(`FAIL 漏放 ZH: <${zh}>（应为${why}）`); fail++; }
	}
	// R5a/R5b 判据
	const r5aHit = (zh) => zh.replace(INTERP, "\u0000").match(new RegExp(`${CJK}[A-Za-z0-9]|[A-Za-z0-9]${CJK}`, "g"));
	for (const [zh, want] of [
		["模型ID", true], ["已读取3files", true], ["上下文窗口500.5k", true],
		["按${tag}筛选", false], ["搜索${title}", false], ["未找到会话 ${sessionId}", false],
		["获取 ${name} API 密钥", false], ["当前为${深色}", false],
	]) {
		const got = !!r5aHit(zh);
		if (got !== want) { console.error(`FAIL R5a 判据: <${zh}> 期望 ${want} 实得 ${got}`); fail++; }
	}
	// R2 判据：GLOSSARY 单元格带括号用法示例时，括号前词条与括号内容都算合法
	for (const [cell, zh, want] of [
		["团队任务（已分配 N 项团队任务）", "项团队任务", true],
		["团队任务（已分配 N 项团队任务）", "团队任务", true],
		["团队任务（已分配 N 项团队任务）", "任务小组", false],
		["新建会话", "新会话", false],
		["新建会话", "新建会话", true],
	]) {
		const variants = splitGlossaryCell(cell);
		const got = variants.some((v) => zh === v || zh.includes(v));
		if (got !== want) { console.error(`FAIL R2 判据: 单元格<${cell}> 译<${zh}> 期望 ${want} 实得 ${got}`); fail++; }
	}
	console.log(fail ? `\n❌ SELFTEST FAILED: ${fail} 项` : `\n✅ SELFTEST PASS（${ALLOW_EN.length + ALLOW_ZH.length} 放行 / ${BLOCK_EN.length + BLOCK_ZH.length} 拦下 / 8 条 R5a + 5 条 R2 判据）`);
	process.exit(fail ? 1 : 0);
}


const suppressedTotal = Object.values(suppress).reduce((a, b) => a + b.length, 0);
const summary = {
	total: pairs.length,
	R1_conflict_groups: r1,
	R1_findings: findings.filter((f) => f.rule === "R1-术语不一致").length,
	R1t_assertion_drift_groups: r1t,
	R1t_findings: findings.filter((f) => f.rule === "R1t-断言可能漂移").length,
	R2_glossary_deviation: r2,
	R3_punctuation: r3,
	R4_plural: r4,
	R5a_cjk_literal_latin_nospace: r5a,
	R5b_cjk_interp_boundary_nospace: r5b,
	// 兼容旧字段名：R5 现在只统计真缺陷（R5a）
	R5_cjk_latin_nospace: r5a,
	suppressed_pairs_by_noise_gate: suppressedTotal,
	suppressed_breakdown: Object.fromEntries(Object.entries(suppress).map(([k, v]) => [k, v.length])),
	r5_note:
		"R5 已拆两类：R5a=CJK 紧贴字面量拉丁（真缺空格，闸门级）；R5b=CJK 紧贴插值边界（风格约定，B41 裁定多数不加空格，仅统计不拦）。R5 只统计产品源码（测试断言里是多个渲染标签的拼接，不是文案）。R1/R2/R3/R4 的提取噪声走 suppressed 桶、不计入计数。",
	glossary_terms: glossary.length,
};
findings.sort((a, b) => (a.sev === b.sev ? a.rule.localeCompare(b.rule) : a.sev === "high" ? -1 : 1));
writeFileSync(
	outPath,
	JSON.stringify({ summary, findings, r5a_samples: r5aSamples, r5b_samples: r5bSamples, suppressed: suppress }, null, 1),
	"utf8",
);
console.log(JSON.stringify(summary, null, 1));
console.log(`findings -> ${outPath}`);
