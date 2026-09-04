import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";
import { isAppAdmin } from "@/lib/admin";
import { decryptPII } from "@/lib/pii";

/** `wallets.contact` is stored encrypted (see lib/pii.ts). Rows written before encryption
 * was introduced, if any, aren't valid ciphertext — decrypt defensively rather than 500 the
 * whole admin screen over one bad row. */
function safeDecryptContact(contact: string | null): string | null {
  if (!contact) return contact;
  try {
    return decryptPII(contact);
  } catch {
    console.warn("[admin/verifications] failed to decrypt a contact value — returning as-is");
    return contact;
  }
}

export async function GET() {
  const walletId = await getSessionWalletId();
  if (!(await isAppAdmin(walletId))) {
    return NextResponse.json({ error: "Not the treasury admin" }, { status: 403 });
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT verification_requests.id, verification_requests.wallet_id, verification_requests.status,
              verification_requests.created_at, verification_requests.decided_at,
              wallets.name as wallet_name, wallets.avatar as wallet_avatar,
              wallets.contact, wallets.contact_type, wallets.twitter_handle
       FROM verification_requests JOIN wallets ON wallets.id = verification_requests.wallet_id
       ORDER BY (verification_requests.status = 'pending') DESC, verification_requests.created_at DESC`
    )
    .all() as {
    id: string;
    wallet_id: string;
    status: string;
    created_at: number;
    decided_at: number | null;
    wallet_name: string;
    wallet_avatar: string;
    contact: string | null;
    contact_type: string | null;
    twitter_handle: string | null;
  }[];

  return NextResponse.json({
    requests: rows.map((r) => ({
      id: r.id,
      walletId: r.wallet_id,
      status: r.status,
      createdAt: r.created_at,
      decidedAt: r.decided_at,
      walletName: r.wallet_name,
      walletAvatar: r.wallet_avatar,
      contact: safeDecryptContact(r.contact),
      contactType: r.contact_type,
      twitterHandle: r.twitter_handle,
    })),
  });
}
