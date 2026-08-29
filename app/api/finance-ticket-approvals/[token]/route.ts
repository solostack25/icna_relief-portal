import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceTicketDetail } from "@/lib/financeTicketDetail";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: step } = await admin
    .from("finance_approvals")
    .select("id, finance_ticket_id, approval_level, approval_status, chain_person_name, approver_name, approver_email, acting_as_delegate_for_email, approval_amount_threshold, is_final_approval, revision_number")
    .eq("approval_token", token)
    .single();
  if (!step) return NextResponse.json({ error: "Invalid or expired approval link" }, { status: 404 });

  const { data: ticket } = await admin
    .from("finance_tickets")
    .select(
      "ticket_number, title, category, total, status, submitted_at, credit_card_statement_id, mileage_batch_id, honorarium_id, utility_id, vendor_id, pex_new_request_id, pex_recharge_request_id, employees:requestor_id(first_name, last_name)"
    )
    .eq("id", step.finance_ticket_id)
    .single();

  const detail = ticket ? await getFinanceTicketDetail(admin, ticket) : null;

  const { data: priorSteps } = await admin
    .from("finance_approvals")
    .select("approval_level, chain_person_name, approval_status, decision_date, comments")
    .eq("finance_ticket_id", step.finance_ticket_id)
    .neq("id", step.id)
    .order("approval_level", { ascending: true });

  return NextResponse.json({ step, ticket, detail, priorSteps });
}
