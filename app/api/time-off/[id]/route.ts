import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { canDecide, getMe, notifyEmployee } from "@/lib/timeOff";

// approve / deny  - the employee's approver (or an admin)
// reopen          - undo a decision, as long as it hasn't reached ADP yet
// cancel          - the employee withdraws their own pending request
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action as "approve" | "deny" | "reopen" | "cancel";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 500) || null : null;

  const admin = createAdminClient();
  const { data: r } = await admin
    .from("hr_time_off_requests")
    .select("id, employee_id, leave_type, start_date, end_date, hours, note, status, approver_email, adp_sync_status")
    .eq("id", params.id)
    .single();
  if (!r) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const now = new Date().toISOString();

  if (action === "cancel") {
    if (r.employee_id !== me.id) return NextResponse.json({ error: "Only the person who asked can cancel." }, { status: 403 });
    if (r.status !== "pending") return NextResponse.json({ error: "Only pending requests can be cancelled. Ask your supervisor to change an approved one." }, { status: 409 });
    const { error } = await admin.from("hr_time_off_requests").update({ status: "cancelled", updated_at: now }).eq("id", r.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  if (!canDecide(me, r)) return NextResponse.json({ error: "This request isn't yours to approve." }, { status: 403 });

  if (action === "approve" || action === "deny") {
    if (r.status !== "pending") return NextResponse.json({ error: `This request is already ${r.status}.` }, { status: 409 });
    const approved = action === "approve";
    const { error } = await admin
      .from("hr_time_off_requests")
      .update({
        status: approved ? "approved" : "denied",
        decided_by: me.id,
        decided_at: now,
        decision_note: note,
        adp_sync_status: approved ? "queued" : "not_sent",
        updated_at: now,
      })
      .eq("id", r.id)
      .eq("status", "pending");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: emp } = await admin.from("employees").select("id, email, first_name").eq("id", r.employee_id).single();
    if (emp) await notifyEmployee(emp, approved ? "approved" : "denied", me, r, note);
    return NextResponse.json({ ok: true, status: approved ? "approved" : "denied", adp_sync_status: approved ? "queued" : "not_sent" });
  }

  if (action === "reopen") {
    if (r.status !== "approved" && r.status !== "denied") return NextResponse.json({ error: "Nothing to undo." }, { status: 409 });
    if (r.adp_sync_status === "sent") return NextResponse.json({ error: "This is already in ADP. Change it there." }, { status: 409 });
    const { error } = await admin
      .from("hr_time_off_requests")
      .update({ status: "pending", decided_by: null, decided_at: null, decision_note: null, adp_sync_status: "not_sent", updated_at: now })
      .eq("id", r.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "pending" });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
