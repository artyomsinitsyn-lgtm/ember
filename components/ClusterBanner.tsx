/** Site-wide, always-on-load notice for any non-mainnet cluster — deliberately not gated
 * behind a wallet connection (unlike the header's status pill, which only a connected user
 * ever sees) since the point is to set expectations *before* someone connects a wallet and
 * trades, not after. Renders nothing on mainnet, where this disclaimer doesn't apply.
 *
 * Reads NEXT_PUBLIC_SOLANA_RPC_URL directly rather than importing SOLANA_RPC_URL from
 * lib/onchain/program.ts: that module pulls in @coral-xyz/anchor, which doesn't bundle
 * cleanly into the server-component graph a plain server component like this one goes
 * through (`ReferenceError: exports is not defined`, a CJS/ESM interop break) — it's fine in
 * "use client" components and route handlers, just not here. Same fallback value as that
 * module though, so the two still can't disagree about which cluster is live. */
export default function ClusterBanner() {
  const url = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
  if (!url.includes("devnet") && !url.includes("testnet") && !url.includes("127.0.0.1") && !url.includes("localhost")) {
    return null;
  }
  const cluster = url.includes("devnet")
    ? "Solana Devnet"
    : url.includes("testnet")
    ? "Solana Testnet"
    : "a local test validator";

  return (
    <div className="alloy-cluster-banner">
      Running on {cluster} — every SOL and token here is a free test asset with no real-world
      value. Connecting a real wallet will not spend or risk real money.
    </div>
  );
}
