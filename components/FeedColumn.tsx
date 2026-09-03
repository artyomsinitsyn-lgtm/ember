"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Coins, X } from "lucide-react";
import { useConnectedWalletId } from "@/lib/useConnectedWallet";
import TokenIcon from "@/components/TokenIcon";
import CalloutCard, { type FeedPost } from "@/components/CalloutCard";

type Tab = "callouts" | "friends" | "top";
const MAX_POST_LEN = 400;

interface PickableToken {
  id: string;
  ticker: string;
  name: string;
  image: string;
}

/** Lets a post attach any token, not just one the poster created — callouts are meant for
 * discussing coins in general, not just self-promotion. Searches the same /api/search the
 * header's site search uses. */
function TokenPicker({
  selected,
  onSelect,
}: {
  selected: PickableToken | null;
  onSelect: (token: PickableToken | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickableToken[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      if (res.ok && !cancelled) setResults((await res.json()).tokens);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  if (selected) {
    return (
      <div className="alloy-chip" style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
        <span className="alloy-icon-tile" style={{ width: 16, height: 16, flex: "none" }}>
          <TokenIcon image={selected.image} size={16} textSize="text-xs" />
        </span>
        ${selected.ticker}
        <button onClick={() => onSelect(null)} aria-label="Remove attached token" style={{ display: "flex" }}>
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: "relative", flex: "none" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="alloy-chip"
        style={{ display: "flex", alignItems: "center", gap: 5 }}
      >
        <Coins size={12} />
        Attach a token
      </button>
      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 240,
            zIndex: 20,
            padding: 6,
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tokens…"
            className="alloy-input"
            style={{ fontSize: 12.5, padding: "7px 10px", marginBottom: results ? 6 : 0 }}
          />
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {query.trim().length >= 2 &&
              (results === null ? (
                <div className="text-xs text-text-dim p-3 text-center">Loading…</div>
              ) : results.length === 0 ? (
                <div className="text-xs text-text-dim p-3 text-center">No tokens found.</div>
              ) : (
                results.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      onSelect(t);
                      setOpen(false);
                      setQuery("");
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 8px", borderRadius: 8, textAlign: "left" }}
                    className="press-effect"
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <span className="alloy-icon-tile" style={{ width: 22, height: 22, flex: "none" }}>
                      <TokenIcon image={t.image} size={22} textSize="text-xs" />
                    </span>
                    <span style={{ minWidth: 0, overflow: "hidden" }}>
                      <span style={{ display: "block", fontSize: 12.5 }}>${t.ticker}</span>
                      <span style={{ display: "block", fontSize: 11, color: "color-mix(in srgb, var(--text) 50%, transparent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.name}
                      </span>
                    </span>
                  </button>
                ))
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PostComposer({ onPosted }: { onPosted: () => void }) {
  const [draft, setDraft] = useState("");
  const [token, setToken] = useState<PickableToken | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!draft.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft, tokenId: token?.id ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to post");
      setDraft("");
      setToken(null);
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, MAX_POST_LEN))}
        rows={2}
        placeholder="What's happening?"
        className="alloy-textarea"
        style={{ fontSize: 13, resize: "none" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8 }}>
        <TokenPicker selected={token} onSelect={setToken} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
          <span style={{ fontFamily: "var(--alloy-mono)", fontSize: 10.5, color: "color-mix(in srgb, var(--text) 40%, transparent)" }}>
            {draft.length}/{MAX_POST_LEN}
          </span>
          <button onClick={submit} disabled={posting || !draft.trim()} className="alloy-chip" style={{ flex: "none" }}>
            {posting ? <Loader2 size={13} className="animate-spin" /> : "Post"}
          </button>
        </div>
      </div>
      {error && <div style={{ color: "#c98a8a", fontSize: 11.5, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function FeedColumn() {
  const walletId = useConnectedWalletId();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [friendIds, setFriendIds] = useState<Set<string> | null>(null);
  const [tab, setTab] = useState<Tab>("callouts");

  const loadPosts = useCallback(async () => {
    const res = await fetch("/api/feed");
    if (res.ok) setPosts((await res.json()).posts);
  }, []);

  const loadFriends = useCallback(async () => {
    const res = await fetch(`/api/connections?walletId=${walletId}`);
    if (!res.ok) return;
    const data = await res.json();
    const accepted = data.accepted as { wallet: { walletId: string } | null }[];
    setFriendIds(new Set(accepted.map((c) => c.wallet?.walletId).filter((id): id is string => !!id)));
  }, [walletId]);

  useEffect(() => {
    loadPosts();
    const id = setInterval(loadPosts, 8000);
    return () => clearInterval(id);
  }, [loadPosts]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const visible =
    posts === null
      ? null
      : tab === "friends"
      ? posts.filter((p) => friendIds?.has(p.walletId))
      : tab === "top"
      ? [...posts].sort((a, b) => b.authorPnl - a.authorPnl)
      : posts;

  return (
    <div className="alloy-panel alloy-home-panel">
      <div className="alloy-underline-tabs" style={{ marginBottom: 18 }}>
        <button
          className={`alloy-underline-tab ${tab === "callouts" ? "alloy-underline-tab-active" : ""}`}
          onClick={() => setTab("callouts")}
        >
          Callouts
        </button>
        <button
          className={`alloy-underline-tab ${tab === "friends" ? "alloy-underline-tab-active" : ""}`}
          onClick={() => setTab("friends")}
        >
          Friends
        </button>
        <button
          className={`alloy-underline-tab ${tab === "top" ? "alloy-underline-tab-active" : ""}`}
          onClick={() => setTab("top")}
        >
          Top
        </button>
      </div>

      <PostComposer onPosted={loadPosts} />

      {visible === null ? (
        <div className="alloy-empty">Loading feed…</div>
      ) : visible.length === 0 ? (
        <div className="alloy-empty">
          {tab === "friends" ? "Connect with traders to see their callouts here." : "No posts yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {visible.map((p) => (
            <CalloutCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}
