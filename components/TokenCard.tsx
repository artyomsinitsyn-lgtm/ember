"use client";

import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import ProgressBar from "./ProgressBar";
import TokenIcon from "./TokenIcon";
import WalletLink from "./WalletLink";
import PrismCard from "./PrismCard";
import TypeChip from "./TypeChip";
import ReputationBadge from "./ReputationBadge";
import GraduatedChip from "./GraduatedChip";
import { formatUsd, formatPrice, formatPct, timeAgo } from "@/lib/format";
import type { SerializedToken } from "@/lib/serialize";

export default function TokenCard({ token }: { token: SerializedToken }) {
  const router = useRouter();

  return (
    <PrismCard
      onClick={() => router.push(`/token/${token.id}`)}
      className="card glow-hover press-effect p-4 flex flex-col gap-3 hover:border-accent/50 transition-colors group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-bg-elevated flex items-center justify-center text-xl shrink-0 overflow-hidden">
            <TokenIcon image={token.image} size={40} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="font-semibold truncate group-hover:text-accent transition-colors min-w-0">
                ${token.ticker}
              </div>
              {token.graduated && <GraduatedChip />}
            </div>
            <div className="text-xs text-text-dim truncate">{token.name}</div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <TypeChip isProject={token.isProject} />
          {token.riskLevel !== "low" && (
            <span
              className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                token.riskLevel === "high" ? "bg-down/15 text-down" : "bg-accent/15 text-accent"
              }`}
            >
              <ShieldAlert size={11} />
              {token.riskLevel === "high" ? "HIGH RISK" : "RISK"}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-text-dim line-clamp-2 min-h-[2.2em]">{token.tagline || token.description}</p>

      <div className="flex items-end justify-between mono">
        <div>
          <div className="text-[10px] text-text-dim uppercase tracking-wide">Market Cap</div>
          <div className="text-sm font-medium">{formatUsd(token.marketCap)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-text-dim uppercase tracking-wide">Price</div>
          <div className="text-sm font-medium">${formatPrice(token.price)}</div>
        </div>
      </div>

      <div>
        <ProgressBar value={token.progress} graduated={token.graduated} />
        <div className="flex justify-between mt-1 text-[10px] text-text-dim">
          <span>{token.graduated ? "Trading on Alloy Pool" : `${formatPct(token.progress)} to graduation`}</span>
          <span>
            {token.backerCount} backer{token.backerCount === 1 ? "" : "s"} · {timeAgo(token.createdAt)}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-text-dim truncate" onClick={(e) => e.stopPropagation()}>
        <span className="truncate">
          by <WalletLink walletId={token.creatorId}>{token.creatorName ?? token.creatorId}</WalletLink>
        </span>
        <ReputationBadge tier={token.creatorReputationTier} size={10} />
      </div>
    </PrismCard>
  );
}
