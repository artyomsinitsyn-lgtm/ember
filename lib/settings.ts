"use client";

/**
 * Client-only display settings — theme and performance mode. Persisted to localStorage and
 * applied as a `data-theme` attribute + `perf-mode` class on <html>, which is what every CSS
 * rule in globals.css/landing.css keys off (see the `[data-theme="light"]` overrides and the
 * `html.perf-mode` blanket animation kill switch). A tiny inline boot script in layout.tsx
 * applies the stored values before hydration so there's no flash of the wrong theme.
 *
 * No React context: nothing needs live, cross-component reactivity to these values within a
 * render — every consumer reads them off the DOM (CSS selectors) or off prefersReducedMotion()
 * (JS effects). The settings page itself just reloads after writing a change, which is the
 * simplest way to guarantee every already-mounted effect (CursorFx, PrismCard, AmbientGlow —
 * all of which read prefersReducedMotion() once on mount) picks up the new value correctly.
 *
 * These setters ONLY write localStorage, deliberately not the DOM — a reload always follows
 * immediately, and the boot script in layout.tsx applies the new value to the fresh document
 * before hydration. An earlier version also flipped `document.documentElement`'s class/attr
 * live, in the same tick as the click: with performance mode that meant `html.perf-mode *
 * { animation: none !important; transition: none !important }` (globals.css) applied to the
 * *current*, still-rendering page for the brief window before reload() actually navigated —
 * the marquee ticker would snap mid-scroll, and this toggle's own slide transition would get
 * killed by the same rule it had just turned on, so the knob snapped instead of sliding. That
 * read as the whole page "glitching" on click. Not touching the live DOM here removes the
 * cause entirely — the current page stays exactly as it was until the reload swaps it out.
 */

export type Theme = "dark" | "light";

const THEME_KEY = "alloy-theme";
const PERF_KEY = "alloy-perf";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

export function getStoredPerformanceMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(PERF_KEY) === "1";
}

export function setStoredTheme(theme: Theme) {
  window.localStorage.setItem(THEME_KEY, theme);
}

export function setStoredPerformanceMode(on: boolean) {
  window.localStorage.setItem(PERF_KEY, on ? "1" : "0");
}
