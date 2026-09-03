/**
 * Real out-of-band delivery for verification codes. Uses plain HTTP calls (no SDK
 * dependency) so wiring a provider in is just setting env vars, not installing packages.
 * Twilio for SMS, Resend for email — both picked for simple REST APIs and because either
 * can be swapped later behind these same two functions without touching call sites.
 *
 * Falls back to "not sent" (caller decides what to do) when the relevant provider env
 * vars are unset, so local dev keeps working without real accounts.
 */

export type SendResult = { sent: boolean; error?: string };

export async function sendSms(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { sent: false, error: "SMS provider not configured" };

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) return { sent: false, error: `Twilio error: ${res.status} ${await res.text()}` };
  return { sent: true };
}

export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return { sent: false, error: "Email provider not configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) return { sent: false, error: `Resend error: ${res.status} ${await res.text()}` };
  return { sent: true };
}
