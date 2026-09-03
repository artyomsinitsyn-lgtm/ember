import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  TOTAL_SUPPLY,
  INITIAL_VIRTUAL_TOKEN_RESERVES,
  INITIAL_VIRTUAL_CORE_RESERVES,
  INITIAL_REAL_TOKEN_RESERVES,
  GRADUATION_CORE_RAISED,
  YOU_WALLET_ID,
} from "./constants";
import { executeBuy, executeSell } from "./trading";

const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

declare global {
   
  var __emberDb: Database.Database | undefined;
}

function init(db: Database.Database) {
  db.pragma("journal_mode = WAL");

  // One-time migration for databases seeded before the "asseto" -> "token" rename: an
  // existing file still has the old table/column names, and CREATE TABLE IF NOT EXISTS
  // below won't touch them, so the app would otherwise be querying columns that don't
  // exist. Renaming here (not recreating) keeps every already-seeded token, trade, and
  // holding intact instead of silently starting from an empty tokens table.
  const existingTables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
    (t) => t.name
  );
  if (existingTables.includes("assetos") && !existingTables.includes("tokens")) {
    db.exec("ALTER TABLE assetos RENAME TO tokens");
  }
  if (existingTables.includes("holdings")) {
    const holdingsCols = (db.prepare("PRAGMA table_info(holdings)").all() as { name: string }[]).map((c) => c.name);
    if (holdingsCols.includes("asseto_id") && !holdingsCols.includes("token_id")) {
      db.exec("ALTER TABLE holdings RENAME COLUMN asseto_id TO token_id");
    }
  }
  if (existingTables.includes("trades")) {
    const tradesCols = (db.prepare("PRAGMA table_info(trades)").all() as { name: string }[]).map((c) => c.name);
    if (tradesCols.includes("asseto_id") && !tradesCols.includes("token_id")) {
      db.exec("ALTER TABLE trades RENAME COLUMN asseto_id TO token_id");
    }
  }
  if (existingTables.includes("feed_posts")) {
    const feedCols = (db.prepare("PRAGMA table_info(feed_posts)").all() as { name: string }[]).map((c) => c.name);
    if (feedCols.includes("asseto_id") && !feedCols.includes("token_id")) {
      db.exec("ALTER TABLE feed_posts RENAME COLUMN asseto_id TO token_id");
    }
  }
  db.exec("DROP INDEX IF EXISTS idx_trades_asseto");

  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT,
      is_you INTEGER NOT NULL DEFAULT 0,
      core_balance REAL NOT NULL DEFAULT 0,
      embr_balance REAL NOT NULL DEFAULT 0,
      funded_by TEXT,
      contact TEXT,
      contact_type TEXT,
      contact_verified_at INTEGER,
      verified_only_messages INTEGER NOT NULL DEFAULT 0,
      external_contact TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL,
      recipient_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      responded_at INTEGER
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_connections_pair ON connections(requester_id, recipient_id);

    CREATE TABLE IF NOT EXISTS verification_codes (
      wallet_id TEXT PRIMARY KEY,
      contact TEXT NOT NULL,
      contact_type TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      image TEXT,
      creator_id TEXT NOT NULL,
      v_core REAL NOT NULL,
      v_token REAL NOT NULL,
      real_core REAL NOT NULL,
      real_token REAL NOT NULL,
      total_supply REAL NOT NULL,
      graduated INTEGER NOT NULL DEFAULT 0,
      graduated_at INTEGER,
      pool_core REAL,
      pool_token REAL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS holdings (
      wallet_id TEXT NOT NULL,
      token_id TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (wallet_id, token_id)
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      token_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      side TEXT NOT NULL,
      core_amount REAL NOT NULL,
      token_amount REAL NOT NULL,
      price REAL NOT NULL,
      fee_total REAL NOT NULL,
      fee_creator REAL NOT NULL,
      fee_staker REAL NOT NULL,
      fee_treasury REAL NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_trades_token ON trades(token_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet_id, created_at);

    CREATE TABLE IF NOT EXISTS stake_events (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stake_positions (
      wallet_id TEXT PRIMARY KEY,
      staked REAL NOT NULL DEFAULT 0,
      reward_debt REAL NOT NULL DEFAULT 0,
      claimed_core REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS reward_pool (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_staked REAL NOT NULL DEFAULT 0,
      acc_core_per_embr REAL NOT NULL DEFAULT 0,
      lifetime_core_distributed REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS treasury (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      core_balance REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS verification_requests (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      decided_at INTEGER,
      decided_by TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_requests_wallet ON verification_requests(wallet_id);

    CREATE TABLE IF NOT EXISTS treasury_withdrawals (
      signature TEXT PRIMARY KEY,
      to_wallet TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feed_posts (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      token_id TEXT,
      body TEXT NOT NULL,
      image TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_feed_posts_created ON feed_posts(created_at);

    CREATE TABLE IF NOT EXISTS post_likes (
      post_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (post_id, wallet_id)
    );

    CREATE TABLE IF NOT EXISTS post_replies (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      wallet_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_post_replies_post ON post_replies(post_id, created_at);

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique ON reports(target_type, target_id, reporter_id);

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      wallet_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      resolved_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);

    CREATE TABLE IF NOT EXISTS projects (
      token_id TEXT PRIMARY KEY,
      tagline TEXT,
      details TEXT,
      roadmap_json TEXT,
      discord TEXT,
      github TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_holdings_token ON holdings(token_id);
  `);

  const tokenCols = (db.prepare("PRAGMA table_info(tokens)").all() as { name: string }[]).map((c) => c.name);
  if (!tokenCols.includes("twitter")) db.exec("ALTER TABLE tokens ADD COLUMN twitter TEXT");
  if (!tokenCols.includes("telegram")) db.exec("ALTER TABLE tokens ADD COLUMN telegram TEXT");
  if (!tokenCols.includes("website")) db.exec("ALTER TABLE tokens ADD COLUMN website TEXT");
  if (!tokenCols.includes("category"))
    db.exec("ALTER TABLE tokens ADD COLUMN category TEXT NOT NULL DEFAULT 'memecoin'");

  const walletCols = (db.prepare("PRAGMA table_info(wallets)").all() as { name: string }[]).map((c) => c.name);
  if (!walletCols.includes("funded_by")) db.exec("ALTER TABLE wallets ADD COLUMN funded_by TEXT");
  if (!walletCols.includes("contact")) db.exec("ALTER TABLE wallets ADD COLUMN contact TEXT");
  if (!walletCols.includes("contact_type")) db.exec("ALTER TABLE wallets ADD COLUMN contact_type TEXT");
  if (!walletCols.includes("contact_verified_at")) db.exec("ALTER TABLE wallets ADD COLUMN contact_verified_at INTEGER");
  if (!walletCols.includes("verified_only_messages"))
    db.exec("ALTER TABLE wallets ADD COLUMN verified_only_messages INTEGER NOT NULL DEFAULT 0");
  if (!walletCols.includes("external_contact")) db.exec("ALTER TABLE wallets ADD COLUMN external_contact TEXT");
  if (!walletCols.includes("twitter_handle")) db.exec("ALTER TABLE wallets ADD COLUMN twitter_handle TEXT");
  if (!walletCols.includes("bio")) db.exec("ALTER TABLE wallets ADD COLUMN bio TEXT");
  if (!walletCols.includes("banner")) db.exec("ALTER TABLE wallets ADD COLUMN banner TEXT");
  if (!walletCols.includes("banner_preset")) db.exec("ALTER TABLE wallets ADD COLUMN banner_preset TEXT");

  // ZEBRA -> ALLOY rebrand: fix up flavor text already baked into a database seeded before
  // the rename, so an existing dev database doesn't keep showing the old name forever.
  db.exec(`UPDATE tokens SET description = REPLACE(description, 'ZEBRA', 'ALLOY') WHERE description LIKE '%ZEBRA%'`);

  const rewardRow = db.prepare("SELECT id FROM reward_pool WHERE id = 1").get();
  if (!rewardRow) {
    db.prepare(
      "INSERT INTO reward_pool (id, total_staked, acc_core_per_embr, lifetime_core_distributed) VALUES (1, 0, 0, 0)"
    ).run();
  }
  const treasuryRow = db.prepare("SELECT id FROM treasury WHERE id = 1").get();
  if (!treasuryRow) {
    db.prepare("INSERT INTO treasury (id, core_balance) VALUES (1, 0)").run();
  }
}

function seed(db: Database.Database) {
  const walletCount = (db.prepare("SELECT COUNT(*) as c FROM wallets").get() as { c: number }).c;
  if (walletCount > 0) return;

  const now = Date.now();
  const insertWallet = db.prepare(
    `INSERT INTO wallets (id, name, avatar, is_you, core_balance, embr_balance, funded_by, created_at)
     VALUES (@id, @name, @avatar, @is_you, @core_balance, @embr_balance, @funded_by, @created_at)`
  );

  insertWallet.run({
    id: YOU_WALLET_ID,
    name: "You",
    avatar: "🔥",
    is_you: 1,
    core_balance: 250,
    embr_balance: 5000,
    funded_by: null,
    created_at: now,
  });

  const bots = [
    { id: "bot_ash", name: "ashcollector", avatar: "🐉", core: 900, embr: 20000 },
    { id: "bot_kiln", name: "kiln.eth", avatar: "🏺", core: 1400, embr: 45000 },
    { id: "bot_flux", name: "flux_trades", avatar: "⚡", core: 600, embr: 8000 },
    { id: "bot_nova", name: "nova", avatar: "🌟", core: 2100, embr: 12000 },
  ];
  for (const b of bots) {
    insertWallet.run({
      id: b.id,
      name: b.name,
      avatar: b.avatar,
      is_you: 0,
      core_balance: b.core,
      embr_balance: b.embr,
      funded_by: null,
      created_at: now,
    });
  }

  // Seed ALLOY stakers so the reward pool has real weight behind it before "you" ever stakes.
  const insertStake = db.prepare(
    `INSERT INTO stake_positions (wallet_id, staked, reward_debt, claimed_core) VALUES (?, ?, 0, 0)`
  );
  const stakeAmounts: Record<string, number> = { bot_ash: 12000, bot_kiln: 30000, bot_nova: 6000 };
  let totalStaked = 0;
  for (const [id, amt] of Object.entries(stakeAmounts)) {
    insertStake.run(id, amt);
    totalStaked += amt;
    db.prepare("UPDATE wallets SET embr_balance = embr_balance - ? WHERE id = ?").run(amt, id);
  }
  db.prepare("UPDATE reward_pool SET total_staked = ? WHERE id = 1").run(totalStaked);

  const insertToken = db.prepare(
    `INSERT INTO tokens (id, ticker, name, description, image, creator_id, v_core, v_token, real_core, real_token, total_supply, graduated, graduated_at, pool_core, pool_token, created_at)
     VALUES (@id, @ticker, @name, @description, @image, @creator_id, @v_core, @v_token, 0, @real_token, @total_supply, 0, NULL, NULL, NULL, @created_at)`
  );

  const starters = [
    {
      id: "token_kilnborn",
      ticker: "KILN",
      name: "Kilnborn",
      description: "Forged in the first block. No presale, no team allocation, just curve.",
      image: "🏺",
      creator_id: "bot_kiln",
      minutesAgo: 340,
      numTrades: 50,
      avgBuyCore: 2.4,
      buyBias: 0.72,
    },
    {
      id: "token_ashfox",
      ticker: "ASHFOX",
      name: "Ashfox",
      description: "A fox that only appears once the fire dies down.",
      image: "🦊",
      creator_id: "bot_ash",
      minutesAgo: 95,
      numTrades: 24,
      avgBuyCore: 0.9,
      buyBias: 0.75,
    },
    {
      id: "token_fluxbeam",
      ticker: "FLUXB",
      name: "Fluxbeam",
      description: "Volatility as a feature, not a bug.",
      image: "⚡",
      creator_id: "bot_flux",
      minutesAgo: 22,
      numTrades: 10,
      avgBuyCore: 0.6,
      buyBias: 0.8,
    },
    {
      id: "token_novaburst",
      ticker: "NOVA",
      name: "Novaburst",
      description: "The first Token to graduate. Still earning ALLOY stakers fees on the pool.",
      image: "🌟",
      creator_id: "bot_nova",
      minutesAgo: 900,
      numTrades: 80,
      avgBuyCore: 2.6,
      buyBias: 0.68,
      forceGraduate: true,
    },
  ];

  const traderPool = ["bot_ash", "bot_kiln", "bot_flux", "bot_nova"];

  for (const s of starters) {
    insertToken.run({
      id: s.id,
      ticker: s.ticker,
      name: s.name,
      description: s.description,
      image: s.image,
      creator_id: s.creator_id,
      v_core: INITIAL_VIRTUAL_CORE_RESERVES,
      v_token: INITIAL_VIRTUAL_TOKEN_RESERVES,
      real_token: INITIAL_REAL_TOKEN_RESERVES,
      total_supply: TOTAL_SUPPLY,
      created_at: now - s.minutesAgo * 60_000,
    });

    simulateHistory(db, s, traderPool, now);
  }

  seedBundleDemo(db, traderPool, now);

  console.log("[ember] seeded fresh database");
}

/**
 * Seeds one Token that looks like ordinary organic activity on the board, but whose
 * early buyers were secretly funded by a single wallet and aped in within minutes of
 * each other — a real "bundling" rug pattern. No single wallet in the bundle holds
 * enough to trip a naive per-wallet threshold; only clustering by funding/timing catches it.
 */
function seedBundleDemo(db: Database.Database, traderPool: string[], now: number) {
  const insertWallet = db.prepare(
    `INSERT INTO wallets (id, name, avatar, is_you, core_balance, embr_balance, funded_by, created_at)
     VALUES (@id, @name, @avatar, 0, @core_balance, @embr_balance, @funded_by, @created_at)`
  );

  const minutesAgo = 260;
  const createdAt = now - minutesAgo * 60_000;

  insertWallet.run({
    id: "bot_shadow",
    name: "0xshadow",
    avatar: "🕶️",
    core_balance: 30,
    embr_balance: 0,
    funded_by: null,
    created_at: createdAt,
  });

  const sybilIds = ["sybil_7f3a", "sybil_c12d", "sybil_991e", "sybil_4bb8", "sybil_ad02"];
  for (const id of sybilIds) {
    insertWallet.run({
      id,
      name: id,
      avatar: "👤",
      core_balance: 12,
      embr_balance: 0,
      funded_by: "bot_shadow",
      created_at: createdAt,
    });
  }

  const tokenId = "token_driftking";
  db.prepare(
    `INSERT INTO tokens (id, ticker, name, description, image, creator_id, v_core, v_token, real_core, real_token, total_supply, graduated, graduated_at, pool_core, pool_token, created_at)
     VALUES (@id, @ticker, @name, @description, @image, @creator_id, @v_core, @v_token, 0, @real_token, @total_supply, 0, NULL, NULL, NULL, @created_at)`
  ).run({
    id: tokenId,
    ticker: "DRIFT",
    name: "Driftking",
    description: "Community-driven, fair launch.",
    image: "🌀",
    creator_id: "bot_shadow",
    v_core: INITIAL_VIRTUAL_CORE_RESERVES,
    v_token: INITIAL_VIRTUAL_TOKEN_RESERVES,
    real_token: INITIAL_REAL_TOKEN_RESERVES,
    total_supply: TOTAL_SUPPLY,
    created_at: createdAt,
  });

  executeBuy(tokenId, "bot_shadow", 1.2, createdAt);
  sybilIds.forEach((id, i) => {
    executeBuy(tokenId, id, 3.5 + Math.random() * 1.5, createdAt + (i + 1) * 15_000);
  });

  // Layer on ordinary-looking trading from the regular bot pool afterward — the sybils
  // just sit and hold, so their stake stays hidden inside otherwise-normal volume. Top the
  // traders up so this token gets real organic volume regardless of what they spent
  // elsewhere in the seed, which is what dilutes each sybil down to an individually
  // unremarkable share even though the group's combined share stays high.
  for (const b of traderPool) {
    db.prepare("UPDATE wallets SET core_balance = core_balance + 200 WHERE id = ?").run(b);
  }
  const windowStart = createdAt + 5 * 60_000;
  const numTrades = 160;
  for (let i = 1; i <= numTrades; i++) {
    const ts = windowStart + Math.floor((i / numTrades) * (now - windowStart));
    const holders = db
      .prepare("SELECT wallet_id, amount FROM holdings WHERE token_id = ? AND amount > 0")
      .all(tokenId) as { wallet_id: string; amount: number }[];
    const eligibleSellers = holders.filter((h) => traderPool.includes(h.wallet_id));
    const doSell = eligibleSellers.length > 0 && Math.random() > 0.75;
    try {
      if (doSell) {
        const seller = eligibleSellers[Math.floor(Math.random() * eligibleSellers.length)];
        const tokensIn = seller.amount * (0.1 + Math.random() * 0.3);
        executeSell(tokenId, seller.wallet_id, tokensIn, ts);
      } else {
        const buyer = traderPool[Math.floor(Math.random() * traderPool.length)];
        executeBuy(tokenId, buyer, 1.5 + Math.random() * 3, ts);
      }
    } catch {
      // undersized wallet balance near an edge case — skip this tick, history stays plausible
    }
  }
}

interface StarterConfig {
  id: string;
  creator_id: string;
  minutesAgo: number;
  numTrades: number;
  avgBuyCore: number;
  buyBias: number;
  forceGraduate?: boolean;
}

/** Backfills a realistic-looking trade history so charts and boards don't launch empty. */
function simulateHistory(db: Database.Database, s: StarterConfig, traderPool: string[], now: number) {
  const startTs = now - s.minutesAgo * 60_000;
  const otherTraders = traderPool.filter((w) => w !== s.creator_id);

  // Creator always buys first so there's something on the curve for others to trade against.
  executeBuy(s.id, s.creator_id, s.avgBuyCore * 1.5, startTs);

  for (let i = 1; i < s.numTrades; i++) {
    const ts = startTs + Math.floor(((i + Math.random() * 0.6) / s.numTrades) * (now - startTs));
    const holders = db
      .prepare("SELECT wallet_id, amount FROM holdings WHERE token_id = ? AND amount > 0")
      .all(s.id) as { wallet_id: string; amount: number }[];

    const doSell = holders.length > 0 && Math.random() > s.buyBias;
    try {
      if (doSell) {
        const seller = holders[Math.floor(Math.random() * holders.length)];
        const tokensIn = seller.amount * (0.1 + Math.random() * 0.3);
        executeSell(s.id, seller.wallet_id, tokensIn, ts);
      } else {
        const buyer = otherTraders[Math.floor(Math.random() * otherTraders.length)];
        const coreIn = s.avgBuyCore * (0.4 + Math.random() * 1.6);
        executeBuy(s.id, buyer, coreIn, ts);
      }
    } catch {
      // Undersized wallet balance or edge case near graduation — skip this tick, history stays plausible.
    }
  }

  if (s.forceGraduate) {
    const token = db.prepare("SELECT real_core, graduated FROM tokens WHERE id = ?").get(s.id) as {
      real_core: number;
      graduated: number;
    };
    if (!token.graduated) {
      const needed = (GRADUATION_CORE_RAISED - token.real_core) / 0.99 + 2;
      db.prepare("UPDATE wallets SET core_balance = core_balance + ? WHERE id = ?").run(needed, s.creator_id);
      executeBuy(s.id, s.creator_id, needed, now - 3 * 60 * 60_000);
    }
    // A couple of trades on the new protocol-owned pool, spread over hours (not a tight
    // burst) so it reads as ordinary post-graduation activity, not coordinated buying.
    for (let i = 0; i < 3; i++) {
      try {
        executeBuy(s.id, otherTraders[i % otherTraders.length], s.avgBuyCore * 0.5, now - (2 - i) * 45 * 60_000);
      } catch {
        // pool trade is best-effort demo flavor
      }
    }
  }
}

export function getDb(): Database.Database {
  if (!global.__emberDb) {
    const dbPath = path.join(DATA_DIR, "ember.db");
    const db = new Database(dbPath);
    init(db);
    // Assigned before seed() runs: seeding calls executeBuy/executeSell, which call
    // getDb() again — this guard makes that re-entrant call return the same instance
    // instead of recursing back into seed().
    global.__emberDb = db;
    seed(db);
  }
  return global.__emberDb;
}
