import { Pool, types, type PoolClient } from "pg";
import { YOU_WALLET_ID } from "./constants";

// pg returns BIGINT (oid 20) columns as strings by default, since JS numbers can't losslessly
// represent the full 64-bit range. Every timestamp column here is a millisecond epoch value —
// comfortably within Number.MAX_SAFE_INTEGER for the next few centuries — and the app already
// treats timestamps as plain numbers everywhere, so parse them back to numbers once here
// instead of at every call site.
types.setTypeParser(20, (val: string) => parseInt(val, 10));

declare global {

  var __alloyPool: Pool | undefined;

  var __alloySeedPromise: Promise<void> | undefined;
}

/** Anything that can run a parameterized query: the pool itself for one-off statements, or a
 * checked-out client inside withTransaction() so a multi-statement operation stays on one
 * connection (and inside one BEGIN/COMMIT). */
export type DB = Pool | PoolClient;

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Point it at your Supabase Postgres connection string (see .env.local.example)."
    );
  }
  return new Pool({
    connectionString,
    // Supabase requires SSL, and there's no local CA bundle to validate against from a
    // serverless function — this (not disabling SSL) is the standard pattern for connecting
    // to Supabase from Vercel.
    ssl: { rejectUnauthorized: false },
    // Supabase's pooler (Supavisor, port 6543) already pools upstream connections; keeping
    // this small avoids one serverless instance opening a pile of its own on top of that.
    max: 3,
  });
}

function getPool(): Pool {
  if (!global.__alloyPool) {
    global.__alloyPool = createPool();
  }
  return global.__alloyPool;
}

export async function dbGet<T = Record<string, unknown>>(
  db: DB,
  text: string,
  params: unknown[] = []
): Promise<T | undefined> {
  const result = await db.query(text, params);
  return result.rows[0] as T | undefined;
}

export async function dbAll<T = Record<string, unknown>>(
  db: DB,
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await db.query(text, params);
  return result.rows as T[];
}

export async function dbRun(
  db: DB,
  text: string,
  params: unknown[] = []
): Promise<{ rowCount: number | null }> {
  const result = await db.query(text, params);
  return { rowCount: result.rowCount };
}

/** Runs `fn` against a single checked-out connection wrapped in BEGIN/COMMIT, rolling back
 * (and rethrowing) on any error. Pass the `client` argument through to every nested query so
 * the whole operation stays atomic — SQLite's single-writer model gave this for free with a
 * bare `db.transaction()`; Postgres needs the explicit connection threaded through. */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Provisions the singleton rows a fresh database needs to not crash (the shared guest
 * wallet, and the reward_pool/treasury rows executeBuy/executeSell read unconditionally).
 * No demo bots, no fake tokens, no fabricated trade history — real tokens only get created
 * through the real on-chain flow (see app/(app)/create and /api/tokens). Guarded by a shared
 * promise so concurrent cold-start requests await the same run instead of racing each other. */
export async function getDb(): Promise<DB> {
  const pool = getPool();
  if (!global.__alloySeedPromise) {
    global.__alloySeedPromise = seed(pool).catch((err) => {
      global.__alloySeedPromise = undefined;
      throw err;
    });
  }
  await global.__alloySeedPromise;
  return pool;
}

async function seed(db: DB) {
  const walletCount = Number((await dbGet<{ c: string | number }>(db, "SELECT COUNT(*) as c FROM wallets"))!.c);
  if (walletCount > 0) return;

  await dbRun(db, "INSERT INTO reward_pool (id, total_staked, acc_core_per_embr, lifetime_core_distributed) VALUES (1, 0, 0, 0) ON CONFLICT (id) DO NOTHING");
  await dbRun(db, "INSERT INTO treasury (id, core_balance) VALUES (1, 0) ON CONFLICT (id) DO NOTHING");

  // The shared guest identity anonymous visitors browse as before connecting a real wallet
  // (see YOU_WALLET_ID / getSessionWalletId in lib/auth.ts) — zero balances, not a fake
  // starter grant. Every route that reads a wallet row expects this one to exist.
  await dbRun(
    db,
    `INSERT INTO wallets (id, name, avatar, is_you, core_balance, embr_balance, funded_by, created_at)
     VALUES ($1, 'You', '🔥', 1, 0, 0, NULL, $2)`,
    [YOU_WALLET_ID, Date.now()]
  );

  console.log("[alloy] seeded fresh database");
}
