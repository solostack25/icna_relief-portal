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

// ---------- Portal calling (call bar) ----------

export type DnDevice = { dn?: string; device_id: string; user_agent?: string };

/**
 * Devices currently registered on an extension (desk phone, 3CX web
 * client, 3CX app). Returns null when the list couldn't be read (e.g. the
 * API client can't monitor that extension) so callers can fall back to the
 * DN-level makecall instead of treating it as "no phone".
 */
export async function listDnDevices(config: ThreeCxConfig, extension: string): Promise<DnDevice[] | null> {
  try {
    const res = await threeCxRequest(config, `/callcontrol/${encodeURIComponent(extension)}/devices`);
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return Array.isArray(data) ? (data as DnDevice[]).filter((d) => d?.device_id) : null;
  } catch {
    return null;
  }
}

/**
 * The portal opens the 3CX web client as its "phone", so prefer that
 * device; then any other 3CX client (desktop/mobile app); then whatever is
 * registered (desk phone).
 */
function pickCallDevice(devices: DnDevice[]): DnDevice {
  const ua = (d: DnDevice) => (d.user_agent ?? "").toLowerCase();
  return (
    devices.find((d) => /web ?client|webrtc|browser/.test(ua(d))) ??
    devices.find((d) => /3cx/.test(ua(d))) ??
    devices[0]
  );
}

export const NO_DEVICE_ERROR =
  "No phone is signed in on your extension. Open the phone from the call bar (it opens the 3CX web client) and try again.";

/**
 * Places a call from an employee's extension. Uses 3CX's device-specific
 * makecall (the documented, deterministic form) on the picked device and
 * falls back to the legacy DN-level makecall if the device list can't be
 * read or the device call is rejected.
 *
 * waitForDeviceMs: when the portal has just opened the 3CX web client, it
 * takes a few seconds to register - poll for a device for up to this long
 * before giving up with code "no_device".
 */
export async function makeThreeCxCall(
  config: ThreeCxConfig,
  fromExtension: string,
  destination: string,
  timeoutSec = 30,
  opts: { waitForDeviceMs?: number } = {}
): Promise<{ ok: true; callId?: number } | { ok: false; error: string; code?: "no_device" | "threecx" }> {
  try {
    const ext = encodeURIComponent(fromExtension);
    let devices = await listDnDevices(config, fromExtension);
    const deadline = Date.now() + Math.min(opts.waitForDeviceMs ?? 0, 15_000);
    while (devices && devices.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1000));
      devices = await listDnDevices(config, fromExtension);
    }
    if (devices && devices.length === 0) return { ok: false, code: "no_device", error: NO_DEVICE_ERROR };

    const body = { destination, timeout: timeoutSec };
    const send = (path: string) => threeCxRequest(config, path, { method: "POST", body });
    let res: Response | null = null;
    if (devices?.length) {
      const dev = pickCallDevice(devices);
      res = await send(`/callcontrol/${ext}/devices/${encodeURIComponent(dev.device_id)}/makecall`);
    }
    if (!res || (!res.ok && res.status !== 202)) res = await send(`/callcontrol/${ext}/makecall`);

    if (!res.ok && res.status !== 202) {
      const text = await res.text().catch(() => "");
      return { ok: false, code: "threecx", error: `3CX ${res.status}: ${text || res.statusText}` };
    }
    const data = await res.json().catch(() => null);
    const callId = Number(data?.result?.callid ?? data?.callid);
    return { ok: true, ...(Number.isFinite(callId) && callId > 0 ? { callId } : {}) };
  } catch (err) {
    return { ok: false, code: "threecx", error: err instanceof Error ? err.message : "Unknown 3CX error" };
  }
}

export type MyCallParticipant = {
  id: number;
  status: string;
  partyName: string | null;
  partyNumber: string | null;
  callId: number | null;
};

/** Live participants on one extension, trimmed for the call bar. */
export async function getExtensionParticipants(config: ThreeCxConfig, extension: string): Promise<MyCallParticipant[]> {
  const p = `/callcontrol/${encodeURIComponent(extension)}/participants`;
  const rows = await parse<unknown>(await threeCxRequest(config, p), p);
  return (Array.isArray(rows) ? rows : []).map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    status: String(r.status ?? ""),
    partyName: (r.party_caller_name as string) || null,
    partyNumber: (r.party_caller_id as string) || (r.party_dn as string) || null,
    callId: r.callid != null ? Number(r.callid) : null,
  }));
}

/** drop / transferto / divert on a participant of one extension. */
export async function actOnExtensionParticipant(
  config: ThreeCxConfig,
  extension: string,
  participantId: number,
  action: "drop" | "transferto" | "divert",
  destination?: string
) {
  const p = `/callcontrol/${encodeURIComponent(extension)}/participants/${Number(participantId)}/${action}`;
  const body = action === "drop" ? {} : { destination, reason: "None" };
  return parse<unknown>(await threeCxRequest(config, p, { method: "POST", body }), p);
}

export async function getWebClientUrl(config: ThreeCxConfig): Promise<string> {
  const custom = await getIntegrationSetting("threecx_webclient_url");
  return (custom || `${config.baseUrl}/webclient`).replace(/\/$/, "");
}
