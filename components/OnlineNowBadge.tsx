"use client";

import { useEffect, useState } from "react";

const POLL_MS = 15000;

export default function OnlineNowBadge() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetch("/api/presence/count")
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) setCount(data.count);
        })
        .catch(() => {});
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (count === null) return null;

  return (
    <span className="alloy-online-badge">
      <span className="alloy-online-dot" />
      {count} {count === 1 ? "person" : "people"} online now
    </span>
  );
}
