import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { computeWalletPositions } from "@/lib/positions";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const positions = computeWalletPositions(db, id);
  return NextResponse.json({ positions });
}
