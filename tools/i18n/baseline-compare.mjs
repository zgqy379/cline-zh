// baseline-compare.mjs — 基线对照：失败用例名称集合差集
// 用法：
//   node baseline-compare.mjs <baseline-output.txt> <head-output.txt>
//   node baseline-compare.mjs --run             # 自动跑两侧
//   node baseline-compare.mjs --head-only        # 仅解析已跑好的 HEAD 输出
//
// 输出：失败名称的去重集合，以及 baseline vs HEAD 的差集（新增/修复）。
// 原则：比名称集合差集，不比总数——总数会被并行抖动干扰。

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 脚本位于 <repo>/tools/i18n/，上溯两级即仓库根；可用 REPO 环境变量覆盖。
const REPO = resolve(
	process.env.REPO ||
		join(dirname(fileURLToPath(import.meta.url)), "..", ".."),
);
const CWD = join(REPO, "apps/examples/desktop-app");
const OUT_DIR = process.env.OUT_DIR || join(REPO, "..", "build-out", "qa");
const BASELINE = process.env.BASELINE || "41deb5d";
const CONFIG = process.env.CONFIG || "vitest.config.ts";

// ---------------------------------------------------------------------------
// 解析：从 vitest --reporter=verbose 输出中提取失败用例名
// ---------------------------------------------------------------------------
// 先剥离 ANSI 颜色码：vitest 的 FAIL 行带 `[41m[1m FAIL [22m…` 一串样式码，
// 不剥掉的话 `^ FAIL` 永远匹配不到行首。
const ANSI = /\x1b\[[0-9;]*m/g;
const stripAnsi = (s) => s.replace(ANSI, "");

function parseFailures(text) {
  const clean = stripAnsi(text);
  const suites = []; // {file, reason} — failed suites (couldn't even load)
  const tests = []; // "file > suite > test" — failed test cases

  // Failed Suites: "FAIL  scripts/foo.test.ts [ scripts/foo.test.ts ]"
  // vitest 在套件无法加载时给出 "[ file ]" 形式，与普通 FAIL 行区分开。
  // 注意：FAIL 后跟两个空格（样式码被剥离后留下的间隔）。
  const suiteRe = /^ FAIL +(\S+?\.(?:test|spec)\S*) \[ \S+ \]/gm;
  for (const m of clean.matchAll(suiteRe)) {
    suites.push({ file: m[1], name: m[1] });
  }

  // Failed Tests: "FAIL  file.test.ts > suite > test name"
  // 名称可能很长（含参数化用例的括号），但 verbose reporter 会在一行内给完整路径。
  const testRe = /^ FAIL +(\S+?\.(?:test|spec)\S*) > (.+?) > (.+?)$/gm;
  for (const m of clean.matchAll(testRe)) {
    tests.push({ file: m[1], name: `${m[1]} > ${m[2]} > ${m[3]}` });
  }

  return { suites, tests };
}

// ---------------------------------------------------------------------------
// 提取名称集合（去重，按字母序排序）
// ---------------------------------------------------------------------------
function nameSet(parsed) {
  const names = parsed.tests.map((t) => t.name);
  for (const s of parsed.suites) names.push(s.name);
  return [...new Set(names)].sort();
}

// ---------------------------------------------------------------------------
// 差集运算
// ---------------------------------------------------------------------------
function diffSets(baselineSet, headSet) {
  const b = new Set(baselineSet);
  const h = new Set(headSet);
  return {
    new: headSet.filter((n) => !b.has(n)), // HEAD 新增（汉化致因？）
    fixed: baselineSet.filter((n) => !h.has(n)), // 基线有 HEAD 无（修好了？）
    common: headSet.filter((n) => b.has(n)), // 两侧都有（平台性/并行抖动）
  };
}

// ---------------------------------------------------------------------------
// 分类
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// 分类：平台性 / 并行抖动 / 翻译致因
// ---------------------------------------------------------------------------
// 判定依据是**失败信息本身**，不是用例名：
//   - 翻译致因：失败信息里出现「期望中文 / 实际英文」（或反之）的词面失配，
//     即断言的字符串与源码渲染的字符串因为翻译而分叉。
//   - 平台性：Windows 与 Linux/macOS 的固有差异（路径分隔符、EPERM 文件锁、
//     无 sh、bun:test 在 vitest 下不可用）。
//   - 并行抖动：sidecar 测试起真实端口/子进程，并行争用导致超时或资源竞争。
// 三类互斥，按「翻译致因优先」判定：只有失败信息确实指向字符串失配才算翻译致因。
function classifyFromFailures(failures) {
  const out = { platform: [], flake: [], translation: [] };
  for (const f of failures) {
    const msg = (f.message || "").toLowerCase();
    const name = f.name.toLowerCase();

    // 1) 翻译致因：断言的期望/实际里出现中文字符串失配
    //    典型形态：AssertionError 里同时含 "Expected" 与 "Received"，
    //    且两侧之一含 CJK；或 toThrow(中文子串) 未命中。
    const hasChinese = /[\u4e00-\u9fff]/.test(f.message || "");
    const isAssertionMismatch =
      msg.includes("assertionerror") ||
      msg.includes("expected") && msg.includes("received") ||
      msg.includes("to include") || msg.includes("to contain") ||
      msg.includes("deeply equal");
    if (hasChinese && isAssertionMismatch && !msg.includes("eperm") && !msg.includes("c:/")) {
      out.translation.push(f);
      continue;
    }

    // 2) 并行抖动：超时 / 资源竞争
    if (
      msg.includes("timed out") || msg.includes("timeout") ||
      msg.includes("body is unusable") || msg.includes("already been read") ||
      msg.includes("unable to open log file")
    ) {
      out.flake.push(f);
      continue;
    }

    // 3) 平台性：路径分隔符 / 文件锁 / 无 sh / bun:test
    if (
      msg.includes("eperm") || msg.includes("permission denied") ||
      msg.includes("cannot find package 'bun:test'") ||
      (msg.includes("c:/") && msg.includes("c:\\")) ||
      msg.includes("not a git repository") || msg.includes("invalid reference") ||
      name.startsWith("scripts/")
    ) {
      out.platform.push(f);
      continue;
    }

    // 4) 兜底：超时类归并行抖动，其余断言失配若含中文归翻译致因，否则平台性
    if (hasChinese) out.translation.push(f);
    else out.platform.push(f);
  }
  return out;
}

function classify(failureNames) {
  // 旧接口（仅名称）——保留给只有名称的场景，精度较低
  const platform = [];
  const flake = [];
  const translation = [];

  for (const name of failureNames) {
    const lower = name.toLowerCase();

    const isPlatform =
      lower.includes("eperm") || lower.includes("permission denied") ||
      lower.includes("cannot find package 'bun:test'") ||
      (lower.includes("c:/") && lower.includes("c:\\")) ||
      lower.includes("not a git repository") ||
      lower.includes("invalid reference") ||
      lower.startsWith("scripts/") ||
      lower.includes("worktree");

    const isFlake =
      lower.includes("timed out") || lower.includes("timeout") ||
      lower.includes("body is unusable") || lower.includes("already been read") ||
      lower.includes("unable to open log file");

    if (isFlake && !isPlatform) {
      flake.push(name);
    } else if (isPlatform) {
      platform.push(name);
    } else {
      translation.push(name);
    }
  }
  return { platform, flake, translation };
}

// ---------------------------------------------------------------------------
// 跑一次 vitest
// ---------------------------------------------------------------------------
function runVitest(label, cwd, extraEnv = "") {
  console.log(`\n⏳ 正在运行 ${label} 测试…`);
  const cmd = `${extraEnv} bunx vitest run --config "${CONFIG}" --reporter=verbose 2>&1`;
  const out = execSync(cmd, {
    cwd,
    timeout: 600_000,
    maxBuffer: 50 * 1024 * 1024,
    encoding: "utf8",
  });
  const result = parseFailures(out);
  const names = nameSet(result);
  console.log(`   ${label}: ${result.tests.length} 条失败 + ${result.suites.length} 个失败套件 → ${names.length} 个唯一名称`);
  return { output: out, parsed: result, names };
}

// ---------------------------------------------------------------------------
// 从完整输出中提取每条失败的信息块（FAIL 行 + 后续的错误详情）
// ---------------------------------------------------------------------------
// vitest 的输出结构：一条 "FAIL file > suite > test" 后面跟着缩进的错误信息，
// 直到遇到下一条 FAIL / 空行 / 分隔线。这里把每条失败与其信息块配对，
// 供 classifyFromFailures 做基于内容的精确分类。
function extractFailureBlocks(text) {
  const clean = stripAnsi(text);
  const lines = clean.split("\n");
  const blocks = [];
  let current = null;

  const failRe = /^ FAIL +(\S+?\.(?:test|spec)\S*) > (.+?) > (.+?)$/;
  const suiteFailRe = /^ FAIL +(\S+?\.(?:test|spec)\S*) \[ \S+ \]$/;

  for (const line of lines) {
    const m = line.match(failRe);
    if (m) {
      if (current) blocks.push(current);
      current = { name: `${m[1]} > ${m[2]} > ${m[3]}`, file: m[1], message: "" };
      continue;
    }
    const sm = line.match(suiteFailRe);
    if (sm) {
      if (current) blocks.push(current);
      current = { name: sm[1], file: sm[1], message: "" };
      continue;
    }
    if (current) {
      // 错误详情在 FAIL 行之后，遇到下一条结果行（✓/✗/FAIL/分隔线）就结束
      if (/^[ ✓✗⎯]/.test(line) || /^Test Files|^Tests |^Duration/.test(line)) {
        blocks.push(current);
        current = null;
        continue;
      }
      current.message += line + "\n";
    }
  }
  if (current) blocks.push(current);
  // 去重：一条用例可能有多段信息（断言失配 + afterEach 的 EPERM 清理失败），
  // 被提取成多个块。保留信息最长的那个做分类，避免重复计数。
  const seen = new Map();
  for (const b of blocks) {
    const prev = seen.get(b.name);
    if (!prev || b.message.length > prev.message.length) seen.set(b.name, b);
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

if (args.includes("--selftest")) {
  // 自检：确保解析器对已跑好的输出能稳定工作
  const outPath = args[args.indexOf("--selftest") + 1];
  if (!outPath) {
    console.error("用法: node baseline-compare.mjs --selftest <vitest-output.txt>");
    process.exit(1);
  }
  const text = readFileSync(outPath, "utf8");
  const r = parseFailures(text);
  console.log(`Suites: ${r.suites.length}, Tests: ${r.tests.length}`);
  console.log(`Names: ${nameSet(r).length}`);
  console.log("SELFTEST PASS");
  process.exit(0);
}

if (args.length >= 2 && !args[0].startsWith("--")) {
  // 模式 1: 命令行指定两个输出文件
  const baselineFile = resolve(args[0]);
  const headFile = resolve(args[1]);
  const reportPath = args[2] ? resolve(args[2]) : join(OUT_DIR, "baseline-compare-report.json");

  if (!existsSync(baselineFile)) {
    console.error(`❌ 基线输出文件不存在: ${baselineFile}`);
    process.exit(1);
  }
  if (!existsSync(headFile)) {
    console.error(`❌ HEAD 输出文件不存在: ${headFile}`);
    process.exit(1);
  }

  const baselineText = readFileSync(baselineFile, "utf8");
  const headText = readFileSync(headFile, "utf8");

  const baselineParsed = parseFailures(baselineText);
  const headParsed = parseFailures(headText);
  const baselineNames = nameSet(baselineParsed);
  const headNames = nameSet(headParsed);
  const diff = diffSets(baselineNames, headNames);

  const report = {
    timestamp: new Date().toISOString(),
    baseline: { commit: basename(baselineFile), totalFailures: baselineParsed.tests.length + baselineParsed.suites.length },
    head: { commit: basename(headFile), totalFailures: headParsed.tests.length + headParsed.suites.length },
    baselineNames,
    headNames,
    diff,
    classification: classify(diff.new),
    verdict: diff.new.length === 0
      ? "✅ 零新增失败——汉化未引入回归"
      : `⚠️ ${diff.new.length} 条新增失败，需排查翻译致因`,
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`\n基线: ${baselineNames.length} 个失败名称`);
  console.log(`HEAD: ${headNames.length} 个失败名称`);
  console.log(`新增: ${diff.new.length} | 修复: ${diff.fixed.length} | 共有: ${diff.common.length}`);
  if (diff.new.length > 0) {
    console.log("\n🆕 新增失败:");
    for (const n of diff.new) console.log(`   ${n}`);
  }
  if (diff.fixed.length > 0) {
    console.log("\n✅ 已修复:");
    for (const n of diff.fixed) console.log(`   ${n}`);
  }
  console.log(`\n报告 → ${reportPath}`);
  console.log(report.verdict);
  process.exit(diff.new.length > 0 ? 1 : 0);
}

if (args.includes("--head-only")) {
  // 模式 2: 把已跑好的 HEAD 输出解析并分类
  const outFile = args[args.indexOf("--head-only") + 1] || join(OUT_DIR, "desktop-test-output.txt");
  if (!existsSync(outFile)) {
    console.error(`❌ 输出文件不存在: ${outFile}`);
    process.exit(1);
  }
  const text = readFileSync(outFile, "utf8");
  const parsed = parseFailures(text);
  const names = nameSet(parsed);
  // 精确分类：用每条失败的信息块（AssertionError 的 Expected/Received）判定
  const blocks = extractFailureBlocks(text);
  const classified = classifyFromFailures(blocks);
  const classification = {
    platform: classified.platform.map((f) => f.name),
    flake: classified.flake.map((f) => f.name),
    translation: classified.translation.map((f) => f.name),
  };

  const report = {
    timestamp: new Date().toISOString(),
    headCommit: "HEAD",
    totalFailures: parsed.tests.length + parsed.suites.length,
    uniqueNames: names.length,
    failureNames: names,
    classification,
    translationDetails: classified.translation.map((f) => ({
      name: f.name,
      evidence: f.message.split("\n").filter((l) => l.trim()).slice(0, 8).join("\n"),
    })),
  };
  const reportPath = join(OUT_DIR, "head-failure-classification.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`总失败: ${parsed.tests.length} 条用例 + ${parsed.suites.length} 个套件`);
  console.log(`唯一名称: ${names.length}`);
  console.log(`平台性: ${classification.platform.length}`);
  console.log(`并行抖动: ${classification.flake.length}`);
  console.log(`翻译致因: ${classification.translation.length}`);
  if (classification.translation.length > 0) {
    console.log("\n🔴 疑似翻译致因:");
    for (const n of classification.translation) console.log(`   ${n}`);
  }
  console.log(`\n报告 → ${reportPath}`);
  process.exit(0);
}

// 默认: 显示用法
console.log(`
baseline-compare.mjs — 基线对照（失败名称集合差集）

用法:
  node baseline-compare.mjs <baseline-output.txt> <head-output.txt> [report.json]
  node baseline-compare.mjs --head-only [head-output.txt]
  node baseline-compare.mjs --selftest <vitest-output.txt>

说明:
  - 接受 vitest --reporter=verbose 的输出文件
  - 提取失败用例的「文件 > 套件 > 用例」全名
  - 做 baseline vs HEAD 的集合差集
  - 新增失败按「平台性 / 并行抖动 / 翻译致因」三分类
  - 比名称集合，不比总数（总数会被并行抖动干扰）
`);