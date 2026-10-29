import { getIntegrationSetting } from "@/lib/integrationSettings";
import { createAdminClient } from "@/lib/supabase/server";

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

// 3CX allows only ONE active token per API client, so a fresh token from
// one serverless instance invalidates another instance's. Every caller
// shares one token through integration_token_cache and only fetches a new
// one when it's close to expiring (tokens last 60 minutes) or rejected.
const TOKEN_KEY = "threecx_access_token";

async function fetchNewToken(config: ThreeCxConfig): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch(`${config.baseUrl}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`3CX auth failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  const data = await res.json();
  return { token: data.access_token, expiresIn: Number(data.expires_in) || 3600 };
}

async function getAccessToken(config: ThreeCxConfig, forceNew = false): Promise<string> {
  const admin = createAdminClient();
  if (!forceNew) {
    const { data } = await admin.from("integration_token_cache").select("token, expires_at").eq("key", TOKEN_KEY).maybeSingle();
    if (data && new Date(data.expires_at).getTime() - Date.now() > 120_000) return data.token;
  }
  const { token, expiresIn } = await fetchNewToken(config);
  await admin.from("integration_token_cache").upsert({
    key: TOKEN_KEY,
    token,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  });
  return token;
}

export class ThreeCxError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function threeCxRequest(config: ThreeCxConfig, path: string, init: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<Response> {
  const go = async (token: string) =>
    fetch(`${config.baseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  let res = await go(await getAccessToken(config));
  if (res.status === 401) res = await go(await getAccessToken(config, true));
  return res;
}

async function parse<T>(res: Response, path: string): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j?.error?.message || j?.message || j?.reasontext || text;
    } catch {}
    const hint =
      res.status === 403
        ? " (the portal's 3CX API client doesn't have permission for this - it needs System Owner/Admin for the Configuration API)"
        : res.status === 404 && path.startsWith("/callcontrol")
          ? " (that extension isn't one the API client is allowed to control - add it under 3CX Admin > Integrations > API)"
          : "";
    throw new ThreeCxError(res.status, `3CX ${res.status}: ${String(msg || res.statusText).slice(0, 300)}${hint}`);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/** Configuration API (XAPI), e.g. xapi("/Users?$top=10"). */
export async function xapi<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const config = await getThreeCxConfig();
  if (!config) throw new ThreeCxError(0, "3CX isn't connected. Add the API URL, client ID and secret under Admin › Connectors.");
  const p = `/xapi/v1${path}`;
  return parse<T>(await threeCxRequest(config, p, init), p);
}

/** Raw XAPI response (for binary downloads like recordings). */
export async function xapiRaw(path: string): Promise<Response> {
  const config = await getThreeCxConfig();
  if (!config) throw new ThreeCxError(0, "3CX isn't connected.");
  return threeCxRequest(config, `/xapi/v1${path}`);
}

/** Call Control API, e.g. callControl("/callcontrol"). */
export async function callControl<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const config = await getThreeCxConfig();
  if (!config) throw new ThreeCxError(0, "3CX isn't connected.");
  return parse<T>(await threeCxRequest(config, path, init), path);
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
