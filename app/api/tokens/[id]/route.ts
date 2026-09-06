import { NextResponse } from "next/server";
import { getDb, dbGet, dbAll, dbRun } from "@/lib/db";
import { serializeToken } from "@/lib/serialize";
import { assessRugRisk } from "@/lib/rugDetection";
import { computeTokenHolderPositions } from "@/lib/positions";
import { getProject, serializeProject } from "@/lib/projects";
import { computeCreatorReputation } from "@/lib/reputation";
import { getSessionWalletId } from "@/lib/auth";
import type { TokenRow } from "@/lib/trading";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();

  const row = await dbGet<TokenRow & { creator_name: string }>(
    db,
    `SELECT tokens.*, wallets.name as creator_name
     FROM tokens JOIN wallets ON wallets.id = tokens.creator_id
     WHERE tokens.id = $1`,
    [id]
  );

  if (!row) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  const trades = await dbAll(
    db,
    `SELECT trades.*, wallets.name as wallet_name, wallets.avatar as wallet_avatar
     FROM trades JOIN wallets ON wallets.id = trades.wallet_id
     WHERE token_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [id]
  );

  const holders = (await computeTokenHolderPositions(db, id)).slice(0, 50);

  const rugRisk = await assessRugRisk(db, id);
  const projectRow = await getProject(db, id);
  const creatorReputation = await computeCreatorReputation(db, row.creator_id);
  const backerCount = (
    await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM holdings WHERE token_id = $1 AND amount > 0.0001", [id])
  )!.c;

  return NextResponse.json({
    token: serializeToken(
      row,
      row.creator_name,
      rugRisk.riskLevel,
      false,
      projectRow ? { tagline: projectRow.tagline, hasRoadmap: !!projectRow.roadmap_json && projectRow.roadmap_json !== "[]" } : null,
      creatorReputation.tier,
      backerCount
    ),
    rugRisk,
    curve: {
      vCore: row.v_core,
      vToken: row.v_token,
      realCore: row.real_core,
      realToken: row.real_token,
      poolCore: row.pool_core,
      poolToken: row.pool_token,
    },
    trades,
    holders,
    project: projectRow ? serializeProject(projectRow) : null,
    creatorReputation,
  });
}

/** Lightweight description edit — available to every token's creator regardless of tier,
 * since `tokens.description` is otherwise set once at launch and never editable again.
 * Deliberately separate from the Idea/Project upgrade flow in lib/projects.ts: a Basic
 * Token creator who just wants to fix a typo shouldn't have to opt into a roadmap/tagline. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();

  const row = await dbGet<{ creator_id: string }>(db, "SELECT creator_id FROM tokens WHERE id = $1", [id]);
  if (!row) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  const sessionWalletId = await getSessionWalletId();
  if (sessionWalletId !== row.creator_id) {
    return NextResponse.json({ error: "You can only edit your own token" }, { status: 403 });
  }

  const body = await req.json();
  if (typeof body.description !== "string") {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  const description = body.description.trim().slice(0, 280);

  await dbRun(db, "UPDATE tokens SET description = $1 WHERE id = $2", [description, id]);
  return NextResponse.json({ ok: true });
}
