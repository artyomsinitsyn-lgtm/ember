import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();

  const tokensForged = (db.prepare("SELECT COUNT(*) as c FROM tokens").get() as { c: number }).c;

  const volumeAgg = db.prepare("SELECT COALESCE(SUM(core_amount), 0) as v FROM trades").get() as {
    v: number;
  };

  // Median, not mean — a couple of instantly-forced graduations in a small seed shouldn't
  // drag the headline number around the way an average would.
  const bondDurations = (
    db
      .prepare("SELECT graduated_at - created_at as d FROM tokens WHERE graduated = 1 AND graduated_at IS NOT NULL")
      .all() as { d: number }[]
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
