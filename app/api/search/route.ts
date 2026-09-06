import { NextRequest, NextResponse } from "next/server";
import { getDb, dbAll } from "@/lib/db";
import { serializeToken } from "@/lib/serialize";
import { assessRugRisk } from "@/lib/rugDetection";
import type { TokenRow } from "@/lib/trading";

const RESULT_LIMIT = 6;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ tokens: [], wallets: [] });

  const db = await getDb();
  const like = `%${q}%`;

  // ILIKE, not LIKE: SQLite's LIKE is case-insensitive for ASCII by default, Postgres's isn't —
  // ILIKE is what keeps this search matching the same way it always has.
  const tokenRows = await dbAll<TokenRow & { creator_name: string }>(
    db,
    `SELECT tokens.*, wallets.name as creator_name
     FROM tokens JOIN wallets ON wallets.id = tokens.creator_id
     WHERE tokens.name ILIKE $1 OR tokens.ticker ILIKE $1
     ORDER BY tokens.created_at DESC LIMIT $2`,
    [like, RESULT_LIMIT]
  );
  const tokens = await Promise.all(
    tokenRows.map(async (r) => serializeToken(r, r.creator_name, (await assessRugRisk(db, r.id)).riskLevel))
  );

  const wallets = await dbAll<{ id: string; name: string; avatar: string }>(
    db,
    `SELECT id, name, avatar FROM wallets WHERE name ILIKE $1 ORDER BY name LIMIT $2`,
    [like, RESULT_LIMIT]
  );

  return NextResponse.json({ tokens, wallets });
}
