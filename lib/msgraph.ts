// Microsoft Graph client-credentials helper — app-only auth, used
// server-side only (AD role sync, first-login provisioning).
// Requires AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET env vars.

// Microsoft Graph client-credentials helper — app-only auth, used
// server-side only (AD role sync, first-login provisioning).
// Requires AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET env vars.
//
// Deliberately NOT caching the token across invocations — a warm
// serverless function could otherwise keep serving a token issued
// before a permission change (e.g. newly granted admin consent),
// which would silently keep failing even after the fix is in place.
// Each call gets a guaranteed-fresh token; the cost is negligible.

export async function getGraphToken(): Promise<string> {
  const tenantId = process.env.AZURE_TENANT_ID!;
  const clientId = process.env.AZURE_CLIENT_ID!;
  const clientSecret = process.env.AZURE_CLIENT_SECRET!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to get Graph token: ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function graphGet(path: string) {
  const token = await getGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Graph GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// Follows @odata.nextLink pagination, returns all pages combined
export async function graphGetAll(path: string) {
  let results: any[] = [];
  let next: string | null = `https://graph.microsoft.com${path}`;
  const token = await getGraphToken();

  while (next) {
    const res: Response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Graph GET ${next} failed: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    results = results.concat(data.value ?? []);
    next = data["@odata.nextLink"] ?? null;
  }

  return results;
}
