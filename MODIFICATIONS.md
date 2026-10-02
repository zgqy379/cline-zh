# MODIFICATIONS

本文件说明本仓库相对上游 Cline 做了哪些修改，依据 Apache License 2.0 第 4(b) 条
（"You must cause any modified files to carry prominent notices stating that You
changed the files."）。上游许可证全文保留在 [`LICENSE`](LICENSE)，未作任何改动。

---

## 上游来源

| 项 | 值 |
|---|---|
| 上游项目 | [cline/cline](https://github.com/cline/cline) |
| 对齐标签 | `desktop-v0.0.37` |
| 上游版权 | Copyright 2026 Cline Bot Inc. |
| 许可 | Apache License 2.0（见 [`LICENSE`](LICENSE)） |
| 本仓库基线 commit | `41deb5d`（"BASELINE: cline desktop-v0.0.37 upstream source (unmodified)"） |
| 基线 tree hash | `6f6d2e38b0f1479eab178186c3b83f110473cb1b` |

`41deb5d` 是上游 `desktop-v0.0.37` 的**未改动**快照。所有本地修改都在其之上。

本仓库与上游的**全部**差异可用一条命令复现：

```bash
git diff 41deb5d HEAD
```

---

## 改动规模

| 区域 | 改动文件数 | 说明 |
|---|---|---|
| `apps/examples/desktop-app/webview/**` | 138 | 桌面端界面文案 |
| `apps/examples/desktop-app/sidecar/**` | 28 | sidecar 抛给 UI 的用户可见消息 |
| `sdk/packages/ui/**` | 25 | 共享 React 组件库（含测试断言同步） |
| `apps/examples/desktop-app/src-tauri/**` | 2 | 托盘菜单、窗口/安装包标识 |
| `sdk/packages/shared/**` | 1 | 连接器配置文案 |
| `sdk/packages/core/**` | 1 | 内置工具目录描述 |
| 其他（`.gitignore`、`bun.lock`、CHANGELOG 等） | 5 | 见下 |
| **合计** | **200** | **+3678 / −3204 行** |

本地化方式为**编译期硬替换**（非运行时 i18n 框架）。未引入任何新依赖。

---

## 一、界面文案汉化（T1）

约 1500 处用户可见字符串译为简体中文，覆盖：

- 桌面端全部界面文案（会话列表、聊天、设置、欢迎页、模型选择器等）
- 应用内展示的更新日志（`apps/examples/desktop-app/CHANGELOG.md`）
- sidecar 通过 ask-question / toast / error 通道返回给 UI 的消息
- 共享组件库 `@cline/ui` 中的状态标签与工具摘要
- 原生层托盘菜单与 macOS 应用菜单文案

同步更新了 **354 处测试断言**，使其与汉化后的界面文案一致。

### 刻意不翻译的部分

以下属于协议或标识，翻译会导致功能失效，因此**保持英文**：

- 命令名、事件名、IPC message type、API 字段名、JSON key
- 工具名与参数名（`read_files` `editor` `run_commands` …）
- CSS 类名、`data-*` / `aria-*` 的枚举值、DOM id
- `localStorage` key、配置键名、环境变量名
- 存储契约值（如主题偏好 `"light" | "dark" | "system"`）
- Zod schema 的 `.describe()`（发给模型的语义描述，保持与英文 prompt 一致）
- 产品名与厂商名：Cline、VS Code、MCP、JSON、Anthropic、OpenAI 等

---

## 二、功能性修改（非文案，共 4 项）

以下改动**超出纯本地化范围**，会改变运行时行为，特此显式声明。

### 1. 三态主题支持（`webview/lib/theme.ts`）

- commit `636ae0e` `59a702d` `d82440c`
- 原实现只在「从未手动设置过主题」时跟随系统，点过一次开关就永久锁定；
  设置页也只有「深色模式」一个开关。
- 现改为 `light | dark | system` 三态，并修复 WebView2 下
  `prefers-color-scheme` 不派发 `change` 事件、且既有 `MediaQueryList`
  实例的 `matches` 值不更新的两个问题（改为每 tick 重新 `matchMedia()`）。
- `localStorage` 键名 `cline-hub-theme` 不变，向后兼容旧值。
- 新增 15 个回归测试。

### 2. 模型下架后的回退（`webview/components/views/chat/chat-input-bar.tsx`）

- commit `a0b8348`
- 当配置里的模型已从服务端目录消失时，选择器会一直停在这个不存在的模型上，
  记忆中的上次选择再也轮不到。现仅对「幽灵模型」回退到记忆中的模型，
  其余路径逐字保持上游行为。
- 新增 4 个回归测试。

### 3. CJK 复数处理（`sdk/packages/ui/.../tool-summary/team.ts`）

- commit `e1e0282`
- `pluralize` 按英文规则给名词加 `s`，译成中文后会输出「2 文件s」。
  现对含 CJK 字符的名词跳过复数后缀。

### 4. 错误上限询问弹窗（`sidecar/chat-session.ts`）

- 本仓库修改
- 弹窗文案汉化，并**将选项文案与答案匹配键解耦**
  （`MISTAKE_LIMIT_*_LABEL` 用于显示，`MISTAKE_LIMIT_*_ANSWERS` 用于匹配）。
- 原因：这两个字符串原本同时承担「UI 文案」与「用户答案比较基准」两个职责。
  若只翻译文案而不同步匹配集合，用户点击「停止本次运行」将不再命中停止分支，
  而是被当成自定义指导回灌给模型 —— **运行不会停止**。这是功能性回归而非文案问题。
- 匹配集合同时接受中英文，以兼容历史会话与 CLI 侧回传的英文原文。
- 新增 6 个回归测试。

---

## 三、构建与标识

| 文件 | 改动 | 原因 |
|---|---|---|
| `src-tauri/tauri.conf.json` | `productName`: `Cline` → `Cline 中文版` | 区分官方版 |
| `src-tauri/tauri.conf.json` | `identifier`: `bot.cline.app` → `bot.cline.app.zh` | `tauri_plugin_single_instance` 以 bundle id 为锁键；共用会导致两个安装互相抢占、且写同一份 AppData |
| `src-tauri/tauri.conf.json` | updater `pubkey`/`endpoints` 置空 | 上游端点指向官方 release 且 pubkey 是官方签名密钥，自动更新会把汉化版静默替换回英文官方版 |
| `src-tauri/tauri.conf.json` | WiX `language: zh-CN`、中/英短描述 | 安装器本地化 |

未改动的身份字符串：窗口标题 `"Cline"`、`webview/app/layout.tsx` 的 HTML title、
`package.json` 的 `"name": "@cline/code"`（改动会破坏 workspace filter 与 CI）、
`User-Agent: Cline/${version}`。

---

## 四、测试状态（如实记录）

桌面端全量 vitest 实测：**1656 用例，约 20 条失败**（Windows）。

⚠️ 失败数**不是稳定值**：同一份代码连跑三次分别得19 / 21 / 27 条
（去重后 23 条唯一用例）。这是该仓库长期存在的并行抖动（`PROGRESS.md`
已多次登记「同一份代码连跑两次互相翻转」），sidecar 测试大量起真实端口
与子进程、并行时互相争用，隔离复跑均通过。此处只给量级。

**稳定的是基线对照**：`git stash` 后跑未改动的上游基线`41deb5d`，
取失败用例名称集合做 `comm` 差集（而非比较总数，总数会被抖动干扰）：

- **零新增失败**
- 本轮净修复 4 条（`chat-input-bar` 的 3 条 token ring 断言 + 1 条
  cline-pass picker），另有 5 条在更早批次已修

**汉化致因的失败已全部清零**：早期 6 条见 commit `e54ba5d`；本轮又修掉
5 条——`composio.test.ts` 1 条（`zeroToolsWarning` 译中文后断言未同步）与
`chat-messages.test.tsx` 4 条（图片附件 `alt`/`aria-label` 译中文后
11 处选择器断言未同步，其中 4 条因参数化用例而计为多条）。

剩余失败**均非汉化导致**，属 Windows 平台差异（git 路径分隔符、
`EPERM` 删临时目录、模型目录异步加载的 flake），在 Linux / macOS 上不复现；
另有 4 个 `scripts/*` 测试文件在 Windows 上整体未收集。
逐条分类见 `docs/TEST-FAILURE-TRIAGE.md`。

---

## 五、商标

Apache License 2.0 第 6 条**不授予商标许可**。本仓库：

- 保留上游 `LICENSE` 与版权声明
- 保留上游图标与 wordmark 素材（`assets/`），未作替换
- 产品名使用「Cline 中文版」这一**描述性 nominative 用法**，表明来源与官方版的区别
- 本仓库是**非官方**项目，与 Cline Bot Inc. 无隶属关系

若你计划长期维护，建议后续评估是否替换图标素材以进一步降低商标风险。

---

## 六、再分发

本仓库为源码形式。构建产物（`cline-app.exe`、MSI、NSIS 安装包）**不随仓库分发**，
需按 [`README.md`](README.md) 的构建章节自行编译。

上游 `apps/examples/desktop-app/sidecar/bin/` 等二进制目录已被 `.gitignore` 排除，
仓库内不含任何预编译二进制。

---

## 七、本仓库新增的文件

以下文件为本仓库新增，不存在于上游：

| 文件 | 用途 |
|---|---|
| `MODIFICATIONS.md` | 本文件 —— 满足 §4(b) 修改声明 |
| `NOTICE` | 归属与商标立场（上游无 NOTICE，此为惯例补充） |
| `README.upstream.md` | 上游英文 README 原样保留，满足归属要求 |
| `tools/i18n/**` | 汉化校验工具（10 个脚本）与译文映射表（36 个 JSON） |

`tools/i18n/` 的用法见 [`tools/i18n/README.md`](tools/i18n/README.md)。
其中 `check-enums.mjs` 尤其重要：它检测「枚举值被误译」导致的**静默功能失效** ——
即字符串同时用于逻辑判断和界面显示，翻译后条件永不成立且不报错。

映射表（`tools/i18n/maps/`）是上游更新后重放汉化的依据：
新版发布后重跑 `scan-i18n.mjs` 定位变更文案，再从对应 map 取译文即可。

---

## 八、系统提示词未汉化的说明

`sdk/packages/shared/src/prompt/**`（`act.ts` `yolo.ts` `cline.ts`）
**保持英文原样**，本仓库未作任何修改。

原因：提示词直接决定模型行为，翻译错误会实质性降低代码质量，
需要独立的逐句对照审校周期，不适合与 UI 汉化混在同一次发布中。

界面上展示给用户的更新日志（`apps/examples/desktop-app/CHANGELOG.md`）已汉化 ——
那是 UI 文本，与发给模型的提示词是两回事。