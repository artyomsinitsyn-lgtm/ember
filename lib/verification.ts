import { randomInt } from "crypto";
import { getDb } from "./db";
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
  const db = getDb();
  const code = String(randomInt(100000, 999999));
  const expiresAt = Date.now() + CODE_TTL_MS;
  db.prepare(
    `INSERT INTO verification_codes (wallet_id, contact, contact_type, code, expires_at)
     VALUES (@wallet_id, @contact, @contact_type, @code, @expires_at)
     ON CONFLICT(wallet_id) DO UPDATE SET
       contact = excluded.contact,
       contact_type = excluded.contact_type,
       code = excluded.code,
       expires_at = excluded.expires_at`
  ).run({
    wallet_id: walletId,
    contact: encryptPII(contact),
    contact_type: contactType,
    code: encryptPII(code),
    expires_at: expiresAt,
  });

  const message = `Your Alloy verification code is ${code}. It expires in 10 minutes.`;
  const result =
    contactType === "phone" ? await sendSms(contact, message) : await sendEmail(contact, "Your Alloy verification code", message);

  return { code, sent: result.sent };
}

export function confirmVerificationCode(walletId: string, code: string): { ok: boolean; error?: string } {
  const db = getDb();
  const row = db.prepare("SELECT * FROM verification_codes WHERE wallet_id = ?").get(walletId) as
    | { contact: string; contact_type: string; code: string; expires_at: number }
    | undefined;
  if (!row) return { ok: false, error: "No verification code requested yet." };
  if (Date.now() > row.expires_at) return { ok: false, error: "Code expired, request a new one." };
  if (decryptPII(row.code) !== code.trim()) return { ok: false, error: "Incorrect code." };

  db.prepare("UPDATE wallets SET contact = ?, contact_type = ?, contact_verified_at = ? WHERE id = ?").run(
    row.contact, // already encrypted — carried over as-is from verification_codes, not re-encrypted
    row.contact_type,
    Date.now(),
    walletId
  );
  db.prepare("DELETE FROM verification_codes WHERE wallet_id = ?").run(walletId);
  return { ok: true };
}
