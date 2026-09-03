import Database from "better-sqlite3";
import { currentPrice } from "./bondingCurve";
import { serializeToken } from "./serialize";
import { assessRugRisk } from "./rugDetection";
import { TOTAL_SUPPLY } from "./constants";
import type { TokenRow } from "./trading";

const DUST = 0.0001;

export interface WalletPosition {
  token: ReturnType<typeof serializeToken>;
  open: boolean;
  amountHeld: number;
  positionValue: number;
  spent: number;
  avgEntryMcap: number | null;
  netPnl: number;
}

/**
 * Per-token position for one wallet, computed straight from the trade ledger — same net
 * cash-flow philosophy as computeWalletProfile's site-wide realizedPnl, just scoped to a
 * single token and including the still-held balance's current value as its unrealized leg.
 * Avg entry is expressed as a market cap (price-at-buy * total supply, volume-weighted
 * across that wallet's buys) since that's the number traders actually compare against
 * "MC now" to judge an entry, not a raw per-token price.
 */
export function computeWalletPositions(db: Database.Database, walletId: string): WalletPosition[] {
  const tokenIds = (
    db.prepare("SELECT DISTINCT token_id FROM trades WHERE wallet_id = ?").all(walletId) as { token_id: string }[]
  ).map((r) => r.token_id);

  const positions: WalletPosition[] = [];

  for (const tokenId of tokenIds) {
    const row = db.prepare("SELECT tokens.*, wallets.name as creator_name FROM tokens JOIN wallets ON wallets.id = tokens.creator_id WHERE tokens.id = ?").get(tokenId) as
      | (TokenRow & { creator_name: string })
      | undefined;
    if (!row) continue;

    const agg = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN side = 'buy' THEN core_amount ELSE 0 END), 0) as buyCost,
           COALESCE(SUM(CASE WHEN side = 'sell' THEN core_amount ELSE 0 END), 0) as sellProceeds,
           COALESCE(SUM(CASE WHEN side = 'buy' THEN token_amount ELSE 0 END), 0) as tokensBought
         FROM trades WHERE wallet_id = ? AND token_id = ?`
      )
      .get(walletId, tokenId) as { buyCost: number; sellProceeds: number; tokensBought: number };

    const holding = db
      .prepare("SELECT amount FROM holdings WHERE wallet_id = ? AND token_id = ?")
      .get(walletId, tokenId) as { amount: number } | undefined;
    const amountHeld = holding?.amount ?? 0;

    const price = row.graduated ? currentPrice(row.pool_core!, row.pool_token!) : currentPrice(row.v_core, row.v_token);
    const positionValue = amountHeld > DUST ? price * amountHeld : 0;

    const avgEntryPrice = agg.tokensBought > DUST ? agg.buyCost / agg.tokensBought : null;
    const avgEntryMcap = avgEntryPrice != null ? avgEntryPrice * TOTAL_SUPPLY : null;

    const netPnl = agg.sellProceeds + positionValue - agg.buyCost;

    const rug = assessRugRisk(db, tokenId);
    positions.push({
      token: serializeToken(row, row.creator_name, rug.riskLevel),
      open: amountHeld > DUST,
      amountHeld,
      positionValue,
      spent: agg.buyCost,
      avgEntryMcap,
      netPnl,
    });
  }

  return positions.sort((a, b) => b.netPnl - a.netPnl);
}

export interface TokenHolderPosition {
  walletId: string;
  walletName: string;
  walletAvatar: string;
  amountHeld: number;
  positionValue: number;
  spent: number;
  netPnl: number;
  pctSupply: number;
}

/** The reverse of computeWalletPositions: every current holder of one token, each with
 * their own cost basis and net P&L on it — the same net-cash-flow-plus-unrealized-value
 * math, just aggregated per holder instead of per token. */
export function computeTokenHolderPositions(db: Database.Database, tokenId: string): TokenHolderPosition[] {
  const row = db.prepare("SELECT * FROM tokens WHERE id = ?").get(tokenId) as TokenRow | undefined;
  if (!row) return [];

  const price = row.graduated ? currentPrice(row.pool_core!, row.pool_token!) : currentPrice(row.v_core, row.v_token);

  const holders = db
    .prepare(
      `SELECT holdings.wallet_id, wallets.name, wallets.avatar, holdings.amount
       FROM holdings JOIN wallets ON wallets.id = holdings.wallet_id
       WHERE token_id = ? AND amount > ?`
    )
    .all(tokenId, DUST) as { wallet_id: string; name: string; avatar: string; amount: number }[];

  const circulating = holders.reduce((sum, h) => sum + h.amount, 0);

  return holders
    .map((h) => {
      const agg = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN side = 'buy' THEN core_amount ELSE 0 END), 0) as buyCost,
             COALESCE(SUM(CASE WHEN side = 'sell' THEN core_amount ELSE 0 END), 0) as sellProceeds
           FROM trades WHERE wallet_id = ? AND token_id = ?`
        )
        .get(h.wallet_id, tokenId) as { buyCost: number; sellProceeds: number };

      const positionValue = price * h.amount;
      return {
        walletId: h.wallet_id,
        walletName: h.name,
        walletAvatar: h.avatar,
        amountHeld: h.amount,
        positionValue,
        spent: agg.buyCost,
        netPnl: agg.sellProceeds + positionValue - agg.buyCost,
        pctSupply: circulating > 0 ? (h.amount / circulating) * 100 : 0,
      };
    })
    .sort((a, b) => b.positionValue - a.positionValue);
}
