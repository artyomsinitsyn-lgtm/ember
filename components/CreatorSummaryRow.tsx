import { BadgeCheck } from "lucide-react";
import WalletLink from "./WalletLink";
import TokenIcon from "./TokenIcon";
import ReputationBadge from "./ReputationBadge";
import { timeAgo } from "@/lib/format";
import type { CreatorReputation } from "@/lib/reputation";

/** Rendered on every token page, Basic and Project tier alike — a creator's launch
 * history is cheap to compute and already sitting in the API response, so showing it
 * everywhere is consistent with "transparency is the differentiator" rather than only
 * gating it behind the heavier Idea/Project tier. */
export default function CreatorSummaryRow({
  creatorId,
  creatorName,
  creatorAvatar,
  creatorVerified,
  reputation,
}: {
  creatorId: string;
  creatorName?: string;
  creatorAvatar?: string;
  creatorVerified?: boolean;
  reputation: CreatorReputation;
}) {
  return (
    <div className="card p-3 flex items-center gap-3 flex-wrap">
      <span className="w-8 h-8 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0 bg-bg-elevated">
        <TokenIcon image={creatorAvatar ?? "👤"} size={32} textSize="text-base" />
      </span>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-medium flex items-center gap-1">
          <WalletLink walletId={creatorId}>{creatorName ?? creatorId}</WalletLink>
          {creatorVerified && <BadgeCheck size={12} className="text-up shrink-0" aria-label="Verified" />}
        </span>
        <span className="text-[10.5px] text-text-dim">
          {reputation.tokensCreated} token{reputation.tokensCreated === 1 ? "" : "s"} ·{" "}
          {reputation.tokensGraduated} graduated
          {reputation.buildingSinceMs && ` · building since ${timeAgo(reputation.buildingSinceMs)}`}
        </span>
      </div>
      <div className="ml-auto shrink-0">
        <ReputationBadge tier={reputation.tier} />
      </div>
    </div>
  );
}
