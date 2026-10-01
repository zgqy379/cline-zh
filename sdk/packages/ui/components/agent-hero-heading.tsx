"use client";

import { useEffect, useState } from "react";

const HERO_VERBS = ["搭建", "创建", "修复", "了解"] as const;
const HERO_CYCLE_MS = 5000;
// 无障碍标签要覆盖全部轮播状态；中文并列最后一项前用「或」而非「、」。
const HERO_HEADING_LABEL = `你想${HERO_VERBS.slice(0, -1).join("、")}或${HERO_VERBS[HERO_VERBS.length - 1]}什么？`;

export function AgentHeroHeading() {
	const [verbIndex, setVerbIndex] = useState(0);

	useEffect(() => {
		const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
		if (media?.matches) return;
		const interval = window.setInterval(() => {
			setVerbIndex((current) => (current + 1) % HERO_VERBS.length);
		}, HERO_CYCLE_MS);
		return () => window.clearInterval(interval);
	}, []);

	const verb = HERO_VERBS[verbIndex];

	return (
		<h1 aria-label={HERO_HEADING_LABEL} className="cline-ui-agent-hero-heading">
			<span aria-hidden="true">
				你想
				<span className="cline-ui-agent-hero-heading__word" key={verb}>
					{verb.split("").map((character, index) => (
						<span
							className="cline-ui-agent-hero-heading__character"
							// biome-ignore lint/suspicious/noArrayIndexKey: the keyed word remounts as a unit and character positions never reorder
							key={`${verb}-${index}`}
							style={{ animationDelay: `${index * 45}ms` }}
						>
							{character}
						</span>
					))}
				</span>
				什么？
			</span>
		</h1>
	);
}
