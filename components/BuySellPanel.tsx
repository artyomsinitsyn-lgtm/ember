"use client";

import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { formatCompact, formatUsd } from "@/lib/format";
import { CURRENCY_TICKER, STAKE_TICKER } from "@/lib/constants";
import { getProgram, LAMPORTS_PER_SOL, TOKEN_UNIT, SOLANA_RPC_URL } from "@/lib/onchain/program";
import { buildBuyTx, buildSellTx } from "@/lib/onchain/actions";
import { quoteBuyOnCurve, quoteSellOnCurve, quoteBuyOnPool, quoteSellOnPool, currentPrice } from "@/lib/bondingCurve";

interface CurveInfo {
  vCore: number;
  vToken: number;
  realCore: number;
  realToken: number;
  poolCore: number | null;
  poolToken: number | null;
}

const SLIPPAGE_PRESETS = [0.5, 1, 2];
const DEFAULT_SLIPPAGE_PCT = 1;

/** Solana Explorer link for a given signature, pointed at whichever cluster this app is
 * actually configured to use — a hardcoded ?cluster=devnet would silently point at the
 * wrong explorer the moment NEXT_PUBLIC_SOLANA_RPC_URL changes (e.g. to mainnet). */
function explorerTxUrl(signature: string): string {
  if (SOLANA_RPC_URL.includes("devnet")) return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  if (SOLANA_RPC_URL.includes("testnet")) return `https://explorer.solana.com/tx/${signature}?cluster=testnet`;
  if (SOLANA_RPC_URL.includes("mainnet")) return `https://explorer.solana.com/tx/${signature}`;
  return `https://explorer.solana.com/tx/${signature}?cluster=custom&customUrl=${encodeURIComponent(SOLANA_RPC_URL)}`;
}

/** Translates wallet/RPC/on-chain-program failures into something a first-time trader can
 * actually act on. Anchor program errors typically surface in `err.logs`, not `err.message`
 * — e.g. a plain "failed to send transaction" with the real reason ("SlippageExceeded",
 * "TradingPaused") buried in a simulation log line — so both are scanned. */
function translateTradeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const logs: string[] = (err && typeof err === "object" && "logs" in err ? (err as { logs?: string[] }).logs : undefined) ?? [];
  const haystack = `${message} ${logs.join(" ")}`.toLowerCase();

  if (haystack.includes("user rejected") || haystack.includes("rejected the request")) {
    return "You closed the request in your wallet — no funds moved.";
  }
  if (haystack.includes("slippageexceeded") || haystack.includes("slippage")) {
    return "Price moved more than your slippage tolerance allows. Try a smaller amount or raise the slippage tolerance.";
  }
  if (haystack.includes("tradingpaused")) {
    return "Trading is paused platform-wide right now — try again later.";
  }
  if (
    haystack.includes("insufficient") ||
    haystack.includes("debit an account") ||
    haystack.includes("custom program error: 0x1")
  ) {
    return "Not enough balance for this trade — remember to leave a little SOL for network fees.";
  }
  if (haystack.includes("blockhash") || haystack.includes("not confirmed") || haystack.includes("timed out")) {
    return "The transaction didn't confirm in time. Check your wallet or a Solana explorer before retrying — it may have gone through.";
  }
  if (haystack.includes("fetch failed") || haystack.includes("network") || haystack.includes("failed to fetch")) {
    return "Network error reaching the Solana RPC — check your connection and try again.";
  }
  return "Trade failed — please try again.";
}

export default function BuySellPanel({
  tokenId,
  creatorId,
  walletId,
  ticker,
  coreBalance,
  tokenBalance,
  curve,
  graduated,
  onTraded,
}: {
  tokenId: string;
  creatorId: string;
  walletId: string;
  ticker: string;
  coreBalance: number;
  tokenBalance: number;
  curve?: CurveInfo | null;
  graduated?: boolean;
  onTraded: () => void;
}) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const onchainMint = (() => {
    try {
      return new PublicKey(tokenId);
    } catch {
      return null;
    }
  })();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<"wallet" | "confirming" | "recording" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ signature: string; side: "buy" | "sell" } | null>(null);
  const [slippagePct, setSlippagePct] = useState(DEFAULT_SLIPPAGE_PCT);
  const [showSlippage, setShowSlippage] = useState(false);

  // The wallet's *actual* spendable SOL, not wallets.core_balance — that DB column only ever
  // accumulates a connected wallet's creator-fee income (see trade/confirm route), which is
  // unrelated to what they can actually afford to spend on a real on-chain trade. Using it
  // here used to show a wildly wrong "available" figure and feed the Max button a fictional
  // amount for anyone trading on-chain.
  const [liveSolBalance, setLiveSolBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!onchainMint || !wallet.publicKey) return;
    let cancelled = false;
    async function refresh() {
      const lamports = await connection.getBalance(wallet.publicKey!).catch(() => null);
      if (!cancelled && lamports !== null) setLiveSolBalance(lamports / LAMPORTS_PER_SOL);
    }
    refresh();
    const id = setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onchainMint?.toBase58(), wallet.publicKey?.toBase58(), connection]);

  // Gated on wallet.publicKey here (rather than resetting liveSolBalance to null on
  // disconnect inside the effect above) so disconnecting can't leave a stale fetched
  // balance displayed as if it were still live.
  const availableForBuy = onchainMint && wallet.publicKey ? liveSolBalance : coreBalance;

  const amountValue = Number(amount);
  const validAmount = Number.isFinite(amountValue) && amountValue > 0;

  // Live quote preview: recomputed from the same on-chain-mirrored curve/pool state and the
  // exact math the Rust program uses (see lib/bondingCurve.ts), so this tracks reality
  // instead of guessing — no extra RPC round-trip needed per keystroke.
  const quote = useMemo(() => {
    if (!curve || !validAmount) return null;
    try {
      if (side === "buy") {
        return graduated && curve.poolCore != null && curve.poolToken != null
          ? quoteBuyOnPool({ poolCore: curve.poolCore, poolToken: curve.poolToken }, amountValue)
          : quoteBuyOnCurve(curve, amountValue);
      }
      const tokensIn = (amountValue / 100) * tokenBalance;
      if (tokensIn <= 0) return null;
      return graduated && curve.poolCore != null && curve.poolToken != null
        ? quoteSellOnPool({ poolCore: curve.poolCore, poolToken: curve.poolToken }, tokensIn)
        : quoteSellOnCurve(curve, tokensIn);
    } catch {
      return null;
    }
  }, [curve, graduated, side, amountValue, validAmount, tokenBalance]);

  const priceNow = curve
    ? graduated && curve.poolCore != null && curve.poolToken != null
      ? curve.poolCore / curve.poolToken
      : currentPrice(curve.vCore, curve.vToken)
    : null;

  const priceImpactPct = useMemo(() => {
    if (!quote || priceNow === null || priceNow === 0) return null;
    const newPrice =
      "newPoolCore" in quote ? quote.newPoolCore / quote.newPoolToken : quote.newVCore / quote.newVToken;
    return ((newPrice - priceNow) / priceNow) * 100;
  }, [quote, priceNow]);

  const quickAmountsBuy = [25, 50, 75, 100];
  const quickAmountsSell = [25, 50, 75, 100];

  function fillBuyPercent(pct: number) {
    const base = availableForBuy ?? 0;
    const value = (base * pct) / 100;
    // Leave a hair of headroom off 100% so "Max" doesn't try to spend the last lamports a
    // real wallet needs for its own network fee and (if this is its first buy of this
    // token) new associated-token-account rent — both paid from the same SOL balance,
    // on top of the trade amount itself.
    const safety = pct === 100 ? Math.max(0, value - 0.003) : value;
    setAmount(safety > 0 ? safety.toFixed(6).replace(/\.?0+$/, "") : "0");
  }

  function submitOnchain(mint: PublicKey) {
    return (async () => {
      if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) {
        setVisible(true);
        return;
      }
      const value = Number(amount);
      const creator = new PublicKey(creatorId);
      const program = getProgram(connection, {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions:
          wallet.signAllTransactions ?? (async (txs) => Promise.all(txs.map((t) => wallet.signTransaction!(t)))),
      });

      const slippageFraction = slippagePct / 100;
      const minTokensOut =
        side === "buy" && quote && "tokensOut" in quote
          ? BigInt(Math.max(0, Math.floor(quote.tokensOut * (1 - slippageFraction) * TOKEN_UNIT)))
          : BigInt(1);
      const minSolOut =
        side === "sell" && quote && "coreOutNet" in quote
          ? BigInt(Math.max(0, Math.floor(quote.coreOutNet * (1 - slippageFraction) * LAMPORTS_PER_SOL)))
          : BigInt(1);

      const tx =
        side === "buy"
          ? await buildBuyTx(program, wallet.publicKey, mint, creator, BigInt(Math.round(value * LAMPORTS_PER_SOL)), minTokensOut)
          : await buildSellTx(
              program,
              wallet.publicKey,
              mint,
              creator,
              BigInt(Math.round(((value / 100) * tokenBalance) * TOKEN_UNIT)),
              minSolOut
            );

      setStage("wallet");
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = wallet.publicKey;

      const signature = await wallet.sendTransaction(tx, connection);
      setStage("confirming");
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      setStage("recording");
      const res = await fetch(`/api/tokens/${tokenId}/trade/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, side }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Trade confirmation failed");

      const lamports = await connection.getBalance(wallet.publicKey).catch(() => null);
      if (lamports !== null) setLiveSolBalance(lamports / LAMPORTS_PER_SOL);

      return signature;
    })();
  }

  async function submit() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount");
      return;
    }
    if (side === "sell" && value > 100) {
      setError("Enter a percentage between 0 and 100");
      return;
    }
    if (side === "buy" && availableForBuy !== null && value > availableForBuy) {
      setError(`You only have ${formatUsd(availableForBuy)} available`);
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    try {
      if (onchainMint) {
        const signature = await submitOnchain(onchainMint);
        // undefined means submitOnchain just opened the "connect wallet" modal instead of
        // trading (wallet wasn't connected yet) — nothing happened on-chain, so leave the
        // typed amount in place and skip the reload instead of acting like a trade occurred.
        if (!signature) return;
        setResult({ signature, side });
      } else {
        const amt = side === "sell" ? (value / 100) * tokenBalance : value;
        const res = await fetch(`/api/tokens/${tokenId}/trade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletId, side, amount: amt }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Trade failed");
      }
      setAmount("");
      onTraded();
    } catch (err) {
      setError(translateTradeError(err));
    } finally {
      setPending(false);
      setStage(null);
    }
  }

  const stageLabel =
    stage === "wallet"
      ? "Confirm in wallet…"
      : stage === "confirming"
        ? "Confirming on-chain…"
        : stage === "recording"
          ? "Recording trade…"
          : "Submitting…";

  const holdingValue = priceNow !== null ? tokenBalance * priceNow : null;

  return (
    <div className="card p-4 flex flex-col gap-4">
      <div className="flex rounded-full bg-bg-elevated p-1">
        <button
          onClick={() => {
            setSide("buy");
            setAmount("");
            setError(null);
            setResult(null);
          }}
          className={`glow-hover glow-up press-effect flex-1 py-1.5 rounded-full text-sm font-medium transition-colors ${
            side === "buy" ? "bg-up text-black" : "text-text-dim"
          }`}
        >
          Buy
        </button>
        <button
          onClick={() => {
            setSide("sell");
            setAmount("");
            setError(null);
            setResult(null);
          }}
          className={`glow-hover glow-down press-effect flex-1 py-1.5 rounded-full text-sm font-medium transition-colors ${
            side === "sell" ? "bg-down text-black" : "text-text-dim"
          }`}
        >
          Sell
        </button>
      </div>

      {/* Holdings visibility: always shown, regardless of buy/sell, so a first-time trader
          doesn't have to flip to Sell just to see what they already hold. */}
      <div className="flex items-center justify-between text-xs bg-bg-elevated rounded-lg px-3 py-2">
        <span className="text-text-dim">You hold</span>
        <span className="mono tabular-nums">
          {formatCompact(tokenBalance)} {ticker}
          {holdingValue !== null && holdingValue > 0 && (
            <span className="text-text-dim"> · {formatUsd(holdingValue)}</span>
          )}
        </span>
      </div>

      <div>
        <div className="flex justify-between text-xs text-text-dim mb-1">
          <span>Amount {side === "sell" && "(% of holdings)"}</span>
          <span>
            {side === "buy"
              ? availableForBuy !== null
                ? `${formatUsd(availableForBuy)} available`
                : "Connect a wallet"
              : `${formatCompact(tokenBalance)} ${ticker} available`}
          </span>
        </div>
        <div className="relative">
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={side === "buy" ? `0.0 ${CURRENCY_TICKER}` : "0-100%"}
            className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2.5 text-sm mono outline-none focus:border-accent pr-16"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-dim">
            {side === "buy" ? CURRENCY_TICKER : "%"}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        {(side === "buy" ? quickAmountsBuy : quickAmountsSell).map((pct) => (
          <button
            key={pct}
            onClick={() => (side === "buy" ? fillBuyPercent(pct) : setAmount(String(pct)))}
            className="glow-hover press-effect flex-1 text-xs py-1.5 rounded-lg bg-bg-elevated text-text-dim hover:text-text transition-colors"
          >
            {pct === 100 ? "Max" : `${pct}%`}
          </button>
        ))}
      </div>

      {/* Live quote preview */}
      {validAmount && (
        <div className="flex flex-col gap-1.5 text-xs bg-bg-elevated rounded-lg px-3 py-2.5">
          {quote ? (
            <>
              <div className="flex justify-between">
                <span className="text-text-dim">Estimated received</span>
                <span className="mono tabular-nums">
                  {side === "buy" && "tokensOut" in quote
                    ? `${formatCompact(quote.tokensOut)} ${ticker}`
                    : "coreOutNet" in quote
                      ? formatUsd(quote.coreOutNet)
                      : "—"}
                </span>
              </div>
              {priceImpactPct !== null && (
                <div className="flex justify-between">
                  <span className="text-text-dim">Price impact</span>
                  <span className={`mono tabular-nums ${Math.abs(priceImpactPct) > 5 ? "text-down" : "text-text-dim"}`}>
                    {priceImpactPct >= 0 ? "+" : ""}
                    {priceImpactPct.toFixed(2)}%
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-dim">Min. received (slippage {slippagePct}%)</span>
                <span className="mono tabular-nums">
                  {side === "buy" && "tokensOut" in quote
                    ? `${formatCompact(quote.tokensOut * (1 - slippagePct / 100))} ${ticker}`
                    : "coreOutNet" in quote
                      ? formatUsd(quote.coreOutNet * (1 - slippagePct / 100))
                      : "—"}
                </span>
              </div>
            </>
          ) : (
            <span className="text-text-dim">Quote unavailable — trading without a slippage guard.</span>
          )}
        </div>
      )}

      {onchainMint && (
        <div className="flex items-center justify-between text-xs">
          <button
            onClick={() => setShowSlippage((v) => !v)}
            className="glow-hover press-effect text-text-dim hover:text-text"
          >
            Slippage tolerance: {slippagePct}%
          </button>
        </div>
      )}
      {onchainMint && showSlippage && (
        <div className="flex gap-2">
          {SLIPPAGE_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setSlippagePct(p)}
              className={`glow-hover press-effect flex-1 text-xs py-1.5 rounded-lg transition-colors ${
                slippagePct === p ? "bg-accent text-black" : "bg-bg-elevated text-text-dim hover:text-text"
              }`}
            >
              {p}%
            </button>
          ))}
          <input
            type="number"
            min={0.1}
            max={50}
            step="any"
            value={slippagePct}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) setSlippagePct(v);
            }}
            className="w-16 bg-bg-elevated border border-border rounded-lg px-2 text-xs mono outline-none focus:border-accent text-center"
          />
        </div>
      )}

      {error && <div className="text-xs text-down">{error}</div>}

      {result && (
        <div className="text-xs text-up bg-up/10 rounded-lg px-3 py-2 flex items-center justify-between gap-2">
          <span>{result.side === "buy" ? "Buy" : "Sell"} confirmed.</span>
          <a
            href={explorerTxUrl(result.signature)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline shrink-0"
          >
            View transaction
          </a>
        </div>
      )}

      <button
        onClick={submit}
        disabled={pending}
        className={`btn-shine glow-hover press-effect py-2.5 rounded-full text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ${
          side === "buy" ? "bg-up text-black glow-up" : "bg-down text-black glow-down"
        }`}
      >
        {pending ? stageLabel : side === "buy" ? `Buy $${ticker}` : `Sell $${ticker}`}
      </button>

      <p className="text-[11px] text-text-dim leading-relaxed">
        {graduated ? "0.25%" : "1%"} fee: 40% to the creator, 40% split across {STAKE_TICKER} stakers, 20% to
        treasury.
      </p>
    </div>
  );
}
