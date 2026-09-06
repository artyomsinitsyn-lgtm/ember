"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, Lock, X as XIcon, Send, Globe, Copy, Check, Pencil } from "lucide-react";
import TradingChart, { type Candle } from "@/components/TradingChart";
import BuySellPanel from "@/components/BuySellPanel";
import ProgressBar from "@/components/ProgressBar";
import PrismCard from "@/components/PrismCard";
import TokenCallouts from "@/components/TokenCallouts";
import { formatSol, formatCompact, formatPrice, formatPct, timeAgo } from "@/lib/format";
import type { SerializedToken } from "@/lib/serialize";
import type { RugAssessment } from "@/lib/rugDetection";
import { GRADUATION_CORE_RAISED } from "@/lib/constants";
import TokenIcon from "@/components/TokenIcon";
import GraduatedChip from "@/components/GraduatedChip";
import WalletLink from "@/components/WalletLink";
import ReportButton from "@/components/ReportButton";
import CreatorSummaryRow from "@/components/CreatorSummaryRow";
import TokenTransparencyPanel from "@/components/TokenTransparencyPanel";
import ProjectAboutPanel from "@/components/ProjectAboutPanel";
import RoadmapPanel from "@/components/RoadmapPanel";
import EditProjectPanel from "@/components/EditProjectPanel";
import { useConnectedWalletId } from "@/lib/useConnectedWallet";
import type { SerializedProject } from "@/lib/projects";
import type { CreatorReputation } from "@/lib/reputation";

interface TradeRow {
  id: string;
  wallet_id: string;
  side: string;
  core_amount: number;
  token_amount: number;
  price: number;
  wallet_name: string;
  wallet_avatar: string;
  created_at: number;
}

interface HolderRow {
  walletId: string;
  walletName: string;
  walletAvatar: string;
  amountHeld: number;
  positionValue: number;
  spent: number;
  netPnl: number;
  pctSupply: number;
}

const INTERVALS = ["15s", "1m", "5m", "15m", "1h"] as const;
type Interval = (typeof INTERVALS)[number];

export default function TokenPageClient({ id }: { id: string }) {
  const walletId = useConnectedWalletId();
  const [token, setToken] = useState<SerializedToken | null>(null);
  const [rugRisk, setRugRisk] = useState<RugAssessment | null>(null);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [project, setProject] = useState<SerializedProject | null>(null);
  const [creatorReputation, setCreatorReputation] = useState<CreatorReputation | null>(null);
  const [curve, setCurve] = useState<{
    vCore: number;
    vToken: number;
    realCore: number;
    realToken: number;
    poolCore: number | null;
    poolToken: number | null;
  } | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  // Real trades on this demo economy are seeded minutes apart, not seconds — a 15s bucket
  // almost always contains exactly one trade, so open/close land on the same price and the
  // candle has no wick at all. 15m buckets reliably catch 2+ trades, so the wicks are real
  // price excursions, not a rendering choice. Still switchable via the interval buttons.
  const [interval, setInterval_] = useState<Interval>("15m");
  const [coreBalance, setCoreBalance] = useState(0);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [copied, setCopied] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  async function copyAddress() {
    await navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function startEditingDescription() {
    setDescriptionDraft(token?.description ?? "");
    setDescriptionError(null);
    setEditingDescription(true);
  }

  async function saveDescription() {
    setSavingDescription(true);
    setDescriptionError(null);
    try {
      const res = await fetch(`/api/tokens/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descriptionDraft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setEditingDescription(false);
      await load();
    } catch (err) {
      setDescriptionError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingDescription(false);
    }
  }

  // Bumped on every load() call so a slow response can never overwrite a fresher one —
  // without this, a trade-triggered refetch that lands out of order stomps newer data
  // and the page can appear to freeze or blank out mid-update.
  const requestSeq = useRef(0);
  const chartSeq = useRef(0);

  // Token info, trades, holders, and wallet balance stay on the fast/reactive path (SSE
  // on every trade, plus a 15s fallback poll). The candlestick chart is deliberately split
  // out onto its own fixed 30s interval below — without that split, every trade's SSE
  // message was also re-fetching candles within ~200ms, so the chart visibly redrew on
  // every single trade instead of settling into a calm, predictable cadence.
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const [tokenRes, walletRes] = await Promise.all([
        fetch(`/api/tokens/${id}`),
        fetch(`/api/wallet/${walletId}`),
      ]);
      if (seq !== requestSeq.current) return;
      if (tokenRes.ok) {
        const data = await tokenRes.json();
        setToken(data.token);
        setRugRisk(data.rugRisk);
        setTrades(data.trades);
        setHolders(data.holders);
        setProject(data.project);
        setCreatorReputation(data.creatorReputation);
        setCurve(data.curve);
      }
      if (walletRes.ok) {
        const data = await walletRes.json();
        setCoreBalance(data.wallet.coreBalance);
        const holding = data.holdings.find((h: { tokenId: string }) => h.tokenId === id);
        setTokenBalance(holding?.amount ?? 0);
      }
    } catch {
      // transient network hiccup — the 15s fallback poll or next trade event will retry
    }
  }, [id, walletId]);

  const loadChart = useCallback(async () => {
    const seq = ++chartSeq.current;
    try {
      const res = await fetch(`/api/tokens/${id}/chart?interval=${interval}`);
      if (seq !== chartSeq.current) return;
      if (res.ok) {
        const data = await res.json();
        setCandles(data.candles);
      }
    } catch {
      // next 30s tick (or the interval-switch effect below) will retry
    }
  }, [id, interval]);

  useEffect(() => {
    // Wrapped in a local function so the lint rule can see this effect only ever
    // triggers an (async, state-setting-after-await) fetch, never a synchronous
    // setState — calling the useCallback'd `load` reference directly here reads as
    // ambiguous to the analyzer and gets flagged as a false positive.
    function run() {
      load();
    }
    run();
    // Slow fallback poll in case the SSE connection drops; trades themselves arrive instantly below.
    const interval = setInterval(run, 15000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function run() {
      loadChart();
    }
    run();
    const interval = setInterval(run, 30000);
    return () => clearInterval(interval);
  }, [loadChart]);

  useEffect(() => {
    const source = new EventSource(`/api/tokens/${id}/stream`);
    // Trades can arrive in bursts, so debounce instead of firing one refetch per message.
    let debounce: ReturnType<typeof setTimeout>;
    source.onmessage = () => {
      clearTimeout(debounce);
      debounce = setTimeout(load, 200);
    };
    return () => {
      clearTimeout(debounce);
      source.close();
    };
  }, [id, load]);

  if (!token) {
    return <div className="text-text-dim text-sm py-12 text-center">Loading…</div>;
  }

  const change = compute24hChange(candles, token.price);
  const elevatedRisk = rugRisk && rugRisk.riskLevel !== "low";

  return (
    <div className="alloy-dash flex flex-col gap-6">
      <Link href="/ideas" className="text-sm text-text-dim hover:text-text w-fit">
        ← Tokens
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-bg-elevated flex items-center justify-center text-3xl overflow-hidden">
            <TokenIcon image={token.image} size={56} textSize="text-3xl" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">${token.ticker}</h1>
              {token.graduated && <GraduatedChip />}
              {rugRisk && rugRisk.riskLevel === "low" && (
                <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-up/15 text-up">
                  <ShieldCheck size={11} />
                  LOW RISK
                </span>
              )}
            </div>
            <div className="text-sm text-text-dim">
              {token.name} · by{" "}
              <WalletLink walletId={token.creatorId}>{token.creatorName}</WalletLink> ·{" "}
              {timeAgo(token.createdAt)}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-4">
          <div className="flex gap-6 mono text-right">
            <div>
              <div className="text-[10px] text-text-dim uppercase tracking-wide">Price</div>
              <div className="font-medium tabular-nums">{formatPrice(token.price)} SOL</div>
              {change && (
                <div className={`text-xs tabular-nums ${change.pct >= 0 ? "text-up" : "text-down"}`}>
                  {change.pct >= 0 ? "+" : ""}
                  {change.pct.toFixed(1)}% {change.sinceLaunch ? "since launch" : "24h"}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] text-text-dim uppercase tracking-wide">Market Cap</div>
              <div className="font-medium tabular-nums">{formatSol(token.marketCap)}</div>
            </div>
          </div>
          <ReportButton targetType="token" targetId={id} />
        </div>
      </div>

      {creatorReputation && (
        <CreatorSummaryRow
          creatorId={token.creatorId}
          creatorName={token.creatorName}
          creatorVerified={token.creatorVerified}
          reputation={creatorReputation}
        />
      )}

      {editingDescription ? (
        <div className="flex flex-col gap-2 max-w-2xl">
          <textarea
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value.slice(0, 280))}
            rows={3}
            placeholder="What is this token about?"
            className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-none"
          />
          {descriptionError && <div className="text-xs text-down">{descriptionError}</div>}
          <div className="flex gap-2">
            <button
              onClick={saveDescription}
              disabled={savingDescription}
              className="btn-shine glow-hover press-effect bg-accent text-black font-medium px-3 py-1.5 rounded-full text-xs hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {savingDescription ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => setEditingDescription(false)}
              className="glow-hover press-effect bg-bg-elevated border border-border font-medium px-3 py-1.5 rounded-full text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : token.description ? (
        <div className="flex items-start gap-2 max-w-2xl">
          <p className="text-sm text-text-dim">{token.description}</p>
          {walletId === token.creatorId && (
            <button
              onClick={startEditingDescription}
              aria-label="Edit description"
              className="glow-hover press-effect shrink-0 p-1 rounded-full text-text-dim hover:text-text"
            >
              <Pencil size={12} />
            </button>
          )}
        </div>
      ) : (
        walletId === token.creatorId && (
          <button
            onClick={startEditingDescription}
            className="glow-hover press-effect text-xs text-text-dim hover:text-text w-fit flex items-center gap-1.5"
          >
            <Pencil size={12} />
            Add a description
          </button>
        )
      )}

      {token.isProject && project && <ProjectAboutPanel project={project} />}

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={copyAddress}
          className="glow-hover press-effect card px-3 py-1.5 flex items-center gap-2 text-xs w-fit max-w-full"
        >
          <span className="mono truncate">{id}</span>
          {copied ? <Check size={13} className="text-up shrink-0" /> : <Copy size={13} className="text-text-dim shrink-0" />}
        </button>
        {token.twitter && (
          <a
            href={token.twitter}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X / Twitter"
            className="glow-hover press-effect card p-2 flex items-center justify-center text-text-dim hover:text-text"
          >
            <XIcon size={14} />
          </a>
        )}
        {token.telegram && (
          <a
            href={token.telegram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Telegram"
            className="glow-hover press-effect card p-2 flex items-center justify-center text-text-dim hover:text-text"
          >
            <Send size={14} />
          </a>
        )}
        {token.website && (
          <a
            href={token.website}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Website"
            className="glow-hover press-effect card p-2 flex items-center justify-center text-text-dim hover:text-text"
          >
            <Globe size={14} />
          </a>
        )}
      </div>

      <div className="card p-3 flex items-center gap-2 text-xs text-text-dim max-w-2xl">
        <Lock size={13} className="shrink-0" />
        No creator pre-allocation — <WalletLink walletId={token.creatorId}>{token.creatorName}</WalletLink>{" "}
        buys on the same open curve as everyone else, from token zero.
      </div>

      {walletId === token.creatorId && (
        <EditProjectPanel tokenId={id} project={project} onSaved={load} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="flex flex-col gap-4">
          {token.isProject && curve && rugRisk && (
            <TokenTransparencyPanel
              creatorId={token.creatorId}
              graduated={token.graduated}
              curve={curve}
              holders={holders}
              rugRisk={rugRisk}
            />
          )}

          {!token.isProject && elevatedRisk && rugRisk && (
            <div className="card p-4 flex flex-col gap-3 border-down/30">
              <div className="flex items-center gap-2">
                <ShieldAlert size={16} className={rugRisk.riskLevel === "high" ? "text-down" : "text-accent"} />
                <h2 className="text-sm font-medium">
                  Rug Risk:{" "}
                  <span className={rugRisk.riskLevel === "high" ? "text-down" : "text-accent"}>
                    {rugRisk.riskLevel === "high" ? "High" : "Medium"}
                  </span>
                </h2>
              </div>
              <p className="text-xs text-text-dim">
                Largest single wallet holds {formatPct(rugRisk.topWalletPct / 100)} of circulating supply — on its
                own, that can look safe. Clustering wallets by shared funding and coordinated buy timing tells a
                different story:
              </p>
              <div className="flex flex-col gap-2">
                {rugRisk.clusters.map((c, i) => (
                  <div key={i} className="bg-bg-elevated rounded-lg p-3 text-xs flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {c.reason === "shared_funding" ? "Shared funding source" : "Coordinated buy timing"}
                      </span>
                      <span className="mono text-down">{formatPct(c.combinedPct / 100)} combined</span>
                    </div>
                    <p className="text-text-dim">{c.detail}</p>
                    <p className="text-text-dim truncate">Wallets: {c.walletNames.join(", ")}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-text-dim border-t border-border pt-2">
                This flags patterns for you to weigh before buying — it can&apos;t undo a sale that already
                happened on chain, and a flag here is not a guarantee this token will or won&apos;t rug.
              </p>
            </div>
          )}

          <div className="card p-4 h-[400px] flex flex-col gap-3">
            <div className="flex items-center gap-1 shrink-0">
              {INTERVALS.map((iv) => (
                <button
                  key={iv}
                  onClick={() => setInterval_(iv)}
                  className={`press-effect px-2.5 py-1 rounded-md text-[11px] font-medium mono transition-colors ${
                    interval === iv ? "bg-bg-elevated text-text" : "text-text-dim hover:text-text"
                  }`}
                >
                  {iv}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0">
              <TradingChart candles={candles} />
            </div>
          </div>

          <PrismCard className="card p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-text-dim">
                {token.graduated ? "Graduated to Alloy Pool" : "Bonding curve progress"}
              </span>
              <span className="mono tabular-nums">{formatPct(token.progress)}</span>
            </div>
            <ProgressBar value={token.progress} graduated={token.graduated} />
            <div className="text-xs text-text-dim mt-2">
              {formatSol(token.realCoreRaised)} raised
              {!token.graduated && ` · graduates at ${GRADUATION_CORE_RAISED} SOL, liquidity becomes a protocol-owned pool`}
            </div>
          </PrismCard>

          {token.isProject && project && <RoadmapPanel milestones={project.roadmap} />}

          <div className="card p-4">
            <h2 className="text-sm font-medium mb-3">Recent Trades</h2>
            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto scrollbar-thin">
              {trades.length === 0 && <div className="text-xs text-text-dim">No trades yet.</div>}
              {trades.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span className="w-5 h-5 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0 bg-bg-elevated">
                        <TokenIcon image={t.wallet_avatar} size={20} textSize="text-sm" />
                      </span>
                      <WalletLink walletId={t.wallet_id} className="truncate">
                        <span className="truncate text-text-dim">{t.wallet_name}</span>
                      </WalletLink>
                    </span>
                    <span className={t.side === "buy" ? "text-up" : "text-down"}>{t.side}</span>
                  </div>
                  <div className="mono text-text-dim shrink-0">
                    {formatCompact(t.token_amount)} · {timeAgo(t.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-medium mb-3">Top Holders</h2>
            <div className="grid grid-cols-[24px_1fr_auto_auto_auto] gap-x-3 gap-y-2 text-xs items-center">
              <span className="text-text-dim" />
              <span className="text-text-dim">Holder</span>
              <span className="text-text-dim text-right">Position</span>
              <span className="text-text-dim text-right">PnL</span>
              <span className="text-text-dim text-right">% supply</span>
              {holders.map((h, i) => (
                <Fragment key={h.walletId}>
                  <span className="text-text-dim">{i + 1}</span>
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="w-5 h-5 rounded-full overflow-hidden inline-flex items-center justify-center shrink-0 bg-bg-elevated">
                      <TokenIcon image={h.walletAvatar} size={20} textSize="text-sm" />
                    </span>
                    <WalletLink walletId={h.walletId} className="min-w-0">
                      <span className="text-text-dim truncate">{h.walletName}</span>
                    </WalletLink>
                  </span>
                  <span className="mono text-right tabular-nums">{formatSol(h.positionValue)}</span>
                  <span className={`mono text-right tabular-nums ${h.netPnl >= 0 ? "text-up" : "text-down"}`}>
                    {formatSol(h.netPnl, { showPlus: true })}
                  </span>
                  <span className="mono text-right tabular-nums text-text-dim">{h.pctSupply.toFixed(2)}%</span>
                </Fragment>
              ))}
              {holders.length === 0 && (
                <div className="col-span-5 text-text-dim py-2 text-center">No holders yet.</div>
              )}
            </div>
          </div>

          <TokenCallouts tokenId={id} />
        </div>

        <div>
          <BuySellPanel
            tokenId={id}
            creatorId={token.creatorId}
            walletId={walletId}
            ticker={token.ticker}
            coreBalance={coreBalance}
            tokenBalance={tokenBalance}
            curve={curve}
            graduated={token.graduated}
            onTraded={load}
          />
        </div>
      </div>
    </div>
  );
}

/** Falls back to "since launch" when there isn't 24h of trade history yet, rather than
 * labeling a 3-hour-old token's total move as a "24h change". */
function compute24hChange(candles: Candle[], price: number): { pct: number; sinceLaunch: boolean } | null {
  if (candles.length === 0) return null;
  const cutoff = Date.now() / 1000 - 86400;
  const oldEnough = candles[0].time <= cutoff;
  let baseline = candles[0].close;
  if (oldEnough) {
    for (const c of candles) {
      if (c.time <= cutoff) baseline = c.close;
      else break;
    }
  }
  if (baseline <= 0) return null;
  return { pct: ((price - baseline) / baseline) * 100, sinceLaunch: !oldEnough };
}
