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

// Devnet by default: we're demoing/launching on devnet first (test SOL, zero real funds at
// risk) before any mainnet decision. Point NEXT_PUBLIC_SOLANA_RPC_URL at a local validator or
// mainnet explicitly if you need one of those instead.
export const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
export const PROGRAM_ID = new PublicKey(rawIdl.address);

/** Ordered RPC endpoints to try — primary first, then any fallbacks. A single RPC provider
 * having an outage previously meant every on-chain read/write in the app failed with no
 * recourse; NEXT_PUBLIC_SOLANA_RPC_FALLBACK_URLS (comma-separated) lets ops configure backup
 * providers (e.g. a second RPC vendor) that getConnection() fails over to automatically. */
export const SOLANA_RPC_URLS: string[] = [
  SOLANA_RPC_URL,
  ...(process.env.NEXT_PUBLIC_SOLANA_RPC_FALLBACK_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

const HEALTH_CHECK_TIMEOUT_MS = 3000;
const HEALTH_RECHECK_INTERVAL_MS = 30_000;

// Mirrors the Rust program's UNIT/DECIMALS exactly — SPL token amounts are raw u64 (10^6 per
// display unit), lamports are already 1:1 with the DB's float "core" currency.
export const TOKEN_DECIMALS = 6;
export const TOKEN_UNIT = 1_000_000;
export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Single-endpoint health probe via a raw `getHealth` RPC call — deliberately not
 * `new Connection(url).getVersion()`, so a bad/unreachable URL can't hang behind web3.js's own
 * retry logic; this is a plain fetch with its own short timeout instead. */
async function isHealthy(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/** First endpoint in SOLANA_RPC_URLS that responds healthy, in priority order. Falls back to
 * the primary URL if every endpoint fails the health check, so callers still get a real
 * (if currently failing) RPC error from web3.js rather than this function silently returning
 * nothing. */
async function pickHealthyUrl(): Promise<string> {
  for (const url of SOLANA_RPC_URLS) {
    if (await isHealthy(url)) return url;
  }
  return SOLANA_RPC_URLS[0];
}

let sharedConnection: Connection | null = null;
let sharedConnectionUrl: string | null = null;
let lastHealthCheckAt = 0;

/** Returns a Connection to whichever configured RPC endpoint is currently healthy, re-checking
 * (and failing over) at most once every HEALTH_RECHECK_INTERVAL_MS so normal calls don't pay a
 * health-check round trip every time. Pass `forceRecheck: true` right after a call fails to
 * fail over immediately instead of waiting out the interval. */
export async function getConnection(forceRecheck = false): Promise<Connection> {
  const now = Date.now();
  if (!forceRecheck && sharedConnection && now - lastHealthCheckAt < HEALTH_RECHECK_INTERVAL_MS) {
    return sharedConnection;
  }
  const url = await pickHealthyUrl();
  lastHealthCheckAt = now;
  if (url !== sharedConnectionUrl || !sharedConnection) {
    sharedConnection = new Connection(url, "confirmed");
    sharedConnectionUrl = url;
  }
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
