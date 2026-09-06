import { NextResponse } from "next/server";
import { getDb, dbAll } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();

  const trades = await dbAll(
    db,
    `SELECT trades.id, trades.token_id, trades.side, trades.core_amount, trades.token_amount,
            trades.price, trades.created_at, tokens.ticker, tokens.image
     FROM trades JOIN tokens ON tokens.id = trades.token_id
     WHERE trades.wallet_id = $1
     ORDER BY trades.created_at DESC
     LIMIT 50`,
    [id]
  );

  return NextResponse.json({ trades });
}
