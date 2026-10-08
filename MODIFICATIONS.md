# MODIFICATIONS

本文件说明本仓库相对上游 Cline 做了哪些修改，依据 Apache License 2.0 第 4(b) 条
（"You must cause any modified files to carry prominent notices stating that You
changed the files."）。上游许可证全文保留在 [`LICENSE`](LICENSE)，未作任何改动。

---

## 上游来源

| 项 | 值 |
|---|---|
| 上游项目 | [cline/cline](https://github.com/cline/cline) |
| 对齐标签 | **`desktop-v0.0.43`**（2026-10-07 起；此前为 `desktop-v0.0.37`） |
| 上游版权 | Copyright 2026 Cline Bot Inc. |
| 许可 | Apache License 2.0（见 [`LICENSE`](LICENSE)） |
| 0.0.37 原始基线 commit | `41deb5d`（"BASELINE: cline desktop-v0.0.37 upstream source (unmodified)"） |
| 0.0.37 基线 tree hash | `6f6d2e38b0f1479eab178186c3b83f110473cb1b` |
| **上游 0.0.43 合并点** | **`7190d75cf`**（`merge: 合并上游 desktop-v0.0.43`） |
| **上游 0.0.43 原始 commit** | **`476b165b9`**（合并点的第二父提交；`chore(desktop): trim v0.0.43 changelog`） |

本仓库 = 上游 `desktop-v0.0.43`（`476b165b9`）＋ 其上的本地化改动。

### ⚠️ 如何复现差异（0.0.43 之后口径已变）

```bash
# ✅ 只看本地化改动：与上游 0.0.43 原始 commit 比较
git diff 476b165b9 HEAD          # 307 files, +8050 / −9323

# ❌ 不要用合并点 7190d75cf：合并时未冲突文件的汉化已被保留，
#    拿它当基准只会看到合并之后的增量（37 files），不是全部本地化改动。

# ⚠️ 与 0.0.37 原始快照比较：会同时混入两个版本之间的上游演进
#    （702 files, +35093 / −17370），仅用于追溯 0.0.37 时期的批次。
git diff 41deb5d HEAD
```

> 2026-10-07 之前，本文件把 `git diff 41deb5d HEAD` 描述为「与上游的**全部**差异」。
> 合并上游 0.0.43 后该说法不再成立，故改为以上三档口径。

---

## 改动规模

> 口径：`git diff 476b165b9 HEAD -- <路径>`（上游 0.0.43 原始 commit 为基准），
> 实测于 2026-10-08（HEAD = `3f77c61e3`）。

| 区域 | 改动文件数 | 说明 |
|---|---|---|
| `apps/examples/desktop-app/webview/**` | 144 | 桌面端界面文案 |
| `apps/examples/desktop-app/sidecar/**` | 30 | sidecar 抛给 UI 的用户可见消息 |
| `sdk/packages/ui/**` | 27 | 共享 React 组件库（含测试断言同步） |
| `sdk/packages/core/**` | 5 | 内置工具目录描述、云端会话事件消息 |
| `apps/examples/desktop-app/src-tauri/**` | 2 | 托盘菜单、窗口/安装包标识 |
| `sdk/packages/shared/**` | 1 | 连接器配置文案 |
| `tools/i18n/**` | 57 | 本仓库新增的校验工具与译文映射表（见第七节） |
| 其他（`.gitignore`、`MODIFICATIONS.md`、`NOTICE`、`README.md`、`README.upstream.md`、`CHANGELOG.md`） | 6 | 见下 |
| **合计** | **307** | **+8050 / −9323 行** |

本地化方式为**编译期硬替换**（非运行时 i18n 框架）。未引入任何新依赖。

---

## 一、界面文案汉化（T1）

约 1600 处用户可见字符串译为简体中文，覆盖：

- 桌面端全部界面文案（会话列表、聊天、设置、欢迎页、模型选择器等）
- 应用内展示的更新日志（`apps/examples/desktop-app/CHANGELOG.md`）
- sidecar 通过 ask-question / toast / error 通道返回给 UI 的消息
- 共享组件库 `@cline/ui` 中的状态标签与工具摘要
- 原生层托盘菜单与 macOS 应用菜单文案

测试断言同步量随批次累积，2026-10-08 实测 `desktop-app` 下
`toBe/toContain/toEqual/toThrow/toMatch` 断言共约 **2900 条**，
其中因汉化而需要改词面的是其中一部分（每批由 `tools/i18n/` 的映射表驱动）。
逐批记录见 `docs/PROGRESS.md` 的批次看板。

### 刻意不翻译的部分

以下属于协议或标识，翻译会导致功能失效，因此**保持英文**：

- 命令名、事件名、IPC message type、API 字段名、JSON key
- 工具名与参数名（`read_files` `editor` `run_commands` …）
- **参数名校验错误串里的参数名本体**：`sessionId is required` 译作
  `sessionId 为必填项` —— 参数名留原文、句式译中文（2026-10-08 对抗审查更正：
  此前一度误判为「整句保留英文」，与本 fork 自 0.0.37 起的一贯做法冲突，已回退）
- CSS 类名、`data-*` / `aria-*` 的枚举值、DOM id
- `localStorage` key、配置键名、环境变量名
- 存储契约值（如主题偏好 `"light" | "dark" | "system"`）
- Zod schema 的 `.describe()`（发给模型的语义描述，保持与英文 prompt 一致）
  ⚠️ 例外：`sdk/packages/core/src/extensions/tools/runtime.ts` 的
  `BASE_TOOL_CATALOG[].description` **已汉化**。经核查，该目录表的 `description`
  在桌面交付链路上只被 `sidecar/commands.ts` 的扩展清单读取并渲染到 UI
  （`getCoreBuiltinToolCatalog` 的其余调用方一律只取 `id`）；
  唯一把描述送进模型 user-instructions 的是 `apps/cline-hub/`，而该应用
  **不在桌面交付链路上**（`desktop-app/package.json` 不依赖它，Tauri 只打包
  `bin/code-sidecar`）。详见 `docs/PROGRESS.md` §8bis。
- 产品名与厂商名：Cline、VS Code、MCP、JSON、Anthropic、OpenAI 等

---

## 二、功能性修改（非文案，共 5 项）

以下改动**超出纯本地化范围**，会改变运行时行为或构建行为，特此显式声明。

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

### 5. `bun.lock` 的桌面端包版本对齐（commit `fa5f5e5fb`）

- 上游在 `desktop-app/package.json` 升到 `0.0.43` 时没有同步重新生成 `bun.lock`，
  锁文件里的 workspace 版本停在 `0.0.41`。
- 现将 `bun.lock` 中 `apps/examples/desktop-app` 的版本改为 `0.0.43`，与
  `package.json` 一致，避免 `bun install` 后产生无意义 diff。
- 不影响构建产物：CI 用的是普通 `bun install`（非 `--frozen-lockfile`）。
- ⚠️ 本项属**上游元数据不一致**的修补，不是汉化需求，可独立回退。

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

桌面端全量 vitest 实测（2026-10-08，`build-out/b58-full-names.txt`）：
**18 条失败**，全部为 Windows 平台差异，**与汉化无关**。

| 文件 | 条数 | 归因 |
|---|---|---|
| `sidecar/commands-git-worktree.test.ts` | 10 | git 打印 `C:/` 而断言写 `C:\`；`rmSync` 临时目录 `EPERM`；Windows 下 `git worktree` 行为差异 |
| `sidecar/commands-settings.test.ts` | 4 | `CLINE_DATA_DIR` 临时目录 `EPERM` 文件锁 |
| `sidecar/chat-session.test.ts` | 2 | 会话 fork 的 workspace 锁时序 |
| `sidecar/logging.test.ts` | 1 | 日志文件不可写时回落 stderr 的 Windows 行为 |
| `sidecar/remote-environment-commands.test.ts` | 1 | `spawnSync sh ENOENT`（Windows 无 sh） |

`sdk/packages/ui`：29 个测试文件 **209/209 全绿**。

失败集合**已验证稳定**：连跑 5 轮（全量 1 轮 + sidecar 目录 4 轮），
sidecar 部分每轮失败集合逐字一致。

**基线对照方法**（⚠️ 已更新，勿再用 `git stash`）：本工作区为多 Agent 共享，
`git stash` 会连带 stash 掉他人的在途改动，已被禁用。正确做法：

```bash
git diff > build-out/x.patch        # ① 先存 diff
git checkout HEAD -- <改动路径>      # ② 再还原
node node_modules/vitest/vitest.mjs run <文件> --config vitest.config.ts \
  --reporter=json --outputFile=D:/cline-zh/build-out/base.json   # ③ 跑基线
git apply build-out/x.patch         # ④ 还原（顺序不能反，反了会静默丢文件）
```

失败集合对比（**比计数更可靠**，计数会被并行抖动干扰）：

```bash
node -e "const d=require('D:/cline-zh/build-out/base.json');for(const t of d.testResults)for(const a of t.assertionResults)if(a.status==='failed')console.log(a.fullName)" | sort
```

**翻译致因的失败为 0**。本轮（2026-10-08 对抗审查）实测：
改动前后失败集合**完全一致**，且顺带修绿 1 条
（`commands-settings` 的 `rejects a non-boolean cloud sessions toggle value`）。
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