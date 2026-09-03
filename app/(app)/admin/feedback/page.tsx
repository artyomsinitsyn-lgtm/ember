"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Inbox, Check, Undo2 } from "lucide-react";
import { fetchTreasuryState } from "@/lib/onchain/treasury";
import { timeAgo } from "@/lib/format";

interface FeedbackItem {
  id: string;
  walletId: string;
  kind: "feature" | "complaint" | "other";
  message: string;
  resolvedAt: number | null;
  createdAt: number;
  walletName: string;
}

const KIND_LABEL: Record<FeedbackItem["kind"], string> = {
  feature: "Feature request",
  complaint: "Complaint",
  other: "Other",
};

/** Not linked from the header/nav — the operator's own inbox for the public /feedback form. */
export default function FeedbackAdminPage() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const state = await fetchTreasuryState(connection);
    setIsAdmin(!!wallet.publicKey && state.admin === wallet.publicKey.toBase58());
    const res = await fetch("/api/feedback");
    if (res.ok) setItems((await res.json()).items);
    else setItems(null);
  }, [connection, wallet.publicKey]);

  useEffect(() => {
    load();
  }, [load]);

  async function setResolved(id: string, resolved: boolean) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/feedback/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  const open = items?.filter((i) => !i.resolvedAt) ?? [];
  const resolved = items?.filter((i) => i.resolvedAt) ?? [];

  return (
    <div className="alloy-dash" style={{ maxWidth: 720 }}>
      <Link href="/" className="text-sm text-text-dim hover:text-text w-fit" style={{ display: "block", marginBottom: 24 }}>
        ← Home
      </Link>

      <div className="card p-6 flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <Inbox size={18} className="text-text-dim" />
          <h1 className="text-lg font-semibold">Feature requests & complaints</h1>
        </div>

        {isAdmin === false && <div className="text-xs text-down">Connected wallet isn&apos;t the treasury admin.</div>}
        {error && <div className="text-xs text-down">{error}</div>}

        {isAdmin && (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-text-dim uppercase tracking-wide">
                Open {open.length > 0 && `(${open.length})`}
              </label>
              {items === null ? (
                <div className="text-xs text-text-dim">Loading…</div>
              ) : open.length === 0 ? (
                <div className="text-xs text-text-dim">Nothing waiting on you.</div>
              ) : (
                open.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="flex items-center gap-2 text-xs text-text-dim mb-1">
                        <span className="font-medium text-text">{KIND_LABEL[i.kind]}</span>
                        <span>· {i.walletName}</span>
                        <span>· {timeAgo(i.createdAt)}</span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap">{i.message}</div>
                    </div>
                    <button
                      onClick={() => setResolved(i.id, true)}
                      disabled={busyId === i.id}
                      className="glow-hover press-effect bg-up/15 text-up font-medium px-3 py-1.5 rounded-full text-xs disabled:opacity-50 flex items-center gap-1 shrink-0"
                    >
                      <Check size={12} />
                      Resolve
                    </button>
                  </div>
                ))
              )}
            </div>

            {resolved.length > 0 && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <label className="text-xs text-text-dim uppercase tracking-wide">Resolved</label>
                {resolved.map((i) => (
                  <div key={i.id} className="flex items-start gap-3 text-xs text-text-dim">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span className="font-medium">{KIND_LABEL[i.kind]}</span> · {i.walletName} ·{" "}
                      {timeAgo(i.createdAt)}
                      <div className="mt-0.5 line-clamp-1">{i.message}</div>
                    </div>
                    <button
                      onClick={() => setResolved(i.id, false)}
                      disabled={busyId === i.id}
                      className="press-effect hover:text-text disabled:opacity-50 flex items-center gap-1 shrink-0"
                    >
                      <Undo2 size={12} />
                      Reopen
                    </button>
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
