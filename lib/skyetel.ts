import { getIntegrationSetting } from "@/lib/integrationSettings";

// Per Skyetel's SMS & MMS API docs:
// POST https://sms.skyetel.com/v1/out?from=<11-digit from number>
// Authorization: Basic base64(SID:SECRET)
// Body: { "to": "1XXXXXXXXXX", "text": "...", "media": ["url", ...] }
// Rate limit: 300 sends / 5 min window (1/sec) - exceeding it returns
// 403 with a 5-minute cooldown, so bulk sends must be throttled.

type SkyetelCreds = { sid: string; secret: string; fromNumber: string };

export async function getSkyetelCreds(): Promise<SkyetelCreds | null> {
  const sid = await getIntegrationSetting("skyetel_api_key");
  const secret = await getIntegrationSetting("skyetel_api_secret");
  const fromNumber = await getIntegrationSetting("skyetel_sms_number");
  if (!sid || !secret || !fromNumber) return null;
  return { sid, secret, fromNumber: fromNumber.replace(/\D/g, "") };
}

export async function sendSkyetelSms(
  creds: SkyetelCreds,
  to: string,
  text: string,
  media?: string[],
  fromOverride?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const toDigits = to.replace(/\D/g, "");
  const fromDigits = (fromOverride ?? creds.fromNumber).replace(/\D/g, "");
  const auth = Buffer.from(`${creds.sid}:${creds.secret}`).toString("base64");

  try {
    const res = await fetch(`https://sms.skyetel.com/v1/out?from=${fromDigits}`, {
      method: "POST",
      headers: {
        "Content-type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({ to: toDigits, text, ...(media?.length ? { media } : {}) }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Skyetel ${res.status}: ${body || res.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown Skyetel error" };
  }
}

// Small delay helper for throttling bulk sends to Skyetel's 1/sec limit.
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
