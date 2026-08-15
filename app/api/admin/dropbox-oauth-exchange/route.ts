import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setIntegrationSetting } from "@/lib/integrationSettings";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: employee } = await supabase.from("employees").select("id, role").eq("auth_user_id", user.id).single();
  if (!employee || employee.role !== "admin") return null;
  return employee;
}

// Does the OAuth "authorization code -> refresh token" exchange server-
// side (Vercel has real outbound internet access, unlike the sandboxed
// tool that was originally going to do this) and saves all three
// Dropbox credentials in one step - no manual copy/paste of a refresh
// token required. Reusable any time the connection needs re-authorizing,
// not a one-off script.
export async function POST(req: Request) {
  const employee = await requireAdmin();
  if (!employee) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { appKey, appSecret, code } = await req.json();
  if (!appKey || !appSecret || !code) {
    return NextResponse.json({ error: "App Key, App Secret, and Authorization Code are all required" }, { status: 400 });
  }

  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: appKey,
      client_secret: appSecret,
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: body.error_description || body.error || "Dropbox rejected the exchange." }, { status: 400 });
  }

  const refreshToken = body.refresh_token;
  if (!refreshToken) {
    return NextResponse.json(
      { error: "Dropbox didn't return a refresh token - make sure the authorize URL included token_access_type=offline." },
      { status: 400 }
    );
  }

  await setIntegrationSetting("dropbox_app_key", appKey.trim(), employee.id);
  await setIntegrationSetting("dropbox_app_secret", appSecret.trim(), employee.id);
  await setIntegrationSetting("dropbox_refresh_token", refreshToken, employee.id);

  return NextResponse.json({ ok: true });
}
