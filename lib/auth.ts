import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { YOU_WALLET_ID } from "./constants";

const SESSION_COOKIE = "alloy_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 365;
const NONCE_TTL_MS = 5 * 60 * 1000;

// Was previously a secret written to a local file on first use — that only worked because
// SQLite's data/ directory happened to be writable in dev. On Vercel serverless the
// filesystem is read-only outside /tmp, and even /tmp wouldn't help: each invocation can
// land on a different instance with no shared disk, so a session signed by one instance
// would fail verification on another. SESSION_SECRET must be set in any real deployment —
// same pattern as PII_ENCRYPTION_KEY (see lib/pii.ts).
const DEV_FALLBACK_SECRET = "alloy-dev-only-insecure-session-secret-do-not-use-in-prod";
let cachedSecret: string | null = null;

/**
 * Every mutating API route trusted a client-supplied walletId with zero verification —
 * anyone could pass someone else's wallet id and edit their profile, post to their feed,
 * or trade on their balance. This is the fix: a signed session cookie is the only source
 * of truth for "who is making this request," server-side, everywhere.
 *
 * The demo identity (YOU_WALLET_ID) needs no proof of key ownership — it's a shared
 * guest account by design, and any visitor is allowed to act as it. A real Solana wallet
 * has to prove it controls the private key first (see issueNonce/verifySignature) before
 * a session gets bound to that wallet id.
 */

function getSecret(): string {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET is not set. Refusing to sign session cookies with the public dev-only fallback secret in production."
      );
    }
    console.warn("[auth] SESSION_SECRET not set — using an insecure dev-only fallback secret. Do not use in production.");
    cachedSecret = DEV_FALLBACK_SECRET;
  } else {
    cachedSecret = secret;
  }
  return cachedSecret;
}

function signToken(walletId: string): string {
  const mac = createHmac("sha256", getSecret()).update(walletId).digest("hex");
  return `${Buffer.from(walletId, "utf8").toString("base64url")}.${mac}`;
}

function verifyToken(token: string): string | null {
  const [encoded, mac] = token.split(".");
  if (!encoded || !mac) return null;
  let walletId: string;
  try {
    walletId = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", getSecret()).update(walletId).digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return walletId;
}

/** The caller's authenticated wallet id, derived only from the signed session cookie —
 * never from a request body. Silently provisions a fresh demo session on first touch so
 * a new visitor can start acting as the shared guest identity without an explicit login. */
export async function getSessionWalletId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  const walletId = existing ? verifyToken(existing) : null;
  if (walletId) return walletId;

  store.set(SESSION_COOKIE, signToken(YOU_WALLET_ID), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return YOU_WALLET_ID;
}

/** Upgrades the session to a specific wallet id — only ever called after verifySignature
 * confirms the caller controls that keypair. */
export async function setSessionWalletId(walletId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, signToken(walletId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

declare global {
   
  var __alloyNonces: Map<string, { nonce: string; expires: number }> | undefined;
}

function nonceStore() {
  if (!global.__alloyNonces) global.__alloyNonces = new Map();
  return global.__alloyNonces;
}

/** A fresh, single-use challenge the wallet signs to prove it holds the private key for
 * the address it claims to be. Human-readable on purpose — this is what shows up in the
 * wallet's own signature-request dialog. */
export function issueNonce(walletId: string): string {
  const nonce = `Sign in to Alloy\n\nWallet: ${walletId}\nNonce: ${randomBytes(16).toString("hex")}\nIssued: ${new Date().toISOString()}`;
  nonceStore().set(walletId, { nonce, expires: Date.now() + NONCE_TTL_MS });
  return nonce;
}

export function verifySignature(walletId: string, signatureBase64: string): boolean {
  const entry = nonceStore().get(walletId);
  if (!entry || entry.expires < Date.now()) return false;
  nonceStore().delete(walletId); // one-time use either way, valid or not
  try {
    const pubkeyBytes = new PublicKey(walletId).toBytes();
    const sigBytes = Buffer.from(signatureBase64, "base64");
    const msgBytes = new TextEncoder().encode(entry.nonce);
    return ed25519.verify(sigBytes, msgBytes, pubkeyBytes);
  } catch {
    return false;
  }
}
