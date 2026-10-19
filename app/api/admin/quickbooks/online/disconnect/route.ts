import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { financeGate, isResponse } from "@/lib/finance/access";
import { forgetQboToken } from "@/lib/finance/qbOnline";

export const dynamic = "force-dynamic";

export async function POST() {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  await createAdminClient().from("integration_settings").delete().in("key", ["qbo_refresh_token", "qbo_realm_id", "qbo_company_name", "qbo_connected_at"]);
  forgetQboToken();
  return NextResponse.json({ ok: true });
}
