import { NextResponse } from "next/server";
import { getDb, dbAll } from "@/lib/db";

const DAY_MS = 86_400_000;

interface DayRow {
  dayBucket: number;
  stakerFees: number;
  creatorFees: number;
  volume: number;
  trades: number;
}

// treasuryFees is deliberately never selected here — the platform's own revenue shouldn't be
// readable off a public API just because it happens to share a table with staker/creator fees.
export async function GET() {
  const db = await getDb();

  const rows = await dbAll<DayRow>(
    db,
    `SELECT
       CAST(created_at / ${DAY_MS} AS INTEGER) as "dayBucket",
       SUM(fee_staker) as "stakerFees",
       SUM(fee_creator) as "creatorFees",
       SUM(core_amount) as volume,
       COUNT(*) as trades
     FROM trades
     GROUP BY "dayBucket"
     ORDER BY "dayBucket" ASC`
  );

  let cumulative = 0;
  const series = rows.map((r) => {
    cumulative += r.stakerFees;
    return { time: Math.floor((r.dayBucket * DAY_MS) / 1000), value: cumulative };
  });

  const days = rows
    .map((r) => ({
      timestamp: r.dayBucket * DAY_MS,
      trades: r.trades,
      volume: r.volume,
      stakerFees: r.stakerFees,
      creatorFees: r.creatorFees,
    }))
    .reverse();

  return NextResponse.json({ series, days });
}
