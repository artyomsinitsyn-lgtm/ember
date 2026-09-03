import Database from "better-sqlite3";

export interface ClusterFlag {
  walletIds: string[];
  walletNames: string[];
  reason: "shared_funding" | "coordinated_trading";
  combinedPct: number;
  detail: string;
}

export interface RugAssessment {
  riskLevel: "low" | "medium" | "high";
  topWalletPct: number;
  clusters: ClusterFlag[];
}

// A single wallet rarely holds enough to trip a naive check on its own — real bundles
// split the stake across several wallets funded from one source, or several wallets that
// trade in lockstep. Either pattern can add up to a large combined stake that a
// per-wallet threshold alone would never catch.
// This demo economy only has a handful of independent trader wallets, so a wide window
// with a low distinct-wallet bar will "detect" ordinary reuse of the same few bots as
// if it were coordination. Requiring 4+ distinct wallets inside a tight 60s window is
// what actually separates deliberate bundling from a small trader pool bumping into
// itself — with more real participants this stays just as meaningful, not less.
const COORDINATION_WINDOW_MS = 60 * 1000;
const MIN_CLUSTER_SIZE = 2;
const MIN_COORDINATED_BURST_WALLETS = 4;
const HIGH_RISK_CLUSTER_PCT = 20;
const MEDIUM_RISK_CLUSTER_PCT = 10;

export function assessRugRisk(db: Database.Database, tokenId: string): RugAssessment {
  const holders = db
    .prepare(
      `SELECT holdings.wallet_id, wallets.name, wallets.funded_by, holdings.amount
       FROM holdings JOIN wallets ON wallets.id = holdings.wallet_id
       WHERE token_id = ? AND amount > 0.0001`
    )
    .all(tokenId) as { wallet_id: string; name: string; funded_by: string | null; amount: number }[];

  const circulating = holders.reduce((sum, h) => sum + h.amount, 0);
  const pctOf = (amount: number) => (circulating > 0 ? (amount / circulating) * 100 : 0);
  const topWalletPct = holders.length ? Math.max(...holders.map((h) => pctOf(h.amount))) : 0;

  const clusters: ClusterFlag[] = [];

  // Shared funding source: wallets that all received their opening balance from the
  // same address, then bought into this token, aren't independent buyers.
  const byFunder = new Map<string, typeof holders>();
  for (const h of holders) {
    if (!h.funded_by) continue;
    const group = byFunder.get(h.funded_by) ?? [];
    group.push(h);
    byFunder.set(h.funded_by, group);
  }
  for (const [funderId, group] of byFunder) {
    if (group.length < MIN_CLUSTER_SIZE) continue;
    const combinedPct = group.reduce((sum, h) => sum + pctOf(h.amount), 0);
    const funder = db.prepare("SELECT name FROM wallets WHERE id = ?").get(funderId) as { name: string } | undefined;
    clusters.push({
      walletIds: group.map((h) => h.wallet_id),
      walletNames: group.map((h) => h.name),
      reason: "shared_funding",
      combinedPct,
      detail: `${group.length} holder wallets were all funded by ${funder?.name ?? funderId} before buying in. No single wallet in the group looks large, but together they do.`,
    });
  }

  // Coordinated trading: repeated bursts of several distinct wallets all buying inside
  // the same short window, regardless of funding history.
  const buys = db
    .prepare(
      `SELECT trades.wallet_id, trades.created_at
       FROM trades WHERE token_id = ? AND side = 'buy' ORDER BY created_at ASC`
    )
    .all(tokenId) as { wallet_id: string; created_at: number }[];

  const alreadyFlagged = new Set(clusters.flatMap((c) => c.walletIds));
  const coordinatedWallets = new Set<string>();
  let burstCount = 0;
  let i = 0;
  while (i < buys.length) {
    const windowStart = buys[i].created_at;
    const windowWallets = new Set<string>();
    let j = i;
    while (j < buys.length && buys[j].created_at - windowStart <= COORDINATION_WINDOW_MS) {
      windowWallets.add(buys[j].wallet_id);
      j++;
    }
    if (windowWallets.size >= MIN_COORDINATED_BURST_WALLETS) {
      burstCount++;
      for (const w of windowWallets) coordinatedWallets.add(w);
    }
    i = j > i ? j : i + 1;
  }

  const newlyCoordinated = [...coordinatedWallets].filter((w) => !alreadyFlagged.has(w));
  if (burstCount >= 1 && newlyCoordinated.length >= MIN_CLUSTER_SIZE) {
    const group = holders.filter((h) => newlyCoordinated.includes(h.wallet_id));
    if (group.length >= MIN_CLUSTER_SIZE) {
      const combinedPct = group.reduce((sum, h) => sum + pctOf(h.amount), 0);
      clusters.push({
        walletIds: group.map((h) => h.wallet_id),
        walletNames: group.map((h) => h.name),
        reason: "coordinated_trading",
        combinedPct,
        detail: `${group.length} wallets bought within minutes of each other and still hold a combined stake.`,
      });
    }
  }

  // Deliberately not a factor here: how much any single wallet holds. A high top-wallet
  // percentage on a young token usually just means it has few traders yet, not that it's
  // rigged — and real bundlers keep every individual wallet looking small on purpose.
  // Risk level comes only from clustering, which is what actually catches that.
  const maxClusterPct = clusters.reduce((max, c) => Math.max(max, c.combinedPct), 0);
  let riskLevel: RugAssessment["riskLevel"] = "low";
  if (maxClusterPct >= HIGH_RISK_CLUSTER_PCT) {
    riskLevel = "high";
  } else if (maxClusterPct >= MEDIUM_RISK_CLUSTER_PCT) {
    riskLevel = "medium";
  }

  return {
    riskLevel,
    topWalletPct,
    clusters: clusters.sort((a, b) => b.combinedPct - a.combinedPct),
  };
}
