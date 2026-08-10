// Salesforce authentication via OAuth 2.0 Client Credentials Flow —
// the right choice for a background, no-human-involved sync like this
// one. Only needs a Consumer Key + Secret (no username/password/
// security token to store or rotate), and runs "as" the org user
// configured in the Connected App's "Run As" setting.
//
// Fetches a fresh token on every push rather than caching one across
// serverless invocations — simplest and safest given this app's low
// volume (a handful of pushes per day), and avoids any risk of using a
// stale/expired cached token.

export type SalesforceAuth = {
  accessToken: string;
  instanceUrl: string;
};

export function isSalesforceConfigured(): boolean {
  return Boolean(
    process.env.SALESFORCE_INSTANCE_URL &&
      process.env.SALESFORCE_CLIENT_ID &&
      process.env.SALESFORCE_CLIENT_SECRET
  );
}

export async function getSalesforceAuth(): Promise<SalesforceAuth> {
  const instanceUrl = process.env.SALESFORCE_INSTANCE_URL!;
  const clientId = process.env.SALESFORCE_CLIENT_ID!;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET!;

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${instanceUrl.replace(/\/$/, "")}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Salesforce auth failed: ${JSON.stringify(json)}`);
  }

  return {
    accessToken: json.access_token,
    // Salesforce's token response includes its own instance_url, which
    // can differ slightly from what's configured (e.g. a specific pod
    // subdomain) — prefer that when present.
    instanceUrl: json.instance_url || instanceUrl,
  };
}
