import Database from "better-sqlite3";
import { getDb } from "./db";
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

export function getToken(db: Database.Database, tokenId: string): TokenRow {
  const token = db.prepare("SELECT * FROM tokens WHERE id = ?").get(tokenId) as TokenRow | undefined;
  if (!token) throw new Error("Token not found");
  return token;
}

function adjustHolding(db: Database.Database, walletId: string, tokenId: string, delta: number) {
  db.prepare(
    `INSERT INTO holdings (wallet_id, token_id, amount) VALUES (?, ?, ?)
     ON CONFLICT(wallet_id, token_id) DO UPDATE SET amount = amount + excluded.amount`
  ).run(walletId, tokenId, delta);
}

function creditCreator(db: Database.Database, creatorId: string, amount: number) {
  if (amount <= 0) return;
  db.prepare("UPDATE wallets SET core_balance = core_balance + ? WHERE id = ?").run(amount, creatorId);
}

function creditTreasury(db: Database.Database, amount: number) {
  if (amount <= 0) return;
  db.prepare("UPDATE treasury SET core_balance = core_balance + ? WHERE id = 1").run(amount);
}

export function executeBuy(tokenId: string, walletId: string, coreIn: number, timestamp = Date.now()) {
  const db = getDb();
  const result = db.transaction(() => {
    const token = getToken(db, tokenId);
    const wallet = db.prepare("SELECT core_balance FROM wallets WHERE id = ?").get(walletId) as
      | { core_balance: number }
      | undefined;
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

      db.prepare(
        "UPDATE tokens SET v_core = ?, v_token = ?, real_core = ?, real_token = ? WHERE id = ?"
      ).run(q.newVCore, q.newVToken, q.newRealCore, q.newRealToken, tokenId);

      if (q.newRealCore >= GRADUATION_CORE_RAISED || q.newRealToken <= 0) {
        graduatedNow = true;
        // The curve only ever sells INITIAL_REAL_TOKEN_RESERVES; the rest of total_supply was
        // held back from day one specifically to seed the pool at graduation (mirrors pump.fun's
        // Raydium migration reserve). Seeding the pool from the curve's leftover instead — which
        // is ~0 by design, since the curve is calibrated so raising GRADUATION_CORE_RAISED and
        // selling out coincide — would leave the pool with no tokens to trade against.
        const reservedForPool = token.total_supply - INITIAL_REAL_TOKEN_RESERVES + Math.max(q.newRealToken, 0);
        db.prepare(
          "UPDATE tokens SET graduated = 1, graduated_at = ?, pool_core = ?, pool_token = ? WHERE id = ?"
        ).run(timestamp, q.newRealCore, reservedForPool, tokenId);
      }
    } else {
      const q = quoteBuyOnPool({ poolCore: token.pool_core!, poolToken: token.pool_token! }, coreIn);
      tokensOut = q.tokensOut;
      fee = q.fee;
      price = currentPrice(q.newPoolCore, q.newPoolToken);
      db.prepare("UPDATE tokens SET pool_core = ?, pool_token = ? WHERE id = ?").run(
        q.newPoolCore,
        q.newPoolToken,
        tokenId
      );
    }

    db.prepare("UPDATE wallets SET core_balance = core_balance - ? WHERE id = ?").run(coreIn, walletId);
    adjustHolding(db, walletId, tokenId, tokensOut);
    creditCreator(db, token.creator_id, fee.creator);
    creditTreasury(db, fee.treasury);
    distributeToStakers(db, fee.staker);

    db.prepare(
      `INSERT INTO trades (id, token_id, wallet_id, side, core_amount, token_amount, price, fee_total, fee_creator, fee_staker, fee_treasury, created_at)
       VALUES (?, ?, ?, 'buy', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
      timestamp
    );

    return { tokensOut, price, fee, graduatedNow };
  })();

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

export function executeSell(tokenId: string, walletId: string, tokensIn: number, timestamp = Date.now()) {
  const db = getDb();
  const result = db.transaction(() => {
    const token = getToken(db, tokenId);
    const holding = db
      .prepare("SELECT amount FROM holdings WHERE wallet_id = ? AND token_id = ?")
      .get(walletId, tokenId) as { amount: number } | undefined;
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
      db.prepare(
        "UPDATE tokens SET v_core = ?, v_token = ?, real_core = ?, real_token = ? WHERE id = ?"
      ).run(q.newVCore, q.newVToken, q.newRealCore, q.newRealToken, tokenId);
    } else {
      const q = quoteSellOnPool({ poolCore: token.pool_core!, poolToken: token.pool_token! }, tokensIn);
      coreOutNet = q.coreOutNet;
      fee = q.fee;
      price = currentPrice(q.newPoolCore, q.newPoolToken);
      db.prepare("UPDATE tokens SET pool_core = ?, pool_token = ? WHERE id = ?").run(
        q.newPoolCore,
        q.newPoolToken,
        tokenId
      );
    }

    db.prepare("UPDATE wallets SET core_balance = core_balance + ? WHERE id = ?").run(coreOutNet, walletId);
    adjustHolding(db, walletId, tokenId, -tokensIn);
    creditCreator(db, token.creator_id, fee.creator);
    creditTreasury(db, fee.treasury);
    distributeToStakers(db, fee.staker);

    db.prepare(
      `INSERT INTO trades (id, token_id, wallet_id, side, core_amount, token_amount, price, fee_total, fee_creator, fee_staker, fee_treasury, created_at)
       VALUES (?, ?, ?, 'sell', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
      timestamp
    );

    return { coreOutNet, price, fee, graduatedNow };
  })();

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
