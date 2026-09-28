"use client";

import { describeOutdatedHubSessions } from "@cline/shared/browser";
import { useCallback, useEffect, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
	checkForUpdateNow,
	restartToApplyUpdate,
	useAppUpdateStatus,
} from "@/hooks/use-app-update";
import { desktopClient } from "@/lib/desktop-client";
import {
	isPersistableHubMismatchKey,
	resolveHubUpdateRestartDecision,
	retainDismissalForIncomingMismatch,
	shouldShowHubMismatchDialog,
} from "./hub-update-required-helpers";

type HubBuildMismatchPayload = {
	hubBuildId?: string;
	hubCoreVersion?: string;
	reason?: string;
	activeSessionCount?: number;
	participantClientCount?: number;
};

function mismatchKeyOf(payload: HubBuildMismatchPayload): string {
	return `${payload.reason ?? ""}:${payload.hubBuildId ?? ""}`;
}

type UpdatePhase = "idle" | "updating" | "restarting";

/** Generous deadline: drain wait + graceful retire + fresh daemon startup. */
const HUB_UPGRADE_TIMEOUT_MS = 60_000;

/**
 * "Later" must survive webview remounts and reconnects: the sidecar replays
 * a pending mismatch on every new webview connection (session switches,
 * reloads, relaunches), and in-memory dismissal state resurrected the modal
 * each time. Storage keeps one key - a different hub build prompts again.
 */
const DISMISSED_MISMATCH_STORAGE_KEY = "cline.hub-mismatch-dismissed";

function readPersistedDismissedKey(): string | null {
	try {
		const key = localStorage.getItem(DISMISSED_MISMATCH_STORAGE_KEY);
		return isPersistableHubMismatchKey(key) ? key : null;
	} catch {
		return null;
	}
}

function persistDismissedKey(key: string): void {
	try {
		localStorage.setItem(DISMISSED_MISMATCH_STORAGE_KEY, key);
	} catch {
		// Best effort: without storage the dismissal lasts this mount only.
	}
}

// One updater kick per observed mismatch per page lifetime. Module scope
// survives component remounts (session switches) so the update feed is not
// re-hit every time the dialog mounts.
let updateCheckKickedForKey: string | null = null;

/**
 * Blocking prompt shown when the sidecar reports that the shared Cline Hub
 * does not match this app's build.
 *
 * Two directions, two dialogs:
 * - `build_mismatch` / `unsupported_protocol`: the Hub is newer than this
 *   app. Accepting runs an updater check/download right away and, once an
 *   update is staged, restarts into it so the app and the Hub run the same
 *   version again. Dismissible - the app keeps working over the compatible
 *   wire protocol.
 * - `outdated_hub`: this app is the newer build, and the running Hub was
 *   left in place only because it is still serving other clients' sessions.
 *   Not dismissible: the user chooses between updating the Hub now (which
 *   interrupts those sessions, then relaunches the app onto the fresh Hub)
 *   and quitting the app (the old Hub keeps running for its clients).
 */
export function HubUpdateRequiredDialog() {
	const [mismatch, setMismatch] = useState<HubBuildMismatchPayload | null>(
		null,
	);
	const [dismissedKey, setDismissedKey] = useState<string | null>(
		readPersistedDismissedKey,
	);
	const [phase, setPhase] = useState<UpdatePhase>("idle");
	const [updateHint, setUpdateHint] = useState<string | null>(null);
	const updateStatus = useAppUpdateStatus();

	useEffect(() => {
		return desktopClient.subscribe("hub_build_mismatch", (payload) => {
			// A null broadcast means the mismatch was resolved (the Hub was
			// upgraded, possibly from another window): close the dialog.
			if (payload === null) {
				setMismatch(null);
				setUpdateHint(null);
				return;
			}
			if (!payload || typeof payload !== "object") {
				return;
			}
			const incoming = payload as HubBuildMismatchPayload;
			setMismatch(incoming);
			// A new mismatch is a fresh prompt: drop any "no update available"
			// hint left over from a previous dialog so it reopens in its
			// initial state instead of pre-set to "Try again".
			setUpdateHint(null);
			// Delivery includes replays on in-place transport reconnects, where
			// this component never remounts: a non-persistable dismissal
			// (unsupported_protocol) must not survive them, or the warning about
			// a Hub the app cannot talk to stays silenced indefinitely.
			setDismissedKey((previous) =>
				retainDismissalForIncomingMismatch(previous, mismatchKeyOf(incoming)),
			);
		});
	}, []);

	const mismatchKey = mismatch ? mismatchKeyOf(mismatch) : null;

	// When a newer Hub appears, stage the matching app update right away (if
	// a release exists) so the prompt can open actionable instead of waiting
	// for the next 30s background cycle. Without a staged update the
	// build_mismatch modal stays hidden entirely - see
	// shouldShowHubMismatchDialog.
	useEffect(() => {
		if (
			!mismatch ||
			mismatch.reason !== "build_mismatch" ||
			mismatchKey === null ||
			mismatchKey === dismissedKey ||
			updateCheckKickedForKey === mismatchKey
		) {
			return;
		}
		updateCheckKickedForKey = mismatchKey;
		void checkForUpdateNow();
	}, [mismatch, mismatchKey, dismissedKey]);

	const handleUpdateAndRestart = useCallback(async () => {
		setPhase("updating");
		setUpdateHint(null);
		const decision = resolveHubUpdateRestartDecision(await checkForUpdateNow());
		if (decision.action === "restart") {
			setPhase("restarting");
			const restarted = await restartToApplyUpdate();
			if (!restarted) {
				setPhase("idle");
			}
			return;
		}
		setUpdateHint(decision.hint);
		setPhase("idle");
	}, []);

	const handleUpgradeHub = useCallback(async () => {
		setPhase("updating");
		setUpdateHint(null);
		try {
			await desktopClient.invoke("hub_upgrade", undefined, {
				timeoutMs: HUB_UPGRADE_TIMEOUT_MS,
			});
		} catch (error) {
			setUpdateHint(
				error instanceof Error && error.message
					? error.message
					: "更新 Cline Hub 失败。请重试，或在终端中运行 'cline doctor fix'。",
			);
			setPhase("idle");
			return;
		}
		setPhase("restarting");
		setMismatch(null);
		// Relaunch into a clean slate attached to the fresh Hub. In plain
		// web/dev mode there is no Tauri shell to relaunch; reloading the page
		// reconnects everything instead.
		try {
			await desktopClient.invoke("relaunch_app");
		} catch {
			window.location.reload();
		}
	}, []);

	const handleQuit = useCallback(async () => {
		try {
			await desktopClient.invoke("quit_app");
		} catch {
			// Plain web/dev mode: no Tauri shell to exit. Best-effort close;
			// browsers only honor this for script-opened windows.
			window.close();
		}
	}, []);

	// This app needs a newer Hub than the one running, and the running one was
	// deliberately left in place because it is serving sessions. Block until
	// the user picks a side: replace the Hub now, or quit and update later.
	if (mismatch?.reason === "outdated_hub") {
		return (
			<AlertDialog open>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>需要更新 Cline Hub</AlertDialogTitle>
						<AlertDialogDescription>
							Cline 需要更新版本的 Cline Hub，但当前运行的 Hub 仍在为
							{describeOutdatedHubSessions(mismatch)} 提供服务。
						</AlertDialogDescription>
						<AlertDialogDescription>
							立即更新会停止该 Hub 并中断其中的会话。退出 Cline 则会关闭本应用，
							让 Hub 继续运行，你可以稍后再更新。
						</AlertDialogDescription>
						{updateHint ? (
							<AlertDialogDescription>{updateHint}</AlertDialogDescription>
						) : null}
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel
							disabled={phase !== "idle"}
							onClick={(event) => {
								event.preventDefault();
								void handleQuit();
							}}
						>
							退出 Cline
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={phase !== "idle"}
							onClick={(event) => {
								event.preventDefault();
								void handleUpgradeHub();
							}}
						>
							{phase === "restarting"
								? "正在重启…"
								: phase === "updating"
									? "正在更新…"
									: updateHint
										? "重试"
										: "立即更新"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	const open =
		mismatchKey !== null &&
		mismatchKey !== dismissedKey &&
		shouldShowHubMismatchDialog(mismatch?.reason, updateStatus.state);

	return (
		<AlertDialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen && phase === "idle" && mismatchKey !== null) {
					setDismissedKey(mismatchKey);
					// unsupported_protocol never persists: hub-backed features
					// stay broken against that Hub, so its warning must return
					// on the next reconnect or relaunch.
					if (isPersistableHubMismatchKey(mismatchKey)) {
						persistDismissedKey(mismatchKey);
					}
				}
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Cline Hub 已更新</AlertDialogTitle>
					<AlertDialogDescription>
						另一个 Cline 安装更新了共享的 Cline Hub
						{mismatch?.hubCoreVersion
							? `（核心版本 ${mismatch.hubCoreVersion}）`
							: ""}
						，它现在与本应用不再匹配。更新并重启 Cline，即可与正在运行的
						Hub 保持一致。
					</AlertDialogDescription>
					{updateHint ? (
						<AlertDialogDescription>{updateHint}</AlertDialogDescription>
					) : null}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={phase !== "idle"}>
						稍后
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={phase !== "idle"}
						onClick={(event) => {
							event.preventDefault();
							void handleUpdateAndRestart();
						}}
					>
						{phase === "restarting"
							? "正在重启…"
							: phase === "updating"
								? "正在检查更新…"
								: updateHint
									? "重试"
									: "更新并重启"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
