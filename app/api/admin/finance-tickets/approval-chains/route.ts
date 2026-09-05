import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getFinanceAdminAccess } from "@/lib/financeAdminAccess";

// Mirrors the old /api/admin/finance/requests shape (which queried
// finance_approval_requests/finance_approval_steps, both retired) so
// the "who are we waiting on" view Travis relied on has a real
// equivalent against the new finance_tickets/finance_approvals
// tables, instead of just disappearing along with the old system.
export async function GET() {
  const access = await getFinanceAdminAccess();
  if (!access.ok) return NextResponse.json({ error: "Not authorized" }, { status: access.status });

  const admin = createAdminClient();

  const { data: tickets, error } = await admin
    .from("finance_tickets")
    .select(
      "id, ticket_number, title, category, total, status, created_at, employees:requestor_id(first_name, last_name, email)"
    )
    .in("status", ["pending", "on_hold", "fixing", "open", "denied"])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ticketIds = (tickets ?? []).map((t: { id: string }) => t.id);
  const { data: steps } = ticketIds.length
    ? await admin
        .from("finance_approvals")
        .select("finance_ticket_id, approval_level, chain_person_name, chain_person_job_title, acting_as_delegate_for_email, approval_status, decision_date, comments")
        .in("finance_ticket_id", ticketIds)
        .order("approval_level", { ascending: true })
    : { data: [] };

  const stepsByTicket = new Map<string, typeof steps>();
  for (const s of steps ?? []) {
    if (!stepsByTicket.has(s.finance_ticket_id)) stepsByTicket.set(s.finance_ticket_id, []);
    stepsByTicket.get(s.finance_ticket_id)!.push(s);
  }

  const result = (tickets ?? []).map((t: Record<string, unknown>) => ({
    id: t.id,
    ticket_number: t.ticket_number,
    title: t.title,
    category: t.category,
    total: t.total,
    status: t.status,
    created_at: t.created_at,
    requestor: t.employees,
    steps: stepsByTicket.get(t.id as string) ?? [],
  }));

  return NextResponse.json({ tickets: result });
}
