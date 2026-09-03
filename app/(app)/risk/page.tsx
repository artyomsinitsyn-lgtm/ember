import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Risk Disclosure | Alloy" };

// DRAFT — plain-language and accurate to the current build, but not reviewed by a lawyer.
// The "not yet audited" line needs to be kept honest as the security posture changes — update
// it the day a real third-party audit lands, don't let it go stale.

const SECTIONS = [
  {
    h: "Tokens launched here are speculative, and most fail",
    p: "Every token on Alloy is created by a user, with no vetting of the idea, the creator, or the project behind it. Tokens have no intrinsic value — their price is pure supply and demand on a bonding curve. On platforms like this across the industry, the large majority of tokens created never gain meaningful, lasting value; many go to zero. Treat every token here as what it is: a highly speculative bet, not an investment with fundamentals behind it.",
  },
  {
    h: "This is not investment advice",
    p: "Nothing on Alloy — price charts, market caps, leaderboard rank, staking yields, a creator's pitch, another user's trade history — is a recommendation to buy or sell anything. Nobody on this platform, including Alloy itself, can predict which tokens will succeed.",
  },
  {
    h: "What the anti-manipulation system does — and doesn't do",
    p: "Alloy flags wallet clusters that appear to share a funding source, and coordinated buying patterns, before you trade — this is real signal, not decoration. But it is detection, not prevention: it cannot stop a creator from abandoning a project, cannot undo a sell that already happened on-chain, and cannot catch every manipulation pattern, especially novel ones. A platform ban keeps someone from using Alloy again; it does not reverse any transaction. Never treat an unflagged token as \"verified safe\" — it means no pattern has been detected yet, nothing more.",
  },
  {
    h: "On-chain transactions are irreversible",
    p: "Once you connect a wallet and confirm a trade, it settles on the Solana blockchain and cannot be undone by Alloy, by you, or by anyone. There's no chargeback, no support ticket that reverses a trade, no customer service override. Double-check the token, the amount, and the wallet you're using before you confirm.",
  },
  {
    h: "You are your own custodian",
    p: "Alloy never holds your funds or your keys. If you lose your seed phrase, send funds to the wrong address, or approve a malicious transaction from somewhere else, that loss is not recoverable through Alloy. Only connect a wallet you understand how to secure.",
  },
  {
    h: "Smart contract risk",
    p: "Alloy's on-chain program has been tested against its own logic, including adversarial test cases, but has not yet completed an independent third-party security audit. Interacting with any smart contract — audited or not — carries inherent risk of an undiscovered bug. We'll update this page the day a real audit is complete and link the report here.",
  },
  {
    h: "Regulatory risk",
    p: "The legal treatment of tokens like the ones launched here is unsettled and varies by jurisdiction, and may change. You're responsible for knowing whether creating, trading, or holding these tokens is lawful where you live, and for any tax obligations your trading activity creates.",
  },
  {
    h: "No insurance, no guarantee",
    p: "Nothing you hold through Alloy is insured or protected the way a bank deposit is. There is no guarantee of liquidity, no guarantee you'll be able to sell at any particular price, and no guarantee the platform, a given token, or its liquidity pool continues to exist or function at any point in the future.",
  },
  {
    h: "Questions",
    p: (
      <>
        If something on this page is unclear, read <Link href="/about">how Alloy actually works</Link>{" "}
        before you trade with real funds, or reach out at [support@alloy.xyz — REPLACE WITH A REAL
        MONITORED ADDRESS].
      </>
    ),
  },
];

export default function RiskDisclosurePage() {
  return (
    <div className="alloy-dash" style={{ maxWidth: 680 }}>
      <div className="alloy-kicker">LEGAL</div>
      <h1 className="alloy-h1-page" style={{ marginBottom: 6 }}>
        Risk Disclosure
      </h1>
      <p className="alloy-p" style={{ fontSize: 12.5, marginBottom: 30, color: "color-mix(in srgb, var(--text) 50%, transparent)" }}>
        Last updated: [DATE OF PUBLIC LAUNCH] · Read this before you connect a wallet and trade with real funds.
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
