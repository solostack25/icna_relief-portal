import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { AMZB_CONSENT_URL, getAmzbSettings } from "@/lib/amazonBusiness/client";

export const dynamic = "force-dynamic";

// "Connect Amazon Business" - sends an admin to Amazon to approve access.
// The ICNA Relief Amazon Business account admin has to be the one who
// clicks Allow (they must be an admin for every legal entity).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const s = await getAmzbSettings();
  const back = (q: string) => NextResponse.redirect(new URL(`/admin/connectors?${q}#amazon-business`, req.nextUrl.origin));
  if (!s.clientId || !s.clientSecret || !s.applicationId) {
    return back("amzb_error=Save the Application ID, Client ID and Client secret first.");
  }
  const state = randomBytes(16).toString("hex");
  const url = new URL(AMZB_CONSENT_URL);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", `${req.nextUrl.origin}/api/admin/amazon-business/callback`);
  url.searchParams.set("applicationId", s.applicationId);
  const res = NextResponse.redirect(url);
  res.cookies.set("amzb_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/admin/amazon-business", maxAge: 600 });
  return res;
}

// Disconnect: forget the refresh token (admins only).
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: me } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).maybeSingle();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  await createAdminClient().from("integration_settings").delete().in("key", ["amazon_business_refresh_token", "amazon_business_connected_at"]);
  return NextResponse.json({ ok: true });
}
