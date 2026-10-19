import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";
import { getPowerBiConfig, USER_SCOPE } from "@/lib/powerbi";

export const dynamic = "force-dynamic";

// Starts the one-time "Sign in with Microsoft" for Power BI queries.
export async function GET(req: NextRequest) {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const cfg = await getPowerBiConfig();
  if (!cfg) return NextResponse.redirect(new URL("/admin/connectors?powerbi=not-configured#powerbi", req.nextUrl.origin));

  const state = randomBytes(24).toString("hex");
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: `${req.nextUrl.origin}/api/admin/powerbi/oauth/callback`,
    response_mode: "query",
    scope: USER_SCOPE,
    state,
    prompt: "select_account",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set("pbi_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/admin/powerbi/oauth", maxAge: 600 });
  return res;
}
