"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { ShieldQuestion } from "lucide-react";
import AreaChart, { type AreaPoint } from "@/components/AreaChart";
import { formatCompact, formatSol, formatPct } from "@/lib/format";
import { CURRENCY_TICKER, STAKE_TICKER, TRADE_FEE_BPS, FEE_SPLIT, BPS_DENOM } from "@/lib/constants";
import { useConnectedWalletId } from "@/lib/useConnectedWallet";

const LAMPORTS_PER_SOL = 1_000_000_000;

interface TokenStats {
  totalSupply: number;
  totalStaked: number;
  pctStaked: number;
  lifetimeDistributed: number;
  stakerCount: number;
  totalVolume: number;
  totalTrades: number;
}

interface DayRow {
  timestamp: number;
  trades: number;
  volume: number;
  stakerFees: number;
  creatorFees: number;
}

const PAGE_SIZE = 10;
const feePct = TRADE_FEE_BPS / 100;
const stakerSharePct = (FEE_SPLIT.staker / BPS_DENOM) * 100;

export default function StakePage() {
  const walletId = useConnectedWalletId();
  const [embrBalance, setEmbrBalance] = useState(0);
  const [staked, setStaked] = useState(0);
  const [pendingCore, setPendingCore] = useState(0);
  const [claimedCore, setClaimedCore] = useState(0);
  const [poolTotalStaked, setPoolTotalStaked] = useState(0);
  const [lifetimeDistributed, setLifetimeDistributed] = useState(0);
  const [onchainStakerPoolLamports, setOnchainStakerPoolLamports] = useState<number | null>(null);
  const [mode, setMode] = useState<"stake" | "unstake">("stake");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [stats, setStats] = useState<TokenStats | null>(null);
  const [series, setSeries] = useState<AreaPoint[]>([]);
  const [days, setDays] = useState<DayRow[]>([]);
  const [page, setPage] = useState(0);
  const [calcVolume, setCalcVolume] = useState("100");
  const [calcStake, setCalcStake] = useState("1000");

  const load = useCallback(async () => {
    const [walletRes, stakeRes] = await Promise.all([fetch(`/api/wallet/${walletId}`), fetch("/api/stake")]);
    if (walletRes.ok) {
      const data = await walletRes.json();
      setEmbrBalance(data.wallet.embrBalance);
      setStaked(data.staking.staked);
      setPendingCore(data.staking.pendingCore);
      setClaimedCore(data.staking.claimedCore);
    }
    if (stakeRes.ok) {
      const data = await stakeRes.json();
      setPoolTotalStaked(data.pool.total_staked);
      setLifetimeDistributed(data.pool.lifetime_core_distributed);
      setOnchainStakerPoolLamports(
        typeof data.onchainStakerPoolLamports === "number" ? data.onchainStakerPoolLamports : null
      );
    }
  }, [walletId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    async function loadInfo() {
      const [statsRes, distRes] = await Promise.all([
        fetch("/api/token/stats"),
        fetch("/api/token/distributions"),
      ]);
      if (!cancelled && statsRes.ok) setStats(await statsRes.json());
      if (!cancelled && distRes.ok) {
        const data = await distRes.json();
        setSeries(data.series);
        setDays(data.days);
      }
    }
    loadInfo();
    const id = setInterval(loadInfo, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/stake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId, action: mode, amount: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setAmount("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  const yourShare = poolTotalStaked > 0 ? staked / poolTotalStaked : 0;

  const STATS = [
    { k: "TOTAL STAKED", v: `${formatCompact(poolTotalStaked)} ${STAKE_TICKER}` },
    { k: "LIFETIME DISTRIBUTED", v: formatSol(lifetimeDistributed) },
    { k: "YOUR SHARE", v: `${(yourShare * 100).toFixed(2)}%` },
  ];

  // Only the platform-wide numbers not already shown above (staked total is covered by the
  // tiles right by the action panel — no point saying it twice). Treasury balance is
  // deliberately not shown anywhere on this page — that's the platform's own revenue, not
  // something to hand a competitor for free; see /admin/treasury (admin-gated) instead.
  const PLATFORM_STATS = [
    { k: "% OF SUPPLY STAKED", v: stats ? formatPct(stats.pctStaked) : "—" },
    { k: "STAKERS", v: stats ? String(stats.stakerCount) : "—" },
    { k: "TOTAL VOLUME", v: stats ? formatSol(stats.totalVolume) : "—" },
    { k: "TOTAL TRADES", v: stats ? String(stats.totalTrades) : "—" },
  ];

  const calc = useMemo(() => {
    const volume = Number(calcVolume) || 0;
    const stake = Number(calcStake) || 0;
    const dailyToStakers = volume * (feePct / 100) * (stakerSharePct / 100);
    const projectedTotalStaked = poolTotalStaked + stake;
    const share = projectedTotalStaked > 0 ? stake / projectedTotalStaked : 0;
    const dailyEarnings = dailyToStakers * share;
    return {
      dailyToStakers,
      dailyEarnings,
      annualEarnings: dailyEarnings * 365,
    };
  }, [calcVolume, calcStake, poolTotalStaked]);

  const totalPages = Math.max(1, Math.ceil(days.length / PAGE_SIZE));
  const pageRows = days.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="alloy-dash">
      <div className="alloy-kicker">EARN FROM PLATFORM FEES</div>
      <h1 className="alloy-h1-page" style={{ marginBottom: 24 }}>
        Stake {STAKE_TICKER}
      </h1>

      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "flex-start",
          padding: "16px 18px",
          borderRadius: 12,
          border: "1px solid color-mix(in srgb, #e6d4a8 45%, var(--border))",
          background: "color-mix(in srgb, #e6d4a8 10%, var(--bg))",
          marginBottom: 26,
        }}
      >
        <ShieldQuestion size={20} color="#e6d4a8" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontFamily: "var(--alloy-display)", fontSize: 14, letterSpacing: ".02em", textTransform: "uppercase", color: "#e6d4a8", marginBottom: 5 }}>
            Not yet reading real balances
          </div>
          <p className="alloy-p" style={{ margin: 0, fontSize: 13, maxWidth: 640 }}>
            Your stake, pending rewards, APY, and the stake/unstake actions below run on Alloy&apos;s own ledger —
            not the real on-chain staker pool. Real, wallet-connected trades already pay real SOL into that pool
            (verifiable right now, no per-staker accounting exists on-chain yet to divide it up):
          </p>
          <div style={{ marginTop: 10, fontFamily: "var(--alloy-mono)", fontSize: 13 }}>
            <span style={{ color: "color-mix(in srgb, var(--text) 55%, transparent)" }}>Real on-chain staker pool balance: </span>
            <span style={{ color: "var(--text)" }}>
              {onchainStakerPoolLamports === null ? "—" : `${(onchainStakerPoolLamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 18, marginBottom: 26 }}>
        {STATS.map((s) => (
          <div key={s.k} className="alloy-stat-card">
            <div className="alloy-stat-k">{s.k}</div>
            <div className="alloy-stat-v">{s.v}</div>
          </div>
        ))}
      </div>

      <Link
        href="/admin/treasury"
        className="text-xs text-text-dim hover:text-text"
        style={{ display: "block", marginTop: -14, marginBottom: 26 }}
      >
        Treasury admin →
      </Link>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,.62fr) minmax(0,1.38fr)", gap: 22, alignItems: "start", marginBottom: 50 }}>
        <div className="alloy-panel-dark">
          <div className="alloy-tabs" style={{ marginBottom: 20 }}>
            <button
              className={`alloy-tab ${mode === "stake" ? "alloy-tab-active" : ""}`}
              onClick={() => {
                setMode("stake");
                setError(null);
              }}
            >
              Stake
            </button>
            <button
              className={`alloy-tab ${mode === "unstake" ? "alloy-tab-active" : ""}`}
              onClick={() => {
                setMode("unstake");
                setError(null);
              }}
            >
              Unstake
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--alloy-mono)", fontSize: 10.5, letterSpacing: ".12em", color: "color-mix(in srgb, var(--text) 45%, transparent)", marginBottom: 9 }}>
            <span>AMOUNT</span>
            <span>{mode === "stake" ? `${formatCompact(embrBalance)} available` : `${formatCompact(staked)} staked`}</span>
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "center", padding: "13px 14px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--bg)" }}>
            <input
              type="number"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              style={{ flex: 1, minWidth: 0, fontFamily: "var(--alloy-mono)", fontSize: 19, color: "var(--text)", background: "transparent", border: 0, outline: "none" }}
            />
            <button
              data-fx="magnet"
              className="alloy-chip"
              onClick={() => setAmount(String(mode === "stake" ? embrBalance : staked))}
            >
              MAX
            </button>
          </div>

          <div style={{ margin: "18px 0 20px" }}>
            <div className="alloy-row">
              <span className="alloy-row-k">Your stake</span>
              <span className="alloy-row-v">{formatCompact(staked)} {STAKE_TICKER}</span>
            </div>
            <div className="alloy-row">
              <span className="alloy-row-k">Pending rewards</span>
              <span className="alloy-row-v" style={{ color: "#8bc3ab" }}>{formatSol(pendingCore)}</span>
            </div>
            <div className="alloy-row">
              <span className="alloy-row-k">Lifetime claimed</span>
              <span className="alloy-row-v">{formatSol(claimedCore)}</span>
            </div>
          </div>

          {error && <div style={{ color: "#c98a8a", fontSize: 13, marginBottom: 12 }}>{error}</div>}

          <button data-fx="magnet" data-shake="1" disabled={pending} className="alloy-btn-primary" style={{ width: "100%" }} onClick={submit}>
            {pending ? "Submitting…" : mode === "stake" ? `Stake ${STAKE_TICKER}` : `Unstake ${STAKE_TICKER}`}
          </button>
        </div>

        <div className="alloy-panel">
          <div style={{ fontFamily: "var(--alloy-display)", fontSize: 19, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--text)", marginBottom: 14 }}>
            How staking pays out
          </div>
          <p className="alloy-p" style={{ marginBottom: 20 }}>
            Every Token on Alloy pays a {feePct}% trade fee. A share of that fee
            is split pro-rata across everyone staking {STAKE_TICKER}, continuously — including after a Token
            graduates off its bonding curve and starts trading against the protocol-owned pool. Rewards auto-settle
            into your {CURRENCY_TICKER} balance whenever you stake, unstake, or trade. There is no lock-up: unstake
            at any time.
          </p>
          <div className="alloy-row">
            <span className="alloy-row-k">Unlock</span>
            <span className="alloy-row-v">Instant</span>
          </div>
          <div className="alloy-row">
            <span className="alloy-row-k">Reward settlement</span>
            <span className="alloy-row-v">Every stake / unstake / trade</span>
          </div>
          <div className="alloy-row">
            <span className="alloy-row-k">Pool participants</span>
            <span className="alloy-row-v">Every {STAKE_TICKER} staker, pro-rata</span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 18, marginBottom: 26 }}>
        {PLATFORM_STATS.map((s) => (
          <div key={s.k} className="alloy-stat-card">
            <div className="alloy-stat-k">{s.k}</div>
            <div className="alloy-stat-v">{s.v}</div>
          </div>
        ))}
      </div>

      <div className="alloy-panel" style={{ marginBottom: 26 }}>
        <div style={{ fontFamily: "var(--alloy-display)", fontSize: 19, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--text)", marginBottom: 4 }}>
          Cumulative distributions to stakers
        </div>
        <p style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--text) 50%, transparent)", marginBottom: 16 }}>
          Running total of {CURRENCY_TICKER} paid to {STAKE_TICKER} stakers, since launch.
        </p>
        <div style={{ height: 260 }}>
          {series.length > 0 ? (
            <AreaChart data={series} />
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: "color-mix(in srgb, var(--text) 50%, transparent)" }}>
              No distributions yet.
            </div>
          )}
        </div>
      </div>

      <div className="alloy-panel" style={{ marginBottom: 26 }}>
        <div style={{ fontFamily: "var(--alloy-display)", fontSize: 19, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--text)", marginBottom: 4 }}>
          Run the numbers yourself
        </div>
        <p style={{ fontSize: 12.5, color: "color-mix(in srgb, var(--text) 50%, transparent)", marginBottom: 20, maxWidth: 560 }}>
          See what staking {STAKE_TICKER} could earn under a hypothetical daily trading volume, using the actual{" "}
          {feePct}% fee / {stakerSharePct}% staker-share formula, not a projection.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18, marginBottom: 22 }}>
          <label>
            <span className="alloy-label">HYPOTHETICAL DAILY VOLUME ({CURRENCY_TICKER})</span>
            <input
              type="number"
              min={0}
              value={calcVolume}
              onChange={(e) => setCalcVolume(e.target.value)}
              className="alloy-input mono"
            />
          </label>
          <label>
            <span className="alloy-label">YOUR STAKE ({STAKE_TICKER})</span>
            <input
              type="number"
              min={0}
              value={calcStake}
              onChange={(e) => setCalcStake(e.target.value)}
              className="alloy-input mono"
            />
          </label>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>
          <div className="alloy-stat-card">
            <div className="alloy-stat-k">DAILY POOL TO ALL STAKERS</div>
            <div className="alloy-stat-v">{formatSol(calc.dailyToStakers)}</div>
          </div>
          <div className="alloy-stat-card">
            <div className="alloy-stat-k">YOUR EST. DAILY EARNINGS</div>
            <div className="alloy-stat-v up">{formatSol(calc.dailyEarnings)}</div>
          </div>
          <div className="alloy-stat-card">
            <div className="alloy-stat-k">YOUR EST. ANNUAL EARNINGS</div>
            <div className="alloy-stat-v up">{formatSol(calc.annualEarnings)}</div>
          </div>
        </div>
        <p style={{ fontFamily: "var(--alloy-mono)", fontSize: 10, color: "color-mix(in srgb, var(--text) 40%, transparent)", marginTop: 16 }}>
          Illustrative only — assumes constant volume and a fixed total staked pool. Not a forecast.
        </p>
      </div>

      <div className="alloy-table" style={{ marginBottom: 26, overflowX: "auto" }}>
        <div style={{ padding: "20px 24px 8px" }}>
          <div style={{ fontFamily: "var(--alloy-display)", fontSize: 17, letterSpacing: ".02em", textTransform: "uppercase", color: "var(--text)" }}>
            Every distribution, in the ledger
          </div>
          <p style={{ fontSize: 12, color: "color-mix(in srgb, var(--text) 50%, transparent)", marginTop: 4 }}>
            Daily fee flow across every Token on the platform.
          </p>
        </div>
        <div className="alloy-table-head" style={{ gridTemplateColumns: "1.2fr .8fr 1fr 1fr 1fr", minWidth: 540 }}>
          <span>DATE</span>
          <span style={{ textAlign: "right" }}>TRADES</span>
          <span style={{ textAlign: "right" }}>VOLUME</span>
          <span style={{ textAlign: "right" }}>TO STAKERS</span>
          <span style={{ textAlign: "right" }}>TO CREATORS</span>
        </div>
        {pageRows.length === 0 ? (
          <div className="alloy-empty">No trades yet.</div>
        ) : (
          pageRows.map((d) => (
            <div
              key={d.timestamp}
              className="alloy-table-row"
              style={{ gridTemplateColumns: "1.2fr .8fr 1fr 1fr 1fr", minWidth: 540, fontFamily: "var(--alloy-mono)", fontSize: 12.5, color: "var(--text)" }}
            >
              <span>{new Date(d.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
              <span style={{ textAlign: "right" }}>{d.trades}</span>
              <span style={{ textAlign: "right" }}>{formatSol(d.volume)}</span>
              <span style={{ textAlign: "right", color: "#8bc3ab" }}>{formatSol(d.stakerFees)}</span>
              <span style={{ textAlign: "right" }}>{formatSol(d.creatorFees)}</span>
            </div>
          ))
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, fontSize: 11.5, color: "color-mix(in srgb, var(--text) 45%, transparent)" }}>
          <span>
            Showing {days.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, days.length)} of {days.length}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--alloy-mono)" }}>
            <button data-fx="magnet" className="alloy-chip" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
              ‹
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button data-fx="magnet" className="alloy-chip" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
              ›
            </button>
          </div>
        </div>
      </div>

      <div className="alloy-panel" style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "var(--alloy-display)", fontSize: 22, letterSpacing: ".01em", textTransform: "uppercase", color: "var(--text)", marginBottom: 10 }}>
          Why we built {STAKE_TICKER}
        </div>
        <p className="alloy-p" style={{ maxWidth: 700 }}>
          Launchpads like pump.fun keep 100% of their trade fees for themselves, and even burn their own liquidity
          position when a token graduates — permanently forfeiting any future revenue from it. We think the
          platform&apos;s revenue should belong to the people holding its token, not just the company running it.
          So instead of a buyback-and-burn — which only pays off if the token&apos;s price goes up — {STAKE_TICKER}{" "}
          stakers get paid directly, in {CURRENCY_TICKER}, the moment fees come in.
        </p>
        <div style={{ display: "flex", gap: 34, marginTop: 10 }}>
          <div>
            <div className="alloy-stat-v" style={{ fontSize: 24 }}>{feePct}%</div>
            <div className="alloy-stat-k">FEE PER TRADE</div>
          </div>
          <div>
            <div className="alloy-stat-v up" style={{ fontSize: 24 }}>{stakerSharePct}%</div>
            <div className="alloy-stat-k">OF EVERY FEE, TO STAKERS</div>
          </div>
        </div>
      </div>

      <p style={{ fontFamily: "var(--alloy-mono)", fontSize: 10, lineHeight: 1.6, color: "color-mix(in srgb, var(--text) 35%, transparent)" }}>
        Methodology: figures on this page are computed from Alloy&apos;s own ledger — see the notice above for what
        that means and the real on-chain number it doesn&apos;t yet replace.
      </p>
    </div>
  );
}
