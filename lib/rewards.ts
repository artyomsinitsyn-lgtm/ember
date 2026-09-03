import Database from "better-sqlite3";

/** Credit pending ALLOY-staking rewards to a wallet's spendable CORE balance. */
export function settleWallet(db: Database.Database, walletId: string) {
  const pool = db.prepare("SELECT acc_core_per_embr FROM reward_pool WHERE id = 1").get() as {
    acc_core_per_embr: number;
  };
  const pos = db
    .prepare("SELECT staked, reward_debt FROM stake_positions WHERE wallet_id = ?")
    .get(walletId) as { staked: number; reward_debt: number } | undefined;
  if (!pos || pos.staked === 0) return 0;

  const accrued = pos.staked * pool.acc_core_per_embr - pos.reward_debt;
  if (accrued <= 0) return 0;

  db.prepare("UPDATE wallets SET core_balance = core_balance + ? WHERE id = ?").run(accrued, walletId);
  db.prepare(
    "UPDATE stake_positions SET reward_debt = staked * ?, claimed_core = claimed_core + ? WHERE wallet_id = ?"
  ).run(pool.acc_core_per_embr, accrued, walletId);
  return accrued;
}

export function pendingRewards(db: Database.Database, walletId: string): number {
  const pool = db.prepare("SELECT acc_core_per_embr FROM reward_pool WHERE id = 1").get() as {
    acc_core_per_embr: number;
  };
  const pos = db
    .prepare("SELECT staked, reward_debt FROM stake_positions WHERE wallet_id = ?")
    .get(walletId) as { staked: number; reward_debt: number } | undefined;
  if (!pos || pos.staked === 0) return 0;
  return Math.max(0, pos.staked * pool.acc_core_per_embr - pos.reward_debt);
}

/** Route a trade's staker-fee cut into the pool, or to the treasury if nobody is staked yet. */
export function distributeToStakers(db: Database.Database, coreAmount: number) {
  if (coreAmount <= 0) return;
  const pool = db.prepare("SELECT total_staked FROM reward_pool WHERE id = 1").get() as {
    total_staked: number;
  };
  if (pool.total_staked <= 0) {
    db.prepare("UPDATE treasury SET core_balance = core_balance + ? WHERE id = 1").run(coreAmount);
    return;
  }
  db.prepare(
    `UPDATE reward_pool
     SET acc_core_per_embr = acc_core_per_embr + (? / total_staked),
         lifetime_core_distributed = lifetime_core_distributed + ?
     WHERE id = 1`
  ).run(coreAmount, coreAmount);
}

export function stake(db: Database.Database, walletId: string, amount: number) {
  if (amount <= 0) throw new Error("Amount must be positive");
  const wallet = db.prepare("SELECT embr_balance FROM wallets WHERE id = ?").get(walletId) as
    | { embr_balance: number }
    | undefined;
  if (!wallet || wallet.embr_balance < amount) throw new Error("Insufficient ALLOY balance");

  settleWallet(db, walletId);
  db.prepare(
    `INSERT INTO stake_positions (wallet_id, staked, reward_debt, claimed_core) VALUES (?, ?, 0, 0)
     ON CONFLICT(wallet_id) DO UPDATE SET staked = staked + excluded.staked`
  ).run(walletId, amount);

  const pool = db.prepare("SELECT acc_core_per_embr FROM reward_pool WHERE id = 1").get() as {
    acc_core_per_embr: number;
  };
  db.prepare("UPDATE stake_positions SET reward_debt = staked * ? WHERE wallet_id = ?").run(
    pool.acc_core_per_embr,
    walletId
  );
  db.prepare("UPDATE wallets SET embr_balance = embr_balance - ? WHERE id = ?").run(amount, walletId);
  db.prepare("UPDATE reward_pool SET total_staked = total_staked + ? WHERE id = 1").run(amount);
  db.prepare(
    "INSERT INTO stake_events (id, wallet_id, type, amount, created_at) VALUES (?, ?, 'stake', ?, ?)"
  ).run(crypto.randomUUID(), walletId, amount, Date.now());
}

export function unstake(db: Database.Database, walletId: string, amount: number) {
  if (amount <= 0) throw new Error("Amount must be positive");
  const pos = db.prepare("SELECT staked FROM stake_positions WHERE wallet_id = ?").get(walletId) as
    | { staked: number }
    | undefined;
  if (!pos || pos.staked < amount) throw new Error("Insufficient staked ALLOY");

  settleWallet(db, walletId);
  db.prepare("UPDATE stake_positions SET staked = staked - ? WHERE wallet_id = ?").run(amount, walletId);
  const pool = db.prepare("SELECT acc_core_per_embr FROM reward_pool WHERE id = 1").get() as {
    acc_core_per_embr: number;
  };
  db.prepare("UPDATE stake_positions SET reward_debt = staked * ? WHERE wallet_id = ?").run(
    pool.acc_core_per_embr,
    walletId
  );
  db.prepare("UPDATE wallets SET embr_balance = embr_balance + ? WHERE id = ?").run(amount, walletId);
  db.prepare("UPDATE reward_pool SET total_staked = total_staked - ? WHERE id = 1").run(amount);
  db.prepare(
    "INSERT INTO stake_events (id, wallet_id, type, amount, created_at) VALUES (?, ?, 'unstake', ?, ?)"
  ).run(crypto.randomUUID(), walletId, amount, Date.now());
}
