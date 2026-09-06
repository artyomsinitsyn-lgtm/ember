import { type DB, dbGet, dbRun, withTransaction } from "./db";
import {
  quoteBuyOnCurve,
  quoteSellOnCurve,
  quoteBuyOnPool,
  quoteSellOnPool,
  currentPrice,
} from "./bondingCurve";
import { distributeToStakers } from "./rewards";
import { GRADUATION_CORE_RAISED, INITIAL_REAL_TOKEN_RESERVES } from "./constants";
import { emitTrade } from "./events";

export interface TokenRow {
  id: string;
  ticker: string;
  name: string;
  description: string;
  image: string;
  creator_id: string;
  v_core: number;
  v_token: number;
  real_core: number;
  real_token: number;
  total_supply: number;
  graduated: number;
  graduated_at: number | null;
  pool_core: number | null;
  pool_token: number | null;
  created_at: number;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  category: string;
}

export async function getToken(db: DB, tokenId: string): Promise<TokenRow> {
  const token = await dbGet<TokenRow>(db, "SELECT * FROM tokens WHERE id = $1", [tokenId]);
  if (!token) throw new Error("Token not found");
  return token;
}

/** Same as getToken, but takes a row lock so a concurrent buy/sell on the same token can't
 * read stale curve reserves out from under this transaction — Postgres needs this explicitly
 * where SQLite's single-writer model gave it for free. */
async function getTokenForUpdate(db: DB, tokenId: string): Promise<TokenRow> {
  const token = await dbGet<TokenRow>(db, "SELECT * FROM tokens WHERE id = $1 FOR UPDATE", [tokenId]);
  if (!token) throw new Error("Token not found");
  return token;
}

async function adjustHolding(db: DB, walletId: string, tokenId: string, delta: number) {
  await dbRun(
    db,
    `INSERT INTO holdings (wallet_id, token_id, amount) VALUES ($1, $2, $3)
     ON CONFLICT (wallet_id, token_id) DO UPDATE SET amount = holdings.amount + EXCLUDED.amount`,
    [walletId, tokenId, delta]
  );
}

async function creditCreator(db: DB, creatorId: string, amount: number) {
  if (amount <= 0) return;
  await dbRun(db, "UPDATE wallets SET core_balance = core_balance + $1 WHERE id = $2", [amount, creatorId]);
}

async function creditTreasury(db: DB, amount: number) {
  if (amount <= 0) return;
  await dbRun(db, "UPDATE treasury SET core_balance = core_balance + $1 WHERE id = 1", [amount]);
}

export async function executeBuy(tokenId: string, walletId: string, coreIn: number, timestamp = Date.now()) {
  const result = await withTransaction(async (db) => {
    const token = await getTokenForUpdate(db, tokenId);
    const wallet = await dbGet<{ core_balance: number }>(
      db,
      "SELECT core_balance FROM wallets WHERE id = $1 FOR UPDATE",
      [walletId]
    );
    if (!wallet) throw new Error("Wallet not found");
    if (coreIn <= 0) throw new Error("Amount must be positive");
    if (wallet.core_balance < coreIn) throw new Error("Insufficient CORE balance");

    let tokensOut: number;
    let price: number;
    let fee;
    let graduatedNow = !!token.graduated;

    if (!token.graduated) {
      const q = quoteBuyOnCurve(
        { vCore: token.v_core, vToken: token.v_token, realCore: token.real_core, realToken: token.real_token },
        coreIn
      );
      tokensOut = q.tokensOut;
      fee = q.fee;
      price = currentPrice(q.newVCore, q.newVToken);

      await dbRun(
        db,
        "UPDATE tokens SET v_core = $1, v_token = $2, real_core = $3, real_token = $4 WHERE id = $5",
        [q.newVCore, q.newVToken, q.newRealCore, q.newRealToken, tokenId]
      );

      if (q.newRealCore >= GRADUATION_CORE_RAISED || q.newRealToken <= 0) {
        graduatedNow = true;
        // The curve only ever sells INITIAL_REAL_TOKEN_RESERVES; the rest of total_supply was
        // held back from day one specifically to seed the pool at graduation (mirrors pump.fun's
        // Raydium migration reserve). Seeding the pool from the curve's leftover instead — which
        // is ~0 by design, since the curve is calibrated so raising GRADUATION_CORE_RAISED and
        // selling out coincide — would leave the pool with no tokens to trade against.
        const reservedForPool = token.total_supply - INITIAL_REAL_TOKEN_RESERVES + Math.max(q.newRealToken, 0);
        await dbRun(
          db,
          "UPDATE tokens SET graduated = 1, graduated_at = $1, pool_core = $2, pool_token = $3 WHERE id = $4",
          [timestamp, q.newRealCore, reservedForPool, tokenId]
        );
      }
    } else {
      const q = quoteBuyOnPool({ poolCore: token.pool_core!, poolToken: token.pool_token! }, coreIn);
      tokensOut = q.tokensOut;
      fee = q.fee;
      price = currentPrice(q.newPoolCore, q.newPoolToken);
      await dbRun(db, "UPDATE tokens SET pool_core = $1, pool_token = $2 WHERE id = $3", [
        q.newPoolCore,
        q.newPoolToken,
        tokenId,
      ]);
    }

    await dbRun(db, "UPDATE wallets SET core_balance = core_balance - $1 WHERE id = $2", [coreIn, walletId]);
    await adjustHolding(db, walletId, tokenId, tokensOut);
    await creditCreator(db, token.creator_id, fee.creator);
    await creditTreasury(db, fee.treasury);
    await distributeToStakers(db, fee.staker);

    await dbRun(
      db,
      `INSERT INTO trades (id, token_id, wallet_id, side, core_amount, token_amount, price, fee_total, fee_creator, fee_staker, fee_treasury, created_at)
       VALUES ($1, $2, $3, 'buy', $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        crypto.randomUUID(),
        tokenId,
        walletId,
        coreIn,
        tokensOut,
        price,
        fee.total,
        fee.creator,
        fee.staker,
        fee.treasury,
        timestamp,
      ]
    );

    return { tokensOut, price, fee, graduatedNow };
  });

  emitTrade({
    tokenId,
    walletId,
    side: "buy",
    price: result.price,
    tokenAmount: result.tokensOut,
    coreAmount: coreIn,
    graduated: result.graduatedNow,
    createdAt: timestamp,
  });

  return result;
}

export async function executeSell(tokenId: string, walletId: string, tokensIn: number, timestamp = Date.now()) {
  const result = await withTransaction(async (db) => {
    const token = await getTokenForUpdate(db, tokenId);
    const holding = await dbGet<{ amount: number }>(
      db,
      "SELECT amount FROM holdings WHERE wallet_id = $1 AND token_id = $2 FOR UPDATE",
      [walletId, tokenId]
    );
    if (tokensIn <= 0) throw new Error("Amount must be positive");
    if (!holding || holding.amount < tokensIn) throw new Error("Insufficient token balance");

    let coreOutNet: number;
    let price: number;
    let fee;
    const graduatedNow = !!token.graduated;

    if (!token.graduated) {
      const q = quoteSellOnCurve(
        { vCore: token.v_core, vToken: token.v_token, realCore: token.real_core, realToken: token.real_token },
        tokensIn
      );
      coreOutNet = q.coreOutNet;
      fee = q.fee;
      price = currentPrice(q.newVCore, q.newVToken);
      await dbRun(
        db,
        "UPDATE tokens SET v_core = $1, v_token = $2, real_core = $3, real_token = $4 WHERE id = $5",
        [q.newVCore, q.newVToken, q.newRealCore, q.newRealToken, tokenId]
      );
    } else {
      const q = quoteSellOnPool({ poolCore: token.pool_core!, poolToken: token.pool_token! }, tokensIn);
      coreOutNet = q.coreOutNet;
      fee = q.fee;
      price = currentPrice(q.newPoolCore, q.newPoolToken);
      await dbRun(db, "UPDATE tokens SET pool_core = $1, pool_token = $2 WHERE id = $3", [
        q.newPoolCore,
        q.newPoolToken,
        tokenId,
      ]);
    }

    await dbRun(db, "UPDATE wallets SET core_balance = core_balance + $1 WHERE id = $2", [coreOutNet, walletId]);
    await adjustHolding(db, walletId, tokenId, -tokensIn);
    await creditCreator(db, token.creator_id, fee.creator);
    await creditTreasury(db, fee.treasury);
    await distributeToStakers(db, fee.staker);

    await dbRun(
      db,
      `INSERT INTO trades (id, token_id, wallet_id, side, core_amount, token_amount, price, fee_total, fee_creator, fee_staker, fee_treasury, created_at)
       VALUES ($1, $2, $3, 'sell', $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        crypto.randomUUID(),
        tokenId,
        walletId,
        coreOutNet,
        tokensIn,
        price,
        fee.total,
        fee.creator,
        fee.staker,
        fee.treasury,
        timestamp,
      ]
    );

    return { coreOutNet, price, fee, graduatedNow };
  });

  emitTrade({
    tokenId,
    walletId,
    side: "sell",
    price: result.price,
    tokenAmount: tokensIn,
    coreAmount: result.coreOutNet,
    graduated: result.graduatedNow,
    createdAt: timestamp,
  });

  return result;
}
