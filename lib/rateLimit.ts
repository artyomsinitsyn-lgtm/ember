import { type DB, dbGet } from "./db";

const MINUTE_MS = 60_000;
const MAX_TRADES_PER_MINUTE = 20;
const MAX_POSTS_PER_MINUTE = 3;
const MAX_REPLIES_PER_MINUTE = 10;
const MAX_REPORTS_PER_MINUTE = 5;
const MAX_FEEDBACK_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Event-sourced from the ledger itself rather than a separate counters table — same
 * philosophy as checkOutboundRateLimit in lib/connections.ts, just applied to the two
 * write paths that had no throttle at all: trading and posting.
 */
export async function checkTradeRateLimit(db: DB, walletId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const count = (
    await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM trades WHERE wallet_id = $1 AND created_at > $2", [
      walletId,
      Date.now() - MINUTE_MS,
    ])
  )!.c;
  if (count >= MAX_TRADES_PER_MINUTE) {
    return { ok: false, error: `Slow down — max ${MAX_TRADES_PER_MINUTE} trades per minute.` };
  }
  return { ok: true };
}

export async function checkPostRateLimit(db: DB, walletId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const count = (
    await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM feed_posts WHERE wallet_id = $1 AND created_at > $2", [
      walletId,
      Date.now() - MINUTE_MS,
    ])
  )!.c;
  if (count >= MAX_POSTS_PER_MINUTE) {
    return { ok: false, error: `Slow down — max ${MAX_POSTS_PER_MINUTE} posts per minute.` };
  }
  return { ok: true };
}

export async function checkReplyRateLimit(db: DB, walletId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const count = (
    await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM post_replies WHERE wallet_id = $1 AND created_at > $2", [
      walletId,
      Date.now() - MINUTE_MS,
    ])
  )!.c;
  if (count >= MAX_REPLIES_PER_MINUTE) {
    return { ok: false, error: `Slow down — max ${MAX_REPLIES_PER_MINUTE} replies per minute.` };
  }
  return { ok: true };
}

export async function checkReportRateLimit(db: DB, walletId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const count = (
    await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM reports WHERE reporter_id = $1 AND created_at > $2", [
      walletId,
      Date.now() - MINUTE_MS,
    ])
  )!.c;
  if (count >= MAX_REPORTS_PER_MINUTE) {
    return { ok: false, error: `Slow down — max ${MAX_REPORTS_PER_MINUTE} reports per minute.` };
  }
  return { ok: true };
}

export async function checkFeedbackRateLimit(db: DB, walletId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const count = (
    await dbGet<{ c: number }>(db, "SELECT COUNT(*) as c FROM feedback WHERE wallet_id = $1 AND created_at > $2", [
      walletId,
      Date.now() - DAY_MS,
    ])
  )!.c;
  if (count >= MAX_FEEDBACK_PER_DAY) {
    return { ok: false, error: `Slow down — max ${MAX_FEEDBACK_PER_DAY} submissions per day.` };
  }
  return { ok: true };
}
