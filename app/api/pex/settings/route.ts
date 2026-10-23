import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/grantManagement/api";
import { requirePex } from "@/lib/pex/access";
import { getIntegrationSetting, setIntegrationSetting } from "@/lib/integrationSettings";
import { getPexConfig, pexBusinessBalance, PEX_DEFAULT_URL } from "@/lib/pex/client";
import { audit, createAdminClient } from "@/lib/grantManagement/server";

// PEX connection settings. Secrets are write-only: the API never sends
// a saved token or webhook secret back to the browser.
const mask = (v: string | null) => (v ? `••••${v.slice(-4)}` : null);

export async function GET() {
  const auth = await requirePex({ admin: true });
  if ("res" in auth) return auth.res;
  const [url, token, secret, tagId] = await Promise.all([
    getIntegrationSetting("pex_api_url", process.env.PEX_API_URL),
    getIntegrationSetting("pex_api_token", process.env.PEX_API_TOKEN),
    getIntegrationSetting("pex_webhook_secret", process.env.PEX_WEBHOOK_SECRET),
    getIntegrationSetting("pex_grant_tag_id", process.env.PEX_GRANT_TAG_ID),
  ]);
  return NextResponse.json({ url: url || PEX_DEFAULT_URL, token: mask(token), webhookSecret: mask(secret), tagId: tagId ?? "" });
}

// Save (Finance / PEX admins), or { test: true } to
// check the saved token works.
export async function POST(req: Request) {
  const auth = await requirePex({ admin: true });
  if ("res" in auth) return auth.res;
  const { viewer } = auth;
  const body = await readJson(req);

  if (body.test === true) {
    const cfg = await getPexConfig();
    if (!cfg) return fail("No PEX API token saved yet.");
    try {
      const balance = await pexBusinessBalance(cfg);
      return NextResponse.json({ ok: true, balance });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Couldn't reach PEX.", 502);
    }
  }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : null);
  const changed: string[] = [];
  const url = str(body.url);
  if (url !== null) {
    if (url && url.toLowerCase() !== "demo" && !/^https:\/\/[^\s]+$/i.test(url)) return fail("The PEX API URL must start with https://", 400, { url: "Use the https URL from PEX." });
    await setIntegrationSetting("pex_api_url", url || PEX_DEFAULT_URL, viewer.employeeId);
    changed.push("url");
  }
  const token = str(body.token);
  if (token) {
    await setIntegrationSetting("pex_api_token", token, viewer.employeeId);
    changed.push("token");
  }
  const secret = str(body.webhookSecret);
  if (secret) {
    await setIntegrationSetting("pex_webhook_secret", secret, viewer.employeeId);
    changed.push("webhook secret");
  }
  const tagId = str(body.tagId);
  if (tagId !== null) {
    await setIntegrationSetting("pex_grant_tag_id", tagId, viewer.employeeId);
    changed.push("grant tag");
  }
  if (changed.length) await audit(createAdminClient(), { entity: "pex", action: "settings_changed", actorId: viewer.employeeId, changes: { fields: changed } });
  return NextResponse.json({ ok: true, changed });
}
