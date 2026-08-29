import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinanceTicketDetail } from "@/lib/financeTicketDetail";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // RLS (finance_tickets own or admin) already scopes this to what
  // the caller is allowed to see.
  const { data: ticket, error } = await supabase
    .from("finance_tickets")
    .select(
      "id, ticket_number, title, category, total, status, priority, grant_eligible, submitted_at, credit_card_statement_id, mileage_batch_id, honorarium_id, utility_id, vendor_id, pex_new_request_id, pex_recharge_request_id"
    )
    .eq("id", id)
    .single();
  if (error || !ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const detail = await getFinanceTicketDetail(supabase, ticket);

  const { data: approvals } = await supabase
    .from("finance_approvals")
    .select("approval_level, chain_person_name, approval_status, decision_date, comments")
    .eq("finance_ticket_id", id)
    .order("approval_level", { ascending: true });

  return NextResponse.json({ ticket, detail, approvals });
}
