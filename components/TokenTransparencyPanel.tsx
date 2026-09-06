import { ShieldAlert, ShieldCheck } from "lucide-react";
import { formatSol, formatCompact, formatPct } from "@/lib/format";
import { TOTAL_SUPPLY } from "@/lib/constants";
import type { RugAssessment } from "@/lib/rugDetection";

interface CurveInfo {
  vCore: number;
  vToken: number;
  realCore: number;
  realToken: number;
  poolCore: number | null;
  poolToken: number | null;
}

interface HolderLike {
  walletId: string;
  pctSupply: number;
}

/**
 * "Full token transparency" as its own always-visible panel — today's Rug Risk block only
 * renders when risk is elevated, so a clean token showed no supply/allocation/liquidity
 * numbers at all. This consolidates the ones that already exist elsewhere in the API
 * response (curve reserves, holder positions, rugDetection's cluster output) into one
 * panel that's always on for Project-tier pages, with nothing gated behind risk level.
 */
export default function TokenTransparencyPanel({
  creatorId,
  graduated,
  curve,
  holders,
  rugRisk,
}: {
  creatorId: string;
  graduated: boolean;
  curve: CurveInfo;
  holders: HolderLike[];
  rugRisk: RugAssessment;
}) {
  const liquidity = graduated ? curve.poolCore ?? 0 : curve.realCore;
  const creatorHolding = holders.find((h) => h.walletId === creatorId);

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {rugRisk.riskLevel === "low" ? (
          <ShieldCheck size={16} className="text-up" />
        ) : (
          <ShieldAlert size={16} className={rugRisk.riskLevel === "high" ? "text-down" : "text-accent"} />
        )}
        <h2 className="text-sm font-medium">Token Transparency</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-text-dim">Total Supply</div>
          <div className="mono mt-0.5">{formatCompact(TOTAL_SUPPLY)}</div>
        </div>
        <div>
          <div className="text-text-dim">{graduated ? "Pool Liquidity" : "Curve Liquidity"}</div>
          <div className="mono mt-0.5">{formatSol(liquidity)}</div>
        </div>
        <div>
          <div className="text-text-dim">Creator Allocation</div>
          <div className="mono mt-0.5">
            {creatorHolding ? `${creatorHolding.pctSupply.toFixed(2)}%` : "0% (none held)"}
          </div>
        </div>
        <div>
          <div className="text-text-dim">Top Holder</div>
          <div className="mono mt-0.5">{formatPct(rugRisk.topWalletPct / 100)}</div>
        </div>
        <div>
          <div className="text-text-dim">Concentration Risk</div>
          <div
            className={`mono mt-0.5 ${
              rugRisk.riskLevel === "high" ? "text-down" : rugRisk.riskLevel === "medium" ? "text-accent" : "text-up"
            }`}
          >
            {rugRisk.riskLevel === "low" ? "Low" : rugRisk.riskLevel === "medium" ? "Medium" : "High"}
          </div>
        </div>
        <div>
          <div className="text-text-dim">Flagged Clusters</div>
          <div className="mono mt-0.5">{rugRisk.clusters.length}</div>
        </div>
      </div>

      {rugRisk.clusters.length > 0 && (
        <div className="flex flex-col gap-2 pt-1 border-t border-border">
          {rugRisk.clusters.map((c, i) => (
            <div key={i} className="bg-bg-elevated rounded-lg p-3 text-xs flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="font-medium">
                  {c.reason === "shared_funding" ? "Shared funding source" : "Coordinated buy timing"}
                </span>
                <span className="mono text-down">{formatPct(c.combinedPct / 100)} combined</span>
              </div>
              <p className="text-text-dim">{c.detail}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
