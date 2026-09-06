"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { YOU_WALLET_ID } from "./constants";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Module-level, not per-hook-instance: this hook is called from many places at once
// (AlloyHeader in the root layout, plus individual pages like /wallet, /stake,
// /admin/verifications, and components like FeedColumn). Per-instance useRef state used
// to live and die with whichever component happened to call the hook, so navigating to a
// page that calls it fresh reset "registered" to null and fired a brand new signIn —
// even though the wallet was already signed in and the server's session cookie still
// proved it. Sharing this across every instance in the tab means the sign-in prompt only
// ever fires once per truly new connection, not once per page.
let registeredWalletId: string | null = null;
let signingIn = false;

/**
 * Falls back to the shared demo wallet ("you") until a real wallet connects, so the app
 * stays fully usable without Phantom/Solflare installed. Once connected, this signs a
 * one-time nonce with the wallet's own key to prove ownership before the server's session
 * is allowed to switch to that public key — a plain "here's my address" POST would let
 * anyone claim to be any wallet, which is exactly the hole this closes.
 */
export function useConnectedWalletId(): string {
  const { publicKey, signMessage } = useWallet();
  // Guards against React StrictMode's dev-only double-invoke: without this, the effect
  // below fires twice back-to-back on connect, requesting two nonces (the second
  // invalidates the first server-side) and prompting the wallet for two signatures. The
  // first signIn's signMessage() call can then resolve against an already-consumed nonce
  // and fail verification, leaving the wallet showing "connected" while the app silently
  // stays on the demo identity. One in-flight sign-in at a time avoids the race entirely.
  const cancelledRef = useRef(false);

  useEffect(() => {
    const id = publicKey?.toBase58();
    cancelledRef.current = false;

    if (!id) {
      if (registeredWalletId) {
        registeredWalletId = null;
        fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      }
      return;
    }
    if (registeredWalletId === id || !signMessage || signingIn) return;

    // Re-bind as a plain string: TS doesn't carry the `!id` narrowing above into the
    // nested signIn() declaration below, since it can't prove id is never reassigned
    // from inside it.
    const walletId: string = id;

    signingIn = true;
    async function signIn() {
      try {
        // The session cookie is HttpOnly (client JS can't read it directly) but it's
        // exactly what /api/auth/verify already set on a previous, still-valid sign-in —
        // e.g. after a hard page reload wiped the module state above. Check it before
        // ever prompting the wallet again: no cookie/mismatched wallet means a real
        // sign-in is still needed, but a match means this wallet is already signed in
        // and asking for another signature would just be a redundant prompt.
        const sessionRes = await fetch("/api/auth/session");
        const { walletId: sessionWalletId } = await sessionRes.json();
        if (sessionWalletId === walletId) {
          registeredWalletId = walletId;
          return;
        }

        const nonceRes = await fetch("/api/auth/nonce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletId }),
        });
        if (!nonceRes.ok) return;
        const { nonce } = await nonceRes.json();
        const signature = await signMessage!(new TextEncoder().encode(nonce));
        if (cancelledRef.current) return;
        const verifyRes = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletId, signature: bytesToBase64(signature) }),
        });
        if (verifyRes.ok && !cancelledRef.current) registeredWalletId = walletId;
      } catch {
        // User rejected the signature request in their wallet, or the connected adapter
        // doesn't support message signing at all. Either way this is an expected, normal
        // outcome — not a bug — so it's swallowed here rather than rethrown: the app just
        // stays on the demo identity server-side until they retry. (The wallet adapter
        // separately emits this as an 'error' event too; see the WalletProvider onError
        // handler in app/providers.tsx, which filters the same "user rejected" case out
        // of the console instead of logging it as if it were unexpected.)
      } finally {
        signingIn = false;
      }
    }
    signIn();
    return () => {
      cancelledRef.current = true;
    };
  }, [publicKey, signMessage]);

  return publicKey ? publicKey.toBase58() : YOU_WALLET_ID;
}
