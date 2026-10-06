"use client";

import { Bug, ExternalLink, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MemoizedMarkdown } from "@/components/ui/markdown";
import { WhatsNewDialog } from "@/components/whats-new-dialog";
import {
	checkForUpdateNow,
	restartToApplyUpdate,
	useAppUpdateStatus,
} from "@/hooks/use-app-update";
import { isBetaVersion, productNameForVersion } from "@/lib/app-channel";
import {
	CHANGELOG_URL_ON_GITHUB,
	type ChangelogRelease,
	fetchChangelog,
	ISSUES_URL,
	releaseUrl,
} from "@/lib/changelog";
import { desktopClient, openExternalUrl } from "@/lib/desktop-client";
import { latestWhatsNew } from "@/lib/whats-new";
import { PageFrame, PageHeader } from "../page-layout";

const RECENT_RELEASE_COUNT = 5;

function useAppVersion(): string | null {
	const [appVersion, setAppVersion] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		void desktopClient
			.invoke<{ appVersion?: unknown }>("get_process_context")
			.then((context) => {
				if (cancelled) return;
				const version =
					typeof context?.appVersion === "string"
						? context.appVersion.trim()
						: "";
				setAppVersion(version || null);
			})
			.catch(() => {
				// Stay versionless if the sidecar is unreachable.
			});
		return () => {
			cancelled = true;
		};
	}, []);
	return appVersion;
}

function UpdateRow() {
	const status = useAppUpdateStatus();
	const [checking, setChecking] = useState(false);
	const [checkResult, setCheckResult] = useState<
		"up-to-date" | "unavailable" | null
	>(null);
	const [restarting, setRestarting] = useState(false);

	const busy =
		checking || status.state === "checking" || status.state === "downloading";
	const description =
		status.state === "ready"
			? `版本 ${status.version} 已下载完成，将在下次启动 Cline 时生效。`
			: status.state === "downloading"
				? `正在下载版本 ${status.version ?? ""}…`
				: status.state === "error" && status.error
					? `上次检查失败：${status.error}`
					: checkResult === "up-to-date"
						? "你已是最新版本。Cline 还会在启动后不久以及每两小时自动检查。"
						: checkResult === "unavailable"
							? "仅桌面端支持检查更新。"
							: "Cline 会在启动后不久和每两小时检查更新，并在重启时安装。";

	return (
		<div className="flex items-center justify-between gap-5 border-b py-4 max-[720px]:flex-col max-[720px]:items-stretch">
			<div className="flex flex-col gap-1">
				<p className="text-base font-semibold text-foreground">更新</p>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			{status.state === "ready" ? (
				<Button
					className="shrink-0"
					disabled={restarting}
					onClick={() => {
						setRestarting(true);
						void restartToApplyUpdate().then((ok) => {
							if (!ok) setRestarting(false);
						});
					}}
					size="sm"
					type="button"
				>
					{restarting ? <Loader2 className="size-3 animate-spin" /> : null}
					重启以更新
				</Button>
			) : (
				<Button
					className="shrink-0"
					disabled={busy}
					onClick={() => {
						setChecking(true);
						void checkForUpdateNow().then((result) => {
							setChecking(false);
							setCheckResult(result ? "up-to-date" : "unavailable");
						});
					}}
					size="sm"
					type="button"
					variant="outline"
				>
					{busy ? (
						<Loader2 className="size-3 animate-spin" />
					) : (
						<RefreshCw className="size-3" />
					)}
					检查更新
				</Button>
			)}
		</div>
	);
}

function ReleaseNotes({
	appVersion,
	releases,
	error,
}: {
	appVersion: string | null;
	releases: ChangelogRelease[] | null;
	error: string | null;
}) {
	if (error) {
		return <p className="py-4 text-sm text-muted-foreground">{error}</p>;
	}
	if (!releases) {
		return (
			<p className="py-4 text-sm text-muted-foreground">
				正在加载版本说明…
			</p>
		);
	}
	return (
		<ol className="flex flex-col">
			{releases.slice(0, RECENT_RELEASE_COUNT).map((release) => (
				<li
					className="grid gap-x-8 gap-y-2 border-b py-5 last:border-b-0 sm:grid-cols-[8rem_1fr]"
					key={release.version}
				>
					<div className="flex items-start gap-2">
						<button
							className="font-mono text-sm text-foreground hover:underline"
							onClick={() => void openExternalUrl(releaseUrl(release.version))}
							title="在 GitHub 上查看此版本"
							type="button"
						>
							v{release.version}
						</button>
						{release.version === appVersion ? (
							<Badge variant="secondary">已安装</Badge>
						) : null}
					</div>
					<MemoizedMarkdown
						classNames="text-sm text-muted-foreground [&_li]:my-1 [&_ul]:pl-4"
						content={release.notes.map((note) => `- ${note}`).join("\n")}
					/>
				</li>
			))}
		</ol>
	);
}

export function AboutContent({
	onOpenConnectors,
}: {
	onOpenConnectors: () => void;
}) {
	const appVersion = useAppVersion();
	const [releases, setReleases] = useState<ChangelogRelease[] | null>(null);
	const [changelogError, setChangelogError] = useState<string | null>(null);
	const [whatsNewOpen, setWhatsNewOpen] = useState(false);
	const whatsNew = latestWhatsNew();

	useEffect(() => {
		let cancelled = false;
		fetchChangelog()
			.then((loaded) => {
				if (!cancelled) setReleases(loaded);
			})
			.catch(() => {
				if (!cancelled) {
					setChangelogError(
						"此版本暂不提供版本说明。完整更新日志请见 GitHub。",
					);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<PageFrame>
			<PageHeader
				meta={
					<span className="flex items-center gap-2">
						{appVersion ? (
							<span className="font-mono text-base text-muted-foreground">
								v{appVersion}
							</span>
						) : null}
						{isBetaVersion(appVersion) ? (
							<Badge className="uppercase tracking-wide" variant="secondary">
								测试版
							</Badge>
						) : null}
					</span>
				}
				title={productNameForVersion(appVersion)}
			/>
			<section className="max-w-344">
				<UpdateRow />
				{whatsNew ? (
					<div className="flex items-center justify-between gap-5 border-b py-4 max-[720px]:flex-col max-[720px]:items-stretch">
						<div className="flex flex-col gap-1">
							<p className="text-base font-semibold text-foreground">
								近期亮点
							</p>
							<p className="text-sm text-muted-foreground">
								快速了解最近最重要的新增内容。
							</p>
						</div>
						<Button
							className="shrink-0"
							onClick={() => setWhatsNewOpen(true)}
							size="sm"
							type="button"
							variant="outline"
						>
							<Sparkles className="size-3" />
							查看新功能
						</Button>
						<WhatsNewDialog
							onOpenChange={setWhatsNewOpen}
							onOpenConnectors={onOpenConnectors}
							open={whatsNewOpen}
							release={whatsNew}
						/>
					</div>
				) : null}
				<div className="flex items-center justify-between gap-5 border-b py-4 max-[720px]:flex-col max-[720px]:items-stretch">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">
							反馈问题
						</p>
						<p className="text-sm text-muted-foreground">
							发现缺陷或有建议？欢迎在 GitHub 提交 issue。
						</p>
					</div>
					<Button
						className="shrink-0"
						onClick={() => void openExternalUrl(ISSUES_URL)}
						size="sm"
						type="button"
						variant="outline"
					>
						<Bug className="size-3" />
						打开 GitHub issue
					</Button>
				</div>
				<div className="pt-6">
					<div className="flex items-center justify-between gap-4">
						<h2 className="text-lg font-semibold text-foreground">
							版本说明
						</h2>
						<Button
							className="text-muted-foreground"
							onClick={() => void openExternalUrl(CHANGELOG_URL_ON_GITHUB)}
							size="sm"
							type="button"
							variant="ghost"
						>
							完整更新日志
							<ExternalLink className="size-3" />
						</Button>
					</div>
					<ReleaseNotes
						appVersion={appVersion}
						error={changelogError}
						releases={releases}
					/>
				</div>
			</section>
		</PageFrame>
	);
}
