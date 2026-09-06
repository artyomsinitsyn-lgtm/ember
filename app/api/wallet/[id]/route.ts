import { NextRequest, NextResponse } from "next/server";
import { getDb, dbGet, dbAll, dbRun } from "@/lib/db";
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

  const db = await getDb();

  const wallet = await dbGet<{
    id: string;
    name: string;
    avatar: string;
    core_balance: number;
    embr_balance: number;
    external_contact: string | null;
  }>(db, "SELECT * FROM wallets WHERE id = $1", [id]);
  if (!wallet) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const holdingRows = await dbAll<TokenRow & { token_id: string; amount: number }>(
    db,
    `SELECT holdings.token_id, holdings.amount, tokens.*
     FROM holdings JOIN tokens ON tokens.id = holdings.token_id
     WHERE holdings.wallet_id = $1 AND holdings.amount > 0.0001`,
    [id]
  );

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

  const stakePos = await dbGet<{ staked: number; claimed_core: number }>(
    db,
    "SELECT staked, claimed_core FROM stake_positions WHERE wallet_id = $1",
    [id]
  );

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
      pendingCore: await pendingRewards(db, id),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();

  const existing = await dbGet(db, "SELECT id FROM wallets WHERE id = $1", [id]);
  if (!existing) return NextResponse.json({ error: "Wallet not found" }, { status: 404 });

  const sessionWalletId = await getSessionWalletId();
  if (sessionWalletId !== id) {
    return NextResponse.json({ error: "You can only edit your own profile" }, { status: 403 });
  }

  const body = await req.json();
  const updates: string[] = [];
  const values: unknown[] = [];
  // Called after pushing each value, so values.length is already that value's 1-indexed position.
  const next = () => `$${values.length}`;

  if (typeof body.name === "string" && body.name.trim()) {
    values.push(body.name.trim().slice(0, 30));
    updates.push(`name = ${next()}`);
  }
  if (typeof body.avatar === "string" && body.avatar.trim()) {
    values.push(body.avatar.trim().slice(0, 200));
    updates.push(`avatar = ${next()}`);
  }
  if (typeof body.banner === "string") {
    const banner = body.banner.trim().slice(0, 200) || null;
    values.push(banner);
    updates.push(`banner = ${next()}`);
    if (banner) {
      values.push(null);
      updates.push(`banner_preset = ${next()}`);
    }
  }
  if (typeof body.bannerPreset === "string") {
    const preset = body.bannerPreset.trim().slice(0, 40) || null;
    values.push(preset);
    updates.push(`banner_preset = ${next()}`);
    if (preset) {
      values.push(null);
      updates.push(`banner = ${next()}`);
    }
  }
  if (typeof body.bio === "string") {
    values.push(body.bio.trim().slice(0, 280) || null);
    updates.push(`bio = ${next()}`);
  }
  if (typeof body.verifiedOnlyMessages === "boolean") {
    values.push(body.verifiedOnlyMessages ? 1 : 0);
    updates.push(`verified_only_messages = ${next()}`);
  }
  if (typeof body.externalContact === "string") {
    values.push(body.externalContact.trim().slice(0, 200));
    updates.push(`external_contact = ${next()}`);
  }
  if (typeof body.twitterHandle === "string") {
    const handle = body.twitterHandle.trim().replace(/^@/, "").slice(0, 15);
    values.push(handle || null);
    updates.push(`twitter_handle = ${next()}`);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  values.push(id);
  await dbRun(db, `UPDATE wallets SET ${updates.join(", ")} WHERE id = ${next()}`, values);

  return NextResponse.json({ ok: true });
}
