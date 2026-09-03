"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { CreditCard, Landmark, Split } from "lucide-react";
import { formatCompact, formatUsd, timeAgo } from "@/lib/format";
import { CURRENCY_TICKER, STAKE_TICKER } from "@/lib/constants";
import TokenIcon from "@/components/TokenIcon";
import { useConnectedWalletId } from "@/lib/useConnectedWallet";

interface Holding {
  tokenId: string;
  ticker: string;
  name: string;
  image: string;
  amount: number;
  price: number;
  value: number;
  graduated: boolean;
}

interface HistoryEntry {
  id: string;
  kind: "trade" | "stake" | "deposit";
  type: string;
  ticker?: string;
  tokenId?: string;
  coreAmount?: number;
  tokenAmount?: number;
  amount?: number;
  createdAt: number;
}

const METHODS = [
  { id: "card", label: "Card", icon: CreditCard },
  { id: "pay-in-4", label: "Pay in 4", icon: Split },
  { id: "bank", label: "Bank Transfer", icon: Landmark },
] as const;

const QUICK_AMOUNTS = [50, 100, 250, 500];

export default function WalletPage() {
  const walletId = useConnectedWalletId();
  const [coreBalance, setCoreBalance] = useState(0);
  const [embrBalance, setEmbrBalance] = useState(0);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [depositOpen, setDepositOpen] = useState(false);
  const [amount, setAmount] = useState("100");
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("card");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [walletRes, historyRes] = await Promise.all([
      fetch(`/api/wallet/${walletId}`),
      fetch(`/api/wallet/${walletId}/history`),
    ]);
    if (walletRes.ok) {
      const data = await walletRes.json();
      setCoreBalance(data.wallet.coreBalance);
      setEmbrBalance(data.wallet.embrBalance);
      setHoldings(data.holdings);
      setPortfolioValue(data.portfolioValue);
    }
    if (historyRes.ok) {
      const data = await historyRes.json();
      setHistory(data.history);
    }
  }, [walletId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function submitDeposit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      // Fake processing delay so the flow feels like a real checkout — nothing is charged.
      await new Promise((resolve) => setTimeout(resolve, 900));
      const res = await fetch("/api/wallet/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId, amount: value, method }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deposit failed");
      setDepositOpen(false);
      setAmount("100");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="alloy-dash">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 22, alignItems: "center", marginBottom: 30 }}>
        <div>
          <div className="alloy-kicker" style={{ marginBottom: 6 }}>SIMULATED BALANCES</div>
          <div className="alloy-stat-v" style={{ fontSize: 40 }}>
            {formatUsd(portfolioValue)}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          data-fx="magnet"
          data-shake="1"
          className="alloy-btn-header"
          onClick={() => {
            setError(null);
            setDepositOpen((v) => !v);
          }}
        >
          {depositOpen ? "Close" : "Deposit"}
        </button>
      </div>

      {depositOpen && (
        <div className="alloy-panel-dark" style={{ display: "flex", flexDirection: "column", gap: 22, marginBottom: 26 }}>
          <div style={{ fontFamily: "var(--alloy-display)", fontSize: 19, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--text)" }}>
            Deposit {CURRENCY_TICKER}
          </div>
          <p style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--text) 55%, transparent)", margin: 0 }}>
            Simulated checkout for demo purposes — no real payment method is charged. It just credits your local{" "}
            {CURRENCY_TICKER} balance.
          </p>

          <div>
            <span className="alloy-label">AMOUNT</span>
            <div style={{ display: "flex", gap: 9, alignItems: "center", padding: "14px 15px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--bg)", marginBottom: 11 }}>
              <input
                type="number"
                min={0}
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ flex: 1, minWidth: 0, fontFamily: "var(--alloy-mono)", fontSize: 22, color: "var(--text)", background: "transparent", border: 0, outline: "none" }}
              />
              <span style={{ fontFamily: "var(--alloy-mono)", fontSize: 13, color: "color-mix(in srgb, var(--text) 50%, transparent)" }}>{CURRENCY_TICKER}</span>
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              {QUICK_AMOUNTS.map((q) => (
                <button key={q} data-fx="magnet" onClick={() => setAmount(String(q))} className="alloy-chip" style={{ flex: 1, textAlign: "center" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="alloy-label">PAYMENT METHOD</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  data-fx="magnet"
                  onClick={() => setMethod(m.id)}
                  className={`alloy-chip ${method === m.id ? "active" : ""}`}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: "14px 8px" }}
                >
                  <m.icon size={16} />
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {error && <div style={{ color: "#c98a8a", fontSize: 13 }}>{error}</div>}

          <button data-fx="magnet" data-shake="1" disabled={processing} onClick={submitDeposit} className="alloy-btn-primary" style={{ width: "100%" }}>
            {processing ? "Processing…" : `Deposit ${amount || "0"} ${CURRENCY_TICKER}`}
          </button>

          <div style={{ fontFamily: "var(--alloy-mono)", fontSize: 10, letterSpacing: ".1em", color: "color-mix(in srgb, var(--text) 35%, transparent)", textAlign: "center" }}>
            SIMULATED — DEMO ONLY, NO REAL MONEY MOVES
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14, marginBottom: 26 }}>
        <div className="alloy-stat-card">
          <div className="alloy-stat-k">{CURRENCY_TICKER} BALANCE</div>
          <div className="alloy-stat-v">{formatUsd(coreBalance)}</div>
        </div>
        <div className="alloy-stat-card">
          <div className="alloy-stat-k">{STAKE_TICKER} BALANCE</div>
          <div className="alloy-stat-v up">{formatCompact(embrBalance)}</div>
        </div>
        <div className="alloy-stat-card">
          <div className="alloy-stat-k">HOLDINGS VALUE</div>
          <div className="alloy-stat-v">{formatUsd(portfolioValue)}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(0,.75fr)", gap: 22, alignItems: "start" }}>
        <div className="alloy-table">
          <div className="alloy-table-head" style={{ gridTemplateColumns: "1fr" }}>HOLDINGS</div>
          {holdings.length === 0 ? (
            <div className="alloy-empty">You don&apos;t hold any Tokens yet.</div>
          ) : (
            holdings.map((h) => (
              <Link key={h.tokenId} href={`/token/${h.tokenId}`} className="alloy-table-row" style={{ gridTemplateColumns: "1.5fr .9fr" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span className="alloy-icon-tile" style={{ width: 34, height: 34, flex: "none" }}>
                    <TokenIcon image={h.image} size={34} textSize="text-base" />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "var(--text)" }}>${h.ticker}</div>
                    <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--text) 45%, transparent)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontFamily: "var(--alloy-mono)" }}>
                  <div style={{ color: "var(--text)" }}>{formatCompact(h.amount)}</div>
                  <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--text) 45%, transparent)" }}>{formatUsd(h.value)}</div>
                </div>
              </Link>
            ))
          )}
        </div>

        <div className="alloy-table">
          <div className="alloy-table-head" style={{ gridTemplateColumns: "1fr" }}>ACTIVITY</div>
          {history.length === 0 ? (
            <div className="alloy-empty">No activity yet.</div>
          ) : (
            <div style={{ maxHeight: 480, overflowY: "auto" }}>
              {history.map((h) => (
                <div key={h.id} className="alloy-table-row" style={{ gridTemplateColumns: "1fr auto", padding: "12px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    {h.kind === "trade" ? (
                      <>
                        <span style={{ color: h.type === "buy" ? "#8bc3ab" : "#c98a8a" }}>{h.type === "buy" ? "Bought" : "Sold"}</span>
                        <span style={{ color: "color-mix(in srgb, var(--text) 60%, transparent)" }}>${h.ticker}</span>
                      </>
                    ) : h.kind === "stake" ? (
                      <span style={{ color: "var(--text)" }}>{h.type === "stake" ? `Staked ${STAKE_TICKER}` : `Unstaked ${STAKE_TICKER}`}</span>
                    ) : (
                      <span style={{ color: "#8bc3ab" }}>Deposited ({h.type})</span>
                    )}
                  </div>
                  <div style={{ fontFamily: "var(--alloy-mono)", fontSize: 11, color: "color-mix(in srgb, var(--text) 50%, transparent)", textAlign: "right" }}>
                    {h.kind === "trade"
                      ? `${formatCompact(h.tokenAmount ?? 0)} @ ${formatUsd(h.coreAmount ?? 0)}`
                      : h.kind === "stake"
                      ? `${formatCompact(h.amount ?? 0)} ${STAKE_TICKER}`
                      : formatUsd(h.amount ?? 0)}
                    <span style={{ marginLeft: 8 }}>{timeAgo(h.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
