import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet, dbRun, withTransaction } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";

// Simulated deposit only — this credits the local demo ledger and never talks to a real
// payment processor. A real fiat on-ramp for a token-launch platform is a money-transmission
// / securities-adjacent undertaking requiring licensing and a real payment partner, not
// something to wire up as a side effect of a feature request.
const MAX_DEPOSIT = 100_000;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const walletId = await getSessionWalletId();
  const amount = Number(body.amount);
  const method = String(body.method || "card").slice(0, 30);

  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_DEPOSIT) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const db = await getDb();
  const wallet = await dbGet(db, "SELECT id FROM wallets WHERE id = $1", [walletId]);
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  await withTransaction(async (client) => {
    await dbRun(client, "UPDATE wallets SET core_balance = core_balance + $1 WHERE id = $2", [amount, walletId]);
    await dbRun(
      client,
      "INSERT INTO deposits (id, wallet_id, amount, method, created_at) VALUES ($1, $2, $3, $4, $5)",
      [crypto.randomUUID(), walletId, amount, method, Date.now()]
    );
  });

  return NextResponse.json({ ok: true });
}
