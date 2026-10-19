import { getIntegrationSetting } from "@/lib/integrationSettings";
import { createAdminClient } from "@/lib/supabase/server";

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

// Tokens last an hour; reuse one per scope per warm server instance.
const POWERBI_SCOPE = "https://analysis.windows.net/powerbi/api/.default";
const FABRIC_SCOPE = "https://api.fabric.microsoft.com/.default";
const tokens = new Map<string, { token: string; expiresAt: number }>();

async function getToken(cfg: PowerBiConfig, scope = POWERBI_SCOPE): Promise<string> {
  const key = `${cfg.tenantId}:${cfg.clientId}:${scope}`;
  const hit = tokens.get(key);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope,
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new PowerBiError(`Sign-in failed: ${body.error_description?.split("\r\n")[0] ?? body.error ?? res.statusText}`, res.status);
  }
  tokens.set(key, { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

// ─── Signed-in user (delegated) ─────────────────────────────────────────────
// Models with security roles (RLS/OLS) can't be queried by an app login, so
// queries run as an admin who signed in once under Settings → Connectors →
// Power BI. The refresh token lives in integration_settings (admin-only) and
// rotates on every use; it stays valid while it's used at least every 90 days.
export const USER_SCOPE = "https://analysis.windows.net/powerbi/api/Dataset.Read.All offline_access openid profile";
let userToken: { token: string; expiresAt: number } | null = null;

export async function hasSignedInUser(): Promise<boolean> {
  return !!(await getIntegrationSetting("powerbi_user_refresh_token"));
}

async function getUserToken(cfg: PowerBiConfig): Promise<string | null> {
  if (userToken && userToken.expiresAt > Date.now() + 60_000) return userToken.token;
  const refresh = await getIntegrationSetting("powerbi_user_refresh_token");
  if (!refresh) return null;
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refresh,
      scope: USER_SCOPE,
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new PowerBiError(
      `The Power BI sign-in has expired or was revoked — sign in again under Settings → Connectors → Power BI. (${body.error_description?.split("\r\n")[0] ?? body.error ?? res.statusText})`,
      401
    );
  }
  if (body.refresh_token && body.refresh_token !== refresh) {
    // Keep who signed in (updated_by); only the token value rotates.
    await createAdminClient()
      .from("integration_settings")
      .update({ value: body.refresh_token, updated_at: new Date().toISOString() })
      .eq("key", "powerbi_user_refresh_token");
  }
  userToken = { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}

// Exchange the sign-in code for tokens (OAuth callback).
export async function redeemSignInCode(cfg: PowerBiConfig, code: string, redirectUri: string) {
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri,
      scope: USER_SCOPE,
    }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.refresh_token) {
    throw new PowerBiError(body.error_description?.split("\r\n")[0] ?? body.error ?? "Sign-in failed", res.status);
  }
  let name: string | null = null;
  try {
    const claims = JSON.parse(Buffer.from(String(body.id_token).split(".")[1], "base64url").toString("utf8"));
    name = claims.preferred_username ?? claims.name ?? null;
  } catch {
    /* no id token */
  }
  userToken = { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  return { refreshToken: body.refresh_token as string, name };
}

export function forgetUserToken() {
  userToken = null;
}

async function pbiFetch(cfg: PowerBiConfig, path: string, opts?: RequestInit & { asUser?: boolean }) {
  const { asUser, ...init } = opts ?? {};
  const token = (asUser ? await getUserToken(cfg) : null) ?? (await getToken(cfg));
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
  if (status === 401)
    return "Power BI rejected the app. For queries, turn on the \"Semantic Model Execute Queries REST API\" tenant setting (Admin portal → Tenant settings → Integration settings); changes can take ~15 minutes.";
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
    asUser: true,
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

export type ReportInfo = { id: string; name: string; datasetId: string | null };

export async function listReports(cfg: PowerBiConfig): Promise<ReportInfo[]> {
  const body = await pbiFetch(cfg, "/reports");
  return ((body.value ?? []) as { id: string; name: string; datasetId?: string }[]).map((r) => ({ id: r.id, name: r.name, datasetId: r.datasetId ?? null }));
}

export type DefinitionPart = { path: string; text: string };

// Full definition of a semantic model (TMDL: tables, columns, measures with
// their DAX, relationships) or a report (pages and visuals) through the
// Fabric REST API. Long-running: Fabric answers 202 and we poll.
export async function getItemDefinition(cfg: PowerBiConfig, kind: "semanticModels" | "reports", id: string): Promise<DefinitionPart[]> {
  const token = await getToken(cfg, FABRIC_SCOPE);
  const base = `https://api.fabric.microsoft.com/v1/workspaces/${encodeURIComponent(cfg.workspaceId)}/${kind}/${encodeURIComponent(id)}/getDefinition`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  let res = await fetch(kind === "semanticModels" ? `${base}?format=TMDL` : base, { method: "POST", headers, cache: "no-store" });

  if (res.status === 202) {
    const location = res.headers.get("location");
    if (!location) throw new PowerBiError("Fabric didn't say where to poll for the definition");
    const deadline = Date.now() + 50_000;
    for (;;) {
      const wait = Number(res.headers.get("retry-after") ?? 2);
      await new Promise((r) => setTimeout(r, Math.min(Math.max(wait, 1), 5) * 1000));
      const op = await fetch(location, { headers, cache: "no-store" });
      const opBody = await op.json().catch(() => ({}));
      if (opBody.status === "Succeeded") {
        res = await fetch(`${location.replace(/\/$/, "")}/result`, { headers, cache: "no-store" });
        break;
      }
      if (opBody.status === "Failed") throw new PowerBiError(`Fabric couldn't export the ${kind === "reports" ? "report" : "model"}: ${opBody.error?.message ?? "unknown error"}`);
      if (Date.now() > deadline) throw new PowerBiError("Timed out waiting for Fabric to export the definition");
      res = op;
    }
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.message ?? body?.error?.message ?? res.statusText;
    throw new PowerBiError(`Fabric ${res.status}: ${msg}`, res.status);
  }
  const parts = (body.definition?.parts ?? []) as { path: string; payload: string; payloadType: string }[];
  return parts.map((p) => ({ path: p.path, text: p.payloadType === "InlineBase64" ? Buffer.from(p.payload, "base64").toString("utf8") : p.payload }));
}
