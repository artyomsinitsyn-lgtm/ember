import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { computeWalletProfile, redactBalanceForViewer } from "@/lib/profile";
import { getSessionWalletId } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const profile = computeWalletProfile(db, id);
  if (!profile) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  const viewerWalletId = await getSessionWalletId();
  return NextResponse.json({ profile: redactBalanceForViewer(profile, viewerWalletId) });
}
