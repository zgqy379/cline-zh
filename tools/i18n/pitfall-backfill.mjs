#!/usr/bin/env node
// 向 PROGRESS.md §5 踩坑表追加本轮两条新坑
import { readFileSync, writeFileSync } from "node:fs";
const p = "docs/PROGRESS.md";
let s = readFileSync(p, "utf8");
const anchor = "| **官方源极慢** | `static.rust-lang.org` 仅 4KB/s | 用中科大镜像 `mirrors.ustc.edu.cn/rust-static`，实测提速约 270 倍 |";
const add =
  "| **断言同步必须紧跟源侧 commit 落地** | 源翻译（如聚合名词 文件/条命令/次搜索）与测试断言分两批各自提交，断言仍按旧源值（正在读取 3 files）→ 批量失配 | 同步断言前先 `git log` 确认源侧 commit 已落地，再按 vitest Received 一次改完；改完立即跑全量回归 |\n" +
  "| **多行 `toBe` 断言按单行串匹配会未命中** | 脚本按 `toBe(\"xxx\")` 单行形态匹配，遇到 `toBe(\\n\\t\\t\\t\"xxx\",\\n\\t\\t)` 多行断言直接跳过 → 整体中止未写入 | 批量替换脚本里多行断言必须带制表符缩进的完整形态；先 grep 确认实际换行形态再写脚本 |\n";
const n = s.split(anchor).length - 1;
if (n !== 1) {
  console.log(`锚点命中 ${n} 处（期望 1），中止`);
  process.exit(1);
}
s = s.replace(anchor, anchor + "\n" + add.trimEnd());
writeFileSync(p, s, "utf8");
console.log("§5 踩坑表已追加 2 条（2026-09-29 doubao）");
