import Link from "next/link";
import type { Metadata } from "next";
import { CURRENCY_TICKER, STAKE_TICKER, TRADE_FEE_BPS, POST_GRADUATION_TRADE_FEE_BPS, FEE_SPLIT, BPS_DENOM, GRADUATION_CORE_RAISED, VERIFIED_PROFIT_THRESHOLD, CHALLENGE_ELIGIBILITY_HOURS } from "@/lib/constants";

export const metadata: Metadata = { title: "Docs | Alloy" };

const SECTIONS = [
  {
    h: "Bonding curve",
    p: `Every new token launches on a virtual AMM curve — the same shape pump.fun uses. Price moves purely off supply and demand from the first trade; there's no presale and no team allocation to seed. The curve graduates once it's raised $${GRADUATION_CORE_RAISED}, at which point liquidity migrates to a protocol-owned pool that keeps earning ${STAKE_TICKER} stakers fees, forever.`,
  },
  {
    h: "Fees",
    p: `Every trade pays a ${TRADE_FEE_BPS / 100}% fee pre-graduation, dropping to ${POST_GRADUATION_TRADE_FEE_BPS / 100}% once the curve graduates to a pool. It splits three ways: ${FEE_SPLIT.creator / 100}% to the token's creator, ${(FEE_SPLIT.staker / BPS_DENOM) * 100}% to everyone staking ${STAKE_TICKER} (pro-rata, settled continuously), and ${FEE_SPLIT.treasury / 100}% to the protocol treasury. Unlike a launchpad that keeps 100% of the fee for itself, the split is the whole point — see /stake for the live numbers.`,
  },
  {
    h: "Rug detection",
    p: "A single wallet holding a lot of supply rarely means much on its own — new tokens just don't have many traders yet. The detector instead flags two real patterns: several wallets that all trace back to one funding source before buying in, and several distinct wallets that ape into the same 60-second window. Either can add up to a large combined stake that no single-wallet threshold would ever catch. See /about for a live example against a real token.",
  },
  {
    h: "Verification",
    p: `A verified badge needs two things at once: a confirmed contact (phone or email) and net trade profit of at least ${VERIFIED_PROFIT_THRESHOLD} ${CURRENCY_TICKER}. Profit alone is trivial to fake by trading against yourself; contact alone doesn't mean much either. Requiring both is what makes the badge worth anything.`,
  },
  {
    h: "Token challenges",
    p: `A token becomes eligible for platform ad placement once it's been live for ${CHALLENGE_ELIGIBILITY_HOURS} hours with no active high rug-risk flag, ranked by legitimate volume × distinct funded holders — wallets identified as sharing a funding source or trading in a coordinated pattern are excluded from both numbers, so wash-trading a single wallet against itself can't move the score.`,
  },
  {
    h: "Net P&L",
    p: "The same formula everywhere on the site — at the wallet level, the token level, and the per-position level: sell proceeds plus the current value of anything still held, minus total buy cost. It's a net cash-flow figure, not a cost-basis lot accounting, and it's computed live from the trade ledger, never cached.",
  },
];

export default function DocsPage() {
  return (
    <div className="alloy-dash" style={{ maxWidth: 760 }}>
      <div className="alloy-kicker">HOW ALLOY WORKS</div>
      <h1 className="alloy-h1-page" style={{ marginBottom: 30 }}>
        Docs
      </h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        {SECTIONS.map((s) => (
          <div key={s.h} className="alloy-panel">
            <div style={{ fontFamily: "var(--alloy-display)", fontSize: 18, letterSpacing: ".01em", textTransform: "uppercase", color: "var(--text)", marginBottom: 8 }}>
              {s.h}
            </div>
            <p className="alloy-p" style={{ marginBottom: 0 }}>
              {s.p}
            </p>
          </div>
        ))}
      </div>
      <p style={{ fontFamily: "var(--alloy-mono)", fontSize: 10, lineHeight: 1.6, color: "color-mix(in srgb, var(--text) 35%, transparent)", marginTop: 30 }}>
        Every number referenced above is a live constant from the running app, not documentation that&apos;s drifted out
        of sync with it. See also <Link href="/about" style={{ textDecoration: "underline" }}>About</Link> and{" "}
        <Link href="/stake" style={{ textDecoration: "underline" }}>Stake</Link>.
      </p>
    </div>
  );
}
