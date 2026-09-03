import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const walletId = await getSessionWalletId();

  const post = db.prepare("SELECT id FROM feed_posts WHERE id = ?").get(id);
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const existing = db.prepare("SELECT 1 FROM post_likes WHERE post_id = ? AND wallet_id = ?").get(id, walletId);
  if (existing) {
    db.prepare("DELETE FROM post_likes WHERE post_id = ? AND wallet_id = ?").run(id, walletId);
  } else {
    db.prepare("INSERT INTO post_likes (post_id, wallet_id, created_at) VALUES (?, ?, ?)").run(id, walletId, Date.now());
  }

  const count = (db.prepare("SELECT COUNT(*) as c FROM post_likes WHERE post_id = ?").get(id) as { c: number }).c;
  return NextResponse.json({ liked: !existing, count });
}
