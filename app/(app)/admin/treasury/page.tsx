"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Landmark } from "lucide-react";
import { formatUsd } from "@/lib/format";
import { getProgram, LAMPORTS_PER_SOL } from "@/lib/onchain/program";
import { fetchTreasuryState } from "@/lib/onchain/treasury";
import { buildInitializeTreasuryConfigTx, buildSetTreasuryAdminTx, buildWithdrawTreasuryTx } from "@/lib/onchain/actions";

function short(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/**
 * Not linked from the header/nav — this is the operator's own control panel for the
 * protocol's 20% trade-fee cut, not a page regular users need to find. Reachable directly at
 * /admin/treasury by whoever holds the admin key.
 */
export default function TreasuryAdminPage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const [admin, setAdmin] = useState<string | null | undefined>(undefined); // undefined = loading
  const [balanceLamports, setBalanceLamports] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [newAdmin, setNewAdmin] = useState("");

  const load = useCallback(async () => {
    const state = await fetchTreasuryState(connection);
    setAdmin(state.admin);
    setBalanceLamports(state.balanceLamports);
  }, [connection]);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (wallet.publicKey && !withdrawTo) setWithdrawTo(wallet.publicKey.toBase58());
  }, [wallet.publicKey, withdrawTo]);

  const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
  const isAdmin = !!wallet.publicKey && admin === wallet.publicKey.toBase58();

  function requireWallet(): boolean {
    if (!wallet.connected || !wallet.publicKey || !wallet.signTransaction) {
      setVisible(true);
      return false;
    }
    return true;
  }

  function program() {
    return getProgram(connection, {
      publicKey: wallet.publicKey!,
      signTransaction: wallet.signTransaction!,
      signAllTransactions:
        wallet.signAllTransactions ?? (async (txs) => Promise.all(txs.map((t) => wallet.signTransaction!(t)))),
    });
  }

  async function sendTx(tx: Awaited<ReturnType<typeof buildWithdrawTreasuryTx>>) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey!;
    const signature = await wallet.sendTransaction(tx, connection);
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return signature;
  }

  async function claimAdmin() {
    if (!requireWallet()) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const tx = await buildInitializeTreasuryConfigTx(program(), wallet.publicKey!);
      await sendTx(tx);
      setNotice("You're now the treasury admin.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim admin");
    } finally {
      setPending(false);
    }
  }

  async function withdraw() {
    if (!requireWallet()) return;
    const value = Number(withdrawAmount);
    let to: PublicKey;
    try {
      to = new PublicKey(withdrawTo.trim());
    } catch {
      setError("Enter a valid destination address");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const amountLamports = BigInt(Math.round(value * LAMPORTS_PER_SOL));
      const tx = await buildWithdrawTreasuryTx(program(), wallet.publicKey!, to, amountLamports);
      const signature = await sendTx(tx);
      const res = await fetch("/api/admin/treasury/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, to: to.toBase58() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal confirmation failed");
      setNotice(`Withdrew ${value} SOL to ${short(to.toBase58())}.`);
      setWithdrawAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setPending(false);
    }
  }

  async function transferAdmin() {
    if (!requireWallet()) return;
    let next: PublicKey;
    try {
      next = new PublicKey(newAdmin.trim());
    } catch {
      setError("Enter a valid wallet address");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const tx = await buildSetTreasuryAdminTx(program(), wallet.publicKey!, next);
      await sendTx(tx);
      setNotice(`Treasury admin is now ${short(next.toBase58())}.`);
      setNewAdmin("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to transfer admin");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="alloy-dash" style={{ maxWidth: 560 }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <Link href="/" className="text-sm text-text-dim hover:text-text w-fit">
          ← Home
        </Link>
        <Link href="/admin/verifications" className="text-sm text-text-dim hover:text-text w-fit">
          Verification requests →
        </Link>
      </div>

      <div className="card p-6 flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <Landmark size={18} className="text-text-dim" />
          <h1 className="text-lg font-semibold">Treasury</h1>
        </div>
        <p className="text-sm text-text-dim leading-relaxed">
          Every trade&apos;s 1% fee sends 20% straight to this on-chain vault. Whoever holds admin here can move it
          out to any wallet, or hand admin off to a different one.
        </p>

        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-xs text-text-dim">
            <span>VAULT BALANCE</span>
            <span>ADMIN</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-2xl font-semibold mono">
              {isAdmin ? (
                <>
                  {balanceSol.toFixed(4)} SOL <span className="text-sm text-text-dim">{formatUsd(balanceSol)}</span>
                </>
              ) : (
                <span className="text-text-dim">•••••</span>
              )}
            </span>
            <span className="text-sm mono text-text-dim">{admin === undefined ? "…" : admin ? short(admin) : "unclaimed"}</span>
          </div>
        </div>

        {admin === null && (
          <button
            onClick={claimAdmin}
            disabled={pending}
            className="btn-shine glow-hover press-effect bg-accent text-black font-medium px-4 py-2 rounded-full text-sm disabled:opacity-50 self-start"
          >
            {pending ? "Claiming…" : "Become treasury admin"}
          </button>
        )}

        {admin && !isAdmin && (
          <div className="text-xs text-text-dim">
            Connected wallet isn&apos;t the treasury admin — connect {short(admin)} to withdraw or reassign it.
          </div>
        )}

        {isAdmin && (
          <>
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <label className="text-xs text-text-dim uppercase tracking-wide">Withdraw</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.0 SOL"
                  className="w-28 bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm mono outline-none focus:border-accent"
                />
                <input
                  value={withdrawTo}
                  onChange={(e) => setWithdrawTo(e.target.value)}
                  placeholder="Destination address"
                  className="flex-1 min-w-0 bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm mono outline-none focus:border-accent"
                />
              </div>
              <button
                onClick={withdraw}
                disabled={pending}
                className="btn-shine glow-hover press-effect bg-up text-black font-medium px-4 py-2 rounded-full text-sm disabled:opacity-50 self-start"
              >
                {pending ? "Submitting…" : "Withdraw"}
              </button>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <label className="text-xs text-text-dim uppercase tracking-wide">Transfer admin</label>
              <div className="flex gap-2">
                <input
                  value={newAdmin}
                  onChange={(e) => setNewAdmin(e.target.value)}
                  placeholder="New admin address"
                  className="flex-1 min-w-0 bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm mono outline-none focus:border-accent"
                />
                <button
                  onClick={transferAdmin}
                  disabled={pending}
                  className="glow-hover press-effect bg-bg-elevated border border-border font-medium px-4 py-2 rounded-full text-sm disabled:opacity-50"
                >
                  Transfer
                </button>
              </div>
            </div>
          </>
        )}

        {notice && <div className="text-xs text-up">{notice}</div>}
        {error && <div className="text-xs text-down">{error}</div>}
      </div>
    </div>
  );
}
