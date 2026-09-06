import { type DB, dbGet, dbAll } from "./db";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const UNVERIFIED_WEEKLY_CAP = 5;
const VERIFIED_WEEKLY_CAP = 25;
const REPUTATION_SAMPLE_MIN = 4;
const HIGH_DECLINE_RATE = 0.5;

/**
 * Anti-spam throttle for outbound connection requests, modeled on how Steam/LinkedIn
 * keep friend-request floods down: a flat weekly cap that's higher for verified wallets
 * (Steam-style), shrunk further if the requester's own request history skews toward
 * declines (LinkedIn's reputation-scored cap). A pump.fun-style anonymous bot farm can
 * always fake "verified" here since verification itself needs contact + profit, so this
 * is the second line of defense behind the recipient's own verified-only toggle.
 */
export async function checkOutboundRateLimit(
  db: DB,
  requesterId: string,
  requesterVerified: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const baseCap = requesterVerified ? VERIFIED_WEEKLY_CAP : UNVERIFIED_WEEKLY_CAP;

  const resolved = await dbAll<{ status: string }>(
    db,
    `SELECT status FROM connections WHERE requester_id = $1 AND status IN ('accepted','declined')`,
    [requesterId]
  );

  let cap = baseCap;
  if (resolved.length >= REPUTATION_SAMPLE_MIN) {
    const declineRate = resolved.filter((r) => r.status === "declined").length / resolved.length;
    if (declineRate > HIGH_DECLINE_RATE) cap = Math.max(2, Math.floor(baseCap / 2));
  }

  const sentRecently = (await dbGet<{ c: number }>(
    db,
    `SELECT COUNT(*) as c FROM connections WHERE requester_id = $1 AND created_at > $2`,
    [requesterId, Date.now() - WEEK_MS]
  ))!;

  if (sentRecently.c >= cap) {
    return {
      ok: false,
      error:
        cap < baseCap
          ? `You've hit your connection request limit (${cap}/week) — it's lower than usual because a lot of your recent requests were declined. Try again next week.`
          : `You've sent ${cap} connection requests this week, the limit for ${
              requesterVerified ? "verified" : "unverified"
            } wallets. Try again next week.`,
    };
  }

  return { ok: true };
}
