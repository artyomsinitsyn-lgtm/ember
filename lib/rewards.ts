import { type DB, dbGet, dbRun } from "./db";

/** Credit pending ALLOY-staking rewards to a wallet's spendable CORE balance. */
export async function settleWallet(db: DB, walletId: string): Promise<number> {
  const pool = (await dbGet<{ acc_core_per_embr: number }>(
    db,
    "SELECT acc_core_per_embr FROM reward_pool WHERE id = 1"
  ))!;
  const pos = await dbGet<{ staked: number; reward_debt: number }>(
    db,
    "SELECT staked, reward_debt FROM stake_positions WHERE wallet_id = $1",
    [walletId]
  );
  if (!pos || pos.staked === 0) return 0;

  const accrued = pos.staked * pool.acc_core_per_embr - pos.reward_debt;
  if (accrued <= 0) return 0;

  await dbRun(db, "UPDATE wallets SET core_balance = core_balance + $1 WHERE id = $2", [accrued, walletId]);
  await dbRun(
    db,
    "UPDATE stake_positions SET reward_debt = staked * $1, claimed_core = claimed_core + $2 WHERE wallet_id = $3",
    [pool.acc_core_per_embr, accrued, walletId]
  );
  return accrued;
}

export async function pendingRewards(db: DB, walletId: string): Promise<number> {
  const pool = (await dbGet<{ acc_core_per_embr: number }>(
    db,
    "SELECT acc_core_per_embr FROM reward_pool WHERE id = 1"
  ))!;
  const pos = await dbGet<{ staked: number; reward_debt: number }>(
    db,
    "SELECT staked, reward_debt FROM stake_positions WHERE wallet_id = $1",
    [walletId]
  );
  if (!pos || pos.staked === 0) return 0;
  return Math.max(0, pos.staked * pool.acc_core_per_embr - pos.reward_debt);
}

/** Route a trade's staker-fee cut into the pool, or to the treasury if nobody is staked yet. */
export async function distributeToStakers(db: DB, coreAmount: number) {
  if (coreAmount <= 0) return;
  const pool = (await dbGet<{ total_staked: number }>(db, "SELECT total_staked FROM reward_pool WHERE id = 1"))!;
  if (pool.total_staked <= 0) {
    await dbRun(db, "UPDATE treasury SET core_balance = core_balance + $1 WHERE id = 1", [coreAmount]);
    return;
  }
  await dbRun(
    db,
    `UPDATE reward_pool
     SET acc_core_per_embr = acc_core_per_embr + ($1 / total_staked),
         lifetime_core_distributed = lifetime_core_distributed + $2
     WHERE id = 1`,
    [coreAmount, coreAmount]
  );
}

export async function stake(db: DB, walletId: string, amount: number) {
  if (amount <= 0) throw new Error("Amount must be positive");
  const wallet = await dbGet<{ embr_balance: number }>(
    db,
    "SELECT embr_balance FROM wallets WHERE id = $1 FOR UPDATE",
    [walletId]
  );
  if (!wallet || wallet.embr_balance < amount) throw new Error("Insufficient ALLOY balance");

  await settleWallet(db, walletId);
  await dbRun(
    db,
    `INSERT INTO stake_positions (wallet_id, staked, reward_debt, claimed_core) VALUES ($1, $2, 0, 0)
     ON CONFLICT (wallet_id) DO UPDATE SET staked = stake_positions.staked + EXCLUDED.staked`,
    [walletId, amount]
  );

  const pool = (await dbGet<{ acc_core_per_embr: number }>(
    db,
    "SELECT acc_core_per_embr FROM reward_pool WHERE id = 1"
  ))!;
  await dbRun(db, "UPDATE stake_positions SET reward_debt = staked * $1 WHERE wallet_id = $2", [
    pool.acc_core_per_embr,
    walletId,
  ]);
  await dbRun(db, "UPDATE wallets SET embr_balance = embr_balance - $1 WHERE id = $2", [amount, walletId]);
  await dbRun(db, "UPDATE reward_pool SET total_staked = total_staked + $1 WHERE id = 1", [amount]);
  await dbRun(
    db,
    "INSERT INTO stake_events (id, wallet_id, type, amount, created_at) VALUES ($1, $2, 'stake', $3, $4)",
    [crypto.randomUUID(), walletId, amount, Date.now()]
  );
}

export async function unstake(db: DB, walletId: string, amount: number) {
  if (amount <= 0) throw new Error("Amount must be positive");
  const pos = await dbGet<{ staked: number }>(
    db,
    "SELECT staked FROM stake_positions WHERE wallet_id = $1 FOR UPDATE",
    [walletId]
  );
  if (!pos || pos.staked < amount) throw new Error("Insufficient staked ALLOY");

  await settleWallet(db, walletId);
  await dbRun(db, "UPDATE stake_positions SET staked = staked - $1 WHERE wallet_id = $2", [amount, walletId]);
  const pool = (await dbGet<{ acc_core_per_embr: number }>(
    db,
    "SELECT acc_core_per_embr FROM reward_pool WHERE id = 1"
  ))!;
  await dbRun(db, "UPDATE stake_positions SET reward_debt = staked * $1 WHERE wallet_id = $2", [
    pool.acc_core_per_embr,
    walletId,
  ]);
  await dbRun(db, "UPDATE wallets SET embr_balance = embr_balance + $1 WHERE id = $2", [amount, walletId]);
  await dbRun(db, "UPDATE reward_pool SET total_staked = total_staked - $1 WHERE id = 1", [amount]);
  await dbRun(
    db,
    "INSERT INTO stake_events (id, wallet_id, type, amount, created_at) VALUES ($1, $2, 'unstake', $3, $4)",
    [crypto.randomUUID(), walletId, amount, Date.now()]
  );
}
