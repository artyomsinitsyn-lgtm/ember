import { NextResponse } from "next/server";
import { getDb, dbGet } from "@/lib/db";
import { ZEBRA_TOTAL_SUPPLY } from "@/lib/constants";

export async function GET() {
  const db = await getDb();

  const pool = (await dbGet<{ total_staked: number; lifetime_core_distributed: number }>(
    db,
    "SELECT total_staked, lifetime_core_distributed FROM reward_pool WHERE id = 1"
  ))!;

  const stakerCount = (
    await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM stake_positions WHERE staked > 0")
  )!.c;

  const volumeAgg = (await dbGet<{ v: number; c: number }>(
    db,
    "SELECT COALESCE(SUM(core_amount), 0) as v, COUNT(*) as c FROM trades"
  ))!;

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
