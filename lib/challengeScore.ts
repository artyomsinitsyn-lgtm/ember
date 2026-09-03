import Database from "better-sqlite3";
import { assessRugRisk } from "./rugDetection";
import { CHALLENGE_ELIGIBILITY_HOURS } from "./constants";

export interface ChallengeScore {
  legitVolume: number;
  distinctFundedHolders: number;
  avgHoldHours: number;
  score: number;
  eligible: boolean;
  eligibilityReason: string;
}

// A token must clear both this age gate and carry no active high-risk flag before its
// challenge rank is treated as payout-eligible — long enough for an obvious bundle-and-dump
// to surface in the rug-cluster detector before any reward would be handed out.
const ELIGIBILITY_WINDOW_MS = CHALLENGE_ELIGIBILITY_HOURS * 60 * 60 * 1000;

/**
 * Scores a token on signals that cost real money/effort to fake: volume and holder count
 * with wallets from detected funding/coordination clusters excluded entirely, rather than
 * raw trade count or vote totals that one wash-trading wallet (or a vote button) can inflate.
 */
export function computeChallengeScore(db: Database.Database, tokenId: string, createdAt: number): ChallengeScore {
  const rug = assessRugRisk(db, tokenId);
  const flagged = new Set(rug.clusters.flatMap((c) => c.walletIds));

  const holders = db
    .prepare(`SELECT wallet_id, amount FROM holdings WHERE token_id = ? AND amount > 0.0001`)
    .all(tokenId) as { wallet_id: string; amount: number }[];
  const distinctFundedHolders = holders.filter((h) => !flagged.has(h.wallet_id)).length;

  const trades = db
    .prepare(`SELECT wallet_id, core_amount, created_at FROM trades WHERE token_id = ?`)
    .all(tokenId) as { wallet_id: string; core_amount: number; created_at: number }[];
  const legitTrades = trades.filter((t) => !flagged.has(t.wallet_id));
  const legitVolume = legitTrades.reduce((sum, t) => sum + t.core_amount, 0);

  const firstBuyByWallet = new Map<string, number>();
  for (const t of legitTrades) {
    if (!firstBuyByWallet.has(t.wallet_id)) firstBuyByWallet.set(t.wallet_id, t.created_at);
  }
  const now = Date.now();
  const holdHours = [...firstBuyByWallet.values()].map((ts) => (now - ts) / 3_600_000);
  const avgHoldHours = holdHours.length > 0 ? holdHours.reduce((sum, h) => sum + h, 0) / holdHours.length : 0;

  const score = legitVolume * distinctFundedHolders;

  const ageMs = now - createdAt;
  let eligible = true;
  let eligibilityReason = "Eligible for placement.";
  if (rug.riskLevel === "high") {
    eligible = false;
    eligibilityReason = "Not eligible — active high rug-risk flag.";
  } else if (ageMs < ELIGIBILITY_WINDOW_MS) {
    eligible = false;
    eligibilityReason = `cooldown`;
  }

  return { legitVolume, distinctFundedHolders, avgHoldHours, score, eligible, eligibilityReason };
}

export function eligibilityRemainingMs(createdAt: number): number {
  return Math.max(0, ELIGIBILITY_WINDOW_MS - (Date.now() - createdAt));
}
