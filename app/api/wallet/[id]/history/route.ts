import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";

interface HistoryEntry {
  id: string;
  kind: "trade" | "stake" | "deposit";
  type: string;
  ticker?: string;
  tokenId?: string;
  coreAmount?: number;
  tokenAmount?: number;
  amount?: number;
  createdAt: number;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Trade/stake/deposit history is private financial activity, not the public-safe
  // profile subset — same rule as /api/wallet/[id] itself.
  const sessionWalletId = await getSessionWalletId();
  if (sessionWalletId !== id) {
    return NextResponse.json({ error: "You can only view your own history" }, { status: 403 });
  }

  const db = getDb();

  const trades = db
    .prepare(
      `SELECT trades.*, tokens.ticker FROM trades
       JOIN tokens ON tokens.id = trades.token_id
       WHERE trades.wallet_id = ? ORDER BY trades.created_at DESC LIMIT 200`
    )
    .all(id) as {
    id: string;
    side: string;
    core_amount: number;
    token_amount: number;
    price: number;
    fee_total: number;
    ticker: string;
    token_id: string;
    created_at: number;
  }[];

  const stakeEvents = db
    .prepare("SELECT * FROM stake_events WHERE wallet_id = ? ORDER BY created_at DESC LIMIT 200")
    .all(id) as { id: string; type: string; amount: number; created_at: number }[];

  const deposits = db
    .prepare("SELECT * FROM deposits WHERE wallet_id = ? ORDER BY created_at DESC LIMIT 200")
    .all(id) as { id: string; amount: number; method: string; created_at: number }[];

  const history: HistoryEntry[] = [
    ...trades.map((t) => ({
      id: t.id,
      kind: "trade" as const,
      type: t.side,
      ticker: t.ticker,
      tokenId: t.token_id,
      coreAmount: t.core_amount,
      tokenAmount: t.token_amount,
      createdAt: t.created_at,
    })),
    ...stakeEvents.map((s) => ({
      id: s.id,
      kind: "stake" as const,
      type: s.type,
      amount: s.amount,
      createdAt: s.created_at,
    })),
    ...deposits.map((d) => ({
      id: d.id,
      kind: "deposit" as const,
      type: d.method,
      amount: d.amount,
      createdAt: d.created_at,
    })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  return NextResponse.json({ history });
}
