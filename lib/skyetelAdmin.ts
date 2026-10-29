import { getIntegrationSetting } from "@/lib/integrationSettings";

// Server-only. Skyetel's main REST API (numbers, endpoints, billing, SMS
// receipts, number ordering, E911) for the Phones > Skyetel admin tab.
// Reference: https://api.docs.skyetel.com/
//
// Differences from the SMS API in lib/skyetel.ts:
//   - base https://api.skyetel.com/v1
//   - auth is X-AUTH-SID / X-AUTH-SECRET headers (not Basic)
//   - POST/PATCH bodies are form-encoded, nested keys in brackets
//   - 120 requests/minute; 429 when exceeded
// Uses the same SID/secret already saved for SMS (Admin > Connectors).

const BASE = "https://api.skyetel.com/v1";

export class SkyetelError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function creds() {
  const [sid, secret] = await Promise.all([getIntegrationSetting("skyetel_api_key"), getIntegrationSetting("skyetel_api_secret")]);
  if (!sid || !secret) throw new SkyetelError(0, "Skyetel isn't connected. Add the API SID and secret under Admin › Connectors.");
  return { sid, secret };
}

export async function skyetelConfigured(): Promise<boolean> {
  const [sid, secret] = await Promise.all([getIntegrationSetting("skyetel_api_key"), getIntegrationSetting("skyetel_api_secret")]);
  return !!(sid && secret);
}

interface Form {
  [key: string]: string | number | boolean | null | undefined | Form;
}

/** Flattens {a:{b:1}} into a[b]=1 the way Skyetel expects. */
function toForm(obj: Form, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === "object") toForm(v as Form, key, out);
    else out.append(key, v === null ? "" : typeof v === "boolean" ? (v ? "true" : "false") : String(v));
  }
  return out;
}

export async function skyetelApi<T = unknown>(path: string, init: { method?: string; form?: Form; query?: Record<string, string | number> } = {}): Promise<T> {
  const { sid, secret } = await creds();
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      "X-AUTH-SID": sid,
      "X-AUTH-SECRET": secret,
      Accept: "application/json",
      ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init.form ? toForm(init.form).toString() : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.message || j.error || j.detail || text;
    } catch {}
    if (res.status === 429) msg = "Skyetel rate limit hit (120 requests/minute). Wait a minute and try again.";
    throw new SkyetelError(res.status, `Skyetel ${res.status}: ${String(msg).slice(0, 300)}`);
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

/** Lists come back either as an array or wrapped ({data:[...]}) - accept both. */
function rows<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    for (const k of ["data", "items", "results", "phonenumbers", "endpoints"]) if (Array.isArray(o[k])) return o[k] as T[];
  }
  return [];
}

async function pageAll<T>(path: string, extra: Record<string, string> = {}, max = 2000): Promise<T[]> {
  const out: T[] = [];
  const limit = 200;
  for (let offset = 0; offset < max; offset += limit) {
    const r = await skyetelApi(path, { query: { "page[limit]": limit, "page[offset]": offset, ...extra } });
    const batch = rows<T>(r);
    out.push(...batch);
    if (batch.length < limit) break;
  }
  return out;
}

// ---- Types (fields as documented; anything may be missing) ----

export type SkyNumber = {
  id: number;
  number: string;
  note?: string | null;
  endpoint_group?: { id: number; name: string } | null;
  forward?: string | null;
  failover?: string | null;
  message_enabled?: boolean;
  message_destination?: { type?: string; config?: Record<string, unknown> } | null;
  cnam_enabled?: boolean;
  lidb?: { cnam_text?: string; type?: string; private?: boolean } | null;
  e911_enabled?: boolean;
  e911_address?: E911Address | null;
  spamblock_enabled?: boolean;
  pending_port_out?: boolean;
};

export type E911Address = {
  caller_name: string;
  address1: string;
  address2?: string;
  community: string;
  state: string;
  postal_code: string;
};

export type SkyEndpoint = {
  id: number;
  ip: string;
  port?: number;
  transport?: string;
  priority?: number;
  description?: string;
  endpoint_group?: { id: number; name: string } | null;
};

export type SkyReceipt = {
  id: number;
  time: string;
  direction?: boolean | number | string;
  from_phonenumber: string;
  to_phonenumber: string;
  delivery_state?: string;
  flag_delivered?: boolean;
  flag_attachment?: boolean;
  segment_count?: number;
  cost?: string | number;
};

export type IpHealth = { ip: string; transport?: string; description?: string; alert?: boolean | string; monitor?: boolean };

// ---- Reads ----

export const listNumbers = () => pageAll<SkyNumber>("/phonenumbers", { include: "message_destination" });
export const listEndpoints = () => pageAll<SkyEndpoint>("/endpoints");
export const ipHealth = async () => rows<IpHealth>(await skyetelApi("/stats/iphealth"));

export async function getBalance(): Promise<{ balance: number | null; credit: boolean }> {
  const r = await skyetelApi<{ BALANCE?: string; balance?: string; credit?: boolean }>("/billing/balance");
  const raw = r?.BALANCE ?? r?.balance;
  return { balance: raw != null && raw !== "" ? Number(raw) : null, credit: !!r?.credit };
}

export async function getStatement(year: number, month: number) {
  return skyetelApi<{ statement?: { totals?: Record<string, number | string> }; transactions?: { amount: string; date: string; note?: string; type?: string }[] }>(
    "/stats/org/statement",
    { query: { year, month } }
  );
}

export async function getDailyTraffic(fromIso: string, toIso: string, tz = "America/Chicago") {
  return rows<{ date: string; inbound_minutes: number; outbound_minutes: number; inbound_count: number; outbound_count: number; total_billing_cost: number | string }>(
    await skyetelApi("/stats/org/traffic/total-counts", { query: { start_time_min: fromIso, start_time_max: toIso, tz } })
  );
}

export async function listSmsReceipts(limit = 50, number?: string) {
  const query: Record<string, string | number> = { "page[limit]": limit, "page[offset]": 0, sort: "-time" };
  if (number) query["filter[to_phonenumber]"] = number;
  return rows<SkyReceipt>(await skyetelApi("/smsreceipts", { query }));
}

// ---- Writes ----

export function updateNumber(id: number, fields: Form) {
  return skyetelApi<SkyNumber>(`/phonenumbers/${id}`, { method: "PATCH", form: fields });
}

export async function setE911(id: number, address: E911Address, hadAddress: boolean) {
  await skyetelApi(`/phonenumbers/${id}/e911address`, { method: hadAddress ? "PATCH" : "POST", form: address as unknown as Form });
  return updateNumber(id, { e911_enabled: true });
}

export async function searchNumbers(params: { npa?: string; state?: string; city?: string; wildcard?: string; quantity?: number; tollFree?: boolean }) {
  const query: Record<string, string | number> = { "filter[quantity]": Math.min(params.quantity ?? 10, 50) };
  if (params.npa) query["filter[npas]"] = params.npa;
  if (params.state) query["filter[states]"] = params.state.toUpperCase();
  if (params.city) query["filter[city]"] = params.city;
  if (params.tollFree) query["filter[category]"] = 3;
  // Skyetel requires a mask or wildcard; "*" style wildcard = any digits.
  query["filter[tnWildcard]"] = params.wildcard || `${params.npa ?? ""}*`;
  const r = await skyetelApi<unknown>("/phonenumbers/order/search", { query });
  return rows<string | { number?: string }>(r).map((n) => (typeof n === "string" ? n : n.number ?? "")).filter(Boolean);
}

export async function orderNumbers(numbers: string[], monthlyMinutes = 500) {
  const form: Form = { numbers: {} };
  for (const n of numbers) (form.numbers as Form)[n.replace(/\D/g, "")] = { mou: monthlyMinutes };
  return rows<SkyNumber>(await skyetelApi("/phonenumbers/order", { method: "POST", form }));
}
