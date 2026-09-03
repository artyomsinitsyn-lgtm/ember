import { NextResponse } from "next/server";
import { countOnline } from "@/lib/presence";

export async function GET() {
  return NextResponse.json({ count: countOnline() });
}
