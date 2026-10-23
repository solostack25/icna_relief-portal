import { NextResponse } from "next/server";
import { audit, getDeviceViewer } from "@/lib/devices/access";
import { loadDevice, runDeviceAction } from "@/lib/devices/actions";
import { APPROVAL_ACTIONS, type DeviceAction } from "@/lib/devices/shared";
import { createAdminClient } from "@/lib/supabase/server";

const VALID: DeviceAction[] = ["sync", "restart", "lock", "disable", "enable", "retire", "wipe"];

// POST { action, reason, ticket_ref? }
// sync / restart / lock / disable / enable run right away.
// retire / wipe create a request that a different IT person must approve.
export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = body.action as DeviceAction;
  if (!VALID.includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const ticketRef = typeof body.ticket_ref === "string" && body.ticket_ref.trim() ? body.ticket_ref.trim().slice(0, 60) : null;
  const needsReason = action !== "sync";
  if (needsReason && reason.length < 5) return NextResponse.json({ error: "Add a short reason." }, { status: 400 });

  const device = await loadDevice(decodeURIComponent(key));
  if (!device) return NextResponse.json({ error: "Device not found" }, { status: 404 });

  if (APPROVAL_ACTIONS.includes(action)) {
    if (!device.intune_id) return NextResponse.json({ error: "Only Intune-enrolled devices can be retired or wiped remotely." }, { status: 400 });
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("it_device_action_requests")
      .insert({ device_key: device.device_key, action, reason, ticket_ref: ticketRef, requested_by: viewer.employeeId })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: `A ${action} request for this device is already waiting for approval.` }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await audit({ deviceKey: device.device_key, deviceName: device.display_name, action: `request_${action}`, actorId: viewer.employeeId, reason, ticketRef });
    return NextResponse.json({ requested: true, id: data.id });
  }

  const result = await runDeviceAction(device, action);
  await audit({
    deviceKey: device.device_key,
    deviceName: device.display_name,
    action,
    actorId: viewer.employeeId,
    reason: reason || null,
    ticketRef,
    ok: result.ok,
    detail: result.error ? { error: result.error } : null,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
