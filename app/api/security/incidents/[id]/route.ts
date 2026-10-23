import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { gPatch, gPost, explainGraphError } from "@/lib/devices/graph";
import { logSecurityAction } from "@/lib/security/log";
import { createAdminClient } from "@/lib/supabase/server";

const CLASSIFICATIONS = ["truePositive", "falsePositive", "informationalExpectedActivity"];

// POST { action: "assign" | "in_progress" | "resolve" | "reopen", classification?, comment? }
// Updates the incident in Defender XDR (needs SecurityIncident.ReadWrite.All).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Bad incident id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1000) : "";

  let patch: Record<string, unknown>;
  if (action === "assign") patch = { assignedTo: viewer.email };
  else if (action === "in_progress") patch = { status: "inProgress", assignedTo: viewer.email };
  else if (action === "reopen") patch = { status: "active" };
  else if (action === "resolve") {
    if (!CLASSIFICATIONS.includes(body.classification)) return NextResponse.json({ error: "Pick what it turned out to be." }, { status: 400 });
    if (comment.length < 5) return NextResponse.json({ error: "Add a short note on what you found or did." }, { status: 400 });
    patch = { status: "resolved", classification: body.classification };
  } else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  let error: string | null = null;
  try {
    await gPatch(`/v1.0/security/incidents/${id}`, patch);
    if (comment) {
      // Comments are a separate call; a failure here shouldn't undo the update.
      await gPost(`/v1.0/security/incidents/${id}/comments`, { "@odata.type": "microsoft.graph.security.alertComment", comment: `ICNA portal (${viewer.name}): ${comment}` }).catch(() => {});
    }
    const local: Record<string, unknown> = {};
    if (patch.status) local.status = patch.status;
    if (patch.assignedTo) local.assigned_to = patch.assignedTo;
    if (patch.classification) local.classification = patch.classification;
    await createAdminClient().from("sec_incidents").update({ ...local, last_update_at: new Date().toISOString() }).eq("id", id);
  } catch (e) {
    error = explainGraphError(e, "SecurityIncident.ReadWrite.All");
  }

  const { data: inc } = await createAdminClient().from("sec_incidents").select("display_name").eq("id", id).maybeSingle();
  await logSecurityAction({
    targetType: "incident",
    targetId: id,
    targetName: inc?.display_name ?? null,
    action: `incident_${action}`,
    actorId: viewer.employeeId,
    reason: comment || null,
    ok: !error,
    detail: { ...patch, ...(error ? { error } : {}) },
  });
  if (error) return NextResponse.json({ error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
