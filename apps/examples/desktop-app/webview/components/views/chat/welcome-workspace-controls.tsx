"use client";

import { isChatWorkspacePath } from "@cline/shared/browser";
import { Switch } from "@cline/ui";
import {
	Check,
	FilePlus2,
	Folder,
	GitBranch,
	Github,
	Info,
	LoaderCircle,
	LogIn,
	Plus,
	RefreshCcw,
	Search,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	type CloudBranchListOptions,
	type CloudBranchListResult,
	type CloudRepositoryListResult,
	type CloudRepositoryOption,
	cloudRepositoryLabel,
	normalizeCloudRepositoryUrl,
	preferredCloudBranch,
} from "@/lib/cloud-repositories";
import { scrollCurrentOptionIntoView } from "@/lib/scroll-current-option";
import { cn } from "@/lib/utils";
import type { WorkIn } from "@/lib/work-in-selection";
import {
	looksLikeFolderPath,
	normalizeWorkspacePath,
} from "@/lib/workspace-paths";

function formatWorkspacePath(path: string): string {
	const unixHome = path.match(/^\/Users\/[^/]+\/(.*)$/);
	if (unixHome) return unixHome[1] ? `~/${unixHome[1]}` : "~";
	const linuxHome = path.match(/^\/home\/[^/]+\/(.*)$/);
	if (linuxHome) return linuxHome[1] ? `~/${linuxHome[1]}` : "~";
	const windowsHome = path.match(/^[A-Za-z]:\\Users\\[^\\]+\\(.*)$/);
	if (windowsHome) {
		const tail = windowsHome[1]?.replaceAll("\\", "/") || "";
		return tail ? `~/${tail}` : "~";
	}
	return path;
}

function workspaceName(path: string): string {
	const trimmed = path.trim().replace(/[\\/]+$/, "");
	if (!trimmed) return "workspace";
	const parts = trimmed.split(/[\\/]/);
	return parts[parts.length - 1] || "workspace";
}

const TRIGGER_CLASS =
	"inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PANEL_CLASS =
	"absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-border bg-popover shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 motion-reduce:animate-none";

function CloudRepositoryPicker({
	open,
	onToggle,
	onClose,
	repoUrl,
	onSelect,
	onRepositoriesLoaded,
	onListRepositories,
	onOpenExternalUrl,
}: {
	open: boolean;
	onToggle: () => void;
	onClose: () => void;
	repoUrl: string;
	onSelect: (repository: CloudRepositoryOption) => void;
	onRepositoriesLoaded: (repositories: CloudRepositoryOption[]) => void;
	onListRepositories: () => Promise<CloudRepositoryListResult>;
	onOpenExternalUrl: (url: string) => Promise<void>;
}) {
	const [query, setQuery] = useState("");
	const [reloadKey, setReloadKey] = useState(0);
	const [result, setResult] = useState<CloudRepositoryListResult>();
	const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

	useEffect(() => {
		if (!open) return;
		void reloadKey;
		let cancelled = false;
		setStatus("loading");
		void onListRepositories()
			.then((next) => {
				if (cancelled) return;
				setResult(next);
				onRepositoriesLoaded(next.repositories);
				setStatus("idle");
			})
			.catch(() => {
				if (!cancelled) setStatus("error");
			});
		return () => {
			cancelled = true;
		};
	}, [onListRepositories, onRepositoriesLoaded, open, reloadKey]);

	const repositories = result?.repositories ?? [];
	const normalizedQuery = query.trim().toLowerCase();
	const filteredRepositories = repositories.filter((repository) =>
		`${repository.fullName} ${repository.name}`
			.toLowerCase()
			.includes(normalizedQuery),
	);

	return (
		<div className="relative min-w-0">
			<button
				aria-expanded={open}
				aria-haspopup="dialog"
				className={cn(TRIGGER_CLASS, "min-w-0 max-w-full")}
				onClick={onToggle}
				title={repoUrl || "选择已连接的 GitHub 仓库"}
				type="button"
			>
				<Github
					aria-hidden="true"
					className="size-4 shrink-0 text-muted-foreground"
				/>
				<span className="max-w-56 truncate">
					{repoUrl
						? cloudRepositoryLabel(repoUrl, "云端仓库")
						: "选择仓库…"}
				</span>
			</button>

			{open ? (
				<div
					className={PANEL_CLASS}
					role="dialog"
					aria-label="云端仓库"
				>
					{result?.connected !== false ? (
						<SearchInput
							onChange={setQuery}
							placeholder="搜索仓库…"
							value={query}
						/>
					) : null}
					<div className="max-h-72 overflow-y-auto p-1.5">
						{status === "loading" ? (
							<PickerStatus icon="loading" message="正在加载仓库…" />
						) : status === "error" ? (
							<PickerStatus message="无法加载仓库。">
								<Button
									onClick={() => setReloadKey((current) => current + 1)}
									size="sm"
									variant="ghost"
								>
									<RefreshCcw aria-hidden="true" className="size-3" />
									重试
								</Button>
							</PickerStatus>
						) : result?.connected === false ? (
							<PickerStatus message="连接 GitHub 以选择仓库。">
								<Button
									onClick={() => void onOpenExternalUrl(result.connectUrl)}
									size="sm"
									variant="ghost"
								>
									连接 GitHub
								</Button>
							</PickerStatus>
						) : filteredRepositories.length === 0 ? (
							<PickerStatus
								message={
									repositories.length === 0
										? "暂无已连接的仓库。"
										: "未找到仓库。"
								}
							/>
						) : (
							filteredRepositories.map((repository) => (
								<Button
									className="w-full justify-start text-xs"
									key={repository.id}
									onClick={() => {
										onSelect(repository);
										onClose();
									}}
									title={repository.fullName}
									variant="ghost"
								>
									<Github aria-hidden="true" className="size-3" />
									<span className="truncate">{repository.fullName}</span>
									{normalizeCloudRepositoryUrl(repoUrl) ===
									normalizeCloudRepositoryUrl(repository.url) ? (
										<Check aria-hidden="true" className="ml-auto size-3" />
									) : null}
								</Button>
							))
						)}
					</div>
				</div>
			) : null}
		</div>
	);
}

function CloudBranchPicker({
	open,
	onToggle,
	onClose,
	repositoryId,
	defaultBranch,
	branch,
	onBranchChange,
	onListBranches,
}: {
	open: boolean;
	onToggle: () => void;
	onClose: () => void;
	repositoryId?: number;
	defaultBranch: string;
	branch: string;
	onBranchChange: (branch: string) => void;
	onListBranches: (
		repositoryId: number,
		options?: CloudBranchListOptions,
	) => Promise<CloudBranchListResult>;
}) {
	const [query, setQuery] = useState("");
	const [debouncedQuery, setDebouncedQuery] = useState("");
	const [reloadKey, setReloadKey] = useState(0);
	const [branches, setBranches] = useState<string[]>([]);
	const [nextToken, setNextToken] = useState("");
	const [loadingMore, setLoadingMore] = useState(false);
	const [loadMoreError, setLoadMoreError] = useState(false);
	const [status, setStatus] = useState<
		"idle" | "loading" | "error" | "unavailable"
	>("idle");
	const branchRef = useRef(branch);
	const listRef = useRef<HTMLDivElement>(null);
	const loadMoreRef = useRef<HTMLDivElement>(null);
	const requestKeyRef = useRef<symbol | null>(null);
	branchRef.current = branch;
	const reconcileBranch = useCallback(
		(availableBranches: string[], complete: boolean) => {
			if (availableBranches.length === 0) return;
			const selected = branchRef.current;
			if (selected && (!complete || availableBranches.includes(selected)))
				return;
			onBranchChange(preferredCloudBranch(availableBranches, defaultBranch));
		},
		[defaultBranch, onBranchChange],
	);

	useEffect(() => {
		const timeout = window.setTimeout(
			() => setDebouncedQuery(query.trim()),
			250,
		);
		return () => window.clearTimeout(timeout);
	}, [query]);
	const searchPending = query.trim() !== debouncedQuery;

	useEffect(() => {
		if (!repositoryId) return;
		const requestKey = Symbol(`${repositoryId}:${debouncedQuery}:${reloadKey}`);
		requestKeyRef.current = requestKey;
		let cancelled = false;
		setStatus("loading");
		setLoadMoreError(false);
		const request = debouncedQuery
			? onListBranches(repositoryId, { query: debouncedQuery })
			: onListBranches(repositoryId);
		void request
			.then((result) => {
				if (cancelled || requestKeyRef.current !== requestKey) return;
				if (!result.available) {
					setBranches([]);
					onBranchChange(defaultBranch);
					setStatus("unavailable");
					return;
				}
				setBranches(result.branches);
				setNextToken(result.nextToken ?? "");
				if (!debouncedQuery) {
					reconcileBranch(result.branches, !result.nextToken);
				}
				setStatus("idle");
			})
			.catch(() => {
				if (!cancelled && requestKeyRef.current === requestKey) {
					setStatus("error");
				}
			});
		return () => {
			cancelled = true;
			requestKeyRef.current = null;
		};
	}, [
		debouncedQuery,
		defaultBranch,
		onBranchChange,
		onListBranches,
		reconcileBranch,
		reloadKey,
		repositoryId,
	]);

	const loadMore = useCallback(async () => {
		if (
			!repositoryId ||
			!nextToken ||
			loadingMore ||
			status !== "idle" ||
			searchPending
		)
			return;
		const requestKey = requestKeyRef.current;
		setLoadingMore(true);
		setLoadMoreError(false);
		try {
			const result = await onListBranches(repositoryId, {
				cursor: nextToken,
				query: debouncedQuery || undefined,
			});
			if (requestKeyRef.current !== requestKey) return;
			if (!result.available) {
				setLoadMoreError(true);
				return;
			}
			const merged = [...new Set([...branches, ...result.branches])];
			setBranches(merged);
			setNextToken(result.nextToken ?? "");
			if (!debouncedQuery && !result.nextToken) reconcileBranch(merged, true);
		} catch {
			if (requestKeyRef.current === requestKey) setLoadMoreError(true);
		} finally {
			setLoadingMore(false);
		}
	}, [
		branches,
		debouncedQuery,
		loadingMore,
		nextToken,
		onListBranches,
		reconcileBranch,
		repositoryId,
		searchPending,
		status,
	]);

	useEffect(() => {
		const root = listRef.current;
		const target = loadMoreRef.current;
		if (
			!open ||
			!root ||
			!target ||
			!nextToken ||
			loadingMore ||
			loadMoreError ||
			searchPending ||
			status !== "idle"
		) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadMore();
			},
			{ root, rootMargin: "0px 0px 96px 0px" },
		);
		observer.observe(target);
		return () => observer.disconnect();
	}, [
		loadMore,
		loadMoreError,
		loadingMore,
		nextToken,
		open,
		searchPending,
		status,
	]);

	return (
		<div className="relative min-w-0">
			<button
				aria-expanded={open}
				aria-haspopup="dialog"
				className={cn(TRIGGER_CLASS, "min-w-0 max-w-full")}
				disabled={!repositoryId || status === "unavailable"}
				onClick={onToggle}
				title={
					status === "unavailable"
						? `使用仓库默认分支${branch ? `：${branch}` : ""}`
						: branch || "选择分支"
				}
				type="button"
			>
				<GitBranch
					aria-hidden="true"
					className="size-4 shrink-0 text-muted-foreground"
				/>
				<span className="max-w-48 truncate">
					{status === "unavailable"
						? branch
							? `${branch}（默认）`
							: "默认分支"
						: branch || "选择分支…"}
				</span>
			</button>

			{open && repositoryId && status !== "unavailable" ? (
				<div className={PANEL_CLASS} role="dialog" aria-label="云端分支">
					<SearchInput
						onChange={setQuery}
						placeholder="搜索分支…"
						value={query}
					/>
					<div
						className="max-h-72 overflow-y-auto overscroll-contain p-1.5"
						ref={listRef}
					>
						{status === "loading" || searchPending ? (
							<PickerStatus
								icon="loading"
								message={query.trim() ? "搜索中…" : "正在加载分支…"}
							/>
						) : status === "error" ? (
							<PickerStatus message="无法加载分支。">
								<Button
									onClick={() => setReloadKey((current) => current + 1)}
									size="sm"
									variant="ghost"
								>
									<RefreshCcw aria-hidden="true" className="size-3" />
									重试
								</Button>
							</PickerStatus>
						) : branches.length === 0 ? (
							<PickerStatus message="未找到分支。" />
						) : (
							branches.map((item) => (
								<Button
									className="w-full justify-start text-xs [content-visibility:auto]"
									key={item}
									onClick={() => {
										onBranchChange(item);
										onClose();
									}}
									variant="ghost"
								>
									<GitBranch aria-hidden="true" className="size-3" />
									<span className="truncate">{item}</span>
									{branch === item ? (
										<Check aria-hidden="true" className="ml-auto size-3" />
									) : null}
								</Button>
							))
						)}
						{status === "idle" && nextToken ? (
							<div
								aria-live="polite"
								className="px-3 py-2 text-center text-xs text-muted-foreground"
								ref={loadMoreRef}
							>
								{loadingMore ? "正在加载更多分支…" : null}
							</div>
						) : null}
						{loadMoreError ? (
							<Button
								aria-live="polite"
								className="w-full justify-start text-xs"
								onClick={() => void loadMore()}
								variant="ghost"
							>
								无法加载更多分支 — 重试
							</Button>
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}

function PickerStatus({
	children,
	icon,
	message,
}: {
	children?: ReactNode;
	icon?: "loading";
	message: string;
}) {
	return (
		<div
			aria-live="polite"
			className="flex min-h-20 flex-col items-center justify-center gap-2 px-3 py-4 text-center text-xs text-muted-foreground"
		>
			{icon === "loading" ? (
				<LoaderCircle
					aria-hidden="true"
					className="size-4 animate-spin motion-reduce:animate-none"
				/>
			) : null}
			<span>{message}</span>
			{children}
		</div>
	);
}

function SearchInput({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
}) {
	// Search row styled to match the composer's model picker.
	return (
		<div className="flex items-center gap-2 border-b border-border px-3">
			<Search
				aria-hidden="true"
				className="size-3 shrink-0 text-muted-foreground"
			/>
			<Input
				autoFocus
				aria-label={placeholder}
				autoComplete="off"
				className="h-8 flex-1 border-0 bg-transparent px-0 py-0 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
				name={placeholder.toLowerCase().replaceAll(/[^a-z]+/g, "-")}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				spellCheck={false}
				value={value}
			/>
		</div>
	);
}

function WorkspacePicker({
	open,
	onToggle,
	onClose,
	workspaceRoot,
	workspaces,
	onRefreshWorkspaces,
	onSwitchWorkspace,
	onPickWorkspaceDirectory,
	onSelectChat,
}: {
	open: boolean;
	onToggle: () => void;
	onClose: () => void;
	workspaceRoot: string;
	workspaces: string[];
	onRefreshWorkspaces: () => Promise<void>;
	onSwitchWorkspace: (workspacePath: string) => Promise<boolean>;
	onPickWorkspaceDirectory: (initialPath?: string) => Promise<string | null>;
	onSelectChat: () => Promise<boolean>;
}) {
	const [search, setSearch] = useState("");
	const [switching, setSwitching] = useState(false);
	const [picking, setPicking] = useState(false);
	const workspaceListRef = useRef<HTMLDivElement>(null);
	const [selectingChat, setSelectingChat] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const isChatWorkspace =
		!workspaceRoot.trim() || isChatWorkspacePath(workspaceRoot);

	const normalizedWorkspaceRoot = useMemo(
		() => normalizeWorkspacePath(workspaceRoot),
		[workspaceRoot],
	);

	// Refresh the catalog and clear the filter each time the menu opens.
	// The refresh callback lives in a ref: its identity changes whenever the
	// workspace catalog re-derives (e.g. periodic session-history refresh), and
	// re-running this effect mid-open would wipe the user's typed path and any
	// visible error message.
	const refreshWorkspacesRef = useRef(onRefreshWorkspaces);
	useEffect(() => {
		refreshWorkspacesRef.current = onRefreshWorkspaces;
	}, [onRefreshWorkspaces]);
	useEffect(() => {
		if (!open) return;
		setSearch("");
		setError(null);
		void refreshWorkspacesRef.current();
	}, [open]);

	// Start the freshly opened list at the active workspace, not the top.
	useEffect(() => {
		if (open) scrollCurrentOptionIntoView(workspaceListRef.current);
	}, [open]);

	// The active workspace can be an excluded path (restored session, process
	// cwd fallback); register it explicitly so it stays visible while active.
	const availableWorkspaces = useMemo(() => {
		const byNormalizedPath = new Map<string, string>();
		const register = (path: string) => {
			const trimmed = path.trim();
			if (trimmed)
				byNormalizedPath.set(normalizeWorkspacePath(trimmed), trimmed);
		};
		if (!isChatWorkspace) register(workspaceRoot);
		for (const path of workspaces) register(path);
		return [...byNormalizedPath.values()];
	}, [isChatWorkspace, workspaceRoot, workspaces]);

	const filteredWorkspaces = availableWorkspaces.filter((path) =>
		path.toLowerCase().includes(search.toLowerCase()),
	);

	const handleSelect = async (path: string) => {
		const next = path.trim();
		if (!next || normalizeWorkspacePath(next) === normalizedWorkspaceRoot) {
			onClose();
			return;
		}
		if (switching) return;
		setError(null);
		setSwitching(true);
		const switched = await onSwitchWorkspace(next);
		setSwitching(false);
		if (switched) {
			onClose();
			return;
		}
		setError(
			`无法打开“${next}”。请确认该文件夹存在后重试。`,
		);
	};

	const handleAddWorkspace = async () => {
		if (picking || selectingChat || switching) return;
		setError(null);
		setPicking(true);
		try {
			const picked = await onPickWorkspaceDirectory(
				isChatWorkspace ? undefined : workspaceRoot || undefined,
			);
			if (picked?.trim()) await handleSelect(picked.trim());
		} catch (pickError) {
			setError(
				pickError instanceof Error && pickError.message.trim()
					? pickError.message
					: "无法打开文件夹选择器。请改为在上方输入文件夹路径。",
			);
		} finally {
			setPicking(false);
		}
	};

	const handleSelectChat = async () => {
		if (picking || selectingChat || switching) return;
		setSelectingChat(true);
		try {
			if (await onSelectChat()) onClose();
		} finally {
			setSelectingChat(false);
		}
	};

	const workspaceLabel = isChatWorkspace
		? "对话"
		: workspaceName(workspaceRoot);

	return (
		<div className="relative shrink-0">
			<button
				aria-expanded={open}
				aria-haspopup="menu"
				className={TRIGGER_CLASS}
				onClick={onToggle}
				title={workspaceLabel}
				type="button"
			>
				<Folder className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="max-w-44 truncate text-sm">{workspaceLabel}</span>
			</button>

			{open && (
				<div className={PANEL_CLASS}>
					<SearchInput
						onChange={(value) => {
							setSearch(value);
							setError(null);
						}}
						placeholder="搜索工作区，或输入文件夹路径"
						value={search}
					/>
					<div className="p-1.5">
						{looksLikeFolderPath(search) && (
							<Button
								className="mb-0.5 flex h-auto w-full items-center justify-start gap-2 rounded-md p-2 text-left"
								disabled={switching}
								onClick={() => void handleSelect(search)}
								variant="ghost"
							>
								<Folder className="size-3 shrink-0 text-muted-foreground" />
								<span className="truncate text-xs text-foreground">
									Open folder “{search.trim()}”
								</span>
							</Button>
						)}
						<div
							className="flex max-h-48 flex-col gap-0.5 overflow-y-auto"
							ref={workspaceListRef}
						>
							{filteredWorkspaces.length === 0 ? (
								<div className="px-2 py-2 text-xs text-muted-foreground">
									{looksLikeFolderPath(search)
										? "点击上方选项以打开此文件夹"
										: "未找到工作区 — 输入完整文件夹路径以添加"}
								</div>
							) : (
								filteredWorkspaces.map((path) => {
									const isActive =
										normalizeWorkspacePath(path) === normalizedWorkspaceRoot;
									return (
										<Button
											className={cn(
												"flex h-auto w-full items-center justify-between rounded-md p-2 text-left",
												isActive
													? "bg-(--accent-4) hover:bg-(--accent-4)"
													: "hover:bg-surface-hover",
											)}
											data-current={isActive || undefined}
											disabled={switching}
											key={path}
											onClick={() => void handleSelect(path)}
											variant="ghost"
										>
											<span className="flex min-w-0 items-center gap-2">
												<Folder className="size-3 shrink-0 text-muted-foreground" />
												<span className="truncate text-xs text-foreground">
													{formatWorkspacePath(path)}
												</span>
											</span>
											{isActive && (
												<Check className="ml-2 size-3 shrink-0 text-foreground" />
											)}
										</Button>
									);
								})
							)}
						</div>
						<Button
							className="mt-0.5 w-full justify-start text-xs text-muted-foreground"
							disabled={switching || picking || selectingChat}
							onClick={() => void handleAddWorkspace()}
							size="sm"
							variant="ghost"
						>
							<Plus className="size-3" />
							{picking ? "正在打开文件夹选择器…" : "打开文件夹…"}
						</Button>
						<Button
							className="w-full justify-start text-xs text-muted-foreground"
							disabled={switching || picking || selectingChat}
							onClick={() => void handleSelectChat()}
							size="sm"
							variant="ghost"
						>
							<FilePlus2 className="size-3" />
							{selectingChat ? "正在切换到对话…" : "仅对话"}
						</Button>
						{error && (
							<div className="mt-1 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
								{error}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function BranchPicker({
	open,
	onToggle,
	onClose,
	currentBranch,
	onListGitBranches,
	onSwitchGitBranch,
}: {
	open: boolean;
	onToggle: () => void;
	onClose: () => void;
	/** Always a real branch name: the parent only mounts this for git repos. */
	currentBranch: string;
	onListGitBranches: () => Promise<{ current: string; branches: string[] }>;
	onSwitchGitBranch: (branch: string) => Promise<boolean>;
}) {
	const [search, setSearch] = useState("");
	const [branches, setBranches] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [switching, setSwitching] = useState(false);
	const branchListRef = useRef<HTMLDivElement>(null);

	// Start the freshly opened list at the current branch, not the top.
	useEffect(() => {
		if (open && !loading) scrollCurrentOptionIntoView(branchListRef.current);
	}, [open, loading]);

	// Load branches fresh each time the menu opens.
	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setSearch("");
		setLoading(true);
		onListGitBranches()
			.then((payload) => {
				if (!cancelled) setBranches(payload.branches);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, onListGitBranches]);

	const branchLabel = currentBranch;

	const filteredBranches = branches.filter((branch) =>
		branch.toLowerCase().includes(search.toLowerCase()),
	);

	const handleSelect = async (branch: string) => {
		if (branch === currentBranch) {
			onClose();
			return;
		}
		if (switching) return;
		setSwitching(true);
		const switched = await onSwitchGitBranch(branch);
		setSwitching(false);
		if (switched) onClose();
	};

	return (
		<div className="relative min-w-0">
			<button
				aria-expanded={open}
				aria-haspopup="menu"
				className={cn(TRIGGER_CLASS, "min-w-0 max-w-full")}
				onClick={onToggle}
				title={branchLabel}
				type="button"
			>
				<GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 truncate text-sm">{branchLabel}</span>
			</button>

			{open && (
				<div className={PANEL_CLASS}>
					<SearchInput
						onChange={setSearch}
						placeholder="搜索分支"
						value={search}
					/>
					<div className="p-1.5">
						{loading ? (
							<div className="px-2 py-4 text-xs text-muted-foreground">
								加载中…
							</div>
						) : (
							<div
								className="flex max-h-56 flex-col gap-0.5 overflow-y-auto"
								ref={branchListRef}
							>
								{filteredBranches.length === 0 ? (
									<div className="px-2 py-2 text-xs text-muted-foreground">
										未找到分支
									</div>
								) : (
									filteredBranches.map((branch) => (
										<Button
											className={cn(
												"flex h-auto items-center gap-2 rounded-md px-2 py-2 text-left",
												currentBranch === branch
													? "bg-(--accent-4) hover:bg-(--accent-4)"
													: "hover:bg-surface-hover",
											)}
											data-current={currentBranch === branch || undefined}
											disabled={switching}
											key={branch}
											onClick={() => void handleSelect(branch)}
											variant="ghost"
										>
											<GitBranch className="size-3 shrink-0 text-muted-foreground" />
											<span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
												{branch}
											</span>
											{currentBranch === branch && (
												<Check className="ml-auto size-3 shrink-0 text-foreground" />
											)}
										</Button>
									))
								)}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function WorktreeToggle({
	value,
	onChange,
}: {
	value: WorkIn;
	onChange: (next: WorkIn) => void;
}) {
	const switchId = useId();
	return (
		<span className="inline-flex shrink-0 items-center gap-1.5 pl-1">
			<label
				className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground"
				htmlFor={switchId}
			>
				<Switch
					checked={value === "worktree"}
					id={switchId}
					onCheckedChange={(checked) =>
						onChange(checked ? "worktree" : "local")
					}
				/>
				工作树
			</label>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						aria-label="关于工作树"
						className="inline-flex rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						type="button"
					>
						<Info aria-hidden="true" className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent className="max-w-64" side="top" sideOffset={6}>
					在当前文件夹的独立副本上、于单独分支中运行任务，因此
					在合并之前你的文件不会被改动。
				</TooltipContent>
			</Tooltip>
		</span>
	);
}

export function WelcomeWorkspaceControls({
	cloudEnabled,
	cloudControlsHidden = false,
	executionTarget,
	repoUrl,
	cloudBranch,
	signedIn,
	signingIn,
	onCloudBranchChange,
	onListCloudRepositories,
	onListCloudBranches,
	onOpenExternalUrl,
	onRepoUrlChange,
	onSignIn,
	workspaceRoot,
	workspaces,
	onRefreshWorkspaces,
	onSwitchWorkspace,
	onPickWorkspaceDirectory,
	onSelectChat,
	currentBranch,
	onListGitBranches,
	onSwitchGitBranch,
	workIn = "local",
	onWorkInChange,
}: {
	cloudEnabled: boolean;
	cloudControlsHidden?: boolean;
	executionTarget: "local" | "cloud";
	repoUrl: string;
	cloudBranch: string;
	onCloudBranchChange: (branch: string) => void;
	onListCloudRepositories: () => Promise<CloudRepositoryListResult>;
	onListCloudBranches: (
		repositoryId: number,
		options?: CloudBranchListOptions,
	) => Promise<CloudBranchListResult>;
	onOpenExternalUrl: (url: string) => Promise<void>;
	signedIn: boolean;
	signingIn: boolean;
	onRepoUrlChange: (repoUrl: string) => void;
	onSignIn: () => void | Promise<void>;
	workspaceRoot: string;
	workspaces: string[];
	onRefreshWorkspaces: () => Promise<void>;
	onSwitchWorkspace: (workspacePath: string) => Promise<boolean>;
	onPickWorkspaceDirectory: (initialPath?: string) => Promise<string | null>;
	onSelectChat: () => Promise<boolean>;
	/** Branch name, "no-git" for a non-repo folder, null while discovery is pending. */
	currentBranch: string | null;
	onListGitBranches: () => Promise<{ current: string; branches: string[] }>;
	onSwitchGitBranch: (branch: string) => Promise<boolean>;
	/** Where the next task runs; the worktree toggle is shown for git repos when provided. */
	workIn?: WorkIn;
	onWorkInChange?: (next: WorkIn) => void;
}) {
	const [openMenu, setOpenMenu] = useState<
		"workspace" | "branch" | "cloud-repository" | "cloud-branch" | null
	>(null);
	const [cloudRepositoryId, setCloudRepositoryId] = useState<number>();
	const [cloudDefaultBranch, setCloudDefaultBranch] = useState("");
	const isChatWorkspace =
		!workspaceRoot.trim() || isChatWorkspacePath(workspaceRoot);
	const containerRef = useRef<HTMLDivElement>(null);
	const handleCloudRepositoriesLoaded = useCallback(
		(repositories: CloudRepositoryOption[]) => {
			const selected = repositories.find(
				(repository) =>
					normalizeCloudRepositoryUrl(repository.url) ===
					normalizeCloudRepositoryUrl(repoUrl),
			);
			setCloudRepositoryId(selected?.id);
			setCloudDefaultBranch(selected?.defaultBranch ?? "");
		},
		[repoUrl],
	);
	useEffect(() => {
		if (repoUrl.trim()) return;
		setCloudRepositoryId(undefined);
		setCloudDefaultBranch("");
	}, [repoUrl]);
	useEffect(() => {
		if (
			executionTarget !== "cloud" ||
			!signedIn ||
			!repoUrl.trim() ||
			cloudRepositoryId !== undefined
		) {
			return;
		}
		let cancelled = false;
		void onListCloudRepositories()
			.then((result) => {
				if (!cancelled) handleCloudRepositoriesLoaded(result.repositories);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [
		cloudRepositoryId,
		executionTarget,
		handleCloudRepositoriesLoaded,
		onListCloudRepositories,
		repoUrl,
		signedIn,
	]);

	// Close whichever menu is open when clicking outside the control row.
	useEffect(() => {
		if (!openMenu) return;
		const handlePointerDown = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setOpenMenu(null);
			}
		};
		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [openMenu]);

	return (
		<div
			className="flex min-w-0 flex-wrap items-center gap-2"
			ref={containerRef}
		>
			{cloudEnabled && executionTarget === "cloud" ? (
				cloudControlsHidden ? null : signedIn ? (
					<>
						<CloudRepositoryPicker
							onClose={() => setOpenMenu(null)}
							onListRepositories={onListCloudRepositories}
							onOpenExternalUrl={onOpenExternalUrl}
							onRepositoriesLoaded={handleCloudRepositoriesLoaded}
							onSelect={(repository) => {
								setCloudRepositoryId(repository.id);
								setCloudDefaultBranch(repository.defaultBranch);
								onRepoUrlChange(normalizeCloudRepositoryUrl(repository.url));
								onCloudBranchChange(repository.defaultBranch);
							}}
							onToggle={() =>
								setOpenMenu((current) =>
									current === "cloud-repository" ? null : "cloud-repository",
								)
							}
							open={openMenu === "cloud-repository"}
							repoUrl={repoUrl}
						/>
						<CloudBranchPicker
							branch={cloudBranch}
							defaultBranch={cloudDefaultBranch}
							key={cloudRepositoryId ?? "no-repository"}
							onBranchChange={onCloudBranchChange}
							onClose={() => setOpenMenu(null)}
							onListBranches={onListCloudBranches}
							onToggle={() =>
								setOpenMenu((current) =>
									current === "cloud-branch" ? null : "cloud-branch",
								)
							}
							open={openMenu === "cloud-branch"}
							repositoryId={cloudRepositoryId}
						/>
					</>
				) : (
					<Button
						disabled={signingIn}
						onClick={() => void onSignIn()}
						size="sm"
						variant="outline"
					>
						<LogIn className="size-3.5" />
						{signingIn ? "正在等待浏览器…" : "登录以使用云端"}
					</Button>
				)
			) : (
				<>
					<WorkspacePicker
						onClose={() => setOpenMenu(null)}
						onPickWorkspaceDirectory={onPickWorkspaceDirectory}
						onRefreshWorkspaces={onRefreshWorkspaces}
						onSelectChat={onSelectChat}
						onSwitchWorkspace={onSwitchWorkspace}
						onToggle={() =>
							setOpenMenu((current) =>
								current === "workspace" ? null : "workspace",
							)
						}
						open={openMenu === "workspace"}
						workspaceRoot={workspaceRoot}
						workspaces={workspaces}
					/>
					{!isChatWorkspace &&
					currentBranch !== null &&
					currentBranch !== "no-git" ? (
						<>
							<BranchPicker
								currentBranch={currentBranch}
								onClose={() => setOpenMenu(null)}
								onListGitBranches={onListGitBranches}
								onSwitchGitBranch={onSwitchGitBranch}
								onToggle={() =>
									setOpenMenu((current) =>
										current === "branch" ? null : "branch",
									)
								}
								open={openMenu === "branch"}
							/>
							{onWorkInChange ? (
								<WorktreeToggle onChange={onWorkInChange} value={workIn} />
							) : null}
						</>
					) : null}
				</>
			)}
		</div>
	);
}
