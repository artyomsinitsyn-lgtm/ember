"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, Heart, MessageCircle, Loader2 } from "lucide-react";
import TokenIcon from "@/components/TokenIcon";
import ReportButton from "@/components/ReportButton";
import { formatUsd, timeAgo } from "@/lib/format";
import type { SerializedToken } from "@/lib/serialize";

export interface FeedPost {
  id: string;
  walletId: string;
  walletName: string;
  walletAvatar: string;
  verified: boolean;
  authorPnl: number;
  body: string;
  image: string | null;
  token: SerializedToken | null;
  createdAt: number;
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
}

interface Reply {
  id: string;
  walletId: string;
  walletName: string;
  walletAvatar: string;
  verified: boolean;
  body: string;
  createdAt: number;
}

function ReplyThread({ postId, initialCount }: { postId: string; initialCount: number }) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(initialCount);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && replies === null) {
      const res = await fetch(`/api/feed/${postId}/replies`);
      if (res.ok) setReplies((await res.json()).replies);
    }
  }

  async function submitReply() {
    if (!draft.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/feed/${postId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reply");
      setReplies((prev) => [...(prev ?? []), data.reply]);
      setCount((c) => c + 1);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reply");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div>
      <button onClick={toggleOpen} className="alloy-callout-action press-effect">
        <MessageCircle size={13} />
        {count > 0 ? count : "Reply"}
      </button>
      {open && (
        <div className="alloy-callout-replies">
          {replies === null ? (
            <div className="alloy-callout-time">Loading…</div>
          ) : (
            replies.map((r) => (
              <div key={r.id} className="alloy-callout-reply">
                <span className="alloy-icon-tile" style={{ width: 22, height: 22, borderRadius: "50%", flex: "none" }}>
                  <TokenIcon image={r.walletAvatar} size={22} textSize="text-xs" />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <Link href={`/profile/${r.walletId}`} className="press-effect alloy-callout-name" style={{ fontSize: 12.5 }}>
                      {r.walletName}
                    </Link>
                    {r.verified && <BadgeCheck size={11} className="text-up" aria-label="Verified" />}
                    <span className="alloy-callout-time">· {timeAgo(r.createdAt)}</span>
                  </span>
                  <p style={{ fontSize: 12.5, color: "var(--text)", margin: "2px 0 0", lineHeight: 1.5 }}>{r.body}</p>
                </div>
              </div>
            ))
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitReply()}
              maxLength={240}
              placeholder="Reply…"
              className="alloy-input"
              style={{ fontSize: 12.5, padding: "8px 10px" }}
            />
            <button onClick={submitReply} disabled={posting} className="alloy-chip" style={{ flex: "none" }}>
              {posting ? <Loader2 size={12} className="animate-spin" /> : "Post"}
            </button>
          </div>
          {error && <div style={{ color: "#c98a8a", fontSize: 11.5, marginTop: 4 }}>{error}</div>}
        </div>
      )}
    </div>
  );
}

/** One callout/post card — shared by the homepage feed and a token page's per-coin
 * callouts. `showToken` hides the attached-coin chip when the surrounding context already
 * makes it obvious (e.g. this list is already scoped to one token). */
export default function CalloutCard({ post, showToken = true }: { post: FeedPost; showToken?: boolean }) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);

  async function toggleLike() {
    setLiked((v) => !v);
    setLikeCount((c) => c + (liked ? -1 : 1));
    try {
      const res = await fetch(`/api/feed/${post.id}/like`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setLikeCount(data.count);
      }
    } catch {
      // best-effort — optimistic state stays as-is on network failure
    }
  }

  return (
    <div className="alloy-callout-card">
      <div className="alloy-callout-head">
        <span className="alloy-icon-tile" style={{ width: 30, height: 30, borderRadius: "50%", flex: "none" }}>
          <TokenIcon image={post.walletAvatar} size={30} textSize="text-base" />
        </span>
        <Link href={`/profile/${post.walletId}`} className="press-effect alloy-callout-name">
          {post.walletName}
        </Link>
        {post.verified && <BadgeCheck size={13} className="text-up" aria-label="Verified" />}
        <span className="alloy-callout-time">· {timeAgo(post.createdAt)}</span>
      </div>
      <p className="alloy-callout-body">{post.body}</p>
      {post.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image} alt="" style={{ borderRadius: 10, maxWidth: "100%", display: "block", marginTop: 4 }} />
      )}
      {showToken && post.token && (
        <Link href={`/token/${post.token.id}`} className="alloy-callout-token">
          <span className="alloy-icon-tile" style={{ width: 26, height: 26, flex: "none" }}>
            <TokenIcon image={post.token.image} size={26} textSize="text-base" />
          </span>
          <span style={{ minWidth: 0 }}>
            <span className="alloy-callout-token-name">${post.token.ticker}</span>
            <span className="alloy-callout-token-sub">MCAP {formatUsd(post.token.marketCap)}</span>
          </span>
        </Link>
      )}
      <div className="alloy-callout-actions">
        <button onClick={toggleLike} className={`alloy-callout-action press-effect ${liked ? "liked" : ""}`}>
          <Heart size={13} fill={liked ? "currentColor" : "none"} />
          {likeCount > 0 ? likeCount : "Like"}
        </button>
        <ReplyThread postId={post.id} initialCount={post.replyCount} />
        <ReportButton targetType="post" targetId={post.id} />
      </div>
    </div>
  );
}
