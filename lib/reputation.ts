import Database from "better-sqlite3";
import { assessRugRisk } from "./rugDetection";

export type ReputationTier = "new" | "builder" | "established" | "flagged";

export const REPUTATION_TIER_LABEL: Record<Exclude<ReputationTier, "new">, string> = {
  builder: "Repeat builder",
  established: "Established creator",
  flagged: "Flagged launch history",
};

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
export function computeCreatorReputation(db: Database.Database, walletId: string): CreatorReputation {
  const tokens = db
    .prepare("SELECT id, graduated, created_at FROM tokens WHERE creator_id = ?")
    .all(walletId) as { id: string; graduated: number; created_at: number }[];

  const tokensCreated = tokens.length;
  const tokensGraduated = tokens.filter((t) => t.graduated).length;
  const currentHighRiskCount = tokens.filter((t) => assessRugRisk(db, t.id).riskLevel === "high").length;
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
export function reputationBatch(db: Database.Database, creatorIds: string[]): Map<string, CreatorReputation> {
  const result = new Map<string, CreatorReputation>();
  for (const id of new Set(creatorIds)) {
    result.set(id, computeCreatorReputation(db, id));
  }
  return result;
}
