"use client";

import { useEffect, useState } from "react";
import CalloutCard, { type FeedPost } from "@/components/CalloutCard";

export default function TokenCallouts({ tokenId }: { tokenId: string }) {
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/feed?tokenId=${tokenId}`);
      if (res.ok && !cancelled) setPosts((await res.json()).posts);
    }
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tokenId]);

  return (
    <div className="card p-4">
      <h2 className="text-sm font-medium mb-3">Callouts</h2>
      {posts === null ? (
        <div className="text-xs text-text-dim py-4 text-center">Loading…</div>
      ) : posts.length === 0 ? (
        <div className="text-xs text-text-dim py-4 text-center">No callouts on this token yet.</div>
      ) : (
        <div className="flex flex-col gap-3 max-h-96 overflow-y-auto scrollbar-thin">
          {posts.map((p) => (
            <CalloutCard key={p.id} post={p} showToken={false} />
          ))}
        </div>
      )}
    </div>
  );
}
