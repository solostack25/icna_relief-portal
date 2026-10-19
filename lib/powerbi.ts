import { getIntegrationSetting } from "@/lib/integrationSettings";

// Read-only Power BI client for the temporary Power BI check
// (Reports → Power BI, app/admin/powerbi). Signs in as an Entra app registration
// (client credentials) and runs DAX against semantic models through the
// Execute Queries REST API.
//
// Power BI-side setup the app needs:
//   - tenant settings "Service principals can use Fabric APIs" and
//     "Dataset Execute Queries REST API", scoped to the app's security group
//   - the app's group added to the workspace as Contributor (Read + Build)
// Limits: one query per call, 100k rows / 1M values / 15 MB per query,
// 120 queries per minute. Models with row-level security can't be queried
// by an app.

export type PowerBiConfig = { tenantId: string; clientId: string; clientSecret: string; workspaceId: string };

export async function getPowerBiConfig(): Promise<PowerBiConfig | null> {
  const [tenantId, clientId, clientSecret, workspaceId] = await Promise.all([
    getIntegrationSetting("powerbi_tenant_id", process.env.PBI_TENANT_ID),
    getIntegrationSetting("powerbi_client_id", process.env.PBI_CLIENT_ID),
    getIntegrationSetting("powerbi_client_secret", process.env.PBI_CLIENT_SECRET),
    getIntegrationSetting("powerbi_workspace_id", process.env.PBI_WORKSPACE_ID),
  ]);
  if (!tenantId || !clientId || !clientSecret || !workspaceId) return null;
  return { tenantId: tenantId.trim(), clientId: clientId.trim(), clientSecret: clientSecret.trim(), workspaceId: workspaceId.trim() };
}

export class PowerBiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

// Tokens last an hour; reuse one per warm server instance.
let cached: { key: string; token: string; expiresAt: number } | null = null;

async function getToken(cfg: PowerBiConfig): Promise<string> {
  const key = `${cfg.tenantId}:${cfg.clientId}`;
  if (cached && cached.key === key && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: "https://analysis.windows.net/powerbi/api/.default",
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new PowerBiError(`Sign-in failed: ${body.error_description?.split("\r\n")[0] ?? body.error ?? res.statusText}`, res.status);
  }
  cached = { key, token: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

async function pbiFetch(cfg: PowerBiConfig, path: string, init?: RequestInit) {
  const token = await getToken(cfg);
  const res = await fetch(`https://api.powerbi.com/v1.0/myorg/groups/${encodeURIComponent(cfg.workspaceId)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new PowerBiError(explain(res.status, body), res.status);
  }
  return body;
}

// Turn Power BI's error bodies into something an admin can act on.
function explain(status: number, body: { error?: { code?: string; message?: string; "pbi.error"?: { details?: { detail?: { value?: string } }[] } } }) {
  const detail = body?.error?.["pbi.error"]?.details?.map((d) => d.detail?.value).filter(Boolean).join(" ");
  const raw = detail || body?.error?.message || body?.error?.code || "";
  if (status === 401) return "Power BI rejected the app. Check that the tenant settings are on for the app's security group (changes can take ~15 minutes).";
  if (status === 403 || status === 404)
    return `The app can't reach this workspace or model. Add its security group to the workspace as Contributor.${raw ? ` (${raw})` : ""}`;
  if (status === 400) return `Query error: ${raw || "check the DAX"}`;
  if (status === 429) return "Power BI rate limit hit (120 queries a minute). Try again shortly.";
  return `Power BI error ${status}${raw ? `: ${raw}` : ""}`;
}

export type Dataset = { id: string; name: string };

export async function listDatasets(cfg: PowerBiConfig): Promise<Dataset[]> {
  const body = await pbiFetch(cfg, "/datasets");
  return ((body.value ?? []) as { id: string; name: string }[])
    .map((d) => ({ id: d.id, name: d.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type QueryRow = Record<string, string | number | boolean | null>;

export async function executeDax(cfg: PowerBiConfig, datasetId: string, dax: string): Promise<QueryRow[]> {
  const body = await pbiFetch(cfg, `/datasets/${encodeURIComponent(datasetId)}/executeQueries`, {
    method: "POST",
    body: JSON.stringify({ queries: [{ query: dax }], serializerSettings: { includeNulls: true } }),
  });
  const result = body.results?.[0];
  if (result?.error) throw new PowerBiError(`Query error: ${result.error.message ?? "unknown"}`, 400);
  const rows = (result?.tables?.[0]?.rows ?? []) as QueryRow[];
  // Column names come back as "Table[Column]" or "[Measure]"; keep the
  // readable part so the explorer table is easier to scan.
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/^.*\[(.*)\]$/, "$1"), v])));
}

// First numeric value in the first row.
export function firstNumber(rows: QueryRow[]): number | null {
  const row = rows[0];
  if (!row) return null;
  for (const v of Object.values(row)) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

// When the model last finished refreshing (null if it has no refresh
// history, e.g. only ever published from Desktop).
export async function lastRefresh(cfg: PowerBiConfig, datasetId: string): Promise<string | null> {
  try {
    const body = await pbiFetch(cfg, `/datasets/${encodeURIComponent(datasetId)}/refreshes?$top=1`);
    const r = body.value?.[0];
    return r?.endTime ?? r?.startTime ?? null;
  } catch {
    return null;
  }
}
