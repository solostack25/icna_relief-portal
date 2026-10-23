import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { runSecuritySync } from "@/lib/security/sync";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// "Sync now" on the Security pages. IT only.
export async function POST() {
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });
  const admin = createAdminClient();
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: running } = await admin.from("sec_sync_runs").select("id").eq("status", "running").gte("started_at", since).limit(1);
  if (running?.length) return NextResponse.json({ error: "A security sync is already running." }, { status: 409 });
  return NextResponse.json(await runSecuritySync({ trigger: "manual", triggeredBy: viewer.employeeId }));
}
