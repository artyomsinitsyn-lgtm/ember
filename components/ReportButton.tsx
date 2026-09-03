"use client";

import { useEffect, useState } from "react";
import { Flag, X } from "lucide-react";

type TargetType = "token" | "wallet" | "post";

const REASONS: { id: string; label: string }[] = [
  { id: "scam_or_rug", label: "Likely scam or rug" },
  { id: "impersonation", label: "Impersonating someone" },
  { id: "offensive_content", label: "Offensive or NSFW content" },
  { id: "spam", label: "Spam" },
  { id: "other", label: "Other" },
];

/** Report/flag control for a token, wallet, or feed post. Fetches the current report
 * count on mount so a token with a real pile of flags reads as a trust signal, not just
 * a write-only complaint box. */
export default function ReportButton({
  targetType,
  targetId,
  size = "sm",
}: {
  targetType: TargetType;
  targetId: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [reportedByMe, setReportedByMe] = useState(false);
  const [reason, setReason] = useState(REASONS[0].id);
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports?targetType=${targetType}&targetId=${targetId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setCount(data.count ?? 0);
        setReportedByMe(!!data.reportedByMe);
      })
      .catch(() => {
        // best-effort — flag count is a nice-to-have, not load-bearing
      });
    return () => {
      cancelled = true;
    };
  }, [targetType, targetId]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, detail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to report");
      setCount(data.count);
      setReportedByMe(true);
      setOpen(false);
      setDetail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to report");
    } finally {
      setSubmitting(false);
    }
  }

  const iconSize = size === "sm" ? 12 : 14;
  const showCount = count !== null && count > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={reportedByMe}
        aria-label={reportedByMe ? "Already reported" : "Report"}
        className={`glow-hover press-effect inline-flex items-center gap-1 rounded-full text-text-dim hover:text-text disabled:opacity-60 disabled:cursor-default ${
          size === "sm" ? "text-[11px] px-2 py-1" : "text-xs px-2.5 py-1.5"
        } ${showCount ? "bg-bg-elevated border border-border" : ""}`}
      >
        <Flag size={iconSize} fill={reportedByMe ? "currentColor" : "none"} />
        {reportedByMe ? "Reported" : showCount ? count : "Report"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="card w-full max-w-sm p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Report {targetType}</h2>
              <button
                onClick={() => setOpen(false)}
                className="press-effect text-text-dim hover:text-text rounded-md p-1"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {REASONS.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reason === r.id}
                    onChange={() => setReason(r.id)}
                  />
                  {r.label}
                </label>
              ))}
            </div>

            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Anything else worth mentioning? (optional)"
              className="bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-none"
            />

            {error && <div className="text-xs text-down">{error}</div>}

            <button
              onClick={submit}
              disabled={submitting}
              className="btn-shine glow-hover press-effect bg-accent text-black font-medium px-4 py-2 rounded-full text-sm disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit report"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
