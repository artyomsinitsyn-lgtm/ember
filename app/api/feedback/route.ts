import { NextRequest, NextResponse } from "next/server";
import { getDb, dbAll, dbRun } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";
import { isAppAdmin } from "@/lib/admin";
import { checkFeedbackRateLimit } from "@/lib/rateLimit";

type Kind = "feature" | "complaint" | "other";
const KINDS: Kind[] = ["feature", "complaint", "other"];

/** Admin-only inbox listing — see app/(app)/admin/feedback. */
export async function GET() {
  const walletId = await getSessionWalletId();
  if (!(await isAppAdmin(walletId))) {
    return NextResponse.json({ error: "Not the treasury admin" }, { status: 403 });
  }

  const db = await getDb();
  const rows = await dbAll<{
    id: string;
    wallet_id: string;
    kind: string;
    message: string;
    resolved_at: number | null;
    created_at: number;
    wallet_name: string;
  }>(
    db,
    `SELECT feedback.id, feedback.wallet_id, feedback.kind, feedback.message,
            feedback.resolved_at, feedback.created_at, wallets.name as wallet_name
     FROM feedback JOIN wallets ON wallets.id = feedback.wallet_id
     ORDER BY (feedback.resolved_at IS NOT NULL) ASC, feedback.created_at DESC`
  );

  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      walletId: r.wallet_id,
      kind: r.kind,
      message: r.message,
      resolvedAt: r.resolved_at,
      createdAt: r.created_at,
      walletName: r.wallet_name,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const kind = String(body.kind || "") as Kind;
  const message = String(body.message || "").trim().slice(0, 2000);

  if (!KINDS.includes(kind)) {
    return NextResponse.json({ error: "Invalid feedback type" }, { status: 400 });
  }
  if (message.length < 3) {
    return NextResponse.json({ error: "Say a little more than that." }, { status: 400 });
  }

  const db = await getDb();
  const walletId = await getSessionWalletId();

  const rateLimit = await checkFeedbackRateLimit(db, walletId);
  if (!rateLimit.ok) return NextResponse.json({ error: rateLimit.error }, { status: 429 });

  const id = `feedback_${crypto.randomUUID().slice(0, 10)}`;
  await dbRun(db, `INSERT INTO feedback (id, wallet_id, kind, message, created_at) VALUES ($1, $2, $3, $4, $5)`, [
    id,
    walletId,
    kind,
    message,
    Date.now(),
  ]);

  return NextResponse.json({ ok: true }, { status: 201 });
}
