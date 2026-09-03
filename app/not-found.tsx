import Link from "next/link";

export default function NotFound() {
  return (
    <div className="alloy-dash" style={{ textAlign: "center", paddingTop: 60, paddingBottom: 60 }}>
      <div className="alloy-kicker">404</div>
      <h1 className="alloy-h1-page" style={{ marginBottom: 10 }}>
        This one didn&apos;t bond
      </h1>
      <p className="alloy-p" style={{ maxWidth: 420, margin: "0 auto 26px" }}>
        Nothing lives at this address — the token, wallet, or page you&apos;re looking for doesn&apos;t exist here.
      </p>
      <div className="alloy-cta-row" style={{ justifyContent: "center" }}>
        <Link href="/" data-fx="magnet" className="alloy-btn-primary">
          Home
        </Link>
        <Link href="/ideas" data-fx="magnet" className="alloy-btn-secondary">
          Browse tokens
        </Link>
      </div>
    </div>
  );
}
