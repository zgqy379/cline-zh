// 从 vitest json 报告提取失败根因，人工区分「翻译致因」与「平台遗留」
import { readFileSync } from "node:fs";
const j = JSON.parse(readFileSync(process.argv[2], "utf8"));
let n = 0;
for (const suite of j.testResults ?? []) {
	for (const a of suite.assertionResults ?? []) {
		if (a.status !== "failed") continue;
		n++;
		const msg = (a.failureMessages ?? []).join(" ");
		// 判断是否涉及中英混杂（本项目特有）
		const mixed = /[\u4e00-\u9fff][^\n"']*[A-Za-z]{3,}|[A-Za-z]{3,}[^\n"']*[\u4e00-\u9fff]/.test(msg);
		const m = msg.match(/expected\s+([\s\S]{0,160})/);
		console.log(`${mixed ? "★翻译致因" : "  其他/遗留"} | ${a.title.slice(0, 52)}`);
		if (m) console.log(`      ${m[1].replace(/\s+/g, " ").slice(0, 130)}`);
	}
}
console.log(`\n合计 ${n}`);
