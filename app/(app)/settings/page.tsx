"use client";

import { useEffect, useState } from "react";
import { Gauge, Palette } from "lucide-react";
import { getStoredTheme, getStoredPerformanceMode, setStoredTheme, setStoredPerformanceMode, type Theme } from "@/lib/settings";

/**
 * Both settings below reload the page after writing a change (see lib/settings.ts) —
 * simplest way to guarantee every already-mounted effect that reads prefersReducedMotion()
 * once on mount (CursorFx, PrismCard, AmbientGlow) picks up the new value cleanly, instead
 * of plumbing live reactivity through each of them.
 */
export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [performanceMode, setPerformanceMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
    setPerformanceMode(getStoredPerformanceMode());
    setMounted(true);
  }, []);

  function applyTheme(next: Theme) {
    if (next === theme) return;
    setStoredTheme(next);
    window.location.reload();
  }

  function applyPerformanceMode(next: boolean) {
    if (next === performanceMode) return;
    setStoredPerformanceMode(next);
    window.location.reload();
  }

  return (
    <div className="alloy-dash" style={{ maxWidth: 720 }}>
      <h1 className="alloy-h1" style={{ fontSize: 34, marginBottom: 8 }}>
        Settings
      </h1>
      <p className="alloy-p" style={{ marginBottom: 32 }}>
        Display preferences, stored on this device only.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, opacity: mounted ? 1 : 0.5 }}>
        <div className="alloy-panel">
          <div className="flex items-start gap-3 mb-4">
            <Palette size={18} className="text-text-dim mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Theme</div>
              <div className="text-sm text-text-dim mt-0.5">
                Light mode recolors the chrome look for a bright background — the metal, motion, and layout stay the
                same.
              </div>
            </div>
          </div>
          <div className="alloy-tabs" style={{ maxWidth: 280 }}>
            <button
              className={`alloy-tab ${theme === "dark" ? "alloy-tab-active" : ""}`}
              onClick={() => applyTheme("dark")}
              disabled={!mounted}
            >
              Dark
            </button>
            <button
              className={`alloy-tab ${theme === "light" ? "alloy-tab-active" : ""}`}
              onClick={() => applyTheme("light")}
              disabled={!mounted}
            >
              Light
            </button>
          </div>
        </div>

        <div className="alloy-panel">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Gauge size={18} className="text-text-dim mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Performance mode</div>
                <div className="text-sm text-text-dim mt-0.5 max-w-md">
                  Turns off the decorative motion — cursor-follow glows, shine sweeps, card tilt, the marquee ticker
                  scroll, page-entry animation. Nothing is removed, it just stops moving, which is lighter on
                  lower-end hardware.
                </div>
              </div>
            </div>
            <button
              onClick={() => applyPerformanceMode(!performanceMode)}
              disabled={!mounted}
              role="switch"
              aria-checked={performanceMode}
              aria-label="Performance mode"
              className={`glow-hover press-effect shrink-0 w-11 h-6 rounded-full relative transition-colors ${
                performanceMode ? "bg-accent" : "bg-bg-elevated border border-border"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  performanceMode ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
