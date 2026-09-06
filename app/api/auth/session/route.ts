import { NextResponse } from "next/server";
import { peekSessionWalletId } from "@/lib/auth";

/** Lets the client check which wallet (if any) the session cookie is already bound to,
 * without triggering a new sign-in — see lib/useConnectedWallet.ts. */
export async function GET() {
  const walletId = await peekSessionWalletId();
  return NextResponse.json({ walletId });
}
