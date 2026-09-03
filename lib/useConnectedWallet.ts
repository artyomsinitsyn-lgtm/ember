"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { YOU_WALLET_ID } from "./constants";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Falls back to the shared demo wallet ("you") until a real wallet connects, so the app
 * stays fully usable without Phantom/Solflare installed. Once connected, this signs a
 * one-time nonce with the wallet's own key to prove ownership before the server's session
 * is allowed to switch to that public key — a plain "here's my address" POST would let
 * anyone claim to be any wallet, which is exactly the hole this closes.
 */
export function useConnectedWalletId(): string {
  const { publicKey, signMessage } = useWallet();
  const registered = useRef<string | null>(null);
  // Guards against React StrictMode's dev-only double-invoke: without this, the effect
  // below fires twice back-to-back on connect, requesting two nonces (the second
  // invalidates the first server-side) and prompting the wallet for two signatures. The
  // first signIn's signMessage() call can then resolve against an already-consumed nonce
  // and fail verification, leaving the wallet showing "connected" while the app silently
  // stays on the demo identity. One in-flight sign-in at a time avoids the race entirely.
  const signingIn = useRef(false);

  useEffect(() => {
    const id = publicKey?.toBase58();

    if (!id) {
      if (registered.current) {
        registered.current = null;
        fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      }
      return;
    }
    if (registered.current === id || !signMessage || signingIn.current) return;

    let cancelled = false;
    signingIn.current = true;
    async function signIn() {
      try {
        const nonceRes = await fetch("/api/auth/nonce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletId: id }),
        });
        if (!nonceRes.ok) return;
        const { nonce } = await nonceRes.json();
        const signature = await signMessage!(new TextEncoder().encode(nonce));
        if (cancelled) return;
        const verifyRes = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletId: id, signature: bytesToBase64(signature) }),
        });
        if (verifyRes.ok && !cancelled) registered.current = id!;
      } catch {
        // user rejected the signature request, or the connected adapter doesn't support
        // message signing — stays on the demo identity server-side until they retry
      } finally {
        signingIn.current = false;
      }
    }
    signIn();
    return () => {
      cancelled = true;
    };
  }, [publicKey, signMessage]);

  return publicKey ? publicKey.toBase58() : YOU_WALLET_ID;
}
