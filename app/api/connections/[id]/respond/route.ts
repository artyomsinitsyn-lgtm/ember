import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const action = body.action === "accept" ? "accepted" : body.action === "decline" ? "declined" : null;
  if (!action) return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 });

  const db = getDb();
  const existing = db.prepare("SELECT id, recipient_id, status FROM connections WHERE id = ?").get(id) as
    | { id: string; recipient_id: string; status: string }
    | undefined;
  if (!existing) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const sessionWalletId = await getSessionWalletId();
  if (existing.recipient_id !== sessionWalletId) {
    return NextResponse.json({ error: "Only the recipient can respond to this request" }, { status: 403 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ error: `Already ${existing.status}` }, { status: 409 });
  }

  db.prepare("UPDATE connections SET status = ?, responded_at = ? WHERE id = ?").run(action, Date.now(), id);
  return NextResponse.json({ ok: true });
}
