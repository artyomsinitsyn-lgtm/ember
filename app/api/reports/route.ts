import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
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

function targetExists(db: ReturnType<typeof getDb>, targetType: TargetType, targetId: string): boolean {
  const { table, column } = TARGET_TABLE[targetType];
  return !!db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`).get(targetId);
}

export async function GET(req: NextRequest) {
  const targetType = req.nextUrl.searchParams.get("targetType") as TargetType | null;
  const targetId = req.nextUrl.searchParams.get("targetId");
  if (!targetType || !TARGET_TYPES.includes(targetType) || !targetId) {
    return NextResponse.json({ error: "Invalid target" }, { status: 400 });
  }

  const db = getDb();
  const walletId = await getSessionWalletId();

  const count = (
    db
      .prepare("SELECT COUNT(*) as c FROM reports WHERE target_type = ? AND target_id = ?")
      .get(targetType, targetId) as { c: number }
  ).c;
  const reportedByMe = !!db
    .prepare("SELECT 1 FROM reports WHERE target_type = ? AND target_id = ? AND reporter_id = ?")
    .get(targetType, targetId, walletId);

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

  const db = getDb();
  const walletId = await getSessionWalletId();

  if (!targetExists(db, targetType, targetId)) {
    return NextResponse.json({ error: "Nothing found to report" }, { status: 404 });
  }

  const rateLimit = checkReportRateLimit(db, walletId);
  if (!rateLimit.ok) return NextResponse.json({ error: rateLimit.error }, { status: 429 });

  const id = `report_${crypto.randomUUID().slice(0, 10)}`;
  const now = Date.now();
  try {
    db.prepare(
      `INSERT INTO reports (id, target_type, target_id, reporter_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, targetType, targetId, walletId, reason, detail, now);
  } catch (err) {
    // Unique index on (target_type, target_id, reporter_id) — this wallet already flagged
    // this target, so treat the resubmit as a no-op instead of surfacing a 500.
    if (!(err instanceof Error) || !err.message.includes("UNIQUE")) throw err;
  }

  const count = (
    db
      .prepare("SELECT COUNT(*) as c FROM reports WHERE target_type = ? AND target_id = ?")
      .get(targetType, targetId) as { c: number }
  ).c;

  return NextResponse.json({ ok: true, count, reportedByMe: true }, { status: 201 });
}
