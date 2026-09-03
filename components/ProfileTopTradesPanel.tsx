"use client";

import { useEffect, useState } from "react";
import PositionRow from "@/components/PositionRow";
import type { WalletPosition } from "@/lib/positions";

const PAGE_SIZE = 10;

/** Every position this wallet has ever opened, ranked by net P&L — the right rail on
 * every profile page. Reuses lib/positions.ts's own sort (already netPnl desc). */
export default function ProfileTopTradesPanel({ walletId }: { walletId: string }) {
  const [positions, setPositions] = useState<WalletPosition[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/wallet/${walletId}/positions`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setPositions(data.positions);
      });
    return () => {
      cancelled = true;
    };
  }, [walletId]);

  const shown = (positions ?? []).slice(0, visibleCount);

  return (
    <div className="alloy-panel alloy-home-panel alloy-home-panel-lg">
      <div className="alloy-home-panel-head">
        <h3 className="alloy-home-panel-title">Top Trades</h3>
      </div>
      <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
        {positions === null ? (
          <div className="alloy-empty">Loading…</div>
        ) : positions.length === 0 ? (
          <div className="alloy-empty">No trades yet.</div>
        ) : (
          <>
            {shown.map((p, i) => (
              <PositionRow key={p.token.id} position={p} rank={i + 1} />
            ))}
            {positions.length > shown.length && (
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="glow-hover press-effect text-xs text-text-dim hover:text-text py-2 text-center"
              >
                Load {Math.min(PAGE_SIZE, positions.length - shown.length)} more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
