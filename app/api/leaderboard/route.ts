import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getLeaderboard, redactBalanceForViewer } from "@/lib/profile";
import { getSessionWalletId } from "@/lib/auth";

export async function GET() {
  const db = getDb();
  const leaderboard = getLeaderboard(db);
  const viewerWalletId = await getSessionWalletId();
  return NextResponse.json({
    leaderboard: leaderboard.map((p) => redactBalanceForViewer(p, viewerWalletId)),
  });
}
