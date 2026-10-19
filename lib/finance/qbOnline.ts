import { getIntegrationSetting } from "@/lib/integrationSettings";
import { createAdminClient } from "@/lib/supabase/server";
import { parseQbGrid } from "./parse";
import { qboReportToGrid, type QboReport } from "./qbGrid";
import { applyQbMatrix } from "./qbApply";
import { MONTHS } from "./accounts";

// QuickBooks Online (Intuit OAuth 2.0 + Reports API). Settings live in
// integration_settings so finance can connect from Admin → Connectors:
//   qbo_client_id, qbo_client_secret, qbo_environment (production|sandbox)
//   qbo_refresh_token, qbo_realm_id, qbo_company_name, qbo_connected_at  (set by sign-in)
// Intuit rotates the refresh token on every use, so every refresh saves
// the new one.

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";

export type QboConfig = { clientId: string; clientSecret: string; sandbox: boolean };

export async function getQboConfig(): Promise<QboConfig | null> {
  const [clientId, clientSecret, env] = await Promise.all([
    getIntegrationSetting("qbo_client_id", process.env.QBO_CLIENT_ID),
    getIntegrationSetting("qbo_client_secret", process.env.QBO_CLIENT_SECRET),
    getIntegrationSetting("qbo_environment", process.env.QBO_ENVIRONMENT),
  ]);
  if (!clientId || !clientSecret) return null;
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim(), sandbox: /sandbox/i.test(env ?? "") };
}

const apiBase = (cfg: QboConfig) => (cfg.sandbox ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com");

async function tokenRequest(cfg: QboConfig, body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(j.error_description || j.error || `Intuit sign-in failed (${res.status})`);
  return j as { access_token: string; refresh_token: string; expires_in: number };
}

export async function redeemQboCode(cfg: QboConfig, code: string, redirectUri: string) {
  return tokenRequest(cfg, { grant_type: "authorization_code", code, redirect_uri: redirectUri });
}

let cached: { token: string; until: number } | null = null;
export const forgetQboToken = () => {
  cached = null;
};

async function accessToken(cfg: QboConfig): Promise<{ token: string; realmId: string }> {
  const realmId = await getIntegrationSetting("qbo_realm_id");
  const refresh = await getIntegrationSetting("qbo_refresh_token");
  if (!realmId || !refresh) throw new Error("QuickBooks Online isn't connected. Connect it on Admin → Connectors.");
  if (cached && cached.until > Date.now() + 60_000) return { token: cached.token, realmId };
  const t = await tokenRequest(cfg, { grant_type: "refresh_token", refresh_token: refresh });
  if (t.refresh_token && t.refresh_token !== refresh) {
    await createAdminClient().from("integration_settings").upsert({ key: "qbo_refresh_token", value: t.refresh_token, updated_at: new Date().toISOString() });
  }
  cached = { token: t.access_token, until: Date.now() + (t.expires_in ?? 3600) * 1000 };
  return { token: t.access_token, realmId };
}

async function qboGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const cfg = await getQboConfig();
  if (!cfg) throw new Error("Fill in the QuickBooks Online client ID and secret on Admin → Connectors.");
  const { token, realmId } = await accessToken(cfg);
  const url = new URL(`${apiBase(cfg)}/v3/company/${encodeURIComponent(realmId)}${path}`);
  url.search = new URLSearchParams({ minorversion: "75", ...params }).toString();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const fault = j?.Fault?.Error?.[0];
    throw new Error(fault ? `${fault.Message}${fault.Detail ? ` — ${fault.Detail}` : ""}` : `QuickBooks returned ${res.status}`);
  }
  return j as T;
}

export async function qboCompanyName(realmId: string): Promise<string | null> {
  try {
    const j = await qboGet<{ CompanyInfo?: { CompanyName?: string } }>(`/companyinfo/${encodeURIComponent(realmId)}`);
    return j.CompanyInfo?.CompanyName ?? null;
  } catch {
    return null;
  }
}

async function classPaths() {
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  let start = 1;
  for (;;) {
    const j = await qboGet<{ QueryResponse?: { Class?: { Id: string; Name: string; FullyQualifiedName?: string }[] } }>("/query", {
      query: `select * from Class STARTPOSITION ${start} MAXRESULTS 1000`,
    });
    const list = j.QueryResponse?.Class ?? [];
    for (const c of list) {
      const path = c.FullyQualifiedName ?? c.Name;
      byId.set(c.Id, path);
      byName.set(c.Name.toLowerCase(), path);
    }
    if (list.length < 1000) break;
    start += 1000;
  }
  return { byId, byName };
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Pull one month's P&L by Class and apply it like an uploaded export.
export async function pullQboMonth(year: number, month: number, employeeId: string | null) {
  const [report, classes] = await Promise.all([
    qboGet<QboReport>("/reports/ProfitAndLoss", {
      start_date: `${year}-${pad(month)}-01`,
      end_date: `${year}-${pad(month)}-${pad(lastDay(year, month))}`,
      summarize_column_by: "Classes",
    }),
    classPaths(),
  ]);
  const grid = qboReportToGrid(report, classes.byId, classes.byName);
  const matrix = parseQbGrid(grid, `${MONTHS[month - 1]} ${year}`, "QuickBooks Online");
  if (!matrix) throw new Error("QuickBooks returned a report with no expense lines for that month.");
  return applyQbMatrix({ year, month, matrix, source: "qb_online", fileName: `QuickBooks Online · ${MONTHS[month - 1]} ${year}`, employeeId });
}
