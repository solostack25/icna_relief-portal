import { NextResponse } from "next/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { createAdminClient } from "@/lib/supabase/server";

// Everything Copilot Studio calls goes through /api/copilot/* and
// authenticates with a static API key (header: X-Copilot-Api-Key) -
// distinct from the normal browser-session auth used everywhere else
// in the portal, since Copilot Studio's custom connector calls these
// server-to-server with no logged-in user cookie.
//
// The key is set once in Admin > Connectors (integration setting
// "copilot_api_key") and pasted into the custom connector's security
// config in Power Platform. Every /api/copilot/* route must call
// requireCopilotAuth() first.

export async function requireCopilotAuth(req: Request): Promise<NextResponse | null> {
  const provided = req.headers.get("x-copilot-api-key");
  const expected = await getIntegrationSetting("copilot_api_key");

  if (!expected) {
    return NextResponse.json(
      { error: "Copilot API key isn't configured yet. Set 'copilot_api_key' in Admin > Connectors." },
      { status: 500 }
    );
  }
  if (!provided || provided !== expected) {
    return NextResponse.json({ error: "Invalid or missing X-Copilot-Api-Key header" }, { status: 401 });
  }
  return null; // null = auth passed
}

// Most Copilot actions need to know WHICH employee is asking (e.g.
// "create a ticket for me", "call Syed" should originate from the
// caller's own 3CX extension). Since there's no browser session,
// the calling Copilot topic must pass the requester's email
// (available from their Entra ID identity inside Copilot Studio),
// and this looks up the matching employee record server-side.
export async function lookupEmployeeByEmail(email: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("employees")
    .select("id, first_name, last_name, email, threecx_extension, role")
    .ilike("email", email)
    .maybeSingle();
  return data;
}
