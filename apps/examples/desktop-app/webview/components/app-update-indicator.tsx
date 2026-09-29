"use client";

import { CircleArrowUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	restartToApplyUpdate,
	useAppUpdateStatus,
} from "@/hooks/use-app-update";
import { cn } from "@/lib/utils";

/**
 * Persistent "update ready" indicator for the sidebar. Renders nothing until
 * the auto-updater has staged an update, then shows an accented button that
 * opens a popover with the new version and a restart action — so the update
 * stays reachable after the one-time toast is dismissed.
 */
export function AppUpdateIndicator({ className }: { className?: string }) {
	const status = useAppUpdateStatus();
	const [restarting, setRestarting] = useState(false);

	if (status.state !== "ready" || !status.version) {
		return null;
	}

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					aria-label={`更新已就绪：v${status.version}`}
					className={cn(
						"relative size-8 shrink-0 justify-center px-0 text-blue-500 hover:text-blue-400",
						className,
					)}
					title={`更新已就绪：v${status.version}`}
					type="button"
					variant="sidebarItem"
				>
					<CircleArrowUp className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-3" side="bottom">
				<p className="text-sm font-medium">更新已就绪：v{status.version}</p>
				<p className="mt-1 text-xs text-muted-foreground">
					新版本已下载完成，下次启动应用时生效。点击立即重启可直接切换到新版本。
				</p>
				<Button
					className="mt-3 w-full"
					disabled={restarting}
					onClick={() => {
						setRestarting(true);
						void restartToApplyUpdate().then((ok) => {
							if (!ok) {
								setRestarting(false);
							}
						});
					}}
					size="sm"
					type="button"
				>
					{restarting ? (
						<>
							<Loader2 className="size-4 animate-spin" />
							正在重启…
						</>
					) : (
						"立即重启"
					)}
				</Button>
			</PopoverContent>
		</Popover>
	);
}
