import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet, dbRun } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const action = body.action === "accept" ? "accepted" : body.action === "decline" ? "declined" : null;
  if (!action) return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 });

  const db = await getDb();
  const existing = await dbGet<{ id: string; recipient_id: string; status: string }>(
    db,
    "SELECT id, recipient_id, status FROM connections WHERE id = $1",
    [id]
  );
  if (!existing) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const sessionWalletId = await getSessionWalletId();
  if (existing.recipient_id !== sessionWalletId) {
    return NextResponse.json({ error: "Only the recipient can respond to this request" }, { status: 403 });
  }
  if (existing.status !== "pending") {
    return NextResponse.json({ error: `Already ${existing.status}` }, { status: 409 });
  }

  await dbRun(db, "UPDATE connections SET status = $1, responded_at = $2 WHERE id = $3", [action, Date.now(), id]);
  return NextResponse.json({ ok: true });
}
