"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import TokenCard from "@/components/TokenCard";
import type { SerializedToken } from "@/lib/serialize";
import { STAKE_TICKER } from "@/lib/constants";
import type { ReputationTier } from "@/lib/reputation";

type Tab = "trending" | "new" | "most_backed" | "growing" | "established";
type TypeFilter = "token" | "idea";

const TABS: { id: Tab; label: string }[] = [
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
  { id: "most_backed", label: "Most Backed" },
  { id: "growing", label: "Growing" },
  { id: "established", label: "Established Creators" },
];

const TYPE_FILTERS: { id: TypeFilter; label: string }[] = [
  { id: "token", label: "Token" },
  { id: "idea", label: "Idea" },
];

const TIER_RANK: Record<ReputationTier, number> = { established: 3, builder: 2, new: 1, flagged: 0 };

function IdeasPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tokens, setTokens] = useState<SerializedToken[]>([]);
  const [loading, setLoading] = useState(true);

  const tabParam = searchParams.get("tab");
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "trending";
  const typeParam = searchParams.get("type");
  const typeFilter: TypeFilter | null = TYPE_FILTERS.some((t) => t.id === typeParam) ? (typeParam as TypeFilter) : null;

  function setTab(next: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/ideas?${params.toString()}`, { scroll: false });
  }

  function setTypeFilter(next: TypeFilter | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("type", next);
    else params.delete("type");
    router.replace(`/ideas?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    let cancelled = false;
    let requestSeq = 0;
    async function load() {
      const seq = ++requestSeq;
      try {
        const res = await fetch("/api/tokens");
        const data = await res.json();
        if (!cancelled && seq === requestSeq) {
          setTokens(data.tokens);
          setLoading(false);
        }
      } catch {
        // transient network hiccup — the 15s fallback poll or next trade event will retry
      }
    }
    load();
    const id = setInterval(load, 15000);
    const source = new EventSource("/api/tokens/stream");
    let debounce: ReturnType<typeof setTimeout>;
    source.onmessage = () => {
      clearTimeout(debounce);
      debounce = setTimeout(load, 200);
    };
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(debounce);
      source.close();
    };
  }, []);

  const filtered = useMemo(() => {
    let list = typeFilter ? tokens.filter((t) => t.isProject === (typeFilter === "idea")) : tokens;
    list = [...list];
    switch (tab) {
      case "new":
        return list.sort((a, b) => b.createdAt - a.createdAt);
      case "most_backed":
        return list.sort((a, b) => b.backerCount - a.backerCount);
      case "growing":
        return list.sort((a, b) => b.growth24h - a.growth24h);
      case "established":
        return list.sort(
          (a, b) =>
            TIER_RANK[b.creatorReputationTier] - TIER_RANK[a.creatorReputationTier] || b.marketCap - a.marketCap
        );
      default:
        return list.sort((a, b) => b.marketCap - a.marketCap);
    }
  }, [tokens, tab, typeFilter]);

  return (
    <div className="alloy-dash-wide flex flex-col gap-6">
      <section className="card p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-xl font-semibold">Tokens</h1>
          <p className="text-sm text-text-dim mt-1 max-w-lg">
            Every launch on Alloy, from quick tokens to fully fleshed-out ideas — launched the same transparent
            way. Every trade takes a 1% fee, split between the creator, the treasury, and everyone staking{" "}
            {STAKE_TICKER} — forever, even after graduation.
          </p>
        </div>
        <a
          href="/create"
          data-fx="magnet"
          data-shake="1"
          className="btn-chrome btn-shine glow-hover press-effect shrink-0 font-medium px-4 py-2 rounded-full text-sm transition-shadow text-center"
        >
          Launch a Token
        </a>
      </section>

      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id ? "border-accent text-text" : "border-transparent text-text-dim hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTypeFilter(null)} className="press-effect">
          <span
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${
              !typeFilter ? "bg-accent/15 border-accent/50 text-accent" : "bg-bg-elevated border-border text-text-dim"
            }`}
          >
            All
          </span>
        </button>
        {TYPE_FILTERS.map((t) => (
          <button key={t.id} onClick={() => setTypeFilter(t.id)} className="press-effect">
            <span
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${
                typeFilter === t.id ? "bg-accent/15 border-accent/50 text-accent" : "bg-bg-elevated border-border text-text-dim"
              }`}
            >
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-text-dim text-sm py-12 text-center">Loading tokens…</div>
      ) : filtered.length === 0 ? (
        <div className="text-text-dim text-sm py-12 text-center">Nothing here yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <TokenCard key={s.id} token={s} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function IdeasPage() {
  return (
    <Suspense fallback={<div className="alloy-dash-wide text-text-dim text-sm py-12 text-center">Loading…</div>}>
      <IdeasPageInner />
    </Suspense>
  );
}
