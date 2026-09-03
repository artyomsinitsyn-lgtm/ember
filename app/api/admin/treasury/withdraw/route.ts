import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getConnection, treasuryPda, PROGRAM_ID, LAMPORTS_PER_SOL } from "@/lib/onchain/program";
import { getSessionWalletId } from "@/lib/auth";
import { isAppAdmin } from "@/lib/admin";

/**
 * The withdrawTreasury instruction already moved real SOL out of the treasury vault on-chain
 * by the time this runs (the program's own `has_one = admin` check is what authorized it) —
 * this endpoint's job is purely to mirror that real amount into the DB's `treasury` row so
 * /stake keeps showing a number that matches the chain, the same pattern trade/confirm uses.
 *
 * That on-chain check is what authorizes moving the funds, but this endpoint's own session
 * still needs to be the admin: nothing above stops a non-admin from POSTing an admin's own
 * past signature and writing (possibly spoofed) rows into the withdrawal audit log.
 */
export async function POST(req: NextRequest) {
  const walletId = await getSessionWalletId();
  if (!(await isAppAdmin(walletId))) {
    return NextResponse.json({ error: "Not the treasury admin" }, { status: 403 });
  }

  const body = await req.json();
  const signature = String(body.signature || "");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const db = getDb();
  if (db.prepare("SELECT 1 FROM treasury_withdrawals WHERE signature = ?").get(signature)) {
    return NextResponse.json({ ok: true, alreadyRecorded: true });
  }

  const connection = getConnection();
  const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx || tx.meta?.err) {
    return NextResponse.json({ error: "Transaction not found or failed on-chain" }, { status: 400 });
  }

  const accountKeys = tx.transaction.message.getAccountKeys();
  const programIncluded = accountKeys.staticAccountKeys.some((k) => k.equals(PROGRAM_ID));
  const vault = treasuryPda();
  const vaultIdx = accountKeys.staticAccountKeys.findIndex((k) => k.equals(vault));
  if (!programIncluded || vaultIdx === -1) {
    return NextResponse.json({ error: "Signature doesn't match a treasury withdrawal" }, { status: 400 });
  }

  const deltaLamports = tx.meta!.preBalances[vaultIdx] - tx.meta!.postBalances[vaultIdx];
  if (deltaLamports <= 0) {
    return NextResponse.json({ error: "Vault balance didn't decrease" }, { status: 400 });
  }
  const amount = deltaLamports / LAMPORTS_PER_SOL;

  // The audit log's destination is read off the transaction itself — whichever account's
  // balance rose by exactly what the vault gave up — never from the client-supplied `to`
  // body field, which would let the recorded destination be spoofed independent of where
  // the SOL actually went.
  const destIdx = accountKeys.staticAccountKeys.findIndex(
    (_, i) => i !== vaultIdx && tx.meta!.postBalances[i] - tx.meta!.preBalances[i] === deltaLamports
  );
  if (destIdx === -1) {
    return NextResponse.json({ error: "Couldn't verify withdrawal destination on-chain" }, { status: 400 });
  }
  const toWallet = accountKeys.staticAccountKeys[destIdx].toBase58();

  const now = Date.now();
  db.prepare("INSERT INTO treasury_withdrawals (signature, to_wallet, amount, created_at) VALUES (?, ?, ?, ?)").run(
    signature,
    toWallet,
    amount,
    now
  );
  db.prepare("UPDATE treasury SET core_balance = MAX(0, core_balance - ?) WHERE id = 1").run(amount);

  return NextResponse.json({ ok: true, amount, to: toWallet });
}
