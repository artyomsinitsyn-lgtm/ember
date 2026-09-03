"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Check, KeySquare } from "lucide-react";

type Step = "address" | "sign";

/**
 * Not linked from the header/nav — reached only via the "or connect manually" link
 * WalletManualLink.tsx injects into the wallet-adapter modal. This is for wallets that
 * never registered with the Wallet Standard, so they never show up in that modal's list:
 * something driven from a CLI, a hardware wallet's own signing tool, a mobile wallet with
 * no WalletConnect configured, anything exotic.
 *
 * It reuses the exact same /api/auth/nonce + /api/auth/verify pair the automatic wallet
 * flow uses — same ed25519 signature check server-side either way. There is no path here
 * that lets you "connect" an address without proving you hold its private key; that
 * proof is the entire point of the nonce/signature dance (see lib/auth.ts) and this page
 * doesn't get to skip it just because the wallet is unusual.
 */
export default function ManualConnectPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("address");
  const [address, setAddress] = useState("");
  const [nonce, setNonce] = useState("");
  const [signature, setSignature] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestNonce() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId: address.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't issue a challenge for that address");
      setNonce(data.nonce);
      setStep("sign");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't issue a challenge for that address");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId: address.trim(), signature: signature.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signature didn't verify");
      router.push(`/profile/${address.trim()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signature didn't verify");
    } finally {
      setLoading(false);
    }
  }

  async function copyNonce() {
    await navigator.clipboard.writeText(nonce);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="alloy-dash" style={{ maxWidth: 560 }}>
      <Link href="/" className="text-sm text-text-dim hover:text-text w-fit" style={{ display: "block", marginBottom: 24 }}>
        ← Home
      </Link>

      <div className="card p-6 flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <KeySquare size={18} className="text-text-dim" />
          <h1 className="text-lg font-semibold">Connect a wallet manually</h1>
        </div>
        <p className="text-sm text-text-dim leading-relaxed">
          For wallets that don&apos;t show up in the normal connect list — a hardware wallet driven from the
          command line, a mobile wallet with no QR pairing set up, anything that can produce an ed25519 signature
          but doesn&apos;t plug into a browser extension. You&apos;ll sign a one-time message with that wallet
          outside the browser and paste the signature back here — the same proof-of-ownership check the regular
          connect flow does automatically.
        </p>

        {step === "address" ? (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-text-dim uppercase tracking-wide mb-1.5 block">
                Solana public address
              </label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 7xKX...gAsU"
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm mono outline-none focus:border-accent"
              />
            </div>
            {error && <div className="text-xs text-down">{error}</div>}
            <button
              onClick={requestNonce}
              disabled={loading || !address.trim()}
              className="btn-shine glow-hover press-effect bg-accent text-black font-medium px-4 py-2 rounded-full text-sm disabled:opacity-50 self-start"
            >
              {loading ? "Requesting…" : "Get a message to sign"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-text-dim uppercase tracking-wide mb-1.5 block">
                1. Sign this exact message with {address.trim().slice(0, 4)}…{address.trim().slice(-4)}
              </label>
              <div className="bg-bg-elevated border border-border rounded-lg p-3 text-xs mono whitespace-pre-wrap break-all">
                {nonce}
              </div>
              <button
                onClick={copyNonce}
                className="glow-hover press-effect flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-bg-elevated border border-border"
              >
                {copied ? <Check size={13} className="text-up" /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy message"}
              </button>
              <p className="text-xs text-text-dim mt-2 leading-relaxed">
                Sign it byte-for-byte with your wallet&apos;s message-signing tool (e.g. the Solana CLI&apos;s{" "}
                <code className="mono">solana sign-message</code>, or a hardware wallet&apos;s own signer) and
                encode the resulting signature as base64.
              </p>
            </div>
            <div>
              <label className="text-xs text-text-dim uppercase tracking-wide mb-1.5 block">
                2. Paste the base64 signature
              </label>
              <input
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="Base64 signature"
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm mono outline-none focus:border-accent"
              />
            </div>
            {error && <div className="text-xs text-down">{error}</div>}
            <div className="flex gap-2">
              <button
                onClick={verify}
                disabled={loading || !signature.trim()}
                className="btn-shine glow-hover press-effect bg-accent text-black font-medium px-4 py-2 rounded-full text-sm disabled:opacity-50"
              >
                {loading ? "Verifying…" : "Verify & connect"}
              </button>
              <button
                onClick={() => {
                  setStep("address");
                  setNonce("");
                  setSignature("");
                  setError(null);
                }}
                className="glow-hover press-effect bg-bg-elevated border border-border font-medium px-4 py-2 rounded-full text-sm"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
