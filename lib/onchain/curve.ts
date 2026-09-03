import type { Connection, PublicKey } from "@solana/web3.js";
import { curvePda, getReadonlyProgram, LAMPORTS_PER_SOL, TOKEN_UNIT } from "./program";

export interface OnchainCurveState {
  creator: string;
  virtualCore: number;
  virtualToken: number;
  realCore: number;
  realToken: number;
  graduated: boolean;
}

/** Reads the authoritative curve state straight from the deployed program — the DB's
 * v_core/v_token/real_core/real_token columns are a display cache synced from this after
 * every on-chain trade, never the source of truth once a token has a real mint. */
export async function fetchCurveState(connection: Connection, mint: PublicKey): Promise<OnchainCurveState | null> {
  const program = getReadonlyProgram(connection);
  const pda = curvePda(mint);
  try {
    const account = await program.account.curve.fetch(pda);
    return {
      creator: account.creator.toBase58(),
      virtualCore: account.virtualSolReserves.toNumber() / LAMPORTS_PER_SOL,
      virtualToken: account.virtualTokenReserves.toNumber() / TOKEN_UNIT,
      realCore: account.realSolReserves.toNumber() / LAMPORTS_PER_SOL,
      realToken: account.realTokenReserves.toNumber() / TOKEN_UNIT,
      graduated: account.graduated,
    };
  } catch {
    return null;
  }
}
