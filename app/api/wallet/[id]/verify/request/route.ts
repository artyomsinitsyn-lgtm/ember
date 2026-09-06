import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet } from "@/lib/db";
import { requestVerificationCode } from "@/lib/verification";
import { getSessionWalletId } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();

  const existing = await dbGet(db, "SELECT id FROM wallets WHERE id = $1", [id]);
  if (!existing) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const sessionWalletId = await getSessionWalletId();
  if (sessionWalletId !== id) {
    return NextResponse.json({ error: "You can only verify your own wallet" }, { status: 403 });
  }

  const body = await req.json();
  const contact = typeof body.contact === "string" ? body.contact.trim() : "";
  const contactType = body.contactType === "phone" || body.contactType === "email" ? body.contactType : null;

  if (!contact || !contactType) {
    return NextResponse.json({ error: "Enter a phone number or email" }, { status: 400 });
  }

  const { code, sent } = await requestVerificationCode(id, contact.slice(0, 120), contactType);

  // Only echo the code back when no real provider is configured (local dev). Once
  // TWILIO_*/RESEND_API_KEY env vars are set, `sent` is true and the code never touches
  // the response — it only ever reaches the user via the real SMS/email.
  return NextResponse.json({ ok: true, ...(sent ? {} : { simulatedCode: code }) });
}
