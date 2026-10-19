import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { financeGate, isResponse } from "@/lib/finance/access";
import { getIntegrationSetting } from "@/lib/integrationSettings";
import { getQboConfig } from "@/lib/finance/qbOnline";

export const dynamic = "force-dynamic";

// Both QuickBooks connections at a glance, plus the pull queue.
export async function GET() {
  const gate = await financeGate();
  if (isResponse(gate)) return gate;
  const [cfg, realm, company, since, wcUser, wcPass, queue] = await Promise.all([
    getQboConfig(),
    getIntegrationSetting("qbo_realm_id"),
    getIntegrationSetting("qbo_company_name"),
    getIntegrationSetting("qbo_connected_at"),
    getIntegrationSetting("qbwc_username"),
    getIntegrationSetting("qbwc_password"),
    createAdminClient().from("fin_qb_sync_queue").select("id, year, month, source, status, error, requested_at, finished_at").order("requested_at", { ascending: false }).limit(15),
  ]);
  const { data: lastRun } = await createAdminClient().from("integration_settings").select("value").eq("key", "qbwc_last_run").maybeSingle();
  return NextResponse.json({
    online: { configured: !!cfg, sandbox: cfg?.sandbox ?? false, connected: !!realm, company, since },
    desktop: { configured: !!wcUser && !!wcPass, username: wcUser, lastRun: (lastRun?.value as string) ?? null },
    queue: queue.data ?? [],
  });
}
