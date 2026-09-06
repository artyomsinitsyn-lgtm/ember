import { NextResponse } from "next/server";
import { getDb, dbGet, dbRun } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const walletId = await getSessionWalletId();

  const post = await dbGet(db, "SELECT id FROM feed_posts WHERE id = $1", [id]);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const existing = await dbGet(db, "SELECT 1 FROM post_likes WHERE post_id = $1 AND wallet_id = $2", [id, walletId]);
  if (existing) {
    await dbRun(db, "DELETE FROM post_likes WHERE post_id = $1 AND wallet_id = $2", [id, walletId]);
  } else {
    await dbRun(db, "INSERT INTO post_likes (post_id, wallet_id, created_at) VALUES ($1, $2, $3)", [
      id,
      walletId,
      Date.now(),
    ]);
  }

  const count = (await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM post_likes WHERE post_id = $1", [id]))!.c;
  return NextResponse.json({ liked: !existing, count });
}
