// 按文件聚合失败，并按「中英混杂」启发式标注疑似翻译致因
import { readFileSync } from "node:fs";
const j = JSON.parse(readFileSync(process.argv[2], "utf8"));
const by = new Map();
for (const s of j.testResults ?? []) {
	const file = (s.name || "").replace(/^.*desktop-app[\\/]/, "");
	for (const a of s.assertionResults ?? []) {
		if (a.status !== "failed") continue;
		const msg = (a.failureMessages ?? []).join(" ");
		const mixed = /[\u4e00-\u9fff][^\n"']*[A-Za-z]{3,}|[A-Za-z]{3,}[^\n"']*[\u4e00-\u9fff]/.test(msg);
		if (!by.has(file)) by.set(file, { n: 0, mixed: 0 });
		const e = by.get(file);
		e.n++;
		if (mixed) e.mixed++;
	}
}
const rows = [...by.entries()].sort((a, b) => b[1].n - a[1].n);
let tn = 0;
let tm = 0;
for (const [f, e] of rows) {
	tn += e.n;
	tm += e.mixed;
	console.log(`${String(e.n).padStart(3)} (疑${String(e.mixed).padStart(2)})  ${f}`);
}
console.log(`\n合计失败 ${tn}，疑似翻译致因 ${tm}`);
