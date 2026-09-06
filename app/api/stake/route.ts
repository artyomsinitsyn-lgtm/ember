import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet, withTransaction } from "@/lib/db";
import { stake, unstake } from "@/lib/rewards";
import { getSessionWalletId } from "@/lib/auth";
import { getConnection, stakerPoolPda } from "@/lib/onchain/program";

// The treasury's own balance is deliberately never returned here — it's the platform's
// revenue, not something to leave sitting in a public API response for a competitor to read.
// The staker pool is the opposite case: it's stakers' own money, so its real on-chain total is
// exactly what they should be able to verify. onchainStakerPoolLamports is that real, aggregate
// balance — never a per-wallet share, since no on-chain staking/claim accounting exists yet.
export async function GET() {
  const db = await getDb();
  const pool = await dbGet(
    db,
    "SELECT total_staked, acc_core_per_embr, lifetime_core_distributed FROM reward_pool WHERE id = 1"
  );
  const connection = await getConnection();
  const onchainStakerPoolLamports = await connection.getBalance(stakerPoolPda()).catch(() => null);
  return NextResponse.json({ pool, onchainStakerPoolLamports });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const walletId = await getSessionWalletId();
  const action = body.action as "stake" | "unstake";
  const amount = Number(body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  try {
    await withTransaction(async (client) => {
      if (action === "stake") await stake(client, walletId, amount);
      else await unstake(client, walletId, amount);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Staking action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
