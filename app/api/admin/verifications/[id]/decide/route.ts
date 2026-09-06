import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet, dbRun } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";
import { isAppAdmin } from "@/lib/admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const walletId = await getSessionWalletId();
  if (!(await isAppAdmin(walletId))) {
    return NextResponse.json({ error: "Not the treasury admin" }, { status: 403 });
  }

  const body = await req.json();
  const decision = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : null;
  if (!decision) return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });

  const db = await getDb();
  const existing = await dbGet(db, "SELECT id FROM verification_requests WHERE id = $1", [id]);
  if (!existing) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  await dbRun(db, "UPDATE verification_requests SET status = $1, decided_at = $2, decided_by = $3 WHERE id = $4", [
    decision,
    Date.now(),
    walletId,
    id,
  ]);

  return NextResponse.json({ ok: true, status: decision });
}
