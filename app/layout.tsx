import type { Metadata } from "next";
import { Anton, Chakra_Petch, IBM_Plex_Mono } from "next/font/google";
import Providers from "./providers";
import CursorFx from "@/components/CursorFx";
import PresenceBeacon from "@/components/PresenceBeacon";
import AlloyHeader from "@/components/AlloyHeader";
import ClusterBanner from "@/components/ClusterBanner";
import AlloyTicker from "@/components/AlloyTicker";
import AlloyFooter from "@/components/AlloyFooter";
import PageTransition from "@/components/PageTransition";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import "./landing.css";
import { STAKE_TICKER } from "@/lib/constants";

const display = Anton({ variable: "--alloy-display", subsets: ["latin"], weight: "400" });
const body = Chakra_Petch({ variable: "--alloy-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const mono = IBM_Plex_Mono({ variable: "--alloy-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Alloy",
  description: `Tokens, not memecoins. Fees flow back to ${STAKE_TICKER} holders, not just the house.`,
};

// Applies the persisted theme/performance-mode settings (see lib/settings.ts) to <html>
// before hydration, so there's no flash of the wrong theme or a frame of full animation
// before performance mode kicks in. Keep the localStorage keys in sync with lib/settings.ts.
const SETTINGS_BOOT_SCRIPT = `(function(){try{
  var t = localStorage.getItem("alloy-theme") === "light" ? "light" : "dark";
  var p = localStorage.getItem("alloy-perf") === "1";
  document.documentElement.dataset.theme = t;
  if (p) document.documentElement.classList.add("perf-mode");
}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SETTINGS_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Providers>
          <div className="alloy-page">
            <div className="alloy-noise-a" />
            <div className="alloy-noise-b" />
            <ClusterBanner />
            <AlloyHeader />
            <AlloyTicker />
            <PageTransition>{children}</PageTransition>
            <AlloyFooter />
          </div>
        </Providers>
        <CursorFx />
        <PresenceBeacon />
      </body>
    </html>
  );
}
