import { getConnection } from "./onchain/program";
import { fetchTreasuryState } from "./onchain/treasury";

/** Whoever the on-chain treasury_config names as admin — the wallet with real, on-chain
 * authority to move treasury funds (see onchain/programs/alloy_curve). Only meaningful for
 * gating actions that themselves touch the treasury program; the program's own `has_one`
 * check is the real enforcement, this is just for showing/hiding the withdraw UI. */
export async function isTreasuryAdmin(walletId: string): Promise<boolean> {
  if (!walletId) return false;
  const { admin } = await fetchTreasuryState(await getConnection());
  return admin === walletId;
}

/**
 * Gates the app's own off-chain admin surfaces (verification approvals, feedback
 * resolution) — deliberately NOT the same check as isTreasuryAdmin. Migrating the on-chain
 * treasury admin to a multisig (e.g. a Squads vault PDA) is the whole point of a real
 * launch: nobody can "connect" as a PDA in the browser, since it has no private key, so
 * isTreasuryAdmin alone would permanently lock everyone out of these screens the moment
 * that migration happens. ADMIN_WALLET_IDS is a comma-separated allowlist of wallet ids
 * that keeps working independent of who holds treasury fund authority; unset it and this
 * falls back to today's behavior (on-chain admin = app admin) for local/devnet use.
 */
export async function isAppAdmin(walletId: string): Promise<boolean> {
  if (!walletId) return false;
  const allowlist = (process.env.ADMIN_WALLET_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (allowlist.length > 0) return allowlist.includes(walletId);
  return isTreasuryAdmin(walletId);
}
