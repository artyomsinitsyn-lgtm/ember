import { currentPrice, graduationProgress } from "./bondingCurve";
import type { TokenRow } from "./trading";
import type { RugAssessment } from "./rugDetection";
import type { ReputationTier } from "./reputation";

export function serializeToken(
  row: TokenRow,
  creatorName?: string,
  riskLevel: RugAssessment["riskLevel"] = "low",
  creatorVerified = false,
  projectMeta?: { tagline: string | null; hasRoadmap: boolean } | null,
  creatorReputationTier: ReputationTier = "new",
  backerCount = 0,
  growth24h = 0
) {
  const price = row.graduated
    ? currentPrice(row.pool_core!, row.pool_token!)
    : currentPrice(row.v_core, row.v_token);
  const marketCap = price * row.total_supply;
  const progress = row.graduated ? 1 : graduationProgress(row.real_core);

  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    description: row.description,
    image: row.image,
    creatorId: row.creator_id,
    creatorName,
    creatorVerified,
    price,
    marketCap,
    progress,
    realCoreRaised: row.real_core,
    graduated: !!row.graduated,
    graduatedAt: row.graduated_at,
    createdAt: row.created_at,
    riskLevel,
    twitter: row.twitter,
    telegram: row.telegram,
    website: row.website,
    category: row.category,
    isProject: !!projectMeta,
    tagline: projectMeta?.tagline ?? null,
    creatorReputationTier,
    backerCount,
    growth24h,
  };
}

export type SerializedToken = ReturnType<typeof serializeToken>;
