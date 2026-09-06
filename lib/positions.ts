import { type DB, dbGet, dbAll } from "./db";
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
export async function computeWalletPositions(db: DB, walletId: string): Promise<WalletPosition[]> {
  const tokenIds = (
    await dbAll<{ token_id: string }>(db, "SELECT DISTINCT token_id FROM trades WHERE wallet_id = $1", [walletId])
  ).map((r) => r.token_id);

  const positions: WalletPosition[] = [];

  for (const tokenId of tokenIds) {
    const row = await dbGet<TokenRow & { creator_name: string }>(
      db,
      "SELECT tokens.*, wallets.name as creator_name FROM tokens JOIN wallets ON wallets.id = tokens.creator_id WHERE tokens.id = $1",
      [tokenId]
    );
    if (!row) continue;

    const agg = (await dbGet<{ buyCost: number; sellProceeds: number; tokensBought: number }>(
      db,
      `SELECT
         COALESCE(SUM(CASE WHEN side = 'buy' THEN core_amount ELSE 0 END), 0) as "buyCost",
         COALESCE(SUM(CASE WHEN side = 'sell' THEN core_amount ELSE 0 END), 0) as "sellProceeds",
         COALESCE(SUM(CASE WHEN side = 'buy' THEN token_amount ELSE 0 END), 0) as "tokensBought"
       FROM trades WHERE wallet_id = $1 AND token_id = $2`,
      [walletId, tokenId]
    ))!;

    const holding = await dbGet<{ amount: number }>(
      db,
      "SELECT amount FROM holdings WHERE wallet_id = $1 AND token_id = $2",
      [walletId, tokenId]
    );
    const amountHeld = holding?.amount ?? 0;

    const price = row.graduated ? currentPrice(row.pool_core!, row.pool_token!) : currentPrice(row.v_core, row.v_token);
    const positionValue = amountHeld > DUST ? price * amountHeld : 0;

    const avgEntryPrice = agg.tokensBought > DUST ? agg.buyCost / agg.tokensBought : null;
    const avgEntryMcap = avgEntryPrice != null ? avgEntryPrice * TOTAL_SUPPLY : null;

    const netPnl = agg.sellProceeds + positionValue - agg.buyCost;

    const rug = await assessRugRisk(db, tokenId);
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
export async function computeTokenHolderPositions(db: DB, tokenId: string): Promise<TokenHolderPosition[]> {
  const row = await dbGet<TokenRow>(db, "SELECT * FROM tokens WHERE id = $1", [tokenId]);
  if (!row) return [];

  const price = row.graduated ? currentPrice(row.pool_core!, row.pool_token!) : currentPrice(row.v_core, row.v_token);

  const holders = await dbAll<{ wallet_id: string; name: string; avatar: string; amount: number }>(
    db,
    `SELECT holdings.wallet_id, wallets.name, wallets.avatar, holdings.amount
     FROM holdings JOIN wallets ON wallets.id = holdings.wallet_id
     WHERE token_id = $1 AND amount > $2`,
    [tokenId, DUST]
  );

  const circulating = holders.reduce((sum, h) => sum + h.amount, 0);

  const results = await Promise.all(
    holders.map(async (h) => {
      const agg = (await dbGet<{ buyCost: number; sellProceeds: number }>(
        db,
        `SELECT
           COALESCE(SUM(CASE WHEN side = 'buy' THEN core_amount ELSE 0 END), 0) as "buyCost",
           COALESCE(SUM(CASE WHEN side = 'sell' THEN core_amount ELSE 0 END), 0) as "sellProceeds"
         FROM trades WHERE wallet_id = $1 AND token_id = $2`,
        [h.wallet_id, tokenId]
      ))!;

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
  );

  return results.sort((a, b) => b.positionValue - a.positionValue);
}
