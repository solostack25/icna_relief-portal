import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requirePowerBiAdmin } from "@/lib/powerbiAdminAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requirePowerBiAdmin())) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  const { data } = await createAdminClient()
    .from("integration_settings")
    .select("key, value, updated_at")
    .in("key", ["powerbi_user_refresh_token", "powerbi_user_name"]);
  const rows = (data ?? []) as { key: string; value: string | null; updated_at: string }[];
  const token = rows.find((r) => r.key === "powerbi_user_refresh_token");
  const name = rows.find((r) => r.key === "powerbi_user_name");
  return NextResponse.json({ signedIn: !!token?.value, name: name?.value ?? null, since: name?.updated_at ?? null });
}
