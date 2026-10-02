# 25(29) 条测试红 — 分类清单

> ⚠️ **本文档的数据已过时，请勿直接引用其中的数字。**
>
> 生成时间 2026-10-01，基线为 commit `e54ba5d`；此后汉化工作继续推进，
> 用例总数与失败数均已变化。当前实测数据（**1656 用例 / 约 20 条失败**）
> 见仓库根 [`MODIFICATIONS.md`](../MODIFICATIONS.md) §四 与
> [`README.md`](../README.md)「测试状态」一节。
>
> 仍然有效的部分：
> - **A 类 6 条汉化致因的成因分析**（源已汉化、断言未同步）——已由 `e54ba5d` 修复；
> - **B/C/D 类的分类方法**（Windows 平台差异 / 待定论 / 并行抖动）；
> - **「用断言词面逐条比对源词面」这一判据**（见下方「更正」段）。
>
> 已过时：标题与正文里的 25/29/18 条、1647 用例，以及
> 「剩余 18 条」的分类——它不含 4 个在 Windows 上整体未收集的
> `scripts/*` 测试文件（`desktop-startup` / `dmg-background` /
> `generate-update-manifest` / `windows-installer`），也不含本轮新修的 7 条。

生成：2026-10-01 | 数据源 `build-out/testrun-c.json`（全量并行）+ `testrun-c-iso.json`（11 个文件隔离复跑）

## 一句话结论（2026-10-01 更新：A 类已修完）

**A 类 6 条已于 B52（commit `e54ba5d`）修完，全量从 1618/29 变成 1629/18，零新增红。剩余 18 条无一条汉化致因。**

⚠️ **更正我上一轮的说法**：我之前用「报错文本里有没有中文」来判断汉化致因，**判据是错的**——
vitest 会把不匹配的属性省略成 `…(1)`，中文压根不会出现在报错里。改用「断言词面 vs 源词面逐条比对」才查出来。

---

## A 类：汉化致因（6 条）—— ✅ 已于 B52 修复（commit `e54ba5d`）

| 文件 | 行 | 断言写的 | 源码实际是 | 出处 |
|---|---|---|---|---|
| `sidecar/marketplace.test.ts` | 68 | `message: "Installed Goal."` | 「已安装 Goal。」 | `marketplace.ts:854` |
| `sidecar/marketplace.test.ts` | 100 | `message: "Installed Goal."` | 「已安装 Goal。」 | `marketplace.ts:854` |
| `sidecar/marketplace.test.ts` | 151 | `message: "Installed Aikido."` | 「已安装 Aikido。」 | `marketplace.ts:881` |
| `webview/hooks/use-chat-session.test.tsx` | 1286 | `"\u001b[0m[Earlier command output truncated]"` | `"\u001b[0m[此前的命令输出已截断]\n"` | `lib/command-output.ts:5` |
| `webview/hooks/use-chat-session.test.tsx` | 165 | `item.content === "Continue"` | 夹具是「继续」 | 同文件 L146-152 夹具被译、过滤串没跟着改 |
| `webview/hooks/use-chat-session.test.tsx` | 323 | `item.content === "Continue"` | 夹具是「继续」 | 同文件 L313-314 夹具被译、过滤串没跟着改 |

**性质**：全部是「源已汉化、断言没同步」，属 §5 踩坑表里「断言同步必须紧跟源侧 commit 落地」的存量欠账。
- marketplace 那 3 条在上一个批次（2026-09-29）就记录过并已登记待办，
  但因批次交接后无人认领，一直悬置。
- use-chat-session 那 3 条是「半改」：同一个文件里 `"one prompt"`/`"describe this"`/`"same prompt"` 等夹具还是英文，
  只有这两组被译了，而过滤串 `=== "Continue"` 没跟着改 ⇒ **夹具与过滤串自相矛盾**，与产品源码无关。
- 修法：纯改断言词面，不碰产品代码，风险极低。
- **B52 实况**：145/145 绿；全量 29 → 18。其中 marketplace L128 的 `"Goal is already installed."` **刻意保持英文**（源 `marketplace.ts:776/829` 仍英文，B20 判不改）——我第一版误改，review diff 时发现并还原。

---

## B 类：Windows 平台问题（17 条，与汉化无关）

| 文件 | 条数 | 证据 |
|---|---|---|
| `sidecar/commands-git-worktree.test.ts` | 10 | 5 条：git 打印 `C:/Users/...` 正斜杠，断言写 `C:\Users\...` 反斜杠；5 条：`EPERM, Permission denied` 删临时 worktree 目录 |
| `sidecar/commands-settings.test.ts` | 3 | 全部 `EPERM, Permission denied` 删临时目录 |
| `sidecar/chat-session.test.ts` | 2 | `expected Set{'D:\workspace\project'} to equal Set{'/workspace/project'}` —— 路径分隔符。L1080 那条 `rejects.toThrow` 是**同一根因的连带**：锁集合用 `/workspace/project` 而实际是 `D:\...`，匹配不上所以没 reject（断言本身已是中文，是对的） |
| `sidecar/remote-environment-commands.test.ts` | 1 | `spawnSync sh ENOENT` —— 代码里 `execFileSync("sh")`，Windows 无 sh |

## C 类：疑似平台，未定论（1 条）

`sidecar/logging.test.ts:61` —— `Number of calls: 0`，即 `process.stderr.write` 根本没被调用。
**已排除翻译**：`logging.ts:121` 的源串 `[cline-code] Unable to open log file ...; falling back to stderr`
**仍是英文**，断言也是英文，两边一致。怀疑是 Windows 上 `createWriteStream(目录路径)` 的失败时机
（异步抛出 vs 同步进 catch）导致没走 fallback 分支。**需要一次定向实验才能定论，本轮未做。**

## D 类：全量并行抖动（5~6 条，隔离跑就绿）

`commands-integrations` ×2、`observability` ×1、`hub_upgrade` ×1、`commands-account` ×1、
`remote-environment-commands` ×1。
证据：同一份代码全量跑 29 红、只跑那 11 个文件 23 红，且两次全量跑之间这 6 条**互相翻转**。
sidecar 测试大量起真实端口/子进程，并行时互相争用。

---

## 附：为什么基线数字一直不准

- B33 记「83 文件 / 1051 用例」，B41 记「48 条红」，实测「29/25 条红」——三个数都不是同一个口径。
- 实测当前总用例数 **1647**，B33 时的 1051 明显是只跑了 `webview/**` 子集。
- 建议：把口径固定为「desktop-app 全量 vitest，无路径过滤，JSON reporter」，并把本文档作为基线。

---

## 处理建议

| 优先级 | 动作 | 收益 | 风险 |
|---|---|---|---|
| 1 | 修 A 类 6 条断言 | 汉化致因真正归零（这次是**第一次真的归零**） | 极低（纯断言） |
| 2 | C 类做一次定向实验定论 | 消除 1 条「未知」 | 低 |
| 3 | B 类加平台 skip 或改断言 | 红数 29→12 左右 | **中**，会把真 bug 一起藏起来 |
| 4 | D 类给 sidecar 测试串行化 | 红数再降，且结果可复现 | 低，但会变慢 |
