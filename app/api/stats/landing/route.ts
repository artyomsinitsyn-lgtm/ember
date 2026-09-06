import { NextResponse } from "next/server";
import { getDb, dbGet, dbAll } from "@/lib/db";

export async function GET() {
  const db = await getDb();

  const tokensForged = (await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM tokens"))!.c;

  const volumeAgg = (await dbGet<{ v: number }>(db, "SELECT COALESCE(SUM(core_amount), 0) as v FROM trades"))!;

  // Median, not mean — a couple of instantly-forced graduations in a small seed shouldn't
  // drag the headline number around the way an average would.
  const bondDurations = (
    await dbAll<{ d: number }>(
      db,
      "SELECT graduated_at - created_at as d FROM tokens WHERE graduated = 1 AND graduated_at IS NOT NULL"
    )
  )
    .map((r) => r.d)
    .sort((a, b) => a - b);

  let medianBondSeconds: number | null = null;
  if (bondDurations.length > 0) {
    const mid = Math.floor(bondDurations.length / 2);
    const medianMs =
      bondDurations.length % 2 === 0 ? (bondDurations[mid - 1] + bondDurations[mid]) / 2 : bondDurations[mid];
    medianBondSeconds = medianMs / 1000;
  }

  return NextResponse.json({
    tokensForged,
    lifetimeVolume: volumeAgg.v,
    medianBondSeconds,
  });
}
