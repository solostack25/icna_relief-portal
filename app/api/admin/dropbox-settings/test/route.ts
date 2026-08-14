import { NextResponse } from "next/server";
import { Dropbox } from "dropbox";
import { createClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { data: employee } = await supabase.from("employees").select("role").eq("auth_user_id", user.id).single();
  if (employee?.role !== "admin") return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  try {
    const appKey = await getIntegrationSetting("dropbox_app_key", process.env.DROPBOX_APP_KEY);
    const appSecret = await getIntegrationSetting("dropbox_app_secret", process.env.DROPBOX_APP_SECRET);
    const refreshToken = await getIntegrationSetting("dropbox_refresh_token", process.env.DROPBOX_REFRESH_TOKEN);
    if (!appKey || !appSecret || !refreshToken) {
      return NextResponse.json({ ok: false, error: "Not fully configured yet - all three fields are required." });
    }

    const dbx = new Dropbox({ clientId: appKey, clientSecret: appSecret, refreshToken });
    // Lightweight call that just confirms the credentials actually
    // authenticate - doesn't touch any files.
    const account = await dbx.usersGetCurrentAccount();
    return NextResponse.json({
      ok: true,
      accountName: account.result.name?.display_name ?? null,
      accountEmail: account.result.email ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Connection failed." });
  }
}
