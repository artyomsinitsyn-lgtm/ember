import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { BN, type Program } from "@coral-xyz/anchor";
import type { AlloyCurve } from "./alloy_curve_idl";

interface BuildResult {
  tx: Transaction;
  extraSigners: Keypair[];
  mint: PublicKey;
}

/** Builds (unsigned) the transaction that mints a token's fixed supply and initializes its
 * bonding curve on-chain. Caller is responsible for setting feePayer/blockhash and getting
 * it signed by both the connected wallet and the freshly generated mint keypair.
 *
 * curve / curveTokenVault / solVault are all PDAs fully derivable from `mint` (and the
 * well-known token/associated-token/system programs) — Anchor's client resolves those
 * automatically from the IDL's seed metadata, so only the two real signers are passed. */
export async function buildInitializeCurveTx(program: Program<AlloyCurve>, creator: PublicKey): Promise<BuildResult> {
  const mint = Keypair.generate();

  const ix = await program.methods
    .initializeCurve()
    .accounts({ creator, mint: mint.publicKey })
    .instruction();

  const tx = new Transaction().add(ix);
  return { tx, extraSigners: [mint], mint: mint.publicKey };
}

/** curve / curveTokenVault / solVault / traderTokenAccount / stakerPool / treasury are all
 * PDAs Anchor derives automatically from mint/buyer — only the real signer accounts and the
 * curve's stored creator (needed for its has_one check and fee payout) go in explicitly. */
function tradeAccounts(trader: PublicKey, mint: PublicKey, creator: PublicKey) {
  return { buyer: trader, mint, creator };
}

/** `solIn`/`minTokensOut` are raw lamports / raw token units (10^6 per display token) —
 * callers convert from display units before calling this. */
export async function buildBuyTx(
  program: Program<AlloyCurve>,
  trader: PublicKey,
  mint: PublicKey,
  creator: PublicKey,
  solIn: bigint,
  minTokensOut: bigint
): Promise<Transaction> {
  const ix = await program.methods
    .buy(new BN(solIn.toString()), new BN(minTokensOut.toString()))
    .accounts(tradeAccounts(trader, mint, creator))
    .instruction();
  return new Transaction().add(ix);
}

/** `tokensIn`/`minSolOut` are raw token units (10^6 per display token) / raw lamports. */
export async function buildSellTx(
  program: Program<AlloyCurve>,
  trader: PublicKey,
  mint: PublicKey,
  creator: PublicKey,
  tokensIn: bigint,
  minSolOut: bigint
): Promise<Transaction> {
  const ix = await program.methods
    .sell(new BN(tokensIn.toString()), new BN(minSolOut.toString()))
    .accounts(tradeAccounts(trader, mint, creator))
    .instruction();
  return new Transaction().add(ix);
}

/** One-time bootstrap — the caller becomes the treasury admin. Anchor derives the
 * `treasuryConfig` PDA automatically from the IDL's seed metadata. */
export async function buildInitializeTreasuryConfigTx(program: Program<AlloyCurve>, admin: PublicKey): Promise<Transaction> {
  const ix = await program.methods.initializeTreasuryConfig().accounts({ admin }).instruction();
  return new Transaction().add(ix);
}

/** Hands treasury admin off to `newAdmin`. Only the current admin's signature will pass the
 * program's `has_one` check. */
export async function buildSetTreasuryAdminTx(
  program: Program<AlloyCurve>,
  admin: PublicKey,
  newAdmin: PublicKey
): Promise<Transaction> {
  const ix = await program.methods.setTreasuryAdmin(newAdmin).accounts({ admin }).instruction();
  return new Transaction().add(ix);
}

/** Pays `amountLamports` out of the protocol treasury vault to `to` — any wallet the admin
 * names, not necessarily the signer itself. */
export async function buildWithdrawTreasuryTx(
  program: Program<AlloyCurve>,
  admin: PublicKey,
  to: PublicKey,
  amountLamports: bigint
): Promise<Transaction> {
  const ix = await program.methods
    .withdrawTreasury(new BN(amountLamports.toString()))
    .accounts({ admin, to })
    .instruction();
  return new Transaction().add(ix);
}

/** One-time bootstrap — the caller becomes the emergency (pause/unpause) authority.
 * Deliberately separate from treasury admin: the point of a kill switch is being able to
 * fire it without treasury/multisig quorum. Only TREASURY_ADMIN can call this once, at
 * platform setup. */
export async function buildInitializeEmergencyConfigTx(program: Program<AlloyCurve>, admin: PublicKey): Promise<Transaction> {
  const ix = await program.methods.initializeEmergencyConfig().accounts({ admin }).instruction();
  return new Transaction().add(ix);
}

/** Hands the emergency (pause/unpause) authority off to `newAuthority` — e.g. rotating from
 * the treasury's hardware wallet to a faster-reacting hot ops key. Does not touch treasury
 * custody. Only the current emergency authority's signature will pass the program check. */
export async function buildSetEmergencyAdminTx(
  program: Program<AlloyCurve>,
  authority: PublicKey,
  newAuthority: PublicKey
): Promise<Transaction> {
  const ix = await program.methods.setEmergencyAdmin(newAuthority).accounts({ authority }).instruction();
  return new Transaction().add(ix);
}

/** Halts initialize_curve/buy/sell platform-wide. Callable by the emergency authority alone. */
export async function buildPauseTx(program: Program<AlloyCurve>, authority: PublicKey): Promise<Transaction> {
  const ix = await program.methods.pause().accounts({ authority }).instruction();
  return new Transaction().add(ix);
}

/** Resumes trading/minting after a pause. Same authority as pause(). */
export async function buildUnpauseTx(program: Program<AlloyCurve>, authority: PublicKey): Promise<Transaction> {
  const ix = await program.methods.unpause().accounts({ authority }).instruction();
  return new Transaction().add(ix);
}
