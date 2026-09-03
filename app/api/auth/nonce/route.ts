import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { issueNonce } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const walletId = String(body.walletId || "").trim();

  try {
    new PublicKey(walletId);
  } catch {
    return NextResponse.json({ error: "Invalid Solana address" }, { status: 400 });
  }

  return NextResponse.json({ nonce: issueNonce(walletId) });
}
