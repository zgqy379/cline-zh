# 安全策略

## 本仓库的定位

本仓库是 [cline/cline](https://github.com/cline/cline) 的**第三方非官方**简体中文本地化版本，
与 Cline Bot Inc. 无隶属关系，也不共享任何基础设施或发布渠道。

因此漏洞请按来源分别上报：

| 问题来源 | 上报渠道 |
|---|---|
| **上游 Cline 本身**（agent 行为、工具协议、API 调用、扩展 / CLI） | 按上游的 [Security Policy](https://github.com/cline/cline/security/policy) 报给 Cline Bot Inc.（Bugcrowd VDP 或 security@cline.bot）。本仓库无权受理，也无从修复。 |
| **本仓库自己引入的问题**（汉化改动、构建标识变更、打包脚本、Releases 里的安装包） | 在本仓库提交 [Security Advisory](https://github.com/zgqy379/cline-zh/security/advisories/new)，或开 issue。 |

本仓库**没有**安全响应团队，也没有 SLA —— 这是一个个人维护的社区 fork，请知悉。

## 关于安装包

- Releases 中的安装包为**自行编译**，**未使用**上游的代码签名证书，安装时可能出现「未知发布者」提示。
- 下载后请核对 Releases 页面给出的 **SHA-256** 再安装。
- 官方安装包请从 [cline.bot](https://cline.bot) 获取。

## 自动更新已禁用

本仓库已置空 Tauri updater 的 `endpoints` 与 `pubkey`（见 [MODIFICATIONS.md](MODIFICATIONS.md)）。
原因：上游更新通道会把汉化版**静默替换回英文官方版**。

**代价**：本版本不会自动更新，也不会自动收到安全修复。请关注本仓库的 Releases 手动升级。
