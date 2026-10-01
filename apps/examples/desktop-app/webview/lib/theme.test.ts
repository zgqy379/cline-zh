// @vitest-environment jsdom

import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import {
	applyHubAccent,
	DEFAULT_HUB_ACCENT,
	DEFAULT_HUB_THEME,
	DEFAULT_HUB_THEME_PREFERENCE,
	HUB_ACCENT_STORAGE_KEY,
	HUB_THEME_BOOTSTRAP_SCRIPT,
	HUB_THEME_STORAGE_KEY,
	isHubAccent,
	readStoredHubAccent,
	readStoredHubTheme,
	readStoredHubThemePreference,
	readSystemHubTheme,
	resolveHubTheme,
	setStoredHubAccent,
	setStoredHubThemePreference,
	syncHubAccent,
	syncHubTheme,
	watchSystemHubTheme,
} from "./theme";

afterEach(() => {
	window.localStorage.clear();
	delete document.body.dataset.vscodeThemeKind;
	document.documentElement.classList.remove("dark");
	delete document.documentElement.dataset.clineAccent;
	delete document.documentElement.dataset.clineHubTheme;
	Reflect.deleteProperty(window, "matchMedia");
});

function setSystemTheme(theme: "light" | "dark" | null): void {
	window.matchMedia = ((query: string) =>
		({
			matches: theme !== null && query === `(prefers-color-scheme: ${theme})`,
			media: query,
			addEventListener() {},
			removeEventListener() {},
		}) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function runThemeBootstrap(): void {
	runInNewContext(HUB_THEME_BOOTSTRAP_SCRIPT, { document, window });
}

describe("hub theme", () => {
	it("applies a saved theme before the system preference", () => {
		setSystemTheme("light");
		window.localStorage.setItem(HUB_THEME_STORAGE_KEY, "dark");

		runThemeBootstrap();

		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.dataset.clineHubTheme).toBe("dark");
	});

	it("applies the system preference before the first paint when unsaved", () => {
		setSystemTheme("light");

		runThemeBootstrap();

		expect(document.documentElement.classList.contains("dark")).toBe(false);
		expect(document.documentElement.dataset.clineHubTheme).toBe("light");
	});

	it("defaults to dark when no saved or system preference is available", () => {
		expect(readStoredHubTheme()).toBeNull();
		expect(readSystemHubTheme()).toBe(DEFAULT_HUB_THEME);
		expect(syncHubTheme()).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		document.documentElement.classList.remove("dark");
		delete document.documentElement.dataset.clineHubTheme;
		runThemeBootstrap();

		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.dataset.clineHubTheme).toBe("dark");
	});
});

describe("hub theme: system preference", () => {
	it("treats a missing preference as system", () => {
		setSystemTheme("light");

		expect(readStoredHubThemePreference()).toBeNull();
		expect(DEFAULT_HUB_THEME_PREFERENCE).toBe("system");
		expect(syncHubTheme()).toBe("light");
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("resolves an explicit system preference through the media query", () => {
		setSystemTheme("dark");
		window.localStorage.setItem(HUB_THEME_STORAGE_KEY, "system");

		expect(readStoredHubThemePreference()).toBe("system");
		expect(readStoredHubTheme()).toBe("dark");
		expect(syncHubTheme()).toBe("dark");
	});

	it("applies the system preference before first paint", () => {
		setSystemTheme("dark");
		window.localStorage.setItem(HUB_THEME_STORAGE_KEY, "system");

		runThemeBootstrap();

		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.dataset.clineHubTheme).toBe("dark");
	});

	it("keeps an explicit light/dark preference over the system one", () => {
		setSystemTheme("dark");
		window.localStorage.setItem(HUB_THEME_STORAGE_KEY, "light");

		runThemeBootstrap();

		expect(document.documentElement.classList.contains("dark")).toBe(false);
		expect(document.documentElement.dataset.clineHubTheme).toBe("light");
	});

	it("follows the system theme by polling when change events never fire (WebView2)", async () => {
		const state = { dark: false };
		window.matchMedia = ((query: string) =>
			({
				get matches() {
					if (query === "(prefers-color-scheme: dark)") return state.dark;
					if (query === "(prefers-color-scheme: light)") return !state.dark;
					return false;
				},
				media: query,
				addEventListener() {},
				removeEventListener() {},
			}) as unknown as MediaQueryList) as typeof window.matchMedia;
		window.localStorage.setItem(HUB_THEME_STORAGE_KEY, "system");
		expect(syncHubTheme()).toBe("light");
		expect(document.documentElement.dataset.clineHubTheme).toBe("light");

		// 无回调调用（page.tsx 的用法）：应用逻辑必须照常执行
		const stop = watchSystemHubTheme();
		// WebView2 怪癖：matches 取值已翻转，但 change 事件永远不会派发
		state.dark = true;
		await new Promise((resolve) => setTimeout(resolve, 1200));

		expect(document.documentElement.dataset.clineHubTheme).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		stop();
	}, 4000);

	it("resolves preferences through resolveHubTheme", () => {
		setSystemTheme("light");
		expect(resolveHubTheme("system")).toBe("light");
		expect(resolveHubTheme("dark")).toBe("dark");
		setSystemTheme("dark");
		expect(resolveHubTheme("system")).toBe("dark");
		expect(resolveHubTheme("light")).toBe("light");
	});

	it("stores the system preference and applies the resolved theme", () => {
		setSystemTheme("dark");

		const applied = setStoredHubThemePreference("system");

		expect(window.localStorage.getItem(HUB_THEME_STORAGE_KEY)).toBe("system");
		expect(applied).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("follows OS changes while the preference is system", () => {
		let system: "light" | "dark" | null = "light";
		const listeners: (() => void)[] = [];
		window.matchMedia = ((query: string) =>
			({
				get matches() {
					return (
						system !== null && query === `(prefers-color-scheme: ${system})`
					);
				},
				media: query,
				addEventListener(_: string, fn: () => void) {
					listeners.push(fn);
				},
				removeEventListener() {},
			}) as unknown as MediaQueryList) as typeof window.matchMedia;
		window.localStorage.setItem(HUB_THEME_STORAGE_KEY, "system");

		const seen: string[] = [];
		const stop = watchSystemHubTheme((theme) => seen.push(theme));
		system = "dark";
		for (const fn of listeners) fn();
		stop();

		expect(seen).toEqual(["dark"]);
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("stops following once the user picks a concrete theme", () => {
		let system: "light" | "dark" | null = "light";
		const listeners: (() => void)[] = [];
		window.matchMedia = ((query: string) =>
			({
				get matches() {
					return (
						system !== null && query === `(prefers-color-scheme: ${system})`
					);
				},
				media: query,
				addEventListener(_: string, fn: () => void) {
					listeners.push(fn);
				},
				removeEventListener() {},
			}) as unknown as MediaQueryList) as typeof window.matchMedia;
		window.localStorage.setItem(HUB_THEME_STORAGE_KEY, "light");

		const seen: string[] = [];
		watchSystemHubTheme((theme) => seen.push(theme));
		system = "dark";
		for (const fn of listeners) fn();

		expect(seen).toEqual([]);
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});
});

describe("hub accent", () => {
	it("defaults to violet and validates stored values", () => {
		expect(readStoredHubAccent()).toBe(DEFAULT_HUB_ACCENT);
		window.localStorage.setItem(HUB_ACCENT_STORAGE_KEY, "not-a-color");
		expect(readStoredHubAccent()).toBe(DEFAULT_HUB_ACCENT);
		expect(isHubAccent("ember")).toBe(true);
		expect(isHubAccent("magenta")).toBe(false);
	});

	it("round-trips through storage and the html dataset", () => {
		setStoredHubAccent("graphite");
		expect(window.localStorage.getItem(HUB_ACCENT_STORAGE_KEY)).toBe(
			"graphite",
		);
		expect(document.documentElement.dataset.clineAccent).toBe("graphite");

		expect(syncHubAccent()).toBe("graphite");
		expect(document.documentElement.dataset.clineAccent).toBe("graphite");
	});

	it("clears the dataset attribute for the default accent", () => {
		applyHubAccent("ember");
		expect(document.documentElement.dataset.clineAccent).toBe("ember");
		applyHubAccent(DEFAULT_HUB_ACCENT);
		expect(document.documentElement.dataset.clineAccent).toBeUndefined();
	});
});
