import { NextResponse } from "next/server";
import { getDeviceViewer } from "@/lib/devices/access";
import { createAdminClient } from "@/lib/supabase/server";

const STATUSES = ["not_started", "scheduled", "in_progress", "blocked", "done", "skip"];
const METHODS = ["manual", "ppkg", "profile_wizard", "autopilot"];

// POST { upns: string[], status?, method?, scheduled_for?, note? }
// Sets IT's working status for one or more people on the join tracker.
export async function POST(req: Request) {
  const viewer = await getDeviceViewer();
  if (!viewer) return NextResponse.json({ error: "IT access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const upns: string[] = (Array.isArray(body.upns) ? body.upns : [])
    .filter((u: unknown) => typeof u === "string" && u.includes("@"))
    .map((u: string) => u.trim().toLowerCase())
    .slice(0, 500);
  if (!upns.length) return NextResponse.json({ error: "Pick at least one person." }, { status: 400 });

  const patch: Record<string, unknown> = { updated_by: viewer.employeeId, updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Unknown status" }, { status: 400 });
    patch.status = body.status;
  }
  if (body.method !== undefined) {
    if (body.method !== null && !METHODS.includes(body.method)) return NextResponse.json({ error: "Unknown method" }, { status: 400 });
    patch.method = body.method;
  }
  if (body.scheduled_for !== undefined) {
    if (body.scheduled_for !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.scheduled_for)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    patch.scheduled_for = body.scheduled_for;
  }
  if (body.note !== undefined) patch.note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  const admin = createAdminClient();
  const { error } = await admin.from("it_join_tracking").upsert(upns.map((upn) => ({ upn, ...patch })), { onConflict: "upn" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: upns.length });
}
