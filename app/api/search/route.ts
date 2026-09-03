import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { serializeToken } from "@/lib/serialize";
import { assessRugRisk } from "@/lib/rugDetection";
import type { TokenRow } from "@/lib/trading";

const RESULT_LIMIT = 6;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ tokens: [], wallets: [] });

  const db = getDb();
  const like = `%${q}%`;

  const tokenRows = db
    .prepare(
      `SELECT tokens.*, wallets.name as creator_name
       FROM tokens JOIN wallets ON wallets.id = tokens.creator_id
       WHERE tokens.name LIKE ? OR tokens.ticker LIKE ?
       ORDER BY tokens.created_at DESC LIMIT ?`
    )
    .all(like, like, RESULT_LIMIT) as (TokenRow & { creator_name: string })[];
  const tokens = tokenRows.map((r) => serializeToken(r, r.creator_name, assessRugRisk(db, r.id).riskLevel));

  const wallets = db
    .prepare(`SELECT id, name, avatar FROM wallets WHERE name LIKE ? ORDER BY name LIMIT ?`)
    .all(like, RESULT_LIMIT) as { id: string; name: string; avatar: string }[];

  return NextResponse.json({ tokens, wallets });
}
