#!/usr/bin/env node
// 回填 GLOSSARY.md：新增「七、@cline/ui 团队协作与思考标签」小节 + 回填记录登记。
import { readFileSync, writeFileSync } from "node:fs";

const p = "docs/GLOSSARY.md";
const b = readFileSync(p);
const bom = b.slice(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
let c = bom ? b.slice(3).toString("utf8") : b.toString("utf8");

const section = `
## 七、@cline/ui 团队协作与思考标签（2026-09-29 doubao 回填）

| 英文 | 中文 |
|---|---|
| Teammate | 队友 |
| Spawn teammate | 生成队友（动词对：正在生成 / 已生成） |
| Shutdown teammate | 停止队友 |
| Await teammates | 等待队友（正在等待 / 已等待） |
| Broadcast to teammates | 向队友广播消息 |
| Team task | 团队任务（已分配 N 项团队任务） |
| List team tasks | 列出团队任务（已列出 N 项团队任务） |
| List team outcomes | 列出团队成果 |
| Mission log | 任务日志 |
| Team status | 团队状态 |
| Thinking | 思考中（思考标签无时长回退文案） |
| Thought for Ns | 思考了 N 秒 |
| Pull request | 拉取请求 |
| Refresh pull request status | 刷新拉取请求状态 |
| CI check | CI 检查（No CI checks → 无 CI 检查） |
| Command output | 命令输出 |
| Follow-up question | 追问 |
| Continue | 继续（追问面板确认按钮） |
| Drop to attach | 拖放以附加 |

`;

const anchor = "## 回填记录";
if (!c.includes(section.trim())) {
  if (!c.includes(anchor)) {
    console.error("anchor not found");
    process.exit(1);
  }
  c = c.replace(anchor, section + anchor);
}

const rows = [
  "| Teammate | 队友 | doubao | 2026-09-29 |",
  "| Spawn teammate | 生成队友（正在生成/已生成） | doubao | 2026-09-29 |",
  "| Team task | 团队任务（已分配 N 项） | doubao | 2026-09-29 |",
  "| Thinking | 思考中（思考标签回退文案） | doubao | 2026-09-29 |",
  "| Thought for Ns | 思考了 N 秒 | doubao | 2026-09-29 |",
  "| Pull request | 拉取请求 | doubao | 2026-09-29 |",
  "| Command output | 命令输出 | doubao | 2026-09-29 |",
  "| Follow-up question | 追问 | doubao | 2026-09-29 |",
];
for (const r of rows) {
  if (!c.includes(r)) {
    c = c.replace("| — | — | — | — |", r + "\n| — | — | — | — |");
  }
}

writeFileSync(
  p,
  bom
    ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(c, "utf8")])
    : Buffer.from(c, "utf8"),
);
console.log("GLOSSARY updated");
