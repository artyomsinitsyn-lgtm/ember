"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletConnectWalletAdapter } from "@solana/wallet-adapter-walletconnect";
import { WalletAdapterNetwork, type Adapter, type WalletError } from "@solana/wallet-adapter-base";
import { SOLANA_RPC_URL } from "@/lib/onchain/program";

// WalletProvider's default onError is a bare console.error for every adapter error,
// including the routine "user closed the signature prompt" case — which then shows up
// looking like a real crash (Next.js's dev overlay pretty-prints it with a code frame).
// useConnectedWallet.ts already catches this outcome and handles it silently; this just
// stops the adapter's own event-emitter copy of the same error from being logged as if
// it were unexpected. Anything else still gets logged normally.
function onWalletError(error: WalletError) {
  if (error.name === "WalletSignMessageError" || /user rejected/i.test(error.message)) return;
  console.error(error);
}

const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export default function Providers({ children }: { children: React.ReactNode }) {
  // Points at the same cluster the alloy_curve program is deployed to (local validator by
  // default; set NEXT_PUBLIC_SOLANA_RPC_URL to a devnet/mainnet RPC to switch). Buys, sells,
  // and token creation all sign and broadcast real transactions over this connection.
  const endpoint = useMemo(() => SOLANA_RPC_URL, []);

  // Every real Solana wallet extension (Phantom, Solflare, Backpack, Coinbase Wallet, Glow,
  // OKX, Trust, Bitget, ...) now self-registers with the browser via the Wallet Standard the
  // moment it's installed, and WalletProvider picks those up on its own — no adapter needed
  // here, and none wanted: explicitly listing PhantomWalletAdapter/SolflareWalletAdapter used
  // to create a second, competing registration for the same wallet, which is exactly why
  // Phantom connections were flaky. The only wallet that genuinely needs an adapter listed
  // here is WalletConnect, since it isn't a browser extension at all — it's the QR-code/deep-
  // link path mobile-only wallets (Robinhood, Trust mobile, etc.) use to connect. It only
  // works once NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set to a project ID from
  // https://cloud.reown.com (free) — until then it's simply left out, no error either way.
  const wallets = useMemo(() => {
    const list: Adapter[] = [];
    if (WALLETCONNECT_PROJECT_ID) {
      list.push(
        new WalletConnectWalletAdapter({
          network: SOLANA_RPC_URL.includes("devnet") ? WalletAdapterNetwork.Devnet : WalletAdapterNetwork.Mainnet,
          options: {
            projectId: WALLETCONNECT_PROJECT_ID,
            metadata: {
              name: "Alloy",
              description: "Tokens, not memecoins. Fees flow back to holders, not just the house.",
              url: typeof window !== "undefined" ? window.location.origin : "https://alloy.fun",
              icons: [],
            },
          },
        })
      );
    }
    return list;
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect onError={onWalletError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
