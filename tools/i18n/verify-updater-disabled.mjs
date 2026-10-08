// 验证自动更新确实被禁用（复刻 main.rs::updates_enabled 的判定逻辑）
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 脚本位于 <repo>/tools/i18n/，上溯两级即仓库根；可用 REPO 环境变量覆盖。
const REPO = path.resolve(
	process.env.REPO ||
		path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".."),
);
const CONF = path.join(REPO, "apps/examples/desktop-app/src-tauri/tauri.conf.json");
const RUST = path.join(REPO, "apps/examples/desktop-app/src-tauri/src/main.rs");

const conf = JSON.parse(readFileSync(CONF, "utf8"));
const rust = readFileSync(RUST, "utf8");

// main.rs 的判定：endpoints 存在且非空 => 启用
const updater = conf.plugins?.updater;
const endpoints = updater?.endpoints;
const enabled = Array.isArray(endpoints) && endpoints.length > 0;

console.log("=== 判定 ===");
console.log("endpoints:", JSON.stringify(endpoints));
console.log("pubkey   :", JSON.stringify(updater?.pubkey));
console.log(`updates_enabled() => ${enabled}`);

let bad = 0;

// 1. 更新器必须关闭
if (enabled) {
	bad++;
	console.log("\n❌ 自动更新仍处于启用状态，会覆盖汉化版");
}

// 2. 不得残留任何官方 endpoint / 官方 pubkey
//    注意：要排除 _comment 这类说明性字段——我自己的注释里就写了这些词，
//    否则脚本会误报自己。这是本次实测踩到的坑。
const operational = JSON.stringify({
	pubkey: updater?.pubkey,
	endpoints: updater?.endpoints,
});
const OFFICIAL = /github\.com\/cline\/cline|dW50cnVzdGVk|minisign/;
if (OFFICIAL.test(operational)) {
	bad++;
	console.log("\n❌ 实际生效字段中仍残留官方 endpoint 或官方 pubkey");
} else {
	console.log("✅ 实际生效字段无官方 endpoint / pubkey");
}

// 2b. pubkey 必须为空——留任何值都可能被误用
if (typeof updater?.pubkey === "string" && updater.pubkey.length > 0) {
	bad++;
	console.log("❌ pubkey 非空");
}

// 3. Rust 侧必须保留 updates_enabled 开关（否则删配置会 panic）
if (!/fn updates_enabled[\s\S]*?endpoints[\s\S]*?!endpoints\.is_empty/.test(rust)) {
	bad++;
	console.log(
		"\n❌ main.rs 找不到 updates_enabled 的空数组判定，" +
			"移除配置可能导致 updater() 报错",
	);
}

// 4. 托盘菜单项依赖 updates_enabled，禁用后应自动隐藏
if (!/let updater_available = !cfg!\(debug_assertions\) && updates_enabled/.test(rust)) {
	bad++;
	console.log("\n⚠ 未找到 updater_available 判定，菜单项可能仍显示");
} else {
	console.log("\n✅ updater_available 依赖 updates_enabled => 菜单项自动隐藏");
}

console.log(
	bad === 0
		? "\n✅ 自动更新已彻底禁用，汉化版不会被官方包覆盖。"
		: `\n❌ ${bad} 项未通过。`,
);
process.exit(bad === 0 ? 0 : 1);
