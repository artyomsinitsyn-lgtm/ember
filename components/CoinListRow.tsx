"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import PrismCard from "@/components/PrismCard";
import TokenIcon from "@/components/TokenIcon";
import GraduatedChip from "@/components/GraduatedChip";
import { formatUsd, timeAgoShort } from "@/lib/format";
import type { SerializedToken } from "@/lib/serialize";

/** A single coin row with the pointer-tracked holo/tilt hover (via PrismCard) — shared by
 * the homepage leaderboard's "Coins" mode and a profile's "Tokens made" panel. */
export default function CoinListRow({ token }: { token: SerializedToken }) {
  return (
    <Link href={`/token/${token.id}`}>
      <PrismCard intensity={0.55} className="alloy-lb-coin-row">
        <span className="alloy-icon-tile" style={{ width: 40, height: 40, flex: "none" }}>
          <TokenIcon image={token.image} size={40} textSize="text-xl" />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="alloy-trend-name">{token.name}</span>
            {token.riskLevel !== "low" && (
              <ShieldAlert size={12} style={{ color: token.riskLevel === "high" ? "#c98a8a" : "#8bc3ab", flex: "none" }} />
            )}
          </div>
          <span className="alloy-trend-sub">
            ${token.ticker} · {timeAgoShort(token.createdAt)}
          </span>
          <div className="alloy-lb-coin-bar-track">
            <div className="alloy-lb-coin-bar-fill" style={{ width: `${Math.round(token.progress * 100)}%` }} />
          </div>
        </div>
        <div style={{ textAlign: "right", flex: "none" }}>
          <div className="alloy-trend-mcap">{formatUsd(token.marketCap)}</div>
          {token.graduated ? (
            <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-end" }}>
              <GraduatedChip />
            </div>
          ) : (
            <div className="alloy-trend-sub" style={{ marginTop: 4 }}>{Math.round(token.progress * 100)}% bonded</div>
          )}
        </div>
      </PrismCard>
    </Link>
  );
}
