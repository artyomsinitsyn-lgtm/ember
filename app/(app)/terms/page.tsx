import type { Metadata } from "next";
import Link from "next/link";
import { STAKE_TICKER } from "@/lib/constants";

export const metadata: Metadata = { title: "Terms | Alloy" };

// DRAFT — written to be accurate and complete, but this has not been reviewed by a lawyer.
// Get real legal counsel (securities/gaming exposure for a token launchpad varies a lot by
// jurisdiction) before this governs real mainnet funds. Placeholders below are marked [LIKE THIS].

const SECTIONS = [
  {
    h: "What this is",
    p: "Alloy is a token-launchpad application for the Solana blockchain. Without a wallet connected, you're trading on a local demo ledger — no real assets move, nothing has value, and it's there so you can try the mechanics risk-free. Once you connect a Solana wallet, trades you make are real, on-chain Solana transactions that you sign yourself and that settle in SOL — Alloy never signs a transaction on your behalf and never takes custody of your funds. The header always tells you which mode you're in.",
  },
  {
    h: "Not investment advice, no guarantees",
    p: "Nothing on this site — prices, market caps, P&L figures, staking yields, leaderboard rank, or anything a token's creator or another user says — is investment, financial, legal, or tax advice, and none of it is a guarantee that any token will retain value, gain value, or trade at all. Tokens launched here are speculative digital assets with no intrinsic value. See the Risk Disclosure page for the full picture before you trade with real funds.",
  },
  {
    h: "Eligibility",
    p: "You must be able to form a binding contract in your jurisdiction to use Alloy, and you're responsible for confirming that creating, trading, or holding tokens through this platform is lawful where you live. Alloy is not offered to residents of any jurisdiction where that would violate local law, and access may be restricted accordingly.",
  },
  {
    h: "Self-custody and on-chain finality",
    p: "When you connect a wallet, you and only you hold the keys — Alloy has no way to move your funds, reverse a transaction, or recover a wallet you've lost access to. Once a transaction confirms on Solana, it's final. Sending funds to the wrong address, approving a bad transaction, or losing your seed phrase are risks you bear alone; we cannot undo any of it.",
  },
  {
    h: "Fees",
    p: (
      <>
        Every on-chain trade pays a percentage fee, split between the token&apos;s creator, {STAKE_TICKER}{" "}
        stakers, and the protocol treasury — current rates are published at{" "}
        <Link href="/docs">/docs</Link> rather than restated here, so this page can&apos;t go stale
        against the actual contract. The treasury&apos;s cut is publicly verifiable on-chain; see{" "}
        <Link href="/about">/about</Link>.
      </>
    ),
  },
  {
    h: "Acceptable use",
    p: "Don't use Alloy to manipulate markets — wash trading, coordinating wallets to fake volume or evade the anti-manipulation detector, or gaming the leaderboard's reward eligibility. Don't attempt to circumvent rate limits, impersonate another wallet's identity, or use the upload or connect features to store or distribute unlawful content. We can suspend platform access — profile, leaderboard eligibility, connect features — for violations. A platform suspension is not able to reverse any on-chain transaction that already happened; see Risk Disclosure.",
  },
  {
    h: "Anti-manipulation detection isn't a guarantee",
    p: "Alloy surfaces wallet-cluster and coordinated-buying signals so you can make a more informed decision before you trade — it flags patterns, it does not prevent, reverse, or insure against a rug pull, and a token with no flags can still fail or be abandoned. Treat every flag as one input, not a verdict, and treat the absence of a flag as no flag raised yet, not a clean bill of health.",
  },
  {
    h: "Your content",
    p: "You keep ownership of anything you post — profile info, bios, images, connection requests. By posting it you give Alloy the license needed to display it back to you and other users as the product works (e.g. showing your avatar on your profile card). You're responsible for what you post being lawful and not infringing anyone else's rights.",
  },
  {
    h: "No warranty",
    p: "Alloy is provided \"as is,\" without warranty of any kind. Smart contracts, however carefully built and tested, can contain bugs; blockchains can reorg, congest, or fork; RPC providers can go down. We do not warrant uninterrupted access or that the on-chain program is free of defects.",
  },
  {
    h: "Limitation of liability",
    p: "To the maximum extent the law allows, Alloy and its operators aren't liable for indirect, incidental, or consequential damages, or for any loss of funds arising from your use of a self-custodied wallet, a bug in the on-chain program, market conditions, or another user's or token creator's actions.",
  },
  {
    h: "Changes to these terms",
    p: "We may update these terms as the product changes. Material changes will be reflected here with an updated date; continuing to use Alloy after a change means you accept the update.",
  },
  {
    h: "Governing law & contact",
    p: "These terms are governed by the laws of [JURISDICTION — TO BE SET BY COUNSEL]. Questions about these terms: [legal@alloy.xyz — REPLACE WITH A REAL MONITORED ADDRESS].",
  },
];

export default function TermsPage() {
  return (
    <div className="alloy-dash" style={{ maxWidth: 680 }}>
      <div className="alloy-kicker">LEGAL</div>
      <h1 className="alloy-h1-page" style={{ marginBottom: 6 }}>
        Terms
      </h1>
      <p className="alloy-p" style={{ fontSize: 12.5, marginBottom: 30, color: "color-mix(in srgb, var(--text) 50%, transparent)" }}>
        Last updated: [DATE OF PUBLIC LAUNCH]
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {SECTIONS.map((s) => (
          <div key={s.h}>
            <div style={{ fontFamily: "var(--alloy-display)", fontSize: 16, letterSpacing: ".01em", textTransform: "uppercase", color: "var(--text)", marginBottom: 6 }}>
              {s.h}
            </div>
            <p className="alloy-p" style={{ marginBottom: 0, fontSize: 13.5 }}>
              {s.p}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
