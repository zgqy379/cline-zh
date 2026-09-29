"use client";

import {
	ChevronDown,
	ExternalLink,
	GitBranch,
	GitMerge,
	GitPullRequest,
	GitPullRequestClosed,
	GitPullRequestDraft,
	RefreshCw,
	X,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";

export type AgentPullRequestCheck = {
	name: string;
	state: "pending" | "success" | "failure" | "skipped";
	url?: string;
};
export type AgentPullRequestData = {
	repository: string;
	branch: string;
	branchUrl?: string;
	createUrl?: string | null;
	published?: boolean;
	pullRequest?: {
		number: number;
		title: string;
		url: string;
		state: "OPEN" | "CLOSED" | "MERGED";
		isDraft: boolean;
		mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
		mergeStateStatus: string;
		additions?: number;
		deletions?: number;
		checks?: AgentPullRequestCheck[];
		checksUnavailable?: boolean;
	} | null;
};
export type AgentPullRequestNavigation = "open" | "create" | "check" | "branch";
export type AgentPullRequestBarProps = {
	data?: AgentPullRequestData | null;
	error?: string | null;
	loading?: boolean;
	onRefresh: () => void;
	onDismissError?: () => void;
	/** Native hosts intercept navigation; web hosts use ordinary external links. */
	onNavigate?: (url: string, action: AgentPullRequestNavigation) => void;
	/** Hosts supply their established accessible popover, including its portal. */
	renderChecks: (trigger: ReactElement, content: ReactElement) => ReactNode;
};
export function getAgentPullRequestMergeStatus(
	pr: NonNullable<AgentPullRequestData["pullRequest"]>,
) {
	if (pr.state === "MERGED")
		return { label: "已合并", tone: "merged" } as const;
	if (pr.state === "CLOSED")
		return { label: "已关闭", tone: "failure" } as const;
	if (pr.isDraft) return { label: "草稿", tone: "neutral" } as const;
	if (pr.mergeable === "CONFLICTING" || pr.mergeStateStatus === "DIRTY")
		return { label: "存在冲突", tone: "failure" } as const;
	if (pr.mergeStateStatus === "BLOCKED")
		return { label: "已阻塞", tone: "warning" } as const;
	if (pr.mergeStateStatus === "BEHIND")
		return { label: "落后于基线", tone: "warning" } as const;
	if (pr.mergeStateStatus === "UNSTABLE")
		return { label: "检查失败", tone: "failure" } as const;
	if (pr.mergeable === "UNKNOWN")
		return { label: "合并状态待定", tone: "neutral" } as const;
	if (pr.mergeStateStatus === "CLEAN")
		return { label: "可合并", tone: "success" } as const;
	if (pr.mergeable === "MERGEABLE")
		return { label: "无冲突", tone: "neutral" } as const;
	return { label: "合并状态待定", tone: "neutral" } as const;
}
export function summarizeAgentPullRequestChecks(
	checks: AgentPullRequestCheck[],
) {
	if (!checks.length) return "none";
	if (checks.some((c) => c.state === "failure")) return "failure";
	if (checks.some((c) => c.state === "pending")) return "pending";
	if (checks.every((c) => c.state === "skipped")) return "skipped";
	return "success";
}
const checkLabels = {
	unavailable: "CI 不可用",
	none: "无 CI 检查",
	pending: "CI 进行中",
	success: "CI 通过",
	failure: "CI 失败",
	skipped: "CI 已跳过",
};
const statusColors = {
	merged: "text-purple-400",
	failure: "text-red-400",
	warning: "text-yellow-500",
	neutral: "text-cline-ui-muted-foreground",
	success: "text-green-500",
};
const checkColors = {
	unavailable: "bg-cline-ui-muted-foreground",
	none: "bg-cline-ui-muted-foreground",
	pending: "bg-yellow-500",
	success: "bg-green-500",
	failure: "bg-red-500",
	skipped: "bg-cline-ui-muted-foreground",
};
export function AgentPullRequestBar({
	data,
	error,
	loading = false,
	onRefresh,
	onDismissError,
	onNavigate,
	renderChecks,
}: AgentPullRequestBarProps) {
	const pr = data?.pullRequest;
	const PullRequestIcon =
		pr?.state === "MERGED"
			? GitMerge
			: pr?.state === "CLOSED"
				? GitPullRequestClosed
				: pr?.isDraft
					? GitPullRequestDraft
					: pr || data?.createUrl
						? GitPullRequest
						: GitBranch;
	if (!error && !data?.branch && !pr) return null;
	const status = pr ? getAgentPullRequestMergeStatus(pr) : null;
	const ci =
		!pr?.checks || pr.checksUnavailable
			? "unavailable"
			: summarizeAgentPullRequestChecks(pr.checks);
	const link = (
		url: string,
		action: AgentPullRequestNavigation,
		children: ReactNode,
		title?: string,
		label?: string,
	) =>
		onNavigate ? (
			<button
				type="button"
				className={`cline-ui-pr-bar__link hover:underline ${action === "open" || action === "create" ? "shrink-0 font-medium" : "text-left"}`}
				title={title}
				aria-label={label}
				onClick={() => onNavigate(url, action)}
			>
				{children}
				{(action === "create" || action === "check") && (
					<>
						{" "}
						<ExternalLink className="inline size-3" />
					</>
				)}
			</button>
		) : (
			<a
				className={`cline-ui-pr-bar__link hover:underline ${action === "open" || action === "create" ? "shrink-0 font-medium" : "text-left"}`}
				href={url}
				target="_blank"
				rel="noopener noreferrer"
				title={title}
				aria-label={label}
			>
				{children}
				{(action === "create" || action === "check") && (
					<>
						{" "}
						<ExternalLink className="inline size-3" />
					</>
				)}
			</a>
		);
	const checksContent = (
		<div
			className="cline-ui-pr-bar__checks p-3"
			data-native-navigation={onNavigate ? true : undefined}
		>
			<p className="cline-ui-pr-bar__checks-title mb-2 text-cline-ui-sm font-medium">
				#{pr?.number} 的检查
			</p>
			{ci === "unavailable" ? (
				<p className="text-cline-ui-xs text-cline-ui-muted-foreground">
					无法加载检查。请刷新重试。
				</p>
			) : ci === "none" ? (
				<p className="text-cline-ui-xs text-cline-ui-muted-foreground">
					此拉取请求暂无检查报告。
				</p>
			) : null}
			<ul className="max-h-64 space-y-2 overflow-y-auto">
				{pr?.checks?.map((check, index) => (
					<li
						className="flex items-center gap-2 text-cline-ui-xs"
						key={`${check.name}:${index}`}
					>
						<span
							aria-hidden="true"
							className={`cline-ui-pr-bar__dot size-2 shrink-0 rounded-full ${checkColors[check.state]}`}
							data-state={check.state}
						/>
						<span className="cline-ui-pr-bar__check-name min-w-0 flex-1 break-words">
							{check.url ? link(check.url, "check", check.name) : check.name}
						</span>
						<span
							className={`cline-ui-pr-bar__muted text-cline-ui-muted-foreground ${onNavigate ? "" : "shrink-0"}`}
						>
							{check.state}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
	return (
		<section
			className="cline-ui-pr-bar border-b border-cline-ui-border px-4 py-2 text-cline-ui-xs"
			aria-label="拉取请求状态"
			data-native-navigation={onNavigate ? true : undefined}
		>
			{error && (
				<div className="cline-ui-pr-bar__error mb-1 flex items-start gap-2 text-cline-ui-muted-foreground">
					<output className="min-w-0 flex-1">{error}</output>
					{onDismissError && (
						<button
							type="button"
							aria-label="关闭拉取请求错误"
							className="shrink-0 rounded p-1 hover:bg-cline-ui-muted"
							onClick={onDismissError}
						>
							<X className="size-3" />
						</button>
					)}
				</div>
			)}
			<div className="cline-ui-pr-bar__row flex min-w-0 flex-wrap items-center gap-2">
				{data &&
					(data.branch ? (
						<>
							<PullRequestIcon
								className={`cline-ui-pr-bar__icon size-4 shrink-0 cline-ui-pr-bar__tone--${status?.tone ?? "neutral"} ${statusColors[status?.tone ?? "neutral"]}`}
							/>
							{pr ? (
								<>
										{link(
											pr.url,
											"open",
											<>#{pr.number}</>,
											pr.title,
											`打开拉取请求 #${pr.number}：${pr.title}`,
										)}
									<span
										className={`shrink-0 cline-ui-pr-bar__tone--${status?.tone} ${statusColors[status?.tone ?? "neutral"]}`}
									>
										{status?.label}
									</span>
								</>
							) : data.createUrl ? (
								link(
									data.createUrl,
									"create",
									"创建拉取请求",
									"打开此分支的 GitHub 比较表单。提交前请先推送您的提交。",
								)
							) : null}
							<span
								className="cline-ui-pr-bar__branch min-w-0 flex-1 truncate text-cline-ui-muted-foreground"
								title={`${data.repository} · ${data.branch}`}
							>
								{data.repository.split("/").pop()}{" "}
								<span className="ml-1">
									{data.branchUrl
										? link(
												data.branchUrl,
												"branch",
												<span className="min-w-0 truncate">{data.branch}</span>,
											)
										: data.branch}
								</span>
							</span>
							{!pr && data.published === false && (
								<span>任务分支不在 GitHub 上</span>
							)}
							{pr && (
								<>
									{pr.additions !== undefined && pr.deletions !== undefined && (
											<span
												className="cline-ui-pr-bar__counts shrink-0 tabular-nums"
												{...(onNavigate
													? {}
													: {
															role: "img",
															"aria-label": `新增 ${pr.additions} 行，删除 ${pr.deletions} 行`,
														})}
												title={`新增 ${pr.additions} 行，删除 ${pr.deletions} 行`}
											>
											<span className="cline-ui-pr-bar__tone--success text-green-500">
												+{pr.additions.toLocaleString()}
											</span>{" "}
											<span className="cline-ui-pr-bar__tone--failure text-red-400">
												−{pr.deletions.toLocaleString()}
											</span>
										</span>
									)}
									{renderChecks(
										<button
											type="button"
											className="cline-ui-pr-bar__check-trigger flex shrink-0 items-center gap-1.5 rounded-md bg-cline-ui-muted px-2 py-1"
											aria-label={
												ci === "none" ? "无 CI 检查" : checkLabels[ci]
											}
										>
											<span
												aria-hidden="true"
												className={`cline-ui-pr-bar__dot size-2 rounded-full ${checkColors[ci]}`}
												data-state={ci}
											/>
											{checkLabels[ci]}
											<ChevronDown className="size-3" />
										</button>,
										checksContent,
									)}
								</>
							)}
						</>
					) : (
						<span>任务分支不可用。</span>
					))}
				<button
					type="button"
					disabled={loading}
					onClick={onRefresh}
					aria-label="刷新拉取请求状态"
					title="刷新拉取请求状态"
					className="cline-ui-pr-bar__refresh shrink-0 rounded p-1 text-cline-ui-muted-foreground hover:bg-cline-ui-muted disabled:opacity-50"
				>
					<RefreshCw
						className={`size-3 ${loading ? `animate-spin ${onNavigate ? "" : "motion-reduce:animate-none"}` : ""}`}
					/>
				</button>
			</div>
		</section>
	);
}
