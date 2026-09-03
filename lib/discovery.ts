import Database from "better-sqlite3";

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeBackerCounts(db: Database.Database): Map<string, number> {
  const rows = db
    .prepare("SELECT token_id, COUNT(*) as c FROM holdings WHERE amount > 0.0001 GROUP BY token_id")
    .all() as { token_id: string; c: number }[];
  return new Map(rows.map((r) => [r.token_id, r.c]));
}

export interface GrowthDelta {
  last24h: number;
  prev24h: number;
  delta: number;
  volumeDelta: number;
}

/**
 * "Growing" = unique-buyer delta between two adjacent 24h windows, tie-broken by buy-volume
 * delta over the same windows — one batched query bucketed in JS, same simple/explainable
 * style as lib/challengeScore.ts. No time-series table, no per-token queries.
 */
export function computeGrowthDeltas(db: Database.Database): Map<string, GrowthDelta> {
  const since = Date.now() - 2 * DAY_MS;
  const rows = db
    .prepare(
      `SELECT token_id, wallet_id, core_amount, created_at FROM trades
       WHERE side = 'buy' AND created_at > ?`
    )
    .all(since) as { token_id: string; wallet_id: string; core_amount: number; created_at: number }[];

  const now = Date.now();
  const boundary = now - DAY_MS;

  interface Bucket {
    lastBuyers: Set<string>;
    prevBuyers: Set<string>;
    lastVolume: number;
    prevVolume: number;
  }
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    let b = buckets.get(r.token_id);
    if (!b) {
      b = { lastBuyers: new Set(), prevBuyers: new Set(), lastVolume: 0, prevVolume: 0 };
      buckets.set(r.token_id, b);
    }
    if (r.created_at >= boundary) {
      b.lastBuyers.add(r.wallet_id);
      b.lastVolume += r.core_amount;
    } else {
      b.prevBuyers.add(r.wallet_id);
      b.prevVolume += r.core_amount;
    }
  }

  const result = new Map<string, GrowthDelta>();
  for (const [tokenId, b] of buckets) {
    result.set(tokenId, {
      last24h: b.lastBuyers.size,
      prev24h: b.prevBuyers.size,
      delta: b.lastBuyers.size - b.prevBuyers.size,
      volumeDelta: b.lastVolume - b.prevVolume,
    });
  }
  return result;
}
