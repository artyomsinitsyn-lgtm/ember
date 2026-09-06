"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { UserPlus, Check, X, ExternalLink, Users, BadgeCheck, Search } from "lucide-react";
import WalletHoverCard from "@/components/WalletHoverCard";
import WalletLink from "@/components/WalletLink";
import TokenIcon from "@/components/TokenIcon";
import { useConnectedWalletId } from "@/lib/useConnectedWallet";
import { formatCompact, formatSol, timeAgo } from "@/lib/format";
import { STAKE_TICKER } from "@/lib/constants";
import type { WalletProfile } from "@/lib/profile";

type Tab = "directory" | "requests" | "connections";

interface RequestRow {
  id: string;
  wallet: WalletProfile;
  createdAt: number;
}

interface AcceptedRow {
  id: string;
  wallet: WalletProfile;
  externalContact: string | null;
  respondedAt: number | null;
}

interface Recommendation {
  wallet: WalletProfile;
  mutualCount: number;
}

const MAX_RECOMMENDATIONS = 6;

export default function ConnectPage() {
  const walletId = useConnectedWalletId();
  const [tab, setTab] = useState<Tab>("directory");
  const [directory, setDirectory] = useState<WalletProfile[]>([]);
  const [me, setMe] = useState<WalletProfile | null>(null);
  const [incoming, setIncoming] = useState<RequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<RequestRow[]>([]);
  const [accepted, setAccepted] = useState<AcceptedRow[]>([]);
  const [recommended, setRecommended] = useState<Recommendation[]>([]);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const [leaderboardRes, meRes, connRes] = await Promise.all([
      fetch("/api/leaderboard"),
      fetch(`/api/wallet/${walletId}/profile`),
      fetch(`/api/connections?walletId=${walletId}`),
    ]);
    const leaderboardData = await leaderboardRes.json();
    const meData = await meRes.json();
    const connData = await connRes.json();

    const dir = (leaderboardData.leaderboard as WalletProfile[]).filter((w) => w.walletId !== walletId);
    setDirectory(dir);
    setMe(meData.profile);
    setIncoming(connData.incoming);
    setOutgoing(connData.outgoing);
    setAccepted(connData.accepted);

    const connectedSet = new Set<string>(connData.accepted.map((r: AcceptedRow) => r.wallet.walletId));
    const pendingSet = new Set<string>([
      ...connData.incoming.map((r: RequestRow) => r.wallet.walletId),
      ...connData.outgoing.map((r: RequestRow) => r.wallet.walletId),
    ]);
    setConnectedIds(connectedSet);
    setPendingIds(pendingSet);

    // Mutual-connection recommendations: look at who each of my accepted connections is
    // connected to, and surface the people we don't already know, ranked by how many of
    // my connections know them. Real "people you may know" — not a fabricated list.
    const peerIds: string[] = connData.accepted.map((r: AcceptedRow) => r.wallet.walletId);
    const mutualCounts = new Map<string, number>();
    if (peerIds.length > 0) {
      const peerConnLists = await Promise.all(
        peerIds.map((pid) =>
          fetch(`/api/connections?walletId=${pid}`)
            .then((r) => r.json())
            .catch(() => ({ accepted: [] }))
        )
      );
      for (const list of peerConnLists) {
        for (const row of (list.accepted ?? []) as AcceptedRow[]) {
          const candidateId = row.wallet.walletId;
          if (candidateId === walletId || connectedSet.has(candidateId) || pendingSet.has(candidateId)) continue;
          mutualCounts.set(candidateId, (mutualCounts.get(candidateId) ?? 0) + 1);
        }
      }
    }

    const byId = new Map(dir.map((w) => [w.walletId, w]));
    const mutualRecs: Recommendation[] = Array.from(mutualCounts.entries())
      .map(([id, count]) => ({ wallet: byId.get(id), mutualCount: count }))
      .filter((r): r is Recommendation => !!r.wallet)
      .sort((a, b) => b.mutualCount - a.mutualCount || b.wallet.netWorth - a.wallet.netWorth);

    let recs = mutualRecs.slice(0, MAX_RECOMMENDATIONS);
    if (recs.length < MAX_RECOMMENDATIONS) {
      const seen = new Set(recs.map((r) => r.wallet.walletId));
      const backfill = dir
        .filter((w) => !connectedSet.has(w.walletId) && !pendingSet.has(w.walletId) && !seen.has(w.walletId))
        .sort((a, b) => b.netWorth - a.netWorth)
        .slice(0, MAX_RECOMMENDATIONS - recs.length)
        .map((wallet) => ({ wallet, mutualCount: 0 }));
      recs = [...recs, ...backfill];
    }
    setRecommended(recs);
  }, [walletId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  async function sendRequest(recipientId: string) {
    setBusyId(recipientId);
    setError(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterId: walletId, recipientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send request");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setBusyId(null);
    }
  }

  async function respond(id: string, action: "accept" | "decline") {
    setBusyId(id);
    try {
      await fetch(`/api/connections/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="alloy-dash">
      <div className="alloy-kicker">YOUR IDENTITY ON ALLOY</div>
      <h1 className="alloy-h1-page" style={{ marginBottom: 22 }}>Connect</h1>

      {me && (
        <div className="alloy-panel-dark" style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "center", marginBottom: 26 }}>
          <span className="alloy-icon-tile" style={{ width: 54, height: 54, borderRadius: "50%", flex: "none" }}>
            <TokenIcon image={me.avatar} size={54} textSize="text-2xl" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: "var(--alloy-display)", fontSize: 20, color: "var(--text)" }}>{me.name}</span>
              {me.verified && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, letterSpacing: ".08em", color: "#8bc3ab" }}>
                  <BadgeCheck size={13} /> VERIFIED
                </span>
              )}
            </div>
            <div style={{ fontFamily: "var(--alloy-mono)", fontSize: 11, color: "color-mix(in srgb, var(--text) 45%, transparent)", marginTop: 3 }}>
              Member since {timeAgo(me.createdAt)}
            </div>
            <Link href={`/profile/${walletId}`} className="alloy-chip" style={{ display: "inline-block", marginTop: 8 }}>
              Edit my profile
            </Link>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
            <div>
              <div className="alloy-stat-v" style={{ fontSize: 20 }}>{formatSol(me.netWorth)}</div>
              <div className="alloy-stat-k">NET WORTH</div>
            </div>
            <div>
              <div className="alloy-stat-v" style={{ fontSize: 20 }}>{formatCompact(me.staked)}</div>
              <div className="alloy-stat-k">{STAKE_TICKER} STAKED</div>
            </div>
            <div>
              <div className="alloy-stat-v" style={{ fontSize: 20 }}>{me.tokensCreated}</div>
              <div className="alloy-stat-k">CREATED</div>
            </div>
            <div>
              <div className="alloy-stat-v" style={{ fontSize: 20 }}>{accepted.length}</div>
              <div className="alloy-stat-k">CONNECTIONS</div>
            </div>
          </div>
        </div>
      )}

      {recommended.length > 0 && (
        <div style={{ marginBottom: 30 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <div style={{ fontFamily: "var(--alloy-display)", fontSize: 17, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--text)" }}>
              Recommended
            </div>
            <span className="alloy-section-tag" style={{ fontSize: 10.5 }}>PEOPLE YOU MAY KNOW</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12 }}>
            {recommended.map(({ wallet: w, mutualCount }) => (
              <div key={w.walletId} className="alloy-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="alloy-icon-tile" style={{ width: 34, height: 34, borderRadius: "50%", flex: "none" }}>
                    <TokenIcon image={w.avatar} size={34} textSize="text-lg" />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <WalletHoverCard walletId={w.walletId}>
                      <div className="alloy-card-name" style={{ fontSize: 14 }}>{w.name}</div>
                    </WalletHoverCard>
                    <div className="alloy-card-sub">
                      {mutualCount > 0 ? `${mutualCount} mutual connection${mutualCount === 1 ? "" : "s"}` : "Suggested for you"}
                    </div>
                  </span>
                </span>
                <button
                  data-fx="magnet"
                  onClick={() => sendRequest(w.walletId)}
                  disabled={busyId === w.walletId}
                  className="alloy-chip"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
                >
                  <UserPlus size={12} />
                  Connect
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="alloy-underline-tabs" style={{ marginBottom: 22 }}>
        {(
          [
            ["directory", "Directory"],
            ["requests", `Requests${incoming.length > 0 ? ` (${incoming.length})` : ""}`],
            ["connections", "Connections"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`alloy-underline-tab ${tab === id ? "alloy-underline-tab-active" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div style={{ color: "#c98a8a", fontSize: 13, marginBottom: 16 }}>{error}</div>}

      {tab === "directory" && (
        <div className="alloy-table" style={{ overflowX: "auto" }}>
          <div style={{ padding: "16px 24px 4px" }}>
            <div style={{ position: "relative", maxWidth: 300 }}>
              <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "color-mix(in srgb, var(--text) 40%, transparent)" }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search username…"
                className="alloy-input"
                style={{ paddingLeft: 34, fontSize: 13 }}
              />
            </div>
          </div>
          <div className="alloy-table-head" style={{ gridTemplateColumns: "1.8fr .9fr .8fr .9fr .9fr auto", minWidth: 760 }}>
            <span>WALLET</span>
            <span style={{ textAlign: "right" }}>NET WORTH</span>
            <span style={{ textAlign: "right" }}>{STAKE_TICKER} STAKED</span>
            <span style={{ textAlign: "right" }}>VOLUME</span>
            <span style={{ textAlign: "right" }}>CREATED</span>
            <span />
          </div>
          {(() => {
            const filtered = directory.filter((w) => w.name.toLowerCase().includes(search.trim().toLowerCase()));
            if (filtered.length === 0) return <div className="alloy-empty">No matching wallets.</div>;
            return filtered.map((w) => {
              const isConnected = connectedIds.has(w.walletId);
              const isPending = pendingIds.has(w.walletId);
              const blocked = w.verifiedOnlyMessages && !me?.verified;
              return (
                <div
                  key={w.walletId}
                  className="alloy-table-row"
                  style={{ gridTemplateColumns: "1.8fr .9fr .8fr .9fr .9fr auto", minWidth: 760 }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span className="alloy-icon-tile" style={{ width: 32, height: 32, borderRadius: "50%", flex: "none" }}>
                      <TokenIcon image={w.avatar} size={32} textSize="text-lg" />
                    </span>
                    <Link
                      href={`/profile/${w.walletId}`}
                      className="press-effect rounded-md px-1 py-0.5 hover:text-text transition-colors"
                      style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                    >
                      {w.name}
                    </Link>
                    {w.verified && <BadgeCheck size={13} className="text-up shrink-0" aria-label="Verified" />}
                    {w.verifiedOnlyMessages && (
                      <span style={{ fontSize: 10, color: "color-mix(in srgb, var(--text) 50%, transparent)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px", flex: "none" }}>
                        verified only
                      </span>
                    )}
                  </span>
                  <span style={{ fontFamily: "var(--alloy-mono)", fontSize: 13, textAlign: "right", color: "var(--text)" }}>
                    {formatSol(w.netWorth)}
                  </span>
                  <span style={{ fontFamily: "var(--alloy-mono)", fontSize: 13, textAlign: "right", color: "var(--text)" }}>
                    {formatCompact(w.staked)}
                  </span>
                  <span style={{ fontFamily: "var(--alloy-mono)", fontSize: 13, textAlign: "right", color: "var(--text)" }}>
                    {formatCompact(w.totalVolume)}
                  </span>
                  <span style={{ fontFamily: "var(--alloy-mono)", fontSize: 13, textAlign: "right", color: "var(--text)" }}>
                    {w.tokensCreated}
                    {w.tokensCreated > 0 ? ` (${w.tokensGraduated}✓)` : ""}
                  </span>
                  <button
                    data-fx="magnet"
                    onClick={() => sendRequest(w.walletId)}
                    disabled={isConnected || isPending || blocked || busyId === w.walletId}
                    className="alloy-chip"
                    style={{ display: "flex", alignItems: "center", gap: 7 }}
                  >
                    <UserPlus size={12} />
                    {isConnected ? "Connected" : isPending ? "Pending" : blocked ? "Verified only" : "Connect"}
                  </button>
                </div>
              );
            });
          })()}
        </div>
      )}

      {tab === "requests" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="alloy-panel">
            <div style={{ fontFamily: "var(--alloy-display)", fontSize: 17, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--text)", marginBottom: 14 }}>
              Incoming
            </div>
            {incoming.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--text) 50%, transparent)" }}>No incoming requests.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {incoming.map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14 }}>
                    <span>
                      <WalletLink walletId={r.wallet.walletId}>{r.wallet.name}</WalletLink>{" "}
                      <span style={{ color: "color-mix(in srgb, var(--text) 45%, transparent)", fontSize: 12 }}>· {timeAgo(r.createdAt)}</span>
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        data-fx="magnet"
                        onClick={() => respond(r.id, "accept")}
                        disabled={busyId === r.id}
                        className="alloy-chip"
                        style={{ padding: 8, borderRadius: 999, color: "#8bc3ab" }}
                        aria-label="Accept"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        data-fx="magnet"
                        onClick={() => respond(r.id, "decline")}
                        disabled={busyId === r.id}
                        className="alloy-chip"
                        style={{ padding: 8, borderRadius: 999, color: "#c98a8a" }}
                        aria-label="Decline"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="alloy-panel">
            <div style={{ fontFamily: "var(--alloy-display)", fontSize: 17, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--text)", marginBottom: 14 }}>
              Outgoing
            </div>
            {outgoing.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--text) 50%, transparent)" }}>No outgoing requests.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {outgoing.map((r) => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14 }}>
                    <span>
                      <WalletLink walletId={r.wallet.walletId}>{r.wallet.name}</WalletLink>{" "}
                      <span style={{ color: "color-mix(in srgb, var(--text) 45%, transparent)", fontSize: 12 }}>· {timeAgo(r.createdAt)}</span>
                    </span>
                    <button data-fx="magnet" onClick={() => respond(r.id, "decline")} disabled={busyId === r.id} className="alloy-chip">
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "connections" && (
        <div className="alloy-table">
          {accepted.length === 0 ? (
            <div className="alloy-empty">No connections yet.</div>
          ) : (
            accepted.map((r) => (
              <div key={r.id} className="alloy-table-row" style={{ gridTemplateColumns: "1fr auto" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="alloy-icon-tile" style={{ width: 32, height: 32, borderRadius: "50%", flex: "none" }}>
                    <TokenIcon image={r.wallet.avatar} size={32} textSize="text-lg" />
                  </span>
                  <WalletLink walletId={r.wallet.walletId}>
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.wallet.name}</span>
                  </WalletLink>
                </span>
                <div style={{ fontSize: 12.5, textAlign: "right" }}>
                  {r.externalContact ? (
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--alloy-mono)", color: "var(--text)" }}>
                      <ExternalLink size={11} style={{ color: "color-mix(in srgb, var(--text) 45%, transparent)" }} />
                      {r.externalContact}
                    </span>
                  ) : (
                    <span style={{ color: "color-mix(in srgb, var(--text) 45%, transparent)" }}>Hasn&apos;t shared contact info yet</span>
                  )}
                </div>
              </div>
            ))
          )}
          <div style={{ padding: 16, display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: "color-mix(in srgb, var(--text) 45%, transparent)" }}>
            <Users size={13} style={{ flex: "none", marginTop: 2 }} />
            Continue these conversations off-platform (Discord, etc) — Alloy only handles the introduction.
          </div>
        </div>
      )}
    </div>
  );
}
