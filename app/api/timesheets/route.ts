import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { canApproveTimesheet, getMe } from "@/lib/timeOff";
import { loadWeeks } from "@/lib/timesheets";
import { mondayOf } from "@/lib/timeOffShared";

// Approve (or undo) weekly timesheets. Totals are recomputed here from the
// punches, never taken from the browser. A week with a missed punch can't
// be approved until the punch is fixed.
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action as "approve" | "undo";
  const weekStart = String(body?.week_start ?? "");
  const ids: string[] = Array.isArray(body?.employee_ids) ? body.employee_ids.map(String).slice(0, 500) : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || mondayOf(weekStart) !== weekStart) {
    return NextResponse.json({ error: "week_start must be a Monday (YYYY-MM-DD)." }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ error: "No one selected." }, { status: 400 });

  const allowed: string[] = [];
  for (const id of ids) if (await canApproveTimesheet(me, id)) allowed.push(id);
  if (allowed.length === 0) return NextResponse.json({ error: "You don't approve time for these people." }, { status: 403 });

  const admin = createAdminClient();

  if (action === "undo") {
    const { error } = await admin
      .from("hr_timesheet_approvals")
      .delete()
      .eq("week_start", weekStart)
      .in("employee_id", allowed)
      .neq("adp_sync_status", "sent");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, undone: allowed });
  }

  if (action !== "approve") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const { rows } = await loadWeeks(allowed, weekStart);
  const skipped: string[] = [];
  const records = [];
  for (const id of allowed) {
    const w = rows.get(id);
    if (!w || w.missedPunch) {
      skipped.push(id);
      continue;
    }
    records.push({
      employee_id: id,
      week_start: weekStart,
      total_hours: w.totalHours,
      approved_by: me.id,
      approved_at: new Date().toISOString(),
      adp_sync_status: "queued",
    });
  }
  if (records.length) {
    const { error } = await admin.from("hr_timesheet_approvals").upsert(records, { onConflict: "employee_id,week_start" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, approved: records.map((r) => r.employee_id), skipped });
}
