import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentPrice } from "@/lib/bondingCurve";
import { pendingRewards } from "@/lib/rewards";
import { getSessionWalletId } from "@/lib/auth";
import type { TokenRow } from "@/lib/trading";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // externalContact/coreBalance/embrBalance below are private — only the owner ever needs
  // this route (the public-safe subset lives at /api/wallet/[id]/profile instead).
  const sessionWalletId = await getSessionWalletId();
  if (sessionWalletId !== id) {
    return NextResponse.json({ error: "You can only view your own wallet" }, { status: 403 });
  }

  const db = getDb();

  const wallet = db.prepare("SELECT * FROM wallets WHERE id = ?").get(id) as
    | {
        id: string;
        name: string;
        avatar: string;
        core_balance: number;
        embr_balance: number;
        external_contact: string | null;
      }
    | undefined;
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const holdingRows = db
    .prepare(
      `SELECT holdings.token_id, holdings.amount, tokens.*
       FROM holdings JOIN tokens ON tokens.id = holdings.token_id
       WHERE holdings.wallet_id = ? AND holdings.amount > 0.0001`
    )
    .all(id) as (TokenRow & { token_id: string; amount: number })[];

  const holdings = holdingRows.map((h) => {
    const price = h.graduated ? currentPrice(h.pool_core!, h.pool_token!) : currentPrice(h.v_core, h.v_token);
    return {
      tokenId: h.token_id,
      ticker: h.ticker,
      name: h.name,
      image: h.image,
      amount: h.amount,
      price,
      value: price * h.amount,
      graduated: !!h.graduated,
    };
  });

  const stakePos = db
    .prepare("SELECT staked, claimed_core FROM stake_positions WHERE wallet_id = ?")
    .get(id) as { staked: number; claimed_core: number } | undefined;

  return NextResponse.json({
    wallet: {
      id: wallet.id,
      name: wallet.name,
      avatar: wallet.avatar,
      coreBalance: wallet.core_balance,
      embrBalance: wallet.embr_balance,
      externalContact: wallet.external_contact,
    },
    holdings,
    portfolioValue: holdings.reduce((sum, h) => sum + h.value, 0),
    staking: {
      staked: stakePos?.staked ?? 0,
      claimedCore: stakePos?.claimed_core ?? 0,
      pendingCore: pendingRewards(db, id),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const existing = db.prepare("SELECT id FROM wallets WHERE id = ?").get(id);
  if (!existing) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const sessionWalletId = await getSessionWalletId();
  if (sessionWalletId !== id) {
    return NextResponse.json({ error: "You can only edit your own profile" }, { status: 403 });
  }

  const body = await req.json();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (typeof body.name === "string" && body.name.trim()) {
    updates.push("name = ?");
    values.push(body.name.trim().slice(0, 30));
  }
  if (typeof body.avatar === "string" && body.avatar.trim()) {
    updates.push("avatar = ?");
    values.push(body.avatar.trim().slice(0, 200));
  }
  if (typeof body.banner === "string") {
    const banner = body.banner.trim().slice(0, 200) || null;
    updates.push("banner = ?");
    values.push(banner);
    if (banner) {
      updates.push("banner_preset = ?");
      values.push(null);
    }
  }
  if (typeof body.bannerPreset === "string") {
    const preset = body.bannerPreset.trim().slice(0, 40) || null;
    updates.push("banner_preset = ?");
    values.push(preset);
    if (preset) {
      updates.push("banner = ?");
      values.push(null);
    }
  }
  if (typeof body.bio === "string") {
    updates.push("bio = ?");
    values.push(body.bio.trim().slice(0, 280) || null);
  }
  if (typeof body.verifiedOnlyMessages === "boolean") {
    updates.push("verified_only_messages = ?");
    values.push(body.verifiedOnlyMessages ? 1 : 0);
  }
  if (typeof body.externalContact === "string") {
    updates.push("external_contact = ?");
    values.push(body.externalContact.trim().slice(0, 200));
  }
  if (typeof body.twitterHandle === "string") {
    const handle = body.twitterHandle.trim().replace(/^@/, "").slice(0, 15);
    updates.push("twitter_handle = ?");
    values.push(handle || null);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  values.push(id);
  db.prepare(`UPDATE wallets SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  return NextResponse.json({ ok: true });
}
