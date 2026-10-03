# 贡献指南

本仓库是 [cline/cline](https://github.com/cline/cline) 的**非官方**简体中文本地化 fork。
欢迎提交汉化修正、术语建议与漏翻报告。

> ⚠️ **与汉化无关**的内容不属于本仓库范围 —— Cline 的功能问题、上游 bug、新特性请求请到
> [上游仓库](https://github.com/cline/cline/issues) 反馈。本仓库明确不改 agent 行为逻辑、
> 不改工具协议、不改 API 调用方式，只做文本层。

## 动手前先读

- [`docs/GLOSSARY.md`](docs/GLOSSARY.md) —— 术语表，**强制遵守**，同一术语全项目必须同一译法
- [`docs/I18N-ARCHITECTURE.md`](docs/I18N-ARCHITECTURE.md) —— 汉化范围与实现方式
- [`MODIFICATIONS.md`](MODIFICATIONS.md) —— 相对上游改了哪些东西（含 4 项功能性修改）

**明确不译**：系统提示词（`sdk/packages/shared/src/prompt/**`，发给模型的 prompt 保持英文）、
命令名 / 事件名 / IPC type / 工具名与参数名 / CSS 类名 / `data-*` `aria-*` 枚举值 /
`localStorage` 键 / API 字段名 / 产品名。

## 改完必须跑的两道校验

```bash
node tools/i18n/check-enums.mjs <你改的文件>    # 检测枚举值被误译
node tools/i18n/check-syntax.mjs <你改的文件>   # 检测文本替换造成的语法损坏
```

`check-enums.mjs` 尤其重要：当同一个字符串**既用于界面显示又用于逻辑比较**时，
只翻文案不改匹配逻辑会造成**静默的功能回归**——不报错、测试也可能不红，但功能失效。
本仓库已因此踩过一次坑：错误上限弹窗的「停止本次运行」译成中文后不再命中停止分支，
用户点「停止」运行却继续（见 `MODIFICATIONS.md` 第二节第 4 条）。
若你翻译的文案可能被 `===` 比较，请**同批**给匹配逻辑补上译文分支并加测试。

## 译文映射表

译文沉淀在 `tools/i18n/maps/`（36 个 JSON），上游更新后可直接复用。
新增或修改文案时请同步更新对应映射表。

## 提交前

husky 的 pre-commit 会执行 `gitleaks`。本机未安装时提交会被直接拒绝，
可临时 `git commit --no-verify`，但请自行确认没有密钥入库。

## 行为准则

参与本项目即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
