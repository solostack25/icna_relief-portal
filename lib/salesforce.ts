// Generic Salesforce REST API client for pushing records into a food
// bank's own Salesforce org. Nothing here is specific to any one food
// bank - every org, object, and field name comes from the
// salesforce_sync_targets row passed in, per lib/reports/registry.ts's
// "config, not code" pattern for report modules.
//
// Uses OAuth 2.0 Client Credentials Flow (grant_type=client_credentials):
// the simplest unattended server-to-server flow Salesforce supports -
// no per-user login, no refresh token to store/rotate, just a Client
// ID + Secret from a Connected App the food bank's Salesforce admin
// creates and enables for this flow. (The older JWT Bearer Flow is an
// alternative some orgs may already have set up for other
// integrations; if a food bank can only offer that, this client would
// need a second token-exchange function - not built here since we
// have no real target to test it against yet.)

const SALESFORCE_API_VERSION = "v59.0";

export type SalesforceSyncTarget = {
  id: string;
  instance_url: string;
  client_id: string;
  client_secret: string;
  object_api_name: string;
  field_mapping: { sourceColumn: string; salesforceField: string }[];
};

type TokenResponse = { access_token: string; instance_url: string; token_type: string };

// Fetches a fresh access token per call rather than caching - tokens
// are short-lived and sync runs are infrequent (batch, daily/weekly/
// monthly), so the extra round trip is negligible and avoids having
// to reason about cross-invocation token expiry in a serverless
// environment with no shared memory between cron runs.
async function getAccessToken(target: SalesforceSyncTarget): Promise<TokenResponse> {
  const tokenUrl = `${target.instance_url.replace(/\/$/, "")}/services/oauth2/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: target.client_id,
      client_secret: target.client_secret,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Salesforce auth failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Verifies credentials work without pushing any data - used by the
// admin UI's "Test Connection" button so a target can be validated
// before it's ever marked active.
export async function testSalesforceConnection(
  target: Pick<SalesforceSyncTarget, "instance_url" | "client_id" | "client_secret">
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await getAccessToken(target as SalesforceSyncTarget);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// Maps one ICNA source row (e.g. an hp_intakes row) to a Salesforce
// field payload using the target's field_mapping - entirely
// data-driven, no per-food-bank code path.
export function mapRowToSalesforceFields(row: Record<string, unknown>, fieldMapping: SalesforceSyncTarget["field_mapping"]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const m of fieldMapping) {
    if (row[m.sourceColumn] !== undefined) fields[m.salesforceField] = row[m.sourceColumn];
  }
  return fields;
}

// Pushes one record into the target org via the standard sobjects
// REST endpoint. Returns the new Salesforce record id on success.
export async function pushRecordToSalesforce(
  target: SalesforceSyncTarget,
  fields: Record<string, unknown>
): Promise<{ id: string }> {
  const token = await getAccessToken(target);
  const url = `${token.instance_url.replace(/\/$/, "")}/services/data/${SALESFORCE_API_VERSION}/sobjects/${target.object_api_name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.access_token}` },
    body: JSON.stringify(fields),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(body) ? body.map((e: { message?: string }) => e.message).join("; ") : res.statusText;
    throw new Error(`Salesforce push failed (${res.status}): ${message}`);
  }
  return { id: body.id };
}
