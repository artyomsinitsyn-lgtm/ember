import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg is Node-only (net/tls/util Node builtins) — keep it out of any bundle Next.js might
  // otherwise try to trace for a client/edge target, on top of the real fix (no client
  // component should import it transitively at all; see lib/reputationTier.ts).
  serverExternalPackages: ["pg"],
};

export default nextConfig;
