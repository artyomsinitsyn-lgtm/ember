// Split out from lib/reputation.ts: this file must stay free of any import that reaches
// ./db (and therefore `pg`), since ReputationBadge.tsx and ProfilePageClient.tsx import
// REPUTATION_TIER_LABEL as a runtime value from a client component — a real (non-type-only)
// import drags a module's entire top-level import graph into the browser bundle, and `pg`
// requires Node builtins (net/tls/util) that don't exist there.
export type ReputationTier = "new" | "builder" | "established" | "flagged";

export const REPUTATION_TIER_LABEL: Record<Exclude<ReputationTier, "new">, string> = {
  builder: "Repeat builder",
  established: "Established creator",
  flagged: "Flagged launch history",
};
