"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import WalletLink from "@/components/WalletLink";
import PrismCard from "@/components/PrismCard";
import TokenIcon from "@/components/TokenIcon";
import GraduatedChip from "@/components/GraduatedChip";
import { formatUsd, timeAgoShort } from "@/lib/format";
import type { WalletProfile } from "@/lib/profile";
import type { SerializedToken } from "@/lib/serialize";

type PeopleMode = "pnl" | "earners";
type CoinSort = "trending" | "new";

const MEDAL_COLOR = ["#e6d4a8", "#d8dee5", "#c9a582"];
const SILVER = "#d8dee5";
const PEOPLE_LIMIT = 20;

function PersonRow({ r, rank, primary }: { r: WalletProfile; rank: number; primary: PeopleMode }) {
  return (
    <WalletLink walletId={r.walletId}>
      <PrismCard intensity={0.5} className="alloy-pnl-row">
        <span className="alloy-pnl-rank" style={rank < 3 ? { color: MEDAL_COLOR[rank], fontWeight: 700 } : undefined}>
          {rank + 1}
        </span>
        <span className="alloy-icon-tile" style={{ width: 14, height: 14, borderRadius: "50%", flex: "none" }}>
          <TokenIcon image={r.avatar} size={14} textSize="text-base" />
        </span>
        <span className="alloy-pnl-name">{r.name}</span>
        <span style={{ textAlign: "right", flex: "none" }}>
          <span className={`alloy-pnl-value ${r.realizedPnl >= 0 ? "up" : "down"}`} style={{ fontWeight: primary === "pnl" ? 700 : 500 }}>
            {formatUsd(r.realizedPnl, { showPlus: true })}
          </span>
          <div className="alloy-trend-sub" style={{ marginTop: 2, fontWeight: primary === "earners" ? 700 : 400, color: primary === "earners" ? "color-mix(in srgb, var(--text) 75%, transparent)" : undefined }}>
            {formatUsd(r.netWorth)}
          </div>
        </span>
      </PrismCard>
    </WalletLink>
  );
}

function TokenRow({ t }: { t: SerializedToken }) {
  return (
    <Link href={`/token/${t.id}`}>
      <PrismCard intensity={0.5} className="alloy-pnl-row">
        <span className="alloy-icon-tile" style={{ width: 28, height: 28, flex: "none" }}>
          <TokenIcon image={t.image} size={28} textSize="text-base" />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <div className="alloy-pnl-name">{t.name}</div>
          <div className="alloy-trend-sub">
            ${t.ticker} · {timeAgoShort(t.createdAt)}
          </div>
        </span>
        {t.graduated && <GraduatedChip />}
        <span style={{ textAlign: "right", flex: "none" }}>
          <div className="alloy-pnl-value" style={{ fontWeight: 600 }}>
            {formatUsd(t.marketCap)}
          </div>
        </span>
        {t.creatorVerified && (
          <BadgeCheck size={13} style={{ color: SILVER, flex: "none" }} aria-label="Verified creator" />
        )}
      </PrismCard>
    </Link>
  );
}

export function CoinsPanel() {
  const [coinSort, setCoinSort] = useState<CoinSort>("trending");
  const [tokens, setTokens] = useState<SerializedToken[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/tokens");
        const data = await res.json();
        if (!cancelled) setTokens(data.tokens);
      } catch {
        // best-effort panel
      }
    }
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const coinRows =
    tokens === null
      ? null
      : [...tokens].sort((a, b) => (coinSort === "trending" ? b.marketCap - a.marketCap : b.createdAt - a.createdAt));

  return (
    <div className="alloy-panel alloy-home-panel alloy-home-panel-lg">
      <div className="alloy-home-panel-head" style={{ marginBottom: 6 }}>
        <h2 className="alloy-home-panel-title">Tokens</h2>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className={`alloy-chip ${coinSort === "trending" ? "active" : ""}`}
            style={{ padding: "5px 10px", fontSize: 10 }}
            onClick={() => setCoinSort("trending")}
          >
            Trending
          </button>
          <button
            className={`alloy-chip ${coinSort === "new" ? "active" : ""}`}
            style={{ padding: "5px 10px", fontSize: 10 }}
            onClick={() => setCoinSort("new")}
          >
            New
          </button>
        </div>
      </div>
      <div className="alloy-pnl-list">
        {coinRows === null ? (
          <div className="alloy-empty">Loading…</div>
        ) : coinRows.length === 0 ? (
          <div className="alloy-empty">No tokens yet.</div>
        ) : (
          coinRows.map((t) => <TokenRow key={t.id} t={t} />)
        )}
      </div>
    </div>
  );
}

export function PeoplePanel() {
  const [peopleMode, setPeopleMode] = useState<PeopleMode>("pnl");
  const [wallets, setWallets] = useState<WalletProfile[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/leaderboard");
        const data = await res.json();
        if (!cancelled) setWallets(data.leaderboard);
      } catch {
        // best-effort panel
      }
    }
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const peopleRows =
    wallets === null
      ? null
      : [...wallets]
          .sort((a, b) => (peopleMode === "pnl" ? b.realizedPnl - a.realizedPnl : b.netWorth - a.netWorth))
          .slice(0, PEOPLE_LIMIT);

  return (
    <div className="alloy-panel alloy-home-panel alloy-home-panel-lg">
      <div className="alloy-underline-tabs" style={{ marginBottom: 6 }}>
        <button className={`alloy-underline-tab ${peopleMode === "pnl" ? "alloy-underline-tab-active" : ""}`} onClick={() => setPeopleMode("pnl")}>
          Top PNL
        </button>
        <button className={`alloy-underline-tab ${peopleMode === "earners" ? "alloy-underline-tab-active" : ""}`} onClick={() => setPeopleMode("earners")}>
          Top Earners
        </button>
      </div>
      <div className="alloy-pnl-list" style={{ marginTop: 12 }}>
        {peopleRows === null ? (
          <div className="alloy-empty">Loading…</div>
        ) : peopleRows.length === 0 ? (
          <div className="alloy-empty">No traders yet.</div>
        ) : (
          peopleRows.map((r, i) => <PersonRow key={r.walletId} r={r} rank={i} primary={peopleMode} />)
        )}
      </div>
    </div>
  );
}
