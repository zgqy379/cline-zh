import type { ComposioToolkitSlug } from "./composio-types";

/**
 * Suggested connector combinations shown on Customize > Connectors. A recipe
 * stays suggested until every connector in it is connected.
 */
export type ComposioRecipe = {
	id: string;
	title: string;
	description: string;
	/** An example request that exercises the combination. */
	prompt: string;
	connectors: { slug: ComposioToolkitSlug; name: string }[];
};

export const COMPOSIO_RECIPES: ComposioRecipe[] = [
	{
		id: "organize-your-day",
		title: "理顺你的一天",
		description:
			"从一份晨间简报开始：Cline 读取夜间收到的邮件和 Slack 消息，排出今天的日程，为需要你处理的事起草回复，并标出每场会议前要准备的内容。",
		prompt:
			"给我一份晨间简报：昨晚有哪些新消息，我今天的日程是什么，并起草所有紧急事项的回复。",
		connectors: [
			{ slug: "gmail", name: "Gmail" },
			{ slug: "slack", name: "Slack" },
			{ slug: "googlecalendar", name: "Google Calendar" },
		],
	},
	{
		id: "incident-rca",
		title: "排查生产环境故障",
		description:
			"一条不显眼的高内存告警出现在 Slack 里。Cline 拉取那条消息，把它与对应的 Sentry 错误和相关 Linear 议题关联起来，然后写出带修复方案的根本原因分析。",
		prompt:
			"排查今天早上在 #eng-alerts 里报告的内存暴涨，并给我一份根因分析。",
		connectors: [
			{ slug: "slack", name: "Slack" },
			{ slug: "sentry", name: "Sentry" },
			{ slug: "linear", name: "Linear" },
		],
	},
	{
		id: "spec-to-shipped",
		title: "在桌面端推进产品",
		description:
			"把 Notion 里的需求文档拆成分范围的 Linear 议题，在工作落地时持续更新进度，并每周把状态同步到 Slack，全程不用离开 Cline。",
		prompt:
			"把 Notion 上的结账流程改版需求拆成 Linear 议题，并把摘要发到 #product。",
		connectors: [
			{ slug: "notion", name: "Notion" },
			{ slug: "linear", name: "Linear" },
			{ slug: "slack", name: "Slack" },
		],
	},
	{
		id: "launch-and-market",
		title: "发布并推广你的作品",
		description:
			"先发布一个业余项目，然后让 Cline 生成宣传图片和视频，上传到 YouTube，并撰写 LinkedIn 和 Reddit 上的发布帖。",
		prompt:
			"为这个项目做一段 30 秒的预告片，上传到 YouTube，并为 LinkedIn 和 r/SideProject 起草发布帖。",
		connectors: [
			{ slug: "youtube", name: "YouTube" },
			{ slug: "linkedin", name: "LinkedIn" },
			{ slug: "reddit", name: "Reddit" },
		],
	},
];

/** Composio serves toolkit logos by slug; used when the status payload has
 * no logo for a connector that is not connected yet. */
export function composioLogoUrl(slug: ComposioToolkitSlug): string {
	return `https://logos.composio.dev/api/${slug}`;
}
