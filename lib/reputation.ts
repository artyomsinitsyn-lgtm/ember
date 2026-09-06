import { type DB, dbAll } from "./db";
import { assessRugRisk } from "./rugDetection";
import { type ReputationTier, REPUTATION_TIER_LABEL } from "./reputationTier";

export type { ReputationTier };
export { REPUTATION_TIER_LABEL };

export interface CreatorReputation {
  tier: ReputationTier;
  tokensCreated: number;
  tokensGraduated: number;
  currentHighRiskCount: number;
  buildingSinceMs: number | null;
}

/**
 * A repeat legitimate builder should read differently from a brand-new or anonymous
 * wallet before anyone has to dig into their trade history — this is the one signal that
 * does that at a glance. Reuses assessRugRisk per owned token rather than a separate
 * scoring pass, so a creator currently running a flagged token can never outrank one who
 * isn't, regardless of raw launch count.
 */
export async function computeCreatorReputation(db: DB, walletId: string): Promise<CreatorReputation> {
  const tokens = await dbAll<{ id: string; graduated: number; created_at: number }>(
    db,
    "SELECT id, graduated, created_at FROM tokens WHERE creator_id = $1",
    [walletId]
  );

  const tokensCreated = tokens.length;
  const tokensGraduated = tokens.filter((t) => t.graduated).length;
  const riskLevels = await Promise.all(tokens.map((t) => assessRugRisk(db, t.id)));
  const currentHighRiskCount = riskLevels.filter((r) => r.riskLevel === "high").length;
  const buildingSinceMs = tokens.length ? Math.min(...tokens.map((t) => t.created_at)) : null;

  let tier: ReputationTier = "new";
  if (currentHighRiskCount > 0) {
    tier = "flagged";
  } else if (tokensGraduated >= 1) {
    tier = "established";
  } else if (tokensCreated >= 2) {
    tier = "builder";
  }

  return { tier, tokensCreated, tokensGraduated, currentHighRiskCount, buildingSinceMs };
}

/** De-dupes creator ids before computing — same purpose as app/api/tokens/route.ts's
 * creatorVerifiedCache, so a multi-token creator's reputation isn't recomputed per token. */
export async function reputationBatch(db: DB, creatorIds: string[]): Promise<Map<string, CreatorReputation>> {
  const result = new Map<string, CreatorReputation>();
  const uniqueIds = [...new Set(creatorIds)];
  const reputations = await Promise.all(uniqueIds.map((id) => computeCreatorReputation(db, id)));
  uniqueIds.forEach((id, i) => result.set(id, reputations[i]));
  return result;
}
