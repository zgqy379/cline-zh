<p align="center">
  <img src="assets/icons/icon.png" width="80" alt="Cline" />
</p>

<h1 align="center">Cline 中文版</h1>

<p align="center">
  <strong>Cline 桌面端（Desktop App）的简体中文本地化版本</strong><br>
  非官方社区项目 · 基于 <a href="https://github.com/cline/cline">cline/cline</a> @ <code>desktop-v0.0.37</code> 编译
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

桌面端全量 vitest 实测：**1656 用例，约 20 条失败**（Windows）。

⚠️ **失败数不是稳定值**：同一份代码连跑两次分别得到 19 / 21 条。
这是该仓库长期存在的**并行抖动**——sidecar 测试大量起真实端口与子进程，
并行时互相争用；单个用例隔离复跑全部通过。所以此处只给量级，不写精确值。

**稳定的是基线对照**：在**未改动的上游基线**（`41deb5d`）上同机跑，
失败用例名称集合与本仓库做 `comm` 差集：

- **零新增失败**
- 基线 30 条 → 当前 23 条（去重后），**净减少 4 条**：
  `chat-input-bar` 的 3 条 token ring 断言 + 1 条 cline-pass picker

比对方法是取失败用例**名称集合**做差集，而非比较总数——总数会被抖动干扰。

另需说明：汉化致因的失败也已全部清零。其中早期 6 条见 commit `e54ba5d`，
7 条由 commit `10c3745` 修掉（`composio.test.ts` 1 条与
`chat-messages.test.tsx` 6 条——这两处是本轮翻译使源码变中文后
断言未同步所致，基线上本为绿，故不计入上述差集）。

失败全部与汉化无关，属 Windows 平台差异，在 Linux / macOS 上不复现：
git 路径分隔符（`C:/` vs `C:\`）、`EPERM` 删临时目录、模型目录异步加载的
flake，以及 4 个 `scripts/*` 测试文件在 Windows 上整体未收集
（仅在对应平台运行）。逐条分类见
[`docs/TEST-FAILURE-TRIAGE.md`](docs/TEST-FAILURE-TRIAGE.md)。

---

## 自动更新已禁用

上游的 updater 端点指向官方 release，pubkey 是官方签名密钥 ——
若保持启用，自动更新会把汉化版**静默替换回英文官方版**。
本仓库已置空 `endpoints` 与 `pubkey`。如需自建更新通道，
请同时配置自己的端点与签名密钥。

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