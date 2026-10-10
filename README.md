<p align="center">
  <img src="assets/icons/icon.png" width="80" alt="Cline" />
</p>

<h1 align="center">Cline 中文版</h1>

<p align="center">
  <strong>Cline 桌面端（Desktop App）的简体中文本地化版本</strong><br>
  非官方社区项目 · 基于 <a href="https://github.com/cline/cline">cline/cline</a> @ <code>desktop-v0.0.45</code> 编译
</p>

---

## 这是什么

Cline 官方桌面端**没有任何 i18n 机制**，也没有官方中文版。本仓库把
**Cline Desktop（Tauri 桌面应用）** 的界面文案整体译为简体中文，并自行编译发布。

**关于"首个汉化版"**：社区此前已有多个 Cline **VS Code 扩展**的汉化 fork
（如 [`HybridTalentComputing/cline-chinese`](https://github.com/HybridTalentComputing/cline-chinese)，
2025 年 2 月起）。本仓库的不同在于**覆盖桌面端**——
VS Code 扩展与桌面端是两套独立的 UI 代码，扩展版的汉化不覆盖桌面应用。

> ⚠️ **本项目与 Cline 官方无隶属关系**，是第三方社区作品。
> Cline 是 Cline Bot Inc. 的商标，本项目仅以描述性方式标明来源。
> 如需官方版本，请前往 [cline.bot](https://cline.bot)。

---

## 下载安装包

已编译好的 **Windows x64** 安装包见 **[Releases](https://github.com/zgqy379/cline-zh/releases/latest)**：

| 文件 | 说明 |
|---|---|
| `Cline-zh-CN_0.0.43_x64-setup.exe` | **推荐**，NSIS 安装包（普通用户） |
| `Cline-zh-CN_0.0.43_x64.msi` | MSI 安装包（企业批量部署） |

> 应用标识为 `bot.cline.app.zh`，可与官方 Cline **同时安装、同时运行**，配置目录与单实例锁互不干扰；
> 但**不共享登录态与 API Key**，首次使用需重新配置。**自动更新已禁用**，升级请手动下载新版本。

---

## 已汉化范围

| 层 | 路径 | 内容 |
|---|---|---|
| L1 | `apps/examples/desktop-app/webview/**` | 桌面端界面文案（会话、聊天、设置、欢迎页、模型选择器…） |
| L2 | `apps/examples/desktop-app/src-tauri/**` | 托盘菜单、macOS 应用菜单、安装包标识 |
| L3 | `apps/examples/desktop-app/sidecar/**` | sidecar 返回给 UI 的用户可见消息 |
| L4 | `sdk/packages/ui/**` | 共享 React 组件库 |
| L5 | `sdk/packages/shared/**`、`sdk/packages/core/**` | 状态标签、内置工具目录描述 |

约 **1500 处**用户可见文案，涉及 **200 个文件**（+3678 / −3204 行）。

**系统提示词未汉化**，保持英文 —— 提示词直接决定模型行为，
翻译需要独立的对照审校，不在本次发布范围内。

### 刻意保留英文的部分

命令名、事件名、IPC type、API 字段名、工具名、CSS 类名、存储键、
Zod schema 的 `.describe()`、产品名与厂商名 —— 这些是协议或标识，翻译会导致功能失效。

---

## 与上游的差异

除汉化外，本仓库还包含 **4 项功能性修改**（主题三态、模型回退、CJK 复数、
错误上限弹窗文案与匹配逻辑解耦），以及构建标识符变更。

**完整清单见 [`MODIFICATIONS.md`](MODIFICATIONS.md)** —— 该文件同时用于满足
Apache-2.0 第 4(b) 条对"修改声明"的要求。
上游英文 README 原样保留在 [`README.upstream.md`](README.upstream.md)。

### 仓库层面的清理（相对上游）

上游的 CI 与发布流水线没有随汉化一起沿用，已按 fork 的实际情况处理：

- **删除 16 个上游 workflow**：全部 `*-publish*.yml`（会向 npm / VS Code Marketplace 发布）、
  `repo-*.yml`（其中 `repo-stale-issues` 是每日 cron，会自动给 issue 打 stale 并关闭）、
  以及 `ext-*.yml`（VS Code / JetBrains 扩展，本 fork 未改动其代码）。
- **保留 2 个并改为仅手动触发**：`desktop-test.yml` 与 `sdk-test.yml` 覆盖本 fork
  实际改动的 `apps/examples/desktop-app` 与 `sdk/packages/{ui,shared,core}`，
  但不再在 push / pull_request 时自动运行。
- **移除失效的 Git LFS 声明**：上游 `.gitattributes` 把 `assets/docs/demo.gif` 标记为
  LFS，而该文件在本仓库只是 133 字节指针、LFS 对象从未存在。该文件全仓无引用，已删除。

### 为什么仓库里是整个 cline 源码？

本仓库是上游**完整源码树**的 fork，现对齐 `desktop-v0.0.45`
（上游原始 commit `476b165b9`，合并点 `7190d75cf`；更早的
`41deb5d` = `desktop-v0.0.37` 的未改动快照），
跟踪 4100+ 个文件，而汉化实际只改动其中约 300 个。其余部分 —— `apps/vscode`（VS Code 扩展）、
`apps/cli`、`apps/cline-hub`、`evals`、上游文档站等 —— 本 fork **一行未动**。

保留完整树而不是只放一份「汉化补丁」，是三个硬约束的结果：

1. **法务可追溯**：[`MODIFICATIONS.md`](MODIFICATIONS.md) 声明本地化改动
   可用 `git diff 476b165b9 HEAD` 复现。Apache-2.0 第 4(b) 条的修改声明要求可追溯，
   裁剪任何目录都会让这句话不成立。
2. **上游更新可重放**：上游发新版后可直接 rebase，再重跑 `tools/i18n/` 的扫描器复用译文映射表。
3. **构建可复现**：桌面端依赖 `sdk/packages/**` 与根 workspace 配置，缺一块就编不出来。

只想看汉化改了什么：

```bash
git diff --stat 476b165b9 HEAD          # ✅ 本地化改动（307 files）
git diff --stat 41deb5d HEAD            # ⚠️ 含 0.0.37→0.0.43 的上游演进
```

> ⚠️ **升级上游时务必逐项复核 `tauri.conf.json`**：本 fork 在该文件上有两处
> 功能性改动（`plugins.updater` 禁用自动更新、`bundle.windows.wix.language`），
> 0.0.43 合并时两处都被打回上游，均已在 `9bfd32c11` / `36d1a938f` 修复。
> 用 `node build-out/silent-revert.mjs <旧基线> HEAD` 做结构化核对。

---

## 构建

### 环境要求

- [Rust](https://rustup.rs/) ≥ 1.85（crate graph 需要 `edition2024`）
- [Bun](https://bun.sh)（本仓库使用 bun，非 npm）
- Visual Studio Build Tools（C++ 生成工具，Windows）
- Linux 需 `libwebkit2gtk-4.1-dev` `libgtk-3-dev` `libayatana-appindicator3-dev` `librsvg2-dev` `libxdo-dev` `libssl-dev`

### 步骤

```bash
git clone https://github.com/zgqy379/cline-zh.git
cd cline

# 桌面端依赖
cd apps/examples/desktop-app
bun install

# 构建共享 UI / SDK 包
cd ../../..
bun install && bun run build:sdk

# 编译桌面端
cd apps/examples/desktop-app
bun run build:sidecar:bin
bun run build          # = bun run bun.mts，产出 webview/out
cargo tauri build      # 或 bun run build:binary
```

产物：

- 可执行文件：`src-tauri/target/release/cline-app.exe`（Windows）
- 安装包：`src-tauri/target/release/bundle/msi/` 与 `bundle/nsis/`

> **提示**：建议设置独立的 `CARGO_TARGET_DIR`，避免与本机已安装的官方 Cline
> 争用构建产物和单实例锁：
> ```bash
> export CARGO_TARGET_DIR=/path/to/your/build-out
> ```

> ⚠️ 本仓库与官方版使用**不同的 bundle identifier**（`bot.cline.app.zh`），
> 两者可以并存，各自使用独立的配置目录。

---

## 测试状态（如实记录）

桌面端全量 vitest 实测（2026-10-08）：**18 条失败**，全部是 Windows 平台差异，
**与汉化无关**。

| 文件 | 条数 | 归因 |
|---|---|---|
| `sidecar/commands-git-worktree.test.ts` | 10 | git 打印 `C:/` 而断言写 `C:\`；`rmSync` 临时目录 `EPERM` |
| `sidecar/commands-settings.test.ts` | 4 | `CLINE_DATA_DIR` 临时目录 `EPERM` 文件锁 |
| `sidecar/chat-session.test.ts` | 2 | 会话 fork 的 workspace 锁时序 |
| `sidecar/logging.test.ts` | 1 | 日志文件不可写时回落 stderr |
| `sidecar/remote-environment-commands.test.ts` | 1 | `spawnSync sh ENOENT`（Windows 无 sh） |

`sdk/packages/ui`：**209/209 全绿**（29 个测试文件）。

失败集合**已验证稳定**：连跑 5 轮（全量 1 轮 + sidecar 目录 4 轮），
sidecar 部分每轮失败名称集合逐字一致。

**基线对照方法**（⚠️ 不要用 `git stash`，本工作区多 Agent 共享）：

```bash
git diff > build-out/x.patch                       # ① 先存 diff
git checkout HEAD -- <改动路径>                     # ② 再还原
node node_modules/vitest/vitest.mjs run <文件> --config vitest.config.ts \
  --reporter=json --outputFile=D:/cline-zh/build-out/base.json
git apply build-out/x.patch                        # ④ 还原（顺序不能反）
```

比对取失败用例**名称集合**做差集，而非比较总数。

汉化致因的失败为 **0**：2026-10-08 对抗审查改动前后失败集合完全一致，
并顺带修绿 1 条（`commands-settings` 的 non-boolean cloud sessions toggle）。
逐条分类见 [`docs/TEST-FAILURE-TRIAGE.md`](docs/TEST-FAILURE-TRIAGE.md)。

---

## 自动更新已禁用

上游的 updater 端点指向官方 release，pubkey 是官方签名密钥 ——
若保持启用，自动更新会把汉化版**静默替换回英文官方版**。
本仓库已置空 `endpoints` 与 `pubkey`。如需自建更新通道，
请同时配置自己的端点与签名密钥。

> ⚠️ **这一段在 0.0.43 合并时曾被整体打回上游**（`9bfd32c11` 修复）。
> 升级上游后请用 `node tools/verify-updater-disabled.mjs` 复核，
> 它会同时检查 `endpoints`、`pubkey` 与 Rust 侧 `updates_enabled()` 的联动。
>
> 顺带一提：托盘的「检查更新」菜单项依赖 `updates_enabled()`，
> 所以禁用自动更新同时也隐藏了该菜单项 —— 这是预期行为。

---

## 商标声明

Apache License 2.0 第 6 条**不授予商标许可**。

本仓库保留上游的图标与 wordmark 素材（`assets/`），**未作替换** ——
它们仅用于**描述性标明来源**（表明这是 Cline 的衍生作品），
不构成对 Cline Bot Inc. 的背书或授权。

「Cline」「Cline 中文版」均为描述性使用。Cline 商标归 Cline Bot Inc. 所有。

本项目**非官方**，与 Cline Bot Inc. 无隶属关系。官方版本见 [cline.bot](https://cline.bot)。

---

## 致谢与许可

- 上游项目：[cline/cline](https://github.com/cline/cline) · Copyright 2026 Cline Bot Inc.
- 本仓库沿用上游的 **Apache License 2.0**，[`LICENSE`](LICENSE) 未作任何改动
- [`NOTICE`](NOTICE) 记录归属与商标立场；[`MODIFICATIONS.md`](MODIFICATIONS.md) 记录全部修改
- 上游英文 README 原样保留在 [`README.upstream.md`](README.upstream.md)
- 汉化工作由 AI agent 辅助完成，并经人工逐屏验收
- 本仓库全部 commit 的作者为 `cline-zh-agent <agent@cline-zh.local>` —— 这是产出这些改动的
  AI agent 身份，未改写成人类身份，以便与「AI 辅助 + 人工验收」的声明保持一致
- 提交时 husky 会执行 `.husky/pre-commit`，其中要求本机已安装 `gitleaks`；未安装时提交会被
  直接拒绝（可临时 `git commit --no-verify`，但请自行确认没有密钥入库）

本项目发布的安装包包含上游 Cline 的源代码编译产物，
遵循 Apache-2.0 第 4 条：保留原许可与版权声明、标明修改内容、不提供任何商标许可。

---

## 汉化工具链

[`tools/i18n/`](tools/i18n/README.md) 提供本项目的校验工具与翻译映射表：

| 工具 | 用途 |
|---|---|
| `check-enums.mjs` | **必跑** —— 检测枚举值被误译导致的静默功能失效 |
| `check-syntax.mjs` | **必跑** —— 检测文本替换造成的语法损坏 |
| `residual.mjs` | 精准扫描残留的用户可见英文 |
| `scan-i18n.mjs` | 定位待译文件（误报较高，仅作索引用） |
| `apply-zh.mjs` | 按映射表精确替换（默认 dry-run） |
| `maps/` | 36 个译文映射 JSON，上游更新后可复用 |

```bash
node tools/i18n/check-enums.mjs <改动的文件>
node tools/i18n/check-syntax.mjs <改动的文件>
```

⚠️ 若新增的 UI 文案**同时被代码 `===` 比较**（如弹窗按钮），翻文案必须同步改匹配逻辑，
否则会造成静默的功能回归。详见 [`tools/i18n/README.md`](tools/i18n/README.md)。