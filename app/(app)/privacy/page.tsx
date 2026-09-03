import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy | Alloy" };

// DRAFT — accurate to how the app currently works, but not reviewed by a lawyer. Depending on
// where you operate, you may owe users a GDPR/CCPA-style rights section (access, export,
// deletion request process) beyond what's drafted here — get counsel before mainnet launch.

const SECTIONS = [
  {
    h: "What's stored",
    p: 'Your Solana public key (once you connect a wallet), display name, avatar, banner, and bio, any phone number or email you submit for verification, images you upload, and every trade, stake, post, and connection request you make while using the site. All of it lives in Alloy\'s own database — nothing is sent to a third-party analytics or ad service.',
  },
  {
    h: "On-chain activity is public and permanent",
    p: "Once you connect a wallet, your buys, sells, and token launches are real Solana transactions — visible to anyone on any Solana block explorer, forever, independent of anything Alloy does. Deleting your Alloy profile removes what we store about you; it cannot and does not remove your transaction history from the blockchain itself. Don't connect a wallet you don't want linked to public on-chain activity.",
  },
  {
    h: "The session cookie",
    p: "Signing in sets one httpOnly cookie that ties your browser to a wallet id, used purely to authorize writes to that wallet's data. It isn't used for tracking across sites and carries no personal data itself — just a signed wallet id.",
  },
  {
    h: "Contact verification",
    p: "Phone and email verification confirms you control the contact info you submit, and unlocks the verified badge and \"verified-only\" contact settings. As this platform is pre-launch, verification currently runs in a simulated mode — clearly labeled in the UI — where the confirmation code is returned directly instead of sent by SMS/email; a real deployment before public launch will route through an actual provider and this section will be updated to reflect that.",
  },
  {
    h: "RPC providers can see wallet activity",
    p: "When your wallet talks to the Solana network (to fetch balances, submit trades), that traffic goes through an RPC provider, which — like any node you connect to on any blockchain — can see the requesting IP address and the wallet activity involved. That's inherent to how Solana works, not something Alloy adds; it's disclosed here so it's not a surprise.",
  },
  {
    h: "What we don't do",
    p: "No cookies are set for advertising. No data is sold or shared with third parties. There's no email list, no marketing pixel, and no cross-site tracking.",
  },
  {
    h: "Data retention & deletion",
    p: "You can request deletion of the off-chain data Alloy holds about you (profile, contact info, images) by contacting [privacy@alloy.xyz — REPLACE WITH A REAL MONITORED ADDRESS]. As noted above, on-chain transaction history is outside our control and isn't something any deletion request can remove.",
  },
  {
    h: "Changes to this policy",
    p: "We may update this policy as the product changes. Material changes will be reflected here with an updated date.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="alloy-dash" style={{ maxWidth: 680 }}>
      <div className="alloy-kicker">LEGAL</div>
      <h1 className="alloy-h1-page" style={{ marginBottom: 6 }}>
        Privacy
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
