"use client";

import { Switch } from "@cline/ui";
import {
	ArrowLeft,
	Brain,
	ChevronDown,
	ChevronRight,
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
	FileIcon,
	Globe,
	ImageIcon,
	KeyRound,
	Link as LinkIcon,
	Loader2,
	Mic,
	MonitorSmartphone,
	Plus,
	PlusCircle,
	RefreshCw,
	Search,
	Star,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOAuthUserCode } from "@/hooks/use-oauth-user-code";
import { openExternalUrl } from "@/lib/desktop-client";
import {
	getProviderAuthKind,
	isProviderConnected,
	type ProviderAuthKind,
} from "@/lib/provider-connection";
import { getProviderApiKeyUrl } from "@/lib/provider-key-urls";
import {
	loadProviderModels,
	supportsAudio,
} from "@/lib/provider-model-catalog";
import type {
	Provider,
	ProviderConfigField,
	ProviderConfigFieldPrimitive,
	ProviderModel,
	ProviderSettingsUpdate,
} from "@/lib/provider-schema";
import { cn } from "@/lib/utils";
import { AudioModelBadges } from "./audio-model-badges";

// Inputs nested inside a composed bordered box (icon + input + buttons in
// one rounded frame) must strip the Input component's own chrome — border,
// dark-mode bg tint, shadow, focus ring — or the inner field reads as a
// mismatched second box inside the frame.
const EMBEDDED_INPUT_CLASS =
	"h-7 flex-1 border-0 bg-transparent px-0 text-sm shadow-none outline-none placeholder:text-muted-foreground dark:bg-transparent focus-visible:ring-0";

const FAVORITE_MODELS_STORAGE_KEY = "cline.favorite-provider-models.v1";

// Providers whose model lists carry recommended-feed tiers (see the SDK's
// applyClineFeaturedModels). Only these are worth a per-card list fetch.
const FEATURED_PROVIDER_IDS = new Set(["cline", "cline-pass"]);

/** Tier + feed tags rendered as small pills next to the model name. */
function featuredBadges(model: ProviderModel): string[] {
	const featured = model.featured;
	if (!featured) {
		return [];
	}
	const badges: string[] = [];
	if (featured.tier === "recommended") {
		badges.push("推荐");
	} else if (featured.tier === "free") {
		badges.push("免费");
	}
	for (const tag of featured.tags) {
		if (!badges.some((badge) => badge.toLowerCase() === tag.toLowerCase())) {
			badges.push(tag);
		}
	}
	return badges;
}

function readFavoriteModels(): Record<string, string[]> {
	if (typeof window === "undefined") return {};
	try {
		const value = JSON.parse(
			window.localStorage.getItem(FAVORITE_MODELS_STORAGE_KEY) ?? "{}",
		);
		if (!value || typeof value !== "object" || Array.isArray(value)) return {};
		return Object.fromEntries(
			Object.entries(value).filter(
				(entry): entry is [string, string[]] =>
					typeof entry[0] === "string" &&
					Array.isArray(entry[1]) &&
					entry[1].every((modelId) => typeof modelId === "string"),
			),
		);
	} catch {
		return {};
	}
}

function writeFavoriteModels(value: Record<string, string[]>): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(
		FAVORITE_MODELS_STORAGE_KEY,
		JSON.stringify(value),
	);
}

// -----------------------------------------------------------
// Shared bits
// -----------------------------------------------------------

const AUTH_KIND_LABEL: Record<ProviderAuthKind, string> = {
	oauth: "登录",
	local: "本地 CLI",
	"api-key": "API 密钥",
};

function AuthKindHint({ kind }: { kind: ProviderAuthKind }) {
	const Icon =
		kind === "oauth" ? Globe : kind === "local" ? MonitorSmartphone : KeyRound;
	return (
		<span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
			<Icon aria-hidden="true" className="size-3" />
			{AUTH_KIND_LABEL[kind]}
		</span>
	);
}

function getInitialConfigValues(
	provider: Provider,
): Record<string, ProviderConfigFieldPrimitive> {
	const values: Record<string, ProviderConfigFieldPrimitive> = {
		...(provider.configValues ?? {}),
	};
	if (provider.apiKey !== undefined && values.apiKey === undefined) {
		values.apiKey = provider.apiKey;
	}
	if (provider.baseUrl !== undefined && values.baseUrl === undefined) {
		values.baseUrl = provider.baseUrl;
	}
	for (const field of provider.configFields ?? []) {
		if (values[field.path] === undefined && field.defaultValue !== undefined) {
			values[field.path] = field.defaultValue;
		}
	}
	return values;
}

function fieldValueToString(value: ProviderConfigFieldPrimitive | undefined) {
	if (value === undefined || value === null) return "";
	return String(value);
}

function coerceFieldValue(
	field: ProviderConfigField,
	value: string | boolean,
): ProviderConfigFieldPrimitive {
	if (field.type === "boolean") {
		return Boolean(value);
	}
	if (typeof value === "boolean") {
		return value;
	}
	if (field.type === "select") {
		const option = field.options?.find((item) => String(item.value) === value);
		if (option) {
			return option.value;
		}
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}
	if (field.type === "number") {
		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return trimmed;
}

// -----------------------------------------------------------
// Provider LIST content
// -----------------------------------------------------------

function ProviderRow({
	provider,
	onConfigure,
	selected,
}: {
	provider: Provider;
	onConfigure: (id: string) => void;
	selected: boolean;
}) {
	const connected = isProviderConnected(provider);
	const authKind = getProviderAuthKind(provider);
	return (
		<button
			className={cn(
				"flex min-h-12 w-full items-center gap-3 border-b px-2 py-2 text-left hover:bg-surface-hover-lighter focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				selected && "bg-surface-hover",
			)}
			onClick={() => onConfigure(provider.id)}
			type="button"
		>
			<p className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
				{provider.name}
			</p>
			{connected ? (
				<span className="shrink-0 text-xs font-medium text-muted-foreground">
					已配置
				</span>
			) : (
				<AuthKindHint kind={authKind} />
			)}
			<ChevronRight className="size-4 shrink-0 text-muted-foreground" />
		</button>
	);
}

function ProviderSection({
	title,
	description,
	expanded,
	onToggle,
	children,
}: {
	title: string;
	description?: string;
	expanded: boolean;
	onToggle: () => void;
	children: ReactNode;
}) {
	const contentId = useId();
	return (
		<div className="mt-8 first:mt-0">
			<h2>
				<button
					aria-expanded={expanded}
					aria-controls={contentId}
					className="mb-2 flex w-full items-center gap-2 rounded text-left text-sm font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={onToggle}
					type="button"
				>
					<ChevronRight
						aria-hidden="true"
						className={cn(
							"size-4 shrink-0 transition-transform",
							expanded && "rotate-90",
						)}
					/>
					{title}
				</button>
			</h2>
			<div hidden={!expanded} id={contentId}>
				{description ? (
					<p className="mb-2 text-sm text-muted-foreground">{description}</p>
				) : null}
				{children}
			</div>
		</div>
	);
}

export function ProviderListContent({
	providers,
	onConfigure,
	onAddProvider,
	selectedProviderId,
	variant = "page",
}: {
	providers: Provider[];
	onConfigure: (id: string) => void;
	onAddProvider: () => void;
	selectedProviderId?: string | null;
	variant?: "page" | "panel";
}) {
	const [providerSearch, setProviderSearch] = useState("");
	const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
		new Set(),
	);
	const toggleSection = (title: string) => {
		setCollapsedSections((current) => {
			const next = new Set(current);
			if (next.has(title)) next.delete(title);
			else next.add(title);
			return next;
		});
	};
	const isPanel = variant === "panel";

	const providerSearchQuery = providerSearch.trim().toLowerCase();
	const filteredProviders = providerSearchQuery
		? providers.filter(
				(provider) =>
					provider.name.toLowerCase().includes(providerSearchQuery) ||
					provider.id.toLowerCase().includes(providerSearchQuery),
			)
		: providers;

	const connectedProviders = filteredProviders.filter(isProviderConnected);
	const availableProviders = filteredProviders.filter(
		(provider) => !isProviderConnected(provider),
	);
	// The catalog arrives sorted by popular rank, then name; "popular" entries
	// surface first so the common providers don't drown in the long tail.
	const popularProviders = availableProviders.filter((provider) =>
		provider.capabilities?.includes("popular"),
	);
	const otherProviders = availableProviders.filter(
		(provider) => !provider.capabilities?.includes("popular"),
	);
	const connectedCount = providers.filter(isProviderConnected).length;

	const renderRows = (entries: Provider[]) => (
		<div className="overflow-hidden border-t">
			{entries.map((provider) => (
				<ProviderRow
					key={provider.id}
					onConfigure={onConfigure}
					provider={provider}
					selected={selectedProviderId === provider.id}
				/>
			))}
		</div>
	);

	return (
		<div
			className={cn(
				"flex h-full min-h-0 min-w-0 flex-col overflow-hidden py-10 max-[720px]:px-4 max-[720px]:py-5",
				isPanel ? "px-8" : "px-18 max-[1200px]:px-8",
			)}
		>
			<div
				className={cn(
					"mb-6 flex shrink-0 items-start justify-between gap-6 max-[860px]:flex-col max-[860px]:items-stretch",
					isPanel ? "max-w-none" : "max-w-2xl",
				)}
			>
				<div className="min-w-0">
					<h1
						className={cn(
							"truncate font-semibold leading-[1.15] text-foreground",
							isPanel ? "text-2xl" : "text-3xl",
						)}
					>
						模型供应商
					</h1>
					<p className="mt-3 text-base leading-6 text-muted-foreground">
						{connectedCount === 0
							? "连接供应商即可开始使用模型。"
							: `${connectedCount} 个已配置 · 共 ${providers.length} 个可用`}
					</p>
				</div>
				<Button
					className="h-8 shrink-0 rounded-md bg-foreground px-3 text-sm text-background hover:bg-foreground/90 max-[860px]:self-start"
					onClick={onAddProvider}
					type="button"
				>
					<PlusCircle className="size-4" />
					添加供应商
				</Button>
			</div>

			<div
				className={cn("mb-6 shrink-0", isPanel ? "max-w-none" : "max-w-2xl")}
			>
				<div className="flex h-9 items-center gap-2 rounded border bg-background px-3">
					<Search className="size-4 shrink-0 text-muted-foreground" />
					<Input
						aria-label="搜索模型供应商"
						className={EMBEDDED_INPUT_CLASS}
						onChange={(event) => {
							setProviderSearch(event.target.value);
							setCollapsedSections(new Set());
						}}
						placeholder="搜索供应商"
						value={providerSearch}
					/>
					{providerSearch ? (
						<button
							aria-label="清除供应商搜索"
							className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
							onClick={() => setProviderSearch("")}
							type="button"
						>
							<X className="size-3.5" />
						</button>
					) : null}
				</div>
			</div>

			<section
				aria-label="模型供应商"
				className={cn(
					"min-h-0 flex-1 overflow-y-auto overscroll-contain",
					isPanel ? "max-w-none" : "max-w-2xl",
				)}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Allow keyboard scrolling of the provider list.
				tabIndex={0}
			>
				{filteredProviders.length === 0 ? (
					<div className="border-y px-2 py-6 text-base text-muted-foreground">
						没有匹配“{providerSearch.trim()}”的供应商。
					</div>
				) : null}

				{connectedProviders.length > 0 ? (
					<ProviderSection
						title="已配置"
						expanded={!collapsedSections.has("已配置")}
						onToggle={() => toggleSection("已配置")}
					>
						{renderRows(connectedProviders)}
					</ProviderSection>
				) : null}

				{popularProviders.length > 0 ? (
					<ProviderSection
						expanded={!collapsedSections.has("热门")}
						onToggle={() => toggleSection("热门")}
						description={
							connectedProviders.length === 0 && !providerSearchQuery
								? "登录或添加 API 密钥即可连接。"
								: undefined
						}
						title="热门"
					>
						{renderRows(popularProviders)}
					</ProviderSection>
				) : null}

				{otherProviders.length > 0 ? (
					<ProviderSection
						title="所有供应商"
						expanded={!collapsedSections.has("所有供应商")}
						onToggle={() => toggleSection("所有供应商")}
					>
						{renderRows(otherProviders)}
					</ProviderSection>
				) : null}
			</section>
		</div>
	);
}

// -----------------------------------------------------------
// Provider DETAIL content
// -----------------------------------------------------------

function ConfigFieldRow({
	field,
	value,
	provider,
	shown,
	onToggleShown,
	onDraftChange,
	onCommit,
}: {
	field: ProviderConfigField;
	value: ProviderConfigFieldPrimitive | undefined;
	provider: Provider;
	shown: boolean;
	onToggleShown: () => void;
	onDraftChange: (value: string) => void;
	onCommit: (value: string | boolean) => void;
}) {
	const valueText = fieldValueToString(value);
	const isSecret = field.type === "password" || field.secret;
	const providerKeyUrl = getProviderApiKeyUrl(provider);
	return (
		<div className="grid min-h-18 grid-cols-[minmax(12rem,0.55fr)_minmax(16rem,0.45fr)] items-center gap-6 border-b py-4 max-[900px]:grid-cols-1 max-[900px]:gap-3">
			<header>
				<h3 className="text-lg font-semibold text-foreground">{field.label}</h3>
				{field.description ? (
					<p className="mt-1 text-base leading-relaxed text-muted-foreground">
						{field.description}
					</p>
				) : null}
				{field.path === "apiKey" && providerKeyUrl ? (
					<button
						className="mt-1 inline-flex items-center gap-1 text-sm text-primary underline-offset-2 transition-colors hover:underline"
						onClick={() => void openExternalUrl(providerKeyUrl)}
						type="button"
					>
						{provider.docLabel || `获取 ${provider.name} API 密钥`}
						<ExternalLink className="size-3.5" />
					</button>
				) : null}
			</header>
			{field.type === "boolean" ? (
				<div className="flex items-center justify-end">
					<span className="text-sm text-muted-foreground">{field.label}</span>
					<Switch
						aria-label={field.label}
						checked={Boolean(value)}
						onCheckedChange={(checked) => onCommit(checked)}
					/>
				</div>
			) : field.type === "select" ? (
				<select
					className="h-9 w-full rounded border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
					onChange={(event) => onCommit(event.target.value)}
					value={valueText}
				>
					<option value="">未设置</option>
					{field.options?.map((option) => (
						<option key={String(option.value)} value={String(option.value)}>
							{option.label}
						</option>
					))}
				</select>
			) : (
				<div className="flex h-9 items-center gap-2 rounded border border-border bg-background px-3">
					{field.type === "url" ? (
						<LinkIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
					) : null}
					<Input
						className={EMBEDDED_INPUT_CLASS}
						onBlur={() => onCommit(valueText)}
						onChange={(event) => onDraftChange(event.target.value)}
						placeholder={field.placeholder}
						spellCheck={false}
						type={
							isSecret && !shown
								? "password"
								: field.type === "number"
									? "number"
									: field.type === "url"
										? "url"
										: "text"
						}
						value={valueText}
					/>
					{isSecret ? (
						<>
							<Button
								aria-label={shown ? "隐藏密钥" : "显示密钥"}
								className="rounded-md p-1 text-muted-foreground hover:text-foreground "
								onClick={onToggleShown}
								variant="ghost"
							>
								{shown ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
							</Button>
							<Button
								aria-label={`复制${field.label}`}
								className="rounded-md p-1 text-muted-foreground hover:text-foreground "
								onClick={() => navigator.clipboard.writeText(valueText)}
								variant="ghost"
							>
								<Copy className="h-4 w-4" />
							</Button>
						</>
					) : null}
				</div>
			)}
		</div>
	);
}

export function ProviderDetailContent({
	provider,
	onBack,
	onUpdate,
	onLoadModels,
	onUpdateModels,
	modelsLoading = false,
	modelsError,
	onOAuthLogin,
	oauthLoginPending = false,
	onConnect,
	onDisconnect,
	variant = "page",
}: {
	provider: Provider;
	onBack: () => void;
	onUpdate: (updates: ProviderSettingsUpdate) => void;
	onLoadModels?: () => void;
	onUpdateModels?: (models: string[]) => void;
	modelsLoading?: boolean;
	modelsError?: string | null;
	onOAuthLogin?: () => void;
	oauthLoginPending?: boolean;
	onConnect?: () => void;
	onDisconnect?: () => void;
	variant?: "page" | "panel";
}) {
	const deviceUserCode = useOAuthUserCode(oauthLoginPending);
	const [shownSecrets, setShownSecrets] = useState<Record<string, boolean>>({});
	const [localConfigValues, setLocalConfigValues] = useState<
		Record<string, ProviderConfigFieldPrimitive>
	>(() => getInitialConfigValues(provider));
	const [manualKeyExpanded, setManualKeyExpanded] = useState(false);
	const [modelSearchState, setModelSearchState] = useState<{
		providerId: string;
		value: string;
	} | null>(null);
	const [copiedModelState, setCopiedModelState] = useState<{
		modelId: string;
		providerId: string;
	} | null>(null);
	const [addModelState, setAddModelState] = useState<{
		providerId: string;
		value: string;
	} | null>(null);
	const [favoriteModels, setFavoriteModels] = useState(readFavoriteModels);
	const copiedModelTimeoutRef = useRef<number | undefined>(undefined);

	const authKind = getProviderAuthKind(provider);
	const connected = isProviderConnected(provider);
	const configFields = provider.configFields ?? [];
	const apiKeyField = configFields.find((field) => field.path === "apiKey");
	const apiKeyValue = fieldValueToString(localConfigValues.apiKey);
	// The catalog's modelList is fetched without the recommended-feed overlay
	// (the catalog must not block on the feed); featured providers refresh
	// their list here so tier badges and live entries can render. The result
	// is scoped to the provider AND the modelList revision it was fetched
	// for: an unscoped copy kept shadowing the next provider's models after
	// a switch (even when its own request failed) and masked membership
	// updates — adding a model would then submit the stale list as the
	// complete configuration and drop earlier additions.
	const [featuredModelList, setFeaturedModelList] = useState<{
		providerId: string;
		baseModelList: Provider["modelList"];
		models: ProviderModel[];
	} | null>(null);
	useEffect(() => {
		if (!FEATURED_PROVIDER_IDS.has(provider.id)) {
			return;
		}
		let cancelled = false;
		loadProviderModels(provider.id)
			.then((models) => {
				if (!cancelled && models.length > 0) {
					setFeaturedModelList({
						providerId: provider.id,
						baseModelList: provider.modelList,
						models,
					});
				}
			})
			.catch(() => {
				// Keep the catalog snapshot when the refresh fails.
			});
		return () => {
			cancelled = true;
		};
	}, [provider.id, provider.modelList]);
	const modelList =
		featuredModelList &&
		featuredModelList.providerId === provider.id &&
		featuredModelList.baseModelList === provider.modelList
			? featuredModelList.models
			: (provider.modelList ?? []);
	const modelSearch =
		modelSearchState?.providerId === provider.id ? modelSearchState.value : "";
	const copiedModelId =
		copiedModelState?.providerId === provider.id
			? copiedModelState.modelId
			: null;
	const isAddingModel = addModelState?.providerId === provider.id;
	const newModelId = isAddingModel ? addModelState.value : "";
	const modelSearchQuery = modelSearch.trim().toLowerCase();
	const matchingModelList = modelSearchQuery
		? modelList.filter(
				(model) =>
					model.name.toLowerCase().includes(modelSearchQuery) ||
					model.id.toLowerCase().includes(modelSearchQuery),
			)
		: modelList;
	const favoriteModelIds = new Set(favoriteModels[provider.id] ?? []);
	const filteredModelList = [...matchingModelList].sort(
		(a, b) =>
			Number(favoriteModelIds.has(b.id)) - Number(favoriteModelIds.has(a.id)),
	);
	const isPanel = variant === "panel";

	useEffect(
		() => () => {
			if (copiedModelTimeoutRef.current !== undefined) {
				window.clearTimeout(copiedModelTimeoutRef.current);
			}
		},
		[],
	);

	const commitField = (
		field: ProviderConfigField,
		rawValue: string | boolean,
	) => {
		const value = coerceFieldValue(field, rawValue);
		const nextConfigValues = {
			...localConfigValues,
			[field.path]: value,
		};
		setLocalConfigValues(nextConfigValues);

		const updates: ProviderSettingsUpdate = {
			configValues: { [field.path]: value },
		};
		if (field.path === "apiKey") {
			updates.apiKey = fieldValueToString(value);
		}
		if (field.path === "baseUrl") {
			updates.baseUrl = fieldValueToString(value);
		}
		onUpdate(updates);
	};

	const handleDisconnect = () => {
		// The persisted entry is being removed; clear the local drafts so
		// stale secrets don't linger in the inputs.
		setShownSecrets({});
		setManualKeyExpanded(false);
		setLocalConfigValues(
			getInitialConfigValues({
				...provider,
				apiKey: undefined,
				configValues: undefined,
			}),
		);
		onDisconnect?.();
	};

	const renderConfigFieldRow = (field: ProviderConfigField) => (
		<ConfigFieldRow
			field={field}
			key={field.path}
			onCommit={(value) => commitField(field, value)}
			onDraftChange={(value) =>
				setLocalConfigValues((current) => ({
					...current,
					[field.path]: value,
				}))
			}
			onToggleShown={() =>
				setShownSecrets((current) => ({
					...current,
					[field.path]: !(current[field.path] ?? false),
				}))
			}
			provider={provider}
			shown={shownSecrets[field.path] ?? false}
			value={localConfigValues[field.path]}
		/>
	);

	const copyModelId = (modelId: string) => {
		if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
			return;
		}
		void navigator.clipboard.writeText(modelId).then(() => {
			setCopiedModelState({ modelId, providerId: provider.id });
			if (copiedModelTimeoutRef.current !== undefined) {
				window.clearTimeout(copiedModelTimeoutRef.current);
			}
			copiedModelTimeoutRef.current = window.setTimeout(
				() => setCopiedModelState(null),
				1600,
			);
		});
	};

	const addModel = () => {
		const modelId = newModelId.trim();
		// Submit the union of the displayed and configured lists: the update
		// replaces the provider's complete model configuration, so basing it
		// on the displayed list alone could silently drop configured entries
		// whenever the two diverge.
		const baseIds = [
			...new Set([
				...modelList.map((model) => model.id),
				...(provider.modelList ?? []).map((model) => model.id),
			]),
		];
		if (!modelId || baseIds.includes(modelId)) {
			return;
		}
		onUpdateModels?.([...baseIds, modelId]);
		setAddModelState(null);
	};

	const toggleFavoriteModel = (modelId: string) => {
		setFavoriteModels((current) => {
			const providerFavorites = new Set(current[provider.id] ?? []);
			if (providerFavorites.has(modelId)) providerFavorites.delete(modelId);
			else providerFavorites.add(modelId);
			const next = {
				...current,
				[provider.id]: Array.from(providerFavorites),
			};
			writeFavoriteModels(next);
			return next;
		});
	};

	const oauthConnected = Boolean(provider.oauthAccessTokenPresent);

	const connectionSection =
		authKind === "oauth" ? (
			<section className={cn("mb-8", isPanel ? "max-w-none" : "max-w-344")}>
				{oauthConnected ? (
					<div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
						<div className="min-w-0">
							<p className="text-sm font-medium text-foreground">
								已通过浏览器登录
							</p>
							<p className="text-xs text-muted-foreground">
								该供应商使用你的账户进行身份验证，无需 API 密钥。
							</p>
						</div>
					</div>
				) : connected && apiKeyValue ? (
					<div className="flex flex-col">
						<div className="mb-2 flex items-center justify-between gap-4">
							<p className="text-sm text-muted-foreground">
								已使用 API 密钥配置。
							</p>
						</div>
						{apiKeyField ? renderConfigFieldRow(apiKeyField) : null}
					</div>
				) : (
					<div className="rounded-lg border px-4 py-4">
						<p className="text-sm font-medium text-foreground">
							登录 {provider.name}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">
							通过浏览器完成连接，无需 API 密钥。
						</p>
						{onOAuthLogin ? (
							<Button
								className="mt-3 inline-flex items-center gap-2"
								disabled={oauthLoginPending}
								onClick={onOAuthLogin}
								type="button"
								variant="default"
							>
								{oauthLoginPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : null}
								<span>
									{oauthLoginPending
										? "正在等待浏览器…"
										: "使用浏览器登录"}
								</span>
							</Button>
						) : null}
						{oauthLoginPending && deviceUserCode ? (
							<p className="mt-3 text-xs text-muted-foreground">
								请在浏览器中确认此代码：{" "}
								<span className="font-mono font-medium text-foreground">
									{deviceUserCode}
								</span>
							</p>
						) : null}
						{apiKeyField ? (
							<div className="mt-3">
								<Button
									aria-expanded={manualKeyExpanded}
									className="-ml-2"
									onClick={() => setManualKeyExpanded((open) => !open)}
									size="sm"
									type="button"
									variant="ghost"
								>
									改用 API 密钥
									<ChevronDown
										aria-hidden="true"
										className={cn(
											"size-3.5 transition-transform",
											manualKeyExpanded && "rotate-180",
										)}
									/>
								</Button>
								{manualKeyExpanded ? (
									<div className="mt-1">
										{renderConfigFieldRow(apiKeyField)}
									</div>
								) : null}
							</div>
						) : null}
					</div>
				)}
			</section>
		) : authKind === "local" ? (
			<section className={cn("mb-8", isPanel ? "max-w-none" : "max-w-344")}>
				<div className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3">
					<div className="min-w-0">
						<p className="text-sm font-medium text-foreground">
							使用本地 CLI 登录
						</p>
						<p className="text-xs text-muted-foreground">
							凭据来自本机上该供应商自带的 CLI，无需 API 密钥。
						</p>
					</div>
					{!connected && onConnect && (
						<Button
							className="shrink-0"
							onClick={onConnect}
							size="sm"
							type="button"
						>
							连接
						</Button>
					)}
				</div>
			</section>
		) : (
			<section className={cn("mb-8", isPanel ? "max-w-none" : "max-w-344")}>
				{configFields.length > 0 ? (
					<div className="flex flex-col">
						{configFields.map(renderConfigFieldRow)}
					</div>
				) : null}
				{!connected ? (
					<div className="mt-4 flex items-center justify-between gap-4">
						<p className="text-xs text-muted-foreground">
							保存 API 密钥后会自动配置该供应商。如果凭据来自你的环境变量或本地端点，请使用“连接”。
						</p>
						{onConnect ? (
							<Button
								className="shrink-0"
								onClick={onConnect}
								size="sm"
								type="button"
								variant="outline"
							>
								连接
							</Button>
						) : null}
					</div>
				) : null}
			</section>
		);

	return (
		<div
			className={cn(
				"flex h-full min-h-0 min-w-0 flex-col overflow-y-auto py-10 max-[720px]:px-4 max-[720px]:py-5",
				isPanel ? "px-6" : "px-18 max-[1200px]:px-8",
			)}
		>
			<div className="max-h-1/2 shrink-0 overflow-y-auto overscroll-contain">
				{/* Back + title (the panel variant is always open, so no close button) */}
				<div className="mb-8 flex items-center gap-3">
					{isPanel ? null : (
						<Button
							aria-label="返回供应商列表"
							className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-hover hover:text-foreground "
							onClick={onBack}
							variant="ghost"
						>
							<ArrowLeft className="size-4" />
						</Button>
					)}
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 flex-wrap items-center gap-3">
							<h1
								className={cn(
									"min-w-0 truncate font-semibold leading-[1.15] text-foreground",
									isPanel ? "text-2xl" : "text-3xl",
								)}
							>
								{provider.name}
							</h1>
							<span className="inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
								{connected ? "已配置" : "未配置"}
							</span>
						</div>
						{connected && authKind !== "oauth" && authKind !== "local" ? (
							<p className="mt-2 text-xs text-muted-foreground">
								以下字段的修改将自动保存。
							</p>
						) : null}
					</div>
					{connected && onDisconnect ? (
						<Button
							className="shrink-0"
							onClick={handleDisconnect}
							size="sm"
							type="button"
							variant="outline"
						>
							{authKind === "oauth" && oauthConnected
								? "退出登录"
								: "断开连接"}
						</Button>
					) : null}
				</div>

				{connectionSection}
			</div>

			{/* Reserve usable space for model controls and rows. If the pane is too
			    short, its outer scroll area keeps this section reachable. */}
			<section
				className={cn(
					"flex min-h-64 flex-1 flex-col overflow-y-auto rounded-lg border",
					isPanel ? "max-w-none" : "max-w-184",
				)}
			>
				<div className="flex h-12 shrink-0 items-center justify-between bg-muted/40 px-4">
					<div className="flex items-center gap-1">
						<h2 className="mr-1 text-lg font-medium text-muted-foreground">
							模型
						</h2>
						<Button
							aria-label="刷新模型列表"
							className="size-4 rounded-none p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
							disabled={modelsLoading}
							onClick={onLoadModels}
							variant="ghost"
						>
							<RefreshCw
								className={cn("size-4", modelsLoading && "animate-spin")}
							/>
						</Button>
					</div>
					{onUpdateModels ? (
						<Button
							aria-label="添加模型"
							className="size-4 rounded-none p-0 text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground"
							disabled={modelsLoading}
							onClick={() =>
								setAddModelState({ providerId: provider.id, value: "" })
							}
							variant="ghost"
						>
							<Plus className="size-4" />
						</Button>
					) : null}
				</div>
				{isAddingModel ? (
					<div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
						<Input
							aria-label="新的模型 ID"
							autoFocus
							className="h-9 flex-1 font-mono"
							onChange={(event) =>
								setAddModelState({
									providerId: provider.id,
									value: event.target.value,
								})
							}
							onKeyDown={(event) => {
								if (event.key === "Enter") addModel();
								if (event.key === "Escape") setAddModelState(null);
							}}
							placeholder="模型 ID"
							value={newModelId}
						/>
						<Button disabled={!newModelId.trim()} onClick={addModel} size="sm">
							添加
						</Button>
						<Button
							onClick={() => setAddModelState(null)}
							size="sm"
							variant="ghost"
						>
							取消
						</Button>
					</div>
				) : null}

				{modelsError ? (
					<div className="border-t border-destructive/30 bg-destructive/5 px-4 py-2">
						<p className="text-sm text-destructive">{modelsError}</p>
					</div>
				) : null}
				{/* A failed refresh means the endpoint's list is unknown; the
					    bundled placeholder models would only read as a fallback. */}
				{modelList.length > 0 && !modelsError ? (
					<div className="flex min-h-0 flex-1 flex-col gap-3">
						<div className="mx-4 mt-4 flex h-9 shrink-0 items-center gap-2 rounded border bg-background px-3">
							<Search className="size-4 shrink-0 text-muted-foreground" />
							<Input
								aria-label="搜索模型"
								className={EMBEDDED_INPUT_CLASS}
								onChange={(event) =>
									setModelSearchState({
										providerId: provider.id,
										value: event.target.value,
									})
								}
								placeholder="按名称或 ID 搜索模型"
								spellCheck={false}
								value={modelSearch}
							/>
						</div>
						{filteredModelList.length > 0 ? (
							<section
								aria-label="模型"
								className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t"
								// biome-ignore lint/a11y/noNoninteractiveTabindex: Allow keyboard scrolling of the model list.
								tabIndex={0}
							>
								{filteredModelList.map((model) => (
									<div
										className="group flex min-h-16 items-center gap-3 border-b px-4 py-3 hover:bg-surface-hover-lighter"
										key={model.id}
									>
										<div className="min-w-0 flex-1 font-mono">
											<div className="flex min-w-0 items-center gap-1.5 px-1 text-sm text-foreground">
												<span className="truncate">{model.name}</span>
												{featuredBadges(model).map((badge) => (
													<span
														className="inline-flex shrink-0 items-center rounded bg-surface-hover px-1 py-px font-sans text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground"
														key={badge}
													>
														{badge}
													</span>
												))}
												{/* Capability icons */}
												{model.supportsAttachments && (
													<span
														aria-label="文件支持"
														role="img"
														title="文件支持"
													>
														<FileIcon
															aria-hidden="true"
															className="h-3.5 w-3.5 text-muted-foreground"
														/>
													</span>
												)}
												{model.supportsVision && (
													<span
														aria-label="图片支持"
														role="img"
														title="图片支持"
													>
														<ImageIcon
															aria-hidden="true"
															className="h-3.5 w-3.5 text-muted-foreground"
														/>
													</span>
												)}
												<AudioModelBadges model={model} />
												{supportsAudio(model) &&
													model.operation !== "transcription" &&
													model.operation !== "realtime" && (
														<span
															aria-label="音频支持"
															role="img"
															title="音频支持"
														>
															<Mic
																aria-hidden="true"
																className="h-3.5 w-3.5 text-muted-foreground"
															/>
														</span>
													)}
												{model.supportsReasoning && (
													<span
														aria-label="推理支持"
														role="img"
														title="推理支持"
													>
														<Brain
															aria-hidden="true"
															className="h-3.5 w-3.5 text-muted-foreground"
														/>
													</span>
												)}
											</div>
											{model.description ? (
												<p className="mt-0.5 truncate px-1 font-sans text-xs text-muted-foreground">
													{model.description}
												</p>
											) : null}
											<button
												aria-label={`复制模型 ID ${model.id}`}
												className="mt-1 flex max-w-full items-center gap-1.5 px-1 text-left text-xs text-muted-foreground  hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
												onClick={() => copyModelId(model.id)}
												title="复制模型 ID"
												type="button"
											>
												<span className="min-w-0 truncate">{model.id}</span>
												<Copy className="size-3 shrink-0" />
												{copiedModelId === model.id ? (
													<span className="shrink-0 text-foreground">
														已复制
													</span>
												) : null}
											</button>
										</div>

										<Button
											aria-label={
												favoriteModelIds.has(model.id)
													? `取消收藏 ${model.name}`
													: `收藏 ${model.name}`
											}
											className={cn(
												"ml-auto shrink-0 rounded-md p-1.5 transition-colors hover:bg-surface-hover hover:text-foreground",
												favoriteModelIds.has(model.id)
													? "text-amber-400"
													: "text-muted-foreground",
											)}
											onClick={() => toggleFavoriteModel(model.id)}
											variant="ghost"
										>
											<Star
												className={cn(
													"size-4",
													favoriteModelIds.has(model.id) && "fill-current",
												)}
											/>
										</Button>
									</div>
								))}
							</section>
						) : (
							<div className="rounded-lg border border-border px-4 py-8 text-center">
								<p className="text-sm text-muted-foreground">
									没有匹配“{modelSearch.trim()}”的模型。
								</p>
							</div>
						)}
					</div>
				) : (
					<div className="rounded-lg border border-border px-4 py-8 text-center">
						<p className="text-sm text-muted-foreground">
							{modelsLoading
								? "正在加载模型…"
								: "没有可用的模型。点击刷新以加载模型。"}
						</p>
					</div>
				)}
			</section>
		</div>
	);
}
