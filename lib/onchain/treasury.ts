import type { Connection } from "@solana/web3.js";
import { getReadonlyProgram, stakerPoolPda, treasuryConfigPda, treasuryPda } from "./program";

export interface TreasuryState {
  admin: string | null;
  balanceLamports: number;
}

/** Reads the protocol treasury's current admin (if `initializeTreasuryConfig` has ever been
 * called) and the vault's live SOL balance straight from the chain. */
export async function fetchTreasuryState(connection: Connection): Promise<TreasuryState> {
  const program = getReadonlyProgram(connection);
  const [balanceLamports, admin] = await Promise.all([
    connection.getBalance(treasuryPda()),
    program.account.treasuryConfig
      .fetch(treasuryConfigPda())
      .then((c) => c.admin.toBase58())
      .catch(() => null),
  ]);
  return { admin, balanceLamports };
}

/** Reads the real, aggregate SOL balance of the on-chain staker_pool PDA — every real trade's
 * staker cut streams in here automatically (see buy/sell in the Rust program). There's no
 * per-staker accounting on-chain yet (no stake/unstake/claim instructions exist), so this is
 * only the pool total, never an individual wallet's share — the Stake page must not present it
 * as "your" balance. */
export async function fetchStakerPoolBalance(connection: Connection): Promise<number> {
  return connection.getBalance(stakerPoolPda());
}
