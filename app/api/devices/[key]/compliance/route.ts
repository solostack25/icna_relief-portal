import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { loadDevice } from "@/lib/devices/actions";
import { fetchComplianceReasons } from "@/lib/devices/compliance";
import { gGet } from "@/lib/devices/graph";
import { createAdminClient } from "@/lib/supabase/server";

// POST: re-read this device's compliance state and failing settings live
// from Intune (the nightly sync does the same for every non-compliant device).
export async function POST(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const device = await loadDevice(decodeURIComponent(key));
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  if (!device.intune_id) return NextResponse.json({ error: "This device isn't in Intune, so it has no compliance status." }, { status: 400 });

  let state: string | null = null;
  try {
    const m = await gGet(`/v1.0/deviceManagement/managedDevices/${device.intune_id}?$select=complianceState,lastSyncDateTime,isEncrypted`);
    state = m?.complianceState ?? null;
    await createAdminClient()
      .from("it_devices")
      .update({ compliance_state: state, intune_last_sync: m?.lastSyncDateTime ?? null, is_encrypted: m?.isEncrypted ?? null })
      .eq("device_key", device.device_key);
  } catch {}

  const rep = await fetchComplianceReasons(device.intune_id);
  if (rep.error) return NextResponse.json({ error: rep.error }, { status: 502 });
  const reasons = state === "compliant" ? [] : rep.reasons;
  await createAdminClient()
    .from("it_devices")
    .update({ compliance_reasons: reasons.length ? reasons : null, compliance_checked_at: rep.checkedAt })
    .eq("device_key", device.device_key);
  return NextResponse.json({ state, reasons, checkedAt: rep.checkedAt });
}
