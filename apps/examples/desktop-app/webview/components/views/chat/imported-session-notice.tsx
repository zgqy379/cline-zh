"use client";

import { Import } from "lucide-react";
import {
	SESSION_IMPORT_TOOL_LABELS,
	type SessionImportTool,
} from "@/lib/session-import";

/**
 * Heads a transcript imported from another coding agent. Its turns keep that
 * agent's tool names and schemas, which Cline does not translate; without the
 * notice the session looks native and the user has no way to know why
 * continuing it may go differently.
 */
export function ImportedSessionNotice({ tool }: { tool: SessionImportTool }) {
	const label = SESSION_IMPORT_TOOL_LABELS[tool];
	return (
		<output className="flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-500/5 px-4 py-3">
			<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
				<Import className="size-4" />
			</span>
			<div className="min-w-0">
				<p className="text-sm font-semibold text-foreground">
					从 {label} 导入
				</p>
				<p className="mt-0.5 text-[13px] text-muted-foreground">
					此前的轮次由 {label} 记录，其工具与工作流和 Cline 不同。继续时，
					模型依据这些轮次的摘要工作，而不是原始工具调用，因此结果可能
					不如用 Cline 新建的会话可靠。
				</p>
			</div>
		</output>
	);
}
