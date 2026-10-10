# Cline 中文版 v0.0.45-zh.1

Cline 桌面端（Tauri）简体中文本地化版本，基于上游 **`desktop-v0.0.45`**（`417526f19`）编译。
非官方社区项目，Apache-2.0，保留上游 `LICENSE`，修改声明见 [`MODIFICATIONS.md`](https://github.com/zgqy379/cline-zh/blob/main/MODIFICATIONS)。

## 下载

| 文件 | 大小 | SHA-256 |
|---|---|---|
| `Cline-zh-CN_0.0.45_x64-setup.exe`（**推荐**，NSIS 安装包） | 97,513,824 B | `466b6601a8e997ee9a415834b179c976ed07fbffb0e000ebe6a45c8123a2ac52` |
| `Cline-zh-CN_0.0.45_x64.msi`（企业批量部署） | 128,718,848 B | `3ce2e41e7bbf5b52deb037ed14f660c9800ab7ea30302673d74f4082c0df7d8f` |

> 仅 Windows x64。应用标识为 `bot.cline.app.zh`，可与官方 Cline **同时安装、同时运行**；
> 但**不共享登录态与 API Key**，首次使用需重新配置。

## 相比 v0.0.43-zh.1 的变更

### 上游 0.0.43 → 0.0.45

| 项 | 值 |
|---|---|
| 上游变更 | 桌面端 23 文件 / +1676 −129；L1~L5 相关 30 文件 / +4333 −104 |
| 冲突 | 8 处，逐个人工解决（含 `tauri.conf.json` 的两处 fork 功能改动均保住） |
| 汉化丢失 | `merge-regress.mjs` 检测 **0 条** |
| **系统提示词层** | **零改动**（未触碰 T2 红线） |

### 本地化增量

- **mermaid 图表 UI 17 处**：上游 0.0.45 新增的 `mermaid-block.tsx`（L4 共享组件库）带来的
  用户可见英文全部汉化（下载图表 / 放大 / 缩小 / 全屏查看 / 退出全屏 / 复制图表源码 /
  正在绘制图表… / 正在渲染图表… / Mermaid 错误 / 重试 等）
- **1 处合并漏翻**：上游把 `listGitBranches` 重构出 `runGit` 辅助函数，
  `Remote environment service is unavailable` 随新函数进仓，已补为「远程环境服务不可用」
- **3 处契约点同步**：`aria-label` 选择器、`textContent` 精确匹配、`toContain` 文本断言，
  源与测试断言同一提交修改（否则测试选择器失配）

### 验证（均为实跑）

- **全量回归 1759 用例 / 16 红**，与合并前基线（1724/17）做**失败名称集合差集** →
  **新增真实失败 0**；webview 侧 0 红，16 条全为 Windows 平台既有红
- **残留扫描四层**：webview 37 / sidecar 30（均逐条判定为禁改，含第三方产品名、
  计费档位、HTTP 头名、GitHub API 枚举、回传模型的串等）/ ui 组件 0 / shared 0
- **产物二进制验证**：webview chunk 汉化抽查 14/15 命中（`新建会话`×3、`定时任务`×7、
  `下载图表`×7、`Mermaid 错误`、`正在绘制图表`…）；反向抽查 `New Session` /
  `Drawing diagram` / `Thinking level` / `Untitled task` 全部已消失
- **实机安装验证**：NSIS [人物3]安装 → `ProductVersion 0.0.45`，启动成功、
  sidecar 正常拉起、窗口标题 `Cline v0.0.45`，截屏确认 UI [人物2]
- **`LICENSE` 与上游逐字节一致**（md5 `3049e104…`）

## ⚠️ 重要说明

- **自动更新已禁用**。上游的 `plugins.updater` 指向官方 release 与官方 minisign 公钥，
  若启用会自动把本中文版覆盖成英文官方版。本版本 `pubkey=""`、`endpoints=[]`，
  并隐藏托盘「检查更新」项。**升级请手动下载新版本。**
- **未汉化部分**：系统提示词（发给大模型的 system prompt，`sdk/packages/shared/src/prompt/**`）
  保持英文原文 —— 翻译会实质改变模型行为，属用户明确搁置的范围。
  另外 `CHANGELOG.md` 为上游原文，故应用内 What's-New 显示英文。
- **macOS 未验证**：原生菜单代码被 `#[cfg(target_os = "macos")]` 门控，
  Windows 构建不编译该函数，因此**零构建验证**。本发布面向 Windows，不对 macOS 作可用性承诺。
- **商标**：Apache-2.0 不授予商标权。「Cline」及 Cline logo 归 Cline Bot Inc. 所有，
  此处仅以描述性方式标明来源，不暗示任何认可或附属关系。

## 校验下载完整性

```powershell
Get-FileHash .\Cline-zh-CN_0.0.45_x64-setup.exe -Algorithm SHA256
```

---

非官方社区作品，与 Cline Bot Inc. 无隶属关系。官方版本见 [cline.bot](https://cline.bot)。
