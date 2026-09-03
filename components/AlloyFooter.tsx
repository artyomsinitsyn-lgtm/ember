import Link from "next/link";

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Explore",
    links: [
      { label: "Trending", href: "/ideas" },
      { label: "New launches", href: "/ideas?tab=new" },
      { label: "Established creators", href: "/ideas?tab=established" },
    ],
  },
  {
    title: "Discover Users",
    links: [
      { label: "Leaderboard", href: "/" },
      { label: "Find traders", href: "/connect" },
    ],
  },
  { title: "Blog", links: [{ label: "Changelog", href: "/blog" }] },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "How it works", href: "/about" },
      { label: "Rug protection", href: "/about#rugs" },
      { label: "Feedback", href: "/feedback" },
      { label: "Settings", href: "/settings" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Risk Disclosure", href: "/risk" },
    ],
  },
];

export default function AlloyFooter() {
  return (
    <footer>
      <div className="alloy-footer-columns">
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title}>
            <div className="alloy-footer-col-title">{col.title}</div>
            <div className="alloy-footer-col-links">
              {col.links.map((l) => (
                <Link key={l.label} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="alloy-footer">
        <span>ALLOY © 2026 · NOT FINANCIAL ADVICE · CONNECT A WALLET FOR REAL ON-CHAIN TRADES, OR TRY THE DEMO LEDGER WITHOUT ONE</span>
      </div>
    </footer>
  );
}
