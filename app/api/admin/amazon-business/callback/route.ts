import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeConsentCode, getAmzbConfig, testConnection } from "@/lib/amazonBusiness/client";
import { setIntegrationSetting } from "@/lib/integrationSettings";

export const dynamic = "force-dynamic";

// Amazon sends the admin back here with ?code&state after they click Allow.
export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/admin/connectors?${q}#amazon-business`, req.nextUrl.origin));
    res.cookies.delete({ name: "amzb_oauth_state", path: "/api/admin/amazon-business" });
    return res;
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  const { data: me } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).maybeSingle();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back(`amzb_error=${encodeURIComponent(sp.get("error_description") ?? sp.get("error")!)}`);
  const expected = req.cookies.get("amzb_oauth_state")?.value;
  if (!expected || sp.get("state") !== expected) return back("amzb_error=The sign-in expired or came from somewhere else. Try again.");
  const code = sp.get("code") ?? sp.get("spapi_oauth_code");
  if (!code) return back("amzb_error=Amazon didn't send an authorization code. Try again.");
  try {
    await exchangeConsentCode(code, `${req.nextUrl.origin}/api/admin/amazon-business/callback`, me.id);
    await setIntegrationSetting("amazon_business_connected_at", new Date().toISOString(), me.id);
    const cfg = await getAmzbConfig();
    if (cfg) await testConnection(cfg);
    return back("amzb=connected");
  } catch (e) {
    return back(`amzb_error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`);
  }
}
