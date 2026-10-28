import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";

// Delegated ("on behalf of the signed-in employee") Microsoft Graph access.
//
// lib/msgraph.ts is app-only: it can read anything in the tenant, which is
// right for provisioning and directory sync but WRONG for "what files has
// Amir shared with me" - an app-only call would happily return files the
// asker isn't allowed to see. Everything here instead runs with the
// asker's own token, so Microsoft enforces their permissions, exactly like
// M365 Copilot does.
//
// Flow: the Microsoft SSO sign-in (Supabase "azure" provider) requests
// offline_access + a few read scopes; /auth/callback stores the returned
// provider refresh token here, encrypted. On demand we trade it for a
// short-lived access token and store the rotated refresh token.

export const DELEGATED_SCOPES = ["offline_access", "User.Read", "User.ReadBasic.All", "Calendars.Read", "Sites.Read.All", "People.Read"];
export const SSO_SCOPES = ["email", "openid", "profile", ...DELEGATED_SCOPES].join(" ");

function key(): Buffer {
  const secret = process.env.GRAPH_TOKEN_ENC_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!secret) throw new Error("No encryption key available for Graph tokens.");
  return crypto.createHash("sha256").update(`graph-token:${secret}`).digest();
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptToken(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export async function saveRefreshToken(employeeId: string, refreshToken: string) {
  const admin = createAdminClient();
  await admin.from("employee_graph_tokens").upsert({
    employee_id: employeeId,
    refresh_token_enc: encryptToken(refreshToken),
    scopes: DELEGATED_SCOPES.join(" "),
    updated_at: new Date().toISOString(),
  });
}

// The SSO app registration (the one configured in Supabase Auth →
// Providers → Azure). Defaults to the same app the portal uses for Graph;
// override in Admin → Connectors if Supabase uses a different one.
async function ssoClient() {
  const tenantId = (await getIntegrationSetting("azure_sso_tenant_id", process.env.AZURE_SSO_TENANT_ID)) ?? process.env.AZURE_TENANT_ID;
  const clientId = (await getIntegrationSetting("azure_sso_client_id", process.env.AZURE_SSO_CLIENT_ID)) ?? process.env.AZURE_CLIENT_ID;
  const clientSecret = (await getIntegrationSetting("azure_sso_client_secret", process.env.AZURE_SSO_CLIENT_SECRET)) ?? process.env.AZURE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) throw new Error("SSO app credentials aren't configured.");
  return { tenantId, clientId, clientSecret };
}

export class DelegatedAccessUnavailable extends Error {}

// Returns an access token acting as this employee, or throws
// DelegatedAccessUnavailable (they haven't signed in since this was
// enabled, or revoked consent) - callers degrade gracefully.
export async function getDelegatedToken(employeeId: string): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("employee_graph_tokens").select("refresh_token_enc").eq("employee_id", employeeId).maybeSingle();
  if (!data?.refresh_token_enc) throw new DelegatedAccessUnavailable("No Microsoft token on file - sign out and back in once.");
  let refresh: string;
  try {
    refresh = decryptToken(data.refresh_token_enc);
  } catch {
    throw new DelegatedAccessUnavailable("Stored Microsoft token couldn't be read - sign out and back in once.");
  }
  const { tenantId, clientId, clientSecret } = await ssoClient();
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refresh,
      scope: DELEGATED_SCOPES.filter((s) => s !== "offline_access").map((s) => `https://graph.microsoft.com/${s}`).join(" ") + " offline_access",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    // invalid_grant = expired/revoked; make them sign in again.
    if (/invalid_grant|interaction_required|consent_required/i.test(t)) {
      await admin.from("employee_graph_tokens").delete().eq("employee_id", employeeId);
      throw new DelegatedAccessUnavailable("Microsoft access expired or needs consent - sign out and back in once.");
    }
    throw new Error(`Microsoft token refresh failed (${res.status}): ${t.slice(0, 200)}`);
  }
  const tok = await res.json();
  if (tok.refresh_token) await saveRefreshToken(employeeId, tok.refresh_token).catch(() => null);
  return tok.access_token as string;
}

export async function delegatedGet(token: string, path: string, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, { headers: { Authorization: `Bearer ${token}`, ...extraHeaders } });
  if (!res.ok) throw new Error(`Graph ${path.split("?")[0]} failed: ${res.status}`);
  return res.json();
}
