import { NextResponse } from "next/server";
import { audit, getDeviceViewer } from "@/lib/devices/access";
import { loadDevice, runDeviceAction } from "@/lib/devices/actions";
import { createAdminClient } from "@/lib/supabase/server";

// POST { decision: "approve" | "deny" | "cancel", note? }
// Approve runs the wipe/retire. The approver must be a different IT
// person from the requester (no exceptions, admins included); the
// requester can only cancel their own request.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const decision = body.decision as "approve" | "deny" | "cancel";
  if (!["approve", "deny", "cancel"].includes(decision)) return NextResponse.json({ error: "Unknown decision" }, { status: 400 });
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const admin = createAdminClient();
  const { data: request } = await admin.from("it_device_action_requests").select("*").eq("id", id).maybeSingle();
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (request.status !== "pending") return NextResponse.json({ error: "This request was already decided." }, { status: 409 });

  const isRequester = request.requested_by === viewer.employeeId;
  if (decision === "cancel" && !isRequester) return NextResponse.json({ error: "Only the person who asked can cancel." }, { status: 403 });
  if (decision !== "cancel" && isRequester) {
    return NextResponse.json({ error: "Someone else in IT has to approve or deny your own request." }, { status: 403 });
  }

  const now = new Date().toISOString();
  // Claim it first so two approvers clicking at once can't both run it.
  const { data: claimed } = await admin
    .from("it_device_action_requests")
    .update({
      status: decision === "approve" ? "approved" : decision === "deny" ? "denied" : "cancelled",
      decided_by: viewer.employeeId,
      decided_at: now,
      decision_note: note,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: "This request was already decided." }, { status: 409 });

  const device = await loadDevice(request.device_key);
  await audit({
    deviceKey: request.device_key,
    deviceName: device?.display_name ?? null,
    action: `${decision}_${request.action}`,
    actorId: viewer.employeeId,
    reason: note,
    ticketRef: request.ticket_ref,
  });
  if (decision !== "approve") return NextResponse.json({ ok: true });

  if (!device) {
    await admin.from("it_device_action_requests").update({ status: "failed", error: "Device no longer exists" }).eq("id", id);
    return NextResponse.json({ error: "Device no longer exists" }, { status: 404 });
  }
  const result = await runDeviceAction(device, request.action);
  await admin
    .from("it_device_action_requests")
    .update(result.ok ? { status: "executed", executed_at: new Date().toISOString() } : { status: "failed", error: result.error })
    .eq("id", id);
  await audit({
    deviceKey: device.device_key,
    deviceName: device.display_name,
    action: request.action,
    actorId: viewer.employeeId,
    reason: request.reason,
    ticketRef: request.ticket_ref,
    ok: result.ok,
    detail: { request_id: id, requested_by: request.requested_by, ...(result.error ? { error: result.error } : {}) },
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, executed: true });
}
