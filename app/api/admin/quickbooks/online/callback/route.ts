import { NextRequest, NextResponse } from "next/server";
import { financeGate, isResponse } from "@/lib/finance/access";
import { setIntegrationSetting } from "@/lib/integrationSettings";
import { forgetQboToken, getQboConfig, qboCompanyName, redeemQboCode } from "@/lib/finance/qbOnline";

export const dynamic = "force-dynamic";

// Intuit sends finance back here with ?code&realmId&state.
export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/admin/connectors?${q}#quickbooks`, req.nextUrl.origin));
    res.cookies.delete({ name: "qbo_oauth_state", path: "/api/admin/quickbooks/online" });
    return res;
  };
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back(`qbo_error=${encodeURIComponent(sp.get("error_description") ?? sp.get("error")!)}`);
  const expected = req.cookies.get("qbo_oauth_state")?.value;
  if (!expected || sp.get("state") !== expected) return back("qbo_error=The sign-in expired or came from somewhere else. Try again.");
  const realmId = sp.get("realmId");
  if (!realmId) return back("qbo_error=QuickBooks didn't say which company was picked. Try again.");
  const cfg = await getQboConfig();
  if (!cfg) return back("qbo=not-configured");
  try {
    const t = await redeemQboCode(cfg, sp.get("code") ?? "", `${req.nextUrl.origin}/api/admin/quickbooks/online/callback`);
    await setIntegrationSetting("qbo_refresh_token", t.refresh_token, gate.employeeId);
    await setIntegrationSetting("qbo_realm_id", realmId, gate.employeeId);
    await setIntegrationSetting("qbo_connected_at", new Date().toISOString(), gate.employeeId);
    forgetQboToken();
    const name = await qboCompanyName(realmId);
    await setIntegrationSetting("qbo_company_name", name ?? `Company ${realmId}`, gate.employeeId);
    return back("qbo=connected");
  } catch (e) {
    return back(`qbo_error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
}
