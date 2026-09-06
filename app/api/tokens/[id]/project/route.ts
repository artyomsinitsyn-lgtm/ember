import { NextResponse } from "next/server";
import { getDb, dbGet } from "@/lib/db";
import { getSessionWalletId } from "@/lib/auth";
import { upsertProject, serializeProject } from "@/lib/projects";
import { serializeToken } from "@/lib/serialize";
import { assessRugRisk } from "@/lib/rugDetection";
import type { TokenRow } from "@/lib/trading";

/** The single endpoint both the /create "Idea/Project" tab and an existing token's
 * "upgrade to project" panel call — attaches or updates the optional rich metadata for an
 * ALREADY-EXISTING token, without touching its bonding-curve/trading row. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();

  const row = await dbGet<TokenRow & { creator_name: string }>(
    db,
    `SELECT tokens.*, wallets.name as creator_name FROM tokens
     JOIN wallets ON wallets.id = tokens.creator_id WHERE tokens.id = $1`,
    [id]
  );
  if (!row) return NextResponse.json({ error: "Token not found" }, { status: 404 });

  const sessionWalletId = await getSessionWalletId();
  if (sessionWalletId !== row.creator_id) {
    return NextResponse.json({ error: "You can only edit your own token" }, { status: 403 });
  }

  const body = await req.json();
  const projectRow = await upsertProject(db, id, {
    tagline: body.tagline,
    details: body.details,
    roadmap: body.roadmap,
    discord: body.discord,
    github: body.github,
  });

  const updatedRow = (await dbGet<TokenRow>(db, "SELECT * FROM tokens WHERE id = $1", [id]))!;
  const rugRisk = await assessRugRisk(db, id);

  return NextResponse.json({
    project: serializeProject(projectRow),
    token: serializeToken(updatedRow, row.creator_name, rugRisk.riskLevel),
  });
}
