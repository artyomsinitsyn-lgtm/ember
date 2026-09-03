import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { computeWalletProfile } from "@/lib/profile";
import { formatUsd } from "@/lib/format";
import ProfilePageClient from "@/components/ProfilePageClient";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const profile = computeWalletProfile(getDb(), id);
  if (!profile) return { title: "Wallet not found | Alloy" };

  return {
    title: `${profile.name} | Alloy`,
    description: `${profile.name}'s Alloy profile — ${formatUsd(profile.netWorth)} net worth, ${profile.tokensCreated} tokens launched.`,
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProfilePageClient id={id} />;
}
