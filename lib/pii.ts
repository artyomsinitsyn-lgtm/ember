/**
 * Field-level encryption for PII at rest (phone numbers, emails, verification codes) —
 * SQLite has no native column encryption, and this data currently lands in the DB as
 * plaintext otherwise. AES-256-GCM, one random IV per value so identical contacts don't
 * produce identical ciphertext (which would otherwise leak that two wallets share a phone
 * number just by comparing encrypted blobs).
 *
 * PII_ENCRYPTION_KEY must be set in any real deployment — without it, encrypted values are
 * unrecoverable across process restarts on a different machine, and the dev fallback key
 * below is public (it's in this file). Set it BEFORE any real phone/email verification
 * data is written; rotating it after the fact means old rows can no longer be decrypted.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const DEV_FALLBACK_SECRET = "alloy-dev-only-insecure-pii-key-do-not-use-in-prod";
const SALT = "alloy-pii-v1";
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.PII_ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PII_ENCRYPTION_KEY is not set. Refusing to read/write PII with the public dev-only fallback key in production."
      );
    }
    console.warn("[pii] PII_ENCRYPTION_KEY not set — using an insecure dev-only fallback key. Do not use in production.");
    cachedKey = scryptSync(DEV_FALLBACK_SECRET, SALT, 32);
  } else {
    cachedKey = scryptSync(secret, SALT, 32);
  }
  return cachedKey;
}

/** Encrypts `plaintext` into a self-contained base64 blob (iv + auth tag + ciphertext). */
export function encryptPII(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Reverses `encryptPII`. Throws if the blob was tampered with or the key is wrong. */
export function decryptPII(blob: string): string {
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
