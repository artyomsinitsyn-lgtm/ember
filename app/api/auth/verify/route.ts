import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifySignature, setSessionWalletId } from "@/lib/auth";

const STARTER_CORE_BALANCE = 250;
const STARTER_ALLOY_BALANCE = 2000;

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

  const db = getDb();
  const existing = db.prepare("SELECT id FROM wallets WHERE id = ?").get(walletId);
  if (!existing) {
    db.prepare(
      `INSERT INTO wallets (id, name, avatar, is_you, core_balance, embr_balance, created_at)
       VALUES (?, ?, '👛', 0, ?, ?, ?)`
    ).run(walletId, `${walletId.slice(0, 4)}…${walletId.slice(-4)}`, STARTER_CORE_BALANCE, STARTER_ALLOY_BALANCE, Date.now());
  }

  await setSessionWalletId(walletId);
  return NextResponse.json({ ok: true });
}
