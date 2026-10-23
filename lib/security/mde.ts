import { GraphError } from "@/lib/devices/graph";

// Microsoft Defender for Endpoint API (separate from Graph). Uses the
// same Portal app registration with permissions from the
// "WindowsDefenderATP" API: Machine.Isolate, Machine.Scan.
// Server-only.

async function mdeToken(): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AZURE_CLIENT_ID!,
      client_secret: process.env.AZURE_CLIENT_SECRET!,
      scope: "https://api.securitycenter.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new GraphError(res.status, `Couldn't get a Defender token: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

export async function mdePost(path: string, body: unknown) {
  const token = await mdeToken();
  const res = await fetch(`https://api.securitycenter.microsoft.com/api${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text)?.error?.message ?? text;
    } catch {}
    throw new GraphError(res.status, msg);
  }
  return text ? JSON.parse(text) : null;
}

export function explainMdeError(err: unknown, permission: string) {
  if (err instanceof GraphError) {
    if (err.status === 401 || err.status === 403)
      return `Defender denied access (${err.status}). Add the "${permission}" permission from the WindowsDefenderATP API (API permissions → APIs my organization uses → WindowsDefenderATP → Application) and grant admin consent.`;
    if (err.status === 404) return "Defender doesn't know this machine (not onboarded, or it was removed).";
    if (err.status === 400 && /pending|already/i.test(err.message)) return `Defender says: ${err.message}`;
    return `Defender returned ${err.status}: ${err.message.slice(0, 300)}`;
  }
  return err instanceof Error ? err.message : "Unknown error";
}
