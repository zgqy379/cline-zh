# 汉化架构设计（I18N ARCHITECTURE）

> 本文件定义 T1（UI）与 T2（提示词）的技术实现方案。
> **所有 Agent 实现前必读**，确保方案统一、不产生冲突的重复实现。

---

## 一、总体策略

| 维度 | 选择 | 理由 |
|---|---|---|
| 汉化方式 | **直接硬替换**（不引入 i18n 框架） | 见下方论证 |
| 语言切换 | 编译期固定为中文 | 降低复杂度，版本固定自用 |
| 影响面 | 仅本地 fork，不改上游逻辑 | 便于回溯与对比 |

### 为什么不用 i18n 框架 / AST codemod？

社区版用 `react-i18next` 是**正确**的（它要跟随上游长期更新）。
但本项目**固定在 `desktop-v0.0.37` 不追新版**，因此：

1. **收益低**：引入框架需改 292 个文件的 import 结构，工作量反而更大
2. **风险高**：新增依赖可能与 monorepo 的 bun workspace、现有别名（`@/components`）产生冲突
3. **收益相同**：单语言场景下，硬替换的最终效果与框架完全一致

> 实际采用「映射表 + 精确整词替换」，详见 `docs/PROGRESS.md` §0.2（含与 AST codemod 方案的裁决）。
> **若未来决定跟随上游更新**，应改用 i18n 或 codemod 方案，届时需重新规划。

---

## 二、T1 — UI 文案汉化

### 目标范围

```
apps/examples/desktop-app/webview/**    # 主战场，292 个 tsx/ts
apps/examples/desktop-app/src-tauri/    # Rust 侧托盘菜单、通知
apps/examples/desktop-app/sidecar/      # 侧边栏等 Node 侧文案
```

### 实现规范

**规则 1：只改字符串字面量，不动代码结构**

```tsx
// ❌ 错误：改变逻辑
{isLoading ? <Spinner/> : "Loading..."}

// ✅ 正确：仅替换字面量
{isLoading ? <Spinner/> : "加载中..."}
```

**规则 2：保留所有插值与占位符**

```tsx
// ❌ 错误：丢失变量
`Showing {count} of {total} results`

// ✅ 正确：保留结构
`显示第 {count} 项，共 {total} 条结果`
```

**规则 3：遵循 GLOSSARY 术语表**

**规则 4：注释、变量名、日志（console.log）不改**
只有**用户可见的文案**才翻译。代码注释保持英文，避免影响上游代码可读性与后续 diff。

**规则 5：区分 UI 文案与协议字段**

以下**绝对不能翻译**，它们是接口契约：
- 命令名、事件名、IPC 消息 type
- API 字段名、JSON key
- CSS 类名、DOM id
- 环境变量名、配置键名

判断方法：**如果这个字符串会出现在网络请求、配置文件或代码逻辑中，就不译。**

### 高频陷阱清单

| 陷阱 | 示例 | 处理 |
|---|---|---|
| 界面上的英文专有名词 | "Anthropic", "OpenRouter" | 保持原样 |
| 快捷键提示 | "Cmd/Ctrl+P", "↵" | 保持原样 |
| 用户数据（如历史会话标题） | 任意用户输入 | **绝不翻译** |
| 后端返回的错误原文 | API error message | 通常保持原样 |
| Markdown 标题锚点 | `## Tools` | 视是否用户可见决定 |

---

## 三、T2 — 系统提示词汉化

### 源码位置与结构（已验证）

```
sdk/packages/shared/src/prompt/
├── cline.ts        # 提示词组装器 buildClineSystemPrompt()
├── format.ts       # 消息格式化
└── system/
    ├── index.ts    # 导出 DEFAULT_CLINE_SYSTEM_PROMPTS
    ├── act.ts      # ACT 模式主提示词（最大，含全文）
    └── yolo.ts     # YOLO 模式主提示词
```

### 组装机制（已验证）

```typescript
// system/index.ts
export const DEFAULT_CLINE_SYSTEM_PROMPTS = {
  ACT: CLINE_SYSTEM_PROMPT_ACT_MODE,   // system/act.ts
  YOLO: CLINE_SYSTEM_PROMPT_YOLO_MODE, // system/yolo.ts
};

// cline.ts 中做占位符替换
basePrompt
  .replace("{{PLATFORM_NAME}}", platform)
  .replace("{{CWD}}", workspaceRoot)
  .replace("{{CURRENT_DATE}}", ...)
  .replace("{{IDE_NAME}}", ide)
  .replace("{{CLINE_METADATA}}", ...)
  .replace("{{CLINE_RULES}}", effectiveRules)
```

### 需汉化的 5 个常量

| 常量 | 文件 | 说明 |
|---|---|---|
| `CLINE_SYSTEM_PROMPT_ACT_MODE` | `system/act.ts` | **核心**，占绝大部分篇幅 |
| `CLINE_SYSTEM_PROMPT_YOLO_MODE` | `system/yolo.ts` | YOLO 模式 |
| `MODE_TAG_INSTRUCTIONS` | `cline.ts` | 模式标签说明 |
| `PLAN_MODE_INSTRUCTIONS_BASE` | `cline.ts` | 规划模式行为约束 |
| `PLAN_MODE_INSTRUCTIONS` | `cline.ts` | 规划模式（含切换说明） |

### ⚠️ 汉化铁律（务必遵守）

系统提示词直接决定模型行为，翻译出错会**实质性降低代码质量**。必须遵守：

1. **占位符 `{{XXX}}` 一个都不能动**，包括大小写和下划线
2. **工具名绝不翻译**：`read_file`、`write_to_file`、`run_commands`、
   `switch_to_act_mode` 等，保持英文原样
3. **XML/结构化标记保持原样**：`<user_input mode="...">`、`<mode_notice>`
4. **代码示例中的注释可译，但代码本身不动**
5. **技术术语保留英文**：JSON、API、MCP、IDE、hook 等首次出现可加中文注解
6. **保持原有的强调结构**：原文用 ALL CAPS 或换行强调的地方，中文用「」或加粗等价表达
7. **不得删减任何约束条款**——这是最容易出事的地方，每一条规则都必须完整保留

### 建议做法

- 分段翻译，每段翻译后**逐句对照原文检查是否遗漏约束**
- 保留原有的 Markdown 标题层级（`#`、`##`）不变，只翻译标题文字
- 翻译完成后请另一位 Agent 做**对照审校**（见进度看板 P5）

---

## 四、并行分工建议

为避免冲突，**按文件划分，不按功能划分**（翻译工作天然适合按文件切分）：

| Agent | 负责范围 | 冲突风险 |
|---|---|---|
| A | `webview/components/agent-*.tsx` | 无 |
| B | `webview/components/session-*.tsx` | 无 |
| C | `webview/app/**` + `components/ai-elements/**` | 无 |
| D | `sdk/packages/shared/src/prompt/**` | 无（独占 T2） |
| E | 术语表维护 + 对照审校 | 需读全部改动 |

**每个 Agent 独立负责互不重叠的文件区间，即可完全并行，无需协调。**

---

## 五、编译与产物

### 环境要求（P3 阶段安装）

- Rust 工具链（rustup）
- Visual Studio Build Tools + C++ 生成工具
- bun（仓库使用 bun，非 npm）

### 构建命令（待在源码就位后验证）

```bash
cd apps/examples/desktop-app
bun install
bun run build:sidecar:bin
bun run build
cargo tauri build
```

### 产物

`src-tauri/target/release/bundle/nsis/` 下的安装包，或直接取
`src-tauri/target/release/cline-app.exe`。

### 注意事项

- 保持 `tauri.conf.json` 中 `version: "0.0.37"` 不变，否则自动更新会报错
- `bin/remote-helpers/` 不可删除，Tauri 打包依赖
- `code-sidecar.exe` 144MB，构建耗时长

---

## 六、回退机制

若汉化导致问题：
- 提示词：把 `system/act.ts`、`system/yolo.ts` 恢复为英文即可
- UI：恢复对应 tsx 文件
- 因使用 git 管理，`git diff` 可精确查看所有改动，`git checkout -- .` 可全部回退
