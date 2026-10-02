# 术语对照表（GLOSSARY）

> ⚠️ **所有参与翻译的 Agent 必须遵守此表。** 同一术语在 UI 和提示词中必须使用同一译法，
> 否则会出现「同一功能在不同页面叫不同名字」的严重体验问题。
>
> **用法**：翻译任何词条前先在此表查证；表中没有的词，翻译后**必须回填本表**。

---

## 一、核心概念（Cline 特有，必须精确）

| 英文 | 中文 | 说明 |
|---|---|---|
| General | 通用 | 设置分区（侧边栏导航）。全项目此前无先例，2026-09-29 监督方裁定 |
| Schedule | 定时/定时任务 | 侧边栏导航行「定时任务」；概览标签「定时」 |
| Run | 运行 | 定时任务运行次数（Run N→运行 N）。⚠️ 数据契约字面量 `"run"` 不译 |
| Installed | 已安装 | 侧边栏「自定义」分组子标签（Customize 分区的显示名） |
| Session | 会话 | 一次完整的对话/任务上下文。**不要译为"对话"或"会话组"** |
| New Session | 新建会话 | |
| Session history | 会话历史 | |
| Task | 任务 | |
| Workspace | 工作区 | 根目录概念 |
| Workspace root | 工作区根目录 | |
| Agent | 智能体 | 指 AI agent。UI 中可简称"智能体" |
| Subagent | 子智能体 | |
| Agent Teams | 智能体团队 | 官方特性名 |
| Sidecar | 边车进程 | 一般保留 Sidecar，不译 |
| Hooks | 钩子 | |
| MCP (Model Context Protocol) | MCP（模型上下文协议） | 首次出现给全称 |
| Checkpoint | 检查点 | 快照功能 |
| Plan Mode | 规划模式 | |
| Act Mode | 执行模式 | |
| Auto-approve | 自动批准 | |
| ClinePass | ClinePass | 品牌名，不译 |
| Marketplace | 应用市场 | |
| Plugin | 插件 | |

## 二、界面元素

| 英文 | 中文 |
|---|---|
| Settings | 设置 |
| Search | 搜索 |
| Cancel | 取消 |
| Confirm | 确认 |
| Save | 保存 |
| Delete | 删除 |
| Remove | 移除 |
| Edit | 编辑 |
| Rename | 重命名 |
| Create | 创建 |
| New | 新建 |
| Open | 打开 |
| Close | 关闭 |
| Close all | 全部关闭 |
| Refresh | 刷新 |
| Retry | 重试 |
| Loading | 加载中 |
| Save | 保存 |
| Apply | 应用 |
| Copy | 复制 |
| Copied | 已复制 |
| Download | 下载 |
| Upload | 上传 |
| Import | 导入 |
| Export | 导出 |
| Back | 返回 |
| Next | 下一步 |
| Finish | 完成 |
| Skip | 跳过 |
| More | 更多 |
| Options | 选项 |
| Details | 详情 |
| Summary | 摘要 |
| Preview | 预览 |
| Show | 显示 |
| Hide | 隐藏 |
| Expand | 展开 |
| Collapse | 折叠 |
| Add | 添加 |
| Remove | 移除 |
| Configure | 配置 |
| Disconnect | 断开连接 |
| Reconnect | 重新连接 |
| Connect | 连接 |
| Enabled | 已启用 |
| Disabled | 已禁用 |
| Default | 默认 |

## 三、状态与消息

| 英文 | 中文 |
|---|---|
| Healthy | 正常 |
| Error | 错误 |
| Warning | 警告 |
| Success | 成功 |
| Failed | 失败 |
| Pending | 等待中 |
| Running | 运行中 |
| Completed | 已完成 |
| Cancelled | 已取消 |
| Disconnected | 已断开 |
| Starting up... | 正在启动… |
| Untitled | 未命名 |
| No results | 无结果 |
| Not found | 未找到 |
| Something went wrong | 出现错误 |
| Try again | 重试 |

## 四、代码与开发相关（提示词高频，务必统一）

| 英文 | 中文 |
|---|---|
| Tool | 工具 |
| Tool call | 工具调用 |
| Command | 命令 |
| Terminal | 终端 |
| File | 文件 |
| Folder | 文件夹 |
| Diff | 差异 |
| Code edit | 代码编辑 |
| Apply edit | 应用编辑 |
| Revert | 还原 |
| Accept | 接受 |
| Reject | 拒绝 |
| Proceed | 继续执行 |
| Proceed with this action | 执行此操作 |
| This action requires approval | 此操作需要批准 |
| Requesting approval | 请求批准中 |
| Edit a file | 编辑文件 |
| Read a file | 读取文件 |
| Run a command | 运行命令 |
| List files | 列出文件 |
| Search files | 搜索文件 |
| Browser action | 浏览器操作 |
| Web search | 网络搜索 |
| Fetch | 获取 |
| Environment details | 环境信息 |
| System prompt | 系统提示词 |
| User instructions | 用户指令 |
| Custom instructions | 自定义指令 |
| Memory | 记忆 |
| Rules | 规则 |
| Skills | 技能 |

## 五、模型与供应商

| 英文 | 中文 |
|---|---|
| Model | 模型 |
| Provider | 供应商 / 提供方（⚠️ 禁写「服务商」，B30 `96286c3` 已统一存量 19 处） |
| API key | API 密钥 |
| Base URL | 接口地址 |
| Anthropic / OpenAI / Gemini | 保持原名 |
| OpenRouter | OpenRouter |
| Ollama / LM Studio | 保持原名 |
| Token | 词元（LLM token 语境；2026-10-01 human 裁定，替代早期「令牌」。**鉴权语境的 access token 仍译「令牌」**，如 Bearer 令牌） |
| Context length | 上下文长度 |
| Max tokens | 最大词元数 |
| Temperature | 温度 |
| Streaming | 流式输出 |
| Reasoning | 推理 |

## 六、格式约定

- **省略号**：中文用 `…`（单字符），不用 `...`
- **标点**：中文语境用全角标点（，。！？：）
- **快捷键提示**：保留原样，如 `Ctrl+P`、`↵`、`↑↓`
- **代码/命令/路径**：保持英文原样，加反引号
- **占位符**：保留 `{name}` 形式不动，只翻译冒号前的描述文字
- **产品名**：Cline、VS Code、MCP、JSON 等保持原样

---


## 七、@cline/ui 团队协作与思考标签（2026-09-29 doubao 回填）

| 英文 | 中文 |
|---|---|
| Teammate | 队友 |
| Spawn teammate | 生成队友（动词对：正在生成 / 已生成） |
| Shutdown teammate | 停止队友 |
| Await teammates | 等待队友（正在等待 / 已等待） |
| Broadcast to teammates | 向队友广播消息 |
| Team task | 团队任务（已分配 N 项团队任务） |
| List team tasks | 列出团队任务（已列出 N 项团队任务） |
| List team outcomes | 列出团队成果 |
| Mission log | 任务日志 |
| Team status | 团队状态 |
| Thinking | 思考中（思考标签无时长回退文案） |
| Thought for Ns | 思考了 N 秒 |
| Pull request | 拉取请求 |
| Refresh pull request status | 刷新拉取请求状态 |
| CI check | CI 检查（No CI checks → 无 CI 检查） |
| Command output | 命令输出 |
| Follow-up question | 追问 |
| Continue | 继续（追问面板确认按钮） |
| Drop to attach | 拖放以附加 |

## 回填记录

> 翻译过程中遇到的新术语，请追加到对应分类并在此登记。

| 英文 | 中文 | 提出者 | 日期 |
|---|---|---|---|
| Teammate | 队友 | doubao | 2026-09-29 |
| Spawn teammate | 生成队友（正在生成/已生成） | doubao | 2026-09-29 |
| Team task | 团队任务（已分配 N 项） | doubao | 2026-09-29 |
| Thinking | 思考中（思考标签回退文案） | doubao | 2026-09-29 |
| Thought for Ns | 思考了 N 秒 | doubao | 2026-09-29 |
| Pull request | 拉取请求 | doubao | 2026-09-29 |
| Command output | 命令输出 | doubao | 2026-09-29 |
| Follow-up question | 追问 | doubao | 2026-09-29 |
| — | — | — | — |
