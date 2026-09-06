import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet, dbAll, dbRun } from "@/lib/db";
import { computeWalletProfile } from "@/lib/profile";
import { checkOutboundRateLimit } from "@/lib/connections";
import { getSessionWalletId } from "@/lib/auth";

interface ConnectionRow {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: string;
  created_at: number;
  responded_at: number | null;
}

export async function GET(req: NextRequest) {
  const walletId = req.nextUrl.searchParams.get("walletId");
  if (!walletId) return NextResponse.json({ error: "walletId is required" }, { status: 400 });

  // The "people you may know" feature (see app/(app)/connect/page.tsx) reads other wallets'
  // `accepted` lists to compute mutual connections, so this route stays open cross-wallet —
  // but pending incoming/outgoing requests, and the externalContact within `accepted`, are
  // private to the two parties involved and only ever returned to the wallet itself.
  const sessionWalletId = await getSessionWalletId();
  const isOwner = sessionWalletId === walletId;

  const db = await getDb();
  const rows = await dbAll<ConnectionRow>(
    db,
    `SELECT * FROM connections WHERE requester_id = $1 OR recipient_id = $1 ORDER BY created_at DESC`,
    [walletId]
  );

  const incoming = isOwner
    ? await Promise.all(
        rows
          .filter((r) => r.recipient_id === walletId && r.status === "pending")
          .map(async (r) => ({ id: r.id, wallet: await computeWalletProfile(db, r.requester_id), createdAt: r.created_at }))
      )
    : [];

  const outgoing = isOwner
    ? await Promise.all(
        rows
          .filter((r) => r.requester_id === walletId && r.status === "pending")
          .map(async (r) => ({ id: r.id, wallet: await computeWalletProfile(db, r.recipient_id), createdAt: r.created_at }))
      )
    : [];

  const accepted = await Promise.all(
    rows
      .filter((r) => r.status === "accepted")
      .map(async (r) => {
        const otherId = r.requester_id === walletId ? r.recipient_id : r.requester_id;
        const otherWallet = isOwner
          ? await dbGet<{ external_contact: string | null }>(db, "SELECT external_contact FROM wallets WHERE id = $1", [
              otherId,
            ])
          : undefined;
        return {
          id: r.id,
          wallet: await computeWalletProfile(db, otherId),
          externalContact: otherWallet?.external_contact ?? null,
          respondedAt: r.responded_at,
        };
      })
  );

  return NextResponse.json({ incoming, outgoing, accepted });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const requesterId = await getSessionWalletId();
  const recipientId = String(body.recipientId || "");
  if (!recipientId || requesterId === recipientId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const db = await getDb();
  const recipient = await dbGet<{ id: string; verified_only_messages: number }>(
    db,
    "SELECT id, verified_only_messages FROM wallets WHERE id = $1",
    [recipientId]
  );
  if (!recipient) return NextResponse.json({ error: "Recipient not found" }, { status: 404 });

  const requesterProfile = await computeWalletProfile(db, requesterId);

  if (recipient.verified_only_messages && !requesterProfile?.verified) {
    return NextResponse.json(
      { error: "This person only accepts requests from verified wallets." },
      { status: 403 }
    );
  }

  const rateLimit = await checkOutboundRateLimit(db, requesterId, !!requesterProfile?.verified);
  if (!rateLimit.ok) {
    return NextResponse.json({ error: rateLimit.error }, { status: 429 });
  }

  const existing = await dbGet<{ id: string; status: string }>(
    db,
    `SELECT id, status FROM connections
     WHERE (requester_id = $1 AND recipient_id = $2) OR (requester_id = $2 AND recipient_id = $1)`,
    [requesterId, recipientId]
  );
  if (existing) {
    return NextResponse.json({ error: `A connection already exists (${existing.status}).` }, { status: 409 });
  }

  const id = `conn_${crypto.randomUUID().slice(0, 8)}`;
  await dbRun(
    db,
    `INSERT INTO connections (id, requester_id, recipient_id, status, created_at) VALUES ($1, $2, $3, 'pending', $4)`,
    [id, requesterId, recipientId, Date.now()]
  );

  return NextResponse.json({ ok: true, id }, { status: 201 });
}
