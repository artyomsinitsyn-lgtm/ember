import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import rawIdl from "./alloy_curve.json";
import type { AlloyCurve } from "./alloy_curve_idl";

// AnchorProvider only needs this shape structurally — the `Wallet` name exported from
// "@coral-xyz/anchor" itself is actually the Node-only, Keypair-backed class, not the plain
// interface, so a local structural type avoids requiring a `payer: Keypair` we don't have.
export interface AnchorWalletLike {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
}

export const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "http://127.0.0.1:8899";
export const PROGRAM_ID = new PublicKey(rawIdl.address);

// Mirrors the Rust program's UNIT/DECIMALS exactly — SPL token amounts are raw u64 (10^6 per
// display unit), lamports are already 1:1 with the DB's float "core" currency.
export const TOKEN_DECIMALS = 6;
export const TOKEN_UNIT = 1_000_000;
export const LAMPORTS_PER_SOL = 1_000_000_000;

let sharedConnection: Connection | null = null;
export function getConnection(): Connection {
  if (!sharedConnection) sharedConnection = new Connection(SOLANA_RPC_URL, "confirmed");
  return sharedConnection;
}

export function getProgram(connection: Connection, wallet: AnchorWalletLike): Program<AlloyCurve> {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program(rawIdl as AlloyCurve, provider);
}

const READONLY_WALLET: AnchorWalletLike = {
  publicKey: PublicKey.default,
  signTransaction: async () => {
    throw new Error("readonly provider cannot sign");
  },
  signAllTransactions: async () => {
    throw new Error("readonly provider cannot sign");
  },
};

/** Read-only Program instance for server-side account fetches — no wallet needed since it
 * never signs anything, just decodes on-chain state. */
export function getReadonlyProgram(connection: Connection): Program<AlloyCurve> {
  const provider = new AnchorProvider(connection, READONLY_WALLET, { commitment: "confirmed" });
  return new Program(rawIdl as AlloyCurve, provider);
}

export function curvePda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("curve"), mint.toBuffer()], PROGRAM_ID)[0];
}
export function solVaultPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("sol_vault"), mint.toBuffer()], PROGRAM_ID)[0];
}
export function treasuryPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("treasury")], PROGRAM_ID)[0];
}
export function treasuryConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("treasury_config")], PROGRAM_ID)[0];
}
export function stakerPoolPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("staker_pool")], PROGRAM_ID)[0];
}
