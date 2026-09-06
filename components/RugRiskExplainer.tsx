"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import TokenIcon from "@/components/TokenIcon";
import { formatSol } from "@/lib/format";
import type { SerializedToken } from "@/lib/serialize";

interface ClusterFlag {
  walletNames: string[];
  reason: "shared_funding" | "coordinated_trading";
  combinedPct: number;
  detail: string;
}

interface RugAssessment {
  riskLevel: "low" | "medium" | "high";
  topWalletPct: number;
  clusters: ClusterFlag[];
}

const RISK_STYLE = {
  low: { icon: ShieldCheck, color: "#8bc3ab", label: "Low risk" },
  medium: { icon: ShieldQuestion, color: "#e6d4a8", label: "Medium risk" },
  high: { icon: ShieldAlert, color: "#c98a8a", label: "High risk" },
} as const;

/**
 * Not a mockup — this hits the same /api/tokens/[id] endpoint the trade page uses and runs
 * the platform's real assessRugRisk() clustering logic against whichever live token you
 * pick, so "medium"/"high" here means the detector actually found something.
 */
export default function RugRiskExplainer() {
  const [tokens, setTokens] = useState<SerializedToken[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [assessment, setAssessment] = useState<RugAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/tokens")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list = data.tokens as SerializedToken[];
        setTokens(list);
        if (list.length > 0) {
          setSelected(list[0].id);
          setQuery(`${list[0].ticker} — ${list[0].name}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function pick(t: SerializedToken) {
    setSelected(t.id);
    setQuery(`${t.ticker} — ${t.name}`);
    setPickerOpen(false);
  }

  const matches = (tokens ?? []).filter((t) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return t.ticker.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tokens/${selected}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAssessment(data.rugRisk);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const token = tokens?.find((t) => t.id === selected);
  const style = assessment ? RISK_STYLE[assessment.riskLevel] : null;
  const Icon = style?.icon;

  return (
    <div className="alloy-panel-dark alloy-rug-explainer">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <span className="alloy-label" style={{ margin: 0 }}>
          PICK A LIVE TOKEN
        </span>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPickerOpen(true);
            }}
            onFocus={() => setPickerOpen(true)}
            onBlur={() => setTimeout(() => setPickerOpen(false), 120)}
            placeholder="Type a ticker or name…"
            className="alloy-input mono"
            style={{ width: "100%", padding: "9px 12px", fontSize: 13 }}
          />
          {pickerOpen && (
            <div className="alloy-rug-picker">
              {tokens === null ? (
                <div className="alloy-rug-picker-empty">Loading tokens…</div>
              ) : matches.length === 0 ? (
                <div className="alloy-rug-picker-empty">No tokens match &ldquo;{query}&rdquo;</div>
              ) : (
                matches.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    // onMouseDown (not onClick) fires before the input's onBlur closes the
                    // picker — onClick would arrive a beat too late to ever be hit.
                    onMouseDown={() => pick(t)}
                    className={`alloy-rug-picker-row ${t.id === selected ? "alloy-rug-picker-row-active" : ""}`}
                  >
                    <span className="mono">${t.ticker}</span>
                    <span className="text-text-dim">{t.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {loading || !assessment || !token ? (
        <div className="alloy-empty" style={{ padding: "30px 0" }}>
          {tokens === null ? "Loading tokens…" : "Scoring…"}
        </div>
      ) : (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <span className="alloy-icon-tile" style={{ width: 44, height: 44, flex: "none" }}>
              <TokenIcon image={token.image} size={44} textSize="text-xl" />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="alloy-card-name">
                ${token.ticker} <span className="text-text-dim" style={{ fontWeight: 400 }}>{token.name}</span>
              </div>
              <div className="alloy-card-sub">
                MCAP {formatSol(token.marketCap)} · top wallet holds{" "}
                {assessment.topWalletPct.toFixed(1)}% of circulating supply
              </div>
            </div>
            {Icon && (
              <div style={{ display: "flex", alignItems: "center", gap: 7, color: style!.color, flex: "none" }}>
                <Icon size={18} />
                <span style={{ fontSize: 13, fontWeight: 600 }}>{style!.label}</span>
              </div>
            )}
          </div>

          {assessment.clusters.length === 0 ? (
            <div className="text-text-dim" style={{ fontSize: 13, lineHeight: 1.55 }}>
              No shared-funding or coordinated-buying clusters detected among this token&apos;s holders.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {assessment.clusters.map((c, i) => (
                <div
                  key={i}
                  className="border border-border bg-bg"
                  style={{ padding: 12, borderRadius: 10 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
                    <span className="text-text" style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {c.reason === "shared_funding" ? "Shared funding source" : "Coordinated buying"}
                    </span>
                    <span className="mono text-down" style={{ fontSize: 12 }}>
                      {c.combinedPct.toFixed(1)}% combined
                    </span>
                  </div>
                  <p className="text-text-dim" style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>{c.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
