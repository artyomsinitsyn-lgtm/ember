"use client";

import { useEffect } from "react";

const STORAGE_KEY = "alloy_presence_id";
const HEARTBEAT_MS = 20000;

function getClientId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/**
 * Mounted once in the root layout so every visitor on any page keeps the site's "N people
 * online now" count warm — not just people on the homepage. clientId is a random id kept
 * in localStorage, not a wallet id, so this carries no identity or auth weight; it only
 * ever feeds a count (see OnlineNowBadge / /api/presence/count).
 */
export default function PresenceBeacon() {
  useEffect(() => {
    const clientId = getClientId();
    function beat() {
      fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      }).catch(() => {});
    }
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
