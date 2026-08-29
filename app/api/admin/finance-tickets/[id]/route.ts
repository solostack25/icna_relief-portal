import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

const VALID_STATUSES = ["open", "pending", "in_progress", "on_hold", "fixing", "processed", "denied", "duplicate"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { id } = await params;
  const body = await req.json();

  const admin = createAdminClient();
  const updates: Record<string, unknown> = {};

  if (body.assign_to_me) {
    updates.technician_id = access.employeeId;
    updates.technician_started_at = new Date().toISOString();
    if (!body.status) updates.status = "in_progress";
  }
  if (body.status) {
    if (!VALID_STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    updates.status = body.status;
    if (body.status === "processed") updates.technician_ended_at = new Date().toISOString();
  }
  if (body.technician_notes !== undefined) updates.technician_notes = body.technician_notes;

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data: ticket, error } = await admin.from("finance_tickets").update(updates).eq("id", id).select("id, status").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.status || body.assign_to_me) {
    await admin.from("finance_ticket_log").insert({
      finance_ticket_id: id,
      comment: body.assign_to_me ? "Picked up by finance for processing." : `Status changed to ${body.status}.`,
      comment_type: "status_change",
      notify_user: true,
      created_by: access.employeeId,
    });
  }

  return NextResponse.json({ ticket });
}
