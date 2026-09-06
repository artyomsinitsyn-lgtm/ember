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
  const resolved = !!body.resolved;

  const db = await getDb();
  const existing = await dbGet(db, "SELECT id FROM feedback WHERE id = $1", [id]);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await dbRun(db, "UPDATE feedback SET resolved_at = $1 WHERE id = $2", [resolved ? Date.now() : null, id]);

  return NextResponse.json({ ok: true });
}
