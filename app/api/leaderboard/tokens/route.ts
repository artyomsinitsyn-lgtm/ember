import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { serializeToken } from "@/lib/serialize";
import { assessRugRisk } from "@/lib/rugDetection";
import { computeChallengeScore } from "@/lib/challengeScore";
import type { TokenRow } from "@/lib/trading";

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT tokens.*, wallets.name as creator_name
       FROM tokens JOIN wallets ON wallets.id = tokens.creator_id`
    )
    .all() as (TokenRow & { creator_name: string })[];

  const ranked = rows
    .map((r) => {
      const rug = assessRugRisk(db, r.id);
      const challenge = computeChallengeScore(db, r.id, r.created_at);
      return { token: serializeToken(r, r.creator_name, rug.riskLevel), challenge };
    })
    .sort((a, b) => b.challenge.score - a.challenge.score);

  return NextResponse.json({ tokens: ranked });
}
