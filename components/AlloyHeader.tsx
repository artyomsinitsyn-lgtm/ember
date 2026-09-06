"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Settings } from "lucide-react";
import { formatCompact, formatSol } from "@/lib/format";
import { STAKE_TICKER } from "@/lib/constants";
import { LAMPORTS_PER_SOL } from "@/lib/onchain/program";
import { useConnectedWalletId } from "@/lib/useConnectedWallet";
import SiteSearch from "@/components/SiteSearch";

// Every non-mainnet label spells out "test SOL" explicitly rather than just naming the
// cluster — "DEVNET SOL" alone still reads as a kind of real SOL to someone unfamiliar with
// Solana's cluster model. This is the one piece of copy a connected, about-to-trade user
// actually looks at, so it has to be unambiguous on its own.
function clusterLabel(rpcEndpoint: string): string {
  if (rpcEndpoint.includes("127.0.0.1") || rpcEndpoint.includes("localhost")) return "LOCAL VALIDATOR · TEST SOL";
  if (rpcEndpoint.includes("devnet")) return "DEVNET · TEST SOL";
  if (rpcEndpoint.includes("testnet")) return "TESTNET · TEST SOL";
  return "MAINNET SOL";
}

const NAV = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/ideas", label: "Tokens" },
  { href: "/create", label: "Launch Token" },
  { href: "/stake", label: "Stake" },
  { href: "/connect", label: "Connect" },
  { href: "/wallet", label: "Wallet" },
];

export default function AlloyHeader() {
  const pathname = usePathname();
  const walletId = useConnectedWalletId();
  const { connected, connecting, publicKey } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const [balances, setBalances] = useState<{ core: number; embr: number } | null>(null);
  const [onchainSol, setOnchainSol] = useState<number | null>(null);
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/wallet/${walletId}`);
        const data = await res.json();
        if (!cancelled) setBalances({ core: data.wallet.coreBalance, embr: data.wallet.embrBalance });
      } catch {
        // best-effort header display; page bodies fetch their own data
      }
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [walletId]);

  // Once a real wallet is connected, its spendable balance is the real on-chain lamport
  // balance — the DB core_balance figure only ever applied to the simulated guest ledger.
  useEffect(() => {
    if (!connected || !publicKey) return;
    let cancelled = false;
    async function load() {
      try {
        const lamports = await connection.getBalance(publicKey!, "confirmed");
        if (!cancelled) setOnchainSol(lamports / LAMPORTS_PER_SOL);
      } catch {
        // best-effort — falls back to showing nothing rather than a stale number
      }
    }
    load();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      setOnchainSol(null);
      clearInterval(id);
    };
  }, [connected, publicKey, connection]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/connections?walletId=${walletId}`);
        const data = await res.json();
        if (!cancelled) setPendingRequests(data.incoming?.length ?? 0);
      } catch {
        // best-effort notification badge
      }
    }
    load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [walletId]);

  return (
    <header className="alloy-header">
      <Link href="/" data-fx="magnet" style={{ display: "flex", alignItems: "center", gap: 13 }}>
        <div className="alloy-logo-mark" />
        <span className="alloy-wordmark">ALLOY</span>
      </Link>

      <nav className="alloy-nav">
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              data-fx="magnet"
              className={`alloy-navlink ${active ? "alloy-navlink-active" : ""}`}
            >
              {n.label}
              {n.href === "/connect" && pendingRequests > 0 && <span className="alloy-navlink-badge" />}
            </Link>
          );
        })}
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: "0 0 auto", marginLeft: "auto" }}>
        <SiteSearch />
        <Link
          href="/settings"
          data-fx="magnet"
          aria-label="Settings"
          title="Settings"
          className="alloy-icon-btn"
        >
          <Settings size={16} />
        </Link>
        <div className="alloy-status-pill">
          <span className="alloy-status-dot" />
          {connected ? `ON-CHAIN TX · ${clusterLabel(connection.rpcEndpoint)}` : "SIMULATED LEDGER"}
        </div>
        {balances && (
          <div className="alloy-balance">
            <span>
              <b>{connected && onchainSol !== null ? `${onchainSol.toFixed(3)} SOL` : formatSol(balances.core)}</b>
            </span>
            <span>
              <b>{formatCompact(balances.embr)}</b> {STAKE_TICKER}
            </span>
          </div>
        )}
        <button data-fx="magnet" className="alloy-btn-header" onClick={() => setVisible(true)}>
          {connecting
            ? "Connecting…"
            : connected && publicKey
            ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
            : "Connect wallet"}
        </button>
      </div>
    </header>
  );
}
