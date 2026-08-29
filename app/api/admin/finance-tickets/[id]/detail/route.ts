import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";
import { getFinanceTicketDetail } from "@/lib/financeTicketDetail";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const { id } = await params;
  const admin = createAdminClient();

  const { data: ticket } = await admin
    .from("finance_tickets")
    .select(
      "id, ticket_number, title, category, total, status, priority, grant_eligible, technician_notes, credit_card_statement_id, mileage_batch_id, honorarium_id, utility_id, vendor_id, pex_new_request_id, pex_recharge_request_id, employees:requestor_id(first_name, last_name, email)"
    )
    .eq("id", id)
    .single();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const detail = await getFinanceTicketDetail(admin, ticket);

  const { data: approvals } = await admin
    .from("finance_approvals")
    .select("approval_level, chain_person_name, approval_status, decision_date, comments")
    .eq("finance_ticket_id", id)
    .order("approval_level", { ascending: true });

  const { data: log } = await admin
    .from("finance_ticket_log")
    .select("comment, comment_type, created_at")
    .eq("finance_ticket_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ ticket, detail, approvals, log });
}
