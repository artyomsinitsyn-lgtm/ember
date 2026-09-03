import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
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

  const db = getDb();
  const wallet = db.prepare("SELECT id FROM wallets WHERE id = ?").get(walletId);
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  db.transaction(() => {
    db.prepare("UPDATE wallets SET core_balance = core_balance + ? WHERE id = ?").run(amount, walletId);
    db.prepare(
      "INSERT INTO deposits (id, wallet_id, amount, method, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(crypto.randomUUID(), walletId, amount, method, Date.now());
  })();

  return NextResponse.json({ ok: true });
}
