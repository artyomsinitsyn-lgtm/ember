import { NextRequest, NextResponse } from "next/server";
import { touchPresence } from "@/lib/presence";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clientId = String(body.clientId || "").slice(0, 64);
  touchPresence(clientId);
  return NextResponse.json({ ok: true });
}
