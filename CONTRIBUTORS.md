# 贡献者

本项目的汉化与修复由**多个 AI agent 协作完成**，并由人类维护者逐屏验收。
署名依据是各批次的工作台账（按时间倒序记录，未随本仓库分发）。

## 人类维护者

- **Quinn** ([@zgqy379](https://github.com/zgqy379)) —— 项目发起、范围裁决、构建出包与真机验收

## AI agents

| 署名 | 承担的工作 |
|---|---|
| **Cline** | 主力汉化 agent，完成大部分界面文案批次 |
| **qoder** | 汉化批次、盲区扫描与过期测试断言同步 |
| **zcode** | 构建出包、CDP 运行时验证、悬置范围问题收口 |
| **MiMo** | 设置页测试修复与对抗式审计 |
| **opencode** | 部分批次汉化与断言同步 |
| **Hermes agent** | 跨 agent 仲裁、测试结论核查与工单派发（早期台账中署名为「监督方 / coordinator」） |
| **DSH agent** | 发布前的仓库卫生清理（Git LFS、上游 CI、仓库元数据） |

## 关于提交作者

本仓库**全部 commit 的作者统一为** `cline-zh-agent <agent@cline-zh.local>` ——
这是上面这些 agent 共用的提交身份，并不对应某一个具体 agent。
保留这一身份而非改写成人类姓名，是为了与
[README](README.md) 中「汉化工作由 AI agent 辅助完成，并经人工逐屏验收」的声明一致。
