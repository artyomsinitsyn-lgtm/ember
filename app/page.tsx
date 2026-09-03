import Link from "next/link";
import { CoinsPanel, PeoplePanel } from "@/components/LeaderboardPanel";
import FeedColumn from "@/components/FeedColumn";
import OnlineNowBadge from "@/components/OnlineNowBadge";

export default function HomePage() {
  return (
    <div className="alloy-dash-wide">
      <div className="alloy-home-top">
        <div>
          <div className="alloy-kicker" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            LIVE ACTIVITY
            <OnlineNowBadge />
          </div>
          <h1 className="alloy-h1-page" style={{ marginBottom: 8 }}>
            The trading floor
          </h1>
          <p className="alloy-p" style={{ marginBottom: 0, maxWidth: 460 }}>
            Tokens, top earners, and live callouts — everything happening on Alloy right now.
          </p>
        </div>
        <div className="alloy-cta-row">
          <Link href="/create" data-fx="magnet" data-shake="1" className="alloy-btn-primary">
            Launch a token
          </Link>
          <Link href="/ideas" data-fx="magnet" className="alloy-btn-secondary">
            Browse tokens
          </Link>
        </div>
      </div>

      <div className="alloy-home-grid">
        <CoinsPanel />
        <FeedColumn />
        <PeoplePanel />
      </div>
    </div>
  );
}
