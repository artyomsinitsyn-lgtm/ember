import { NextRequest, NextResponse } from "next/server";
import { executeBuy, executeSell } from "@/lib/trading";
import { getSessionWalletId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { checkTradeRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const walletId = await getSessionWalletId();
  const side = body.side as "buy" | "sell";
  const amount = Number(body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const rateLimit = checkTradeRateLimit(getDb(), walletId);
  if (!rateLimit.ok) return NextResponse.json({ error: rateLimit.error }, { status: 429 });

  try {
    const result = side === "buy" ? executeBuy(id, walletId, amount) : executeSell(id, walletId, amount);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trade failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
