import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIntegrationSetting } from "@/lib/integrationSettings";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteUrl = await getIntegrationSetting("wp_site_url");
  return NextResponse.json({ siteUrl });
}
