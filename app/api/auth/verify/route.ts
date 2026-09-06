import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet, dbRun } from "@/lib/db";
import { verifySignature, setSessionWalletId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const walletId = String(body.walletId || "").trim();
  const signature = String(body.signature || "");

  if (!walletId || !signature) {
    return NextResponse.json({ error: "walletId and signature are required" }, { status: 400 });
  }
  if (!verifySignature(walletId, signature)) {
    return NextResponse.json({ error: "Signature didn't verify — request a fresh nonce and try again" }, { status: 401 });
  }

  const db = await getDb();
  const existing = await dbGet(db, "SELECT id FROM wallets WHERE id = $1", [walletId]);
  if (!existing) {
    // No starter balance grant — core_balance/embr_balance only ever reflect real fee
    // income mirrored from on-chain trades (see trade/confirm route), never a fabricated
    // sign-up bonus. A newly connected real wallet starts at zero here; its actual funds
    // live on-chain and are read directly from the wallet's own SOL/token balances.
    await dbRun(
      db,
      `INSERT INTO wallets (id, name, avatar, is_you, core_balance, embr_balance, created_at)
       VALUES ($1, $2, '👛', 0, 0, 0, $3)`,
      [walletId, `${walletId.slice(0, 4)}…${walletId.slice(-4)}`, Date.now()]
    );
  }

  await setSessionWalletId(walletId);
  return NextResponse.json({ ok: true });
}
