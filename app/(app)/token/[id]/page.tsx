import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { serializeToken } from "@/lib/serialize";
import { formatUsd } from "@/lib/format";
import TokenPageClient from "@/components/TokenPageClient";
import type { TokenRow } from "@/lib/trading";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const db = getDb();
  const row = db.prepare("SELECT * FROM tokens WHERE id = ?").get(id) as TokenRow | undefined;
  if (!row) return { title: "Token not found | Alloy" };

  const token = serializeToken(row);
  return {
    title: `$${token.ticker} — ${token.name} | Alloy`,
    description: `${token.name} (${formatUsd(token.marketCap)} market cap) — ${token.description || "trade it on Alloy."}`,
  };
}

export default async function TokenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TokenPageClient id={id} />;
}
