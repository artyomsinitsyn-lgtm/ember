"use client";

import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { formatCompact, formatUsd } from "@/lib/format";
import { CURRENCY_TICKER, STAKE_TICKER } from "@/lib/constants";
import { getProgram, LAMPORTS_PER_SOL, TOKEN_UNIT } from "@/lib/onchain/program";
import { buildBuyTx, buildSellTx } from "@/lib/onchain/actions";

export default function BuySellPanel({
  tokenId,
  creatorId,
  walletId,
  ticker,
  coreBalance,
  tokenBalance,
  onTraded,
}: {
  tokenId: string;
  creatorId: string;
  walletId: string;
  ticker: string;
  coreBalance: number;
  tokenBalance: number;
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
  const [error, setError] = useState<string | null>(null);

  const quickAmounts = side === "buy" ? [1, 5, 10, 25] : [0.25, 0.5, 0.75, 1];

  async function submitOnchain(mint: PublicKey) {
    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) {
      setVisible(true);
      return;
    }
    const value = Number(amount);
    const creator = new PublicKey(creatorId);
    const program = getProgram(connection, {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions: wallet.signAllTransactions ?? (async (txs) => Promise.all(txs.map((t) => wallet.signTransaction!(t)))),
    });

    const tx =
      side === "buy"
        ? await buildBuyTx(
            program,
            wallet.publicKey,
            mint,
            creator,
            BigInt(Math.round(value * LAMPORTS_PER_SOL)),
            BigInt(1)
          )
        : await buildSellTx(
            program,
            wallet.publicKey,
            mint,
            creator,
            BigInt(Math.round(((value / 100) * tokenBalance) * TOKEN_UNIT)),
            BigInt(1)
          );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;

    const signature = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

    const res = await fetch(`/api/tokens/${tokenId}/trade/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature, side }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Trade confirmation failed");
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
    setPending(true);
    setError(null);
    try {
      if (onchainMint) {
        await submitOnchain(onchainMint);
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
      setError(err instanceof Error ? err.message : "Trade failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card p-4 flex flex-col gap-4">
      <div className="flex rounded-full bg-bg-elevated p-1">
        <button
          onClick={() => {
            setSide("buy");
            setAmount("");
            setError(null);
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
          }}
          className={`glow-hover glow-down press-effect flex-1 py-1.5 rounded-full text-sm font-medium transition-colors ${
            side === "sell" ? "bg-down text-black" : "text-text-dim"
          }`}
        >
          Sell
        </button>
      </div>

      <div>
        <div className="flex justify-between text-xs text-text-dim mb-1">
          <span>Amount {side === "sell" && "(% of holdings)"}</span>
          <span>
            {side === "buy"
              ? `${formatUsd(coreBalance)} available`
              : `${formatCompact(tokenBalance)} ${ticker} available`}
          </span>
        </div>
        <div className="relative">
          <input
            type="number"
            min={0}
            step="any"
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
        {quickAmounts.map((q) => (
          <button
            key={q}
            onClick={() => setAmount(side === "sell" ? String(q * 100) : String(q))}
            className="glow-hover press-effect flex-1 text-xs py-1.5 rounded-lg bg-bg-elevated text-text-dim hover:text-text transition-colors"
          >
            {side === "sell" ? `${q * 100}%` : q}
          </button>
        ))}
      </div>

      {error && <div className="text-xs text-down">{error}</div>}

      <button
        onClick={submit}
        disabled={pending}
        className={`btn-shine glow-hover press-effect py-2.5 rounded-full text-sm font-medium transition-opacity disabled:opacity-50 ${
          side === "buy" ? "bg-up text-black glow-up" : "bg-down text-black glow-down"
        }`}
      >
        {pending ? "Submitting…" : side === "buy" ? `Buy $${ticker}` : `Sell $${ticker}`}
      </button>

      <p className="text-[11px] text-text-dim leading-relaxed">
        1% fee: 40% to the creator, 40% split across {STAKE_TICKER} stakers, 20% to treasury.
      </p>
    </div>
  );
}
