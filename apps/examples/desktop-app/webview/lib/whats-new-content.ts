import {
	GitBranchPlus,
	GitPullRequest,
	type LucideIcon,
	Network,
	Users,
} from "lucide-react";

/**
 * "What's new" catch-up highlights.
 *
 * Cline Desktop ships every couple of days, so individual releases are not
 * announced in-app; the About page always has the full changelog. Every so
 * often, once enough notable features have accumulated, we publish a catch-up
 * here and the app shows it once, as a dialog on the next launch.
 *
 * To publish a new catch-up:
 *
 * 1. Add an entry to the TOP of `WHATS_NEW_RELEASES`. Give it a new, stable
 *    `id` (date-prefixed, never reused): the app compares the latest id with
 *    the one the user last saw to decide whether to show the dialog.
 * 2. Give it a short title (a headline, not a sentence) and 3 or 4
 *    highlights. Lead with the user-facing capability, keep each description
 *    to one short sentence, and pick a lucide icon.
 * 3. Preview it from Settings → About → "Show what's new", which replays the
 *    latest entry without marking it seen.
 *
 * New installs never see a catch-up: onboarding marks the current entry as
 * seen, because everything is new to a first-time user anyway.
 */

export type WhatsNewHighlight = {
	title: string;
	description: string;
	icon: LucideIcon;
};

export type WhatsNewRelease = {
	id: string;
	title: string;
	highlights: WhatsNewHighlight[];
};

export const WHATS_NEW_RELEASES: WhatsNewRelease[] = [
	{
		id: "2026-09-remote-and-parallel",
		title: "随时随地，并行工作",
		highlights: [
			{
				title: "SSH 远程主机",
				description:
					"应用留在你的笔记本上，Cline 则在你可 SSH 登录的任意机器上工作。",
				icon: Network,
			},
			{
				title: "工作树",
				description:
					"每个任务在 ~/.cline/worktrees 下拥有独立分支，并行工作互不干扰。",
				icon: GitBranchPlus,
			},
			{
				title: "Pull Request 状态",
				description:
					"在输入框即可查看分支的 PR、合并状态与 CI 检查。",
				icon: GitPullRequest,
			},
			{
				title: "并行子智能体",
				description:
					"在一个会话里派发多个任务，它们会同时运行。",
				icon: Users,
			},
		],
	},
];
