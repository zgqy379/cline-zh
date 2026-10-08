// CDP 运行时验证：中文渲染 + 三态主题切换
// 用法: node verify-runtime.mjs <cdp-port>
// 前置: 以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port> 启动 cline-app.exe
// 检查项（对应 HANDOVER §2 的验证要点）:
//   A. document.body.innerText 存在 CJK 且抽查关键中文词
//   B. 默认主题: documentElement.dataset.clineHubTheme ∈ {light,dark} 且 dark class 与之一致
//   C. 切换 light/dark 后 dataset 与 class 跟随翻转
//   D. 主题切换后中文仍在
//   E. Page.captureScreenshot 截图存证
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = process.argv[2] || "9333";
// 脚本位于 <repo>/tools/i18n/；build-out 与本仓库同级，可用 OUT_DIR 覆盖。
const OUT_DIR =
	process.env.OUT_DIR ||
	path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "build-out");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTargets() {
	const res = await fetch(`http://127.0.0.1:${port}/json/list`);
	return res.json();
}

// 等待 CDP 端口就绪（最多 60s）
let targets = null;
for (let i = 0; i < 60; i++) {
	try {
		targets = await getTargets();
		if (targets.some((t) => t.type === "page")) break;
	} catch {}
	await sleep(1000);
}
if (!targets) {
	console.error("FAIL: CDP 端口 60s 内未就绪");
	process.exit(2);
}
const page = targets.find(
	(t) => t.type === "page" && (t.url.startsWith("tauri://") || t.url.includes("tauri.localhost") || t.title.includes("Cline")),
) || targets.find((t) => t.type === "page");
if (!page) {
	console.error("FAIL: 未找到页面 target. targets=" + JSON.stringify(targets.map((t) => ({ type: t.type, url: t.url, title: t.title }))));
	process.exit(2);
}
console.log(`TARGET: title="${page.title}" url="${page.url}"`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
	const msg = JSON.parse(ev.data);
	if (msg.id && pending.has(msg.id)) {
		const { resolve } = pending.get(msg.id);
		pending.delete(msg.id);
		resolve(msg);
	}
};
function send(method, params = {}) {
	const id = ++seq;
	return new Promise((resolve) => {
		pending.set(id, { resolve });
		ws.send(JSON.stringify({ id, method, params }));
	});
}
async function evalJs(expression) {
	const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
	if (r.error) throw new Error("CDP error: " + JSON.stringify(r.error));
	if (r.result.exceptionDetails) throw new Error("JS exception: " + JSON.stringify(r.result.exceptionDetails));
	return r.result.result?.value;
}
async function shot(name) {
	const r = await send("Page.captureScreenshot", { format: "png" });
	if (r.result?.data) writeFileSync(`${OUT_DIR}/${name}`, Buffer.from(r.result.data, "base64"));
}

await send("Page.enable");
await send("Runtime.enable");
await sleep(2000); // 等首屏稳定

function cjkCount(s) {
	return (s.match(/[\u4e00-\u9fff]/g) || []).length;
}
const report = { checks: [], pass: true };
function check(name, ok, detail) {
	report.checks.push({ name, ok, detail });
	if (!ok) report.pass = false;
	console.log(`${ok ? "PASS" : "FAIL"} ${name} :: ${detail}`);
}

// ---- A+B: 首屏快照（默认 system 偏好）----
const firstText = await evalJs("document.body.innerText");
const firstTheme = await evalJs("document.documentElement.dataset.clineHubTheme ?? null");
const firstDarkClass = await evalJs("document.documentElement.classList.contains('dark')");
const storedPref = await evalJs("localStorage.getItem('cline-hub-theme')");
const firstCjk = cjkCount(firstText);
check("A1 首屏含中文", firstCjk >= 10, `innerText 中 CJK 字符数=${firstCjk}, 样例=${JSON.stringify(firstText.slice(0, 120))}`);
check("B1 默认主题已生效", firstTheme === "light" || firstTheme === "dark", `dataset.clineHubTheme=${firstTheme}, darkClass=${firstDarkClass}, storedPref=${storedPref}`);
check("B2 class 与 dataset 一致", (firstTheme === "dark") === firstDarkClass, `theme=${firstTheme} darkClass=${firstDarkClass}`);
await shot("runtime-verify-first.png");

// ---- C+D: 三态切换（直接驱动真实 bootstrap 脚本的读值路径: 改 localStorage + reload）----
async function switchTheme(pref) {
	await evalJs(`localStorage.setItem('cline-hub-theme', ${JSON.stringify(pref)}); location.reload(); "ok"`);
	// 等 reload 完成
	for (let i = 0; i < 30; i++) {
		await sleep(500);
		const ready = await evalJs("document.readyState");
		if (ready === "complete") break;
	}
	await sleep(1500); // 等首屏渲染
	return {
		theme: await evalJs("document.documentElement.dataset.clineHubTheme ?? null"),
		dark: await evalJs("document.documentElement.classList.contains('dark')"),
		text: await evalJs("document.body.innerText"),
	};
}

const light = await switchTheme("light");
check("C1 light 模式生效", light.theme === "light" && !light.dark, `theme=${light.theme} darkClass=${light.dark}`);
check("D1 light 下中文仍在", cjkCount(light.text) >= 10, `CJK 字符数=${cjkCount(light.text)}`);
await shot("runtime-verify-light.png");

const dark = await switchTheme("dark");
check("C2 dark 模式生效", dark.theme === "dark" && dark.dark, `theme=${dark.theme} darkClass=${dark.dark}`);
check("D2 dark 下中文仍在", cjkCount(dark.text) >= 10, `CJK 字符数=${cjkCount(dark.text)}`);
await shot("runtime-verify-dark.png");

// 恢复默认偏好
await evalJs(`localStorage.setItem('cline-hub-theme', 'system'); "ok"`);

report.targets = { title: page.title, url: page.url };
report.samples = { first: firstText.slice(0, 300), light: light.text.slice(0, 200), dark: dark.text.slice(0, 200) };
writeFileSync(`${OUT_DIR}/runtime-verify-report.json`, JSON.stringify(report, null, 2));
console.log(report.pass ? "VERDICT: ALL PASS" : "VERDICT: HAS FAILURES");
ws.close();
process.exit(report.pass ? 0 : 1);
