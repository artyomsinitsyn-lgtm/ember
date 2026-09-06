"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { INITIAL_VIRTUAL_CORE_RESERVES, INITIAL_VIRTUAL_TOKEN_RESERVES } from "@/lib/constants";
import type { SerializedToken } from "@/lib/serialize";

const LAUNCH_PRICE = INITIAL_VIRTUAL_CORE_RESERVES / INITIAL_VIRTUAL_TOKEN_RESERVES;

function pctSinceLaunch(price: number): number {
  return ((price - LAUNCH_PRICE) / LAUNCH_PRICE) * 100;
}

function formatPct(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

// A few dozen px of slack: a truly maximized window's outerWidth/outerHeight (the whole
// browser window, chrome included) doesn't land exactly on screen.availWidth/availHeight (the
// monitor's usable area, taskbar/dock excluded) — window-manager borders, shadows, and
// fractional-DPI rounding all nudge it by a handful of pixels. Anything further off than this
// is an actual "windowed"/floating size, not maximized-but-slightly-off.
const MAXIMIZED_TOLERANCE_PX = 40;

function isWindowMaximized(): boolean {
  if (typeof window === "undefined") return false;
  return (
    Math.abs(window.outerWidth - window.screen.availWidth) <= MAXIMIZED_TOLERANCE_PX &&
    Math.abs(window.outerHeight - window.screen.availHeight) <= MAXIMIZED_TOLERANCE_PX
  );
}

export default function AlloyTicker() {
  const [coins, setCoins] = useState<SerializedToken[] | null>(null);
  // Starts false (the static, no-transform row) so there's nothing to correct if the effect
  // below runs on a not-yet-maximized frame — SSR/first paint has no window to check at all.
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    function check() {
      setMaximized(isWindowMaximized());
    }
    check();
    // Covers both directions live: maximizing/restoring the window (double-clicking the
    // title bar, dragging an edge) fires "resize" itself since the viewport dimensions
    // actually change — no separate polling needed.
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/tokens");
        const data = await res.json();
        if (cancelled) return;
        const sorted = [...(data.tokens as SerializedToken[])].sort((a, b) => b.marketCap - a.marketCap);
        setCoins(sorted.slice(0, 10));
      } catch {
        // best-effort ticker
      }
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const items = useMemo(() => {
    if (!coins || coins.length === 0) return [];
    return coins.map((c) => ({ id: c.id, ticker: c.ticker, pct: pctSinceLaunch(c.price) }));
  }, [coins]);

  const placeholder = items.length === 0;
  const display = placeholder
    ? Array.from({ length: 8 }).map(() => ({ id: null, ticker: "···", pct: null }))
    : items;

  // The marquee loop only stays seamless (no blank gap at the seam) if each of the two
  // halves is at least as wide as the viewport — with only a handful of real tokens, one
  // pass through `display` falls well short of that on any normal-to-wide screen. Padding
  // out to a minimum item count (repeating the same list) keeps every half comfortably
  // wider than any real viewport regardless of how few tokens currently exist.
  const MIN_ITEMS_PER_GROUP = 24;
  const repeats = Math.max(1, Math.ceil(MIN_ITEMS_PER_GROUP / display.length));
  const padded = Array.from({ length: repeats }, () => display).flat();

  return (
    <div className={`alloy-ticker-wrap ${maximized ? "alloy-ticker-wrap-maximized" : ""}`}>
      {/* Windowed/floating (not maximized): a plain, non-animated row of the same tokens, once
          each, no transform at all — sidesteps the click/visual-position desync a continuously
          animated marquee can develop (see AlloyTicker's investigation notes), rather than
          chasing that bug on the exact layouts where it was actually observed. Both this row
          and the marquee below are always in the DOM; the `maximized` state above (recomputed
          on every resize, not just on mount) picks which one is visible via the
          alloy-ticker-wrap-maximized class in landing.css. */}
      <div className="alloy-ticker-static">
        {display.map((t, i) =>
          t.id ? (
            <Link key={i} href={`/token/${t.id}`} className="alloy-ticker-item alloy-ticker-item-link">
              {`$${t.ticker} BONDED`}
              {t.pct != null && <span style={{ color: "#8bc3ab" }}>{formatPct(t.pct)}</span>}
            </Link>
          ) : (
            <span key={i} className="alloy-ticker-item">
              {t.ticker}
            </span>
          )
        )}
      </div>
      <div className="alloy-ticker-track">
        {[0, 1].map((rep) => (
          <div key={rep} className="alloy-ticker-group">
            {padded.map((t, i) =>
              t.id ? (
                <Link key={`${rep}-${i}`} href={`/token/${t.id}`} className="alloy-ticker-item alloy-ticker-item-link">
                  {`$${t.ticker} BONDED`}
                  {t.pct != null && <span style={{ color: "#8bc3ab" }}>{formatPct(t.pct)}</span>}
                </Link>
              ) : (
                <span key={`${rep}-${i}`} className="alloy-ticker-item">
                  {t.ticker}
                </span>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
