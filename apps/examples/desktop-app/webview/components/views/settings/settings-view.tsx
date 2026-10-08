import { Switch } from "@cline/ui";
import { Download, Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
	DEFAULT_APP_FONT_SIZE,
	isAppFontSize,
	MAX_APP_FONT_SIZE,
	MIN_APP_FONT_SIZE,
	readStoredAppFontSize,
	setStoredAppFontSize,
	subscribeToAppFontSize,
} from "@/lib/app-font-size";
import {
	APP_ICONS,
	type AppIconId,
	appIconAssetPath,
	appIconSurface,
	DEFAULT_APP_ICON,
	readStoredAppIcon,
	setStoredAppIcon,
} from "@/lib/app-icon";
import { desktopClient } from "@/lib/desktop-client";
import { resetOnboarding } from "@/lib/onboarding";
import {
	getProviderAuthKind,
	isProviderConnected,
	OAUTH_LOGIN_TIMEOUT_MS,
} from "@/lib/provider-connection";
import {
	invalidateProviderCatalogCache,
	notifyVoiceInputSettingsChanged,
	publishProviderModels,
} from "@/lib/provider-model-catalog";
import type {
	Provider,
	ProviderCatalogResponse,
	ProviderModelsResponse,
	ProviderSettingsUpdate,
} from "@/lib/provider-schema";
import {
	type HubAccent,
	type HubTheme,
	readStoredHubAccent,
	readStoredHubTheme,
	readSystemHubTheme,
	setStoredHubAccent,
	setStoredHubTheme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
	MarketplaceExplorerView,
	type MarketplaceTypeFilter,
} from "../marketplace-explorer-view";
import { PageFrame, PageHeader } from "../page-layout";
import { AboutContent } from "./about-view";
import { AccountView } from "./account-view";
import { AddProviderContent, type AddProviderPayload } from "./add-provider";
import { ChannelsContent } from "./channels-view";
import { CustomizeView } from "./customize-view";
import { ImportContent } from "./import-view";
import { NotificationSettings } from "./notification-settings";
import {
	ProviderDetailContent,
	ProviderListContent,
} from "./provider-list-view";
import { RemoteEnvironmentsContent } from "./remote-environments-view";
import { RoutineSchedulesContent } from "./routine-view";
import type { SettingsSection } from "./sections";
import { toSettingsPatch } from "./settings-patch";
import { VoiceInputContent } from "./voice-input-view";

// Nav categories live in ./sections so the always-mounted sidebar can import
// them without pulling this module graph into the initial bundle.
export {
	CUSTOMIZATION_SECTIONS,
	SETTINGS_SECTIONS,
	type SettingsSection,
} from "./sections";

type GlobalSettingsResponse = {
	telemetryOptOut: boolean;
	autoUpdateEnabled: boolean;
};

const PROVIDER_CATALOG_CACHE_TTL_MS = 60_000;

let providerCatalogCache: {
	providers: Provider[];
	fetchedAt: number;
} | null = null;

// -----------------------------------------------------------
// Component
// -----------------------------------------------------------

export function SettingsView({
	section,
	onNavigateSection,
	onOpenSession,
	onExportDiagnostics,
}: {
	section: SettingsSection;
	onExportDiagnostics: () => void;
	onNavigateSection: (section: SettingsSection) => void;
	onOpenSession?: (sessionId: string) => void | Promise<void>;
}) {
	const activeNav = section;
	const [marketplaceInitialFilter, setMarketplaceInitialFilter] =
		useState<MarketplaceTypeFilter | null>(null);
	const [providers, setProviders] = useState<Provider[]>(
		() => providerCatalogCache?.providers ?? [],
	);
	const [providersLoading, setProvidersLoading] = useState(
		() => !providerCatalogCache,
	);
	const [providerCatalogError, setProviderCatalogError] = useState<
		string | null
	>(null);
	const [modelsLoadingByProvider, setModelsLoadingByProvider] = useState<
		Record<string, boolean>
	>({});
	const [modelsErrorByProvider, setModelsErrorByProvider] = useState<
		Record<string, string | null>
	>({});
	const [oauthSigningProviderId, setOauthSigningProviderId] = useState<
		string | null
	>(null);
	const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
		null,
	);
	const [addingProvider, setAddingProvider] = useState(false);
	// Bumped by every optimistic provider mutation and catalog load. An
	// in-flight catalog response is discarded when the generation moved on,
	// so an older disk snapshot can never overwrite a newer edit.
	const catalogGenerationRef = useRef(0);
	// Bumped when a failed save resyncs the catalog from disk; keys the
	// detail panel so its local field drafts remount from the reloaded
	// props instead of keeping unpersisted values.
	const [detailResetToken, setDetailResetToken] = useState(0);

	useEffect(() => {
		if (section !== "Providers") {
			setSelectedProviderId(null);
			setAddingProvider(false);
		}
	}, [section]);

	const setProvidersWithCache = useCallback(
		(next: Provider[] | ((prev: Provider[]) => Provider[])) => {
			setProviders((prev) => {
				const resolved =
					typeof next === "function"
						? (next as (prev: Provider[]) => Provider[])(prev)
						: next;
				providerCatalogCache = {
					providers: resolved,
					fetchedAt: Date.now(),
				};
				return resolved;
			});
		},
		[],
	);

	/**
	 * Loads the catalog into view state. Resolves to false when the response
	 * was discarded because a newer mutation or load superseded it while in
	 * flight (so an older disk snapshot never overwrites a newer edit);
	 * callers needing an authoritative resync should retry on false.
	 */
	const loadProviderCatalog = useCallback(async (): Promise<boolean> => {
		const now = Date.now();
		if (
			providerCatalogCache &&
			now - providerCatalogCache.fetchedAt < PROVIDER_CATALOG_CACHE_TTL_MS
		) {
			setProviders(providerCatalogCache.providers);
			setProvidersLoading(false);
			setProviderCatalogError(null);
			return true;
		}

		const generation = ++catalogGenerationRef.current;
		setProvidersLoading(true);
		setProviderCatalogError(null);
		try {
			const payload = await desktopClient.invoke<ProviderCatalogResponse>(
				"list_provider_catalog",
			);
			if (generation !== catalogGenerationRef.current) {
				return false;
			}
			setProvidersWithCache(payload.providers);
		} catch (error) {
			if (generation !== catalogGenerationRef.current) {
				return false;
			}
			const message = error instanceof Error ? error.message : String(error);
			setProviderCatalogError(message);
			setProviders([]);
		} finally {
			setProvidersLoading(false);
		}
		return true;
	}, [setProvidersWithCache]);

	useEffect(() => {
		if (activeNav !== "Providers") {
			return;
		}
		const timeoutId = window.setTimeout(() => {
			void loadProviderCatalog();
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, [activeNav, loadProviderCatalog]);

	/**
	 * Silently refreshes view state from the authoritative catalog after a
	 * successful save, without toggling the loading screen. Optimistic
	 * mutations can't know sidecar-computed fields (`configured`), so the
	 * Configured badge would otherwise stay stale until a remount. Claims a
	 * new generation like loadProviderCatalog, so overlapping resyncs, loads,
	 * and edits always resolve to the newest snapshot: anything older still
	 * in flight is discarded on arrival.
	 */
	const resyncProviderCatalog = useCallback(async () => {
		const generation = ++catalogGenerationRef.current;
		try {
			const payload = await desktopClient.invoke<ProviderCatalogResponse>(
				"list_provider_catalog",
			);
			if (generation !== catalogGenerationRef.current) {
				return;
			}
			setProvidersWithCache(payload.providers);
		} catch {
			// Background refresh only; the optimistic state remains until the
			// next full load.
		}
	}, [setProvidersWithCache]);

	const persistProviderSettings = useCallback(
		async (
			id: string,
			updates: {
				enabled?: boolean;
				apiKey?: string;
				baseUrl?: string;
				configValues?: ProviderSettingsUpdate["configValues"];
			},
		): Promise<boolean> => {
			try {
				await desktopClient.invoke("save_provider_settings", {
					provider: id,
					enabled: updates.enabled,
					api_key: updates.apiKey,
					base_url: updates.baseUrl,
					settings: updates.configValues
						? toSettingsPatch(updates.configValues)
						: undefined,
				});
				// Pick up sidecar-computed readiness (`configured`) for the
				// just-saved settings so the Configured badge and count update
				// without a remount.
				void resyncProviderCatalog();
				return true;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				window.alert(`保存供应商设置失败（${id}）：${message}`);
				// The optimistic list update no longer matches disk: resync from
				// the authoritative catalog. Retry when a concurrent edit
				// superseded the in-flight response (that edit performs no
				// reload of its own), then remount the detail panel so its
				// field drafts re-seed from the reloaded state — not before,
				// or they would re-capture the unpersisted optimistic values.
				for (let attempt = 0; attempt < 3; attempt++) {
					providerCatalogCache = null;
					if (await loadProviderCatalog()) {
						break;
					}
				}
				setDetailResetToken((token) => token + 1);
				return false;
			} finally {
				// Keep the shared short-lived catalog cache (composer model
				// selector, onboarding) in sync with the just-saved settings.
				invalidateProviderCatalogCache();
			}
		},
		[loadProviderCatalog, resyncProviderCatalog],
	);

	const connectProvider = useCallback(
		(id: string) => {
			// Persist an (empty) settings entry so the provider is enabled with
			// whatever credentials it resolves at runtime (env vars, local CLI,
			// keyless endpoints).
			catalogGenerationRef.current++;
			setProvidersWithCache((prev) =>
				prev.map((p) => (p.id === id ? { ...p, enabled: true } : p)),
			);
			void persistProviderSettings(id, { enabled: true });
		},
		[persistProviderSettings, setProvidersWithCache],
	);

	const disconnectProvider = useCallback(
		async (id: string) => {
			catalogGenerationRef.current++;
			setProvidersWithCache((prev) =>
				prev.map((p) =>
					p.id === id
						? {
								...p,
								enabled: false,
								apiKey: undefined,
								oauthAccessTokenPresent: false,
							}
						: p,
				),
			);
			const saved = await persistProviderSettings(id, { enabled: false });
			if (saved) {
				// Disconnecting removes the persisted entry (and the sidecar drops
				// a voice-input selection pointing at it); reload so the view and
				// the chat microphone reflect the real on-disk state.
				providerCatalogCache = null;
				notifyVoiceInputSettingsChanged();
				await loadProviderCatalog();
			}
		},
		[loadProviderCatalog, persistProviderSettings, setProvidersWithCache],
	);

	const updateProvider = useCallback(
		(id: string, updates: ProviderSettingsUpdate) => {
			// Saving settings creates the provider's persisted entry, which is
			// what "connected" means for keyless providers — reflect it locally.
			catalogGenerationRef.current++;
			setProvidersWithCache((prev) =>
				prev.map((p) =>
					p.id === id
						? {
								...p,
								...updates,
								enabled: true,
								configValues: updates.configValues
									? {
											...(p.configValues ?? {}),
											...updates.configValues,
										}
									: p.configValues,
							}
						: p,
				),
			);
			void persistProviderSettings(id, {
				apiKey: updates.apiKey,
				baseUrl: updates.baseUrl,
				configValues: updates.configValues,
			});
		},
		[persistProviderSettings, setProvidersWithCache],
	);

	const loadProviderModels = useCallback(
		async (id: string) => {
			setModelsLoadingByProvider((prev) => ({ ...prev, [id]: true }));
			setModelsErrorByProvider((prev) => ({ ...prev, [id]: null }));
			try {
				const payload = await desktopClient.invoke<ProviderModelsResponse>(
					"list_provider_models",
					{
						provider: id,
					},
				);
				setProvidersWithCache((prev) =>
					prev.map((provider) =>
						provider.id === id
							? {
									...provider,
									modelList: payload.models,
									models: payload.models.length,
								}
							: provider,
					),
				);
				publishProviderModels(id, payload.models);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setModelsErrorByProvider((prev) => ({ ...prev, [id]: message }));
			} finally {
				setModelsLoadingByProvider((prev) => ({ ...prev, [id]: false }));
			}
		},
		[setProvidersWithCache],
	);

	const updateProviderModels = useCallback(
		async (id: string, models: string[]) => {
			setModelsLoadingByProvider((prev) => ({ ...prev, [id]: true }));
			setModelsErrorByProvider((prev) => ({ ...prev, [id]: null }));
			try {
				await desktopClient.invoke("update_provider_models", {
					provider: id,
					models,
				});
				await loadProviderModels(id);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setModelsErrorByProvider((prev) => ({ ...prev, [id]: message }));
			} finally {
				setModelsLoadingByProvider((prev) => ({ ...prev, [id]: false }));
			}
		},
		[loadProviderModels],
	);

	// The detail panel is always open: with no explicit selection, default to
	// the first connected provider (the one in use), then the first provider.
	const effectiveSelectedProviderId =
		selectedProviderId ??
		providers.find(isProviderConnected)?.id ??
		providers[0]?.id ??
		null;
	const selectedProvider = effectiveSelectedProviderId
		? (providers.find((p) => p.id === effectiveSelectedProviderId) ?? null)
		: null;

	const usesOAuth = (provider: Provider) =>
		getProviderAuthKind(provider) === "oauth";

	const runOAuthProviderLogin = async (id: string) => {
		setOauthSigningProviderId(id);
		try {
			const result = await desktopClient.invoke<{
				provider: string;
				accessToken: string;
			}>(
				"run_provider_oauth_login",
				{ provider: id },
				// The browser round-trip routinely outlives the default command
				// deadline; the sidecar bounds the flow by device-code expiry.
				{ timeoutMs: OAUTH_LOGIN_TIMEOUT_MS },
			);
			setProvidersWithCache((prev) =>
				prev.map((provider) =>
					provider.id === id
						? {
								...provider,
								enabled: true,
								oauthAccessTokenPresent: result.accessToken.trim().length > 0,
							}
						: provider,
				),
			);
			// The shared catalog cache (composer selector, welcome setup notice)
			// must learn about the new OAuth connection too, not just this
			// view's local provider state.
			invalidateProviderCatalogCache();
			// Fetch the authoritative post-login snapshot. The resync claims a
			// new generation, so an older load or resync still in flight can't
			// arrive late and overwrite the just-connected state, and its own
			// response also covers any provider saved moments earlier.
			void resyncProviderCatalog();
			setSelectedProviderId(id);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			window.alert(`登录 ${id} 失败：${message}`);
		} finally {
			setOauthSigningProviderId(null);
		}
	};

	const openProviderDetail = (id: string) => {
		onNavigateSection("Providers");
		setSelectedProviderId(id);
	};

	useEffect(() => {
		if (!effectiveSelectedProviderId) {
			return;
		}
		const timeoutId = window.setTimeout(() => {
			void loadProviderModels(effectiveSelectedProviderId);
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, [loadProviderModels, effectiveSelectedProviderId]);

	const backToProviderList = () => {
		onNavigateSection("Providers");
		setSelectedProviderId(null);
		setAddingProvider(false);
	};

	const saveNewProvider = useCallback(
		async (payload: AddProviderPayload) => {
			await desktopClient.invoke("add_provider", {
				provider_id: payload.providerId,
				name: payload.name,
				base_url: payload.baseUrl,
				api_key: payload.apiKey,
				headers: payload.headers,
				timeout_ms: payload.timeoutMs,
				models: payload.models,
				default_model_id: payload.defaultModelId,
				models_source_url: payload.modelsSourceUrl,
				capabilities: payload.capabilities,
			});
			invalidateProviderCatalogCache();
			await loadProviderCatalog();
			setAddingProvider(false);
			setSelectedProviderId(payload.providerId);
		},
		[loadProviderCatalog],
	);

	const openAddProvider = () => {
		onNavigateSection("Providers");
		setAddingProvider(true);
	};

	const addProviderDialog = (
		<Dialog
			onOpenChange={(open) => {
				if (!open) {
					setAddingProvider(false);
				}
			}}
			open={addingProvider}
		>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>添加供应商</DialogTitle>
					<DialogDescription>
						添加 OpenAI 兼容的供应商，并选择其可用的模型。
					</DialogDescription>
				</DialogHeader>
				<AddProviderContent
					existingProviderIds={providers.map((provider) => provider.id)}
					onBack={() => setAddingProvider(false)}
					onSave={saveNewProvider}
					variant="dialog"
				/>
			</DialogContent>
		</Dialog>
	);

	const providerContent = providersLoading ? (
		<div className="flex h-full items-center justify-center">
			<p className="text-sm text-muted-foreground">正在加载供应商…</p>
		</div>
	) : providerCatalogError ? (
		<div className="flex h-full items-center justify-center">
			<p className="max-w-xl px-4 text-center text-sm text-destructive">
				加载供应商失败：{providerCatalogError}
			</p>
		</div>
	) : selectedProvider ? (
		<div className="grid h-full grid-cols-[minmax(24rem,0.95fr)_minmax(28rem,1.05fr)] overflow-hidden max-[1100px]:grid-cols-1 max-[1100px]:grid-rows-[minmax(0,0.9fr)_minmax(0,1fr)]">
			{/* min-h-0/min-w-0: grid items default to min-size auto, which lets
			    the pane grow past its track and leaves the inner ScrollArea with
			    nothing to scroll. */}
			<div className="min-h-0 min-w-0 overflow-hidden">
				<ProviderListContent
					onAddProvider={openAddProvider}
					onConfigure={openProviderDetail}
					providers={providers}
					selectedProviderId={selectedProvider.id}
					variant="panel"
				/>
			</div>
			<aside className="min-h-0 min-w-0 overflow-hidden border-l bg-background max-[1100px]:border-l-0 max-[1100px]:border-t">
				<ProviderDetailContent
					key={`${selectedProvider.id}:${detailResetToken}`}
					modelsError={modelsErrorByProvider[selectedProvider.id] ?? null}
					modelsLoading={modelsLoadingByProvider[selectedProvider.id] ?? false}
					oauthLoginPending={oauthSigningProviderId === selectedProvider.id}
					onBack={backToProviderList}
					onConnect={() => connectProvider(selectedProvider.id)}
					onDisconnect={() => void disconnectProvider(selectedProvider.id)}
					onLoadModels={() => void loadProviderModels(selectedProvider.id)}
					onUpdateModels={(models) =>
						void updateProviderModels(selectedProvider.id, models)
					}
					onOAuthLogin={
						usesOAuth(selectedProvider)
							? () => void runOAuthProviderLogin(selectedProvider.id)
							: undefined
					}
					onUpdate={(updates) => updateProvider(selectedProvider.id, updates)}
					provider={selectedProvider}
					variant="panel"
				/>
			</aside>
		</div>
	) : (
		<ProviderListContent
			onAddProvider={openAddProvider}
			onConfigure={openProviderDetail}
			providers={providers}
		/>
	);

	const content =
		activeNav === "Providers" ? (
			<>
				{providerContent}
				{addProviderDialog}
			</>
		) : activeNav === "Voice" ? (
			<VoiceInputContent
				onOpenModelProviders={() => onNavigateSection("Providers")}
			/>
		) : activeNav === "Customize" ? (
			<CustomizeView
				onOpenModelProviders={() => onNavigateSection("Providers")}
				onOpenMarketplace={(filter) => {
					setMarketplaceInitialFilter(filter ?? null);
					onNavigateSection("Marketplace");
				}}
			/>
		) : activeNav === "Marketplace" ? (
			<MarketplaceExplorerView initialTypeFilter={marketplaceInitialFilter} />
		) : activeNav === "Channels" ? (
			<ChannelsContent />
		) : activeNav === "Schedules" ? (
			<RoutineSchedulesContent onOpenSession={onOpenSession} />
		) : activeNav === "Import" ? (
			<ImportContent />
		) : activeNav === "Remote" ? (
			<RemoteEnvironmentsContent />
		) : activeNav === "Account" ? (
			<AccountView />
		) : activeNav === "About" ? (
			<AboutContent onOpenConnectors={() => onNavigateSection("Customize")} />
		) : activeNav === "General" ? (
			<GeneralSettingsContent onExportDiagnostics={onExportDiagnostics} />
		) : (
			<div className="flex h-full items-center justify-center">
				<p className="text-sm text-muted-foreground">
					{activeNav} 分区即将推出。
				</p>
			</div>
		);

	return (
		<div className="cline-settings-content h-full overflow-hidden bg-background">
			<div className="h-full min-h-0 overflow-hidden">{content}</div>
		</div>
	);
}

/**
 * Swatches shown in the accent picker. The swatch color is the accent's
 * light-mode primary (see the [data-cline-accent] blocks in globals.css);
 * violet reads the live brand token so it always matches the default theme.
 */
const ACCENT_OPTIONS: { id: HubAccent; label: string; swatch: string }[] = [
	{ id: "violet", label: "紫", swatch: "var(--brand-violet)" },
	{ id: "graphite", label: "石墨", swatch: "oklch(0.27 0.012 248)" },
	{ id: "cyan", label: "青", swatch: "oklch(0.6 0.12 222)" },
	{ id: "pink", label: "粉", swatch: "oklch(0.75 0.1 354)" },
	{ id: "espresso", label: "浓缩咖啡", swatch: "oklch(0.36 0.035 35)" },
	{ id: "ember", label: "余烬", swatch: "oklch(0.6 0.19 33)" },
];

/**
 * `appIconSurface()` returns a platform identifier that is also stored and
 * compared as-is, so the Chinese wording lives here at the render site
 * instead of inside the identifier (PROGRESS §4.3 判断口诀第 3 条).
 */
const APP_ICON_SURFACE_LABELS: Record<"Dock" | "Taskbar" | "desktop", string> = {
	Dock: "程序坞",
	Taskbar: "任务栏",
	desktop: "桌面",
};

function GeneralSettingsContent({
	onExportDiagnostics,
}: {
	onExportDiagnostics: () => void;
}) {
	const [theme, setTheme] = useState<HubTheme>(() => {
		if (typeof window === "undefined") return "light";
		return readStoredHubTheme() ?? readSystemHubTheme();
	});
	const [accent, setAccent] = useState<HubAccent>(() => {
		if (typeof window === "undefined") return "violet";
		return readStoredHubAccent();
	});
	const [fontSize, setFontSize] = useState(() => {
		if (typeof window === "undefined") return DEFAULT_APP_FONT_SIZE;
		return readStoredAppFontSize();
	});
	const [appIcon, setAppIcon] = useState<AppIconId>(() => {
		if (typeof window === "undefined") return DEFAULT_APP_ICON;
		return readStoredAppIcon();
	});
	const [appIconLocation, setAppIconLocation] = useState<
		"Dock" | "Taskbar" | "desktop"
	>("desktop");
	const [appIconError, setAppIconError] = useState<string | null>(null);
	const appIconRequestRef = useRef(0);
	const [telemetryOptOut, setTelemetryOptOut] = useState(false);
	const [telemetryLoading, setTelemetryLoading] = useState(true);
	const [telemetrySaving, setTelemetrySaving] = useState(false);
	const [telemetryError, setTelemetryError] = useState<string | null>(null);
	const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true);
	const [autoUpdateLoading, setAutoUpdateLoading] = useState(true);
	const [autoUpdateSaving, setAutoUpdateSaving] = useState(false);
	const [autoUpdateError, setAutoUpdateError] = useState<string | null>(null);
	const [cloudSessionsEnabled, setCloudSessionsEnabled] = useState(false);
	const [cloudSessionsLoading, setCloudSessionsLoading] = useState(true);
	const [cloudSessionsSaving, setCloudSessionsSaving] = useState(false);
	const [cloudSessionsError, setCloudSessionsError] = useState<string | null>(
		null,
	);
	// The environment override can differ from the stored opt-in.
	const [cloudSessionsEffective, setCloudSessionsEffective] = useState<
		boolean | null
	>(null);
	// Keep the preview hidden until the rollout service explicitly enables it.
	const [cloudSessionsAvailable, setCloudSessionsAvailable] = useState(false);

	const refreshCloudSessionsEffective = useCallback(async () => {
		try {
			const flags = await desktopClient.invoke<{
				cloudAgents?: boolean;
				cloudAgentsAvailable?: boolean;
			}>("get_feature_flags");
			setCloudSessionsEffective(Boolean(flags.cloudAgents));
			setCloudSessionsAvailable(flags.cloudAgentsAvailable === true);
		} catch {
			setCloudSessionsEffective(null);
			setCloudSessionsAvailable(false);
		}
	}, []);

	useEffect(() => setAppIconLocation(appIconSurface(navigator.userAgent)), []);
	useEffect(() => subscribeToAppFontSize(setFontSize), []);

	const loadGlobalSettings = useCallback(async () => {
		setTelemetryLoading(true);
		setTelemetryError(null);
		setAutoUpdateLoading(true);
		setAutoUpdateError(null);
		setCloudSessionsLoading(true);
		setCloudSessionsError(null);
		await Promise.all([
			(async () => {
				try {
					const settings = await desktopClient.invoke<GlobalSettingsResponse>(
						"get_global_settings",
					);
					setTelemetryOptOut(settings.telemetryOptOut);
					setAutoUpdateEnabled(settings.autoUpdateEnabled);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					setTelemetryError(message);
					setAutoUpdateError(message);
				} finally {
					setTelemetryLoading(false);
					setAutoUpdateLoading(false);
				}
			})(),
			(async () => {
				try {
					const desktopSettings = await desktopClient.invoke<{
						cloudSessionsEnabled: boolean;
					}>("get_desktop_settings");
					setCloudSessionsEnabled(
						Boolean(desktopSettings.cloudSessionsEnabled),
					);
				} catch (error) {
					setCloudSessionsError(
						error instanceof Error ? error.message : String(error),
					);
				} finally {
					setCloudSessionsLoading(false);
				}
			})(),
			refreshCloudSessionsEffective(),
		]);
	}, [refreshCloudSessionsEffective]);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => {
			void loadGlobalSettings();
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, [loadGlobalSettings]);

	const updateTelemetryOptOut = async (nextValue: boolean) => {
		const previousValue = telemetryOptOut;
		setTelemetryOptOut(nextValue);
		setTelemetrySaving(true);
		setTelemetryError(null);
		try {
			const settings = await desktopClient.invoke<GlobalSettingsResponse>(
				"set_telemetry_opt_out",
				{ telemetry_opt_out: nextValue },
			);
			setTelemetryOptOut(settings.telemetryOptOut);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setTelemetryOptOut(previousValue);
			setTelemetryError(message);
		} finally {
			setTelemetrySaving(false);
		}
	};

	const updateAutoUpdateEnabled = async (nextValue: boolean) => {
		const previousValue = autoUpdateEnabled;
		setAutoUpdateEnabled(nextValue);
		setAutoUpdateSaving(true);
		setAutoUpdateError(null);
		try {
			const settings = await desktopClient.invoke<GlobalSettingsResponse>(
				"set_auto_update_enabled",
				{ auto_update_enabled: nextValue },
			);
			setAutoUpdateEnabled(settings.autoUpdateEnabled);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setAutoUpdateEnabled(previousValue);
			setAutoUpdateError(message);
		} finally {
			setAutoUpdateSaving(false);
		}
	};

	const updateCloudSessionsEnabled = async (nextValue: boolean) => {
		const previousValue = cloudSessionsEnabled;
		setCloudSessionsEnabled(nextValue);
		setCloudSessionsSaving(true);
		setCloudSessionsError(null);
		try {
			const settings = await desktopClient.invoke<{
				cloudSessionsEnabled: boolean;
			}>("set_cloud_sessions_enabled", { cloud_sessions_enabled: nextValue });
			setCloudSessionsEnabled(Boolean(settings.cloudSessionsEnabled));
			await refreshCloudSessionsEffective();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setCloudSessionsEnabled(previousValue);
			setCloudSessionsError(message);
		} finally {
			setCloudSessionsSaving(false);
		}
	};

	const updateTheme = (darkModeEnabled: boolean) => {
		const nextTheme = darkModeEnabled ? "dark" : "light";
		setTheme(setStoredHubTheme(nextTheme));
	};

	const updateAccent = (nextAccent: HubAccent) => {
		setAccent(setStoredHubAccent(nextAccent));
	};

	const updateFontSizePreference = (nextFontSize: number) => {
		if (isAppFontSize(nextFontSize)) {
			setFontSize(setStoredAppFontSize(nextFontSize));
		}
	};

	const updateFontSize = ([nextFontSize]: number[]) => {
		updateFontSizePreference(nextFontSize);
	};

	const updateAppIcon = async (nextIcon: AppIconId) => {
		const requestId = ++appIconRequestRef.current;
		const previousIcon = appIcon;
		setAppIcon(nextIcon);
		setAppIconError(null);
		try {
			await setStoredAppIcon(nextIcon);
		} catch (error) {
			// A newer selection supersedes this request; rolling back now
			// would clobber it.
			if (appIconRequestRef.current !== requestId) {
				return;
			}
			setAppIcon(previousIcon);
			setAppIconError(error instanceof Error ? error.message : String(error));
		}
	};

	// resetOnboarding dispatches ONBOARDING_RESET_EVENT, which the app shell
	// listens for to re-enter the first-run flow immediately.
	const replayOnboarding = () => {
		resetOnboarding();
	};

	return (
		<PageFrame>
			<PageHeader
				description="管理此浏览器与 CLI 环境的桌面端偏好设置。"
				title="设置"
			/>
			<section className="max-w-344">
				<NotificationSettings />
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">深色模式</p>
						<p className="text-sm text-muted-foreground">
							让此浏览器上的桌面界面保持深色模式。
						</p>
					</div>
					<Switch
						aria-label="深色模式"
						checked={theme === "dark"}
						onCheckedChange={updateTheme}
					/>
				</div>
				<div className="flex items-center justify-between gap-5 border-b py-4 max-[720px]:flex-col max-[720px]:items-stretch">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">字号</p>
						<p className="text-sm text-muted-foreground">
							调整整个应用的文字与界面元素大小。
						</p>
					</div>
					<div className="flex w-64 shrink-0 items-center gap-3 max-[720px]:w-full">
						<Button
							aria-label="减小字号"
							className="size-7"
							disabled={fontSize === MIN_APP_FONT_SIZE}
							onClick={() => updateFontSizePreference(fontSize - 1)}
							size="icon"
							type="button"
							variant="outline"
						>
							<Minus />
						</Button>
						<Slider
							aria-label="字号"
							aria-valuetext={`${fontSize} 像素`}
							max={MAX_APP_FONT_SIZE}
							min={MIN_APP_FONT_SIZE}
							onValueChange={updateFontSize}
							step={1}
							value={[fontSize]}
						/>
						<Button
							aria-label="增大字号"
							className="size-7"
							disabled={fontSize === MAX_APP_FONT_SIZE}
							onClick={() => updateFontSizePreference(fontSize + 1)}
							size="icon"
							type="button"
							variant="outline"
						>
							<Plus />
						</Button>
						<output
							aria-label="所选字号"
							className="w-10 shrink-0 text-right font-mono text-sm tabular-nums text-foreground"
						>
							{fontSize}px
						</output>
					</div>
				</div>
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">
							强调色
						</p>
						<p className="text-sm text-muted-foreground">
							为整个应用中的按钮、链接和高亮元素着色。
						</p>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{ACCENT_OPTIONS.map((option) => (
							<button
								aria-label={option.label}
								aria-pressed={accent === option.id}
								className={cn(
									"size-7 rounded-full border border-foreground/10 transition-transform hover:scale-110",
									accent === option.id &&
										"ring-2 ring-ring ring-offset-2 ring-offset-background",
								)}
								key={option.id}
								onClick={() => updateAccent(option.id)}
								style={{ backgroundColor: option.swatch }}
								title={option.label}
								type="button"
							/>
						))}
					</div>
				</div>
				<div className="flex items-center justify-between gap-5 border-b py-4 max-[720px]:flex-col max-[720px]:items-stretch">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">应用图标</p>
						<p className="text-sm text-muted-foreground">
							选择 Cline 在{APP_ICON_SURFACE_LABELS[appIconLocation]}中显示的图标。
						</p>
						{appIconError ? (
							<p className="mt-2 text-xs text-destructive" role="alert">
								更改应用图标失败：{appIconError}
							</p>
						) : null}
					</div>
					<div className="flex shrink-0 items-start gap-2.5">
						{APP_ICONS.map((icon) => (
							<button
								aria-label={icon.label}
								aria-pressed={appIcon === icon.id}
								className="group flex flex-col items-center gap-2"
								key={icon.id}
								onClick={() => void updateAppIcon(icon.id)}
								type="button"
							>
								<img
									alt=""
									className={cn(
										"size-14 rounded-2xl transition-transform group-hover:scale-105",
										appIcon === icon.id &&
											"ring-2 ring-ring ring-offset-2 ring-offset-background",
									)}
									draggable={false}
									height={112}
									src={appIconAssetPath(icon.id)}
									width={112}
								/>
								<span
									className={cn(
										"text-xs",
										appIcon === icon.id
											? "font-medium text-foreground"
											: "text-muted-foreground",
									)}
								>
									{icon.label}
								</span>
							</button>
						))}
					</div>
				</div>
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">
							保持 CLI 为最新版本
						</p>
						<p className="text-sm text-muted-foreground">
							自动更新 cline 命令行工具，它与本应用共享会话和设置。
							应用本身会单独更新。
						</p>
						{autoUpdateError ? (
							<p className="mt-2 text-xs text-destructive" role="alert">
								更新 CLI 自动更新设置失败：{autoUpdateError}
							</p>
						) : null}
					</div>
					<Switch
						aria-label="保持 CLI 为最新版本"
						checked={autoUpdateEnabled}
						disabled={autoUpdateLoading || autoUpdateSaving}
						onCheckedChange={(checked) => void updateAutoUpdateEnabled(checked)}
					/>
				</div>
				{cloudSessionsAvailable ? (
					<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
						<div className="flex flex-col gap-1">
							<p className="flex items-center gap-2 text-base font-semibold text-foreground">
								云端会话
								<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary">
									预览
								</span>
							</p>
							<p className="text-sm text-muted-foreground">
								在安全的云端沙箱中，让 Cline 运行于你的 GitHub
								仓库之上。会在新会话编辑器中增加「云端」选项。需要已连接
								GitHub 的 Cline 账号。
							</p>
							{cloudSessionsError ? (
								<p className="mt-2 text-xs text-destructive" role="alert">
									更新云端会话设置失败：{cloudSessionsError}
								</p>
							) : null}
							{cloudSessionsEffective !== null &&
							!cloudSessionsLoading &&
							cloudSessionsEffective !== cloudSessionsEnabled ? (
								<p className="mt-2 text-xs text-muted-foreground">
									云端会话当前{cloudSessionsEffective ? "已启用" : "已禁用"}
									，这是由{" "}
									<code>CLINE_CODE_CLOUD_AGENTS</code>{" "}
									环境变量覆盖所致，该覆盖优先于此设置。
								</p>
							) : null}
						</div>
						<Switch
							aria-label="云端会话"
							checked={cloudSessionsEnabled}
							disabled={cloudSessionsLoading || cloudSessionsSaving}
							onCheckedChange={(checked) =>
								void updateCloudSessionsEnabled(checked)
							}
						/>
					</div>
				) : null}
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">遥测</p>
						<p className="text-sm text-muted-foreground">
							启用错误与使用情况报告，以帮助改进 Cline。
						</p>
						{telemetryError ? (
							<p className="mt-2 text-xs text-destructive" role="alert">
								更新遥测设置失败：{telemetryError}
							</p>
						) : null}
					</div>
					<Switch
						aria-label="遥测"
						checked={!telemetryOptOut}
						disabled={telemetryLoading || telemetrySaving}
						onCheckedChange={(checked) => void updateTelemetryOptOut(!checked)}
					/>
				</div>
				<div className="flex py-4 items-center justify-between gap-5 border-b max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">
							新的用户体验
						</p>
						<p className="text-sm text-muted-foreground">
							重放新用户首次打开 Cline 时所看到的初始引导流程。
						</p>
					</div>
					<Button
						className="w-24 shrink-0"
						onClick={replayOnboarding}
						size="sm"
						type="button"
						variant="outline"
					>
						<RotateCcw className="size-3" />
						重放
					</Button>
				</div>
				<div className="flex py-4 items-center justify-between gap-5 max-[720px]:flex-col max-[720px]:items-stretch max-[720px]:py-4">
					<div className="flex flex-col gap-1">
						<p className="text-base font-semibold text-foreground">
							诊断
						</p>
						<p className="text-sm text-muted-foreground">
							将应用信息、最近的日志和你所选会话的元数据导出为一个文件，
							便于在报告问题时一并附上。
						</p>
					</div>
					<Button
						className="w-24 shrink-0"
						onClick={onExportDiagnostics}
						size="sm"
						type="button"
						variant="outline"
					>
						<Download className="size-3" />
						导出…
					</Button>
				</div>
			</section>
		</PageFrame>
	);
}
