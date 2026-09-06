import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDb, dbGet, dbAll, dbRun } from "@/lib/db";
import { serializeToken } from "@/lib/serialize";
import { assessRugRisk } from "@/lib/rugDetection";
import { computeWalletProfile } from "@/lib/profile";
import { reputationBatch } from "@/lib/reputation";
import { computeBackerCounts, computeGrowthDeltas } from "@/lib/discovery";
import { getSessionWalletId } from "@/lib/auth";
import { getConnection } from "@/lib/onchain/program";
import { fetchCurveState } from "@/lib/onchain/curve";
import type { TokenRow } from "@/lib/trading";
import { TOTAL_SUPPLY, YOU_WALLET_ID } from "@/lib/constants";

export async function GET() {
  const db = await getDb();
  const rows = await dbAll<TokenRow & { creator_name: string }>(
    db,
    `SELECT tokens.*, wallets.name as creator_name
     FROM tokens JOIN wallets ON wallets.id = tokens.creator_id
     ORDER BY tokens.created_at DESC`
  );

  // A token is "verified" via its creator's own verified badge (confirmed contact +
  // profit threshold) — there's no separate token-level verification, so this is cached
  // per creator to avoid recomputing the same wallet profile for every one of their tokens.
  const creatorVerifiedCache = new Map<string, boolean>();
  const isCreatorVerified = async (creatorId: string) => {
    if (!creatorVerifiedCache.has(creatorId)) {
      creatorVerifiedCache.set(creatorId, (await computeWalletProfile(db, creatorId))?.verified ?? false);
    }
    return creatorVerifiedCache.get(creatorId)!;
  };

  const reputations = await reputationBatch(db, rows.map((r) => r.creator_id));
  const backerCounts = await computeBackerCounts(db);
  const growthDeltas = await computeGrowthDeltas(db);
  const projectMetaRows = await dbAll<{ token_id: string; tagline: string | null; roadmap_json: string | null }>(
    db,
    "SELECT token_id, tagline, roadmap_json FROM projects"
  );
  const projectMetaById = new Map(
    projectMetaRows.map((p) => [p.token_id, { tagline: p.tagline, hasRoadmap: !!p.roadmap_json && p.roadmap_json !== "[]" }])
  );

  const tokens = await Promise.all(
    rows.map(async (r) =>
      serializeToken(
        r,
        r.creator_name,
        (await assessRugRisk(db, r.id)).riskLevel,
        await isCreatorVerified(r.creator_id),
        projectMetaById.get(r.id) ?? null,
        reputations.get(r.creator_id)?.tier ?? "new",
        backerCounts.get(r.id) ?? 0,
        growthDeltas.get(r.id)?.delta ?? 0
      )
    )
  );
  return NextResponse.json({ tokens });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ticker = String(body.ticker || "").trim().toUpperCase().slice(0, 10);
  const name = String(body.name || "").trim().slice(0, 40);
  const description = String(body.description || "").trim().slice(0, 280);
  const rawImage = String(body.image || "🔥");
  // Emoji icons are a handful of code units; uploaded icons are "/uploads/<uuid>.<ext>" paths —
  // only clamp the former so a long path doesn't get truncated into garbage.
  const image = rawImage.startsWith("/uploads/") ? rawImage.slice(0, 200) : rawImage.slice(0, 8);
  const creatorId = await getSessionWalletId();

  const cleanUrl = (v: unknown) => {
    const s = String(v || "").trim().slice(0, 200);
    return s ? s : null;
  };
  const twitter = cleanUrl(body.twitter);
  const telegram = cleanUrl(body.telegram);
  const website = cleanUrl(body.website);

  if (!ticker || !name) {
    return NextResponse.json({ error: "Ticker and name are required" }, { status: 400 });
  }
  if (creatorId === YOU_WALLET_ID) {
    return NextResponse.json({ error: "Connect a real Solana wallet to launch a token" }, { status: 401 });
  }

  // Every launch now requires a real on-chain mint: the client signs and confirms
  // initialize_curve first, then hands us the mint address. We independently verify the
  // curve PDA actually exists on-chain before trusting it — a client can't just POST an
  // arbitrary string and get a listing with nothing real behind it.
  let mintAddress: PublicKey;
  try {
    mintAddress = new PublicKey(String(body.mintAddress || ""));
  } catch {
    return NextResponse.json({ error: "A real on-chain mint address is required" }, { status: 400 });
  }
  const onchainCurve = await fetchCurveState(await getConnection(), mintAddress);
  if (!onchainCurve) {
    return NextResponse.json(
      { error: "No bonding curve found on-chain for that mint — initialize_curve must be confirmed first" },
      { status: 400 }
    );
  }
  // curve.creator is set once, permanently, by whichever wallet actually called
  // initialize_curve on-chain — it's also who Trade's `has_one = creator` pays the real 40%
  // fee cut to. The session wallet calling this endpoint must be that same wallet, or anyone
  // who spots the (public) CurveInitialized event could race the real creator here and
  // register themselves as creator_id for a mint they never initialized.
  if (onchainCurve.creator !== creatorId) {
    return NextResponse.json(
      { error: "Only the wallet that initialized this curve on-chain can register it" },
      { status: 403 }
    );
  }

  const db = await getDb();
  const id = mintAddress.toBase58();
  const now = Date.now();

  // No pre-check-then-insert: `id` (the mint address) is the table's primary key, so the
  // INSERT itself is the atomic uniqueness check — two concurrent registration attempts for
  // the same mint can't both succeed, regardless of ordering.
  try {
    await dbRun(
      db,
      `INSERT INTO tokens (id, ticker, name, description, image, creator_id, v_core, v_token, real_core, real_token, total_supply, graduated, graduated_at, pool_core, pool_token, created_at, twitter, telegram, website)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, NULL, NULL, NULL, $12, $13, $14, $15)`,
      [
        id,
        ticker,
        name,
        description,
        image,
        creatorId,
        onchainCurve.virtualCore,
        onchainCurve.virtualToken,
        onchainCurve.realCore,
        onchainCurve.realToken,
        TOTAL_SUPPLY,
        now,
        twitter,
        telegram,
        website,
      ]
    );
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      return NextResponse.json({ error: "Token already registered" }, { status: 409 });
    }
    throw err;
  }

  const row = (await dbGet<TokenRow>(db, "SELECT * FROM tokens WHERE id = $1", [id]))!;
  return NextResponse.json({ token: serializeToken(row) }, { status: 201 });
}
