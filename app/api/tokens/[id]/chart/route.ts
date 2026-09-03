import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentPrice } from "@/lib/bondingCurve";
import { INITIAL_VIRTUAL_CORE_RESERVES, INITIAL_VIRTUAL_TOKEN_RESERVES } from "@/lib/constants";
import type { TokenRow } from "@/lib/trading";

// Every platform worth copying (Binance, pump.fun's advanced view, TradingView) lets you
// pick the candle width instead of locking you to one — 15s is still the default since
// that's tight enough for a brand-new curve's first bursts of trades to show real wicks.
const INTERVALS: Record<string, number> = {
  "15s": 15_000,
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const token = db.prepare("SELECT * FROM tokens WHERE id = ?").get(id) as TokenRow | undefined;
  if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  const intervalParam = req.nextUrl.searchParams.get("interval") ?? "15s";
  const bucketMs = INTERVALS[intervalParam] ?? INTERVALS["15s"];

  const trades = db
    .prepare("SELECT price, core_amount, created_at FROM trades WHERE token_id = ? ORDER BY created_at ASC")
    .all(id) as { price: number; core_amount: number; created_at: number }[];

  const genesisPrice = currentPrice(INITIAL_VIRTUAL_CORE_RESERVES, INITIAL_VIRTUAL_TOKEN_RESERVES);

  type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
  const buckets = new Map<number, Candle>();

  let lastClose = genesisPrice;
  for (const t of trades) {
    const bucketTime = Math.floor(t.created_at / bucketMs) * bucketMs;
    const time = Math.floor(bucketTime / 1000);
    const existing = buckets.get(time);
    if (existing) {
      existing.high = Math.max(existing.high, t.price);
      existing.low = Math.min(existing.low, t.price);
      existing.close = t.price;
      existing.volume += t.core_amount;
    } else {
      buckets.set(time, {
        time,
        open: lastClose,
        high: Math.max(lastClose, t.price),
        low: Math.min(lastClose, t.price),
        close: t.price,
        volume: t.core_amount,
      });
    }
    lastClose = t.price;
  }

  let candles = Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  if (candles.length === 0) {
    const time = Math.floor(token.created_at / 1000);
    candles = [{ time, open: genesisPrice, high: genesisPrice, low: genesisPrice, close: genesisPrice, volume: 0 }];
  }

  return NextResponse.json({ candles });
}
