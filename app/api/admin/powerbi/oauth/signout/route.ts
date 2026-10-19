import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";
import { forgetUserToken } from "@/lib/powerbi";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  await createAdminClient().from("integration_settings").delete().in("key", ["powerbi_user_refresh_token", "powerbi_user_name"]);
  forgetUserToken();
  return NextResponse.json({ ok: true });
}
