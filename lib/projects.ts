import { type DB, dbGet, dbRun } from "./db";

export interface Milestone {
  id: string;
  title: string;
  detail?: string;
  status: "planned" | "in_progress" | "done";
  targetDate?: string | null;
}

export interface ProjectRow {
  token_id: string;
  tagline: string | null;
  details: string | null;
  roadmap_json: string | null;
  discord: string | null;
  github: string | null;
  created_at: number;
  updated_at: number;
}

export interface SerializedProject {
  tagline: string | null;
  details: string | null;
  roadmap: Milestone[];
  discord: string | null;
  github: string | null;
  updatedAt: number;
}

const MAX_ROADMAP_ITEMS = 12;

export async function getProject(db: DB, tokenId: string): Promise<ProjectRow | undefined> {
  return dbGet<ProjectRow>(db, "SELECT * FROM projects WHERE token_id = $1", [tokenId]);
}

export function serializeProject(row: ProjectRow): SerializedProject {
  let roadmap: Milestone[] = [];
  if (row.roadmap_json) {
    try {
      roadmap = JSON.parse(row.roadmap_json);
    } catch {
      roadmap = [];
    }
  }
  return {
    tagline: row.tagline,
    details: row.details,
    roadmap,
    discord: row.discord,
    github: row.github,
    updatedAt: row.updated_at,
  };
}

function clampMilestones(input: unknown): Milestone[] {
  if (!Array.isArray(input)) return [];
  const statuses = new Set(["planned", "in_progress", "done"]);
  return input.slice(0, MAX_ROADMAP_ITEMS).map((m, i) => ({
    id: typeof m?.id === "string" && m.id ? m.id.slice(0, 40) : `m${i}`,
    title: String(m?.title ?? "").trim().slice(0, 80),
    detail: m?.detail ? String(m.detail).trim().slice(0, 300) : undefined,
    status: statuses.has(m?.status) ? m.status : "planned",
    targetDate: m?.targetDate ? String(m.targetDate).slice(0, 10) : null,
  }));
}

export async function upsertProject(
  db: DB,
  tokenId: string,
  input: { tagline?: string; details?: string; roadmap?: unknown; discord?: string; github?: string }
): Promise<ProjectRow> {
  const now = Date.now();
  const clean = (v: unknown, max: number) => {
    const s = String(v ?? "").trim().slice(0, max);
    return s || null;
  };
  const tagline = clean(input.tagline, 140);
  const details = clean(input.details, 4000);
  const roadmapJson = JSON.stringify(clampMilestones(input.roadmap));
  const discord = clean(input.discord, 200);
  const github = clean(input.github, 200);

  await dbRun(
    db,
    `INSERT INTO projects (token_id, tagline, details, roadmap_json, discord, github, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (token_id) DO UPDATE SET
       tagline = EXCLUDED.tagline,
       details = EXCLUDED.details,
       roadmap_json = EXCLUDED.roadmap_json,
       discord = EXCLUDED.discord,
       github = EXCLUDED.github,
       updated_at = EXCLUDED.updated_at`,
    [tokenId, tagline, details, roadmapJson, discord, github, now, now]
  );

  return (await getProject(db, tokenId))!;
}
