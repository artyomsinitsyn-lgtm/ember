import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb, dbGet, dbRun } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";
import { getConnection, curvePda, PROGRAM_ID, TOKEN_UNIT, LAMPORTS_PER_SOL } from "@/lib/onchain/program";
import { fetchCurveState } from "@/lib/onchain/curve";
import { currentPrice } from "@/lib/bondingCurve";
import { distributeToStakers } from "@/lib/rewards";
import { emitTrade } from "@/lib/events";
import type { TokenRow } from "@/lib/trading";

/**
 * The buy/sell instructions already moved real SOL and real tokens on-chain by the time this
 * runs — this endpoint's job is purely to independently verify that really happened (never
 * trust a client-submitted amount for a real-money action) and mirror the authoritative
 * result into the database so the existing chart/feed/leaderboard reads keep working unchanged.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const signature = String(body.signature || "");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const walletId = await getSessionWalletId();
  let mint: PublicKey;
  try {
    mint = new PublicKey(id);
  } catch {
    return NextResponse.json({ error: "Not an on-chain token" }, { status: 400 });
  }
  let buyer: PublicKey;
  try {
    buyer = new PublicKey(walletId);
  } catch {
    return NextResponse.json({ error: "Connect a real wallet first" }, { status: 401 });
  }

  const connection = await getConnection();
  const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx || tx.meta?.err) {
    return NextResponse.json({ error: "Transaction not found or failed on-chain" }, { status: 400 });
  }

  const accountKeys = tx.transaction.message.getAccountKeys();
  const programIncluded = accountKeys.staticAccountKeys.some((k) => k.equals(PROGRAM_ID));
  const curve = curvePda(mint);
  const curveIncluded = accountKeys.staticAccountKeys.some((k) => k.equals(curve));
  const buyerIdx = accountKeys.staticAccountKeys.findIndex((k) => k.equals(buyer));
  // Matching by "this pubkey appears somewhere in the tx" isn't enough — the session wallet
  // could show up as a non-signer role instead (e.g. `creator`, since it's an UncheckedAccount
  // that never has to sign) on someone else's trade. `buyer` is the only Signer<'info> account
  // in Trade, so requiring isAccountSigner pins this to the account that actually authorized
  // the on-chain trade, not just one that happens to appear in its account list.
  const buyerSigned = buyerIdx !== -1 && tx.transaction.message.isAccountSigner(buyerIdx);
  if (!programIncluded || !curveIncluded || !buyerSigned) {
    return NextResponse.json({ error: "Signature doesn't match a trade on this token by this wallet" }, { status: 400 });
  }

  const db = await getDb();
  const token = await dbGet<TokenRow>(db, "SELECT * FROM tokens WHERE id = $1", [id]);
  if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  // Already recorded — trade endpoints can get called twice (e.g. a retried request), and
  // this keeps that idempotent instead of double-counting the trade.
  if (await dbGet(db, "SELECT 1 FROM trades WHERE id = $1", [signature])) {
    return NextResponse.json({ ok: true, alreadyRecorded: true });
  }

  const preSol = tx.meta!.preBalances[buyerIdx];
  const postSol = tx.meta!.postBalances[buyerIdx];
  const fee = tx.meta!.fee;

  const preToken = tx.meta!.preTokenBalances?.find((b) => b.owner === buyer.toBase58() && b.mint === mint.toBase58());
  const postToken = tx.meta!.postTokenBalances?.find((b) => b.owner === buyer.toBase58() && b.mint === mint.toBase58());
  const preTokenRaw = BigInt(preToken?.uiTokenAmount.amount ?? "0");
  const postTokenRaw = BigInt(postToken?.uiTokenAmount.amount ?? "0");
  const tokenDeltaRaw = postTokenRaw - preTokenRaw;
  if (tokenDeltaRaw === BigInt(0)) {
    return NextResponse.json({ error: "Transaction moved no tokens" }, { status: 400 });
  }
  const side: "buy" | "sell" = tokenDeltaRaw > BigInt(0) ? "buy" : "sell";
  const tokenAmount = Number(tokenDeltaRaw < BigInt(0) ? -tokenDeltaRaw : tokenDeltaRaw) / TOKEN_UNIT;

  // preBalance - postBalance - fee: exactly what the buyer's own wallet paid into the curve,
  // since every fee cut is paid directly out of the buyer's account in the same transaction
  // (buy) — or the mirror image for a sell, where the vault pays the buyer net of nothing
  // extra, so the network fee is added back rather than subtracted.
  const solAmount =
    side === "buy" ? (preSol - postSol - fee) / LAMPORTS_PER_SOL : (postSol - preSol + fee) / LAMPORTS_PER_SOL;

  const onchainCurve = await fetchCurveState(connection, mint);
  if (!onchainCurve) return NextResponse.json({ error: "Curve not found on-chain" }, { status: 400 });

  const price = currentPrice(
    onchainCurve.graduated ? onchainCurve.realCore : onchainCurve.virtualCore,
    onchainCurve.graduated ? onchainCurve.realToken : onchainCurve.virtualToken
  );

  const now = Date.now();
  const wasGraduated = !!token.graduated;
  await dbRun(
    db,
    `UPDATE tokens SET v_core = $1, v_token = $2, real_core = $3, real_token = $4, graduated = $5, graduated_at = COALESCE(graduated_at, $6)
     WHERE id = $7`,
    [
      onchainCurve.virtualCore,
      onchainCurve.virtualToken,
      onchainCurve.realCore,
      onchainCurve.realToken,
      onchainCurve.graduated ? 1 : 0,
      onchainCurve.graduated && !wasGraduated ? now : null,
      id,
    ]
  );

  // holdings/wallet rows still back the leaderboard, portfolio, and rug-detection reads —
  // resync straight from the chain (the buyer's real token account) rather than trusting a
  // locally-computed delta, so this self-heals if it's ever out of sync.
  const holderTokenAccountBalance = await connection.getTokenAccountBalance(
    (await connection.getParsedTokenAccountsByOwner(buyer, { mint })).value[0]?.pubkey
  ).catch(() => null);
  const newHoldingAmount = holderTokenAccountBalance
    ? Number(holderTokenAccountBalance.value.amount) / TOKEN_UNIT
    : Number(postTokenRaw) / TOKEN_UNIT;

  await dbRun(
    db,
    `INSERT INTO holdings (wallet_id, token_id, amount) VALUES ($1, $2, $3)
     ON CONFLICT (wallet_id, token_id) DO UPDATE SET amount = EXCLUDED.amount`,
    [walletId, id, newHoldingAmount]
  );

  const feeTotal = solAmount * 0.01;
  const feeCreator = feeTotal * 0.4;
  const feeStaker = feeTotal * 0.4;
  const feeTreasury = feeTotal * 0.2;

  await dbRun(
    db,
    `INSERT INTO trades (id, token_id, wallet_id, side, core_amount, token_amount, price, fee_total, fee_creator, fee_staker, fee_treasury, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [signature, id, walletId, side, solAmount, tokenAmount, price, feeTotal, feeCreator, feeStaker, feeTreasury, now]
  );

  // Off-chain wallet/treasury/reward-pool bookkeeping still tracked for the leaderboard and
  // /stake page — the real lamports already moved on-chain; this just mirrors those same
  // amounts into the DB ledger those pages read from.
  if (feeCreator > 0) {
    await dbRun(db, "UPDATE wallets SET core_balance = core_balance + $1 WHERE id = $2", [feeCreator, token.creator_id]);
  }
  await distributeToStakers(db, feeStaker);
  await dbRun(db, "UPDATE treasury SET core_balance = core_balance + $1 WHERE id = 1", [feeTreasury]);

  emitTrade({
    tokenId: id,
    walletId,
    side,
    price,
    tokenAmount,
    coreAmount: solAmount,
    graduated: onchainCurve.graduated,
    createdAt: now,
  });

  return NextResponse.json({ ok: true, side, tokenAmount, solAmount, graduated: onchainCurve.graduated });
}
