"use client";

import { useEffect, useState } from "react";
import {
	fetchProviderCatalog,
	subscribeToProviderCatalogInvalidation,
} from "@/lib/provider-model-catalog";

export function WebSearchProviderGuidance({
	onOpenModelProviders,
}: {
	onOpenModelProviders?: () => void;
}) {
	const [readyProviders, setReadyProviders] = useState<string[] | null>(null);
	useEffect(() => {
		let generation = 0;
		const load = () => {
			const request = ++generation;
			void fetchProviderCatalog()
				.then((payload) => {
					if (request !== generation) return;
					setReadyProviders(
						(payload.providers ?? [])
							.filter(
								(provider) =>
									provider.enabled &&
									provider.modelTools?.includes("web_search"),
							)
							.map((provider) => provider.name),
					);
				})
				.catch(() => {
					// Preserve the last successful guidance during a temporary failure.
				});
		};
		const unsubscribe = subscribeToProviderCatalogInvalidation(load);
		load();
		return () => {
			generation++;
			unsubscribe();
		};
	}, []);
	if (readyProviders === null) return null;
	if (readyProviders.length > 0)
		return (
			<p className="text-xs text-muted-foreground">
				已就绪：可通过 {readyProviders.join(", ")} 使用支持联网搜索的模型。
			</p>
		);
	return (
		<p className="text-xs text-amber-700 dark:text-amber-300">
			你已连接的供应商均不支持内置联网搜索，此设置暂不生效。{" "}
			{onOpenModelProviders ? (
				<button
					type="button"
					className="underline underline-offset-2 hover:text-foreground"
					onClick={onOpenModelProviders}
				>
					连接供应商
				</button>
			) : (
				"在设置中连接供应商"
			)}{" "}
			后再启用。
		</p>
	);
}
