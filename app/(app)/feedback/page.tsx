"use client";

import { useState } from "react";
import Link from "next/link";
import { Lightbulb, AlertTriangle, MessageSquare, Check } from "lucide-react";

type Kind = "feature" | "complaint" | "other";

const KINDS: { id: Kind; label: string; icon: typeof Lightbulb; hint: string }[] = [
  { id: "feature", label: "Feature request", icon: Lightbulb, hint: "Something you wish Alloy did" },
  { id: "complaint", label: "Complaint", icon: AlertTriangle, hint: "Something that's broken or annoying" },
  { id: "other", label: "Something else", icon: MessageSquare, hint: "Anything else on your mind" },
];

export default function FeedbackPage() {
  const [kind, setKind] = useState<Kind>("feature");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      setSent(true);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="alloy-dash" style={{ maxWidth: 640 }}>
      <Link href="/" className="text-sm text-text-dim hover:text-text w-fit" style={{ display: "block", marginBottom: 24 }}>
        ← Home
      </Link>

      <div className="card p-6 flex flex-col gap-5">
        <div>
          <h1 className="text-lg font-semibold mb-1">Feature requests & complaints</h1>
          <p className="text-sm text-text-dim leading-relaxed">
            Tell us what&apos;s missing or what&apos;s bugging you. This goes straight to whoever&apos;s working on
            Alloy — not a bot, not a form that vanishes into a spreadsheet nobody opens.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {KINDS.map((k) => {
            const Icon = k.icon;
            const active = kind === k.id;
            return (
              <button
                key={k.id}
                onClick={() => setKind(k.id)}
                className="press-effect flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
                style={{
                  border: `1px solid ${active ? "rgba(226,236,245,.5)" : "rgba(255,255,255,.1)"}`,
                  background: active ? "rgba(226,236,245,.1)" : "rgba(255,255,255,.02)",
                }}
              >
                <Icon size={16} className={active ? "text-text" : "text-text-dim"} />
                <div>
                  <div className={`text-sm font-medium ${active ? "text-text" : "text-text-dim"}`}>{k.label}</div>
                  <div className="text-xs text-text-dim">{k.hint}</div>
                </div>
              </button>
            );
          })}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={
            kind === "feature"
              ? "What would make Alloy better for you?"
              : kind === "complaint"
              ? "What went wrong, and where?"
              : "Go ahead."
          }
          rows={5}
          maxLength={2000}
          className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-accent resize-none"
        />

        {error && <div className="text-xs text-down">{error}</div>}
        {sent && (
          <div className="flex items-center gap-2 text-xs text-up">
            <Check size={13} />
            Sent — thanks for taking the time.
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting || !message.trim()}
          className="btn-shine glow-hover press-effect bg-accent text-black font-medium px-4 py-2.5 rounded-lg text-sm disabled:opacity-50 self-start"
        >
          {submitting ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
