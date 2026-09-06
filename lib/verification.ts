import { randomInt } from "crypto";
import { getDb, dbGet, dbRun } from "./db";
import { sendSms, sendEmail } from "./notifications";
import { encryptPII, decryptPII } from "./pii";

const CODE_TTL_MS = 10 * 60 * 1000;

export type ContactType = "phone" | "email";

/**
 * Sends the code via a real provider (Twilio/Resend, see ./notifications) when one is
 * configured. Falls back to returning the code directly to the caller when it's not —
 * that fallback is only safe for local dev; the API route only forwards `simulatedCode`
 * when `sent` comes back false, so a configured deployment never leaks it over the wire.
 */
export async function requestVerificationCode(
  walletId: string,
  contact: string,
  contactType: ContactType
): Promise<{ code: string; sent: boolean }> {
  const db = await getDb();
  const code = String(randomInt(100000, 999999));
  const expiresAt = Date.now() + CODE_TTL_MS;
  await dbRun(
    db,
    `INSERT INTO verification_codes (wallet_id, contact, contact_type, code, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (wallet_id) DO UPDATE SET
       contact = EXCLUDED.contact,
       contact_type = EXCLUDED.contact_type,
       code = EXCLUDED.code,
       expires_at = EXCLUDED.expires_at`,
    [walletId, encryptPII(contact), contactType, encryptPII(code), expiresAt]
  );

  const message = `Your Alloy verification code is ${code}. It expires in 10 minutes.`;
  const result =
    contactType === "phone" ? await sendSms(contact, message) : await sendEmail(contact, "Your Alloy verification code", message);

  return { code, sent: result.sent };
}

export async function confirmVerificationCode(walletId: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  const row = await dbGet<{ contact: string; contact_type: string; code: string; expires_at: number }>(
    db,
    "SELECT * FROM verification_codes WHERE wallet_id = $1",
    [walletId]
  );
  if (!row) return { ok: false, error: "No verification code requested yet." };
  if (Date.now() > row.expires_at) return { ok: false, error: "Code expired, request a new one." };
  if (decryptPII(row.code) !== code.trim()) return { ok: false, error: "Incorrect code." };

  await dbRun(
    db,
    "UPDATE wallets SET contact = $1, contact_type = $2, contact_verified_at = $3 WHERE id = $4",
    [
      row.contact, // already encrypted — carried over as-is from verification_codes, not re-encrypted
      row.contact_type,
      Date.now(),
      walletId,
    ]
  );
  await dbRun(db, "DELETE FROM verification_codes WHERE wallet_id = $1", [walletId]);
  return { ok: true };
}
