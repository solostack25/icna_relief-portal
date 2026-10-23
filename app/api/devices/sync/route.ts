import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { runDeviceSync } from "@/lib/devices/sync";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// "Sync now" on the Devices page.
export async function POST() {
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  // Don't stack syncs: skip if one started in the last 5 minutes and hasn't finished.
  const admin = createAdminClient();
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: running } = await admin.from("it_device_sync_runs").select("id").eq("status", "running").gte("started_at", since).limit(1);
  if (running?.length) return NextResponse.json({ error: "A sync is already running. Give it a minute." }, { status: 409 });

  const result = await runDeviceSync({ trigger: "manual", triggeredBy: viewer.employeeId });
  return NextResponse.json(result);
}
