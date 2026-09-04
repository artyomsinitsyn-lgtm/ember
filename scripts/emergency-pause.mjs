#!/usr/bin/env node
// Real emergency-response tool: pauses or unpauses the alloy_curve program (halts
// initialize_curve/buy/sell) without touching treasury custody at all. Also handles the
// one-time `init` bootstrap that sets up who holds this authority.
//
// Usage:
//   node scripts/emergency-pause.mjs init   <path-to-authority-keypair.json>
//   node scripts/emergency-pause.mjs pause  <path-to-authority-keypair.json>
//   node scripts/emergency-pause.mjs unpause <path-to-authority-keypair.json>
//   node scripts/emergency-pause.mjs status
//
// RPC endpoint comes from NEXT_PUBLIC_SOLANA_RPC_URL, same as the app — defaults to
// http://127.0.0.1:8899 (local validator) if unset.

import { readFileSync } from "node:fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import rawIdl from "../lib/onchain/alloy_curve.json" with { type: "json" };

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "http://127.0.0.1:8899";
const PROGRAM_ID = new PublicKey(rawIdl.address);

function loadKeypair(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function emergencyConfigPda() {
  return PublicKey.findProgramAddressSync([Buffer.from("emergency_config")], PROGRAM_ID)[0];
}

async function main() {
  const [, , cmd, keypairPath] = process.argv;
  const connection = new Connection(RPC_URL, "confirmed");
  const configAddr = emergencyConfigPda();

  if (cmd === "status") {
    const readonlyProvider = new AnchorProvider(connection, new Wallet(Keypair.generate()), { commitment: "confirmed" });
    const program = new Program(rawIdl, readonlyProvider);
    try {
      const config = await program.account.emergencyConfig.fetch(configAddr);
      console.log(`emergency_config: ${configAddr.toBase58()}`);
      console.log(`authority: ${config.authority.toBase58()}`);
      console.log(`paused: ${config.paused}`);
    } catch {
      console.log(`emergency_config not initialized yet at ${configAddr.toBase58()} — run "init" first.`);
    }
    return;
  }

  if (!["init", "pause", "unpause"].includes(cmd) || !keypairPath) {
    console.error("Usage: node scripts/emergency-pause.mjs <init|pause|unpause> <authority-keypair.json>");
    console.error("       node scripts/emergency-pause.mjs status");
    process.exit(1);
  }

  const authority = loadKeypair(keypairPath);
  const provider = new AnchorProvider(connection, new Wallet(authority), { commitment: "confirmed" });
  const program = new Program(rawIdl, provider);

  let sig;
  if (cmd === "init") {
    sig = await program.methods.initializeEmergencyConfig().accounts({ admin: authority.publicKey }).rpc();
  } else if (cmd === "pause") {
    sig = await program.methods.pause().accounts({ authority: authority.publicKey }).rpc();
  } else {
    sig = await program.methods.unpause().accounts({ authority: authority.publicKey }).rpc();
  }

  const config = await program.account.emergencyConfig.fetch(configAddr);
  console.log(`${cmd} sent by ${authority.publicKey.toBase58()}`);
  console.log(`signature: ${sig}`);
  console.log(`emergency_config.paused is now: ${config.paused}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
