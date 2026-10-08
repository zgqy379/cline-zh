# 汉化工具链（tools/i18n）

本目录是 Cline 中文版的**汉化校验工具**与**翻译映射表**。

它们的存在意义：本项目采用「映射表 + 精确整词替换」而非运行时 i18n 框架
（理由见 [`MODIFICATIONS.md`](../MODIFICATIONS.md)）。既然没有框架兜底，
就必须在每次改动后用工具证明「没有误伤协议字符串」。

> 全部脚本以**仓库根目录**为工作目录运行，路径均相对仓库根。

---

## 必跑闸门（每次改动后）

### `check-enums.mjs` —— 防枚举误伤

```bash
node tools/i18n/check-enums.mjs <文件或目录...>
```

**这是最重要的一个工具。** Cline 代码里大量字符串同时用于「逻辑判断」和
「界面显示」，例如：

```tsx
settingsSection === "Schedules"   // 逻辑判断
title="Schedules"                 // 界面显示
```

翻译了它，条件永不成立 —— **功能直接失效且不报错**（静默故障，比编译错误危险得多）。

检测两类问题：
1. 比较表达式中残留中文 → 枚举值被误译（功能性 BUG）
2. 比较表达式中仍是英文 → 提示可能是禁改枚举，人工确认

### `check-syntax.mjs` —— 防语法损坏

```bash
node tools/i18n/check-syntax.mjs <文件或目录...>
```

`apply-zh.mjs` 做的是纯文本替换，无法保证替换后仍是合法 TSX。
本工具用 TypeScript 编译器 API 逐文件 parse，只报语法错误
（不做类型检查 —— 依赖未装时类型检查必然大量报缺模块的假错）。

---

## 残留扫描

### `residual.mjs` —— 精准残留扫描（推荐，v0.3）

```bash
node tools/i18n/residual.mjs <目录>
```

找出「已汉化文件里还剩下的用户可见英文」。v0.3 的规则集：

| 规则 | 抓什么 | 实现 |
|---|---|---|
| 属性 | `title`/`placeholder`/`aria-label`/`alt`/`label`/`description` 等直接赋英文短语 | 正则 ×2（大写开头版 + 大小写不敏感版，后者专抓 `aria-label="breadcrumb"`） |
| 三元 / 对象值 | `? "…"`、`: "…"`、`label: "…"`（含键与值被格式化拆到两行的形态） | 正则 + AST 两套 |
| JSX 文本 | `<p>` 与 `</p>` 之间的一切文本（含与插值同行的 `文本 {expr}`） | **AST `JsxText`** |
| JSX 表达式 | `{cond ? … : "Approve"}` 里被括号包住的字符串字面量 | AST + 剥括号 |
| placeholder 过滤 | `my-provider` / `https://…` / `sk-…` / `ubuntu` 这类**格式示例值**不计入 | 要求大写开头或含空格 |

两条关键修正（v0.3，2026-10-03 B55）：

- **CJK 守卫**：串里只要含中文就不是英文残留 —— v0.2 会把「Cline 主页」「MCP 服务器」
  「Cline API 密钥」这类已汉化的「品牌名 + 中文」当残留报出来。
- **AST 取代跨行启发式**：v0.2 的 `<Tag ...>` 后 6 行乱抓既误报又漏报，
  换成遍历 `JsxText` 后零误报，且顺手抓到 11 处旧版看不见的真漏翻。

> **不要用 `scan-i18n.mjs` 做残留检查** —— 它的启发式会把 className、
> import 路径、逻辑枚举统统算成候选，误报率极高。

### `residual-keep.json` —— 判不改白名单（v0.3 新增）

```json
[{ "path": "文件路径片段", "text": "命中文本（可省略=该文件全部）", "reason": "为什么不翻" }]
```

- 命中白名单的**单独计数并打印**，不计入「残留」，所以「残留清零」是可信的，
  而不是靠每个人脑子里记着哪些是误报。
- 每条必须写 `reason`。**改白名单 = 改判据**，评审时应当当作代码看。
- 路径同时按「相对扫描根」和「仓库内绝对路径」匹配，换扫描目录也不会漏判。
- 现状（2026-10-03）：67 条，覆盖 4 层共 572 条判不改
  （webview 48 / ui 313 / shared 30 / core 181）。其中 ui 的 313 条里 305 条在
  `stories/` 与 `.storybook/` —— B39 已裁定判不改，B55 复核 `package.json` 的
  `files`/`exports` 确认它们**进不了 npm 包与桌面产物**。

### `scan-i18n.mjs` —— 定位待译文件

```bash
node tools/i18n/scan-i18n.mjs [目标目录]
```

用于**开工前**定位需要翻译的文件与字符串。误报率高，只适合当索引用。

### `residual-audit.mjs` —— 残留审计汇总

```bash
node tools/i18n/residual-audit.mjs <目录>
```

在 `residual.mjs` 基础上按文件汇总，输出待处理清单。

---

## 翻译辅助

### `apply-zh.mjs` —— 精确文案替换

```bash
node tools/i18n/apply-zh.mjs <映射文件.json> [--write] [目标文件...]
```

安全第一的设计：
1. 只做**整词精确匹配**，不做模糊/正则替换
2. 每条映射都报告命中次数，**命中 0 会报警**
3. 默认 dry-run 只预览，加 `--write` 才落盘
4. 写入前自动备份为 `.bak`

### `extract.mjs` —— 提取候选文案

```bash
node tools/i18n/extract.mjs <文件>
```

一次性导出某文件里所有「疑似 UI 文案」的字符串，避免逐个精读大文件
（`settings-view.tsx` 有 1854 行）。

### `audit.mjs` —— 汉化审计

```bash
node tools/i18n/audit.mjs <范围>
```

统计汉化覆盖率，列出未汉化的用户可见字符串。

### `glossary-backfill.mjs` / `pitfall-backfill.mjs`

术语表与踩坑记录的批量回填脚本，读写 `docs/` 下的文档。

### `collect-pairs.mjs` —— 提取 EN→ZH 双语对

```bash
node tools/i18n/collect-pairs.mjs <repoRoot> <baselineSha> <outJson>
```

从「基线 commit 到 HEAD 的累计 diff」+ `maps/` 反查词典，提取 `[{en, zh, file, line}]`
双语对照，供 `check-consistency.mjs` 跑质量规则。maps 目录默认取本仓库
`tools/i18n/maps/`（可用 `MAPS_DIR` 覆盖）。

### `check-consistency.mjs` —— 双语对质量规则

```bash
node tools/i18n/check-consistency.mjs <pairsJson> <outJson>
node tools/i18n/check-consistency.mjs --selftest      # 跑内置用例
```

对双语对跑确定性规则：R1 EN→ZH 多义冲突、R2 GLOSSARY 偏离、R3 半角标点、
R4 复数残留、R5 CJK 与拉丁混排。噪声不静默丢弃，走 `suppressed` 桶并附原因。
术语表默认取本仓库 `docs/GLOSSARY.md`（可用 `GLOSSARY` 覆盖）。

---

## 测试与回归

### `baseline-compare.mjs` —— 失败用例名称集合差集

```bash
node tools/i18n/baseline-compare.mjs <baseline-output.txt> <head-output.txt>
node tools/i18n/baseline-compare.mjs --run          # 自动跑两侧
```

比**名称集合差集**，不比总数 —— 总数会被并行抖动干扰。仓库根默认从脚本位置推导
（可用 `REPO` 覆盖）。

### `check-stale-assertions.mjs` —— 过期断言诊断

```bash
node tools/i18n/check-stale-assertions.mjs            # guard 模式
```

列出「测试断言的英文在产品源码里仍存在」的条目，判断哪些断言不该改。
静态扫描无法可靠配对「断言 ↔ 源串」，失败列表 + 词面比对才是可靠路径。

### `agg.mjs` / `triage.mjs` —— 失败分诊

```bash
node tools/i18n/agg.mjs <vitest-json>     # 按文件聚合失败 + 标注「中英混杂」疑似翻译致因
node tools/i18n/triage.mjs <vitest-json>  # 逐条列出失败与期望值
```

从 vitest `--reporter=json` 报告里提取失败，人工区分「翻译致因」与「平台遗留」。

---

## 出包验证

### `verify-updater-disabled.mjs` —— 自动更新确已禁用

```bash
node tools/i18n/verify-updater-disabled.mjs
```

复刻 `main.rs::updates_enabled` 的判定逻辑，断言 `tauri.conf.json` 的
`plugins.updater.endpoints` 为空且 `pubkey` 为空 —— 否则出包会把汉化版
自动更新回英文官方版。**每次出包前必跑。**

### `verify-runtime.mjs` / `capture-pages.mjs` —— CDP 运行时验证

```bash
# 先以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333 启动 cline-app.exe
node tools/i18n/verify-runtime.mjs 9333
node tools/i18n/capture-pages.mjs 9336 <outDir>
```

`verify-runtime` 检查中文渲染 + 三态主题切换；`capture-pages` 逐页巡检
拉丁残留 / 半角标点 / CJK 与拉丁无空格拼接。输出目录默认 `build-out/`（`OUT_DIR` 可覆盖）。

---

## 协作工具不在此目录

多 Agent 的邮箱（`mail.mjs`）与席位契约（`seat-ping.mjs`）依赖工作区级的
`docs/mailbox/`、`docs/BOARD.md`，它们**不属于本仓库的交付物**，因此不在
`tools/i18n/` 内。本目录只放「汉化与校验」工具 —— 与 `MODIFICATIONS.md` 第七节
的口径一致。

---

## 映射表（`maps/`）

45 个 JSON 文件，每个对应一个源文件，格式为 `{"英文原文": "中文译文"}`。

**这是本项目事实上的"词典"**，也是上游更新后重放汉化的依据：
上游发布新版后，重跑 `scan-i18n.mjs` 找出新增/变更的文案，
再从对应 map 里取译文即可，无需重新翻译。

| 目录 | 内容 |
|---|---|
| `maps/*.json` | 按源文件分片的译文映射 |
| `maps/audit-fixes.json` | 审计阶段补翻 |
| `maps/blind-spot-jsx.json` | 独占行 JSX 文本的批量补翻 |
| `maps/ui-*.json` | `sdk/packages/ui` 共享组件 |

---

## 工作流

```bash
# 1. 开工前：定位待译文件
node tools/i18n/scan-i18n.mjs apps/examples/desktop-app/webview

# 2. 提取候选文案，逐条翻译后写入映射表
node tools/i18n/extract.mjs path/to/file.tsx

# 3. 预览替换（不加 --write 不落盘）
node tools/i18n/apply-zh.mjs tools/i18n/maps/some-file.json path/to/file.tsx

# 4. 确认无误后落盘
node tools/i18n/apply-zh.mjs tools/i18n/maps/some-file.json --write path/to/file.tsx

# 5. 必跑两个闸门
node tools/i18n/check-enums.mjs path/to/file.tsx
node tools/i18n/check-syntax.mjs path/to/file.tsx

# 6. 扫描残留
node tools/i18n/residual.mjs apps/examples/desktop-app/webview

# 7. 同步受影响的测试断言，然后跑测试
```

---

## ⚠️ 绝对不能翻译的东西

这些是协议或标识，翻译会导致功能失效（`check-enums.mjs` 能检出大部分）：

- 命令名、事件名、IPC message type、API 字段名、JSON key
- 工具名与参数名（`read_files` `editor` `run_commands` …）
- CSS 类名、`data-*` / `aria-*` 枚举值、DOM id
- `localStorage` key、配置键名、环境变量名
- 存储契约值（如主题偏好 `"light" | "dark" | "system"`）
- Zod schema 的 `.describe()`（发给模型的语义描述）
- 产品名与厂商名：Cline、VS Code、MCP、JSON、Anthropic、OpenAI …

### ⚠️⚠️ 特别警告：同时充当比较基准的字符串

如果一个字符串**既是 UI 文案，又被代码 `===` / `.includes()` 比较**
（典型：弹窗按钮 label），那么**翻文案必须同步改匹配逻辑**，
否则会造成静默的功能回归。

本项目踩过这个坑两次，修复见 `sidecar/chat-session.ts`：
原本 `MISTAKE_LIMIT_STOP_OPTION = "Stop this run"` 同时是按钮文案和答案匹配键，
若只翻译文案，用户点「停止本次运行」将不再命中停止分支，
而是被当成自定义指导回灌给模型 —— **运行不会停止**。

修复方式是把「显示标签」与「匹配集合」拆开：

```ts
const MISTAKE_LIMIT_STOP_LABEL = "停止本次运行";        // 只管显示
const MISTAKE_LIMIT_STOP_ANSWERS = new Set([           // 只管匹配
	"2", MISTAKE_LIMIT_STOP_LABEL.toLowerCase(), "停止",
	"stop this run", "stop", "n", "no", "否",          // 兼容英文/历史会话/CLI
]);
```

### ⚠️⚠️⚠️ 跨文件契约：错误文案被另一处代码匹配

比上面更隐蔽的一类：**A 文件抛出的错误文案，被 B 文件用 `includes()` 识别**。

实例：`sidecar/commands.ts` 抛 `不支持的桌面端命令：${command}`，
而 `webview/components/views/settings/account-view.tsx` 靠
`message.includes("unsupported desktop command: cline_account")`
来把原始错误换成友好的中文提示。汉化 sidecar 后该分支永不命中 ——
用户会看到未加工的英文错误。

**修法：两侧都接受**（英文分支保留以兼容英文构建与历史进程）。

```ts
if (
	message.includes("unsupported desktop command: cline_account") ||
	message.includes("不支持的桌面端命令：cline_account")
) { … }
```

### 翻译前的必做检查

改动任何**面向用户的字符串**前，先搜它是否被别处比较：

```bash
# 在仓库根执行；把 <片段> 换成原文里的一段特征子串
grep -rn '<片段>' --include=*.ts --include=*.tsx apps sdk | grep -v '\.test\.'
```

命中 `.includes(` / `===` / `startsWith(` / `switch` 的位置就是契约点。
若契约点在你没打算改的另一个文件里，**两边必须同一个 commit 一起改**，
并补一个断言两侧文案的回归测试。

新增 UI 文案或错误提示时，请一并检查它是否被代码比较。

---

## 术语

翻译前务必查 [`docs/GLOSSARY.md`](../../docs/GLOSSARY.md)。
几个高频易错点：

| 概念 | 正确译法 | 常见错误 |
|---|---|---|
| Provider | **供应商** | ❌ 服务商（GLOSSARY 明令禁用） |
| LLM token | **词元** | ❌ 令牌（`令牌` 专留给鉴权语境，如 Bearer 令牌） |
| Session | **会话** | ❌ 对话 |
| Agent | **智能体** | — |
| 省略号 | `…`（单字符） | ❌ `...` |

术语表里没有的词，翻译后**必须回填** `docs/GLOSSARY.md`。