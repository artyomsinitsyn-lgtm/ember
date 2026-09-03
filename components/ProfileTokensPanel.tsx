"use client";

import { useEffect, useState } from "react";
import CoinListRow from "@/components/CoinListRow";
import type { SerializedToken } from "@/lib/serialize";

/** A wallet's own launches, ranked by market cap — the left rail on every profile page. */
export default function ProfileTokensPanel({ walletId }: { walletId: string }) {
  const [tokens, setTokens] = useState<SerializedToken[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/tokens");
      if (!res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      const mine = (data.tokens as SerializedToken[])
        .filter((t) => t.creatorId === walletId)
        .sort((a, b) => b.marketCap - a.marketCap);
      setTokens(mine);
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [walletId]);

  return (
    <div className="alloy-panel alloy-home-panel">
      <div className="alloy-home-panel-head">
        <h3 className="alloy-home-panel-title">Tokens Made</h3>
      </div>
      <div className="alloy-lb-coin-list" style={{ marginTop: 4 }}>
        {tokens === null ? (
          <div className="alloy-empty">Loading…</div>
        ) : tokens.length === 0 ? (
          <div className="alloy-empty">No tokens launched yet.</div>
        ) : (
          tokens.map((t) => <CoinListRow key={t.id} token={t} />)
        )}
      </div>
    </div>
  );
}
