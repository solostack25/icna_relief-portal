import { NextRequest, NextResponse } from "next/server";
import { requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";
import { setIntegrationSetting } from "@/lib/integrationSettings";
import { forgetUserToken, getPowerBiConfig, redeemSignInCode } from "@/lib/powerbi";

export const dynamic = "force-dynamic";

// Microsoft sends the admin back here after signing in.
export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/admin/connectors?${q}#powerbi`, req.nextUrl.origin));
    res.cookies.delete({ name: "pbi_oauth_state", path: "/api/admin/powerbi/oauth" });
    return res;
  };
  const me = await requirePowerBiAdmin();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back(`powerbi_error=${encodeURIComponent(sp.get("error_description")?.split("\r\n")[0] ?? sp.get("error")!)}`);
  const expected = req.cookies.get("pbi_oauth_state")?.value;
  if (!expected || sp.get("state") !== expected) return back("powerbi_error=The sign-in expired or came from somewhere else. Try again.");

  const cfg = await getPowerBiConfig();
  if (!cfg) return back("powerbi=not-configured");
  try {
    const { refreshToken, name } = await redeemSignInCode(cfg, sp.get("code") ?? "", `${req.nextUrl.origin}/api/admin/powerbi/oauth/callback`);
    await setIntegrationSetting("powerbi_user_refresh_token", refreshToken, me.id);
    await setIntegrationSetting("powerbi_user_name", name ?? "Microsoft account", me.id);
    forgetUserToken();
    return back("powerbi=signed-in");
  } catch (e) {
    return back(`powerbi_error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
}
