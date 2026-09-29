export const HUB_THEME_STORAGE_KEY = "cline-hub-theme";

/**
 * 主题偏好。
 * - `"system"`：跟随操作系统深浅色，实时响应系统切换
 * - `"light"` / `"dark"`：用户显式锁定，不再跟随系统
 *
 * 注意：这是**存储格式**的一部分，值不能翻译或改名。
 * 旧版本只存 `"light"` / `"dark"`，新增 `"system"` 向后兼容。
 */
export type HubTheme = "light" | "dark";

/** 用户的主题偏好，可为 system */
export type HubThemePreference = HubTheme | "system";

export const DEFAULT_HUB_THEME: HubTheme = "dark";
export const DEFAULT_HUB_THEME_PREFERENCE: HubThemePreference = "system";

/**
 * Runs from the document head before the webview paints. Keep this
 * self-contained: the browser executes it before the client bundle loads.
 */
export const HUB_THEME_BOOTSTRAP_SCRIPT = `(() => {
	const root = document.documentElement;
	let preference = ${JSON.stringify(DEFAULT_HUB_THEME_PREFERENCE)};

	try {
		const stored = window.localStorage.getItem(${JSON.stringify(HUB_THEME_STORAGE_KEY)});
		if (stored === "light" || stored === "dark" || stored === "system") {
			preference = stored;
		}
	} catch {}

	// "system" 与「无偏好」都走系统媒体查询
	let theme;
	if (preference === "light" || preference === "dark") {
		theme = preference;
	} else {
		try {
			if (typeof window.matchMedia === "function") {
				if (window.matchMedia("(prefers-color-scheme: light)").matches) {
					theme = "light";
				} else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
					theme = "dark";
				}
			}
		} catch {}
	}

	if (!theme) {
		theme = ${JSON.stringify(DEFAULT_HUB_THEME)};
	}
	root.classList.toggle("dark", theme === "dark");
	root.dataset.clineHubTheme = theme;
})();`;

/**
 * 读取用户存储的主题**偏好**。
 * 返回 `"system"` 表示跟随系统；返回 null 表示尚未设置（等同 system）。
 */
export function readStoredHubThemePreference(): HubThemePreference | null {
	try {
		const stored = window.localStorage.getItem(HUB_THEME_STORAGE_KEY);
		return stored === "light" || stored === "dark" || stored === "system"
			? stored
			: null;
	} catch {
		return null;
	}
}

/**
 * 读取当前生效的主题。
 * 兼容旧调用方：返回具体生效值（light/dark），"system" 会解析为系统当前值。
 */
export function readStoredHubTheme(): HubTheme | null {
	const preference = readStoredHubThemePreference();
	if (preference === null) {
		return null;
	}
	return preference === "system" ? readSystemHubTheme() : preference;
}

export function readSystemHubTheme(): HubTheme {
	const kind = document.body.dataset.vscodeThemeKind;
	if (kind === "vscode-dark" || kind === "vscode-high-contrast") {
		return "dark";
	}
	if (kind === "vscode-light" || kind === "vscode-high-contrast-light") {
		return "light";
	}
	try {
		if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
			return "dark";
		}
		if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
			return "light";
		}
	} catch {
		// Use the app default when the host cannot expose its color scheme.
	}
	return DEFAULT_HUB_THEME;
}

export function applyHubTheme(theme: HubTheme): HubTheme {
	document.documentElement.classList.toggle("dark", theme === "dark");
	document.documentElement.dataset.clineHubTheme = theme;
	return theme;
}

/** 把「偏好」解析为实际生效的 light/dark */
export function resolveHubTheme(preference: HubThemePreference): HubTheme {
	return preference === "system" ? readSystemHubTheme() : preference;
}

export function syncHubTheme(): HubTheme {
	return applyHubTheme(
		resolveHubTheme(readStoredHubThemePreference() ?? "system"),
	);
}

/**
 * 保存主题**偏好**并立即应用。
 * 传入 `"system"` 时解析为系统当前值并实时跟随。
 * 返回实际生效的 light/dark。
 */
export function setStoredHubThemePreference(
	preference: HubThemePreference,
): HubTheme {
	try {
		window.localStorage.setItem(HUB_THEME_STORAGE_KEY, preference);
	} catch {
		// Applying still works for this session when persistence is unavailable.
	}
	return applyHubTheme(resolveHubTheme(preference));
}

/**
 * 兼容旧调用方：只接受具体 light/dark。
 * 建议新代码改用 setStoredHubThemePreference。
 */
export function setStoredHubTheme(theme: HubTheme): HubTheme {
	return setStoredHubThemePreference(theme);
}

export const HUB_ACCENT_STORAGE_KEY = "cline.code.accent.v1";

/**
 * Accent palettes selectable in Settings. "violet" is the built-in brand
 * accent from @cline/ui tokens; the others override the interactive tokens
 * via `[data-cline-accent]` blocks in globals.css.
 */
export const HUB_ACCENTS = [
	"violet",
	"graphite",
	"cyan",
	"pink",
	"espresso",
	"ember",
] as const;

export type HubAccent = (typeof HUB_ACCENTS)[number];

export const DEFAULT_HUB_ACCENT: HubAccent = "violet";

export function isHubAccent(value: unknown): value is HubAccent {
	return (
		typeof value === "string" &&
		(HUB_ACCENTS as readonly string[]).includes(value)
	);
}

export function readStoredHubAccent(): HubAccent {
	try {
		const stored = window.localStorage.getItem(HUB_ACCENT_STORAGE_KEY);
		return isHubAccent(stored) ? stored : DEFAULT_HUB_ACCENT;
	} catch {
		return DEFAULT_HUB_ACCENT;
	}
}

export function applyHubAccent(accent: HubAccent): HubAccent {
	if (accent === DEFAULT_HUB_ACCENT) {
		delete document.documentElement.dataset.clineAccent;
	} else {
		document.documentElement.dataset.clineAccent = accent;
	}
	return accent;
}

export function syncHubAccent(): HubAccent {
	return applyHubAccent(readStoredHubAccent());
}

export function setStoredHubAccent(accent: HubAccent): HubAccent {
	try {
		window.localStorage.setItem(HUB_ACCENT_STORAGE_KEY, accent);
	} catch {
		// Accent falls back to default next launch; applying still works now.
	}
	return applyHubAccent(accent);
}

/**
 * 跟随系统深浅色。
 *
 * 触发条件（与设置页语义一致）：
 *   - 偏好为 `"system"`（显式选择跟随系统）→ 持续跟随
 *   - 尚无任何偏好（null，等同 system）    → 持续跟随
 *   - 偏好为 `"light"` / `"dark"`           → 停止跟随（用户已锁定）
 *
 * ⚠️ 注意判断用的是 **preference** 而不是生效值：
 * 若用生效值判断，"system + 当前恰好是深色" 会被误判成"用户锁定了深色"，
 * 从而永远不再跟随系统——这正是旧实现的 bug。
 *
 * 返回清理函数。
 */
export function watchSystemHubTheme(
	onChange?: (theme: HubTheme) => void,
): () => void {
	const media = window.matchMedia?.("(prefers-color-scheme: dark)");
	if (!media) {
		return () => {};
	}
	const handle = () => {
		const preference = readStoredHubThemePreference();
		if (preference !== null && preference !== "system") {
			return; // 用户锁定了具体主题，不再跟随
		}
		onChange?.(applyHubTheme(readSystemHubTheme()));
	};
	media.addEventListener("change", handle);
	return () => media.removeEventListener("change", handle);
}
