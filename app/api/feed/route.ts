import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet, dbAll, dbRun } from "@/lib/db";
import { computeWalletProfile } from "@/lib/profile";
import { serializeToken } from "@/lib/serialize";
import { getSessionWalletId } from "@/lib/auth";
import { checkPostRateLimit } from "@/lib/rateLimit";
import type { TokenRow } from "@/lib/trading";

const MAX_BODY_LEN = 400;
const FEED_LIMIT = 50;

export async function GET(req: NextRequest) {
  const db = await getDb();
  const viewerId = await getSessionWalletId();
  const tokenId = req.nextUrl.searchParams.get("tokenId");
  const rows = await dbAll<{
    id: string;
    wallet_id: string;
    token_id: string | null;
    body: string;
    image: string | null;
    created_at: number;
    wallet_name: string;
    wallet_avatar: string;
  }>(
    db,
    tokenId
      ? `SELECT feed_posts.*, wallets.name as wallet_name, wallets.avatar as wallet_avatar
         FROM feed_posts JOIN wallets ON wallets.id = feed_posts.wallet_id
         WHERE feed_posts.token_id = $1
         ORDER BY feed_posts.created_at DESC LIMIT $2`
      : `SELECT feed_posts.*, wallets.name as wallet_name, wallets.avatar as wallet_avatar
         FROM feed_posts JOIN wallets ON wallets.id = feed_posts.wallet_id
         ORDER BY feed_posts.created_at DESC LIMIT $1`,
    tokenId ? [tokenId, FEED_LIMIT] : [FEED_LIMIT]
  );

  const posts = await Promise.all(
    rows.map(async (r) => {
      const profile = await computeWalletProfile(db, r.wallet_id);
      let token = null;
      if (r.token_id) {
        const row = await dbGet<TokenRow>(db, "SELECT * FROM tokens WHERE id = $1", [r.token_id]);
        if (row) token = serializeToken(row);
      }
      const likeCount = (await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM post_likes WHERE post_id = $1", [r.id]))!.c;
      const replyCount = (
        await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM post_replies WHERE post_id = $1", [r.id])
      )!.c;
      const likedByMe = !!(await dbGet(db, "SELECT 1 FROM post_likes WHERE post_id = $1 AND wallet_id = $2", [r.id, viewerId]));
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
    })
  );

  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const walletId = await getSessionWalletId();
  const text = String(body.body || "").trim().slice(0, MAX_BODY_LEN);
  const tokenId = body.tokenId ? String(body.tokenId) : null;
  const image = body.image ? String(body.image).slice(0, 300) : null;

  if (!text) return NextResponse.json({ error: "Write something first" }, { status: 400 });

  const db = await getDb();

  const rateLimit = await checkPostRateLimit(db, walletId);
  if (!rateLimit.ok) return NextResponse.json({ error: rateLimit.error }, { status: 429 });

  const profile = await computeWalletProfile(db, walletId);
  if (!profile) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  if (!profile.canPost) {
    return NextResponse.json(
      { error: "Link a Twitter handle, phone number, or email before you can post" },
      { status: 403 }
    );
  }

  if (tokenId) {
    const token = await dbGet(db, "SELECT id FROM tokens WHERE id = $1", [tokenId]);
    if (!token) return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }

  const id = `post_${crypto.randomUUID().slice(0, 10)}`;
  const now = Date.now();
  await dbRun(
    db,
    `INSERT INTO feed_posts (id, wallet_id, token_id, body, image, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, walletId, tokenId, text, image, now]
  );

  return NextResponse.json({ ok: true, id }, { status: 201 });
}
