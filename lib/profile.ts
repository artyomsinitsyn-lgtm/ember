import Database from "better-sqlite3";
import { currentPrice } from "./bondingCurve";
import type { TokenRow } from "./trading";
import { VERIFIED_PROFIT_THRESHOLD } from "./constants";
import { computeCreatorReputation, type ReputationTier } from "./reputation";

export interface WalletProfile {
  walletId: string;
  name: string;
  avatar: string;
  banner: string | null;
  bannerPreset: string | null;
  bio: string | null;
  coreBalance: number | null;
  stakeBalance: number | null;
  portfolioValue: number;
  netWorth: number;
  realizedPnl: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  tradeCount: number;
  followers: number;
  following: number;
  tokensCreated: number;
  tokensGraduated: number;
  reputationTier: ReputationTier;
  staked: number;
  lifetimeClaimed: number;
  createdAt: number;
  contactType: "phone" | "email" | null;
  contactVerified: boolean;
  twitterHandle: string | null;
  canPost: boolean;
  profitThresholdMet: boolean;
  verified: boolean;
  verificationStatus: "none" | "pending" | "approved" | "rejected";
  verifiedOnlyMessages: boolean;
}

/** Meeting the verification requirement no longer flips the badge on by itself — it opens a
 * request that sits in /admin/verifications until the operator personally approves it. This
 * lazily creates that request the first time a wallet becomes eligible (a unique index on
 * wallet_id keeps it to one row per wallet), and otherwise just reports whatever the existing
 * row says. */
function verificationStatus(
  db: Database.Database,
  walletId: string,
  eligible: boolean
): "none" | "pending" | "approved" | "rejected" {
  const existing = db.prepare("SELECT status FROM verification_requests WHERE wallet_id = ?").get(walletId) as
    | { status: "pending" | "approved" | "rejected" }
    | undefined;
  if (existing) return existing.status;
  if (!eligible) return "none";

  const id = `vreq_${crypto.randomUUID().slice(0, 10)}`;
  db.prepare("INSERT INTO verification_requests (id, wallet_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(
    id,
    walletId,
    Date.now()
  );
  return "pending";
}

export function computeWalletProfile(db: Database.Database, walletId: string): WalletProfile | null {
  const wallet = db.prepare("SELECT * FROM wallets WHERE id = ?").get(walletId) as
    | {
        id: string;
        name: string;
        avatar: string;
        core_balance: number;
        embr_balance: number;
        created_at: number;
        contact: string | null;
        contact_type: "phone" | "email" | null;
        contact_verified_at: number | null;
        verified_only_messages: number;
        twitter_handle: string | null;
        bio: string | null;
        banner: string | null;
        banner_preset: string | null;
      }
    | undefined;
  if (!wallet) return null;

  const holdingRows = db
    .prepare(
      `SELECT holdings.amount, tokens.* FROM holdings
       JOIN tokens ON tokens.id = holdings.token_id
       WHERE holdings.wallet_id = ? AND holdings.amount > 0.0001`
    )
    .all(walletId) as (TokenRow & { amount: number })[];

  const portfolioValue = holdingRows.reduce((sum, h) => {
    const price = h.graduated ? currentPrice(h.pool_core!, h.pool_token!) : currentPrice(h.v_core, h.v_token);
    return sum + price * h.amount;
  }, 0);

  const tradeAgg = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN side = 'buy' THEN core_amount ELSE 0 END), 0) as buyVolume,
         COALESCE(SUM(CASE WHEN side = 'sell' THEN core_amount ELSE 0 END), 0) as sellVolume,
         COUNT(*) as tradeCount
       FROM trades WHERE wallet_id = ?`
    )
    .get(walletId) as { buyVolume: number; sellVolume: number; tradeCount: number };

  // Net cash flow (sell proceeds minus buy cost), not a cost-basis-lot realized P&L —
  // an honest, simple "how much they've net taken out of trading" figure.
  const realizedPnl = tradeAgg.sellVolume - tradeAgg.buyVolume;
  const totalVolume = tradeAgg.buyVolume + tradeAgg.sellVolume;

  const createdCount = db.prepare("SELECT COUNT(*) as c FROM tokens WHERE creator_id = ?").get(walletId) as {
    c: number;
  };
  const graduatedCount = db
    .prepare("SELECT COUNT(*) as c FROM tokens WHERE creator_id = ? AND graduated = 1")
    .get(walletId) as { c: number };

  const stakePos = db
    .prepare("SELECT staked, claimed_core FROM stake_positions WHERE wallet_id = ?")
    .get(walletId) as { staked: number; claimed_core: number } | undefined;

  // "Followers"/"following" reuse the connections graph's own requester/recipient
  // direction — a wallet's followers are the accepted connections it didn't initiate,
  // following is the ones it did. Not a separate social graph, just this one read two ways.
  const followers = (
    db
      .prepare("SELECT COUNT(*) as c FROM connections WHERE recipient_id = ? AND status = 'accepted'")
      .get(walletId) as { c: number }
  ).c;
  const following = (
    db
      .prepare("SELECT COUNT(*) as c FROM connections WHERE requester_id = ? AND status = 'accepted'")
      .get(walletId) as { c: number }
  ).c;

  const contactVerified = wallet.contact_verified_at != null;
  const profitThresholdMet = realizedPnl >= VERIFIED_PROFIT_THRESHOLD;
  const reqStatus = verificationStatus(db, walletId, contactVerified && profitThresholdMet);

  return {
    walletId: wallet.id,
    name: wallet.name,
    avatar: wallet.avatar,
    banner: wallet.banner,
    bannerPreset: wallet.banner_preset,
    bio: wallet.bio,
    coreBalance: wallet.core_balance,
    stakeBalance: wallet.embr_balance,
    portfolioValue,
    netWorth: wallet.core_balance + portfolioValue,
    realizedPnl,
    totalVolume,
    buyVolume: tradeAgg.buyVolume,
    sellVolume: tradeAgg.sellVolume,
    tradeCount: tradeAgg.tradeCount,
    followers,
    following,
    tokensCreated: createdCount.c,
    tokensGraduated: graduatedCount.c,
    reputationTier: computeCreatorReputation(db, walletId).tier,
    staked: stakePos?.staked ?? 0,
    lifetimeClaimed: stakePos?.claimed_core ?? 0,
    createdAt: wallet.created_at,
    contactType: wallet.contact_type,
    contactVerified,
    twitterHandle: wallet.twitter_handle,
    canPost: contactVerified || !!wallet.twitter_handle,
    profitThresholdMet,
    verified: reqStatus === "approved",
    verificationStatus: reqStatus,
    verifiedOnlyMessages: !!wallet.verified_only_messages,
  };
}

export function getLeaderboard(db: Database.Database, limit = 50): WalletProfile[] {
  const ids = db.prepare("SELECT id FROM wallets").all() as { id: string }[];
  const profiles = ids
    .map((w) => computeWalletProfile(db, w.id))
    .filter((p): p is WalletProfile => p !== null);
  return profiles.sort((a, b) => b.netWorth - a.netWorth).slice(0, limit);
}

/** coreBalance/stakeBalance are spendable-balance figures, not public leaderboard stats —
 * every route that hands a WalletProfile back to a client (whose id might not be the caller)
 * must run its output through this before responding. netWorth/portfolioValue/realizedPnl
 * stay visible everywhere: those are the intentionally-public "how are they doing" numbers. */
export function redactBalanceForViewer<T extends WalletProfile>(profile: T, viewerWalletId: string): T {
  if (profile.walletId === viewerWalletId) return profile;
  return { ...profile, coreBalance: null, stakeBalance: null };
}
