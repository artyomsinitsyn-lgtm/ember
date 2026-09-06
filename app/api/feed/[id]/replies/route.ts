import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet, dbAll, dbRun } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";
import { checkReplyRateLimit } from "@/lib/rateLimit";
import { computeWalletProfile } from "@/lib/profile";

const MAX_BODY_LEN = 240;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();

  const rows = await dbAll<{
    id: string;
    wallet_id: string;
    body: string;
    created_at: number;
    wallet_name: string;
    wallet_avatar: string;
  }>(
    db,
    `SELECT post_replies.*, wallets.name as wallet_name, wallets.avatar as wallet_avatar
     FROM post_replies JOIN wallets ON wallets.id = post_replies.wallet_id
     WHERE post_replies.post_id = $1
     ORDER BY post_replies.created_at ASC`,
    [id]
  );

  const replies = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      walletId: r.wallet_id,
      walletName: r.wallet_name,
      walletAvatar: r.wallet_avatar,
      verified: (await computeWalletProfile(db, r.wallet_id))?.verified ?? false,
      body: r.body,
      createdAt: r.created_at,
    }))
  );

  return NextResponse.json({ replies });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const walletId = await getSessionWalletId();

  const post = await dbGet(db, "SELECT id FROM feed_posts WHERE id = $1", [id]);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const body = await req.json();
  const text = String(body.body || "").trim().slice(0, MAX_BODY_LEN);
  if (!text) return NextResponse.json({ error: "Write something first" }, { status: 400 });

  const profile = await computeWalletProfile(db, walletId);
  if (!profile) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  if (!profile.canPost) {
    return NextResponse.json(
      { error: "Link a Twitter handle, phone number, or email before you can reply" },
      { status: 403 }
    );
  }

  const rateLimit = await checkReplyRateLimit(db, walletId);
  if (!rateLimit.ok) return NextResponse.json({ error: rateLimit.error }, { status: 429 });

  const replyId = `reply_${crypto.randomUUID().slice(0, 10)}`;
  const now = Date.now();
  await dbRun(db, "INSERT INTO post_replies (id, post_id, wallet_id, body, created_at) VALUES ($1, $2, $3, $4, $5)", [
    replyId,
    id,
    walletId,
    text,
    now,
  ]);

  return NextResponse.json(
    {
      reply: {
        id: replyId,
        walletId,
        walletName: profile.name,
        walletAvatar: profile.avatar,
        verified: profile.verified,
        body: text,
        createdAt: now,
      },
    },
    { status: 201 }
  );
}
