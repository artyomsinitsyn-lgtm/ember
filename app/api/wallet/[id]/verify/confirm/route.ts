import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { confirmVerificationCode } from "@/lib/verification";
import { getSessionWalletId } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const existing = db.prepare("SELECT id FROM wallets WHERE id = ?").get(id);
  if (!existing) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const sessionWalletId = await getSessionWalletId();
  if (sessionWalletId !== id) {
    return NextResponse.json({ error: "You can only verify your own wallet" }, { status: 403 });
  }

  const body = await req.json();
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) return NextResponse.json({ error: "Enter the code" }, { status: 400 });

  const result = confirmVerificationCode(id, code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ ok: true });
}
