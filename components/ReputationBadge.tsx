import { History, Layers, ShieldAlert } from "lucide-react";
import { REPUTATION_TIER_LABEL, type ReputationTier } from "@/lib/reputationTier";

const TIER_CLASS: Record<Exclude<ReputationTier, "new">, string> = {
  builder: "text-text-dim",
  established: "text-up",
  flagged: "text-down",
};

const TIER_ICON: Record<Exclude<ReputationTier, "new">, typeof Layers> = {
  builder: Layers,
  established: History,
  flagged: ShieldAlert,
};

/** Omits itself entirely for "new" — a wallet with no track record yet has nothing
 * honest to show, and showing nothing is itself the signal. */
export default function ReputationBadge({ tier, size = 12 }: { tier: ReputationTier; size?: number }) {
  if (tier === "new") return null;
  const Icon = TIER_ICON[tier];
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] ${TIER_CLASS[tier]}`}>
      <Icon size={size} />
      {REPUTATION_TIER_LABEL[tier]}
    </span>
  );
}
