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

### `residual.mjs` —— 精准残留扫描（推荐）

```bash
node tools/i18n/residual.mjs <目录>
```

找出「已汉化文件里还剩下的用户可见英文」。只匹配**明确是展示文案**的形态
（`title`/`placeholder`/`aria-label`/`alt`/`label`/`description` 等属性直接赋英文短语、
独占一行且首字母大写的 JSX 裸文本）。

> **不要用 `scan-i18n.mjs` 做残留检查** —— 它的启发式会把 className、
> import 路径、逻辑枚举统统算成候选，误报率极高。

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

---

## 映射表（`maps/`）

36 个 JSON 文件，每个对应一个源文件，格式为 `{"英文原文": "中文译文"}`。

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