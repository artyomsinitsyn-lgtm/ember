"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import HeroArt from "@/components/HeroArt";
import RugRiskExplainer from "@/components/RugRiskExplainer";
import StarburstBadge from "@/components/StarburstBadge";
import { formatUsd, formatDuration } from "@/lib/format";
import {
  STAKE_TICKER,
  TRADE_FEE_BPS,
  POST_GRADUATION_TRADE_FEE_BPS,
  FEE_SPLIT,
  GRADUATION_CORE_RAISED,
  VERIFIED_PROFIT_THRESHOLD,
  CHALLENGE_ELIGIBILITY_HOURS,
} from "@/lib/constants";

interface LandingStats {
  tokensForged: number;
  lifetimeVolume: number;
  medianBondSeconds: number | null;
}

const STEPS = [
  {
    n: "01",
    h: "Create",
    p: "Name, ticker, image. Launch instantly on a bonding curve — no contract to write, no liquidity to seed yourself.",
  },
  {
    n: "02",
    h: "Trade",
    p: `Buying and selling is instant from the first second. Every trade's fee — ${TRADE_FEE_BPS / 100}% pre-graduation, ${POST_GRADUATION_TRADE_FEE_BPS / 100}% after — splits three ways: ${FEE_SPLIT.creator / 100}% creator, ${FEE_SPLIT.staker / 100}% ${STAKE_TICKER} stakers, ${FEE_SPLIT.treasury / 100}% treasury.`,
  },
  {
    n: "03",
    h: "Graduate",
    p: `At $${GRADUATION_CORE_RAISED} raised the curve graduates — liquidity becomes a protocol-owned pool that keeps earning stakers fees, forever.`,
  },
];

export default function AboutPage() {
  const [stats, setStats] = useState<LandingStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/landing")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setStats(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <section className="alloy-hero">
        <div>
          <div className="alloy-eyebrow">WHY ALLOY EXISTS</div>
          <h1 className="alloy-h1">
            Built for signal,
            <br />
            not noise
          </h1>
          <p className="alloy-tagline">
            Most memecoin launchpads reward whoever&apos;s loudest or fastest, not whoever&apos;s actually building
            something real — that&apos;s exactly what makes them full of noise and rug pulls. Our bet is that
            surfacing real signal — real holder behavior, real trading activity, real transparency — makes for a
            better market than pure hype and speed. We&apos;re not predicting which tokens will win. We&apos;re
            making what&apos;s actually happening visible before you buy.
          </p>
          <div className="alloy-cta-row">
            <Link href="/create" data-fx="magnet" data-shake="1" className="alloy-btn-primary">
              Launch a token
            </Link>
            <Link href="/ideas" data-fx="magnet" className="alloy-btn-secondary">
              Browse tokens
            </Link>
            <span className="alloy-microcopy">no code · free to launch</span>
          </div>
          <div className="alloy-stats-row">
            <div>
              <div className="alloy-stat-value">{stats ? stats.tokensForged.toLocaleString() : "—"}</div>
              <div className="alloy-stat-label">TOKENS LAUNCHED</div>
            </div>
            <div>
              <div className="alloy-stat-value">{stats ? formatUsd(stats.lifetimeVolume) : "—"}</div>
              <div className="alloy-stat-label">LIFETIME VOLUME</div>
            </div>
            <div>
              <div className="alloy-stat-value">
                {stats && stats.medianBondSeconds != null ? formatDuration(stats.medianBondSeconds) : "—"}
              </div>
              <div className="alloy-stat-label">MEDIAN TIME TO BOND</div>
            </div>
          </div>
        </div>

        <HeroArt />
      </section>

      <section id="different" className="alloy-section">
        <div className="alloy-section-head">
          <h2 className="alloy-h2">What&apos;s different here</h2>
          <span className="alloy-section-tag">FOUR THINGS WE ACTUALLY BUILT</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 46 }}>
          <div id="rugs">
            <h3 className="alloy-step-h" style={{ marginBottom: 10 }}>
              Holder transparency, before you buy
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,.85fr) minmax(0,1.15fr)", gap: 26, alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <p className="alloy-p" style={{ marginBottom: 0 }}>
                  Wallet clustering and coordinated-buy patterns get surfaced to you before you buy, not hidden
                  after the fact. A single wallet holding a lot of supply rarely means much on its own — a new
                  token just doesn&apos;t have many traders yet. Real bundling looks different: several wallets
                  that all trace back to one funding source, or several wallets that ape in within the same short
                  window. Either pattern can add up to a large combined stake no single-wallet threshold would
                  catch.
                </p>
                <div className="alloy-row">
                  <span className="alloy-row-k">Shared funding</span>
                  <span className="alloy-row-v" style={{ textAlign: "right" }}>
                    Holders traced back to the same funding wallet before buying in
                  </span>
                </div>
                <div className="alloy-row">
                  <span className="alloy-row-k">Coordinated bursts</span>
                  <span className="alloy-row-v" style={{ textAlign: "right" }}>
                    Distinct wallets all buying inside the same short window
                  </span>
                </div>
                <div className="alloy-row">
                  <span className="alloy-row-k">Rarely the whole story</span>
                  <span className="alloy-row-v" style={{ textAlign: "right" }}>
                    Raw top-wallet % by itself — thin new tokens look concentrated naturally
                  </span>
                </div>
                <p style={{ fontFamily: "var(--alloy-mono)", fontSize: 10, color: "color-mix(in srgb, var(--text) 40%, transparent)", lineHeight: 1.6 }}>
                  Be clear about what this does and doesn&apos;t do: it makes bad behavior visible and it carries
                  real consequences here — a flagged token loses its ranking eligibility (see below). It
                  doesn&apos;t retroactively undo a trade you already made, here or anywhere else. Pick any live
                  token on the right — this runs the platform&apos;s actual clustering check against it, live, the
                  same call the trade page makes. The exact wallet counts, time windows, and weighting behind each
                  signal aren&apos;t published — that&apos;s deliberate, so the check stays a check and not a
                  recipe for staying just under it.
                </p>
              </div>
              <RugRiskExplainer />
            </div>
          </div>

          <div>
            <h3 className="alloy-step-h" style={{ marginBottom: 10 }}>
              Rankings run on real activity, not vote counts
            </h3>
            <p className="alloy-p" style={{ marginBottom: 0, maxWidth: 720 }}>
              Both the trader leaderboard and token rankings are computed from real trading activity — volume and
              distinct funded wallets — with any wallet caught in a funding or coordination cluster excluded from
              the count entirely. A raw hype number or a vote button can&apos;t move these. Placement rewards
              aren&apos;t instant, either: a token has to run for {CHALLENGE_ELIGIBILITY_HOURS} hours with no
              active high-risk flag before its ranking is treated as payout-eligible — long enough for an obvious
              bundle-and-dump to surface in the detector first.
            </p>
          </div>

          <div>
            <h3 className="alloy-step-h" style={{ marginBottom: 10 }}>
              Verification means something
            </h3>
            <p className="alloy-p" style={{ marginBottom: 0, maxWidth: 720 }}>
              Getting verified takes two things: a confirmed phone or email, and real trading history — at least{" "}
              {formatUsd(VERIFIED_PROFIT_THRESHOLD)} in realized profit. Profit alone is trivial to fake with wash
              trades against yourself, and a confirmed contact alone doesn&apos;t prove much either, so both gates
              have to clear. It exists mostly to protect people, not to flex: verified wallets get a much higher
              weekly cap on outbound connection requests, and anyone can set their profile to only accept requests
              from other verified wallets — the two-layer defense against a connection-request flood.
            </p>
          </div>

          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
              <StarburstBadge size={68}>{`${TRADE_FEE_BPS / 100}%`}</StarburstBadge>
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <h3 className="alloy-step-h" style={{ marginBottom: 10 }}>
                  Fair fees, split where they belong
                </h3>
                <p className="alloy-p" style={{ marginBottom: 0 }}>
                  Every trade takes a {TRADE_FEE_BPS / 100}% fee pre-graduation — the same headline rate most of
                  this category charges — dropping to {POST_GRADUATION_TRADE_FEE_BPS / 100}% once the curve
                  graduates to a pool. The difference is where it goes: {FEE_SPLIT.creator / 100}% to the
                  token&apos;s creator, {FEE_SPLIT.staker / 100}% to everyone staking {STAKE_TICKER} (pro-rata,
                  including on graduated pools, forever), {FEE_SPLIT.treasury / 100}% to the treasury. No hidden
                  costs beyond that.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="alloy-section">
        <h2 className="alloy-h2" style={{ marginBottom: 30 }}>
          How it works
        </h2>
        <div className="alloy-steps-grid">
          {STEPS.map((s) => (
            <div key={s.n} className="alloy-step">
              <div className="alloy-step-sheen" />
              <div className="alloy-step-num">{s.n}</div>
              <div className="alloy-step-h">{s.h}</div>
              <p className="alloy-step-p">{s.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="design" className="alloy-section">
        <h2 className="alloy-h2" style={{ marginBottom: 16 }}>
          Why it looks like this
        </h2>
        <p className="alloy-p" style={{ maxWidth: 720 }}>
          The chrome-and-glass look isn&apos;t just a style choice. It&apos;s meant to read as considered and
          reflective — light that moves the way it would off a real material — in contrast to the cheap, flashing
          chaos most launchpads default to. The same care that went into the trust features above went into the
          finish; one is meant to signal the other.
        </p>
      </section>

      <section id="limits" className="alloy-section">
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: "24px 26px",
            background: "rgba(255,255,255,0.03)",
            maxWidth: 820,
          }}
        >
          <h2 className="alloy-h2" style={{ fontSize: 20, marginBottom: 12 }}>
            What we can&apos;t promise
          </h2>
          <p className="alloy-p" style={{ marginBottom: 0 }}>
            None of this makes a token a good bet. We can&apos;t guarantee any token succeeds, we can&apos;t undo a
            trade made somewhere else, and memecoins stay highly speculative no matter how much transparency
            tooling sits on top of them. Everything above is about making information visible before you act on it
            — not a promise about what happens to a price afterward.
          </p>
        </div>
      </section>

      <section className="alloy-final">
        <h2 className="alloy-final-h2">See it for yourself</h2>
        <p className="alloy-final-p">
          Browse what&apos;s actually trading right now, or read how the mechanics work end to end.
        </p>
        <div className="alloy-cta-row" style={{ justifyContent: "center" }}>
          <Link href="/ideas" data-fx="magnet" data-shake="1" className="alloy-btn-primary">
            Browse tokens
          </Link>
          <Link href="/docs" data-fx="magnet" className="alloy-btn-secondary">
            Read the docs
          </Link>
        </div>
      </section>
    </>
  );
}
