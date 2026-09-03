import type { Metadata } from "next";

export const metadata: Metadata = { title: "Blog | Alloy" };

const POSTS = [
  {
    date: "2026-08-30",
    title: "Real authentication, finally",
    body: "Every wallet-scoped write on the site — profile edits, trades, stakes, posts, connection requests — now requires a signed session tied to your actual keypair. Nothing trusts a client-supplied wallet id anymore.",
  },
  {
    date: "2026-08-30",
    title: "Callouts can now be liked and replied to",
    body: "The feed stopped being read-only. Every post has a like count and a reply thread, both computed live, no caching.",
  },
  {
    date: "2026-08-30",
    title: "Site-wide search",
    body: "Find any token or trader by name from the header, from anywhere on the site.",
  },
  {
    date: "2026-08-30",
    title: "$ZEBRA renamed to $ALLOY",
    body: "The staking token's ticker changed across the whole app, plus real candle wicks on the trading chart, editable profile banners, and a Top Trades / Tokens Made leaderboard on every profile.",
  },
  {
    date: "2026-08-29",
    title: "The trading floor",
    body: "Rebuilt the homepage into a live dashboard: a leaderboard that cycles between Tokens, Top PNL, and Top Earners, next to the site feed.",
  },
  {
    date: "2026-08-28",
    title: "Launch day",
    body: "Bonding-curve launches, a real anti-rugpull detector, and a staking token that pays fees back to holders instead of keeping them.",
  },
];

export default function BlogPage() {
  return (
    <div className="alloy-dash" style={{ maxWidth: 640 }}>
      <div className="alloy-kicker">CHANGELOG</div>
      <h1 className="alloy-h1-page" style={{ marginBottom: 30 }}>
        Blog
      </h1>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {POSTS.map((p, i) => (
          <div
            key={p.title}
            style={{
              padding: "22px 0",
              borderBottom: i < POSTS.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            <div style={{ fontFamily: "var(--alloy-mono)", fontSize: 11, letterSpacing: ".08em", color: "color-mix(in srgb, var(--text) 45%, transparent)", marginBottom: 8 }}>
              {p.date}
            </div>
            <div style={{ fontFamily: "var(--alloy-display)", fontSize: 19, letterSpacing: ".01em", color: "var(--text)", marginBottom: 6 }}>
              {p.title}
            </div>
            <p className="alloy-p" style={{ marginBottom: 0, fontSize: 14 }}>
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
