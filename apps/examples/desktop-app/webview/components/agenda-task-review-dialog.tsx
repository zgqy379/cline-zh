"use client";

import type { AgendaTaskRecord } from "@cline/shared";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

export function AgendaTaskReviewDialog({
	task,
	open,
	pending,
	confirmLabel = "批准",
	rejectLabel = "拒绝",
	onOpenChange,
	onConfirm,
	onReject,
}: {
	task: AgendaTaskRecord | null;
	open: boolean;
	pending: boolean;
	confirmLabel?: string;
	rejectLabel?: string;
	onOpenChange: (open: boolean) => void;
	onConfirm: (task: AgendaTaskRecord) => void | Promise<void>;
	onReject?: (task: AgendaTaskRecord) => void | Promise<void>;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="h-[min(720px,calc(100dvh-2rem))] w-[min(640px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
				{task ? (
					<>
						<DialogHeader>
							<DialogTitle>{task.title}</DialogTitle>
							<DialogDescription>
								在其启动新的 Agent 会话之前，请先审阅确切的修订版本。
							</DialogDescription>
						</DialogHeader>
						<div className="min-h-0 space-y-4 overflow-y-auto pr-1">
							<div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/20 p-3 text-xs">
								<ReviewField label="修订版本" value={String(task.revision)} />
								<ReviewField label="优先级" value={`P${task.priority}`} />
								<ReviewField label="类型" value={task.type} />
								<ReviewField label="模式" value={task.mode ?? "act"} />
								<ReviewField
									label="范围"
									value={
										task.scope === "workspace"
											? (task.workspaceRoot ?? "工作区")
											: "常规 / 聊天工作区"
									}
								/>
								<ReviewField
									label="过期时间"
									value={new Date(task.expiresAt).toLocaleString()}
								/>
								<ReviewField
									label="可用时间"
									value={new Date(task.availableAt).toLocaleString()}
								/>
								<ReviewField
									label="负责人"
									value={task.assignee ?? "默认 Agent"}
								/>
								<ReviewField
									label="模型"
									value={
										task.modelSelection
											? `${task.modelSelection.providerId}/${task.modelSelection.modelId ?? "default"}`
											: "Cline 默认"
									}
								/>
								{task.cwd ? (
									<ReviewField label="工作目录" value={task.cwd} />
								) : null}
								<ReviewField
									label="运行限制"
									value={
										[
											task.maxIterations
												? `${task.maxIterations} 次迭代`
												: undefined,
											task.timeoutSeconds
												? `${task.timeoutSeconds} 秒超时`
												: undefined,
										]
											.filter(Boolean)
											.join(" · ") || "Hub 默认值"
									}
								/>
							</div>
							{task.description ? (
								<ReviewText label="描述" value={task.description} />
							) : null}
							<ReviewText label="指令" value={task.instructions} />
							{task.systemPrompt ? (
								<ReviewText
									label="系统提示词覆盖"
									value={task.systemPrompt}
								/>
							) : null}
							{task.resourcePaths.length > 0 ? (
								<div className="space-y-1.5">
									<h4 className="text-xs font-medium">文件</h4>
									<ul className="space-y-1 rounded-md border bg-muted/20 p-3 font-mono text-[11px]">
										{task.resourcePaths.map((path) => (
											<li className="break-all" key={path}>
												{path}
											</li>
										))}
									</ul>
								</div>
							) : null}
						</div>
						<DialogFooter>
							<Button
								disabled={pending}
								onClick={() => {
									if (onReject) void onReject(task);
									else onOpenChange(false);
								}}
								type="button"
								variant={onReject ? "destructive" : "outline"}
							>
								{onReject ? rejectLabel : "暂不"}
							</Button>
							<Button
								disabled={pending}
								onClick={() => void onConfirm(task)}
								type="button"
							>
								{pending ? <Loader2 className="size-4 animate-spin" /> : null}
								{confirmLabel}
							</Button>
						</DialogFooter>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function ReviewField({ label, value }: { label: string; value: string }) {
	return (
		<div className="min-w-0">
			<div className="text-muted-foreground">{label}</div>
			<div className="truncate font-medium capitalize" title={value}>
				{value}
			</div>
		</div>
	);
}

function ReviewText({ label, value }: { label: string; value: string }) {
	return (
		<div className="space-y-1.5">
			<h4 className="text-xs font-medium">{label}</h4>
			<div className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-xs leading-relaxed">
				{value}
			</div>
		</div>
	);
}
