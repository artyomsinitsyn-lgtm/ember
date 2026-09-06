import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet, dbRun, type DB } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";
import { checkReportRateLimit } from "@/lib/rateLimit";

type TargetType = "token" | "wallet" | "post";
const TARGET_TYPES: TargetType[] = ["token", "wallet", "post"];

const REASONS = ["scam_or_rug", "impersonation", "offensive_content", "spam", "other"] as const;

const TARGET_TABLE: Record<TargetType, { table: string; column: string }> = {
  token: { table: "tokens", column: "id" },
  wallet: { table: "wallets", column: "id" },
  post: { table: "feed_posts", column: "id" },
};

async function targetExists(db: DB, targetType: TargetType, targetId: string): Promise<boolean> {
  const { table, column } = TARGET_TABLE[targetType];
  return !!(await dbGet(db, `SELECT 1 FROM ${table} WHERE ${column} = $1`, [targetId]));
}

export async function GET(req: NextRequest) {
  const targetType = req.nextUrl.searchParams.get("targetType") as TargetType | null;
  const targetId = req.nextUrl.searchParams.get("targetId");
  if (!targetType || !TARGET_TYPES.includes(targetType) || !targetId) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  const db = await getDb();
  const walletId = await getSessionWalletId();

  const count = (
    await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM reports WHERE target_type = $1 AND target_id = $2", [
      targetType,
      targetId,
    ])
  )!.c;
  const reportedByMe = !!(await dbGet(
    db,
    "SELECT 1 FROM reports WHERE target_type = $1 AND target_id = $2 AND reporter_id = $3",
    [targetType, targetId, walletId]
  ));

  return NextResponse.json({ count, reportedByMe });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const targetType = String(body.targetType || "") as TargetType;
  const targetId = String(body.targetId || "");
  const reason = String(body.reason || "");
  const detail = body.detail ? String(body.detail).trim().slice(0, 300) : null;

  if (!TARGET_TYPES.includes(targetType) || !targetId) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }
  if (!REASONS.includes(reason as (typeof REASONS)[number])) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  const db = await getDb();
  const walletId = await getSessionWalletId();

  if (!(await targetExists(db, targetType, targetId))) {
    return NextResponse.json({ error: "Nothing found to report" }, { status: 404 });
  }

  const rateLimit = await checkReportRateLimit(db, walletId);
  if (!rateLimit.ok) return NextResponse.json({ error: rateLimit.error }, { status: 429 });

  const id = `report_${crypto.randomUUID().slice(0, 10)}`;
  const now = Date.now();
  try {
    await dbRun(
      db,
      `INSERT INTO reports (id, target_type, target_id, reporter_id, reason, detail, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, targetType, targetId, walletId, reason, detail, now]
    );
  } catch (err) {
    // Unique index on (target_type, target_id, reporter_id) — this wallet already flagged
    // this target, so treat the resubmit as a no-op instead of surfacing a 500.
    if (!(err && typeof err === "object" && "code" in err && err.code === "23505")) throw err;
  }

  const count = (
    await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM reports WHERE target_type = $1 AND target_id = $2", [
      targetType,
      targetId,
    ])
  )!.c;

  return NextResponse.json({ ok: true, count, reportedByMe: true }, { status: 201 });
}
