import { NextResponse } from "next/server";
import { getDb, dbAll } from "@/lib/db";
import { serializeToken } from "@/lib/serialize";
import { assessRugRisk } from "@/lib/rugDetection";
import { computeChallengeScore } from "@/lib/challengeScore";
import type { TokenRow } from "@/lib/trading";

export async function GET() {
  const db = await getDb();
  const rows = await dbAll<TokenRow & { creator_name: string }>(
    db,
    `SELECT tokens.*, wallets.name as creator_name
     FROM tokens JOIN wallets ON wallets.id = tokens.creator_id`
  );

  const ranked = (
    await Promise.all(
      rows.map(async (r) => {
        const rug = await assessRugRisk(db, r.id);
        const challenge = await computeChallengeScore(db, r.id, r.created_at);
        return { token: serializeToken(r, r.creator_name, rug.riskLevel), challenge };
      })
    )
  ).sort((a, b) => b.challenge.score - a.challenge.score);

  return NextResponse.json({ tokens: ranked });
}
