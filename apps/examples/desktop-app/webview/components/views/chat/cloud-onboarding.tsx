"use client";

import {
	ArrowRight,
	Check,
	Cloud,
	ExternalLink,
	GitBranch,
	Github,
	LoaderCircle,
	LogIn,
	RefreshCcw,
	ShieldCheck,
	Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CloudOnboardingVariant =
	| "signed_out"
	| "not_connected"
	| "no_repositories"
	| "error";

export function CloudOnboardingCard({
	variant,
	onConnect,
	onRefresh,
	onSignIn,
	signingIn = false,
	checking = false,
}: {
	variant: CloudOnboardingVariant;
	onConnect: () => void;
	onRefresh: () => void;
	onSignIn?: () => void;
	signingIn?: boolean;
	checking?: boolean;
}) {
	if (variant === "error") {
		return (
			<div className="rounded-xl border border-border bg-card/80 p-6 text-center shadow-sm backdrop-blur-sm">
				<p className="text-sm font-medium text-foreground">
					无法连接到 Cline Cloud
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					请检查网络连接后重试。
				</p>
				<Button
					className="mt-4"
					disabled={checking}
					onClick={onRefresh}
					size="sm"
					variant="outline"
				>
					<RefreshCcw
						aria-hidden="true"
						className={cn("size-3.5", checking && "animate-spin")}
					/>
					重试
				</Button>
			</div>
		);
	}

	const isSignedOut = variant === "signed_out";
	const isNoRepositories = variant === "no_repositories";

	return (
		<div className="overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm backdrop-blur-sm">
			<div className="flex flex-col gap-6 p-6 max-[720px]:p-5">
				<div className="flex items-start justify-between gap-6 max-[720px]:flex-col">
					<div className="min-w-0">
						<p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-primary">
							<Sparkles aria-hidden="true" className="size-3" />
							云端会话
						</p>
						<h2 className="mt-3 text-lg font-semibold text-foreground">
							{isSignedOut
								? "在云端运行 Cline"
								: isNoRepositories
									? "授予 Cline 仓库访问权限"
									: "连接 GitHub 以开始"}
						</h2>
						<p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
							云端会话运行在 Cline 基础设施上安全、隔离的沙箱中。Cline 会克隆你的仓库、在分支上工作，
							即使你关闭应用也会继续运行 — 你可以随时从任意设备回来查看。
						</p>
					</div>
					<CloudFlowIllustration className="shrink-0 max-[720px]:self-center" />
				</div>

				<ol className="grid grid-cols-3 gap-3 max-[720px]:grid-cols-1">
					{isSignedOut ? (
						<OnboardingStep
							icon={<LogIn aria-hidden="true" className="size-4" />}
							index={1}
							title="使用 Cline 登录"
						>
							云端会话属于你的 Cline 账户。
						</OnboardingStep>
					) : (
						<OnboardingStep
							done={isNoRepositories}
							icon={<Github aria-hidden="true" className="size-4" />}
							index={1}
							title="连接 GitHub"
						>
							在 Cline 控制台中关联你的 GitHub 账户。
						</OnboardingStep>
					)}
					<OnboardingStep
						active={isNoRepositories}
						icon={<ShieldCheck aria-hidden="true" className="size-4" />}
						index={2}
						title="选择你的仓库"
					>
						选择 Cline GitHub App 可以访问的仓库。
					</OnboardingStep>
					<OnboardingStep
						icon={<GitBranch aria-hidden="true" className="size-4" />}
						index={3}
						title="开始会话"
					>
						在这里选择仓库和分支，描述任务，Cline 就会在云端开始工作。
					</OnboardingStep>
				</ol>

				<div className="flex flex-wrap items-center gap-3">
					{isSignedOut ? (
						<Button disabled={signingIn} onClick={onSignIn} size="sm">
							<LogIn aria-hidden="true" className="size-3.5" />
							{signingIn ? "等待浏览器…" : "使用 Cline 登录"}
						</Button>
					) : (
						<Button onClick={onConnect} size="sm">
							<Github aria-hidden="true" className="size-3.5" />
							{isNoRepositories ? "管理仓库访问权限" : "连接 GitHub"}
							<ExternalLink aria-hidden="true" className="size-3" />
						</Button>
					)}
					{isSignedOut ? null : (
						<Button
							disabled={checking}
							onClick={onRefresh}
							size="sm"
							variant="ghost"
						>
							<RefreshCcw
								aria-hidden="true"
								className={cn("size-3.5", checking && "animate-spin")}
							/>
							{isNoRepositories ? "重新检查" : "我已连接 GitHub"}
						</Button>
					)}
					{isSignedOut ? null : (
						<span
							aria-live="polite"
							className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
						>
							<LoaderCircle
								aria-hidden="true"
								className="size-3 animate-spin motion-reduce:animate-none"
							/>
							正在监听变化 — 此处会自动更新。
						</span>
					)}
				</div>
			</div>
		</div>
	);
}

function OnboardingStep({
	index,
	title,
	icon,
	children,
	done = false,
	active = false,
}: {
	index: number;
	title: string;
	icon: ReactNode;
	children: ReactNode;
	done?: boolean;
	active?: boolean;
}) {
	return (
		<li
			className={cn(
				"rounded-lg border border-border/70 bg-background/60 p-3.5",
				active && "border-primary/40 bg-primary/5",
			)}
		>
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
						done
							? "bg-success/15 text-success"
							: active
								? "bg-primary text-white"
								: "bg-muted text-muted-foreground",
					)}
				>
					{done ? <Check aria-hidden="true" className="size-3.5" /> : index}
				</span>
				<span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
					{icon}
					{title}
				</span>
			</div>
			<p className="mt-2 text-xs leading-relaxed text-muted-foreground">
				{children}
			</p>
		</li>
	);
}

function CloudFlowIllustration({ className }: { className?: string }) {
	return (
		<div
			aria-hidden="true"
			className={cn("flex items-center gap-2.5", className)}
		>
			<IllustrationNode>
				<Github className="size-5 text-foreground" />
			</IllustrationNode>
			<ArrowRight className="size-3.5 text-muted-foreground/70" />
			<IllustrationNode emphasized>
				<Cloud className="size-6 text-primary" />
			</IllustrationNode>
			<ArrowRight className="size-3.5 text-muted-foreground/70" />
			<IllustrationNode>
				<GitBranch className="size-5 text-foreground" />
			</IllustrationNode>
		</div>
	);
}

function IllustrationNode({
	children,
	emphasized = false,
}: {
	children: ReactNode;
	emphasized?: boolean;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center justify-center rounded-2xl border shadow-sm",
				emphasized
					? "size-14 border-primary/30 bg-primary/10"
					: "size-11 border-border/70 bg-background/80",
			)}
		>
			{children}
		</span>
	);
}
