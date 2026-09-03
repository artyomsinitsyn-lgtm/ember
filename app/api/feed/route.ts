import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { computeWalletProfile } from "@/lib/profile";
import { serializeToken } from "@/lib/serialize";
import { getSessionWalletId } from "@/lib/auth";
import { checkPostRateLimit } from "@/lib/rateLimit";
import type { TokenRow } from "@/lib/trading";

const MAX_BODY_LEN = 400;
const FEED_LIMIT = 50;

export async function GET(req: NextRequest) {
  const db = getDb();
  const viewerId = await getSessionWalletId();
  const tokenId = req.nextUrl.searchParams.get("tokenId");
  const rows = db
    .prepare(
      tokenId
        ? `SELECT feed_posts.*, wallets.name as wallet_name, wallets.avatar as wallet_avatar
           FROM feed_posts JOIN wallets ON wallets.id = feed_posts.wallet_id
           WHERE feed_posts.token_id = ?
           ORDER BY feed_posts.created_at DESC LIMIT ?`
        : `SELECT feed_posts.*, wallets.name as wallet_name, wallets.avatar as wallet_avatar
           FROM feed_posts JOIN wallets ON wallets.id = feed_posts.wallet_id
           ORDER BY feed_posts.created_at DESC LIMIT ?`
    )
    .all(...(tokenId ? [tokenId, FEED_LIMIT] : [FEED_LIMIT])) as {
    id: string;
    wallet_id: string;
    token_id: string | null;
    body: string;
    image: string | null;
    created_at: number;
    wallet_name: string;
    wallet_avatar: string;
  }[];

  const posts = rows.map((r) => {
    const profile = computeWalletProfile(db, r.wallet_id);
    let token = null;
    if (r.token_id) {
      const row = db.prepare("SELECT * FROM tokens WHERE id = ?").get(r.token_id) as TokenRow | undefined;
      if (row) token = serializeToken(row);
    }
    const likeCount = (db.prepare("SELECT COUNT(*) as c FROM post_likes WHERE post_id = ?").get(r.id) as { c: number }).c;
    const replyCount = (
      db.prepare("SELECT COUNT(*) as c FROM post_replies WHERE post_id = ?").get(r.id) as { c: number }
    ).c;
    const likedByMe = !!db.prepare("SELECT 1 FROM post_likes WHERE post_id = ? AND wallet_id = ?").get(r.id, viewerId);
    return {
      id: r.id,
      walletId: r.wallet_id,
      walletName: r.wallet_name,
      walletAvatar: r.wallet_avatar,
      verified: profile?.verified ?? false,
      authorPnl: profile?.realizedPnl ?? 0,
      body: r.body,
      image: r.image,
      token,
      createdAt: r.created_at,
      likeCount,
      replyCount,
      likedByMe,
    };
  });

  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const walletId = await getSessionWalletId();
  const text = String(body.body || "").trim().slice(0, MAX_BODY_LEN);
  const tokenId = body.tokenId ? String(body.tokenId) : null;
  const image = body.image ? String(body.image).slice(0, 300) : null;

  if (!text) return NextResponse.json({ error: "Write something first" }, { status: 400 });

  const db = getDb();

  const rateLimit = checkPostRateLimit(db, walletId);
  if (!rateLimit.ok) return NextResponse.json({ error: rateLimit.error }, { status: 429 });

  const profile = computeWalletProfile(db, walletId);
  if (!profile) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  if (!profile.canPost) {
    return NextResponse.json(
      { error: "Link a Twitter handle, phone number, or email before you can post" },
      { status: 403 }
    );
  }

  if (tokenId) {
    const token = db.prepare("SELECT id FROM tokens WHERE id = ?").get(tokenId);
    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  const id = `post_${crypto.randomUUID().slice(0, 10)}`;
  const now = Date.now();
  db.prepare(
    `INSERT INTO feed_posts (id, wallet_id, token_id, body, image, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, walletId, tokenId, text, image, now);

  return NextResponse.json({ ok: true, id }, { status: 201 });
}
