import { NextResponse } from "next/server";
import { audit, getDeviceViewer } from "@/lib/devices/access";
import { gPost, explainGraphError } from "@/lib/devices/graph";
import { mdePost, explainMdeError } from "@/lib/security/mde";
import { createAdminClient } from "@/lib/supabase/server";

type Act = "scan_quick" | "scan_full" | "update_signatures" | "isolate_full" | "isolate_selective" | "release" | "restrict_execution" | "unrestrict_execution";
const VALID: Act[] = ["scan_quick", "scan_full", "update_signatures", "isolate_full", "isolate_selective", "release", "restrict_execution", "unrestrict_execution"];

// POST { action, reason }
// Isolation and Defender scans go through the Defender for Endpoint API
// (needs the PC onboarded). Scans fall back to Intune's Defender scan
// when the PC is in Intune but not onboarded; definition updates are
// Intune-only. All reversible, so they run right away; all logged.
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as Act;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!VALID.includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (reason.length < 5) return NextResponse.json({ error: "Add a short reason." }, { status: 400 });

  const admin = createAdminClient();
  const { data: d } = await admin
    .from("it_devices")
    .select("device_key, display_name, intune_id, mde_device_id, mde_onboarding")
    .eq("device_key", decodeURIComponent(key))
    .maybeSingle();
  if (!d) return NextResponse.json({ error: "Device not found" }, { status: 404 });
  const onboarded = !!d.mde_device_id && String(d.mde_onboarding ?? "").toLowerCase() === "onboarded";
  const comment = `ICNA portal (${viewer.name}): ${reason}`.slice(0, 1000);

  let error: string | null = null;
  let via = "defender";
  try {
    if (action === "isolate_full" || action === "isolate_selective") {
      if (!onboarded) throw new Error("Only PCs onboarded to Defender for Endpoint can be isolated.");
      await mdePost(`/machines/${d.mde_device_id}/isolate`, { Comment: comment, IsolationType: action === "isolate_full" ? "Full" : "Selective" });
    } else if (action === "release") {
      if (!onboarded) throw new Error("This PC isn't onboarded to Defender for Endpoint.");
      await mdePost(`/machines/${d.mde_device_id}/unisolate`, { Comment: comment });
    } else if (action === "restrict_execution" || action === "unrestrict_execution") {
      if (!onboarded) throw new Error("Only PCs onboarded to Defender for Endpoint can be restricted.");
      await mdePost(`/machines/${d.mde_device_id}/${action === "restrict_execution" ? "restrictCodeExecution" : "unrestrictCodeExecution"}`, { Comment: comment });
    } else if (action === "scan_quick" || action === "scan_full") {
      if (onboarded) {
        await mdePost(`/machines/${d.mde_device_id}/runAntiVirusScan`, { Comment: comment, ScanType: action === "scan_full" ? "Full" : "Quick" });
      } else if (d.intune_id) {
        via = "intune";
        await gPost(`/v1.0/deviceManagement/managedDevices/${d.intune_id}/windowsDefenderScan`, { quickScan: action === "scan_quick" });
      } else throw new Error("This PC is in neither Defender for Endpoint nor Intune, so a scan can't be sent.");
    } else if (action === "update_signatures") {
      if (!d.intune_id) throw new Error("Definition updates are sent through Intune; this PC isn't enrolled.");
      via = "intune";
      await gPost(`/v1.0/deviceManagement/managedDevices/${d.intune_id}/windowsDefenderUpdateSignatures`, {});
    }
  } catch (e) {
    error =
      e instanceof Error && !("status" in e)
        ? e.message
        : via === "intune"
          ? explainGraphError(e, "DeviceManagementManagedDevices.PrivilegedOperations.All")
          : explainMdeError(e, action.startsWith("scan") ? "Machine.Scan" : action.includes("restrict") ? "Machine.RestrictExecution" : "Machine.Isolate");
  }

  if (!error && (action === "isolate_full" || action === "isolate_selective" || action === "release")) {
    await admin
      .from("it_devices")
      .update({ mde_isolation_state: action === "release" ? "released" : "isolated", mde_isolation_changed_at: new Date().toISOString() })
      .eq("device_key", d.device_key);
  }
  await audit({
    deviceKey: d.device_key,
    deviceName: d.display_name,
    action,
    actorId: viewer.employeeId,
    reason,
    ok: !error,
    detail: { via, ...(error ? { error } : {}) },
  });
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json({ ok: true, via });
}
