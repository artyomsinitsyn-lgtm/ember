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

export default function AlloyTicker() {
  const [coins, setCoins] = useState<SerializedToken[] | null>(null);

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
    <div className="alloy-ticker-wrap">
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
