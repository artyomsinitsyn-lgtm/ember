"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import TokenIcon from "@/components/TokenIcon";
import { formatSol } from "@/lib/format";
import type { WalletPosition } from "@/lib/positions";

/** One position row (open, closed, or ranked "top trade") — shared by a profile's tabbed
 * Open/Closed list and its dedicated "Top trades" side panel. */
export default function PositionRow({ position, rank }: { position: WalletPosition; rank?: number }) {
  const { token, open, positionValue, spent, avgEntryMcap, netPnl } = position;
  return (
    <Link
      href={`/token/${token.id}`}
      className="glow-hover press-effect flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-bg-elevated"
    >
      {rank != null && <span className="mono text-[11px] text-text-dim w-5 shrink-0">#{rank}</span>}
      <span className="w-9 h-9 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0 bg-bg-elevated">
        <TokenIcon image={token.image} size={36} textSize="text-lg" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm truncate">${token.ticker}</span>
          {token.riskLevel !== "low" && (
            <ShieldAlert size={12} className={token.riskLevel === "high" ? "text-down" : "text-accent"} />
          )}
        </div>
        <div className="text-[11px] text-text-dim truncate">{token.name}</div>
      </div>
      <div className="mono text-right text-xs shrink-0">
        <div className="text-text-dim">
          Position <span className="text-text">{open ? formatSol(positionValue) : "Closed"}</span>
        </div>
        <div className={netPnl >= 0 ? "text-up" : "text-down"}>Net PNL {formatSol(netPnl, { showPlus: true })}</div>
        {spent > 0 && (
          <div className="text-text-dim">
            Spent {formatSol(spent)}
            {avgEntryMcap != null ? ` · ${formatSol(avgEntryMcap)} MC avg` : ""}
          </div>
        )}
      </div>
    </Link>
  );
}
