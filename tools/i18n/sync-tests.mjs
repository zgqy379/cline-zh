#!/usr/bin/env node
/**
 * 测试断言同步器。
 *
 * 背景：汉化 UI 后，`expect(x.textContent).toBe("Copy message")` 这类
 * 用英文原文做断言的测试会全部失败。手工同步 60+ 处极易漏改，
 * 且漏改会让 CI 红掉、掩盖真实问题。
 *
 * 做法：合并 tools/maps/ 下所有映射表（它们就是事实上的词典），
 * 扫描测试文件里被引号包裹的断言字面量，做精确整词替换。
 *
 * 只改「双引号包裹的完整字面量」，与 apply-zh.mjs 的安全策略一致：
 *   - 不会碰到 import 路径、变量名、CSS 类名
 *   - 不会碰到 `toBeTruthy()` 之类不含文案的结构
 *
 * 用法：
 *   node tools/sync-tests.mjs            # 预览
 *   node tools/sync-tests.mjs --write    # 写入
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative, basename, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WRITE = process.argv.includes("--write");
// ⚠️ 这里原本只扫 webview/components，因此 webview/lib 与 webview/hooks
// 下的测试从不会被同步（例如 desktop-notifications.test.ts、
// run-error.test.ts、hooks/chat-session/helpers.test.ts 全部漏掉，
// 导致汉化后 11 个测试红）。改为扫整个 webview。
// 路径一律相对脚本自身解析，clone 到任意机器都能直接跑。
// 2026-10-08 opencode 对抗审查发现本脚本此前硬编码了
// D:/cline-zh/... 与 D:/cline-zh/tools/maps（仓外那份），导致仓内副本
// 仍然依赖本机目录，换机器即失效。
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const WEBVIEW = join(REPO_ROOT, "apps", "examples", "desktop-app", "webview");
const MAPS_DIR = join(dirname(fileURLToPath(import.meta.url)), "maps");

/**
 * ⛔ 禁译清单：这些字符串在测试里是**枚举值/参数**，不是显示文案。
 *
 * 典型场景（agent-sidebar.test.tsx）：
 *   expect(onSettingsSectionChange).toHaveBeenCalledWith("Schedules");
 * 这里 "Schedules" 是传给回调的分区 id，源码侧我们保留了英文枚举，
 * 断言就必须是英文。若跟着 UI 一起汉化，测试会假失败。
 *
 * 判定规则：出现在 `toHaveBeenCalledWith(...)` / `toHaveBeenCalled(...)` /
 * `toEqual({ ... id: "X" })` 等「传参断言」中的字符串，一律不译。
 * 只译 `toBe(...)` / `textContent` / `aria-label` / `title` 等「显示断言」。
 */
const PROTECTED = new Set([
	"Schedules",
	"Customize",
	"Settings",
	"Repository",
	"Workspace",
	"Branch",
	"Provider",
	"Model",
	"Tokens",
	"Cost",
	"Delete",
	"Run",
	"Tasks",
	"Pinned",
	"Scheduled",
	// "Recommended" 是测试里守卫「行内推荐徽标不回归」的断言词（上游原词面）。
	// 若译成「推荐」会与 Suggested 分区标题「推荐」撞词，断言反而恒红。
	// 2026-10-07 zcode 在 0.0.43 接管批次中追加。
	"Recommended",
	// 以下为 SettingsSection/CustomizationSection 等**枚举值**（测试把它们当
	// props/期望值传入，组件按英文枚举匹配）。0.0.43 接管批次中
	// "Account"→「账户」、"Marketplace"→「市场」曾破坏 agent-sidebar 测试。
	"Account",
	"Marketplace",
	"General",
	// "Continue" 是 use-chat-session.test.tsx 里 12 处**消息内容夹具**
	// （模拟用户发来一句 "Continue"），不是界面文案。
	// 界面侧的 Continue 早已全部汉化（chat-messages.tsx L884、onboarding-view.tsx L613、
	// onboarding-github-step.tsx L273、chat-session.ts L537 的 MISTAKE_LIMIT 答案均为「继续」），
	// 所以词典里的 Continue → 继续 只会在夹具上误伤。
	// 2026-10-08 opencode 对抗审查追加。
	"Continue",
	// ---- 以下为 2026-09-29 补充（P0-2.3 复发后追加）----
	// "run" 曾两次被误译成「次运行」。根因：禁译清单里写的是 "Run"（首字母大写，
	// 那是菜单标签），而测试里出现的是 "run"（全小写，是数据契约值），
	// 大小写不同 => 黑名单漏放。
	// 现在改为**双向兜底**：小写形态也一并禁译，且下方的白名单校验会二次拦截。
	"run",
	"message",
	"tools",
	"item",
	"user",
	"assistant",
	"think",
	"reasoning",
	"command",
	"write",
	"read",
	"new",
	"pending",
	"done",
	"idle",
	"active",
	"inactive",
	"plain",
	"markdown",
	// 系统声音名：要作为参数传给 Tauri 的 play_sound，不是显示文案。
	// 曾被 sync-tests 误译成「默认」，导致 notify 传参对不上而测试红。
	"Default",
	"Ping",
	"message-new-instant",
	// 测试自造的输入数据：sendPrompt 的参数 / fixture 的 prompt / content。
	// 它们不是 UI 文案（界面上根本不显示），翻译会改变测试语义。
	// 曾把 sendPrompt("Retry") 误译成「重试」，导致队列断言错位。
	"Retry",
	"First prompt",
	"Other prompt",
	"queued-retry",
]);

// 附加断言：以下形态出现时，即使字符串不在 PROTECTED 也不译。
// 这些位置装的一定是「数据/结构」而非「给人看的文字」。
const STRUCTURAL_RE =
	/\.type\s*(?:!==|===|==)\s*"|\.\w+\s*(?:!==|===)\s*"|\btype:\s*"|\bid:\s*"|\bkey:\s*"|toEqual\(\s*\[|toStrictEqual\(\s*\[|\.map\(\(?\w+\)?\s*=>\s*\w+\.type/;

// 大小写无关比较，避免 "Run" / "run" 这类形态绕过禁译清单
const lower = (s) => String(s).toLowerCase();

// 传参类断言：这些调用里的字符串不译
const PARAM_ASSERT_RE =
	/\.(toHaveBeenCalledWith|toHaveBeenCalled|toHaveBeenLastCalledWith|toHaveBeenNthCalledWith)\([^)]*\)/g;
// 命中这些位置的字符串视为「传参」，跳过
function isParamAssertion(line) {
	return PARAM_ASSERT_RE.test(line);
}

// 1. 合并所有映射表
const dict = new Map();
for (const f of readdirSync(MAPS_DIR)) {
	if (!f.endsWith(".json")) continue;
	const obj = JSON.parse(readFileSync(join(MAPS_DIR, f), "utf8"));
	for (const [en, zh] of Object.entries(obj)) {
		if (!en.startsWith("__") && typeof zh === "string") dict.set(en, zh);
	}
}
console.log(`合并映射表：${dict.size} 条文案\n`);

// 2. 收集测试文件
const tests = [];
function walk(dir) {
	for (const e of readdirSync(dir)) {
		const full = join(dir, e);
		const st = statSync(full);
		if (st.isDirectory()) {
			if (["node_modules", ".next", "out", ".git"].includes(e)) continue;
			walk(full);
		} else if (
			[".ts", ".tsx"].includes(extname(e)) &&
			/\.test\.|\.spec\./.test(e)
		) {
			tests.push(full);
		}
	}
}
walk(WEBVIEW);
console.log(`测试文件：${tests.length} 个\n`);

// 3. 逐文件逐行替换
//
// 性能说明：早先是「每行 × 685 条词典」的双重循环，扫描范围扩大到整个
// webview 后跑到超时。改为先提取行内的引号字面量，再与词典比对，
// 复杂度从 O(行数 × 词典) 降到 O(字面量数)。
let total = 0;
const report = [];
const protectedLower = new Set([...PROTECTED].map(lower));
const LITERAL_RE = /(["'])([^"'\n]{2,})\1/g;

for (const f of tests) {
	const lines = readFileSync(f, "utf8").split(/\r?\n/);
	let hit = 0;
	const applied = [];
	for (let i = 0; i < lines.length; i++) {
		let line = lines[i];
		if (!/["']/.test(line)) continue;
		// 传参断言行：字符串是枚举/参数，跳过
		if (isParamAssertion(line)) continue;
		// 结构化比较行（.type === "x" / toEqual([...]) / id: "x"）：
		// 这里的字符串是数据契约，整行跳过。这是 P0-2.3 二次复发的直接补丁。
		if (STRUCTURAL_RE.test(line)) continue;

		// 收集本行出现过的字面量
		const literals = new Set();
		let m;
		LITERAL_RE.lastIndex = 0;
		while ((m = LITERAL_RE.exec(line)) !== null) literals.add(m[2]);

		for (const lit of literals) {
			if (protectedLower.has(lower(lit))) continue;
			const zh = dict.get(lit);
			if (!zh) continue;
			for (const q of ['"', "'"]) {
				const needle = q + lit + q;
				if (!line.includes(needle)) continue;
				const c = line.split(needle).length - 1;
				line = line.split(needle).join(q + zh + q);
				hit += c;
				applied.push(`${lit} → ${zh}`);
			}
		}
		lines[i] = line;
	}
	if (hit > 0) {
		if (WRITE) writeFileSync(f, lines.join("\n"), "utf8");
		total += hit;
		report.push({ f: basename(f), hit, applied });
		console.log(`· ${basename(f)}: ${hit} 处${WRITE ? "已更新" : "待更新"}`);
	}
}

console.log(`\n合计：${total} 处断言${WRITE ? "已同步" : "待同步"}`);
if (report.length) {
	console.log("\n明细：");
	for (const r of report) {
		console.log(`\n${r.f}:`);
		for (const a of r.applied) console.log(`   ${a}`);
	}
}
if (!WRITE && total > 0) console.log("\n提示：加 --write 真正写入。");
