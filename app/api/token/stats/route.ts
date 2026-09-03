import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ZEBRA_TOTAL_SUPPLY } from "@/lib/constants";

export async function GET() {
  const db = getDb();

  const pool = db
    .prepare("SELECT total_staked, lifetime_core_distributed FROM reward_pool WHERE id = 1")
    .get() as { total_staked: number; lifetime_core_distributed: number };

  const stakerCount = (
    db.prepare("SELECT COUNT(*) as c FROM stake_positions WHERE staked > 0").get() as { c: number }
  ).c;

  const volumeAgg = db
    .prepare("SELECT COALESCE(SUM(core_amount), 0) as v, COUNT(*) as c FROM trades")
    .get() as { v: number; c: number };

  return NextResponse.json({
    totalSupply: ZEBRA_TOTAL_SUPPLY,
    totalStaked: pool.total_staked,
    pctStaked: ZEBRA_TOTAL_SUPPLY > 0 ? pool.total_staked / ZEBRA_TOTAL_SUPPLY : 0,
    lifetimeDistributed: pool.lifetime_core_distributed,
    stakerCount,
    totalVolume: volumeAgg.v,
    totalTrades: volumeAgg.c,
  });
}
