import { getIntegrationSetting } from "@/lib/integrationSettings";

// 3CX V20 Call Control API. Auth is OAuth client_credentials against
// the PBX's own /connect/token endpoint using the API Client ID/
// Secret created under Admin > Integrations > API in the 3CX admin
// console. Reference: https://www.3cx.com/docs/call-control-api-endpoints/
//
// Call origination uses POST /callcontrol/{dn}/makecall (the DN-level
// form, not the device-specific one) - simplest to integrate, and
// correct for the common case of one registered device per employee
// extension. If an employee later has multiple simultaneous
// registrations (desk phone + mobile app), this form still works but
// 3CX's docs note it engages "legacy" call-initiation behavior; the
// device-specific endpoint is the fallback if that becomes an issue.

type ThreeCxConfig = { baseUrl: string; clientId: string; clientSecret: string };

export async function getThreeCxConfig(): Promise<ThreeCxConfig | null> {
  const baseUrl = await getIntegrationSetting("threecx_api_url");
  const clientId = await getIntegrationSetting("threecx_client_id");
  const clientSecret = await getIntegrationSetting("threecx_client_secret");
  if (!baseUrl || !clientId || !clientSecret) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), clientId, clientSecret };
}

async function getAccessToken(config: ThreeCxConfig): Promise<string> {
  const res = await fetch(`${config.baseUrl}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`3CX auth failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = await res.json();
  return data.access_token;
}

// Recording URLs 3CX hands back (via the Call History report or a Call
// Flow Designer webhook action) are behind the same PBX auth as every
// other API call - not public links. Exported so the recording webhook
// can fetch the audio bytes with a fresh token, same as makeThreeCxCall
// does for placing calls.
export async function downloadThreeCxRecording(config: ThreeCxConfig, recordingUrl: string): Promise<Buffer> {
  const token = await getAccessToken(config);
  // recordingUrl may be a full URL or a path relative to the PBX base,
  // depending on how the webhook/report handed it to us.
  const url = recordingUrl.startsWith("http") ? recordingUrl : `${config.baseUrl}${recordingUrl}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`3CX recording download failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function makeThreeCxCall(
  config: ThreeCxConfig,
  fromExtension: string,
  destination: string,
  timeoutSec = 30
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const token = await getAccessToken(config);
    const res = await fetch(`${config.baseUrl}/callcontrol/${fromExtension}/makecall`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ destination, timeout: timeoutSec }),
    });

    if (!res.ok && res.status !== 202) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `3CX ${res.status}: ${body || res.statusText}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown 3CX error" };
  }
}
