"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { BadgeCheck, X } from "lucide-react";
import { useConnectedWalletId } from "@/lib/useConnectedWallet";
import { fetchTreasuryState } from "@/lib/onchain/treasury";
import { timeAgo } from "@/lib/format";
import TokenIcon from "@/components/TokenIcon";

interface VerificationRequest {
  id: string;
  walletId: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  walletName: string;
  walletAvatar: string;
  contact: string | null;
  contactType: string | null;
  twitterHandle: string | null;
}

/**
 * Not linked from the header/nav — the operator's own approval queue. Meeting the
 * verification requirement (a verified contact + the profit threshold, see lib/profile.ts)
 * no longer flips the badge on automatically — it lands here for a human to actually accept.
 */
export default function VerificationsAdminPage() {
  const walletId = useConnectedWalletId();
  const { connection } = useConnection();
  const wallet = useWallet();

  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);
  const [requests, setRequests] = useState<VerificationRequest[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const state = await fetchTreasuryState(connection);
    setIsAdmin(!!wallet.publicKey && state.admin === wallet.publicKey.toBase58());
    const res = await fetch("/api/admin/verifications");
    if (res.ok) setRequests((await res.json()).requests);
    else setRequests(null);
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    load();
  }, [load, walletId]);

  async function decide(id: string, decision: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/verifications/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests?.filter((r) => r.status === "pending") ?? [];
  const decided = requests?.filter((r) => r.status !== "pending") ?? [];

  return (
    <div className="alloy-dash" style={{ maxWidth: 640 }}>
      <Link href="/" className="text-sm text-text-dim hover:text-text w-fit" style={{ display: "block", marginBottom: 24 }}>
        ← Home
      </Link>

      <div className="card p-6 flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <BadgeCheck size={18} className="text-text-dim" />
          <h1 className="text-lg font-semibold">Verification requests</h1>
        </div>
        <p className="text-sm text-text-dim leading-relaxed">
          A wallet lands here the moment it meets the verification bar (linked contact + realized PNL threshold) —
          the badge only goes live once you personally approve it.
        </p>

        {isAdmin === false && (
          <div className="text-xs text-down">Connected wallet isn&apos;t the treasury admin.</div>
        )}
        {error && <div className="text-xs text-down">{error}</div>}

        {isAdmin && (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-text-dim uppercase tracking-wide">
                Pending {pending.length > 0 && `(${pending.length})`}
              </label>
              {requests === null ? (
                <div className="text-xs text-text-dim">Loading…</div>
              ) : pending.length === 0 ? (
                <div className="text-xs text-text-dim">Nothing waiting on you.</div>
              ) : (
                pending.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                  >
                    <span className="alloy-icon-tile" style={{ width: 32, height: 32, borderRadius: "50%", flex: "none" }}>
                      <TokenIcon image={r.walletAvatar} size={32} textSize="text-sm" />
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Link href={`/profile/${r.walletId}`} className="text-sm font-medium hover:underline">
                        {r.walletName}
                      </Link>
                      <div className="text-xs text-text-dim">
                        {r.contactType && r.contact ? `${r.contactType}: ${r.contact}` : "no contact on file"}
                        {r.twitterHandle ? ` · @${r.twitterHandle}` : ""} · requested {timeAgo(r.createdAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => decide(r.id, "approve")}
                      disabled={busyId === r.id}
                      className="btn-shine glow-hover press-effect bg-up text-black font-medium px-3 py-1.5 rounded-full text-xs disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => decide(r.id, "reject")}
                      disabled={busyId === r.id}
                      className="glow-hover press-effect bg-bg-elevated border border-border font-medium px-3 py-1.5 rounded-full text-xs disabled:opacity-50 flex items-center gap-1"
                    >
                      <X size={12} />
                      Reject
                    </button>
                  </div>
                ))
              )}
            </div>

            {decided.length > 0 && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <label className="text-xs text-text-dim uppercase tracking-wide">Decided</label>
                {decided.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 text-xs text-text-dim">
                    <span className="alloy-icon-tile" style={{ width: 20, height: 20, borderRadius: "50%", flex: "none" }}>
                      <TokenIcon image={r.walletAvatar} size={20} textSize="text-xs" />
                    </span>
                    <span style={{ flex: 1 }}>{r.walletName}</span>
                    <span className={r.status === "approved" ? "text-up" : "text-down"}>{r.status}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
