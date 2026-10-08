// capture-pages.mjs — CDP 页面巡检器：逐页导航、采集文本/属性/截图、跑运行时断言
// 用法: node capture-pages.mjs <port> <outDir>
// 断言: L1 非白名单拉丁残留 | L2 半角标点紧贴 CJK | L3 CJK+拉丁无空格拼接
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const port = process.argv[2] || "9336";
// 脚本位于 <repo>/tools/i18n/；默认输出到与本仓库同级的 build-out/qa/pages。
const outDir =
	process.argv[3] ||
	process.env.OUT_DIR ||
	resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "build-out", "qa", "pages");
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CJK = "[\\u4e00-\\u9fff]";

// —— 拉丁白名单：产品名/协议词/模型名/单位/品牌，出现不算残留 ——
const LATIN_ALLOW = new Set(
	(`Cline MCP API URL ID HTTP HTTPS SSH JSON GB MB KB ms Token ID Provider ProviderID
	cline bot.app zh-CN Pixel Canary Usage-Billing GitHub GitLab Git VS Code npm bun node
	TypeScript JavaScript Cargo Rust Python PID ID-key Agent Teams Copilot Claude GPT Gemini
	OpenRouter Anthropic OpenAI Google xAI DeepSeek Qwen Kimi GLM MiniMax Mistral Groq Ollama
	LM Studio Requesty Glama Unbound Virtual Profiles Serial bash PowerShell zsh sh CMD
	Enter Escape Tab Shift Ctrl Alt Delete Home End PageUp PageDown F1 F2 F12 Esc Enter
	free pro trial v0.0.37 Cline 中文版 Sign in Ask Claude Sonnet Haiku Opus DeepSeek R1`
	).split(/\s+/).filter(Boolean),
);

async function connect(port) {
	const res = await fetch(`http://127.0.0.1:${port}/json/list`);
	const targets = await res.json();
	const page = targets.find((t) => t.type === "page");
	if (!page) throw new Error("no page target");
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((res2, rej) => { ws.onopen = res2; ws.onerror = rej; });
	let seq = 0;
	const pending = new Map();
	ws.onmessage = (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.id && pending.has(msg.id)) {
			pending.get(msg.id).resolve(msg);
			pending.delete(msg.id);
		}
	};
	const send = (method, params = {}) =>
		new Promise((resolve) => {
			pending.set(++seq, { resolve });
			ws.send(JSON.stringify({ id: seq, method, params }));
		});
	const evalJs = async (expression) => {
		const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
		if (r.result.exceptionDetails) return { __err: (r.result.exceptionDetails.exception?.description || "").slice(0, 200) };
		return r.result.result?.value;
	};
	return { ws, send, evalJs };
}

const conn = { ws: null, seq: 0, pending: new Map() };
async function connectWs() {
	const res = await fetch(`http://127.0.0.1:${port}/json/list`);
	const targets = await res.json();
	const page = targets.find((t) => t.type === "page");
	if (!page) throw new Error("no page target");
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((res2, rej) => { ws.onopen = res2; ws.onerror = rej; });
	ws.onmessage = (ev) => {
		const msg = JSON.parse(ev.data);
		if (msg.id && conn.pending.has(msg.id)) {
			conn.pending.get(msg.id).resolve(msg);
			conn.pending.delete(msg.id);
		}
	};
	conn.ws = ws;
	await send("Page.enable").catch(() => {});
}
function send(method, params = {}) {
	return new Promise((resolve, reject) => {
		if (!conn.ws || conn.ws.readyState !== 1) return reject(new Error("ws closed"));
		const id = ++conn.seq;
		conn.pending.set(id, { resolve });
		conn.ws.send(JSON.stringify({ id, method, params }));
		setTimeout(() => {
			if (conn.pending.has(id)) {
				conn.pending.delete(id);
				reject(new Error("cdp timeout: " + method));
			}
		}, 12000);
	});
}
async function evalJs(expression) {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
			if (r.result.exceptionDetails) return { __err: (r.result.exceptionDetails.exception?.description || "").slice(0, 200) };
			return r.result.result?.value;
		} catch (e) {
			try { conn.ws?.close(); } catch {}
			await connectWs();
			if (attempt === 1) return { __err: String(e).slice(0, 120) };
		}
	}
}
await connectWs();

// —— 导航：点击含指定文本/aria 的按钮 ——
async function clickButton(match, scope = "document") {
	const r = await evalJs(`(() => {
		const root = ${scope === "document" ? "document" : "document"};
		const want = ${JSON.stringify(match)};
		const els = [...root.querySelectorAll('button,[role="button"],[role="tab"],a,li')];
		const el = els.find((e) => {
			const t = (e.innerText || "").trim();
			const a = e.getAttribute("aria-label") || "";
			return t === want || t.startsWith(want + "\\n") || a === want || t.includes(want);
		});
		if (!el) return null;
		el.scrollIntoView({ block: "center" });
		el.click();
		return (el.innerText || el.getAttribute("aria-label") || "").slice(0, 40);
	})()`);
	return r;
}

async function capture(name) {
	await sleep(900); // 等渲染
	const data = await evalJs(`(() => {
		const texts = [];
		const attrs = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			const p = walker.currentNode.parentElement;
			if (p && (p.tagName === "SCRIPT" || p.tagName === "STYLE")) continue;
			const t = walker.currentNode.textContent.trim();
			if (t) texts.push(t);
		}
		for (const el of document.querySelectorAll('[aria-label],[placeholder],[title],[data-tooltip]')) {
			for (const a of ["aria-label", "placeholder", "title", "data-tooltip"]) {
				const v = el.getAttribute(a);
				if (v && v.trim()) attrs.push(a + "=" + v.trim());
			}
		}
		return { text: texts.join("\\n"), attrs: [...new Set(attrs)] };
	})()`);
	const shot = await send("Page.captureScreenshot", { format: "png" });
	if (shot.result?.data) writeFileSync(join(outDir, name + ".png"), Buffer.from(shot.result.data, "base64"));
	writeFileSync(join(outDir, name + ".json"), JSON.stringify({ name, ...data }, null, 1), "utf8");
	return data;
}

// —— 运行时断言 ——
function checkPage(name, data) {
	const issues = [];
	const fullText = (data.text || "") + "\n" + (data.attrs || []).join("\n");
	// L2 半角标点紧贴 CJK（跳过代码语境行）
	for (const line of fullText.split("\n")) {
		if (/https?:|\//.test(line)) continue;
		const m = line.match(new RegExp(`${CJK}[,;:!?]([^0-9]|$)|[,;:!?]${CJK}`));
		if (m) issues.push({ rule: "L2-半角标点", sample: line.slice(0, 80) });
	}
	// L3 CJK 与拉丁直接拼接（渲染结果层面）
	for (const line of fullText.split("\n")) {
		const m = line.match(new RegExp(`${CJK}[A-Za-z]{2,}|[A-Za-z]{2,}${CJK}`));
		if (m) {
			const seg = m[0];
			const latin = seg.replace(new RegExp(CJK, "g"), "").trim();
			if (!LATIN_ALLOW.has(latin)) issues.push({ rule: "L3-无空格拼接", sample: seg + " @ " + line.slice(0, 50) });
		}
	}
	// L1 多词拉丁残留（疑似漏翻）——逐行找连续英文短语
	for (const line of fullText.split("\n")) {
		if (line.length < 6) continue;
		const m = line.match(/(?:[A-Za-z][a-z']+\s+){1,}[A-Za-z][a-z']+/g);
		if (m) {
			for (const phrase of m) {
				const words = phrase.trim().split(/\s+/);
				if (words.length >= 2 && words.every((w) => !LATIN_ALLOW.has(w))) {
					issues.push({ rule: "L1-疑似拉丁残留", sample: phrase + " @ " + line.slice(0, 60) });
					break;
				}
			}
		}
	}
	// 每页限样
	const seen = new Set();
	const uniq = issues.filter((i) => {
		const k = i.rule + "|" + i.sample;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	}).slice(0, 8);
	return uniq;
}

// ================= 巡检路线 =================
const report = {};
function saveReport() {
	writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 1), "utf8");
}
async function walk(name, navAction) {
	try {
		if (navAction) await navAction();
		const data = await capture(name);
		const issues = checkPage(name, data);
		report[name] = { issues, chars: (data.text || "").length, attrs: (data.attrs || []).length };
		console.log(`${issues.length ? "⚠" : "✓"} ${name}: ${issues.length} 项 / ${(data.text || "").length} 字符`);
		for (const i of issues) console.log(`   [${i.rule}] ${i.sample}`);
	} catch (e) {
		report[name] = { error: String(e).slice(0, 150) };
		console.log(`✗ ${name}: ${String(e).slice(0, 100)}`);
	} finally {
		saveReport();
	}
}

// 0. 当前页（会话视图现状）
await walk("00-current");

// 1. 侧边栏主导航
await walk("01-home", () => clickButton("Cline 主页"));
await walk("02-sessions", () => clickButton("会话"));
await walk("03-schedules", () => clickButton("定时"));
await walk("04-customize", () => clickButton("自定义"));
await walk("05-search", () => clickButton("搜索会话"));

// 2. 设置页（各分区）
await walk("10-settings", () => clickButton("设置"));
// 设置内部分区按钮文本未知，抓取可见按钮后逐个点击
const settingsNav = await evalJs(`[...document.querySelectorAll('button,[role="button"],[role="tab"]')]
	.map(b => (b.innerText || "").trim().split("\\n")[0])
	.filter(t => t && t.length <= 8 && /[\\u4e00-\\u9fff]/.test(t))`);
console.log("设置内候选分区:", JSON.stringify([...new Set(settingsNav)].slice(0, 20)));
for (const tab of [...new Set(settingsNav)].slice(0, 12)) {
	await walk("11-settings-" + tab, () => clickButton(tab));
}

// 回到会话视图，恢复现场
await clickButton("会话");

writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 1), "utf8");
const total = Object.values(report).reduce((a, r) => a + (r.issues?.length || 0), 0);
console.log(`\n巡检完成: ${Object.keys(report).length} 页, 运行时问题 ${total} 项 -> ${outDir}`);
try { conn.ws.close(); } catch {}
